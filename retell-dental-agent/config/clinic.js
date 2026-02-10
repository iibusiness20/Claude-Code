// ============================================================================
// CLINIC CONFIGURATION
// ============================================================================
// This is the ONLY file you need to edit when setting up a new clinic.
// Change the values below to match your clinic's details.
// ============================================================================

module.exports = {
  // ----------------------------------------------------------
  // CLINIC DETAILS
  // ----------------------------------------------------------
  name: "Wellness Health Clinic",
  phone: "020 7123 4567",
  address: "123 Harley Street, London W1G 6AX",
  parking: "Street parking available on Devonshire Place. Nearest car park is Q-Park Harley Street, 2 minutes walk.",

  // ----------------------------------------------------------
  // SERVICES OFFERED
  // Add, remove, or modify services as needed.
  // Each service needs: name, types (list of sub-types),
  // defaultDuration (in minutes), and a short description.
  // ----------------------------------------------------------
  services: {
    dentistry: {
      name: "Dentistry",
      types: ["Check-up", "Cleaning", "Fillings", "Whitening", "Emergency dental"],
      defaultDuration: 30,
      description:
        "General and cosmetic dentistry including check-ups, cleanings, fillings, teeth whitening, and emergency dental care.",
    },
    physiotherapy: {
      name: "Physiotherapy",
      types: [
        "Initial assessment",
        "Follow-up session",
        "Sports injury",
        "Post-surgery rehab",
      ],
      defaultDuration: 45,
      description:
        "Physiotherapy for musculoskeletal issues, sports injuries, post-surgery rehabilitation, and chronic pain management.",
    },
    massage: {
      name: "Massage Therapy",
      types: [
        "Swedish massage",
        "Deep tissue massage",
        "Sports massage",
        "Relaxation massage",
      ],
      defaultDuration: 60,
      description:
        "Therapeutic and relaxation massage including Swedish, deep tissue, and sports massage.",
    },
    acupuncture: {
      name: "Acupuncture",
      types: [
        "Initial consultation",
        "Follow-up session",
        "Pain management",
        "Stress and anxiety",
      ],
      defaultDuration: 45,
      description:
        "Traditional acupuncture for pain relief, stress management, anxiety, migraines, and general wellbeing.",
    },
  },

  // ----------------------------------------------------------
  // OPENING HOURS
  // Set to null for days the clinic is closed (e.g. Sunday).
  // Times use 24-hour format: "08:00", "18:00", "20:00" etc.
  // ----------------------------------------------------------
  hours: {
    monday: { open: "08:00", close: "18:00" },
    tuesday: { open: "08:00", close: "18:00" },
    wednesday: { open: "08:00", close: "18:00" },
    thursday: { open: "08:00", close: "20:00" },
    friday: { open: "08:00", close: "18:00" },
    saturday: { open: "09:00", close: "14:00" },
    sunday: null, // Clinic closed on Sundays
  },

  // ----------------------------------------------------------
  // BOOKING RULES
  // lastBookingBeforeClose: minimum minutes before closing time
  // that the last appointment can START.
  // ----------------------------------------------------------
  lastBookingBeforeClose: 30,

  // ----------------------------------------------------------
  // UK BANK HOLIDAYS
  // The clinic is closed on these dates (treated like Sundays).
  // Update these each year.
  // ----------------------------------------------------------
  bankHolidays2025: [
    "2025-01-01", // New Year's Day
    "2025-04-18", // Good Friday
    "2025-04-21", // Easter Monday
    "2025-05-05", // Early May bank holiday
    "2025-05-26", // Spring bank holiday
    "2025-08-25", // Summer bank holiday
    "2025-12-25", // Christmas Day
    "2025-12-26", // Boxing Day
  ],
  bankHolidays2026: [
    "2026-01-01", // New Year's Day
    "2026-04-03", // Good Friday
    "2026-04-06", // Easter Monday
    "2026-05-04", // Early May bank holiday
    "2026-05-25", // Spring bank holiday
    "2026-08-31", // Summer bank holiday
    "2026-12-25", // Christmas Day
    "2026-12-28", // Boxing Day (substitute)
  ],
};
