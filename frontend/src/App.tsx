import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PublicLanding } from './pages/PublicLanding';
import { Login } from './pages/Login';
import { AdminDashboard } from './pages/Admin/AdminDashboard';
import { DesignWorkspace } from './pages/Desain/DesignWorkspace';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicLanding />} />
        <Route path="/login" element={<Login />} />
        <Route path="/instruksi" element={<AdminDashboard />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/desain" element={<DesignWorkspace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
