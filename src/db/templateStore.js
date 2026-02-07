/**
 * Template Store
 * Manages day templates with time blocks and predefined tasks
 */

import { getDB, STORES } from './database';

/**
 * Time Block Categories
 */
export const TIME_BLOCK = {
    MORNING: 'morning',
    MIDDAY: 'midday',
    AFTERNOON: 'afternoon',
    EVENING: 'evening',
    NIGHT: 'night',
};

/**
 * Default Day Template from SRS Section 5.4
 * Day: 5:00 AM to 12:00 AM (midnight)
 */
export const DEFAULT_TIME_BLOCKS = [
    {
        id: 'morning',
        name: 'Morning Block',
        startTime: '05:00',
        endTime: '09:00',
        color: '#fbbf24', // Yellow/amber for sunrise
        icon: '🌅', // Custom emoji for the block
        defaultTasks: [
            { title: 'Wake-up routine', category: 'personal', priority: 'high' },
            { title: 'Light movement / Mobility', category: 'health', priority: 'medium' },
            { title: 'Breakfast', category: 'health', priority: 'high' },
        ],
    },
    {
        id: 'midday',
        name: 'Midday Block',
        startTime: '09:00',
        endTime: '14:00',
        color: '#22d3ee', // Cyan for active day
        icon: '☀️',
        defaultTasks: [
            { title: 'Study / College work', category: 'college', priority: 'high' },
            { title: 'Lunch', category: 'health', priority: 'high' },
        ],
    },
    {
        id: 'afternoon',
        name: 'Afternoon Block',
        startTime: '14:00',
        endTime: '18:00',
        color: '#a78bfa', // Purple for focused work
        icon: '💼',
        defaultTasks: [
            { title: 'Project work', category: 'personal', priority: 'medium' },
            { title: 'Snack', category: 'health', priority: 'low' },
        ],
    },
    {
        id: 'evening',
        name: 'Evening Block',
        startTime: '18:00',
        endTime: '21:00',
        color: '#22c55e', // Green for training
        icon: '🏋️',
        defaultTasks: [
            { title: 'Gym / Training', category: 'health', priority: 'high' },
            { title: 'Dinner', category: 'health', priority: 'high' },
        ],
    },
    {
        id: 'night',
        name: 'Night Block',
        startTime: '21:00',
        endTime: '00:00', // Midnight
        color: '#6366f1', // Indigo for wind-down
        icon: '🌙',
        defaultTasks: [
            { title: 'Light review / Reading', category: 'personal', priority: 'low' },
            { title: 'Day close & reflection', category: 'personal', priority: 'medium' },
        ],
    },
];

/**
 * Holiday/Travel Day Template (from Missing Features PDF)
 * Minimal viable adherence - only 3 priorities
 */
export const HOLIDAY_TEMPLATE = {
    id: 'holiday',
    name: 'Holiday / Travel Day',
    isHoliday: true,
    priorities: [
        {
            id: 'movement',
            title: 'Movement',
            description: 'Any walk (10+ min) or stairs/standing',
            required: false,
        },
        {
            id: 'protein',
            title: 'Protein',
            description: '2+ eggs or dal/paneer/curd',
            required: false,
        },
        {
            id: 'hydration',
            title: 'Hydration',
            description: '4+ glasses of water',
            required: false,
        },
    ],
    successCriteria: {
        acceptable: 1, // 1/3 = acceptable
        good: 2,       // 2/3 = good
        perfect: 3,    // 3/3 = perfect
    },
};

/**
 * Days of week for template assignment
 * null = applies to all days (default template)
 * 0-6 = Sunday through Saturday
 */
export const DAYS_OF_WEEK = [
    { value: 0, label: 'Sunday', short: 'Sun' },
    { value: 1, label: 'Monday', short: 'Mon' },
    { value: 2, label: 'Tuesday', short: 'Tue' },
    { value: 3, label: 'Wednesday', short: 'Wed' },
    { value: 4, label: 'Thursday', short: 'Thu' },
    { value: 5, label: 'Friday', short: 'Fri' },
    { value: 6, label: 'Saturday', short: 'Sat' },
];

/**
 * Generate unique template ID
 */
export function generateTemplateId() {
    return `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new template
 */
export function createTemplate(data) {
    return {
        id: generateTemplateId(),
        name: data.name || 'Custom Template',
        isDefault: data.isDefault || false,
        isHoliday: data.isHoliday || false,
        dayOfWeek: data.dayOfWeek ?? null, // null = all days, 0-6 = specific day
        // Deep clone to prevent shared nested objects
        timeBlocks: data.timeBlocks || JSON.parse(JSON.stringify(DEFAULT_TIME_BLOCKS)),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

/**
 * Get all templates
 */
export async function getAllTemplates() {
    const db = await getDB();
    const templates = await db.getAll(STORES.TEMPLATES);

    // If no templates exist, initialize with default
    if (templates.length === 0) {
        await initializeDefaultTemplates();
        return db.getAll(STORES.TEMPLATES);
    }

    return templates;
}

/**
 * Get default template
 */
export async function getDefaultTemplate() {
    const templates = await getAllTemplates();
    return templates.find(t => t.isDefault) || templates[0];
}

/**
 * Get template assigned to a specific day of week
 * @param {number} dayOfWeek - 0 (Sunday) through 6 (Saturday)
 * @returns {Object|null} Template for that day or null
 */
export async function getTemplateForDayOfWeek(dayOfWeek) {
    const templates = await getAllTemplates();
    return templates.find(t => t.dayOfWeek === dayOfWeek && !t.isHoliday) || null;
}

/**
 * Get the effective template for a specific date
 * Priority: 1. Day-specific template, 2. Default template
 * @param {Date} date - The date to get template for
 * @returns {Object} The template to use
 */
export async function getEffectiveTemplate(date) {
    const dayOfWeek = date.getDay(); // 0-6

    // First check for day-specific template
    const dayTemplate = await getTemplateForDayOfWeek(dayOfWeek);
    if (dayTemplate) {
        return dayTemplate;
    }

    // Fall back to default
    return getDefaultTemplate();
}

/**
 * Get template by ID
 */
export async function getTemplate(id) {
    const db = await getDB();
    return db.get(STORES.TEMPLATES, id);
}

/**
 * Save template
 */
export async function saveTemplate(template) {
    const db = await getDB();
    template.updatedAt = new Date().toISOString();
    return db.put(STORES.TEMPLATES, template);
}

/**
 * Delete template (not allowed for default)
 */
export async function deleteTemplate(id) {
    const db = await getDB();
    const template = await db.get(STORES.TEMPLATES, id);

    if (template?.isDefault) {
        throw new Error('Cannot delete default template');
    }

    return db.delete(STORES.TEMPLATES, id);
}

/**
 * Initialize default templates
 */
export async function initializeDefaultTemplates() {
    const db = await getDB();
    const existing = await db.getAll(STORES.TEMPLATES);

    if (existing.length > 0) return;

    // Create default weekday template
    const defaultTemplate = createTemplate({
        name: 'Default Day',
        isDefault: true,
        timeBlocks: DEFAULT_TIME_BLOCKS,
    });
    defaultTemplate.id = 'default';
    await db.put(STORES.TEMPLATES, defaultTemplate);

    // Create holiday template
    const holidayTemplate = {
        id: 'holiday',
        name: 'Holiday / Travel Day',
        isDefault: false,
        isHoliday: true,
        priorities: HOLIDAY_TEMPLATE.priorities,
        successCriteria: HOLIDAY_TEMPLATE.successCriteria,
        timeBlocks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    await db.put(STORES.TEMPLATES, holidayTemplate);

    // console.log('Default templates initialized');
}

/**
 * Get the current time block based on time
 * @param {Date} time - Current time
 * @param {Array} blocks - Time blocks array
 * @returns {Object|null} Current time block or null
 */
export function getCurrentTimeBlock(time, blocks = DEFAULT_TIME_BLOCKS) {
    const hours = time.getHours();
    const minutes = time.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    for (const block of blocks) {
        const [startHour, startMin] = block.startTime.split(':').map(Number);
        const [endHour, endMin] = block.endTime.split(':').map(Number);

        let startMinutes = startHour * 60 + startMin;
        let endMinutes = endHour * 60 + endMin;

        // Handle midnight crossing (e.g., 21:00 to 00:00)
        if (endMinutes === 0) endMinutes = 24 * 60;

        if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
            return block;
        }
    }

    return null;
}

/**
 * Get the next time block
 */
export function getNextTimeBlock(time, blocks = DEFAULT_TIME_BLOCKS) {
    const hours = time.getHours();
    const minutes = time.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    // Sort blocks by startTime to ensure correct ordering
    const sortedBlocks = [...blocks].sort((a, b) => {
        const [aH, aM] = a.startTime.split(':').map(Number);
        const [bH, bM] = b.startTime.split(':').map(Number);
        return (aH * 60 + aM) - (bH * 60 + bM);
    });

    for (const block of sortedBlocks) {
        const [startHour, startMin] = block.startTime.split(':').map(Number);
        const startMinutes = startHour * 60 + startMin;

        if (startMinutes > currentMinutes) {
            return block;
        }
    }

    return sortedBlocks[0]; // Return first block (tomorrow)
}

/**
 * Calculate day progress percentage
 * Uses configurable day boundary hour (default 5 AM)
 * @param {Date} time - Current time
 * @param {number} dayBoundaryHour - Hour when day starts (0-23, default 5)
 */
export function calculateDayProgress(time, dayBoundaryHour = 5) {
    const hours = time.getHours();
    const minutes = time.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    const dayStartMinutes = dayBoundaryHour * 60;  // e.g., 5:00 AM = 300 minutes
    const dayEndMinutes = 24 * 60;   // 12:00 AM = 1440 minutes
    const totalDayMinutes = dayEndMinutes - dayStartMinutes;

    // Before day start
    if (currentMinutes < dayStartMinutes) {
        return 0;
    }

    // Calculate progress
    const elapsedMinutes = currentMinutes - dayStartMinutes;
    const progress = Math.min((elapsedMinutes / totalDayMinutes) * 100, 100);

    return Math.round(progress * 10) / 10; // Round to 1 decimal
}

/**
 * Get tasks for a specific time block from template
 */
export function getTasksForBlock(blockId, template) {
    if (!template?.timeBlocks) return [];

    const block = template.timeBlocks.find(b => b.id === blockId);
    return block?.defaultTasks || [];
}

/**
 * Check if time is within day boundaries (5 AM - 12 AM)
 */
export function isWithinDayBoundaries(time) {
    const hours = time.getHours();
    return hours >= 5 || hours === 0; // 5 AM to 12 AM (midnight)
}

/**
 * Format time block time range
 */
export function formatTimeRange(startTime, endTime) {
    const formatTime = (time) => {
        const [hours, mins] = time.split(':').map(Number);
        const h = hours % 12 || 12;
        const ampm = hours < 12 ? 'AM' : 'PM';
        return `${h}:${mins.toString().padStart(2, '0')} ${ampm}`;
    };

    return `${formatTime(startTime)} - ${formatTime(endTime)}`;
}
