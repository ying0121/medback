const logger = require("../utils/logger");

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";

  logger.error(err);

  res.status(statusCode).json({ error: message });
}

module.exports = errorHandler;
