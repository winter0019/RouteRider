// services/api.ts

const API = import.meta.env.VITE_API_URL;

if (!API) {
  throw new Error("VITE_API_URL is not defined");
}

export async function getTrips() {
  const res = await fetch(`${API}/api/trips`);

  if (!res.ok) {
    throw new Error("Failed to fetch trips");
  }

  return res.json();
}

export async function searchTrips(params: {
  origin: string;
  destination: string;
  date?: string;
}) {
  const query = new URLSearchParams(params as any).toString();

  const res = await fetch(`${API}/api/trips/search?${query}`);

  if (!res.ok) {
    throw new Error("Trip search failed");
  }

  return res.json();
}

export async function bookTrip(tripId: number) {
  const res = await fetch(`${API}/api/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ trip_id: tripId }),
  });

  if (!res.ok) {
    throw new Error("Booking failed");
  }

  return res.json();
}
