// ============================================================================
// RETELL DENTAL AGENT — MAIN SERVER
// ============================================================================
// Express server that handles:
//   1. WebSocket endpoint for Retell Custom LLM integration
//   2. POST endpoints for Retell Custom Function calls
//   3. POST endpoint for Retell webhook events (call_started, call_ended)
//   4. Health check and test endpoints
//
// Retell can work in two modes:
//   A) Custom LLM mode — full control via WebSocket (wss://host/llm-websocket/:call_id)
//   B) Retell LLM + Custom Functions — Retell's built-in LLM calls your POST endpoints
//
// This server supports BOTH modes so you can choose which suits your setup.
// ============================================================================

require("dotenv").config();

const express = require("express");
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");
const crypto = require("crypto");
const { systemPrompt } = require("./prompts/system-prompt");
const { checkAvailability, createBooking } = require("./services/calcom");
const { sendBookingConfirmation } = require("./services/email");
const { sendBookingConfirmationSMS } = require("./services/sms");
const {
  parseDateFromSpeech,
  isClinicClosed,
  formatDateForSpeech,
  formatTimeForSpeech,
  nowUK,
} = require("./services/date-utils");
const clinic = require("./config/clinic");
const agent = require("./config/agent-personality");

const app = express();
const server = http.createServer(app);

// Parse JSON bodies for POST endpoints
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  if (req.path !== "/health") {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

const PORT = process.env.PORT || 3000;

// ============================================================================
// HEALTH CHECK ENDPOINT
// Used by deployment platforms (Railway, Render, etc.) to verify the server
// is running and healthy.
// ============================================================================
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "retell-dental-agent",
    clinic: clinic.name,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// TEST ENDPOINT
// Returns a sample conversation response for format verification.
// Useful for checking your server is returning valid Retell response formats.
// ============================================================================
app.get("/api/test", (req, res) => {
  const greeting = agent.greeting.replace("{clinicName}", clinic.name);

  res.json({
    message: "Retell Dental Agent test endpoint",
    clinic: clinic.name,
    agent: agent.name,
    sampleGreeting: greeting,
    sampleWebSocketResponse: {
      response_type: "response",
      response_id: 0,
      content: greeting,
      content_complete: true,
      end_call: false,
    },
    sampleCustomFunctionResponse: {
      result: "Availability checked successfully",
      slots: [
        { time: "2025-03-15T09:00:00Z", display: "9:00 AM" },
        { time: "2025-03-15T10:00:00Z", display: "10:00 AM" },
      ],
    },
    systemPromptPreview: systemPrompt.substring(0, 500) + "...",
    availableServices: Object.keys(clinic.services),
    configuredHours: clinic.hours,
  });
});

// ============================================================================
// RETELL SIGNATURE VERIFICATION
// Verifies that incoming requests genuinely come from Retell AI.
// Uses the X-Retell-Signature header and your RETELL_API_KEY.
// ============================================================================
function verifyRetellSignature(body, signature) {
  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) {
    console.warn("[Auth] RETELL_API_KEY not set — skipping signature verification.");
    return true; // Allow in development
  }
  if (!signature) {
    console.warn("[Auth] No X-Retell-Signature header present.");
    return false;
  }

  try {
    // Retell signs the raw body string with the API key using HMAC SHA256
    const expectedSignature = crypto
      .createHmac("sha256", apiKey)
      .update(typeof body === "string" ? body : JSON.stringify(body))
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error("[Auth] Signature verification error:", error.message);
    return false;
  }
}

// ============================================================================
// CUSTOM FUNCTION ENDPOINTS (POST)
// ============================================================================
// These are called by Retell's built-in LLM when using Retell LLM + Custom
// Functions mode. Each endpoint handles a specific function the agent can call.
// ============================================================================

// ----------------------------------------------------------
// POST /api/retell/check-availability
// Called when the agent needs to check available appointment slots.
// Retell sends: { call: {...}, args: { date, serviceKey } }
// ----------------------------------------------------------
app.post("/api/retell/check-availability", async (req, res) => {
  console.log("[Custom Function] check-availability called");
  console.log("[Custom Function] Args:", JSON.stringify(req.body.args));

  try {
    const { date, serviceKey } = req.body.args || {};

    if (!date || !serviceKey) {
      return res.json({
        result: "I need both a date and a service type to check availability. Could you let me know which service you'd like and when?",
      });
    }

    // Try to parse the date (it might come as natural language from the agent)
    let isoDate = date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      isoDate = parseDateFromSpeech(date);
      if (!isoDate) {
        return res.json({
          result: `I wasn't able to understand the date "${date}". Could you tell me the date again, perhaps the day and month?`,
        });
      }
    }

    // Normalise the service key
    const normalisedKey = normaliseServiceKey(serviceKey);
    if (!normalisedKey) {
      return res.json({
        result: `I'm not sure which service "${serviceKey}" refers to. We offer Dentistry, Physiotherapy, Massage Therapy, and Acupuncture. Which would you like?`,
      });
    }

    const result = await checkAvailability(isoDate, normalisedKey);

    console.log("[Custom Function] Availability result:", result.message);

    return res.json({ result: result.message });
  } catch (error) {
    console.error("[Custom Function] check-availability error:", error.message);
    return res.json({
      result: "I'm having a bit of trouble checking our availability at the moment. Could I take your details and have someone call you back?",
    });
  }
});

// ----------------------------------------------------------
// POST /api/retell/create-booking
// Called when the agent has collected all details and confirmed a slot.
// Retell sends: { call: {...}, args: { firstName, lastName, email, phone, slotTime, serviceKey, isNewPatient } }
// ----------------------------------------------------------
app.post("/api/retell/create-booking", async (req, res) => {
  console.log("[Custom Function] create-booking called");
  console.log("[Custom Function] Args:", JSON.stringify(req.body.args));

  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      slotTime,
      serviceKey,
      isNewPatient,
    } = req.body.args || {};

    // Validate required fields
    if (!firstName || !lastName || !email || !slotTime || !serviceKey) {
      return res.json({
        result: "I'm missing some details. I need the patient's name, email, appointment time, and service type to complete the booking.",
      });
    }

    const normalisedKey = normaliseServiceKey(serviceKey);
    if (!normalisedKey) {
      return res.json({
        result: `I'm not sure which service "${serviceKey}" refers to. Could you confirm the service?`,
      });
    }

    const patientDetails = {
      firstName,
      lastName,
      email,
      phone: phone || "",
      isNewPatient: isNewPatient !== false,
    };

    // Create the booking via Cal.com
    const bookingResult = await createBooking(patientDetails, slotTime, normalisedKey);

    if (bookingResult.success) {
      const serviceName = clinic.services[normalisedKey]?.name || normalisedKey;

      // Send email and SMS confirmations in the background (don't block the response)
      sendConfirmations(patientDetails, slotTime, serviceName);

      console.log("[Custom Function] Booking created successfully");

      return res.json({
        result: bookingResult.message,
      });
    } else {
      console.error("[Custom Function] Booking failed:", bookingResult.message);
      return res.json({
        result: bookingResult.message,
      });
    }
  } catch (error) {
    console.error("[Custom Function] create-booking error:", error.message);
    return res.json({
      result: "I'm sorry, I wasn't able to complete the booking just now. Could I take your details and have someone from the clinic call you back to confirm?",
    });
  }
});

// ----------------------------------------------------------
// POST /api/retell/webhook
// Receives Retell webhook events: call_started, call_ended, etc.
// Useful for logging, analytics, and post-call actions.
// ----------------------------------------------------------
app.post("/api/retell/webhook", (req, res) => {
  console.log("[Webhook] Event received:", req.body.event);
  console.log("[Webhook] Payload:", JSON.stringify(req.body, null, 2));

  const { event, call } = req.body;

  switch (event) {
    case "call_started":
      console.log(`[Webhook] Call started — ID: ${call?.call_id}, From: ${call?.from_number}`);
      break;

    case "call_ended":
      console.log(`[Webhook] Call ended — ID: ${call?.call_id}, Duration: ${call?.duration_ms}ms`);
      console.log(`[Webhook] Disconnect reason: ${call?.disconnection_reason}`);
      if (call?.transcript) {
        console.log(`[Webhook] Transcript length: ${call.transcript.length} utterances`);
      }
      break;

    case "call_analyzed":
      console.log(`[Webhook] Call analyzed — ID: ${call?.call_id}`);
      break;

    default:
      console.log(`[Webhook] Unknown event: ${event}`);
  }

  // Always respond with 200 to acknowledge receipt
  res.status(200).json({ received: true });
});

// ============================================================================
// WEBSOCKET ENDPOINT FOR CUSTOM LLM MODE
// ============================================================================
// Path: /llm-websocket/:call_id
//
// This is used when you choose Retell's "Custom LLM" mode instead of their
// built-in LLM. Your server receives the live transcript and decides what
// the agent says at each turn.
// ============================================================================

const wss = new WebSocketServer({ server, path: /^\/llm-websocket\/.*/ });

wss.on("connection", (ws, req) => {
  // Extract call_id from the URL path
  const pathParts = req.url.split("/");
  const callId = pathParts[pathParts.length - 1]?.split("?")[0];

  console.log(`[WebSocket] New connection — Call ID: ${callId}`);

  // Per-connection state for tracking the conversation
  const state = {
    callId,
    conversationStage: "greeting", // greeting → collecting_info → selecting_service → selecting_time → booking → conclusion
    patientDetails: {
      firstName: null,
      lastName: null,
      email: null,
      phone: null,
      isNewPatient: null,
    },
    selectedService: null,
    selectedServiceType: null,
    selectedSlot: null,
    lastAvailabilityResult: null,
  };

  // Send initial config
  sendWebSocketMessage(ws, {
    response_type: "config",
    config: {
      auto_reconnect: true,
      call_details: true,
    },
  });

  // Handle incoming messages from Retell
  ws.on("message", async (data, isBinary) => {
    // Reject binary messages
    if (isBinary) {
      console.error("[WebSocket] Received binary message — closing.");
      ws.close(1007, "Binary messages not supported");
      return;
    }

    try {
      const message = JSON.parse(data.toString());

      switch (message.interaction_type) {
        case "call_details":
          console.log(`[WebSocket] Call details received for ${callId}`);
          // Send the greeting as the first response
          handleGreeting(ws, state);
          break;

        case "ping_pong":
          // Echo back the ping with the same timestamp
          sendWebSocketMessage(ws, {
            response_type: "ping_pong",
            timestamp: message.timestamp,
          });
          break;

        case "update_only":
          // Transcript update — no response needed
          if (message.transcript) {
            console.log(`[WebSocket] Transcript update — ${message.transcript.length} utterances`);
          }
          break;

        case "response_required":
          console.log(`[WebSocket] Response required — ID: ${message.response_id}`);
          await handleResponseRequired(ws, state, message);
          break;

        case "reminder_required":
          console.log(`[WebSocket] Reminder required — ID: ${message.response_id}`);
          handleReminder(ws, state, message);
          break;

        default:
          console.log(`[WebSocket] Unknown interaction type: ${message.interaction_type}`);
      }
    } catch (error) {
      console.error("[WebSocket] Error processing message:", error.message);
      ws.close(1011, "Internal server error");
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`[WebSocket] Connection closed — Call ID: ${callId}, Code: ${code}`);
  });

  ws.on("error", (error) => {
    console.error(`[WebSocket] Error — Call ID: ${callId}:`, error.message);
  });
});

// ----------------------------------------------------------
// Send the initial greeting
// ----------------------------------------------------------
function handleGreeting(ws, state) {
  const greeting = agent.greeting.replace("{clinicName}", clinic.name);
  sendWebSocketMessage(ws, {
    response_type: "response",
    response_id: 0,
    content: greeting,
    content_complete: true,
    end_call: false,
  });
}

// ----------------------------------------------------------
// Handle a response_required event
// This is where the main conversation logic lives for Custom LLM mode.
// The system prompt is sent with each response to guide the LLM.
// ----------------------------------------------------------
async function handleResponseRequired(ws, state, message) {
  const transcript = message.transcript || [];
  const responseId = message.response_id;

  // Get the last user utterance
  const lastUserMessage = getLastUserMessage(transcript);
  console.log(`[WebSocket] User said: "${lastUserMessage}"`);

  // Check if this is a function call that needs to be handled
  const functionCall = detectFunctionCall(lastUserMessage, state, transcript);

  if (functionCall) {
    await handleFunctionCall(ws, state, responseId, functionCall);
    return;
  }

  // For Custom LLM mode, we send the system prompt + transcript to guide
  // the response. In practice, you'd forward this to your LLM (OpenAI, etc.)
  // Here we provide the system prompt and conversation context for the LLM.
  //
  // NOTE: In a production Custom LLM setup, you would stream the response
  // from your LLM (e.g. OpenAI) back through the WebSocket. This demo
  // provides the conversation management framework — you'd replace the
  // response generation with your LLM API call.

  const responseContent = generateContextualResponse(state, transcript, lastUserMessage);

  sendWebSocketMessage(ws, {
    response_type: "response",
    response_id: responseId,
    content: responseContent,
    content_complete: true,
    end_call: false,
  });
}

// ----------------------------------------------------------
// Handle reminder (user hasn't spoken in a while)
// ----------------------------------------------------------
function handleReminder(ws, state, message) {
  const reminderMessages = [
    "Take your time, I'm still here.",
    "No rush at all, I'm here whenever you're ready.",
    "I'm still here if you need anything.",
  ];

  const content =
    reminderMessages[Math.floor(Math.random() * reminderMessages.length)];

  sendWebSocketMessage(ws, {
    response_type: "response",
    response_id: message.response_id,
    content,
    content_complete: true,
    end_call: false,
  });
}

// ----------------------------------------------------------
// Detect if the conversation requires a function call
// (availability check or booking creation)
// ----------------------------------------------------------
function detectFunctionCall(userMessage, state, transcript) {
  if (!userMessage) return null;

  const lower = userMessage.toLowerCase();

  // Detect date mentions for availability checking
  const datePatterns = [
    /\b(today|tomorrow|next\s+\w+|this\s+\w+)\b/,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?\b/i,
  ];

  // If we have a service selected and the user mentions a date
  if (state.selectedService) {
    for (const pattern of datePatterns) {
      const match = lower.match(pattern);
      if (match) {
        const parsedDate = parseDateFromSpeech(match[0]);
        if (parsedDate) {
          return {
            type: "check_availability",
            date: parsedDate,
            serviceKey: state.selectedService,
          };
        }
      }
    }
  }

  return null;
}

// ----------------------------------------------------------
// Handle a detected function call
// ----------------------------------------------------------
async function handleFunctionCall(ws, state, responseId, functionCall) {
  if (functionCall.type === "check_availability") {
    // Log the tool call invocation
    sendWebSocketMessage(ws, {
      response_type: "tool_call_invocation",
      tool_call_id: `avail_${Date.now()}`,
      name: "check_availability",
      arguments: JSON.stringify({
        date: functionCall.date,
        serviceKey: functionCall.serviceKey,
      }),
    });

    const result = await checkAvailability(
      functionCall.date,
      functionCall.serviceKey
    );

    state.lastAvailabilityResult = result;

    // Send the result back as agent speech
    sendWebSocketMessage(ws, {
      response_type: "response",
      response_id: responseId,
      content: result.message,
      content_complete: true,
      end_call: false,
    });
  }
}

// ----------------------------------------------------------
// Generate a contextual response based on conversation state
// In production, replace this with your LLM API call.
// ----------------------------------------------------------
function generateContextualResponse(state, transcript, lastUserMessage) {
  const lower = (lastUserMessage || "").toLowerCase();

  // Handle common questions
  if (lower.includes("what services") || lower.includes("what do you offer")) {
    const serviceNames = Object.values(clinic.services)
      .map((s) => s.name)
      .join(", ");
    return `We offer four main services: ${serviceNames}. Which would you be interested in?`;
  }

  if (lower.includes("opening hours") || lower.includes("what time") || lower.includes("when are you open")) {
    return "We're open Monday to Friday from 8 AM to 6 PM, with late opening on Thursdays until 8 PM, and Saturdays from 9 AM to 2 PM. We're closed on Sundays.";
  }

  if (lower.includes("address") || lower.includes("where are you") || lower.includes("location")) {
    return `We're located at ${clinic.address}.`;
  }

  if (lower.includes("parking") || lower.includes("car park")) {
    return clinic.parking;
  }

  if (lower.includes("book") || lower.includes("appointment")) {
    if (!state.patientDetails.isNewPatient) {
      state.conversationStage = "collecting_info";
      return "Of course, I'd be happy to help. Are you a new patient or have you visited us before?";
    }
  }

  if (lower.includes("new patient") || lower.includes("first time")) {
    state.patientDetails.isNewPatient = true;
    state.conversationStage = "collecting_info";
    return "Welcome! Let me get you booked in. May I have your first name please?";
  }

  if (lower.includes("been before") || lower.includes("existing") || lower.includes("returning")) {
    state.patientDetails.isNewPatient = false;
    state.conversationStage = "collecting_info";
    return "Welcome back! May I have your first name?";
  }

  // Service selection
  if (lower.includes("dentist") || lower.includes("dental")) {
    state.selectedService = "dentistry";
    return "Dentistry, lovely. Would that be a check-up, cleaning, or something else?";
  }
  if (lower.includes("physio")) {
    state.selectedService = "physiotherapy";
    return "Physiotherapy, of course. Would that be an initial assessment, a follow-up, or for a sports injury?";
  }
  if (lower.includes("massage")) {
    state.selectedService = "massage";
    return "Massage therapy, lovely. Would you like a Swedish massage, deep tissue, sports massage, or relaxation massage?";
  }
  if (lower.includes("acupuncture")) {
    state.selectedService = "acupuncture";
    return "Acupuncture, of course. Is this an initial consultation or a follow-up session?";
  }

  // Goodbye
  if (lower.includes("bye") || lower.includes("thank") || lower.includes("that's all") || lower.includes("nothing else")) {
    return `Thank you for calling ${clinic.name}. Don't hesitate to call back anytime. Have a lovely day!`;
  }

  // Default: guide the conversation
  if (state.conversationStage === "greeting") {
    return "How can I help you today? I can book an appointment, or answer any questions about our services.";
  }

  return "I'm here to help. Would you like to book an appointment, or do you have a question about our services?";
}

// ----------------------------------------------------------
// Helper: Get the last user message from the transcript
// ----------------------------------------------------------
function getLastUserMessage(transcript) {
  if (!transcript || transcript.length === 0) return "";

  for (let i = transcript.length - 1; i >= 0; i--) {
    if (transcript[i].role === "user") {
      return transcript[i].content || "";
    }
  }
  return "";
}

// ----------------------------------------------------------
// Helper: Send a message through the WebSocket
// ----------------------------------------------------------
function sendWebSocketMessage(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    console.warn("[WebSocket] Attempted to send on closed connection.");
  }
}

// ----------------------------------------------------------
// Helper: Normalise a service key from various input formats
// ----------------------------------------------------------
function normaliseServiceKey(input) {
  if (!input) return null;
  const lower = input.toLowerCase().trim();

  if (lower.includes("dentist") || lower.includes("dental")) return "dentistry";
  if (lower.includes("physio")) return "physiotherapy";
  if (lower.includes("massage")) return "massage";
  if (lower.includes("acupuncture")) return "acupuncture";
  if (clinic.services[lower]) return lower;

  return null;
}

// ----------------------------------------------------------
// Helper: Send email and SMS confirmations (fire-and-forget)
// Runs in the background so it doesn't delay the agent's response.
// ----------------------------------------------------------
async function sendConfirmations(patientDetails, slotTime, serviceName) {
  try {
    // Send email confirmation
    const emailResult = await sendBookingConfirmation(
      patientDetails,
      slotTime,
      serviceName
    );
    console.log(`[Confirmations] Email: ${emailResult.message}`);

    // Send SMS confirmation
    const smsResult = await sendBookingConfirmationSMS(
      patientDetails,
      slotTime,
      serviceName
    );
    console.log(`[Confirmations] SMS: ${smsResult.message}`);
  } catch (error) {
    console.error("[Confirmations] Error sending confirmations:", error.message);
  }
}

// ============================================================================
// START THE SERVER
// ============================================================================
server.listen(PORT, () => {
  console.log("============================================");
  console.log(`  ${clinic.name} — AI Voice Agent`);
  console.log("============================================");
  console.log(`  Agent: ${agent.name} (${agent.role})`);
  console.log(`  Server running on port ${PORT}`);
  console.log("");
  console.log("  Endpoints:");
  console.log(`    Health:           GET  http://localhost:${PORT}/health`);
  console.log(`    Test:             GET  http://localhost:${PORT}/api/test`);
  console.log(`    Availability:     POST http://localhost:${PORT}/api/retell/check-availability`);
  console.log(`    Create Booking:   POST http://localhost:${PORT}/api/retell/create-booking`);
  console.log(`    Webhook Events:   POST http://localhost:${PORT}/api/retell/webhook`);
  console.log(`    Custom LLM (WS):  ws://localhost:${PORT}/llm-websocket/<call_id>`);
  console.log("");
  console.log("  Services:", Object.values(clinic.services).map((s) => s.name).join(", "));
  console.log("============================================");
});

module.exports = { app, server };
