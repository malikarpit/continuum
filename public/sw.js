/**
 * Continuum Service Worker
 * Handles background notifications even when the app is not in focus
 */

const CACHE_NAME = 'continuum-v1';
const NOTIFICATION_TAG = 'continuum-reminder';

// Install event - cache essential files
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker');
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Handle push notifications
self.addEventListener('push', (event) => {
    console.log('[SW] Push received');

    let data = {
        title: 'Continuum Reminder',
        body: 'You have a reminder',
        icon: '/continuum/favicon.ico',
        badge: '/continuum/favicon.ico',
        tag: NOTIFICATION_TAG,
    };

    if (event.data) {
        try {
            const payload = event.data.json();
            data = { ...data, ...payload };
        } catch (e) {
            data.body = event.data.text();
        }
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon,
            badge: data.badge,
            tag: data.tag,
            vibrate: [200, 100, 200],
            requireInteraction: true,
            actions: [
                { action: 'open', title: 'Open App' },
                { action: 'dismiss', title: 'Dismiss' },
            ],
            data: data,
        })
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked');
    event.notification.close();

    if (event.action === 'dismiss') {
        return;
    }

    // Open or focus the app
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // If there's already a window open, focus it
            for (const client of clientList) {
                if (client.url.includes('/continuum') && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise, open a new window
            if (clients.openWindow) {
                return clients.openWindow('/continuum/');
            }
        })
    );
});

// Handle background sync for reminders
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync:', event.tag);

    if (event.tag === 'check-reminders') {
        event.waitUntil(checkAndSendReminders());
    }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
    console.log('[SW] Periodic sync:', event.tag);

    if (event.tag === 'check-reminders') {
        event.waitUntil(checkAndSendReminders());
    }
});

// Check for pending reminders
async function checkAndSendReminders() {
    try {
        // Get stored reminders from IndexedDB
        const reminders = await getStoredReminders();
        const now = Date.now();

        for (const reminder of reminders) {
            if (reminder.scheduledTime <= now && !reminder.sent) {
                await sendReminderNotification(reminder);
                await markReminderAsSent(reminder.id);
            }
        }
    } catch (error) {
        console.error('[SW] Error checking reminders:', error);
    }
}

// Send a reminder notification
async function sendReminderNotification(reminder) {
    const icons = {
        task: '📋',
        meal: '🍽️',
        training: '💪',
        general: '🔔',
    };

    return self.registration.showNotification(
        `${icons[reminder.type] || '🔔'} ${reminder.title}`,
        {
            body: reminder.message,
            icon: '/continuum/favicon.ico',
            badge: '/continuum/favicon.ico',
            tag: `${NOTIFICATION_TAG}-${reminder.id}`,
            vibrate: [200, 100, 200],
            requireInteraction: reminder.type === 'task',
            data: reminder,
        }
    );
}

// IndexedDB helpers for reminders
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('continuum-sw', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('reminders')) {
                db.createObjectStore('reminders', { keyPath: 'id' });
            }
        };
    });
}

async function getStoredReminders() {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['reminders'], 'readonly');
            const store = transaction.objectStore('reminders');
            const request = store.getAll();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result || []);
        });
    } catch (error) {
        console.error('[SW] Error getting reminders:', error);
        return [];
    }
}

async function markReminderAsSent(id) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['reminders'], 'readwrite');
            const store = transaction.objectStore('reminders');
            const request = store.get(id);

            request.onsuccess = () => {
                const reminder = request.result;
                if (reminder) {
                    reminder.sent = true;
                    store.put(reminder);
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('[SW] Error marking reminder as sent:', error);
    }
}

// Message handler for communication with main app
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);

    const { type, payload } = event.data;

    switch (type) {
        case 'SCHEDULE_REMINDER':
            scheduleReminder(payload);
            break;
        case 'CANCEL_REMINDER':
            cancelReminder(payload.id);
            break;
        case 'CHECK_REMINDERS':
            checkAndSendReminders();
            break;
    }
});

// Schedule a reminder
async function scheduleReminder(reminder) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['reminders'], 'readwrite');
            const store = transaction.objectStore('reminders');
            store.put({
                ...reminder,
                id: reminder.id || `reminder_${Date.now()}`,
                sent: false,
            });
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    } catch (error) {
        console.error('[SW] Error scheduling reminder:', error);
    }
}

// Cancel a reminder
async function cancelReminder(id) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['reminders'], 'readwrite');
            const store = transaction.objectStore('reminders');
            store.delete(id);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    } catch (error) {
        console.error('[SW] Error canceling reminder:', error);
    }
}

console.log('[SW] Service Worker loaded');
