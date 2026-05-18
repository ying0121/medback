require("dotenv").config();
const { initializeDatabase } = require("./index");

initializeDatabase()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log("Database synchronized with Sequelize.");
    process.exit(0);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Database sync failed:", err.message);
    process.exit(1);
  });
