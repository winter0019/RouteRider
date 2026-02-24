import admin from "firebase-admin";

// Use environment variables for credentials
if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
  console.error("Missing Firebase Admin credentials in environment variables.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const uid = process.argv[2];
if (!uid) {
  console.error("Pass UID: node scripts/makeAdmin.mjs <UID>");
  process.exit(1);
}

try {
  await admin.auth().setCustomUserClaims(uid, { admin: true });
  console.log("✅ Admin claim set for:", uid);
  process.exit(0);
} catch (error) {
  console.error("Error setting admin claim:", error);
  process.exit(1);
}
