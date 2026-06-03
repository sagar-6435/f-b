const express = require('express');
const router  = express.Router();
const User    = require('../models/User');

// ── GET /users/check/:phone  (existence check — never 404) ───────────────────
router.get('/check/:phone', async (req, res) => {
  try {
    const user = await User.findById(req.params.phone).lean();
    res.json({ exists: Boolean(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /users  (list — filter by role) ──────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    const users = await User.find(filter)
      .select('-cartItems -orders')   // keep payload small
      .lean()
      .sort({ createdAt: -1 });
    res.json(users.map((u) => ({ id: u._id, ...u })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /users  (create — admin adds delivery boy / supplier) ────────────────
router.post('/', async (req, res) => {
  try {
    const { phoneNumber, displayName, role } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber is required.' });

    const digits = phoneNumber.replace(/\D/g, '');
    const existing = await User.findById(digits).lean();
    if (existing) return res.status(409).json({ error: 'A user with this phone number already exists.' });

    const user = await User.create({
      _id:         digits,
      phoneNumber,
      displayName: displayName ?? 'New User',
      role:        role ?? 'delivery',
    });
    res.status(201).json({ id: user._id, ...user.toObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /users/:id/online  (delivery partner go online / offline) ───────────
router.patch('/:id/online', async (req, res) => {
  try {
    const { isOnline, latitude, longitude } = req.body;

    const update = {
      isOnline: Boolean(isOnline),
    };

    if (isOnline && latitude != null && longitude != null) {
      update['currentLocation.latitude']  = latitude;
      update['currentLocation.longitude'] = longitude;
      update['currentLocation.updatedAt'] = new Date();
    }

    if (!isOnline) {
      update['currentLocation.latitude']  = null;
      update['currentLocation.longitude'] = null;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        $set: update,
        $setOnInsert: {
          _id:         req.params.id,
          phoneNumber: `+${req.params.id}`,
          displayName: 'Delivery Partner',
          role:        'delivery',
        },
      },
      { new: true, upsert: true, lean: true },
    );
    res.json({ id: user._id, isOnline: user.isOnline, currentLocation: user.currentLocation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /users/:id ────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user._id, ...user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /users/:id  (upsert) ──────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, upsert: true, runValidators: true, lean: true },
    );
    res.json({ id: user._id, ...user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /users/:id  (partial update — role, displayName, etc.) ──────────────
router.patch('/:id', async (req, res) => {
  try {
    // Prevent overwriting online-status fields via this route
    const { isOnline, currentLocation, ...safe } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: safe },
      { new: true, runValidators: true, lean: true },
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ id: user._id, ...user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /users/:id ─────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /users/:id/cart ───────────────────────────────────────────────────────
router.get('/:id/cart', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.json([]);
    const items = (user.cartItems ?? []).sort((a, b) => Number(a.productId) - Number(b.productId));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /users/:id/cart  (add / increment) ───────────────────────────────────
router.post('/:id/cart', async (req, res) => {
  try {
    const { productId, title, price, image, quantity = 1 } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const existing = user.cartItems.find((i) => i.productId === String(productId));
    if (existing) {
      existing.quantity  += quantity;
      existing.totalPrice = existing.price * existing.quantity;
    } else {
      user.cartItems.push({
        productId: String(productId),
        title,
        price: Number(price),
        image: image ?? '',
        quantity,
        totalPrice: Number(price) * quantity,
      });
    }

    await user.save();
    res.json(user.cartItems);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /users/:id/cart/:productId ─────────────────────────────────────────
router.delete('/:id/cart/:productId', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, {
      $pull: { cartItems: { productId: req.params.productId } },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /users/:id/cart  (clear) ──────────────────────────────────────────
router.delete('/:id/cart', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { $set: { cartItems: [] } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /users/:id/orders ─────────────────────────────────────────────────────
router.get('/:id/orders', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.json([]);
    const orders = (user.orders ?? [])
      .map((o) => ({ id: o._id, ...o }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /users/:id/orders  (checkout) ───────────────────────────────────────
router.post('/:id/orders', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.cartItems.length) {
      return res.status(400).json({ error: 'Cart is empty.' });
    }

    const totalAmount = user.cartItems.reduce((sum, i) => sum + Number(i.totalPrice ?? i.price ?? 0), 0);
    const order = { items: user.cartItems.toObject(), totalAmount, status: 'Placed' };

    user.orders.push(order);
    user.cartItems = [];
    await user.save();

    const placed = user.orders[user.orders.length - 1];
    res.json({ id: placed._id, ...placed.toObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// ── PATCH /users/:id/online  (delivery partner go online / offline) ───────────
router.patch('/:id/online', async (req, res) => {
  try {
    const { isOnline, latitude, longitude } = req.body;

    const update = {
      isOnline: Boolean(isOnline),
    };

    if (isOnline && latitude != null && longitude != null) {
      update['currentLocation.latitude']  = latitude;
      update['currentLocation.longitude'] = longitude;
      update['currentLocation.updatedAt'] = new Date();
    }

    if (!isOnline) {
      update['currentLocation.latitude']  = null;
      update['currentLocation.longitude'] = null;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        $set: update,
        $setOnInsert: {
          _id:         req.params.id,
          phoneNumber: `+${req.params.id}`,
          displayName: 'Delivery Partner',
          role:        'delivery',
        },
      },
      { new: true, upsert: true, lean: true },
    );
    res.json({ id: user._id, isOnline: user.isOnline, currentLocation: user.currentLocation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /users/:id ────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user._id, ...user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /users/:id  (upsert) ──────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, upsert: true, runValidators: true, lean: true },
    );
    res.json({ id: user._id, ...user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /users/:id/cart ───────────────────────────────────────────────────────
router.get('/:id/cart', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.json([]);
    const items = (user.cartItems ?? []).sort((a, b) => Number(a.productId) - Number(b.productId));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /users/:id/cart  (add / increment) ───────────────────────────────────
router.post('/:id/cart', async (req, res) => {
  try {
    const { productId, title, price, image, quantity = 1 } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const existing = user.cartItems.find((i) => i.productId === String(productId));
    if (existing) {
      existing.quantity  += quantity;
      existing.totalPrice = existing.price * existing.quantity;
    } else {
      user.cartItems.push({
        productId: String(productId),
        title,
        price: Number(price),
        image: image ?? '',
        quantity,
        totalPrice: Number(price) * quantity,
      });
    }

    await user.save();
    res.json(user.cartItems);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /users/:id/cart/:productId ─────────────────────────────────────────
router.delete('/:id/cart/:productId', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, {
      $pull: { cartItems: { productId: req.params.productId } },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /users/:id/cart  (clear) ──────────────────────────────────────────
router.delete('/:id/cart', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { $set: { cartItems: [] } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /users/:id/orders ─────────────────────────────────────────────────────
router.get('/:id/orders', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.json([]);
    const orders = (user.orders ?? [])
      .map((o) => ({ id: o._id, ...o }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /users/:id/orders  (checkout) ───────────────────────────────────────
router.post('/:id/orders', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.cartItems.length) {
      return res.status(400).json({ error: 'Cart is empty.' });
    }

    const totalAmount = user.cartItems.reduce((sum, i) => sum + Number(i.totalPrice ?? i.price ?? 0), 0);
    const order = { items: user.cartItems.toObject(), totalAmount, status: 'Placed' };

    user.orders.push(order);
    user.cartItems = [];
    await user.save();

    const placed = user.orders[user.orders.length - 1];
    res.json({ id: placed._id, ...placed.toObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
