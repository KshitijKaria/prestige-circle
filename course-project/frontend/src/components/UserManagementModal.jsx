import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { apiUrl } from "../config/apiBase";
import "./UserManagementModal.css";

function UserManagementModal({ user, isOpen, onClose, onUserUpdated }) {
  const [currentUserData, setCurrentUserData] = useState(user);
  const { token, user: currentUser } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen && user) {
      setCurrentUserData(user);
    }
  }, [isOpen, user]);

  useEffect(() => {
    setError("");
  }, [onClose]);

  const updateUser = async (updates) => {
    setError("");

    try {
      const response = await fetch(apiUrl(`/users/${user.id}`), {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update user");
      }
      const updatedUser = await response.json();
      setCurrentUserData(updatedUser);
      onUserUpdated(updatedUser);
    } catch (err) {
      setError(err.message);
    }
  };

  const canManageUsers =
    currentUser?.role === "manager" || currentUser?.role === "superuser";
  const canPromoteTo = (targetRole) => {
    if (currentUser?.role === "superuser") {
      return true;
    }
    if (currentUser?.role === "manager") {
      return ["regular", "cashier", "manager"].includes(targetRole);
    }
    return false;
  };

  if (!isOpen || !user) {
    return null;
  }

  const handleVerify = () => {
    updateUser({ verified: true });
  };

  const handleMarkSuspicious = () => {
    updateUser({ suspicious: true });
  };

  const handleRemoveSuspicious = () => {
    updateUser({ suspicious: false });
  };

  const handleRoleChange = (role) => {
    updateUser({ role });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Management Actions</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-message">{error}</div>}

          {canManageUsers && (
            <div className="management-actions">
              {!currentUserData?.verified && (
                <div className="action-section">
                  <>
                    <h4>User Verification</h4>
                    <div className="action-buttons">
                      <button
                        className="action-btn verify-btn"
                        onClick={handleVerify}
                      >
                        ✓ Verify User
                      </button>
                    </div>
                  </>
                </div>
              )}

              {currentUserData?.role === "cashier" && (
                <div className="action-section">
                  <h4>Suspicious Status</h4>
                  <div className="action-buttons">
                    {!currentUserData?.suspicious ? (
                      <button
                        className="action-btn suspicious-btn"
                        onClick={handleMarkSuspicious}
                      >
                        ⚠️ Mark as Suspicious
                      </button>
                    ) : (
                      <button
                        className="action-btn not-suspicious-btn"
                        onClick={handleRemoveSuspicious}
                      >
                        Remove Suspicious Mark
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="action-section">
                <h4>Role Management</h4>
                <div className="role-selection">
                  <label>Change Role:</label>
                  <select
                    value={currentUserData?.role}
                    onChange={(e) => handleRoleChange(e.target.value)}
                    className="role-select-modal"
                  >
                    <option value="regular" disabled={!canPromoteTo("regular")}>
                      Regular User
                    </option>
                    <option value="cashier" disabled={!canPromoteTo("cashier")}>
                      Cashier
                    </option>
                    <option value="manager" disabled={!canPromoteTo("manager")}>
                      Manager
                    </option>
                    <option
                      value="superuser"
                      disabled={!canPromoteTo("superuser")}
                    >
                      Superuser
                    </option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UserManagementModal;
