// send-morning-reminder.js
// Chạy lúc ~09:13 VN — nhắc cán bộ chưa lập kế hoạch sáng nay
'use strict';

const { getDb, getTodayVN, formatDMY } = require('./utils/firebase');
const { sendReminder }                 = require('./utils/zalo');

async function main() {
  const today    = getTodayVN();
  const todayDMY = formatDMY(today);
  console.log(`[${new Date().toISOString()}] Bắt đầu nhắc buổi sáng — ${todayDMY}`);

  const db = getDb();

  // 1. Lấy song song danh sách cán bộ, Zalo ID, và kế hoạch hôm nay
  const [staffSnap, zaloSnap, tasksSnap] = await Promise.all([
    db.ref('danhMucCanBo').once('value'),
    db.ref('zaloIds').once('value'),
    db.ref(`keHoachNgay/${today}`).once('value'),
  ]);

  const staffList = staffSnap.val() || [];
  const allNames  = staffList.map(s => (typeof s === 'string' ? s : s.ten));
  const zaloIdMap = zaloSnap.val() || {};

  // 2. Ai đã có ít nhất 1 công việc hôm nay?
  const hasPlanned = new Set();
  if (tasksSnap.exists()) {
    Object.values(tasksSnap.val()).forEach(t => {
      if (t.nguoiPhuTrach) hasPlanned.add(t.nguoiPhuTrach);
    });
  }

  // 3. Ai chưa lập kế hoạch?
  const noplan = allNames.filter(n => !hasPlanned.has(n));

  if (noplan.length === 0) {
    console.log('✅ Tất cả cán bộ đã lập kế hoạch. Không cần nhắc.');
    return;
  }

  console.log(`Cần nhắc ${noplan.length} cán bộ chưa lập kế hoạch:`, noplan.join(', '));

  const appUrl = process.env.APP_URL || '';

  // 4. Gửi tin nhắn
  await sendReminder({
    names: noplan,
    zaloIdMap,

    // Tin nhắn cá nhân
    message: (name) => [
      `🌅 NHẮC LẬP KẾ HOẠCH — ${todayDMY}`,
      ``,
      `Đ/c ${name} ơi, bạn chưa lập chương trình công tác hôm nay.`,
      `Vui lòng vào hệ thống đăng ký kế hoạch trước 09:30.`,
      appUrl ? `\n🔗 Vào hệ thống: ${appUrl}` : '',
    ].filter(Boolean).join('\n'),

    // Broadcast cho người không có Zalo ID
    broadcastFallbackMessage: (remaining) => [
      `🌅 NHẮC LẬP KẾ HOẠCH BUỔI SÁNG — ${todayDMY}`,
      ``,
      `Các đồng chí dưới đây chưa lập chương trình công tác hôm nay:`,
      ...remaining.map(n => `  • ${n}`),
      ``,
      `Vui lòng vào hệ thống đăng ký kế hoạch trước 09:30.`,
      appUrl ? `🔗 ${appUrl}` : '',
    ].filter(Boolean).join('\n'),
  });

  console.log(`[${new Date().toISOString()}] Hoàn thành.`);
}

main().catch(e => {
  console.error('Lỗi không xử lý được:', e);
  process.exit(1);
});
