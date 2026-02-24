import React, { useEffect, useState } from "react";
import AdminGuard from "./AdminGuard";
import AdminDashboard from "./pages/AdminDashboard";
import MainApp from "./MainApp";

function getPathname() {
  return window.location.pathname || "/";
}

function isAdminRoute(pathname: string) {
  // supports /admin and /admin/anything
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

const App: React.FC = () => {
  const [path, setPath] = useState(getPathname());

  useEffect(() => {
    const sync = () => setPath(getPathname());

    // 1) browser back/forward
    window.addEventListener("popstate", sync);

    // 2) patch pushState/replaceState so SPA navigation updates App
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;

    history.pushState = function (...args) {
      originalPush.apply(this, args as any);
      sync();
    } as any;

    history.replaceState = function (...args) {
      originalReplace.apply(this, args as any);
      sync();
    } as any;

    // 3) optional custom event (if you dispatch it)
    const handleNavigate = (e: any) => {
      if (typeof e?.detail === "string") {
        history.pushState({}, "", e.detail);
        sync();
      } else {
        sync();
      }
    };
    window.addEventListener("navigate", handleNavigate as any);

    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("navigate", handleNavigate as any);

      // restore history methods
      history.pushState = originalPush;
      history.replaceState = originalReplace;
    };
  }, []);

  if (isAdminRoute(path)) {
    return (
      <AdminGuard>
        <AdminDashboard />
      </AdminGuard>
    );
  }

  return <MainApp />;
};

export default App;
