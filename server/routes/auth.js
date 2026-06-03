const express = require('express');
const router  = express.Router();
const twilio  = require('twilio');
const crypto  = require('crypto');
const Otp     = require('../models/Otp');

const client       = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM_NUMBER  = process.env.TWILIO_PHONE_NUMBER;
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/** Generate a secure 6-digit OTP */
function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

// ── POST /auth/send-otp ───────────────────────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  const { phone } = req.body;

  if (!phone || !/^\+\d{10,15}$/.test(phone)) {
    return res.status(400).json({ error: 'Invalid phone number. Must be in E.164 format e.g. +919876543210' });
  }

  try {
    const code      = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    // Delete any existing OTP for this phone before creating a new one
    await Otp.deleteMany({ phone });
    await Otp.create({ phone, code, expiresAt });

    // Try to send via Twilio — on trial accounts, unverified numbers will fail.
    // The OTP is still saved and valid; SMS delivery is best-effort.
    try {
      await client.messages.create({
        body: `Your Fresh Basket OTP is ${code}. Valid for 10 minutes. Do not share this code.`,
        from: FROM_NUMBER,
        to:   phone,
      });
    } catch (twilioErr) {
      console.error('send-otp Twilio error:', twilioErr.message);
      // On trial accounts: log the OTP so it can be used manually for testing
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DEV] OTP for ${phone}: ${code}`);
      }
      // Don't fail the request — OTP is saved, SMS just couldn't be delivered
    }

    res.json({ success: true, message: 'OTP sent successfully.' });
  } catch (err) {
    console.error('send-otp error:', err.message);
    res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

// ── POST /auth/verify-otp ─────────────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  const { phone, code } = req.body;

  if (!phone || !code) {
    return res.status(400).json({ error: 'phone and code are required.' });
  }

  try {
    const record = await Otp.findOne({ phone }).sort({ expiresAt: -1 });

    if (!record) {
      return res.status(400).json({ error: 'No OTP found for this number. Please request a new one.' });
    }

    if (new Date() > record.expiresAt) {
      await Otp.deleteMany({ phone });
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    // Constant-time comparison to prevent timing attacks
    const expected = Buffer.from(record.code);
    const received = Buffer.from(String(code).padEnd(record.code.length));
    const match    = expected.length === received.length &&
                     crypto.timingSafeEqual(expected, received);

    if (!match) {
      return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
    }

    // OTP is valid — delete it so it can't be reused
    await Otp.deleteMany({ phone });

    res.json({ success: true, message: 'OTP verified successfully.' });
  } catch (err) {
    console.error('verify-otp error:', err.message);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

module.exports = router;
