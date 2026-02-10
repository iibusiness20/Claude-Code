// ============================================================================
// EMAIL CONFIRMATION SERVICE
// ============================================================================
// Sends professional HTML booking confirmation emails via Nodemailer.
// Supports Gmail SMTP, Brevo, or any standard SMTP provider.
// ============================================================================

const nodemailer = require("nodemailer");
const clinic = require("../config/clinic");
const { formatDateForSpeech, formatTimeForSpeech } = require("./date-utils");

// ----------------------------------------------------------
// Create the SMTP transporter using environment variables
// ----------------------------------------------------------
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ----------------------------------------------------------
// Send a booking confirmation email
// @param {object} patientDetails — { firstName, lastName, email, phone }
// @param {string} slotTime — ISO datetime of the appointment
// @param {string} serviceName — display name of the service
// @returns {object} — { success: boolean, message: string }
// ----------------------------------------------------------
async function sendBookingConfirmation(patientDetails, slotTime, serviceName) {
  try {
    const transporter = createTransporter();

    const patientName = `${patientDetails.firstName} ${patientDetails.lastName}`;
    const dateDisplay = formatDateForSpeech(slotTime);
    const timeDisplay = formatTimeForSpeech(slotTime);

    const htmlBody = buildConfirmationHTML(
      patientName,
      dateDisplay,
      timeDisplay,
      serviceName
    );

    const plainText = buildConfirmationText(
      patientName,
      dateDisplay,
      timeDisplay,
      serviceName
    );

    const mailOptions = {
      from: `"${clinic.name}" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
      to: patientDetails.email,
      subject: `Appointment Confirmation — ${clinic.name}`,
      text: plainText,
      html: htmlBody,
    };

    console.log(`[Email] Sending confirmation to ${patientDetails.email}`);

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Sent successfully. Message ID: ${info.messageId}`);

    return { success: true, message: "Confirmation email sent." };
  } catch (error) {
    console.error("[Email] Error sending confirmation:", error.message);
    return {
      success: false,
      message: `Failed to send confirmation email: ${error.message}`,
    };
  }
}

// ----------------------------------------------------------
// Build the HTML email body
// ----------------------------------------------------------
function buildConfirmationHTML(patientName, dateDisplay, timeDisplay, serviceName) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appointment Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-colour: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background-color: #2c5f7c; padding: 30px 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">${clinic.name}</h1>
              <p style="color: #b8d4e3; margin: 8px 0 0; font-size: 14px;">Appointment Confirmation</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="color: #333; font-size: 16px; margin: 0 0 20px;">Dear ${patientName},</p>

              <p style="color: #333; font-size: 16px; margin: 0 0 25px;">
                Your appointment has been confirmed. Here are your booking details:
              </p>

              <!-- Appointment Details Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f0f7fb; border-radius: 8px; border-left: 4px solid #2c5f7c; margin: 0 0 25px;">
                <tr>
                  <td style="padding: 20px 25px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding: 6px 0; color: #666; font-size: 14px; width: 100px;">Service:</td>
                        <td style="padding: 6px 0; color: #333; font-size: 14px; font-weight: 600;">${serviceName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #666; font-size: 14px;">Date:</td>
                        <td style="padding: 6px 0; color: #333; font-size: 14px; font-weight: 600;">${dateDisplay}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #666; font-size: 14px;">Time:</td>
                        <td style="padding: 6px 0; color: #333; font-size: 14px; font-weight: 600;">${timeDisplay}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #666; font-size: 14px;">Location:</td>
                        <td style="padding: 6px 0; color: #333; font-size: 14px; font-weight: 600;">${clinic.address}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Parking Info -->
              <p style="color: #333; font-size: 14px; margin: 0 0 8px; font-weight: 600;">Parking Information:</p>
              <p style="color: #666; font-size: 14px; margin: 0 0 25px;">${clinic.parking}</p>

              <!-- Cancellation Notice -->
              <p style="color: #333; font-size: 14px; margin: 0 0 8px; font-weight: 600;">Need to cancel or reschedule?</p>
              <p style="color: #666; font-size: 14px; margin: 0 0 25px;">
                Please call us on <strong>${clinic.phone}</strong> at least 24 hours before your appointment.
              </p>

              <p style="color: #333; font-size: 16px; margin: 0;">
                We look forward to seeing you!
              </p>
              <p style="color: #333; font-size: 16px; margin: 10px 0 0;">
                Warm regards,<br>
                <strong>The ${clinic.name} Team</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9f9f9; padding: 20px 40px; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0 0 8px; text-align: center;">
                ${clinic.name} | ${clinic.address} | ${clinic.phone}
              </p>
              <p style="color: #999; font-size: 11px; margin: 0; text-align: center;">
                This email was sent because an appointment was booked at ${clinic.name}.
                Your personal data is processed in accordance with our privacy policy and UK GDPR regulations.
                If you did not request this appointment, please contact us immediately on ${clinic.phone}.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ----------------------------------------------------------
// Build a plain-text fallback for the email
// ----------------------------------------------------------
function buildConfirmationText(patientName, dateDisplay, timeDisplay, serviceName) {
  return `APPOINTMENT CONFIRMATION — ${clinic.name}

Dear ${patientName},

Your appointment has been confirmed. Here are your booking details:

Service: ${serviceName}
Date: ${dateDisplay}
Time: ${timeDisplay}
Location: ${clinic.address}

Parking Information:
${clinic.parking}

Need to cancel or reschedule?
Please call us on ${clinic.phone} at least 24 hours before your appointment.

We look forward to seeing you!

Warm regards,
The ${clinic.name} Team

---
${clinic.name} | ${clinic.address} | ${clinic.phone}
This email was sent because an appointment was booked at ${clinic.name}. Your personal data is processed in accordance with our privacy policy and UK GDPR regulations. If you did not request this appointment, please contact us immediately on ${clinic.phone}.`;
}

module.exports = {
  sendBookingConfirmation,
};
