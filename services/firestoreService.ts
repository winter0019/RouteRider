import { auth } from './firebase';
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
    return api.postTrip(rideData);
  },

  async getRides() {
    return api.getTrips();
  },

  async bookRide(rideId: string) {
    return api.bookTrip(rideId);
  },

  async cancelBooking(rideId: string) {
    return api.cancelBooking(rideId);
  },

  async deleteRide(rideId: string) {
    return api.deleteTrip(rideId);
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
    return api.submitKYC(data);
  }
};
