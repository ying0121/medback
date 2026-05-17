const logger = require("../utils/logger");
require("dotenv").config();
const { initializeDatabase } = require("./index");

initializeDatabase()
  .then(() => {
    logger.info("Database synchronized with Sequelize.");
    process.exit(0);
  })
  .catch((err) => {
    logger.error(`Database sync failed: ${err.message}`);
    process.exit(1);
  });
