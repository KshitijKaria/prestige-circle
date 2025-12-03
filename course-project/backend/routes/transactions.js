const express = require("express");
const router = express.Router();
const prisma = require("../prisma/client");

const isCashierOrHigher = (role) =>
  role === "cashier" || role === "manager" || role === "superuser";
const isManagerOrHigher = (role) => role === "manager" || role === "superuser";

const parseNumber = (value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
};

const parsePurchaseRemark = (remark) => {
  if (typeof remark !== "string") return null;
  try {
    const parsed = JSON.parse(remark);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.spentCents === "number" &&
      Number.isFinite(parsed.spentCents)
    ) {
      const promotionIds = Array.isArray(parsed.promotionIds)
        ? parsed.promotionIds.filter(
          (id) => Number.isInteger(id) && id > 0
        )
        : [];
      return {
        comment: typeof parsed.comment === "string" ? parsed.comment : "",
        spentCents: parsed.spentCents,
        promotionIds,
      };
    }
  } catch {
    return null;
  }
  return null;
};


router.post("/", async (req, res) => {
  try {
    const { type } = req.body || {};
    if (type === "purchase") {
      return handlePurchase(req, res);
    }
    if (type === "adjustment") {
      return handleAdjustment(req, res);
    }
    if (type === "redemption") {
      return handleRedemption(req, res);
    }
    return res.status(400).json({ error: "Invalid transaction type" });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

const handlePurchase = async (req, res) => {
  const auth = req.auth || {};
  const role = auth.role;
  if (!isCashierOrHigher(role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const createdById = auth.id;
  if (!Number.isInteger(createdById)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { utorid, spent, promotionIds, remark } = req.body || {};

  if (typeof utorid !== "string" || !utorid.trim()) {
    return res.status(400).json({ error: "Invalid utorid" });
  }

  const spentNumber = parseNumber(spent);
  if (!Number.isFinite(spentNumber) || spentNumber <= 0) {
    return res.status(400).json({ error: "Invalid spent amount" });
  }

  let remarkText = "";
  if (remark !== undefined && remark !== null) {
    if (typeof remark !== "string") {
      return res.status(400).json({ error: "Invalid remark" });
    }
    remarkText = remark;
  }

  let promoIds = [];
  if (promotionIds !== undefined) {
    if (!Array.isArray(promotionIds)) {
      return res.status(400).json({ error: "Invalid promotionIds" });
    }
    for (const id of promotionIds) {
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid promotionIds" });
      }
    }
    promoIds = [...new Set(promotionIds)];
  }

  const [customer, cashier] = await Promise.all([
    prisma.user.findUnique({
      where: { utorid: utorid.trim() },
      select: { id: true, utorid: true, points: true },
    }),
    prisma.user.findUnique({
      where: { id: createdById },
      select: { id: true, utorid: true, suspicious: true },
    }),
  ]);
  if (!customer) return res.status(404).json({ error: "User not found" });
  if (!cashier) return res.status(403).json({ error: "Forbidden" });

  const now = new Date();
  let manualPromotions = [];
  let usedOneTimePromotions = new Set();
  if (promoIds.length) {
    manualPromotions = await prisma.promotion.findMany({
      where: { id: { in: promoIds } },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        minSpending: true,
        rate: true,
        points: true,
        type: true,
      },
    });
    if (manualPromotions.length !== promoIds.length) {
      return res.status(400).json({ error: "Invalid promotionIds" });
    }
    if (manualPromotions.some((promo) => promo.type === "onetime")) {
      const priorPurchases = await prisma.transaction.findMany({
        where: { userId: customer.id, type: "purchase" },
        select: { remark: true },
      });
      for (const tx of priorPurchases) {
        const meta = parsePurchaseRemark(tx.remark);
        if (meta?.promotionIds?.length) {
          for (const id of meta.promotionIds) usedOneTimePromotions.add(id);
        }
      }
    }
    for (const promo of manualPromotions) {
      if (promo.startTime > now || promo.endTime < now) {
        return res.status(400).json({ error: "Invalid promotionIds" });
      }
      if (
        promo.minSpending !== null &&
        promo.minSpending !== undefined &&
        spentNumber < promo.minSpending
      ) {
        return res.status(400).json({ error: "Invalid promotionIds" });
      }
      if (promo.type === "onetime" && usedOneTimePromotions.has(promo.id)) {
        return res.status(400).json({ error: "Invalid promotionIds" });
      }
    }
  }

  const automaticPromotions = await prisma.promotion.findMany({
    where: {
      type: "automatic",
      startTime: { lte: now },
      endTime: { gte: now },
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      minSpending: true,
      rate: true,
      points: true,
      type: true,
    },
  });
  const eligibleAutomaticPromotions = automaticPromotions.filter((promo) => {
    if (promo.minSpending === null || promo.minSpending === undefined) {
      return true;
    }
    return spentNumber >= promo.minSpending;
  });

  const promotionMap = new Map();
  for (const promo of manualPromotions) {
    promotionMap.set(promo.id, promo);
  }
  for (const promo of eligibleAutomaticPromotions) {
    promotionMap.set(promo.id, promo);
  }
  const promotions = Array.from(promotionMap.values());
  const appliedPromotionIds = promotions.map((promo) => promo.id);

  const basePoints = Math.round(spentNumber / 0.25);
  let promoPoints = 0;
  for (const promo of promotions) {
    if (promo.points !== null && promo.points > 0) {
      promoPoints += promo.points;
    }

    if (promo.rate !== null && promo.rate > 0) {
      promoPoints += Math.round(spentNumber * promo.rate);
    }
  }
  const earnedPoints = basePoints + promoPoints;
  promoPoints = 0;
  const shouldCredit = !cashier.suspicious;
  const spentCents = Math.round(spentNumber * 100);
  const remarkPayload = JSON.stringify({
    comment: remarkText,
    spentCents,
    promotionIds: appliedPromotionIds,
  });

  const createdTx = await prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        type: "purchase",
        amount: earnedPoints,
        remark: remarkPayload,
        userId: customer.id,
        createdById,
        suspicious: cashier.suspicious,
      },
    });
    if (shouldCredit && earnedPoints !== 0) {
      await tx.user.update({
        where: { id: customer.id },
        data: { points: { increment: earnedPoints } },
      });
    }
    return created;
  });

  return res.status(201).json({
    id: createdTx.id,
    utorid: customer.utorid,
    type: "purchase",
    spent: Number(spentNumber.toFixed(2)),
    earned: shouldCredit ? earnedPoints : 0,
    remark: remarkText,
    promotionIds: appliedPromotionIds,
    createdBy: cashier.utorid,
  });
};

const handleAdjustment = async (req, res) => {
  const auth = req.auth || {};
  const role = auth.role;
  if (!isManagerOrHigher(role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const createdById = auth.id;
  if (!Number.isInteger(createdById)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { utorid, amount, relatedId, promotionIds, remark } = req.body || {};

  if (typeof utorid !== "string" || !utorid.trim()) {
    return res.status(400).json({ error: "Invalid utorid" });
  }

  const amountNumber = parseNumber(amount);
  if (!Number.isFinite(amountNumber)) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  const relatedIdNumber =
    typeof relatedId === "number"
      ? relatedId
      : Number(relatedId);
  if (!Number.isInteger(relatedIdNumber) || relatedIdNumber <= 0) {
    return res.status(400).json({ error: "Invalid relatedId" });
  }

  let remarkText = "";
  if (remark !== undefined && remark !== null) {
    if (typeof remark !== "string") {
      return res.status(400).json({ error: "Invalid remark" });
    }
    remarkText = remark;
  }

  let promoIds = [];
  if (promotionIds !== undefined && promotionIds !== null) {
    if (!Array.isArray(promotionIds)) {
      return res.status(400).json({ error: "Invalid promotionIds" });
    }
    for (const id of promotionIds) {
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid promotionIds" });
      }
    }
    promoIds = [...new Set(promotionIds)];
  }

  const [user, relatedTx, manager] = await Promise.all([
    prisma.user.findUnique({
      where: { utorid: utorid.trim() },
      select: { id: true, utorid: true },
    }),
    prisma.transaction.findUnique({
      where: { id: relatedIdNumber },
      select: {
        id: true,
        userId: true,
        type: true,
        eventId: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: createdById },
      select: { id: true, utorid: true },
    }),
  ]);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  if (!relatedTx) {
    return res.status(404).json({ error: "Related transaction not found" });
  }
  if (relatedTx.userId !== user.id) {
    return res.status(400).json({ error: "Related transaction mismatch" });
  }
  if (!manager) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (promoIds.length) {
    const promos = await prisma.promotion.findMany({
      where: { id: { in: promoIds } },
      select: { id: true },
    });
    if (promos.length !== promoIds.length) {
      return res.status(400).json({ error: "Invalid promotionIds" });
    }
  }

  const amountInt = Math.trunc(amountNumber);

  const createdTx = await prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        type: "adjustment",
        amount: amountInt,
        remark: remarkText,
        userId: user.id,
        createdById,
        eventId: relatedIdNumber,
      },
    });
    if (amountInt !== 0) {
      await tx.user.update({
        where: { id: user.id },
        data: { points: { increment: amountInt } },
      });
    }
    return created;
  });

  return res.status(201).json({
    id: createdTx.id,
    utorid: user.utorid,
    amount: amountInt,
    type: "adjustment",
    relatedId: relatedIdNumber,
    remark: remarkText,
    promotionIds: promoIds,
    createdBy: manager.utorid,
  });
};

router.get("/", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!isManagerOrHigher(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const {
      name,
      createdBy,
      suspicious,
      promotionId,
      type,
      relatedId,
      amount,
      operator,
      page,
      limit,
    } = req.query || {};

    const filters = [];

    if (typeof name === "string" && name.trim()) {
      const value = name.trim();
      filters.push({
        OR: [
          { user: { utorid: { contains: value, mode: "insensitive" } } },
          { user: { name: { contains: value, mode: "insensitive" } } },
        ],
      });
    }

    if (typeof createdBy === "string" && createdBy.trim()) {
      const value = createdBy.trim();
      filters.push({
        OR: [
          { createdBy: { utorid: { contains: value, mode: "insensitive" } } },
          { createdBy: { name: { contains: value, mode: "insensitive" } } },
        ],
      });
    }

    if (suspicious !== undefined) {
      if (suspicious === "true" || suspicious === true) {
        filters.push({ suspicious: true });
      } else if (suspicious === "false" || suspicious === false) {
        filters.push({ suspicious: false });
      } else {
        return res.status(400).json({ error: "Invalid suspicious filter" });
      }
    }

    if (promotionId !== undefined) {
      const promoNumeric = parseNumber(promotionId);
      if (!Number.isInteger(promoNumeric) || promoNumeric <= 0) {
        return res.status(400).json({ error: "Invalid promotionId" });
      }
      return res.status(200).json({ count: 0, results: [] });
    }

    if (type !== undefined) {
      if (typeof type !== "string" || !type.trim()) {
        return res.status(400).json({ error: "Invalid type" });
      }
      filters.push({ type: type.trim() });
    }

    if (relatedId !== undefined) {
      const relatedNumeric = parseNumber(relatedId);
      if (!Number.isInteger(relatedNumeric) || relatedNumeric <= 0) {
        return res.status(400).json({ error: "Invalid relatedId" });
      }
      filters.push({ eventId: relatedNumeric });
    }

    if (amount !== undefined) {
      const amountNumeric = parseNumber(amount);
      if (!Number.isFinite(amountNumeric)) {
        return res.status(400).json({ error: "Invalid amount filter" });
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

    const where = filters.length ? { AND: filters } : {};

    const [count, transactions] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        include: {
          user: { select: { utorid: true } },
          createdBy: { select: { utorid: true } },
        },
        orderBy: { id: "desc" },
        skip: (pageValue - 1) * limitValue,
        take: limitValue,
      }),
    ]);

    const results = transactions.map((tx) => {
      const purchaseMeta =
        tx.type === "purchase" ? parsePurchaseRemark(tx.remark) : null;
      return {
        id: tx.id,
        utorid: tx.user?.utorid ?? null,
        amount: tx.amount,
        type: tx.type,
        spent:
          tx.type === "purchase" && purchaseMeta
            ? Number((purchaseMeta.spentCents / 100).toFixed(2))
            : undefined,
        promotionIds: purchaseMeta?.promotionIds ?? [],
        suspicious: Boolean(tx.suspicious),
        remark: purchaseMeta ? purchaseMeta.comment : tx.remark || "",
        createdBy: tx.createdBy?.utorid ?? null,
        relatedId: tx.eventId ?? null,
      };
    });

    return res.status(200).json({ count, results });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:transactionId", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!isManagerOrHigher(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const id = Number(req.params.transactionId);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: {
        user: { select: { utorid: true } },
        createdBy: { select: { utorid: true } },
      },
    });

    if (!tx) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const purchaseMeta =
      tx.type === "purchase" ? parsePurchaseRemark(tx.remark) : null;
    return res.status(200).json({
      id: tx.id,
      utorid: tx.user?.utorid ?? null,
      type: tx.type,
      spent:
        tx.type === "purchase" && purchaseMeta
          ? Number((purchaseMeta.spentCents / 100).toFixed(2))
          : undefined,
      amount: tx.amount,
      promotionIds: purchaseMeta?.promotionIds ?? [],
      suspicious: Boolean(tx.suspicious),
      remark: purchaseMeta ? purchaseMeta.comment : tx.remark || "",
      createdBy: tx.createdBy?.utorid ?? null,
      relatedId: tx.eventId ?? null,
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:transactionId/suspicious", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!isManagerOrHigher(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const id = Number(req.params.transactionId);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const { suspicious } = req.body || {};
    if (typeof suspicious !== "boolean") {
      return res.status(400).json({ error: "Invalid suspicious value" });
    }

    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, utorid: true, points: true } },
        createdBy: { select: { utorid: true } },
      },
    });

    if (!tx) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const purchaseMeta =
      tx.type === "purchase" ? parsePurchaseRemark(tx.remark) : null;

    if (tx.suspicious === suspicious) {
      return res.status(200).json({
        id: tx.id,
        utorid: tx.user?.utorid ?? null,
        type: tx.type,
        spent:
          tx.type === "purchase" && purchaseMeta
            ? Number((purchaseMeta.spentCents / 100).toFixed(2))
            : undefined,
        amount: tx.amount,
        promotionIds: [],
        suspicious: Boolean(tx.suspicious),
        remark: purchaseMeta ? purchaseMeta.comment : tx.remark || "",
        createdBy: tx.createdBy?.utorid ?? null,
      });
    }

    const amountDelta = tx.amount;

    await prisma.$transaction(async (db) => {
      await db.transaction.update({
        where: { id },
        data: { suspicious },
      });

      if (tx.user) {
        await db.user.update({
          where: { id: tx.user.id },
          data: {
            points: {
              increment: suspicious ? -amountDelta : amountDelta,
            },
          },
        });
      }
    });

    return res.status(200).json({
      id: tx.id,
      utorid: tx.user?.utorid ?? null,
      type: tx.type,
      spent:
        tx.type === "purchase" && purchaseMeta
          ? Number((purchaseMeta.spentCents / 100).toFixed(2))
          : undefined,
      amount: tx.amount,
      promotionIds: [],
      suspicious,
      remark: purchaseMeta ? purchaseMeta.comment : tx.remark || "",
      createdBy: tx.createdBy?.utorid ?? null,
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:transactionId/processed", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!isCashierOrHigher(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const id = Number(req.params.transactionId);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const { processed } = req.body || {};
    if (processed !== true) {
      return res.status(400).json({ error: "processed must be true" });
    }

    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, utorid: true } },
        createdBy: { select: { utorid: true } },
      },
    });

    const processor = await prisma.user.findUnique({
      where: { id: req.auth?.id },
      select: { utorid: true },
    });
    if (!processor || !processor.utorid) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!tx) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (tx.type !== "redemption") {
      return res.status(400).json({ error: "Not a redemption transaction" });
    }

    if (tx.processed) {
      return res.status(400).json({ error: "Transaction already processed" });
    }

    if (!tx.user) {
      return res.status(400).json({ error: "Redemption user missing" });
    }

    await prisma.$transaction(async (db) => {
      await db.transaction.update({
        where: { id: tx.id },
        data: { processed: true },
      });
      await db.user.update({
        where: { id: tx.user.id },
        data: { points: { decrement: Math.abs(tx.amount) } },
      });
    });

    return res.status(200).json({
      id: tx.id,
      utorid: tx.user.utorid,
      type: tx.type,
      processedBy: processor.utorid,
      redeemed: Math.abs(tx.amount),
      remark: tx.remark || "",
      createdBy: tx.createdBy?.utorid ?? null,
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;

const handleRedemption = async (req, res) => {
  const auth = req.auth || {};
  const role = auth.role;
  if (!isCashierOrHigher(role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const createdById = auth.id;
  if (!Number.isInteger(createdById)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { utorid, amount, remark } = req.body || {};

  if (typeof utorid !== "string" || !utorid.trim()) {
    return res.status(400).json({ error: "Invalid utorid" });
  }

  const amountNumber = parseNumber(amount);
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }
  const amountInt = Math.trunc(amountNumber);

  let remarkText = "";
  if (remark !== undefined && remark !== null) {
    if (typeof remark !== "string") {
      return res.status(400).json({ error: "Invalid remark" });
    }
    remarkText = remark;
  }

  const trimmedId = utorid.trim();

  const [user, creator] = await Promise.all([
    prisma.user.findFirst({
      where: {
        OR: [
          { utorid: { equals: trimmedId, mode: "insensitive" } },
          { email: { equals: trimmedId, mode: "insensitive" } },
        ],
      },
      select: { id: true, utorid: true },
    }),
    prisma.user.findUnique({
      where: { id: createdById },
      select: { id: true, utorid: true },
    }),
  ]);

  if (!user) return res.status(404).json({ error: "User not found" });
  if (!creator) return res.status(403).json({ error: "Forbidden" });

  const created = await prisma.transaction.create({
    data: {
      type: "redemption",
      amount: amountInt,
      remark: remarkText,
      userId: user.id,
      createdById,
      processed: false,
    },
    select: { id: true },
  });

  return res.status(201).json({
    id: created.id,
    utorid: user.utorid,
    type: "redemption",
    redeemed: amountInt,
    remark: remarkText,
    createdBy: creator.utorid,
  });
};
