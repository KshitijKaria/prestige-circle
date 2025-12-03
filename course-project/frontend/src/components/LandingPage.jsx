import { useEffect, useState } from "react";
import "./LandingPage.css";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  FaGift,
  FaExchangeAlt,
  FaTags,
  FaCalendar,
  FaHistory,
} from "react-icons/fa";
import QRCodeBox from "./QRCode";

const API = process.env.REACT_APP_API_URL || "http://localhost:3000";

function LandingPage() {
  const { currentInterface, user: authUser, token } = useAuth();
  const [user, setUser] = useState(authUser || null);
  const [transactions, setTransactions] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      if (!token) return;

      try {
        // --- current user ---
        const currUser = await fetch(`${API}/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const userData = await currUser.json();
        if (!currUser.ok) {
          throw new Error(userData.error || "Failed to load user");
        }
        setUser(userData);

        // --- recent transactions (limit 5) ---
        const userTransactions = await fetch(
          `${API}/users/me/transactions?limit=5&page=1`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const txData = await userTransactions.json();

        if (userTransactions.ok && txData && Array.isArray(txData.results)) {
          setTransactions(txData.results);
        } else {
          setTransactions([]);
        }

        // --- upcoming events the user is RSVPed to ---
        const eventsRes = await fetch(
          `${API}/events?limit=50&page=1&includeMe=true`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const eventsData = await eventsRes.json();

        const allEvents = Array.isArray(eventsData.results)
          ? eventsData.results
          : [];

        const upcomingUserEvents = allEvents.filter(
          (e) => new Date(e.startTime) > new Date() && e.meRsvped === true
        );

        setUpcomingEvents(upcomingUserEvents);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [token]);

  if (loading) {
    return <p>Loading...</p>;
  }

  if (!user) {
    navigate("/login");
    return null;
  }

  function interfaceCheck(requiredInterface) {
    const roleOrder = {
      regular: 1,
      cashier: 2,
      manager: 3,
      superuser: 4,
    };

    return roleOrder[currentInterface] >= roleOrder[requiredInterface];
  }

  const handleViewAllTransactions = () => {
    if (currentInterface === "manager" || currentInterface === "superuser") {
      navigate("/all-transactions");
    } else {
      navigate("/transactions");
    }
  };

  return (
    <div className="landing-page-container">
      {/* Top header */}
      <section className="top-header">
        <div className="welcome-text">
          <h1>
            Welcome back, <span className="gradient-text">{user.name}</span>
          </h1>
          <p>
            Interface:{" "}
            <span className="user-role gradient-text">
              {currentInterface.toUpperCase()}
            </span>
          </p>
        </div>

        <div>
          <button
            className="header-buttons"
            onClick={() => navigate("/profile")}
          >
            My Profile
          </button>
        </div>
      </section>

      {/* Middle grid: QR code, balance, quick actions, upcoming events */}
      <div className="center-grid">
        <QRCodeBox user={user} />

        <section className="balance-card">
          <h2>Your Balance</h2>

          <div className="circle-wrapper">
            <svg style={{ height: 0 }}>
              <defs>
                <linearGradient id="gradient" gradientTransform="rotate(90)">
                  <stop offset="0%" stopColor="#0062ff" />
                  <stop offset="100%" stopColor="#abe6ff" />
                </linearGradient>
              </defs>
            </svg>

            <div style={{ width: 180, height: 180, margin: "0 auto" }}>
              <CircularProgressbar
                value={Math.min(user.points, 10000)}
                maxValue={10000}
                text={""}
                styles={buildStyles({
                  trailColor: "#1e293b",
                  textColor: "#ffffff",
                  pathColor: `url(#gradient)`,
                })}
              />
              <div className="progress-text">
                <div className="points-value gradient-text">
                  {user.points.toLocaleString()}
                </div>
                <div className="points-label">Points</div>
              </div>
            </div>
          </div>

          <button
            className="btn-send-points"
            onClick={() => {
              const destination =
                interfaceCheck("manager") || interfaceCheck("superuser")
                  ? "/all-transactions"
                  : "/transactions";

              navigate(destination);
            }}
          >
            <FaExchangeAlt className="btn-icon" /> Transfer Points
          </button>

          <p className="subtle-text">
            Last Login:{" "}
            {user.lastLogin
              ? new Date(user.lastLogin).toLocaleString()
              : "First time login"}
          </p>
        </section>

        <section className="right-grid">
          <div className="right-top">
            {interfaceCheck("regular") && (
              <section className="landingpage-button-grid">
                <button
                  className="action-btn"
                  onClick={() => navigate("/transactions")}
                >
                  <FaGift className="btn-icon" /> Redeem Points
                </button>

                <button
                  className="action-btn"
                  onClick={() => navigate("/promotions")}
                >
                  <FaTags className="btn-icon" /> View Promotions
                </button>

                <button
                  className="action-btn"
                  onClick={() => navigate("/events")}
                >
                  <FaCalendar className="btn-icon" /> View Events
                </button>
              </section>
            )}
          </div>

          <div className="upcoming-events-section">
            <h2 className="section-title">Upcoming Events</h2>

            <div className="events-content scroll-area">
              {loading ? (
                <p className="loading-msg">Loading your events...</p>
              ) : upcomingEvents.length > 0 ? (
                upcomingEvents.map((event) => (
                  <Link
                    className="event-card"
                    to={`/events/${event.id}`}
                    key={event.id}
                  >
                    <div className="gradient-text">{event.name}</div>
                    <div className="event-info">
                      <p>
                        <strong>Date:</strong>{" "}
                        {new Date(event.startTime).toLocaleDateString()}
                      </p>
                      <p>
                        <strong>Time:</strong>{" "}
                        {new Date(event.startTime).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <p>
                        <strong>Location:</strong> {event.location}
                      </p>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="no-events">
                  <p>You have no upcoming events.</p>
                  <p className="sub-msg">
                    To view available events, click the{" "}
                    <strong>"View Events"</strong> tab.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Recent transactions */}
      <section className="recent-transactions">
        <h2 className="transactions-title">Recent Transactions</h2>
        <div className="transactions-content">
          {transactions.length === 0 ? (
            <p className="subtle-text">No recent activity yet.</p>
          ) : (
            <ul className="transactions-list">
              {transactions.slice(0, 5).map((tx, index) => {
                // --- compute Spent + clean remark ---
                let spentDollars = null;

                // 1) Preferred: use spent from API (already dollars)
                if (typeof tx.spent === "number") {
                  spentDollars = tx.spent;
                }

                // clean, human-readable remark
                let cleanRemark = tx.remark || "";

                let appliedPromotions = [];

                if (cleanRemark && cleanRemark.trim().startsWith("{")) {
                  try {
                    const meta = JSON.parse(cleanRemark);

                    if (typeof meta.spentCents === "number") {
                      spentDollars = meta.spentCents / 100; // cents → dollars
                    }

                    if (Array.isArray(meta.promotionIds)) {
                      appliedPromotions = meta.promotionIds;
                    }

                    cleanRemark =
                      meta.comment && meta.comment.trim()
                        ? meta.comment.trim()
                        : "";
                  } catch {
                    // if JSON parse fails, leave remark as-is
                  }
                }

                if (
                  spentDollars == null &&
                  tx.type === "purchase" &&
                  typeof tx.amount === "number"
                ) {
                  // 1 point per $0.25  =>  4 points per $1
                  spentDollars = tx.amount / 4;
                }

                return (
                  <li
                    key={tx.id}
                    className={`transaction-card ${
                      index % 2 === 0 ? "even" : "odd"
                    }`}
                  >
                    <div className="transaction-left">
                      <span className={`t-type t-${tx.type}`}>
                        {tx.type.toUpperCase()}
                      </span>

                      {tx.type === "purchase" && spentDollars != null && (
                        <span className="transaction-spent">
                          Spent: ${spentDollars.toFixed(2)}
                        </span>
                      )}

                      {appliedPromotions.length > 0 && (
                        <span>
                          Promotions Applied: {appliedPromotions.join(", ")}
                        </span>
                      )}

                      {cleanRemark && (
                        <span className="transaction-remark">
                          “{cleanRemark}”
                        </span>
                      )}
                    </div>

                    <div className="transaction-right">
                      <span className="transaction-amount">
                        {tx.amount > 0 ? `+${tx.amount}` : tx.amount} pts
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <button
          className="transactions-viewall"
          onClick={handleViewAllTransactions}
        >
          <FaHistory /> View All Transactions
        </button>
      </section>
    </div>
  );
}

export default LandingPage;
