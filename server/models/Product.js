const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    _id:         { type: String },   // "1", "2", … keeps parity with old Firestore IDs
    title:       { type: String, required: true },
    price:       { type: Number, required: true },
    rating:      { type: Number, default: 0 },
    tag:         { type: String, default: null },
    image:       { type: String, default: '' },
    description: { type: String, default: '' },
  },
  { timestamps: true, _id: false },
);

module.exports = mongoose.model('Product', productSchema);
