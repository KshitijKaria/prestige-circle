const express = require("express");
const router = express.Router();
const prisma = require("../prisma/client");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const multer = require("multer");

function formatDateYYYYMMDD(d) {
  if (!d) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


router.get("/me", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!["regular", "cashier", "manager", "superuser"].includes(role))
      return res.status(403).json({ error: "Forbidden" });

    const userId = req.auth.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        utorid: true,
        name: true,
        email: true,
        birthday: true,
        role: true,
        points: true,
        createdAt: true,
        lastLogin: true,
        verified: true,
        avatarUrl: true,
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    const now = new Date();
    const promotions = await prisma.promotion.findMany({
      where: {
        startTime: { lte: now },
        endTime: { gte: now },
      },
      select: {
        id: true,
        name: true,
        minSpending: true,
        rate: true,
        points: true,
      },
    });

    const userOut = {
      ...user,
      birthday: user.birthday ? formatDateYYYYMMDD(user.birthday) : null,
    };
    res.status(200).json({ ...userOut, promotions });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }const recipientId = Number(req.params.userId);
});

router.patch("/me", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!["regular", "cashier", "manager", "superuser"].includes(role))
      return res.status(403).json({ error: "Forbidden" });

    const { name, email, birthday } = req.body;

    const updates = {};

    if (name !== undefined && name !== null) {
      if (typeof name !== "string" || name.length < 1 || name.length > 50) {
        return res.status(400).json({ error: "Invalid name length" });
      }
      updates.name = name;
    }

    if (email !== undefined && email !== null) {
      if (typeof email !== "string") {
        return res.status(400).json({ error: "Invalid UofT email" });
      }
      const uoftPattern = /^[A-Za-z0-9._%+-]+@mail\.utoronto\.ca$/;
      if (!uoftPattern.test(email)) {
        return res.status(400).json({ error: "Invalid UofT email" });
      }
      updates.email = email;
    }

    if (birthday !== undefined) {
      if (birthday === null) {
        return res.status(400).json({ error: "Invalid birthday format" });
      }
      if (typeof birthday !== "string") {
        return res.status(400).json({ error: "Invalid birthday format" });
      }
      const s = birthday.trim();
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (!m) {
        return res.status(400).json({ error: "Invalid birthday format" });
      }
      const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (
        dt.getUTCFullYear() !== y ||
        dt.getUTCMonth() !== (mo - 1) ||
        dt.getUTCDate() !== d
      ) {
        return res.status(400).json({ error: "Invalid birthday format" });
      }
      updates.birthday = dt;
    }


    if (Object.keys(updates).length === 0)
      return res.status(400).json({ error: "No valid fields provided" });

    const updatedUser = await prisma.user.update({
      where: { id: req.auth.id },
      data: updates,
      select: {
        id: true,
        utorid: true,
        name: true,
        email: true,
        birthday: true,
        role: true,
        points: true,
        createdAt: true,
        lastLogin: true,
        verified: true,
        avatarUrl: true,
      },
    });
    const updatedOut = {
      ...updatedUser,
      birthday: updatedUser.birthday ? formatDateYYYYMMDD(updatedUser.birthday) : null,
    };

    res.status(200).json(updatedOut);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/me/password", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!["regular", "cashier", "manager", "superuser"].includes(role))
      return res.status(403).json({ error: "Forbidden" });

    const userId = req.auth.id;
    const { old, new: newPassword } = req.body;

    if (!old || !newPassword)
      return res.status(400).json({ error: "Missing required fields" });

    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,20}$/;

    if (!passwordRegex.test(newPassword))
      return res.status(400).json({
        error:
          "Password must be 8–20 characters long, include uppercase, lowercase, number, and special character",
      });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    const validOld = await bcrypt.compare(old, user.password);
    if (!validOld)
      return res.status(403).json({ error: "Incorrect current password" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!["cashier", "manager", "superuser"].includes(role))
      return res.status(403).json({ error: "Forbidden" });

    const { utorid, email, name } = req.body;
    if (!utorid || !email || !name)
      return res.status(400).json({ error: "Missing required fields" });

    if (!/^[A-Za-z0-9]{7,8}$/.test(utorid))
      return res.status(400).json({ error: "Invalid utorid format" });

    if (name.length < 1 || name.length > 50)
      return res.status(400).json({ error: "Invalid name length" });

    if (!/^[^@]+@mail\.utoronto\.ca$/.test(email))
      return res.status(400).json({ error: "Invalid email format" });

    const existing = await prisma.user.findFirst({
      where: { OR: [{ utorid }, { email }] },
    });
    if (existing) return res.status(409).json({ error: "User already exists" });

    const resetToken = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const tempPassword = uuidv4().slice(0, 8);
    const hashed = await bcrypt.hash(tempPassword, 10);

    const user = await prisma.user.create({
      data: {
        utorid,
        email,
        name,
        password: hashed,
        role: "regular",
        verified: false,
      },
      select: {
        id: true,
        utorid: true,
        name: true,
        email: true,
        verified: true,
      },
    });

    await prisma.$transaction([
      prisma.resetToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      prisma.resetToken.create({
        data: {
          token: resetToken,
          type: "activation",
          userId: user.id,
          expiresAt,
        },
      }),
    ]);

    res.status(201).json({ ...user, expiresAt, resetToken });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!["manager", "superuser"].includes(role))
      return res.status(403).json({ error: "Forbidden" });

    const {
      name,
      role: filterRole,
      verified,
      activated,
      page = 1,
      limit = 10,
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1)
      return res.status(400).json({ error: "Invalid pagination parameters" });

    const filters = {};
    if (name)
      filters.OR = [
        { name: { contains: name } },
        { utorid: { contains: name } },
      ];
    if (filterRole) filters.role = filterRole;

    if (verified === 'true') {
      filters.verified = true;
    } else if (verified === 'false') {
      filters.verified = false;
    }

    if (activated === 'true') {
      filters.lastLogin = { not: null };
    } else if (activated === 'false') {
      filters.lastLogin = null;
    }

    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const [count, results] = await Promise.all([
      prisma.user.count({ where: filters }),
      prisma.user.findMany({
        where: filters,
        skip,
        take,
        orderBy: { id: "asc" },
        select: {
          id: true,
          utorid: true,
          name: true,
          email: true,
          role: true,
          points: true,
          createdAt: true,
          lastLogin: true,
          verified: true,
        },
      }),
    ]);

    res.json({ count, results });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:userId", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!["cashier", "manager", "superuser"].includes(role))
      return res.status(403).json({ error: "Forbidden" });

    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select:
        role === "cashier"
          ? {
              id: true,
              utorid: true,
              name: true,
              points: true,
              verified: true,
            }
          : {
              id: true,
              utorid: true,
              name: true,
              email: true,
              birthday: true,
              role: true,
              points: true,
              createdAt: true,
              lastLogin: true,
              verified: true,
              avatarUrl: true,
            },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    const now = new Date();
    const promotions = await prisma.promotion.findMany({
      where: {
        type: "onetime",
        startTime: { lte: now },
        endTime: { gte: now },
      },
      select: {
        id: true,
        name: true,
        minSpending: true,
        rate: true,
        points: true,
      },
    });

    const userShow = user.birthday
      ? { ...user, birthday: formatDateYYYYMMDD(user.birthday) }
      : user;
    res.status(200).json({ ...userShow, promotions });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:userId", async (req, res) => {
  try {
    const authRole = req.auth?.role;
    if (!["manager", "superuser"].includes(authRole))
      return res.status(403).json({ error: "Forbidden" });

    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });

    const { email, verified, suspicious, role } = req.body;
    const roleNorm = typeof role === "string" ? role.trim() : role;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const updates = {};

    if (typeof roleNorm === "string" && roleNorm.length > 0) {
      const allRoles = ["regular", "cashier", "manager", "superuser"];
      if (!allRoles.includes(roleNorm)) return res.status(400).json({ error: "Invalid role" });

      const validRolesForManager = ["cashier", "regular"];
      const validRolesForSuperuser = ["regular", "cashier", "manager", "superuser"];
      if (
        (authRole === "manager" && !validRolesForManager.includes(roleNorm)) ||
        (authRole === "superuser" && !validRolesForSuperuser.includes(roleNorm))
      ) {
        return res.status(403).json({ error: "Forbidden role update" });
      }
      if (roleNorm === "cashier" && user.suspicious) {
        return res.status(403).json({ error: "Suspicious users cannot be promoted to cashier" });
      }
      updates.role = roleNorm;
    }

    if (email) {
      const uoftPattern = /^[A-Za-z0-9._%+-]+@mail\.utoronto\.ca$/;
      if (!uoftPattern.test(email)) return res.status(400).json({ error: "Invalid UofT email" });
      updates.email = email;
    }

    if (verified !== undefined && verified !== null) {
      let v;
      if (typeof verified === "boolean") v = verified;
      else {
        const vv = String(verified).trim().toLowerCase();
        if (vv === "true") v = true;
        else if (vv === "false") v = false;
        else return res.status(400).json({ error: "Invalid verified value" });
      }
      if (v !== true) return res.status(400).json({ error: "Invalid verified value" });
      updates.verified = true;
    }

    if (suspicious !== undefined && suspicious !== null) {
      let s;
      if (typeof suspicious === "boolean") s = suspicious;
      else {
        const sv = String(suspicious).trim().toLowerCase();
        if (sv === "true") s = true;
        else if (sv === "false") s = false;
        else return res.status(400).json({ error: "Invalid suspicious value" });
      }
      updates.suspicious = s;
    }

    if (Object.keys(updates).length === 0)
      return res.status(400).json({ error: "No valid fields provided" });

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updates,
      select: {
        id: true,
        utorid: true,
        name: true,
        email: true,
        role: true,
        verified: true,
        suspicious: true,
      },
    });

    const filteredResponse = Object.fromEntries(
      Object.entries(updatedUser).filter(([key]) =>
        ["id", "utorid", "name", ...Object.keys(updates)].includes(key)
      )
    );

    res.status(200).json(filteredResponse);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/me/transactions", async (req, res) => {
  try {
    const auth = req.auth || {};
    const role = auth.role;
    if (!["regular", "cashier", "manager", "superuser"].includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const rawUserId = auth.id;
    const userId = Number(rawUserId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { type, amount, remark } = req.body || {};
    if (type !== "redemption") {
      return res.status(400).json({ error: "Invalid transaction type" });
    }

    const amountNumber = Number(amount);
    if (!Number.isInteger(amountNumber) || amountNumber <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    let remarkText = "";
    if (remark !== undefined && remark !== null) {
      if (typeof remark !== "string") {
        return res.status(400).json({ error: "Invalid remark" });
      }
      remarkText = remark;
    }

    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, utorid: true, points: true, verified: true },
    });

    if (!user && typeof auth.utorid === "string" && auth.utorid.trim()) {
      user = await prisma.user.findUnique({
        where: { utorid: auth.utorid.trim() },
        select: { id: true, utorid: true, points: true, verified: true },
      });
    }

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (!user.verified) {
      return res.status(403).json({ error: "User must be verified" });
    }
    if (user.points < amountNumber) {
      return res.status(400).json({ error: "Insufficient points" });
    }

    const createdTx = await prisma.transaction.create({
      data: {
        type: "redemption",
        amount: -amountNumber,
        remark: remarkText,
        userId: user.id,
        createdById: user.id,
        eventId: null,
        processed: false,
      },
      select: { id: true },
    });

    const response = {
      id: createdTx.id,
      utorid: user.utorid,
      type: "redemption",
      amount: amountNumber,
      remark: remarkText,
      createdBy: user.utorid,
      processedBy: null,
    };

    return res.status(201).json(response);
  } catch (err) {
    console.error('[POST /users/me/transactions] 500 error', err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/me/transactions", async (req, res) => {
  try {
    const auth = req.auth || {};
    const role = auth.role;
    if (!["regular", "cashier", "manager", "superuser"].includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const userId = auth.id;
    if (!Number.isInteger(userId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const {
      type,
      relatedId,
      promotionId,
      amount,
      operator,
      page,
      limit,
    } = req.query || {};

    const filters = [{ userId }];

    if (type !== undefined) {
      if (typeof type !== "string" || !type.trim()) {
        return res.status(400).json({ error: "Invalid type" });
      }
      filters.push({ type: type.trim() });
    }

    if (relatedId !== undefined) {
      const relatedNumeric = Number(relatedId);
      if (!Number.isInteger(relatedNumeric) || relatedNumeric <= 0) {
        return res.status(400).json({ error: "Invalid relatedId" });
      }
      if (!type) {
        return res.status(400).json({ error: "type required with relatedId" });
      }
      filters.push({ eventId: relatedNumeric });
    }

    if (promotionId !== undefined) {
      const promoNumeric = Number(promotionId);
      if (!Number.isInteger(promoNumeric) || promoNumeric <= 0) {
        return res.status(400).json({ error: "Invalid promotionId" });
      }
      return res.status(200).json({ count: 0, results: [] });
    }

    if (amount !== undefined) {
      const amountNumeric = Number(amount);
      if (!Number.isFinite(amountNumeric)) {
        return res.status(400).json({ error: "Invalid amount" });
      }
      if (operator === "gte") {
        filters.push({ amount: { gte: amountNumeric } });
      } else if (operator === "lte") {
        filters.push({ amount: { lte: amountNumeric } });
      } else {
        return res.status(400).json({ error: "Invalid operator" });
      }
    } else if (operator !== undefined) {
      return res.status(400).json({ error: "Amount required with operator" });
    }

    const pageValue = page !== undefined ? Number(page) : 1;
    const limitValue = limit !== undefined ? Number(limit) : 10;
    if (!Number.isInteger(pageValue) || pageValue <= 0) {
      return res.status(400).json({ error: "Invalid page" });
    }
    if (!Number.isInteger(limitValue) || limitValue <= 0) {
      return res.status(400).json({ error: "Invalid limit" });
    }

    const where = { AND: filters };

    const [count, transactions] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        include: {
          createdBy: { select: { utorid: true } },
        },
        orderBy: { id: "desc" },
        skip: (pageValue - 1) * limitValue,
        take: limitValue,
      }),
    ]);

    const results = transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      spent: tx.type === "purchase" ? Number((tx.amount / 100).toFixed(2)) : undefined,
      amount: tx.amount,
      promotionIds: [],
      remark: tx.remark || "",
      createdBy: tx.createdBy?.utorid ?? null,
      relatedId: tx.eventId ?? null,
    }));

    return res.status(200).json({ count, results });
  } catch (err) {
    console.error('[GET /users/me/transactions] 500 error', err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:userId/transactions", async (req, res) => {
  try {
    const senderAuth = req.auth || {};
    const senderId = senderAuth.id;
    const senderRole = senderAuth.role;
    if (!["regular", "cashier", "manager", "superuser"].includes(senderRole)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const recipientId = Number(req.params.userId);
    if (!Number.isInteger(recipientId) || recipientId <= 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const { type, amount, remark } = req.body || {};
    if (type !== "transfer") {
      return res.status(400).json({ error: "Invalid transaction type" });
    }

    const amountNumber = Number(amount);
    if (!Number.isInteger(amountNumber) || amountNumber <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    let remarkText = "";
    if (remark !== undefined && remark !== null) {
      if (typeof remark !== "string") {
        return res.status(400).json({ error: "Invalid remark" });
      }
      remarkText = remark;
    }

    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { id: true, utorid: true, points: true, verified: true },
    });
    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, utorid: true },
    });

    if (!sender || !recipient) {
      return res.status(404).json({ error: "User not found" });
    }
    if (!sender.verified) {
      return res.status(403).json({ error: "Sender must be verified" });
    }
    if (sender.points < amountNumber) {
      return res.status(400).json({ error: "Insufficient points" });
    }

    const [senderTx] = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          type: "transfer",
          amount: -amountNumber,
          remark: remarkText,
          userId: sender.id,
          createdById: sender.id,
          eventId: null,
        },
      });

      await tx.transaction.create({
        data: {
          type: "transfer",
          amount: amountNumber,
          remark: remarkText,
          userId: recipient.id,
          createdById: sender.id,
          eventId: null,
        },
      });

      await tx.user.update({
        where: { id: sender.id },
        data: { points: { decrement: amountNumber } },
      });

      await tx.user.update({
        where: { id: recipient.id },
        data: { points: { increment: amountNumber } },
      });

      return [transaction];
    });

    return res.status(201).json({
      id: senderTx.id,
      sender: sender.utorid,
      recipient: recipient.utorid,
      type: "transfer",
      sent: amountNumber,
      remark: remarkText,
      createdBy: sender.utorid,
    });
  } catch (err) {
    console.error('[POST /users/:userId/transactions] 500 error', err);
    return res.status(500).json({ error: "Internal server error" });
  }
});



module.exports = router;
