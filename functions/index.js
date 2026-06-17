/**
 * Firebase Cloud Functions — Gửi thông báo nhắc đánh giá lúc 17:00 mỗi ngày
 *
 * CÁCH DEPLOY:
 * 1. Cài Node.js: https://nodejs.org (LTS)
 * 2. npm install -g firebase-tools
 * 3. firebase login
 * 4. firebase init functions  (chọn project baocaongay-78245, JavaScript, không dùng ESLint)
 * 5. Thay nội dung functions/index.js bằng file này
 * 6. cd functions && npm install
 * 7. firebase deploy --only functions
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onValueCreated } = require("firebase-functions/v2/database");
const { initializeApp }  = require("firebase-admin/app");
const { getDatabase }    = require("firebase-admin/database");
const { getMessaging }   = require("firebase-admin/messaging");

initializeApp();

// ================================================================
// HÀM 1: Scheduled — Chạy lúc 17:00 giờ Việt Nam mỗi ngày
// ================================================================
exports.dailyEvalReminder = onSchedule(
    {
        schedule:  "0 17 * * *",          // cron: 17:00 hàng ngày
        timeZone:  "Asia/Ho_Chi_Minh",
        region:    "asia-southeast1",
    },
    async () => {
        const db = getDatabase();

        // Lấy ngày hôm nay (YYYY-MM-DD theo múi giờ VN)
        const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });

        // Lấy tất cả công việc hôm nay
        const tasksSnap = await db.ref(`keHoachNgay/${todayStr}`).get();
        if (!tasksSnap.exists()) {
            console.log("Không có công việc hôm nay:", todayStr);
            return;
        }

        const tasks = tasksSnap.val();

        // Nhóm công việc chưa đánh giá theo cán bộ phụ trách
        const pendingByStaff = {};
        Object.values(tasks).forEach((task) => {
            if (!task.danhGia || !task.danhGia.thoiDiemDanhGia) {
                const staff = task.nguoiPhuTrach;
                if (staff) {
                    pendingByStaff[staff] = (pendingByStaff[staff] || 0) + 1;
                }
            }
        });

        const totalPending = Object.values(pendingByStaff).reduce((a, b) => a + b, 0);
        if (totalPending === 0) {
            console.log("Tất cả công việc đã được đánh giá. Không gửi thông báo.");
            return;
        }

        // Lấy FCM tokens đã lưu
        const tokensSnap = await db.ref("fcmTokens").get();
        if (!tokensSnap.exists()) {
            console.log("Chưa có FCM token nào được đăng ký.");
            return;
        }

        const tokens = tokensSnap.val(); // { "Nguyễn Văn A": "token_abc...", "Admin": "token_xyz..." }
        const messages = [];

        // Gửi thông báo cá nhân cho từng cán bộ còn việc chưa đánh giá
        for (const [staff, count] of Object.entries(pendingByStaff)) {
            const token = tokens[staff];
            if (!token) continue;

            messages.push({
                token,
                notification: {
                    title: "⏰ Nhắc nhở đánh giá cuối ngày",
                    body:  `Đ/c ${staff} còn ${count} công việc chưa đánh giá hôm nay!`,
                },
                webpush: {
                    notification: {
                        requireInteraction: true,
                        tag:      "pccc-eval-reminder",
                        renotify: true,
                    },
                    fcmOptions: { link: "https://your-app.netlify.app/" }, // ← ĐỔI URL NETLIFY CỦA BẠN
                },
                data: { staff, count: String(count), date: todayStr },
            });
        }

        // Gửi thống kê tổng hợp cho Admin
        const adminToken = tokens["Admin"];
        if (adminToken) {
            const staffList = Object.keys(pendingByStaff).join(", ");
            messages.push({
                token: adminToken,
                notification: {
                    title: `📊 Báo cáo cuối ngày ${todayStr}`,
                    body:  `Còn ${totalPending} việc chưa đánh giá của ${Object.keys(pendingByStaff).length} cán bộ: ${staffList}`,
                },
                webpush: {
                    notification: { requireInteraction: true },
                    fcmOptions:   { link: "https://your-app.netlify.app/" }, // ← ĐỔI URL NETLIFY CỦA BẠN
                },
            });
        }

        if (messages.length === 0) {
            console.log("Không có token hợp lệ để gửi.");
            return;
        }

        // Gửi tất cả (batch send)
        const messaging = getMessaging();
        const result = await messaging.sendEach(messages);
        console.log(`✅ Gửi thành công: ${result.successCount}/${messages.length}`);

        // Xóa token hết hạn / không hợp lệ
        const expiredStaff = [];
        result.responses.forEach((resp, idx) => {
            if (!resp.success) {
                const code = resp.error?.code;
                if (
                    code === "messaging/registration-token-not-registered" ||
                    code === "messaging/invalid-registration-token"
                ) {
                    const failedToken = messages[idx].token;
                    for (const [staff, token] of Object.entries(tokens)) {
                        if (token === failedToken) expiredStaff.push(staff);
                    }
                }
                console.warn(`Lỗi gửi [${idx}]:`, resp.error?.message);
            }
        });

        for (const staff of expiredStaff) {
            await db.ref(`fcmTokens/${staff}`).remove();
            console.log(`Đã xóa token hết hạn của: ${staff}`);
        }
    }
);

// ================================================================
// HÀM 2: Trigger — Admin gửi thông báo thủ công qua Firebase DB
// (Admin ghi vào pushRequests/{id} → Function gửi ngay)
// ================================================================
exports.sendManualPush = onValueCreated(
    {
        ref:    "/pushRequests/{requestId}",
        region: "asia-southeast1",
    },
    async (event) => {
        const db      = getDatabase();
        const payload = event.data.val(); // { title, body, targetStaff: "all" | "Tên CB" }

        if (!payload) return;

        const { title, body, targetStaff } = payload;

        // Xóa request sau khi đọc (chỉ gửi 1 lần)
        await event.data.ref.remove();

        const tokensSnap = await db.ref("fcmTokens").get();
        if (!tokensSnap.exists()) return;

        const tokens = tokensSnap.val();
        const messages = [];

        if (targetStaff === "all") {
            // Gửi cho tất cả
            for (const [, token] of Object.entries(tokens)) {
                messages.push({ token, notification: { title, body } });
            }
        } else {
            // Gửi cho một cán bộ cụ thể
            const token = tokens[targetStaff];
            if (token) messages.push({ token, notification: { title, body } });
        }

        if (messages.length > 0) {
            const messaging = getMessaging();
            const result = await messaging.sendEach(messages);
            console.log(`Manual push: ${result.successCount}/${messages.length} thành công`);
        }
    }
);
