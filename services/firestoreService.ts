import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  arrayUnion, 
  arrayRemove,
  Timestamp
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { TripStatus } from '../types';
import { api } from './api';

export const firestoreService = {
  // ----------------- Users (Now via Backend) -----------------
  async createUserProfile(userId: string, data: any) {
    return api.updateProfile(data);
  },

  async getUserProfile(userId: string) {
    return api.getProfile(userId);
  },

  async updateUserProfile(userId: string, data: any) {
    return api.updateProfile(data);
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
  },

  // ----------------- KYC -----------------
  async submitKYC(data: {
    role: 'driver' | 'passenger';
    documentType: string;
    idImagePath: string;
    selfiePath: string;
    extractedName: string;
    aiDecision: string;
    aiScore: number;
    aiNotes: string;
  }) {
    if (!db || !auth?.currentUser) throw new Error('Not authenticated');
    
    const submission = {
      ...data,
      uid: auth.currentUser.uid,
      status: 'submitted',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    const docRef = doc(db, 'kyc_submissions', auth.currentUser.uid);
    // Use setDoc via api or directly if rules allow. 
    // Actually, the rules I set earlier allow users to create/update their own kyc_submissions.
    // But I should use the backend for consistency if possible, or just direct firestore.
    // Let's use direct firestore as per the rules I wrote.
    const { setDoc } = await import('firebase/firestore');
    await setDoc(docRef, submission);
    
    // Also update user's kycStatus
    await api.updateProfile({ kycStatus: 'submitted' });
    
    return auth.currentUser.uid;
  }
};
