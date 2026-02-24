import React, { useState, useEffect } from "react";
import AdminGuard from "./AdminGuard";
import AdminDashboard from "./pages/AdminDashboard";
import MainApp from "./MainApp";

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

  if (path === "/admin") {
    return (
      <AdminGuard>
        <AdminDashboard />
      </AdminGuard>
    );
  }

  return <MainApp />;
};

export default App;
