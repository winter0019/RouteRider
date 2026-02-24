// server.ts
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
const COMMISSION_RATE = 0.1;

function computeNetToDriverKobo(params: {
  booking: any;
  escrow: any;
}) {
  const booking = params.booking || {};
  const escrow = params.escrow || {};

  const amountKobo =
    Number(booking.amountKobo || 0) ||
    Number(escrow.amountKobo || 0);

  // If netToDriverKobo already exists, use it
  const existingNet = Number(booking.netToDriverKobo || 0);
  if (existingNet > 0) return existingNet;

  // Otherwise compute net from amountKobo
  const commission = Math.round(amountKobo * COMMISSION_RATE);
  const net = Math.max(0, amountKobo - commission);

  return net;
}

// -----------------------------
// Firebase Admin init
// -----------------------------
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
const ADMIN_BOOTSTRAP_KEY = process.env.ADMIN_BOOTSTRAP_KEY || "";

// -----------------------------
// Collections
// -----------------------------
const WALLETS_COL = "wallets";
const TX_COL = "transactions";
const RIDES_COL = "rides";
const TRIPS_COL = "trips";
const BOOKINGS_COL = "bookings";
const ESCROWS_COL = "escrows";
const USERS_COL = "users";
const PAYMENT_INTENTS_COL = "payment_intents";
const KYC_COL = "kyc_submissions";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  try {
    db = admin.firestore();
  } catch (err) {
    console.error("Failed to get Firestore instance:", err);
  }

  console.log(`[${new Date().toISOString()}] Starting server...`);
  console.log(`[${new Date().toISOString()}] Environment: ${process.env.NODE_ENV || "development"}`);
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

  // ------------------------------------------------------
  // Paystack Webhook (RAW BODY ONLY)
  // ------------------------------------------------------
  app.post("/api/paystack/webhook", express.raw({ type: "application/json" }), async (req: any, res) => {
    const sig = req.headers["x-paystack-signature"] as string | undefined;
    const raw = req.body?.toString?.("utf8") ?? "";

    if (!sig) return res.status(401).send("Missing signature");

    const hash = crypto.createHmac("sha512", PAYSTACK_SECRET).update(raw).digest("hex");
    if (hash !== sig) return res.status(401).send("Invalid signature");

    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      return res.status(400).send("Invalid JSON");
    }

    if (event?.event !== "charge.success") return res.sendStatus(200);

    const reference = event?.data?.reference;
    if (!reference) return res.sendStatus(200);

    try {
      const intentSnap = await db
        .collection(PAYMENT_INTENTS_COL)
        .where("reference", "==", reference)
        .limit(1)
        .get();

      if (intentSnap.empty) return res.sendStatus(200);

      const intentDoc = intentSnap.docs[0];
      const intent: any = intentDoc.data();
      if (intent.status === "success") return res.sendStatus(200);

      await db.runTransaction(async (tx) => {
        // mark intent success
        tx.update(intentDoc.ref, {
          status: "success",
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // -----------------
        // TOPUP
        // -----------------
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

        // -----------------
        // BOOKING (PAYSTACK) -> escrow + UPDATE SEATS (FIXES DRIVER DASHBOARD)
        // -----------------
        if (intent.type === "booking") {
          const bookingRef = db.collection(BOOKINGS_COL).doc(intent.bookingId);
          const bookingSnap = await tx.get(bookingRef);
          if (!bookingSnap.exists) throw new Error("Booking not found");

          const booking: any = bookingSnap.data();
          const tripId = booking.trip_id || booking.rideId;
          const driverId = booking.driver_id || booking.driverId;
          const passengerId = booking.passenger_id || booking.passengerId;

          // 1) Create escrow (doc id = bookingId)
          const escrowRef = db.collection(ESCROWS_COL).doc(intent.bookingId);
          tx.set(
            escrowRef,
            {
              bookingId: intent.bookingId,
              trip_id: tripId,
              driver_id: driverId,
              passenger_id: passengerId,
              amountKobo: intent.amountKobo,
              status: "held",
              source: "paystack",
              reference,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          // 2) Mark booking escrowed/paid
          tx.update(bookingRef, {
            status: "escrowed",
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // 3) IMPORTANT: update ride seats + bookedBy so driver card updates
          if (tripId) {
            const rideRef = db.collection(RIDES_COL).doc(tripId);
            const rideSnap = await tx.get(rideRef);
            if (rideSnap.exists) {
              tx.update(rideRef, {
                bookedBy: admin.firestore.FieldValue.arrayUnion(passengerId),
                seats_booked: admin.firestore.FieldValue.increment(1),
              });
            }
          }

          // 4) passenger transaction log
          tx.set(db.collection(TX_COL).doc(`escrow_hold_${intent.bookingId}`), {
            user_id: passengerId,
            uid: passengerId,
            type: "escrow_hold",
            amount: -(intent.amountKobo / 100),
            amountKobo: -intent.amountKobo,
            status: "success",
            reference,
            bookingId: intent.bookingId,
            trip_id: tripId,
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

  // JSON body parser (after webhook)
  app.use(express.json({ limit: "10mb" }));

  // Request logging
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // ------------------------------------------------------
  // Auth middleware (Firebase ID token)
  // ------------------------------------------------------
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

  // ------------------------------------------------------
  // Admin claim bootstrap / grant / revoke
  // ------------------------------------------------------
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
    try {
      const targetUid = req.params.uid;
      const userRecord = await admin.auth().getUser(targetUid);
      const currentClaims = (userRecord.customClaims || {}) as Record<string, any>;
      await admin.auth().setCustomUserClaims(targetUid, { ...currentClaims, admin: true });

      await db.collection(USERS_COL).doc(targetUid).set(
        { role: "admin", isAdmin: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );

      res.json({ ok: true });
    } catch (err: any) {
      console.error("Grant admin error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/users/:uid/revoke", requireFirebaseAuth, requireAdmin, async (req: any, res) => {
    try {
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
    } catch (err: any) {
      console.error("Revoke admin error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ------------------------------------------------------
  // Admin KYC APIs
  // ------------------------------------------------------
  app.get("/api/admin/kyc", requireFirebaseAuth, requireAdmin, async (_req, res) => {
    try {
      const snap = await db.collection(KYC_COL).limit(100).get();
      const submissions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      submissions.sort((a: any, b: any) => {
        const dateA = a.createdAt?.toDate?.()?.getTime() || 0;
        const dateB = b.createdAt?.toDate?.()?.getTime() || 0;
        return dateB - dateA;
      });

      res.json(submissions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/kyc/:uid/decision", requireFirebaseAuth, requireAdmin, async (req, res) => {
    try {
      const { uid } = req.params;
      const { status } = req.body;

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      await db.collection(KYC_COL).doc(uid).set(
        { status, reviewedBy: req.uid, reviewedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );

      await db.collection(USERS_COL).doc(uid).set({ kycStatus: status }, { merge: true });

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ------------------------------------------------------
  // Rides / Trips
  // ------------------------------------------------------
  app.get("/api/rides", async (_req, res) => {
    try {
      const ridesSnap = await db.collection(RIDES_COL).get();
      const tripsSnap = await db.collection(TRIPS_COL).get();

      const rides = ridesSnap.docs.map((d) => ({
        id: d.id,
        trip_id: d.id,
        source: "rides",
        ...d.data(),
        created_at:
          d.data().createdAt?.toDate?.()?.toISOString() ||
          d.data().created_at ||
          new Date().toISOString(),
      }));

      const trips = tripsSnap.docs.map((d) => ({
        id: d.id,
        trip_id: d.id,
        source: "trips",
        ...d.data(),
        created_at:
          d.data().createdAt?.toDate?.()?.toISOString() ||
          d.data().created_at ||
          new Date().toISOString(),
      }));

      const all = [...rides, ...trips].sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

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
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.json({ id: ref.id, ...tripData });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/rides/:rideId", async (req, res) => {
    try {
      const { rideId } = req.params;
      const { source } = req.query as any;
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
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/rides/:rideId/status", requireFirebaseAuth, async (req: any, res) => {
    try {
      const { rideId } = req.params;
      const { status, source } = req.body || {};
      const col = source === "trips" ? TRIPS_COL : RIDES_COL;

      await db.collection(col).doc(rideId).set(
        { status, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/rides/:rideId/cancel", requireFirebaseAuth, async (req: any, res) => {
    const { rideId } = req.params;
    const { source } = req.body || {};
    const uid = req.uid;

    try {
      const col = source === "trips" ? TRIPS_COL : RIDES_COL;
      const rideRef = db.collection(col).doc(rideId);

      await db.runTransaction(async (t) => {
        const snap = await t.get(rideRef);
        if (!snap.exists) throw new Error("Ride not found");

        const data: any = snap.data();
        const bookedBy = Array.isArray(data.bookedBy) ? data.bookedBy : [];
        if (!bookedBy.includes(uid)) return;

        const currentBooked = Number(data.seats_booked || 0);

        t.update(rideRef, {
          bookedBy: admin.firestore.FieldValue.arrayRemove(uid),
          seats_booked: admin.firestore.FieldValue.increment(currentBooked > 0 ? -1 : 0),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/rides/:rideId", requireFirebaseAuth, async (req: any, res) => {
    try {
      const { rideId } = req.params;
      const { source } = req.query as any;
      const col = source === "trips" ? TRIPS_COL : RIDES_COL;

      const snap = await db.collection(col).doc(rideId).get();
      if (!snap.exists) return res.status(404).json({ error: "Ride not found" });

      const data: any = snap.data();
      if (data.carOwnerId !== req.uid && data.driver_id !== req.uid) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      await db.collection(col).doc(rideId).delete();
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ------------------------------------------------------
  // Me / Profile / KYC
  // ------------------------------------------------------
  app.get("/api/me", requireFirebaseAuth, (req: any, res) => {
    res.json({ uid: req.uid, user: req.user });
  });

  app.get("/api/users/profile", requireFirebaseAuth, async (req: any, res) => {
    try {
      const snap = await db.collection(USERS_COL).doc(req.uid).get();
      if (!snap.exists) return res.status(404).json({ error: "Profile not found" });
      res.json(snap.data());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/users/profile", requireFirebaseAuth, async (req: any, res) => {
    try {
      const data = req.body;
      await db.collection(USERS_COL).doc(req.uid).set(
        { ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kyc/submit", requireFirebaseAuth, async (req: any, res) => {
    try {
      const data = req.body;
      const submission = {
        ...data,
        uid: req.uid,
        status: "submitted",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await db.collection(KYC_COL).doc(req.uid).set(submission);

      await db.collection(USERS_COL).doc(req.uid).set({ kycStatus: "submitted" }, { merge: true });

      res.json({ ok: true });
    } catch (err: any) {
      console.error("KYC Submit Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ------------------------------------------------------
  // Wallet
  // ------------------------------------------------------
  app.get("/api/wallet", requireFirebaseAuth, async (req: any, res) => {
  try {
    const uid = req.uid;

    const walletSnap = await db.collection(WALLETS_COL).doc(uid).get();
    const userSnap = await db.collection(USERS_COL).doc(uid).get();

    const walletData: any = walletSnap.exists ? walletSnap.data() : {};
    const userData: any = userSnap.exists ? userSnap.data() : {};

    // Prefer wallet.balanceKobo, fallback to wallet.balance, fallback to users.wallet_balance
    const balanceKobo =
      typeof walletData.balanceKobo === "number"
        ? walletData.balanceKobo
        : typeof walletData.balance === "number"
        ? Math.round(walletData.balance * 100)
        : typeof userData.wallet_balance === "number"
        ? Math.round(userData.wallet_balance * 100)
        : 0;

    const balance =
      typeof walletData.balance === "number" ? walletData.balance : balanceKobo / 100;

    return res.json({
      uid,
      balance,                 // ✅ always present
      balanceKobo,             // ✅ always present
      wallet_balance: balance, // ✅ backward compatible for old UI
      updatedAt: walletData.updatedAt || userData.updatedAt || null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

  // Driver escrow summary (what driver is holding)
  app.get("/api/escrows/me", requireFirebaseAuth, async (req: any, res) => {
    try {
      const snap = await db
        .collection(ESCROWS_COL)
        .where("driver_id", "==", req.uid)
        .where("status", "==", "held")
        .get();

      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const totalKobo = items.reduce((sum, e: any) => sum + Number(e.amountKobo || 0), 0);

      res.json({ totalKobo, totalNaira: totalKobo / 100, items });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ------------------------------------------------------
  // Paystack initialize: TOPUP
  // ------------------------------------------------------
  app.post("/api/paystack/topup/initialize", requireFirebaseAuth, async (req: any, res) => {
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

      const data: any = await psRes.json();
      if (!data.status) return res.status(400).json(data);

      await db.collection(PAYMENT_INTENTS_COL).add({
        userId: req.uid,
        type: "topup",
        amountKobo: Number(amountKobo),
        status: "pending",
        reference,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ authorization_url: data.data.authorization_url, reference: data.data.reference });
    } catch (err) {
      console.error("Paystack Topup Init Error:", err);
      res.status(500).send("Internal Server Error");
    }
  });

  // ------------------------------------------------------
  // Paystack initialize: BOOKING
  // ------------------------------------------------------
  app.post("/api/paystack/booking/initialize", requireFirebaseAuth, async (req: any, res) => {
    const { rideId, email } = req.body || {};
    if (!rideId || !email) return res.status(400).send("rideId and email required");

    try {
      const rideSnap = await db.collection(RIDES_COL).doc(rideId).get();
      if (!rideSnap.exists) return res.status(404).send("Ride not found");

      const ride: any = rideSnap.data();
      const amountNaira = Number(ride.price_per_seat || 0);
      const amountKobo = Math.round(amountNaira * 100);
      if (amountKobo < 100) return res.status(400).send("Invalid ride price");

      const reference = `book_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const callback_url = `${req.headers.origin || "http://localhost:3000"}/wallet?reference=${reference}`;

      // seat check now (best-effort)
      const seatsAvailable = Number(ride.seats_available || 0);
      const seatsBooked = Number(ride.seats_booked || 0);
      if (seatsBooked >= seatsAvailable) return res.status(400).send("Ride is full");

      const bookingRef = db.collection(BOOKINGS_COL).doc();
      const commissionRate = 0.1;
      const commission = Math.round(amountKobo * commissionRate);
      const netToDriver = amountKobo - commission;

      await bookingRef.set({
        rideId,
        trip_id: rideId,
        driverId: ride.carOwnerId || ride.driver_id,
        driver_id: ride.carOwnerId || ride.driver_id,
        passengerId: req.uid,
        passenger_id: req.uid,
        amountKobo,
        amount_paid: amountNaira,
        commissionKobo: commission,
        netToDriverKobo: netToDriver,
        payMethod: "paystack",
        status: "pending_payment",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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

      const data: any = await psRes.json();
      if (!data.status) return res.status(400).json(data);

      await db.collection(PAYMENT_INTENTS_COL).add({
        userId: req.uid,
        type: "booking",
        amountKobo,
        status: "pending",
        reference,
        bookingId: bookingRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ authorization_url: data.data.authorization_url, reference: data.data.reference, bookingId: bookingRef.id });
    } catch (err) {
      console.error("Paystack Booking Init Error:", err);
      res.status(500).send("Internal Server Error");
    }
  });

  // ------------------------------------------------------
  // Book ride without payment (legacy)
  // ------------------------------------------------------
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
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // create booking record (driver_id present so driver can see it)
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

  // ------------------------------------------------------
  // Book with Wallet (Escrowed) + seat update
  // ------------------------------------------------------
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
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Create booking
        const bookingRef = db.collection(BOOKINGS_COL).doc();
        const bookingId = bookingRef.id;

        t.set(bookingRef, {
          rideId,
          trip_id: rideId,
          driver_id: ride.carOwnerId || ride.driver_id,
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

        // Escrow doc id == bookingId
        t.set(
          db.collection(ESCROWS_COL).doc(bookingId),
          {
            bookingId,
            trip_id: rideId,
            driver_id: ride.carOwnerId || ride.driver_id,
            passenger_id: uid,
            amountKobo,
            status: "held",
            source: "wallet",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

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
          trip_id: rideId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Booking failed" });
    }
  });

  // ------------------------------------------------------
  // BOOKINGS API (driver can see bookings for their trip)
  // ------------------------------------------------------

  // Helper: get ride/trip and confirm owner
  async function assertDriverOwnsTrip(tripId: string, uid: string) {
    const rideSnap = await db.collection(RIDES_COL).doc(tripId).get();
    if (rideSnap.exists) {
      const ride: any = rideSnap.data();
      if (ride.carOwnerId === uid || ride.driver_id === uid) return { source: "rides" as const };
    }

    const tripSnap = await db.collection(TRIPS_COL).doc(tripId).get();
    if (tripSnap.exists) {
      const trip: any = tripSnap.data();
      if (trip.driver_id === uid) return { source: "trips" as const };
    }

    return null;
  }

  // Driver OR Passenger can view bookings for a trip
  app.get("/api/bookings/trip/:tripId", requireFirebaseAuth, async (req: any, res) => {
    try {
      const { tripId } = req.params;
      const uid = req.uid;

      const owns = await assertDriverOwnsTrip(tripId, uid);

      let q: FirebaseFirestore.Query = db.collection(BOOKINGS_COL).where("trip_id", "==", tripId);
      if (!owns) {
        q = q.where("passenger_id", "==", uid);
      }

      const snap = await q.get();
      res.json(snap.docs.map((d) => ({ booking_id: d.id, ...d.data() })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/bookings/user", requireFirebaseAuth, async (req: any, res) => {
    try {
      const snap = await db.collection(BOOKINGS_COL).where("passenger_id", "==", req.uid).get();
      res.json(snap.docs.map((d) => ({ booking_id: d.id, ...d.data() })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Optional: allow driver to accept/confirm booking
  app.post("/api/bookings/:bookingId/status", requireFirebaseAuth, async (req: any, res) => {
    try {
      const { bookingId } = req.params;
      const { status } = req.body || {};

      const allowed = ["pending", "pending_payment", "escrowed", "accepted", "confirmed", "completed", "rejected", "cancelled"];
      if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });

      await db.collection(BOOKINGS_COL).doc(bookingId).set(
        { status, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

 // --------------------------------------------
// Complete ONE Booking (Release Escrow)
// --------------------------------------------
app.post("/api/bookings/:bookingId/complete", requireFirebaseAuth, async (req: any, res) => {
  const { bookingId } = req.params;
  const uid = req.uid;

  try {
    const result = await db.runTransaction(async (tx) => {
      const bookingRef = db.collection(BOOKINGS_COL).doc(bookingId);
      const bookingSnap = await tx.get(bookingRef);
      if (!bookingSnap.exists) throw new Error("Booking not found");

      const booking: any = bookingSnap.data();
      const tripId = booking.trip_id || booking.rideId;

      const driverUid = booking.driver_id || booking.driverId;
      if (!driverUid) throw new Error("Booking missing driver_id");
      if (driverUid !== uid) throw new Error("Unauthorized (not trip driver)");

      if (!["escrowed", "accepted", "confirmed"].includes(booking.status)) {
        throw new Error(`Booking not releasable. Current status: ${booking.status}`);
      }

      const escrowRef = db.collection(ESCROWS_COL).doc(bookingId);
      const escrowSnap = await tx.get(escrowRef);
      if (!escrowSnap.exists) throw new Error("Escrow record not found");

      const escrow: any = escrowSnap.data();
      if (escrow.status !== "held") throw new Error(`Escrow not held. Current: ${escrow.status}`);

      const netToDriverKobo = Number(booking.netToDriverKobo || booking.amountKobo || 0);
      if (netToDriverKobo <= 0) throw new Error("Booking has 0 netToDriverKobo/amountKobo");

      const netToDriverNaira = netToDriverKobo / 100;

      // Credit driver wallet
      const driverWalletRef = db.collection(WALLETS_COL).doc(driverUid);
      tx.set(
        driverWalletRef,
        {
          uid: driverUid,
          balanceKobo: admin.firestore.FieldValue.increment(netToDriverKobo),
          balance: admin.firestore.FieldValue.increment(netToDriverNaira),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Optional mirror
      tx.set(
        db.collection(USERS_COL).doc(driverUid),
        {
          wallet_balance: admin.firestore.FieldValue.increment(netToDriverNaira),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Booking + Escrow
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

      // Transaction log
      tx.set(db.collection(TX_COL).doc(`escrow_release_${bookingId}`), {
        user_id: driverUid,
        uid: driverUid,
        type: "escrow_release",
        amount: netToDriverNaira,
        amountKobo: netToDriverKobo,
        status: "success",
        bookingId,
        trip_id: tripId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        bookingId,
        tripId,
        creditedKobo: netToDriverKobo,
        creditedNaira: netToDriverNaira,
      };
    });

    return res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("Complete Booking Error:", err);
    return res.status(400).json({ error: err.message || "Failed to complete booking" });
  }
});

// --------------------------------------------
// Complete Trip (Release ALL escrow bookings)
// --------------------------------------------
app.post("/api/trips/:tripId/complete", requireFirebaseAuth, async (req: any, res) => {
  const { tripId } = req.params;
  const uid = req.uid;

  try {
    const owns = await assertDriverOwnsTrip(tripId, uid);
    if (!owns) return res.status(403).json({ error: "Unauthorized (not trip driver)" });

    // Get all bookings for trip (then filter in code to avoid Firestore 'in' limitations surprises)
    const snap = await db.collection(BOOKINGS_COL).where("trip_id", "==", tripId).get();

    const releasable = snap.docs.filter((d) => {
      const b: any = d.data();
      return ["escrowed", "accepted", "confirmed"].includes(b.status);
    });

    let releasedCount = 0;
    let totalCreditedKobo = 0;
    const releasedBookingIds: string[] = [];

    for (const d of releasable) {
      const bookingId = d.id;

      const creditedKobo = await db.runTransaction(async (tx) => {
        const bookingRef = db.collection(BOOKINGS_COL).doc(bookingId);
        const bookingSnap = await tx.get(bookingRef);
        if (!bookingSnap.exists) return 0;

        const booking: any = bookingSnap.data();

        const driverUid = booking.driver_id || booking.driverId;
        if (!driverUid) return 0;
        if (driverUid !== uid) throw new Error("Unauthorized booking driver mismatch");

        if (!["escrowed", "accepted", "confirmed"].includes(booking.status)) return 0;

        const escrowRef = db.collection(ESCROWS_COL).doc(bookingId);
        const escrowSnap = await tx.get(escrowRef);
        if (!escrowSnap.exists) return 0;

        const escrow: any = escrowSnap.data();
        if (escrow.status !== "held") return 0;

        const netToDriverKobo = Number(booking.netToDriverKobo || booking.amountKobo || 0);
        if (netToDriverKobo <= 0) return 0;

        const netToDriverNaira = netToDriverKobo / 100;

        // Credit driver wallet
        tx.set(
          db.collection(WALLETS_COL).doc(driverUid),
          {
            uid: driverUid,
            balanceKobo: admin.firestore.FieldValue.increment(netToDriverKobo),
            balance: admin.firestore.FieldValue.increment(netToDriverNaira),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        // Optional mirror
        tx.set(
          db.collection(USERS_COL).doc(driverUid),
          {
            wallet_balance: admin.firestore.FieldValue.increment(netToDriverNaira),
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
          user_id: driverUid,
          uid: driverUid,
          type: "escrow_release",
          amount: netToDriverNaira,
          amountKobo: netToDriverKobo,
          status: "success",
          bookingId,
          trip_id: tripId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return netToDriverKobo;
      });

      if (creditedKobo > 0) {
        releasedCount += 1;
        totalCreditedKobo += creditedKobo;
        releasedBookingIds.push(bookingId);
      }
    }

    // mark ride/trip status completed (best-effort)
    await db.collection(RIDES_COL).doc(tripId).set(
      { status: "completed", updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    await db.collection(TRIPS_COL).doc(tripId).set(
      { status: "completed", updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    return res.json({
      ok: true,
      tripId,
      releasedCount,
      releasedBookingIds,
      totalCreditedKobo,
      totalCreditedNaira: totalCreditedKobo / 100,
      note:
        releasedCount === 0
          ? "No escrowed bookings were released. Check booking.status (must be escrowed/accepted/confirmed) and escrow.status (must be held)."
          : "Driver wallet credited.",
    });
  } catch (err: any) {
    console.error("Complete Trip Error:", err);
    return res.status(400).json({ error: err.message || "Failed to complete trip" });
  }
});

  // ------------------------------------------------------
  // Vite middleware / Production static
  // ------------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get(/.*/, (_req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
} // ✅ closes startServer()

startServer(); // ✅ call
