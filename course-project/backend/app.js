"use strict";

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const { expressjwt: jwtMiddleware } = require("express-jwt");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const eventsRoutes = require("./routes/events");
const transactionsRoutes = require("./routes/transactions");
const promotionsRoutes = require("./routes/promotions");
const aiRoutes = require("./routes/ai");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/auth", authRoutes);

const authGuard = jwtMiddleware({
  secret: process.env.JWT_SECRET,
  algorithms: ["HS256"],
});

app.use("/users", authGuard, userRoutes);
app.use("/events", authGuard, eventsRoutes);
app.use("/transactions", authGuard, transactionsRoutes);
app.use("/promotions", authGuard, promotionsRoutes);
app.use("/ai", authGuard, aiRoutes);

// Support /api/* for Vercel functions and local dev.
app.use("/api/auth", authRoutes);
app.use("/api/users", authGuard, userRoutes);
app.use("/api/events", authGuard, eventsRoutes);
app.use("/api/transactions", authGuard, transactionsRoutes);
app.use("/api/promotions", authGuard, promotionsRoutes);
app.use("/api/ai", authGuard, aiRoutes);

app.use((err, req, res, next) => {
  if (err.name === "UnauthorizedError") {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
