import React, { useEffect, useState } from "react";
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
        const hasAdminClaim = !!token.claims?.admin;
        const isTargetEmail = u.email === 'dangalan20@gmail.com';
        setIsAdmin(hasAdminClaim || isTargetEmail);
      } catch (error) {
        console.error("Error checking admin status:", error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, []);

  if (loading) return <div className="p-6 font-black text-black">Loading...</div>;
  
  if (!auth?.currentUser || !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 text-center">
        <div className="w-20 h-20 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mb-6">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m14.5 9-5 5"/><path d="m9.5 9 5 5"/></svg>
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">Access Restricted</h2>
        <p className="text-slate-500 font-bold mb-8 max-w-xs">
          You need administrator privileges to view this dashboard.
        </p>
        <button 
          onClick={() => window.location.href = "/"}
          className="bg-brand-primary text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-brand-primary/20 active:scale-95 transition-all"
        >
          Return to Login
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
