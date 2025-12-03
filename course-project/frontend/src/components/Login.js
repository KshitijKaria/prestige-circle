import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "./Auth.css";

function Login() {
  const [utorid, setUtorid] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!utorid || !password) {
      setError("Please fill in all the fields");
      return;
    }

    const result = await login(utorid, password);

    if (result.success) {
      localStorage.setItem("loggedIn", "true");
      if (result.token) {
        localStorage.setItem("token", result.token);
      }
      if (result.user) {
        localStorage.setItem("user", JSON.stringify(result.user));
      }
      
      navigate("/landing-page");
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Welcome Back</h1>
          <p>Log in to your account</p>
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
            <label>Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
          </div>

          <button type="submit" className="action-btn">
            Log In
          </button>
        </form>

        <div className="auth-footer">
          <p>
            <Link to="/reset-password">Reset your password?</Link>
          </p>
          <p>
            <Link to="/forgot-password">Forgot your password?</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
