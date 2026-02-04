/**
 * Context Engine
 * Analyzes user context (energy, data, streaks) to make intelligent suggestions
 */

import { getStreakStats } from './dayStore';
import { getLastCompletedTraining, TRAINING_MODE } from './trainingStore';

/**
 * Suggest a workout based on context
 */
export async function suggestWorkout(context) {
    const { energyLevel, soreness, injury, equipment, streak, yesterdayIntensity } = context;

    // 1. Injury Override
    if (injury) {
        return {
            type: 'recovery',
            reason: 'Injury reported - focus on rehabilitation',
            intensity: 'low'
        };
    }

    // 2. Energy & Soreness Logic
    if (energyLevel <= 2 || soreness) {
        return {
            type: 'emergency',
            reason: soreness ? 'Active recovery for soreness' : 'Low energy - keep it short',
            intensity: 'low'
        };
    }

    // 3. High Energy / Progressive
    if (energyLevel >= 4 && yesterdayIntensity !== 'high') {
        const suggestion = await determineSplitRotation(equipment);

        return {
            type: suggestion.type,
            mode: suggestion.mode,
            reason: 'High energy! Great day to push limits',
            intensity: 'high'
        };
    }

    // 4. Default Balanced
    // Alternate Upper/Lower if using Gym, otherwise Full Body
    const suggestion = await determineSplitRotation(equipment);

    return {
        type: suggestion.type,
        mode: suggestion.mode,
        reason: 'Consistency is key',
        intensity: 'medium'
    };
}

/**
 * Determine which split to recommend based on history
 * Returns an object with training type and mode that maps to real session values
 */
async function determineSplitRotation(equipment) {
    if (equipment !== 'gym') {
        return { type: 'home_workout', mode: TRAINING_MODE.FULL_BODY };
    }

    const lastWorkout = await getLastCompletedTraining();

    // If no history, start with Upper
    if (!lastWorkout) {
        return { type: 'upper_lower', mode: TRAINING_MODE.UPPER };
    }

    // Alternate between upper and lower based on last workout mode
    if (lastWorkout.mode === TRAINING_MODE.UPPER) {
        return { type: 'upper_lower', mode: TRAINING_MODE.LOWER };
    }

    if (lastWorkout.mode === TRAINING_MODE.LOWER) {
        return { type: 'upper_lower', mode: TRAINING_MODE.UPPER };
    }

    // Default fallback
    return { type: 'upper_lower', mode: TRAINING_MODE.UPPER };
}

/**
 * Scale exercise volume based on context
 */
export function scaleExerciseVolume(baseExercise, context) {
    const { energyLevel, streakLength, yesterdayIntensity } = context;

    let multiplier = 1.0;

    // Energy Penalties
    if (energyLevel === 1) multiplier = 0.5;
    else if (energyLevel === 2) multiplier = 0.75;

    // Recovery Penalties
    if (yesterdayIntensity === 'high') multiplier *= 0.9;

    // Streak Bonuses (Progressive Overload)
    if (streakLength > 14 && energyLevel >= 4) multiplier *= 1.1;

    return {
        ...baseExercise,
        sets: Math.max(1, Math.round(baseExercise.sets * multiplier)),
        targetReps: Math.max(5, Math.round(baseExercise.targetReps * multiplier)),
        original: { ...baseExercise }
    };
}

/**
 * Get full user context
 */
export async function getUserContext(settings) {
    // 1. Get streak data
    const streakStats = await getStreakStats();

    // 2. Get past days for recovery analysis
    // (Mocking yesterday's intensity for now)
    const yesterdayIntensity = 'medium';

    return {
        streak: streakStats.currentStreak,
        yesterdayIntensity,
        equipment: settings?.primaryEquipment || 'home',
    };
}
