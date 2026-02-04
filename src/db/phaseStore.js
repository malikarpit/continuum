/**
 * Phase Store
 * Manages 4-week training/nutrition phases with progression tracking
 */

import { getDB, STORES } from './database';
import { getDateString } from './dayStore';

/**
 * Phase Status
 */
export const PHASE_STATUS = {
    ACTIVE: 'active',
    COMPLETED: 'completed',
    PAUSED: 'paused',
};

/**
 * Phase Types
 */
export const PHASE_TYPE = {
    TRAINING_FOCUS: 'training_focus',
    NUTRITION_FOCUS: 'nutrition_focus',
    COMBINED: 'combined',
    DELOAD: 'deload',
};

/**
 * Generate phase ID
 */
export function generatePhaseId() {
    return `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new phase
 */
export function createPhase(data) {
    const startDate = data.startDate || getDateString();
    const endDate = new Date(startDate + 'T12:00:00');
    endDate.setDate(endDate.getDate() + 27); // 4 weeks = 28 days

    return {
        id: generatePhaseId(),
        name: data.name || 'Training Phase',
        type: data.type || PHASE_TYPE.COMBINED,
        status: PHASE_STATUS.ACTIVE,
        startDate,
        endDate: getDateString(endDate),
        weekCount: 4,
        currentWeek: 1,
        goals: data.goals || [],
        weeklyTargets: data.weeklyTargets || {
            training: { sessions: 5, totalDuration: 300 },
            tasks: { completionRate: 80 },
            nutrition: { proteinTarget: 130, calorieTarget: 2200 },
        },
        progressByWeek: {},
        notes: data.notes || '',
        createdAt: new Date().toISOString(),
        completedAt: null,
    };
}

/**
 * Get active phase
 */
export async function getActivePhase() {
    const db = await getDB();
    const allPhases = await db.getAll(STORES.PHASES);
    return allPhases.find(p => p.status === PHASE_STATUS.ACTIVE) || null;
}

/**
 * Get all phases
 */
export async function getAllPhases() {
    const db = await getDB();
    return db.getAll(STORES.PHASES);
}

/**
 * Save phase
 */
export async function savePhase(phase) {
    const db = await getDB();
    return db.put(STORES.PHASES, phase);
}

/**
 * Start a new phase
 */
export async function startPhase(phaseData) {
    // Complete any active phase first
    const activePhase = await getActivePhase();
    if (activePhase) {
        activePhase.status = PHASE_STATUS.COMPLETED;
        activePhase.completedAt = new Date().toISOString();
        await savePhase(activePhase);
    }

    const newPhase = createPhase(phaseData);
    await savePhase(newPhase);
    return newPhase;
}

/**
 * Complete current phase
 */
export async function completePhase(phaseId) {
    const db = await getDB();
    const phase = await db.get(STORES.PHASES, phaseId);

    if (!phase) {
        throw new Error('Phase not found');
    }

    phase.status = PHASE_STATUS.COMPLETED;
    phase.completedAt = new Date().toISOString();

    return savePhase(phase);
}

/**
 * Update phase progress for a week
 */
export async function updateWeekProgress(phaseId, weekNumber, progressData) {
    const db = await getDB();
    const phase = await db.get(STORES.PHASES, phaseId);

    if (!phase) {
        throw new Error('Phase not found');
    }

    phase.progressByWeek[weekNumber] = {
        ...phase.progressByWeek[weekNumber],
        ...progressData,
        updatedAt: new Date().toISOString(),
    };

    // Update current week
    phase.currentWeek = weekNumber;

    return savePhase(phase);
}

/**
 * Calculate current week of phase based on date
 */
export function calculatePhaseWeek(phase) {
    if (!phase) return 0;

    const today = new Date(getDateString() + 'T12:00:00');
    const start = new Date(phase.startDate + 'T12:00:00');

    const diffDays = Math.floor((today - start) / (1000 * 60 * 60 * 24));
    const week = Math.floor(diffDays / 7) + 1;

    return Math.min(Math.max(week, 1), 4);
}

/**
 * Get phase progress summary
 */
export async function getPhaseProgress(phaseId) {
    const db = await getDB();
    const phase = await db.get(STORES.PHASES, phaseId);

    if (!phase) return null;

    const currentWeek = calculatePhaseWeek(phase);
    const weeksCompleted = Object.keys(phase.progressByWeek).length;

    // Calculate overall progress
    const weeklyProgress = [];
    for (let w = 1; w <= 4; w++) {
        const progress = phase.progressByWeek[w] || null;
        weeklyProgress.push({
            week: w,
            status: w < currentWeek ? 'completed' : (w === currentWeek ? 'current' : 'future'),
            data: progress,
        });
    }

    return {
        phase,
        currentWeek,
        daysRemaining: Math.max(0, Math.floor((new Date(phase.endDate) - new Date()) / (1000 * 60 * 60 * 24))),
        percentComplete: Math.round(((currentWeek - 1) / 4) * 100),
        weeklyProgress,
    };
}

/**
 * Check if gym is closed (Sunday detection)
 */
export function isGymClosedDay(date) {
    const d = typeof date === 'string' ? new Date(date + 'T12:00:00') : date;
    return d.getDay() === 0; // Sunday
}

/**
 * Get suggested training mode considering gym closure
 */
export function getSuggestedTrainingMode(date) {
    if (isGymClosedDay(date)) {
        return {
            mode: 'home',
            reason: 'Gym closed on Sunday',
            suggestions: ['home_workout', 'rest', 'outdoor'],
        };
    }

    return {
        mode: 'gym',
        reason: 'Regular training day',
        suggestions: ['gym_upper', 'gym_lower', 'full_body'],
    };
}
