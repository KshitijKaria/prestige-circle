import "./Transaction.css";
import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000";

/**
 * TransactionCashier
 *
 * For cashiers / managers / superusers:
 *  - Create purchase transactions (POST /transactions, type=purchase).
 *  - Process redemption requests (PATCH /transactions/:id/processed).
 *
 * The `mode` prop controls which "page" we show:
 *  - mode="purchase"    -> only the Create Purchase card (used at /create-transaction)
 *  - mode="redemption"  -> only the Process Redemption card (used at /process-redemption)
 *  - default (no mode)  -> show both (useful for debugging)
 */
export default function TransactionCashier({ mode = "both" }) {
  const { token, user, currentInterface, hasRole } = useAuth();

  // --- purchase state ---
  const [purchaseUtorid, setPurchaseUtorid] = useState("");
  const [purchaseSpent, setPurchaseSpent] = useState("");
  const [purchasePromotions, setPurchasePromotions] = useState("");
  const [purchaseRemark, setPurchaseRemark] = useState("");
  const [purchaseStatus, setPurchaseStatus] = useState(null);

  // --- redemption-processing state ---
  const [redemptionId, setRedemptionId] = useState("");
  const [redemptionStatus, setRedemptionStatus] = useState(null);

  // Role guard (AFTER hooks)
  if (!hasRole(["cashier", "manager", "superuser"])) {
    return (
      <div className="transactions-page">
        <h1>Transactions</h1>
        <p>You do not have permission to access this page.</p>
      </div>
    );
  }

  const handlePurchaseSubmit = async (e) => {
    e.preventDefault();
    setPurchaseStatus(null);

    const spentNum = Number(purchaseSpent);
    if (!purchaseUtorid || !spentNum || spentNum <= 0) {
      setPurchaseStatus({
        type: "error",
        message: "UTORid and positive spent amount are required.",
      });
      return;
    }

    // Parse comma-separated promotion IDs to integer array
    let promotionIds = undefined;
    if (purchasePromotions.trim()) {
      promotionIds = purchasePromotions
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (promotionIds.length === 0) promotionIds = undefined;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/transactions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "purchase",
          utorid: purchaseUtorid,
          spent: spentNum,
          promotionIds,
          remark: purchaseRemark || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");

      setPurchaseStatus({
        type: "success",
        message: `Created purchase transaction #${data.id} and credited ${data.earned} points to ${data.utorid}.`,
      });
      setPurchaseUtorid("");
      setPurchaseSpent("");
      setPurchasePromotions("");
      setPurchaseRemark("");
    } catch (err) {
      setPurchaseStatus({ type: "error", message: err.message });
    }
  };

  const handleRedemptionProcess = async (e) => {
    e.preventDefault();
    setRedemptionStatus(null);

    const idNum = Number(redemptionId);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      setRedemptionStatus({
        type: "error",
        message: "Redemption transaction ID must be a positive integer.",
      });
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE_URL}/transactions/${idNum}/processed`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ processed: true }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process redemption");

      setRedemptionStatus({
        type: "success",
        message: `Redemption transaction #${data.id} has been processed.`,
      });
      setRedemptionId("");
    } catch (err) {
      setRedemptionStatus({ type: "error", message: err.message });
    }
  };

  // Nice header title depending on mode
  const headerTitle =
    mode === "purchase"
      ? "Create Purchase"
      : mode === "redemption"
      ? "Process Redemption"
      : "Cashier Transactions";

  return (
    <div className="transactions-page">
      <header className="transactions-header">
        <h1>{headerTitle}</h1>
        <p>
          Interface: <strong>{currentInterface.toUpperCase()}</strong>{" "}
          {user && (
            <>
              · Logged in as <strong>{user.utorid}</strong>
            </>
          )}
        </p>
      </header>

      <div className="transactions-grid">
        {/* Purchase card: shown when mode is "purchase" or "both" */}
        {(mode === "purchase" || mode === "both") && (
          <section className="transactions-column">
            <div className="tx-card">
              <h2>Create Purchase</h2>
              <form className="tx-form" onSubmit={handlePurchaseSubmit}>
                <label>
                  Customer Username
                  <input
                    type="text"
                    value={purchaseUtorid}
                    onChange={(e) => setPurchaseUtorid(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Amount spent ($)
                  <input
                    type="number"
                    value={purchaseSpent}
                    onChange={(e) => setPurchaseSpent(e.target.value)}
                    min="0.01"
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Promotion IDs (optional, comma separated)
                  <input
                    type="text"
                    value={purchasePromotions}
                    onChange={(e) => setPurchasePromotions(e.target.value)}
                    placeholder="e.g., 1, 3, 5"
                  />
                </label>
                <label>
                  Remark (optional)
                  <input
                    type="text"
                    value={purchaseRemark}
                    onChange={(e) => setPurchaseRemark(e.target.value)}
                    maxLength={200}
                  />
                </label>
                <button type="submit">Create Purchase</button>
              </form>
              {purchaseStatus && (
                <p
                  className={
                    purchaseStatus.type === "success"
                      ? "tx-status tx-status-success"
                      : "tx-status tx-status-error"
                  }
                >
                  {purchaseStatus.message}
                </p>
              )}
            </div>
          </section>
        )}

        {/* Redemption card: shown when mode is "redemption" or "both" */}
        {(mode === "redemption" || mode === "both") && (
          <section className="transactions-column">
            <div className="tx-card">
              <h2>Process Redemption</h2>
              <form className="tx-form" onSubmit={handleRedemptionProcess}>
                <label>
                  Redemption Transaction ID
                  <input
                    type="number"
                    value={redemptionId}
                    onChange={(e) => setRedemptionId(e.target.value)}
                    required
                  />
                </label>
                <button type="submit">Process Redemption</button>
              </form>
              {redemptionStatus && (
                <p
                  className={
                    redemptionStatus.type === "success"
                      ? "tx-status tx-status-success"
                      : "tx-status tx-status-error"
                  }
                >
                  {redemptionStatus.message}
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
