const mongoose = require("mongoose");

const editorSchema = mongoose.Schema(
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
    categories: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "categories",
      trim: true,
    },
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
    tags: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "tags",
        trim: true,
      },
    ],
    pageView: {
      type: Number,
      trim: true,
      default: 0,
    },
    hidden: {
      type: Boolean,
      default: false,
    },
    topSorting: {
      type: Number,
      trim: true,
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
    publishedAt: {
      type: Date,
    },
    draft: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);
const checkStatus = function (next) {
  const now = new Date();
  if (this.draft) {
    this.status = "草稿";
  } else if (
    !this.draft &&
    this.hidden &&
    this.scheduledAt &&
    this.scheduledAt > now
  ) {
    this.status = "已排程";
  } else if (
    !this.draft &&
    this.hidden &&
    (!this.scheduledAt || this.scheduledAt <= now)
  ) {
    this.status = "隱藏文章";
    if (!this.publishedAt) {
      this.publishedAt = now;
    }
  } else if (
    !this.draft &&
    !this.hidden &&
    (!this.scheduledAt || this.scheduledAt <= now)
  ) {
    this.status = "已發布";
    if (!this.publishedAt) {
      this.publishedAt = now;
    }
  }
  next();
};

editorSchema.pre("save", checkStatus);

const Editor = mongoose.model("editor", editorSchema);

module.exports = Editor;
