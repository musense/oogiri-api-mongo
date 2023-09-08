const mongoose = require("mongoose");

const tempEditorSchema = mongoose.Schema(
  {
    headTitle: {
      type: String,
      trim: true,
    },
    headKeyword: {
      type: String,
      trim: true,
    },
    headDescription: {
      type: String,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
      required: true,
    },
    content: {
      type: Array,
      trim: true,
      required: true,
    },
    htmlContent: {
      type: String,
      trim: true,
      required: true,
    },
    categories: [{ name: { type: String, trim: true } }],
    originalUrl: {
      type: String,
      trim: true,
    },
    manualUrl: {
      type: String,
      trim: true,
    },
    altText: {
      type: String,
      trim: true,
    },
    tags: [{ name: { type: String, trim: true } }],
    hidden: {
      type: Boolean,
      default: false,
    },
    homeImagePath: {
      type: String,
      trim: true,
    },
    contentImagePath: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const tempEditor = mongoose.model("tempEditor", tempEditorSchema);

module.exports = tempEditor;
