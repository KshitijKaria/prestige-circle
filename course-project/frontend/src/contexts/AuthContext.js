import React, { createContext, useState, useContext, useEffect } from "react";

const AuthContext = createContext(null);
const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3000";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [currentInterface, setCurrentInterface] = useState(
    localStorage.getItem("currentInterface") || "regular"
  );
  const [availableInterfaces, setAvailableInterfaces] = useState(["regular"]);

  useEffect(() => {
    const initializeAuthentication = async () => {
      const storedToken = localStorage.getItem("token");
      const expiresAt = localStorage.getItem("tokenExpiresAt");

      if (storedToken && expiresAt) {
        const now = new Date();
        const expiry = new Date(expiresAt);
        if (now < expiry) {
          try {
            const response = await fetch(`${API_BASE_URL}/users/me`, {
              headers: {
                Authorization: `Bearer ${storedToken}`,
                "Content-Type": "application/json",
              },
            });

            if (response.ok) {
              const userData = await response.json();
              setUser(userData);
              setToken(storedToken);

              const interfaces = determineAvailableInterfaces(userData);
              setAvailableInterfaces(interfaces);

              const storedInterface = localStorage.getItem("currentInterface");
              if (storedInterface && interfaces.includes(storedInterface)) {
                setCurrentInterface(storedInterface);
              } else {
                setCurrentInterface("regular");
                localStorage.setItem("currentInterface", "regular");
              }
            } else {
              logout();
            }
          } catch (error) {
            logout();
          }
        } else {
          logout();
        }
      }
    };

    initializeAuthentication();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const determineAvailableInterfaces = (userData) => {
    const interfaces = ["regular"];

    if (userData.role === "cashier") {
      interfaces.push("cashier");
    }
    if (userData.role === "manager") {
      interfaces.push("cashier", "manager");
    }
    if (userData.role === "superuser") {
      interfaces.push("cashier", "manager", "superuser");
    }

    // this avoids duplication
    return [...new Set(interfaces)];
  };

  const login = async (utorid, password) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/tokens`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ utorid, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || "Login failed" };
      }

      const { token: newToken, expiresAt } = data;

      localStorage.setItem("token", newToken);
      localStorage.setItem("tokenExpiresAt", expiresAt);
      setToken(newToken);

      const userResponse = await fetch(`${API_BASE_URL}/users/me`, {
        headers: {
          Authorization: `Bearer ${newToken}`,
          "Content-Type": "application/json",
        },
      });

      if (userResponse.ok) {
        const userData = await userResponse.json();
        setUser(userData);

        const interfaces = determineAvailableInterfaces(userData);
        setAvailableInterfaces(interfaces);
        const chosen = interfaces[interfaces.length - 1];
        setCurrentInterface(chosen);
        localStorage.setItem("currentInterface", chosen);
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: "Login failed. Please check your connection.",
      };
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("tokenExpiresAt");
    localStorage.removeItem("currentInterface");
    setToken(null);
    setUser(null);
    setCurrentInterface("regular");
    setAvailableInterfaces(["regular"]);
  };

  const switchInterface = (interfaceName) => {
    if (availableInterfaces.includes(interfaceName)) {
      setCurrentInterface(interfaceName);
      localStorage.setItem("currentInterface", interfaceName);
      return true;
    }
    return false;
  };

  const hasRole = (requiredRoles) => {
    if (!user) {
      return false;
    }
    if (typeof requiredRoles === "string") {
      return user.role === requiredRoles;
    }
    return requiredRoles.includes(user.role);
  };

  // 🔁 NEW: refresh current user from backend (e.g. after adjustments)
  const refreshUser = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) return;

      const userData = await response.json();
      setUser(userData);

      // Also keep interfaces / currentInterface in sync with any role change
      const interfaces = determineAvailableInterfaces(userData);
      setAvailableInterfaces(interfaces);

      setCurrentInterface((curr) => {
        if (interfaces.includes(curr)) {
          localStorage.setItem("currentInterface", curr);
          return curr;
        }
        const fallback = interfaces[interfaces.length - 1] || "regular";
        localStorage.setItem("currentInterface", fallback);
        return fallback;
      });
    } catch (err) {
      console.error("Failed to refresh user", err);
    }
  };

  const value = {
    user,
    setUser, // keep this if other components rely on it
    token,
    login,
    logout,
    hasRole,
    isAuthenticated: !!user,
    currentInterface,
    availableInterfaces,
    switchInterface,
    refreshUser, // 👈 expose refreshUser in context
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  return context;
};