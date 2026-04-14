import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import React, { useState } from "react";
import SuperAdminApp from "./pages/superadmin/SuperAdminApp";
import AdminApp from "./pages/admin/AdminApp";
import EmployeeApp from "./pages/employee/EmployeeApp";
import Login from "./pages/login/Login";
import "./index.css";

function App() {
  const [user, setUser] = useState(() => {
    const adminSaved = localStorage.getItem("adminAuth");
    const superSaved = localStorage.getItem("superAdminAuth");
    const employeeSaved = localStorage.getItem("employeeAuth");

    if (superSaved === "true")
      return { role: "superadmin", authRole: "superadmin" };
    if (adminSaved) {
      const parsed = JSON.parse(adminSaved);
      return {
        ...parsed,
        authRole: (parsed.authRole || parsed.role || "admin").toLowerCase(),
      };
    }
    if (employeeSaved) {
      const parsed = JSON.parse(employeeSaved);
      return {
        ...parsed,
        authRole: (parsed.authRole || parsed.role || "employee").toLowerCase(),
      };
    }
    return null;
  });

  const handleLogin = (data) => {
    setUser(data);
    const systemRole = (data.authRole || data.role || "").toLowerCase();

    if (systemRole === "superadmin") {
      localStorage.setItem("superAdminAuth", "true");
    } else if (systemRole === "admin") {
      localStorage.setItem("adminAuth", JSON.stringify(data));
    } else if (systemRole === "employee") {
      localStorage.setItem("employeeAuth", JSON.stringify(data));
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("adminAuth");
    localStorage.removeItem("superAdminAuth");
    localStorage.removeItem("employeeAuth");
  };

  const getRedirectPath = () => {
    if (!user) return "/login";
    const systemRole = (user.authRole || user.role || "").toLowerCase();

    if (systemRole === "superadmin") return "/superadmin/dashboard";
    if (systemRole === "admin") return "/admin/dashboard";
    if (systemRole === "employee") return "/employee/dashboard";
    return "/login";
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route
          path="/login"
          element={
            !user ? (
              <Login onLogin={handleLogin} />
            ) : (
              <Navigate to={getRedirectPath()} replace />
            )
          }
        />

        <Route
          path="/superadmin/*"
          element={
            user?.authRole === "superadmin" || user?.role === "superadmin" ? (
              <SuperAdminApp onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/admin/*"
          element={
            user?.authRole === "admin" || user?.role === "admin" ? (
              <AdminApp adminData={user} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/employee/*"
          element={
            user?.authRole === "employee" || user?.role === "employee" ? (
              <EmployeeApp employeeData={user} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route path="*" element={<Navigate to={getRedirectPath()} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
