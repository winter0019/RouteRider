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
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;
      
      // Handle cases where the entire JSON might have been pasted
      if (privateKey.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(privateKey);
          if (parsed.private_key) {
            console.log("Detected JSON service account in FIREBASE_PRIVATE_KEY. Extracting private_key...");
            privateKey = parsed.private_key;
          }
        } catch (e) {
          // Not valid JSON, continue with raw string
        }
      }

      // More robust cleaning
      privateKey = privateKey.trim();
      if (privateKey.startsWith('"') && privateKey.endsWith('"')) privateKey = privateKey.slice(1, -1);
      if (privateKey.startsWith("'") && privateKey.endsWith("'")) privateKey = privateKey.slice(1, -1);

      // Check if it's base64 encoded (doesn't contain PEM headers and looks like base64)
      if (!privateKey.includes("-----BEGIN") && /^[A-Za-z0-9+/=]+$/.test(privateKey.replace(/\s/g, ""))) {
        console.log("Detected potentially base64 encoded FIREBASE_PRIVATE_KEY. Decoding...");
        try {
          privateKey = Buffer.from(privateKey, 'base64').toString('utf-8');
        } catch (e) {
          console.error("Failed to decode base64 private key:", e);
        }
      }

      // Ensure newlines and carriage returns are correctly handled
      privateKey = privateKey.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
      
      // Robust PEM normalization
      const normalizePEM = (key: string) => {
        // Remove all whitespace and any existing headers/footers to isolate the base64 body
        const body = key
          .replace(/-----BEGIN [^-]+-----/g, "")
          .replace(/-----END [^-]+-----/g, "")
          .replace(/\s/g, "");
        
        if (!body) return key; // Fallback if something went wrong

        // Re-wrap with standard PKCS#8 headers and 64-character line breaks
        const lines = body.match(/.{1,64}/g);
        if (!lines) return key;
        
        return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
      };

      privateKey = normalizePEM(privateKey);

      // Debugging info (safe)
      console.log("Private Key Debug Info:");
      console.log("- Length:", privateKey.length);
      console.log("- Starts with '-----BEGIN PRIVATE KEY-----':", privateKey.startsWith("-----BEGIN PRIVATE KEY-----"));
      console.log("- Ends with '-----END PRIVATE KEY-----':", privateKey.trim().endsWith("-----END PRIVATE KEY-----"));
      console.log("- Contains actual newlines:", privateKey.includes("\n"));

      console.log("Initializing Firebase Admin with explicit credentials for project:", process.env.FIREBASE_PROJECT_ID);
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
    } else {
      console.log("Initializing Firebase Admin with default credentials...");
      try {
        // If we have a project ID but no cert, try to set it in the options
        // This can help with the 'aud' claim mismatch in some environments
        admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || undefined
        });
      } catch (e) {
        console.error("Default Firebase Admin initialization failed:", e);
      }
    }
    const currentProjectId = admin.app().options.projectId;
    console.log("Firebase Admin initialized. Project ID:", currentProjectId);
    
    if (currentProjectId !== "my-route-rider") {
      console.warn(`WARNING: Firebase Project ID mismatch! Server is using "${currentProjectId}" but client expects "my-route-rider". Auth verification will fail.`);
    }
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

async function createPaystackRecipient(params: {
  name: string;
  account_number: string;
  bank_code: string;
}) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error("PAYSTACK_SECRET_KEY missing");

  const res = await fetch("https://api.paystack.co/transferrecipient", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "nuban",
      name: params.name,
      account_number: params.account_number,
      bank_code: params.bank_code,
      currency: "NGN",
    }),
  });

  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Failed to create recipient");
  return data.data.recipient_code;
}

async function initiatePaystackTransfer(params: {
  amountKobo: number;
  recipient: string;
  reason: string;
  reference: string;
}) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error("PAYSTACK_SECRET_KEY missing");

  const res = await fetch("https://api.paystack.co/transfer", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "balance",
      amount: params.amountKobo,
      recipient: params.recipient,
      reason: params.reason,
      reference: params.reference,
    }),
  });

  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Transfer failed");
  return data.data;
}

let ridesCache: any = null;
let lastRidesFetch = 0;
const RIDES_CACHE_TTL = 30000; // 30 seconds

async function startServer() {
  const app = express();
  // Use process.env.PORT for production portability (e.g. Railway), 
  // but default to 3000 for AI Studio environment.
  const PORT = Number(process.env.PORT) || 3000;

  try {
    if (!admin.apps.length) {
      throw new Error("Firebase Admin not initialized");
    }
    db = admin.firestore();
    console.log("Firestore initialized. Project:", admin.app().options.projectId);
    
    // Perform a quick connectivity check
    db.listCollections().then(() => {
      console.log("✅ Firestore connectivity verified.");
    }).catch(err => {
      console.error("❌ Firestore connectivity check failed:", err.message);
      if (err.message.includes('DECODER')) {
        console.error("TIP: Your FIREBASE_PRIVATE_KEY format is likely invalid for Node.js. Ensure it is a valid PEM string starting with '-----BEGIN PRIVATE KEY-----'.");
      }
    });
  } catch (err) {
    console.error("Failed to get Firestore instance:", err);
  }

  console.log(`[${new Date().toISOString()}] Starting server...`);
  console.log(`[${new Date().toISOString()}] Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`[${new Date().toISOString()}] Port: ${PORT}`);

  app.use(cors({
    origin: true,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  }));

  // Request logging (moved to top)
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

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
           status: "confirmed", // ✅ paid = confirmed immediately
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

    // 2) TRANSFER STATUS (driver payout)
    if (event?.event === "transfer.success" || event?.event === "transfer.failed" || event?.event === "transfer.reversed") {
      await handleTransferStatus({
        reference: event?.data?.reference,
        transferCode: event?.data?.transfer_code,
        status: event?.data?.status,
        event: event?.event,
      });
    }

    return res.sendStatus(200);
  });

async function handleTransferStatus(params: { reference: string; transferCode: string; status: string; event: string }) {
  const { reference, transferCode, status } = params;
  console.log(`[Paystack Webhook] Transfer Status: ${status} for ref ${reference}`);

  const txSnap = await db.collection(TX_COL).where("reference", "==", reference).limit(1).get();
  if (txSnap.empty) {
    console.warn(`Transfer transaction not found for ref: ${reference}`);
    return;
  }

  const txDoc = txSnap.docs[0];
  const txData: any = txDoc.data();

  if (status === "success") {
    await txDoc.ref.update({ status: "success", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  } else if (status === "failed" || status === "reversed") {
    await db.runTransaction(async (t) => {
      const walletRef = db.collection(WALLETS_COL).doc(txData.uid);
      const userRef = db.collection(USERS_COL).doc(txData.uid);
      
      t.set(walletRef, {
        balanceKobo: admin.firestore.FieldValue.increment(txData.amountKobo),
        balance: admin.firestore.FieldValue.increment(txData.amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      
      t.set(userRef, {
        wallet_balance: admin.firestore.FieldValue.increment(txData.amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      t.update(txDoc.ref, { 
        status: "failed", 
        description: `Withdrawal Failed: ${status}`,
        updatedAt: admin.firestore.FieldValue.serverTimestamp() 
      });
    });
  }
}

  // JSON body parser (after webhook)
  app.use(express.json({ limit: "10mb" }));

  // ------------------------------------------------------
// Paystack VERIFY (fallback when webhook fails)
// ------------------------------------------------------
app.post("/api/paystack/verify", requireFirebaseAuth, async (req: any, res) => {
  const { reference } = req.body || {};
  if (!reference) return res.status(400).json({ error: "reference required" });

  try {
    // 1) Verify from Paystack
    const vr = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });

    const vdata: any = await vr.json();
    if (!vdata?.status) return res.status(400).json({ error: "Paystack verify failed", detail: vdata });
    if (vdata?.data?.status !== "success") return res.status(400).json({ error: "Transaction not successful yet" });

    // 2) Find payment intent
    const intentSnap = await db
      .collection(PAYMENT_INTENTS_COL)
      .where("reference", "==", reference)
      .limit(1)
      .get();

    if (intentSnap.empty) return res.status(404).json({ error: "Payment intent not found" });

    const intentDoc = intentSnap.docs[0];
    const intent: any = intentDoc.data();

    // already processed
    if (intent.status === "success") return res.json({ ok: true, alreadyProcessed: true });

    // 3) Apply the same logic as webhook
    await db.runTransaction(async (tx) => {
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
      // BOOKING => escrow + status escrowed + update seats
      // -----------------
      if (intent.type === "booking") {
        const bookingRef = db.collection(BOOKINGS_COL).doc(intent.bookingId);
        const bookingSnap = await tx.get(bookingRef);
        if (!bookingSnap.exists) throw new Error("Booking not found");

        const booking: any = bookingSnap.data();
        const tripId = booking.trip_id || booking.rideId;
        const driverId = booking.driver_id || booking.driverId;
        const passengerId = booking.passenger_id || booking.passengerId;

        // Create escrow (doc id = bookingId)
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

        // ✅ VERY IMPORTANT: mark paid & escrowed
        tx.update(bookingRef, {
          status: "escrowed",
          payment_status: "paid",
          paid: true,
          paystack_reference: reference,
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // ✅ Update ride seats + bookedBy
        if (tripId) {
          const rideRef = db.collection(RIDES_COL).doc(tripId);
          const rideSnap = await tx.get(rideRef);
          if (rideSnap.exists) {
            tx.update(rideRef, {
              bookedBy: admin.firestore.FieldValue.arrayUnion(passengerId),
              seats_booked: admin.firestore.FieldValue.increment(1),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }

        // log passenger “escrow hold”
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

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("Verify Error:", err);
    return res.status(500).json({ error: err.message || "Verify failed" });
  }
});

  
  // Auth middleware (Firebase ID token)
  // ------------------------------------------------------
async function requireFirebaseAuth(req: any, res: any, next: any) {
    try {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token) return res.status(401).json({ error: "Missing auth token" });

      if (process.env.NODE_ENV !== 'production') {
        console.log("Verifying token starting with:", token.substring(0, 10) + "...");
      }

      const decoded = await admin.auth().verifyIdToken(token);
      req.uid = decoded.uid;
      req.user = decoded;
      next();
    } catch (e: any) {
      console.error("Auth Verification Error:", e.message, e.code);
      
      let errorMessage = "Invalid auth token";
      if (e.code === 'auth/argument-error' && e.message.includes('audience')) {
        errorMessage = "Firebase Project ID Mismatch. Please ensure FIREBASE_PROJECT_ID is set to 'my-route-rider' in the environment variables.";
      }

      return res.status(401).json({ 
        error: errorMessage, 
        detail: e.message,
        code: e.code 
      });
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

      const kyc_status = status === "approved" ? "verified" : "failed";

      await db.collection(KYC_COL).doc(uid).set(
        { status, reviewedBy: req.uid, reviewedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );

      await db.collection(USERS_COL).doc(uid).set({ 
        kyc_status,
        name_locked: status === "approved",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ------------------------------------------------------
  // Admin Monitoring & Dispute Settlement
  // ------------------------------------------------------
  app.get("/api/admin/trips", requireFirebaseAuth, requireAdmin, async (req, res) => {
    try {
      const ridesSnap = await db.collection(RIDES_COL).orderBy("createdAt", "desc").limit(100).get();
      const tripsSnap = await db.collection(TRIPS_COL).orderBy("createdAt", "desc").limit(100).get();
      
      const rides = ridesSnap.docs.map(d => ({ id: d.id, source: "rides", ...d.data() }));
      const trips = tripsSnap.docs.map(d => ({ id: d.id, source: "trips", ...d.data() }));
      
      const combined = [...rides, ...trips].sort((a: any, b: any) => {
        const dateA = a.createdAt?.toDate?.()?.getTime() || 0;
        const dateB = b.createdAt?.toDate?.()?.getTime() || 0;
        return dateB - dateA;
      });

      res.json(combined);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/trips/:tripId/settle", requireFirebaseAuth, requireAdmin, async (req: any, res) => {
    const { tripId } = req.params;
    const { source } = req.body || {};
    const col = source === "trips" ? TRIPS_COL : RIDES_COL;

    try {
      const tripRef = db.collection(col).doc(tripId);
      const tripSnap = await tripRef.get();
      if (!tripSnap.exists) return res.status(404).json({ error: "Trip not found" });
      
      const tripData: any = tripSnap.data();
      const driverUid = tripData.driver_id || tripData.carOwnerId;

      const bookingsSnap = await db.collection(BOOKINGS_COL).where("trip_id", "==", tripId).get();
      const releasable = bookingsSnap.docs.filter(d => ["escrowed", "accepted", "confirmed"].includes(d.data().status));

      for (const d of releasable) {
        const bookingId = d.id;
        await db.runTransaction(async (tx) => {
          const bookingRef = db.collection(BOOKINGS_COL).doc(bookingId);
          const bSnap = await tx.get(bookingRef);
          if (!bSnap.exists) return;
          const booking: any = bSnap.data();

          const escrowRef = db.collection(ESCROWS_COL).doc(bookingId);
          const eSnap = await tx.get(escrowRef);
          if (!eSnap.exists || eSnap.data()?.status !== "held") return;

          const netKobo = Number(booking.netToDriverKobo || booking.amountKobo || 0);
          
          const walletRef = db.collection(WALLETS_COL).doc(driverUid);
          const wSnap = await tx.get(walletRef);
          const currentKobo = wSnap.exists ? Number(wSnap.data()?.balanceKobo || 0) : 0;
          
          tx.set(walletRef, { 
            balanceKobo: currentKobo + netKobo,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });

          tx.update(bookingRef, { status: "completed", settledBy: "admin", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          tx.update(escrowRef, { status: "released", releasedAt: admin.firestore.FieldValue.serverTimestamp() });
        });
      }

      await tripRef.update({ status: "completed", settledBy: "admin", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      res.json({ ok: true, message: "Trip manually settled by admin" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/trips/:tripId/cancel", requireFirebaseAuth, requireAdmin, async (req: any, res) => {
    const { tripId } = req.params;
    const { source } = req.body || {};
    const col = source === "trips" ? TRIPS_COL : RIDES_COL;

    try {
      const tripRef = db.collection(col).doc(tripId);
      const tripSnap = await tripRef.get();
      if (!tripSnap.exists) return res.status(404).json({ error: "Trip not found" });

      const bookingsSnap = await db.collection(BOOKINGS_COL).where("trip_id", "==", tripId).get();
      
      for (const d of bookingsSnap.docs) {
        const bookingId = d.id;
        const booking: any = d.data();
        const passengerUid = booking.passenger_id;

        await db.runTransaction(async (tx) => {
          const escrowRef = db.collection(ESCROWS_COL).doc(bookingId);
          const eSnap = await tx.get(escrowRef);
          
          if (eSnap.exists && eSnap.data()?.status === "held") {
            const amountKobo = Number(booking.amountKobo || 0);
            const walletRef = db.collection(WALLETS_COL).doc(passengerUid);
            const wSnap = await tx.get(walletRef);
            const currentKobo = wSnap.exists ? Number(wSnap.data()?.balanceKobo || 0) : 0;

            tx.set(walletRef, { 
              balanceKobo: currentKobo + amountKobo,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            tx.update(escrowRef, { status: "refunded", cancelledBy: "admin", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          }
          
          tx.update(db.collection(BOOKINGS_COL).doc(bookingId), { 
            status: "cancelled", 
            cancelledBy: "admin", 
            updatedAt: admin.firestore.FieldValue.serverTimestamp() 
          });
        });
      }

      await tripRef.update({ status: "cancelled", cancelledBy: "admin", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      res.json({ ok: true, message: "Trip manually cancelled and refunded by admin" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ------------------------------------------------------
  // Rides / Trips
  // ------------------------------------------------------
  app.get("/api/rides/search", async (req, res) => {
    try {
      const { origin, destination, date } = req.query as any;
      const now = admin.firestore.Timestamp.now();

      let qRides = db.collection(RIDES_COL)
        .where("status", "==", "posted");

      let qTrips = db.collection(TRIPS_COL)
        .where("status", "==", "posted");

      if (origin) {
        const ok = origin.toLowerCase().trim();
        qRides = qRides.where("origin_key", "==", ok);
        qTrips = qTrips.where("origin_key", "==", ok);
      }
      if (destination) {
        const dk = destination.toLowerCase().trim();
        qRides = qRides.where("destination_key", "==", dk);
        qTrips = qTrips.where("destination_key", "==", dk);
      }

      const [ridesSnap, tripsSnap] = await Promise.all([qRides.get(), qTrips.get()]);

      const nowMillis = Date.now();
      const rides = ridesSnap.docs
        .map(d => ({ id: d.id, trip_id: d.id, source: "rides", ...d.data() as any }))
        .filter(r => !r.expiresAt || r.expiresAt.toMillis() > nowMillis);
        
      const trips = tripsSnap.docs
        .map(d => ({ id: d.id, trip_id: d.id, source: "trips", ...d.data() as any }))
        .filter(t => !t.expiresAt || t.expiresAt.toMillis() > nowMillis);

      let combined = [...rides, ...trips];

      // Client-side date filtering if provided
      if (date) {
        combined = combined.filter((t: any) => {
          const tDate = new Date(t.departure_time).toISOString().split('T')[0];
          return tDate === date;
        });
      }

      res.json(combined);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/rides", async (_req, res) => {
    try {
      const now = Date.now();
      if (ridesCache && (now - lastRidesFetch < RIDES_CACHE_TTL)) {
        return res.json(ridesCache);
      }

      // Optimize: Only fetch active/posted rides to save quota
      const ridesSnap = await db.collection(RIDES_COL)
        .where("status", "==", "posted")
        .limit(50)
        .get();
        
      const tripsSnap = await db.collection(TRIPS_COL)
        .where("status", "==", "posted")
        .limit(50)
        .get();

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

      // Update cache
      ridesCache = all;
      lastRidesFetch = now;

      res.json(all);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/rides", requireFirebaseAuth, async (req: any, res) => {
    try {
      const userSnap = await db.collection(USERS_COL).doc(req.uid).get();
      const userData = userSnap.data() as any;

      if (userData?.kyc_status !== "verified") {
        return res.status(403).json({ error: "KYC verification required to post trips." });
      }

      const tripData = req.body;
      const { origin, destination, pickup_area, pickup_landmark } = tripData;

      if (!pickup_area || !pickup_landmark) {
        return res.status(400).json({ error: "Pickup area and landmark are required." });
      }

      const now = Date.now();
      const expiresAt = new Date(now + 24 * 60 * 60 * 1000); // 24 hours from now

      const ref = await db.collection(RIDES_COL).add({
        ...tripData,
        origin_key: origin?.toLowerCase().trim() || "",
        destination_key: destination?.toLowerCase().trim() || "",
        carOwnerId: req.uid,
        driver_id: req.uid,
        bookedBy: [],
        seats_booked: 0,
        status: "posted",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
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
      const userRef = db.collection(USERS_COL).doc(req.uid);
      const userSnap = await userRef.get();
      
      if (!userSnap.exists) {
        // Initial profile creation
        // Passengers are auto-verified for now, drivers must go through KYC
        const initialKycStatus = data.userType === 'passenger' ? 'verified' : 'none';
        
        await userRef.set({
          ...data,
          kyc_status: initialKycStatus,
          name_locked: data.userType === 'passenger', // Passengers names are locked if they are verified
          name_correction_used: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.json({ ok: true });
      }

      const userData = userSnap.data() as any;
      
      // Prevent client from overriding sensitive fields
      const { kyc_status, name_locked, name_correction_used, recipient_code, ...safeData } = data;
      const updates: any = { ...safeData, updatedAt: admin.firestore.FieldValue.serverTimestamp() };

      // If bank details changed, create/update Paystack recipient
      if (data.account_number && data.bank_code && (data.account_number !== userData.account_number || data.bank_code !== userData.bank_code)) {
        try {
          const newRecipientCode = await createPaystackRecipient({
            name: data.account_name || userData.full_name || "RouteRider Driver",
            account_number: data.account_number,
            bank_code: data.bank_code
          });
          updates.recipient_code = newRecipientCode;
          updates.payout_enabled = true;
        } catch (err: any) {
          console.error("Paystack Recipient Error:", err);
          return res.status(400).json({ error: `Failed to verify bank details: ${err.message}` });
        }
      }

      // Name Locking Logic
      if (userData.name_locked && data.full_name && data.full_name !== userData.full_name) {
        // Check if one-time correction is available
        if (userData.name_correction_used) {
          return res.status(403).json({ error: "Name is locked and correction has already been used." });
        }
        // Allow one-time correction
        updates.name_correction_used = true;
        console.log(`User ${req.uid} used their one-time name correction.`);
      }

      await userRef.update(updates);
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

      // Simulate automatic extraction and verification for demo/MVP purposes
      // In a real app, this would be handled by a background worker or manual review
      const extractedName = data.extractedName || data.full_name; 
      
      await db.collection(USERS_COL).doc(req.uid).set({ 
        kyc_status: "verified", // Auto-verify for MVP
        full_name: extractedName,
        name_locked: true,
        name_correction_used: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      res.json({ ok: true, kyc_status: "verified", full_name: extractedName });
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
    const bookingRef = db.collection(BOOKINGS_COL).doc(bookingId);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) throw new Error("Booking not found");

    const booking: any = bookingSnap.data();
    const driverUid = booking.driver_id || booking.driverId;
    if (driverUid !== uid) throw new Error("Unauthorized (not trip driver)");

    if (!["escrowed", "accepted", "confirmed"].includes(booking.status)) {
      throw new Error(`Booking not releasable. Current status: ${booking.status}`);
    }

    const escrowRef = db.collection(ESCROWS_COL).doc(bookingId);
    const escrowSnap = await escrowRef.get();
    if (!escrowSnap.exists) throw new Error("Escrow record not found");

    const escrow: any = escrowSnap.data();
    if (escrow.status !== "held") throw new Error(`Escrow not held. Current: ${escrow.status}`);

    const driverSnap = await db.collection(USERS_COL).doc(driverUid).get();
    const driverData = driverSnap.data() as any;

    if (!driverData?.recipient_code) {
      throw new Error("Driver has no bank account configured for payouts.");
    }

    const netToDriverKobo = Number(booking.netToDriverKobo || booking.amountKobo || 0);
    if (netToDriverKobo <= 0) throw new Error("Booking has 0 netToDriverKobo/amountKobo");

    // 1. Mark as processing to prevent double payout
    await bookingRef.update({ status: "processing_payout" });

    try {
      // 2. Initiate Paystack Transfer
      await initiatePaystackTransfer({
        amountKobo: netToDriverKobo,
        recipient: driverData.recipient_code,
        reason: `RouteRider Payout for Booking #${bookingId}`,
        reference: `payout_${bookingId}_${Date.now()}`
      });

      // 3. Update Firestore
      const batch = db.batch();
      batch.update(bookingRef, {
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batch.update(escrowRef, {
        status: "released",
        releasedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      // Log transaction for history
      const txRef = db.collection(TX_COL).doc(`payout_${bookingId}`);
      batch.set(txRef, {
        user_id: driverUid,
        uid: driverUid,
        type: 'withdrawal',
        amount: netToDriverKobo / 100,
        amountKobo: netToDriverKobo,
        description: `Direct bank payout for booking #${bookingId}`,
        status: 'success',
        booking_id: bookingId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      await batch.commit();
      res.json({ ok: true, message: "Payout successful" });
    } catch (transferErr: any) {
      console.error("Payout Transfer Error:", transferErr);
      await bookingRef.update({ status: "escrowed", payout_error: transferErr.message });
      res.status(500).json({ error: `Payout failed: ${transferErr.message}. Please try again.` });
    }
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
  // Transactions
  // ------------------------------------------------------
  app.get("/api/transactions", requireFirebaseAuth, async (req: any, res) => {
    try {
      const q = db.collection(TX_COL).where("user_id", "==", req.uid);
      const snap = await q.get();
      const txs = snap.docs.map(d => ({
        transaction_id: d.id,
        ...d.data(),
        created_at: d.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
      }));

      txs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
      res.json({ id: ref.id, ...tx });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ------------------------------------------------------
  // Bank Account & Payouts (Paystack Transfers)
  // ------------------------------------------------------
  app.post("/api/wallet/verify-account", requireFirebaseAuth, async (req: any, res) => {
    const { bank_code, account_number } = req.body;
    if (!bank_code || !account_number) return res.status(400).json({ error: "bank_code and account_number required" });

    try {
      const response = await fetch(
        `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET}`,
          },
        }
      );

      const data = await response.json();
      if (data.status) {
        res.json({ success: true, account_name: data.data.account_name });
      } else {
        res.status(400).json({ success: false, message: data.message || "Invalid account" });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/wallet/save-bank", requireFirebaseAuth, async (req: any, res) => {
    const { bank_name, bank_code, account_number, account_name } = req.body;
    if (!bank_name || !bank_code || !account_number || !account_name) {
      return res.status(400).json({ error: "All bank details required" });
    }

    try {
      // Create transfer recipient in Paystack
      const paystackResponse = await fetch("https://api.paystack.co/transferrecipient", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "nuban",
          name: account_name,
          account_number: account_number,
          bank_code: bank_code,
          currency: "NGN",
        }),
      });

      const paystackData = await paystackResponse.json();
      if (!paystackData.status) {
        return res.status(400).json({ success: false, message: paystackData.message });
      }

      const recipient_code = paystackData.data.recipient_code;

      // Save to user profile
      await db.collection(USERS_COL).doc(req.uid).set(
        {
          bank_details: {
            bank_name,
            bank_code,
            account_number,
            account_name,
            recipient_code,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      res.json({ success: true, recipient_code });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/wallet/balance/:uid", requireFirebaseAuth, async (req: any, res) => {
    const { uid } = req.params;
    if (uid !== req.uid) return res.status(403).send("Unauthorized");

    try {
      const snap = await db.collection(WALLETS_COL).doc(uid).get();
      const balance = snap.exists ? Number(snap.data()?.balance || 0) : 0;
      res.json({ balance });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ------------------------------------------------------
  // Withdrawal (Real Paystack Transfer)
  // ------------------------------------------------------
  app.post("/api/wallet/withdraw", requireFirebaseAuth, async (req: any, res) => {
    const { amountKobo } = req.body || {};
    if (!amountKobo) return res.status(400).send("amountKobo required");

    const uid = req.uid;
    const amountNaira = Number(amountKobo) / 100;

    try {
      // 1) Get driver's profile and check KYC
      const userSnap = await db.collection(USERS_COL).doc(uid).get();
      const user: any = userSnap.data();

      if (user?.kyc_status !== "verified") {
        return res.status(403).json({ error: "KYC verification required to withdraw funds." });
      }

      const recipient_code = user?.bank_details?.recipient_code;

      if (!recipient_code) {
        return res.status(400).json({ error: "Bank account not linked. Please link your bank account first." });
      }

      const reference = `wd_${Date.now()}_${uid.slice(0, 6)}`;

      await db.runTransaction(async (t) => {
        const walletRef = db.collection(WALLETS_COL).doc(uid);
        const userRef = db.collection(USERS_COL).doc(uid);
        const wSnap = await t.get(walletRef);
        const currentKobo = wSnap.exists ? Number(wSnap.data()?.balanceKobo || 0) : 0;

        if (currentKobo < amountKobo) throw new Error("Insufficient balance");

        // 2) Initiate Paystack transfer
        const transferResponse = await fetch("https://api.paystack.co/transfer", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            source: "balance",
            amount: amountKobo,
            recipient: recipient_code,
            reason: "RouteRider driver payout",
            reference,
          }),
        });

        const transferData = await transferResponse.json();
        if (!transferData.status) {
          throw new Error(transferData.message || "Paystack transfer initiation failed");
        }

        // 3) Deduct from wallet balance
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

        // 4) Record withdrawal transaction (pending)
        t.set(db.collection(TX_COL).doc(reference), {
          uid,
          user_id: uid,
          type: "withdrawal",
          amount: amountNaira,
          amountKobo: Number(amountKobo),
          status: "pending",
          reference,
          transfer_code: transferData.data.transfer_code,
          description: "Bank Withdrawal (Paystack)",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      res.json({ ok: true, reference });
    } catch (err: any) {
      console.error("Withdrawal Error:", err);
      res.status(400).send(err.message || "Withdrawal failed");
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
}

startServer();
