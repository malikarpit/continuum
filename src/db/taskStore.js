/**
 * Task Store
 * Manages tasks with skip-with-reason enforcement
 */

import { getDB, STORES } from './database';
import { getDateString } from './dayStore';

/**
 * Task Status Constants
 */
export const TASK_STATUS = {
    PENDING: 'pending',
    SCHEDULED: 'scheduled', // Future task, not yet active
    COMPLETED: 'completed',
    SKIPPED: 'skipped',
    MISSED: 'missed', // Auto-marked when day is inactive
};

/**
 * Task Categories
 */
export const TASK_CATEGORY = {
    STUDY: 'study',
    PERSONAL: 'personal',
    FITNESS: 'fitness',
    PROJECT: 'project',
    HEALTH: 'health',
    COLLEGE: 'college',
    OTHER: 'other',
};

/**
 * Task Types
 */
export const TASK_TYPE = {
    DAILY: 'daily',       // Recurring daily task from template
    ONE_TIME: 'one-time', // One-time task
    RECURRING: 'recurring', // Custom recurring pattern
};

/**
 * Skip Reason Presets
 */
export const SKIP_REASONS = [
    'Not enough time',
    'Feeling unwell',
    'Higher priority task',
    'Schedule conflict',
    'Need more preparation',
    'Waiting on someone',
    'Energy too low',
    'Custom reason',
];

/**
 * Generate unique task ID
 */
export function generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new task
 */
export function createTask(data) {
    // Require date to be explicitly passed to respect day boundary settings
    // The caller should pass the adjusted date from the store (e.g., getAdjustedDate(settings.dayBoundaryHour))
    if (!data.date) {
        console.warn('createTask called without date - this may assign task to wrong day. Pass adjusted date from store.');
    }
    const taskDate = data.date || getDateString();
    const isScheduled = data.scheduledFor && data.scheduledFor > taskDate;
    return {
        id: generateTaskId(),
        date: taskDate,
        title: data.title,
        description: data.description || '',
        category: data.category || TASK_CATEGORY.OTHER,
        type: data.type || TASK_TYPE.ONE_TIME,
        status: isScheduled ? TASK_STATUS.SCHEDULED : TASK_STATUS.PENDING,
        priority: data.priority || 'medium', // low, medium, high
        estimatedMinutes: data.estimatedMinutes || null,
        scheduledTime: data.scheduledTime || null, // HH:MM format for time of day
        scheduledFor: data.scheduledFor || null, // YYYY-MM-DD for future scheduling
        blockId: data.blockId || null, // Time block assignment
        recurringPattern: data.recurringPattern || null, // { type: 'daily'|'weekly'|'weekday', daysOfWeek: [1,2,3...] }
        completedAt: null,
        skipReason: null,
        createdAt: new Date().toISOString(),
        templateId: data.templateId || null,
    };
}

/**
 * Get all tasks for a specific date
 */
export async function getTasksByDate(date) {
    const db = await getDB();
    const dateStr = typeof date === 'string' ? date : getDateString(date);
    return db.getAllFromIndex(STORES.TASKS, 'date', dateStr);
}

/**
 * Get task by ID
 */
export async function getTask(id) {
    const db = await getDB();
    return db.get(STORES.TASKS, id);
}

/**
 * Save task (create or update)
 */
export async function saveTask(task) {
    const db = await getDB();
    return db.put(STORES.TASKS, task);
}

/**
 * Add a new task
 */
export async function addTask(taskData) {
    const task = createTask(taskData);
    await saveTask(task);
    return task;
}

/**
 * Complete a task
 */
export async function completeTask(taskId) {
    const task = await getTask(taskId);
    if (!task) {
        throw new Error('Task not found');
    }

    // Check if day is locked (closed or inactive) - preserve immutable history
    const { getDay, DAY_STATUS } = await import('./dayStore.js');
    const day = await getDay(task.date);
    if (day && (day.status === DAY_STATUS.CLOSED || day.status === DAY_STATUS.INACTIVE)) {
        throw new Error('Cannot modify tasks on closed or inactive days');
    }

    if (task.status !== TASK_STATUS.PENDING) {
        throw new Error('Only pending tasks can be completed');
    }

    task.status = TASK_STATUS.COMPLETED;
    task.completedAt = new Date().toISOString();

    return saveTask(task);
}

/**
 * Uncomplete a task (toggle back to pending)
 */
export async function uncompleteTask(taskId) {
    const task = await getTask(taskId);
    if (!task) {
        throw new Error('Task not found');
    }

    // Check if day is locked (closed or inactive) - preserve immutable history
    const { getDay, DAY_STATUS } = await import('./dayStore.js');
    const day = await getDay(task.date);
    if (day && (day.status === DAY_STATUS.CLOSED || day.status === DAY_STATUS.INACTIVE)) {
        throw new Error('Cannot modify tasks on closed or inactive days');
    }

    if (task.status !== TASK_STATUS.COMPLETED) {
        throw new Error('Only completed tasks can be uncompleted');
    }

    task.status = TASK_STATUS.PENDING;
    task.completedAt = null;

    return saveTask(task);
}

/**
 * Skip a task (requires reason)
 */
export async function skipTask(taskId, reason) {
    if (!reason || reason.trim() === '') {
        throw new Error('Skip reason is required');
    }

    const task = await getTask(taskId);
    if (!task) {
        throw new Error('Task not found');
    }

    // Check if day is locked (closed or inactive) - preserve immutable history
    const { getDay, DAY_STATUS } = await import('./dayStore.js');
    const day = await getDay(task.date);
    if (day && (day.status === DAY_STATUS.CLOSED || day.status === DAY_STATUS.INACTIVE)) {
        throw new Error('Cannot modify tasks on closed or inactive days');
    }

    if (task.status !== TASK_STATUS.PENDING) {
        throw new Error('Only pending tasks can be skipped');
    }

    task.status = TASK_STATUS.SKIPPED;
    task.skipReason = reason.trim();
    task.completedAt = new Date().toISOString();

    return saveTask(task);
}

/**
 * Mark task as missed (for inactive days)
 */
export async function markTaskMissed(taskId) {
    const task = await getTask(taskId);
    if (!task) {
        throw new Error('Task not found');
    }

    task.status = TASK_STATUS.MISSED;
    task.skipReason = 'Day not opened';

    return saveTask(task);
}

/**
 * Mark all tasks for a date as missed
 */
export async function markAllTasksMissed(date) {
    const tasks = await getTasksByDate(date);

    for (const task of tasks) {
        if (task.status === TASK_STATUS.PENDING) {
            await markTaskMissed(task.id);
        }
    }

    return tasks;
}

/**
 * Delete a task (only if it's pending and created today)
 */
export async function deleteTask(taskId) {
    const task = await getTask(taskId);
    if (!task) {
        throw new Error('Task not found');
    }

    const today = getDateString();
    if (task.date !== today) {
        throw new Error('Cannot delete tasks from past days');
    }

    if (task.status !== TASK_STATUS.PENDING) {
        throw new Error('Cannot delete completed or skipped tasks');
    }

    const db = await getDB();
    return db.delete(STORES.TASKS, taskId);
}

/**
 * Get tasks by category
 */
export async function getTasksByCategory(category) {
    const db = await getDB();
    return db.getAllFromIndex(STORES.TASKS, 'category', category);
}

/**
 * Get task statistics for a date
 */
export async function getTaskStats(date) {
    const tasks = await getTasksByDate(date);

    return {
        total: tasks.length,
        completed: tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length,
        skipped: tasks.filter(t => t.status === TASK_STATUS.SKIPPED).length,
        missed: tasks.filter(t => t.status === TASK_STATUS.MISSED).length,
        pending: tasks.filter(t => t.status === TASK_STATUS.PENDING).length,
        byCategory: Object.values(TASK_CATEGORY).reduce((acc, cat) => {
            acc[cat] = tasks.filter(t => t.category === cat).length;
            return acc;
        }, {}),
    };
}

/**
 * Get task completion rate for a date range
 */
export async function getTaskCompletionRate(startDate, endDate) {
    const db = await getDB();
    const allTasks = await db.getAll(STORES.TASKS);

    const startStr = typeof startDate === 'string' ? startDate : getDateString(startDate);
    const endStr = typeof endDate === 'string' ? endDate : getDateString(endDate);

    const tasksInRange = allTasks.filter(t => t.date >= startStr && t.date <= endStr);

    if (tasksInRange.length === 0) {
        return 0;
    }

    const completed = tasksInRange.filter(t => t.status === TASK_STATUS.COMPLETED).length;
    return (completed / tasksInRange.length) * 100;
}

/**
 * Create daily recurring tasks from template
 */
export async function createDailyTasksFromTemplate(date, templateTasks) {
    const dateStr = typeof date === 'string' ? date : getDateString(date);
    const createdTasks = [];

    for (const template of templateTasks) {
        const task = createTask({
            ...template,
            date: dateStr,
            type: TASK_TYPE.DAILY,
        });
        await saveTask(task);
        createdTasks.push(task);
    }

    return createdTasks;
}

/**
 * Get all scheduled (future) tasks
 */
export async function getScheduledTasks() {
    const db = await getDB();
    const allTasks = await db.getAll(STORES.TASKS);
    return allTasks.filter(t => t.status === TASK_STATUS.SCHEDULED);
}

/**
 * Activate scheduled tasks for a given date
 * Converts SCHEDULED to PENDING when scheduled date matches
 */
export async function activateScheduledTasks(date) {
    const dateStr = typeof date === 'string' ? date : getDateString(date);
    const scheduledTasks = await getScheduledTasks();
    const activated = [];

    for (const task of scheduledTasks) {
        if (task.scheduledFor && task.scheduledFor <= dateStr) {
            task.status = TASK_STATUS.PENDING;
            task.date = dateStr;
            await saveTask(task);
            activated.push(task);
        }
    }

    return activated;
}

/**
 * Instantiate recurring tasks for a given date
 * Creates new task instances from recurring patterns
 */
export async function instantiateRecurringTasks(date) {
    const dateStr = typeof date === 'string' ? date : getDateString(date);
    const db = await getDB();
    const allTasks = await db.getAll(STORES.TASKS);

    // Find recurring task templates (type = RECURRING and has pattern)
    const recurringTemplates = allTasks.filter(t =>
        t.type === TASK_TYPE.RECURRING &&
        t.recurringPattern &&
        t.status !== TASK_STATUS.MISSED
    );

    const createdTasks = [];
    const dateObj = new Date(dateStr + 'T12:00:00');
    const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 6 = Saturday

    for (const template of recurringTemplates) {
        const pattern = template.recurringPattern;
        let shouldCreate = false;

        // Check if task should be created for this date
        switch (pattern.type) {
            case 'daily':
                shouldCreate = true;
                break;
            case 'weekday':
                shouldCreate = dayOfWeek >= 1 && dayOfWeek <= 5;
                break;
            case 'weekly':
                shouldCreate = pattern.daysOfWeek?.includes(dayOfWeek) || false;
                break;
            default:
                shouldCreate = false;
        }

        if (shouldCreate) {
            // Check if task already exists for this date
            const existingForDate = await getTasksByDate(dateStr);
            const alreadyExists = existingForDate.some(t =>
                t.templateId === template.id ||
                (t.title === template.title && t.type === TASK_TYPE.DAILY)
            );

            if (!alreadyExists) {
                const newTask = createTask({
                    title: template.title,
                    description: template.description,
                    category: template.category,
                    priority: template.priority,
                    estimatedMinutes: template.estimatedMinutes,
                    scheduledTime: template.scheduledTime,
                    blockId: template.blockId,
                    date: dateStr,
                    type: TASK_TYPE.DAILY,
                    templateId: template.id,
                });
                await saveTask(newTask);
                createdTasks.push(newTask);
            }
        }
    }

    return createdTasks;
}

/**
 * Check if task is editable (not locked)
 */
export function isTaskEditable(task, dayStatus = 'active') {
    if (!task) return false;

    // Can't edit completed/skipped/missed tasks
    if (task.status !== TASK_STATUS.PENDING && task.status !== TASK_STATUS.SCHEDULED) {
        return false;
    }

    // Can't edit if day is closed or inactive
    if (dayStatus === 'closed' || dayStatus === 'inactive') {
        return false;
    }

    return true;
}
