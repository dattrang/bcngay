// =============================================================
// FIREBASE MESSAGING SERVICE WORKER
// File này phải nằm ở thư mục gốc (cùng cấp với index.html)
// để Chrome có thể đăng ký Service Worker với scope rộng nhất.
// =============================================================

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyDH4I0_aM5bQXNlICEajcBaeAUdrxa_grc",
    authDomain: "baocaongay-78245.firebaseapp.com",
    projectId: "baocaongay-78245",
    storageBucket: "baocaongay-78245.firebasestorage.app",
    messagingSenderId: "131073359473",
    appId: "1:131073359473:web:bd9347416b34f085ab25d0",
    databaseURL: "https://baocaongay-78245-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const messaging = firebase.messaging();

// Xử lý thông báo khi tab ĐÓNG hoặc không ở focus
messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Nhận background message:', payload);

    const title = payload.notification?.title || '🔔 Nhắc nhở Công tác PCCC';
    const body  = payload.notification?.body  || 'Bạn có công việc chưa đánh giá!';

    const options = {
        body,
        icon:         'icon-192.png',
        badge:        'icon-192.png',
        tag:          'pccc-eval-reminder', // Gộp các thông báo cùng loại
        renotify:     true,                 // Rung lại dù tag trùng
        requireInteraction: true,           // Không tự đóng — buộc người dùng phải click
        vibrate:      [300, 100, 300, 100, 300],
        data:         payload.data || {}
    };

    return self.registration.showNotification(title, options);
});

// Khi người dùng click vào thông báo → mở/focus tab app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Nếu đã có tab app đang mở → focus vào đó
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            // Chưa có → mở tab mới
            return clients.openWindow('./');
        })
    );
});
