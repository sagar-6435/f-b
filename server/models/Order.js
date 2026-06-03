const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId:  { type: String, required: true },
  title:      { type: String, required: true },
  price:      { type: Number, required: true },
  image:      { type: String, default: '' },
  quantity:   { type: Number, required: true },
  totalPrice: { type: Number, required: true },
});

const locationSchema = new mongoose.Schema({
  latitude:  { type: Number, required: true },
  longitude: { type: Number, required: true },
  address:   { type: String, default: '' },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  customerId:       { type: String, required: true, index: true }, // phone digits
  customerPhone:    { type: String, required: true },
  customerName:     { type: String, default: '' },
  deliveryAddress:  { type: String, default: '' },
  items:            { type: [orderItemSchema], required: true },
  totalAmount:      { type: Number, required: true },

  // Status flow: Placed → Confirmed → Preparing → Ready → Assigned → OutForDelivery → Delivered
  // Or: Placed → Cancelled
  status: {
    type: String,
    enum: ['Placed', 'Confirmed', 'Preparing', 'Ready', 'Assigned', 'OutForDelivery', 'Delivered', 'Cancelled'],
    default: 'Placed',
  },

  // Delivery partner
  deliveryPartnerId:   { type: String, default: null }, // phone digits
  deliveryPartnerName: { type: String, default: null },

  // Customer location at time of order (for nearby delivery partner matching)
  customerLocation: { type: locationSchema, default: null },

  // Timestamps for each status change
  confirmedAt:      { type: Date, default: null },
  assignedAt:       { type: Date, default: null },
  deliveredAt:      { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
