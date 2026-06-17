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

    // Với Data-only message, payload.notification sẽ luôn undefined.
    // Đọc thông tin từ payload.data và tự hiển thị — đây là cách duy nhất không bị lặp.
    const d     = payload.data || {};
    const title = d.title || '🔔 Nhắc nhở Công tác PCCC';
    const body  = d.body  || 'Bạn có công việc cần chú ý!';
    const link  = d.link  || './';
    const tag   = d.tag   || 'pccc-reminder';

    const options = {
        body,
        icon:               'icon-192.png',
        badge:              'icon-192.png',
        tag,
        renotify:           true,
        requireInteraction: true,
        vibrate:            [300, 100, 300, 100, 300],
        data:               { url: link }
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
            return clients.openWindow(event.notification.data?.url || './');
        })
    );
});
