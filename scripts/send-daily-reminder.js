/**
 * Script gửi thông báo FCM nhắc nhở đánh giá cuối ngày
 * Chạy bởi GitHub Actions lúc 17:00 giờ Việt Nam mỗi ngày
 * KHÔNG cần Firebase Cloud Functions, KHÔNG cần thẻ tín dụng
 */

const admin = require('firebase-admin');

// Đọc Service Account từ GitHub Secrets (biến môi trường)
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error('❌ Thiếu biến môi trường FIREBASE_SERVICE_ACCOUNT!');
    process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://baocaongay-78245-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();
const messaging = admin.messaging();

// URL ứng dụng Netlify (đổi thành URL thật của bạn)
const APP_URL = process.env.APP_URL || 'https://your-app.netlify.app/';

async function main() {
    // Ngày hôm nay theo múi giờ Việt Nam
    const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
    console.log(`📅 Kiểm tra công việc ngày: ${todayStr}`);

    // Lấy tất cả công việc hôm nay
    const tasksSnap = await db.ref(`keHoachNgay/${todayStr}`).get();
    if (!tasksSnap.exists()) {
        console.log('✅ Không có công việc hôm nay. Không gửi thông báo.');
        process.exit(0);
    }

    const tasks = Object.values(tasksSnap.val());

    // Nhóm công việc chưa đánh giá theo cán bộ
    const pendingByStaff = {};
    tasks.forEach(task => {
        if (!task.danhGia || !task.danhGia.thoiDiemDanhGia) {
            const staff = task.nguoiPhuTrach;
            if (staff) pendingByStaff[staff] = (pendingByStaff[staff] || 0) + 1;
        }
    });

    const totalPending = Object.values(pendingByStaff).reduce((a, b) => a + b, 0);
    console.log(`📊 Tổng công việc chưa đánh giá: ${totalPending} của ${Object.keys(pendingByStaff).length} cán bộ`);

    if (totalPending === 0) {
        console.log('✅ Tất cả công việc đã được đánh giá! Không gửi thông báo.');
        process.exit(0);
    }

    // Lấy FCM tokens từ Firebase
    const tokensSnap = await db.ref('fcmTokens').get();
    if (!tokensSnap.exists()) {
        console.log('⚠️ Chưa có FCM token nào được đăng ký.');
        process.exit(0);
    }

    const tokens = tokensSnap.val();
    const messages = [];

    // Gửi thông báo cá nhân cho từng cán bộ còn việc chưa đánh giá
    for (const [staff, count] of Object.entries(pendingByStaff)) {
        const token = tokens[staff];
        if (!token) {
            console.log(`⚠️ Không có token cho: ${staff}`);
            continue;
        }
        messages.push({
            token,
            notification: {
                title: '⏰ Nhắc nhở đánh giá cuối ngày',
                body: `Đ/c ${staff} còn ${count} công việc chưa đánh giá kết quả hôm nay!`
            },
            webpush: {
                notification: { requireInteraction: true, tag: 'pccc-eval-reminder', renotify: true },
                fcmOptions: { link: APP_URL }
            },
            data: { staff, count: String(count), date: todayStr }
        });
    }

    // Gửi báo cáo tổng hợp cho Admin
    const adminToken = tokens['Admin'];
    if (adminToken) {
        const staffNames = Object.keys(pendingByStaff);
        const preview = staffNames.slice(0, 3).join(', ');
        const more = staffNames.length > 3 ? ` và ${staffNames.length - 3} người khác` : '';
        messages.push({
            token: adminToken,
            notification: {
                title: `📊 Báo cáo cuối ngày ${todayStr}`,
                body: `Còn ${totalPending} việc chưa đánh giá: ${preview}${more}`
            },
            webpush: {
                notification: { requireInteraction: true },
                fcmOptions: { link: APP_URL }
            }
        });
    }

    if (messages.length === 0) {
        console.log('⚠️ Không có token hợp lệ để gửi.');
        process.exit(0);
    }

    // Gửi tất cả thông báo
    console.log(`📤 Đang gửi ${messages.length} thông báo...`);
    const result = await messaging.sendEach(messages);
    console.log(`✅ Kết quả: ${result.successCount} thành công / ${result.failureCount} thất bại`);

    // Xóa token hết hạn
    const expiredStaff = [];
    result.responses.forEach((resp, idx) => {
        if (!resp.success) {
            console.log(`  ❌ [${idx}] ${resp.error?.code}: ${resp.error?.message}`);
            const code = resp.error?.code;
            if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
                const failedToken = messages[idx].token;
                for (const [staff, token] of Object.entries(tokens)) {
                    if (token === failedToken) expiredStaff.push(staff);
                }
            }
        }
    });

    if (expiredStaff.length > 0) {
        console.log(`🧹 Xóa ${expiredStaff.length} token hết hạn: ${expiredStaff.join(', ')}`);
        const updates = {};
        expiredStaff.forEach(s => { updates[`fcmTokens/${s}`] = null; });
        await db.ref().update(updates);
    }

    process.exit(0);
}

main().catch(e => {
    console.error('💥 Lỗi không xử lý được:', e);
    process.exit(1);
});
