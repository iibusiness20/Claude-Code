# CLAUDE.md — Project Context

## What is this project?

A Node.js backend for an AI voice receptionist that answers calls for healthcare clinics. It uses Retell AI for voice, Cal.com for appointment booking, Nodemailer for email confirmations, and Twilio for SMS confirmations.

## Architecture

- **server.js** — Main Express server. Handles WebSocket connections (Custom LLM mode) and POST endpoints (Custom Function mode) for Retell AI.
- **config/clinic.js** — All clinic-specific configuration (name, address, services, hours, bank holidays). This is the ONLY file that needs editing per client.
- **config/agent-personality.js** — Agent name, greeting, and conversational style.
- **prompts/system-prompt.js** — The complete system prompt sent to Retell's LLM. Dynamically built from clinic config. Contains all conversation rules.
- **services/calcom.js** — Cal.com API v2 integration for checking availability and creating bookings.
- **services/email.js** — Sends HTML booking confirmation emails via Nodemailer/SMTP.
- **services/sms.js** — Sends SMS confirmations via Twilio (optional, gracefully skipped if not configured).
- **services/date-utils.js** — Date parsing, Sunday/bank holiday detection, slot filtering, UK timezone handling.

## Key conventions

- All JavaScript, no TypeScript.
- UK English spelling throughout.
- All dates/times use Europe/London timezone via Luxon.
- Retell AI communication uses WebSocket protocol (Custom LLM) and POST endpoints (Custom Functions).
- Clinic config is the single source of truth — changing clinic.js updates everything.

## Running locally

```bash
cp .env.example .env    # Fill in your API keys
npm install
npm start               # or: npm run dev (with --watch)
```

## Testing

- GET /health — Server health check
- GET /api/test — Sample response format verification
- POST /api/retell/check-availability — Test with: `{ "args": { "date": "2025-03-15", "serviceKey": "dentistry" } }`
- POST /api/retell/create-booking — Test with full booking args
