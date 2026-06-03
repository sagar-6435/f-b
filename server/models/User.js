const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    title:     { type: String, required: true },
    price:     { type: Number, required: true },
    image:     { type: String, default: '' },
    quantity:  { type: Number, required: true, min: 1 },
    totalPrice:{ type: Number, required: true },
  },
  { timestamps: true },
);

const orderSchema = new mongoose.Schema(
  {
    items:       { type: [cartItemSchema], required: true },
    totalAmount: { type: Number, required: true },
    status:      { type: String, default: 'Placed' },
  },
  { timestamps: true },
);

const userSchema = new mongoose.Schema(
  {
    _id:                  { type: String }, // phone digits, e.g. "918897536435"
    phoneNumber:          { type: String, required: true },
    displayName:          { type: String, default: 'Fresh Basket User' },
    role:                 { type: String, enum: ['customer', 'admin', 'supplier', 'delivery'], default: 'customer' },
    isSeeded:             { type: Boolean, default: false },
    address:              { type: String, default: '' },
    addressLine:          { type: String, default: '' },
    city:                 { type: String, default: '' },
    pincode:              { type: String, default: '' },
    fcmToken:             { type: String, default: null },
    notificationPlatform: { type: String, default: null },
    notificationUpdatedAt:{ type: Date,   default: null },
    // Delivery partner online status
    isOnline:             { type: Boolean, default: false },
    currentLocation:      {
      latitude:  { type: Number, default: null },
      longitude: { type: Number, default: null },
      updatedAt: { type: Date,   default: null },
    },
    // Customer's saved delivery location (GPS coords + address text)
    savedLocation: {
      latitude:  { type: Number, default: null },
      longitude: { type: Number, default: null },
      address:   { type: String, default: '' },
    },
    cartItems:            { type: [cartItemSchema], default: [] },
    orders:               { type: [orderSchema],   default: [] },
  },
  { timestamps: true, _id: false },
);

module.exports = mongoose.model('User', userSchema);
