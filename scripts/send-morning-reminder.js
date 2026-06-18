/**
 * Script gửi thông báo FCM nhắc nhở lập kế hoạch lúc 9h sáng
 */
const admin = require('firebase-admin');

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error('❌ Thiếu biến môi trường FIREBASE_SERVICE_ACCOUNT!');
    process.exit(1);
}

let serviceAccount;
try {
    const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8');
    serviceAccount = JSON.parse(decoded);
} catch (e1) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
    } catch (e2) {
        console.error('❌ Lỗi đọc service account:', e2.message);
        process.exit(1);
    }
}
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://baocaongay-78245-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();
const messaging = admin.messaging();
const APP_URL = process.env.APP_URL || 'https://dattrang.github.io/bcngay/';

async function main() {
    const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
    console.log(`📅 Kiểm tra kế hoạch buổi sáng: ${todayStr}`);

    const tasksSnap = await db.ref(`keHoachNgay/${todayStr}`).get();
    const tasks = tasksSnap.exists() ? Object.values(tasksSnap.val()) : [];

    const staffWithTasks = new Set();
    tasks.forEach(t => {
        if (t.nguoiPhuTrach) staffWithTasks.add(t.nguoiPhuTrach);
    });

    const staffSnap = await db.ref('danhMucCanBo').get();
    const allStaffsData = staffSnap.exists() ? staffSnap.val() : {};
    
    // Xử lý trường hợp Firebase trả về Object thay vì Array (nếu danh sách bị xoá phần tử ở giữa)
    let allStaffs = [];
    if (Array.isArray(allStaffsData)) {
        allStaffs = allStaffsData.filter(Boolean);
    } else {
        allStaffs = Object.values(allStaffsData).filter(Boolean);
    }

    const tokensSnap = await db.ref('fcmTokens').get();
    const tokens = tokensSnap.exists() ? tokensSnap.val() : {};

    const messages = [];
    let staffWithoutTasksCount = 0;
    const staffNames = [];

    // Thống kê dựa trên TỔNG SỐ cán bộ trong danh mục (bất kể có dùng App hay không)
    allStaffs.forEach(s => {
        if (!s || !s.ten) return;
        if (!staffWithTasks.has(s.ten)) {
            staffWithoutTasksCount++;
            staffNames.push(s.ten);
            
            // Nếu cán bộ này có token FCM -> Gửi thông báo cá nhân
            const token = tokens[s.ten];
            if (token) {
                messages.push({
                    token,
                    notification: {
                        title: '⏰ Nhắc nhở lập chương trình ngày',
                        body: `Đ/c ${s.ten} chưa lập chương trình công tác cho ngày hôm nay!`
                    },
                    webpush: {
                        notification: { 
                            icon: 'icon-192.png',
                            badge: 'icon-192.png',
                            vibrate: [300, 100, 300, 100, 300],
                            requireInteraction: true, 
                            tag: 'pccc-morning-reminder', 
                            renotify: true 
                        },
                        fcmOptions: { link: APP_URL }
                    },
                    data: { staff: s.ten, type: 'morning_reminder', date: todayStr }
                });
            }
        }
    });

    // Luôn gửi báo cáo cho Admin dù có người thiếu hay không
    const adminToken = tokens['Admin'];
    if (adminToken) {
        let adminTitle = `📊 Báo cáo sáng ${todayStr}`;
        let adminBody = '';

        if (staffWithoutTasksCount > 0) {
            const preview = staffNames.slice(0, 3).join(', ');
            const more = staffNames.length > 3 ? ` và ${staffNames.length - 3} người khác` : '';
            adminBody = `Có ${staffWithoutTasksCount} người chưa lập kế hoạch: ${preview}${more}`;
        } else {
            adminBody = `Tuyệt vời! 100% cán bộ (${allStaffs.length} người) đã lập kế hoạch hôm nay.`;
        }

        messages.push({
            token: adminToken,
            notification: {
                title: adminTitle,
                body: adminBody
            },
            webpush: {
                notification: { 
                    icon: 'icon-192.png',
                    badge: 'icon-192.png',
                    requireInteraction: true,
                    tag: 'pccc-admin-morning'
                },
                fcmOptions: { link: APP_URL }
            }
        });
    }

    if (messages.length === 0) {
        console.log('⚠️ Không có token hợp lệ nào để gửi thông báo.');
        process.exit(0);
    }

    console.log(`📤 Đang gửi ${messages.length} thông báo buổi sáng...`);
    const result = await messaging.sendEach(messages);
    console.log(`✅ Kết quả: ${result.successCount} thành công / ${result.failureCount} thất bại`);

    const expiredStaff = [];
    result.responses.forEach((resp, idx) => {
        if (!resp.success) {
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
        console.log('🧹 Đang xóa các token hết hạn của:', expiredStaff);
        const updates = {};
        expiredStaff.forEach(s => updates[`fcmTokens/${s}`] = null);
        await db.ref().update(updates);
        console.log('✅ Đã xóa token hết hạn.');
    }
}

main().catch(console.error).finally(() => process.exit(0));
