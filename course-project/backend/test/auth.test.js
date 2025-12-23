"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const baseUrl =
  process.env.TEST_BASE_URL || "https://prestige-circle.vercel.app";

test("POST /auth/tokens returns 400 when missing credentials", async () => {
  const res = await fetch(`${baseUrl}/auth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "Missing utorid or password");
});

test("GET /users/me returns 401 when unauthenticated", async () => {
  const res = await fetch(`${baseUrl}/users/me`, { method: "GET" });

  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, "Unauthorized");
});
