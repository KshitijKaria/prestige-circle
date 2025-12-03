import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import UserManagementModal from "./UserManagementModal";
import "./UsersList.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000";

function UsersList() {
  const { token, currentInterface } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(20);

  const [nameFilter, setNameFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [verifiedFilter, setVerifiedFilter] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchUsers = useCallback(
    async (page = 1) => {
      setError("");

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (nameFilter.trim()) {
        params.append("name", nameFilter.trim());
      }

      if (roleFilter) {
        params.append("role", roleFilter);
      }

      if (verifiedFilter) {
        params.append("verified", verifiedFilter);
      }

      try {
        const response = await fetch(`${API_BASE_URL}/users?${params}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const data = await response.json();
        setUsers(data.results || []);
        setTotalCount(data.count || 0);
        setCurrentPage(page);
      } catch (err) {
        setError("Failed to fetch users.");
      }
    },
    [nameFilter, roleFilter, verifiedFilter, token, limit]
  );

  useEffect(() => {
    fetchUsers(1);
  }, [fetchUsers]);

  const handlePageChange = (newPage) => {
    fetchUsers(newPage);
  };

  const totalPages = Math.ceil(totalCount / limit);

  const formatDate = (dateString) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString();
  };

  const getRoleBadgeClass = (role) => {
    const classes = {
      regular: "role-badge-regular",
      cashier: "role-badge-cashier",
      manager: "role-badge-manager",
      superuser: "role-badge-superuser",
    };
    return classes[role] || "role-badge-default";
  };

  return (
    <div className="users-list-container">
      <div className="users-list-header">
        <h1>Users Management</h1>
        <button
          className="btn-secondary"
          onClick={() => navigate("/landing-page")}
        >
          Back to Dashboard
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="filters-section">
        <div className="filter-group">
          <label>Search by name or UTORid:</label>
          <input
            type="text"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Enter name or UTORid..."
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label>Role:</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Roles</option>
            <option value="regular">Regular</option>
            <option value="cashier">Cashier</option>
            <option value="manager">Manager</option>
            <option value="superuser">Superuser</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Verified:</label>
          <select
            value={verifiedFilter}
            onChange={(e) => setVerifiedFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All</option>
            <option value="true">Verified</option>
            <option value="false">Unverified</option>
          </select>
        </div>
      </div>

      <div className="results-count">
        Showing {users.length} of {totalCount} users
      </div>

      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>UTORid</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Points</th>
              <th>Verified</th>
              <th>Last Login</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                onClick={() => {
                  const canManageUsers =
                    currentInterface === "manager" ||
                    currentInterface === "superuser";
                  const canManageThisUser =
                    currentInterface === "superuser" ||
                    (currentInterface === "manager" &&
                      user.role !== "manager" &&
                      user.role !== "superuser");

                  if (canManageUsers && canManageThisUser) {
                    setSelectedUser(user);
                    setIsModalOpen(true);
                  }
                }}
                className="clickable-row"
              >
                <td className="utorid-cell">{user.utorid}</td>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>
                  <span
                    className={`role-badge ${getRoleBadgeClass(user.role)}`}
                  >
                    {user.role ? user.role.toUpperCase() : "Unknown"}
                  </span>
                </td>
                <td className="points-cell">{user.points}</td>
                <td>
                  <span
                    className={`status-badge ${
                      user.verified ? "status-verified" : "status-unverified"
                    }`}
                  >
                    {user.verified ? "✓" : "X"}
                  </span>
                </td>
                <td>{formatDate(user.lastLogin)}</td>
                <td>{formatDate(user.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="btn-secondary"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            Previous
          </button>

          <span className="page-info">
            Page {currentPage} of {totalPages}
          </span>

          <button
            className="btn-secondary"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      )}

      {users.length === 0 && <div className="no-users">No users found.</div>}

      <UserManagementModal
        user={selectedUser}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedUser(null);
        }}
        onUserUpdated={(updatedUser) => {
          setUsers((prevUsers) =>
            prevUsers.map((u) =>
              u.id === updatedUser.id ? { ...u, ...updatedUser } : u
            )
          );
          setSelectedUser((prev) =>
            prev ? { ...prev, ...updatedUser } : updatedUser
          );
        }}
      />
    </div>
  );
}

export default UsersList;
