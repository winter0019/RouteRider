import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  arrayUnion, 
  arrayRemove,
  Timestamp
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { Trip, TripStatus, User } from '../types';

export const firestoreService = {
  // ----------------- Users -----------------
  async createUserProfile(userId: string, data: any) {
    if (!db) return;
    await setDoc(doc(db, 'users', userId), {
      ...data,
      userId,
      createdAt: Timestamp.now()
    });
  },

  async getUserProfile(userId: string) {
    if (!db) return null;
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  },

  // ----------------- Rides (Trips) -----------------
  async createRide(rideData: {
    origin: string;
    destination: string;
    time: string;
    seats_available: number;
  }) {
    if (!db || !auth?.currentUser) throw new Error('Not authenticated');
    
    const ride = {
      carOwnerId: auth.currentUser.uid,
      bookedBy: [],
      origin: rideData.origin,
      destination: rideData.destination,
      time: rideData.time,
      seats_available: rideData.seats_available,
      status: TripStatus.POSTED,
      createdAt: Timestamp.now()
    };

    const docRef = await addDoc(collection(db, 'rides'), ride);
    return docRef.id;
  },

  async getRides() {
    if (!db) return [];
    const querySnapshot = await getDocs(collection(db, 'rides'));
    return querySnapshot.docs.map(doc => ({
      trip_id: doc.id,
      ...doc.data()
    })) as any[];
  },

  async bookRide(rideId: string) {
    if (!db || !auth?.currentUser) throw new Error('Not authenticated');
    const rideRef = doc(db, 'rides', rideId);
    await updateDoc(rideRef, {
      bookedBy: arrayUnion(auth.currentUser.uid)
    });
  },

  async cancelBooking(rideId: string) {
    if (!db || !auth?.currentUser) throw new Error('Not authenticated');
    const rideRef = doc(db, 'rides', rideId);
    await updateDoc(rideRef, {
      bookedBy: arrayRemove(auth.currentUser.uid)
    });
  },

  async deleteRide(rideId: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'rides', rideId));
  }
};
