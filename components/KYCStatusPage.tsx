import React, { useEffect, useMemo, useState } from "react";
import { DriverProfile } from "../types";
import { ICONS } from "../constants";
import { api } from "../services/api";

interface KYCStatusPageProps {
  profile: DriverProfile;
  onRetry: () => void;
  onLogout: () => void;
}

/**
 * ✅ KYC Status Page (Fail-Closed)
 * - none/required  -> show "Action Required" + Continue Verification
 * - pending        -> show "Pending" + auto-refresh loop
 * - failed         -> show "Failed" + Retry
 * - verified       -> show "Verified" + Continue to Dashboard
 *
 * IMPORTANT:
 * - This page should be the ONLY gate before dashboard features
 * - Do NOT allow posting trips / withdrawals unless verified (backend already blocks)
 */
const KYCStatusPage: React.FC<KYCStatusPageProps> = ({ profile, onRetry, onLogout }) => {
  const status = String(profile?.kyc_status || "none").toLowerCase();
  const isVerified = status === "verified";
  const isPending = status === "pending";
  const isFailed = status === "failed";
  const isRequired = !isVerified && !isPending && !isFailed; // "none" or anything else

  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  // Optional: show backend failure reason if you store it (kyc_reason)
  const failReason = (profile as any)?.kyc_reason || (profile as any)?.reason || "";

  const ui = useMemo(() => {
    if (isVerified) {
      return {
        icon: ICONS.Check,
        title: "Verified Successfully",
        subtitle: profile.full_name || "Verified User",
        message:
          "Your identity has been verified. You can now access all driver features including posting trips and withdrawals.",
        badgeClass: "bg-emerald-100 text-emerald-600 shadow-emerald-100",
      };
    }
    if (isPending) {
      return {
        icon: ICONS.Clock,
        title: "Verification Pending",
        subtitle: profile.full_name || "Pending Review",
        message:
          "Our system is reviewing your document and selfie. This usually takes a short time. Please refresh or wait for automatic updates.",
        badgeClass: "bg-amber-100 text-amber-600 shadow-amber-100",
      };
    }
    if (isFailed) {
      return {
        icon: ICONS.Alert,
        title: "Verification Failed",
        subtitle: profile.full_name || "Verification Failed",
        message:
          "We couldn't verify your identity with the submitted document. Please retry with a clearer document photo and a well-lit selfie.",
        badgeClass: "bg-red-100 text-red-600 shadow-red-100",
      };
    }
    return {
      icon: ICONS.User,
      title: "Action Required",
      subtitle: profile.full_name || "Unverified User",
      message: "You must complete identity verification before you can access the dashboard.",
      badgeClass: "bg-slate-100 text-slate-600 shadow-slate-100",
    };
  }, [isVerified, isPending, isFailed, profile.full_name]);

  /**
   * ✅ Auto-poll profile while pending
   * - This expects your parent app to refresh `profile` when /api/users/profile changes.
   * - If your parent does NOT auto-refresh profile, you can call api.getProfile() here and
   *   lift it up later. For now, we just reload the page as a safe MVP pattern.
   */
  useEffect(() => {
    if (!isPending) return;

    setPolling(true);
    const t = setInterval(() => {
      // safest MVP: reload which triggers MainApp profile fetch + routing
      window.location.reload();
    }, 15000); // every 15 seconds

    return () => {
      clearInterval(t);
      setPolling(false);
    };
  }, [isPending]);

  /**
   * ✅ Optional MVP: allow user to trigger /api/kyc/verify manually
   * Use only if you want "Verify Now" for testing.
   * In production, verification should happen via worker/admin review.
   */
  const verifyNow = async () => {
    setBusy(true);
    setLocalError(null);
    try {
      await api.verifyKYC(); // POST /api/kyc/verify
      window.location.reload();
    } catch (e: any) {
      setLocalError(e?.message || "Verification failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const refreshStatus = async () => {
    // MVP: reload so MainApp refetches /api/users/profile and reroutes if verified
    window.location.reload();
  };

  const continueToDashboard = () => {
    // Change this to your real dashboard route if different
    window.location.href = "/"; // or "/driver"
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center space-y-8 animate-in fade-in duration-500">
      <header className="space-y-4">
        <div
          className={`mx-auto w-24 h-24 rounded-[2.5rem] flex items-center justify-center text-4xl shadow-2xl border-4 border-white ${ui.badgeClass}`}
        >
          {ui.icon}
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">{ui.title}</h1>
          <p className="text-gray-500 font-bold text-sm uppercase tracking-widest">{ui.subtitle}</p>
        </div>
      </header>

      <div className="max-w-xs space-y-4">
        <p className="text-slate-600 font-bold leading-relaxed">{ui.message}</p>

        {localError && (
          <div className="bg-red-50 border border-red-100 p-4 rounded-2xl text-red-700 text-xs font-bold text-left space-y-1">
            <p className="uppercase tracking-tight">Error:</p>
            <p className="opacity-80">{localError}</p>
          </div>
        )}

        {isFailed && (
          <div className="bg-red-50 border border-red-100 p-4 rounded-2xl text-red-700 text-xs font-bold text-left space-y-1">
            <p className="uppercase tracking-tight">Reason for failure:</p>
            <p className="opacity-80">{failReason || "Document image was blurry or name/selfie mismatch detected."}</p>
          </div>
        )}

        {isPending && (
          <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl text-amber-800 text-xs font-bold text-left space-y-1">
            <p className="uppercase tracking-tight">Status:</p>
            <p className="opacity-80">
              Pending review. {polling ? "Auto-refresh is enabled (every 15s)." : "Please refresh shortly."}
            </p>
          </div>
        )}
      </div>

      <div className="w-full max-w-xs space-y-3">
        {/* Required (none) */}
        {isRequired && (
          <button
            onClick={onRetry}
            className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-lg shadow-xl shadow-emerald-200 active:scale-[0.98] transition-all"
          >
            Continue Verification
          </button>
        )}

        {/* Failed */}
        {isFailed && (
          <button
            onClick={onRetry}
            className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-lg shadow-xl shadow-emerald-200 active:scale-[0.98] transition-all"
          >
            Try Again
          </button>
        )}

        {/* Pending */}
        {isPending && (
          <button
            onClick={refreshStatus}
            className="w-full bg-slate-900 text-white p-5 rounded-2xl font-black text-lg shadow-xl shadow-slate-200 active:scale-[0.98] transition-all"
          >
            Refresh Status
          </button>
        )}

        {/* Verified */}
        {isVerified && (
          <button
            onClick={continueToDashboard}
            className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-lg shadow-xl shadow-emerald-200 active:scale-[0.98] transition-all"
          >
            Continue to Dashboard
          </button>
        )}

        {/* Optional: Verify Now (MVP testing only) */}
        {(isPending || isFailed) && (
          <button
            onClick={verifyNow}
            disabled={busy}
            className="w-full bg-white border-2 border-slate-100 text-slate-700 p-5 rounded-2xl font-black text-lg hover:bg-slate-50 disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {busy ? "Verifying..." : "Verify Now (MVP Test)"}
          </button>
        )}

        <button
          onClick={onLogout}
          className="w-full bg-white border-2 border-slate-100 text-slate-500 p-5 rounded-2xl font-black text-lg hover:bg-slate-50 active:scale-[0.98] transition-all"
        >
          Sign Out
        </button>
      </div>

      <footer className="pt-8">
        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
          Secure Identity Verification
        </p>
      </footer>
    </div>
  );
};

export default KYCStatusPage;
