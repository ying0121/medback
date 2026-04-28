const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
const chatRoutes = require("./routes/chatRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");
const adminAuthRoutes = require("./routes/adminAuthRoutes");
const adminDashboardRoutes = require("./routes/adminDashboardRoutes");
const adminKnowledgeRoutes = require("./routes/adminKnowledgeRoutes");
const twilioRoutes = require("./routes/twilioRoutes");
const errorHandler = require("./middlewares/errorHandler");

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        // Allow blob: URLs so the audio player can play Blob-URL audio
        "media-src": ["'self'", "blob:", "data:"],
        // Allow inline scripts/styles needed by Vite-built SPA
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        // Allow data: images (user photos stored as base64)
        "img-src": ["'self'", "data:", "blob:"],
        // Allow blob: worker scripts used by some audio libs
        "worker-src": ["'self'", "blob:"],
      },
    },
  })
);
app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (no Origin header) and dynamically allow browser origins.
      if (!origin) return callback(null, true);
      return callback(null, origin);
    },
    credentials: true
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(morgan("dev"));

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/chat", chatRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminUserRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/admin/knowledge", adminKnowledgeRoutes);
app.use("/api/twilio", twilioRoutes);

const adminDistPath = path.resolve(__dirname, "../admin-frontend/dist");
const adminIndexPath = path.join(adminDistPath, "index.html");
const hasAdminBuild = fs.existsSync(adminIndexPath);
const adminRouteMatcher = /^\/admin(?:\/.*)?$/;

if (hasAdminBuild) {
  const faviconPath = path.join(adminDistPath, "favicon.svg");
  app.get("/favicon.svg", (req, res, next) => {
    if (fs.existsSync(faviconPath)) return res.sendFile(faviconPath);
    return next();
  });

  app.get(/^\/admin\/?$/, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.sendFile(adminIndexPath);
  });

  app.use("/admin", express.static(adminDistPath));
  app.get(adminRouteMatcher, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.sendFile(adminIndexPath);
  });
} else {
  app.get(adminRouteMatcher, (req, res) => {
    res.status(503).json({
      error: "Admin frontend build not found. Build admin-frontend first."
    });
  });
}

app.use(errorHandler);

module.exports = app;
