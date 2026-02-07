/**
 * NotificationService - Browser notification system with custom sounds
 * Handles permission requests, notification display, and sound playback
 */

class NotificationService {
    constructor() {
        this.permission = 'default';
        this.soundEnabled = true;
        this.defaultSound = '/notification.mp3'; // Default notification sound
        this.customSounds = {
            task: '/sounds/task-reminder.mp3',
            meal: '/sounds/meal-reminder.mp3',
            training: '/sounds/training-reminder.mp3',
            general: '/sounds/notification.mp3',
        };
        this.audioContext = null;
        this.notificationQueue = [];
        this.isProcessingQueue = false;

        // Initialize on construction
        this.init();
    }

    /**
     * Initialize the notification service
     */
    async init() {
        // Check if browser supports notifications
        if (!('Notification' in window)) {
            console.warn('This browser does not support notifications');
            return;
        }

        // Get current permission status
        this.permission = Notification.permission;

        // Pre-create audio context (needs user interaction first time)
        this.initAudioContext();
    }

    /**
     * Initialize Web Audio API context
     */
    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported:', e);
        }
    }

    /**
     * Request notification permission from user
     * @returns {Promise<string>} Permission status
     */
    async requestPermission() {
        if (!('Notification' in window)) {
            return 'denied';
        }

        try {
            this.permission = await Notification.requestPermission();
            return this.permission;
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            return 'denied';
        }
    }

    /**
     * Check if notifications are allowed
     * @returns {boolean}
     */
    isPermissionGranted() {
        return this.permission === 'granted';
    }

    /**
     * Play a notification sound
     * @param {string} soundType - Type of sound (task, meal, training, general)
     * @param {string} customSoundUrl - Optional custom sound URL
     */
    async playSound(soundType = 'general', customSoundUrl = null) {
        if (!this.soundEnabled) return;

        const soundUrl = customSoundUrl || this.customSounds[soundType] || this.customSounds.general;

        try {
            // Try HTML5 Audio first (simpler)
            const audio = new Audio(soundUrl);
            audio.volume = 0.7;
            await audio.play();
        } catch (error) {
            console.warn('Could not play notification sound:', error);
            // Fallback: try Web Audio API oscillator beep
            this.playFallbackBeep();
        }
    }

    /**
     * Fallback beep using Web Audio API
     */
    playFallbackBeep() {
        if (!this.audioContext) {
            this.initAudioContext();
        }

        if (!this.audioContext) return;

        try {
            // Resume audio context if suspended
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }

            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.frequency.value = 880; // A5 note
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.3);
        } catch (error) {
            console.warn('Could not play fallback beep:', error);
        }
    }

    /**
     * Show a notification
     * @param {Object} options - Notification options
     * @param {string} options.title - Notification title
     * @param {string} options.body - Notification body text
     * @param {string} options.icon - Icon URL
     * @param {string} options.tag - Unique tag to prevent duplicates
     * @param {string} options.type - Notification type (task, meal, training, general)
     * @param {boolean} options.playSound - Whether to play sound
     * @param {string} options.customSound - Custom sound URL
     * @param {Object} options.data - Custom data to pass to click handler
     * @param {Function} options.onClick - Click handler
     * @returns {Promise<Notification|null>}
     */
    async show({
        title,
        body,
        icon = '/icon-192.png',
        tag,
        type = 'general',
        playSound = true,
        customSound = null,
        data = {},
        onClick = null,
    }) {
        // Check permission
        if (!this.isPermissionGranted()) {
            const permission = await this.requestPermission();
            if (permission !== 'granted') {
                console.warn('Notification permission not granted');
                return null;
            }
        }

        try {
            // Create and show notification
            const notification = new Notification(title, {
                body,
                icon,
                tag,
                badge: '/icon-72.png',
                vibrate: [200, 100, 200],
                requireInteraction: false,
                data,
            });

            // Handle click
            if (onClick) {
                notification.onclick = (event) => {
                    event.preventDefault();
                    onClick(data);
                    notification.close();
                };
            }

            // Play sound
            if (playSound) {
                await this.playSound(type, customSound);
            }

            // Auto-close after 10 seconds
            setTimeout(() => {
                notification.close();
            }, 10000);

            return notification;
        } catch (error) {
            console.error('Error showing notification:', error);
            return null;
        }
    }

    /**
     * Queue a notification for later display
     * @param {Object} options - Same as show()
     * @param {Date|number} displayAt - When to show the notification
     */
    scheduleNotification(options, displayAt) {
        const delay = displayAt instanceof Date
            ? displayAt.getTime() - Date.now()
            : displayAt - Date.now();

        if (delay <= 0) {
            // Show immediately
            this.show(options);
            return;
        }

        // Schedule for future
        const scheduledNotification = {
            options,
            displayAt,
            timeoutId: setTimeout(() => {
                this.show(options);
                // Remove from queue
                const index = this.notificationQueue.findIndex(n => n.timeoutId === scheduledNotification.timeoutId);
                if (index > -1) {
                    this.notificationQueue.splice(index, 1);
                }
            }, delay),
        };

        this.notificationQueue.push(scheduledNotification);
        return scheduledNotification;
    }

    /**
     * Cancel a scheduled notification
     * @param {Object} scheduledNotification - The scheduled notification object
     */
    cancelScheduledNotification(scheduledNotification) {
        if (scheduledNotification && scheduledNotification.timeoutId) {
            clearTimeout(scheduledNotification.timeoutId);
            const index = this.notificationQueue.indexOf(scheduledNotification);
            if (index > -1) {
                this.notificationQueue.splice(index, 1);
            }
        }
    }

    /**
     * Cancel all scheduled notifications
     */
    cancelAllScheduled() {
        this.notificationQueue.forEach(n => clearTimeout(n.timeoutId));
        this.notificationQueue = [];
    }

    /**
     * Enable/disable sounds
     * @param {boolean} enabled
     */
    setSoundEnabled(enabled) {
        this.soundEnabled = enabled;
    }

    /**
     * Set a custom sound for a notification type
     * @param {string} type - Notification type
     * @param {string} soundUrl - Sound file URL
     */
    setCustomSound(type, soundUrl) {
        this.customSounds[type] = soundUrl;
    }

    // ============================================
    // Convenience methods for specific notification types
    // ============================================

    /**
     * Show a task reminder notification
     */
    async showTaskReminder(taskName, dueIn = '30 minutes') {
        return this.show({
            title: '📋 Task Reminder',
            body: `"${taskName}" is due in ${dueIn}`,
            type: 'task',
            tag: `task-${taskName}`,
        });
    }

    /**
     * Show a missed task notification
     */
    async showMissedTask(taskName) {
        return this.show({
            title: '⚠️ Missed Task',
            body: `"${taskName}" was not completed`,
            type: 'task',
            tag: `missed-${taskName}`,
        });
    }

    /**
     * Show a meal logging reminder
     */
    async showMealReminder(mealType) {
        const mealEmojis = {
            breakfast: '🌅',
            lunch: '☀️',
            dinner: '🌙',
            snack: '🍎',
        };
        return this.show({
            title: `${mealEmojis[mealType] || '🍽️'} Time to log ${mealType}!`,
            body: `Don't forget to track your ${mealType} for today.`,
            type: 'meal',
            tag: `meal-${mealType}`,
        });
    }

    /**
     * Show a training reminder
     */
    async showTrainingReminder(workoutName = 'your workout') {
        return this.show({
            title: '💪 Training Time!',
            body: `Time for ${workoutName}. Get moving!`,
            type: 'training',
            tag: 'training-reminder',
        });
    }

    /**
     * Show a training follow-up if not logged
     */
    async showTrainingFollowUp() {
        return this.show({
            title: '🏋️ Log Your Workout',
            body: 'Did you complete your workout? Don\'t forget to log it!',
            type: 'training',
            tag: 'training-followup',
        });
    }
}

// Export singleton instance
export const notificationService = new NotificationService();
export default NotificationService;
