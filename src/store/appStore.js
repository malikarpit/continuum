/**
 * Continuum App Store
 * Global state management using Zustand
 */

import { create } from 'zustand';
import { getOrCreateToday, getDay, saveDay, closeDay, updateDaySummary, checkAndMarkInactiveDays, getDateString, DAY_STATUS, updateDayEnergy } from '../db/dayStore';
import { getTasksByDate, addTask as addTaskDB, completeTask as completeTaskDB, skipTask as skipTaskDB, deleteTask as deleteTaskDB, getTaskStats, getTask } from '../db/taskStore';
import { getTrainingByDate, getOrCreateTodayTraining, startTraining, completeSet, completeTraining, skipTraining, markRestDay, saveTraining, TRAINING_STATUS } from '../db/trainingStore';
import { getMealsByDate, getOrCreateTodayMeals, logFoodToMeal, completeMeal as completeMealDB, skipMeal as skipMealDB, getDailyNutrition, initializeFoodDatabase, getAllFoodItems, searchFoodItems, getMeal, logQuickItem as logQuickItemDB, removeFoodFromMeal } from '../db/mealStore';
import { exportDatabase, importDatabase, getDB, STORES } from '../db/database';
import { recordAction, ACTION_TYPES, getActionHistory, undoAction, initActionHistory } from '../db/actionHistory';
import { initializeCurrentDay, getAdjustedDate, setDayHolidayMode, updateHolidayProgress, isDayLocked } from '../db/dayEngine';

/**
 * Navigation Views
 */
export const VIEWS = {
    TODAY: 'today',
    DASHBOARD: 'dashboard',
    TASKS: 'tasks',
    TRAINING: 'training',
    MEALS: 'meals',
    CALENDAR: 'calendar',
    ANALYTICS: 'analytics',
    TEMPLATES: 'templates',
    SETTINGS: 'settings',
};

/**
 * Main App Store
 */
export const useAppStore = create((set, get) => ({
    // =====================================
    // Navigation State
    // =====================================
    currentView: VIEWS.TODAY,
    setView: (view) => set({ currentView: view }),

    // =====================================
    // App State
    // =====================================
    isInitialized: false,
    isLoading: false,
    error: null,

    // =====================================
    // Settings State (defaults - loaded from DB on init)
    // =====================================
    settings: {
        dayBoundaryHour: 4,
        gymSchedule: [1, 2, 3, 4, 5, 6],
        notificationsEnabled: false,
        proteinTarget: 130,
        calorieTarget: 2000,
        primaryEquipment: 'gym',
        theme: 'dark',
    },

    // =====================================
    // Day State
    // =====================================
    currentDay: null,
    selectedDate: getDateString(),

    setSelectedDate: (date) => set({ selectedDate: date }),

    initializeApp: async () => {
        // Guard against concurrent/duplicate initialization (React StrictMode, hot-reload)
        if (get().isLoading || get().isInitialized) {
            return; // Already initializing or initialized
        }

        set({ isLoading: true, error: null });
        try {
            // Load settings
            const db = await getDB();
            const savedSettings = await db.get(STORES.SETTINGS, 'appSettings');
            const settings = savedSettings?.value || get().settings;

            // Initialize food database
            await initializeFoodDatabase();

            // Initialize current day with template auto-application
            const { day } = await initializeCurrentDay(settings.dayBoundaryHour);

            // Get today's data
            const adjustedDate = getAdjustedDate(settings.dayBoundaryHour);
            const tasks = await getTasksByDate(adjustedDate);
            const training = await getTrainingByDate(adjustedDate);
            const meals = await getOrCreateTodayMeals();
            const nutrition = await getDailyNutrition(adjustedDate);
            const taskStats = await getTaskStats(adjustedDate);
            const foodItems = await getAllFoodItems();

            // Initialize action history
            const actionHistoryData = initActionHistory();

            set({
                isInitialized: true,
                isLoading: false,
                currentDay: day,
                selectedDate: adjustedDate,
                settings,
                tasks,
                training,
                meals,
                nutrition,
                taskStats,
                foodItems,
                actionHistory: actionHistoryData,
            });
        } catch (error) {
            console.error('Failed to initialize app:', error);
            set({ error: error.message, isLoading: false });
        }
    },

    refreshDay: async () => {
        const { selectedDate } = get();
        try {
            const day = await getDay(selectedDate);
            const tasks = await getTasksByDate(selectedDate);
            const training = await getTrainingByDate(selectedDate);
            const meals = await getOrCreateTodayMeals();
            const nutrition = await getDailyNutrition(selectedDate);
            const taskStats = await getTaskStats(selectedDate);

            set({
                currentDay: day,
                tasks,
                training,
                meals,
                nutrition,
                taskStats,
            });
        } catch (error) {
            console.error('Failed to refresh day:', error);
            set({ error: error.message });
        }
    },

    // =====================================
    // Task State
    // =====================================
    tasks: [],
    taskStats: { total: 0, completed: 0, skipped: 0, pending: 0 },

    addTask: async (taskData) => {
        try {
            const newTask = await addTaskDB(taskData);
            recordAction(
                ACTION_TYPES.TASK_ADDED,
                `Added task: ${taskData.title}`,
                null,
                { taskId: newTask?.id || taskData.id, title: taskData.title }
            );
            await get().refreshDay();
            set({ actionHistory: getActionHistory() });
        } catch (error) {
            console.error('Failed to add task:', error);
            set({ error: error.message });
        }
    },

    completeTask: async (taskId) => {
        try {
            // Get previous state for undo
            const task = await getTask(taskId);
            const prevState = { status: task?.status };

            await completeTaskDB(taskId);

            recordAction(
                ACTION_TYPES.TASK_COMPLETED,
                `Completed: ${task?.title || 'Task'}`,
                prevState,
                { taskId, title: task?.title }
            );

            await get().refreshDay();
            set({ actionHistory: getActionHistory() });

            // Update day summary
            const { taskStats, currentDay } = get();
            if (currentDay) {
                await updateDaySummary(currentDay.date, {
                    tasksCompleted: taskStats.completed,
                    tasksTotal: taskStats.total,
                });
            }
        } catch (error) {
            console.error('Failed to complete task:', error);
            set({ error: error.message });
        }
    },

    skipTask: async (taskId, reason) => {
        try {
            const task = await getTask(taskId);
            const prevState = { status: task?.status };

            await skipTaskDB(taskId, reason);

            recordAction(
                ACTION_TYPES.TASK_SKIPPED,
                `Skipped: ${task?.title || 'Task'}`,
                prevState,
                { taskId, title: task?.title, reason }
            );

            await get().refreshDay();
            set({ actionHistory: getActionHistory() });
        } catch (error) {
            console.error('Failed to skip task:', error);
            set({ error: error.message });
        }
    },

    deleteTask: async (taskId) => {
        try {
            const task = await getTask(taskId);
            await deleteTaskDB(taskId);

            recordAction(
                ACTION_TYPES.TASK_DELETED,
                `Deleted: ${task?.title || 'Task'}`,
                null,
                { taskId, title: task?.title }
            );

            await get().refreshDay();
            set({ actionHistory: getActionHistory() });
        } catch (error) {
            console.error('Failed to delete task:', error);
            set({ error: error.message });
        }
    },

    // =====================================
    // Training State
    // =====================================
    training: null,
    currentExerciseIndex: 0,
    isTrainingActive: false,
    restTimer: 0,

    startWorkout: async (trainingType, mode, exercises, focusMuscle = null) => {
        try {
            // Use adjusted date to respect day boundary settings
            const { settings, selectedDate } = get();
            const today = selectedDate || getAdjustedDate(settings.dayBoundaryHour);

            // Get existing or create new session
            const session = await getOrCreateTodayTraining(trainingType, mode, exercises, focusMuscle);

            // If already in progress, just update exercises (in case they added more) and resume
            if (session.status === TRAINING_STATUS.IN_PROGRESS) {
                // Determine if we need to update exercises (e.g. user added more to a running session)
                if (exercises && exercises.length > 0) {
                    // Check if we need to merge or replace. For simplicity in this flow, likely replace or append.
                    // But since this is "Starting", let's assume valid state transition.
                    // Ideally we should update the DB with new exercises if this was an "empty start" before.
                    session.exercises = exercises;
                    await saveTraining(session);
                }
                set({ isTrainingActive: true, currentExerciseIndex: session.currentExerciseIndex || 0 });
                await get().refreshDay();
                return;
            }

            // Only call startTraining if pending
            if (session.status === TRAINING_STATUS.PENDING) {
                await startTraining(today);
            }

            set({ isTrainingActive: true, currentExerciseIndex: 0 });
            await get().refreshDay();
        } catch (error) {
            console.error('Failed to start workout:', error);
            set({ error: error.message });
        }
    },

    logSet: async (exerciseIndex, setData) => {
        try {
            // Use adjusted date to respect day boundary settings
            const { settings, selectedDate } = get();
            const today = selectedDate || getAdjustedDate(settings.dayBoundaryHour);
            await completeSet(today, exerciseIndex, setData);
            await get().refreshDay();
        } catch (error) {
            console.error('Failed to log set:', error);
            set({ error: error.message });
        }
    },

    finishWorkout: async () => {
        try {
            // Use adjusted date to respect day boundary settings
            const { settings, selectedDate } = get();
            const today = selectedDate || getAdjustedDate(settings.dayBoundaryHour);
            const { training } = get();
            const prevStatus = training?.status || 'in_progress';

            await completeTraining(today);
            set({ isTrainingActive: false });

            // Update day summary
            const { currentDay } = get();
            if (currentDay) {
                await updateDaySummary(currentDay.date, { trainingCompleted: true });
            }

            recordAction(
                ACTION_TYPES.WORKOUT_COMPLETED,
                'Completed workout',
                { status: prevStatus },
                { date: today }
            );

            await get().refreshDay();
            set({ actionHistory: getActionHistory() });
        } catch (error) {
            console.error('Failed to finish workout:', error);
            set({ error: error.message });
        }
    },

    skipWorkout: async (reason) => {
        try {
            // Use adjusted date to respect day boundary settings
            const { settings, selectedDate } = get();
            const today = selectedDate || getAdjustedDate(settings.dayBoundaryHour);
            const { training } = get();
            const prevStatus = training?.status || 'pending';

            await skipTraining(today, reason);
            set({ isTrainingActive: false });

            recordAction(
                ACTION_TYPES.WORKOUT_SKIPPED,
                `Skipped workout: ${reason}`,
                { status: prevStatus },
                { date: today, reason }
            );

            await get().refreshDay();
            set({ actionHistory: getActionHistory() });
        } catch (error) {
            console.error('Failed to skip workout:', error);
            set({ error: error.message });
        }
    },

    setRestDay: async () => {
        try {
            // Use adjusted date to respect day boundary settings
            const { settings, selectedDate } = get();
            const today = selectedDate || getAdjustedDate(settings.dayBoundaryHour);
            // Get previous state for undo
            const { training } = get();
            const prevStatus = training?.status || 'pending';

            await markRestDay(today);

            recordAction(
                ACTION_TYPES.REST_DAY_SET,
                'Marked today as rest day',
                { status: prevStatus },
                { date: today }
            );

            await get().refreshDay();
            set({ actionHistory: getActionHistory() });
        } catch (error) {
            console.error('Failed to set rest day:', error);
            set({ error: error.message });
        }
    },

    setRestTimer: (seconds) => set({ restTimer: seconds }),

    // =====================================
    // Meal State
    // =====================================
    meals: [],
    nutrition: { calories: 0, protein: 0, carbs: 0, fats: 0, mealsLogged: 0, mealsTotal: 4 },
    foodItems: [],

    logFood: async (mealId, foodItem) => {
        try {
            await logFoodToMeal(mealId, foodItem);
            await get().refreshDay();
        } catch (error) {
            console.error('Failed to log food:', error);
            set({ error: error.message });
        }
    },

    logQuickItem: async (mealId, quickItemKey, quantity = 1) => {
        try {
            await logQuickItemDB(mealId, quickItemKey, quantity);
            await get().refreshDay(); // Refresh state after DB write
        } catch (error) {
            console.error('Failed to log quick item:', error);
            set({ error: error.message });
            throw error; // Re-throw so UI can handle
        }
    },

    completeMeal: async (mealId) => {
        try {
            await completeMealDB(mealId);
            await get().refreshDay();

            // Update day summary
            const { nutrition, currentDay } = get();
            if (currentDay) {
                await updateDaySummary(currentDay.date, {
                    mealsLogged: nutrition.mealsLogged,
                    mealsTotal: nutrition.mealsTotal,
                    caloriesTotal: nutrition.calories,
                    proteinTotal: nutrition.protein,
                });
            }
        } catch (error) {
            console.error('Failed to complete meal:', error);
            set({ error: error.message });
        }
    },

    skipMeal: async (mealId, reason) => {
        try {
            await skipMealDB(mealId, reason);
            await get().refreshDay();
        } catch (error) {
            console.error('Failed to skip meal:', error);
            set({ error: error.message });
        }
    },

    removeFood: async (mealId, foodItemId) => {
        try {
            await removeFoodFromMeal(mealId, foodItemId);
            await get().refreshDay();
        } catch (error) {
            console.error('Failed to remove food:', error);
            set({ error: error.message });
            throw error;
        }
    },

    searchFood: async (query) => {
        try {
            const results = await searchFoodItems(query);
            return results;
        } catch (error) {
            console.error('Failed to search food:', error);
            return [];
        }
    },

    // =====================================
    // Day Closure
    // =====================================
    closeCurrentDay: async () => {
        try {
            const { currentDay } = get();
            if (currentDay && currentDay.status === DAY_STATUS.ACTIVE) {
                await closeDay(currentDay.date);
                await get().refreshDay();
            }
        } catch (error) {
            console.error('Failed to close day:', error);
            set({ error: error.message });
        }
    },

    updateEnergy: async (level) => {
        try {
            const { currentDay } = get();
            if (currentDay && currentDay.status === DAY_STATUS.ACTIVE) {
                await updateDayEnergy(currentDay.date, level);
                await get().refreshDay();
            }
        } catch (error) {
            console.error('Failed to update energy:', error);
            set({ error: error.message });
        }
    },

    // =====================================
    // Data Export/Import
    // =====================================
    exportData: async () => {
        try {
            const data = await exportDatabase();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `continuum-backup-${getDateString()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export data:', error);
            set({ error: error.message });
        }
    },

    importData: async (file) => {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            await importDatabase(data);
            // Reset isInitialized so initializeApp actually rehydrates state
            set({ isInitialized: false, isLoading: false });
            await get().initializeApp();
        } catch (error) {
            console.error('Failed to import data:', error);
            set({ error: error.message });
        }
    },

    // =====================================
    // UI State
    // =====================================
    showModal: null,
    modalData: null,

    openModal: (modal, data = null) => set({ showModal: modal, modalData: data }),
    closeModal: () => set({ showModal: null, modalData: null }),

    toast: null,
    showToast: (message, type = 'info') => {
        set({ toast: { message, type } });
        setTimeout(() => set({ toast: null }), 3000);
    },

    // (Settings updateSettings is defined below with persistence)

    // =====================================
    // Action History & Undo
    // =====================================
    actionHistory: [],

    refreshActionHistory: () => {
        set({ actionHistory: getActionHistory() });
    },

    undoLastAction: async (actionId) => {
        try {
            await undoAction(actionId);
            await get().refreshDay();
            set({ actionHistory: getActionHistory() });
            get().showToast('Action undone successfully', 'success');
        } catch (error) {
            console.error('Failed to undo action:', error);
            get().showToast(error.message || 'Failed to undo action', 'error');
        }
    },

    // =====================================
    // Error Handling
    // =====================================
    clearError: () => set({ error: null }),

    // =====================================
    // Custom Training Data (Editable)
    // =====================================
    customTrainingData: (() => {
        try {
            return JSON.parse(localStorage.getItem('customTrainingData') || 'null') || {
                bodyRegions: null,
                muscleGroups: null,
                muscleDetails: null,
                exercises: null,
            };
        } catch {
            console.warn('Failed to parse customTrainingData, using defaults');
            return {
                bodyRegions: null,
                muscleGroups: null,
                muscleDetails: null,
                exercises: null,
            };
        }
    })(),

    // Save custom training data to localStorage
    saveCustomTrainingData: () => {
        const { customTrainingData } = get();
        localStorage.setItem('customTrainingData', JSON.stringify(customTrainingData));
    },

    // Update body regions
    updateBodyRegions: (regions) => {
        set((state) => ({
            customTrainingData: {
                ...state.customTrainingData,
                bodyRegions: regions,
            },
        }));
        get().saveCustomTrainingData();
    },

    // Update muscle groups for a region
    updateMuscleGroups: (region, muscles) => {
        set((state) => ({
            customTrainingData: {
                ...state.customTrainingData,
                muscleGroups: {
                    ...(state.customTrainingData.muscleGroups || {}),
                    [region]: muscles,
                },
            },
        }));
        get().saveCustomTrainingData();
    },

    // Update muscle details (howTo, mistakes, recovery, areas, workout, etc.)
    updateMuscleDetails: (muscleId, details) => {
        set((state) => ({
            customTrainingData: {
                ...state.customTrainingData,
                muscleDetails: {
                    ...(state.customTrainingData.muscleDetails || {}),
                    [muscleId]: {
                        ...(state.customTrainingData.muscleDetails?.[muscleId] || {}),
                        ...details,
                    },
                },
            },
        }));
        get().saveCustomTrainingData();
    },

    // Update exercises for a muscle group
    updateExercises: (environment, muscleId, exercises) => {
        const key = `${environment}_${muscleId}`;
        set((state) => ({
            customTrainingData: {
                ...state.customTrainingData,
                exercises: {
                    ...(state.customTrainingData.exercises || {}),
                    [key]: exercises,
                },
            },
        }));
        get().saveCustomTrainingData();
    },

    // Add exercise to a muscle group
    addExercise: (environment, muscleId, exercise) => {
        const { customTrainingData } = get();
        const key = `${environment}_${muscleId}`;
        const currentExercises = customTrainingData.exercises?.[key] || [];
        get().updateExercises(environment, muscleId, [...currentExercises, exercise]);
    },

    // Delete exercise from a muscle group
    deleteExercise: (environment, muscleId, exerciseIndex) => {
        const { customTrainingData } = get();
        const key = `${environment}_${muscleId}`;
        const currentExercises = customTrainingData.exercises?.[key] || [];
        get().updateExercises(
            environment,
            muscleId,
            currentExercises.filter((_, i) => i !== exerciseIndex)
        );
    },

    // Reset custom training data to defaults
    resetCustomTrainingData: () => {
        localStorage.removeItem('customTrainingData');
        set({
            customTrainingData: {
                bodyRegions: null,
                muscleGroups: null,
                muscleDetails: null,
                exercises: null,
            },
        });
    },

    // =====================================
    // Holiday Mode Actions
    // =====================================
    toggleHolidayMode: async (isHoliday) => {
        const { currentDay } = get();
        if (!currentDay) return;

        try {
            const updatedDay = await setDayHolidayMode(currentDay.date, isHoliday);
            set({ currentDay: updatedDay });
        } catch (error) {
            console.error('Failed to toggle holiday mode:', error);
            set({ error: error.message });
        }
    },

    updateHolidayPriority: async (priorityId, completed) => {
        const { currentDay } = get();
        if (!currentDay) return;

        try {
            const updatedDay = await updateHolidayProgress(currentDay.date, priorityId, completed);
            set({ currentDay: updatedDay });
        } catch (error) {
            console.error('Failed to update holiday priority:', error);
            set({ error: error.message });
        }
    },

    // =====================================
    // Settings Actions
    // =====================================
    updateSettings: async (newSettings) => {
        const { settings } = get();
        const updatedSettings = { ...settings, ...newSettings };

        try {
            const db = await getDB();
            await db.put(STORES.SETTINGS, {
                key: 'appSettings',
                value: updatedSettings,
            });
            set({ settings: updatedSettings });
        } catch (error) {
            console.error('Failed to save settings:', error);
            set({ error: error.message });
        }
    },

    // =====================================
    // Day Locking Check
    // =====================================
    isDayLocked: () => {
        const { currentDay, settings } = get();
        return isDayLocked(currentDay, settings.dayBoundaryHour);
    },
}));
