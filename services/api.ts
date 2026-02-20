// src/services/api.ts
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  getDoc,
  query,
  orderBy,
  Timestamp,
  runTransaction,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { BookingStatus, TripStatus, Trip, Booking } from "../types";

/**
 * Firestore structure used:
 * rides (collection)
 *   {rideId} (doc)
 *     bookings (subcollection)
 *        {bookingId} (doc)
 */

function requireAuth() {
  if (!auth?.currentUser) throw new Error("Not authenticated");
  return auth.currentUser;
}

function requireDb() {
  if (!db) throw new Error("Firestore not configured");
  return db;
}

function toISODateTime(value: any) {
  // accept ISO string already
  if (typeof value === "string") return value;
  // accept Firestore Timestamp
  if (value?.toDate) return value.toDate().toISOString();
  return new Date().toISOString();
}

function safeNum(n: any, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

/* =========================
   TRIPS
========================= */

export async function getTrips(): Promise<Trip[]> {
  const _db = requireDb();

  const q = query(collection(_db, "rides"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  return snap.docs.map((d) => {
    const data = d.data() as any;

    const origin = String(data.origin ?? "").trim();
    const destination = String(data.destination ?? "").trim();

    const seats_available = safeNum(data.seats_available, safeNum(data.seats_total, 0));
    const seats_booked = safeNum(data.seats_booked, 0);

    return {
      trip_id: d.id,
      driver_id: data.carOwnerId ?? data.driver_id ?? "",
      carOwnerId: data.carOwnerId ?? "",
      origin,
      destination,
      route: data.route ?? `${origin} → ${destination}`,
      departure_time: toISODateTime(data.departure_time ?? data.time),

      seats_available,
      seats_booked,

      price_per_seat: safeNum(data.price_per_seat, 0),

      // ✅ vehicle info (fix mismatch)
      vehicle_name: data.vehicle_name ?? "",
      plate_number: data.plate_number ?? "",

      status: (data.status as TripStatus) ?? TripStatus.POSTED,
      earnings: safeNum(data.earnings, 0),
      created_at: toISODateTime(data.createdAt),
      bookedBy: Array.isArray(data.bookedBy) ? data.bookedBy : [],
    } satisfies Trip;
  });
}

export async function postTrip(input: {
  origin: string;
  destination: string;
  departure_time: string; // ISO
  seats_available: number;
  price_per_seat?: number;

  // ✅ pass vehicle info from driver profile
  vehicle_name?: string;
  plate_number?: string;
}): Promise<{ ok: boolean; trip: Trip }> {
  const user = requireAuth();
  const _db = requireDb();

  const origin = String(input.origin ?? "").trim();
  const destination = String(input.destination ?? "").trim();

  if (!origin || !destination) throw new Error("Origin and destination are required");
  if (!input.departure_time) throw new Error("departure_time is required");

  const seats_available = safeNum(input.seats_available, 0);
  if (seats_available <= 0) throw new Error("seats_available must be > 0");

  const rideDoc: any = {
    carOwnerId: user.uid,

    origin,
    destination,
    route: `${origin} → ${destination}`,
    departure_time: input.departure_time,

    seats_available,
    seats_booked: 0,

    price_per_seat: safeNum(input.price_per_seat, 0),

    // ✅ vehicle info
    vehicle_name: String(input.vehicle_name ?? "").trim(),
    plate_number: String(input.plate_number ?? "").trim(),

    status: TripStatus.POSTED,
    earnings: 0,
    createdAt: Timestamp.now(),
  };

  const ref = await addDoc(collection(_db, "rides"), rideDoc);

  const trip: Trip = {
    trip_id: ref.id,
    driver_id: user.uid,
    carOwnerId: user.uid,
    origin,
    destination,
    route: rideDoc.route,
    departure_time: rideDoc.departure_time,
    seats_available,
    seats_booked: 0,
    price_per_seat: rideDoc.price_per_seat,
    vehicle_name: rideDoc.vehicle_name,
    plate_number: rideDoc.plate_number,
    status: TripStatus.POSTED,
    earnings: 0,
    created_at: new Date().toISOString(),
  };

  return { ok: true, trip };
}

export async function completeTrip(params: { tripId: string }) {
  const user = requireAuth();
  const _db = requireDb();

  const rideRef = doc(_db, "rides", params.tripId);
  const rideSnap = await getDoc(rideRef);
  if (!rideSnap.exists()) throw new Error("Trip not found");

  const data = rideSnap.data() as any;
  if (data.carOwnerId !== user.uid) throw new Error("Only the driver can complete this trip");

  await updateDoc(rideRef, {
    status: TripStatus.COMPLETED,
    completedAt: Timestamp.now(),
  });

  return { ok: true };
}

/* =========================
   BOOKINGS
========================= */

export async function getTripBookings(tripId: string): Promise<{ ok: boolean; bookings: Booking[] }> {
  const _db = requireDb();

  const bookingsRef = collection(_db, "rides", tripId, "bookings");
  const q = query(bookingsRef, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  const bookings: Booking[] = snap.docs.map((d) => {
    const data = d.data() as any;

    return {
      id: undefined,
      booking_id: d.id,
      trip_id: tripId,

      passenger_id: data.passenger_id ?? "",
      passenger_phone: data.passenger_phone ?? "",
      passenger_name: data.passenger_name ?? "",
      passenger_photo: data.passenger_photo ?? "",
      passenger_rating: safeNum(data.passenger_rating, 0),
      passenger_trips: safeNum(data.passenger_trips, 0),

      seats: safeNum(data.seats, 1),
      amount_paid: safeNum(data.amount_paid, 0),
      status: (data.status as BookingStatus) ?? BookingStatus.PENDING,
      created_at: toISODateTime(data.createdAt),
    };
  });

  return { ok: true, bookings };
}

/**
 * Passenger books seats:
 * - Creates booking doc under rides/{tripId}/bookings
 * - In a transaction: checks remaining seats, increments seats_booked
 */
export async function bookTrip(params: {
  tripId: string;
  seats?: number;

  // passenger details (optional but recommended)
  passenger_phone?: string;
  passenger_name?: string;
  passenger_photo?: string;
}): Promise<{ ok: boolean; booking: Booking }> {
  const user = requireAuth();
  const _db = requireDb();

  const seats = Math.max(1, safeNum(params.seats, 1));

  const rideRef = doc(_db, "rides", params.tripId);
  const bookingRef = doc(collection(_db, "rides", params.tripId, "bookings"));

  const result = await runTransaction(_db, async (tx) => {
    const rideSnap = await tx.get(rideRef);
    if (!rideSnap.exists()) throw new Error("Trip not found");

    const ride = rideSnap.data() as any;

    const seats_available = safeNum(ride.seats_available, 0);
    const seats_booked = safeNum(ride.seats_booked, 0);
    const remaining = seats_available - seats_booked;

    if (remaining < seats) throw new Error("Not enough seats remaining");

    // update trip seats
    tx.update(rideRef, {
      seats_booked: seats_booked + seats,
    });

    // create booking doc
    const bookingData: any = {
      passenger_id: user.uid,
      passenger_phone: params.passenger_phone ?? "",
      passenger_name: params.passenger_name ?? "",
      passenger_photo: params.passenger_photo ?? "",

      seats,
      amount_paid: safeNum(ride.price_per_seat, 0) * seats,
      status: BookingStatus.PENDING,
      createdAt: Timestamp.now(),
    };

    tx.set(bookingRef, bookingData);

    const booking: Booking = {
      booking_id: bookingRef.id,
      trip_id: params.tripId,
      passenger_id: user.uid,
      passenger_phone: bookingData.passenger_phone,
      passenger_name: bookingData.passenger_name,
      passenger_photo: bookingData.passenger_photo,
      seats,
      amount_paid: bookingData.amount_paid,
      status: BookingStatus.PENDING,
      created_at: new Date().toISOString(),
    };

    return booking;
  });

  return { ok: true, booking: result };
}

/**
 * Driver accepts/rejects a booking.
 * NOTE: We do NOT change seats here because seats were already reserved at booking time.
 */
export async function updateBookingStatus(params: {
  tripId: string;
  bookingId: string;
  status: BookingStatus;
}) {
  const user = requireAuth();
  const _db = requireDb();

  const rideRef = doc(_db, "rides", params.tripId);
  const rideSnap = await getDoc(rideRef);
  if (!rideSnap.exists()) throw new Error("Trip not found");
  const ride = rideSnap.data() as any;

  if (ride.carOwnerId !== user.uid) throw new Error("Only the driver can manage bookings");

  const bookingRef = doc(_db, "rides", params.tripId, "bookings", params.bookingId);
  await updateDoc(bookingRef, { status: params.status });

  return { ok: true };
}

/**
 * Passenger cancels:
 * - Sets booking status CANCELLED
 * - Decrements trip seats_booked in a transaction
 */
export async function cancelBooking(params: { tripId: string; bookingId: string }) {
  const user = requireAuth();
  const _db = requireDb();

  const rideRef = doc(_db, "rides", params.tripId);
  const bookingRef = doc(_db, "rides", params.tripId, "bookings", params.bookingId);

  await runTransaction(_db, async (tx) => {
    const bookingSnap = await tx.get(bookingRef);
    if (!bookingSnap.exists()) throw new Error("Booking not found");

    const booking = bookingSnap.data() as any;
    if (booking.passenger_id !== user.uid) throw new Error("You can only cancel your own booking");

    const rideSnap = await tx.get(rideRef);
    if (!rideSnap.exists()) throw new Error("Trip not found");

    const ride = rideSnap.data() as any;

    const seats = safeNum(booking.seats, 1);
    const currentBooked = safeNum(ride.seats_booked, 0);

    tx.update(bookingRef, { status: BookingStatus.CANCELLED });
    tx.update(rideRef, { seats_booked: Math.max(0, currentBooked - seats) });
  });

  return { ok: true };
}

/* =========================
   BACKWARD COMPAT (optional)
   For older code: import { api } from "../services/api"
========================= */

export const api = {
  getTrips,
  postTrip,
  bookTrip,
  cancelBooking,
  getTripBookings,
  updateBookingStatus,
  completeTrip,
};
