const express = require('express');
const router  = express.Router();
const Stock   = require('../models/Stock');
const Product = require('../models/Product');

// ── GET /stock  (all stock levels) ───────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    // Ensure every product has a stock entry
    const products = await Product.find().lean();
    for (const p of products) {
      await Stock.findOneAndUpdate(
        { productId: p._id },
        { $setOnInsert: { productId: p._id, productTitle: p.title, quantity: 0 } },
        { upsert: true, new: true },
      );
    }

    const stock = await Stock.find().lean().sort({ productId: 1 });
    res.json(stock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /stock  (admin creates a new stock entry for a new product) ──────────
// Expects: { productId, productTitle, quantity, unit, minThreshold }
router.post('/', async (req, res) => {
  try {
    const { productId, productTitle, quantity = 0, unit = 'packs', minThreshold = 10 } = req.body;
    if (!productId)    return res.status(400).json({ error: 'productId is required.' });
    if (!productTitle) return res.status(400).json({ error: 'productTitle is required.' });

    const existing = await Stock.findOne({ productId });
    if (existing) return res.status(409).json({ error: 'Stock entry for this product already exists.' });

    const stock = await Stock.create({
      productId,
      productTitle,
      quantity:     Number(quantity),
      unit,
      minThreshold: Number(minThreshold),
    });
    res.status(201).json(stock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /stock/:productId  (update quantity) ────────────────────────────────
router.patch('/:productId', async (req, res) => {
  try {
    const { quantity, supplierId } = req.body;

    if (quantity === undefined || isNaN(Number(quantity))) {
      return res.status(400).json({ error: 'quantity (number) is required.' });
    }

    const update = {
      quantity:        Number(quantity),
      lastRestockedAt: new Date(),
    };
    if (supplierId) update.supplierId = supplierId;

    const stock = await Stock.findOneAndUpdate(
      { productId: req.params.productId },
      { $set: update },
      { new: true, upsert: true },
    );

    res.json(stock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /stock/:productId/add  (add to existing quantity) ────────────────────
router.post('/:productId/add', async (req, res) => {
  try {
    const { amount, supplierId } = req.body;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'amount (positive number) is required.' });
    }

    const stock = await Stock.findOneAndUpdate(
      { productId: req.params.productId },
      {
        $inc: { quantity: Number(amount) },
        $set: { lastRestockedAt: new Date(), ...(supplierId ? { supplierId } : {}) },
      },
      { new: true, upsert: true },
    );

    res.json(stock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
