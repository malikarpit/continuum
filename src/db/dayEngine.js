/**
 * Day Engine
 * Manages day lifecycle including template application, day boundary logic,
 * and automatic marking of inactive items
 */

import { getDB, STORES } from './database';
import { getDateString, createDay, getDay, saveDay, DAY_STATUS } from './dayStore';
import { getEffectiveTemplate, HOLIDAY_TEMPLATE } from './templateStore';
import { createTask, TASK_STATUS, getTasksByDate, saveTask, activateScheduledTasks, instantiateRecurringTasks } from './taskStore';
import { createTrainingSession, TRAINING_STATUS, getTrainingByDate, saveTraining } from './trainingStore';
import { createMeal, MEAL_TYPE, MEAL_STATUS, getMealsByDate, saveMeal } from './mealStore';

/**
 * Get the current date adjusted for day boundary hour
 * If current time is before the boundary hour, return yesterday's date
 * @param {number} dayBoundaryHour - Hour when day starts (default 4 = 4 AM)
 */
export function getAdjustedDate(dayBoundaryHour = 4) {
    const now = new Date();
    const currentHour = now.getHours();

    // If before boundary hour, we're still in "yesterday"
    if (currentHour < dayBoundaryHour) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return getDateString(yesterday);
    }

    return getDateString(now);
}

/**
 * Check if we need to rollover to a new day
 * @param {string} currentDayDate - The current day's date string
 * @param {number} dayBoundaryHour - Hour when day starts
 */
export function shouldRolloverDay(currentDayDate, dayBoundaryHour = 4) {
    const adjustedDate = getAdjustedDate(dayBoundaryHour);
    return adjustedDate !== currentDayDate;
}

/**
 * Apply a template to a day - creates tasks, training session, and meals
 * @param {string} date - Date string (YYYY-MM-DD)
 * @param {Object} template - Template to apply
 * @param {Object} options - Additional options
 */
export async function applyTemplateToDay(date, template = null, options = {}) {
    const dateStr = typeof date === 'string' ? date : getDateString(date);

    // Get or determine template
    if (!template) {
        const dateObj = new Date(dateStr + 'T12:00:00');
        template = await getEffectiveTemplate(dateObj);
    }

    // Check if template already applied
    let day = await getDay(dateStr);
    if (day?.templateApplied) {
        console.log('[DayEngine] Template already applied for', dateStr);
        return { day, tasks: [], training: null, meals: [] };
    }

    // Create day if not exists
    if (!day) {
        day = createDay(dateStr, template.id);
    }

    // Handle holiday template differently
    if (template.isHoliday) {
        day.isHoliday = true;
        day.holidayProgress = {};
        day.templateApplied = true;
        day.templateId = template.id;
        await saveDay(day);
        return { day, tasks: [], training: null, meals: [] };
    }

    const createdTasks = [];
    let trainingSession = null;
    const createdMeals = [];

    // Create tasks from template time blocks
    if (template.timeBlocks && template.timeBlocks.length > 0) {
        for (const block of template.timeBlocks) {
            if (block.defaultTasks && block.defaultTasks.length > 0) {
                for (const taskDef of block.defaultTasks) {
                    const task = createTask({
                        ...taskDef,
                        date: dateStr,
                        blockId: block.id,
                        templateId: template.id,
                    });
                    await saveTask(task);
                    createdTasks.push(task);
                }
            }
        }
    }

    // Create training session (pending)
    const existingTraining = await getTrainingByDate(dateStr);
    if (!existingTraining) {
        trainingSession = createTrainingSession({
            date: dateStr,
            status: TRAINING_STATUS.PENDING,
        });
        await saveTraining(trainingSession);
    }

    // Create meal slots
    const existingMeals = await getMealsByDate(dateStr);
    if (existingMeals.length === 0) {
        for (const mealType of Object.values(MEAL_TYPE)) {
            const meal = createMeal({
                date: dateStr,
                mealType,
            });
            await saveMeal(meal);
            createdMeals.push(meal);
        }
    }

    // Mark template as applied
    day.templateApplied = true;
    day.templateId = template.id;
    day.blocks = template.timeBlocks || [];
    await saveDay(day);

    console.log('[DayEngine] Applied template to', dateStr, {
        tasks: createdTasks.length,
        training: !!trainingSession,
        meals: createdMeals.length,
    });

    return { day, tasks: createdTasks, training: trainingSession, meals: createdMeals };
}

/**
 * Mark all items for a day as inactive/missed/unlogged
 * Called when a day is detected as inactive (never opened)
 * @param {string} date - Date string
 */
export async function markDayItemsInactive(date) {
    const dateStr = typeof date === 'string' ? date : getDateString(date);

    // Mark tasks as missed
    const tasks = await getTasksByDate(dateStr);
    for (const task of tasks) {
        if (task.status === TASK_STATUS.PENDING) {
            task.status = TASK_STATUS.MISSED;
            task.skipReason = 'Day not opened';
            await saveTask(task);
        }
    }

    // Mark training as missed
    const training = await getTrainingByDate(dateStr);
    if (training && training.status === TRAINING_STATUS.PENDING) {
        training.status = TRAINING_STATUS.MISSED;
        training.skipReason = 'Day not opened';
        await saveTraining(training);
    }

    // Mark meals as unlogged
    const meals = await getMealsByDate(dateStr);
    for (const meal of meals) {
        if (meal.status === MEAL_STATUS.PLANNED) {
            meal.status = MEAL_STATUS.UNLOGGED;
            meal.skipReason = 'Day not opened';
            await saveMeal(meal);
        }
    }

    console.log('[DayEngine] Marked items inactive for', dateStr);
}

/**
 * Check if a day is locked for modifications
 * Rules:
 * - Active days can be modified
 * - Closed/inactive days cannot be modified
 * - Past active days (before today) should be auto-closed
 * @param {Object} day - Day object
 * @param {number} dayBoundaryHour - Hour when day starts
 */
export function isDayLocked(day, dayBoundaryHour = 4) {
    if (!day) return false;

    // Closed or inactive days are locked
    if (day.status === DAY_STATUS.CLOSED || day.status === DAY_STATUS.INACTIVE) {
        return true;
    }

    // Check if this is a past day that should be locked
    const adjustedToday = getAdjustedDate(dayBoundaryHour);
    if (day.date < adjustedToday && day.status === DAY_STATUS.ACTIVE) {
        return true; // Past active day should be locked
    }

    return false;
}

/**
 * Check if a task can be edited
 * @param {Object} task - Task object
 * @param {Object} currentDay - Current day object
 */
export function isTaskEditable(task, currentDay) {
    if (!task || !currentDay) return false;

    // Can't edit completed/skipped/missed tasks
    if (task.status !== TASK_STATUS.PENDING) {
        return false;
    }

    // Can't edit if day is locked
    if (isDayLocked(currentDay)) {
        return false;
    }

    return true;
}

/**
 * Calculate day progress considering day boundary
 * @param {Date} time - Current time
 * @param {number} dayBoundaryHour - Hour when day starts (e.g., 4 = 4 AM)
 */
export function calculateDayProgressWithBoundary(time, dayBoundaryHour = 4) {
    const hours = time.getHours();
    const minutes = time.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    const dayStartMinutes = dayBoundaryHour * 60;
    // Day ends at midnight (or next day's boundary)
    const dayEndMinutes = 24 * 60;
    const totalDayMinutes = dayEndMinutes - dayStartMinutes;

    // Before day start
    if (currentMinutes < dayStartMinutes) {
        // We're in the previous logical day, so 100% complete
        return 100;
    }

    // Calculate progress
    const elapsedMinutes = currentMinutes - dayStartMinutes;
    const progress = Math.min((elapsedMinutes / totalDayMinutes) * 100, 100);

    return Math.round(progress * 10) / 10;
}

/**
 * Get current time block considering day boundary
 * @param {Date} time - Current time
 * @param {Array} blocks - Time blocks array
 * @param {number} dayBoundaryHour - Hour when day starts
 */
export function getCurrentTimeBlockWithBoundary(time, blocks, dayBoundaryHour = 4) {
    const hours = time.getHours();

    // Before day boundary, no active block
    if (hours < dayBoundaryHour) {
        return null;
    }

    const minutes = time.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    for (const block of blocks) {
        const [startHour, startMin] = block.startTime.split(':').map(Number);
        const [endHour, endMin] = block.endTime.split(':').map(Number);

        let startMinutes = startHour * 60 + startMin;
        let endMinutes = endHour * 60 + endMin;

        // Handle midnight crossing
        if (endMinutes === 0) endMinutes = 24 * 60;

        if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
            return block;
        }
    }

    return null;
}

/**
 * Initialize day with template if needed
 * Called during app initialization
 * @param {number} dayBoundaryHour - Hour when day starts
 */
export async function initializeCurrentDay(dayBoundaryHour = 4) {
    const adjustedDate = getAdjustedDate(dayBoundaryHour);

    // Check for gaps and mark inactive
    await checkAndMarkInactiveDaysWithItems(adjustedDate);

    // Apply template to current day if needed
    const result = await applyTemplateToDay(adjustedDate);

    // Activate any scheduled tasks that are due
    const activatedTasks = await activateScheduledTasks(adjustedDate);
    if (activatedTasks.length > 0) {
        console.log('[DayEngine] Activated', activatedTasks.length, 'scheduled tasks');
        result.tasks = [...result.tasks, ...activatedTasks];
    }

    // Instantiate recurring tasks for today
    const recurringTasks = await instantiateRecurringTasks(adjustedDate);
    if (recurringTasks.length > 0) {
        console.log('[DayEngine] Created', recurringTasks.length, 'recurring tasks');
        result.tasks = [...result.tasks, ...recurringTasks];
    }

    return result;
}

/**
 * Check for inactive days and mark all their items
 * @param {string} currentDate - Current date string
 */
async function checkAndMarkInactiveDaysWithItems(currentDate) {
    const db = await getDB();
    const allDays = await db.getAll(STORES.DAYS);

    if (allDays.length === 0) return;

    // Get the last recorded day
    const sortedDays = allDays.sort((a, b) => b.date.localeCompare(a.date));
    const lastDate = sortedDays[0].date;

    // Check for gaps
    const start = new Date(lastDate);
    const end = new Date(currentDate);
    start.setDate(start.getDate() + 1);

    while (start < end) {
        const dateStr = getDateString(start);
        const existingDay = allDays.find(d => d.date === dateStr);

        if (!existingDay) {
            // Create inactive day record
            const day = createDay(dateStr);
            day.status = DAY_STATUS.INACTIVE;
            day.closedAt = new Date().toISOString();
            await db.put(STORES.DAYS, day);

            // Mark any items for this day as inactive
            await markDayItemsInactive(dateStr);
        }

        start.setDate(start.getDate() + 1);
    }
}

/**
 * Toggle holiday mode for current day
 * @param {string} date - Date string
 * @param {boolean} isHoliday - Whether to enable holiday mode
 */
export async function setDayHolidayMode(date, isHoliday) {
    const day = await getDay(date);
    if (!day) {
        throw new Error('Day not found');
    }

    if (day.status !== DAY_STATUS.ACTIVE) {
        throw new Error('Can only change holiday mode for active days');
    }

    day.isHoliday = isHoliday;
    if (isHoliday && !day.holidayProgress) {
        day.holidayProgress = {};
    }

    await saveDay(day);
    return day;
}

/**
 * Update holiday progress
 * @param {string} date - Date string
 * @param {string} priorityId - Priority ID (movement, protein, hydration)
 * @param {boolean} completed - Whether completed
 */
export async function updateHolidayProgress(date, priorityId, completed) {
    const day = await getDay(date);
    if (!day) {
        throw new Error('Day not found');
    }

    if (!day.isHoliday) {
        throw new Error('Day is not in holiday mode');
    }

    day.holidayProgress = day.holidayProgress || {};
    day.holidayProgress[priorityId] = completed;

    await saveDay(day);
    return day;
}

/**
 * Get holiday progress score
 * @param {Object} holidayProgress - Holiday progress object
 */
export function getHolidayScore(holidayProgress) {
    if (!holidayProgress) return 0;

    const completed = Object.values(holidayProgress).filter(v => v === true).length;
    return completed;
}

/**
 * Get holiday rating based on score
 * @param {number} score - Number of priorities completed (0-3)
 */
export function getHolidayRating(score) {
    if (score >= 3) return 'perfect';
    if (score >= 2) return 'good';
    if (score >= 1) return 'acceptable';
    return 'missed';
}
