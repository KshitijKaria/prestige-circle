const express = require("express");
const router = express.Router();
const prisma = require("../prisma/client");

const isManagerOrHigher = (role) => role === "manager" || role === "superuser";

const parseISO = (value) => {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const msTrunc = raw.replace(
    /^(.*\.\d{3})\d+(Z|[+\-]\d{2}:\d{2})$/,
    "$1$2"
  );
  const d = new Date(msTrunc);
  return Number.isNaN(d.getTime()) ? null : d;
};

const parsePositiveNumber = (value) => {
  if (value === undefined || value === null) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

router.post("/", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!isManagerOrHigher(role)) return res.status(403).json({ error: "Forbidden" });

    const {
      name,
      description,
      type,
      startTime,
      endTime,
      minSpending,
      rate,
      points,
    } = req.body || {};

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Invalid name" });
    }
    if (typeof description !== "string" || !description.trim()) {
      return res.status(400).json({ error: "Invalid description" });
    }

    const normalizedTypeRaw = typeof type === "string" ? type.trim() : "";
    if (!["automatic", "one-time", "onetime"].includes(normalizedTypeRaw)) {
      return res.status(400).json({ error: "Invalid type" });
    }
    const normalizedType = normalizedTypeRaw === "one-time" ? "onetime" : normalizedTypeRaw;

    const start = parseISO(startTime);
    const end = parseISO(endTime);
    const now = new Date();

    if (!start || !end) {
      return res.status(400).json({ error: "Invalid startTime/endTime" });
    }

    const startMs = start.getTime();
    if (startMs < now.getTime()) {
      return res.status(400).json({ error: "Invalid startTime/endTime" });
    }

    if (end.getTime() <= startMs) {
      return res.status(400).json({ error: "Invalid startTime/endTime" });
    }

    const parsePosOrUndef = (v) => {
      if (v === undefined || v === null) return undefined;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    const minSpendingVal = parsePosOrUndef(minSpending);
    if (minSpendingVal === null) {
      return res.status(400).json({ error: "Invalid minSpending" });
    }

    const rateVal = parsePosOrUndef(rate);
    if (rateVal === null) {
      return res.status(400).json({ error: "Invalid rate" });
    }

    let pointsVal;
    if (points === undefined || points === null) {
      pointsVal = undefined;
    } else {
      const parsedPoints =
        typeof points === "number" ? points : Number(points);
      if (!Number.isFinite(parsedPoints) || parsedPoints < 0) {
        return res.status(400).json({ error: "Invalid points" });
      }
      pointsVal = Math.trunc(parsedPoints);
    }

    const data = {
      name: name.trim(),
      type: normalizedType,
      description: description.trim(),
      startTime: start,
      endTime: end,
      points: pointsVal,
      minSpending: minSpendingVal,
      rate: rateVal,
    };

    const created = await prisma.promotion.create({
      data,
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        startTime: true,
        endTime: true,
        minSpending: true,
        rate: true,
        points: true,
      },
    });

    return res.status(201).json({
      id: created.id,
      name: created.name,
      description: created.description,
      type: created.type,
      startTime: created.startTime.toISOString(),
      endTime: created.endTime.toISOString(),
      minSpending: created.minSpending ?? null,
      rate: created.rate ?? null,
      points: created.points ?? null,
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!["regular", "cashier", "manager", "superuser"].includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { name, type, page, limit, started, ended } = req.query || {};

    const baseFilters = [];
    if (typeof name === "string" && name.trim()) {
      baseFilters.push({ name: { contains: name.trim(), mode: "insensitive" } });
    }

    if (type !== undefined) {
      if (typeof type !== "string" || !type.trim()) {
        return res.status(400).json({ error: "Invalid type" });
      }
      const normalized = type.trim();
      if (!["automatic", "one-time", "onetime"].includes(normalized)) {
        return res.status(400).json({ error: "Invalid type" });
      }
      baseFilters.push({ type: normalized === "one-time" ? "onetime" : normalized });
    }

    const pageValue = page !== undefined ? Number(page) : 1;
    const limitValue = limit !== undefined ? Number(limit) : 10;
    if (!Number.isInteger(pageValue) || pageValue <= 0) {
      return res.status(400).json({ error: "Invalid page" });
    }
    if (!Number.isInteger(limitValue) || limitValue <= 0) {
      return res.status(400).json({ error: "Invalid limit" });
    }

    if (!isManagerOrHigher(role)) {
      const now = new Date();

      const nameFilter =
        typeof name === "string" && name.trim()
          ? { name: { contains: name.trim(), mode: "insensitive" } }
          : undefined;

      const where = {
        AND: [
          ...(nameFilter ? [nameFilter] : []),
          { startTime: { lte: now } },
          { endTime: { gte: now } },
        ],
      };

      const [count, promotions] = await Promise.all([
        prisma.promotion.count({ where }),
        prisma.promotion.findMany({
          where,
          orderBy: { id: "asc" },
          skip: (pageValue - 1) * limitValue,
          take: limitValue,
          select: {
            id: true,
            name: true,
            type: true,
            startTime: true,
            endTime: true,
            minSpending: true,
            rate: true,
            points: true,
          },
        }),
      ]);

      const results = promotions.map((promo) => ({
        id: promo.id,
        name: promo.name,
        type: promo.type,
        startTime: promo.startTime.toISOString(),
        endTime: promo.endTime.toISOString(),
        minSpending: promo.minSpending,
        rate: promo.rate,
        points: promo.points,
      }));

      return res.status(200).json({ count, results });
    }

    const parseBool = (value) => {
      if (value === undefined) return undefined;
      if (value === "true" || value === true) return true;
      if (value === "false" || value === false) return false;
      return null;
    };

    const filters = [...baseFilters];
    const startedFilter = parseBool(started);
    const endedFilter = parseBool(ended);

    if (startedFilter !== undefined && endedFilter !== undefined) {
      if (startedFilter === null || endedFilter === null) {
        return res.status(400).json({ error: "Invalid boolean filter" });
      }
      return res.status(400).json({ error: "Cannot specify both started and ended" });
    }

    if (startedFilter !== undefined) {
      if (startedFilter === null) {
        return res.status(400).json({ error: "Invalid started filter" });
      }
      const now = new Date();
      if (startedFilter) {
        filters.push({ startTime: { lte: now } });
      } else {
        filters.push({ startTime: { gt: now } });
      }
    }

    if (endedFilter !== undefined) {
      if (endedFilter === null) {
        return res.status(400).json({ error: "Invalid ended filter" });
      }
      const now = new Date();
      if (endedFilter) {
        filters.push({ endTime: { lte: now } });
      } else {
        filters.push({ endTime: { gt: now } });
      }
    }

    const where = filters.length ? { AND: filters } : {};
    const [count, promotions] = await Promise.all([
      prisma.promotion.count({ where }),
      prisma.promotion.findMany({
        where,
        orderBy: { id: "asc" },
        skip: (pageValue - 1) * limitValue,
        take: limitValue,
        select: {
          id: true,
          name: true,
          type: true,
          startTime: true,
          endTime: true,
          minSpending: true,
          rate: true,
          points: true,
        },
      }),
    ]);

    const results = promotions.map((promo) => ({
      id: promo.id,
      name: promo.name,
      type: promo.type,
      startTime: promo.startTime.toISOString(),
      endTime: promo.endTime.toISOString(),
      minSpending: promo.minSpending,
      rate: promo.rate,
      points: promo.points,
    }));

    return res.status(200).json({ count, results });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:promotionId", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!["regular", "cashier", "manager", "superuser"].includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const id = Number(req.params.promotionId);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ error: "Promotion not found" });
    }

    const promo = await prisma.promotion.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        startTime: true,
        endTime: true,
        minSpending: true,
        rate: true,
        points: true,
      },
    });

    if (!promo) {
      return res.status(404).json({ error: "Promotion not found" });
    }
    if (!isManagerOrHigher(role)) {
      const now = new Date();
      if (promo.startTime > now || promo.endTime < now) {
        return res.status(404).json({ error: "Promotion not found" });
      }
    }

    return res.status(200).json({
      id: promo.id,
      name: promo.name,
      description: promo.description,
      type: promo.type,
      startTime: promo.startTime.toISOString(),
      endTime: promo.endTime.toISOString(),
      minSpending: promo.minSpending,
      rate: promo.rate,
      points: promo.points,
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:promotionId", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!isManagerOrHigher(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const id = Number(req.params.promotionId);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ error: "Promotion not found" });
    }

    const promotion = await prisma.promotion.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        startTime: true,
        endTime: true,
        minSpending: true,
        rate: true,
        points: true,
      },
    });

    if (!promotion) {
      return res.status(404).json({ error: "Promotion not found" });
    }

    const {
      name,
      description,
      type,
      startTime,
      endTime,
      minSpending,
      rate,
      points,
    } = req.body || {};

    const isPresent = (v) => v !== undefined && v !== null;

    const now = new Date();
    const updates = {};
    let effectiveStart = promotion.startTime;

    if (isPresent(name)) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Invalid name" });
      }
      updates.name = name.trim();
    }

    if (isPresent(description)) {
      if (typeof description !== "string" || !description.trim()) {
        return res.status(400).json({ error: "Invalid description" });
      }
      updates.description = description.trim();
    }

    if (isPresent(type)) {
      if (typeof type !== "string" || !type.trim()) {
        return res.status(400).json({ error: "Invalid type" });
      }
      const normalized = type.trim();
      if (!["automatic", "one-time", "onetime"].includes(normalized)) {
        return res.status(400).json({ error: "Invalid type" });
      }
      updates.type = normalized === "one-time" ? "onetime" : normalized;
    }

    if (isPresent(startTime)) {
      if (typeof startTime !== "string") {
        return res.status(400).json({ error: "Invalid startTime" });
      }
      const parsedStart = parseISO(startTime);
      if (!parsedStart || parsedStart <= now) {
        return res.status(400).json({ error: "Invalid startTime" });
      }
      effectiveStart = parsedStart;
      updates.startTime = parsedStart;
    }

    if (isPresent(endTime)) {
      if (typeof endTime !== "string") {
        return res.status(400).json({ error: "Invalid endTime" });
      }
      const parsedEnd = parseISO(endTime);
      if (!parsedEnd) {
        return res.status(400).json({ error: "Invalid endTime" });
      }
      if (parsedEnd <= effectiveStart) {
        return res.status(400).json({ error: "endTime must be after startTime" });
      }
      updates.endTime = parsedEnd;
    }

    const parseNonNegOrUndef = (v) => {
      if (!isPresent(v)) return undefined;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) && n >= 0 ? n : NaN;
    };

    if (isPresent(minSpending)) {
      const parsed = parseNonNegOrUndef(minSpending);
      if (Number.isNaN(parsed)) {
        return res.status(400).json({ error: "Invalid minSpending" });
      }
      updates.minSpending = parsed;
    }

    if (isPresent(rate)) {
      const parsed = parseNonNegOrUndef(rate);
      if (Number.isNaN(parsed)) {
        return res.status(400).json({ error: "Invalid rate" });
      }
      updates.rate = parsed;
    }

    if (isPresent(points)) {
      const parsed = parseNonNegOrUndef(points);
      if (Number.isNaN(parsed)) {
        return res.status(400).json({ error: "Invalid points" });
      }
      updates.points = parsed === undefined ? undefined : Math.trunc(parsed);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields provided" });
    }

    const updated = await prisma.promotion.update({
      where: { id },
      data: updates,
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        startTime: true,
        endTime: true,
        minSpending: true,
        rate: true,
        points: true,
      },
    });

    const response = {
      id: updated.id,
      name: updated.name,
      type: updated.type,
    };
    if (updates.description !== undefined) response.description = updated.description;
    if (updates.startTime !== undefined) response.startTime = updated.startTime.toISOString();
    if (updates.endTime !== undefined) response.endTime = updated.endTime.toISOString();
    if (updates.minSpending !== undefined) response.minSpending = updated.minSpending;
    if (updates.rate !== undefined) response.rate = updated.rate;
    if (updates.points !== undefined) response.points = updated.points;

    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:promotionId", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!isManagerOrHigher(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const id = Number(req.params.promotionId);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ error: "Promotion not found" });
    }

    const promo = await prisma.promotion.findUnique({
      where: { id },
      select: { id: true, startTime: true },
    });

    if (!promo) {
      return res.status(404).json({ error: "Promotion not found" });
    }

    if (promo.startTime <= new Date()) {
      return res.status(403).json({ error: "Promotion already started" });
    }

    await prisma.promotion.delete({ where: { id } });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
