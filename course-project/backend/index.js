v#!/usr/bin/env node
'use strict';

const express = require("express");
const { expressjwt: jwtMiddleware } = require("express-jwt");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, ".env") });

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

app.use((err, req, res, next) => {
  if (err.name === "UnauthorizedError") {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.status(500).json({ error: "Internal server error" });
});

const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
server.on("error", (err) => {
  console.error(`cannot start server: ${err.message}`);
  process.exit(1);
});
