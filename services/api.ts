
import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  query, 
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
    console.log('Update booking status not implemented for list-based bookings');
  }
};
