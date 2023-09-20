const mongoose = require("mongoose");

const logSchema = mongoose.Schema(
  {
    httpMethod: {
      type: String,
      trim: true,
    },
    path: {
      type: String,
      trim: true,
    },
    documentId: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      trim: true,
    },
    version: {
      type: String,
      trim: true,
    },
    userName: {
      type: String,
      trim: true,
    },
    changes: [
      {
        // _id: false,
        field: String,
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed,
        changedAt: Date,
      },
    ],
    newDocument: mongoose.Schema.Types.Mixed,
    deletedDocument: [mongoose.Schema.Types.Mixed],
  },
  {
    timestamps: true,
  }
);
const Log = mongoose.model("logs", logSchema);

module.exports = Log;
