import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import SuperAdminDashboard from "./SuperAdminDashboard";
import AdminForm from "./AdminForm";

export default function SuperAdminApp({ onLogout }) {
  return (
    <Routes>
      <Route
        path="dashboard"
        element={<SuperAdminDashboard onLogout={onLogout} />}
      />
      <Route path="admins/add" element={<AdminForm />} />
      <Route path="admins/edit/:id" element={<AdminForm />} />
      <Route
        path="*"
        element={<Navigate to="/superadmin/dashboard" replace />}
      />
    </Routes>
  );
}
