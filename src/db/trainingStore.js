/**
 * Training Store
 * Manages training sessions with guided workout flow
 */

import { getDB, STORES } from './database';
import { getDateString } from './dayStore';

/**
 * Training Status Constants
 */
export const TRAINING_STATUS = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    SKIPPED: 'skipped',
    MISSED: 'missed',
    REST: 'rest', // Rest day
};

/**
 * Training Types
 */
export const TRAINING_TYPE = {
    UPPER_LOWER: 'upper_lower',
    MUSCLE_FOCUSED: 'muscle_focused',
    FAT_FOCUSED: 'fat_focused',
    CARDIO: 'cardio',
    HOME_WORKOUT: 'home_workout',
    EMERGENCY: 'emergency', // Low-energy fallback
    REST: 'rest',
};

/**
 * Training Modes (Upper/Lower specific)
 */
export const TRAINING_MODE = {
    UPPER: 'upper',
    LOWER: 'lower',
    PUSH: 'push',
    PULL: 'pull',
    LEGS: 'legs',
    FULL_BODY: 'full_body',
};

/**
 * Skip Reasons for Training
 */
export const TRAINING_SKIP_REASONS = [
    'Injury',
    'Illness',
    'Gym closed',
    'No time',
    'Too tired',
    'Travel day',
    'Recovery needed',
    'Custom reason',
];

/**
 * Exercise Types - determines which input fields to show
 */
export const EXERCISE_TYPE = {
    STRENGTH: 'strength',     // Weight, sets, reps
    CARDIO: 'cardio',         // Time, speed, distance, elevation
    ISOMETRIC: 'isometric',   // Sets, hold time (seconds)
    BODYWEIGHT: 'bodyweight', // Sets, reps (no weight)
};

/**
 * Default rest time between exercises (in seconds)
 */
export const DEFAULT_REST_BETWEEN_EXERCISES = 120; // 2 minutes


/**
 * Create exercise structure
 * @param {Object} data - Exercise data
 * @param {string} data.name - Exercise name
 * @param {string} data.exerciseType - Type: strength, cardio, isometric, bodyweight
 * @param {number} data.sets - Number of sets (for strength/bodyweight/isometric)
 * @param {number} data.targetReps - Target reps per set (for strength/bodyweight)
 * @param {number} data.weight - Weight in kg (for strength)
 * @param {number} data.duration - Duration in minutes (for cardio)
 * @param {number} data.speed - Speed in km/h (for cardio)
 * @param {number} data.distance - Distance in km (for cardio)
 * @param {number} data.elevation - Elevation/incline in % (for cardio)
 * @param {number} data.holdTime - Hold time in seconds (for isometric)
 */
export function createExercise(data) {
    const baseExercise = {
        id: data.id || `exercise_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: data.name,
        exerciseType: data.exerciseType || EXERCISE_TYPE.STRENGTH,
        restSeconds: data.restSeconds || 90,
        notes: data.notes || '',
        formTip: data.formTip || '',
        completedSets: [],
        status: 'pending', // pending, in_progress, completed, skipped
        order: data.order || 0, // For reordering exercises
    };

    // Add type-specific fields
    switch (data.exerciseType || EXERCISE_TYPE.STRENGTH) {
        case EXERCISE_TYPE.CARDIO:
            return {
                ...baseExercise,
                duration: data.duration || 30,       // minutes
                speed: data.speed || null,           // km/h
                distance: data.distance || null,     // km
                elevation: data.elevation || 0,      // % incline
                targetCalories: data.targetCalories || null,
            };
        case EXERCISE_TYPE.ISOMETRIC:
            return {
                ...baseExercise,
                sets: data.sets || 3,
                holdTime: data.holdTime || 60,       // seconds per set
            };
        case EXERCISE_TYPE.BODYWEIGHT:
            return {
                ...baseExercise,
                sets: data.sets || 4,
                targetReps: data.targetReps || 10,
            };
        case EXERCISE_TYPE.STRENGTH:
        default:
            return {
                ...baseExercise,
                sets: data.sets || 4,
                targetReps: data.targetReps || 10,
                weight: data.weight || null,         // kg
            };
    }
}


/**
 * Create training session structure
 */
export function createTrainingSession(data) {
    const dateStr = data.date || getDateString();

    return {
        date: dateStr,
        trainingType: data.trainingType || TRAINING_TYPE.UPPER_LOWER,
        mode: data.mode || TRAINING_MODE.UPPER,
        focusMuscle: data.focusMuscle || null, // e.g., 'chest', 'back', 'shoulders'
        status: data.status || TRAINING_STATUS.PENDING,
        exercises: data.exercises || [],
        warmup: {
            completed: false,
            notes: '',
        },
        cooldown: {
            completed: false,
            notes: '',
        },
        currentExerciseIndex: 0,
        currentSetIndex: 0,
        startTime: null,
        endTime: null,
        totalDuration: 0,
        skipReason: null,
        injuryFlags: [],
        notes: '',
        createdAt: new Date().toISOString(),
    };
}

/**
 * Get training session by date
 */
export async function getTrainingByDate(date) {
    const db = await getDB();
    const dateStr = typeof date === 'string' ? date : getDateString(date);
    return db.get(STORES.TRAINING_SESSIONS, dateStr);
}

/**
 * Save training session
 */
export async function saveTraining(session) {
    const db = await getDB();
    return db.put(STORES.TRAINING_SESSIONS, session);
}

/**
 * Create or get today's training session
 */
export async function getOrCreateTodayTraining(trainingType, mode, exercises = [], focusMuscle = null, date = null) {
    const today = date || getDateString();
    let session = await getTrainingByDate(today);

    if (!session) {
        session = createTrainingSession({
            date: today,
            trainingType,
            mode,
            exercises,
            focusMuscle,
        });
        await saveTraining(session);
    } else if (session.status === TRAINING_STATUS.PENDING && exercises.length > 0) {
        // If session exists but is still pending and we have new exercises,
        // update it with the new workout data (e.g. user selected different muscle group)
        session.trainingType = trainingType;
        session.mode = mode;
        session.exercises = exercises;
        session.focusMuscle = focusMuscle;
        session.currentExerciseIndex = 0;
        session.currentSetIndex = 0;
        await saveTraining(session);
    }

    return session;
}

/**
 * Get last completed training session
 */
export async function getLastCompletedTraining() {
    const db = await getDB();
    const allSessions = await db.getAll(STORES.TRAINING_SESSIONS);

    // Filter for completed sessions and sort by date descending
    const completedSessions = allSessions
        .filter(s => s.status === TRAINING_STATUS.COMPLETED)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    return completedSessions.length > 0 ? completedSessions[0] : null;
}

/**
 * Start training session
 */
/**
 * Start training session
 */
export async function startTraining(date) {
    const session = await getTrainingByDate(date);
    if (!session) {
        throw new Error('Training session not found');
    }

    // If already in progress, handle gracefully (idempotent)
    if (session.status === TRAINING_STATUS.IN_PROGRESS) {
        return session;
    }

    if (session.status !== TRAINING_STATUS.PENDING) {
        throw new Error('Training already started or completed');
    }

    session.status = TRAINING_STATUS.IN_PROGRESS;
    session.startTime = new Date().toISOString();

    return saveTraining(session);
}

/**
 * Complete a set in an exercise
 */
export async function completeSet(date, exerciseIndex, setData) {
    const session = await getTrainingByDate(date);
    if (!session) {
        throw new Error('Training session not found');
    }

    const exercise = session.exercises[exerciseIndex];
    if (!exercise) {
        throw new Error('Exercise not found');
    }

    exercise.completedSets.push({
        setNumber: exercise.completedSets.length + 1,
        weight: setData.weight || null,
        reps: setData.reps || 0,
        distance: setData.distance || null,
        speed: setData.speed || null,
        duration: setData.duration || null,
        status: 'completed',
        notes: setData.notes || null,
        completedAt: new Date().toISOString(),
    });

    // Update current position
    session.currentSetIndex = exercise.completedSets.length;

    // Check if exercise is completed
    if (exercise.completedSets.length >= exercise.sets) {
        exercise.status = 'completed';
        session.currentExerciseIndex = exerciseIndex + 1;
        session.currentSetIndex = 0;
    }

    return saveTraining(session);
}

/**
 * Skip a set in an exercise
 */
export async function skipSet(date, exerciseIndex, reason) {
    const session = await getTrainingByDate(date);
    if (!session) {
        throw new Error('Training session not found');
    }

    const exercise = session.exercises[exerciseIndex];
    if (!exercise) {
        throw new Error('Exercise not found');
    }

    if (!reason || reason.trim() === '') {
        throw new Error('Skip reason is required');
    }

    exercise.completedSets.push({
        setNumber: exercise.completedSets.length + 1,
        weight: null,
        reps: 0,
        status: 'skipped',
        skipReason: reason.trim(),
        completedAt: new Date().toISOString(),
    });

    // Update current position
    session.currentSetIndex = exercise.completedSets.length;

    // Check if exercise is completed (all sets accounted for)
    if (exercise.completedSets.length >= exercise.sets) {
        // Check if any were actually completed
        const actuallyCompleted = exercise.completedSets.some(s => s.status === 'completed');
        exercise.status = actuallyCompleted ? 'partial' : 'skipped';
        if (!actuallyCompleted) {
            exercise.skipReason = 'All sets skipped';
        }
        session.currentExerciseIndex = exerciseIndex + 1;
        session.currentSetIndex = 0;
    }

    return saveTraining(session);
}

/**
 * Record injury or soreness flag during workout
 */
export async function recordWorkoutFlag(date, flag) {
    const session = await getTrainingByDate(date);
    if (!session) {
        throw new Error('Training session not found');
    }

    if (!session.injuryFlags) {
        session.injuryFlags = [];
    }

    session.injuryFlags.push({
        ...flag,
        recordedAt: new Date().toISOString(),
    });

    return saveTraining(session);
}

/**
 * Skip an exercise
 */
export async function skipExercise(date, exerciseIndex, reason) {
    const session = await getTrainingByDate(date);
    if (!session) {
        throw new Error('Training session not found');
    }

    const exercise = session.exercises[exerciseIndex];
    if (!exercise) {
        throw new Error('Exercise not found');
    }

    exercise.status = 'skipped';
    exercise.skipReason = reason;
    session.currentExerciseIndex = exerciseIndex + 1;
    session.currentSetIndex = 0;

    return saveTraining(session);
}

/**
 * Complete training session
 */
export async function completeTraining(date) {
    const session = await getTrainingByDate(date);
    if (!session) {
        throw new Error('Training session not found');
    }

    session.status = TRAINING_STATUS.COMPLETED;
    session.endTime = new Date().toISOString();

    if (session.startTime) {
        const start = new Date(session.startTime);
        const end = new Date(session.endTime);
        session.totalDuration = Math.round((end - start) / 1000 / 60); // minutes
    }

    return saveTraining(session);
}

/**
 * Skip entire training session
 */
export async function skipTraining(date, reason) {
    if (!reason || reason.trim() === '') {
        throw new Error('Skip reason is required');
    }

    let session = await getTrainingByDate(date);

    if (!session) {
        session = createTrainingSession({ date });
    }

    session.status = TRAINING_STATUS.SKIPPED;
    session.skipReason = reason.trim();
    session.endTime = new Date().toISOString();

    return saveTraining(session);
}

/**
 * Mark as rest day
 */
export async function markRestDay(date) {
    let session = await getTrainingByDate(date);

    if (!session) {
        session = createTrainingSession({ date });
    }

    session.status = TRAINING_STATUS.REST;
    session.trainingType = TRAINING_TYPE.REST;

    return saveTraining(session);
}

/**
 * Mark training as missed (for inactive days)
 */
export async function markTrainingMissed(date) {
    let session = await getTrainingByDate(date);

    if (!session) {
        session = createTrainingSession({ date });
    }

    session.status = TRAINING_STATUS.MISSED;
    session.skipReason = 'Day not opened';

    return saveTraining(session);
}

/**
 * Add injury flag
 */
export async function addInjuryFlag(date, injuryData) {
    const session = await getTrainingByDate(date);
    if (!session) {
        throw new Error('Training session not found');
    }

    session.injuryFlags.push({
        ...injuryData,
        addedAt: new Date().toISOString(),
    });

    return saveTraining(session);
}

/**
 * Get training statistics for date range
 */
export async function getTrainingStats(startDate, endDate) {
    const db = await getDB();
    const allSessions = await db.getAll(STORES.TRAINING_SESSIONS);

    const startStr = typeof startDate === 'string' ? startDate : getDateString(startDate);
    const endStr = typeof endDate === 'string' ? endDate : getDateString(endDate);

    const sessionsInRange = allSessions.filter(s => s.date >= startStr && s.date <= endStr);

    const sessionsWithDuration = sessionsInRange.filter(s => s.totalDuration);
    return {
        total: sessionsInRange.length,
        completed: sessionsInRange.filter(s => s.status === TRAINING_STATUS.COMPLETED).length,
        skipped: sessionsInRange.filter(s => s.status === TRAINING_STATUS.SKIPPED).length,
        missed: sessionsInRange.filter(s => s.status === TRAINING_STATUS.MISSED).length,
        rest: sessionsInRange.filter(s => s.status === TRAINING_STATUS.REST).length,
        byType: Object.values(TRAINING_TYPE).reduce((acc, type) => {
            acc[type] = sessionsInRange.filter(s => s.trainingType === type).length;
            return acc;
        }, {}),
        totalDuration: sessionsInRange.reduce((sum, s) => sum + (s.totalDuration || 0), 0),
        avgDuration: sessionsWithDuration.length > 0
            ? Math.round(sessionsInRange.reduce((sum, s) => sum + (s.totalDuration || 0), 0) / sessionsWithDuration.length)
            : 0,
    };
}

/**
 * Get performance from last similar workout (same type/mode)
 * Returns per-exercise comparison data
 */
export async function getLastWeekPerformance(trainingType, mode) {
    const db = await getDB();
    const allSessions = await db.getAll(STORES.TRAINING_SESSIONS);

    // Find last completed session with same type and mode
    const today = getDateString();
    const similarSessions = allSessions
        .filter(s =>
            s.status === TRAINING_STATUS.COMPLETED &&
            s.trainingType === trainingType &&
            s.mode === mode &&
            s.date < today
        )
        .sort((a, b) => b.date.localeCompare(a.date));

    if (similarSessions.length === 0) {
        return null;
    }

    const lastSession = similarSessions[0];

    // Build per-exercise performance comparison
    const exercisePerformance = {};
    for (const exercise of lastSession.exercises || []) {
        if (exercise.completedSets && exercise.completedSets.length > 0) {
            const completedSets = exercise.completedSets.filter(s => s.status === 'completed' || !s.status);
            if (completedSets.length > 0) {
                // Calculate best set (highest weight × reps)
                const bestSet = completedSets.reduce((best, set) => {
                    const volume = (set.weight || 0) * (set.reps || 0);
                    const bestVolume = (best.weight || 0) * (best.reps || 0);
                    return volume > bestVolume ? set : best;
                }, completedSets[0]);

                exercisePerformance[exercise.name.toLowerCase()] = {
                    bestWeight: bestSet.weight,
                    bestReps: bestSet.reps,
                    totalSets: completedSets.length,
                    avgWeight: Math.round(completedSets.reduce((sum, s) => sum + (s.weight || 0), 0) / completedSets.length),
                    avgReps: Math.round(completedSets.reduce((sum, s) => sum + (s.reps || 0), 0) / completedSets.length),
                };
            }
        }
    }

    return {
        date: lastSession.date,
        duration: lastSession.totalDuration,
        exercises: exercisePerformance,
        daysAgo: Math.floor((new Date(today) - new Date(lastSession.date)) / (1000 * 60 * 60 * 24)),
    };
}

/**
 * Predefined workout templates (legacy - kept for compatibility)
 */
export const WORKOUT_TEMPLATES = {
    UPPER_BODY: [
        { name: 'Bench Press', sets: 4, targetReps: 10, restSeconds: 90, formTip: 'Chest up, shoulder blades squeezed' },
        { name: 'Overhead Press', sets: 4, targetReps: 10, restSeconds: 90, formTip: 'Core tight, squeeze glutes' },
        { name: 'Barbell Rows', sets: 4, targetReps: 10, restSeconds: 90, formTip: 'Pull to belly button, squeeze lats' },
        { name: 'Lat Pulldowns', sets: 3, targetReps: 12, restSeconds: 60, formTip: 'Pull to chest, lean slightly back' },
        { name: 'Tricep Dips', sets: 3, targetReps: 12, restSeconds: 60, formTip: 'Elbows close to body' },
    ],
    LOWER_BODY: [
        { name: 'Squats', sets: 4, targetReps: 10, restSeconds: 120, formTip: 'Knees track over toes, chest up' },
        { name: 'Romanian Deadlifts', sets: 4, targetReps: 10, restSeconds: 90, formTip: 'Hinge at hips, slight knee bend' },
        { name: 'Leg Press', sets: 4, targetReps: 12, restSeconds: 90, formTip: 'Full range of motion, controlled' },
        { name: 'Leg Curls', sets: 3, targetReps: 12, restSeconds: 60, formTip: 'Squeeze at top, slow negative' },
        { name: 'Calf Raises', sets: 4, targetReps: 15, restSeconds: 45, formTip: 'Full stretch and contraction' },
    ],
    HOME_BEGINNER: [
        { name: 'Wall Push-ups', sets: 3, targetReps: 10, restSeconds: 60, formTip: 'Hands shoulder-width, core tight' },
        { name: 'Chair Squats', sets: 3, targetReps: 12, restSeconds: 60, formTip: 'Touch chair, don\'t sit' },
        { name: 'Plank', sets: 3, targetReps: 30, restSeconds: 45, formTip: 'Straight line from head to heels (30 sec)' },
        { name: 'Glute Bridges', sets: 3, targetReps: 15, restSeconds: 45, formTip: 'Squeeze glutes at top' },
        { name: 'Bird Dogs', sets: 3, targetReps: 10, restSeconds: 45, formTip: '10 each side, slow and controlled' },
    ],
    EMERGENCY_10MIN: [
        { name: 'March in Place', sets: 1, targetReps: 2, restSeconds: 0, formTip: '2 minutes - keep moving' },
        { name: 'Wall Push-ups', sets: 2, targetReps: 10, restSeconds: 30, formTip: 'Controlled movement' },
        { name: 'Chair Squats', sets: 2, targetReps: 12, restSeconds: 30, formTip: 'Full range of motion' },
        { name: 'Wall Plank', sets: 2, targetReps: 20, restSeconds: 30, formTip: '20 seconds hold' },
    ],
};

/**
 * Body regions for training selection
 */
export const BODY_REGIONS = {
    UPPER: 'upper',
    LOWER: 'lower',
    CORE: 'core',
};

/**
 * Muscle groups by body region with detailed info
 */
export const MUSCLE_GROUPS = {
    upper: [
        { id: 'chest', name: 'Chest', icon: '🫁', description: 'Pushing strength' },
        { id: 'back', name: 'Back', icon: '🔙', description: 'Pulling & posture' },
        { id: 'shoulders', name: 'Shoulders', icon: '🏔️', description: 'Stability & aesthetics' },
        { id: 'arms', name: 'Arms', icon: '💪', description: 'Biceps & triceps' },
        { id: 'forearms', name: 'Forearms', icon: '✊', description: 'Grip strength' },
    ],
    lower: [
        { id: 'quads', name: 'Quadriceps', icon: '🦵', description: 'Front thigh power' },
        { id: 'hamstrings', name: 'Hamstrings', icon: '🦿', description: 'Back thigh & hip' },
        { id: 'glutes', name: 'Glutes', icon: '🍑', description: 'Hip power & stability' },
        { id: 'calves', name: 'Calves', icon: '🦶', description: 'Ankle & explosiveness' },
    ],
    core: [
        { id: 'abs', name: 'Abs', icon: '🔥', description: 'Six-pack muscles' },
        { id: 'obliques', name: 'Obliques', icon: '🌀', description: 'Side core strength' },
        { id: 'lower_back', name: 'Lower Back', icon: '🔻', description: 'Spine stability' },
    ],
};

/**
 * Detailed muscle training information
 */
export const MUSCLE_DETAILS = {
    // ===== UPPER BODY =====
    chest: {
        muscles: ['Pectoralis Major', 'Pectoralis Minor'],
        areas: ['Upper chest', 'Mid chest', 'Lower chest'],
        workout: { sets: '4-5', reps: '6-12', tempo: '2 sec down, 1 sec up', rest: '60-90 sec' },
        howTo: [
            'Hands slightly wider than shoulders',
            'Body in straight line (no hip sag)',
            'Chest touches floor/bar first',
            'Drive through palms'
        ],
        mistakes: [
            'Half reps - go full range',
            'Flaring elbows too wide (45° angle)',
            'Sagging lower back',
            'Bouncing off chest'
        ],
        recovery: {
            stretches: ['Doorway chest stretch – 30 sec × 3', 'Light arm swings'],
            restDays: '48-72 hours before next heavy push work',
            tips: 'Ice if sore, contrast shower helps'
        }
    },
    back: {
        muscles: ['Latissimus Dorsi', 'Rhomboids', 'Trapezius', 'Erector Spinae'],
        areas: ['Lats (width)', 'Upper back (thickness)', 'Lower back'],
        workout: { sets: '4', reps: '6-12', tempo: '1 sec up, 2 sec down', rest: '90-120 sec' },
        howTo: [
            'Initiate pull with elbows, not hands',
            'Squeeze shoulder blades together',
            'Keep chest up throughout',
            'Full stretch at bottom'
        ],
        mistakes: [
            'Using momentum/swinging',
            'Rounding lower back on rows',
            'Not fully extending arms',
            'Shrugging shoulders up'
        ],
        recovery: {
            stretches: ['Hanging stretch – 30 sec', 'Cat-cow mobility', 'Child\'s pose'],
            restDays: '48-72 hours',
            tips: 'Light walking helps recovery, foam roll lats'
        }
    },
    shoulders: {
        muscles: ['Anterior Deltoid', 'Lateral Deltoid', 'Posterior Deltoid'],
        areas: ['Front (anterior)', 'Side (lateral)', 'Rear (posterior)'],
        workout: { sets: '3-4', reps: '8-15', tempo: 'Controlled', rest: '60-90 sec' },
        howTo: [
            'Press: core tight, squeeze glutes',
            'Raises: slight bend in elbow, lead with pinky',
            'Keep shoulders down (no shrugging)',
            'Slow, controlled motion'
        ],
        mistakes: [
            'Turning pike push-up into regular push-up',
            'Shrugging shoulders during raises',
            'Using momentum on lateral raises',
            'Going too heavy, losing form'
        ],
        recovery: {
            stretches: ['Shoulder CARs (controlled rotations)', 'Cross-body stretch', 'Wall slides'],
            restDays: '48 hours',
            tips: 'Ice/contrast shower if needed, avoid daily overhead loading'
        }
    },
    arms: {
        muscles: ['Biceps (long & short head)', 'Triceps (long, lateral, medial head)', 'Brachialis'],
        areas: ['Biceps (front)', 'Triceps (back - 2/3 of arm size)'],
        workout: { sets: '3-4', reps: '8-15', tempo: '2 sec each way', rest: '45-60 sec' },
        howTo: [
            'Biceps: keep elbows pinned to sides',
            'Triceps: elbows tucked, full lockout',
            'Squeeze at peak contraction',
            'Control the negative (lowering)'
        ],
        mistakes: [
            'Swinging body on curls',
            'Partial lockout on triceps',
            'Shoulder dipping in chair dips',
            'Going too fast'
        ],
        recovery: {
            stretches: ['Overhead triceps stretch', 'Doorframe bicep stretch'],
            restDays: '48 hours',
            tips: 'Forearm massage helps, stretch after training'
        }
    },
    forearms: {
        muscles: ['Wrist Flexors', 'Wrist Extensors', 'Brachioradialis'],
        areas: ['Inner forearm (flexors)', 'Outer forearm (extensors)'],
        workout: { sets: '3', reps: '15-25 or 30-60 sec holds', tempo: 'Slow', rest: '30-45 sec' },
        howTo: [
            'Wrist curls: forearms on bench/thighs',
            'Grip work: squeeze hard, hold',
            'Full range of motion',
            'Can train more frequently'
        ],
        mistakes: [
            'Rushing through reps',
            'Not going through full range',
            'Ignoring extensors (imbalance)'
        ],
        recovery: {
            stretches: ['Wrist circles', 'Prayer stretch', 'Reverse prayer'],
            restDays: '24-48 hours - can train frequently',
            tips: 'Wrist mobility work helps, massage forearms'
        }
    },

    // ===== LOWER BODY =====
    quads: {
        muscles: ['Vastus Lateralis', 'Vastus Medialis', 'Rectus Femoris', 'Vastus Intermedius'],
        areas: ['Outer quad', 'Inner quad (VMO)', 'Front quad'],
        workout: { sets: '4-5', reps: '8-20', tempo: '2-3 sec down, explode up', rest: '90-180 sec' },
        howTo: [
            'Knees track over toes',
            'Chest up, back neutral',
            'Full depth (thighs parallel or below)',
            'Drive through whole foot'
        ],
        mistakes: [
            'Knees caving inward',
            'Coming onto toes',
            'Rounding lower back',
            'Half squats'
        ],
        recovery: {
            stretches: ['Quad stretch (standing or lying)', 'Couch stretch', 'Lunge stretch'],
            restDays: '72 hours after heavy day',
            tips: 'Walking helps, foam roll quads'
        }
    },
    hamstrings: {
        muscles: ['Biceps Femoris', 'Semitendinosus', 'Semimembranosus'],
        areas: ['Outer hamstring', 'Inner hamstring'],
        workout: { sets: '3-4', reps: '8-15', tempo: 'Controlled hinge', rest: '90 sec' },
        howTo: [
            'Hinge at hips, not waist',
            'Slight knee bend (RDL)',
            'Feel stretch in hamstrings',
            'Drive through heels on bridges'
        ],
        mistakes: [
            'Rounding lower back',
            'Locking knees completely',
            'Not hinging at hips',
            'Rising onto toes'
        ],
        recovery: {
            stretches: ['Seated forward fold', 'Standing hamstring stretch', 'Lying leg pulls'],
            restDays: '48-72 hours',
            tips: 'Foam roll if available, avoid sitting too long'
        }
    },
    glutes: {
        muscles: ['Gluteus Maximus', 'Gluteus Medius', 'Gluteus Minimus'],
        areas: ['Main glute (power)', 'Side glute (stability)', 'Deep glute'],
        workout: { sets: '4', reps: '8-15', tempo: 'Squeeze at top', rest: '60-90 sec' },
        howTo: [
            'Squeeze glutes hard at top',
            'Full hip extension',
            'Don\'t hyperextend lower back',
            'Mind-muscle connection'
        ],
        mistakes: [
            'Using lower back instead of glutes',
            'Not squeezing at top',
            'Partial range of motion',
            'Rushing reps'
        ],
        recovery: {
            stretches: ['Pigeon pose', 'Figure-4 stretch', 'Hip flexor stretch'],
            restDays: '48-72 hours',
            tips: 'Hip flexor tightness limits glutes, stretch them'
        }
    },
    calves: {
        muscles: ['Gastrocnemius (upper)', 'Soleus (lower)'],
        areas: ['Upper calf (gastroc)', 'Lower calf (soleus)'],
        workout: { sets: '4-6', reps: '15-30', tempo: 'Pause at top', rest: '30-45 sec' },
        howTo: [
            'Full stretch at bottom',
            'Rise all the way onto toes',
            'Pause and squeeze at top',
            'Straight legs for gastroc, bent for soleus'
        ],
        mistakes: [
            'Bouncing without control',
            'Partial range of motion',
            'Going too fast',
            'Only training one position'
        ],
        recovery: {
            stretches: ['Wall calf stretch', 'Stair stretch', 'Ankle circles'],
            restDays: 'Can train daily - high frequency tolerant',
            tips: 'Ankle mobility work helps, massage calves'
        }
    },

    // ===== CORE =====
    abs: {
        muscles: ['Rectus Abdominis (six-pack)', 'Transverse Abdominis (deep)'],
        areas: ['Upper abs', 'Lower abs', 'Deep core'],
        workout: { sets: '3-4', reps: '15-25', tempo: 'Controlled', rest: '30-45 sec' },
        howTo: [
            'Curl spine, don\'t just lift head',
            'Exhale on contraction',
            'Keep lower back pressed down',
            'Focus on squeezing abs'
        ],
        mistakes: [
            'Pulling on neck',
            'Using hip flexors instead of abs',
            'Holding breath',
            'Arching lower back'
        ],
        recovery: {
            stretches: ['Cobra stretch', 'Cat-cow', 'Lying spinal twist'],
            restDays: 'Can train 4-6× per week',
            tips: 'Abs recover fast, but don\'t overtrain one movement'
        }
    },
    obliques: {
        muscles: ['External Obliques', 'Internal Obliques'],
        areas: ['Side waist (love handles area)'],
        workout: { sets: '3', reps: '15-25 each side', tempo: 'Controlled rotation', rest: '30-45 sec' },
        howTo: [
            'Rotate from core, not arms',
            'Feel the side squeeze',
            'Keep hips stable (side planks)',
            'Touch floor each side (twists)'
        ],
        mistakes: [
            'Using momentum',
            'Hip rotation instead of core',
            'Letting hips sag in side plank',
            'Rushing through reps'
        ],
        recovery: {
            stretches: ['Standing side bend', 'Lying spinal twist', 'Thread the needle'],
            restDays: 'Can train 4-6× per week',
            tips: 'Pair with hip mobility work'
        }
    },
    lower_back: {
        muscles: ['Erector Spinae', 'Multifidus', 'Quadratus Lumborum'],
        areas: ['Spinal erectors', 'Deep stabilizers'],
        workout: { sets: '3', reps: '12-15 or 30-45 sec holds', tempo: 'Slow and controlled', rest: '45-60 sec' },
        howTo: [
            'Don\'t hyperextend spine',
            'Squeeze at top of extensions',
            'Keep movement controlled',
            'Engage glutes as well'
        ],
        mistakes: [
            'Hyperextending (going too high)',
            'Jerky movements',
            'Ignoring pain signals',
            'Going too heavy too soon'
        ],
        recovery: {
            stretches: ['Child\'s pose', 'Cat-cow', 'Knee-to-chest stretch'],
            restDays: '48 hours - be conservative',
            tips: 'Never train through lower back pain, strengthen gradually'
        }
    }
};


/**
 * Complete exercise database by environment and muscle group
 */
export const EXERCISE_DATABASE = {
    gym: {
        // Upper Body - Gym
        chest: [
            { name: 'Bench Press', sets: 4, targetReps: 10, restSeconds: 90, formTip: 'Chest up, shoulder blades squeezed', equipment: 'Barbell + Bench' },
            { name: 'Incline Dumbbell Press', sets: 3, targetReps: 12, restSeconds: 75, formTip: 'Control the descent, squeeze at top', equipment: 'Dumbbells + Incline Bench' },
            { name: 'Cable Fly', sets: 3, targetReps: 12, restSeconds: 60, formTip: 'Slight bend in elbows, squeeze chest', equipment: 'Cable Machine' },
            { name: 'Dips (Chest Focus)', sets: 3, targetReps: 10, restSeconds: 90, formTip: 'Lean forward, elbows flared', equipment: 'Dip Station' },
        ],
        back: [
            { name: 'Barbell Rows', sets: 4, targetReps: 10, restSeconds: 90, formTip: 'Pull to belly button, squeeze lats', equipment: 'Barbell' },
            { name: 'Lat Pulldowns', sets: 4, targetReps: 12, restSeconds: 75, formTip: 'Pull to chest, lean slightly back', equipment: 'Cable Machine' },
            { name: 'Seated Cable Rows', sets: 3, targetReps: 12, restSeconds: 60, formTip: 'Squeeze shoulder blades together', equipment: 'Cable Machine' },
            { name: 'T-Bar Rows', sets: 3, targetReps: 10, restSeconds: 90, formTip: 'Keep back flat, drive elbows back', equipment: 'T-Bar Machine' },
        ],
        shoulders: [
            { name: 'Overhead Press', sets: 4, targetReps: 10, restSeconds: 90, formTip: 'Core tight, squeeze glutes', equipment: 'Barbell' },
            { name: 'Lateral Raises', sets: 3, targetReps: 15, restSeconds: 60, formTip: 'Slight bend in elbow, lead with pinky', equipment: 'Dumbbells' },
            { name: 'Face Pulls', sets: 3, targetReps: 15, restSeconds: 60, formTip: 'Pull to forehead, external rotation', equipment: 'Cable + Rope' },
            { name: 'Reverse Pec Deck', sets: 3, targetReps: 12, restSeconds: 60, formTip: 'Squeeze rear delts at contraction', equipment: 'Pec Deck Machine' },
        ],
        arms: [
            { name: 'Barbell Curls', sets: 3, targetReps: 12, restSeconds: 60, formTip: 'Keep elbows pinned, full range', equipment: 'Barbell' },
            { name: 'Hammer Curls', sets: 3, targetReps: 12, restSeconds: 60, formTip: 'Neutral grip, controlled movement', equipment: 'Dumbbells' },
            { name: 'Skull Crushers', sets: 3, targetReps: 12, restSeconds: 60, formTip: 'Keep elbows stationary', equipment: 'EZ Bar + Bench' },
            { name: 'Tricep Pushdowns', sets: 3, targetReps: 15, restSeconds: 45, formTip: 'Elbows at sides, squeeze triceps', equipment: 'Cable Machine' },
        ],
        forearms: [
            { name: 'Wrist Curls', sets: 3, targetReps: 15, restSeconds: 45, formTip: 'Rest forearms on bench', equipment: 'Barbell/Dumbbells' },
            { name: 'Reverse Wrist Curls', sets: 3, targetReps: 15, restSeconds: 45, formTip: 'Control the movement', equipment: 'Barbell/Dumbbells' },
            { name: 'Farmer\'s Walk', sets: 3, targetReps: 40, restSeconds: 60, formTip: '40 meters - grip tight, core engaged', equipment: 'Heavy Dumbbells' },
        ],
        // Lower Body - Gym
        quads: [
            { name: 'Barbell Squats', sets: 4, targetReps: 10, restSeconds: 120, formTip: 'Knees track over toes, chest up', equipment: 'Barbell + Squat Rack' },
            { name: 'Leg Press', sets: 4, targetReps: 12, restSeconds: 90, formTip: 'Full range of motion, controlled', equipment: 'Leg Press Machine' },
            { name: 'Leg Extensions', sets: 3, targetReps: 15, restSeconds: 60, formTip: 'Pause at the top, slow negative', equipment: 'Leg Extension Machine' },
            { name: 'Walking Lunges', sets: 3, targetReps: 12, restSeconds: 60, formTip: '12 each leg, push through front heel', equipment: 'Dumbbells (optional)' },
        ],
        hamstrings: [
            { name: 'Romanian Deadlifts', sets: 4, targetReps: 10, restSeconds: 90, formTip: 'Hinge at hips, slight knee bend', equipment: 'Barbell' },
            { name: 'Leg Curls', sets: 4, targetReps: 12, restSeconds: 60, formTip: 'Squeeze at top, slow negative', equipment: 'Leg Curl Machine' },
            { name: 'Good Mornings', sets: 3, targetReps: 12, restSeconds: 75, formTip: 'Keep back flat, hinge at hips', equipment: 'Barbell' },
        ],
        glutes: [
            { name: 'Hip Thrusts', sets: 4, targetReps: 12, restSeconds: 90, formTip: 'Drive through heels, squeeze at top', equipment: 'Barbell + Bench' },
            { name: 'Cable Pull-Throughs', sets: 3, targetReps: 15, restSeconds: 60, formTip: 'Hinge at hips, squeeze glutes', equipment: 'Cable Machine' },
            { name: 'Bulgarian Split Squats', sets: 3, targetReps: 10, restSeconds: 75, formTip: '10 each leg, lean slightly forward', equipment: 'Dumbbells + Bench' },
        ],
        calves: [
            { name: 'Standing Calf Raises', sets: 4, targetReps: 15, restSeconds: 45, formTip: 'Full stretch and contraction', equipment: 'Calf Raise Machine' },
            { name: 'Seated Calf Raises', sets: 4, targetReps: 15, restSeconds: 45, formTip: 'Pause at the top', equipment: 'Seated Calf Machine' },
        ],
        // Core - Gym
        abs: [
            { name: 'Cable Crunches', sets: 3, targetReps: 15, restSeconds: 45, formTip: 'Curl spine, squeeze abs', equipment: 'Cable Machine' },
            { name: 'Hanging Leg Raises', sets: 3, targetReps: 12, restSeconds: 60, formTip: 'Control the swing, curl pelvis', equipment: 'Pull-up Bar' },
            { name: 'Ab Wheel Rollouts', sets: 3, targetReps: 10, restSeconds: 60, formTip: 'Keep core tight throughout', equipment: 'Ab Wheel' },
        ],
        obliques: [
            { name: 'Cable Woodchops', sets: 3, targetReps: 12, restSeconds: 45, formTip: 'Rotate from core, not arms', equipment: 'Cable Machine' },
            { name: 'Side Plank Hold', sets: 3, targetReps: 30, restSeconds: 45, formTip: '30 sec each side, hips high', equipment: 'None' },
        ],
        lower_back: [
            { name: 'Back Extensions', sets: 3, targetReps: 15, restSeconds: 45, formTip: 'Don\'t hyperextend, squeeze at top', equipment: 'Hyperextension Bench' },
            { name: 'Reverse Hypers', sets: 3, targetReps: 12, restSeconds: 60, formTip: 'Controlled movement', equipment: 'Reverse Hyper Machine' },
        ],
    },
    home: {
        // Upper Body - Home
        chest: [
            { name: 'Push-ups', sets: 3, targetReps: 15, restSeconds: 60, formTip: 'Hands shoulder-width, core tight', equipment: 'None' },
            { name: 'Diamond Push-ups', sets: 3, targetReps: 10, restSeconds: 60, formTip: 'Hands together, elbows back', equipment: 'None' },
            { name: 'Incline Push-ups', sets: 3, targetReps: 12, restSeconds: 45, formTip: 'Hands on elevated surface', equipment: 'Chair/Step' },
            { name: 'Wide Push-ups', sets: 3, targetReps: 12, restSeconds: 45, formTip: 'Hands wider than shoulder-width', equipment: 'None' },
        ],
        back: [
            { name: 'Doorway Rows', sets: 3, targetReps: 12, restSeconds: 60, formTip: 'Lean back, pull chest to door', equipment: 'Sturdy Door Frame' },
            { name: 'Superman Holds', sets: 3, targetReps: 10, restSeconds: 45, formTip: 'Hold 3 seconds at top', equipment: 'None' },
            { name: 'Prone Y Raises', sets: 3, targetReps: 12, restSeconds: 45, formTip: 'Arms in Y position, squeeze back', equipment: 'None' },
            { name: 'Towel Rows', sets: 3, targetReps: 12, restSeconds: 60, formTip: 'Wrap towel around sturdy pole', equipment: 'Towel + Door' },
        ],
        shoulders: [
            { name: 'Pike Push-ups', sets: 3, targetReps: 10, restSeconds: 75, formTip: 'Hips high, head between arms', equipment: 'None' },
            { name: 'Wall Handstand Hold', sets: 3, targetReps: 30, restSeconds: 60, formTip: '30 sec hold, build up slowly', equipment: 'Wall' },
            { name: 'Arm Circles', sets: 3, targetReps: 20, restSeconds: 30, formTip: '20 forward, 20 backward', equipment: 'None' },
        ],
        arms: [
            { name: 'Tricep Dips (Chair)', sets: 3, targetReps: 12, restSeconds: 60, formTip: 'Hands on chair edge, lower slowly', equipment: 'Sturdy Chair' },
            { name: 'Close-Grip Push-ups', sets: 3, targetReps: 12, restSeconds: 60, formTip: 'Elbows close to body', equipment: 'None' },
            { name: 'Towel Curls', sets: 3, targetReps: 10, restSeconds: 45, formTip: 'Resist with opposite hand', equipment: 'Towel' },
        ],
        forearms: [
            { name: 'Finger Tip Push-ups', sets: 2, targetReps: 8, restSeconds: 60, formTip: 'Start on knees if needed', equipment: 'None' },
            { name: 'Wrist Circles', sets: 3, targetReps: 20, restSeconds: 30, formTip: 'Both directions', equipment: 'None' },
        ],
        // Lower Body - Home
        quads: [
            { name: 'Bodyweight Squats', sets: 4, targetReps: 15, restSeconds: 60, formTip: 'Chest up, knees track over toes', equipment: 'None' },
            { name: 'Jump Squats', sets: 3, targetReps: 10, restSeconds: 75, formTip: 'Land softly, immediately lower', equipment: 'None' },
            { name: 'Wall Sit', sets: 3, targetReps: 45, restSeconds: 60, formTip: '45 sec hold, thighs parallel', equipment: 'Wall' },
            { name: 'Step-ups', sets: 3, targetReps: 12, restSeconds: 60, formTip: '12 each leg, drive through heel', equipment: 'Stairs/Chair' },
        ],
        hamstrings: [
            { name: 'Single-Leg Deadlifts', sets: 3, targetReps: 10, restSeconds: 60, formTip: '10 each leg, balance focused', equipment: 'None' },
            { name: 'Nordic Curls (Assisted)', sets: 3, targetReps: 6, restSeconds: 90, formTip: 'Lower slowly, push back up', equipment: 'Couch to anchor feet' },
            { name: 'Good Morning Stretch', sets: 3, targetReps: 12, restSeconds: 45, formTip: 'Hands behind head, hinge', equipment: 'None' },
        ],
        glutes: [
            { name: 'Glute Bridges', sets: 4, targetReps: 15, restSeconds: 45, formTip: 'Squeeze glutes at top', equipment: 'None' },
            { name: 'Single-Leg Glute Bridge', sets: 3, targetReps: 10, restSeconds: 60, formTip: '10 each leg, keep hips level', equipment: 'None' },
            { name: 'Donkey Kicks', sets: 3, targetReps: 15, restSeconds: 45, formTip: '15 each leg, kick back and up', equipment: 'None' },
            { name: 'Fire Hydrants', sets: 3, targetReps: 15, restSeconds: 45, formTip: '15 each leg, open hip out', equipment: 'None' },
        ],
        calves: [
            { name: 'Single-Leg Calf Raises', sets: 4, targetReps: 15, restSeconds: 45, formTip: 'Hold wall for balance', equipment: 'Wall/Step' },
            { name: 'Jumping Calf Raises', sets: 3, targetReps: 20, restSeconds: 45, formTip: 'Small hops, stay on toes', equipment: 'None' },
        ],
        // Core - Home
        abs: [
            { name: 'Crunches', sets: 3, targetReps: 20, restSeconds: 45, formTip: 'Curl shoulders off floor, don\'t pull neck', equipment: 'None' },
            { name: 'Bicycle Crunches', sets: 3, targetReps: 20, restSeconds: 45, formTip: 'Touch elbow to opposite knee', equipment: 'None' },
            { name: 'Leg Raises', sets: 3, targetReps: 15, restSeconds: 45, formTip: 'Keep lower back pressed down', equipment: 'None' },
            { name: 'Dead Bug', sets: 3, targetReps: 10, restSeconds: 45, formTip: 'Opposite arm and leg, slow', equipment: 'None' },
        ],
        obliques: [
            { name: 'Russian Twists', sets: 3, targetReps: 20, restSeconds: 45, formTip: 'Touch floor each side', equipment: 'None' },
            { name: 'Side Plank', sets: 3, targetReps: 30, restSeconds: 45, formTip: '30 sec each side', equipment: 'None' },
            { name: 'Mountain Climbers', sets: 3, targetReps: 20, restSeconds: 45, formTip: 'Fast pace, core engaged', equipment: 'None' },
        ],
        lower_back: [
            { name: 'Bird Dogs', sets: 3, targetReps: 10, restSeconds: 45, formTip: '10 each side, slow and controlled', equipment: 'None' },
            { name: 'Superman', sets: 3, targetReps: 12, restSeconds: 45, formTip: 'Lift arms and legs together', equipment: 'None' },
            { name: 'Cat-Cow Stretch', sets: 3, targetReps: 10, restSeconds: 30, formTip: 'Flow between positions', equipment: 'None' },
        ],
    },
};

/**
 * Get exercises for a specific environment, region, and muscle group
 */
export function getExercisesForMuscle(environment, muscleGroup) {
    return EXERCISE_DATABASE[environment]?.[muscleGroup] || [];
}

/**
 * Get muscle groups for a body region
 */
export function getMuscleGroupsForRegion(region) {
    return MUSCLE_GROUPS[region] || [];
}

