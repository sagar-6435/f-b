require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');

const usersRouter    = require('./routes/users');
const productsRouter = require('./routes/products');
const authRouter     = require('./routes/auth');
const ordersRouter   = require('./routes/orders');
const stockRouter    = require('./routes/stock');
const { router: notificationsRouter } = require('./routes/notifications');

const app  = express();
const PORT = process.env.PORT ?? 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/users',         usersRouter);
app.use('/products',      productsRouter);
app.use('/auth',          authRouter);
app.use('/orders',        ordersRouter);
app.use('/stock',         stockRouter);
app.use('/notifications', notificationsRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── MongoDB connection ────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌  MONGODB_URI is not set. Copy server/.env.example to server/.env and fill it in.');
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✅  Connected to MongoDB Atlas');

    // Eagerly initialize Firebase Admin so we can confirm it in startup logs
    const { getAdmin } = require('./firebase');
    getAdmin();

    app.listen(PORT, () => {
      console.log(`🚀  FreshBasket API running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌  MongoDB connection failed:', err.message);
    process.exit(1);
  });
