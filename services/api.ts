
import { db, auth } from "./firebase";
import { Trip, TripStatus, Booking, BookingStatus } from "../types";

const RIDES_COL = "rides";     // legacy/current
const TRIPS_COL = "trips";     // optional new
const BOOKINGS_COL = "bookings";
const TRANSACTIONS_COL = "transactions";
const WALLETS_COL = "wallets";

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || "";

if (typeof window !== 'undefined') {
  console.log("API_BASE:", API_BASE || "(relative)");
}

function requireAuth() {
  if (!auth?.currentUser) throw new Error("Not authenticated");
  return auth.currentUser;
}

async function authedFetch(path: string, options: RequestInit = {}) {
  const user = requireAuth();
  // Force refresh token to ensure it's valid for the backend
  const token = await user.getIdToken(true);

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };

  const res = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let errorMsg = text || `Request failed: ${res.status}`;
    try {
      const json = JSON.parse(text);
      errorMsg = json.error || json.message || errorMsg;
    } catch (e) {
      // Not JSON, use text
    }
    throw new Error(errorMsg);
  }
  return res.json();
}

/** Safe helper */
const toISO = (v: any) => {
  try {
    if (!v) return new Date().toISOString();
    if (typeof v === "string") return new Date(v).toISOString();
    if (v?.toDate) return v.toDate().toISOString();
    return new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
};

const mapRideDocToTrip = (id: string, data: any): Trip => {
  const bookedBy: string[] = Array.isArray(data.bookedBy) ? data.bookedBy : [];
  const seatsAvailable = Number(data.seats_available ?? 0);
  const seatsBooked =
    typeof data.seats_booked === "number" ? data.seats_booked : bookedBy.length;

  const origin = String(data.origin || "");
  const destination = String(data.destination || "");

  return {
    // identifiers
    id,
    trip_id: id,
    source: "rides",

    driver_id: data.carOwnerId,
    carOwnerId: data.carOwnerId,

    origin,
    destination,
    route: data.route || `${origin} → ${destination}`,

    departure_time: data.time || data.departure_time,
    time: data.time || data.departure_time,

    seats_available: seatsAvailable,
    seats_booked: seatsBooked,

    price_per_seat: Number(data.price_per_seat ?? 0),
    driver_name: String(data.driver_name || "Verified Owner"),
    car_details: String(data.car_details || data.vehicle_name || "Vehicle"),
    vehicle_name: String(data.vehicle_name || data.car_details || "Vehicle"),

    status: (data.status as TripStatus) || TripStatus.POSTED,
    earnings: Number(data.earnings ?? 0),
    bookedBy,

    created_at: toISO(data.createdAt),
  };
};

const mapTripDocToTrip = (id: string, data: any): Trip => {
  const bookedBy: string[] = Array.isArray(data.bookedBy) ? data.bookedBy : [];

  const origin = String(data.origin || "");
  const destination = String(data.destination || "");

  return {
    id,
    trip_id: id,
    source: "trips",

    driver_id: data.driver_id,
    carOwnerId: data.driver_id, // keep compatibility

    origin,
    destination,
    route: String(data.route || `${origin} → ${destination}`),

    departure_time: data.departure_time || data.time,
    time: data.departure_time || data.time,

    seats_available: Number(data.seats_available ?? 0),
    seats_booked: Number(data.seats_booked ?? bookedBy.length),

    price_per_seat: Number(data.price_per_seat ?? 0),
    driver_name: String(data.driver_name || "Verified Owner"),
    car_details: String(data.car_details || data.vehicle_name || "Vehicle"),
    vehicle_name: String(data.vehicle_name || data.car_details || "Vehicle"),

    status: (data.status as TripStatus) || TripStatus.POSTED,
    earnings: Number(data.earnings ?? 0),
    bookedBy,

    created_at: toISO(data.createdAt || data.created_at),
  };
};

export const api = {
  // ----------------------------
  // TRIPS
  // ----------------------------
  async getTrips(): Promise<Trip[]> {
    const res = await fetch(`${API_BASE}/api/rides`);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Failed to fetch rides: ${res.status}`);
    }
    const data = await res.json();
    return data.map((d: any) => d.source === "trips" ? mapTripDocToTrip(d.id, d) : mapRideDocToTrip(d.id, d));
  },

  async getTrip(tripId: string, source: "rides" | "trips" = "rides"): Promise<Trip | null> {
    const res = await fetch(`${API_BASE}/api/rides/${tripId}?source=${source}`);
    if (!res.ok) return null;
    const data = await res.json();
    return source === "trips" ? mapTripDocToTrip(data.id, data) : mapRideDocToTrip(data.id, data);
  },

  async postTrip(tripData: Partial<Trip>): Promise<Trip> {
    const res = await authedFetch("/rides", {
      method: "POST",
      body: JSON.stringify(tripData),
    });
    return mapRideDocToTrip(res.id, res);
  },

  // ----------------------------
  // WALLET: Passenger Top-up (Paystack)
  // ----------------------------
  async initPaystackTopup(params: { amountNaira: number; email: string }) {
    const amountKobo = Math.round(params.amountNaira * 100);
    return authedFetch("/paystack/topup/initialize", {
      method: "POST",
      body: JSON.stringify({
        amountKobo,
        email: params.email,
      }),
    });
  },

  async initPaystackBooking(params: { rideId: string; email: string }) {
    return authedFetch("/paystack/booking/initialize", {
      method: "POST",
      body: JSON.stringify({
        rideId: params.rideId,
        email: params.email,
      }),
    });
  },

  async getMyWallet() {
    return authedFetch("/wallet");
  },

  // ----------------------------
  // Booking with Wallet (server-side)
  // ----------------------------
  async bookTripWithWallet(rideId: string) {
    return authedFetch("/bookings/wallet", {
      method: "POST",
      body: JSON.stringify({ rideId }),
    });
  },

  async completeBooking(bookingId: string) {
    return authedFetch(`/bookings/${bookingId}/complete`, {
      method: "POST",
    });
  },

  async bookTrip(tripId: string, source: "rides" | "trips" = "rides"): Promise<void> {
    if (source === "trips") {
      // trips still use client side for now if needed, but let's try to unify
      return authedFetch(`/rides/${tripId}/book`, { method: "POST" });
    }
    return authedFetch(`/rides/${tripId}/book`, { method: "POST" });
  },

  async cancelBooking(tripId: string, source: "rides" | "trips" = "rides"): Promise<void> {
    return authedFetch(`/rides/${tripId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ source }),
    });
  },

  async updateBookingStatus(bookingId: string, status: string) {
    return authedFetch(`/bookings/${bookingId}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  },

  async updateTripStatus(tripId: string, status: TripStatus, source: "rides" | "trips" = "rides") {
    return authedFetch(`/rides/${tripId}/status`, {
      method: "POST",
      body: JSON.stringify({ status, source }),
    });
  },

  async createBooking(bookingData: any): Promise<Booking> {
    const res = await authedFetch("/bookings", {
      method: "POST",
      body: JSON.stringify(bookingData),
    });

    return {
      booking_id: res.id,
      trip_id: res.trip_id,
      driver_id: res.driver_id,
      passenger_id: res.passenger_id,
      passenger_name: res.passenger_name,
      passenger_photo: res.passenger_photo,
      passenger_rating: res.passenger_rating || 5.0,
      passenger_trips: res.passenger_trips || 0,
      seats_booked: res.seats_booked,
      amount_paid: res.amount_paid,
      status: res.status,
      created_at: toISO(res.createdAt),
    };
  },

  async getBookingsForTrip(tripId: string): Promise<Booking[]> {
    const data = await authedFetch(`/bookings/trip/${tripId}`);
    return data.map((data: any) => {
      return {
        booking_id: data.booking_id || data.id,
        trip_id: data.trip_id,
        driver_id: data.driver_id,
        passenger_id: data.passenger_id,
        passenger_name: data.passenger_name,
        passenger_photo: data.passenger_photo,
        passenger_rating: data.passenger_rating || 5.0,
        passenger_trips: data.passenger_trips || 0,
        seats_booked: data.seats_booked,
        amount_paid: data.amount_paid,
        status: data.status,
        created_at: toISO(data.createdAt),
      } as Booking;
    });
  },

  async getBookingsForUser(userId: string): Promise<Booking[]> {
    const data = await authedFetch(`/bookings/user`);
    return data.map((data: any) => {
      return {
        booking_id: data.booking_id || data.id,
        trip_id: data.trip_id,
        driver_id: data.driver_id,
        passenger_id: data.passenger_id,
        passenger_name: data.passenger_name,
        passenger_photo: data.passenger_photo,
        passenger_rating: data.passenger_rating || 5.0,
        passenger_trips: data.passenger_trips || 0,
        seats_booked: data.seats_booked,
        amount_paid: data.amount_paid,
        status: data.status,
        created_at: toISO(data.createdAt),
      } as Booking;
    });
  },

  async deleteTrip(tripId: string, source: "rides" | "trips" = "rides") {
    return authedFetch(`/rides/${tripId}?source=${source}`, {
      method: "DELETE",
    });
  },

  async getMe() {
    return authedFetch("/me", { method: "GET" });
  },

  async getProfile(userId: string) {
    return authedFetch("/users/profile", { method: "GET" });
  },

  async updateProfile(data: any) {
    return authedFetch("/users/profile", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async submitKYC(data: any) {
    return authedFetch("/kyc/submit", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // ----------------------------
  // Driver withdrawal (Paystack Transfers) - backend only
  // ----------------------------
  async withdrawToBank(params: { amountNaira: number }) {
    const amountKobo = Math.round(params.amountNaira * 100);
    return authedFetch("/wallet/withdraw", {
      method: "POST",
      body: JSON.stringify({ amountKobo }),
    });
  },

  async createTransaction(txData: any) {
    return authedFetch("/transactions", {
      method: "POST",
      body: JSON.stringify(txData),
    });
  },

  async getTransactions(userId: string) {
    return authedFetch("/transactions", { method: "GET" });
  },
};
