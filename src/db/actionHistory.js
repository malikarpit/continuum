/**
 * Action History Store
 * Tracks major user actions for undo functionality
 * Only tracks meaningful actions, not navigation/UI interactions
 */

import { getDB, STORES } from './database';

// Action types to track
export const ACTION_TYPES = {
    TASK_ADDED: 'task_added',
    TASK_COMPLETED: 'task_completed',
    TASK_SKIPPED: 'task_skipped',
    TASK_DELETED: 'task_deleted',
    MEAL_LOGGED: 'meal_logged',
    MEAL_COMPLETED: 'meal_completed',
    MEAL_SKIPPED: 'meal_skipped',
    WORKOUT_STARTED: 'workout_started',
    WORKOUT_COMPLETED: 'workout_completed',
    WORKOUT_SKIPPED: 'workout_skipped',
    REST_DAY_SET: 'rest_day_set',
    DAY_CLOSED: 'day_closed',
    SETTINGS_CHANGED: 'settings_changed',
    TEMPLATE_SAVED: 'template_saved',
    TEMPLATE_CREATED: 'template_created',
    TEMPLATE_DELETED: 'template_deleted',
    TEMPLATE_BLOCK_ADDED: 'template_block_added',
    TEMPLATE_BLOCK_DELETED: 'template_block_deleted',
    TEMPLATE_BLOCK_MODIFIED: 'template_block_modified',
    TEMPLATE_TASK_ADDED: 'template_task_added',
    TEMPLATE_TASK_DELETED: 'template_task_deleted',
    HOLIDAY_ENABLED: 'holiday_enabled',
};

// Human-readable labels for action types
export const ACTION_LABELS = {
    [ACTION_TYPES.TASK_ADDED]: 'Task Added',
    [ACTION_TYPES.TASK_COMPLETED]: 'Task Completed',
    [ACTION_TYPES.TASK_SKIPPED]: 'Task Skipped',
    [ACTION_TYPES.TASK_DELETED]: 'Task Deleted',
    [ACTION_TYPES.MEAL_LOGGED]: 'Food Logged',
    [ACTION_TYPES.MEAL_COMPLETED]: 'Meal Completed',
    [ACTION_TYPES.MEAL_SKIPPED]: 'Meal Skipped',
    [ACTION_TYPES.WORKOUT_STARTED]: 'Workout Started',
    [ACTION_TYPES.WORKOUT_COMPLETED]: 'Workout Completed',
    [ACTION_TYPES.WORKOUT_SKIPPED]: 'Workout Skipped',
    [ACTION_TYPES.REST_DAY_SET]: 'Rest Day Set',
    [ACTION_TYPES.DAY_CLOSED]: 'Day Closed',
    [ACTION_TYPES.SETTINGS_CHANGED]: 'Settings Changed',
    [ACTION_TYPES.TEMPLATE_SAVED]: 'Template Saved',
    [ACTION_TYPES.TEMPLATE_CREATED]: 'Template Created',
    [ACTION_TYPES.TEMPLATE_DELETED]: 'Template Deleted',
    [ACTION_TYPES.TEMPLATE_BLOCK_ADDED]: 'Time Block Added',
    [ACTION_TYPES.TEMPLATE_BLOCK_DELETED]: 'Time Block Deleted',
    [ACTION_TYPES.TEMPLATE_BLOCK_MODIFIED]: 'Time Block Modified',
    [ACTION_TYPES.TEMPLATE_TASK_ADDED]: 'Default Task Added',
    [ACTION_TYPES.TEMPLATE_TASK_DELETED]: 'Default Task Removed',
    [ACTION_TYPES.HOLIDAY_ENABLED]: 'Holiday Mode Enabled',
};

// Icons for each action type
export const ACTION_ICONS = {
    [ACTION_TYPES.TASK_ADDED]: '➕',
    [ACTION_TYPES.TASK_COMPLETED]: '✓',
    [ACTION_TYPES.TASK_SKIPPED]: '⏭️',
    [ACTION_TYPES.TASK_DELETED]: '🗑️',
    [ACTION_TYPES.MEAL_LOGGED]: '🍽️',
    [ACTION_TYPES.MEAL_COMPLETED]: '✓',
    [ACTION_TYPES.MEAL_SKIPPED]: '⏭️',
    [ACTION_TYPES.WORKOUT_STARTED]: '🏋️',
    [ACTION_TYPES.WORKOUT_COMPLETED]: '💪',
    [ACTION_TYPES.WORKOUT_SKIPPED]: '⏭️',
    [ACTION_TYPES.REST_DAY_SET]: '🛌',
    [ACTION_TYPES.DAY_CLOSED]: '🔒',
    [ACTION_TYPES.SETTINGS_CHANGED]: '⚙️',
    [ACTION_TYPES.TEMPLATE_SAVED]: '📝',
    [ACTION_TYPES.TEMPLATE_CREATED]: '📋',
    [ACTION_TYPES.TEMPLATE_DELETED]: '🗑️',
    [ACTION_TYPES.TEMPLATE_BLOCK_ADDED]: '⏰',
    [ACTION_TYPES.TEMPLATE_BLOCK_DELETED]: '🗑️',
    [ACTION_TYPES.TEMPLATE_BLOCK_MODIFIED]: '✏️',
    [ACTION_TYPES.TEMPLATE_TASK_ADDED]: '➕',
    [ACTION_TYPES.TEMPLATE_TASK_DELETED]: '➖',
    [ACTION_TYPES.HOLIDAY_ENABLED]: '🏖️',
};

// Max actions to keep in history
const MAX_HISTORY_SIZE = 50;

// In-memory action history (synced with localStorage)
let actionHistory = [];
let isInitialized = false;

/**
 * Initialize action history from localStorage
 */
export function initActionHistory() {
    try {
        const stored = localStorage.getItem('continuum_action_history');
        actionHistory = stored ? JSON.parse(stored) : [];
        isInitialized = true;
    } catch {
        actionHistory = [];
        isInitialized = true;
    }
    return actionHistory;
}

/**
 * Ensure history is loaded
 */
function ensureInitialized() {
    if (!isInitialized) {
        initActionHistory();
    }
}

/**
 * Save action history to localStorage
 */
function saveHistory() {
    try {
        localStorage.setItem('continuum_action_history', JSON.stringify(actionHistory));
    } catch (e) {
        console.error('Failed to save action history:', e);
    }
}

/**
 * Record a new action
 * @param {string} type - Action type from ACTION_TYPES
 * @param {string} description - Human-readable description
 * @param {Object} previousState - Previous state for undo
 * @param {Object} metadata - Additional action metadata
 */
export function recordAction(type, description, previousState = null, metadata = {}) {
    ensureInitialized();

    const action = {
        id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        type,
        description,
        previousState,
        metadata,
        timestamp: new Date().toISOString(),
        canUndo: previousState !== null,
    };

    // Add to beginning (newest first)
    actionHistory.unshift(action);

    // Limit history size
    if (actionHistory.length > MAX_HISTORY_SIZE) {
        actionHistory = actionHistory.slice(0, MAX_HISTORY_SIZE);
    }

    saveHistory();
    console.log('[ActionHistory] Recorded:', type, description, metadata);
    return action;
}

/**
 * Get action history
 * @param {number} limit - Number of actions to return
 */
export function getActionHistory(limit = 10) {
    ensureInitialized();
    return actionHistory.slice(0, limit);
}

/**
 * Get a specific action by ID
 */
export function getAction(actionId) {
    ensureInitialized();
    return actionHistory.find(a => a.id === actionId);
}

/**
 * Remove an action from history (after undo)
 */
export function removeAction(actionId) {
    ensureInitialized();
    actionHistory = actionHistory.filter(a => a.id !== actionId);
    saveHistory();
}

/**
 * Clear all action history
 */
export function clearActionHistory() {
    actionHistory = [];
    saveHistory();
}

/**
 * Format timestamp for display
 */
export function formatActionTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // Less than 1 minute
    if (diff < 60000) {
        return 'Just now';
    }

    // Less than 1 hour
    if (diff < 3600000) {
        const mins = Math.floor(diff / 60000);
        return `${mins}m ago`;
    }

    // Less than 24 hours
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours}h ago`;
    }

    // Show date
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

/**
 * Undo handlers for different action types
 * Returns the undo function or null if not undoable
 */
export const UNDO_HANDLERS = {
    [ACTION_TYPES.TASK_COMPLETED]: async (action) => {
        // Restore task to pending status
        console.log('[Undo] Restoring task to pending:', action.metadata);
        const db = await getDB();
        const task = await db.get(STORES.TASKS, action.metadata.taskId);
        console.log('[Undo] Found task:', task);
        if (task && action.previousState) {
            task.status = action.previousState.status || 'pending';
            task.completedAt = null;
            await db.put(STORES.TASKS, task);
            console.log('[Undo] Task restored to:', task.status);
            return true;
        }
        console.log('[Undo] Task not found or no previous state');
        return false;
    },

    [ACTION_TYPES.TASK_SKIPPED]: async (action) => {
        console.log('[Undo] Restoring skipped task:', action.metadata);
        const db = await getDB();
        const task = await db.get(STORES.TASKS, action.metadata.taskId);
        if (task && action.previousState) {
            task.status = action.previousState.status || 'pending';
            task.skipReason = null;
            await db.put(STORES.TASKS, task);
            console.log('[Undo] Task skip undone');
            return true;
        }
        return false;
    },

    [ACTION_TYPES.TASK_ADDED]: async (action) => {
        // Delete the added task
        console.log('[Undo] Deleting added task:', action.metadata);
        const db = await getDB();
        if (action.metadata.taskId) {
            await db.delete(STORES.TASKS, action.metadata.taskId);
            console.log('[Undo] Task deleted');
            return true;
        }
        return false;
    },

    [ACTION_TYPES.MEAL_COMPLETED]: async (action) => {
        const db = await getDB();
        const meal = await db.get(STORES.MEALS, action.metadata.mealId);
        if (meal && action.previousState) {
            meal.status = action.previousState.status || 'pending';
            meal.completedAt = null;
            await db.put(STORES.MEALS, meal);
            return true;
        }
        return false;
    },

    [ACTION_TYPES.MEAL_SKIPPED]: async (action) => {
        const db = await getDB();
        const meal = await db.get(STORES.MEALS, action.metadata.mealId);
        if (meal && action.previousState) {
            meal.status = action.previousState.status || 'pending';
            meal.skipReason = null;
            await db.put(STORES.MEALS, meal);
            return true;
        }
        return false;
    },

    [ACTION_TYPES.WORKOUT_COMPLETED]: async (action) => {
        const db = await getDB();
        const session = await db.get(STORES.TRAINING_SESSIONS, action.metadata.date);
        if (session && action.previousState) {
            session.status = action.previousState.status || 'pending';
            // Training sessions use endTime and totalDuration, not completedAt
            session.endTime = null;
            session.totalDuration = 0;
            await db.put(STORES.TRAINING_SESSIONS, session);
            return true;
        }
        return false;
    },

    [ACTION_TYPES.WORKOUT_SKIPPED]: async (action) => {
        const db = await getDB();
        const session = await db.get(STORES.TRAINING_SESSIONS, action.metadata.date);
        if (session && action.previousState) {
            session.status = action.previousState.status || 'pending';
            session.skipReason = null;
            await db.put(STORES.TRAINING_SESSIONS, session);
            return true;
        }
        return false;
    },

    [ACTION_TYPES.REST_DAY_SET]: async (action) => {
        console.log('[Undo] Restoring rest day to pending:', action.metadata);
        const db = await getDB();
        const session = await db.get(STORES.TRAINING_SESSIONS, action.metadata.date);
        if (session && action.previousState) {
            session.status = action.previousState.status || 'pending';
            await db.put(STORES.TRAINING_SESSIONS, session);
            console.log('[Undo] Rest day undone, status restored to:', session.status);
            return true;
        }
        return false;
    },

    // Template undo handlers
    [ACTION_TYPES.TEMPLATE_CREATED]: async (action) => {
        console.log('[Undo] Deleting created template:', action.metadata);
        const db = await getDB();
        if (action.metadata.templateId) {
            await db.delete(STORES.TEMPLATES, action.metadata.templateId);
            console.log('[Undo] Template deleted');
            return true;
        }
        return false;
    },

    [ACTION_TYPES.TEMPLATE_DELETED]: async (action) => {
        console.log('[Undo] Restoring deleted template:', action.metadata);
        const db = await getDB();
        if (action.previousState?.template) {
            await db.put(STORES.TEMPLATES, action.previousState.template);
            console.log('[Undo] Template restored');
            return true;
        }
        return false;
    },

    [ACTION_TYPES.TEMPLATE_SAVED]: async (action) => {
        console.log('[Undo] Restoring template to previous state:', action.metadata);
        const db = await getDB();
        if (action.previousState?.template) {
            await db.put(STORES.TEMPLATES, action.previousState.template);
            console.log('[Undo] Template changes reverted');
            return true;
        }
        return false;
    },

    [ACTION_TYPES.TEMPLATE_BLOCK_ADDED]: async (action) => {
        console.log('[Undo] Removing added block:', action.metadata);
        const db = await getDB();
        const template = await db.get(STORES.TEMPLATES, action.metadata.templateId);
        if (template && action.metadata.blockId) {
            template.timeBlocks = template.timeBlocks.filter(b => b.id !== action.metadata.blockId);
            await db.put(STORES.TEMPLATES, template);
            console.log('[Undo] Block removed');
            return true;
        }
        return false;
    },

    [ACTION_TYPES.TEMPLATE_BLOCK_DELETED]: async (action) => {
        console.log('[Undo] Restoring deleted block:', action.metadata);
        const db = await getDB();
        const template = await db.get(STORES.TEMPLATES, action.metadata.templateId);
        if (template && action.previousState?.block) {
            template.timeBlocks = template.timeBlocks || [];
            // Insert at original position if known, otherwise add to end
            const insertIndex = action.previousState.blockIndex ?? template.timeBlocks.length;
            template.timeBlocks.splice(insertIndex, 0, action.previousState.block);
            await db.put(STORES.TEMPLATES, template);
            console.log('[Undo] Block restored');
            return true;
        }
        return false;
    },

    [ACTION_TYPES.TEMPLATE_BLOCK_MODIFIED]: async (action) => {
        console.log('[Undo] Reverting block modification:', action.metadata);
        const db = await getDB();
        const template = await db.get(STORES.TEMPLATES, action.metadata.templateId);
        if (template && action.previousState?.block) {
            const blockIndex = template.timeBlocks.findIndex(b => b.id === action.metadata.blockId);
            if (blockIndex !== -1) {
                template.timeBlocks[blockIndex] = action.previousState.block;
                await db.put(STORES.TEMPLATES, template);
                console.log('[Undo] Block reverted');
                return true;
            }
        }
        return false;
    },

    [ACTION_TYPES.TEMPLATE_TASK_ADDED]: async (action) => {
        console.log('[Undo] Removing added task:', action.metadata);
        const db = await getDB();
        const template = await db.get(STORES.TEMPLATES, action.metadata.templateId);
        if (template) {
            const block = template.timeBlocks.find(b => b.id === action.metadata.blockId);
            if (block && block.defaultTasks) {
                // Remove the task at the specified index
                const taskIndex = action.metadata.taskIndex ?? (block.defaultTasks.length - 1);
                block.defaultTasks.splice(taskIndex, 1);
                await db.put(STORES.TEMPLATES, template);
                console.log('[Undo] Task removed');
                return true;
            }
        }
        return false;
    },

    [ACTION_TYPES.TEMPLATE_TASK_DELETED]: async (action) => {
        console.log('[Undo] Restoring deleted task:', action.metadata);
        const db = await getDB();
        const template = await db.get(STORES.TEMPLATES, action.metadata.templateId);
        if (template && action.previousState?.task) {
            const block = template.timeBlocks.find(b => b.id === action.metadata.blockId);
            if (block) {
                block.defaultTasks = block.defaultTasks || [];
                const insertIndex = action.previousState.taskIndex ?? block.defaultTasks.length;
                block.defaultTasks.splice(insertIndex, 0, action.previousState.task);
                await db.put(STORES.TEMPLATES, template);
                console.log('[Undo] Task restored');
                return true;
            }
        }
        return false;
    },
};

/**
 * Check if an action can be undone
 */
export function canUndo(action) {
    if (!action) return false;

    // Check if handler exists for this action type
    const hasHandler = !!UNDO_HANDLERS[action.type];

    // For task_added, we don't need previousState
    if (action.type === ACTION_TYPES.TASK_ADDED) {
        return hasHandler && !!action.metadata?.taskId;
    }

    // For template_created, we just need templateId
    if (action.type === ACTION_TYPES.TEMPLATE_CREATED) {
        return hasHandler && !!action.metadata?.templateId;
    }

    // For template_block_added, we need templateId and blockId
    if (action.type === ACTION_TYPES.TEMPLATE_BLOCK_ADDED) {
        return hasHandler && !!action.metadata?.templateId && !!action.metadata?.blockId;
    }

    // For template_task_added, we need templateId and blockId
    if (action.type === ACTION_TYPES.TEMPLATE_TASK_ADDED) {
        return hasHandler && !!action.metadata?.templateId && !!action.metadata?.blockId;
    }

    // For other actions, need canUndo flag
    return hasHandler && action.canUndo;
}

/**
 * Execute undo for an action
 */
export async function undoAction(actionId) {
    ensureInitialized();

    console.log('[Undo] Looking for action:', actionId);
    const action = getAction(actionId);

    if (!action) {
        console.error('[Undo] Action not found:', actionId);
        throw new Error('Action not found');
    }

    console.log('[Undo] Found action:', action);

    if (!canUndo(action)) {
        console.error('[Undo] Action cannot be undone:', action.type);
        throw new Error('This action cannot be undone');
    }

    const handler = UNDO_HANDLERS[action.type];
    if (!handler) {
        console.error('[Undo] No handler for:', action.type);
        throw new Error('Undo not supported for this action');
    }

    try {
        console.log('[Undo] Executing handler for:', action.type);
        const success = await handler(action);
        console.log('[Undo] Handler result:', success);

        if (success) {
            removeAction(actionId);
            console.log('[Undo] Action removed from history');
            return true;
        }

        throw new Error('Failed to undo action');
    } catch (error) {
        console.error('[Undo] Error:', error);
        throw error;
    }
}
