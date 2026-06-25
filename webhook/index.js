// webhook/index.js
'use strict';

const express        = require('express');
const admin          = require('firebase-admin');
const { createHmac } = require('crypto');
const axios          = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ──────────────────────────────────────────────
// Firebase Admin — khởi tạo lazy
// ──────────────────────────────────────────────
let _db = null;
function getDb() {
  if (_db) return _db;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || raw.trim() === '') {
    throw new Error('Thiếu biến môi trường FIREBASE_SERVICE_ACCOUNT.');
  }

  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT không phải JSON hợp lệ.');
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      databaseURL: sa.databaseURL || process.env.FIREBASE_DATABASE_URL,
    });
  }

  _db = admin.database();
  return _db;
}

// ──────────────────────────────────────────────
// Kiểm tra env vars khi khởi động
// ──────────────────────────────────────────────
const REQUIRED_ENVS = ['FIREBASE_SERVICE_ACCOUNT', 'ZALO_OA_ACCESS_TOKEN'];
const missing = REQUIRED_ENVS.filter(k => !process.env[k] || process.env[k].trim() === '');
if (missing.length > 0) {
  console.error('❌ Thiếu env vars:', missing.join(', '));
}

// ──────────────────────────────────────────────
// Xác thực webhook từ Zalo
// ──────────────────────────────────────────────
function verifyZaloSignature(req) {
  const appSecret = process.env.ZALO_APP_SECRET;
  if (!appSecret) return true;
  const sig      = req.headers['x-zevent-signature'] || '';
  const body     = JSON.stringify(req.body);
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(body).digest('hex');
  return sig === expected;
}

// ──────────────────────────────────────────────
// Gửi tin nhắn trả lời về Zalo OA
// ──────────────────────────────────────────────
async function replyToUser(userId, text) {
  const token = process.env.ZALO_OA_ACCESS_TOKEN;
  if (!token) { console.error('Thiếu ZALO_OA_ACCESS_TOKEN'); return; }
  try {
    await axios.post(
      'https://openapi.zalo.me/v3.0/oa/message/cs',
      { recipient: { user_id: userId }, message: { text } },
      { headers: { access_token: token, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('Lỗi gửi reply Zalo:', e.response?.data || e.message);
  }
}

// ──────────────────────────────────────────────
// Xác thực domain với Zalo (thay vì DNS TXT record)
// Zalo gọi GET endpoint này để xác minh domain bcngay.onrender.com
// ──────────────────────────────────────────────
app.get('/zalo-platform-site-verification', (req, res) => {
  const code = process.env.ZALO_VERIFY_CODE || 'HCMw1C_4EWijr95MszenKp_AvMlJkpSrCJG';
  res.send(code);
});

// ──────────────────────────────────────────────
// Webhook endpoint chính
// ──────────────────────────────────────────────
app.post('/zalo-webhook', async (req, res) => {
  res.sendStatus(200);

  if (!verifyZaloSignature(req)) {
    console.warn('Webhook signature không hợp lệ, bỏ qua.');
    return;
  }

  const event      = req.body;
  const zaloUserId = event?.sender?.id;
  const text       = (event?.message?.text || '').trim();

  if (!zaloUserId || event?.event_name !== 'user_send_text') return;

  console.log(`[Webhook] User ${zaloUserId} nhắn: "${text}"`);

  let db;
  try { db = getDb(); }
  catch (e) {
    console.error('Firebase init lỗi:', e.message);
    await replyToUser(zaloUserId, '❌ Lỗi hệ thống. Vui lòng thử lại sau.');
    return;
  }

  // ── Lệnh: bind [tên cán bộ] ──
  const bindMatch = text.match(/^bind\s+(.+)/i);
  if (bindMatch) {
    const staffName = bindMatch[1].trim();
    try {
      const staffSnap = await db.ref('danhMucCanBo').once('value');
      const staffList = staffSnap.val() || [];
      const allNames  = staffList.map(s => (typeof s === 'string' ? s : s.ten));
      const matched   = allNames.find(n => n.toLowerCase() === staffName.toLowerCase());

      if (!matched) {
        await replyToUser(zaloUserId,
          `❌ Không tìm thấy cán bộ "${staffName}" trong hệ thống.\n` +
          `Vui lòng kiểm tra lại họ tên (có dấu đầy đủ).`
        );
        return;
      }

      await db.ref(`zaloIds/${matched}`).set(zaloUserId);
      console.log(`✅ Đã bind: ${matched} → ${zaloUserId}`);

      await replyToUser(zaloUserId,
        `✅ Liên kết thành công!\n` +
        `Zalo của bạn đã được gắn với tài khoản "${matched}".\n` +
        `Từ nay bạn sẽ nhận thông báo nhắc nhở công việc qua Zalo.`
      );
    } catch (e) {
      console.error('Lỗi bind:', e.message);
      await replyToUser(zaloUserId, '❌ Lỗi khi lưu dữ liệu. Vui lòng thử lại.');
    }
    return;
  }

  // ── Lệnh: unbind ──
  if (/^unbind$/i.test(text)) {
    try {
      const snap  = await db.ref('zaloIds').once('value');
      const map   = snap.val() || {};
      const entry = Object.entries(map).find(([, uid]) => uid === zaloUserId);
      if (entry) {
        await db.ref(`zaloIds/${entry[0]}`).remove();
        await replyToUser(zaloUserId, `✅ Đã huỷ liên kết tài khoản "${entry[0]}".`);
      } else {
        await replyToUser(zaloUserId, `ℹ️ Zalo của bạn chưa được liên kết với tài khoản nào.`);
      }
    } catch (e) {
      await replyToUser(zaloUserId, '❌ Lỗi hệ thống. Vui lòng thử lại.');
    }
    return;
  }

  // ── Lệnh: status ──
  if (/^status$/i.test(text)) {
    try {
      const snap  = await db.ref('zaloIds').once('value');
      const map   = snap.val() || {};
      const entry = Object.entries(map).find(([, uid]) => uid === zaloUserId);
      if (entry) {
        await replyToUser(zaloUserId, `ℹ️ Zalo của bạn đang liên kết với tài khoản: "${entry[0]}"`);
      } else {
        await replyToUser(zaloUserId,
          `ℹ️ Zalo của bạn chưa được liên kết.\n` +
          `Nhắn "bind [họ tên]" để liên kết.\nVí dụ: bind Nguyễn Văn A`
        );
      }
    } catch (e) {
      await replyToUser(zaloUserId, '❌ Lỗi hệ thống. Vui lòng thử lại.');
    }
    return;
  }

  // ── Tin nhắn khác → hướng dẫn ──
  await replyToUser(zaloUserId,
    `📋 Các lệnh hỗ trợ:\n` +
    `• bind [họ tên] — Liên kết Zalo với tài khoản\n` +
    `• unbind — Huỷ liên kết\n` +
    `• status — Xem trạng thái\n\n` +
    `Ví dụ: bind Nguyễn Văn A`
  );
});

// ──────────────────────────────────────────────
// Health check
// ──────────────────────────────────────────────
app.get('/', (req, res) => {
  const envOk = REQUIRED_ENVS.every(k => process.env[k] && process.env[k].trim() !== '');
  res.status(envOk ? 200 : 500).send(
    envOk
      ? 'CTCN Zalo Webhook — OK ✅'
      : `CTCN Zalo Webhook — ❌ Thiếu env vars: ${missing.join(', ')}`
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Webhook server chạy tại cổng ${PORT}`);
  if (missing.length > 0) {
    console.warn(`⚠️  Thiếu env vars: ${missing.join(', ')}`);
  }
});
