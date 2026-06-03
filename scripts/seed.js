/**
 * Seed script — populates MongoDB Atlas with the sample user and product catalog.
 *
 * Usage:
 *   1. Make sure the server is configured: server/.env has MONGODB_URI set
 *   2. cd server && npm install
 *   3. cd .. && node scripts/seed.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../server/.env') });
const mongoose = require(require('path').join(__dirname, '../server/node_modules/mongoose'));

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌  MONGODB_URI not found. Make sure backend/.env exists with MONGODB_URI set.');
  process.exit(1);
}

// ── Inline schemas (mirrors backend/models) ───────────────────────────────────

const cartItemSchema = new mongoose.Schema(
  { productId: String, title: String, price: Number, image: String, quantity: Number, totalPrice: Number },
  { timestamps: true },
);

const orderSchema = new mongoose.Schema(
  { items: [cartItemSchema], totalAmount: Number, status: { type: String, default: 'Placed' } },
  { timestamps: true },
);

const userSchema = new mongoose.Schema(
  {
    _id:         { type: String },
    phoneNumber: String,
    displayName: String,
    role:        String,
    isSeeded:    Boolean,
    cartItems:   { type: [cartItemSchema], default: [] },
    orders:      { type: [orderSchema],   default: [] },
  },
  { timestamps: true, _id: false },
);

const productSchema = new mongoose.Schema(
  { _id: String, title: String, price: Number, rating: Number, tag: String, image: String, description: String },
  { timestamps: true, _id: false },
);

const User    = mongoose.model('User',    userSchema);
const Product = mongoose.model('Product', productSchema);

// ── Seed data ─────────────────────────────────────────────────────────────────

const SEED_USER = {
  _id:         '918897536435',
  phoneNumber: '+918897536435',
  displayName: 'Sagar',
  role:        'customer',
  isSeeded:    true,
};

const SEED_DELIVERY_BOYS = [
  {
    _id:         '919876543212',
    phoneNumber: '+919876543212',
    displayName: 'Ravi Kumar',
    role:        'delivery',
    isSeeded:    true,
    isOnline:    false,
  },
  {
    _id:         '919876543210',
    phoneNumber: '+919876543210',
    displayName: 'Arjun Singh',
    role:        'delivery',
    isSeeded:    true,
    isOnline:    false,
  },
];

const SEED_PRODUCTS = [
  { _id: '1', title: 'Premium Multi-Grain Dosa Batter', price: 145, rating: 4.9, tag: 'Bestseller', image: 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=800', description: 'Freshly prepared and naturally fermented for authentic taste.' },
  { _id: '2', title: 'Classic Idly Batter',             price: 85,  rating: 4.8, image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=800', description: 'Soft, fluffy idly batter made fresh every morning.' },
  { _id: '3', title: 'Spiced Vada Mix',                 price: 110, rating: 4.7, tag: 'Fresh Today', image: 'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?w=800', description: 'Crisp vada mix with balanced spices and fresh ingredients.' },
  { _id: '4', title: 'Fresh Coconut Chutney',           price: 60,  rating: 4.9, image: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=800', description: 'Creamy coconut chutney packed and delivered chilled.' },
  { _id: '5', title: 'Instant Rava Mix',                price: 125, rating: 4.6, image: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800', description: 'Quick rava mix for breakfasts that still taste homemade.' },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱  Connecting to MongoDB Atlas...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅  Connected\n');

  // Seed customer (upsert)
  console.log(`👤  Upserting customer ${SEED_USER._id} (${SEED_USER.phoneNumber})...`);
  await User.findByIdAndUpdate(SEED_USER._id, SEED_USER, { upsert: true, new: true });
  console.log('    ✓ Customer seeded\n');

  // Seed delivery boys (upsert each)
  console.log('🚴  Upserting delivery boys...');
  for (const db of SEED_DELIVERY_BOYS) {
    await User.findByIdAndUpdate(db._id, db, { upsert: true, new: true });
    console.log(`    ✓ ${db.displayName} (${db.phoneNumber})`);
  }
  console.log('');

  // Seed products (upsert each)
  console.log('🛒  Upserting products...');
  for (const product of SEED_PRODUCTS) {
    await Product.findByIdAndUpdate(product._id, product, { upsert: true, new: true });
    console.log(`    ✓ ${product._id}: ${product.title}`);
  }

  console.log('\n✅  Seeding complete.');
  console.log('\nCustomer  → +91 88975 36435');
  console.log('Delivery  → +91 98765 43212  (Ravi Kumar)');
  console.log('Delivery  → +91 98765 43210  (Arjun Singh)');
}

main()
  .catch((err) => { console.error('❌  Seed failed:', err.message); process.exit(1); })
  .finally(() => mongoose.disconnect());
