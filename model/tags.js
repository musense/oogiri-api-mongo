const mongoose = require("mongoose");
// const Log = require("./changeLog.js");
// function validatorGTZ(value) {
//   return value >= 0;
// }
// const many = [
//   { validator: validatorGTZ, msg: "TaggedNumber at least should be zero!" },
//   { validator: Number.isInteger, msg: "TaggedNumber is not an integer!" },
// ];
const tagsSchema = mongoose.Schema(
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
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    originalUrl: {
      type: String,
      trim: true,
    },
    manualUrl: {
      type: String,
      trim: true,
    },
    sorting: {
      type: Number,
      trim: true,
    },
    pageView: {
      type: Number,
      trim: true,
      default: 0,
    },
    popular: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// tagsSchema.pre("save", async function (next) {
//   // `this` is the Tag document
//   if (this.isModified()) {
//     // The document has been modified, we need to log the changes
//     const changes = [];
//     const originalDoc = await this.constructor.findOne(this._id);
//     for (let changedField in this._doc) {
//       if (this.isModified(changedField)) {
//         changes.push({
//           field: changedField,
//           oldValue: originalDoc ? originalDoc[changedField] : null,
//           newValue: this._doc[changedField],
//           changedAt: new Date(),
//         });
//       }
//     }

//     // Save the changes to another collection
//     const log = new Log({
//       documentId: this._id,
//       type: "tag",
//       version: this.__v,
//       changes: changes,
//     });
//     log.save();
//   }

//   next();
// });

const Tag = mongoose.model("tags", tagsSchema);

module.exports = Tag;
