"use strict";

// Vercel env var:
// REACT_APP_API_BASE_URL=https://<backend>.vercel.app
const rawBase = process.env.REACT_APP_API_BASE_URL || "";
const API_BASE_URL = rawBase.replace(/\/+$/, "");

const normalizePath = (path = "") => {
  const raw = String(path).trim();
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  if (withSlash === "/") return "/api";
  if (withSlash === "/api" || withSlash.startsWith("/api/")) return withSlash;
  return `/api${withSlash}`;
};

export const apiUrl = (path = "") => `${API_BASE_URL}${normalizePath(path)}`;
export { API_BASE_URL };
