
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  arrayUnion,
  arrayRemove,
  Timestamp,
  orderBy,
  increment,
  runTransaction,
} from "firebase/firestore";

import { db, auth } from "./firebase";
import { Trip, TripStatus, Booking, BookingStatus } from "../types";

const RIDES_COL = "rides";     // legacy/current
const TRIPS_COL = "trips";     // optional new
const BOOKINGS_COL = "bookings";

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

    driver_name: String(data.driver_name || "Verified Owner"),
    car_details: String(data.car_details || data.vehicle_name || "Vehicle"),

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

    driver_name: String(data.driver_name || "Verified Owner"),
    car_details: String(data.car_details || data.vehicle_name || "Vehicle"),

    status: (data.status as TripStatus) || TripStatus.POSTED,
    earnings: Number(data.earnings ?? 0),
    bookedBy,

    created_at: toISO(data.createdAt || data.created_at),
  };
};

export const api = {
  /**
   * ✅ Returns merged list from BOTH /rides and /trips
   * Passengers will see all recent posts.
   */
  async getTrips(): Promise<Trip[]> {
    if (!db) return [];

    try {
      const ridesQ = query(collection(db, RIDES_COL), orderBy("createdAt", "desc"));
      const tripsQ = query(collection(db, TRIPS_COL), orderBy("createdAt", "desc"));

      const [ridesSnap, tripsSnap] = await Promise.all([
        getDocs(ridesQ).catch(() => null),
        getDocs(tripsQ).catch(() => null),
      ]);

      const rides: Trip[] = ridesSnap
        ? ridesSnap.docs.map((d) => mapRideDocToTrip(d.id, d.data()))
        : [];

      const trips: Trip[] = tripsSnap
        ? tripsSnap.docs.map((d) => mapTripDocToTrip(d.id, d.data()))
        : [];

      // merge + sort newest
      return [...rides, ...trips].sort((a, b) => {
        const at = new Date(a.created_at).getTime();
        const bt = new Date(b.created_at).getTime();
        return bt - at;
      });
    } catch (err) {
      console.error("Firestore Error (getTrips):", err);
      return [];
    }
  },

  async getTrip(tripId: string, source: "rides" | "trips" = "rides"): Promise<Trip | null> {
    if (!db) return null;
    try {
      const col = source === "trips" ? TRIPS_COL : RIDES_COL;
      const snap = await getDoc(doc(db, col, tripId));
      if (!snap.exists()) return null;
      return source === "trips" 
        ? mapTripDocToTrip(snap.id, snap.data())
        : mapRideDocToTrip(snap.id, snap.data());
    } catch (err) {
      console.error("Firestore Error (getTrip):", err);
      return null;
    }
  },

  /**
   * ✅ Posts to /rides by default (your current app)
   */
  async postTrip(tripData: Partial<Trip>): Promise<Trip> {
    if (!db || !auth?.currentUser) throw new Error("Not authenticated");

    let origin = String(tripData.origin || "").trim();
    let destination = String(tripData.destination || "").trim();

    // Fallback: extract from route if origin/destination are missing
    if (!origin || !destination) {
      const routeStr = tripData.route || '';
      if (routeStr.includes('→')) {
        [origin, destination] = routeStr.split('→').map(s => s.trim());
      } else if (routeStr.includes('->')) {
        [origin, destination] = routeStr.split('->').map(s => s.trim());
      }
    }

    const seatsAvailable = Math.max(1, Number(tripData.seats_available ?? 1));

    const ride: any = {
      carOwnerId: auth.currentUser.uid,
      bookedBy: [],
      seats_available: seatsAvailable,
      seats_booked: 0,

      origin: origin || 'Unknown',
      destination: destination || 'Unknown',
      time: tripData.departure_time || tripData.time || new Date().toISOString(),

      driver_name: tripData.driver_name || "Verified Owner",
      car_details: tripData.car_details || "Vehicle",

      status: TripStatus.POSTED,
      earnings: 0,
      createdAt: Timestamp.now(),
    };

    const ref = await addDoc(collection(db, RIDES_COL), ride);
    return mapRideDocToTrip(ref.id, ride);
  },

  /**
   * ✅ Booking MUST be safe:
   * - Don’t allow double increments
   * - Don’t exceed seats_available
   * Uses transaction = best practice
   */
  async bookTrip(tripId: string, source: "rides" | "trips" = "rides"): Promise<void> {
    if (!db || !auth?.currentUser) throw new Error("Not authenticated");
    const uid = auth.currentUser.uid;

    const col = source === "trips" ? TRIPS_COL : RIDES_COL;
    const ref = doc(db, col, tripId);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("Trip not found");

      const data: any = snap.data();
      const bookedBy: string[] = Array.isArray(data.bookedBy) ? data.bookedBy : [];

      const seatsAvailable = Number(data.seats_available ?? 0);
      const currentBooked =
        typeof data.seats_booked === "number" ? data.seats_booked : bookedBy.length;

      // already booked => no-op (prevents double increment)
      if (bookedBy.includes(uid)) return;

      // full => block
      if (currentBooked >= seatsAvailable) {
        throw new Error("Trip is full");
      }

      tx.update(ref, {
        bookedBy: arrayUnion(uid),
        seats_booked: increment(1),
      });
    });
  },

  async cancelBooking(tripId: string, source: "rides" | "trips" = "rides"): Promise<void> {
    if (!db || !auth?.currentUser) throw new Error("Not authenticated");
    const uid = auth.currentUser.uid;

    const col = source === "trips" ? TRIPS_COL : RIDES_COL;
    const ref = doc(db, col, tripId);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("Trip not found");

      const data: any = snap.data();
      const bookedBy: string[] = Array.isArray(data.bookedBy) ? data.bookedBy : [];

      const currentBooked =
        typeof data.seats_booked === "number" ? data.seats_booked : bookedBy.length;

      if (!bookedBy.includes(uid)) return; // not booked => no-op

      tx.update(ref, {
        bookedBy: arrayRemove(uid),
        seats_booked: increment(currentBooked > 0 ? -1 : 0),
      });
    });
  },

  async updateBookingStatus(bookingId: string, status: string) {
    if (!db) return;
    try {
      const bookingRef = doc(db, BOOKINGS_COL, bookingId);
      await updateDoc(bookingRef, { status });
    } catch (error) {
      console.error('Firestore Error (updateBookingStatus):', error);
      throw error;
    }
  },

  async updateTripStatus(tripId: string, status: TripStatus, source: "rides" | "trips" = "rides") {
    if (!db) return;
    try {
      const col = source === "trips" ? TRIPS_COL : RIDES_COL;
      const tripRef = doc(db, col, tripId);
      await updateDoc(tripRef, { status });
    } catch (error) {
      console.error('Firestore Error (updateTripStatus):', error);
      throw error;
    }
  },

  /**
   * ✅ Optional: bookings collection
   */
  async createBooking(bookingData: any): Promise<Booking> {
    if (!db || !auth?.currentUser) throw new Error("Not authenticated");

    const booking: any = {
      trip_id: String(bookingData.trip_id),
      driver_id: String(bookingData.driver_id), // Added driver_id for security rules
      passenger_id: auth.currentUser.uid,
      passenger_name: bookingData.passenger_name || "Passenger",
      passenger_photo:
        bookingData.passenger_photo ||
        `https://picsum.photos/100/100?seed=${auth.currentUser.uid}`,
      passenger_rating: 5.0,
      passenger_trips: 0,
      seats_booked: bookingData.seats_booked ?? 1,
      amount_paid: Number(bookingData.amount_paid ?? 0),
      status: BookingStatus.PENDING,
      createdAt: Timestamp.now(),
    };

    const ref = await addDoc(collection(db, BOOKINGS_COL), booking);

    return {
      booking_id: ref.id,
      trip_id: booking.trip_id,
      driver_id: booking.driver_id,
      passenger_id: booking.passenger_id,
      passenger_name: booking.passenger_name,
      passenger_photo: booking.passenger_photo,
      passenger_rating: booking.passenger_rating,
      passenger_trips: booking.passenger_trips,
      seats_booked: booking.seats_booked,
      amount_paid: booking.amount_paid,
      status: booking.status,
      created_at: booking.createdAt.toDate().toISOString(),
    };
  },

  async getBookingsForTrip(tripId: string): Promise<Booking[]> {
    if (!db) return [];
    const q = query(collection(db, BOOKINGS_COL), where("trip_id", "==", tripId));
    const snap = await getDocs(q);

    return snap.docs.map((d) => {
      const data: any = d.data();
      return {
        booking_id: d.id,
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
    if (!db) return [];
    const q = query(collection(db, BOOKINGS_COL), where("passenger_id", "==", userId));
    const snap = await getDocs(q);

    return snap.docs.map((d) => {
      const data: any = d.data();
      return {
        booking_id: d.id,
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
    if (!db || !auth?.currentUser) throw new Error("Not authenticated");
    const col = source === "trips" ? TRIPS_COL : RIDES_COL;
    await deleteDoc(doc(db, col, tripId));
  },
};
