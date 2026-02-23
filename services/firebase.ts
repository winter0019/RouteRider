
import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyA112CbQaI6W4ZwPoTaAm_vqDVMiPdobvQ",
  authDomain: "my-route-rider.firebaseapp.com",
  projectId: "my-route-rider",
  storageBucket: "my-route-rider.firebasestorage.app",
  messagingSenderId: "885105869337",
  appId: "1:885105869337:web:4f3c9020d98e543b9b2088",
  measurementId: "G-7PCLNNVRXZ"
};

// Helper to check if config is valid
export const isFirebaseConfigured = () => {
  return !!(firebaseConfig.apiKey && firebaseConfig.apiKey !== "");
};

const app = isFirebaseConfigured() 
  ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig))
  : null;

export const auth = app ? getAuth(app) : null;
export const analytics = app && typeof window !== 'undefined' ? getAnalytics(app) : null;

// Use initializeFirestore with experimentalForceLongPolling to bypass potential WebSocket issues
export const db = app ? initializeFirestore(app, {
  experimentalForceLongPolling: true,
}) : null;
