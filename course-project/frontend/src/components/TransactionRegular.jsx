// src/components/TransactionRegular.jsx
import "./Transaction.css";
import "./EventsPage.css"; // reuse pc-* styles
import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { apiUrl } from "../config/apiBase";

/**
 * TransactionRegular
 *
 * For regular users:
 *  - Transfer points to another user (POST /users/:userId/transactions, type=transfer).
 *  - Submit redemption requests (POST /users/me/transactions, type=redemption).
 *  - View paginated list of their own transactions (GET /users/me/transactions).
 */
export default function TransactionRegular() {
  const { token, user, currentInterface } = useAuth();

  // Tabs: "all" | "transfer" | "redeem" | "history"
  const [viewTab, setViewTab] = useState("all");

  // --- transfer state ---
  const [transferRecipientId, setTransferRecipientId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferRemark, setTransferRemark] = useState("");
  const [transferStatus, setTransferStatus] = useState(null);

  // --- redemption state ---
  const [redeemAmount, setRedeemAmount] = useState("");
  const [redeemRemark, setRedeemRemark] = useState("");
  const [redeemStatus, setRedeemStatus] = useState(null);

  // --- listing state ---
  const [transactions, setTransactions] = useState([]);
  const [txPage, setTxPage] = useState(1);
  const [txLimit] = useState(10);
  const [txTotalCount, setTxTotalCount] = useState(0);
  const [txTypeFilter, setTxTypeFilter] = useState("");
  const [txMinAmount, setTxMinAmount] = useState("");
  const [txMaxAmount, setTxMaxAmount] = useState("");
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState(null);

  const buildTxQuery = () => {
    const params = new URLSearchParams();
    params.set("page", txPage);
    params.set("limit", txLimit);

    if (txTypeFilter) params.set("type", txTypeFilter);

    if (txMinAmount) {
      params.set("amount", txMinAmount);
      params.set("operator", "gte");
    } else if (txMaxAmount) {
      params.set("amount", txMaxAmount);
      params.set("operator", "lte");
    }

    return params.toString();
  };

  useEffect(() => {
    if (!token) return;

    const fetchTransactions = async () => {
      try {
        setTxLoading(true);
        setTxError(null);

        const query = buildTxQuery();
        const res = await fetch(apiUrl(`/users/me/transactions?${query}`), {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || "Failed to load transactions");

        setTransactions(data.results || []);
        setTxTotalCount(data.count || 0);
      } catch (err) {
        setTxError(err.message);
      } finally {
        setTxLoading(false);
      }
    };

    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, txPage, txTypeFilter, txMinAmount, txMaxAmount]);

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    setTransferStatus(null);

    const idNum = Number(transferRecipientId);
    const amtNum = Number(transferAmount);

    if (!Number.isInteger(idNum) || idNum <= 0) {
      setTransferStatus({
        type: "error",
        message: "Recipient user ID must be a positive integer.",
      });
      return;
    }
    if (!Number.isInteger(amtNum) || amtNum <= 0) {
      setTransferStatus({
        type: "error",
        message: "Amount must be a positive whole number of points.",
      });
      return;
    }

    try {
      const res = await fetch(apiUrl(`/users/${idNum}/transactions`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "transfer",
          amount: amtNum,
          remark: transferRemark || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transfer failed");

      setTransferStatus({
        type: "success",
        message: `Transferred ${amtNum} points to ${data.recipient}.`,
      });
      setTransferRecipientId("");
      setTransferAmount("");
      setTransferRemark("");

      setTxPage(1); // refresh history
    } catch (err) {
      setTransferStatus({ type: "error", message: err.message });
    }
  };

  const handleRedeemSubmit = async (e) => {
    e.preventDefault();
    setRedeemStatus(null);

    const amtNum = Number(redeemAmount);
    if (!Number.isInteger(amtNum) || amtNum <= 0) {
      setRedeemStatus({
        type: "error",
        message: "Amount must be a positive whole number of points.",
      });
      return;
    }

    try {
      const res = await fetch(apiUrl("/users/me/transactions"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "redemption",
          amount: amtNum,
          remark: redeemRemark || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Redemption request failed");

      setRedeemStatus({
        type: "success",
        message: `Redemption request #${data.id} created for ${data.amount} points.`,
      });
      setRedeemAmount("");
      setRedeemRemark("");

      setTxPage(1);
    } catch (err) {
      setRedeemStatus({ type: "error", message: err.message });
    }
  };

  const totalPages = Math.max(1, Math.ceil(txTotalCount / txLimit));
  const canPrev = txPage > 1;
  const canNext = txPage < totalPages;

  // 🔒 Block cashiers / managers / superusers from this page
  if (currentInterface !== "regular") {
    return (
      <div className="transactions-page pc-wrapper">
        <div className="pc-head u-mb-12">
          <h1 className="pc-title">My Transactions</h1>
          <p className="pc-subtitle">
            This page is only available to regular users. As a cashier or
            manager, please use <strong>Create Transaction</strong> and{" "}
            <strong>Process Redemption</strong> instead.
          </p>
        </div>
      </div>
    );
  }

  // visibility based on tab
  const showTransferCard = viewTab === "all" || viewTab === "transfer";
  const showRedeemCard = viewTab === "all" || viewTab === "redeem";
  const showHistoryColumn = viewTab === "all" || viewTab === "history";

  return (
    <div className="transactions-page pc-wrapper">
      {/* Header */}
      <div className="pc-head u-mb-12">
        <div>
          <h1 className="pc-title">My Transactions</h1>
          <p className="pc-subtitle">
            Interface: <strong>{currentInterface?.toUpperCase()}</strong> ·
            Logged in as <strong>{user?.utorid}</strong>{" "}
            {user && (
              <span className="pc-pill u-ml-auto">
                Numeric User ID: <strong>{user.id}</strong>
              </span>
            )}{" "}
            · Balance: <strong>{user?.points ?? 0} points</strong>
          </p>
        </div>
      </div>

      {/* Tab row (All / Transfer / Redeem / History) */}
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
          className={`pc-filter ${viewTab === "transfer" ? "active" : ""}`}
          onClick={() => setViewTab("transfer")}
        >
          Transfer Points
        </button>
        <button
          type="button"
          className={`pc-filter ${viewTab === "redeem" ? "active" : ""}`}
          onClick={() => setViewTab("redeem")}
        >
          Redeem Points
        </button>
        <button
          type="button"
          className={`pc-filter ${viewTab === "history" ? "active" : ""}`}
          onClick={() => setViewTab("history")}
        >
          History
        </button>
      </div>

      {/* Main layout */}
      <div className="transactions-grid">
        {/* LEFT column: Transfer + Redeem */}
        {(showTransferCard || showRedeemCard) && (
          <section className="transactions-column">
            {showTransferCard && (
              <div className="pc-card tx-card">
                <h2 className="pc-name">Transfer Points</h2>
                <p className="pc-desc-muted">
                  Send points to another user by entering their{" "}
                  <strong>Transaction ID</strong>. They see this ID at the top
                  of their own “My Transactions” page.
                </p>
                <form onSubmit={handleTransferSubmit} className="tx-form">
                  <label>
                    Recipient User ID
                    <input
                      className="pc-input"
                      type="number"
                      value={transferRecipientId}
                      onChange={(e) => setTransferRecipientId(e.target.value)}
                      min="1"
                      step="1"
                      placeholder="Ask your friend for their numeric User ID"
                      required
                    />
                  </label>
                  <label>
                    Amount (points)
                    <input
                      className="pc-input"
                      type="number"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      min="1"
                      required
                    />
                  </label>
                  <label>
                    Remark (optional)
                    <input
                      className="pc-input"
                      type="text"
                      value={transferRemark}
                      onChange={(e) => setTransferRemark(e.target.value)}
                      maxLength={200}
                      placeholder="Birthday gift, reimbursement, etc."
                    />
                  </label>
                  <button type="submit" className="pc-btn wide">
                    Send Points
                  </button>
                </form>
                {transferStatus && (
                  <p
                    className={
                      transferStatus.type === "success"
                        ? "tx-status tx-status-success"
                        : "tx-status tx-status-error"
                    }
                  >
                    {transferStatus.message}
                  </p>
                )}
              </div>
            )}

            {showRedeemCard && (
              <div className="pc-card tx-card u-mt-16">
                <h2 className="pc-name">Redeem Points</h2>
                <p className="pc-desc-muted">
                  Create a redemption request. A cashier will process it at
                  checkout and apply the discount to your purchase.
                </p>
                <form onSubmit={handleRedeemSubmit} className="tx-form">
                  <label>
                    Amount to Redeem
                    <input
                      className="pc-input"
                      type="number"
                      value={redeemAmount}
                      onChange={(e) => setRedeemAmount(e.target.value)}
                      min="1"
                      required
                    />
                  </label>
                  <label>
                    Remark (optional)
                    <input
                      className="pc-input"
                      type="text"
                      value={redeemRemark}
                      onChange={(e) => setRedeemRemark(e.target.value)}
                      maxLength={200}
                      placeholder="Holiday promo, textbook purchase, etc."
                    />
                  </label>
                  <button type="submit" className="pc-btn wide">
                    Create Redemption Request
                  </button>
                </form>
                {redeemStatus && (
                  <p
                    className={
                      redeemStatus.type === "success"
                        ? "tx-status tx-status-success"
                        : "tx-status tx-status-error"
                    }
                  >
                    {redeemStatus.message}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* RIGHT column: History */}
        {showHistoryColumn && (
          <section className="transactions-column">
            <div className="pc-card tx-card">
              <h2 className="pc-name">History</h2>
              <p className="pc-desc-muted">
                View your past transactions. Filter by type or amount and page
                through your history.
              </p>

              <div className="tx-filters">
                <label>
                  Type
                  <select
                    className="pc-input"
                    value={txTypeFilter}
                    onChange={(e) => {
                      setTxPage(1);
                      setTxTypeFilter(e.target.value);
                    }}
                  >
                    <option value="">All</option>
                    <option value="purchase">Purchase</option>
                    <option value="redemption">Redemption</option>
                    <option value="transfer">Transfer</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </label>
                <label>
                  Min amount
                  <input
                    className="pc-input"
                    type="number"
                    value={txMinAmount}
                    onChange={(e) => {
                      setTxPage(1);
                      setTxMinAmount(e.target.value);
                      setTxMaxAmount("");
                    }}
                  />
                </label>
                <label>
                  Max amount
                  <input
                    className="pc-input"
                    type="number"
                    value={txMaxAmount}
                    onChange={(e) => {
                      setTxPage(1);
                      setTxMaxAmount(e.target.value);
                      setTxMinAmount("");
                    }}
                  />
                </label>
              </div>

              {txLoading ? (
                <p className="pc-desc-muted">Loading transactions…</p>
              ) : txError ? (
                <p className="tx-status tx-status-error">{txError}</p>
              ) : transactions.length === 0 ? (
                <p className="tx-empty">No transactions yet.</p>
              ) : (
                <ul className="tx-list">
                  {transactions.map((tx) => {
                    // ----- compute "Spent: $xx.xx" for purchases -----
                    let spentDollars = null;
                    let appliedPromotions = [];

                    // start with the raw remark
                    let cleanRemark = tx.remark;

                    if (cleanRemark && cleanRemark.trim().startsWith("{")) {
                      try {
                        const meta = JSON.parse(cleanRemark);

                        // 1) BEST SOURCE: spentCents from backend
                        if (typeof meta.spentCents === "number") {
                          spentDollars = meta.spentCents / 100; // cents → dollars
                        }

                        if (Array.isArray(meta.promotionIds)) {
                          appliedPromotions = meta.promotionIds;
                        }

                        // 2) Clean up the human comment
                        cleanRemark =
                          meta.comment && meta.comment.trim()
                            ? meta.comment.trim()
                            : "";
                      } catch {
                        // if parsing fails, keep remark as-is
                      }
                    }

                    // 3) FALLBACK: infer from points if still missing
                    if (
                      spentDollars == null &&
                      tx.type === "purchase" &&
                      typeof tx.amount === "number"
                    ) {
                      // 1 point per $0.25 → 4 points per $1
                      spentDollars = tx.amount / 4;
                    }

                    return (
                      <li key={tx.id} className={`tx-item tx-${tx.type}`}>
                        <div className="tx-main">
                          <span className="tx-type">{tx.type}</span>
                          <span className="tx-amount">
                            {tx.amount > 0 ? "+" : ""}
                            {tx.amount} pts
                          </span>
                        </div>

                        <div className="tx-meta">
                          {spentDollars != null && (
                            <span>Spent: ${spentDollars.toFixed(2)}</span>
                          )}
                          {appliedPromotions.length > 0 && (
                            <span>Promotions Applied: {appliedPromotions.join(", ")}</span>
                          )}

                          {cleanRemark && <span>“{cleanRemark}”</span>}

                          {tx.createdBy && (
                            <span>Created by: {tx.createdBy}</span>
                          )}
                          {tx.relatedId && (
                            <span>Related ID: {tx.relatedId}</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="tx-pagination u-mt-12">
                <button
                  className="pc-btn secondary"
                  disabled={!canPrev}
                  onClick={() => canPrev && setTxPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span className="pc-page">
                  Page {txPage} of {totalPages} ({txTotalCount} total)
                </span>
                <button
                  className="pc-btn secondary"
                  disabled={!canNext}
                  onClick={() => canNext && setTxPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
