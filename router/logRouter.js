const express = require("express");
const logRouter = new express.Router();
const fs = require("fs");
const path = require("path");
const Log = require("../model/changeLog");
require("dotenv").config();

const DBLOG_FILE_PATH = process.env.DBLOG_FILE_PATH;

logRouter.delete("/logs/archive-and-delete-logs", async (req, res) => {
  try {
    const someTimeAgo = new Date();
    // someTimeAgo.setMonth(someTimeAgo.getMonth() - 1);
    someTimeAgo.setDate(someTimeAgo.getDate() - 1);
    // someTimeAgo.setTime(someTimeAgo.getTime() - 1 * 60 * 60 * 1000);

    // Find logs older than one month
    const oldLogs = await Log.find({ createdAt: { $lt: someTimeAgo } });
    if (oldLogs.length === 0) {
      res.json({ message: "No data need to write" });
    } else if (oldLogs.length > 0) {
      // Write logs to a file
      const timestamp = new Date(Date.now())
        .toISOString()
        .replace(/[^a-zA-Z0-9]/g, "-");
      const filePath = path.join(DBLOG_FILE_PATH, `oldLogs_${timestamp}.json`);
      fs.writeFileSync(filePath, JSON.stringify(oldLogs, null, 2));

      // Delete logs from the database
      await Log.deleteMany({ createdAt: { $lt: someTimeAgo } });

      res.json({ message: "Archived and deleted logs successfully" });
    }
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

module.exports = logRouter;
