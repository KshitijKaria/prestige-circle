import React, { useState } from "react";
import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../config/apiBase";
import "./Promotion.css";
import "./Profile.css";

export default function PromotionCreate() {
  const { token } = useAuth();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [createdPromoId, setCreatedPromoId] = useState(null);
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    description: "",
    type: "automatic",
    startTime: "",
    endTime: "",
    minSpending: "",
    rate: "",
    points: "",
  });

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

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

  async function submit(e) {
    const now = new Date();
    const minutes = now.getMinutes();
    const roundedMinutes =
      minutes % 30 === 0 ? minutes : minutes + (30 - (minutes % 30));
    const start = new Date(now);
    start.setMinutes(roundedMinutes);
    start.setSeconds(0);
    start.setMilliseconds(0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    e.preventDefault();
    setError("");
    setSuccess("");

    const payload = {
      name: form.name,
      description: form.description,
      type: form.type,
      startTime: toLocalInput(start),
      endTime: toLocalInput(end),
      minSpending: form.minSpending || undefined,
      rate: form.rate || undefined,
      points: form.points || undefined,
    };

    const res = await fetch(apiUrl("/promotions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();

    if (!res.ok) {
      setError(json.error || "Failed to create promotion");
      return;
    }

    setSuccess("Promotion created!");
    setCreatedPromoId(json.id);
  }

  useEffect(() => {
    const now = new Date();
  
    const minutes = now.getMinutes();
    const roundedMinutes =
      minutes % 30 === 0 ? minutes : minutes + (30 - (minutes % 30));
  
    const start = new Date(now);
    start.setMinutes(roundedMinutes);
    start.setSeconds(0);
    start.setMilliseconds(0);
  
    const end = new Date(start.getTime() + 60 * 60 * 1000);
  
    setForm((prev) => ({
      ...prev,
      startTime: toLocalInput(start),
      endTime: toLocalInput(end),
    }));
  }, []);
  

  return (
    <div className="promo-wrapper">
      <h1>Create Promotion</h1>
      <form className="promo-form" onSubmit={submit}>
        <input
          name="name"
          placeholder="Name"
          value={form.name}
          onChange={update}
          required
        />
        <textarea
          name="description"
          placeholder="Description"
          value={form.description}
          onChange={update}
          required
        />

        <select name="type" value={form.type} onChange={update}>
          <option value="automatic">Automatic</option>
          <option value="one-time">One-Time</option>
        </select>

        <label>Start Time</label>
        <input
          type="datetime-local"
          name="startTime"
          value={form.startTime}
          onChange={update}
          required
        />

        <label>End Time</label>
        <input
          type="datetime-local"
          name="endTime"
          value={form.endTime}
          onChange={update}
          required
        />

        <input
          name="minSpending"
          type="number"
          placeholder="Min Spending (optional)"
          onChange={update}
        />

        <input
          name="rate"
          type="number"
          placeholder="Rate (optional)"
          onChange={update}
        />

        <input
          name="points"
          type="number"
          placeholder="Promotional Points (optional)"
          onChange={update}
        />

        <button className="pc-btn" type="submit">
          Create
        </button>
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message-inline">{success}</div>}
        {createdPromoId && (
          <button
            type="button"
            className="open-promo-btn"
            onClick={() => navigate(`/promotions/${createdPromoId}`)}
            style={{ marginTop: "15px" }}
          >
            View Promotion
          </button>
        )}
      </form>
    </div>
  );
}
