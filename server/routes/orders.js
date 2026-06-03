const express = require('express');
const router  = express.Router();
const Order   = require('../models/Order');
const User    = require('../models/User');
const { sendFcmNotification } = require('./notifications');

// ── POST /orders  (place order) ───────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { customerId, customerLocation } = req.body;
    if (!customerId) return res.status(400).json({ error: 'customerId is required.' });

    const user = await User.findById(customerId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (!user.cartItems.length) return res.status(400).json({ error: 'Cart is empty.' });

    const totalAmount = user.cartItems.reduce(
      (sum, i) => sum + Number(i.totalPrice ?? i.price ?? 0), 0,
    );

    const order = await Order.create({
      customerId,
      customerPhone:   user.phoneNumber,
      customerName:    user.displayName ?? '',
      deliveryAddress: user.address ?? '',
      items:           user.cartItems.toObject(),
      totalAmount,
      status:          'Placed',
      customerLocation: customerLocation ?? null,
    });

    // Clear cart
    user.cartItems = [];
    await user.save();

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /orders  (all orders — admin) ────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, customerId, deliveryPartnerId } = req.query;
    const filter = {};
    if (status)            filter.status = status;
    if (customerId)        filter.customerId = customerId;
    if (deliveryPartnerId) filter.deliveryPartnerId = deliveryPartnerId;

    const orders = await Order.find(filter).sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /orders/nearby  (delivery partner — orders near a location) ───────────
// Query: lat, lng, radiusKm (default 10)
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radiusKm = 10 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required.' });

    const latitude  = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radius    = parseFloat(radiusKm);

    // Fetch unassigned placed orders that have a customer location
    const candidates = await Order.find({
      status: 'Placed',
      'customerLocation.latitude':  { $exists: true },
      'customerLocation.longitude': { $exists: true },
    }).lean();

    // Haversine distance filter in JS (avoids needing a geo index)
    const nearby = candidates.filter((order) => {
      const d = haversineKm(
        latitude, longitude,
        order.customerLocation.latitude,
        order.customerLocation.longitude,
      );
      return d <= radius;
    });

    res.json(nearby);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /orders/:id ───────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /orders/:id/status  (update status) ────────────────────────────────
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, deliveryPartnerId, deliveryPartnerName } = req.body;

    const allowed = ['Placed','Confirmed','Preparing','Ready','Assigned','OutForDelivery','Delivered','Cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${allowed.join(', ')}` });
    }

    const update = { status };
    if (status === 'Confirmed')      update.confirmedAt = new Date();
    if (status === 'Assigned') {
      update.assignedAt          = new Date();
      update.deliveryPartnerId   = deliveryPartnerId ?? null;
      update.deliveryPartnerName = deliveryPartnerName ?? null;
    }
    if (status === 'Delivered')      update.deliveredAt = new Date();

    const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    // Auto-send push notification to customer on key status changes
    const NOTIFY_STATUSES = {
      Confirmed:      { title: '👍 Order Confirmed',     body: `Your order #${String(order._id).slice(-6).toUpperCase()} has been confirmed and is being prepared.` },
      OutForDelivery: { title: '🚴 Out for Delivery!',   body: `Your order #${String(order._id).slice(-6).toUpperCase()} is on the way. Stay ready!` },
      Delivered:      { title: '✅ Order Delivered!',    body: `Your order #${String(order._id).slice(-6).toUpperCase()} has been delivered. Enjoy!` },
      Cancelled:      { title: '❌ Order Cancelled',     body: `Your order #${String(order._id).slice(-6).toUpperCase()} has been cancelled.` },
    };

    const msg = NOTIFY_STATUSES[status];
    if (msg && order.customerId) {
      User.findById(order.customerId).lean().then((customer) => {
        if (customer?.fcmToken) {
          sendFcmNotification(customer.fcmToken, msg.title, msg.body).catch(() => {});
        }
      }).catch(() => {});
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Haversine formula ─────────────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a    = Math.sin(dLat / 2) ** 2 +
               Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function toRad(deg) { return deg * (Math.PI / 180); }

module.exports = router;
