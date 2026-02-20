// src/components/TripPosting.tsx
import React, { useMemo, useState } from "react";
import { Trip, TripStatus, DriverProfile } from "../types";
import { ROUTES, COLORS, ICONS } from "../constants";

interface TripPostingProps {
  profile: DriverProfile;              // ✅ needed to attach vehicle details
  onPost: (trip: Trip) => Promise<void> | void; // ✅ allow async (Firestore / API)
  activeTrip: Trip | null;
  onNavigate: (page: any) => void;
}

const TripPosting: React.FC<TripPostingProps> = ({ profile, onPost, activeTrip, onNavigate }) => {
  const [origin, setOrigin] = useState("Katsina");
  const [destination, setDestination] = useState("Kano");
  const [tripDate, setTripDate] = useState("");        // ✅ optional date
  const [departureTime, setDepartureTime] = useState("07:00");
  const [seats, setSeats] = useState(3);
  const [pricePerSeat, setPricePerSeat] = useState<number>(ROUTES.SUGGESTED_PRICE_PER_SEAT);
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vehicleName = useMemo(() => {
    // ✅ single source of truth
    const direct = String(profile.vehicle_name || "").trim();
    if (direct) return direct;

    const mk = String(profile.car_make || "").trim();
    const md = String(profile.car_model || "").trim();
    const joined = `${mk} ${md}`.trim();
    return joined || "Vehicle";
  }, [profile]);

  const plateNumber = useMemo(() => String(profile.plate_number || "N/A").trim(), [profile]);

  const handleSwap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const buildDepartureISO = () => {
    // If a date was chosen, combine it with time; else assume today
    const base = tripDate ? new Date(tripDate) : new Date();
    const [hh, mm] = departureTime.split(":");
    base.setHours(Number(hh), Number(mm), 0, 0);
    return base.toISOString();
  };

  const handlePost = async () => {
    setError(null);

    const cleanOrigin = origin.trim();
    const cleanDestination = destination.trim();
    if (!cleanOrigin || !cleanDestination) {
      setError("Please enter both origin and destination.");
      return;
    }
    if (cleanOrigin.toLowerCase() === cleanDestination.toLowerCase()) {
      setError("Origin and destination cannot be the same.");
      return;
    }
    if (seats < 1) {
      setError("Seats must be at least 1.");
      return;
    }

    setIsPosting(true);

    try {
      const now = new Date();

      // ✅ IMPORTANT: Trip shape matches your UI usage (PassengerHome etc.)
      const newTrip: Trip = {
        trip_id: "t-" + Math.random().toString(36).slice(2, 10),

        // driver
        driver_id: profile.user_id,
        driver_name: profile.full_name,
        driver_phone: profile.phone_number || "N/A",

        // route info
        origin: cleanOrigin,
        destination: cleanDestination,
        route: `${cleanOrigin} → ${cleanDestination}`,

        // time/date
        departure_time: buildDepartureISO(),
        trip_date: tripDate || undefined,
        trip_time: departureTime || undefined,

        // seats + money
        seats_available: seats,
        seats_total: seats, // helpful for driver views
        seats_booked: 0,
        price_per_seat: pricePerSeat,

        // vehicle (✅ so passenger sees the correct car)
        vehicle_name: vehicleName,
        plate_number: plateNumber,

        // status/earnings
        status: TripStatus.POSTED,
        earnings: 0,
        created_at: now.toISOString(),
      };

      // ✅ supports async API/Firestore post
      await onPost(newTrip);

      setIsPosting(false);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Failed to post trip.");
      setIsPosting(false);
    }
  };

  // If there's already an active trip, show success screen
  if (activeTrip) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center p-6 space-y-6 animate-in fade-in duration-500">
        <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-2 shadow-inner border-4 border-emerald-50">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h2 className="text-3xl font-black text-black tracking-tight">Trip is Live!</h2>

        <p className="text-gray-600 font-bold leading-relaxed max-w-[280px]">
          You&apos;re set for <strong>{activeTrip.route}</strong> at{" "}
          <strong>
            {new Date(activeTrip.departure_time).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </strong>
          .
        </p>

        <div className="bg-white border-2 border-slate-100 rounded-2xl p-4 w-full max-w-sm text-left space-y-2">
          <div className="flex justify-between">
            <span className="text-xs font-black text-gray-400 uppercase">Vehicle</span>
            <span className="text-sm font-black text-black">
              {(activeTrip as any).vehicle_name || vehicleName}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs font-black text-gray-400 uppercase">Plate</span>
            <span className="text-sm font-black text-black">
              {(activeTrip as any).plate_number || plateNumber}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs font-black text-gray-400 uppercase">Seats</span>
            <span className="text-sm font-black text-black">
              {activeTrip.seats_booked}/{(activeTrip as any).seats_total ?? activeTrip.seats_available}
            </span>
          </div>
        </div>

        <div className="w-full pt-4 space-y-4">
          <button
            onClick={() => onNavigate("dashboard")}
            className="block w-full bg-emerald-600 text-white py-5 rounded-2xl font-black shadow-2xl shadow-emerald-200 text-lg hover:scale-[1.02] active:scale-95 transition-all"
          >
            Dashboard
          </button>
          <button
            onClick={() => onNavigate("bookings")}
            className="block w-full bg-slate-50 text-black py-5 rounded-2xl font-black border-2 border-slate-100 hover:bg-slate-100 transition-all"
          >
            View Bookings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 text-black">
      <header>
        <h2 className="text-2xl font-black text-black">Post New Trip</h2>
        <p className="text-gray-600 font-bold">Where are you heading today?</p>
      </header>

      {/* Vehicle preview */}
      <div className="bg-white border-2 border-slate-100 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Vehicle shown to passengers</p>
            <p className="font-black text-lg">{vehicleName}</p>
            <p className="text-sm font-bold text-slate-500">Plate: {plateNumber}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            {ICONS.Car}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 p-4 rounded-2xl text-red-700 font-bold">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Route Inputs */}
        <div className="space-y-3 relative">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
              Starting From
            </label>
            <div className="flex items-center gap-3 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl">
              <div className="text-emerald-500">{ICONS.Location}</div>
              <input
                placeholder="Origin (e.g. Daura)"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                className="bg-transparent w-full font-black text-black outline-none placeholder:text-gray-300"
              />
            </div>
          </div>

          <button
            onClick={handleSwap}
            className="absolute right-4 top-1/2 -translate-y-1/2 mt-1 z-10 w-10 h-10 bg-white border-2 border-slate-100 rounded-full flex items-center justify-center text-emerald-600 shadow-sm active:rotate-180 transition-transform duration-300"
            type="button"
            aria-label="Swap"
          >
            {ICONS.Swap}
          </button>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
              Destination
            </label>
            <div className="flex items-center gap-3 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl">
              <div className="text-emerald-500">{ICONS.Location}</div>
              <input
                placeholder="Where to? (e.g. Katsina)"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="bg-transparent w-full font-black text-black outline-none placeholder:text-gray-300"
              />
            </div>
          </div>
        </div>

        {/* Optional Date */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
            Trip Date (Optional)
          </label>
          <input
            type="date"
            value={tripDate}
            onChange={(e) => setTripDate(e.target.value)}
            className="w-full p-5 bg-white border-2 border-slate-200 rounded-2xl text-lg font-black text-black focus:outline-none focus:ring-4 focus:ring-emerald-500/20 transition-all"
          />
        </div>

        {/* Departure Time */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
            Departure Time
          </label>
          <input
            type="time"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            className="w-full p-5 bg-white border-2 border-slate-200 rounded-2xl text-xl font-black text-black focus:outline-none focus:ring-4 focus:ring-emerald-500/20 transition-all"
          />
        </div>

        {/* Seats Selector */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
            Available Seats
          </label>
          <div className="flex gap-3">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setSeats(n)}
                type="button"
                className={`flex-1 p-5 rounded-2xl font-black text-2xl transition-all ${
                  seats === n
                    ? `${COLORS.primary} text-white border-transparent shadow-2xl shadow-emerald-200 scale-105`
                    : "bg-white border-2 text-gray-400 border-slate-100"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Price per seat */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
            Price Per Seat (₦)
          </label>
          <input
            type="number"
            min={0}
            value={pricePerSeat}
            onChange={(e) => setPricePerSeat(Number(e.target.value))}
            className="w-full p-5 bg-white border-2 border-slate-200 rounded-2xl text-xl font-black text-black focus:outline-none focus:ring-4 focus:ring-emerald-500/20 transition-all"
          />
        </div>

        <button
          onClick={handlePost}
          disabled={isPosting || !origin.trim() || !destination.trim()}
          className={`w-full ${COLORS.primary} text-white p-5 rounded-2xl font-black text-xl shadow-2xl shadow-emerald-200 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-3 mt-6 disabled:opacity-50`}
        >
          {isPosting ? (
            <div className="w-7 h-7 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <>
              {ICONS.Post}
              Post Trip
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default TripPosting;
