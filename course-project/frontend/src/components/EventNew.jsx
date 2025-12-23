// src/components/EventNew.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiUrl } from "../config/apiBase";
import "./EventsPage.css";

export default function EventNew() {
  const { token, user, currentInterface } = useAuth();
  const navigate = useNavigate();
  const isManagerRole = user && (user.role === "manager" || user.role === "superuser");
  const isManagerInterface = currentInterface === "manager" || currentInterface === "superuser";
  const isManager = isManagerRole && isManagerInterface;

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
    function toLocalInput(date) {
      const pad = (n) => n.toString().padStart(2, "0");
      return (
        date.getFullYear() +
        "-" +
        pad(date.getMonth() + 1) +
        "-" +
        pad(date.getDate()) +
        "T" +
        pad(date.getHours()) +
        ":" +
        pad(date.getMinutes())
      );
    }
    const now = new Date();
    const minutes = now.getMinutes();
    const roundedMinutes = minutes % 30 === 0 ? minutes : minutes + (30 - (minutes % 30));
    const start = new Date(now);
    start.setMinutes(roundedMinutes);
    start.setSeconds(0);
    start.setMilliseconds(0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setForm((f) => ({
      ...f,
      startTime: toLocalInput(start),
      endTime: toLocalInput(end),
    }));
  }, []);

  // Guard: if user is not in manager interface, redirect away
  React.useEffect(() => {
    if (!isManager) {
      // Soft-guard: if user isn’t in manager interface, don’t allow creating
      // (they also won’t see this page from the Regular interface nav)
      // Navigate back to events.
      navigate("/events", { replace: true });
    }
  }, [isManager, navigate]);

  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState("");

  function toISO(localStr) {
    if (!localStr) return null;
    const [datePart, timePart] = localStr.split("T");
    if (!datePart || !timePart) return null;
    const [y, m, d] = datePart.split("-").map(Number);
    const [hh, mm] = timePart.split(":").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0);
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  function validate() {
    if (!form.name.trim()) return "Name is required.";
    const s = toISO(form.startTime);
    const e = toISO(form.endTime);
    if (!s) return "Start time is required.";
    if (e && s && new Date(e) < new Date(s)) return "End time must be after start time.";
    if (form.capacity !== "" && Number(form.capacity) < 0) return "Capacity cannot be negative.";
    if (form.points === "") return "Points budget (points) is required.";
    if (Number.isNaN(Number(form.points))) return "Points budget (points) must be a number.";
    if (!Number.isInteger(Number(form.points)) || Number(form.points) <= 0) return "Points budget (points) must be a positive integer.";
    return "";
  }

  async function onCreate() {
    if (!isManager) return toast("Only managers can create events.");
    const v = validate();
    if (v) return toast(v);
    setSaving(true); setErr("");
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        startTime: toISO(form.startTime),
        endTime: toISO(form.endTime),
        capacity: form.capacity === "" ? null : Number(form.capacity),
        points: Number(form.points),
        published: !!form.published,
      };
      const r = await fetch(apiUrl("/events"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      const created = await r.json();
      let newId = created?.id;
      toast("Event created.");
      if (newId && form.published) {
        try {
          const pub = await fetch(apiUrl(`/events/${newId}`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ published: true }),
          });
          if (!pub.ok) {
            const msg = await pub.text();
            toast(msg || "Could not publish automatically.");
          }
        } catch {
          toast("Could not publish automatically.");
        }
      }
      if (newId) navigate(`/events/${newId}/manage`);
      else navigate("/events");
    } catch (e) {
      setErr(e.message || "Failed to create event.");
      toast("Failed to create event.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pc-wrapper">
      <div className="pc-card u-mb-12 u-flex u-gap-8 u-items-center">
        <Link to="/events" className="pc-btn secondary">← Back</Link>
        <h2 className="pc-title u-m-0">New Event</h2>
      </div>

      {!isManager ? (
        <div className="pc-card pc-error">Only managers can create events.</div>
      ) : (
        <div className="pc-card">
          {err && <div className="pc-card pc-error u-mb-12">{err}</div>}

          <div className="pc-grid-240">
            <label className="pc-field">
              <div className="pc-label">Name</div>
              <input className="pc-input" value={form.name} onChange={(e)=> setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="pc-field">
              <div className="pc-label">Location</div>
              <input className="pc-input" value={form.location} onChange={(e)=> setForm({ ...form, location: e.target.value })} />
            </label>
            <label className="pc-field">
              <div className="pc-label">Start</div>
              <input type="datetime-local" className="pc-input" value={form.startTime} onChange={(e)=> setForm({ ...form, startTime: e.target.value })} />
            </label>
            <label className="pc-field">
              <div className="pc-label">End</div>
              <input type="datetime-local" className="pc-input" value={form.endTime} onChange={(e)=> setForm({ ...form, endTime: e.target.value })} />
            </label>
            <label className="pc-field">
              <div className="pc-label">Capacity</div>
              <input type="number" min="0" className="pc-input" value={form.capacity} onChange={(e)=> setForm({ ...form, capacity: e.target.value })} />
            </label>
            <label className="pc-field">
              <div className="pc-label">Points Budget (points)</div>
              <input type="number" min="1" className="pc-input" value={form.points} onChange={(e)=> setForm({ ...form, points: e.target.value })} />
            </label>
            <div className="pc-field pc-field--switch">
              <label className="pc-switch" aria-label="Toggle publish">
                <input
                  type="checkbox"
                  className="pc-switch-input"
                  checked={form.published}
                  onChange={(e) => setForm({ ...form, published: e.target.checked })}
                />
                <span className="pc-switch-ui" aria-hidden="true"></span>
                <span className="pc-switch-text">{form.published ? "Published" : "Unpublished"}</span>
              </label>
            </div>
          </div>

          <label className="pc-field u-mt-12">
            <div className="pc-label">Description</div>
            <textarea rows={4} className="pc-input" value={form.description} onChange={(e)=> setForm({ ...form, description: e.target.value })} />
          </label>

          <div className="pc-actions u-mt-12 u-flex u-gap-8">
            <button className="pc-btn" onClick={onCreate} disabled={saving}>
              {saving ? "Creating..." : "Create Event"}
            </button>
            <Link className="pc-btn secondary" to="/events">Cancel</Link>
          </div>
        </div>
      )}
      <Toasts />
    </div>
  );
}

// tiny toast (local)
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
    function onToast(toast) {
      setToasts((cur) => {
        if (toast.remove) return cur.filter((t) => t.id !== toast.id);
        return [...cur, toast];
      });
    }
    listeners.add(onToast);
    return () => listeners.delete(onToast);
  }, []);
  return (
    <div className="pc-toasts" aria-live="polite" aria-atomic="true">
      {toasts.map(({ id, text }) => (
        <div key={id} className="pc-toast">{text}</div>
      ))}
    </div>
  );
}
