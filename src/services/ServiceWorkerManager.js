/**
 * ServiceWorkerManager - Handles Service Worker registration and communication
 * For background notifications and offline support
 */

class ServiceWorkerManager {
    constructor() {
        this.registration = null;
        this.isSupported = 'serviceWorker' in navigator;
    }

    /**
     * Register the service worker
     */
    async register() {
        if (!this.isSupported) {
            console.warn('[SWManager] Service Workers not supported');
            return null;
        }

        try {
            this.registration = await navigator.serviceWorker.register('/continuum/sw.js', {
                scope: '/continuum/',
            });



            // Wait for the service worker to be ready
            await navigator.serviceWorker.ready;
            // console.log('[SWManager] Service Worker ready');

            return this.registration;
        } catch (error) {
            console.error('[SWManager] Service Worker registration failed:', error);
            return null;
        }
    }

    /**
     * Request notification permission
     */
    async requestNotificationPermission() {
        if (!('Notification' in window)) {
            console.warn('[SWManager] Notifications not supported');
            return 'denied';
        }

        if (Notification.permission === 'granted') {
            return 'granted';
        }

        try {
            const permission = await Notification.requestPermission();
            return permission;
        } catch (error) {
            console.error('[SWManager] Error requesting notification permission:', error);
            return 'denied';
        }
    }

    /**
     * Send a message to the service worker
     */
    async postMessage(message) {
        if (!this.registration?.active) {
            console.warn('[SWManager] No active service worker');
            return;
        }

        this.registration.active.postMessage(message);
    }

    /**
     * Schedule a reminder through the service worker
     */
    async scheduleReminder(reminder) {
        await this.postMessage({
            type: 'SCHEDULE_REMINDER',
            payload: reminder,
        });
    }

    /**
     * Cancel a scheduled reminder
     */
    async cancelReminder(id) {
        await this.postMessage({
            type: 'CANCEL_REMINDER',
            payload: { id },
        });
    }

    /**
     * Trigger a check for pending reminders
     */
    async checkReminders() {
        await this.postMessage({
            type: 'CHECK_REMINDERS',
        });
    }

    /**
     * Check if the service worker is active
     */
    isActive() {
        return !!this.registration?.active;
    }

    /**
     * Request permission for periodic background sync
     */
    async requestPeriodicSync() {
        if (!this.registration) return false;

        try {
            const status = await navigator.permissions.query({
                name: 'periodic-background-sync',
            });

            if (status.state === 'granted') {
                await this.registration.periodicSync.register('check-reminders', {
                    minInterval: 60 * 60 * 1000, // Every hour
                });
                // console.log('[SWManager] Periodic sync registered');
                return true;
            }
        } catch (error) {
            // console.log('[SWManager] Periodic sync not supported:', error.message);
        }

        return false;
    }
}

export const swManager = new ServiceWorkerManager();
export default ServiceWorkerManager;
