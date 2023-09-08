const mongoose = require("mongoose");
const bannerSchema = mongoose.Schema(
  {
    serialNumber: {
      type: Number,
      trim: true,
      unique: true,
      required: true,
    },
    name: {
      type: String,
      trim: true,
      unique: true,
      required: true,
    },
    sort: {
      type: Number,
      trim: true,
      unique: true,
      required: true,
    },
    hyperlink: {
      type: String,
      trim: true,
    },
    remark: {
      type: String,
      trim: true,
    },
    eternal: {
      type: Boolean,
      default: false,
    },
    display: {
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
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    status: {
      type: String,
      trim: true,
      enum: ["已排程", "進行中", "下架"],
    },
  },
  {
    timestamps: true,
  }
);

bannerSchema.path("display").validate(function (value) {
  const now = new Date();

  // 如果display為true，檢查當前日期是否在startDate和endDate之間
  if (value === true) {
    if (now >= this.startDate && now < this.endDate) {
      return true;
    } else {
      return false;
    }
  }
  return true;
}, "Current date is not between startDate and endDate");
/*
已排程: now < statDate
下架: now > endDate || display =false
進行中: startDate <= now < endDate && display = true

display: 假設為true的話需要檢查now實否在statDate與endDate之間
*/
const checkStatus = function (next) {
  const now = new Date();
  if (this.startDate > now) {
    this.status = "已排程";
  } else if (
    this.startDate <= now &&
    now < this.endDate &&
    this.display === true
  ) {
    this.status = "進行中";
  } else if (
    now > this.endDate ||
    (this.startDate <= now && this.display === false)
  ) {
    this.status = "下架";
  }
  next();
};

bannerSchema.pre("save", checkStatus);

const Banner = mongoose.model("banner", bannerSchema);

module.exports = Banner;
