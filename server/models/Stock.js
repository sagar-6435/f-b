const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema({
  productId:   { type: String, required: true, unique: true, index: true },
  productTitle:{ type: String, required: true },
  quantity:    { type: Number, required: true, default: 0, min: 0 },
  unit:        { type: String, default: 'kg' }, // kg, litres, packs, etc.
  minThreshold:{ type: Number, default: 10 },   // alert when below this
  supplierId:  { type: String, default: null },  // phone digits of supplier
  lastRestockedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Stock', stockSchema);
