// send-daily-reminder.js
// Chạy lúc ~17:07 VN — nhắc cán bộ chưa đánh giá kết quả công việc hôm nay
'use strict';

const { getDb, getTodayVN, formatDMY } = require('./utils/firebase');
const { sendReminder }                 = require('./utils/zalo');

async function main() {
  const today   = getTodayVN();
  const todayDMY = formatDMY(today);
  console.log(`[${new Date().toISOString()}] Bắt đầu nhắc cuối ngày — ${todayDMY}`);

  const db = getDb();

  // 1. Lấy danh sách cán bộ + Zalo ID mapping
  const [staffSnap, zaloSnap, tasksSnap] = await Promise.all([
    db.ref('danhMucCanBo').once('value'),
    db.ref('zaloIds').once('value'),         // { "Nguyễn Văn A": "zalo_user_id" }
    db.ref(`keHoachNgay/${today}`).once('value'),
  ]);

  const staffList = staffSnap.val() || [];
  const allNames  = staffList.map(s => (typeof s === 'string' ? s : s.ten));
  const zaloIdMap = zaloSnap.val() || {};

  // 2. Không có kế hoạch hôm nay → không nhắc
  if (!tasksSnap.exists()) {
    console.log('Không có kế hoạch nào hôm nay. Bỏ qua.');
    return;
  }

  const tasks = Object.values(tasksSnap.val());

  // 3. Tìm cán bộ có việc chưa đánh giá
  const unevalMap = {}; // { name: count }
  for (const t of tasks) {
    const name = t.nguoiPhuTrach;
    if (!name || !allNames.includes(name)) continue;
    if (!t.danhGia || !t.danhGia.thoiDiemDanhGia) {
      unevalMap[name] = (unevalMap[name] || 0) + 1;
    }
  }

  const unevalList = Object.entries(unevalMap)
    .sort((a, b) => b[1] - a[1])            // Người nhiều việc tồn lên trước
    .map(([name, count]) => ({ name, count }));

  if (unevalList.length === 0) {
    console.log('✅ Tất cả cán bộ đã đánh giá xong. Không cần nhắc.');
    return;
  }

  console.log(`Cần nhắc ${unevalList.length} cán bộ:`,
    unevalList.map(x => `${x.name}(${x.count})`).join(', '));

  const appUrl = process.env.APP_URL || '';
  const names  = unevalList.map(x => x.name);

  // 4. Gửi tin nhắn cá nhân (nếu có Zalo ID) hoặc broadcast
  await sendReminder({
    names,
    zaloIdMap,

    // Tin nhắn cá nhân — chỉ hiện số việc của người đó
    message: (name) => {
      const count = unevalMap[name];
      return [
        `⏰ NHẮC NHỞ — ${todayDMY}`,
        ``,
        `Đ/c ${name} ơi, bạn còn ${count} công việc hôm nay chưa được đánh giá kết quả.`,
        `Vui lòng hoàn thành trước 17:30 để kịp thống kê.`,
        appUrl ? `\n🔗 Vào hệ thống: ${appUrl}` : '',
      ].filter(Boolean).join('\n');
    },

    // Broadcast cho người chưa có Zalo ID — hiện cả danh sách
    broadcastFallbackMessage: (remaining) => {
      const lines = remaining.map(n => `  • ${n}: ${unevalMap[n]} việc`);
      return [
        `⏰ NHẮC NHỞ ĐÁNH GIÁ CUỐI NGÀY — ${todayDMY}`,
        ``,
        `Các đồng chí dưới đây còn việc chưa đánh giá kết quả:`,
        ...lines,
        ``,
        `Vui lòng vào hệ thống hoàn thành trước 17:30.`,
        appUrl ? `🔗 ${appUrl}` : '',
      ].filter(Boolean).join('\n');
    },
  });

  console.log(`[${new Date().toISOString()}] Hoàn thành.`);
}

main().catch(e => {
  console.error('Lỗi không xử lý được:', e);
  process.exit(1);
});
