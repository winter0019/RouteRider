import React, { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../services/firebase";
import { api } from "../services/api";
import { Booking, Trip } from "../types";

type Bucket = "pending" | "confirmed" | "completed";

/**
 * ✅ Booking bucket rules (driver dashboard)
 * - completed => completed
 * - paid/escrowed/accepted/confirmed => confirmed
 * - pending/pending_payment => pending
 */
function bucketBooking(b: any): Bucket {
  const s = String(b?.status || "").toLowerCase();

  if (s === "completed") return "completed";

  // ✅ Paid statuses (show as confirmed)
  if (["confirmed", "escrowed", "accepted"].includes(s)) return "confirmed";

  // pending includes pending_payment
  return "pending";
}

export default function DriverBookings() {
  const [uid, setUid] = useState<string | null>(null);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1) Wait for auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth as any, (u) => setUid(u?.uid || null));
    return () => unsub();
  }, []);

  // 2) Load driver trips (only mine)
  const loadTrips = async () => {
    try {
      setError(null);
      const all = await api.getTrips();

      const mine = (all || []).filter((t) => t.driver_id === uid || t.carOwnerId === uid);

      // newest first
      mine.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setTrips(mine);

      // set a safe active trip (must be an existing trip_id)
      if (!activeTripId && mine.length > 0) {
        setActiveTripId(mine[0].trip_id || mine[0].id);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load trips");
    }
  };

  // 3) Load bookings for active trip
  const loadBookings = async (tripId: string) => {
    try {
      setError(null);

      // backend will return either:
      // - all bookings (if driver owns trip)
      // - only passenger bookings (if not owner)
      const list = await api.getBookingsForTrip(tripId);

      const arr = Array.isArray(list) ? list : [];

      // newest first
      arr.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setBookings(arr);
    } catch (e: any) {
      setError(e.message || "Failed to load bookings");
      setBookings([]);
    }
  };

  // Init load after uid exists
  useEffect(() => {
    if (!uid) return;
    (async () => {
      setLoading(true);
      await loadTrips();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Reload bookings when activeTrip changes
  useEffect(() => {
    if (!uid || !activeTripId) return;
    loadBookings(activeTripId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, activeTripId]);

  const buckets = useMemo(() => {
    const pending: Booking[] = [];
    const confirmed: Booking[] = [];
    const completed: Booking[] = [];

    for (const b of bookings || []) {
      const bucket = bucketBooking(b);
      if (bucket === "pending") pending.push(b);
      if (bucket === "confirmed") confirmed.push(b);
      if (bucket === "completed") completed.push(b);
    }

    return { pending, confirmed, completed };
  }, [bookings]);

  const confirmedCount = buckets.confirmed.length;
  const pendingCount = buckets.pending.length;

  // ✅ Complete Trip: releases escrow + credits driver wallet
  const completeTrip = async () => {
    if (!activeTripId) return;
    setBusy(true);
    try {
      // you already have this endpoint on backend: POST /api/trips/:tripId/complete
      await api.completeTrip(activeTripId);
      await loadBookings(activeTripId);
      await loadTrips();
    } catch (e: any) {
      alert(e.message || "Failed to complete trip");
    } finally {
      setBusy(false);
    }
  };

  const refreshAll = async () => {
    if (!activeTripId) return;
    setBusy(true);
    try {
      await loadTrips();
      await loadBookings(activeTripId);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="p-6 font-black text-black">Loading…</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto bg-white min-h-screen text-black">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Bookings</h1>
          <p className="text-gray-500 font-bold">Review passenger requests & escrow payments.</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={refreshAll}
            disabled={busy}
            className="bg-slate-100 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider disabled:opacity-50"
          >
            Refresh
          </button>

          <button
            onClick={completeTrip}
            disabled={busy || !activeTripId || confirmedCount === 0}
            className="bg-emerald-200 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider disabled:opacity-50"
          >
            {busy ? "Working…" : "Complete Trip"}
          </button>
        </div>
      </header>

      {error && (
        <div className="p-4 bg-red-50 border-2 border-red-100 rounded-2xl text-red-700 font-bold mb-6">
          Error: {error}
        </div>
      )}

      {/* Trip selector */}
      <section className="mb-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Active Trip</p>
        <select
          value={activeTripId || ""}
          onChange={(e) => setActiveTripId(e.target.value)}
          className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold"
        >
          {trips.map((t) => {
            const tripKey = t.trip_id || t.id;
            return (
              <option key={tripKey} value={tripKey}>
                {t.route} • {t.departure_time || t.time || "Time"} • seats {t.seats_booked}/{t.seats_available}
              </option>
            );
          })}
        </select>
      </section>

      {/* Counts */}
      <section className="grid grid-cols-3 gap-3 mb-8">
        <div className="p-4 bg-amber-50 rounded-3xl border-2 border-amber-100">
          <p className="text-[10px] font-black uppercase text-amber-500 tracking-widest mb-1">Pending</p>
          <p className="text-2xl font-black text-amber-900">{pendingCount}</p>
          <p className="text-[10px] font-bold text-amber-700">Includes PENDING_PAYMENT</p>
        </div>
        <div className="p-4 bg-emerald-50 rounded-3xl border-2 border-emerald-100">
          <p className="text-[10px] font-black uppercase text-emerald-500 tracking-widest mb-1">Confirmed</p>
          <p className="text-2xl font-black text-emerald-900">{confirmedCount}</p>
          <p className="text-[10px] font-bold text-emerald-700">Includes ESCROWED / ACCEPTED</p>
        </div>
        <div className="p-4 bg-slate-50 rounded-3xl border-2 border-slate-100">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Completed</p>
          <p className="text-2xl font-black text-slate-900">{buckets.completed.length}</p>
        </div>
      </section>

      {/* Pending */}
      <section className="mb-10">
        <h2 className="text-xl font-black uppercase tracking-tight text-slate-400 mb-3">
          Pending Requests ({buckets.pending.length})
        </h2>

        {buckets.pending.length === 0 ? (
          <div className="p-10 border-4 border-dashed border-slate-100 rounded-3xl text-center text-slate-300">
            <p className="font-black text-lg">Waiting for new bookings…</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {buckets.pending.map((b: any) => (
              <div key={b.booking_id} className="p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl">
                <p className="font-black">{b.passenger_name || b.passenger_id}</p>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Status: {b.status}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Confirmed */}
      <section className="mb-10">
        <h2 className="text-xl font-black uppercase tracking-tight text-slate-400 mb-3">
          Confirmed ({buckets.confirmed.length})
        </h2>

        {buckets.confirmed.length === 0 ? (
          <div className="p-10 border-4 border-dashed border-slate-100 rounded-3xl text-center text-slate-300">
            <p className="font-black text-lg">No confirmed bookings yet.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {buckets.confirmed.map((b: any) => (
              <div key={b.booking_id} className="p-5 bg-emerald-50 border-2 border-emerald-100 rounded-3xl">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-black">{b.passenger_name || b.passenger_id}</p>
                    <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest">
                      {String(b.status).toUpperCase()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-black">₦{Number(b.amount_paid || 0).toFixed(0)}</p>
                    <p className="text-[10px] font-bold text-emerald-700">In escrow</p>
                  </div>
                </div>

                <p className="text-[11px] font-bold text-slate-600 mt-2">
                  This is already paid; you will receive it when you press <b>Complete Trip</b>.
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Completed */}
      <section>
        <h2 className="text-xl font-black uppercase tracking-tight text-slate-400 mb-3">
          Completed ({buckets.completed.length})
        </h2>

        {buckets.completed.length === 0 ? (
          <div className="p-10 border-4 border-dashed border-slate-100 rounded-3xl text-center text-slate-300">
            <p className="font-black text-lg">No completed trips yet.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {buckets.completed.map((b: any) => (
              <div key={b.booking_id} className="p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-black">{b.passenger_name || b.passenger_id}</p>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">COMPLETED</p>
                  </div>
                  <p className="font-black">₦{Number(b.amount_paid || 0).toFixed(0)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
