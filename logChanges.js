// logChanges.js
const Logs = require("./model/changeLog.js");

async function logChanges(
  method,
  path,
  document,
  Model,
  type,
  userName,
  originalDoc = null
) {
  if (method === "POST") {
    const log = new Logs({
      httpMethod: method,
      path: path,
      documentId: document._id,
      type: type,
      version: document.__v,
      userName: userName,
      newDocument: document,
    });
    await log.save();
  } else if (method === "PATCH") {
    // The document has been modified, we need to log the changes
    if (originalDoc) {
      originalDoc = await Model.findOne(document._id);
    }
    const changes = [];
    for (let changedField in document._doc) {
      if (changedField !== "_id" && document.isModified(changedField)) {
        changes.push({
          field: changedField,
          oldValue: originalDoc ? originalDoc[changedField] : null,
          newValue: document._doc[changedField],
          changedAt: new Date(),
        });
      }
    }

    // Save the changes to another collection
    const log = new Logs({
      httpMethod: method,
      path: path,
      documentId: document._id,
      type: type,
      version: document.__v,
      userName: userName,
      changes: changes,
    });
    // console.log(userName);
    await log.save();
  } else if (method === "DELETE") {
    const log = new Logs({
      httpMethod: method,
      path: path,
      type: type,
      version: document.__v,
      userName: userName,
      deletedDocument: document, // Save the deleted document here
    });
    await log.save();
  }
}

module.exports = logChanges;
