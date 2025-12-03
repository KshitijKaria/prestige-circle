import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

import Login from "./components/Login";
import Register from "./components/Register";
import LandingPage from "./components/LandingPage";
import ResetPassword from "./components/ResetPassword";
import ProtectedRoute from "./components/ProtectedRoute";
import ForgotPassword from "./components/ForgotPassword";
import UsersList from "./components/UsersList";
import Profile from "./components/Profile";
import Layout from "./components/Layout";

import EventsPage from "./components/EventsPage";
import EventDetails from "./components/EventDetails";
import EventManage from "./components/EventManage";
import EventNew from "./components/EventNew";

import TransactionRegular from "./components/TransactionRegular";
import TransactionCashier from "./components/TransactionCashier";
import TransactionManager from "./components/TransactionManager";

import PromotionCreate from "./components/PromotionCreate";
import PromotionDetails from "./components/PromotionDetails";
import PromotionEdit from "./components/PromotionEdit";
import Promotions from "./components/Promotions";

import "./App.css";

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Public / unauthenticated routes */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/landing-page" /> : <Login />}
      />
      <Route
        path="/reset-password"
        element={
          isAuthenticated ? <Navigate to="/landing-page" /> : <ResetPassword />
        }
      />
      <Route
        path="/forgot-password"
        element={
          isAuthenticated ? (
            <Navigate to="/forgot-password" />
          ) : (
            <ForgotPassword />
          )
        }
      />

      {/* Authenticated shell */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                {/* core */}
                <Route path="/landing-page" element={<LandingPage />} />
                <Route path="/profile" element={<Profile />} />

                {/* account/admin per spec */}
                <Route
                  path="/register"
                  element={
                    <ProtectedRoute
                      requiredRoles={["cashier", "manager", "superuser"]}
                    >
                      <Register />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/users"
                  element={
                    <ProtectedRoute requiredRoles={["manager", "superuser"]}>
                      <UsersList />
                    </ProtectedRoute>
                  }
                />

                {/* events per spec */}
                <Route path="/events" element={<EventsPage />} />
                <Route
                  path="/events/new"
                  element={
                    <ProtectedRoute requiredRoles={["manager", "superuser"]}>
                      <EventNew />
                    </ProtectedRoute>
                  }
                />
                <Route path="/events/:id" element={<EventDetails />} />
                <Route path="/events/:id/manage" element={<EventManage />} />

                {/* 🔹 transactions */}
                <Route path="/transactions" element={<TransactionRegular />} />
                <Route
                  path="/create-transaction"
                  element={<TransactionCashier mode="purchase" />}
                />
                <Route
                  path="/process-redemption"
                  element={<TransactionCashier mode="redemption" />}
                />
                <Route path="/all-transactions" element={<TransactionManager />} />

                <Route
                  path="/promotions"
                  element={<Promotions />}
                />

                <Route
                  path="/promotions/create"
                  element={<PromotionCreate />}
                />

                <Route
                  path="/promotions/:id"
                  element={<PromotionDetails />}
                />

                <Route
                  path="/promotions/:id/edit"
                  element={<PromotionEdit />}
                />

                {/* fallback */}
                <Route
                  path="*"
                  element={<Navigate to="/landing-page" replace />}
                />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to="/landing-page" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
