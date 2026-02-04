/**
 * Analytics Engine
 * Prepares data for Chart.js visualizations and provides aggregate statistics
 */

import { getDB, STORES } from './database';
import { getDateString } from './dayStore';
import { TASK_STATUS } from './taskStore';
import { TRAINING_STATUS } from './trainingStore';
import { MEAL_STATUS } from './mealStore';

/**
 * Get date range helper
 */
export function getDateRange(days = 7) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days + 1);

    return {
        start: getDateString(startDate),
        end: getDateString(endDate),
    };
}

/**
 * Generate array of dates between start and end
 */
export function getDatesBetween(startDate, endDate) {
    const dates = [];
    const start = new Date(startDate + 'T12:00:00');
    const end = new Date(endDate + 'T12:00:00');

    const current = new Date(start);
    while (current <= end) {
        dates.push(getDateString(current));
        current.setDate(current.getDate() + 1);
    }

    return dates;
}

/**
 * Prepare task completion chart data
 * Returns data for a line/bar chart showing tasks completed over time
 */
export async function getTaskCompletionChartData(days = 7) {
    const { start, end } = getDateRange(days);
    const dates = getDatesBetween(start, end);

    const db = await getDB();
    const allTasks = await db.getAll(STORES.TASKS);

    const data = dates.map(date => {
        const dayTasks = allTasks.filter(t => t.date === date);
        const completed = dayTasks.filter(t => t.status === TASK_STATUS.COMPLETED).length;
        const total = dayTasks.length;

        return {
            date,
            label: formatDateLabel(date),
            completed,
            total,
            rate: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
    });

    return {
        labels: data.map(d => d.label),
        datasets: [
            {
                label: 'Completed',
                data: data.map(d => d.completed),
                backgroundColor: 'rgba(34, 197, 94, 0.6)',
                borderColor: 'rgb(34, 197, 94)',
            },
            {
                label: 'Total',
                data: data.map(d => d.total),
                backgroundColor: 'rgba(99, 102, 241, 0.3)',
                borderColor: 'rgb(99, 102, 241)',
            },
        ],
        raw: data,
    };
}

/**
 * Prepare training frequency chart data
 */
export async function getTrainingChartData(days = 30) {
    const { start, end } = getDateRange(days);
    const dates = getDatesBetween(start, end);

    const db = await getDB();
    const allSessions = await db.getAll(STORES.TRAINING_SESSIONS);

    const data = dates.map(date => {
        const session = allSessions.find(s => s.date === date);

        return {
            date,
            label: formatDateLabel(date),
            status: session?.status || 'none',
            duration: session?.totalDuration || 0,
            completed: session?.status === TRAINING_STATUS.COMPLETED ? 1 : 0,
        };
    });

    // Group by week for easier visualization
    const weeklyData = [];
    for (let i = 0; i < data.length; i += 7) {
        const week = data.slice(i, i + 7);
        weeklyData.push({
            weekStart: week[0]?.date,
            completed: week.reduce((sum, d) => sum + d.completed, 0),
            totalDuration: week.reduce((sum, d) => sum + d.duration, 0),
        });
    }

    return {
        labels: data.map(d => d.label),
        datasets: [
            {
                label: 'Duration (min)',
                data: data.map(d => d.duration),
                backgroundColor: 'rgba(245, 158, 11, 0.6)',
                borderColor: 'rgb(245, 158, 11)',
                type: 'bar',
            },
        ],
        raw: data,
        weekly: weeklyData,
    };
}

/**
 * Prepare nutrition chart data
 */
export async function getNutritionChartData(days = 7) {
    const { start, end } = getDateRange(days);
    const dates = getDatesBetween(start, end);

    const db = await getDB();
    const allMeals = await db.getAll(STORES.MEALS);

    const data = dates.map(date => {
        const dayMeals = allMeals.filter(m => m.date === date && m.status === MEAL_STATUS.COMPLETED);

        const totals = dayMeals.reduce((acc, meal) => ({
            calories: acc.calories + (meal.totals?.calories || 0),
            protein: acc.protein + (meal.totals?.protein || 0),
            carbs: acc.carbs + (meal.totals?.carbs || 0),
            fats: acc.fats + (meal.totals?.fats || 0),
        }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

        return {
            date,
            label: formatDateLabel(date),
            ...totals,
            mealsLogged: dayMeals.length,
        };
    });

    return {
        labels: data.map(d => d.label),
        datasets: [
            {
                label: 'Protein (g)',
                data: data.map(d => d.protein),
                backgroundColor: 'rgba(34, 197, 94, 0.6)',
                borderColor: 'rgb(34, 197, 94)',
                yAxisID: 'y',
            },
            {
                label: 'Calories',
                data: data.map(d => d.calories),
                backgroundColor: 'rgba(239, 68, 68, 0.3)',
                borderColor: 'rgb(239, 68, 68)',
                yAxisID: 'y1',
            },
        ],
        raw: data,
    };
}

/**
 * Get weekly summary data
 */
export async function getWeeklySummary(weeksAgo = 0) {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - (weeksAgo * 7));

    // Adjust to end of week (Sunday)
    const dayOfWeek = endDate.getDay();
    endDate.setDate(endDate.getDate() - dayOfWeek);

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);

    const start = getDateString(startDate);
    const end = getDateString(endDate);

    const db = await getDB();
    const allDays = await db.getAll(STORES.DAYS);
    const allTasks = await db.getAll(STORES.TASKS);
    const allSessions = await db.getAll(STORES.TRAINING_SESSIONS);
    const allMeals = await db.getAll(STORES.MEALS);

    // Filter to week
    const weekDays = allDays.filter(d => d.date >= start && d.date <= end);
    const weekTasks = allTasks.filter(t => t.date >= start && t.date <= end);
    const weekSessions = allSessions.filter(s => s.date >= start && s.date <= end);
    const weekMeals = allMeals.filter(m => m.date >= start && m.date <= end);

    return {
        weekRange: { start, end },
        days: {
            total: 7,
            active: weekDays.filter(d => d.status === 'active').length,
            holidays: weekDays.filter(d => d.isHoliday).length,
            inactive: weekDays.filter(d => d.status === 'inactive').length,
        },
        tasks: {
            total: weekTasks.length,
            completed: weekTasks.filter(t => t.status === TASK_STATUS.COMPLETED).length,
            skipped: weekTasks.filter(t => t.status === TASK_STATUS.SKIPPED).length,
            missed: weekTasks.filter(t => t.status === TASK_STATUS.MISSED).length,
            completionRate: weekTasks.length > 0
                ? Math.round((weekTasks.filter(t => t.status === TASK_STATUS.COMPLETED).length / weekTasks.length) * 100)
                : 0,
        },
        training: {
            total: weekSessions.length,
            completed: weekSessions.filter(s => s.status === TRAINING_STATUS.COMPLETED).length,
            skipped: weekSessions.filter(s => s.status === TRAINING_STATUS.SKIPPED).length,
            rest: weekSessions.filter(s => s.status === TRAINING_STATUS.REST).length,
            totalDuration: weekSessions.reduce((sum, s) => sum + (s.totalDuration || 0), 0),
        },
        meals: {
            total: weekMeals.length,
            completed: weekMeals.filter(m => m.status === MEAL_STATUS.COMPLETED).length,
            skipped: weekMeals.filter(m => m.status === MEAL_STATUS.SKIPPED).length,
            avgProtein: weekMeals.length > 0
                ? Math.round(weekMeals.reduce((sum, m) => sum + (m.totals?.protein || 0), 0) / 7)
                : 0,
        },
    };
}

/**
 * Get daily detail for calendar view
 */
export async function getDayDetail(date) {
    const dateStr = typeof date === 'string' ? date : getDateString(date);

    const db = await getDB();
    const day = await db.get(STORES.DAYS, dateStr);
    const tasks = await db.getAllFromIndex(STORES.TASKS, 'date', dateStr);
    const training = await db.get(STORES.TRAINING_SESSIONS, dateStr);
    const meals = await db.getAllFromIndex(STORES.MEALS, 'date', dateStr);

    // Calculate totals
    const mealTotals = meals.reduce((acc, meal) => ({
        calories: acc.calories + (meal.totals?.calories || 0),
        protein: acc.protein + (meal.totals?.protein || 0),
        carbs: acc.carbs + (meal.totals?.carbs || 0),
        fats: acc.fats + (meal.totals?.fats || 0),
    }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

    return {
        date: dateStr,
        day,
        tasks: {
            items: tasks.sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || '')),
            completed: tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length,
            total: tasks.length,
        },
        training: {
            session: training,
            exercises: training?.exercises?.length || 0,
            duration: training?.totalDuration || 0,
        },
        meals: {
            items: meals,
            logged: meals.filter(m => m.status === MEAL_STATUS.COMPLETED).length,
            totals: mealTotals,
        },
        flags: day?.flags || { injury: false, soreness: false },
        notes: day?.notes || '',
    };
}

/**
 * Get time block completion analytics
 */
export async function getTimeBlockAnalytics(days = 7) {
    const { start, end } = getDateRange(days);

    const db = await getDB();
    const allTasks = await db.getAll(STORES.TASKS);
    const allDays = await db.getAll(STORES.DAYS);

    // Filter to date range
    const tasks = allTasks.filter(t => t.date >= start && t.date <= end);
    const daysData = allDays.filter(d => d.date >= start && d.date <= end);

    // Group by block
    const blockStats = {};
    const defaultBlocks = ['morning', 'midday', 'evening', 'night'];

    for (const block of defaultBlocks) {
        blockStats[block] = {
            total: 0,
            completed: 0,
            rate: 0,
        };
    }

    for (const task of tasks) {
        const blockId = task.blockId || 'other';
        if (!blockStats[blockId]) {
            blockStats[blockId] = { total: 0, completed: 0, rate: 0 };
        }
        blockStats[blockId].total++;
        if (task.status === TASK_STATUS.COMPLETED) {
            blockStats[blockId].completed++;
        }
    }

    // Calculate rates
    for (const block of Object.keys(blockStats)) {
        const stats = blockStats[block];
        stats.rate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    }

    return blockStats;
}

// Helper functions
function formatDateLabel(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
