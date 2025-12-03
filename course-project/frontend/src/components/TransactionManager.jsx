// src/components/TransactionManager.jsx
import "./Transaction.css";
import "./EventsPage.css"; // reuse pc-* styles for tabs/filter row
import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000";

/**
 * TransactionManager
 *
 * For managers / superusers:
 *  - View all transactions with filters + pagination (GET /transactions).
 *  - Create adjustment transactions (POST /transactions, type=adjustment).
 */
export default function TransactionManager() {
  const { user, token, currentInterface, hasRole, refreshUser } = useAuth();

  // --- view tabs: "all" | "transactions" | "adjustment" ---
  const [viewTab, setViewTab] = useState("all");

  // --- listing state (hooks at top) ---
  const [transactions, setTransactions] = useState([]);
  const [txPage, setTxPage] = useState(1);
  const [txLimit] = useState(10);
  const [txTotalCount, setTxTotalCount] = useState(0);

  const [filterName, setFilterName] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterSuspicious, setFilterSuspicious] = useState("");
  const [filterMinAmount, setFilterMinAmount] = useState("");
  const [filterMaxAmount, setFilterMaxAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // --- adjustment state ---
  const [adjUtorid, setAdjUtorid] = useState("");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjRelatedId, setAdjRelatedId] = useState("");
  const [adjRemark, setAdjRemark] = useState("");
  const [adjStatus, setAdjStatus] = useState(null);

  const buildQuery = () => {
    const params = new URLSearchParams();
    params.set("page", txPage);
    params.set("limit", txLimit);

    if (filterName) params.set("name", filterName);
    if (filterType) params.set("type", filterType);
    if (filterSuspicious) params.set("suspicious", filterSuspicious);

    if (filterMinAmount) {
      params.set("amount", filterMinAmount);
      params.set("operator", "gte");
    } else if (filterMaxAmount) {
      params.set("amount", filterMaxAmount);
      params.set("operator", "lte");
    }

    return params.toString();
  };

  useEffect(() => {
    if (!token) return;

    const fetchTransactions = async () => {
      try {
        setLoading(true);
        setError(null);
        const query = buildQuery();
        const res = await fetch(`${API_BASE_URL}/transactions?${query}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load transactions");

        setTransactions(data.results || []);
        setTxTotalCount(data.count || 0);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    token,
    txPage,
    filterName,
    filterType,
    filterSuspicious,
    filterMinAmount,
    filterMaxAmount,
  ]);

  const totalPages = Math.max(1, Math.ceil(txTotalCount / txLimit));
  const canPrev = txPage > 1;
  const canNext = txPage < totalPages;

  // Role guard after hooks
  if (!hasRole(["manager", "superuser"])) {
    return (
      <div className="transactions-page">
        <h1>Manager Transactions</h1>
        <p>You do not have permission to access this page.</p>
      </div>
    );
  }

  const handleAdjustmentSubmit = async (e) => {
    e.preventDefault();
    setAdjStatus(null);

    const amountNum = Number(adjAmount);
    const relatedNum = Number(adjRelatedId);

    if (!adjUtorid || !adjAmount || !adjRelatedId) {
      setAdjStatus({
        type: "error",
        message: "UTORid, amount, and related transaction ID are required.",
      });
      return;
    }

    if (!Number.isInteger(amountNum)) {
      setAdjStatus({
        type: "error",
        message: "Amount must be a whole number (points).",
      });
      return;
    }
    if (!Number.isInteger(relatedNum) || relatedNum <= 0) {
      setAdjStatus({
        type: "error",
        message: "Related transaction ID must be a positive integer.",
      });
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/transactions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "adjustment",
          utorid: adjUtorid,
          amount: amountNum,
          relatedId: relatedNum,
          remark: adjRemark || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Adjustment failed");

      setAdjStatus({
        type: "success",
        message: `Created adjustment transaction #${data.id} for user ${data.utorid} (amount ${data.amount}).`,
      });
      setAdjUtorid("");
      setAdjAmount("");
      setAdjRelatedId("");
      setAdjRemark("");

      if (user && data.utorid &&
        data.utorid.toLowerCase() === user.utorid.toLowerCase()) {
      await refreshUser();
    }

      setTxPage(1);
    } catch (err) {
      setAdjStatus({ type: "error", message: err.message });
    }
  };

  const formatType = (t) =>
    typeof t === "string" && t.length
      ? t.charAt(0).toUpperCase() + t.slice(1)
      : t;

  const showTransactionsColumn =
    viewTab === "all" || viewTab === "transactions";
  const showAdjustmentColumn = viewTab === "all" || viewTab === "adjustment";

  const singleColumn =
    (showTransactionsColumn && !showAdjustmentColumn) ||
    (!showTransactionsColumn && showAdjustmentColumn);

  return (
    <div className="transactions-page pc-wrapper">
      <header className="transactions-header pc-head u-mb-12">
        <div>
          <h1 className="pc-title">All Transactions</h1>
          <p className="pc-subtitle">
            Interface: <strong>{currentInterface.toUpperCase()}</strong>{" "}
            {user && (
              <>
                · Logged in as <strong>{user.utorid}</strong>
              </>
            )}
          </p>
        </div>
      </header>

      {/* Tabs: All / Transactions / Create Adjustment */}
      <div className="pc-filter-row u-mb-12">
        <button
          type="button"
          className={`pc-filter ${viewTab === "all" ? "active" : ""}`}
          onClick={() => setViewTab("all")}
        >
          All
        </button>
        <button
          type="button"
          className={`pc-filter ${
            viewTab === "transactions" ? "active" : ""
          }`}
          onClick={() => setViewTab("transactions")}
        >
          Transactions
        </button>
        <button
          type="button"
          className={`pc-filter ${
            viewTab === "adjustment" ? "active" : ""
          }`}
          onClick={() => setViewTab("adjustment")}
        >
          Create Adjustment
        </button>
      </div>

      {/* 👉 note the extra class when it's a single column */}
      <div
        className={`transactions-grid ${
          singleColumn ? "tx-grid-single" : ""
        }`}
      >
        {/* LEFT: filters + table */}
        {showTransactionsColumn && (
          <section className="transactions-column">
            <div className="tx-card">
              <h2>Transactions</h2>

              <div className="tx-filters">
                <label>
                  User name / UTORid
                  <input
                    type="text"
                    value={filterName}
                    onChange={(e) => {
                      setTxPage(1);
                      setFilterName(e.target.value);
                    }}
                    placeholder="Search by name or UTORid"
                  />
                </label>
                <label>
                  Type
                  <select
                    value={filterType}
                    onChange={(e) => {
                      setTxPage(1);
                      setFilterType(e.target.value);
                    }}
                  >
                    <option value="">All</option>
                    <option value="purchase">Purchase</option>
                    <option value="redemption">Redemption</option>
                    <option value="transfer">Transfer</option>
                    <option value="adjustment">Adjustment</option>
                    <option value="event">Event</option>
                  </select>
                </label>
                <label>
                  Suspicious
                  <select
                    value={filterSuspicious}
                    onChange={(e) => {
                      setTxPage(1);
                      setFilterSuspicious(e.target.value);
                    }}
                  >
                    <option value="">Any</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </label>
                <label>
                  Min amount
                  <input
                    type="number"
                    value={filterMinAmount}
                    onChange={(e) => {
                      setTxPage(1);
                      setFilterMinAmount(e.target.value);
                      setFilterMaxAmount("");
                    }}
                  />
                </label>
                <label>
                  Max amount
                  <input
                    type="number"
                    value={filterMaxAmount}
                    onChange={(e) => {
                      setTxPage(1);
                      setFilterMaxAmount(e.target.value);
                      setFilterMinAmount("");
                    }}
                  />
                </label>
              </div>

              {loading ? (
                <p>Loading transactions…</p>
              ) : error ? (
                <p className="tx-status tx-status-error">{error}</p>
              ) : transactions.length === 0 ? (
                <p>No transactions found.</p>
              ) : (
                <table className="tx-table">
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th>User</th>
                      <th>Type</th>
                      <th>Points</th>
                      <th>Spent</th>
                      <th>Suspicious</th>
                      <th>Created By</th>
                      <th>Related ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>{tx.id}</td>
                        <td>{tx.utorid}</td>
                        <td>
                          <span
                            className={`tx-type-pill tx-type-${tx.type}`}
                          >
                            {formatType(tx.type)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={
                              tx.amount >= 0
                                ? "tx-amount-positive"
                                : "tx-amount-negative"
                            }
                          >
                            {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                          </span>
                        </td>
                        <td>{tx.spent != null ? tx.spent : "–"}</td>
                        <td className="tx-suspicious-cell">
                          <span
                            className={`tx-dot ${
                              tx.suspicious ? "tx-dot-bad" : "tx-dot-good"
                            }`}
                          />
                          {tx.suspicious ? "Yes" : "No"}
                        </td>
                        <td>{tx.createdBy || "-"}</td>
                        <td>{tx.relatedId || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="tx-pagination">
                <button
                  disabled={!canPrev}
                  onClick={() => canPrev && setTxPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {txPage} of {totalPages} ({txTotalCount} total)
                </span>
                <button
                  disabled={!canNext}
                  onClick={() => canNext && setTxPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        )}

        {/* RIGHT: adjustments */}
        {showAdjustmentColumn && (
          <section className="transactions-column">
            <div className="tx-card">
              <h2>Create Adjustment</h2>
              <form className="tx-form" onSubmit={handleAdjustmentSubmit}>
                <label>
                  User
                  <input
                    type="text"
                    value={adjUtorid}
                    onChange={(e) => setAdjUtorid(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Points
                  <input
                    type="number"
                    value={adjAmount}
                    onChange={(e) => setAdjAmount(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Transaction ID
                  <input
                    type="number"
                    value={adjRelatedId}
                    onChange={(e) => setAdjRelatedId(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Remark (optional)
                  <input
                    type="text"
                    value={adjRemark}
                    onChange={(e) => setAdjRemark(e.target.value)}
                    maxLength={200}
                  />
                </label>
                <button type="submit">Create Adjustment</button>
              </form>
              {adjStatus && (
                <p
                  className={
                    adjStatus.type === "success"
                      ? "tx-status tx-status-success"
                      : "tx-status tx-status-error"
                  }
                >
                  {adjStatus.message}
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
