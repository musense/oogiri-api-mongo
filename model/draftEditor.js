const mongoose = require("mongoose");

const draftEditorSchema = mongoose.Schema(
  {
    serialNumber: {
      type: Number,
      trim: true,
      unique: true,
      required: true,
      default: 0,
    },
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
      unique: true,
    },
    content: {
      type: Array,
      trim: true,
    },
    htmlContent: {
      type: String,
      trim: true,
    },
    categories: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "categories",
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
    tags: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "tags",
        trim: true,
      },
    ],
    topSorting: {
      type: Number,
      trim: true,
    },
    hidden: {
      type: Boolean,
      default: false,
    },
    recommendSorting: {
      type: Number,
      trim: true,
    },
    popularSorting: {
      type: Number,
      trim: true,
    },
    homeImagePath: {
      type: String,
      trim: true,
    },
    contentImagePath: {
      type: String,
      trim: true,
    },
    scheduledAt: {
      type: Date,
    },
    draft: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      trim: true,
      default: "草稿",
    },
  },
  {
    timestamps: true,
  }
);

const draftEditor = mongoose.model("draftEditor", draftEditorSchema);

module.exports = draftEditor;
