const express = require('express');
const router  = express.Router();
const User    = require('../models/User');

/**
 * Send a push notification to a user via FCM HTTP v1.
 *
 * Requires env:
 *   FCM_SERVER_KEY — your Firebase Cloud Messaging server key
 *                    (Project settings → Cloud Messaging → Server key)
 */

async function sendFcmNotification(fcmToken, title, body) {
  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey) {
    console.warn('FCM_SERVER_KEY not set — skipping push notification');
    return null;
  }
  if (!fcmToken) return null;

  const payload = {
    to: fcmToken,
    notification: { title, body, sound: 'default' },
    android: {
      notification: {
        channel_id: 'default',
        priority: 'high',
        sound: 'default',
      },
    },
    priority: 'high',
  };

  const res = await fetch('https://fcm.googleapis.com/fcm/send', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `key=${serverKey}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (data.failure) console.warn('FCM send failure:', JSON.stringify(data));
  return data;
}

// ── POST /notifications/send  (admin manual send) ─────────────────────────────
// Body: { userId, title, body }
router.post('/send', async (req, res) => {
  try {
    const { userId, title, body } = req.body;
    if (!userId || !title || !body) {
      return res.status(400).json({ error: 'userId, title, and body are required.' });
    }

    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (!user.fcmToken) return res.status(422).json({ error: 'User has no FCM token registered.' });

    const result = await sendFcmNotification(user.fcmToken, title, body);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /notifications/order-status  (called internally on order status change) ─
// Body: { customerId, orderId, status }
router.post('/order-status', async (req, res) => {
  try {
    const { customerId, orderId, status } = req.body;

    const MESSAGES = {
      OutForDelivery: {
        title: '🚴 Out for Delivery!',
        body:  `Your order #${String(orderId).slice(-6).toUpperCase()} is on the way. Stay ready!`,
      },
      Delivered: {
        title: '✅ Order Delivered!',
        body:  `Your order #${String(orderId).slice(-6).toUpperCase()} has been delivered. Enjoy!`,
      },
      Confirmed: {
        title: '👍 Order Confirmed',
        body:  `Your order #${String(orderId).slice(-6).toUpperCase()} has been confirmed.`,
      },
    };

    const msg = MESSAGES[status];
    if (!msg) return res.json({ ok: true, skipped: true });

    const user = await User.findById(customerId).lean();
    if (!user?.fcmToken) return res.json({ ok: true, skipped: true, reason: 'no token' });

    const result = await sendFcmNotification(user.fcmToken, msg.title, msg.body);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, sendFcmNotification };
