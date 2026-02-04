/**
 * useRealTime Hook
 * Provides real-time clock with online/offline sync
 * 
 * Online: Fetches time from worldtimeapi.org
 * Offline: Tracks elapsed time from last sync
 */

import { useState, useEffect, useCallback } from 'react';

const SYNC_STORAGE_KEY = 'continuum_time_sync';
const SYNC_INTERVAL = 5 * 60 * 1000; // Re-sync every 5 minutes when online

/**
 * Get stored sync data
 */
function getSyncData() {
    try {
        const data = localStorage.getItem(SYNC_STORAGE_KEY);
        return data ? JSON.parse(data) : null;
    } catch {
        return null;
    }
}

/**
 * Store sync data
 */
function setSyncData(serverTime, localTime) {
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify({
        serverTime,
        localTime,
        syncedAt: new Date().toISOString(),
    }));
}

/**
 * Calculate current time from sync data
 */
function calculateTimeFromSync(syncData) {
    if (!syncData) return new Date();

    const elapsed = Date.now() - syncData.localTime;
    return new Date(syncData.serverTime + elapsed);
}

/**
 * Create a cross-browser timeout signal using AbortController
 * (AbortSignal.timeout is not supported in all browsers)
 */
function createTimeoutSignal(ms) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ms);
    // Clean up timeout if aborted for other reasons
    controller.signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });
    return controller.signal;
}

/**
 * Fetch time from online API
 */
async function fetchOnlineTime() {
    try {
        // Try worldtimeapi.org first
        const response = await fetch('https://worldtimeapi.org/api/ip', {
            signal: createTimeoutSignal(5000), // 5 second timeout
        });

        if (!response.ok) throw new Error('API error');

        const data = await response.json();
        return new Date(data.datetime);
    } catch {
        // Fallback: try timeapi.io with user's timezone (or default to local)
        try {
            const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const response = await fetch(`https://timeapi.io/api/Time/current/zone?timeZone=${encodeURIComponent(userTimezone)}`, {
                signal: createTimeoutSignal(5000),
            });

            if (!response.ok) throw new Error('Fallback API error');

            const data = await response.json();
            return new Date(data.dateTime);
        } catch {
            return null; // Both APIs failed
        }
    }
}

/**
 * useRealTime Hook
 * @returns {Object} { currentTime, isOnline, lastSyncTime, syncStatus, forceSync }
 */
export function useRealTime() {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [lastSyncTime, setLastSyncTime] = useState(null);
    const [syncStatus, setSyncStatus] = useState('initializing'); // 'synced', 'offline', 'syncing', 'error'

    // Force sync function
    const forceSync = useCallback(async () => {
        if (!navigator.onLine) {
            setSyncStatus('offline');
            return false;
        }

        setSyncStatus('syncing');
        const serverTime = await fetchOnlineTime();

        if (serverTime) {
            const serverMs = serverTime.getTime();
            const localMs = Date.now();
            setSyncData(serverMs, localMs);
            setLastSyncTime(new Date());
            setCurrentTime(serverTime);
            setSyncStatus('synced');
            return true;
        } else {
            setSyncStatus('error');
            return false;
        }
    }, []);

    // Initial sync on mount
    useEffect(() => {
        const initSync = async () => {
            // First, check if we have cached sync data
            const syncData = getSyncData();

            if (navigator.onLine) {
                // Online: Try to sync
                const success = await forceSync();
                if (!success && syncData) {
                    // Sync failed but we have cached data
                    setCurrentTime(calculateTimeFromSync(syncData));
                    setSyncStatus('offline');
                }
            } else if (syncData) {
                // Offline with cached data
                setCurrentTime(calculateTimeFromSync(syncData));
                setSyncStatus('offline');
                setLastSyncTime(new Date(syncData.syncedAt));
            } else {
                // No sync data, use local time
                setSyncStatus('offline');
            }
        };

        initSync();
    }, [forceSync]);

    // Update time every second
    useEffect(() => {
        const interval = setInterval(() => {
            const syncData = getSyncData();

            if (syncData) {
                setCurrentTime(calculateTimeFromSync(syncData));
            } else {
                setCurrentTime(new Date());
            }
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    // Periodic re-sync when online
    useEffect(() => {
        if (!isOnline) return;

        const syncInterval = setInterval(() => {
            forceSync();
        }, SYNC_INTERVAL);

        return () => clearInterval(syncInterval);
    }, [isOnline, forceSync]);

    // Listen for online/offline events
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            forceSync(); // Immediate sync when coming online
        };

        const handleOffline = () => {
            setIsOnline(false);
            setSyncStatus('offline');
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [forceSync]);

    return {
        currentTime,
        isOnline,
        lastSyncTime,
        syncStatus,
        forceSync,
    };
}

/**
 * Format time for display
 */
export function formatTime(date, includeSeconds = true) {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const h = hours % 12 || 12;
    const ampm = hours < 12 ? 'AM' : 'PM';

    const timeStr = `${h}:${minutes.toString().padStart(2, '0')}`;
    if (includeSeconds) {
        return `${timeStr}:${seconds.toString().padStart(2, '0')} ${ampm}`;
    }
    return `${timeStr} ${ampm}`;
}

/**
 * Format date for display
 */
export function formatDate(date) {
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

/**
 * Get formatted date string (YYYY-MM-DD)
 */
export function getDateStr(date) {
    return date.toISOString().split('T')[0];
}
