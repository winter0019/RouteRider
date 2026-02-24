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

process.on("uncaughtException", (err) => console.error("Uncaught Exception:", err));
process.on("unhandledRejection", (reason, promise) =>
  console.error("Unhandled Rejection at:", promise, "reason:", reason)
);

// Initialize Firebase Admin
try {
  if (!admin.apps || admin.apps.length === 0) {
    if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
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
const BOOKINGS_COL = "bookings";
const ESCROWS_COL = "escrows";
const USERS_COL = "users";

const ADMIN_BOOTSTRAP_KEY = process.env.ADMIN_BOOTSTRAP_KEY || "";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  try {
    db = admin.firestore();
  } catch (err) {
    console.error("Failed to get Firestore instance:", err);
  }

  console.log(`[${new Date().toISOString()}] Starting server...`);
  console.log(
    `[${new Date().toISOString()}] Environment: ${process.env.NODE_ENV || "development"}`
  );
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
  app.post(
    "/api/paystack/webhook",
    express.raw({ type: "application/json" }),
    async (req: any, res) => {
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
        const intentSnap = await db
          .collection("payment_intents")
          .where("reference", "==", reference)
          .limit(1)
          .get();
        if (intentSnap.empty) return res.sendStatus(200);

        const intentDoc = intentSnap.docs[0];
        const intent = intentDoc.data();
        if (intent.status === "success") return res.sendStatus(200);

        await db.runTransaction(async (tx) => {
          tx.update(intentDoc.ref, {
            status: "success",
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // TOPUP
          if (intent.type === "topup") {
            const userRef = db.collection(USERS_COL).doc(intent.userId);
            const walletRef = db.collection(WALLETS_COL).doc(intent.userId);

            tx.set(
              userRef,
              {
                wallet_balance: admin.firestore.FieldValue.increment(intent.amountKobo / 100),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );

            tx.set(
              walletRef,
              {
                uid: intent.userId,
                balanceKobo: admin.firestore.FieldValue.increment(intent.amountKobo),
                balance: admin.firestore.FieldValue.increment(intent.amountKobo / 100),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );

            tx.set(db.collection(TX_COL).doc(reference), {
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

          // BOOKING (Paystack) -> escrow
          if (intent.type === "booking") {
            const bookingRef = db.collection(BOOKINGS_COL).doc(intent.bookingId);
            const bookingSnap = await tx.get(bookingRef);
            if (!bookingSnap.exists) throw new Error("Booking not found");

            const booking: any = bookingSnap.data();

            // ✅ IMPORTANT FIX: escrow doc id == bookingId, include driver_id/trip_id
            const escrowRef = db.collection(ESCROWS_COL).doc(intent.bookingId);
            tx.set(
              escrowRef,
              {
                bookingId: intent.bookingId,
                trip_id: booking.trip_id || booking.rideId,
                driver_id: booking.driver_id || booking.driverId,
                passenger_id: booking.passenger_id || booking.passengerId,
                amountKobo: intent.amountKobo,
                status: "held",
                source: "paystack",
                reference,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );

            tx.update(bookingRef, {
              status: "escrowed",
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            tx.set(db.collection(TX_COL).doc(`escrow_hold_${intent.bookingId}`), {
              user_id: booking.passenger_id || booking.passengerId,
              uid: booking.passenger_id || booking.passengerId,
              type: "escrow_hold",
              amount: -(intent.amountKobo / 100),
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
    }
  );

  app.use(express.json({ limit: "10mb" }));

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

      if (!token) return res.status(401).json({ error: "Missing auth token" });

      const decoded = await admin.auth().verifyIdToken(token);
      req.uid = decoded.uid;
      req.user = decoded;
      next();
    } catch (e: any) {
      return res.status(401).json({ error: "Invalid auth token", detail: e.message });
    }
  }

  function requireAdmin(req: any, res: any, next: any) {
    if (!req.user?.admin) return res.status(403).json({ error: "Admin only" });
    next();
  }

  // ==============================
  // Admin Claim Management
  // ==============================
  app.post("/api/admin/bootstrap", async (req: any, res) => {
    try {
      const { uid, key } = req.body || {};
      if (!uid || !key) return res.status(400).json({ error: "uid and key required" });

      if (!ADMIN_BOOTSTRAP_KEY || key !== ADMIN_BOOTSTRAP_KEY) {
        return res.status(403).json({ error: "Invalid bootstrap key" });
      }

      await admin.auth().setCustomUserClaims(uid, { admin: true });

      await db.collection(USERS_COL).doc(uid).set(
        { role: "admin", isAdmin: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );

      return res.json({ ok: true, message: `Admin claim granted to ${uid}` });
    } catch (err: any) {
      console.error("Bootstrap admin error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/users/:uid/grant", requireFirebaseAuth, requireAdmin, async (req: any, res) => {
    const targetUid = req.params.uid;
    const userRecord = await admin.auth().getUser(targetUid);
    const currentClaims = (userRecord.customClaims || {}) as Record<string, any>;
    await admin.auth().setCustomUserClaims(targetUid, { ...currentClaims, admin: true });

    await db.collection(USERS_COL).doc(targetUid).set(
      { role: "admin", isAdmin: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    res.json({ ok: true });
  });

  app.post("/api/admin/users/:uid/revoke", requireFirebaseAuth, requireAdmin, async (req: any, res) => {
    const targetUid = req.params.uid;
    const userRecord = await admin.auth().getUser(targetUid);
    const currentClaims = (userRecord.customClaims || {}) as Record<string, any>;
    delete currentClaims.admin;
    await admin.auth().setCustomUserClaims(targetUid, currentClaims);

    await db.collection(USERS_COL).doc(targetUid).set(
      { role: "user", isAdmin: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    res.json({ ok: true });
  });

  // --------- Admin APIs ---------
  app.get("/api/admin/kyc", requireFirebaseAuth, requireAdmin, async (req, res) => {
    const snap = await db.collection("kyc_submissions").limit(100).get();
    const submissions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    submissions.sort((a: any, b: any) => {
      const dateA = a.createdAt?.toDate?.()?.getTime() || 0;
      const dateB = b.createdAt?.toDate?.()?.getTime() || 0;
      return dateB - dateA;
    });
    res.json(submissions);
  });

  app.post("/api/admin/kyc/:uid/decision", requireFirebaseAuth, requireAdmin, async (req, res) => {
    const { uid } = req.params;
    const { status } = req.body;
    if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Invalid status" });

    await db.collection("kyc_submissions").doc(uid).set(
      { status, reviewedBy: req.uid, reviewedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    await db.collection(USERS_COL).doc(uid).set({ kycStatus: status }, { merge: true });
    res.json({ ok: true });
  });

  // --------- Rides ---------
  app.get("/api/rides", async (req, res) => {
    const ridesSnap = await db.collection(RIDES_COL).get();
    const tripsSnap = await db.collection(TRIPS_COL).get();

    const rides = ridesSnap.docs.map((d) => ({
      id: d.id,
      trip_id: d.id,
      source: "rides",
      ...d.data(),
      created_at: d.data().createdAt?.toDate?.()?.toISOString() || d.data().created_at || new Date().toISOString(),
    }));

    const trips = tripsSnap.docs.map((d) => ({
      id: d.id,
      trip_id: d.id,
      source: "trips",
      ...d.data(),
      created_at: d.data().createdAt?.toDate?.()?.toISOString() || d.data().created_at || new Date().toISOString(),
    }));

    const all = [...rides, ...trips].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json(all);
  });

  app.post("/api/rides", requireFirebaseAuth, async (req: any, res) => {
    const tripData = req.body;
    const ref = await db.collection(RIDES_COL).add({
      ...tripData,
      carOwnerId: req.uid,
      driver_id: req.uid,
      bookedBy: [],
      seats_booked: 0,
      status: "posted",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ id: ref.id, ...tripData });
  });

  app.get("/api/rides/:rideId", async (req, res) => {
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
      created_at: snap.data()?.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    });
  });

  app.get("/api/me", requireFirebaseAuth, (req: any, res) => {
    res.json({ uid: req.uid, user: req.user });
  });

  // --------- Profiles ---------
  app.get("/api/users/profile", requireFirebaseAuth, async (req: any, res) => {
    const snap = await db.collection(USERS_COL).doc(req.uid).get();
    if (!snap.exists) return res.status(404).json({ error: "Profile not found" });
    res.json(snap.data());
  });

  app.post("/api/users/profile", requireFirebaseAuth, async (req: any, res) => {
    const data = req.body;
    await db.collection(USERS_COL).doc(req.uid).set(
      { ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    res.json({ ok: true });
  });

  // --------- Wallet ---------
  app.get("/api/wallet", requireFirebaseAuth, async (req: any, res) => {
    const snap = await db.collection(WALLETS_COL).doc(req.uid).get();
    if (!snap.exists) return res.json({ balance: 0, balanceKobo: 0 });
    res.json(snap.data());
  });

  // ✅ NEW: Driver escrow summary
  app.get("/api/escrows/me", requireFirebaseAuth, async (req: any, res) => {
    try {
      const snap = await db
        .collection(ESCROWS_COL)
        .where("driver_id", "==", req.uid)
        .where("status", "==", "held")
        .get();

      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const totalKobo = items.reduce((sum, e: any) => sum + Number(e.amountKobo || 0), 0);

      res.json({
        totalKobo,
        totalNaira: totalKobo / 100,
        items,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --------- KYC Submit ---------
  app.post("/api/kyc/submit", requireFirebaseAuth, async (req: any, res) => {
    const data = req.body;
    const submission = {
      ...data,
      uid: req.uid,
      status: "submitted",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("kyc_submissions").doc(req.uid).set(submission);

    await db.collection(USERS_COL).doc(req.uid).set({ kycStatus: "submitted" }, { merge: true });

    res.json({ ok: true });
  });

  // --------- Bookings ---------
  app.get("/api/bookings/trip/:tripId", requireFirebaseAuth, async (req, res) => {
    const { tripId } = req.params;
    const snap = await db.collection(BOOKINGS_COL).where("trip_id", "==", tripId).get();
    res.json(snap.docs.map((d) => ({ booking_id: d.id, ...d.data() })));
  });

  app.get("/api/bookings/user", requireFirebaseAuth, async (req: any, res) => {
    const snap = await db.collection(BOOKINGS_COL).where("passenger_id", "==", req.uid).get();
    res.json(snap.docs.map((d) => ({ booking_id: d.id, ...d.data() })));
  });

  // ✅ NEW: Driver bookings (this is what your driver dashboard needs)
  app.get("/api/bookings/driver", requireFirebaseAuth, async (req: any, res) => {
    const snap = await db.collection(BOOKINGS_COL).where("driver_id", "==", req.uid).get();
    res.json(snap.docs.map((d) => ({ booking_id: d.id, ...d.data() })));
  });

  app.post("/api/bookings/:bookingId/status", requireFirebaseAuth, async (req: any, res) => {
    const { bookingId } = req.params;
    const { status } = req.body;
    await db.collection(BOOKINGS_COL).doc(bookingId).update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ ok: true });
  });

  // --------- Ride book (non-payment) ---------
  app.post("/api/rides/:rideId/book", requireFirebaseAuth, async (req: any, res) => {
    const { rideId } = req.params;
    const uid = req.uid;

    try {
      await db.runTransaction(async (t) => {
        const rideRef = db.collection(RIDES_COL).doc(rideId);
        const rideSnap = await t.get(rideRef);
        if (!rideSnap.exists) throw new Error("Ride not found");

        const ride: any = rideSnap.data();
        const bookedBy = Array.isArray(ride.bookedBy) ? ride.bookedBy : [];
        if (bookedBy.includes(uid)) return;

        const seatsAvailable = Number(ride.seats_available || 0);
        const seatsBooked = Number(ride.seats_booked || 0);
        if (seatsBooked >= seatsAvailable) throw new Error("Ride is full");

        t.update(rideRef, {
          bookedBy: admin.firestore.FieldValue.arrayUnion(uid),
          seats_booked: admin.firestore.FieldValue.increment(1),
        });

        // ✅ FIX: ensure booking has driver_id so driver can see it
        const bookingRef = db.collection(BOOKINGS_COL).doc();
        t.set(bookingRef, {
          rideId,
          trip_id: rideId,
          passenger_id: uid,
          driver_id: ride.carOwnerId || ride.driver_id,
          status: "pending",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --------- Book with Wallet (Escrowed) ---------
  app.post("/api/bookings/wallet", requireFirebaseAuth, async (req: any, res) => {
    const { rideId } = req.body || {};
    if (!rideId) return res.status(400).send("rideId required");

    const uid = req.uid;

    try {
      await db.runTransaction(async (t) => {
        const walletRef = db.collection(WALLETS_COL).doc(uid);
        const rideRef = db.collection(RIDES_COL).doc(rideId);

        const [walletSnap, rideSnap] = await Promise.all([t.get(walletRef), t.get(rideRef)]);
        if (!rideSnap.exists) throw new Error("Ride not found");

        const ride: any = rideSnap.data();
        const amountNaira = Number(ride.price_per_seat || 0);
        const amountKobo = Math.round(amountNaira * 100);

        const currentBalKobo = walletSnap.exists ? Number(walletSnap.data()?.balanceKobo || 0) : 0;
        if (currentBalKobo < amountKobo) throw new Error("Insufficient wallet balance");

        // seat check
        const seatsAvailable = Number(ride.seats_available || 0);
        const seatsBooked = Number(ride.seats_booked || 0);
        if (seatsBooked >= seatsAvailable) throw new Error("Ride is full");

        const commissionRate = 0.1;
        const commission = Math.round(amountKobo * commissionRate);
        const netToDriver = amountKobo - commission;

        // Debit passenger wallet
        t.set(
          walletRef,
          {
            uid,
            balanceKobo: admin.firestore.FieldValue.increment(-amountKobo),
            balance: admin.firestore.FieldValue.increment(-amountNaira),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        // Update ride seats
        t.update(rideRef, {
          bookedBy: admin.firestore.FieldValue.arrayUnion(uid),
          seats_booked: admin.firestore.FieldValue.increment(1),
        });

        // Create booking
        const bookingRef = db.collection(BOOKINGS_COL).doc();
        const bookingId = bookingRef.id;

        t.set(bookingRef, {
          rideId,
          trip_id: rideId,
          driver_id: ride.carOwnerId,
          passenger_id: uid,
          amountKobo,
          amount_paid: amountNaira,
          commissionKobo: commission,
          netToDriverKobo: netToDriver,
          payMethod: "wallet",
          status: "escrowed",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // ✅ IMPORTANT FIX: escrow doc id == bookingId and include driver_id/trip_id
        t.set(db.collection(ESCROWS_COL).doc(bookingId), {
          bookingId,
          trip_id: rideId,
          driver_id: ride.carOwnerId,
          passenger_id: uid,
          amountKobo,
          status: "held",
          source: "wallet",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Transaction logs
        t.set(db.collection(TX_COL).doc(`wallet_debit_${bookingId}`), {
          user_id: uid,
          uid,
          type: "wallet_debit",
          amount: -amountNaira,
          amountKobo: -amountKobo,
          status: "success",
          bookingId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        t.set(db.collection(TX_COL).doc(`escrow_hold_${bookingId}`), {
          user_id: uid,
          uid,
          type: "escrow_hold",
          amount: -amountNaira,
          amountKobo: -amountKobo,
          status: "success",
          bookingId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Booking failed" });
    }
  });

  // --------- Complete Booking (Release Escrow) ---------
  app.post("/api/bookings/:bookingId/complete", requireFirebaseAuth, async (req: any, res) => {
    const { bookingId } = req.params;
    const uid = req.uid;

    try {
      await db.runTransaction(async (tx) => {
        const bookingRef = db.collection(BOOKINGS_COL).doc(bookingId);
        const bookingSnap = await tx.get(bookingRef);
        if (!bookingSnap.exists) throw new Error("Booking not found");

        const booking: any = bookingSnap.data();
        if (booking.driver_id !== uid) throw new Error("Unauthorized");
        if (!["escrowed", "accepted"].includes(booking.status)) throw new Error("Booking not in escrowed state");

        // ✅ IMPORTANT FIX: escrow doc id == bookingId
        const escrowRef = db.collection(ESCROWS_COL).doc(bookingId);
        const escrowSnap = await tx.get(escrowRef);
        if (!escrowSnap.exists) throw new Error("Escrow record not found");

        const escrow: any = escrowSnap.data();
        if (escrow.status !== "held") throw new Error("Escrow already released/refunded");

        const netToDriverKobo = Number(booking.netToDriverKobo || booking.amountKobo || 0);
        const netToDriverNaira = netToDriverKobo / 100;

        // Credit driver wallet
        const driverWalletRef = db.collection(WALLETS_COL).doc(uid);
        tx.set(
          driverWalletRef,
          {
            uid,
            balanceKobo: admin.firestore.FieldValue.increment(netToDriverKobo),
            balance: admin.firestore.FieldValue.increment(netToDriverNaira),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        tx.update(bookingRef, {
          status: "completed",
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        tx.update(escrowRef, {
          status: "released",
          releasedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        tx.set(db.collection(TX_COL).doc(`escrow_release_${bookingId}`), {
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

      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Failed to complete booking" });
    }
  });

  // --------- Paystack Initialize Topup ---------
  app.post("/api/paystack/topup/initialize", requireFirebaseAuth, async (req: any, res) => {
    const { amountKobo, email } = req.body || {};
    if (!amountKobo || !email) return res.status(400).send("amountKobo and email required");

    const reference = `topup_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const callback_url = `${req.headers.origin || "http://localhost:3000"}/wallet?reference=${reference}`;

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

    res.json({ authorization_url: data.data.authorization_url, reference: data.data.reference });
  });

  // --------- Transactions ---------
  app.get("/api/transactions", requireFirebaseAuth, async (req: any, res) => {
    const snap = await db.collection(TX_COL).where("user_id", "==", req.uid).get();
    const txs = snap.docs.map((d) => ({ transaction_id: d.id, ...d.data() }));
    res.json(txs);
  });

  // API Catch-all
  app.all(/^\/api\/.*/, (req, res) => {
    res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
  });

  // Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Global Error:", err);
    if (res.headersSent) return next(err);

    if (req.url.startsWith("/api")) {
      res.status(500).json({ error: "Internal Server Error", message: err.message, path: req.url });
    } else {
      next(err);
    }
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
    app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}

startServer();
