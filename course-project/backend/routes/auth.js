const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const prisma = require("../prisma/client");
const { v4: uuidv4 } = require("uuid");
const nodemailer = require("nodemailer");

const issueToken = (user) => {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
  return { token, expiresAt };
};

router.post("/tokens", async (req, res) => {
  const { utorid, password } = req.body || {};
  if (!utorid || !password)
    return res.status(400).json({ error: "Missing utorid or password" });

  const user = await prisma.user.findUnique({ where: { utorid } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  const { token, expiresAt } = issueToken(user);
  res.status(200).json({ token, expiresAt });
});

const ipTimestamps = new Map();

router.post("/resets", async (req, res) => {
  const { utorid, email } = req.body || {};
  if (!utorid || !email) {
    return res.status(400).json({ error: "Missing utorid or email" });
  }

  const user = await prisma.user.findUnique({ where: { utorid } });
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.email !== email)
    return res.status(400).json({ error: "Email does not match utorid" });

  const ip =
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  const key = `${ip}|${utorid}`;
  const now = Date.now();
  const last = ipTimestamps.get(key) || 0;
  if (now - last < 60_000)
    return res.status(429).json({ error: "Too Many Requests" });

  const resetToken = uuidv4();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.resetToken.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.resetToken.create({
      data: {
        token: resetToken,
        type: "password",
        userId: user.id,
        expiresAt,
        consumedAt: null,
      },
    }),
  ]);

  ipTimestamps.set(key, now);
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "cssurewards123@gmail.com",
        pass: "tuvs bzrx alqv xxkh",
      },
    });

    const mailBody = {
      from: "cssurewards123@gmail.com",
      to: user.email,
      subject: "CSSU Rewards - Password Reset Token",
      html: `
        <h2>Password Reset Request</h2>
        <p>Hello ${user.name},</p>
        <p>You have requested to reset your password for your CSSU Rewards account.</p>
        <p>Your reset token is: <strong>${resetToken}</strong></p>
        <p>This token will expire at: ${new Date(
          expiresAt
        ).toLocaleString()}</p>
      `,
    };

    await transporter.sendMail(mailBody);
  } catch (err) {
    console.error(err);
  }

  return res.status(202).json({ expiresAt, resetToken });
});

router.post("/resets/:resetToken", async (req, res) => {
  const { resetToken } = req.params;
  const { utorid, password } = req.body || {};
  if (!utorid || !password)
    return res.status(400).json({ error: "Missing fields" });

  const policy =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,20}$/;
  if (!policy.test(password))
    return res.status(400).json({ error: "Weak password" });

  const tokenRow = await prisma.resetToken.findUnique({
    where: { token: resetToken },
  });
  if (!tokenRow)
    return res.status(404).json({ error: "Reset token not found" });

  if (tokenRow.consumedAt || tokenRow.expiresAt <= new Date()) {
    return res.status(410).json({ error: "Reset token expired" });
  }

  const user = await prisma.user.findUnique({ where: { id: tokenRow.userId } });
  if (!user || user.utorid !== utorid)
    return res.status(401).json({ error: "Unauthorized" });

  const hash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: hash },
    }),
    prisma.resetToken.update({
      where: { token: resetToken },
      data: { consumedAt: new Date() },
    }),
  ]);

  return res.status(200).json({ ok: true });
});

module.exports = router;
