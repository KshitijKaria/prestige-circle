import React, { useState } from "react";
import { Link } from "react-router-dom";
import "./Auth.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000";

function ForgotPassword() {
  const [utorid, setUtorid] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!utorid || !email) {
      setError("Please enter both UTORid and email");
      return;
    }

    const emailPattern = /^[^@]+@mail\.utoronto\.ca$/;
    if (!emailPattern.test(email)) {
      setError("Email must end with @mail.utoronto.ca");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/resets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ utorid, email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to request password reset");
        return;
      }

      setExpiresAt(data.expiresAt);
      setSuccess(true);
    } catch (err) {
      setError("Failed to request password reset");
    }
  };

  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="success-message">
            <h2>Password Reset Email Sent!</h2>
            <p>
              We have sent a password reset token to your email address. Please
              check your inbox and use the token to reset your password.
            </p>
            <p className="token-info">
              This token will expire at: {new Date(expiresAt).toLocaleString()}
            </p>
            <div className="button-group">
              <Link to="/reset-password" className="btn-primary">
                Reset Password Now
              </Link>
              <Link to="/login" className="btn-secondary">
                Back to Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Forgot Password</h1>
          <p>Enter your UTORid and email to reset your password</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label>UTORid</label>
            <input
              type="text"
              id="utorid"
              value={utorid}
              onChange={(e) => setUtorid(e.target.value)}
              placeholder="Enter your UTORid"
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your UofT email"
            />
          </div>

          <button type="submit" className="btn-primary">
            Request Reset Token
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Remember your password? <Link to="/login">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;
