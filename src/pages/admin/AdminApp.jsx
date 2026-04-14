import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';

export default function AdminApp({ adminData, onLogout }) {
  if (!adminData) return <Navigate to="/login" replace />;

  return (
    <Routes>
      <Route 
        path="dashboard" 
        element={<AdminDashboard adminData={adminData} onLogout={onLogout} />} 
      />
      <Route 
        path="*" 
        element={<Navigate to="/admin/dashboard" replace />} 
      />
    </Routes>
  );
}
