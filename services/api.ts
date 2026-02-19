// services/api.ts

const API = import.meta.env.VITE_API_URL;

if (!API) {
  throw new Error("VITE_API_URL is not defined");
}

/* =========================
   TYPES
========================= */

export type Trip = {
  id: number;
  origin: string;
  destination: string;
  trip_date: string | null;
  trip_time: string | null;
  seats_total: number;
  seats_booked: number;
  price_per_seat: number;
  status: "active" | "completed" | "cancelled" | string;
  created_at: string;

  driver_phone?: string;
  driver_name?: string;
};

export type Booking = {
  id: number;
  trip_id: number;
  seats: number;
  amount_paid: number;
  status: "pending" | "confirmed" | "cancelled" | "completed" | string;
  created_at: string;

  passenger_phone?: string;
  passenger_name?: string;
};

export type User = {
  id: number;
  phone: string;
  role: "driver" | "passenger";
  full_name: string | null;
  created_at: string;
};

/* =========================
   INTERNAL HELPERS
========================= */

async function parseJsonOrThrow(res: Response) {
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg =
      data?.error ||
      data?.message ||
      `Request failed (${res.status} ${res.statusText})`;
    throw new Error(msg);
  }

  return data;
}

/* =========================
   TRIPS
========================= */

// Get all active trips
export async function getTrips(): Promise<{ trips: Trip[] }> {
  const res = await fetch(`${API}/api/trips`);
  return parseJsonOrThrow(res);
}

// Search trips
export async function searchTrips(params: {
  origin: string;
  destination: string;
  date?: string;
}): Promise<{ trips: Trip[] }> {
  const query = new URLSearchParams();
  query.set("origin", params.origin);
  query.set("destination", params.destination);
  if (params.date) query.set("date", params.date);

  const res = await fetch(`${API}/api/trips/search?${query.toString()}`);
  return parseJsonOrThrow(res);
}

// Driver posts trip
export async function postTrip(params: {
  driverPhone: string;
  driverName?: string;
  origin: string;
  destination: string;
  date?: string; // "YYYY-MM-DD"
  time?: string; // "HH:MM"
  seats_total: number;
  price_per_seat: number;
}): Promise<{ trip: Trip }> {
  const res = await fetch(`${API}/api/trips`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  return parseJsonOrThrow(res);
}

// Complete a trip (driver)
export async function completeTrip(params: {
  driverPhone: string;
  trip_id: number;
}): Promise<{ trip: Trip; message: string }> {
  const res = await fetch(`${API}/api/trips/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  return parseJsonOrThrow(res);
}

/* =========================
   BOOKINGS
========================= */

// Passenger books a trip
export async function bookTrip(params: {
  tripId: number;
  passengerPhone: string;
  passengerName?: string;
  seats?: number;
}): Promise<{ booking: Booking }> {
  const res = await fetch(`${API}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      trip_id: params.tripId,
      passengerPhone: params.passengerPhone, // ✅ matches backend
      passengerName: params.passengerName,
      seats: params.seats ?? 1,
    }),
  });

  return parseJsonOrThrow(res);
}

// Driver fetch bookings (for their trips)
export async function getDriverBookings(driverPhone: string): Promise<{
  active_trip: Trip | null;
  bookings: Booking[];
}> {
  const query = new URLSearchParams();
  query.set("driver_phone", driverPhone);

  const res = await fetch(`${API}/api/driver/bookings?${query.toString()}`);
  return parseJsonOrThrow(res);
}

// Driver accept/reject booking
export async function setBookingStatus(params: {
  booking_id: number;
  status: "confirmed" | "cancelled";
}): Promise<{ booking: Booking }> {
  const res = await fetch(`${API}/api/bookings/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  return parseJsonOrThrow(res);
}

/* =========================
   USERS (OPTIONAL)
   NOTE: Only use if your backend implements these endpoints.
========================= */

// Register (if you add this endpoint on backend)
export async function registerUser(params: {
  phone: string;
  role: "driver" | "passenger";
  full_name?: string;
}): Promise<{ user: User }> {
  const res = await fetch(`${API}/api/users/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  return parseJsonOrThrow(res);
}

// Get user (if you add this endpoint on backend)
export async function getMe(phone: string): Promise<{ user: User }> {
  const res = await fetch(`${API}/api/users/me?phone=${encodeURIComponent(phone)}`);
  return parseJsonOrThrow(res);
}
