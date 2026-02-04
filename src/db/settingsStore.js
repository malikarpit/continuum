/**
 * Settings Store
 * Manages application settings with persistence
 */

import { getDB, STORES } from './database';

/**
 * Default settings
 */
export const DEFAULT_SETTINGS = {
    // Day Management
    dayBoundaryHour: 4, // Day starts at 4 AM

    // Gym Schedule
    gymSchedule: [1, 2, 3, 4, 5, 6], // Mon-Sat (0=Sun, 6=Sat)
    gymClosedDays: [0], // Sunday

    // Notifications
    notificationsEnabled: false,
    reminderTimes: {
        morningCheckin: '06:00',
        lunchReminder: '12:30',
        workoutReminder: '18:00',
        nightReview: '22:00',
    },

    // User Profile (for macro calculations)
    profile: {
        bodyWeight: 70, // kg
        height: 175, // cm
        age: 25,
        activityLevel: 'moderate', // sedentary, light, moderate, active, very_active
    },

    // Nutrition Phase
    nutritionPhase: 'maintain', // bulk, cut, maintain

    // Display Preferences
    theme: 'dark',
    compactMode: false,
    showMacros: true,

    // Push-up Progression
    pushupProgression: {
        enabled: true,
        currentLevel: 'wall', // wall, incline, knee, standard, decline, one_arm
        currentReps: 10,
        targetReps: 15,
        lastUpdated: null,
    },
};

/**
 * Get all settings
 */
export async function getSettings() {
    const db = await getDB();
    const saved = await db.get(STORES.SETTINGS, 'appSettings');

    return {
        ...DEFAULT_SETTINGS,
        ...(saved?.value || {}),
    };
}

/**
 * Save settings
 */
export async function saveSettings(settings) {
    const db = await getDB();
    await db.put(STORES.SETTINGS, {
        key: 'appSettings',
        value: settings,
    });
    return settings;
}

/**
 * Update specific setting
 */
export async function updateSetting(key, value) {
    const current = await getSettings();
    const updated = {
        ...current,
        [key]: value,
    };
    return saveSettings(updated);
}

/**
 * Push-up Progression Levels
 */
export const PUSHUP_LEVELS = {
    WALL: {
        id: 'wall',
        name: 'Wall Push-ups',
        description: 'Standing push-ups against a wall',
        difficulty: 1,
        targetReps: 15,
        nextLevel: 'incline',
    },
    INCLINE: {
        id: 'incline',
        name: 'Incline Push-ups',
        description: 'Push-ups on elevated surface (table, bench)',
        difficulty: 2,
        targetReps: 15,
        nextLevel: 'knee',
    },
    KNEE: {
        id: 'knee',
        name: 'Knee Push-ups',
        description: 'Modified push-ups on knees',
        difficulty: 3,
        targetReps: 15,
        nextLevel: 'standard',
    },
    STANDARD: {
        id: 'standard',
        name: 'Standard Push-ups',
        description: 'Full push-ups with proper form',
        difficulty: 4,
        targetReps: 20,
        nextLevel: 'decline',
    },
    DECLINE: {
        id: 'decline',
        name: 'Decline Push-ups',
        description: 'Feet elevated push-ups',
        difficulty: 5,
        targetReps: 15,
        nextLevel: 'one_arm',
    },
    ONE_ARM: {
        id: 'one_arm',
        name: 'One-Arm Push-ups',
        description: 'Single arm push-ups (each side)',
        difficulty: 6,
        targetReps: 5,
        nextLevel: null, // Max level
    },
};

/**
 * Get current push-up level info
 */
export async function getPushupProgress() {
    const settings = await getSettings();
    const levelId = settings.pushupProgression?.currentLevel || 'wall';
    const level = Object.values(PUSHUP_LEVELS).find(l => l.id === levelId) || PUSHUP_LEVELS.WALL;

    return {
        level,
        currentReps: settings.pushupProgression?.currentReps || 0,
        targetReps: level.targetReps,
        progress: Math.round((settings.pushupProgression?.currentReps || 0) / level.targetReps * 100),
        readyToProgress: (settings.pushupProgression?.currentReps || 0) >= level.targetReps,
        nextLevel: level.nextLevel ? PUSHUP_LEVELS[level.nextLevel.toUpperCase()] : null,
    };
}

/**
 * Update push-up progress
 */
export async function updatePushupProgress(reps) {
    const settings = await getSettings();
    const currentLevel = Object.values(PUSHUP_LEVELS).find(
        l => l.id === settings.pushupProgression?.currentLevel
    ) || PUSHUP_LEVELS.WALL;

    let newLevel = settings.pushupProgression?.currentLevel || 'wall';
    let newReps = reps;

    // Check for level up
    if (reps >= currentLevel.targetReps && currentLevel.nextLevel) {
        newLevel = currentLevel.nextLevel;
        newReps = 0; // Reset reps for new level
    }

    return updateSetting('pushupProgression', {
        ...settings.pushupProgression,
        currentLevel: newLevel,
        currentReps: newReps,
        lastUpdated: new Date().toISOString(),
    });
}

/**
 * Check if notifications are supported
 */
export function areNotificationsSupported() {
    return 'Notification' in window;
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission() {
    if (!areNotificationsSupported()) {
        return 'unsupported';
    }

    const permission = await Notification.requestPermission();
    return permission;
}

/**
 * Send notification (if enabled and permitted)
 */
export async function sendNotification(title, body, options = {}) {
    const settings = await getSettings();

    if (!settings.notificationsEnabled) {
        return null;
    }

    if (!areNotificationsSupported()) {
        return null;
    }

    if (Notification.permission !== 'granted') {
        return null;
    }

    return new Notification(title, {
        body,
        icon: '/icons/icon-192.png',
        ...options,
    });
}

/**
 * Schedule reminder (using service worker for background)
 */
export async function scheduleReminder(type, time, message) {
    // For now, just log - full implementation would use service worker
    console.log('[Settings] Would schedule reminder:', { type, time, message });

    // Store in settings for service worker to pick up
    const settings = await getSettings();
    const reminders = settings.scheduledReminders || [];

    reminders.push({
        id: `reminder_${Date.now()}`,
        type,
        time,
        message,
        enabled: true,
    });

    return updateSetting('scheduledReminders', reminders);
}
