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

    // Back/forward
    window.addEventListener("popstate", sync);

    // Patch pushState/replaceState so SPA route changes are detected
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args as any);
      sync();
    } as any;

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args as any);
      sync();
    } as any;

    // Optional custom navigation event
    const handleNavigate = (e: any) => {
      if (typeof e?.detail === "string") {
        // Only push if it actually changes the path (prevents loops)
        if (window.location.pathname !== e.detail) {
          history.pushState({}, "", e.detail);
        }
      }
      sync();
    };

    window.addEventListener("navigate", handleNavigate as any);

    // Initial sync (in case pathname changed before mount)
    sync();

    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("navigate", handleNavigate as any);

      // Restore originals
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
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
