// webhook/index.js
// Deploy lên server (VPS, Render free tier, Glitch, ...) để nhận webhook từ Zalo OA
// Khi cán bộ nhắn "bind Nguyễn Văn A" vào OA → hệ thống tự lưu Zalo ID
//
// Cách deploy nhanh nhất: https://render.com (free tier, Node.js)
// Sau đó vào Zalo OA → Cài đặt → Webhook → điền URL của server này
'use strict';

const express        = require('express');
const admin          = require('firebase-admin');
const { createHmac } = require('crypto');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.database();

// ──────────────────────────────────────────────
// Xác thực webhook từ Zalo (optional nhưng nên có)
// ──────────────────────────────────────────────
function verifyZaloSignature(req) {
  const appSecret = process.env.ZALO_APP_SECRET;
  if (!appSecret) return true; // Bỏ qua nếu chưa cấu hình

  const sig  = req.headers['x-zevent-signature'] || '';
  const body = JSON.stringify(req.body);
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(body).digest('hex');
  return sig === expected;
}

// ──────────────────────────────────────────────
// Xử lý webhook Zalo OA
// ──────────────────────────────────────────────
app.post('/zalo-webhook', async (req, res) => {
  // Phải trả 200 ngay để Zalo không retry
  res.sendStatus(200);

  if (!verifyZaloSignature(req)) {
    console.warn('Webhook signature không hợp lệ, bỏ qua.');
    return;
  }

  const event = req.body;
  if (!event || event.event_name !== 'user_send_text') return;

  const zaloUserId = event.sender?.id;
  const text       = (event.message?.text || '').trim();

  if (!zaloUserId || !text) return;

  console.log(`[Webhook] User ${zaloUserId} nhắn: "${text}"`);

  // ── Lệnh: bind [tên cán bộ] ──
  const bindMatch = text.match(/^bind\s+(.+)/i);
  if (bindMatch) {
    const staffName = bindMatch[1].trim();

    // Kiểm tra tên có trong danh sách không
    const staffSnap = await db.ref('danhMucCanBo').once('value');
    const staffList = staffSnap.val() || [];
    const allNames  = staffList.map(s => (typeof s === 'string' ? s : s.ten));
    const matched   = allNames.find(n => n.toLowerCase() === staffName.toLowerCase());

    if (!matched) {
      await replyToUser(zaloUserId,
        `❌ Không tìm thấy cán bộ "${staffName}" trong hệ thống.\n` +
        `Vui lòng kiểm tra lại họ tên (phân biệt hoa/thường không cần thiết).`
      );
      return;
    }

    // Lưu mapping: zaloIds/{staffName} = zaloUserId
    await db.ref(`zaloIds/${matched}`).set(zaloUserId);
    console.log(`✅ Đã bind: ${matched} → ${zaloUserId}`);

    await replyToUser(zaloUserId,
      `✅ Liên kết thành công!\n` +
      `Zalo của bạn đã được gắn với tài khoản "${matched}".\n` +
      `Từ nay bạn sẽ nhận thông báo nhắc nhở công việc qua Zalo.`
    );
    return;
  }

  // ── Lệnh: unbind ──
  if (/^unbind$/i.test(text)) {
    // Tìm và xoá mapping của user này
    const zaloSnap = await db.ref('zaloIds').once('value');
    const zaloMap  = zaloSnap.val() || {};
    const entry    = Object.entries(zaloMap).find(([, uid]) => uid === zaloUserId);

    if (entry) {
      await db.ref(`zaloIds/${entry[0]}`).remove();
      await replyToUser(zaloUserId, `✅ Đã huỷ liên kết tài khoản "${entry[0]}" với Zalo của bạn.`);
    } else {
      await replyToUser(zaloUserId, `ℹ️ Zalo của bạn chưa được liên kết với tài khoản nào.`);
    }
    return;
  }

  // ── Lệnh: status ──
  if (/^status$/i.test(text)) {
    const zaloSnap = await db.ref('zaloIds').once('value');
    const zaloMap  = zaloSnap.val() || {};
    const entry    = Object.entries(zaloMap).find(([, uid]) => uid === zaloUserId);

    if (entry) {
      await replyToUser(zaloUserId, `ℹ️ Zalo của bạn đang liên kết với tài khoản: "${entry[0]}"`);
    } else {
      await replyToUser(zaloUserId,
        `ℹ️ Zalo của bạn chưa được liên kết.\n` +
        `Nhắn "bind [họ tên]" để liên kết.\nVí dụ: bind Nguyễn Văn A`
      );
    }
    return;
  }

  // ── Tin nhắn khác → hướng dẫn ──
  await replyToUser(zaloUserId,
    `📋 Các lệnh hỗ trợ:\n` +
    `• bind [họ tên] — Liên kết Zalo với tài khoản\n` +
    `• unbind — Huỷ liên kết\n` +
    `• status — Xem trạng thái liên kết\n\n` +
    `Ví dụ: bind Nguyễn Văn A`
  );
});

// ──────────────────────────────────────────────
// Gửi tin nhắn trả lời (Zalo OA reply)
// ──────────────────────────────────────────────
const axios = require('axios');
async function replyToUser(userId, text) {
  try {
    const token = process.env.ZALO_OA_ACCESS_TOKEN;
    await axios.post(
      'https://openapi.zalo.me/v3.0/oa/message/cs',
      { recipient: { user_id: userId }, message: { text } },
      { headers: { access_token: token, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('Lỗi gửi reply:', e.message);
  }
}

// Health check
app.get('/', (req, res) => res.send('CTCN Zalo Webhook — OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook server chạy tại cổng ${PORT}`));
