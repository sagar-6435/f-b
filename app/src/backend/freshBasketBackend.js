import { api } from '../api/client';

// ── Users ─────────────────────────────────────────────────────────────────────

export async function checkUserExists(phoneNumber) {
  const digits = phoneNumber.replace(/\D/g, '');
  const result = await api.get(`/users/check/${digits}`);
  return result.exists;
}

/** Fetch all users with a given role — 'delivery' | 'supplier' | 'admin' | 'customer' */
export async function fetchUsersByRole(role) {
  return api.get(`/users?role=${encodeURIComponent(role)}`);
}

/** Create a new delivery boy or supplier (admin only) */
export async function createUser({ phoneNumber, displayName, role }) {
  return api.post('/users', { phoneNumber, displayName, role });
}

/** Update a user's name or role */
export async function updateUser(userId, updates) {
  return api.patch(`/users/${userId}`, updates);
}

/** Delete a user by id (phone digits) */
export async function deleteUser(userId) {
  return api.delete(`/users/${userId}`);
}

/** Set delivery partner online/offline status with current location */
export async function setOnlineStatus(userId, isOnline, location = null) {
  return api.patch(`/users/${userId}/online`, {
    isOnline,
    latitude:  location?.latitude  ?? null,
    longitude: location?.longitude ?? null,
  });
}

// ── Products ──────────────────────────────────────────────────────────────────

export async function fetchProducts() {
  return api.get('/products');
}

export async function fetchProductById(productId) {
  try { return await api.get(`/products/${productId}`); }
  catch { return null; }
}

export async function searchProducts(searchText) {
  const q = searchText?.trim() ?? '';
  return api.get(`/products/search?q=${encodeURIComponent(q)}`);
}

// ── Cart ──────────────────────────────────────────────────────────────────────

export async function fetchCartItems(userId) {
  if (!userId) return [];
  return api.get(`/users/${userId}/cart`);
}

export async function addToCart(userId, product, quantity = 1) {
  if (!userId) throw new Error('Login required to add items to cart.');
  return api.post(`/users/${userId}/cart`, {
    productId: String(product.id),
    title:     product.title,
    price:     Number(product.price),
    image:     product.image ?? '',
    quantity,
  });
}

export async function updateCartQuantity(userId, productId, quantity) {
  if (!userId) return;
  if (quantity <= 0) return removeFromCart(userId, productId);
  // Remove then re-add with exact quantity
  await api.delete(`/users/${userId}/cart/${productId}`);
  return api.post(`/users/${userId}/cart`, { productId: String(productId), quantity });
}

export async function removeFromCart(userId, productId) {
  if (!userId) return;
  return api.delete(`/users/${userId}/cart/${productId}`);
}

export async function clearCart(userId) {
  if (!userId) return;
  return api.delete(`/users/${userId}/cart`);
}

// ── Orders ────────────────────────────────────────────────────────────────────

/** Place a new order. customerLocation = { latitude, longitude, address } */
export async function placeOrder(customerId, customerLocation = null) {
  if (!customerId) throw new Error('Login required to place an order.');
  return api.post('/orders', { customerId, customerLocation });
}

export async function fetchOrders(customerId) {
  if (!customerId) return [];
  return api.get(`/orders?customerId=${customerId}`);
}

export async function fetchAllOrders(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return api.get(`/orders${params ? `?${params}` : ''}`);
}

export async function fetchNearbyOrders(lat, lng, radiusKm = 10) {
  return api.get(`/orders/nearby?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`);
}

export async function updateOrderStatus(orderId, status, extra = {}) {
  return api.patch(`/orders/${orderId}/status`, { status, ...extra });
}

// ── Stock ─────────────────────────────────────────────────────────────────────

export async function fetchStock() {
  return api.get('/stock');
}

export async function addStock(productId, amount, supplierId) {
  return api.post(`/stock/${productId}/add`, { amount, supplierId });
}

export async function setStock(productId, quantity, supplierId) {
  return api.patch(`/stock/${productId}`, { quantity, supplierId });
}

/**
 * Admin: create a brand-new product + its stock entry in one call.
 * { title, price, description, tag, unit, quantity, minThreshold }
 */
export async function createProductWithStock({ title, price, description, tag, unit, quantity, minThreshold }) {
  // 1. Create the product
  const product = await api.post('/products', { title, price, description, tag, unit });
  // 2. Create a stock entry tied to the new product
  await api.post('/stock', {
    productId:    product.id,
    productTitle: product.title,
    quantity:     Number(quantity ?? 0),
    unit:         unit ?? 'packs',
    minThreshold: Number(minThreshold ?? 10),
  });
  return product;
}

// ── Notifications ─────────────────────────────────────────────────────────────

/** Admin: send a manual push notification to a user */
export async function sendNotificationToUser(userId, title, body) {
  return api.post('/notifications/send', { userId, title, body });
}
