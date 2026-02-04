/**
 * Day Store
 * Manages day records with state machine enforcement
 * Days are the core entity around which all features revolve
 */

import { getDB, STORES } from './database';

/**
 * Day Status Constants
 */
export const DAY_STATUS = {
    ACTIVE: 'active',      // Current day, in progress
    CLOSED: 'closed',      // Day completed and locked
    INACTIVE: 'inactive',  // Day not opened (missed)
    FUTURE: 'future',      // Not yet started
};

/**
 * Get date string in YYYY-MM-DD format (local timezone)
 */
export function getDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Create default day structure
 */
export function createDay(date, templateId = 'default') {
    const dateStr = typeof date === 'string' ? date : getDateString(date);
    return {
        date: dateStr,
        status: DAY_STATUS.ACTIVE,
        templateId,
        templateApplied: false, // Whether template tasks/meals have been created
        isHoliday: false, // Holiday/travel mode
        holidayProgress: null, // { movement: bool, protein: bool, hydration: bool }
        blocks: [],
        flags: {
            injury: false,
            soreness: false,
        },
        notes: '',
        createdAt: new Date().toISOString(),
        closedAt: null,
        summary: {
            tasksCompleted: 0,
            tasksTotal: 0,
            trainingCompleted: false,
            mealsLogged: 0,
            mealsTotal: 4,
            caloriesTotal: 0,
            proteinTotal: 0,
        },
        energyLevel: null, // 1-5 scale, set by user at start of day
    };
}

/**
 * Get day by date
 */
export async function getDay(date) {
    const db = await getDB();
    const dateStr = typeof date === 'string' ? date : getDateString(date);
    return db.get(STORES.DAYS, dateStr);
}

/**
 * Get or create today's day
 */
export async function getOrCreateToday() {
    const today = getDateString();
    let day = await getDay(today);

    if (!day) {
        day = createDay(today);
        await saveDay(day);
    }

    return day;
}

/**
 * Save day (create or update)
 */
export async function saveDay(day) {
    const db = await getDB();

    // Enforce immutability - closed/inactive days cannot be modified
    const existingDay = await getDay(day.date);
    if (existingDay && (existingDay.status === DAY_STATUS.CLOSED || existingDay.status === DAY_STATUS.INACTIVE)) {
        throw new Error('Cannot modify a closed or inactive day - history is immutable');
    }

    return db.put(STORES.DAYS, day);
}

/**
 * Close the current day
 */
export async function closeDay(date) {
    const day = await getDay(date);
    if (!day) {
        throw new Error('Day not found');
    }

    if (day.status !== DAY_STATUS.ACTIVE) {
        throw new Error('Only active days can be closed');
    }

    day.status = DAY_STATUS.CLOSED;
    day.closedAt = new Date().toISOString();

    return saveDay(day);
}

/**
 * Mark day as inactive (not opened)
 */
export async function markDayInactive(date) {
    const dateStr = typeof date === 'string' ? date : getDateString(date);
    const db = await getDB();

    // Create inactive day record
    const day = {
        date: dateStr,
        status: DAY_STATUS.INACTIVE,
        templateId: null,
        blocks: [],
        flags: {
            injury: false,
            soreness: false,
        },
        notes: '',
        createdAt: new Date().toISOString(),
        closedAt: new Date().toISOString(),
        summary: {
            tasksCompleted: 0,
            tasksTotal: 0,
            trainingCompleted: false,
            mealsLogged: 0,
            mealsTotal: 0,
            caloriesTotal: 0,
            proteinTotal: 0,
        },
    };

    return db.put(STORES.DAYS, day);
}

/**
 * Update day summary statistics
 */
export async function updateDaySummary(date, summaryUpdates) {
    const day = await getDay(date);
    if (!day) {
        throw new Error('Day not found');
    }

    if (day.status !== DAY_STATUS.ACTIVE) {
        throw new Error('Cannot update summary of non-active day');
    }

    day.summary = { ...day.summary, ...summaryUpdates };
    return saveDay(day);
}

/**
 * Update day flags (injury, soreness)
 */
export async function updateDayFlags(date, flags) {
    const day = await getDay(date);
    if (!day) {
        throw new Error('Day not found');
    }

    if (day.status !== DAY_STATUS.ACTIVE) {
        throw new Error('Cannot update flags of non-active day');
    }

    day.flags = { ...day.flags, ...flags };
    return saveDay(day);
}

/**
 * Add notes to day
 */
export async function updateDayNotes(date, notes) {
    const day = await getDay(date);
    if (!day) {
        throw new Error('Day not found');
    }

    if (day.status !== DAY_STATUS.ACTIVE) {
        throw new Error('Cannot update notes of non-active day');
    }

    day.notes = notes;
    return saveDay(day);
}

/**
 * Update day energy level
 */
export async function updateDayEnergy(date, level) {
    const day = await getDay(date);
    if (!day) {
        throw new Error('Day not found');
    }

    if (day.status !== DAY_STATUS.ACTIVE) {
        throw new Error('Cannot update energy of non-active day');
    }

    day.energyLevel = level;
    return saveDay(day);
}

/**
 * Get all days in a date range
 */
export async function getDaysInRange(startDate, endDate) {
    const db = await getDB();
    const startStr = typeof startDate === 'string' ? startDate : getDateString(startDate);
    const endStr = typeof endDate === 'string' ? endDate : getDateString(endDate);

    const allDays = await db.getAll(STORES.DAYS);
    return allDays.filter(day => day.date >= startStr && day.date <= endStr)
        .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get days by status
 */
export async function getDaysByStatus(status) {
    const db = await getDB();
    return db.getAllFromIndex(STORES.DAYS, 'status', status);
}

/**
 * Check and mark past days as inactive if they were never opened
 */
export async function checkAndMarkInactiveDays() {
    const today = getDateString();
    const db = await getDB();
    const allDays = await db.getAll(STORES.DAYS);

    // Get the last day we have a record for
    const sortedDays = allDays.sort((a, b) => b.date.localeCompare(a.date));

    if (sortedDays.length === 0) {
        return; // No previous days to check
    }

    const lastDate = sortedDays[0].date;

    // Fill in any gaps with inactive days
    const start = new Date(lastDate);
    const end = new Date(today);

    const inactiveDays = [];
    // Start checking from the day after the last recorded day
    start.setDate(start.getDate() + 1);
    while (start < end) {
        const dateStr = getDateString(start);
        const existingDay = allDays.find(d => d.date === dateStr);

        if (!existingDay) {
            inactiveDays.push(dateStr);
        }

        start.setDate(start.getDate() + 1);
    }

    // Mark all missing days as inactive
    for (const date of inactiveDays) {
        await markDayInactive(date);
    }

    return inactiveDays;
}

/**
 * Get streak statistics
 * Note: Continuum doesn't show streaks to avoid pressure,
 * but stores this data for analytics
 */
export async function getStreakStats() {
    const db = await getDB();
    const allDays = await db.getAll(STORES.DAYS);
    const sortedDays = allDays.sort((a, b) => b.date.localeCompare(a.date));

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    for (const day of sortedDays) {
        if (day.status === DAY_STATUS.CLOSED || day.status === DAY_STATUS.ACTIVE) {
            tempStreak++;
            if (tempStreak > longestStreak) {
                longestStreak = tempStreak;
            }
            if (currentStreak === tempStreak - 1) {
                currentStreak = tempStreak;
            }
        } else {
            tempStreak = 0;
        }
    }

    return {
        currentStreak,
        longestStreak,
        totalActiveDays: allDays.filter(d => d.status === DAY_STATUS.CLOSED || d.status === DAY_STATUS.ACTIVE).length,
        totalInactiveDays: allDays.filter(d => d.status === DAY_STATUS.INACTIVE).length,
    };
}
