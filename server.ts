import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import admin from "firebase-admin";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

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
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      console.log("Initializing Firebase Admin with explicit credentials...");
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      });
    } else {
      console.log("Initializing Firebase Admin with default credentials...");
      admin.initializeApp();
    }
    console.log("Firebase Admin initialized successfully");
  }
} catch (error) {
  console.error("Firebase Admin initialization error:", error);
}

let db: admin.firestore.Firestore;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "sk_test_placeholder";

const WALLETS_COL = "wallets";
const TX_COL = "transactions";
const RIDES_COL = "rides";
const TRIPS_COL = "trips";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  try {
    db = admin.firestore();
  } catch (err) {
    console.error("Failed to get Firestore instance:", err);
  }

  console.log(`[${new Date().toISOString()}] Starting server...`);
  console.log(`[${new Date().toISOString()}] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[${new Date().toISOString()}] Port: ${PORT}`);

  app.use(cors());

  // Middleware to check if Firebase is initialized
  app.use((req, res, next) => {
    if (!db && req.url.startsWith("/api") && req.url !== "/api/health") {
      return res.status(503).json({ error: "Firebase not initialized. Check server logs." });
    }
    next();
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // --------- Paystack Webhook (Needs Raw Body) ---------
  app.post("/api/paystack/webhook", express.raw({ type: "application/json" }), async (req: any, res) => {
    const sig = req.headers["x-paystack-signature"] as string | undefined;
    const raw = req.body?.toString?.("utf8") ?? "";

    if (!sig) return res.status(401).send("Missing signature");

    const hash = crypto.createHmac("sha512", PAYSTACK_SECRET).update(raw).digest("hex");
    if (hash !== sig) return res.status(401).send("Invalid signature");

    const event = JSON.parse(raw);
    if (event?.event !== "charge.success") return res.sendStatus(200);

    const reference = event?.data?.reference;
    if (!reference) return res.sendStatus(200);

    try {
      const intentSnap = await db.collection("payment_intents").where("reference", "==", reference).limit(1).get();
      if (intentSnap.empty) return res.sendStatus(200);

      const intentDoc = intentSnap.docs[0];
      const intent = intentDoc.data();
      if (intent.status === "success") return res.sendStatus(200);

      await db.runTransaction(async (tx) => {
        tx.update(intentDoc.ref, { 
          status: "success", 
          paidAt: admin.firestore.FieldValue.serverTimestamp() 
        });

        if (intent.type === "topup") {
          const userRef = db.collection("users").doc(intent.userId);
          const walletRef = db.collection(WALLETS_COL).doc(intent.userId);

          tx.update(userRef, { 
            wallet_balance: admin.firestore.FieldValue.increment(intent.amountKobo / 100) 
          });
          tx.set(walletRef, {
            balanceKobo: admin.firestore.FieldValue.increment(intent.amountKobo),
            balance: admin.firestore.FieldValue.increment(intent.amountKobo / 100),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });

          tx.set(db.collection(TX_COL).doc(reference), {
            userId: intent.userId,
            user_id: intent.userId,
            uid: intent.userId,
            type: "topup",
            amount: intent.amountKobo / 100,
            amountKobo: intent.amountKobo,
            status: "success",
            reference,
            description: "Wallet Topup (Paystack)",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        if (intent.type === "booking") {
          const bookingRef = db.collection("bookings").doc(intent.bookingId);
          const bookingSnap = await tx.get(bookingRef);
          if (!bookingSnap.exists) throw new Error("Booking not found");

          const booking = bookingSnap.data()!;
          
          // Create escrow
          tx.set(db.collection("escrows").doc(), {
            bookingId: intent.bookingId,
            amountKobo: intent.amountKobo,
            status: "held",
            source: "paystack",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          tx.update(bookingRef, { status: "escrowed" });

          tx.set(db.collection(TX_COL).doc(`escrow_${intent.bookingId}`), {
            userId: booking.passenger_id || booking.passengerId,
            user_id: booking.passenger_id || booking.passengerId,
            uid: booking.passenger_id || booking.passengerId,
            type: "escrow_hold",
            amount: -intent.amountKobo / 100,
            amountKobo: -intent.amountKobo,
            status: "success",
            reference,
            bookingId: intent.bookingId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      });

      return res.sendStatus(200);
    } catch (err) {
      console.error("Webhook Error:", err);
      return res.status(500).send("Webhook processing failed");
    }
  });

  app.use(express.json());

  // Request logging
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // --------- Auth middleware (Firebase ID token) ---------
  async function requireFirebaseAuth(req: any, res: any, next: any) {
    try {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      
      if (!token) {
        console.warn(`[${new Date().toISOString()}] Auth Failed: Missing token`);
        return res.status(401).json({ error: "Missing auth token" });
      }

      const decoded = await admin.auth().verifyIdToken(token);
      req.uid = decoded.uid;
      req.user = decoded;
      next();
    } catch (e: any) {
      console.error(`[${new Date().toISOString()}] Auth Error:`, e.message);
      if (e.code === 'auth/id-token-expired') {
        return res.status(401).json({ error: "Token expired", code: "EXPIRED" });
      }
      return res.status(401).json({ error: "Invalid auth token", detail: e.message });
    }
  }

  function requireAdmin(req: any, res: any, next: any) {
    if (!req.user?.admin) {
      console.warn(`[${new Date().toISOString()}] Admin Access Denied: UID ${req.uid}`);
      return res.status(403).json({ error: "Admin only" });
    }
    next();
  }

  // --------- Admin APIs ---------
  // Admin: list KYC submissions
  app.get("/api/admin/kyc", requireFirebaseAuth, requireAdmin, async (req, res) => {
    try {
      const snap = await db.collection("kyc_submissions")
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();

      res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: approve/reject KYC
  app.post("/api/admin/kyc/:uid/decision", requireFirebaseAuth, requireAdmin, async (req, res) => {
    const { uid } = req.params;
    const { status } = req.body; // "approved" | "rejected"

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    try {
      await db.collection("kyc_submissions").doc(uid).set({
        status,
        reviewedBy: req.uid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      await db.collection("users").doc(uid).set({
        kycStatus: status
      }, { merge: true });

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --------- Rides ---------
  app.get("/api/rides", async (req, res) => {
    try {
      const ridesSnap = await db.collection(RIDES_COL).orderBy("createdAt", "desc").get();
      const tripsSnap = await db.collection(TRIPS_COL).orderBy("createdAt", "desc").get();

      const rides = ridesSnap.docs.map(d => ({
        id: d.id,
        trip_id: d.id,
        source: "rides",
        ...d.data(),
        created_at: d.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
      }));

      const trips = tripsSnap.docs.map(d => ({
        id: d.id,
        trip_id: d.id,
        source: "trips",
        ...d.data(),
        created_at: d.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
      }));

      const all = [...rides, ...trips].sort((a: any, b: any) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      res.json(all);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/rides", requireFirebaseAuth, async (req: any, res) => {
    try {
      const tripData = req.body;
      const ref = await db.collection(RIDES_COL).add({
        ...tripData,
        carOwnerId: req.uid,
        driver_id: req.uid,
        bookedBy: [],
        seats_booked: 0,
        status: "posted",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      res.json({ id: ref.id, ...tripData });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/rides/:rideId", async (req, res) => {
    try {
      const { rideId } = req.params;
      const { source } = req.query;
      const col = source === "trips" ? TRIPS_COL : RIDES_COL;
      const snap = await db.collection(col).doc(rideId).get();
      if (!snap.exists) return res.status(404).json({ error: "Ride not found" });
      res.json({
        id: snap.id,
        trip_id: snap.id,
        source: source || "rides",
        ...snap.data(),
        created_at: snap.data()?.createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/me", requireFirebaseAuth, (req: any, res) => {
    res.json({ uid: req.uid, user: req.user });
  });

  // --------- User Profile Management ---------
  app.get("/api/users/profile", requireFirebaseAuth, async (req: any, res) => {
    try {
      const snap = await db.collection("users").doc(req.uid).get();
      if (!snap.exists) return res.status(404).json({ error: "Profile not found" });
      res.json(snap.data());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/users/profile", requireFirebaseAuth, async (req: any, res) => {
    try {
      const data = req.body;
      await db.collection("users").doc(req.uid).set({
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --------- Unified Booking Route ---------
  app.post("/api/rides/:rideId/book", requireFirebaseAuth, async (req: any, res) => {
    const { rideId } = req.params;
    const uid = req.uid;

    try {
      await db.runTransaction(async (t) => {
        const rideRef = db.collection(RIDES_COL).doc(rideId);
        const rideSnap = await t.get(rideRef);
        if (!rideSnap.exists) throw new Error("Ride not found");

        const ride = rideSnap.data()!;
        const bookedBy = Array.isArray(ride.bookedBy) ? ride.bookedBy : [];
        if (bookedBy.includes(uid)) return; // Already booked

        const seatsAvailable = Number(ride.seats_available || 0);
        const seatsBooked = Number(ride.seats_booked || 0);

        if (seatsBooked >= seatsAvailable) throw new Error("Ride is full");

        t.update(rideRef, {
          bookedBy: admin.firestore.FieldValue.arrayUnion(uid),
          seats_booked: admin.firestore.FieldValue.increment(1)
        });

        // Create a basic booking record
        const bookingRef = db.collection("bookings").doc();
        t.set(bookingRef, {
          rideId,
          trip_id: rideId,
          passengerId: uid,
          passenger_id: uid,
          status: "pending",
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });

      res.json({ ok: true });
    } catch (err: any) {
      console.error("Booking Error:", err);
      res.status(400).json({ error: err.message });
    }
  });

  // --------- Transactions ---------
  app.get("/api/transactions", requireFirebaseAuth, async (req: any, res) => {
    try {
      const q = db.collection(TX_COL)
        .where("user_id", "==", req.uid)
        .orderBy("createdAt", "desc");
      
      const snap = await q.get();
      const txs = snap.docs.map(d => ({
        transaction_id: d.id,
        ...d.data(),
        created_at: d.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
      }));
      res.json(txs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/transactions", requireFirebaseAuth, async (req: any, res) => {
    try {
      const { type, amount, description } = req.body;
      const tx = {
        user_id: req.uid,
        uid: req.uid,
        type,
        amount: Number(amount),
        description,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      const ref = await db.collection(TX_COL).add(tx);
      
      const userRef = db.collection("users").doc(req.uid);
      await userRef.update({
        wallet_balance: admin.firestore.FieldValue.increment(type === 'deposit' || type === 'commission' ? tx.amount : -tx.amount)
      });

      res.json({ transaction_id: ref.id, ...tx });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --------- Paystack: Initialize Topup ---------
  app.post(["/api/paystack/topup/initialize", "/api/paystack/topup/initialize/"], requireFirebaseAuth, async (req: any, res) => {
    const { amountKobo, email } = req.body || {};
    if (!amountKobo || !email) return res.status(400).send("amountKobo and email required");

    const reference = `topup_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const callback_url = `${req.headers.origin || "http://localhost:3000"}/wallet?reference=${reference}`;

    try {
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
          callback_url,
          metadata: { type: "topup", uid: req.uid },
        }),
      });

      const data = await psRes.json();
      if (!data.status) return res.status(400).json(data);

      await db.collection("payment_intents").add({
        userId: req.uid,
        type: "topup",
        amountKobo: Number(amountKobo),
        status: "pending",
        reference,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.json({
        authorization_url: data.data.authorization_url,
        reference: data.data.reference,
      });
    } catch (err) {
      console.error("Paystack Topup Init Error:", err);
      return res.status(500).send("Internal Server Error");
    }
  });

  // --------- Paystack: Initialize Booking ---------
  app.post(["/api/paystack/booking/initialize", "/api/paystack/booking/initialize/"], requireFirebaseAuth, async (req: any, res) => {
    const { rideId, email } = req.body || {};
    if (!rideId || !email) return res.status(400).send("rideId and email required");

    try {
      const rideRef = db.collection(RIDES_COL).doc(rideId);
      const rideSnap = await rideRef.get();
      if (!rideSnap.exists) return res.status(404).send("Ride not found");

      const ride = rideSnap.data()!;
      const amountNaira = Number(ride.price_per_seat || 0);
      const amountKobo = Math.round(amountNaira * 100);

      if (amountKobo < 100) return res.status(400).send("Invalid ride price");

      const reference = `book_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const callback_url = `${req.headers.origin || "http://localhost:3000"}/wallet?reference=${reference}`;

      // Create booking in pending_payment status
      const bookingRef = db.collection("bookings").doc();
      const commissionRate = 0.1;
      const commission = Math.round(amountKobo * commissionRate);
      const netToDriver = amountKobo - commission;

      await bookingRef.set({
        rideId,
        trip_id: rideId,
        driverId: ride.carOwnerId,
        driver_id: ride.carOwnerId,
        passengerId: req.uid,
        passenger_id: req.uid,
        amountKobo,
        amount_paid: amountNaira,
        commissionKobo: commission,
        netToDriverKobo: netToDriver,
        payMethod: "paystack",
        status: "pending_payment",
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
          callback_url,
          metadata: { type: "booking", bookingId: bookingRef.id, rideId, uid: req.uid },
        }),
      });

      const data = await psRes.json();
      if (!data.status) return res.status(400).json(data);

      await db.collection("payment_intents").add({
        userId: req.uid,
        type: "booking",
        amountKobo,
        status: "pending",
        reference,
        bookingId: bookingRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.json({
        authorization_url: data.data.authorization_url,
        reference: data.data.reference,
        bookingId: bookingRef.id,
      });
    } catch (err) {
      console.error("Paystack Booking Init Error:", err);
      return res.status(500).send("Internal Server Error");
    }
  });

  // --------- Book with Wallet (Escrowed) ---------
  app.post(["/api/bookings/wallet", "/api/bookings/wallet/"], requireFirebaseAuth, async (req: any, res) => {
    const { rideId } = req.body || {};
    if (!rideId) return res.status(400).send("rideId required");

    const uid = req.uid;

    try {
      await db.runTransaction(async (t) => {
        const userRef = db.collection("users").doc(uid);
        const walletRef = db.collection(WALLETS_COL).doc(uid);
        const rideRef = db.collection(RIDES_COL).doc(rideId);

        const [userSnap, walletSnap, rideSnap] = await Promise.all([t.get(userRef), t.get(walletRef), t.get(rideRef)]);
        if (!rideSnap.exists) throw new Error("Ride not found");

        const ride = rideSnap.data()!;
        const amountNaira = Number(ride.price_per_seat || 0);
        const amountKobo = Math.round(amountNaira * 100);

        const currentBalKobo = walletSnap.exists ? Number(walletSnap.data()?.balanceKobo || 0) : 0;
        if (currentBalKobo < amountKobo) throw new Error("Insufficient wallet balance");

        const commissionRate = 0.1;
        const commission = Math.round(amountKobo * commissionRate);
        const netToDriver = amountKobo - commission;

        // Debit passenger
        t.update(userRef, { wallet_balance: admin.firestore.FieldValue.increment(-amountNaira) });
        t.set(walletRef, {
          balanceKobo: admin.firestore.FieldValue.increment(-amountKobo),
          balance: admin.firestore.FieldValue.increment(-amountNaira),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        // Create booking
        const bookingRef = db.collection("bookings").doc();
        t.set(bookingRef, {
          rideId,
          trip_id: rideId,
          driverId: ride.carOwnerId,
          driver_id: ride.carOwnerId,
          passengerId: uid,
          passenger_id: uid,
          amountKobo,
          amount_paid: amountNaira,
          commissionKobo: commission,
          netToDriverKobo: netToDriver,
          payMethod: "wallet",
          status: "escrowed",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Create escrow
        t.set(db.collection("escrows").doc(), {
          bookingId: bookingRef.id,
          amountKobo,
          status: "held",
          source: "wallet",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Transaction logs
        t.set(db.collection(TX_COL).doc(`wallet_debit_${bookingRef.id}`), {
          userId: uid,
          user_id: uid,
          uid,
          type: "wallet_debit",
          amount: -amountNaira,
          amountKobo: -amountKobo,
          status: "success",
          bookingId: bookingRef.id,
          description: `Booking for ride to ${ride.destination}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        t.set(db.collection(TX_COL).doc(`escrow_hold_${bookingRef.id}`), {
          userId: uid,
          user_id: uid,
          uid,
          type: "escrow_hold",
          amount: -amountNaira,
          amountKobo: -amountKobo,
          status: "success",
          bookingId: bookingRef.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        // Update ride seats
        t.update(rideRef, {
          bookedBy: admin.firestore.FieldValue.arrayUnion(uid),
          seats_booked: admin.firestore.FieldValue.increment(1),
        });
      });

      return res.json({ ok: true });
    } catch (err: any) {
      console.error("Wallet Booking Error:", err);
      return res.status(400).send(err.message || "Booking failed");
    }
  });

  // --------- Complete Booking (Release Escrow) ---------
  app.post(["/api/bookings/:bookingId/complete", "/api/bookings/:bookingId/complete/"], requireFirebaseAuth, async (req: any, res) => {
    const { bookingId } = req.params;
    const uid = req.uid;

    try {
      await db.runTransaction(async (tx) => {
        const bookingRef = db.collection("bookings").doc(bookingId);
        const bookingSnap = await tx.get(bookingRef);
        if (!bookingSnap.exists) throw new Error("Booking not found");

        const booking = bookingSnap.data()!;
        if (booking.driverId !== uid && booking.driver_id !== uid) throw new Error("Unauthorized");
        if (booking.status !== "escrowed") throw new Error("Booking not in escrowed state");

        // Find escrow
        const escSnap = await db.collection("escrows").where("bookingId", "==", bookingId).limit(1).get();
        if (escSnap.empty) throw new Error("Escrow record not found");
        const escrowDoc = escSnap.docs[0];
        const escrow = escrowDoc.data();

        if (escrow.status !== "held") throw new Error("Escrow already released or refunded");

        const netToDriverKobo = booking.netToDriverKobo;
        const netToDriverNaira = netToDriverKobo / 100;

        // Credit driver
        const driverRef = db.collection("users").doc(uid);
        const driverWalletRef = db.collection(WALLETS_COL).doc(uid);

        tx.update(driverRef, { wallet_balance: admin.firestore.FieldValue.increment(netToDriverNaira) });
        tx.set(driverWalletRef, {
          balanceKobo: admin.firestore.FieldValue.increment(netToDriverKobo),
          balance: admin.firestore.FieldValue.increment(netToDriverNaira),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        tx.update(bookingRef, { status: "completed", completedAt: admin.firestore.FieldValue.serverTimestamp() });
        tx.update(escrowDoc.ref, { status: "released", releasedAt: admin.firestore.FieldValue.serverTimestamp() });

        tx.set(db.collection(TX_COL).doc(`escrow_release_${bookingId}`), {
          userId: uid,
          user_id: uid,
          uid,
          type: "escrow_release",
          amount: netToDriverNaira,
          amountKobo: netToDriverKobo,
          status: "success",
          bookingId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return res.json({ ok: true });
    } catch (err: any) {
      console.error("Complete Booking Error:", err);
      return res.status(400).send(err.message || "Failed to complete booking");
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
