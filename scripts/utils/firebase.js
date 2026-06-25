// utils/firebase.js — Khởi tạo Firebase Admin SDK dùng chung
const admin = require('firebase-admin');

let initialized = false;

function initFirebase() {
  if (initialized) return;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('Thiếu biến môi trường FIREBASE_SERVICE_ACCOUNT');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT không phải JSON hợp lệ');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: serviceAccount.databaseURL
      // Nếu không có trong service account, đặt thủ công ở đây:
      || process.env.FIREBASE_DATABASE_URL,
  });

  initialized = true;
}

function getDb() {
  initFirebase();
  return admin.database();
}

// Ngày hôm nay theo giờ Việt Nam (UTC+7), trả về "YYYY-MM-DD"
function getTodayVN() {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const y = vn.getUTCFullYear();
  const m = String(vn.getUTCMonth() + 1).padStart(2, '0');
  const d = String(vn.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDMY(ymd) {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

module.exports = { getDb, getTodayVN, formatDMY };
