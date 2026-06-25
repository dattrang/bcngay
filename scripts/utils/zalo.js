// utils/zalo.js — Zalo Official Account API client
//
// Cách hoạt động:
// 1. Mỗi cán bộ follow Zalo OA của đơn vị
// 2. Cán bộ nhắn "bind [tên]" để liên kết Zalo ID với tên trong hệ thống
// 3. Script lấy mapping từ Firebase và gửi tin nhắn cá nhân
//
// Tài liệu: https://developers.zalo.me/docs/official-account

const axios = require('axios');

const ZALO_API = 'https://openapi.zalo.me';

// ──────────────────────────────────────────────
// TOKEN MANAGEMENT
// Access token Zalo OA hết hạn sau 90 ngày.
// Dùng refresh token để tự động lấy token mới.
// ──────────────────────────────────────────────
async function refreshAccessToken() {
  const refreshToken = process.env.ZALO_REFRESH_TOKEN;
  const appId       = process.env.ZALO_APP_ID;
  const secret      = process.env.ZALO_APP_SECRET;

  if (!refreshToken || !appId || !secret) {
    // Không có refresh token → dùng trực tiếp access token từ env
    const token = process.env.ZALO_OA_ACCESS_TOKEN;
    if (!token) throw new Error('Thiếu ZALO_OA_ACCESS_TOKEN hoặc thông tin refresh token');
    return token;
  }

  try {
    const res = await axios.post('https://oauth.zaloapp.com/v4/oa/access_token', null, {
      params: {
        app_id: appId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      },
      headers: { secret_key: secret },
    });

    if (res.data.error) {
      throw new Error(`Zalo refresh token lỗi: ${res.data.message}`);
    }

    console.log('[Zalo] Đã lấy access token mới, hết hạn sau:', res.data.expires_in, 'giây');
    return res.data.access_token;
  } catch (e) {
    // Fallback: dùng token cố định từ env
    const token = process.env.ZALO_OA_ACCESS_TOKEN;
    if (token) {
      console.warn('[Zalo] Refresh thất bại, dùng token cố định:', e.message);
      return token;
    }
    throw e;
  }
}

// ──────────────────────────────────────────────
// GỬI TIN NHẮN CÁ NHÂN
// Yêu cầu: user đã follow OA, có Zalo User ID
// ──────────────────────────────────────────────
async function sendToUser(accessToken, zaloUserId, text) {
  const res = await axios.post(
    `${ZALO_API}/v3.0/oa/message/cs`,
    {
      recipient: { user_id: zaloUserId },
      message:   { text },
    },
    {
      headers: {
        access_token:   accessToken,
        'Content-Type': 'application/json',
      },
    }
  );

  if (res.data.error !== 0) {
    throw new Error(`Zalo API lỗi (user ${zaloUserId}): [${res.data.error}] ${res.data.message}`);
  }
  return res.data;
}

// ──────────────────────────────────────────────
// GỬI BROADCAST TỚI TOÀN BỘ FOLLOWER
// Dùng khi không có mapping Zalo User ID cá nhân
// ──────────────────────────────────────────────
async function broadcastToFollowers(accessToken, text) {
  const res = await axios.post(
    `${ZALO_API}/v2.0/oa/broadcast/onewaybroadcast`,
    {
      recipient: { tag: 'all_follower' },
      message:   { text },
    },
    {
      headers: {
        access_token:   accessToken,
        'Content-Type': 'application/json',
      },
    }
  );

  if (res.data.error !== 0) {
    throw new Error(`Zalo broadcast lỗi: [${res.data.error}] ${res.data.message}`);
  }
  return res.data;
}

// ──────────────────────────────────────────────
// GỬI THÔNG BÁO — tự chọn cá nhân hoặc broadcast
// zaloIdMap: { "Nguyễn Văn A": "zalo_user_id_123", ... }
// Nếu không có mapping → broadcast tới tất cả follower
// ──────────────────────────────────────────────
async function sendReminder({ names, message, broadcastFallbackMessage, zaloIdMap = {} }) {
  const isDryRun = process.env.DRY_RUN === 'true';
  const token = await refreshAccessToken();

  const results = { sent: [], failed: [], broadcast: null };

  // Gửi cá nhân cho những người có Zalo ID
  const withId    = names.filter(n => zaloIdMap[n]);
  const withoutId = names.filter(n => !zaloIdMap[n]);

  for (const name of withId) {
    const userId = zaloIdMap[name];
    try {
      if (isDryRun) {
        console.log(`[DRY RUN] Sẽ gửi cho ${name} (${userId}):\n${message(name)}`);
      } else {
        await sendToUser(token, userId, message(name));
        console.log(`✅ Đã gửi cho ${name}`);
      }
      results.sent.push(name);
    } catch (e) {
      console.error(`❌ Lỗi gửi cho ${name}:`, e.message);
      results.failed.push(name);
      // Đưa vào broadcast fallback
      withoutId.push(name);
    }
  }

  // Broadcast cho những người chưa có Zalo ID
  if (withoutId.length > 0 && broadcastFallbackMessage) {
    const broadMsg = broadcastFallbackMessage(withoutId);
    try {
      if (isDryRun) {
        console.log(`[DRY RUN] Sẽ broadcast:\n${broadMsg}`);
      } else {
        await broadcastToFollowers(token, broadMsg);
        console.log(`📢 Đã broadcast cho ${withoutId.length} người không có ID cá nhân`);
      }
      results.broadcast = withoutId;
    } catch (e) {
      console.error('❌ Lỗi broadcast:', e.message);
    }
  }

  return results;
}

module.exports = { refreshAccessToken, sendToUser, broadcastToFollowers, sendReminder };
