// src/components/EventDetails.jsx
import React from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "leaflet/dist/leaflet.css";
import "./EventsPage.css";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const API = process.env.REACT_APP_API_URL || "http://localhost:3000";
const MAPTILER_KEY = process.env.REACT_APP_MAPTILER_KEY || "";
const DEFAULT_CENTER = [43.6532, -79.3832]; // Toronto fallback

function MapSetter({ center }) {
  const map = useMap();
  React.useEffect(() => {
    if (center) map.setView(center, 13, { animate: true });
  }, [center, map]);
  return null;
}

export default function EventDetails() {
  const { id } = useParams();
  const { token, user } = useAuth();

  const [event, setEvent] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [mapPos, setMapPos] = React.useState(null);
  const [mapStatus, setMapStatus] = React.useState("idle"); // idle | loading | ok | no-key | no-location | error

  React.useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setErr("");
    fetch(`${API}/events/${id}`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.text()) || r.statusText);
        return r.json();
      })
      .then((data) => setEvent(data))
      .catch((e) => {
        if (e.name !== "AbortError") setErr(e.message || "Failed to load event");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [id, token]);

  const can = React.useMemo(() => canRsvp(event || {}), [event]);
  const canManage = React.useMemo(() => canManageEvent(event, user), [event, user]);

  React.useEffect(() => {
    if (!event) return;

    async function geocode(addr) {
      if (!addr) { setMapStatus("no-location"); return; }
      if (!MAPTILER_KEY) { setMapStatus("no-key"); return; }
      setMapStatus("loading");

      try {
        const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(addr)}.json`);
        url.searchParams.set("key", MAPTILER_KEY);
        url.searchParams.set("limit", "1");
        const r = await fetch(url.toString());
        if (!r.ok) {
          setMapStatus("error");
          return;
        }
        const data = await r.json();
        const first = Array.isArray(data?.features) ? data.features[0] : null;
        const c = first?.center;
        if (Array.isArray(c) && c.length >= 2) {
          setMapPos([c[1], c[0]]);
          setMapStatus("ok");
        } else {
          setMapStatus("no-location");
        }
      } catch (e) {
        setMapStatus("error");
      }
    }

    if (event?.lat && event?.lng) {
      setMapPos([event.lat, event.lng]);
      setMapStatus("ok");
    } else if (event?.location) {
      geocode(event.location);
    } else {
      setMapStatus("no-location");
    }
  }, [event]);

  return (
    <div className="pc-wrapper">
      <div className="pc-card u-mb-12">
        <Link to="/events" className="pc-btn secondary">← Back to Events</Link>
      </div>

      {loading ? (
        <div className="pc-card">
          <div className="pc-skel" style={{ height: 24, width: 220 }} />
          <div className="pc-skel" style={{ height: 16, width: "50%", marginTop: 10 }} />
          <div className="pc-skel" style={{ height: 120, width: "100%", marginTop: 16 }} />
        </div>
      ) : err ? (
        <div className="pc-card pc-error">Failed to load: {err}</div>
      ) : !event ? (
        <div className="pc-card pc-error">Event not found.</div>
      ) : (
        <div className="pc-card">
          <header className="pc-head u-mb-8">
            <div className="u-flex u-gap-8 u-items-center">
              <h2 className="pc-name pc-title">{event.name || event.title}</h2>
              <div className="pc-badges">
                {!!capacityText(event) && (
                  <span className={`pc-badge ${can ? "" : "ok"}`}>{capacityText(event)}</span>
                )}
                {canManage ? (
                  <span className={`pc-badge ${event.published ? "ok" : ""}`}>
                    {event.published ? "published" : "unpublished"}
                  </span>
                ) : (
                  event?.published ? <span className="pc-badge ok">published</span> : null
                )}
              </div>
            </div>

            {canManage && (
              <Link className="pc-btn" to={`/events/${id}/manage`} aria-label="Manage this event">
                Manage
              </Link>
            )}
          </header>

          <div className="pc-meta u-mb-12">
            <div className="pc-line">{fmtWhen(event)}</div>
            {event.location && <div className="pc-line">{event.location}</div>}
          </div>

          <div className="pc-card u-mb-12">
            <div className="pc-head u-justify-between u-items-center">
              <h3 className="pc-name u-m-0">Location map</h3>
              {mapStatus === "loading" && <div className="pc-desc-muted">Loading map…</div>}
              {mapStatus === "no-key" && <div className="pc-desc-muted">Add REACT_APP_MAPTILER_KEY in frontend .env to show the map.</div>}
              {mapStatus === "no-location" && (
                <div className="pc-desc-muted">
                  No coordinates for this event. Try a more specific address (e.g., “123 Main St, Toronto, ON”).
                </div>
              )}
              {mapStatus === "error" && <div className="pc-desc-muted">Map unavailable.</div>}
            </div>

            {mapStatus === "ok" && mapPos && (
              <div style={{ height: 260, marginTop: 8 }}>
                <MapContainer
                  center={mapPos || DEFAULT_CENTER}
                  zoom={13}
                  style={{ height: "100%", width: "100%", borderRadius: 12, overflow: "hidden" }}
                  scrollWheelZoom={false}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noreferrer">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url={
                      MAPTILER_KEY
                        ? `https://api.maptiler.com/maps/basic-v2/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`
                        : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    }
                  />
                  <MapSetter center={mapPos} />
                  <Marker position={mapPos}>
                    <Popup>
                      <div style={{ maxWidth: 220 }}>
                        <div style={{ fontWeight: 600 }}>{event.name}</div>
                        {event.location && <div style={{ opacity: 0.8 }}>{event.location}</div>}
                      </div>
                    </Popup>
                  </Marker>
                </MapContainer>
              </div>
            )}
          </div>

          {event.description && (
            <div className="pc-card u-mt-8">
              <div className="pc-desc">{event.description}</div>
            </div>
          )}

          {Array.isArray(event.guests) && (
            <div className="pc-card u-mt-16">
              <h3 className="pc-name u-mb-8">Guests</h3>
              {event.guests.length ? (
                <ul className="pc-list">
                  {event.guests.slice(0, 50).map((g) => (
                    <li key={g.userId || g.id}>
                      {g.user?.name || g.name || g.userId} {g.confirmed ? "✓" : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="pc-empty">No guests yet.</div>
              )}
            </div>
          )}
        </div>
      )}
      <Toasts />
    </div>
  );
}

/* ---------- helpers ---------- */
function canManageEvent(e, user) {
  if (!e || !user) return false;
  if (user.role === "manager" || user.role === "superuser") return true;
  if (Array.isArray(e.organizers)) {
    return e.organizers.some(o => (o.id ?? o.userId) === user.id);
  }
  return false;
}
function canRsvp(e) {
  if (!e) return false;
  const ended = e.endTime ? new Date(e.endTime) < new Date() : false;
  const isFull =
    typeof e.guestsCount === "number" && typeof e.capacity === "number"
      ? e.guestsCount >= e.capacity
      : Array.isArray(e.guests) && typeof e.capacity === "number"
      ? e.guests.length >= e.capacity
      : false;
  return !ended && !isFull;
}
function capacityText(e) {
  if (typeof e?.capacity !== "number") return "";
  const used =
    typeof e.guestsCount === "number"
      ? e.guestsCount
      : Array.isArray(e.guests)
      ? e.guests.length
      : undefined;
  if (typeof used === "number") return `${used}/${e.capacity} spots`;
  return `Capacity: ${e.capacity}`;
}
function fmtWhen(e) {
  if (e?.when) return e.when;
  const s = e?.startTime ? new Date(e.startTime) : null;
  const t = e?.endTime ? new Date(e.endTime) : null;
  const optsDate = { year: "numeric", month: "short", day: "numeric" };
  const optsTime = { hour: "numeric", minute: "2-digit" };
  if (s && t) return `${s.toLocaleDateString(undefined, optsDate)}, ${s.toLocaleTimeString(undefined, optsTime)} – ${t.toLocaleTimeString(undefined, optsTime)}`;
  if (s) return `${s.toLocaleDateString(undefined, optsDate)}, ${s.toLocaleTimeString(undefined, optsTime)}`;
  return "";
}

/* tiny toast (unchanged) */
let toastId = 0;
const listeners = new Set();
function pushToast(msg) {
  const id = ++toastId;
  listeners.forEach((fn) => fn({ id, text: msg }));
  setTimeout(() => listeners.forEach((fn) => fn({ id, remove: true })), 2500);
}
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
