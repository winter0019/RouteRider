import React, { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./services/firebase";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      setAllowed(false);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (user: User | null) => {
      if (!user) {
        setAllowed(false);
        setLoading(false);
        return;
      }

      try {
        // Claims are in the ID token result
        const token = await user.getIdTokenResult(true);
        const isAdmin = !!token.claims?.admin;
        setAllowed(isAdmin);
      } catch (err) {
        console.error("AdminGuard: failed to read claims:", err);
        setAllowed(false);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  // Redirect only AFTER we know the answer
  useEffect(() => {
    if (!loading && !allowed) {
      window.location.replace("/");
    }
  }, [loading, allowed]);

  if (loading) {
    return <div className="p-6 font-black text-black">Checking admin access…</div>;
  }

  if (!allowed) {
    // Redirect effect will run; render nothing
    return null;
  }

  return <>{children}</>;
}
