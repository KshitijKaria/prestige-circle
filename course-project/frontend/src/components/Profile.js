import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import "./Profile.css";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000";

function Profile() {
  const { user, setUser } = useAuth();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    birthday: "",
  });
  const [changed, setChanged] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || "",
        email: user.email || "",
        birthday: user.birthday || "",
      })
    }
  }, [user]);

  // helper: refetch user data to stay up to date when user info is updated
  const fetchUpdatedUser = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch("http://localhost:3000/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const updatedUser = await res.json();
    setUser(updatedUser); 
  };
  
  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setChanged(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (
      !formData.name ||
      formData.name.length < 1 ||
      formData.name.length > 50
    ) {
      setError("Name must be between 1 and 50 characters");
      return;
    }

    const emailPattern = /^[^@]+@mail\.utoronto\.ca$/;
    if (!emailPattern.test(formData.email)) {
      setError("Email must end with @mail.utoronto.ca");
      return;
    }

    if (formData.birthday) {
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      if (!datePattern.test(formData.birthday)) {
        setError("Birthday must be in YYYY-MM-DD format");
        return;
      }
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/users/me`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to update profile");
        return;
      }

      await fetchUpdatedUser(); // refetch
      setSuccess("Profile updated successfully!");
      
    } catch (err) {
      setError("Failed to update profile");
    }
  };

  const handleCancel = () => {
    setError("");
    setSuccess("");
    if (user) {
      setFormData({
        name: user.name || "",
        email: user.email || "",
        birthday: user.birthday || "",
      });
    }
    navigate("/landing-page");
  };

  return (
    <div className="profile-page">
      <div className="profile-container">
        <div className="profile-card">
          <div className="profile-header">
            <h1>My Profile</h1>
          </div>
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message-inline">{success}</div>}
          <form onSubmit={handleSubmit} className="profile-form">
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                maxLength={50}
                required
              />
            </div>

            <div className="form-group">
              <label>Email *</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Birthday (YYYY-MM-DD)</label>
              <input
                type="date"
                id="birthday"
                name="birthday"
                value={formData.birthday}
                onChange={handleChange}
              />
            </div>

            <div className="button-group">
              <button type="submit" className="btn-primary" disabled={!changed}>
                Save Changes
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Profile;
