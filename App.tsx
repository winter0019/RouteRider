import React, { useState, useEffect } from "react";
import AdminGuard from "./AdminGuard";
import AdminDashboard from "./pages/AdminDashboard";
import MainApp from "./MainApp";
import AdPopup from "./components/AdPopup";

const App: React.FC = () => {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    
    // Listen for custom navigation events if needed
    const handleNavigate = (e: any) => setPath(e.detail);
    window.addEventListener("navigate", handleNavigate as any);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("navigate", handleNavigate as any);
    };
  }, []);

  return (
    <>
      {path === "/admin" ? (
        <AdminGuard>
          <AdminDashboard />
        </AdminGuard>
      ) : (
        <MainApp />
      )}
      <AdPopup />
    </>
  );
};

export default App;
