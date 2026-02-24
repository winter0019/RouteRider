import React, { useEffect, useState } from "react";
import { auth } from "../services/firebase";

interface KYCSubmission {
  id: string;
  uid: string;
  full_name: string;
  role: string;
  status: string;
  documentType: string;
  idImagePath: string;
  aiDecision: string;
  aiScore: number;
  aiNotes: string;
  createdAt: any;
}

export default function AdminDashboard() {
  const [kycQueue, setKycQueue] = useState<KYCSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchKYC = async () => {
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch("/api/admin/kyc", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error("Failed to fetch KYC queue");
      const data = await res.json();
      setKycQueue(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKYC();
  }, []);

  const handleDecision = async (uid: string, status: "approved" | "rejected") => {
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch(`/api/admin/kyc/${uid}/decision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error("Failed to update status");
      
      // Refresh queue
      setKycQueue(prev => prev.filter(item => item.uid !== uid));
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="p-8 font-black text-black">Loading Admin Data...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto bg-white min-h-screen text-black">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Admin Dashboard</h1>
          <p className="text-gray-500 font-bold">Manage RouteRider operations and verifications.</p>
        </div>
        <button 
          onClick={() => window.location.href = "/"}
          className="bg-slate-100 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider"
        >
          Back to App
        </button>
      </header>

      {error && (
        <div className="p-4 bg-red-50 border-2 border-red-100 rounded-2xl text-red-700 font-bold mb-6">
          Error: {error}
        </div>
      )}

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black uppercase tracking-tight text-slate-400">KYC Verification Queue</h2>
          <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
            {kycQueue.length} Pending
          </span>
        </div>

        {kycQueue.length === 0 ? (
          <div className="p-12 border-4 border-dashed border-slate-100 rounded-3xl text-center text-slate-300">
            <p className="font-black text-lg">Queue is empty!</p>
            <p className="text-xs font-bold uppercase tracking-widest">All drivers are verified.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {kycQueue.map((item) => (
              <div key={item.id} className="p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-black text-lg">{item.full_name || item.uid}</h3>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{item.role} • {item.documentType}</p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                    item.aiDecision === 'pass' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    AI Result: {item.aiDecision} ({Math.round(item.aiScore * 100)}%)
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="aspect-video bg-slate-200 rounded-2xl overflow-hidden border-2 border-slate-100">
                    <img src={item.idImagePath} className="w-full h-full object-cover" alt="ID Document" />
                  </div>
                  <div className="p-4 bg-white rounded-2xl border-2 border-slate-100 text-xs space-y-2">
                    <p className="font-black uppercase text-gray-400 tracking-tight">AI Notes:</p>
                    <p className="font-bold text-slate-600 leading-relaxed">{item.aiNotes}</p>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => handleDecision(item.uid, "approved")}
                    className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-black text-sm shadow-lg shadow-emerald-100 active:scale-95 transition-all"
                  >
                    Approve Driver
                  </button>
                  <button 
                    onClick={() => handleDecision(item.uid, "rejected")}
                    className="flex-1 bg-white border-2 border-red-100 text-red-600 py-4 rounded-2xl font-black text-sm active:scale-95 transition-all"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12 grid grid-cols-3 gap-4">
        <div className="p-6 bg-indigo-50 rounded-3xl border-2 border-indigo-100">
          <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">Total Escrow</p>
          <p className="text-2xl font-black text-indigo-900">₦0.00</p>
        </div>
        <div className="p-6 bg-emerald-50 rounded-3xl border-2 border-emerald-100">
          <p className="text-[10px] font-black uppercase text-emerald-400 tracking-widest mb-1">Commission</p>
          <p className="text-2xl font-black text-emerald-900">₦0.00</p>
        </div>
        <div className="p-6 bg-slate-50 rounded-3xl border-2 border-slate-100">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Active Trips</p>
          <p className="text-2xl font-black text-slate-900">0</p>
        </div>
      </section>
    </div>
  );
}
