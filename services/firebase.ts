import { initializeApp, getApp, getApps } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
} from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyA112CbQaI6W4ZwPoTaAm_vqDVMiPdobvQ",
  authDomain: "my-route-rider.firebaseapp.com",
  projectId: "my-route-rider",
  storageBucket: "my-route-rider.firebasestorage.app",
  messagingSenderId: "885105869337",
  appId: "1:885105869337:web:4f3c9020d98e543b9b2088",
  measurementId: "G-7PCLNNVRXZ",
};

// Helper to check if config is valid
export const isFirebaseConfigured = () => {
  return !!(firebaseConfig.apiKey && firebaseConfig.apiKey !== "");
};

const app = isFirebaseConfigured()
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

// Auth
export const auth = app ? getAuth(app) : null;

// Keep user logged in (permanent dashboard)
// If browser blocks storage, fall back safely
if (auth) {
  setPersistence(auth, browserLocalPersistence).catch(() => {
    setPersistence(auth, inMemoryPersistence).catch(() => {});
  });
}

// Analytics (safe init)
export const analytics =
  app && typeof window !== "undefined"
    ? // Avoid crashing on unsupported environments (Safari private mode etc.)
      // NOTE: this is async but we keep a "best effort" reference as null initially.
      null
    : null;

// If you actually use analytics, call this helper once in your app bootstrap.
export async function initAnalytics() {
  if (!app || typeof window === "undefined") return null;
  const ok = await isSupported().catch(() => false);
  if (!ok) return null;
  return getAnalytics(app);
}

// Firestore
export const db = app
  ? initializeFirestore(app, {
      experimentalForceLongPolling: true,
      // optional but helps in some networks:
      useFetchStreams: false as any,
    })
  : null;
