import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../services/firebase";
import { completeBooking, getDriverBookings, getMyEscrows } from "../services/api";

export default function DriverBookings() {
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<any[]>([]);
  const [escrow, setEscrow] = useState<any>({ totalNaira: 0, items: [] });
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const [b, e] = await Promise.all([getDriverBookings(), getMyEscrows()]);
    setBookings(b || []);
    setEscrow(e || { totalNaira: 0, items: [] });
  };

  useEffect(() => {
    if (!auth) return;

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setError("Please login as a driver.");
        setLoading(false);
        return;
      }

      try {
        await refresh();
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const handleComplete = async (bookingId: string) => {
    try {
      await completeBooking(bookingId);
      await refresh();
      alert("Trip completed. Escrow released to your wallet.");
    } catch (err: any) {
      alert(err.message);
    }
  };

  const pending = bookings.filter((b) => ["escrowed", "accepted"].includes(b.status));
  const completed = bookings.filter((b) => b.status === "completed");

  if (loading) return <div className="p-6 font-black text-black">Loading…</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto bg-white min-h-screen text-black">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black">Bookings</h1>
          <p className="text-xs font-bold text-gray-500">Escrow payments pending completion.</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Escrow Pending</p>
          <p className="text-xl font-black">₦{Number(escrow.totalNaira || 0).toLocaleString()}</p>
        </div>
      </div>

      {error && (
        <div className="p-4 mb-6 bg-red-50 border-2 border-red-100 rounded-2xl text-red-700 font-bold">
          {error}
        </div>
      )}

      <div className="mb-8">
        <p className="text-xs font-black uppercase text-slate-400 tracking-widest mb-3">
          Pending ({pending.length})
        </p>

        {pending.length === 0 ? (
          <div className="p-10 rounded-3xl border-2 border-dashed border-slate-100 text-center text-slate-300">
            <p className="font-black text-lg">Waiting for bookings…</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {pending.map((b) => (
              <div key={b.booking_id} className="p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl">
                <div className="flex justify-between">
                  <div>
                    <p className="font-black">Trip: {b.trip_id}</p>
                    <p className="text-xs font-bold text-gray-500 uppercase">Status: {b.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-gray-400 uppercase">Amount</p>
                    <p className="font-black">
                      ₦{Number(b.amount_paid || (b.amountKobo || 0) / 100).toLocaleString()}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleComplete(b.booking_id)}
                  className="mt-4 w-full bg-black text-white py-3 rounded-2xl font-black text-sm"
                >
                  Complete Trip (Release Escrow)
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-black uppercase text-slate-400 tracking-widest mb-3">
          Completed ({completed.length})
        </p>

        {completed.length === 0 ? (
          <div className="p-6 rounded-3xl border-2 border-slate-100 text-slate-300 font-bold">
            No completed trips yet.
          </div>
        ) : (
          <div className="grid gap-3">
            {completed.map((b) => (
              <div key={b.booking_id} className="p-5 bg-white border-2 border-slate-100 rounded-3xl">
                <p className="font-black">Trip: {b.trip_id}</p>
                <p className="text-xs font-bold text-gray-500 uppercase">Status: completed</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
