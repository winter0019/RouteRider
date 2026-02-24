import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../services/firebase";

interface KYCSubmission {
  id: string;
  uid: string;

  full_name?: string;
  role?: string; // "driver" | "passenger"
  status?: string; // "submitted" | "approved" | "rejected"

  documentType?: string;
  idImagePath?: string;      // should be a public https URL (preferred)
  selfieImagePath?: string;  // optional

  aiDecision?: string; // "pass" | "review" | "fail"
  aiScore?: number;    // 0..1
  aiNotes?: string;

  createdAt?: any;
}

type AdminActionStatus = "idle" | "loading" | "success" | "error";

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || "";

async function authedAdminFetch(path: string, options: RequestInit = {}) {
  const user = auth?.currentUser;
  if (!user) throw new Error("Not authenticated");

  // IMPORTANT: force refresh so admin claims appear
  const token = await user.getIdToken(true);

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // try parse JSON error
    try {
      const j = JSON.parse(text);
      throw new Error(j.error || j.message || "Request failed");
    } catch {
      throw new Error(text || `Request failed (${res.status})`);
    }
  }

  // some endpoints might return empty
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  return res.json();
}

export default function AdminDashboard() {
  const [kycQueue, setKycQueue] = useState<KYCSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Admin tools
  const [targetUid, setTargetUid] = useState("");
  const [adminActionStatus, setAdminActionStatus] = useState<AdminActionStatus>("idle");
  const [adminActionMsg, setAdminActionMsg] = useState<string | null>(null);

  const pendingCount = useMemo(
    () => kycQueue.filter((x) => (x.status || "submitted") === "submitted").length,
    [kycQueue]
  );

  const fetchKYC = async () => {
    setError(null);
    setLoading(true);
    try {
      // NOTE: server route is /api/admin/kyc
      const data = await authedAdminFetch("/api/admin/kyc", { method: "GET" });
      setKycQueue(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || "Failed to fetch KYC queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKYC();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDecision = async (uid: string, status: "approved" | "rejected") => {
    try {
      await authedAdminFetch(`/api/admin/kyc/${uid}/decision`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });

      // remove item locally
      setKycQueue((prev) => prev.filter((item) => item.uid !== uid));
    } catch (err: any) {
      alert(err.message || "Failed to update status");
    }
  };

  // Admin claim tools
  const grantAdmin = async () => {
    if (!targetUid.trim()) return;
    setAdminActionStatus("loading");
    setAdminActionMsg(null);
    try {
      await authedAdminFetch(`/api/admin/users/${targetUid.trim()}/grant`, {
        method: "POST",
      });
      setAdminActionStatus("success");
      setAdminActionMsg("Admin granted successfully.");
    } catch (e: any) {
      setAdminActionStatus("error");
      setAdminActionMsg(e.message || "Failed to grant admin");
    }
  };

  const revokeAdmin = async () => {
    if (!targetUid.trim()) return;
    setAdminActionStatus("loading");
    setAdminActionMsg(null);
    try {
      await authedAdminFetch(`/api/admin/users/${targetUid.trim()}/revoke`, {
        method: "POST",
      });
      setAdminActionStatus("success");
      setAdminActionMsg("Admin revoked successfully.");
    } catch (e: any) {
      setAdminActionStatus("error");
      setAdminActionMsg(e.message || "Failed to revoke admin");
    }
  };

  if (loading) return <div className="p-8 font-black text-black">Loading Admin Data...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto bg-white min-h-screen text-black">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Admin Dashboard</h1>
          <p className="text-gray-500 font-bold">
            Manage RouteRider operations and verifications.
          </p>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">
            API: {API_BASE || "(missing VITE_API_BASE_URL)"}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={fetchKYC}
            className="bg-slate-100 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider"
          >
            Refresh
          </button>
          <button
            onClick={() => (window.location.href = "/")}
            className="bg-slate-100 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider"
          >
            Back to App
          </button>
        </div>
      </header>

      {error && (
        <div className="p-4 bg-red-50 border-2 border-red-100 rounded-2xl text-red-700 font-bold mb-6">
          Error: {error}
        </div>
      )}

      {/* =======================
          Admin Claims Tools
         ======================= */}
      <section className="mb-10 p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-black uppercase tracking-tight text-slate-400">
            Admin Management
          </h2>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Custom Claims
          </span>
        </div>

        <div className="flex gap-3 items-center">
          <input
            value={targetUid}
            onChange={(e) => setTargetUid(e.target.value)}
            placeholder="Enter Firebase UID"
            className="flex-1 p-4 rounded-2xl border-2 border-slate-200 font-bold text-sm outline-none"
          />
          <button
            onClick={grantAdmin}
            disabled={adminActionStatus === "loading"}
            className="bg-emerald-600 text-white px-5 py-4 rounded-2xl font-black text-sm active:scale-95 transition-all disabled:opacity-60"
          >
            Grant Admin
          </button>
          <button
            onClick={revokeAdmin}
            disabled={adminActionStatus === "loading"}
            className="bg-white border-2 border-red-100 text-red-600 px-5 py-4 rounded-2xl font-black text-sm active:scale-95 transition-all disabled:opacity-60"
          >
            Revoke
          </button>
        </div>

        {adminActionMsg && (
          <div
            className={`mt-4 p-4 rounded-2xl font-bold text-sm border-2 ${
              adminActionStatus === "success"
                ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                : "bg-red-50 border-red-100 text-red-700"
            }`}
          >
            {adminActionMsg}
          </div>
        )}
      </section>

      {/* =======================
          KYC Queue
         ======================= */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black uppercase tracking-tight text-slate-400">
            KYC Verification Queue
          </h2>
          <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
            {pendingCount} Pending
          </span>
        </div>

        {kycQueue.length === 0 ? (
          <div className="p-12 border-4 border-dashed border-slate-100 rounded-3xl text-center text-slate-300">
            <p className="font-black text-lg">Queue is empty!</p>
            <p className="text-xs font-bold uppercase tracking-widest">
              All users are verified (or no submissions yet).
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {kycQueue.map((item) => {
              const scorePct = Math.round(((item.aiScore ?? 0) as number) * 100);
              const decision = item.aiDecision || "review";
              const badgeClass =
                decision === "pass"
                  ? "bg-emerald-100 text-emerald-700"
                  : decision === "fail"
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700";

              // IMPORTANT: if this is not a public URL, image will break
              const idImg = item.idImagePath || "";
              const selfieImg = item.selfieImagePath || "";

              return (
                <div
                  key={item.id}
                  className="p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl space-y-4"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-black text-lg">{item.full_name || item.uid}</h3>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        {item.role || "unknown"} • {item.documentType || "document"}
                      </p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">
                        UID: {item.uid}
                      </p>
                    </div>

                    <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${badgeClass}`}>
                      AI: {decision} ({scorePct}%)
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="aspect-video bg-slate-200 rounded-2xl overflow-hidden border-2 border-slate-100">
                        {idImg ? (
                          <img src={idImg} className="w-full h-full object-cover" alt="ID Document" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-slate-500">
                            No ID image URL
                          </div>
                        )}
                      </div>

                      {selfieImg ? (
                        <div className="aspect-video bg-slate-200 rounded-2xl overflow-hidden border-2 border-slate-100">
                          <img src={selfieImg} className="w-full h-full object-cover" alt="Selfie" />
                        </div>
                      ) : null}
                    </div>

                    <div className="p-4 bg-white rounded-2xl border-2 border-slate-100 text-xs space-y-2">
                      <p className="font-black uppercase text-gray-400 tracking-tight">AI Notes:</p>
                      <p className="font-bold text-slate-600 leading-relaxed">
                        {item.aiNotes || "—"}
                      </p>
                      <div className="pt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Status: {item.status || "submitted"}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => handleDecision(item.uid, "approved")}
                      className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-black text-sm shadow-lg shadow-emerald-100 active:scale-95 transition-all"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleDecision(item.uid, "rejected")}
                      className="flex-1 bg-white border-2 border-red-100 text-red-600 py-4 rounded-2xl font-black text-sm active:scale-95 transition-all"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* (Your KPI cards can stay — later we can wire them to real admin endpoints) */}
      <section className="mt-12 grid grid-cols-3 gap-4">
        <div className="p-6 bg-indigo-50 rounded-3xl border-2 border-indigo-100">
          <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">
            Total Escrow
          </p>
          <p className="text-2xl font-black text-indigo-900">₦0.00</p>
        </div>
        <div className="p-6 bg-emerald-50 rounded-3xl border-2 border-emerald-100">
          <p className="text-[10px] font-black uppercase text-emerald-400 tracking-widest mb-1">
            Commission
          </p>
          <p className="text-2xl font-black text-emerald-900">₦0.00</p>
        </div>
        <div className="p-6 bg-slate-50 rounded-3xl border-2 border-slate-100">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">
            Active Trips
          </p>
          <p className="text-2xl font-black text-slate-900">0</p>
        </div>
      </section>
    </div>
  );
}
