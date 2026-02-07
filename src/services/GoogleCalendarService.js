/**
 * GoogleCalendarService - Sync events with Google Calendar API
 * Handles training schedules, task deadlines, and meal reminders
 */

import { googleAuth } from './GoogleAuthService';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const SYNC_STATE_KEY = 'continuum_google_calendar_sync';

class GoogleCalendarService {
    constructor() {
        this.calendarId = 'primary'; // Use primary calendar by default
        this.lastSyncTime = null;
        this.continuumCalendarId = null; // Optional separate calendar for Continuum
    }

    /**
     * Initialize and optionally create Continuum calendar
     */
    async init() {
        if (!googleAuth.isAuthenticated()) {
            throw new Error('Not authenticated with Google');
        }

        try {
            // Load sync state first
            const syncState = localStorage.getItem(SYNC_STATE_KEY);
            if (syncState) {
                const state = JSON.parse(syncState);
                this.lastSyncTime = state.lastSync;
                // If we have a saved ID, verify it still exists
                if (state.continuumCalendarId) {
                    try {
                        const response = await googleAuth.apiRequest(`${CALENDAR_API_BASE}/calendars/${state.continuumCalendarId}`);
                        if (response.ok) {
                            this.continuumCalendarId = state.continuumCalendarId;
                            return this.continuumCalendarId;
                        }
                    } catch (e) {
                        console.log('Saved calendar ID not found, will search/create');
                    }
                }
            }

            // Look for existing Continuum calendar
            const calendars = await this.getCalendars();
            const continuumCal = calendars.find(c => c.summary === 'Continuum');

            if (continuumCal) {
                this.continuumCalendarId = continuumCal.id;
            } else {
                // Create it if it doesn't exist
                try {
                    const newCal = await this.createContinuumCalendar();
                    this.continuumCalendarId = newCal.id;
                } catch (e) {
                    console.error('Failed to create Continuum calendar, falling back to primary', e);
                    this.continuumCalendarId = 'primary';
                }
            }

            this.saveSyncState();
            return this.continuumCalendarId;
        } catch (error) {
            console.error('Calendar init error:', error);
            throw error;
        }
    }

    /**
     * Get list of user's calendars
     */
    async getCalendars() {
        const response = await googleAuth.apiRequest(`${CALENDAR_API_BASE}/users/me/calendarList`);
        const data = await response.json();
        return data.items || [];
    }

    /**
     * Create a Continuum-specific calendar (optional)
     */
    async createContinuumCalendar() {
        const response = await googleAuth.apiRequest(
            `${CALENDAR_API_BASE}/calendars`,
            {
                method: 'POST',
                body: JSON.stringify({
                    summary: 'Continuum',
                    description: 'Events synced from Continuum app',
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                }),
            }
        );

        if (!response.ok) {
            throw new Error('Failed to create Continuum calendar');
        }

        const calendar = await response.json();
        this.continuumCalendarId = calendar.id;

        // Save to sync state
        this.saveSyncState();

        return calendar;
    }

    /**
     * Get events from calendar
     * @param {Date} timeMin - Start of time range
     * @param {Date} timeMax - End of time range
     * @param {string} calendarId - Calendar to query
     */
    async getEvents(timeMin = null, timeMax = null, calendarId = null) {
        const calId = calendarId || this.calendarId;

        const params = new URLSearchParams({
            singleEvents: 'true',
            orderBy: 'startTime',
            maxResults: '100',
        });

        if (timeMin) {
            params.set('timeMin', timeMin.toISOString());
        }
        if (timeMax) {
            params.set('timeMax', timeMax.toISOString());
        }

        const response = await googleAuth.apiRequest(
            `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calId)}/events?${params}`
        );
        const data = await response.json();
        return data.items || [];
    }

    /**
     * Get events for today
     */
    async getTodayEvents(calendarId = null) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        return this.getEvents(today, tomorrow, calendarId);
    }

    /**
     * Create an event in Google Calendar
     */
    async createEvent(event, calendarId = null) {
        const calId = calendarId || this.calendarId;

        const response = await googleAuth.apiRequest(
            `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calId)}/events`,
            {
                method: 'POST',
                body: JSON.stringify(event),
            }
        );

        if (!response.ok) {
            throw new Error('Failed to create event');
        }

        return response.json();
    }

    /**
     * Update an event
     */
    async updateEvent(eventId, event, calendarId = null) {
        const calId = calendarId || this.calendarId;

        const response = await googleAuth.apiRequest(
            `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calId)}/events/${eventId}`,
            {
                method: 'PATCH',
                body: JSON.stringify(event),
            }
        );

        if (!response.ok) {
            throw new Error('Failed to update event');
        }

        return response.json();
    }

    /**
     * Delete an event
     */
    async deleteEvent(eventId, calendarId = null) {
        const calId = calendarId || this.calendarId;

        const response = await googleAuth.apiRequest(
            `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calId)}/events/${eventId}`,
            { method: 'DELETE' }
        );

        return response.ok;
    }

    /**
     * Create a training event
     */
    async createTrainingEvent(workout, date) {
        const startTime = new Date(date);
        startTime.setHours(9, 0, 0, 0); // Default to 9 AM

        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + (workout.estimatedDuration || 60));

        const exercises = Array.isArray(workout)
            ? workout.map(e => e.name).join(', ')
            : workout.exercises?.map(e => e.name).join(', ') || 'Workout';

        const event = {
            summary: `💪 Training: ${exercises.substring(0, 50)}${exercises.length > 50 ? '...' : ''}`,
            description: `Continuum Training Session\n\nExercises:\n${exercises}`,
            start: {
                dateTime: startTime.toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            end: {
                dateTime: endTime.toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 30 },
                ],
            },
            colorId: '11', // Red
        };

        return this.createEvent(event, this.continuumCalendarId || this.calendarId);
    }

    /**
     * Create a task deadline event
     */
    async createTaskDeadlineEvent(task) {
        if (!task.dueDate) {
            throw new Error('Task has no due date');
        }

        const dueDate = new Date(task.dueDate);

        // If task has time, create timed event; otherwise, all-day event
        if (task.dueTime) {
            const [hours, minutes] = task.dueTime.split(':');
            dueDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

            const endTime = new Date(dueDate);
            endTime.setMinutes(endTime.getMinutes() + 30);

            return this.createEvent({
                summary: `📋 ${task.name || task.title}`,
                description: task.description || '',
                start: {
                    dateTime: dueDate.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
                end: {
                    dateTime: endTime.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'popup', minutes: 30 },
                    ],
                },
                colorId: '5', // Yellow
            }, this.continuumCalendarId || this.calendarId);
        } else {
            // All-day event
            return this.createEvent({
                summary: `📋 ${task.name || task.title}`,
                description: task.description || '',
                start: {
                    date: task.dueDate,
                },
                end: {
                    date: task.dueDate,
                },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'popup', minutes: 60 * 9 }, // 9 AM reminder for all-day event
                    ],
                },
                colorId: '5',
            }, this.continuumCalendarId || this.calendarId);
        }
    }

    /**
     * Create meal reminder events for the day
     */
    async createMealReminderEvents(date, mealSchedule = null) {
        const schedule = mealSchedule || {
            breakfast: { hour: 8, minute: 0 },
            lunch: { hour: 12, minute: 30 },
            dinner: { hour: 19, minute: 0 },
        };

        const events = [];

        for (const [mealType, time] of Object.entries(schedule)) {
            const startTime = new Date(date);
            startTime.setHours(time.hour, time.minute, 0, 0);

            const endTime = new Date(startTime);
            endTime.setMinutes(endTime.getMinutes() + 30);

            const emoji = {
                breakfast: '🌅',
                lunch: '☀️',
                dinner: '🌙',
                snack: '🍎',
            }[mealType] || '🍽️';

            const event = await this.createEvent({
                summary: `${emoji} ${mealType.charAt(0).toUpperCase() + mealType.slice(1)} Time`,
                description: 'Reminder to log your meal in Continuum',
                start: {
                    dateTime: startTime.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
                end: {
                    dateTime: endTime.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'popup', minutes: 0 },
                    ],
                },
                colorId: '2', // Green
            }, this.continuumCalendarId || this.calendarId);

            events.push(event);
        }

        return events;
    }

    /**
     * Sync Continuum time blocks to calendar
     */
    async syncTimeBlocks(timeBlocks, date) {
        const results = { created: 0, updated: 0, errors: 0 };

        for (const block of timeBlocks) {
            try {
                const startTime = new Date(date);
                const [startHour, startMin] = block.startTime.split(':');
                startTime.setHours(parseInt(startHour), parseInt(startMin), 0, 0);

                const endTime = new Date(date);
                const [endHour, endMin] = block.endTime.split(':');
                endTime.setHours(parseInt(endHour), parseInt(endMin), 0, 0);

                const event = {
                    summary: block.name || block.label || 'Time Block',
                    description: `Continuum Time Block\nCategory: ${block.category || 'general'}`,
                    start: {
                        dateTime: startTime.toISOString(),
                        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    },
                    end: {
                        dateTime: endTime.toISOString(),
                        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    },
                    colorId: this.getCategoryColor(block.category),
                };

                if (block.googleEventId) {
                    await this.updateEvent(block.googleEventId, event);
                    results.updated++;
                } else {
                    await this.createEvent(event, this.continuumCalendarId || this.calendarId);
                    results.created++;
                }
            } catch (error) {
                console.error('Error syncing time block:', error);
                results.errors++;
            }
        }

        this.saveSyncState();
        return results;
    }

    /**
     * Get color ID for category
     */
    getCategoryColor(category) {
        const colors = {
            work: '9',      // Blue
            personal: '10', // Green
            health: '11',   // Red
            learning: '7',  // Cyan
            social: '6',    // Orange
            rest: '8',      // Gray
        };
        return colors[category?.toLowerCase()] || '1';
    }

    /**
     * Save sync state to localStorage
     */
    saveSyncState() {
        this.lastSyncTime = new Date().toISOString();
        localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
            lastSync: this.lastSyncTime,
            continuumCalendarId: this.continuumCalendarId,
        }));
    }

    /**
     * Get last sync time
     */
    getLastSyncTime() {
        return this.lastSyncTime;
    }
}

export const googleCalendarService = new GoogleCalendarService();
export default GoogleCalendarService;
