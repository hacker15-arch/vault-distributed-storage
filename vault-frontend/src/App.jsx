import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import AdminLogin from './pages/AdminLogin';
import Register from './pages/Register';
import UserDrive from './pages/UserDrive';

import Dashboard from './pages/Dashboard';
import Objects from './pages/Objects';
import Nodes from './pages/Nodes';
import NodeDetails from './pages/NodeDetails';
import Replication from './pages/Replication';
import Repairs from './pages/Repairs';
import Integrity from './pages/Integrity';
import Rebalancing from './pages/Rebalancing';
import Health from './pages/Health';
import Logs from './pages/Logs';
import Simulation from './pages/Simulation';

// Protected Route Guard strictly enforcing Admin Role
function ProtectedAdminRoute({ children }) {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }
  if (user?.role !== 'admin') {
    return <Navigate to="/drive" replace />;
  }
  return children;
}

// Protected Route Guard for Regular User Drive
function ProtectedUserRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* Clean Regular User Drive Interface */}
          <Route
            path="/drive"
            element={
              <ProtectedUserRoute>
                <UserDrive />
              </ProtectedUserRoute>
            }
          />

          {/* Enterprise Admin Infrastructure Dashboard (Protected: Admin Role Only) */}
          <Route
            path="/admin"
            element={
              <ProtectedAdminRoute>
                <Layout />
              </ProtectedAdminRoute>
            }
          >
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="objects" element={<Objects />} />
            <Route path="nodes" element={<Nodes />} />
            <Route path="nodes/:nodeId" element={<NodeDetails />} />
            <Route path="replication" element={<Replication />} />
            <Route path="repairs" element={<Repairs />} />
            <Route path="integrity" element={<Integrity />} />
            <Route path="rebalancing" element={<Rebalancing />} />
            <Route path="health" element={<Health />} />
            <Route path="logs" element={<Logs />} />
            <Route path="simulation" element={<Simulation />} />
          </Route>

          {/* Default Redirection */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
