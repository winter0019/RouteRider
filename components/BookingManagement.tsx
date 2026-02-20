import React, { useMemo, useState, useEffect } from "react";
import {
  Booking,
  BookingStatus,
  Trip,
  TripStatus,
  DriverProfile,
  Transaction,
} from "../types";
import { ICONS, ROUTES } from "../constants";

// ✅ Use your Firestore api object (recommended)
import { api } from "../services/api";

interface BookingManagementProps {
  bookings: Booking[];
  setBookings: (newBookings: Booking[]) => void;

  activeTrip: Trip | null;
  setActiveTrip: (trip: Trip | null) => void;

  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  setProfile: React.Dispatch<React.SetStateAction<DriverProfile | null>>;
}

const BookingManagement: React.FC<BookingManagementProps> = ({
  bookings,
  setBookings,
  activeTrip,
  setActiveTrip,
  setTransactions,
  setProfile,
}) => {
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // ✅ Refresh bookings from backend whenever activeTrip changes
  useEffect(() => {
    const run = async () => {
      if (!activeTrip) return;
      try {
        const list = await api.getTripBookings(activeTrip.trip_id);
        setBookings(list);
      } catch (e) {
        console.error("Failed to load trip bookings:", e);
      }
    };
    run();
  }, [activeTrip?.trip_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingBookings = useMemo(
    () => bookings.filter((b) => b.status === BookingStatus.PENDING),
    [bookings]
  );

  const acceptedBookings = useMemo(
    () => bookings.filter((b) => b.status === BookingStatus.ACCEPTED),
    [bookings]
  );

  const seatsRemaining = useMemo(() => {
    if (!activeTrip) return 0;
    const total = Number(activeTrip.seats_available ?? 0);
    const booked = Number(activeTrip.seats_booked ?? 0);
    return Math.max(0, total - booked);
  }, [activeTrip]);

  const refreshTripBookings = async () => {
    if (!activeTrip) return;
    try {
      const list = await api.getTripBookings(activeTrip.trip_id);
      setBookings(list);
    } catch (e) {
      console.error("Failed to refresh bookings:", e);
    }
  };

  const handleAction = async (bookingId: string, action: "accept" | "reject") => {
    if (!activeTrip) return;

    const nextStatus =
      action === "accept" ? BookingStatus.ACCEPTED : BookingStatus.REJECTED;

    setLoadingAction(`${action}-${bookingId}`);

    try {
      await api.updateBookingStatus({
        tripId: activeTrip.trip_id,
        bookingId,
        status: nextStatus,
      });

      // local update (fast UI)
      const updated = bookings.map((b) =>
        b.booking_id === bookingId ? { ...b, status: nextStatus } : b
      );
      setBookings(updated);

      // refresh to keep seats_booked accurate
      await refreshTripBookings();

      setViewingBooking(null);
    } catch (error) {
      console.error("Failed to update booking status:", error);
      alert("Failed to update booking. Check backend/Firestore rules.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCompleteTrip = async () => {
    if (!activeTrip) return;

    setLoadingAction("complete-trip");

    try {
      // OPTIONAL: if you create a completeTrip() endpoint in api.ts
      // await api.completeTrip({ tripId: activeTrip.trip_id });

      // ✅ Local-only fallback earnings
      const totalRevenue =
        Number(activeTrip.seats_booked ?? 0) * ROUTES.SUGGESTED_PRICE_PER_SEAT;
      const netEarnings = totalRevenue - ROUTES.COMMISSION_PER_TRIP;

      const newTx: Transaction = {
        transaction_id: "tx-" + Math.random().toString(36).slice(2, 8),
        user_id: activeTrip.driver_id,
        type: "deposit",
        amount: netEarnings,
        description: `Earnings from trip ${activeTrip.trip_id}`,
        created_at: new Date().toISOString(),
      };

      setTransactions((prev) => [newTx, ...prev]);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              wallet_balance: (prev.wallet_balance ?? 0) + netEarnings,
              total_earnings: (prev.total_earnings ?? 0) + netEarnings,
              trip_count: (prev.trip_count ?? 0) + 1,
            }
          : prev
      );

      // clear UI
      setActiveTrip(null);
      setBookings([]);
    } catch (e) {
      console.error("Failed to complete trip:", e);
      alert("Failed to complete trip.");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="space-y-6 text-slate-900">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold">Bookings</h2>
          <p className="text-slate-500 text-sm font-medium">
            Review passenger requests
          </p>
        </div>

        {activeTrip && Number(activeTrip.seats_booked ?? 0) > 0 && (
          <button
            onClick={handleCompleteTrip}
            disabled={loadingAction === "complete-trip"}
            className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl font-bold text-xs disabled:opacity-60"
          >
            {loadingAction === "complete-trip" ? "Completing..." : "Complete Trip"}
          </button>
        )}
      </header>

      {/* Active Trip Summary */}
      {activeTrip ? (
        <div className="bg-white border-2 border-slate-100 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="font-bold">
              {activeTrip.route || `${activeTrip.origin} → ${activeTrip.destination}`}
            </div>
            <div className="text-xs text-slate-500 font-bold">
              Seats: {activeTrip.seats_booked}/{activeTrip.seats_available} • Remaining:{" "}
              {seatsRemaining}
            </div>
          </div>
          <span className="text-[10px] px-2 py-1 rounded-full bg-slate-100 font-black uppercase text-slate-500">
            {String(activeTrip.status)}
          </span>
        </div>
      ) : (
        <div className="text-center text-slate-400 py-4 text-sm font-bold italic">
          No active trip yet. Post a trip to receive bookings.
        </div>
      )}

      {/* Pending Requests */}
      <section className="space-y-4">
        <h3 className="font-bold text-sm text-slate-400 uppercase tracking-widest">
          Pending Requests ({pendingBookings.length})
        </h3>

        {pendingBookings.length > 0 ? (
          pendingBookings.map((booking) => (
            <div
              key={booking.booking_id}
              className="bg-white border-2 border-slate-100 rounded-2xl p-4 flex items-center justify-between shadow-sm"
            >
              <div className="flex items-center gap-3">
                <img
                  src={
                    booking.passenger_photo ||
                    `https://picsum.photos/100/100?seed=${booking.booking_id}`
                  }
                  className="w-12 h-12 rounded-full border-2 border-emerald-50"
                  alt="Passenger"
                />
                <div>
                  <div className="font-bold text-slate-900">
                    {booking.passenger_name || "Passenger"}
                  </div>
                  <div className="text-[11px] font-black text-emerald-700 mt-1">
                    {booking.seats} seat(s) • ₦
                    {Number(booking.amount_paid).toLocaleString()}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setViewingBooking(booking)}
                className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold"
              >
                View
              </button>
            </div>
          ))
        ) : (
          <p className="text-center text-slate-400 py-4 text-sm font-bold italic">
            Waiting for new bookings...
          </p>
        )}
      </section>

      {/* Confirmed */}
      <section className="space-y-4">
        <h3 className="font-bold text-sm text-slate-400 uppercase tracking-widest">
          Confirmed ({acceptedBookings.length})
        </h3>

        <div className="space-y-3">
          {acceptedBookings.map((booking) => (
            <div
              key={booking.booking_id}
              className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <img
                  src={
                    booking.passenger_photo ||
                    `https://picsum.photos/100/100?seed=ok-${booking.booking_id}`
                  }
                  className="w-10 h-10 rounded-full grayscale opacity-70"
                  alt="Passenger"
                />
                <div>
                  <div className="font-bold text-slate-700">
                    {booking.passenger_name || "Passenger"}
                  </div>
                  <div className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                    {ICONS.Check} ₦{Number(booking.amount_paid).toLocaleString()} Secured
                  </div>
                </div>
              </div>

              <button className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400">
                <Phone size={16} />
              </button>
            </div>
          ))}

          {activeTrip &&
            Array.from({ length: Math.max(0, seatsRemaining) }).map((_, i) => (
              <div
                key={i}
                className="border-2 border-dashed border-slate-100 rounded-2xl p-4 flex items-center justify-center text-slate-300 text-sm font-bold"
              >
                Empty Seat
              </div>
            ))}
        </div>
      </section>

      {/* Modal */}
      {viewingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 text-center space-y-4">
              <img
                src={
                  viewingBooking.passenger_photo ||
                  `https://picsum.photos/200/200?seed=modal-${viewingBooking.booking_id}`
                }
                className="w-24 h-24 rounded-full mx-auto border-4 border-emerald-50"
                alt="Passenger"
              />

              <h3 className="text-xl font-bold text-slate-900">
                {viewingBooking.passenger_name || "Passenger"}
              </h3>

              <div className="grid grid-cols-2 gap-2 py-4">
                <div className="bg-emerald-50 p-3 rounded-2xl text-center">
                  <p className="text-[10px] text-emerald-600 uppercase font-bold tracking-tight">
                    Payment
                  </p>
                  <div className="text-emerald-700 font-bold">
                    ₦{Number(viewingBooking.amount_paid).toLocaleString()}
                  </div>
                </div>

                <div className="bg-blue-50 p-3 rounded-2xl text-center">
                  <p className="text-[10px] text-blue-600 uppercase font-bold tracking-tight">
                    Seats
                  </p>
                  <div className="text-blue-700 font-bold">{viewingBooking.seats}</div>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => handleAction(viewingBooking.booking_id, "accept")}
                  disabled={loadingAction === `accept-${viewingBooking.booking_id}`}
                  className="w-full bg-emerald-600 text-white p-4 rounded-2xl font-bold disabled:opacity-60"
                >
                  {loadingAction === `accept-${viewingBooking.booking_id}` ? "Accepting..." : "Accept Passenger"}
                </button>

                <button
                  onClick={() => handleAction(viewingBooking.booking_id, "reject")}
                  disabled={loadingAction === `reject-${viewingBooking.booking_id}`}
                  className="w-full bg-white text-red-500 p-4 rounded-2xl font-bold disabled:opacity-60"
                >
                  {loadingAction === `reject-${viewingBooking.booking_id}` ? "Rejecting..." : "Reject"}
                </button>

                <button
                  onClick={() => setViewingBooking(null)}
                  className="w-full bg-slate-50 text-slate-600 p-3 rounded-2xl font-bold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Phone: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

export default BookingManagement;
