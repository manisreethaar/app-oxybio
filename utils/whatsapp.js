/**
 * WhatsApp notifications via Twilio.
 *
 * SETUP (one-time):
 * 1. Create a free Twilio account at https://www.twilio.com/try-twilio
 * 2. Go to Messaging → Try it out → Send a WhatsApp message (sandbox)
 *    OR apply for a WhatsApp Business number for production use
 * 3. Add these env vars in Vercel dashboard (Settings → Environment Variables):
 *    TWILIO_ACCOUNT_SID   — from Twilio Console homepage
 *    TWILIO_AUTH_TOKEN    — from Twilio Console homepage
 *    TWILIO_WHATSAPP_FROM — Twilio sandbox: "whatsapp:+14155238886"
 *                           Production: "whatsapp:+91XXXXXXXXXX" (your approved number)
 * 4. Run this SQL to add phone to employee profiles:
 *    ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone TEXT;
 * 5. Each employee must save their WhatsApp number in their profile (with country code, e.g. 9198XXXXXXXX)
 *
 * INDIAN BSP ALTERNATIVES (cheaper for production):
 * - Interakt (interakt.ai) — popular in India, template-based, affordable
 * - WATI (wati.io) — simple dashboard, good API
 * - AiSensy (aisensy.com) — affordable Indian pricing
 * These replace Twilio but use the same Meta WhatsApp Business API underneath.
 */

/**
 * Send a WhatsApp message to a phone number.
 * Silently no-ops if TWILIO env vars are not configured.
 * @param {string} to - Phone number with country code digits only (e.g. "919876543210")
 * @param {string} message - Text message body
 */
export async function sendWhatsApp(to, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const from       = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !from || !to) return;

  // Normalize: strip non-digits, auto-prepend +91 for Indian numbers without country code
  const digits = to.replace(/\D/g, '');
  const e164   = digits.startsWith('91') && digits.length >= 12 ? `+${digits}` : `+91${digits}`;

  try {
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: from,
          To: `whatsapp:${e164}`,
          Body: message,
        }).toString(),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[whatsapp] send error:', err.message || res.status);
    }
  } catch (err) {
    console.error('[whatsapp] fetch error:', err.message);
  }
}
