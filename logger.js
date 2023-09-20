const fs = require("fs");
const path = require("path");

const logFilePath = path.join(__dirname, "api_logs.txt");

function logRequest(user, method, path) {
  const logMessage = `[${new Date().toISOString()}] User: ${user}, Method: ${method}, Path: ${path}\n`;
  fs.appendFileSync(logFilePath, logMessage);
}

module.exports = logRequest;
