/**
 * Firebase Admin SDK initializer.
 *
 * The service account credentials are stored as a single env var
 * FIREBASE_SERVICE_ACCOUNT_JSON containing the full JSON string.
 *
 * On Render: set this in Environment → add variable → paste the entire
 * contents of your serviceAccountKey.json as the value.
 *
 * Locally: add to server/.env:
 *   FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":...}
 */

const admin = require('firebase-admin');

let initialized = false;

function getAdmin() {
  if (initialized) return admin;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.warn('⚠️  FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications disabled');
    return null;
  }

  try {
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    initialized = true;
    console.log('✅  Firebase Admin SDK initialized');
    return admin;
  } catch (err) {
    console.error('❌  Failed to initialize Firebase Admin SDK:', err.message);
    return null;
  }
}

module.exports = { getAdmin };
