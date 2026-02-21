import {
  collection,
  doc,
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
} from "firebase/firestore";

import { db, auth } from "./firebase";
import { Trip, TripStatus, Booking, BookingStatus } from "../types";

const RIDES_COL = "rides";
const BOOKINGS_COL = "bookings";

export const api = {
  async getTrips(): Promise<Trip[]> {
    if (!db) return [];

    try {
      const q = query(collection(db, RIDES_COL), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);

      return snap.docs.map((d) => {
        const data: any = d.data();

        const bookedBy: string[] = Array.isArray(data.bookedBy) ? data.bookedBy : [];
        const seatsBooked = typeof data.seats_booked === "number" ? data.seats_booked : bookedBy.length;
        const seatsAvailable = typeof data.seats_available === "number" ? data.seats_available : 0;

        const origin = String(data.origin || "");
        const destination = String(data.destination || "");

        return {
          id: d.id,
          trip_id: d.id, // keep both for compatibility
          driver_id: data.carOwnerId,
          carOwnerId: data.carOwnerId,

          origin,
          destination,
          route: `${origin} → ${destination}`,

          departure_time: data.time, // store as string/date
          time: data.time,

          seats_available: seatsAvailable,
          seats_booked: seatsBooked,

          price_per_seat: Number(data.price_per_seat ?? 0),
          driver_name: String(data.driver_name || "Verified Owner"),

          // ✅ THIS is what passenger UI should display
          vehicle_name: String(data.vehicle_name || data.car_details || "Vehicle"),
          car_details: String(data.car_details || data.vehicle_name || "Vehicle"),

          status: (data.status as TripStatus) || TripStatus.POSTED,
          earnings: Number(data.earnings ?? 0),
          bookedBy,

          created_at: data.createdAt?.toDate?.().toISOString?.() || new Date().toISOString(),
        } as Trip;
      });
    } catch (err) {
      console.error("Firestore Error (getTrips):", err);
      return [];
    }
  },

  async postTrip(tripData: Partial<Trip>): Promise<Trip> {
    if (!db || !auth?.currentUser) throw new Error("Not authenticated");

    const origin = String(tripData.origin || "").trim();
    const destination = String(tripData.destination || "").trim();

    const seatsAvailable = Number(tripData.seats_available ?? 1);
    const pricePerSeat = Number(tripData.price_per_seat ?? 0);

    const ride: any = {
      carOwnerId: auth.currentUser.uid,
      bookedBy: [],
      seats_available: seatsAvailable,
      seats_booked: 0,

      origin,
      destination,
      time: tripData.departure_time || tripData.time || new Date().toISOString(),

      // driver display data
      driver_name: tripData.driver_name || "Verified Owner",
      vehicle_name: tripData.vehicle_name || tripData.car_details || "Vehicle",
      car_details: tripData.car_details || tripData.vehicle_name || "Vehicle",
      price_per_seat: pricePerSeat,

      status: TripStatus.POSTED,
      earnings: 0,
      createdAt: Timestamp.now(),
    };

    const ref = await addDoc(collection(db, RIDES_COL), ride);

    return {
      id: ref.id,
      trip_id: ref.id,
      driver_id: ride.carOwnerId,
      carOwnerId: ride.carOwnerId,

      origin: ride.origin,
      destination: ride.destination,
      route: `${ride.origin} → ${ride.destination}`,

      departure_time: ride.time,
      time: ride.time,

      seats_available: ride.seats_available,
      seats_booked: 0,

      price_per_seat: ride.price_per_seat,
      driver_name: ride.driver_name,
      vehicle_name: ride.vehicle_name,
      car_details: ride.car_details,

      status: ride.status,
      earnings: ride.earnings,
      bookedBy: [],
      created_at: new Date().toISOString(),
    } as Trip;
  },

  // ✅ IMPORTANT: This must update BOTH bookedBy and seats_booked
  async bookTrip(tripId: string): Promise<void> {
    if (!db || !auth?.currentUser) throw new Error("Not authenticated");

    const uid = auth.currentUser.uid;
    const rideRef = doc(db, RIDES_COL, tripId);

    await updateDoc(rideRef, {
      bookedBy: arrayUnion(uid),
      seats_booked: increment(1),
    });
  },

  async cancelBooking(tripId: string): Promise<void> {
    if (!db || !auth?.currentUser) throw new Error("Not authenticated");

    const uid = auth.currentUser.uid;
    const rideRef = doc(db, RIDES_COL, tripId);

    await updateDoc(rideRef, {
      bookedBy: arrayRemove(uid),
      seats_booked: increment(-1),
    });
  },

  // Optional bookings collection (only if you use it)
  async createBooking(bookingData: any): Promise<Booking> {
    if (!db || !auth?.currentUser) throw new Error("Not authenticated");

    const booking: any = {
      trip_id: bookingData.trip_id,
      passenger_id: auth.currentUser.uid,
      passenger_name: bookingData.passenger_name || "Passenger",
      passenger_photo:
        bookingData.passenger_photo || `https://picsum.photos/100/100?seed=${auth.currentUser.uid}`,
      seats_booked: bookingData.seats_booked ?? 1,
      amount_paid: Number(bookingData.amount_paid ?? 0),
      status: BookingStatus.PENDING,
      createdAt: Timestamp.now(),
    };

    const ref = await addDoc(collection(db, BOOKINGS_COL), booking);

    return {
      booking_id: ref.id,
      trip_id: booking.trip_id,
      passenger_id: booking.passenger_id,
      passenger_name: booking.passenger_name,
      passenger_photo: booking.passenger_photo,
      seats_booked: booking.seats_booked,
      amount_paid: booking.amount_paid,
      status: booking.status,
      created_at: booking.createdAt.toDate().toISOString(),
    } as Booking;
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
        passenger_id: data.passenger_id,
        passenger_name: data.passenger_name,
        passenger_photo: data.passenger_photo,
        seats_booked: data.seats_booked,
        amount_paid: data.amount_paid,
        status: data.status,
        created_at: data.createdAt?.toDate?.().toISOString?.() || new Date().toISOString(),
      } as Booking;
    });
  },

  async deleteTrip(tripId: string) {
    if (!db || !auth?.currentUser) throw new Error("Not authenticated");
    await deleteDoc(doc(db, RIDES_COL, tripId));
  },
};
