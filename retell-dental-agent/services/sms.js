// ============================================================================
// SMS CONFIRMATION SERVICE
// ============================================================================
// Sends booking confirmation SMS messages via Twilio.
// Works with Twilio's free trial account.
// ============================================================================

const clinic = require("../config/clinic");
const { formatDateForSpeech, formatTimeForSpeech } = require("./date-utils");

// ----------------------------------------------------------
// Lazily initialise Twilio client (only when first SMS is sent)
// This avoids errors if Twilio credentials are not yet configured.
// ----------------------------------------------------------
let twilioClient = null;

function getTwilioClient() {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      console.warn("[SMS] Twilio credentials not configured. SMS will be skipped.");
      return null;
    }

    const twilio = require("twilio");
    twilioClient = twilio(accountSid, authToken);
  }
  return twilioClient;
}

// ----------------------------------------------------------
// Send a booking confirmation SMS
// @param {object} patientDetails — { firstName, lastName, email, phone }
// @param {string} slotTime — ISO datetime of the appointment
// @param {string} serviceName — display name of the service
// @returns {object} — { success: boolean, message: string }
// ----------------------------------------------------------
async function sendBookingConfirmationSMS(patientDetails, slotTime, serviceName) {
  const client = getTwilioClient();

  if (!client) {
    console.log("[SMS] Twilio not configured — skipping SMS confirmation.");
    return {
      success: false,
      message: "SMS service not configured. Skipping SMS confirmation.",
    };
  }

  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!fromNumber) {
    console.warn("[SMS] TWILIO_PHONE_NUMBER not set. Skipping SMS.");
    return {
      success: false,
      message: "Twilio phone number not configured.",
    };
  }

  try {
    const patientName = `${patientDetails.firstName} ${patientDetails.lastName}`;
    const dateDisplay = formatDateForSpeech(slotTime);
    const timeDisplay = formatTimeForSpeech(slotTime);

    const body = buildSMSBody(patientName, dateDisplay, timeDisplay, serviceName);

    console.log(`[SMS] Sending confirmation to ${patientDetails.phone}`);

    const message = await client.messages.create({
      body,
      from: fromNumber,
      to: patientDetails.phone,
    });

    console.log(`[SMS] Sent successfully. SID: ${message.sid}`);

    return { success: true, message: "SMS confirmation sent." };
  } catch (error) {
    console.error("[SMS] Error sending confirmation:", error.message);
    return {
      success: false,
      message: `Failed to send SMS: ${error.message}`,
    };
  }
}

// ----------------------------------------------------------
// Build the SMS message body
// Kept short to fit within SMS character limits.
// ----------------------------------------------------------
function buildSMSBody(patientName, dateDisplay, timeDisplay, serviceName) {
  return (
    `${clinic.name} — Appointment Confirmed\n\n` +
    `Hi ${patientName.split(" ")[0]},\n` +
    `Your ${serviceName} appointment is confirmed:\n` +
    `Date: ${dateDisplay}\n` +
    `Time: ${timeDisplay}\n` +
    `Location: ${clinic.address}\n\n` +
    `To cancel or reschedule, call ${clinic.phone} at least 24hrs in advance.`
  );
}

module.exports = {
  sendBookingConfirmationSMS,
};
