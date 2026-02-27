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
  const [trips, setTrips] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'kyc' | 'trips'>('kyc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchKYC = async () => {
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch("/api/admin/kyc", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch KYC queue");
      const data = await res.json();
      setKycQueue(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchTrips = async () => {
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch("/api/admin/trips", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch trips");
      const data = await res.json();
      setTrips(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchKYC(), fetchTrips()]);
      setLoading(false);
    };
    load();
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
      setKycQueue(prev => prev.filter(item => item.uid !== uid));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleTripAction = async (tripId: string, source: string, action: 'settle' | 'cancel') => {
    if (!confirm(`Are you sure you want to ${action} this trip? This will release funds or refund passengers.`)) return;
    
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch(`/api/admin/trips/${tripId}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ source })
      });
      if (!res.ok) throw new Error(`Failed to ${action} trip`);
      
      alert(`Trip ${action}d successfully`);
      fetchTrips();
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

      <div className="flex gap-4 mb-8 border-b border-slate-100 pb-4">
        <button 
          onClick={() => setActiveTab('kyc')}
          className={`px-6 py-2 rounded-xl font-black text-sm transition-all ${activeTab === 'kyc' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-slate-50 text-slate-400'}`}
        >
          KYC Queue ({kycQueue.length})
        </button>
        <button 
          onClick={() => setActiveTab('trips')}
          className={`px-6 py-2 rounded-xl font-black text-sm transition-all ${activeTab === 'trips' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-slate-50 text-slate-400'}`}
        >
          Trip Monitoring ({trips.length})
        </button>
      </div>

      {activeTab === 'kyc' ? (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black uppercase tracking-tight text-slate-400">KYC Verification Queue</h2>
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
      ) : (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black uppercase tracking-tight text-slate-400">Recent Trips & Disputes</h2>
          </div>

          <div className="grid gap-4">
            {trips.map((trip) => (
              <div key={trip.id} className="p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-black text-lg">{trip.route}</h3>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                      Driver: {trip.driver_name || trip.driver_id} • {new Date(trip.departure_time || trip.time).toLocaleString()}
                    </p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                    trip.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 
                    trip.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {trip.status}
                  </div>
                </div>

                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border-2 border-slate-100">
                  <div className="text-center">
                    <p className="text-[10px] font-black text-gray-400 uppercase">Seats</p>
                    <p className="font-black">{trip.seats_booked} / {trip.seats_available}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-black text-gray-400 uppercase">Price</p>
                    <p className="font-black">₦{trip.price_per_seat?.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-black text-gray-400 uppercase">Total Value</p>
                    <p className="font-black">₦{(trip.price_per_seat * trip.seats_booked).toLocaleString()}</p>
                  </div>
                </div>

                {trip.status === 'posted' || trip.status === 'in_progress' ? (
                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={() => handleTripAction(trip.id, trip.source, 'settle')}
                      className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-black text-sm shadow-lg shadow-emerald-100 active:scale-95 transition-all"
                    >
                      Settle (Release Funds)
                    </button>
                    <button 
                      onClick={() => handleTripAction(trip.id, trip.source, 'cancel')}
                      className="flex-1 bg-white border-2 border-red-100 text-red-600 py-4 rounded-2xl font-black text-sm active:scale-95 transition-all"
                    >
                      Cancel & Refund
                    </button>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-100 rounded-2xl text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {trip.settledBy === 'admin' ? 'Settled by Admin' : trip.cancelledBy === 'admin' ? 'Cancelled by Admin' : 'Trip Finalized'}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

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
