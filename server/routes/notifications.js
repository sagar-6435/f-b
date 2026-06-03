const express    = require('express');
const router     = express.Router();
const User       = require('../models/User');
const { getAdmin } = require('../firebase');

/**
 * Send a push notification via Firebase Admin SDK (FCM HTTP v1).
 *
 * @param {string} fcmToken  - Device FCM token stored on the user document
 * @param {string} title     - Notification title
 * @param {string} body      - Notification body text
 */
async function sendFcmNotification(fcmToken, title, body) {
  if (!fcmToken) return null;

  const admin = getAdmin();
  if (!admin) {
    console.warn('Firebase Admin not initialized — skipping push notification');
    return null;
  }

  const message = {
    token: fcmToken,
    notification: { title, body },
    android: {
      priority: 'high',
      notification: {
        channelId: 'default',
        sound: 'default',
      },
    },
    apns: {
      payload: {
        aps: { sound: 'default' },
      },
    },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('FCM message sent:', response);
    return response;
  } catch (err) {
    console.error('FCM send error:', err.message);
    return null;
  }
}

// ── POST /notifications/send  (admin → single user) ──────────────────────────
// Body: { userId, title, body }
router.post('/send', async (req, res) => {
  try {
    const { userId, title, body } = req.body;
    if (!userId || !title || !body) {
      return res.status(400).json({ error: 'userId, title, and body are required.' });
    }

    const user = await User.findById(userId).lean();
    if (!user)          return res.status(404).json({ error: 'User not found.' });
    if (!user.fcmToken) return res.status(422).json({ error: 'User has no FCM token registered.' });

    const result = await sendFcmNotification(user.fcmToken, title, body);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /notifications/broadcast  (admin → all customers) ───────────────────
// Body: { title, body, role? }  role defaults to 'customer'
router.post('/broadcast', async (req, res) => {
  try {
    const { title, body, role = 'customer' } = req.body;
    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required.' });
    }

    // Fetch all users with an FCM token for the given role
    const users = await User.find({ role, fcmToken: { $ne: null, $exists: true } })
      .select('_id fcmToken displayName')
      .lean();

    if (users.length === 0) {
      return res.json({ ok: true, sent: 0, failed: 0, message: 'No users with FCM tokens found.' });
    }

    let sent = 0;
    let failed = 0;

    // Send in parallel (batched to avoid flooding)
    const BATCH = 20;
    for (let i = 0; i < users.length; i += BATCH) {
      const batch = users.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (u) => {
          const result = await sendFcmNotification(u.fcmToken, title, body);
          if (result) sent++; else failed++;
        }),
      );
    }

    console.log(`Broadcast sent: ${sent} success, ${failed} failed`);
    res.json({ ok: true, sent, failed, total: users.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, sendFcmNotification };
