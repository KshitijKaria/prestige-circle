// src/components/EventsPage.jsx
import React from "react";
import { useSearchParams, Link } from "react-router-dom";
import { FiClock, FiMapPin, FiUsers, FiCheck } from "react-icons/fi";
import { useAuth } from "../contexts/AuthContext";
import "./EventsPage.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:3000";

export default function EventsPage() {
  const { token, user, currentInterface } = useAuth();
  const isManagerRole = user?.role === "manager" || user?.role === "superuser";
  const isManagerInterface = currentInterface === "manager" || currentInterface === "superuser";
  const canManage = isManagerRole && isManagerInterface;
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") || 1);
  const limit = Number(params.get("limit") || 9);

  const [items, setItems] = React.useState([]);
  const [totalPages, setTotalPages] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState("all"); // all | rsvp | past | organizer

  // After loading the list, mark which events the current user is RSVP'ed to.
  const markMyRsvps = React.useCallback(async (list) => {
    if (!user || !token) return;
    try {
      // Only check events that don't already tell us meRsvped
      const toCheck = (list || []).filter(ev => ev && ev.id && typeof ev.meRsvped !== 'boolean');

      const results = await Promise.all(
        toCheck.map(async (ev) => {
          try {
            // Try a membership probe: GET /events/:id/guests/me
            const r = await fetch(`${API}/events/${ev.id}/guests/me`, {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            });
            if (r.ok) return { id: ev.id, me: true };
            if (r.status === 404) return { id: ev.id, me: false };
            // Some backends may return 204 for not found — treat non-OK/non-404 as unknown.
            return { id: ev.id, me: false };
          } catch {
            return { id: ev.id, me: false };
          }
        })
      );

      if (!results.length) return;

      setItems(prev =>
        prev.map(ev => {
          const hit = results.find(x => x.id === ev.id);
          return hit ? { ...ev, meRsvped: hit.me } : ev;
        })
      );
    } catch {
      // ignore probe errors silently
    }
  }, [token, user]);

  const backfillDescriptions = React.useCallback(async (list) => {
    const toLoad = (list || []).filter((ev) => {
      const d = eventDescription(ev);
      const hasOrgInfo = Array.isArray(ev.organizers) && ev.organizers.length;
      const hasOrgIds = Array.isArray(ev.organizerIds) && ev.organizerIds.length;
      return (!d || d === "No description provided yet.") || (!hasOrgInfo && !hasOrgIds);
    });
    if (!toLoad.length) return;

    await Promise.all(
      toLoad.map(async (ev) => {
        try {
          const r = await fetch(`${API}/events/${ev.id}`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          });
          if (!r.ok) return;
          const full = await r.json();
          const desc = eventDescription(full);
          const orgs = normalizeOrganizers(full);
          const orgIds = organizerIds(full);
          const pts = eventPoints(full);

          setItems((prev) =>
            prev.map((x) => {
              if (x.id !== ev.id) return x;
              const next = { ...x };
              if (desc && desc !== "No description provided yet.") next.description = desc;
              if (orgs && orgs.length) next.organizers = orgs;
              if (orgIds && orgIds.length) next.organizerIds = orgIds;
              if (typeof pts === "number" && pts > 0) next.points = pts;
              return next;
            })
          );
        } catch {}
      })
    );
  }, [token]);

  React.useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setErr("");

    // showFull=true ensures full events remain visible instead of being filtered out by the backend
    fetch(`${API}/events?page=${page}&limit=${limit}&showFull=true&includeMe=true${canManage ? "" : "&published=true"}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.text()) || r.statusText);
        return r.json();
      })
      .then((data) => {
        const raw =
          data.items ||
          data.results ||
          data.events ||
          (Array.isArray(data) ? data : []);
        const normalized = raw.map((ev) => ({
          ...ev,
          id: ev.id ?? ev._id ?? ev.eventId ?? ev.uuid,
          name: ev.name ?? ev.title ?? "",
          description:
            ev.description ??
            ev.eventDescription ??
            ev.longDescription ??
            ev.details ??
            ev.summary ??
            ev.desc ??
            ev.body ??
            "",
          location: ev.location ?? ev.where ?? "",
          startTime: ev.startTime ?? ev.start_time,
          endTime: ev.endTime ?? ev.end_time,
          guestsCount:
            ev.guestsCount ??
            ev.guests_count ??
            ev.numGuests ??
            (Array.isArray(ev.guests) ? ev.guests.length : undefined),
          points:
            ev.points ??
            ev.pointsBudget ??
            ev.bonusPoints ??
            ev.rewardPoints ??
            ev.pointsAwarded ??
            ev.awardPoints ??
            ev.points_budget ??
            ev.pointValue,
          organizers: normalizeOrganizers(ev),
          organizerIds: organizerIds(ev),
          published: toBoolPublished(ev),
        }));
        // Managers/superusers see all; others should rely on backend filtering. If `published` is missing, treat as published.
        const list = normalized; // rely on server-side ?published=true for non-managers
        setItems(list);
        markMyRsvps(list);
        backfillDescriptions(list);
        const total = data.total ?? data.count ?? list.length;
        setTotalPages(data.totalPages || Math.max(1, Math.ceil(total / limit)));
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setErr(e.message || "Failed to load events");
        }
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [token, page, limit, canManage, markMyRsvps, backfillDescriptions]);

  const visible = React.useMemo(() => {
    const now = new Date();
    let base = items;

    if (filter === "rsvp") {
      base = base.filter((e) => isMeRsvped(e, user?.id));
    } else if (filter === "past") {
      base = base.filter((e) => {
        const end = e.endTime ? new Date(e.endTime) : null;
        return end ? end < now : false;
      });
    } else if (filter === "organizer") {
      base = base.filter((e) => isOrganizerForMe(e, user?.id));
    } else {
      // "all": only upcoming/current, hide past
      base = base.filter((e) => {
        const end = e.endTime ? new Date(e.endTime) : null;
        return end ? end >= now : true;
      });
    }

    if (!q) return base;
    const s = q.toLowerCase();
    return base.filter((e) =>
      [e.name, e.title, e.location]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(s)
    );
  }, [items, q, filter, user?.id]);

  async function rsvp(eventId) {
    try {
      const r = await fetch(`${API}/events/${eventId}/guests/me`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (!r.ok) {
        const t = await r.text();
        // If backend says the user is already a guest/RSVP'ed, nudge UI to Un-RSVP state
        if (/already/i.test(t) && /(guest|rsvp|registered)/i.test(t)) {
          setItems((prev) =>
            prev.map((ev) =>
              ev.id === eventId ? { ...ev, meRsvped: true } : ev
            )
          );
          toast("You're already RSVPed — use Un‑RSVP.");
          return;
        }
        throw new Error(t || r.statusText);
      }
      setItems((prev) =>
        prev.map((ev) =>
          (ev.id === eventId ? { ...ev, meRsvped: true, guestsCount: typeof ev.guestsCount === "number" ? ev.guestsCount + 1 : ev.guestsCount } : ev)
        )
      );
      revalidateQuiet();
      toast("RSVP successful.");
    } catch (e) {
      toast(friendlyError(e.message));
    }
  }

  async function unrsvp(eventId) {
    try {
      await fetch(`${API}/events/${eventId}/guests/me`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }).then(ensureOK);
      setItems((prev) =>
        prev.map((ev) =>
          (ev.id === eventId ? { ...ev, meRsvped: false, guestsCount: typeof ev.guestsCount === "number" && ev.guestsCount > 0 ? ev.guestsCount - 1 : ev.guestsCount } : ev)
        )
      );
      revalidateQuiet();
      toast("Your RSVP was removed.");
    } catch (e) {
      toast(friendlyError(e.message));
    }
  }

  async function revalidateQuiet() {
    try {
      const r = await fetch(
        `${API}/events?page=${page}&limit=${limit}&showFull=true&includeMe=true${canManage ? "" : "&published=true"}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!r.ok) return;
      const data = await r.json();
      const raw =
        data.items ||
        data.results ||
        data.events ||
        (Array.isArray(data) ? data : []);
      const normalized = raw.map((ev) => ({
        ...ev,
        id: ev.id ?? ev._id ?? ev.eventId ?? ev.uuid,
        name: ev.name ?? ev.title ?? "",
        description:
          ev.description ??
          ev.eventDescription ??
          ev.longDescription ??
          ev.details ??
          ev.summary ??
          ev.desc ??
          ev.body ??
          "",
        location: ev.location ?? ev.where ?? "",
        startTime: ev.startTime ?? ev.start_time,
        endTime: ev.endTime ?? ev.end_time,
        guestsCount:
          ev.guestsCount ??
          ev.guests_count ??
          ev.numGuests ??
          (Array.isArray(ev.guests) ? ev.guests.length : undefined),
        points:
          ev.points ??
          ev.pointsBudget ??
          ev.bonusPoints ??
          ev.rewardPoints ??
          ev.pointsAwarded ??
          ev.awardPoints ??
          ev.points_budget ??
          ev.pointValue,
        organizers: normalizeOrganizers(ev),
        organizerIds: organizerIds(ev),
        published: toBoolPublished(ev),
      }));
      setItems(normalized);
      await markMyRsvps(normalized);
      await backfillDescriptions(normalized);
      const total = data.total ?? data.count ?? normalized.length;
      setTotalPages(data.totalPages || Math.max(1, Math.ceil(total / limit)));
    } catch {
      // quiet revalidate errors
    }
  }

  function onPage(p) {
    setParams({ page: String(p), limit: String(limit) });
  }

  return (
    <div className="pc-wrapper">
      <div className="pc-card u-flex u-justify-between u-items-start u-mb-12">
        <div>
          <h2 className="pc-title u-m-0">Events</h2>
          <p className="pc-subtitle">Discover and RSVP to upcoming events.</p>
        </div>
        {canManage && (
          <Link to="/events/new" className="pc-btn">+ New Event</Link>
        )}
      </div>

      <div className="pc-card u-mb-12">
        <input
          aria-label="Search events"
          placeholder="Search events or locations…"
          className="pc-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="pc-card u-mb-12">
        <div className="pc-filter-row">
          {[
            { key: "all", label: "All Events" },
            { key: "rsvp", label: "My RSVP's" },
            { key: "past", label: "Past Events" },
            { key: "organizer", label: "I'm Organizer" },
          ].map((f) => (
            <button
              key={f.key}
              className={`pc-filter ${filter === f.key ? "active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="pc-card">
          <div className="pc-skel" style={{ height: 20, width: 180 }} />
          <div className="pc-grid u-mt-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="pc-card pc-event">
                <div className="pc-skel" style={{ height: 20, width: "75%" }} />
                <div
                  className="pc-skel"
                  style={{ height: 16, width: "50%", marginTop: 8 }}
                />
                <div
                  className="pc-skel"
                  style={{ height: 36, width: "100%", marginTop: 14 }}
                />
              </div>
            ))}
          </div>
        </div>
      ) : err ? (
        <div className="pc-card pc-error">Failed to load: {err}</div>
      ) : (
        <div className="pc-card">
          {!visible.length ? (
            <div className="pc-empty">
              {q ? `No events match “${q}”.` : "No events available."}
            </div>
          ) : (
            <div className="pc-grid pc-grid-single">
              {visible.map((e) => {
                const meRsvped = isMeRsvped(e, user?.id);
                const can = canRsvp(e);
                const desc = eventDescription(e);
                return (
                  <article key={e.id || e._id || e.eventId} className="pc-card pc-event">
                    <div className="pc-event-row">
                      <div className="pc-date">
                        <div className="pc-date-month">{dateMonth(e)}</div>
                        <div className="pc-date-day">{dateDay(e)}</div>
                      </div>

                      <div className="pc-event-main">
                        <div className="pc-head u-mb-8">
                          <div className="pc-badges">
                            {meRsvped && (
                              <span className="pc-pill ok">
                                <FiCheck aria-hidden />
                                <span>RSVP’d</span>
                              </span>
                            )}
                            {!meRsvped && e.published !== undefined && (
                              <span className={`pc-pill ${e.published ? "ghost" : ""}`}>
                                {e.published ? "Published" : "Unpublished"}
                              </span>
                            )}
                          </div>
                        </div>

                        <h3 className="pc-name pc-title">{e.name || e.title}</h3>
                        {desc && <p className="pc-desc-muted">{desc}</p>}

                        <div className="pc-info-row">
                          {timeRange(e) && (
                            <span className="pc-info-chip">
                              <FiClock aria-hidden /> {timeRange(e)}
                            </span>
                          )}
                          {e.location && (
                            <span className="pc-info-chip">
                              <FiMapPin aria-hidden /> {e.location}
                            </span>
                          )}
                          {capacityCount(e) && (
                            <span className="pc-info-chip">
                              <FiUsers aria-hidden /> {capacityCount(e)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pc-actions-col">
                        <div className="pc-actions-stack">
                          {meRsvped ? (
                            <button
                              className="pc-btn danger wide"
                              onClick={() => unrsvp(e.id)}
                              aria-label={`Un-RSVP from ${e.name || e.title}`}
                            >
                              Cancel RSVP
                            </button>
                          ) : (
                            <button
                              className="pc-btn wide"
                              onClick={() => rsvp(e.id)}
                              disabled={!can}
                              aria-disabled={!can}
                              title={
                                !can
                                  ? (isFull(e) ? "Capacity reached" : "This event has ended")
                                  : ""
                              }
                              aria-label={`RSVP to ${e.name || e.title}`}
                            >
                              RSVP
                            </button>
                          )}
                          <Link
                            className="pc-btn secondary wide"
                            to={`/events/${e.id}`}
                            aria-label={`View details for ${e.name || e.title}`}
                          >
                            View Details
                          </Link>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <footer className="pc-pager">
            <button
              className="pc-btn secondary"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
            >
              Prev
            </button>
            <span className="pc-page">
              Page {page} / {totalPages}
            </span>
            <button
              className="pc-btn secondary"
              disabled={page >= totalPages}
              onClick={() => onPage(page + 1)}
            >
              Next
            </button>
          </footer>
        </div>
      )}

      <Toasts />
    </div>
  );
}

/* ---------------- helpers ---------------- */

function toBoolPublished(ev) {
  if ("published" in ev) return !!ev.published;
  if ("is_published" in ev) return !!ev.is_published;
  if ("isPublished" in ev) return !!ev.isPublished;
  if (typeof ev.status === "string") {
    return ev.status.toLowerCase() === "published";
  }
  // If the backend omits the field for regular users, leave it undefined
  return undefined;
}

function ensureOK(r) {
  if (!r.ok) throw new Error(r.statusText);
  return r;
}

function friendlyError(message) {
  // Normalize to a plain string first
  let msg = typeof message === "string" ? message : "";
  try {
    const parsed = JSON.parse(msg);
    if (parsed && typeof parsed === "object") {
      msg = parsed.error || parsed.message || msg;
    }
  } catch {
  }

  if (/event\s+not\s+found/i.test(msg) || /not\s+found/i.test(msg)) {
    return "Cannot RSVP to an unpublished event.";
  }
  if (/401|unauthorized/i.test(msg)) return "Please log in again.";
  if (/403|forbidden/i.test(msg))   return "You don’t have permission.";
  if (/capacity|full/i.test(msg))   return "Event is full.";
  if (/ended|past/i.test(msg))      return "This event has already ended.";
  if (/already/i.test(msg) && /(guest|rsvp|registered)/i.test(msg)) {
    return "You're already RSVPed — use Un-RSVP.";
  }
  return msg || "Something went wrong.";
}

function isMeRsvped(e, meId) {
  if (typeof e?.meRsvped === "boolean") return e.meRsvped;
  if (typeof e?.rsvped === "boolean") return e.rsvped;
  if (typeof e?.isRsvped === "boolean") return e.isRsvped;
  if (typeof e?.registered === "boolean") return e.registered;
  if (Array.isArray(e?.guests) && meId != null) {
    const my = String(meId);
    return e.guests.some((g) => String(g?.userId ?? g?.id) === my);
  }
  return false;
}

function canRsvp(e) {
  const ended = e.endTime ? new Date(e.endTime) < new Date() : false;
  const isFull =
    typeof e.guestsCount === "number" && typeof e.capacity === "number"
      ? e.guestsCount >= e.capacity
      : Array.isArray(e.guests) && typeof e.capacity === "number"
      ? e.guests.length >= e.capacity
      : false;
  return !ended && !isFull;
}

function isFull(e) {
  if (typeof e?.capacity !== "number") return false;
  const used =
    typeof e?.guestsCount === "number"
      ? e.guestsCount
      : Array.isArray(e?.guests)
      ? e.guests.length
      : 0;
  return used >= e.capacity && e.capacity >= 0;
}

function spotsLeft(e) {
  if (typeof e?.capacity !== "number") return null;
  const used =
    typeof e?.guestsCount === "number"
      ? e.guestsCount
      : Array.isArray(e?.guests)
      ? e.guests.length
      : 0;
  return Math.max(0, e.capacity - used);
}

function capacityText(e) {
  if (typeof e?.capacity !== "number") return "";
  const full = isFull(e);
  const left = spotsLeft(e);
  return full ? "Capacity reached" : `${left} spots left`;
}

function fmtWhen(e) {
  if (e.when) return e.when;
  const s = e.startTime ? new Date(e.startTime) : null;
  const t = e.endTime ? new Date(e.endTime) : null;
  const optsDate = { year: "numeric", month: "short", day: "numeric" };
  const optsTime = { hour: "numeric", minute: "2-digit" };
  if (s && t) {
    return `${s.toLocaleDateString(undefined, optsDate)}, ${s.toLocaleTimeString(
      undefined,
      optsTime
    )} – ${t.toLocaleTimeString(undefined, optsTime)}`;
  }
  if (s)
    return `${s.toLocaleDateString(undefined, optsDate)}, ${s.toLocaleTimeString(
      undefined,
      optsTime
    )}`;
  return "";
}

function dateMonth(e) {
  const d = e?.startTime ? new Date(e.startTime) : e?.endTime ? new Date(e.endTime) : new Date();
  return d.toLocaleString(undefined, { month: "short" }).toUpperCase();
}

function dateDay(e) {
  const d = e?.startTime ? new Date(e.startTime) : e?.endTime ? new Date(e.endTime) : new Date();
  return d.getDate();
}

function timeRange(e) {
  const s = e?.startTime ? new Date(e.startTime) : null;
  const t = e?.endTime ? new Date(e.endTime) : null;
  const fmt = { hour: "numeric", minute: "2-digit" };
  if (s && t) return `${s.toLocaleTimeString(undefined, fmt)} – ${t.toLocaleTimeString(undefined, fmt)}`;
  if (s) return s.toLocaleTimeString(undefined, fmt);
  if (t) return t.toLocaleTimeString(undefined, fmt);
  return "";
}

function capacityCount(e) {
  if (typeof e?.capacity !== "number") return "";
  const used =
    typeof e?.guestsCount === "number"
      ? e.guestsCount
      : Array.isArray(e?.guests)
      ? e.guests.length
      : 0;
  return `${used}/${e.capacity}`;
}

function organizerIds(ev) {
  const ids =
    ev?.organizerIds ||
    ev?.organizer_ids ||
    ev?.organizerIDs ||
    ev?.organizers_ids ||
    ev?.hosts ||
    ev?.hostIds;
  if (Array.isArray(ids)) return ids.map((x) => String(x));
  return [];
}

function normalizeOrganizers(ev) {
  if (Array.isArray(ev?.organizers)) return ev.organizers;
  if (Array.isArray(ev?.organizer)) return ev.organizer;
  if (Array.isArray(ev?.hosts)) return ev.hosts;
  return [];
}

function isOrganizerForMe(e, meId) {
  if (!meId) return false;
  const me = String(meId);
  if (Array.isArray(e?.organizerIds)) {
    if (e.organizerIds.some((id) => String(id) === me)) return true;
  }
  if (Array.isArray(e?.organizer_ids)) {
    if (e.organizer_ids.some((id) => String(id) === me)) return true;
  }
  if (Array.isArray(e?.organizers)) {
    return e.organizers.some((o) => String(o?.id ?? o?.userId) === me);
  }
  return false;
}

function eventPoints(e) {
  const candidates = [
    e?.points,
    e?.pointsBudget,
    e?.bonusPoints,
    e?.rewardPoints,
    e?.pointsAwarded,
    e?.awardPoints,
    e?.points_budget,
    e?.pointValue,
  ];
  for (const v of candidates) {
    if (v === undefined || v === null) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}


function eventDescription(e) {
  const candidates = [
    e?.description,
    e?.eventDescription,
    e?.longDescription,
    e?.details,
    e?.summary,
    e?.desc,
    e?.body,
    e?.about,
    e?.text,
    e?.subtitle,
    e?.info,
  ];

  const firstDefined = candidates.find((v) => v !== undefined && v !== null);
  if (firstDefined !== undefined && firstDefined !== null) {
    const asString = String(firstDefined);
    if (asString && asString !== "[object Object]") return asString.trim();
  }

  // If a rich object slipped through, try its string form from description specifically
  if (typeof e?.description === "object" && e?.description) {
    const asString = String(e.description);
    if (asString && asString !== "[object Object]") return asString;
  }
  return "No description provided yet.";
}

/* ---------------- tiny toast system ---------------- */

let toastId = 0;
const listeners = new Set();
function pushToast(msg) {
  const id = ++toastId;
  listeners.forEach((fn) => fn({ id, text: msg }));
  setTimeout(() => {
    listeners.forEach((fn) => fn({ id, remove: true }));
  }, 2500);
}
function toast(msg) {
  pushToast(msg);
}
function Toasts() {
  const [toasts, setToasts] = React.useState([]);
  React.useEffect(() => {
    const onEvent = (e) => {
      setToasts((prev) =>
        e.remove ? prev.filter((t) => t.id !== e.id) : [...prev, e]
      );
    };
    listeners.add(onEvent);
    return () => listeners.delete(onEvent);
  }, []);
  return (
    <div className="pc-toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="pc-toast">
          <span>{t.text}</span>
          <button
            onClick={() =>
              setToasts((prev) => prev.filter((x) => x.id !== t.id))
            }
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
