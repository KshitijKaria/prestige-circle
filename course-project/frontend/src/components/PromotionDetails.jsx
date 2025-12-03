import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "./Promotion.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:3000";

export default function PromotionDetails() {
  const { id } = useParams();
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { token, currentInterface } = useAuth();

  const [promo, setPromo] = useState(null);
  const [loading, setLoading] = useState(true);
  const isManager =
    currentInterface === "manager" || currentInterface === "superuser";

  useEffect(() => {
    async function load() {
      const res = await fetch(`${API}/promotions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (res.ok) setPromo(json);
      else setError(json.error);

      setLoading(false);
    }
    load();
  }, [id, token]);

  async function deletePromo() {
    if (!window.confirm("Delete this promotion? This cannot be undone."))
      return;

    const res = await fetch(`${API}/promotions/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      navigate("/promotions");
    } else {
      const err = await res.json();
      setError(err.error);
    }
  }

  if (loading) return <p>Loading...</p>;
  if (!promo) return <p>Promotion not found.</p>;

  return (
    <div className="promo-wrapper">
      <Link to="/promotions" className="pc-btn secondary">
        ← Back
      </Link>

      <div className="promo-card" style={{ marginTop: 20 }}>
        <h1>{promo.name}</h1>
        <p>
          <strong>ID:</strong> {promo.id}
        </p>
        <p>{promo.description}</p>

        <p>
          <strong>Type:</strong>{" "}
          <span className={`promo-chip ${promo.type}`}>
            {promo.type === "automatic" ? "Automatic" : "One-Time"}
          </span>
        </p>

        <p>
          <strong>Start:</strong> {new Date(promo.startTime).toLocaleString()}
        </p>
        <p>
          <strong>End:</strong> {new Date(promo.endTime).toLocaleString()}
        </p>

        {promo.minSpending && <p>Min Spending: ${promo.minSpending}</p>}
        {promo.rate && <p>Rate: {promo.rate}×</p>}
        {promo.points != null && (
          <p>
            <strong>Promotional Points:</strong> {promo.points}
          </p>
        )}
      </div>

      {isManager && (
        <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
          <Link className="promo-edit-btn" to={`/promotions/${id}/edit`}>
            Edit
          </Link>
          <button
            className="promo-delete-btn"
            disabled={new Date(promo.startTime) <= new Date()}
            onClick={deletePromo}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
