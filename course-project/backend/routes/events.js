const express = require("express");
const router = express.Router();
const prisma = require("../prisma/client");

const isManagerOrHigher = (role) => role === "manager" || role === "superuser";
const isRegularOrHigher = (role) =>
  role === "regular" || role === "cashier" || role === "manager" || role === "superuser";

const parseISO = (s) => {
  if (typeof s !== "string") return null;
  const trimmed = s.trim();
  if (trimmed.length === 0) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
};

const parseIntField = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

router.get("/", async (req, res) => {
  try {
    const role = req.auth?.role;
    const {
      name,
      location,
      started,
      ended,
      showFull,
      includeMe,
      page,
      limit,
      published,
    } = req.query ?? {};
    const authIdRaw = req.auth?.id;
    const authId = typeof authIdRaw === "number" ? authIdRaw : parseInt(authIdRaw, 10);
    const wantMe = includeMe === true || includeMe === "true";

    const isManagerRole = isManagerOrHigher(role);
    const isRegularRole = isRegularOrHigher(role);
    if (!isManagerRole && !isRegularRole) return res.status(403).json({ error: "Forbidden" });

    let startedFilter;
    if (started !== undefined) {
      if (started === true || started === "true") startedFilter = true;
      else if (started === false || started === "false") startedFilter = false;
      else return res.status(400).json({ error: "Invalid started filter" });
    }

    let endedFilter;
    if (ended !== undefined) {
      if (ended === true || ended === "true") endedFilter = true;
      else if (ended === false || ended === "false") endedFilter = false;
      else return res.status(400).json({ error: "Invalid ended filter" });
    }

    if (startedFilter !== undefined && endedFilter !== undefined) {
      return res.status(400).json({ error: "Cannot specify both started and ended" });
    }

    let includeFull = false;
    if (showFull !== undefined) {
      if (showFull === true || showFull === "true") includeFull = true;
      else if (showFull === false || showFull === "false") includeFull = false;
      else return res.status(400).json({ error: "Invalid showFull filter" });
    }

    if (name !== undefined && typeof name !== "string") {
      return res.status(400).json({ error: "Invalid name filter" });
    }
    if (location !== undefined && typeof location !== "string") {
      return res.status(400).json({ error: "Invalid location filter" });
    }

    const pageValue = page === undefined ? 1 : Number(page);
    if (!Number.isInteger(pageValue) || pageValue <= 0) {
      return res.status(400).json({ error: "Invalid page value" });
    }

    const limitValue = limit === undefined ? 10 : Number(limit);
    if (!Number.isInteger(limitValue) || limitValue <= 0) {
      return res.status(400).json({ error: "Invalid limit value" });
    }

    const now = new Date();
    const whereClauses = [];

    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (trimmedName.length > 0) {
      whereClauses.push({ name: { contains: trimmedName, mode: "insensitive" } });
    }

    const trimmedLocation = typeof location === "string" ? location.trim() : "";
    if (trimmedLocation.length > 0) {
      whereClauses.push({ location: { contains: trimmedLocation, mode: "insensitive" } });
    }

    if (startedFilter !== undefined) {
      whereClauses.push(startedFilter ? { startTime: { lte: now } } : { startTime: { gt: now } });
    }

    if (endedFilter !== undefined) {
      whereClauses.push(endedFilter ? { endTime: { lte: now } } : { endTime: { gt: now } });
    }

    if (isManagerRole) {
      if (published !== undefined) {
        if (published === true || published === "true") whereClauses.push({ published: true });
        else if (published === false || published === "false") whereClauses.push({ published: false });
        else return res.status(400).json({ error: "Invalid published filter" });
      }
    } else if (isRegularRole) {
      whereClauses.push({ published: true });
    }

    const where = whereClauses.length ? { AND: whereClauses } : {};

    const include = {
      _count: { select: { guests: true } },
    };
    if (wantMe && Number.isFinite(authId) && authId > 0) {
      // Only fetch the current user's membership row; does not expose full guest list
      include.guests = { where: { userId: authId }, select: { userId: true } };
    }
    const events = await prisma.event.findMany({
      where,
      orderBy: { startTime: "asc" },
      include,
    });

    const filteredEvents = includeFull
      ? events
      : events.filter((event) => {
          if (event.capacity === null || event.capacity === undefined) return true;
          return event._count.guests < event.capacity;
        });

    const totalCount = filteredEvents.length;
    const startIndex = (pageValue - 1) * limitValue;
    const paginated = filteredEvents.slice(startIndex, startIndex + limitValue);

    // Compute membership for paginated events if includeMe is requested
    let meSet = new Set();
    if (wantMe && Number.isFinite(authId) && authId > 0) {
      // We already joined membership per event; just look for a row
      meSet = new Set(
        paginated
          .filter(e => Array.isArray(e.guests) && e.guests.length > 0)
          .map(e => e.id)
      );
    }

    const results = paginated.map((event) => {
      const base = {
        id: event.id,
        name: event.name,
        location: event.location,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
        capacity: event.capacity,
        numGuests: event._count.guests,
      };
      if (isManagerRole) {
        base.pointsRemain = event.pointsRemain;
        base.pointsAwarded = event.pointsAwarded;
        base.published = event.published;
      }
      if (wantMe && Number.isFinite(authId) && authId > 0) {
        base.meRsvped = meSet.has(event.id);
      }
      return base;
    });

    return res.status(200).json({ count: totalCount, results });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Probe membership for current user on a specific event
router.get("/:eventId/guests/me", async (req, res) => {
  try {
    const auth = req.auth || {};
    const role = auth.role;
    if (!isRegularOrHigher(role)) return res.status(403).json({ error: "Forbidden" });

    const userIdRaw = auth.id;
    const userId = typeof userIdRaw === "number" ? userIdRaw : parseInt(userIdRaw, 10);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(403).json({ error: "Forbidden" });

    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) return res.status(404).json({ error: "Event not found" });

    // Only disclose membership if the caller can see the event
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        published: true,
        organizers: { select: { userId: true } },
      },
    });
    if (!event) return res.status(404).json({ error: "Event not found" });

    const isManagerRole = isManagerOrHigher(role);
    const isOrganizer = event.organizers.some(o => o.userId === userId);
    if (!isManagerRole && !isOrganizer && !event.published) {
      return res.status(404).json({ error: "Event not found" });
    }

    const guest = await prisma.eventGuest.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!guest) return res.status(404).json({ error: "Guest not found" });

    return res.status(200).json({ meRsvped: true });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:eventId", async (req, res) => {
  try {
    const auth = req.auth || {};
    const role = auth.role;
    if (!isRegularOrHigher(role)) return res.status(403).json({ error: "Forbidden" });

    const id = Number(req.params.eventId);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: "Event not found" });

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        organizers: { select: { user: { select: { id: true, utorid: true, name: true } } } },
        guests: { select: { user: { select: { id: true, utorid: true, name: true } } } },
        _count: { select: { guests: true } },
      },
    });

    if (!event) return res.status(404).json({ error: "Event not found" });

    const isManagerRole = isManagerOrHigher(role);
    const isOrganizer = auth.id && event.organizers.some((entry) => entry.user.id === auth.id);
    const canViewFull = isManagerRole || Boolean(isOrganizer);

    if (!canViewFull && !event.published) return res.status(404).json({ error: "Event not found" });

    const organizers = event.organizers.map((entry) => ({
      id: entry.user.id,
      utorid: entry.user.utorid,
      name: entry.user.name,
    }));

    const response = {
      id: event.id,
      name: event.name,
      description: event.description,
      location: event.location,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
      capacity: event.capacity,
      organizers,
      numGuests: event._count.guests,
    };

    if (canViewFull) {
      response.pointsRemain = event.pointsRemain;
      response.pointsAwarded = event.pointsAwarded;
      response.published = event.published;
      response.guests = event.guests.map((entry) => ({
        id: entry.user.id,
        utorid: entry.user.utorid,
        name: entry.user.name,
      }));
    }

    return res.status(200).json(response);
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!isManagerOrHigher(role)) return res.status(403).json({ error: "Forbidden" });

    const {
      name,
      description,
      location,
      startTime: startTimeStr,
      endTime: endTimeStr,
      capacity,
      points,
    } = req.body ?? {};

    if (typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "Invalid or missing name" });
    if (typeof description !== "string" || !description.trim()) return res.status(400).json({ error: "Invalid or missing description" });
    if (typeof location !== "string" || !location.trim()) return res.status(400).json({ error: "Invalid or missing location" });
    if (typeof points !== "number" || !Number.isInteger(points) || points <= 0) {
      return res.status(400).json({ error: "Invalid or missing points" });
    }

    let normalizedCapacity = null;
    if (capacity !== undefined) {
      if (capacity === null) {
        normalizedCapacity = null;
      } else {
        const parsedCap = parseIntField(capacity);
        if (!Number.isInteger(parsedCap) || parsedCap <= 0) {
          return res.status(400).json({ error: "Invalid capacity" });
        }
        normalizedCapacity = parsedCap;
      }
    }

    const start = parseISO(startTimeStr);
    const end = parseISO(endTimeStr);
    if (!start || !end || end <= start) return res.status(400).json({ error: "Invalid startTime/endTime" });
    const now = new Date();
    if (start <= now || end <= now) return res.status(400).json({ error: "Event time cannot be in the past" });

    const created = await prisma.event.create({
      data: {
        name: name.trim(),
        description: description.trim(),
        location: location.trim(),
        startTime: start,
        endTime: end,
        capacity: normalizedCapacity,
        pointsRemain: points,
        pointsAwarded: 0,
        published: false,
      },
      select: {
        id: true,
        name: true,
        description: true,
        location: true,
        startTime: true,
        endTime: true,
        capacity: true,
        pointsRemain: true,
        pointsAwarded: true,
        published: true,
      },
    });

    return res.status(201).json({
      id: created.id,
      name: created.name,
      description: created.description,
      location: created.location,
      startTime: created.startTime.toISOString(),
      endTime: created.endTime.toISOString(),
      capacity: created.capacity,
      pointsRemain: created.pointsRemain,
      pointsAwarded: created.pointsAwarded,
      published: created.published,
      organizers: [],
      guests: [],
    });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:eventId", async (req, res) => {
  try {
    const auth = req.auth || {};
    const role = auth.role;
    if (!isRegularOrHigher(role)) return res.status(403).json({ error: "Forbidden" });

    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) return res.status(404).json({ error: "Event not found" });

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        description: true,
        location: true,
        startTime: true,
        endTime: true,
        capacity: true,
        pointsRemain: true,
        pointsAwarded: true,
        published: true,
        organizers: { select: { userId: true } },
      },
    });
    if (!event) return res.status(404).json({ error: "Event not found" });

    const isManagerRole = isManagerOrHigher(role);
    const isOrganizer = auth.id && event.organizers.some((e) => e.userId === auth.id);
    if (!isManagerRole && !isOrganizer) return res.status(403).json({ error: "Forbidden" });

    const body = req.body || {};
    const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
    const val = (k) => (has(k) && body[k] !== null ? body[k] : undefined);

    const name = val("name");
    const description = val("description");
    const location = val("location");
    const startTime = val("startTime");
    const endTime = val("endTime");
    const capacityRaw = has("capacity") ? body.capacity : undefined;
    const pointsRaw = val("points");
    const published = val("published");

    const wantsPointsUpdate = pointsRaw !== undefined;
    const wantsPublishedUpdate = published !== undefined;
    if (wantsPointsUpdate && !isManagerRole && !isOrganizer) return res.status(403).json({ error: "Forbidden" });
    if (wantsPublishedUpdate && !isManagerRole) return res.status(403).json({ error: "Forbidden" });

    const now = new Date();
    let finalStart = event.startTime;
    let finalEnd = event.endTime;
    const updates = {};

    if (name !== undefined) {
      if (event.startTime <= now) return res.status(400).json({ error: "Cannot update name after start" });
      if (typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "Invalid name" });
      updates.name = name.trim();
    }

    if (description !== undefined) {
      if (event.startTime <= now) return res.status(400).json({ error: "Cannot update description after start" });
      if (typeof description !== "string" || !description.trim()) return res.status(400).json({ error: "Invalid description" });
      updates.description = description.trim();
    }

    if (location !== undefined) {
      if (event.startTime <= now) return res.status(400).json({ error: "Cannot update location after start" });
      if (typeof location !== "string" || !location.trim()) return res.status(400).json({ error: "Invalid location" });
      updates.location = location.trim();
    }

    if (startTime !== undefined) {
      if (event.startTime <= now) return res.status(400).json({ error: "Cannot update startTime after start" });
      const parsedStart = parseISO(startTime);
      if (!parsedStart || parsedStart <= now) return res.status(400).json({ error: "Invalid startTime" });
      finalStart = parsedStart;
      updates.startTime = parsedStart;
    }

    if (endTime !== undefined) {
      if (event.endTime <= now) return res.status(400).json({ error: "Cannot update endTime after it has passed" });
      const parsedEnd = parseISO(endTime);
      if (!parsedEnd || parsedEnd <= now) return res.status(400).json({ error: "Invalid endTime" });
      finalEnd = parsedEnd;
      updates.endTime = parsedEnd;
    }

    if (
      (Object.prototype.hasOwnProperty.call(updates, "startTime") ||
        Object.prototype.hasOwnProperty.call(updates, "endTime")) &&
      finalEnd <= finalStart
    ) {
      return res.status(400).json({ error: "endTime must be after startTime" });
    }

    if (capacityRaw !== undefined) {
      if (event.startTime <= now) return res.status(400).json({ error: "Cannot update capacity after start" });
      if (capacityRaw === null) {
      } else {
        const parsed = parseIntField(capacityRaw);
        if (!Number.isInteger(parsed) || parsed <= 0) return res.status(400).json({ error: "Invalid capacity" });
        const confirmedGuests = await prisma.eventGuest.count({ where: { eventId, confirmed: true } });
        if (parsed < confirmedGuests) return res.status(400).json({ error: "Capacity less than confirmed guests" });
        updates.capacity = parsed;
      }
    }

    if (wantsPointsUpdate) {
      let n;
      if (typeof pointsRaw === "number") n = pointsRaw;
      else if (typeof pointsRaw === "string") {
        const t = pointsRaw.trim();
        const num = Number(t);
        n = Number.isInteger(num) ? num : NaN;
      } else {
        n = NaN;
      }
      if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: "Invalid points" });
      const awarded = Number.isInteger(event.pointsAwarded) ? event.pointsAwarded : 0;
      const remain = n - awarded;
      if (remain < 0) return res.status(400).json({ error: "Points cannot go below zero" });
      updates.pointsRemain = remain;
    }

    if (published !== undefined) {
      if (published !== true) return res.status(400).json({ error: "Published can only be set to true" });
      updates.published = true;
    }

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No valid fields to update" });

    const updated = await prisma.event.update({
      where: { id: eventId },
      data: updates,
      select: {
        id: true,
        name: true,
        location: true,
        description: true,
        startTime: true,
        endTime: true,
        capacity: true,
        pointsRemain: true,
        pointsAwarded: true,
        published: true,
      },
    });

    const response = { id: updated.id, name: updated.name, location: updated.location };
    if (Object.prototype.hasOwnProperty.call(updates, "description")) response.description = updated.description;
    if (Object.prototype.hasOwnProperty.call(updates, "startTime")) response.startTime = updated.startTime.toISOString();
    if (Object.prototype.hasOwnProperty.call(updates, "endTime")) response.endTime = updated.endTime.toISOString();
    if (Object.prototype.hasOwnProperty.call(updates, "capacity")) response.capacity = updated.capacity;
    if (Object.prototype.hasOwnProperty.call(updates, "pointsRemain")) {
      response.pointsRemain = updated.pointsRemain;
      response.points = updated.pointsRemain + (Number.isInteger(updated.pointsAwarded) ? updated.pointsAwarded : 0);
    }
    if (Object.prototype.hasOwnProperty.call(updates, "published")) response.published = updated.published;

    return res.status(200).json(response);
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:eventId", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!isManagerOrHigher(role)) return res.status(403).json({ error: "Forbidden" });

    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) return res.status(404).json({ error: "Event not found" });

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, published: true },
    });
    if (!event) return res.status(404).json({ error: "Event not found" });
    if (event.published) return res.status(400).json({ error: "Cannot delete published event" });

    await prisma.$transaction(async (tx) => {
      await tx.eventGuest.deleteMany({ where: { eventId } });
      await tx.eventOrganizer.deleteMany({ where: { eventId } });
      await tx.event.delete({ where: { id: eventId } });
    });

    return res.status(200).json({ id: eventId });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:eventId/organizers", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!isManagerOrHigher(role)) return res.status(403).json({ error: "Forbidden" });

    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) return res.status(404).json({ error: "Event not found" });

    const { utorid } = req.body || {};
    if (typeof utorid !== "string" || !utorid.trim()) return res.status(400).json({ error: "Invalid utorid" });
    const trimmedUtorid = utorid.trim();

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        location: true,
        endTime: true,
        organizers: { select: { user: { select: { id: true, utorid: true, name: true } } } },
        guests: { select: { userId: true } },
      },
    });
    if (!event) return res.status(404).json({ error: "Event not found" });
    if (event.endTime <= new Date()) return res.status(410).json({ error: "Event has ended" });

    const user = await prisma.user.findUnique({
      where: { utorid: trimmedUtorid },
      select: { id: true, utorid: true, name: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (event.guests.some((g) => g.userId === user.id)) {
      return res.status(400).json({ error: "User is already a guest" });
    }
    if (event.organizers.some((o) => o.user.id === user.id)) {
      return res.status(201).json({
        id: event.id,
        name: event.name,
        location: event.location,
        organizers: event.organizers.map((org) => org.user),
      });
    }

    await prisma.eventOrganizer.create({ data: { eventId, userId: user.id } });

    const organizers = [
      ...event.organizers.map((org) => org.user),
      { id: user.id, utorid: user.utorid, name: user.name },
    ];

    return res.status(201).json({
      id: event.id,
      name: event.name,
      location: event.location,
      organizers,
    });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:eventId/organizers/:userId", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!isManagerOrHigher(role)) return res.status(403).json({ error: "Forbidden" });

    const eventId = Number(req.params.eventId);
    const userId = Number(req.params.userId);
    if (!Number.isInteger(eventId) || eventId <= 0) return res.status(404).json({ error: "Event not found" });
    if (!Number.isInteger(userId) || userId <= 0) return res.status(404).json({ error: "Organizer not found" });

    const organizer = await prisma.eventOrganizer.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!organizer) return res.status(404).json({ error: "Organizer not found" });

    await prisma.eventOrganizer.delete({
      where: { eventId_userId: { eventId, userId } },
    });

    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:eventId/guests", async (req, res) => {
  try {
    const auth = req.auth || {};
    const role = auth.role;
    if (!isRegularOrHigher(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { utorid } = req.body || {};
    if (typeof utorid !== "string" || !utorid.trim()) {
      return res.status(400).json({ error: "Invalid utorid" });
    }
    const trimmedUtorid = utorid.trim();

    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(404).json({ error: "Event not found" });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        location: true,
        endTime: true,
        published: true,
        capacity: true,
        organizers: { select: { user: { select: { id: true, utorid: true, name: true } } } },
        guests:    { select: { user: { select: { id: true, utorid: true, name: true } } } },
      },
    });
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    const isManagerRole = isManagerOrHigher(role);
    const isOrganizer = auth.id && event.organizers.some(e => e.user.id === auth.id);

    if (!isManagerRole && !isOrganizer) {
      if (!event.published) return res.status(404).json({ error: "Event not found" });
      return res.status(403).json({ error: "Forbidden" });
    }

    if (event.endTime <= new Date()) {
      return res.status(410).json({ error: "Event has ended" });
    }

    const user = await prisma.user.findUnique({
      where: { utorid: trimmedUtorid },
      select: { id: true, utorid: true, name: true },
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (event.organizers.some(o => o.user.id === user.id)) {
      return res.status(400).json({ error: "User is already an organizer" });
    }

    const existingGuest = event.guests.find(g => g.user.id === user.id);
    if (existingGuest) {
      const confirmedCount = await prisma.eventGuest.count({ where: { eventId, confirmed: true } });
      return res.status(201).json({
        id: event.id,
        name: event.name,
        location: event.location,
        guestAdded: existingGuest.user,
        numGuests: confirmedCount,
      });
    }

    const confirmedCount = await prisma.eventGuest.count({ where: { eventId, confirmed: true } });
    if (typeof event.capacity === "number" && confirmedCount >= event.capacity) {
      return res.status(410).json({ message: "Event is at full capacity." });
    }

    await prisma.eventGuest.create({
      data: { eventId, userId: user.id, confirmed: true, confirmedAt: new Date() },
    });

    return res.status(201).json({
      id: event.id,
      name: event.name,
      location: event.location,
      guestAdded: { id: user.id, utorid: user.utorid, name: user.name },
      numGuests: confirmedCount + 1,
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:eventId/guests/me", async (req, res) => {
  try {
    const auth = req.auth || {};
    const role = auth.role;
    if (!isRegularOrHigher(role)) return res.status(403).json({ error: "Forbidden" });

    const userId = auth.id;
    if (!Number.isInteger(userId)) return res.status(403).json({ error: "Forbidden" });

    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) return res.status(404).json({ error: "Event not found" });

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        location: true,
        endTime: true,
        published: true,
        capacity: true,
        organizers: { select: { userId: true } },
      },
    });
    if (!event || !event.published) return res.status(404).json({ error: "Event not found" });

    if (event.organizers.some((o) => o.userId === userId)) {
      return res.status(400).json({ error: "Organizer cannot self-register as guest" });
    }

    if (event.endTime <= new Date()) return res.status(410).json({ error: "Event has ended" });

    try {
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.eventGuest.findUnique({
          where: { eventId_userId: { eventId, userId } },
        });
        if (existing) return { already: true };

        const confirmedCount = await tx.eventGuest.count({
          where: { eventId, confirmed: true },
        });
        if (event.capacity !== null && typeof event.capacity === "number" && confirmedCount >= event.capacity) {
          return { full: true };
        }

        await tx.eventGuest.create({
          data: { eventId, userId, confirmed: true, confirmedAt: new Date() },
        });

        return { already: false, full: false, confirmedCount: confirmedCount + 1 };
      });

      if (result.already) return res.status(400).json({ error: "Already on guest list" });
      if (result.full) return res.status(410).json({ error: "Event is full" });

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, utorid: true, name: true },
      });

      return res.status(201).json({
        id: event.id,
        name: event.name,
        location: event.location,
        guestAdded: user,
        numGuests: result.confirmedCount,
      });
    } catch {
      return res.status(500).json({ error: "Internal server error" });
    }
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:eventId/guests/me", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!["regular", "cashier", "manager", "superuser"].includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const userIdRaw = req.auth?.id;
    const userId = typeof userIdRaw === "number" ? userIdRaw : parseInt(userIdRaw, 10);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(403).json({ error: "Forbidden" });

    const eventId = Number(req.params.eventId);
    if (!Number.isFinite(eventId) || eventId <= 0) return res.status(404).json({ error: "Event not found" });

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { endTime: true, published: true },
    });
    if (!event) return res.status(404).json({ error: "Event not found" });

    if (event.endTime <= new Date()) return res.status(410).json({ error: "Event has ended" });

    if (!event.published) return res.status(404).json({ error: "Event not found" });

    const guest = await prisma.eventGuest.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!guest) return res.status(404).json({ error: "Guest not found" });

    await prisma.eventGuest.delete({
      where: { eventId_userId: { eventId, userId } },
    });

    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:eventId/guests/:userId", async (req, res) => {
  try {
    const role = req.auth?.role;
    if (!isManagerOrHigher(role)) return res.status(403).json({ error: "Forbidden" });

    const eventId = Number(req.params.eventId);
    const userId = Number(req.params.userId);
    if (!Number.isInteger(eventId) || eventId <= 0) return res.status(404).json({ error: "Event not found" });
    if (!Number.isInteger(userId) || userId <= 0) return res.status(404).json({ error: "Guest not found" });

    const guest = await prisma.eventGuest.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!guest) return res.status(404).json({ error: "Guest not found" });

    await prisma.eventGuest.delete({
      where: { eventId_userId: { eventId, userId } },
    });

    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:eventId/transactions", async (req, res) => {
  try {
    const auth = req.auth || {};
    const role = auth.role;
    const userId = auth.id;
    if (!userId || !isRegularOrHigher(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(404).json({ error: "Event not found" });
    }
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        organizers: { select: { userId: true } },
        guests: { select: { userId: true } },
      },
    });
    if (!event) return res.status(404).json({ error: "Event not found" });
    const isManagerRole = isManagerOrHigher(role);
    const isOrganizer = event.organizers.some((org) => org.userId === userId);
    if (!isManagerRole && !isOrganizer) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const creator = await prisma.user.findUnique({
      where: { id: userId },
      select: { utorid: true },
    });
    if (!creator) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const createdByUtorid = creator.utorid;
    const { type, utorid, amount } = req.body || {};
    if (type !== "event") {
      return res.status(400).json({ error: "Invalid transaction type" });
    }
    const amountNumber = Number(amount);
    if (!Number.isInteger(amountNumber) || amountNumber <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    if (event.pointsRemain < amountNumber) {
      return res.status(400).json({ error: "Insufficient points remaining" });
    }
    const awardToAll = utorid === undefined || utorid === null || utorid === "";
    if (awardToAll) {
      const guestUserIds = event.guests.map((guest) => guest.userId);
      if (!guestUserIds.length) {
        return res.status(400).json({ error: "No guests to award" });
      }
      if (event.pointsRemain < amountNumber * guestUserIds.length) {
        return res.status(400).json({ error: "Insufficient points remaining" });
      }
      const created = await prisma.$transaction(async (tx) => {
        const createdTransactions = [];
        for (const guestId of guestUserIds) {
          const txRecord = await tx.transaction.create({
            data: {
              type: "event",
              amount: amountNumber,
              remark: "",
              userId: guestId,
              createdById: userId,
              eventId,
            },
            select: { id: true, user: { select: { utorid: true } } },
          });
          await tx.user.update({
            where: { id: guestId },
            data: { points: { increment: amountNumber } },
          });
          createdTransactions.push(txRecord);
        }
        await tx.event.update({
          where: { id: eventId },
          data: { pointsRemain: { decrement: amountNumber * guestUserIds.length } },
        });
        return createdTransactions;
      });
      return res.status(201).json(
        created.map((txRecord) => ({
          id: txRecord.id,
          recipient: txRecord.user?.utorid ?? null,
          awarded: amountNumber,
          type: "event",
          relatedId: eventId,
          remark: "",
          createdBy: createdByUtorid,
        }))
      );
    }
    const guest = await prisma.user.findUnique({
      where: { utorid: utorid.trim() },
      select: { id: true, utorid: true },
    });
    if (!guest) return res.status(404).json({ error: "User not found" });
    if (!event.guests.some((g) => g.userId === guest.id)) {
      return res.status(400).json({ error: "User not a guest" });
    }
    const createdTx = await prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          type: "event",
          amount: amountNumber,
          remark: "",
          userId: guest.id,
          createdById: userId,
          eventId,
        },
        select: { id: true },
      });
      await tx.user.update({
        where: { id: guest.id },
        data: { points: { increment: amountNumber } },
      });
      await tx.event.update({
        where: { id: eventId },
        data: { pointsRemain: { decrement: amountNumber } },
      });
      return created;
    });
    return res.status(201).json({
      id: createdTx.id,
      recipient: guest.utorid,
      awarded: amountNumber,
      type: "event",
      relatedId: eventId,
      remark: "",
      createdBy: createdByUtorid,
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
