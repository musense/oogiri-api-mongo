const mongoose = require("mongoose");

const ipSchema = mongoose.Schema(
  {
    sourceIp: {
      type: String,
      trim: true,
    },
    relatedId: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const Ips = mongoose.model("Ips", ipSchema);

module.exports = Ips;
