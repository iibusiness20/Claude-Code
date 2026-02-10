// ============================================================================
// CAL.COM API INTEGRATION
// ============================================================================
// Handles availability checking and appointment booking via Cal.com API v2.
// Includes Sunday/bank-holiday detection and last-slot filtering.
// ============================================================================

const axios = require("axios");
const clinic = require("../config/clinic");
const {
  isClinicClosed,
  getAdjacentOpenDays,
  filterSlotsByClosingTime,
  getClinicHoursForDate,
  formatDateForSpeech,
  formatTimeForSpeech,
  UK_TIMEZONE,
} = require("./date-utils");
const { DateTime } = require("luxon");

// ----------------------------------------------------------
// Base URL and auth header for Cal.com API v2
// ----------------------------------------------------------
const CALCOM_BASE_URL = process.env.CALCOM_BASE_URL || "https://api.cal.com/v2";

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.CALCOM_API_KEY}`,
    "Content-Type": "application/json",
    "cal-api-version": "2024-08-13",
  };
}

// ----------------------------------------------------------
// Map service keys to their Cal.com event type IDs
// These IDs are set via environment variables.
// ----------------------------------------------------------
function getEventTypeId(serviceKey) {
  const mapping = {
    dentistry: process.env.CALCOM_DENTIST_EVENT_ID,
    physiotherapy: process.env.CALCOM_PHYSIO_EVENT_ID,
    massage: process.env.CALCOM_MASSAGE_EVENT_ID,
    acupuncture: process.env.CALCOM_ACUPUNCTURE_EVENT_ID,
  };

  const id = mapping[serviceKey];
  if (!id) {
    console.warn(
      `[Cal.com] No event type ID configured for service: ${serviceKey}`
    );
  }
  return id;
}

// ----------------------------------------------------------
// Get the appointment duration for a service
// ----------------------------------------------------------
function getServiceDuration(serviceKey) {
  const service = clinic.services[serviceKey];
  return service ? service.defaultDuration : 30;
}

// ----------------------------------------------------------
// Check availability for a given date and service
// @param {string} dateStr — ISO date string (e.g. "2025-03-15")
// @param {string} serviceKey — e.g. "dentistry", "massage"
// @returns {object} — { available: boolean, slots: [], message: string }
// ----------------------------------------------------------
async function checkAvailability(dateStr, serviceKey) {
  // 1. Check if the clinic is closed on this date
  const closedCheck = isClinicClosed(dateStr);
  if (closedCheck.closed) {
    return await handleClosedDay(dateStr, serviceKey, closedCheck.reason);
  }

  // 2. Get available slots from Cal.com
  const eventTypeId = getEventTypeId(serviceKey);
  if (!eventTypeId) {
    return {
      available: false,
      slots: [],
      message: `Sorry, the ${serviceKey} service is not configured for online booking yet. Please call the clinic directly.`,
    };
  }

  try {
    const startTime = `${dateStr}T00:00:00.000Z`;
    const endTime = `${dateStr}T23:59:59.000Z`;

    console.log(
      `[Cal.com] Checking availability for ${serviceKey} on ${dateStr}`
    );
    console.log(`[Cal.com] Event type ID: ${eventTypeId}`);

    const response = await axios.get(`${CALCOM_BASE_URL}/slots/available`, {
      headers: getHeaders(),
      params: {
        startTime,
        endTime,
        eventTypeId,
      },
    });

    // Cal.com v2 returns slots grouped by date
    const slotsData = response.data?.data?.slots || {};
    let slots = [];

    // Flatten all slots for the requested date
    for (const [slotDate, dateSlots] of Object.entries(slotsData)) {
      if (Array.isArray(dateSlots)) {
        slots.push(...dateSlots.map((s) => s.time || s));
      }
    }

    // 3. Filter out slots past the last-booking-before-close cutoff
    const dayHours = getClinicHoursForDate(dateStr);
    if (dayHours) {
      const duration = getServiceDuration(serviceKey);
      slots = filterSlotsByClosingTime(slots, dayHours.close, duration);
    }

    if (slots.length === 0) {
      return {
        available: false,
        slots: [],
        message: `I'm sorry, there are no available slots for ${clinic.services[serviceKey]?.name || serviceKey} on ${formatDateForSpeech(dateStr)}. Would you like me to check another day?`,
      };
    }

    // Format slots for the agent to present
    const formattedSlots = slots.map((slot) => ({
      time: slot,
      display: formatTimeForSpeech(slot),
    }));

    return {
      available: true,
      slots: formattedSlots,
      message: `I have availability on ${formatDateForSpeech(dateStr)}. Here are some available times: ${formattedSlots
        .slice(0, 5)
        .map((s) => s.display)
        .join(", ")}.${formattedSlots.length > 5 ? " And more times available." : ""} Which time works best for you?`,
    };
  } catch (error) {
    console.error("[Cal.com] Error checking availability:", error.message);
    if (error.response) {
      console.error("[Cal.com] Response status:", error.response.status);
      console.error("[Cal.com] Response data:", JSON.stringify(error.response.data));
    }
    return {
      available: false,
      slots: [],
      message:
        "I'm having trouble checking our availability at the moment. Could I take your details and have someone call you back?",
    };
  }
}

// ----------------------------------------------------------
// Handle a closed day (Sunday or bank holiday)
// Checks the nearest open days for availability.
// @param {string} dateStr — the closed date
// @param {string} serviceKey — service key
// @param {string} reason — "Sunday" or "bank holiday"
// @returns {object}
// ----------------------------------------------------------
async function handleClosedDay(dateStr, serviceKey, reason) {
  const { before, after } = getAdjacentOpenDays(dateStr);

  let message = `I'm sorry, the clinic is closed on ${formatDateForSpeech(dateStr)}`;
  if (reason === "bank holiday") {
    message += " as it's a bank holiday";
  }
  message += ".";

  // Check availability on adjacent open days
  const adjacentSlots = await getSaturdayMondaySlots(dateStr, serviceKey);

  if (adjacentSlots.beforeSlots.length > 0 || adjacentSlots.afterSlots.length > 0) {
    message += " I have availability on ";

    const parts = [];
    if (adjacentSlots.beforeSlots.length > 0) {
      const beforeDate = formatDateForSpeech(before);
      const beforeTimes = adjacentSlots.beforeSlots
        .slice(0, 2)
        .map((s) => s.display)
        .join(" and ");
      parts.push(`${beforeDate} at ${beforeTimes}`);
    }
    if (adjacentSlots.afterSlots.length > 0) {
      const afterDate = formatDateForSpeech(after);
      const afterTimes = adjacentSlots.afterSlots
        .slice(0, 2)
        .map((s) => s.display)
        .join(" and ");
      parts.push(`${afterDate} at ${afterTimes}`);
    }

    message += parts.join(", or ") + ". Would any of those work for you?";
  } else {
    message +=
      " Unfortunately, I don't have availability on the nearest open days either. Would you like me to check a different week?";
  }

  return {
    available: false,
    closedDay: true,
    reason,
    adjacentSlots,
    slots: [],
    message,
  };
}

// ----------------------------------------------------------
// Get slots for the nearest open days around a closed date
// Returns up to 2 slots per day.
// @param {string} closedDateStr — the closed date
// @param {string} serviceKey — service key
// @returns {{ beforeSlots: Array, afterSlots: Array }}
// ----------------------------------------------------------
async function getSaturdayMondaySlots(closedDateStr, serviceKey) {
  const { before, after } = getAdjacentOpenDays(closedDateStr);
  const eventTypeId = getEventTypeId(serviceKey);

  let beforeSlots = [];
  let afterSlots = [];

  if (!eventTypeId) {
    return { beforeSlots, afterSlots };
  }

  // Check the day BEFORE
  if (before) {
    try {
      const beforeDate = before.toISODate();
      const response = await axios.get(`${CALCOM_BASE_URL}/slots/available`, {
        headers: getHeaders(),
        params: {
          startTime: `${beforeDate}T00:00:00.000Z`,
          endTime: `${beforeDate}T23:59:59.000Z`,
          eventTypeId,
        },
      });

      const slotsData = response.data?.data?.slots || {};
      let rawSlots = [];
      for (const [, dateSlots] of Object.entries(slotsData)) {
        if (Array.isArray(dateSlots)) {
          rawSlots.push(...dateSlots.map((s) => s.time || s));
        }
      }

      // Filter by closing time
      const dayHours = getClinicHoursForDate(beforeDate);
      if (dayHours) {
        const duration = getServiceDuration(serviceKey);
        rawSlots = filterSlotsByClosingTime(rawSlots, dayHours.close, duration);
      }

      beforeSlots = rawSlots.slice(0, 2).map((slot) => ({
        time: slot,
        display: formatTimeForSpeech(slot),
      }));
    } catch (error) {
      console.error(
        "[Cal.com] Error checking day-before availability:",
        error.message
      );
    }
  }

  // Check the day AFTER
  if (after) {
    try {
      const afterDate = after.toISODate();
      const response = await axios.get(`${CALCOM_BASE_URL}/slots/available`, {
        headers: getHeaders(),
        params: {
          startTime: `${afterDate}T00:00:00.000Z`,
          endTime: `${afterDate}T23:59:59.000Z`,
          eventTypeId,
        },
      });

      const slotsData = response.data?.data?.slots || {};
      let rawSlots = [];
      for (const [, dateSlots] of Object.entries(slotsData)) {
        if (Array.isArray(dateSlots)) {
          rawSlots.push(...dateSlots.map((s) => s.time || s));
        }
      }

      // Filter by closing time
      const dayHours = getClinicHoursForDate(afterDate);
      if (dayHours) {
        const duration = getServiceDuration(serviceKey);
        rawSlots = filterSlotsByClosingTime(rawSlots, dayHours.close, duration);
      }

      afterSlots = rawSlots.slice(0, 2).map((slot) => ({
        time: slot,
        display: formatTimeForSpeech(slot),
      }));
    } catch (error) {
      console.error(
        "[Cal.com] Error checking day-after availability:",
        error.message
      );
    }
  }

  return { beforeSlots, afterSlots };
}

// ----------------------------------------------------------
// Create a booking via Cal.com API v2
// @param {object} patientDetails — { firstName, lastName, email, phone }
// @param {string} slotTime — ISO datetime of the selected slot
// @param {string} serviceKey — service key
// @returns {object} — { success: boolean, booking: object, message: string }
// ----------------------------------------------------------
async function createBooking(patientDetails, slotTime, serviceKey) {
  const eventTypeId = getEventTypeId(serviceKey);

  if (!eventTypeId) {
    return {
      success: false,
      booking: null,
      message: "This service is not configured for online booking.",
    };
  }

  try {
    const serviceName = clinic.services[serviceKey]?.name || serviceKey;

    console.log(`[Cal.com] Creating booking for ${patientDetails.firstName} ${patientDetails.lastName}`);
    console.log(`[Cal.com] Service: ${serviceName}, Slot: ${slotTime}`);

    const bookingData = {
      eventTypeId: parseInt(eventTypeId),
      start: slotTime,
      attendee: {
        name: `${patientDetails.firstName} ${patientDetails.lastName}`,
        email: patientDetails.email,
        phoneNumber: patientDetails.phone,
        timeZone: UK_TIMEZONE,
      },
      metadata: {
        source: "voice-agent",
        service: serviceName,
        patientType: patientDetails.isNewPatient ? "new" : "existing",
      },
    };

    const response = await axios.post(
      `${CALCOM_BASE_URL}/bookings`,
      bookingData,
      { headers: getHeaders() }
    );

    const booking = response.data?.data;

    console.log(`[Cal.com] Booking created successfully. ID: ${booking?.id || booking?.uid}`);

    return {
      success: true,
      booking,
      message: `Your appointment is confirmed for ${formatDateForSpeech(slotTime)} at ${formatTimeForSpeech(slotTime)} for ${serviceName}. You'll receive a confirmation email shortly.`,
    };
  } catch (error) {
    console.error("[Cal.com] Error creating booking:", error.message);
    if (error.response) {
      console.error("[Cal.com] Response status:", error.response.status);
      console.error("[Cal.com] Response data:", JSON.stringify(error.response.data));
    }
    return {
      success: false,
      booking: null,
      message:
        "I'm sorry, I wasn't able to complete the booking just now. Could I take your details and have someone from the clinic call you back to confirm?",
    };
  }
}

module.exports = {
  checkAvailability,
  createBooking,
  getSaturdayMondaySlots,
  getEventTypeId,
  getServiceDuration,
};
