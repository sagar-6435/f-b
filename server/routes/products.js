const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

const SEED_PRODUCTS = [
  {
    _id: '1',
    title: 'Premium Multi-Grain Dosa Batter',
    price: 145,
    rating: 4.9,
    tag: 'Bestseller',
    image: 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=800',
    description: 'Freshly prepared and naturally fermented for authentic taste.',
  },
  {
    _id: '2',
    title: 'Classic Idly Batter',
    price: 85,
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=800',
    description: 'Soft, fluffy idly batter made fresh every morning.',
  },
  {
    _id: '3',
    title: 'Spiced Vada Mix',
    price: 110,
    rating: 4.7,
    tag: 'Fresh Today',
    image: 'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?w=800',
    description: 'Crisp vada mix with balanced spices and fresh ingredients.',
  },
  {
    _id: '4',
    title: 'Fresh Coconut Chutney',
    price: 60,
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=800',
    description: 'Creamy coconut chutney packed and delivered chilled.',
  },
  {
    _id: '5',
    title: 'Instant Rava Mix',
    price: 125,
    rating: 4.6,
    image: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800',
    description: 'Quick rava mix for breakfasts that still taste homemade.',
  },
];

// Seed catalog on first request if collection is empty
async function ensureSeedCatalog() {
  const count = await Product.countDocuments();

  if (count === 0) {
    await Product.insertMany(SEED_PRODUCTS);
  }
}

// GET /products
router.get('/', async (req, res) => {
  try {
    await ensureSeedCatalog();
    const products = await Product.find().lean().sort({ _id: 1 });

    res.json(products.map((p) => ({ id: p._id, ...p })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /products/search?q=text
router.get('/search', async (req, res) => {
  try {
    await ensureSeedCatalog();

    const q = (req.query.q ?? '').trim();
    const filter = q
      ? { title: { $regex: q, $options: 'i' } }
      : {};

    const products = await Product.find(filter).lean().sort({ _id: 1 });

    res.json(products.map((p) => ({ id: p._id, ...p })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /products (admin creates a new product)
router.post('/', async (req, res) => {
  try {
    const { title, price, description, tag, image, unit } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ error: 'title is required.' });
    }

    if (price === undefined || isNaN(Number(price))) {
      return res.status(400).json({ error: 'price (number) is required.' });
    }

    const all = await Product.find().lean().sort({ _id: -1 }).limit(1);
    const lastId = all.length ? parseInt(all[0]._id, 10) : 0;
    const newId = String(isNaN(lastId) ? Date.now() : lastId + 1);

    const product = await Product.create({
      _id: newId,
      title: title.trim(),
      price: Number(price),
      description: description?.trim() ?? '',
      tag: tag?.trim() || null,
      image: image?.trim() ?? '',
      rating: 0,
    });

    res.status(201).json({
      id: product._id,
      ...product.toObject(),
      unit: unit ?? 'packs',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /products/:id
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ id: product._id, ...product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;