import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AdminGuard from "./AdminGuard";
import AdminDashboard from "./pages/AdminDashboard";
import MainApp from "./MainApp";

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/admin" 
          element={
            <AdminGuard>
              <AdminDashboard />
            </AdminGuard>
          }
        />
        <Route path="/*" element={<MainApp />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
