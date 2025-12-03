import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./Auth.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000";

function ResetPassword() {
  const [resetToken, setResetToken] = useState("");
  const [utorid, setUtorid] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const validatePassword = (password) => {
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,20}$/;
    return passwordRegex.test(password);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!resetToken || !utorid || !password || !confirmPassword) {
      setError("Please fill in all the fields");
      return;
    }

    if (!validatePassword(password)) {
      setError(
        "Password must be 8-20 characters long and should include an uppercase, a lowercase, a number and a special character!"
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/auth/resets/${resetToken}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ utorid, password }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to reset password");
        return;
      }
      navigate("/login");
    } catch (err) {
      setError("Failed to reset password");
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Reset Password</h1>
          <p>Enter your reset token and new password</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label>Reset Token *</label>
            <input
              type="text"
              id="resetToken"
              value={resetToken}
              onChange={(e) => setResetToken(e.target.value)}
              placeholder="Enter your reset token"
            />
          </div>

          <div className="form-group">
            <label>UTORid *</label>
            <input
              type="text"
              id="utorid"
              value={utorid}
              onChange={(e) => setUtorid(e.target.value)}
              placeholder="Enter your UTORid"
            />
          </div>

          <div className="form-group">
            <label>New Password *</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
            />
          </div>

          <div className="form-group">
            <label>Confirm Password *</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
          </div>

          <button type="submit" className="btn-primary">
            Reset Password
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

export default ResetPassword;
