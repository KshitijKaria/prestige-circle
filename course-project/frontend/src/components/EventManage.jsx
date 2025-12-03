// src/components/EventManage.jsx
import React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "./EventsPage.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:3000";

export default function EventManage() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = React.useState("overview");
  const [event, setEvent] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  const [organizers, setOrganizers] = React.useState([]);
  const [guests, setGuests] = React.useState([]);

  React.useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setErr("");

    fetch(`${API}/events/${id}`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    })
      .then(justJSON)
      .then((ev) => {
        setEvent(ev);
        setOrganizers(normalizeUsers(ev.organizers || []));
        setGuests(normalizeGuests(ev.guests || []));
      })
      .catch((e) => {
        if (e.name !== "AbortError") setErr(e.message || "Failed to load");
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [id, token]);

  const canManage =
    user &&
    (user.role === "manager" ||
      user.role === "superuser" ||
      isOrganizer(organizers, user.id));
  const isManager = user && (user.role === "manager" || user.role === "superuser");
  const isOrganizerForEvent = isOrganizer(organizers, user?.id);
  const canEditEvent = isManager || isOrganizerForEvent;           // PATCH /events/:id
  const canPublish = isManager;                                     // only managers can set published
  const canEditPoints = isManager || isOrganizerForEvent;           // budget edits
  const canManageOrganizers = isManager;                            // POST/DELETE organizers
  const canAddGuests = isManager || isOrganizerForEvent;            // POST guests
  const canRemoveGuests = isManager;                                // DELETE guests
  const canAwardPoints = isManager || isOrganizerForEvent;          // POST /events/:id/transactions

  /* ---------- Overview form ---------- */
  const [form, setForm] = React.useState({
    name: "",
    description: "",
    location: "",
    startTime: "",
    endTime: "",
    capacity: "",
    points: "",
    published: false,
  });

  React.useEffect(() => {
    if (!event) return;
    setForm({
      name: event.name || "",
      description: event.description || "",
      location: event.location || "",
      startTime: toLocalInput(event.startTime),
      endTime: toLocalInput(event.endTime),
      capacity: event.capacity ?? "",
      points: typeof event.pointsRemain === "number" && typeof event.pointsAwarded === "number"
        ? event.pointsRemain + event.pointsAwarded
        : event.points ?? "",
      published: !!event.published,
    });
  }, [event]);

  async function saveOverview() {
    if (!canEditEvent) return toast("You don’t have permission.");
    // Do not allow unpublishing once an event has been published
    if (event?.published && !form.published) {
      return toast("Cannot Unpublish a Published Event");
    }
    try {
      // Build a PATCH payload that only includes valid, user-edited fields.
      const payload = {};
      const trim = (v) => (typeof v === "string" ? v.trim() : v);

      // Text fields: include only if non-empty
      if (trim(form.name))        payload.name = trim(form.name);
      if (trim(form.description)) payload.description = trim(form.description);
      if (trim(form.location))    payload.location = trim(form.location);

      // Time fields: include only if provided, and only as ISO strings
      if (form.startTime) {
        const iso = fromLocalInput(form.startTime);
        if (iso) payload.startTime = iso; // don't send nulls
      }
      if (form.endTime) {
        const iso = fromLocalInput(form.endTime);
        if (iso) payload.endTime = iso; // don't send nulls
      }

      // Capacity: include only if user typed a number
      if (form.capacity !== "") {
        const n = Number(form.capacity);
        if (Number.isFinite(n)) payload.capacity = n;
      }

      // Points (budget): managers only, positive integer
      if (form.points !== "" && canEditPoints) {
        const n = Number(form.points);
        if (!Number.isInteger(n) || n < 0) {
          return toast("Points budget must be a non-negative integer.");
        }
        payload.points = n;
      }

      // Published: only managers can set it; only allow setting to true
      if (canPublish && !event?.published && form.published === true) {
        payload.published = true;
      }

      // If nothing changed, short-circuit
      if (Object.keys(payload).length === 0) {
        toast("Nothing to update.");
        return;
      }

      // Try PATCH first, fallback to PUT if the server requires it
      let r = await fetch(`${API}/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!r.ok && (r.status === 405 || r.status === 404)) {
        r = await fetch(`${API}/events/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
      }
      if (!r.ok) {
        const txt = await r.text();
        const errMsg = friendlyError(txt || r.statusText);
        return toast(errMsg);
      }
      toast("Event updated.");

      // Refresh from server (ensures normalized timestamps etc.)
      const fresh = await fetch(`${API}/events/${id}`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      }).then(justJSON);
      setEvent(fresh);
      setOrganizers(normalizeUsers(fresh.organizers || []));
      setGuests(normalizeGuests(fresh.guests || []));
      setForm({
        name: fresh.name || "",
        description: fresh.description || "",
        location: fresh.location || "",
        startTime: toLocalInput(fresh.startTime),
        endTime: toLocalInput(fresh.endTime),
        capacity: fresh.capacity ?? "",
        published: !!fresh.published,
      });
    } catch (e) {
      toast(friendlyError(e.message));
    }
  }

  /* ---------- Organizers ---------- */
  const [organizerQuery, setOrganizerQuery] = React.useState(""); // UTORid
  const [guestQuery, setGuestQuery] = React.useState(""); // UTORid

  // --- autocomplete for organizers (by UTORid) ---
  const searchUsers = React.useCallback(async (q) => {
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    // Normalize any server payload into a consistent list of {id, utorid, name, email}
    const normalize = (data) => {
      const list = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data?.users)
        ? data.users
        : Array.isArray(data)
        ? data
        : [];
      return list.map((u) => ({
        id: u.id ?? u.userId ?? u._id ?? u.email ?? u.utorid,
        utorid: u.utorid ?? u.username ?? u.email ?? "",
        name: u.name ?? "",
        email: u.email ?? "",
      }));
    };

    const applyFilter = (arr) => {
      const s = (q || "").toLowerCase();
      if (!s) return arr.slice(0, 8);

      // Keep matches that contain the substring in utorid/name/email
      const matches = arr.filter((u) => {
        const id = (u.utorid || "").toLowerCase();
        const nm = (u.name || "").toLowerCase();
        const em = (u.email || "").toLowerCase();
        return id.includes(s) || nm.includes(s) || em.includes(s);
      });

      // Sort so prefix matches (startsWith) appear first
      matches.sort((a, b) => {
        const aStart =
          (a.utorid || "").toLowerCase().startsWith(s) ||
          (a.name || "").toLowerCase().startsWith(s) ||
          (a.email || "").toLowerCase().startsWith(s);
        const bStart =
          (b.utorid || "").toLowerCase().startsWith(s) ||
          (b.name || "").toLowerCase().startsWith(s) ||
          (b.email || "").toLowerCase().startsWith(s);
        return aStart === bStart ? 0 : aStart ? -1 : 1;
      });

      // De-duplicate by id/utorid and cap at 8
      const seen = new Set();
      const out = [];
      for (const u of matches) {
        const key = u.id ?? u.utorid;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(u);
        }
        if (out.length >= 8) break;
      }
      return out;
    };

    // Try a server-side search first; still apply client-side filter.
    try {
      const r = await fetch(`${API}/users?search=${encodeURIComponent(q)}`, { headers });
      if (r.ok) {
        const data = await r.json();
        return applyFilter(normalize(data));
      }
    } catch {}

    // Fallback: fetch all and filter on the client.
    try {
      const r = await fetch(`${API}/users`, { headers });
      if (r.ok) {
        const data = await r.json();
        return applyFilter(normalize(data));
      }
    } catch {}

    return [];
  }, [token]);

  const [orgSuggest, setOrgSuggest] = React.useState([]);
  const [orgDrop, setOrgDrop] = React.useState(false);
  const orgWrapRef = React.useRef(null);

  // --- autocomplete for guests (by UTORid) ---
  const [guestSuggest, setGuestSuggest] = React.useState([]);
  const [guestDrop, setGuestDrop] = React.useState(false);
  const guestWrapRef = React.useRef(null);

  React.useEffect(() => {
    if (!organizerQuery.trim()) {
      setOrgSuggest([]);
      setOrgDrop(false);
      return;
    }
    const q = organizerQuery.trim();
    const t = setTimeout(async () => {
      const res = await searchUsers(q);
      setOrgSuggest(res);
      setOrgDrop(true);
    }, 250);
    return () => clearTimeout(t);
  }, [organizerQuery, searchUsers]);

  React.useEffect(() => {
    function onDocClick(e) {
      if (orgWrapRef.current && !orgWrapRef.current.contains(e.target)) {
        setOrgDrop(false);
      }
      if (guestWrapRef.current && !guestWrapRef.current.contains(e.target)) {
        setGuestDrop(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);
  // --- autocomplete effect for guests (by UTORid) ---
  React.useEffect(() => {
    if (!guestQuery.trim()) {
      setGuestSuggest([]);
      setGuestDrop(false);
      return;
    }
    const q = guestQuery.trim();
    const t = setTimeout(async () => {
      const res = await searchUsers(q);
      // Filter out users who are already guests (by utorid/email/id)
      const existing = new Set((guests || []).map((g) => keyOfUser(g)));
      const filtered = (res || []).filter((u) => {
        const key = keyOfUser(u);
        return key && !existing.has(key);
      });
      setGuestSuggest(filtered);
      setGuestDrop(true);
    }, 250);
    return () => clearTimeout(t);
  }, [guestQuery, searchUsers, guests]);
  async function addOrganizer() {
    if (!canManageOrganizers) return toast("Only managers can add organizers.");
    const typed = (organizerQuery || "").trim();
    if (!typed) return toast("Enter UTORid.");
    const key = typed.toLowerCase();

    // Client-side conflict checks for clearer errors
    if (Array.isArray(organizers) && organizers.some(o => keyOfUser(o) === key)) {
      return toast(`${typed} is already an organiser`);
    }
    if (Array.isArray(guests) && guests.some(g => keyOfUser(g) === key)) {
      return toast(`${typed} is already a guest`);
    }

    try {
      const r = await fetch(`${API}/events/${id}/organizers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ utorid: typed }), // spec requires {utorid}
      });
      if (!r.ok) {
        // Try to produce clearer messages if server reports conflicts
        const t = await r.text();
        if (/already/i.test(t) && /guest/i.test(t)) return toast(`${typed} is already a guest`);
        if (/already/i.test(t) && /organizer|organiser/i.test(t)) return toast(`${typed} is already an organiser`);
        ensureOK({ ok: false, statusText: t || r.statusText });
      }
      toast("Organizer added.");
      setOrganizerQuery("");

      const fresh = await fetch(`${API}/events/${id}`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      }).then(justJSON);
      setEvent(fresh);
      setOrganizers(normalizeUsers(fresh.organizers || []));
    } catch (e) {
      const msg = String(e.message || "");
      if (/already/i.test(msg) && /guest/i.test(msg)) return toast(`${typed} is already a guest`);
      if (/already/i.test(msg) && /organizer|organiser/i.test(msg)) return toast(`${typed} is already an organiser`);
      toast(friendlyError(e.message));
    }
  }
  async function removeOrganizer(uid) {
    if (!canManageOrganizers) return toast("Only managers can remove organizers.");
    try {
      const r = await fetch(`${API}/events/${id}/organizers/${uid}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      ensureOK(r);
      toast("Organizer removed.");
      setOrganizers((prev) => prev.filter((u) => u.id !== uid));
    } catch (e) {
      toast(friendlyError(e.message));
    }
  }

  /* ---------- Guests ---------- */
  async function addGuest() {
    if (!canAddGuests) return toast("You don’t have permission.");
    const typed = (guestQuery || "").trim();
    if (!typed) return toast("Enter UTORid.");
    const key = typed.toLowerCase();

    // Client-side conflict checks for clearer errors
    if (Array.isArray(guests) && guests.some(g => keyOfUser(g) === key)) {
      return toast(`${typed} is already a guest`);
    }
    if (Array.isArray(organizers) && organizers.some(o => keyOfUser(o) === key)) {
      return toast(`${typed} is already an organiser`);
    }

    try {
      const r = await fetch(`${API}/events/${id}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ utorid: typed }), // spec requires {utorid}
      });
      if (!r.ok) {
        // Try to produce clearer messages if server reports conflicts
        const t = await r.text();
        if (/already/i.test(t) && /guest/i.test(t)) return toast(`${typed} is already a guest`);
        if (/already/i.test(t) && /organizer|organiser/i.test(t)) return toast(`${typed} is already an organiser`);
        ensureOK({ ok: false, statusText: t || r.statusText });
      }
      toast("Guest added.");
      setGuestQuery("");

      const fresh = await fetch(`${API}/events/${id}`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      }).then(justJSON);
      setEvent(fresh);
      setGuests(normalizeGuests(fresh.guests || []));
    } catch (e) {
      const msg = String(e.message || "");
      if (/already/i.test(msg) && /guest/i.test(msg)) return toast(`${typed} is already a guest`);
      if (/already/i.test(msg) && /organizer|organiser/i.test(msg)) return toast(`${typed} is already an organiser`);
      toast(friendlyError(e.message));
    }
  }
  async function removeGuest(uid) {
    if (!canRemoveGuests) return toast("Only managers can remove guests.");
    try {
      const r = await fetch(`${API}/events/${id}/guests/${uid}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      ensureOK(r);
      toast("Guest removed.");
      setGuests((prev) => prev.filter((g) => g.userId !== uid));
    } catch (e) {
      toast(friendlyError(e.message));
    }
  }

  /* ---------- Award Points ---------- */
  const [pointsAmt, setPointsAmt] = React.useState("25");
  const [targetUtorid, setTargetUtorid] = React.useState("");

  async function awardSingle() {
    if (!canManage) return toast("You don’t have permission.");
    const amt = Number(pointsAmt);
    if (!amt || !Number.isFinite(amt)) return toast("Enter recipient and amount.");
    try {
      const r = await fetch(`${API}/events/${id}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "event", utorid: targetUtorid.trim(), amount: amt }),
      });
      if (!r.ok) {
        const txt = await r.text();
        if (/insufficient/i.test(txt)) {
          const budget = typeof event?.pointsRemain === "number" ? event.pointsRemain : null;
          return toast(`Out of budget${budget !== null ? ` — remaining: ${budget}` : ""}`);
        }
        const errMsg = friendlyError(txt || r.statusText);
        return toast(errMsg);
      }
      setEvent((prev) =>
        prev && typeof prev.pointsRemain === "number"
          ? { ...prev, pointsRemain: Math.max(0, prev.pointsRemain - amt) }
          : prev
      );
      toast("Points awarded.");
      setTargetUtorid("");
    } catch (e) {
      toast(friendlyError(e.message));
    }
  }

  async function awardAll() {
    if (!canManage) return toast("You don’t have permission.");
    const amt = Number(pointsAmt);
    if (!amt || !Number.isFinite(amt)) return toast("Enter amount.");
    const guestCount = Array.isArray(guests) ? guests.length : 0;
    try {
      const r = await fetch(`${API}/events/${id}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "event", amount: amt }),
      });
      if (!r.ok) {
        const txt = await r.text();
        if (/insufficient/i.test(txt)) {
          const budget = typeof event?.pointsRemain === "number" ? event.pointsRemain : null;
          return toast(`Out of budget${budget !== null ? ` — remaining: ${budget}` : ""}`);
        }
        const errMsg = friendlyError(txt || r.statusText);
        return toast(errMsg);
      }
      setEvent((prev) => {
        if (prev && typeof prev.pointsRemain === "number") {
          const spend = guestCount > 0 ? amt * guestCount : amt;
          return { ...prev, pointsRemain: Math.max(0, prev.pointsRemain - spend) };
        }
        return prev;
      });
      toast("Points awarded to all RSVPed.");
    } catch (e) {
      toast(friendlyError(e.message));
    }
  }

  async function deleteEvent() {
    if (!isManager) return toast("Only managers can delete events.");
    if (!event) return;
    if (event.published) {
      return toast("Cannot delete a published event. Unpublish first.");
    }
    const ok = window.confirm("Delete this event? This cannot be undone.");
    if (!ok) return;
    try {
      const r = await fetch(`${API}/events/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      ensureOK(r);
      toast("Event deleted.");
      navigate("/events");
    } catch (e) {
      toast(friendlyError(e.message));
    }
  }

  return (
    <div className="pc-wrapper">
      <div className="pc-card u-mb-12 u-flex u-gap-8 u-items-center u-justify-between">
        <div className="u-flex u-gap-8 u-items-center">
          <Link to="/events" className="pc-btn secondary">← Back</Link>
          <h2 className="pc-title u-m-0">{event?.name || "Manage Event"}</h2>
          <span className={`pc-badge ${event?.published ? "ok" : ""}`}>{event?.published ? "published" : "unpublished"}</span>
        </div>
        <nav className="u-flex u-gap-8">
          {["overview","organizers","guests","points"].map(k => (
            <button key={k} className={`pc-btn ${tab===k ? "" : "secondary"}`} onClick={()=> setTab(k)}>{titleCase(k)}</button>
          ))}
        </nav>
      </div>

      {loading ? (
        <div className="pc-card">
          <div className="pc-skel" style={{ height: 24, width: 220 }} />
          <div className="pc-skel" style={{ height: 16, width: "50%", marginTop: 10 }} />
          <div className="pc-skel" style={{ height: 120, width: "100%", marginTop: 16 }} />
        </div>
      ) : err ? (
        <div className="pc-card pc-error">Failed to load: {err}</div>
      ) : !canManage ? (
        <div className="pc-card pc-error">You don’t have permission to manage this event.</div>
      ) : (
        <>
          {tab === "overview" && (
            <div className="pc-card">
              <div className="pc-grid-240">
                <label className="pc-field">
                  <div className="pc-label">Name</div>
                  <input className="pc-input" value={form.name} onChange={(e)=> setForm({...form, name: e.target.value})} />
                </label>
                <label className="pc-field">
                  <div className="pc-label">Location</div>
                  <input className="pc-input" value={form.location} onChange={(e)=> setForm({...form, location: e.target.value})} />
                </label>
                <label className="pc-field">
                  <div className="pc-label">Start</div>
                  <input type="datetime-local" className="pc-input" value={form.startTime} onChange={(e)=> setForm({...form, startTime: e.target.value})} />
                </label>
                <label className="pc-field">
                  <div className="pc-label">End</div>
                  <input type="datetime-local" className="pc-input" value={form.endTime} onChange={(e)=> setForm({...form, endTime: e.target.value})} />
                </label>
                <label className="pc-field">
                  <div className="pc-label">Capacity</div>
                  <input type="number" min="0" className="pc-input" value={form.capacity} onChange={(e)=> setForm({...form, capacity: e.target.value})} />
                </label>
                {canEditPoints && (
                  <label className="pc-field">
                    <div className="pc-label">Points Budget (points)</div>
                    <input
                      type="number"
                      min="0"
                      className="pc-input"
                      value={form.points}
                      onChange={(e)=> setForm({ ...form, points: e.target.value })}
                      placeholder="e.g. 500"
                    />
                  </label>
                )}
                <div className="pc-field pc-field--switch">
                  <label
                    className="pc-switch"
                    title={
                      event?.published
                        ? "Once published, it cannot be unpublished."
                        : canPublish
                        ? "Managers can publish this event."
                        : "Only managers can publish."
                    }
                  >
                    <input
                      id="pub"
                      type="checkbox"
                      className="pc-switch-input"
                      checked={form.published}
                      disabled={!!event?.published || !canPublish}
                      aria-disabled={!!event?.published || !canPublish}
                      aria-label="Publish event"
                      onChange={(e) => {
                        // Prevent unpublishing once published
                        if (event?.published) return;
                        setForm({ ...form, published: e.target.checked });
                      }}
                    />
                    <span className="pc-switch-ui" />
                    <span className="pc-switch-text">{form.published ? "Published" : "Unpublished"}</span>
                  </label>
                </div>
              </div>
              <label className="pc-field u-mt-12">
                <div className="pc-label">Description</div>
                <textarea rows={4} className="pc-input" value={form.description} onChange={(e)=> setForm({...form, description: e.target.value})} />
              </label>
              <div className="pc-actions u-mt-12">
                <button className="pc-btn" onClick={saveOverview}>Save Changes</button>
                {isManager && (
                  <button
                    className="pc-btn danger u-ml-auto"
                    title={event?.published ? "Only unpublished events can be deleted" : "Delete event"}
                    disabled={!!event?.published}
                    onClick={deleteEvent}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === "organizers" && (
            <div className="pc-card">
              {canManageOrganizers ? (
                <div className="u-flex u-gap-8 u-mb-12">
                  <div className="pc-autocomplete" ref={orgWrapRef} style={{ flex: 1 }}>
                    <input
                      className="pc-input"
                      placeholder="Add organizer by UTORid"
                      aria-label="Add organizer by UTORid"
                      value={organizerQuery}
                      onChange={(e)=> setOrganizerQuery(e.target.value)}
                      onFocus={()=> setOrgDrop(orgSuggest.length > 0)}
                      onKeyDown={(e)=> {
                        if (e.key === 'Enter') {
                          if (organizerQuery.trim() === '' && orgSuggest[0]?.utorid) {
                            setOrganizerQuery(orgSuggest[0].utorid);
                          }
                          addOrganizer();
                        }
                      }}
                    />
                    {orgDrop && orgSuggest.length > 0 && (
                      <ul className="pc-suggest">
                        {orgSuggest.map((u) => (
                          <li
                            key={u.id}
                            className="pc-suggest-item"
                            onClick={() => {
                              setOrganizerQuery(u.utorid || "");
                              setOrgDrop(false);
                            }}
                          >
                            <span className="pc-s-id">{u.utorid}</span>
                            {u.name && <span className="pc-s-name">{u.name}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button className="pc-btn" onClick={addOrganizer}>Add</button>
                </div>
              ) : (
                <div className="pc-empty u-mb-12">Only managers can add or remove organizers.</div>
              )}
              {!organizers.length ? (
                <div className="pc-empty">No organizers yet.</div>
              ) : (
                <ul className="pc-list">
                  {organizers.map((o)=> (
                    <li key={o.id} className="pc-li">
                      <span>{o.name} <span style={{ color:"#94a3b8" }}>({o.utorid || o.email})</span></span>
                      {canManageOrganizers && (
                        <button className="pc-btn secondary" onClick={()=> removeOrganizer(o.id)}>Remove</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === "guests" && (
            <div className="pc-card">
              {canAddGuests ? (
                <div className="u-flex u-gap-8 u-items-center u-mb-12">
                  <div className="pc-autocomplete" ref={guestWrapRef} style={{ flex: 1 }}>
                    <input
                      className="pc-input"
                      placeholder="Add guest by UTORid"
                      aria-label="Add guest by UTORid"
                      value={guestQuery}
                      onChange={(e)=> setGuestQuery(e.target.value)}
                      onFocus={()=> setGuestDrop(guestSuggest.length > 0)}
                      onKeyDown={(e)=> {
                        if (e.key === 'Enter') {
                          if (guestQuery.trim() === '' && guestSuggest[0]?.utorid) {
                            setGuestQuery(guestSuggest[0].utorid);
                          }
                          addGuest();
                        }
                      }}
                    />
                    {guestDrop && guestSuggest.length > 0 && (
                      <ul className="pc-suggest">
                        {guestSuggest.map((u) => (
                          <li
                            key={u.id}
                            className="pc-suggest-item"
                            onClick={() => {
                              setGuestQuery(u.utorid || "");
                              setGuestDrop(false);
                            }}
                          >
                            <span className="pc-s-id">{u.utorid}</span>
                            {u.name && <span className="pc-s-name">{u.name}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button className="pc-btn" onClick={addGuest}>Add</button>
                </div>
              ) : (
                <div className="pc-empty u-mb-12">Only managers and this event’s organizers can add guests.</div>
              )}
              {!guests.length ? (
                <div className="pc-empty">No guests yet.</div>
              ) : (
                <div className="pc-grid">
                  {guests.map((g)=> (
                    <div key={g.userId} className="pc-card pc-event">
                      <div className="pc-head">
                        <h4 className="pc-name">{g.name || g.utorid || g.email || g.userId}</h4>
                        <span className={`pc-badge ${g.confirmed ? "ok" : ""}`}>{g.confirmed ? "confirmed" : "rsvped"}</span>
                      </div>
                      <div className="pc-meta">
                        {g.confirmedAt && <div className="pc-line">Checked-in: {fmtDateTime(g.confirmedAt)}</div>}
                      </div>
                      <div className="pc-actions">
                        {canRemoveGuests && (
                          <button className="pc-btn secondary" onClick={()=> removeGuest(g.userId)}>Remove</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "points" && (canAwardPoints ? (
            <div className="pc-card">
              <div className="pc-grid-220">
                <label className="pc-field">
                  <div className="pc-label">Amount (points)</div>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="pc-input"
                    value={pointsAmt}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") {
                        setPointsAmt("");
                        return;
                      }
                      if (/^\d+$/.test(v)) setPointsAmt(v);
                    }}
                    placeholder="Enter points"
                  />
                </label>
                <label className="pc-field">
                  <div className="pc-label">Recipient (UTORid)</div>
                  <input className="pc-input" placeholder="For single award" value={targetUtorid} onChange={(e)=> setTargetUtorid(e.target.value)} />
                </label>
              </div>
              <div className="pc-actions u-mt-12">
                <button className="pc-btn" onClick={awardSingle}>Award to One</button>
                <button className="pc-btn secondary" onClick={awardAll}>Award to All RSVPed</button>
              </div>
              <div className="pc-empty u-mt-8">Points will be logged as Transaction type “event”.</div>
            </div>
          ) : (
            <div className="pc-card pc-empty">You don’t have permission to award points.</div>
          ))}
        </>
      )}

      <Toasts />
    </div>
  );
}

/* ---------------- helpers ---------------- */
function keyOfUser(u) {
  const v = (u && (u.utorid ?? u.email ?? u.userId ?? u.id)) ?? "";
  return String(v).toLowerCase();
}
function ensureOK(r) { if (!r.ok) throw new Error(r.statusText); return r; }
async function justJSON(r) { if (!r.ok) throw new Error(await r.text()); return r.json(); }
function friendlyError(message) {
  if (!message) return "Something went wrong.";
  try {
    const parsed = JSON.parse(message);
    if (parsed?.error) return String(parsed.error);
    if (parsed?.message) return String(parsed.message);
  } catch {}
  if (/insufficient/i.test(message) && /points/i.test(message)) return "Out of budget for this event.";
   if (/capacity\s+less\s+than\s+confirmed/i.test(message)) return "Cannot reduce capacity below confirmed guests.";
   if (/capacity/i.test(message) && /invalid/i.test(message)) return "Invalid capacity.";
   if (/start\s*time/i.test(message) && /past/i.test(message)) return "Start time cannot be in the past.";
   if (/end\s*time/i.test(message) && /past/i.test(message)) return "End time cannot be in the past.";
   if (/end\s*time/i.test(message) && /after\s+start/i.test(message)) return "End time must be after start time.";
  if (/cannot\s*unpublish|unpublish\s*not\s*allowed/i.test(message)) return "Cannot Unpublish a Published Event";
  if (/401|unauthorized/i.test(message)) return "Please log in again.";
  if (/403|forbidden/i.test(message))   return "You don’t have permission.";
  if (/capacity|full/i.test(message))   return "Event is full.";
  if (/ended|past/i.test(message))      return "This event has already ended.";
  return message;
}
function normalizeUsers(list) {
  if (!Array.isArray(list)) return [];
  return list.map((x) => (x.user ? x.user : x));
}
function normalizeGuests(list) {
  if (!Array.isArray(list)) return [];
  return list.map((g) => ({
    userId: g.userId ?? g.user?.id ?? g.id,
    name: g.user?.name ?? g.name,
    utorid: g.user?.utorid,
    email: g.user?.email,
    rsvpedAt: g.rsvpedAt || g.rsvped_at,
    confirmed: !!g.confirmed,
    confirmedAt: g.confirmedAt || g.confirmed_at,
  }));
}
function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function isOrganizer(orgs, meId) { return Array.isArray(orgs) && orgs.some((o) => (o.id === meId) || (o.userId === meId)); }
function capacityText(e) {
  if (!e || typeof e.capacity !== "number") return "";
  const used =
    typeof e.guestsCount === "number" ? e.guestsCount :
    Array.isArray(e.guests) ? e.guests.length : undefined;
  if (typeof used === "number") return `${used}/${e.capacity} spots`;
  return `Capacity: ${e.capacity}`;
}
function fmtWhen(e) {
  if (e?.when) return e.when;
  const s = e?.startTime ? new Date(e.startTime) : null;
  const t = e?.endTime ? new Date(e.endTime) : null;
  const d = { year: "numeric", month: "short", day: "numeric" };
  const tm = { hour: "numeric", minute: "2-digit" };
  if (s && t) return `${s.toLocaleDateString(undefined, d)}, ${s.toLocaleTimeString(undefined, tm)} – ${t.toLocaleTimeString(undefined, tm)}`;
  if (s) return `${s.toLocaleDateString(undefined, d)}, ${s.toLocaleTimeString(undefined, tm)}`;
  return "";
}
function fmtDateTime(x) {
  try { const d = new Date(x); return d.toLocaleString(); } catch { return ""; }
}
function toLocalInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
function fromLocalInput(localStr) {
  if (!localStr) return null;
  const [datePart, timePart] = localStr.split("T");
  if (!datePart || !timePart) return null;
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

/* ---------- tiny toast ---------- */
let toastId = 0;
const listeners = new Set();
function pushToast(msg) {
  const id = ++toastId;
  listeners.forEach((fn) => fn({ id, text: msg }));
  setTimeout(() => listeners.forEach((fn) => fn({ id, remove: true })), 2500);
}
function toast(msg) { pushToast(msg); }
function Toasts() {
  const [toasts, setToasts] = React.useState([]);
  React.useEffect(() => {
    const onEvent = (e) => setToasts((prev) => (e.remove ? prev.filter((t) => t.id !== e.id) : [...prev, e]));
    listeners.add(onEvent);
    return () => listeners.delete(onEvent);
  }, []);
  return (
    <div className="pc-toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="pc-toast">
          <span>{t.text}</span>
          <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}>✕</button>
        </div>
      ))}
    </div>
  );
}
