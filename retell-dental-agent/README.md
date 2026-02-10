# Retell Dental Agent — AI Voice Receptionist for Healthcare Clinics

An AI-powered voice receptionist that answers phone calls, books appointments, and answers questions for healthcare clinics. Built with Node.js, Retell AI, Cal.com, and Nodemailer.

## What does this do?

When a patient calls your clinic, the AI agent (named "Sophia" by default):

1. **Answers the call** with a warm, professional greeting
2. **Books appointments** by collecting patient details and checking real-time availability
3. **Sends confirmations** via email and SMS after booking
4. **Answers questions** about services, opening hours, location, and parking
5. **Handles closed days** — automatically detects Sundays and bank holidays and offers alternative dates

## Prerequisites

Before you start, you'll need accounts with these services (all have free tiers):

| Service | What it's for | Sign up |
|---------|--------------|---------|
| **Retell AI** | Voice agent platform | [retellai.com](https://www.retellai.com) |
| **Cal.com** | Appointment scheduling | [cal.com](https://cal.com) |
| **Gmail** (or any SMTP) | Sending confirmation emails | [gmail.com](https://gmail.com) |
| **Twilio** (optional) | Sending confirmation SMS | [twilio.com](https://www.twilio.com) |

You'll also need **Node.js 18 or newer** installed on your computer. Download it from [nodejs.org](https://nodejs.org).

## Step-by-step setup

### 1. Download and install

Open a terminal (Command Prompt on Windows, Terminal on Mac/Linux) and run:

```bash
# Navigate to the project folder
cd retell-dental-agent

# Install the required packages
npm install
```

### 2. Set up your environment variables

Copy the example environment file and fill in your details:

```bash
cp .env.example .env
```

Open the `.env` file in any text editor and fill in your API keys:

- **RETELL_API_KEY** — Found in your Retell AI dashboard under Settings → API Keys
- **CALCOM_API_KEY** — Found in Cal.com under Settings → Developer → API Keys
- **CALCOM_*_EVENT_ID** — Each service needs a Cal.com event type. Create one per service in Cal.com, then copy the event type ID from the URL
- **SMTP settings** — For Gmail, enable 2-Step Verification, then create an App Password at Google Account → Security → App Passwords
- **Twilio** (optional) — Get your SID, Auth Token, and phone number from the Twilio console

### 3. Configure your clinic details

Open `config/clinic.js` in any text editor. This is the **only file you need to change** for each new clinic. Update:

- Clinic name, phone, address, and parking info
- Services offered (add, remove, or modify)
- Opening hours for each day
- Bank holiday dates (update yearly)

### 4. Start the server

```bash
npm start
```

You should see output like:

```
============================================
  Wellness Health Clinic — AI Voice Agent
============================================
  Agent: Sophia (AI receptionist)
  Server running on port 3000
  ...
============================================
```

### 5. Test that it's working

Open your browser and visit:

- **http://localhost:3000/health** — Should show `{"status":"healthy"}`
- **http://localhost:3000/api/test** — Shows sample response formats and your clinic config

### 6. Connect to Retell AI

There are two ways to connect this server to Retell AI:

#### Option A: Custom Functions (Recommended for most users)

1. In Retell AI, create a new Agent using their built-in LLM
2. Copy the **system prompt** from `prompts/system-prompt.js` (or run the server and visit `/api/test` to see a preview)
3. Add two Custom Functions in Retell:
   - **check_availability** — URL: `https://your-server.com/api/retell/check-availability`
   - **create_booking** — URL: `https://your-server.com/api/retell/create-booking`
4. Set up the function parameters as described in the system prompt

#### Option B: Custom LLM (Advanced)

1. In Retell AI, create a new Agent using "Custom LLM"
2. Set the WebSocket URL to: `wss://your-server.com/llm-websocket/{call_id}`
3. The server will handle all conversation logic

### 7. Set up the Retell webhook (optional)

In Retell AI settings, add a webhook URL: `https://your-server.com/api/retell/webhook`

This receives call events (started, ended) for logging and analytics.

## Setting up Cal.com

1. Create a Cal.com account at [cal.com](https://cal.com)
2. Create one **Event Type** for each service:
   - Dentistry (30 min)
   - Physiotherapy (45 min)
   - Massage Therapy (60 min)
   - Acupuncture (45 min)
3. Note each event type's ID (visible in the URL when editing: `cal.com/event-types/XXXXX`)
4. Add these IDs to your `.env` file as `CALCOM_DENTIST_EVENT_ID`, `CALCOM_PHYSIO_EVENT_ID`, etc.
5. Generate an API key at Cal.com → Settings → Developer → API Keys

## Deploying to the internet

Your server needs to be accessible from the internet for Retell AI to reach it. Here are two free options:

### Deploy on Railway

1. Create an account at [railway.app](https://railway.app)
2. Connect your GitHub repository
3. Add your environment variables in the Railway dashboard
4. Railway will automatically detect Node.js and deploy
5. Copy the generated URL and use it in Retell AI settings

### Deploy on Render

1. Create an account at [render.com](https://render.com)
2. Create a new Web Service and connect your repository
3. Set the build command to `npm install` and start command to `npm start`
4. Add your environment variables in the Render dashboard
5. Copy the generated URL and use it in Retell AI settings

## Configuring for a new clinic

To set up this system for a different clinic:

1. Open `config/clinic.js` and change the clinic details
2. Open `config/agent-personality.js` to change the agent's name or greeting (optional)
3. Update the Cal.com event type IDs in `.env`
4. Update SMTP/email settings in `.env`
5. Restart the server

That's it. The system prompt and all responses are automatically generated from the config files.

## Project structure

```
retell-dental-agent/
├── server.js                    # Main server (Express + WebSocket)
├── config/
│   ├── clinic.js               # Clinic details (EDIT THIS per client)
│   └── agent-personality.js    # Agent name and greeting
├── services/
│   ├── calcom.js               # Cal.com booking integration
│   ├── email.js                # Email confirmations
│   ├── sms.js                  # SMS confirmations (optional)
│   └── date-utils.js           # Date handling and UK timezone
├── prompts/
│   └── system-prompt.js        # AI agent system prompt (auto-generated)
├── .env.example                # Template for environment variables
├── .env                        # Your actual environment variables (not in git)
├── package.json                # Node.js dependencies
├── README.md                   # This file
└── CLAUDE.md                   # Context file for Claude Code
```

## Troubleshooting

### Server won't start

- Make sure you ran `npm install` first
- Check that Node.js 18+ is installed: `node --version`
- Make sure port 3000 isn't already in use (change PORT in `.env` if needed)

### Emails aren't sending

- For Gmail: make sure you're using an App Password, not your regular password
- Check that 2-Step Verification is enabled on your Google account
- Verify SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in `.env`

### Cal.com availability not working

- Verify your CALCOM_API_KEY is correct
- Make sure the event type IDs match your Cal.com event types
- Check that the event types have available time slots configured in Cal.com

### Retell AI not connecting

- Make sure your server is accessible from the internet (not just localhost)
- For Custom Functions: verify the URLs are correct and include `/api/retell/`
- For Custom LLM: verify the WebSocket URL includes `/llm-websocket/`
- Check the server logs for connection attempts and errors

### SMS not sending

- SMS is optional — it works fine without Twilio configured
- For Twilio trial: you can only send to verified numbers
- Check TWILIO_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in `.env`
