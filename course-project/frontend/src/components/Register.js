import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "./Auth.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000";

function Register() {
  const [utorid, setUtorid] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const navigate = useNavigate();
  const { hasRole } = useAuth();

  if (!hasRole(["cashier", "manager", "superuser"])) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="error-message">
            You dont have permission to register new users. Only cashiers,
            managers and superusers can create accounts!
          </div>
          <button
            onClick={() => navigate("/landing-page")}
            className="btn-primary"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const validateUtorid = (value) => {
    return /^[A-Za-z0-9]{7,8}$/.test(value);
  };

  const validateEmail = (value) => {
    return /^[^@]+@mail\.utoronto\.ca$/.test(value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!utorid || !email || !name) {
      setError("Please fill in all the fields");
      return;
    }

    if (!validateUtorid(utorid)) {
      setError("UTORid must be 7-8 alphanumeric characters!");
      return;
    }

    if (!validateEmail(email)) {
      setError("Email must be a valid email ending with @mail.utoronto.ca");
      return;
    }

    if (name.length < 1 || name.length > 50) {
      setError("Name must be between 1 and 50 characters");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ utorid, email, name }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError("Registration failed");
        return;
      }

      setResetToken(data.resetToken);
      setSuccess(true);
      setUtorid("");
      setEmail("");
      setName("");
    } catch (err) {
      setError("Registration failed");
    }
  };

  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="success-message">
            <h2>Account Created Successfully!</h2>
            <p>
              The user account has been created. Please provide the following
              activation token to the user:
            </p>
            <div className="token-display">
              <code>{resetToken}</code>
            </div>
            <p className="token-info">
              This token will expire in 7 days. The user should use it to set
              their password.
            </p>
            <button
              onClick={() => navigate("/landing-page")}
              className="btn-secondary"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Register New User</h1>
          <p>Create a new user account</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="utorid">UTORid *</label>
            <input
              type="text"
              id="utorid"
              value={utorid}
              onChange={(e) => setUtorid(e.target.value)}
              placeholder="7-8 alphanumeric characters"
              maxLength={8}
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email *</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@mail.utoronto.ca"
            />
          </div>

          <div className="form-group">
            <label htmlFor="name">Full Name *</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter full name"
              maxLength={50}
            />
          </div>

          <div className="button-group">
            <button type="submit" className="btn-primary">
              Create Account
            </button>
            <button
              type="button"
              onClick={() => navigate("/landing-page")}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Register;
