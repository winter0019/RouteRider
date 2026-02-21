// src/services/api.ts

import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  increment,
  getDoc,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { BookingStatus, Trip, TripStatus, normalizeTrip } from "../types";

/**
 * COLLECTIONS:
 * - rides (Trip docs)
 *
 * NOTE:
 * This MVP stores "seats_booked" directly on the trip doc.
 * Booking status management can be added later using a "bookings" subcollection.
 */

function requireAuth() {
  if (!auth?.currentUser) throw new Error("Not authenticated");
  return auth.currentUser;
}

function ridesCol() {
  if (!db) throw new Error("Firestore not configured");
  return collection(db, "rides");
}

/* =========================
   READ TRIPS
========================= */

export async function getTrips(): Promise<Trip[]> {
  if (!db) return [];
  const snap = await getDocs(query(ridesCol(), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => normalizeTrip({ id: d.id, ...d.data() }));
}

/**
 * Optional server-side search (works only if you store origin/destination/trip_date)
 * If you don’t want Firestore indexing headaches now, you can just call getTrips()
 * and filter on the client.
 */
export async function searchTrips(params: {
  origin?: string;
  destination?: string;
  date?: string; // YYYY-MM-DD
}): Promise<Trip[]> {
  if (!db) return [];

  const filters: any[] = [];
  if (params.origin) filters.push(where("originLower", "==", params.origin.trim().toLowerCase()));
  if (params.destination)
    filters.push(where("destinationLower", "==", params.destination.trim().toLowerCase()));
  if (params.date) filters.push(where("trip_date", "==", params.date));

  const q = query(ridesCol(), ...filters, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizeTrip({ id: d.id, ...d.data() }));
}

/* =========================
   POST TRIP
========================= */

export async function postTrip(input: {
  origin: string;
  destination: string;
  departure_time: string; // ISO
  trip_date?: string; // YYYY-MM-DD
  trip_time?: string; // HH:mm
  seats_total: number;
  price_per_seat: number;

  driver_name: string;
  driver_phone: string;

  vehicle: {
    make: string;
    model: string;
    plate_number: string;
    color?: string;
  };
}): Promise<Trip> {
  const user = requireAuth();

  const origin = input.origin.trim();
  const destination = input.destination.trim();

  if (!origin || !destination) throw new Error("Origin and Destination are required");
  if (input.seats_total < 1) throw new Error("Seats must be at least 1");

  const payload = {
    driver_id: user.uid,
    driver_name: input.driver_name || "Driver",
    driver_phone: input.driver_phone || "N/A",

    origin,
    destination,
    originLower: origin.toLowerCase(),
    destinationLower: destination.toLowerCase(),

    departure_time: input.departure_time,
    trip_date: input.trip_date ?? "",
    trip_time: input.trip_time ?? "",

    seats_total: Number(input.seats_total),
    seats_booked: 0,

    price_per_seat: Number(input.price_per_seat),

    status: TripStatus.POSTED,

    vehicle: {
      make: input.vehicle.make || "N/A",
      model: input.vehicle.model || "N/A",
      plate_number: input.vehicle.plate_number || "N/A",
      color: input.vehicle.color || "",
    },

    createdAt: Timestamp.now(),
    created_at: new Date().toISOString(),
  };

  const ref = await addDoc(ridesCol(), payload);

  return normalizeTrip({
    id: ref.id,
    ...payload,
    trip_id: ref.id, // backward compat
  });
}

/* =========================
   BOOK TRIP (simple MVP)
========================= */

export async function bookTrip(params: { tripId: string; seats?: number }) {
  const user = requireAuth();
  if (!db) throw new Error("Firestore not configured");

  const seats = Math.max(1, Number(params.seats ?? 1));
  const rideRef = doc(db, "rides", params.tripId);

  const rideSnap = await getDoc(rideRef);
  if (!rideSnap.exists()) throw new Error("Trip not found");

  const trip = normalizeTrip({ id: rideSnap.id, ...rideSnap.data() });

  const remaining = trip.seats_total - trip.seats_booked;
  if (remaining < seats) throw new Error("Not enough seats remaining");

  // Increment seats_booked
  await updateDoc(rideRef, {
    seats_booked: increment(seats),
    // If you want to track passenger list later:
    // bookedBy: arrayUnion(user.uid)
  });

  return { ok: true };
}

/* =========================
   Booking Management (Stubs for now)
   You can upgrade later with a bookings subcollection.
========================= */

export async function getTripBookings(_tripId: string): Promise<{ ok: boolean; bookings: any[] }> {
  // TODO: Implement when you move to bookings subcollection
  return { ok: true, bookings: [] };
}

export async function updateBookingStatus(_params: { bookingId: number; status: BookingStatus }) {
  // TODO: Implement when you add booking docs
  return { ok: true };
}

export async function completeTrip(_params: { tripId: string }) {
  // TODO: Implement when you add wallet/commission logic
  return { ok: true };
}

/* =========================
   BACKWARD-COMPAT OBJECT EXPORT
   So your old imports keep working:
   import { api } from "../services/api";
========================= */

export const api = {
  getTrips,
  searchTrips,
  postTrip,
  bookTrip,
  getTripBookings,
  updateBookingStatus,
  completeTrip,
};
