import React, { useMemo, useState } from "react";
import { Trip, TripStatus } from "../types";
import { ICONS, ROUTES } from "../constants";

type Page = "dashboard" | "post-trip" | "bookings" | "wallet" | "settings" | "search";

interface TripPostingProps {
  onPost: (trip: Trip) => Promise<void> | void;
  activeTrip: Trip | null;
  onNavigate: (page: Page) => void;
}

const toISOFromDateTime = (dateStr: string, timeStr: string) => {
  // dateStr: "2026-02-20", timeStr: "08:00"
  if (!dateStr || !timeStr) return new Date().toISOString();
  const dt = new Date(`${dateStr}T${timeStr}:00`);
  if (Number.isNaN(dt.getTime())) return new Date().toISOString();
  return dt.toISOString();
};

const TripPosting: React.FC<TripPostingProps> = ({ onPost, activeTrip, onNavigate }) => {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("08:00");
  const [seats, setSeats] = useState<number>(2);
  const [pricePerSeat, setPricePerSeat] = useState<number>(ROUTES.SUGGESTED_PRICE_PER_SEAT);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return origin.trim().length > 1 && destination.trim().length > 1 && seats > 0 && pricePerSeat > 0;
  }, [origin, destination, seats, pricePerSeat]);

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setError(null);

    try {
      const departure_time = toISOFromDateTime(date, time);

      const trip: Trip = {
        trip_id: "t-" + Math.random().toString(36).slice(2, 9),
        driver_id: "driver", // backend/firestore will override if needed
        origin: origin.trim(),
        destination: destination.trim(),
        route: `${origin.trim()} → ${destination.trim()}`,
        departure_time,
        seats_available: Number(seats),
        seats_booked: 0,
        status: TripStatus.POSTED,
        bookedBy: [],
        price_per_seat: Number(pricePerSeat),
        created_at: new Date().toISOString(),
      };

      await onPost(trip);
      onNavigate("dashboard");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Failed to post trip. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // If driver already has an active trip, show it instead of allowing duplicates (optional)
  if (activeTrip) {
    return (
      <div className="space-y-6 text-slate-900">
        <header className="space-y-1">
          <h2 className="text-2xl font-black">Your Active Trip</h2>
          <p className="text-slate-500 text-sm font-bold">
            You already have a posted trip. Complete it before posting a new one.
          </p>
        </header>

        <div className="bg-white border-2 border-slate-100 rounded-3xl p-5 space-y-3">
          <div className="font-black text-lg">{activeTrip.origin} → {activeTrip.destination}</div>
          <div className="text-xs text-slate-500 font-bold">
            Seats: {Number(activeTrip.seats_booked ?? 0)}/{Number(activeTrip.seats_available ?? 0)}
          </div>
          <div className="text-xs text-slate-500 font-bold">
            Departure: {new Date(activeTrip.departure_time).toLocaleString()}
          </div>
          <div className="text-[10px] inline-flex px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-black uppercase">
            {String(activeTrip.status)}
          </div>
        </div>

        <button
          onClick={() => onNavigate("bookings")}
          className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-lg"
        >
          Go to Bookings
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-900">
      <header className="space-y-1">
        <h2 className="text-2xl font-black">Post a Trip</h2>
        <p className="text-slate-500 text-sm font-bold">Create a ride so passengers can book.</p>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-100 p-4 rounded-2xl text-red-600 font-bold">
          {error}
        </div>
      )}

      <section className="bg-white border-2 border-slate-100 p-5 rounded-[2rem] space-y-4">
        <div className="space-y-3">
          <input
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="From (Origin) e.g. Daura"
            className="w-full px-4 py-4 bg-slate-50 border-2 border-transparent focus:border-emerald-500 rounded-2xl font-black text-sm outline-none"
          />

          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="To (Destination) e.g. Katsina"
            className="w-full px-4 py-4 bg-slate-50 border-2 border-transparent focus:border-emerald-500 rounded-2xl font-black text-sm outline-none"
          />

          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-4 bg-slate-50 border-2 border-transparent focus:border-emerald-500 rounded-2xl font-black text-sm outline-none"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-4 py-4 bg-slate-50 border-2 border-transparent focus:border-emerald-500 rounded-2xl font-black text-sm outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              min={1}
              value={seats}
              onChange={(e) => setSeats(Number(e.target.value || 0))}
              placeholder="Seats"
              className="w-full px-4 py-4 bg-slate-50 border-2 border-transparent focus:border-emerald-500 rounded-2xl font-black text-sm outline-none"
            />
            <input
              type="number"
              min={100}
              value={pricePerSeat}
              onChange={(e) => setPricePerSeat(Number(e.target.value || 0))}
              placeholder="Price per seat"
              className="w-full px-4 py-4 bg-slate-50 border-2 border-transparent focus:border-emerald-500 rounded-2xl font-black text-sm outline-none"
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black text-sm shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              {ICONS?.Post ?? null}
              Post Trip
            </>
          )}
        </button>
      </section>
    </div>
  );
};

export default TripPosting;
