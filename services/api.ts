// services/api.ts

const API = import.meta.env.VITE_API_URL;

if (!API) {
  throw new Error("VITE_API_URL is not defined");
}

/* =========================
   TYPES (optional but recommended)
========================= */

export type Trip = {
  id: number;
  origin: string;
  destination: string;
  trip_date?: string;
  trip_time?: string;
  seats_total: number;
  seats_booked: number;
  price_per_seat: number;
  status: string;
  driver_name: string;
  driver_phone: string;
};

export type Booking = {
  id: number;
  trip_id: number;
  seats: number;
  amount_paid: number;
  status: string;
  created_at: string;
};

/* =========================
   TRIPS
========================= */

// Get all active trips
export async function getTrips(): Promise<{ ok: boolean; trips: Trip[] }> {
  const res = await fetch(`${API}/api/trips`);

  if (!res.ok) {
    throw new Error("Failed to fetch trips");
  }

  return res.json();
}

// Search trips (same endpoint, query params)
export async function searchTrips(params: {
  origin?: string;
  destination?: string;
  date?: string;
}): Promise<{ ok: boolean; trips: Trip[] }> {
  const query = new URLSearchParams();

  if (params.origin) query.append("origin", params.origin);
  if (params.destination) query.append("destination", params.destination);
  if (params.date) query.append("date", params.date);

  const res = await fetch(`${API}/api/trips?${query.toString()}`);

  if (!res.ok) {
    throw new Error("Trip search failed");
  }

  return res.json();
}

// Get a single trip
export async function getTrip(tripId: number) {
  const res = await fetch(`${API}/api/trips/${tripId}`);

  if (!res.ok) {
    throw new Error("Failed to fetch trip");
  }

  return res.json();
}

/* =========================
   BOOKINGS
========================= */

// Book a trip
export async function bookTrip(params: {
  tripId: number;
  passengerPhone: string;
  seats?: number;
}): Promise<{ ok: boolean; booking: Booking }> {
  const res = await fetch(`${API}/api/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      trip_id: params.tripId,
      passenger_phone: params.passengerPhone,
      seats: params.seats ?? 1,
    }),
  });

  if (!res.ok) {
    throw new Error("Booking failed");
  }

  return res.json();
}

// Get bookings for a passenger
export async function getMyBookings(phone: string) {
  const res = await fetch(`${API}/api/bookings?phone=${phone}`);

  if (!res.ok) {
    throw new Error("Failed to fetch bookings");
  }

  return res.json();
}

/* =========================
   USERS
========================= */

// Register or fetch user
export async function registerUser(params: {
  phone: string;
  role: "driver" | "passenger";
  full_name?: string;
}) {
  const res = await fetch(`${API}/api/users/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error("User registration failed");
  }

  return res.json();
}

// Get current user
export async function getMe(phone: string) {
  const res = await fetch(`${API}/api/users/me?phone=${phone}`);

  if (!res.ok) {
    throw new Error("Failed to fetch user");
  }

  return res.json();
}
