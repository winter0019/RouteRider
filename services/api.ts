import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  Timestamp,
  orderBy,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { Trip, TripStatus, Booking, BookingStatus } from "../types";

function requireAuth() {
  if (!auth?.currentUser) throw new Error("Not authenticated");
  return auth.currentUser;
}

function requireDb() {
  if (!db) throw new Error("Firestore not configured");
  return db;
}

async function getUserProfile(uid: string) {
  // OPTIONAL: if you store profiles in `users/{uid}`
  // If you don’t have users collection, we fallback.
  try {
    const snap = await getDoc(doc(requireDb(), "users", uid));
    if (!snap.exists()) return null;
    return snap.data();
  } catch {
    return null;
  }
}

export const api = {
  /* =========================
     TRIPS (RIDES)
  ========================= */

  async getTrips(): Promise<Trip[]> {
    const dbx = requireDb();

    const ridesQ = query(collection(dbx, "rides"), orderBy("createdAt", "desc"));
    const rideSnap = await getDocs(ridesQ);

    // For each ride, compute seats_booked from ACCEPTED bookings
    const trips: Trip[] = [];

    for (const rideDoc of rideSnap.docs) {
      const data = rideDoc.data();

      const bookingsQ = query(
        collection(dbx, "rides", rideDoc.id, "bookings"),
        where("status", "==", BookingStatus.ACCEPTED)
      );
      const bookingsSnap = await getDocs(bookingsQ);

      const bookedSeats = bookingsSnap.docs.reduce((sum, b) => {
        const seats = Number(b.data().seats ?? 1);
        return sum + seats;
      }, 0);

      trips.push({
        trip_id: rideDoc.id,
        driver_id: data.carOwnerId,
        carOwnerId: data.carOwnerId,

        origin: data.origin,
        destination: data.destination,
        route: `${data.origin} → ${data.destination}`,
        departure_time: data.time,

        seats_available: Number(data.seats_available ?? 0),
        seats_booked: bookedSeats,

        status: data.status || TripStatus.POSTED,
        earnings: Number(data.earnings ?? 0),

        created_at: data.createdAt?.toDate?.().toISOString?.() || new Date().toISOString(),
      });
    }

    return trips;
  },

  async postTrip(tripData: any) {
    const dbx = requireDb();
    const user = requireAuth();

    const [origin, destination] = String(tripData.route || "")
      .split("→")
      .map((s: string) => s.trim());

    const ride = {
      carOwnerId: user.uid,
      origin: origin || tripData.origin || "Unknown",
      destination: destination || tripData.destination || "Unknown",
      time: tripData.departure_time || tripData.time || new Date().toISOString(),
      seats_available: Number(tripData.seats_available ?? tripData.seats ?? 1),
      status: TripStatus.POSTED,
      earnings: 0,
      createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(dbx, "rides"), ride);

    return {
      ...ride,
      trip_id: docRef.id,
    };
  },

  /* =========================
     BOOKINGS (subcollection)
  ========================= */

  async bookTrip(params: {
    tripId: string;
    seats?: number;
    amountPaid?: number;
  }): Promise<Booking> {
    const dbx = requireDb();
    const user = requireAuth();

    // Fetch ride
    const rideRef = doc(dbx, "rides", params.tripId);
    const rideSnap = await getDoc(rideRef);
    if (!rideSnap.exists()) throw new Error("Trip not found");

    const ride = rideSnap.data();
    const seatsRequested = Number(params.seats ?? 1);

    // Compute seats booked (accepted)
    const acceptedQ = query(
      collection(dbx, "rides", params.tripId, "bookings"),
      where("status", "==", BookingStatus.ACCEPTED)
    );
    const acceptedSnap = await getDocs(acceptedQ);
    const bookedSeats = acceptedSnap.docs.reduce((sum, b) => sum + Number(b.data().seats ?? 1), 0);

    const seatsAvailable = Number(ride.seats_available ?? 0);
    const remaining = seatsAvailable - bookedSeats;
    if (remaining < seatsRequested) throw new Error("Not enough seats remaining");

    // Passenger profile (optional)
    const profile = await getUserProfile(user.uid);

    const booking = {
      rideId: params.tripId,
      passengerUid: user.uid,
      passengerName: profile?.full_name || profile?.name || user.phoneNumber || "Passenger",
      passengerPhoto: profile?.profile_photo_url || `https://picsum.photos/100/100?seed=${user.uid}`,
      seats: seatsRequested,
      amountPaid: Number(params.amountPaid ?? ROUTES.SUGGESTED_PRICE_PER_SEAT),
      status: BookingStatus.PENDING,
      createdAt: Timestamp.now(),
    };

    const bookingRef = await addDoc(collection(dbx, "rides", params.tripId, "bookings"), booking);

    return {
      id: bookingRef.id,
      trip_id: params.tripId,
      seats: booking.seats,
      amount_paid: booking.amountPaid,
      status: booking.status,
      created_at: booking.createdAt.toDate().toISOString(),
      // extra fields for UI
      passenger_name: booking.passengerName,
      passenger_photo: booking.passengerPhoto,
    } as any;
  },

  async cancelBooking(params: { tripId: string; bookingId: string }) {
    const dbx = requireDb();
    const user = requireAuth();

    const bRef = doc(dbx, "rides", params.tripId, "bookings", params.bookingId);
    const bSnap = await getDoc(bRef);
    if (!bSnap.exists()) throw new Error("Booking not found");

    const b = bSnap.data();
    if (b.passengerUid !== user.uid) throw new Error("Not your booking");

    await updateDoc(bRef, {
      status: BookingStatus.CANCELLED,
    });

    return { ok: true };
  },

  async getTripBookings(tripId: string): Promise<Booking[]> {
    const dbx = requireDb();
    const user = requireAuth();

    // Driver only: ensure trip belongs to driver
    const rideRef = doc(dbx, "rides", tripId);
    const rideSnap = await getDoc(rideRef);
    if (!rideSnap.exists()) throw new Error("Trip not found");
    const ride = rideSnap.data();
    if (ride.carOwnerId !== user.uid) throw new Error("Not allowed");

    const qy = query(collection(dbx, "rides", tripId, "bookings"), orderBy("createdAt", "desc"));
    const snap = await getDocs(qy);

    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        trip_id: tripId,
        seats: Number(data.seats ?? 1),
        amount_paid: Number(data.amountPaid ?? 0),
        status: data.status,
        created_at: data.createdAt?.toDate?.().toISOString?.() || new Date().toISOString(),

        passenger_name: data.passengerName,
        passenger_photo: data.passengerPhoto,
      } as any;
    });
  },

  async updateBookingStatus(params: { tripId: string; bookingId: string; status: string }) {
    const dbx = requireDb();
    const user = requireAuth();

    // Driver only
    const rideRef = doc(dbx, "rides", params.tripId);
    const rideSnap = await getDoc(rideRef);
    if (!rideSnap.exists()) throw new Error("Trip not found");
    const ride = rideSnap.data();
    if (ride.carOwnerId !== user.uid) throw new Error("Not allowed");

    const bRef = doc(dbx, "rides", params.tripId, "bookings", params.bookingId);
    await updateDoc(bRef, { status: params.status });

    return { ok: true };
  },
};
