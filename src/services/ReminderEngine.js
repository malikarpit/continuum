/**
 * ReminderEngine - Smart reminder scheduling based on tasks, time blocks, and user preferences
 * Calculates when to send notifications and manages reminder state
 */

import { notificationService } from './NotificationService.js';

class ReminderEngine {
    constructor() {
        this.activeReminders = new Map(); // Map of entity ID -> scheduled reminder
        this.checkInterval = null;
        this.lastCheck = null;
        this.isRunning = false;

        // Default settings (can be overridden)
        this.settings = {
            enabled: true,
            taskReminders: true,
            mealReminders: true,
            trainingReminders: true,
            reminderLeadTime: 30, // minutes before deadline
            quietHoursStart: '22:00',
            quietHoursEnd: '07:00',
            missedTaskCheckDelay: 5, // minutes after deadline to check
        };

        // Meal reminder defaults (times when to remind)
        this.mealSchedule = {
            breakfast: { hour: 8, minute: 0 },
            lunch: { hour: 12, minute: 30 },
            dinner: { hour: 19, minute: 0 },
            snack: { hour: 16, minute: 0 },
        };
    }

    /**
     * Update engine settings
     * @param {Object} newSettings
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    /**
     * Start the reminder engine
     * @param {Function} getTasksFn - Function to get current tasks
     * @param {Function} getTimeBlocksFn - Function to get current time blocks
     * @param {Function} getMealsFn - Function to get logged meals
     * @param {Function} getTrainingFn - Function to get training schedule
     */
    start(getTasksFn, getTimeBlocksFn, getMealsFn, getTrainingFn) {
        if (this.isRunning) return;

        this.getTasksFn = getTasksFn;
        this.getTimeBlocksFn = getTimeBlocksFn;
        this.getMealsFn = getMealsFn;
        this.getTrainingFn = getTrainingFn;

        // Run immediately
        this.checkAndScheduleReminders();

        // Then check every minute
        this.checkInterval = setInterval(() => {
            this.checkAndScheduleReminders();
        }, 60000); // Every minute


    }

    /**
     * Stop the reminder engine
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        // Cancel all scheduled reminders
        notificationService.cancelAllScheduled();
        this.activeReminders.clear();
        this.isRunning = false;
    }

    /**
     * Check if current time is in quiet hours
     */
    isQuietHours() {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        const [startHour, startMin] = this.settings.quietHoursStart.split(':').map(Number);
        const [endHour, endMin] = this.settings.quietHoursEnd.split(':').map(Number);

        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        // Handle overnight quiet hours (e.g., 22:00 - 07:00)
        if (startMinutes > endMinutes) {
            return currentMinutes >= startMinutes || currentMinutes < endMinutes;
        }

        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }

    /**
     * Main check function - runs periodically
     */
    async checkAndScheduleReminders() {
        if (!this.settings.enabled || this.isQuietHours()) return;

        const now = new Date();
        this.lastCheck = now;

        try {
            // Check tasks
            if (this.settings.taskReminders && this.getTasksFn) {
                await this.checkTaskReminders();
            }

            // Check meals
            if (this.settings.mealReminders && this.getMealsFn) {
                await this.checkMealReminders();
            }

            // Check training
            if (this.settings.trainingReminders && this.getTrainingFn) {
                await this.checkTrainingReminders();
            }
        } catch (error) {
            console.error('Error checking reminders:', error);
        }
    }

    /**
     * Calculate task deadline based on time blocks
     * @param {Object} task - Task object
     * @param {Array} timeBlocks - Array of time blocks for today
     * @returns {Date|null} Deadline date or null
     */
    calculateTaskDeadline(task, timeBlocks = []) {
        const now = new Date();
        const today = now.toISOString().split('T')[0];

        // If task has explicit due time, use that
        if (task.dueTime) {
            const [hours, minutes] = task.dueTime.split(':').map(Number);
            const deadline = new Date(today);
            deadline.setHours(hours, minutes, 0, 0);
            return deadline;
        }

        // If task has a due date but no time, deadline is end of day
        if (task.dueDate) {
            const deadline = new Date(task.dueDate);
            deadline.setHours(23, 59, 59, 999);
            return deadline;
        }

        // If task is in a time block, use end of that block
        if (task.timeBlockId && timeBlocks.length > 0) {
            const block = timeBlocks.find(b => b.id === task.timeBlockId);
            if (block && block.endTime) {
                const [hours, minutes] = block.endTime.split(':').map(Number);
                const deadline = new Date(today);
                deadline.setHours(hours, minutes, 0, 0);
                return deadline;
            }
        }

        // No deadline determinable
        return null;
    }

    /**
     * Check and schedule task reminders
     */
    async checkTaskReminders() {
        const tasks = await Promise.resolve(this.getTasksFn());
        const timeBlocks = this.getTimeBlocksFn ? await Promise.resolve(this.getTimeBlocksFn()) : [];
        const now = new Date();
        const leadTimeMs = this.settings.reminderLeadTime * 60 * 1000;

        for (const task of tasks) {
            // Skip completed tasks
            if (task.completed || task.status === 'completed') continue;

            const deadline = this.calculateTaskDeadline(task, timeBlocks);
            if (!deadline) continue;

            const reminderKey = `task-${task.id}`;
            const alreadyScheduled = this.activeReminders.has(reminderKey);

            // Check if task is overdue (missed)
            if (deadline < now) {
                const missedKey = `missed-${task.id}`;
                if (!this.activeReminders.has(missedKey)) {
                    // Notify about missed task (with small delay)
                    const missedTime = new Date(deadline.getTime() + this.settings.missedTaskCheckDelay * 60 * 1000);
                    if (missedTime <= now) {
                        await notificationService.showMissedTask(task.name || task.title);
                        this.activeReminders.set(missedKey, true);
                    }
                }
                continue;
            }

            // Check if we should schedule a reminder
            const reminderTime = new Date(deadline.getTime() - leadTimeMs);

            if (reminderTime > now && !alreadyScheduled) {
                // Schedule reminder
                const scheduled = notificationService.scheduleNotification(
                    {
                        title: '📋 Task Reminder',
                        body: `"${task.name || task.title}" is due in ${this.settings.reminderLeadTime} minutes`,
                        type: 'task',
                        tag: reminderKey,
                        data: { taskId: task.id },
                    },
                    reminderTime
                );
                this.activeReminders.set(reminderKey, scheduled);
            } else if (reminderTime <= now && !alreadyScheduled && now < deadline) {
                // Show immediately if within lead time but not yet shown
                const timeLeft = Math.round((deadline - now) / 60000);
                await notificationService.showTaskReminder(task.name || task.title, `${timeLeft} minutes`);
                this.activeReminders.set(reminderKey, true);
            }
        }
    }

    /**
     * Check and show meal reminders
     */
    async checkMealReminders() {
        const now = new Date();
        const loggedMeals = await Promise.resolve(this.getMealsFn());
        const today = now.toISOString().split('T')[0];

        // Create a set of already logged meal types for today
        const loggedToday = new Set(
            loggedMeals
                .filter(meal => meal.date === today || (meal.createdAt && meal.createdAt.startsWith(today)))
                .map(meal => meal.type || meal.mealType)
        );

        // Check each meal type
        for (const [mealType, schedule] of Object.entries(this.mealSchedule)) {
            const reminderKey = `meal-${mealType}-${today}`;

            // Skip if already logged or already reminded
            if (loggedToday.has(mealType) || this.activeReminders.has(reminderKey)) {
                continue;
            }

            // Check if it's time for this meal
            const mealTime = new Date(today);
            mealTime.setHours(schedule.hour, schedule.minute, 0, 0);

            // Remind 15 minutes after scheduled meal time
            const reminderTime = new Date(mealTime.getTime() + 15 * 60 * 1000);
            // But don't remind too late (more than 2 hours after)
            const cutoffTime = new Date(mealTime.getTime() + 2 * 60 * 60 * 1000);

            if (now >= reminderTime && now < cutoffTime) {
                await notificationService.showMealReminder(mealType);
                this.activeReminders.set(reminderKey, true);
            }
        }
    }

    /**
     * Check and show training reminders
     */
    async checkTrainingReminders() {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

        const trainingData = await Promise.resolve(this.getTrainingFn());
        if (!trainingData) return;

        // Check if there's a workout planned for today
        const todaysWorkout = trainingData.weeklySchedule?.[dayOfWeek];
        if (!todaysWorkout || (Array.isArray(todaysWorkout) && todaysWorkout.length === 0)) {
            return; // Rest day or no plan
        }

        const workoutReminderKey = `training-${today}`;
        const followUpKey = `training-followup-${today}`;

        // Check if workout is already logged today
        const hasLoggedWorkout = trainingData.workoutHistory?.some(
            w => w.date === today || (w.startTime && w.startTime.startsWith(today))
        );

        if (hasLoggedWorkout) return;

        // Check if active workout is in progress
        if (trainingData.activeWorkout) return;

        // Remind at 9 AM if not already reminded
        const reminderHour = 9;
        if (now.getHours() >= reminderHour && !this.activeReminders.has(workoutReminderKey)) {
            const workoutName = Array.isArray(todaysWorkout)
                ? `${todaysWorkout.length} exercises`
                : 'your workout';
            await notificationService.showTrainingReminder(workoutName);
            this.activeReminders.set(workoutReminderKey, true);
        }

        // Follow-up at 2 PM if still not logged
        const followUpHour = 14;
        if (now.getHours() >= followUpHour && !this.activeReminders.has(followUpKey)) {
            await notificationService.showTrainingFollowUp();
            this.activeReminders.set(followUpKey, true);
        }
    }

    /**
     * Manually trigger a check (for testing or after data changes)
     */
    async forceCheck() {
        await this.checkAndScheduleReminders();
    }

    /**
     * Clear reminder state for a specific entity
     * @param {string} key - Reminder key (e.g., 'task-123')
     */
    clearReminder(key) {
        const scheduled = this.activeReminders.get(key);
        if (scheduled && typeof scheduled === 'object') {
            notificationService.cancelScheduledNotification(scheduled);
        }
        this.activeReminders.delete(key);
    }

    /**
     * Clear all reminder state (useful when day changes)
     */
    clearAllReminders() {
        notificationService.cancelAllScheduled();
        this.activeReminders.clear();
    }

    /**
     * Update meal schedule times
     * @param {Object} schedule - { breakfast: { hour, minute }, ... }
     */
    setMealSchedule(schedule) {
        this.mealSchedule = { ...this.mealSchedule, ...schedule };
    }
}

// Export singleton instance
export const reminderEngine = new ReminderEngine();
export default ReminderEngine;
