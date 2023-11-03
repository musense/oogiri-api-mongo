const mongoose = require("mongoose");

const editorLinkSchema = mongoose.Schema(
  {
    url: {
      type: String,
      trim: true,
      required: true,
    },
    pingStatus: {
      type: String,
      trim: true,
    },
    // 用以區分網址檢查時間, 避免與其他資料異動時混淆
    checkStatusUpdatedAt: {
      type: Date,
    },
    axiosStatusCode: {
      type: Number,
      trim: true,
    },
    axiosMessage: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const editorLink = mongoose.model("editorLink", editorLinkSchema);

module.exports = editorLink;
