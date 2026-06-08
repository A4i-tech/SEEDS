"use strict";
const logger = require("./logger");
const LogEntry = require("./models/LogEntry");

module.exports.tryCatchWrapper = (f) => {
  return async function (req, res) {
    try {
      return await f.apply(this, arguments);
    } catch (error) {
      logger.error("Unhandled route error", error);
      return res.status(400).json({ message: error.message });
    }
  };
};

module.exports.tryCatchWrapperLog = (f) => {
  return async function (req, res, next) {
    try {
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        res.json = originalJson;
        res.json(body);

        const logEntry = new LogEntry({
          path: req.originalUrl,
          method: req.method,
          requestBody: req.body,
          responseBody: body,
          statusCode: res.statusCode,
          timestamp: new Date(),
        });
        logEntry.save().catch((err) => logger.error("Log could not be saved", err));
      };

      await f(req, res, next);
    } catch (error) {
      logger.error("Unhandled route error", error);
      const logEntry = new LogEntry({
        path: req.originalUrl,
        method: req.method,
        requestBody: req.body,
        responseBody: { message: error.message },
        statusCode: 400,
        timestamp: new Date(),
      });
      logEntry.save().catch((err) => logger.error("Log could not be saved", err));

      res.status(400).json({ message: error.message });
    }
  };
};
