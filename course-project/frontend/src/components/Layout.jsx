import { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import {
  FaStar,
  FaCalendarAlt,
  FaMoneyBill,
  FaTimes,
  FaBars,
  FaSignOutAlt,
  FaUser,
  FaChevronDown,
  FaTags,
  FaUserPlus,
  FaUsers,
  FaDollarSign,
} from "react-icons/fa";
import { HiOutlineViewGrid } from "react-icons/hi";
import { useAuth } from "../contexts/AuthContext";
import "./Layout.css";
import ChatAssistant from "./ChatAssistant";

function Layout({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showInterfaceMenu, setShowInterfaceMenu] = useState(false);
  const location = useLocation();
  const {
    logout,
    currentInterface,
    availableInterfaces,
    switchInterface,
    token,
  } = useAuth();
  const navigate = useNavigate();

  // Helper: which interface levels can see which links
  const canAccess = (requiredInterface) => {
    const interfaceOrder = {
      regular: 1,
      cashier: 2,
      manager: 3,
      superuser: 4,
    };
    return (
      interfaceOrder[currentInterface] >= interfaceOrder[requiredInterface]
    );
  };

  const isCashierPlus = currentInterface === "cashier" | currentInterface === "manager" | currentInterface === "superuser";

  const handleSwitchInterface = (interfaceName) => {
    switchInterface(interfaceName);
    setShowInterfaceMenu(false);
    navigate("/landing-page");
  };

  const getInterfaceLabel = (interfaceName) => {
    const labels = {
      regular: "Regular User",
      cashier: "Cashier",
      manager: "Manager",
      superuser: "Superuser",
      organizer: "Event Organizer",
    };
    return labels[interfaceName] || interfaceName;
  };

  return (
    <div className="layout-container">
      <div className={`sidebar ${isOpen ? "show" : "hide"}`}>
        <button className="toggle-btn" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <FaTimes /> : <FaBars />}
        </button>

        <nav>
          {/* Dashboard (all interfaces) */}
          <Link
            to="/landing-page"
            className={
              location.pathname === "/landing-page" ? "active-link" : ""
            }
          >
            <HiOutlineViewGrid /> <span>Dashboard</span>
          </Link>

          {/* Regular + higher navigation */}
          {canAccess("regular") && (
            <>
              <Link
                to="/events"
                className={location.pathname === "/events" ? "active-link" : ""}
              >
                <FaCalendarAlt /> <span>Events</span>
              </Link>

              <Link
                to="/promotions"
                className={
                  location.pathname === "/promotions" ? "active-link" : ""
                }
              >
                <FaStar /> <span>Promotions</span>
              </Link>

              {/* My Transactions:
                  - shown for regular / manager / superuser
                  - HIDDEN for cashier interface */}
              {!isCashierPlus && (
                <Link
                  to="/transactions"
                  className={
                    location.pathname === "/transactions" ? "active-link" : ""
                  }
                >
                  <FaMoneyBill /> <span>Transactions</span>
                </Link>
              )}
            </>
          )}

          {/* Cashier interface navigation:
              - Create purchase transaction
              - Process redemption by transaction ID
              - Register user */}
          {canAccess("cashier") && (
            <>
              <Link
                to="/create-transaction"
                className={
                  location.pathname === "/create-transaction"
                    ? "active-link"
                    : ""
                }
              >
                <FaDollarSign /> <span>Create Transaction</span>
              </Link>

              <Link
                to="/process-redemption"
                className={
                  location.pathname === "/process-redemption"
                    ? "active-link"
                    : ""
                }
              >
                <FaTags /> <span>Process Redemption</span>
              </Link>

              <Link
                to="/register"
                className={
                  location.pathname === "/register" ? "active-link" : ""
                }
              >
                <FaUserPlus /> <span>Register User</span>
              </Link>
            </>
          )}

          {/* Manager / Superuser interface navigation */}
          {(canAccess("manager") || canAccess("superuser")) &&
            (currentInterface === "manager" ||
              currentInterface === "superuser") && (
              <>
                <Link
                  to="/users"
                  className={
                    location.pathname === "/users" ? "active-link" : ""
                  }
                >
                  <FaUsers /> <span>View Users</span>
                </Link>

                <Link
                  to="/all-transactions"
                  className={
                    location.pathname === "/all-transactions"
                      ? "active-link"
                      : ""
                  }
                >
                  <FaMoneyBill /> <span>All Transactions</span>
                </Link>
              </>
            )}

          {/* Interface switcher (Regular / Cashier / Manager / Superuser) */}
          {availableInterfaces.length > 1 && (
            <div className="interface-switcher">
              <div
                className="interface-selector"
                onClick={() => {
                  setShowInterfaceMenu(!showInterfaceMenu);
                  setIsOpen(true);
                }}
              >
                <FaUser />
                <span>{getInterfaceLabel(currentInterface)}</span>
                <FaChevronDown
                  className={`chevron ${showInterfaceMenu ? "rotated" : ""}`}
                />
              </div>

              {showInterfaceMenu && isOpen && (
                <div className="interface-dropdown">
                  {availableInterfaces.map((interfaceName) => (
                    <div
                      key={interfaceName}
                      className={`interface-option ${
                        currentInterface === interfaceName ? "active" : ""
                      }`}
                      onClick={() => handleSwitchInterface(interfaceName)}
                    >
                      <span>{getInterfaceLabel(interfaceName)}</span>
                      {currentInterface === interfaceName && (
                        <span className="check-mark">✓</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>
      </div>

      <div className="main-content">
        <header className="top-bar">
          <div className="logo-section">
            <div className="prestige-logo">
              Prestige <span>Circle</span>
            </div>
          </div>

          <div className="top-right-section">
            <button
              className="logout-btn"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              <FaSignOutAlt />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {children}
        {token && <ChatAssistant />}
      </div>
    </div>
  );
}

export default Layout;
