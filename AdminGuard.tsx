import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { auth } from "./services/firebase";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const u = auth?.currentUser;
      if (!u) {
        setLoading(false);
        return;
      }

      try {
        // IMPORTANT: claims are inside the ID token
        const token = await u.getIdTokenResult(true);
        setIsAdmin(!!token.claims?.admin);
      } catch (error) {
        console.error("Error checking admin status:", error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, []);

  if (loading) return <div className="p-6 font-black">Loading...</div>;
  if (!auth?.currentUser) return <Navigate to="/" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}
