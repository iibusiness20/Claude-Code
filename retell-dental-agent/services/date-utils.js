// ============================================================================
// DATE UTILITIES
// ============================================================================
// Helper functions for date handling, Sunday/bank holiday detection,
// slot filtering, and natural-language date parsing.
// All dates and times use the UK timezone (Europe/London).
// ============================================================================

const { DateTime } = require("luxon");
const clinic = require("../config/clinic");

// The UK timezone — handles GMT/BST automatically
const UK_TIMEZONE = "Europe/London";

// ----------------------------------------------------------
// Get the current date/time in UK timezone
// ----------------------------------------------------------
function nowUK() {
  return DateTime.now().setZone(UK_TIMEZONE);
}

// ----------------------------------------------------------
// Check whether a given date falls on a Sunday
// @param {string|DateTime} date — ISO date string or Luxon DateTime
// @returns {boolean}
// ----------------------------------------------------------
function isSunday(date) {
  const dt =
    typeof date === "string"
      ? DateTime.fromISO(date, { zone: UK_TIMEZONE })
      : date;
  // Luxon: 7 = Sunday
  return dt.weekday === 7;
}

// ----------------------------------------------------------
// Check whether a given date is a UK bank holiday
// @param {string|DateTime} date — ISO date string or Luxon DateTime
// @returns {boolean}
// ----------------------------------------------------------
function isBankHoliday(date) {
  const dt =
    typeof date === "string"
      ? DateTime.fromISO(date, { zone: UK_TIMEZONE })
      : date;
  const isoDate = dt.toISODate(); // "YYYY-MM-DD"

  // Combine all bank holiday lists from the clinic config
  const allHolidays = [
    ...(clinic.bankHolidays2025 || []),
    ...(clinic.bankHolidays2026 || []),
  ];

  return allHolidays.includes(isoDate);
}

// ----------------------------------------------------------
// Check whether the clinic is closed on a given date
// (Sunday OR bank holiday OR the day has null hours)
// @param {string|DateTime} date
// @returns {{ closed: boolean, reason: string|null }}
// ----------------------------------------------------------
function isClinicClosed(date) {
  const dt =
    typeof date === "string"
      ? DateTime.fromISO(date, { zone: UK_TIMEZONE })
      : date;

  if (isSunday(dt)) {
    return { closed: true, reason: "Sunday" };
  }

  if (isBankHoliday(dt)) {
    return { closed: true, reason: "bank holiday" };
  }

  // Check if the day's hours are set to null in clinic config
  const dayName = dt.toFormat("EEEE").toLowerCase(); // e.g. "monday"
  const dayHours = clinic.hours[dayName];
  if (!dayHours) {
    return { closed: true, reason: `closed on ${dt.toFormat("EEEE")}s` };
  }

  return { closed: false, reason: null };
}

// ----------------------------------------------------------
// Get the adjacent open days around a closed date
// Walks backwards to find the nearest open day before,
// and forwards to find the nearest open day after.
// @param {string|DateTime} closedDate
// @returns {{ before: DateTime, after: DateTime }}
// ----------------------------------------------------------
function getAdjacentOpenDays(closedDate) {
  const dt =
    typeof closedDate === "string"
      ? DateTime.fromISO(closedDate, { zone: UK_TIMEZONE })
      : closedDate;

  // Search backwards for the nearest open day (up to 7 days)
  let before = null;
  for (let i = 1; i <= 7; i++) {
    const candidate = dt.minus({ days: i });
    if (!isClinicClosed(candidate).closed) {
      before = candidate;
      break;
    }
  }

  // Search forwards for the nearest open day (up to 7 days)
  let after = null;
  for (let i = 1; i <= 7; i++) {
    const candidate = dt.plus({ days: i });
    if (!isClinicClosed(candidate).closed) {
      after = candidate;
      break;
    }
  }

  return { before, after };
}

// ----------------------------------------------------------
// Calculate the last bookable slot time for a given day
// @param {string} closingTime — e.g. "18:00"
// @param {number} appointmentDuration — in minutes (e.g. 30, 45, 60)
// @param {number} bufferMinutes — minimum gap before close (default 30)
// @returns {string} — last slot time as "HH:mm"
// ----------------------------------------------------------
function getLastSlot(closingTime, appointmentDuration, bufferMinutes = 30) {
  const [closeHour, closeMin] = closingTime.split(":").map(Number);
  const closeTotal = closeHour * 60 + closeMin;

  // The appointment must END by closing time, so last start = close - duration.
  // Also enforce a minimum buffer before close.
  const lastByDuration = closeTotal - appointmentDuration;
  const lastByBuffer = closeTotal - bufferMinutes;

  // Use whichever is earlier (more restrictive)
  const lastTotal = Math.min(lastByDuration, lastByBuffer);

  const h = Math.floor(lastTotal / 60);
  const m = lastTotal % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ----------------------------------------------------------
// Filter available slots to remove any past the last-booking cutoff
// @param {Array<string>} slots — array of ISO datetime strings
// @param {string} closingTime — e.g. "18:00"
// @param {number} appointmentDuration — in minutes
// @returns {Array<string>} — filtered slots
// ----------------------------------------------------------
function filterSlotsByClosingTime(slots, closingTime, appointmentDuration) {
  const lastSlotTime = getLastSlot(
    closingTime,
    appointmentDuration,
    clinic.lastBookingBeforeClose
  );

  return slots.filter((slot) => {
    const dt = DateTime.fromISO(slot, { zone: UK_TIMEZONE });
    const slotTime = dt.toFormat("HH:mm");
    return slotTime <= lastSlotTime;
  });
}

// ----------------------------------------------------------
// Get the day name for a given date
// @param {string|DateTime} date
// @returns {string} — e.g. "monday"
// ----------------------------------------------------------
function getDayName(date) {
  const dt =
    typeof date === "string"
      ? DateTime.fromISO(date, { zone: UK_TIMEZONE })
      : date;
  return dt.toFormat("EEEE").toLowerCase();
}

// ----------------------------------------------------------
// Get clinic hours for a specific date
// @param {string|DateTime} date
// @returns {{ open: string, close: string }|null}
// ----------------------------------------------------------
function getClinicHoursForDate(date) {
  const dayName = getDayName(date);
  return clinic.hours[dayName] || null;
}

// ----------------------------------------------------------
// Parse a spoken date reference into an ISO date string
// Handles: "today", "tomorrow", "next Monday", "this Friday",
// "March 15th", "15th of March", "next week", etc.
// @param {string} spokenDate — the caller's spoken date reference
// @returns {string|null} — ISO date string or null if unparseable
// ----------------------------------------------------------
function parseDateFromSpeech(spokenDate) {
  if (!spokenDate) return null;

  const now = nowUK();
  const input = spokenDate.toLowerCase().trim();

  // "today"
  if (input === "today") {
    return now.toISODate();
  }

  // "tomorrow"
  if (input === "tomorrow") {
    return now.plus({ days: 1 }).toISODate();
  }

  // "next week" — return next Monday
  if (input === "next week") {
    const daysUntilMonday = (8 - now.weekday) % 7 || 7;
    return now.plus({ days: daysUntilMonday }).toISODate();
  }

  // Day names: "monday", "next tuesday", "this wednesday"
  const dayNames = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  const nextPrefix = input.startsWith("next ");
  const thisPrefix = input.startsWith("this ");
  const cleanInput = input
    .replace(/^(next|this)\s+/, "")
    .replace(/\s+/g, "");

  const dayIndex = dayNames.indexOf(cleanInput);
  if (dayIndex !== -1) {
    // Luxon weekday: 1=Mon … 7=Sun
    const targetWeekday = dayIndex + 1;
    let daysAhead = (targetWeekday - now.weekday + 7) % 7;

    // If "next", ensure it's at least 7 days away
    if (nextPrefix && daysAhead < 7) {
      daysAhead += 7;
    }
    // If same day and not explicitly "this", go to next week
    if (daysAhead === 0 && !thisPrefix) {
      daysAhead = 7;
    }

    return now.plus({ days: daysAhead }).toISODate();
  }

  // Try parsing as a recognisable date string (e.g. "March 15", "15 March",
  // "2025-03-15", "15/03/2025")
  const formats = [
    "d MMMM yyyy",
    "d MMMM",
    "MMMM d yyyy",
    "MMMM d",
    "d/MM/yyyy",
    "dd/MM/yyyy",
    "yyyy-MM-dd",
    "d MMM yyyy",
    "d MMM",
    "MMM d yyyy",
    "MMM d",
  ];

  // Strip ordinal suffixes: "15th" → "15", "1st" → "1", "2nd" → "2", "3rd" → "3"
  const cleaned = input
    .replace(/(\d+)(st|nd|rd|th)/gi, "$1")
    .replace(/\s+of\s+/gi, " ")
    .trim();

  for (const fmt of formats) {
    let parsed = DateTime.fromFormat(cleaned, fmt, { zone: UK_TIMEZONE });
    if (parsed.isValid) {
      // If year was not in the format, default to current or next year
      if (!fmt.includes("yyyy")) {
        parsed = parsed.set({ year: now.year });
        // If the date has already passed this year, use next year
        if (parsed < now.startOf("day")) {
          parsed = parsed.set({ year: now.year + 1 });
        }
      }
      return parsed.toISODate();
    }
  }

  // Could not parse — return null so the agent can ask again
  return null;
}

// ----------------------------------------------------------
// Format a date for spoken output (e.g. "Monday the 15th of March")
// @param {string|DateTime} date
// @returns {string}
// ----------------------------------------------------------
function formatDateForSpeech(date) {
  const dt =
    typeof date === "string"
      ? DateTime.fromISO(date, { zone: UK_TIMEZONE })
      : date;

  const dayName = dt.toFormat("EEEE");
  const day = dt.day;
  const month = dt.toFormat("MMMM");

  // Add ordinal suffix
  const suffix = getOrdinalSuffix(day);

  return `${dayName} the ${day}${suffix} of ${month}`;
}

// ----------------------------------------------------------
// Format a time for spoken output (e.g. "2:30 PM")
// @param {string} isoDateTime — ISO datetime string
// @returns {string}
// ----------------------------------------------------------
function formatTimeForSpeech(isoDateTime) {
  const dt = DateTime.fromISO(isoDateTime, { zone: UK_TIMEZONE });
  return dt.toFormat("h:mm a");
}

// ----------------------------------------------------------
// Get ordinal suffix for a day number
// ----------------------------------------------------------
function getOrdinalSuffix(day) {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

module.exports = {
  UK_TIMEZONE,
  nowUK,
  isSunday,
  isBankHoliday,
  isClinicClosed,
  getAdjacentOpenDays,
  getLastSlot,
  filterSlotsByClosingTime,
  getDayName,
  getClinicHoursForDate,
  parseDateFromSpeech,
  formatDateForSpeech,
  formatTimeForSpeech,
};
