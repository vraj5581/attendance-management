import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import EmployeeDashboard from './EmployeeDashboard';

export default function EmployeeApp({ employeeData, onLogout }) {
  if (!employeeData) return <Navigate to="/login" replace />;

  return (
    <Routes>
      <Route 
        path="dashboard" 
        element={<EmployeeDashboard employeeData={employeeData} onLogout={onLogout} />} 
      />
      <Route 
        path="*" 
        element={<Navigate to="/employee/dashboard" replace />} 
      />
    </Routes>
  );
}
