import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { apiUrl } from "../config/apiBase";
import "./Promotion.css";

function toLocalInputValue(dateString) {
  const d = new Date(dateString);
  const offset = d.getTimezoneOffset(); 
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16); 
}

function toUTC(dateLocalString) {
  return new Date(dateLocalString).toISOString();
}

export default function PromotionEdit() {
  const { token } = useAuth();
  const { id } = useParams();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const navigate = useNavigate();

  const [promo, setPromo] = useState(null);

  useEffect(() => {
    async function load() {
      const r = await fetch(apiUrl(`/promotions/${id}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (!r.ok) return setError(d.error);
      setPromo(d);
    }
    load();
  }, [id, token]);

  const updateField = (e) =>
    setPromo({ ...promo, [e.target.name]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const body = {
      name: promo.name,
      description: promo.description,
      type: promo.type,
      startTime: toUTC(promo.startTime),
      endTime: toUTC(promo.endTime),
      minSpending: promo.minSpending,
      rate: promo.rate,
      points: promo.points,
    };

    const r = await fetch(apiUrl(`/promotions/${id}`), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const d = await r.json();

    if (!r.ok) return setError(d.error);

    setSuccess("Promotion updated.");
    navigate(`/promotions/${id}`);
  }

  if (!promo) return <p>Loading...</p>;

  return (
    <div className="promo-wrapper">
      <h1>Edit Promotion</h1>
      <form className="promo-form" onSubmit={save}>
        <input name="name" value={promo.name} onChange={updateField} required />
        <textarea
          name="description"
          value={promo.description}
          onChange={updateField}
          required
        />

        <select name="type" value={promo.type} onChange={updateField}>
          <option value="automatic">Automatic</option>
          <option value="onetime">One-Time</option>
        </select>

        <label>Start Time</label>
        <input
          type="datetime-local"
          name="startTime"
          value={toLocalInputValue(promo.startTime)}
          onChange={updateField}
        />

        <label>End Time</label>
        <input
          type="datetime-local"
          name="endTime"
          value={toLocalInputValue(promo.endTime)}
          onChange={updateField}
        />

        <input
          name="minSpending"
          value={promo.minSpending ?? ""}
          placeholder="Min Spending (optional)"
          onChange={updateField}
        />
        <input
          name="rate"
          value={promo.rate ?? ""}
          placeholder="Rate (optional)"
          onChange={updateField}
        />
        <input
          name="points"
          value={promo.points ?? ""}
          placeholder="Promotional Points (optional)"
          onChange={updateField}
        />

        <button className="pc-btn" type="submit">
          Save
        </button>
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message-inline">{success}</div>}
      </form>
    </div>
  );
}
