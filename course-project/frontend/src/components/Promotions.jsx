import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Link } from "react-router-dom";
import { apiUrl } from "../config/apiBase";
import "./Promotion.css";

const LIMIT = 8;

export default function PromotionList() {
  const { currentInterface } = useAuth();
  const canCreatePromotions =
    currentInterface === "manager" || currentInterface === "superuser";

  const { token, user } = useAuth();
  const [promotions, setPromotions] = useState([]);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.ceil(count / LIMIT);

  const usedPromoIds = new Set(
    user?.promotionUsages?.map((p) => p.promotionId)
  );

  useEffect(() => {
    async function fetchPromotions() {
      setLoading(true);

      if (!token || !user) return;

      try {
        const res = await fetch(
          apiUrl(`/promotions?page=${page}&limit=${LIMIT}`),
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        const data = await res.json();

        if (res.ok) {
          const now = new Date();
          const usedPromoIds = new Set(
            (user.promotionUsages || []).map((u) => u.promotionId)
          );

          // Attach `used` flag to each promo AND filter visibility
          const filteredPromotions = data.results
            .map((promo) => ({
              ...promo,
              used: usedPromoIds.has(promo.id),
            }))
            .filter((promo) => true);

          setPromotions(filteredPromotions);
          setCount(data.count);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchPromotions();
  }, [page, token, user]);

  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      setPage(totalPages);
    }
  }, [totalPages]);

  return (
    <div className="promotion-list-container">
      <h1 className="promo-title">Promotions</h1>
      {canCreatePromotions && (
        <Link to="/promotions/create" className="create-promo-btn">
          + Create Promotion
        </Link>
      )}

      {loading ? (
        <p className="promo-loading">Loading promotions...</p>
      ) : promotions.length === 0 ? (
        <p className="promo-empty">No promotions available.</p>
      ) : (
        <div className="promotion-grid">
          {promotions.map((promo) => (
            <Link
              to={`/promotions/${promo.id}`}
              key={promo.id}
              className="promotion-card"
            >
              {user?.promotionUsages?.some(
                (u) => u.promotionId === promo.id
              ) && <span className="promo-used-flag">USED</span>}
              <h3 className="promotion-name">{promo.name}</h3>
              <div className="promotion-details">
                <p>
                  <strong>ID:</strong> {promo.id}
                </p>
                <p>
                  <strong>Type:</strong> {promo.type.toUpperCase()}
                </p>
                <p>
                  <strong>Start:</strong>{" "}
                  {new Date(promo.startTime).toLocaleDateString()}
                </p>
                <p>
                  <strong>End:</strong>{" "}
                  {new Date(promo.endTime).toLocaleDateString()}
                </p>

                {promo.minSpending && (
                  <p>
                    <strong>Min Spend:</strong> ${promo.minSpending}
                  </p>
                )}
                {promo.rate && (
                  <p>
                    <strong>Rate:</strong> +{promo.rate * 100}% pts
                  </p>
                )}
                {promo.points !== null && (
                  <p>
                    <strong>Promotional Points:</strong> +{promo.points} pts
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="promo-pagination">
          <button
            className="promo-page-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Previous
          </button>

          <span className="promo-page-info">
            Page {page} of {totalPages}
          </span>

          <button
            className="promo-page-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
