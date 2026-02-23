import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import admin from "firebase-admin";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Initialize Firebase Admin
try {
  if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp();
    console.log("Firebase Admin initialized successfully");
  }
} catch (error) {
  console.error("Firebase Admin initialization error:", error);
}

const db = admin.firestore();
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "sk_test_placeholder";

if (PAYSTACK_SECRET === "sk_test_placeholder") {
  console.warn("WARNING: PAYSTACK_SECRET_KEY is not set, using placeholder.");
} else {
  console.log(`PAYSTACK_SECRET_KEY is set (starts with ${PAYSTACK_SECRET.slice(0, 7)}...)`);
}

const WALLETS_COL = "wallets";
const TX_COL = "transactions";
const RIDES_COL = "rides";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  console.log(`[${new Date().toISOString()}] Starting server...`);
  console.log(`[${new Date().toISOString()}] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[${new Date().toISOString()}] Port: ${PORT}`);

  app.use(cors());
  app.use(express.json());

  // Request logging
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
  });

  // --------- Auth middleware (Firebase ID token) ---------
  async function requireFirebaseAuth(req: any, res: any, next: any) {
    try {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (!token) return res.status(401).send("Missing auth token");

      const decoded = await admin.auth().verifyIdToken(token);
      req.uid = decoded.uid;
      next();
    } catch (e) {
      console.error("Auth Error:", e);
      return res.status(401).send("Invalid auth token");
    }
  }

  // --------- Paystack: Initialize Topup ---------
  app.post(["/api/paystack/initialize", "/api/paystack/initialize/"], requireFirebaseAuth, async (req: any, res) => {
    const { amountKobo, email, meta } = req.body || {};
    if (!amountKobo || !email) return res.status(400).send("amountKobo and email required");

    const reference = `rr_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    try {
      await db.collection(TX_COL).doc(reference).set({
        uid: req.uid,
        user_id: req.uid, // compatibility
        type: "topup",
        amount: Number(amountKobo) / 100, // Naira for display/legacy
        amountKobo: Number(amountKobo),
        status: "pending",
        reference,
        description: "Wallet Topup",
        meta: meta || {},
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const psRes = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          amount: String(amountKobo),
          reference,
          metadata: meta || {},
        }),
      });

      const data = await psRes.json();
      if (!data.status) return res.status(400).json(data);

      return res.json({
        authorization_url: data.data.authorization_url,
        reference: data.data.reference,
      });
    } catch (err) {
      console.error("Paystack Init Error:", err);
      return res.status(500).send("Internal Server Error");
    }
  });

  // --------- Paystack: Verify + Credit Wallet ---------
  app.post(["/api/paystack/verify", "/api/paystack/verify/"], requireFirebaseAuth, async (req: any, res) => {
    const { reference } = req.body || {};
    if (!reference) return res.status(400).send("reference required");

    try {
      const psRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      });

      const v = await psRes.json();
      if (!v.status) return res.status(400).json(v);
      if (v.data.status !== "success") return res.status(400).send("Payment not successful");

      const amountKobo = Number(v.data.amount || 0);
      const uid = req.uid;

      await db.runTransaction(async (t) => {
        const txRef = db.collection(TX_COL).doc(reference);
        const txSnap = await t.get(txRef);
        if (txSnap.exists && txSnap.data()?.status === "success") return;

        const walletRef = db.collection(WALLETS_COL).doc(uid);
        const userRef = db.collection("users").doc(uid);
        
        const wSnap = await t.get(walletRef);
        const currentKobo = wSnap.exists ? Number(wSnap.data()?.balanceKobo || 0) : 0;
        
        const newBalanceKobo = currentKobo + amountKobo;
        const newBalanceNaira = newBalanceKobo / 100;

        t.set(walletRef, { 
          balanceKobo: newBalanceKobo, 
          balance: newBalanceNaira,
          updatedAt: admin.firestore.FieldValue.serverTimestamp() 
        }, { merge: true });
        
        t.update(userRef, {
          wallet_balance: newBalanceNaira
        });

        t.set(txRef, { 
          status: "success", 
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(), 
          amountKobo 
        }, { merge: true });
      });

      return res.json({ ok: true, reference });
    } catch (err) {
      console.error("Paystack Verify Error:", err);
      return res.status(500).send("Internal Server Error");
    }
  });

  // --------- Book with Wallet ---------
  app.post(["/api/wallet/book", "/api/wallet/book/"], requireFirebaseAuth, async (req: any, res) => {
    const { tripId } = req.body || {};
    if (!tripId) return res.status(400).send("tripId required");

    const uid = req.uid;

    try {
      await db.runTransaction(async (t) => {
        const rideRef = db.collection(RIDES_COL).doc(tripId);
        const rideSnap = await t.get(rideRef);
        if (!rideSnap.exists) throw new Error("Ride not found");

        const ride = rideSnap.data()!;
        const bookedBy: string[] = Array.isArray(ride.bookedBy) ? ride.bookedBy : [];
        if (bookedBy.includes(uid)) throw new Error("Already booked");

        const seatsAvailable = Number(ride.seats_available || 0);
        const seatsBooked = Number(ride.seats_booked || bookedBy.length || 0);
        if (seatsBooked >= seatsAvailable) throw new Error("Ride is full");

        const priceNaira = Number(ride.price_per_seat || 0);
        const priceKobo = Math.round(priceNaira * 100);
        if (priceKobo <= 0) throw new Error("Invalid price");

        const driverId = String(ride.carOwnerId);
        if (!driverId) throw new Error("Missing driverId");

        const passengerWalletRef = db.collection(WALLETS_COL).doc(uid);
        const driverWalletRef = db.collection(WALLETS_COL).doc(driverId);
        const passengerUserRef = db.collection("users").doc(uid);
        const driverUserRef = db.collection("users").doc(driverId);

        const pSnap = await t.get(passengerWalletRef);
        const pBalKobo = pSnap.exists ? Number(pSnap.data()?.balanceKobo || 0) : 0;
        if (pBalKobo < priceKobo) throw new Error("Insufficient wallet balance");

        // Deduct passenger
        const newPBalKobo = pBalKobo - priceKobo;
        t.set(passengerWalletRef, {
          balanceKobo: newPBalKobo,
          balance: newPBalKobo / 100,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        
        t.update(passengerUserRef, {
          wallet_balance: newPBalKobo / 100
        });

        // Credit driver
        const dSnap = await t.get(driverWalletRef);
        const dBalKobo = dSnap.exists ? Number(dSnap.data()?.balanceKobo || 0) : 0;
        const newDBalKobo = dBalKobo + priceKobo;

        t.set(driverWalletRef, {
          balanceKobo: newDBalKobo,
          balance: newDBalKobo / 100,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        
        t.update(driverUserRef, {
          wallet_balance: newDBalKobo / 100
        });

        // Update ride booking
        t.update(rideRef, {
          bookedBy: admin.firestore.FieldValue.arrayUnion(uid),
          seats_booked: seatsBooked + 1,
        });

        // Create Booking document
        const bookingRef = db.collection("bookings").doc();
        t.set(bookingRef, {
          trip_id: tripId,
          driver_id: driverId,
          passenger_id: uid,
          passenger_name: "Passenger", // ideally fetch from user profile
          seats_booked: 1,
          amount_paid: priceNaira,
          status: "PENDING",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Transaction logs
        const ref = `ride_${tripId}_${Date.now()}_${uid.slice(0, 6)}`;
        t.set(db.collection(TX_COL).doc(ref), {
          uid,
          user_id: uid,
          type: "withdrawal", // payment is a withdrawal from wallet
          amount: priceNaira,
          amountKobo: priceKobo,
          status: "success",
          description: `Payment for Trip to ${ride.destination}`,
          rideId: tripId,
          driverId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        t.set(db.collection(TX_COL).doc(`${ref}_driver`), {
          uid: driverId,
          user_id: driverId,
          type: "deposit", // earning is a deposit to wallet
          amount: priceNaira,
          amountKobo: priceKobo,
          status: "success",
          description: `Earning from Trip to ${ride.destination}`,
          rideId: tripId,
          passengerId: uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return res.json({ ok: true });
    } catch (err: any) {
      console.error("Booking Error:", err);
      return res.status(400).send(err.message || "Booking failed");
    }
  });

  // --------- Withdrawal ---------
  app.post(["/api/wallet/withdraw", "/api/wallet/withdraw/"], requireFirebaseAuth, async (req: any, res) => {
    const { amountKobo } = req.body || {};
    if (!amountKobo) return res.status(400).send("amountKobo required");

    const uid = req.uid;
    const amountNaira = Number(amountKobo) / 100;

    try {
      await db.runTransaction(async (t) => {
        const walletRef = db.collection(WALLETS_COL).doc(uid);
        const userRef = db.collection("users").doc(uid);
        const wSnap = await t.get(walletRef);
        const currentKobo = wSnap.exists ? Number(wSnap.data()?.balanceKobo || 0) : 0;

        if (currentKobo < amountKobo) throw new Error("Insufficient balance");

        const newBalanceKobo = currentKobo - amountKobo;
        const newBalanceNaira = newBalanceKobo / 100;

        t.set(walletRef, {
          balanceKobo: newBalanceKobo,
          balance: newBalanceNaira,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        
        t.update(userRef, {
          wallet_balance: newBalanceNaira
        });

        const ref = `wd_${Date.now()}_${uid.slice(0, 6)}`;
        t.set(db.collection(TX_COL).doc(ref), {
          uid,
          user_id: uid,
          type: "withdrawal",
          amount: amountNaira,
          amountKobo: Number(amountKobo),
          status: "success",
          description: "Bank Withdrawal",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return res.json({ ok: true });
    } catch (err: any) {
      console.error("Withdrawal Error:", err);
      return res.status(400).send(err.message || "Withdrawal failed");
    }
  });

  // API Catch-all (to prevent falling through to SPA for missing API routes)
  app.all(/^\/api\/.*/, (req, res) => {
    res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
