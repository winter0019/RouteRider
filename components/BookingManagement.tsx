import React, { useEffect, useMemo, useState } from "react";
import { Booking, BookingStatus, Trip, TripStatus, DriverProfile, Transaction } from "../types";
import { ICONS, ROUTES } from "../constants";
import { completeTrip as apiCompleteTrip, getDriverBookings, updateBookingStatus } from "../services/api";

interface BookingManagementProps {
  bookings: Booking[];
  setBookings: (newBookings: Booking[]) => void;
  activeTrip: Trip | null;
  setActiveTrip: (trip: Trip | null) => void;
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  setProfile: React.Dispatch<React.SetStateAction<DriverProfile | null>>;

  // ✅ NEW: who is the driver
  driverPhone: string;
}

const BookingManagement: React.FC<BookingManagementProps> = ({
  bookings,
  setBookings,
  activeTrip,
  setActiveTrip,
  setTransactions,
  setProfile,
  driverPhone,
}) => {
  const [viewingPassenger, setViewingPassenger] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ✅ Load bookings from API
  useEffect(() => {
    if (!driverPhone) return;

    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        const data = await getDriverBookings(driverPhone);
        // Expected: { bookings: [...], active_trip: {...} }
        const apiBookings = (data?.bookings || []).map(mapApiBookingToUI);
        const apiActiveTrip = data?.active_trip ? mapApiTripToUI(data.active_trip, driverPhone) : null;

        if (!mounted) return;

        setBookings(apiBookings);
        setActiveTrip(apiActiveTrip);
      } catch (e: any) {
        if (!mounted) return;
        setErrorMsg(e?.message || "Failed to load bookings");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [driverPhone, setBookings, setActiveTrip]);

  const pendingBookings = useMemo(
    () => bookings.filter((b) => b.status === BookingStatus.PENDING),
    [bookings]
  );
  const acceptedBookings = useMemo(
    () => bookings.filter((b) => b.status === BookingStatus.ACCEPTED),
    [bookings]
  );

  // ✅ Accept / Reject via API
  const handleAction = async (bookingId: string, action: "accept" | "reject") => {
    try {
      setErrorMsg(null);
      setActionLoadingId(bookingId);

      // Your UI uses booking_id as string. Backend likely uses integer.
      const numericId = Number(String(bookingId).replace(/[^\d]/g, "")) || Number(bookingId);

      const newStatus = action === "accept" ? "confirmed" : "cancelled";

      await updateBookingStatus({
        booking_id: numericId,
        status: newStatus,
      });

      // update UI list
      const updated = bookings.map((b) =>
        b.booking_id === bookingId
          ? { ...b, status: action === "accept" ? BookingStatus.ACCEPTED : BookingStatus.REJECTED }
          : b
      );
      setBookings(updated);

      // update active trip status if full
      if (action === "accept" && activeTrip) {
        const full = activeTrip.seats_booked >= activeTrip.seats_available;
        setActiveTrip({ ...activeTrip, status: full ? TripStatus.IN_PROGRESS : TripStatus.POSTED });
      }

      setViewingPassenger(null);
    } catch (e: any) {
      setErrorMsg(e?.message || "Action failed");
    } finally {
      setActionLoadingId(null);
    }
  };

  // ✅ Complete trip via API
  const handleCompleteTrip = async () => {
    if (!activeTrip) return;

    try {
      setErrorMsg(null);
      setLoading(true);

      const tripIdNum = Number(String(activeTrip.trip_id).replace(/[^\d]/g, "")) || Number(activeTrip.trip_id);

      await apiCompleteTrip({
        driverPhone,
        trip_id: tripIdNum,
      });

      // compute earnings (front-end display only)
      const totalRevenue = activeTrip.seats_booked * ROUTES.SUGGESTED_PRICE_PER_SEAT;
      const netEarnings = totalRevenue - ROUTES.COMMISSION_PER_TRIP;

      const newTx: Transaction = {
        transaction_id: "tx-" + Math.random().toString(36).substr(2, 5),
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
              wallet_balance: (prev.wallet_balance || 0) + netEarnings,
              total_earnings: (prev.total_earnings || 0) + netEarnings,
              trip_count: (prev.trip_count || 0) + 1,
            }
          : prev
      );

      // Clear trip + bookings
      setActiveTrip(null);
      setBookings([]);
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to complete trip");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-slate-900">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold">Bookings</h2>
          <p className="text-slate-500 text-sm font-medium">Review passenger requests</p>
        </div>

        {activeTrip && activeTrip.seats_booked > 0 && (
          <button
            onClick={handleCompleteTrip}
            disabled={loading}
            className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl font-bold text-xs disabled:opacity-60"
          >
            {loading ? "Completing..." : "Complete Trip"}
          </button>
        )}
      </header>

      {errorMsg ? (
        <div className="bg-red-50 border-2 border-red-100 p-4 rounded-2xl text-red-700 font-bold text-sm">
          {errorMsg}
        </div>
      ) : null}

      {loading ? (
        <div className="text-center text-slate-400 py-6 text-sm font-bold italic">
          Loading bookings...
        </div>
      ) : null}

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
                  src={booking.passenger_photo}
                  className="w-12 h-12 rounded-full border-2 border-emerald-50"
                />
                <div>
                  <div className="font-bold text-slate-900">{booking.passenger_name}</div>
                  <div className="text-xs text-slate-500 font-bold flex items-center gap-1">
                    {ICONS.Star} {booking.passenger_rating} • {booking.passenger_trips} trips
                  </div>
                </div>
              </div>

              <button
                onClick={() => setViewingPassenger(booking)}
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

      {/* Confirmed Passengers */}
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
                  src={booking.passenger_photo}
                  className="w-10 h-10 rounded-full grayscale opacity-70"
                />
                <div>
                  <div className="font-bold text-slate-700">{booking.passenger_name}</div>
                  <div className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                    {ICONS.Check} ₦{booking.amount_paid} Secured
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400">
                  <Phone size={16} />
                </button>
                <button
                  onClick={() => {}}
                  className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold"
                >
                  No-Show
                </button>
              </div>
            </div>
          ))}

          {activeTrip &&
            [...Array(Math.max(0, activeTrip.seats_available - acceptedBookings.length))].map((_, i) => (
              <div
                key={i}
                className="border-2 border-dashed border-slate-100 rounded-2xl p-4 flex items-center justify-center text-slate-300 text-sm font-bold"
              >
                Empty Seat
              </div>
            ))}
        </div>
      </section>

      {/* Passenger Profile Modal */}
      {viewingPassenger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <img
                src={viewingPassenger.passenger_photo}
                className="w-24 h-24 rounded-full mx-auto border-4 border-emerald-50"
              />

              <div>
                <h3 className="text-xl font-bold text-slate-900">{viewingPassenger.passenger_name}</h3>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <div className="flex items-center gap-1 text-amber-500 font-bold">
                    {ICONS.Star} {viewingPassenger.passenger_rating}
                  </div>
                  <span className="text-slate-300">|</span>
                  <div className="text-slate-500 text-sm font-bold">
                    {viewingPassenger.passenger_trips} trips completed
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 py-4">
                <div className="bg-emerald-50 p-3 rounded-2xl text-center">
                  <p className="text-[10px] text-emerald-600 uppercase font-bold tracking-tight">ID Verified</p>
                  <div className="text-emerald-700 font-bold flex items-center justify-center gap-1">
                    {ICONS.Check} Yes
                  </div>
                </div>
                <div className="bg-blue-50 p-3 rounded-2xl text-center">
                  <p className="text-[10px] text-blue-600 uppercase font-bold tracking-tight">Payment</p>
                  <div className="text-blue-700 font-bold">₦{viewingPassenger.amount_paid}</div>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => handleAction(viewingPassenger.booking_id, "accept")}
                  disabled={actionLoadingId === viewingPassenger.booking_id}
                  className="w-full bg-emerald-600 text-white p-4 rounded-2xl font-bold shadow-lg shadow-emerald-200 disabled:opacity-60"
                >
                  {actionLoadingId === viewingPassenger.booking_id ? "Accepting..." : "Accept Passenger"}
                </button>

                <button
                  onClick={() => handleAction(viewingPassenger.booking_id, "reject")}
                  disabled={actionLoadingId === viewingPassenger.booking_id}
                  className="w-full bg-white text-red-500 p-4 rounded-2xl font-bold disabled:opacity-60"
                >
                  {actionLoadingId === viewingPassenger.booking_id ? "Rejecting..." : "Reject"}
                </button>

                <button
                  onClick={() => setViewingPassenger(null)}
                  className="w-full bg-slate-50 text-slate-600 p-4 rounded-2xl font-bold"
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

// --------------------
// Helpers: map API -> UI types
// --------------------
function mapApiTripToUI(t: any, driverPhone: string): Trip {
  // backend trip: {id, origin, destination, trip_date, trip_time, seats_total, seats_booked, status, ...}
  const date = t.trip_date ? String(t.trip_date) : new Date().toISOString().slice(0, 10);
  const time = t.trip_time ? String(t.trip_time).slice(0, 5) : "07:00";

  return {
    trip_id: String(t.id),
    driver_id: `driver-${driverPhone}`,
    route: `${t.origin} → ${t.destination}`,
    departure_time: `${date}T${time}:00.000Z`,
    seats_available: Number(t.seats_total),
    seats_booked: Number(t.seats_booked || 0),
    status: t.status === "active" ? TripStatus.POSTED : TripStatus.COMPLETED,
    earnings: 0,
    created_at: t.created_at ? String(t.created_at) : new Date().toISOString(),
  };
}

function mapApiBookingToUI(b: any): Booking {
  // backend booking: {id, trip_id, passenger_name, passenger_phone, seats, amount_paid, status, ...}
  const status =
    b.status === "pending"
      ? BookingStatus.PENDING
      : b.status === "confirmed"
      ? BookingStatus.ACCEPTED
      : b.status === "cancelled"
      ? BookingStatus.REJECTED
      : BookingStatus.PENDING;

  return {
    booking_id: `b-${b.id}`,
    trip_id: String(b.trip_id),
    passenger_id: b.passenger_phone || `p-${b.passenger_user_id || "unknown"}`,
    passenger_name: b.passenger_name || "Passenger",
    passenger_rating: 4.8,
    passenger_trips: 0,
    passenger_photo: b.passenger_photo || `https://picsum.photos/100/100?seed=${b.id}`,
    seats_booked: Number(b.seats || 1),
    amount_paid: Number(b.amount_paid || 0),
    status,
    created_at: b.created_at ? String(b.created_at) : new Date().toISOString(),
  };
}

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
