
import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  query, 
  where,
  arrayUnion, 
  arrayRemove,
  Timestamp,
  orderBy
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { Trip, TripStatus } from '../types';

export const api = {
  async getTrips(): Promise<Trip[]> {
    if (!db) return [];
    try {
      const querySnapshot = await getDocs(query(collection(db, 'rides'), orderBy('createdAt', 'desc')));
      return querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          trip_id: docSnap.id,
          driver_id: data.carOwnerId,
          carOwnerId: data.carOwnerId,
          origin: data.origin,
          destination: data.destination,
          time: data.time,
          bookedBy: data.bookedBy || [],
          driver_name: data.driver_name || 'Verified Owner',
          car_details: data.car_details || 'Toyota Corolla',
          route: `${data.origin} → ${data.destination}`,
          departure_time: data.time,
          seats_available: data.seats_available,
          seats_booked: (data.bookedBy || []).length,
          status: data.status || TripStatus.POSTED,
          earnings: data.earnings || 0,
          created_at: data.createdAt?.toDate().toISOString() || new Date().toISOString()
        };
      });
    } catch (error) {
      console.error('Firestore Error (getTrips):', error);
      return [];
    }
  },

  async postTrip(tripData: any) {
    if (!db || !auth?.currentUser) throw new Error('Not authenticated');
    
    const [origin, destination] = tripData.route.split('→').map((s: string) => s.trim());
    
    const ride = {
      carOwnerId: auth.currentUser.uid,
      bookedBy: [],
      driver_name: tripData.driver_name,
      car_details: tripData.car_details,
      origin: origin || 'Unknown',
      destination: destination || 'Unknown',
      time: tripData.departure_time,
      seats_available: tripData.seats_available,
      status: TripStatus.POSTED,
      earnings: 0,
      createdAt: Timestamp.now()
    };

    try {
      const docRef = await addDoc(collection(db, 'rides'), ride);
      return {
        trip_id: docRef.id,
        driver_id: ride.carOwnerId,
        carOwnerId: ride.carOwnerId,
        origin: ride.origin,
        destination: ride.destination,
        time: ride.time,
        bookedBy: ride.bookedBy,
        driver_name: ride.driver_name,
        car_details: ride.car_details,
        route: `${ride.origin} → ${ride.destination}`,
        departure_time: ride.time,
        seats_available: ride.seats_available,
        seats_booked: 0,
        status: ride.status,
        earnings: ride.earnings,
        created_at: ride.createdAt.toDate().toISOString()
      };
    } catch (error) {
      console.error('Firestore Error (postTrip):', error);
      throw error;
    }
  },

  async bookTrip(tripId: string): Promise<void> {
    if (!db || !auth?.currentUser) throw new Error('Not authenticated');
    try {
      const rideRef = doc(db, 'rides', tripId);
      await updateDoc(rideRef, {
        bookedBy: arrayUnion(auth.currentUser.uid)
      });
    } catch (error) {
      console.error('Firestore Error (bookTrip):', error);
      throw error;
    }
  },

  async cancelBooking(tripId: string): Promise<void> {
    if (!db || !auth?.currentUser) throw new Error('Not authenticated');
    try {
      const rideRef = doc(db, 'rides', tripId);
      await updateDoc(rideRef, {
        bookedBy: arrayRemove(auth.currentUser.uid)
      });
    } catch (error) {
      console.error('Firestore Error (cancelBooking):', error);
      throw error;
    }
  },

  async updateBookingStatus(bookingId: string, status: string) {
    if (!db) return;
    try {
      const bookingRef = doc(db, 'bookings', bookingId);
      await updateDoc(bookingRef, { status });
    } catch (error) {
      console.error('Firestore Error (updateBookingStatus):', error);
      throw error;
    }
  },

  async createBooking(bookingData: any) {
    if (!db || !auth?.currentUser) throw new Error('Not authenticated');
    const booking = {
      trip_id: bookingData.trip_id,
      passenger_id: auth.currentUser.uid,
      passenger_name: bookingData.passenger_name,
      passenger_photo: bookingData.passenger_photo || `https://picsum.photos/100/100?seed=${auth.currentUser.uid}`,
      passenger_rating: 5.0,
      passenger_trips: 0,
      seats_booked: bookingData.seats_booked || 1,
      amount_paid: bookingData.amount_paid,
      status: 'pending',
      createdAt: Timestamp.now()
    };
    const docRef = await addDoc(collection(db, 'bookings'), booking);
    return { 
      ...booking, 
      booking_id: docRef.id,
      created_at: booking.createdAt.toDate().toISOString()
    };
  },

  async getBookingsForTrip(tripId: string) {
    if (!db) return [];
    try {
      const q = query(collection(db, 'bookings'), where('trip_id', '==', tripId));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          booking_id: docSnap.id,
          trip_id: data.trip_id,
          passenger_id: data.passenger_id,
          passenger_name: data.passenger_name,
          passenger_photo: data.passenger_photo,
          passenger_rating: data.passenger_rating,
          passenger_trips: data.passenger_trips,
          seats_booked: data.seats_booked,
          amount_paid: data.amount_paid,
          status: data.status,
          created_at: data.createdAt?.toDate().toISOString() || new Date().toISOString()
        };
      });
    } catch (error) {
      console.error('Firestore Error (getBookingsForTrip):', error);
      return [];
    }
  }
};
