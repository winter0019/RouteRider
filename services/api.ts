import { db, auth } from "./firebase";
import { Trip, TripStatus, Booking } from "../types";

const RIDES_COL = "rides"; // legacy/current
const TRIPS_COL = "trips"; // optional new
const BOOKINGS_COL = "bookings";
const TRANSACTIONS_COL = "transactions";
const WALLETS_COL = "wallets";

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || "";

if (typeof window !== "undefined") {
  console.log("API_BASE:", API_BASE || "(relative)");
}

/**
 * Wait for auth to be ready (prevents random "Not authenticated" on refresh)
 */
function waitForAuthReady(): Promise<void> {
  return new Promise((resolve) => {
    if (!auth) return resolve();

    // If Firebase already knows user (or knows there is no user)
    if (auth.currentUser !== null) return resolve();

    // Wait a short moment for auth state
    const unsub = auth.onAuthStateChanged(() => {
      unsub();
      resolve();
    });
  });
}

async function requireAuth() {
  await waitForAuthReady();
  if (!auth?.currentUser) throw new Error("Not authenticated");
  return auth.currentUser;
}

/** Parse response safely */
async function safeJson(res: Response) {
  const txt = await res.text().catch(() => "");
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

/** Ensure arrays so UI never crashes on .map */
const ensureArray = <T = any>(v: any): T[] => (Array.isArray(v) ? v : []);
/** Ensure numbers */
const num = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

async function authedFetch(path: string, options: RequestInit = {}) {
  const user = await requireAuth();

  // Force refresh token to ensure it's valid for the backend
  const token = await user.getIdToken(true);

  // Only set Content-Type when body exists (avoid weird GET behavior)
  const headers: Record<string, string> = {
    ...(options.headers as any),
    Authorization: `Bearer ${token}`,
  };

  const hasBody = !!options.body;
  if (hasBody && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const data = await safeJson(res);
    const errorMsg =
      (typeof data === "object" && data && (data.error || data.message)) ||
      (typeof data === "string" && data) ||
      `Request failed: ${res.status}`;
    throw new Error(errorMsg);
  }

  return safeJson(res);
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
  const seatsAvailable = num(data.seats_available, 0);
  const seatsBooked = typeof data.seats_booked === "number" ? data.seats_booked : bookedBy.length;

  const origin = String(data.origin || "");
  const destination = String(data.destination || "");

  return {
    id,
    trip_id: id,
    source: "rides",

    // 🔧 important: some docs use driver_id not only carOwnerId
    driver_id: data.carOwnerId || data.driver_id,
    carOwnerId: data.carOwnerId || data.driver_id,

    origin,
    destination,
    route: data.route || `${origin} → ${destination}`,

    departure_time: data.time || data.departure_time,
    time: data.time || data.departure_time,

    seats_available: seatsAvailable,
    seats_booked: seatsBooked,

    price_per_seat: num(data.price_per_seat, 0),
    driver_name: String(data.driver_name || "Verified Owner"),
    car_details: String(data.car_details || data.vehicle_name || "Vehicle"),
    vehicle_name: String(data.vehicle_name || data.car_details || "Vehicle"),

    status: (data.status as TripStatus) || TripStatus.POSTED,
    earnings: num(data.earnings, 0),
    bookedBy,

    created_at: toISO(data.createdAt || data.created_at),
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

    seats_available: num(data.seats_available, 0),
    seats_booked: num(data.seats_booked, bookedBy.length),

    price_per_seat: num(data.price_per_seat, 0),
    driver_name: String(data.driver_name || "Verified Owner"),
    car_details: String(data.car_details || data.vehicle_name || "Vehicle"),
    vehicle_name: String(data.vehicle_name || data.car_details || "Vehicle"),

    status: (data.status as TripStatus) || TripStatus.POSTED,
    earnings: num(data.earnings, 0),
    bookedBy,

    created_at: toISO(data.createdAt || data.created_at),
  };
};

function mapBooking(data: any): Booking {
  return {
    booking_id: data.booking_id || data.id || data.bookingId,
    trip_id: data.trip_id || data.rideId,
    driver_id: data.driver_id || data.driverId,
    passenger_id: data.passenger_id || data.passengerId,
    passenger_name: data.passenger_name,
    passenger_photo: data.passenger_photo,
    passenger_rating: data.passenger_rating || 5.0,
    passenger_trips: data.passenger_trips || 0,
    seats_booked: data.seats_booked,
    amount_paid: data.amount_paid ?? (data.amountKobo ? num(data.amountKobo) / 100 : undefined),
    status: data.status,
    created_at: toISO(data.createdAt || data.created_at),
  } as Booking;
}

export const api = {
  // ----------------------------
  // TRIPS
  // ----------------------------
  async getTrips(): Promise<Trip[]> {
    const res = await fetch(`${API_BASE}/api/rides`);
    if (!res.ok) {
      const data = await safeJson(res);
      const msg =
        (typeof data === "object" && data && (data.error || data.message)) ||
        (typeof data === "string" && data) ||
        `Failed to fetch rides: ${res.status}`;
      throw new Error(msg);
    }
    const data = await res.json();
    const arr = ensureArray<any>(data);
    return arr.map((d: any) =>
      d.source === "trips" ? mapTripDocToTrip(d.id, d) : mapRideDocToTrip(d.id, d)
    );
  },

  async getTrip(tripId: string, source: "rides" | "trips" = "rides"): Promise<Trip | null> {
    const res = await fetch(`${API_BASE}/api/rides/${tripId}?source=${source}`);
    if (!res.ok) return null;
    const data = await res.json();
    return source === "trips" ? mapTripDocToTrip(data.id, data) : mapRideDocToTrip(data.id, data);
  },

  async postTrip(tripData: Partial<Trip>): Promise<Trip> {
    const res: any = await authedFetch("/rides", {
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
      body: JSON.stringify({ amountKobo, email: params.email }),
    });
  },

  async initPaystackBooking(params: { rideId: string; email: string }) {
    return authedFetch("/paystack/booking/initialize", {
      method: "POST",
      body: JSON.stringify({ rideId: params.rideId, email: params.email }),
    });
  },

  async getMyWallet() {
    // ✅ always return stable wallet shape (prevents blank wallet + UI crashes)
    const data: any = await authedFetch("/wallet", { method: "GET" });

    // backend may send extra fields; we normalize for UI safety
    return {
      uid: data?.uid,
      balance: num(data?.balance, 0),
      balanceKobo: num(data?.balanceKobo, 0),
      wallet_balance: num(data?.wallet_balance, num(data?.balance, 0)), // backward compatible
      updatedAt: data?.updatedAt || null,
    };
  },

  // ✅ ensure escrow shape (prevents e.map crash)
  async getMyEscrows() {
    const data: any = await authedFetch("/escrows/me", { method: "GET" });
    return {
      totalKobo: num(data?.totalKobo, 0),
      totalNaira: num(data?.totalNaira, 0),
      items: ensureArray<any>(data?.items),
    };
  },

  // ----------------------------
  // Booking with Wallet (server-side escrow)
  // ----------------------------
  async bookTripWithWallet(rideId: string) {
    return authedFetch("/bookings/wallet", {
      method: "POST",
      body: JSON.stringify({ rideId }),
    });
  },

  // ✅ Complete booking (release escrow to driver)
  async completeBooking(bookingId: string) {
    return authedFetch(`/bookings/${bookingId}/complete`, {
      method: "POST",
    });
  },

  async bookTrip(tripId: string, _source: "rides" | "trips" = "rides"): Promise<void> {
    await authedFetch(`/rides/${tripId}/book`, { method: "POST" });
  },

  async cancelBooking(tripId: string, source: "rides" | "trips" = "rides"): Promise<void> {
    await authedFetch(`/rides/${tripId}/cancel`, {
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
    const res: any = await authedFetch("/bookings", {
      method: "POST",
      body: JSON.stringify(bookingData),
    });
    return mapBooking(res);
  },

  async getBookingsForTrip(tripId: string): Promise<Booking[]> {
    const data: any = await authedFetch(`/bookings/trip/${tripId}`, { method: "GET" });
    return ensureArray<any>(data).map((x: any) => mapBooking(x));
  },

  // Passenger view
  async getBookingsForUser(_userId: string): Promise<Booking[]> {
    const data: any = await authedFetch(`/bookings/user`, { method: "GET" });
    return ensureArray<any>(data).map((x: any) => mapBooking(x));
  },

  // Driver view (only works if backend has GET /api/bookings/driver)
  async getBookingsForDriver(): Promise<Booking[]> {
    const data: any = await authedFetch(`/bookings/driver`, { method: "GET" });
    return ensureArray<any>(data).map((x: any) => mapBooking(x));
  },

  async deleteTrip(tripId: string, source: "rides" | "trips" = "rides") {
    return authedFetch(`/rides/${tripId}?source=${source}`, { method: "DELETE" });
  },

  async getMe() {
    return authedFetch("/me", { method: "GET" });
  },

  async getProfile(_userId: string) {
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
  // Driver withdrawal (backend must exist)
  // ----------------------------
  async withdrawToBank(params: { amountNaira: number }) {
    const amountKobo = Math.round(params.amountNaira * 100);
    return authedFetch("/wallet/withdraw", {
      method: "POST",
      body: JSON.stringify({ amountKobo }),
    });
  },

  //// ----------------------------
  // Transactions
  // ----------------------------
  async getTransactions(_userId?: string) {
    const data: any = await authedFetch("/transactions", { method: "GET" });
    return ensureArray<any>(data);
  },

  // ----------------------------
  // Paystack verification (after redirect)
  // ----------------------------
  async verifyPaystack(reference: string) {
    return authedFetch("/paystack/verify", {
      method: "POST",
      body: JSON.stringify({ reference }),
    });
  },

  // ----------------------------
  // Driver: complete trip (release escrow)
  // ----------------------------
  async completeTrip(tripId: string) {
    return authedFetch(`/trips/${tripId}/complete`, {
      method: "POST",
    });
  },
};
