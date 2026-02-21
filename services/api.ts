// /services/api.ts
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  getDoc,
  query,
  arrayUnion,
  arrayRemove,
  Timestamp,
  orderBy,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { Trip, TripStatus } from "../types";
import { ROUTES } from "../constants";

type FirestoreRideDoc = {
  carOwnerId: string;

  origin: string;
  destination: string;

  time: string; // ISO string
  seats_available: number;

  // pricing
  price_per_seat?: number;

  // bookings
  bookedBy: string[];

  // status
  status: TripStatus;

  // vehicle saved at posting time ✅
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_color?: string;
  plate_number?: string;

  // metadata
  earnings?: number;
  createdAt: Timestamp;
};

const ridesCol = () => collection(db, "rides");

const buildTripFromDoc = (id: string, data: FirestoreRideDoc): Trip => {
  const seatsBooked = Array.isArray(data.bookedBy) ? data.bookedBy.length : 0;

  const vehicleName =
    [data.vehicle_make, data.vehicle_model].filter(Boolean).join(" ").trim() || undefined;

  return {
    trip_id: id,

    driver_id: data.carOwnerId,

    origin: data.origin,
    destination: data.destination,

    departure_time: data.time,

    seats_available: Number(data.seats_available ?? 0),
    seats_booked: seatsBooked,
    bookedBy: data.bookedBy || [],

    price_per_seat: Number(data.price_per_seat ?? ROUTES.SUGGESTED_PRICE_PER_SEAT),

    vehicle_make: data.vehicle_make,
    vehicle_model: data.vehicle_model,
    vehicle_color: data.vehicle_color,
    plate_number: data.plate_number,

    route: `${data.origin} → ${data.destination}`,
    vehicle_name: vehicleName,

    status: data.status || TripStatus.POSTED,

    earnings: Number(data.earnings ?? 0),

    created_at: data.createdAt?.toDate?.().toISOString?.() || new Date().toISOString(),
  };
};

export const api = {
  async getTrips(): Promise<Trip[]> {
    if (!db) return [];
    try {
      const qs = await getDocs(query(ridesCol(), orderBy("createdAt", "desc")));
      return qs.docs.map((d) => buildTripFromDoc(d.id, d.data() as FirestoreRideDoc));
    } catch (error) {
      console.error("Firestore Error (getTrips):", error);
      return [];
    }
  },

  /**
   * postTrip expects the UI Trip object but we only really need route/time/seats and vehicle fields.
   * Make sure TripPosting sends vehicle_make/model/plate from the driver's profile.
   */
  async postTrip(trip: Trip): Promise<Trip> {
    if (!db || !auth?.currentUser) throw new Error("Not authenticated");

    const ride: FirestoreRideDoc = {
      carOwnerId: auth.currentUser.uid,

      origin: trip.origin,
      destination: trip.destination,

      time: trip.departure_time,
      seats_available: Number(trip.seats_available ?? 0),

      price_per_seat: Number(trip.price_per_seat ?? ROUTES.SUGGESTED_PRICE_PER_SEAT),

      bookedBy: [],

      status: TripStatus.POSTED,

      // ✅ store the actual vehicle the driver entered
      vehicle_make: trip.vehicle_make,
      vehicle_model: trip.vehicle_model,
      vehicle_color: trip.vehicle_color,
      plate_number: trip.plate_number,

      earnings: 0,
      createdAt: Timestamp.now(),
    };

    const docRef = await addDoc(ridesCol(), ride);
    return buildTripFromDoc(docRef.id, ride);
  },

  async bookTrip(tripId: string): Promise<void> {
    if (!db || !auth?.currentUser) throw new Error("Not authenticated");
    const uid = auth.currentUser.uid;

    const rideRef = doc(db, "rides", tripId);

    // Prevent double booking and prevent booking full rides
    const snap = await getDoc(rideRef);
    if (!snap.exists()) throw new Error("Trip not found");

    const data = snap.data() as FirestoreRideDoc;

    const bookedBy = Array.isArray(data.bookedBy) ? data.bookedBy : [];
    if (bookedBy.includes(uid)) return; // already booked

    const seatsTotal = Number(data.seats_available ?? 0);
    const seatsBooked = bookedBy.length;

    if (seatsBooked >= seatsTotal) throw new Error("Trip is full");

    await updateDoc(rideRef, {
      bookedBy: arrayUnion(uid),
    });
  },

  async cancelBooking(tripId: string): Promise<void> {
    if (!db || !auth?.currentUser) throw new Error("Not authenticated");
    const uid = auth.currentUser.uid;

    const rideRef = doc(db, "rides", tripId);
    await updateDoc(rideRef, {
      bookedBy: arrayRemove(uid),
    });
  },

  // Optional (your UI calls it but your data model is list-based on ride doc)
  async updateBookingStatus(_bookingId: string, _status: string) {
    console.log("updateBookingStatus: not used because bookings are stored in ride.bookedBy");
  },
};
