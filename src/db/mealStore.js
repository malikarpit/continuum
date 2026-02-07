/**
 * Meal Store
 * Manages meals and nutrition tracking with real-time macro counting
 */

import { getDB, STORES } from './database';
import { getDateString } from './dayStore';

/**
 * Meal Status Constants
 */
export const MEAL_STATUS = {
    PLANNED: 'planned',
    COMPLETED: 'completed',
    SKIPPED: 'skipped',
    UNLOGGED: 'unlogged', // For inactive days
};

/**
 * Meal Types (4 slots per day)
 */
export const MEAL_TYPE = {
    BREAKFAST: 'breakfast',
    LUNCH: 'lunch',
    SNACK: 'snack',
    DINNER: 'dinner',
};

/**
 * Food Item Types
 */
export const FOOD_TYPE = {
    STRUCTURED: 'structured', // Predefined with known values
    ESTIMATED: 'estimated',   // User-entered estimates
};

/**
 * Food Categories
 */
export const FOOD_CATEGORY = {
    GRAIN: 'grain',
    PROTEIN: 'protein',
    DAIRY: 'dairy',
    VEGETABLE: 'vegetable',
    FRUIT: 'fruit',
    FAT: 'fat',
    BEVERAGE: 'beverage',
    OTHER: 'other',
};

/**
 * Skip Reasons for Meals
 */
export const MEAL_SKIP_REASONS = [
    'Not hungry',
    'No time',
    'Fasting',
    'Outside food',
    'Forgot',
    'Feeling unwell',
    'Custom reason',
];

/**
 * Generate unique meal ID
 */
export function generateMealId() {
    return `meal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a meal record
 */
export function createMeal(data) {
    return {
        id: generateMealId(),
        date: data.date || getDateString(),
        mealType: data.mealType,
        status: MEAL_STATUS.PLANNED,
        plannedItems: data.plannedItems || [],
        loggedItems: [],
        skipReason: null,
        notes: '',
        totals: {
            calories: 0,
            protein: 0,
            carbs: 0,
            fats: 0,
        },
        createdAt: new Date().toISOString(),
        completedAt: null,
    };
}

/**
 * Create food item structure
 */
export function createFoodItem(data) {
    return {
        id: `food_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: data.name,
        type: data.type || FOOD_TYPE.STRUCTURED,
        category: data.category || FOOD_CATEGORY.OTHER,
        servingSize: data.servingSize || '1 serving',
        quantity: data.quantity || 1,
        calories: data.calories || 0,
        protein: data.protein || 0,
        carbs: data.carbs || 0,
        fats: data.fats || 0,
        isVegetarian: data.isVegetarian !== false, // Default to true
        hasEgg: data.hasEgg || false,
    };
}

/**
 * Get all meals for a date
 */
export async function getMealsByDate(date) {
    const db = await getDB();
    const dateStr = typeof date === 'string' ? date : getDateString(date);
    return db.getAllFromIndex(STORES.MEALS, 'date', dateStr);
}

/**
 * Get meal by ID
 */
export async function getMeal(id) {
    const db = await getDB();
    return db.get(STORES.MEALS, id);
}

/**
 * Save meal
 */
export async function saveMeal(meal) {
    const db = await getDB();
    return db.put(STORES.MEALS, meal);
}

/**
 * Create default meals for a day (4 slots)
 */
export async function createDayMeals(date) {
    const dateStr = typeof date === 'string' ? date : getDateString(date);
    const mealTypes = Object.values(MEAL_TYPE);
    const createdMeals = [];

    for (const mealType of mealTypes) {
        const meal = createMeal({
            date: dateStr,
            mealType,
        });
        await saveMeal(meal);
        createdMeals.push(meal);
    }

    return createdMeals;
}

/**
 * Get or create meals for a specific date (idempotent)
 * Checks for existing meals by mealType before creating to prevent duplicates
 */
export async function getOrCreateDailyMeals(date) {
    const targetDate = typeof date === 'string' ? date : getDateString(date);
    const existingMeals = await getMealsByDate(targetDate);

    // Group by meal type to find duplicates
    const mealsByType = {};
    const allMealTypes = Object.values(MEAL_TYPE);

    // Initialize groups
    allMealTypes.forEach(type => {
        mealsByType[type] = [];
    });

    // Sort existing into groups
    existingMeals.forEach(meal => {
        if (mealsByType[meal.mealType]) {
            mealsByType[meal.mealType].push(meal);
        } else {
            mealsByType[meal.mealType] = [meal];
        }
    });

    const db = await getDB();
    const finalMeals = [];

    // Process each type
    for (const type of allMealTypes) {
        const group = mealsByType[type];

        if (group.length === 0) {
            // Create missing meal
            const meal = createMeal({ date: targetDate, mealType: type });
            await saveMeal(meal);
            finalMeals.push(meal);
        } else if (group.length === 1) {
            // Good state - single meal
            finalMeals.push(group[0]);
        } else {
            // DUPLICATES FOUND - SAFE MERGE
            // Sort by relevance: Completed > Has Items > Skipped > Planned
            group.sort((a, b) => {
                const scoreA = getMealScore(a);
                const scoreB = getMealScore(b);
                if (scoreB !== scoreA) return scoreB - scoreA;
                // Tie-breaker: prefer older (first created)
                return new Date(a.createdAt) - new Date(b.createdAt);
            });

            // Winner is the best one
            const winner = group[0];

            // MERGE data from losers into winner (preserve user data!)
            for (let i = 1; i < group.length; i++) {
                const loser = group[i];

                // If loser has logged items that winner doesn't, merge them
                if (loser.loggedItems && loser.loggedItems.length > 0) {
                    if (!winner.loggedItems) winner.loggedItems = [];

                    // Add items that aren't already in winner (by name)
                    const winnerItemNames = new Set(winner.loggedItems.map(item => item.name));
                    for (const item of loser.loggedItems) {
                        if (!winnerItemNames.has(item.name)) {
                            winner.loggedItems.push(item);
                            // Update totals
                            winner.totals.calories += item.calories * (item.quantity || 1);
                            winner.totals.protein += item.protein * (item.quantity || 1);
                            winner.totals.carbs += item.carbs * (item.quantity || 1);
                            winner.totals.fats += item.fats * (item.quantity || 1);
                        }
                    }
                }

                // Preserve completed status if any duplicate was completed
                if (loser.status === MEAL_STATUS.COMPLETED && winner.status !== MEAL_STATUS.COMPLETED) {
                    winner.status = MEAL_STATUS.COMPLETED;
                    winner.completedAt = loser.completedAt;
                }

                // Only delete truly empty duplicates
                console.log(`[MealStore] Removing duplicate meal ${loser.id} (${loser.mealType}), had ${loser.loggedItems?.length || 0} items`);
                await db.delete(STORES.MEALS, loser.id);
            }

            // Save winner with merged data
            await saveMeal(winner);
            finalMeals.push(winner);
        }
    }

    return finalMeals;
}

/**
 * Legacy wrapper for backward compatibility
 */
export async function getOrCreateTodayMeals() {
    return getOrCreateDailyMeals(getDateString());
}

/**
 * Score meal for retention relevance
 */
function getMealScore(meal) {
    let score = 0;
    if (meal.status === MEAL_STATUS.COMPLETED) score += 100;
    if (meal.status === MEAL_STATUS.SKIPPED) score += 50;
    if (meal.loggedItems && meal.loggedItems.length > 0) score += 75 + meal.loggedItems.length;
    if (meal.totals?.protein > 0) score += 10;
    return score;
}

/**
 * Log food item to a meal
 */
export async function logFoodToMeal(mealId, foodItem) {
    const meal = await getMeal(mealId);
    if (!meal) {
        throw new Error('Meal not found');
    }

    if (meal.status === MEAL_STATUS.SKIPPED || meal.status === MEAL_STATUS.UNLOGGED) {
        throw new Error('Cannot log food to skipped or unlogged meal');
    }

    // Add food item
    const item = createFoodItem(foodItem);
    meal.loggedItems.push(item);

    // Update totals
    meal.totals.calories += item.calories * item.quantity;
    meal.totals.protein += item.protein * item.quantity;
    meal.totals.carbs += item.carbs * item.quantity;
    meal.totals.fats += item.fats * item.quantity;

    return saveMeal(meal);
}

/**
 * Remove food item from meal
 */
export async function removeFoodFromMeal(mealId, foodItemId) {
    const meal = await getMeal(mealId);
    if (!meal) {
        throw new Error('Meal not found');
    }

    const itemIndex = meal.loggedItems.findIndex(item => item.id === foodItemId);
    if (itemIndex === -1) {
        throw new Error('Food item not found');
    }

    const item = meal.loggedItems[itemIndex];

    // Update totals
    meal.totals.calories -= item.calories * item.quantity;
    meal.totals.protein -= item.protein * item.quantity;
    meal.totals.carbs -= item.carbs * item.quantity;
    meal.totals.fats -= item.fats * item.quantity;

    // Remove item
    meal.loggedItems.splice(itemIndex, 1);

    return saveMeal(meal);
}

/**
 * Complete a meal
 */
export async function completeMeal(mealId) {
    const meal = await getMeal(mealId);
    if (!meal) {
        throw new Error('Meal not found');
    }

    meal.status = MEAL_STATUS.COMPLETED;
    meal.completedAt = new Date().toISOString();

    return saveMeal(meal);
}

/**
 * Skip a meal (requires reason)
 */
export async function skipMeal(mealId, reason) {
    if (!reason || reason.trim() === '') {
        throw new Error('Skip reason is required');
    }

    const meal = await getMeal(mealId);
    if (!meal) {
        throw new Error('Meal not found');
    }

    meal.status = MEAL_STATUS.SKIPPED;
    meal.skipReason = reason.trim();
    meal.completedAt = new Date().toISOString();

    return saveMeal(meal);
}

/**
 * Mark meal as unlogged (for inactive days)
 */
export async function markMealUnlogged(mealId) {
    const meal = await getMeal(mealId);
    if (!meal) {
        throw new Error('Meal not found');
    }

    meal.status = MEAL_STATUS.UNLOGGED;
    meal.skipReason = 'Day not opened';

    return saveMeal(meal);
}

/**
 * Get daily nutrition totals
 * Sums macros from ALL meals with logged items (real-time), 
 * tracks completed meals separately
 */
export async function getDailyNutrition(date) {
    // Use getOrCreateTodayMeals to get deduplicated meals (fixes duplicate count issue)
    const today = getDateString();
    let meals;

    // Only use deduplication for today, use raw for historical
    if (date === today) {
        meals = await getOrCreateTodayMeals();
    } else {
        meals = await getMealsByDate(date);
    }

    const totals = {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
        mealsLogged: 0, // meals marked complete
        mealsWithItems: 0, // meals with any logged items
        mealsTotal: meals.length,
    };

    for (const meal of meals) {
        // Sum macros from any meal with logged items (real-time tracking)
        if (meal.loggedItems && meal.loggedItems.length > 0) {
            totals.calories += meal.totals?.calories || 0;
            totals.protein += meal.totals?.protein || 0;
            totals.carbs += meal.totals?.carbs || 0;
            totals.fats += meal.totals?.fats || 0;
            totals.mealsWithItems++;
        }
        // Track completed meals separately
        if (meal.status === MEAL_STATUS.COMPLETED) {
            totals.mealsLogged++;
        }
    }

    return totals;
}

/**
 * Get food item (from predefined database)
 */
export async function getFoodItem(id) {
    const db = await getDB();
    return db.get(STORES.FOOD_ITEMS, id);
}

/**
 * Get all food items
 */
export async function getAllFoodItems() {
    const db = await getDB();
    return db.getAll(STORES.FOOD_ITEMS);
}

/**
 * Search food items by name
 */
export async function searchFoodItems(query) {
    const allItems = await getAllFoodItems();
    const lowerQuery = query.toLowerCase();
    return allItems.filter(item => item.name.toLowerCase().includes(lowerQuery));
}

/**
 * Add food item to database
 */
export async function addFoodItem(foodData) {
    const db = await getDB();
    const item = createFoodItem(foodData);
    await db.put(STORES.FOOD_ITEMS, item);
    return item;
}

/**
 * Initialize predefined food database
 */
export async function initializeFoodDatabase() {
    const db = await getDB();
    const existingItems = await db.getAll(STORES.FOOD_ITEMS);

    if (existingItems.length > 0) {
        return; // Already initialized
    }

    // Predefined vegetarian + eggs food items
    const predefinedFoods = [
        // Grains
        { name: 'Chapati', category: FOOD_CATEGORY.GRAIN, servingSize: '1 piece', calories: 120, protein: 3, carbs: 22, fats: 3 },
        { name: 'Rice (cooked)', category: FOOD_CATEGORY.GRAIN, servingSize: '1 cup', calories: 200, protein: 4, carbs: 45, fats: 0.5 },
        { name: 'Oats', category: FOOD_CATEGORY.GRAIN, servingSize: '1 cup', calories: 150, protein: 5, carbs: 27, fats: 3 },
        { name: 'Bread (whole wheat)', category: FOOD_CATEGORY.GRAIN, servingSize: '1 slice', calories: 80, protein: 4, carbs: 15, fats: 1 },
        { name: 'Poha', category: FOOD_CATEGORY.GRAIN, servingSize: '1 cup', calories: 180, protein: 3, carbs: 35, fats: 4 },

        // Protein
        { name: 'Boiled Egg', category: FOOD_CATEGORY.PROTEIN, servingSize: '1 egg', calories: 78, protein: 6, carbs: 0.5, fats: 5, hasEgg: true },
        { name: 'Omelette (2 eggs)', category: FOOD_CATEGORY.PROTEIN, servingSize: '1 serving', calories: 180, protein: 12, carbs: 1, fats: 14, hasEgg: true },
        { name: 'Paneer', category: FOOD_CATEGORY.PROTEIN, servingSize: '100g', calories: 265, protein: 18, carbs: 3, fats: 20 },
        { name: 'Dal (cooked)', category: FOOD_CATEGORY.PROTEIN, servingSize: '1 bowl', calories: 150, protein: 12, carbs: 20, fats: 2 },
        { name: 'Rajma', category: FOOD_CATEGORY.PROTEIN, servingSize: '1 bowl', calories: 180, protein: 14, carbs: 30, fats: 1 },
        { name: 'Chole', category: FOOD_CATEGORY.PROTEIN, servingSize: '1 bowl', calories: 200, protein: 12, carbs: 35, fats: 4 },
        { name: 'Tofu', category: FOOD_CATEGORY.PROTEIN, servingSize: '100g', calories: 144, protein: 15, carbs: 3, fats: 8 },
        { name: 'Soya Chunks', category: FOOD_CATEGORY.PROTEIN, servingSize: '50g dry', calories: 175, protein: 26, carbs: 15, fats: 0.5 },

        // Dairy
        { name: 'Milk', category: FOOD_CATEGORY.DAIRY, servingSize: '1 cup', calories: 120, protein: 8, carbs: 12, fats: 5 },
        { name: 'Curd/Yogurt', category: FOOD_CATEGORY.DAIRY, servingSize: '1 cup', calories: 100, protein: 8, carbs: 8, fats: 4 },
        { name: 'Cheese', category: FOOD_CATEGORY.DAIRY, servingSize: '1 slice', calories: 110, protein: 7, carbs: 0.5, fats: 9 },
        { name: 'Paneer Bhurji', category: FOOD_CATEGORY.DAIRY, servingSize: '100g', calories: 300, protein: 20, carbs: 5, fats: 22 },
        { name: 'Whey Protein', category: FOOD_CATEGORY.DAIRY, servingSize: '1 scoop', calories: 120, protein: 24, carbs: 3, fats: 1 },

        // Vegetables
        { name: 'Mixed Sabzi', category: FOOD_CATEGORY.VEGETABLE, servingSize: '1 bowl', calories: 100, protein: 3, carbs: 12, fats: 5 },
        { name: 'Salad', category: FOOD_CATEGORY.VEGETABLE, servingSize: '1 bowl', calories: 50, protein: 2, carbs: 10, fats: 0 },
        { name: 'Palak Paneer', category: FOOD_CATEGORY.VEGETABLE, servingSize: '1 bowl', calories: 250, protein: 15, carbs: 10, fats: 18 },

        // Fruits
        { name: 'Banana', category: FOOD_CATEGORY.FRUIT, servingSize: '1 medium', calories: 105, protein: 1, carbs: 27, fats: 0.5 },
        { name: 'Apple', category: FOOD_CATEGORY.FRUIT, servingSize: '1 medium', calories: 95, protein: 0.5, carbs: 25, fats: 0 },
        { name: 'Mango', category: FOOD_CATEGORY.FRUIT, servingSize: '1 cup', calories: 100, protein: 1, carbs: 25, fats: 0.5 },

        // Fats
        { name: 'Ghee', category: FOOD_CATEGORY.FAT, servingSize: '1 tbsp', calories: 120, protein: 0, carbs: 0, fats: 14 },
        { name: 'Almonds', category: FOOD_CATEGORY.FAT, servingSize: '10 pieces', calories: 70, protein: 3, carbs: 2, fats: 6 },
        { name: 'Peanuts', category: FOOD_CATEGORY.FAT, servingSize: '30g', calories: 170, protein: 7, carbs: 5, fats: 14 },

        // Beverages
        { name: 'Tea with Milk', category: FOOD_CATEGORY.BEVERAGE, servingSize: '1 cup', calories: 40, protein: 2, carbs: 4, fats: 2 },
        { name: 'Black Coffee', category: FOOD_CATEGORY.BEVERAGE, servingSize: '1 cup', calories: 5, protein: 0, carbs: 0, fats: 0 },
        { name: 'Buttermilk', category: FOOD_CATEGORY.BEVERAGE, servingSize: '1 glass', calories: 40, protein: 2, carbs: 3, fats: 2 },
        { name: 'Lassi', category: FOOD_CATEGORY.BEVERAGE, servingSize: '1 glass', calories: 150, protein: 5, carbs: 20, fats: 5 },
        { name: 'Protein Shake', category: FOOD_CATEGORY.BEVERAGE, servingSize: '1 glass', calories: 200, protein: 30, carbs: 15, fats: 3 },
    ].map(food => ({
        ...createFoodItem(food),
        type: FOOD_TYPE.STRUCTURED,
        isVegetarian: true,
    }));

    for (const food of predefinedFoods) {
        await db.put(STORES.FOOD_ITEMS, food);
    }

    console.log('Food database initialized with', predefinedFoods.length, 'items');
}

/**
 * Get nutrition statistics for a date range
 */
export async function getNutritionStats(startDate, endDate) {
    const db = await getDB();
    const allMeals = await db.getAll(STORES.MEALS);

    const startStr = typeof startDate === 'string' ? startDate : getDateString(startDate);
    const endStr = typeof endDate === 'string' ? endDate : getDateString(endDate);

    const mealsInRange = allMeals.filter(m => m.date >= startStr && m.date <= endStr);

    const dailyTotals = {};

    for (const meal of mealsInRange) {
        if (!dailyTotals[meal.date]) {
            dailyTotals[meal.date] = { calories: 0, protein: 0, carbs: 0, fats: 0, mealsLogged: 0 };
        }

        if (meal.status === MEAL_STATUS.COMPLETED) {
            dailyTotals[meal.date].calories += meal.totals.calories;
            dailyTotals[meal.date].protein += meal.totals.protein;
            dailyTotals[meal.date].carbs += meal.totals.carbs;
            dailyTotals[meal.date].fats += meal.totals.fats;
            dailyTotals[meal.date].mealsLogged++;
        }
    }

    const days = Object.keys(dailyTotals).length;
    const avgCalories = days > 0 ? Math.round(Object.values(dailyTotals).reduce((sum, d) => sum + d.calories, 0) / days) : 0;
    const avgProtein = days > 0 ? Math.round(Object.values(dailyTotals).reduce((sum, d) => sum + d.protein, 0) / days) : 0;

    return {
        dailyTotals,
        averages: {
            calories: avgCalories,
            protein: avgProtein,
        },
        totalMeals: mealsInRange.length,
        completedMeals: mealsInRange.filter(m => m.status === MEAL_STATUS.COMPLETED).length,
        skippedMeals: mealsInRange.filter(m => m.status === MEAL_STATUS.SKIPPED).length,
    };
}

// =====================================
// Quick Counters
// =====================================

/**
 * Quick counter items with predefined nutrition values
 */
export const QUICK_ITEMS = {
    CHAPATI: {
        id: 'quick_chapati',
        name: 'Chapati',
        servingSize: '1 piece',
        calories: 120,
        protein: 3,
        carbs: 25,
        fats: 2,
        category: FOOD_CATEGORY.GRAIN,
        icon: '🫓',
    },
    EGG_BOILED: {
        id: 'quick_egg_boiled',
        name: 'Boiled Egg',
        servingSize: '1 large',
        calories: 78,
        protein: 6,
        carbs: 1,
        fats: 5,
        category: FOOD_CATEGORY.PROTEIN,
        icon: '🥚',
    },
    EGG_OMELETTE: {
        id: 'quick_egg_omelette',
        name: 'Omelette (1 egg)',
        servingSize: '1 egg',
        calories: 95,
        protein: 6,
        carbs: 1,
        fats: 7,
        category: FOOD_CATEGORY.PROTEIN,
        icon: '🍳',
    },
    WATER_GLASS: {
        id: 'quick_water',
        name: 'Water',
        servingSize: '1 glass (~250ml)',
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
        category: FOOD_CATEGORY.BEVERAGE,
        icon: '💧',
    },
    DAL_SERVING: {
        id: 'quick_dal',
        name: 'Dal (1 katori)',
        servingSize: '1 katori (~150ml)',
        calories: 150,
        protein: 9,
        carbs: 20,
        fats: 4,
        category: FOOD_CATEGORY.PROTEIN,
        icon: '🥣',
    },
    RICE_SERVING: {
        id: 'quick_rice',
        name: 'Rice',
        servingSize: '1 cup cooked',
        calories: 200,
        protein: 4,
        carbs: 45,
        fats: 0,
        category: FOOD_CATEGORY.GRAIN,
        icon: '🍚',
    },
};

// Alias for backwards compatibility and clarity
export const DEFAULT_QUICK_ITEMS = QUICK_ITEMS;

/**
 * Get all quick items (default + custom)
 * @param {Object} settings - App settings containing customQuickItems
 * @returns {Array} Array of quick items for display
 */
export function getQuickItems(settings = {}) {
    // Convert default items to array format
    const defaultItems = Object.entries(QUICK_ITEMS).map(([key, item]) => ({
        ...item,
        key,
        isDefault: true,
    }));

    // Get custom items from settings
    const customItems = (settings.customQuickItems || []).map(item => ({
        ...item,
        isDefault: false,
    }));

    // Return combined list
    return [...defaultItems, ...customItems];
}

/**
 * Create a custom quick item
 * @param {Object} data - Item data
 * @returns {Object} Formatted quick item
 */
export function createCustomQuickItem(data) {
    return {
        id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        name: data.name,
        servingSize: data.servingSize || '1 serving',
        calories: parseInt(data.calories) || 0,
        protein: parseInt(data.protein) || 0,
        carbs: parseInt(data.carbs) || 0,
        fats: parseInt(data.fats) || 0,
        category: data.category || FOOD_CATEGORY.PROTEIN,
        icon: data.icon || '🍽️',
    };
}

/**
 * Quick log a common item to a meal
 */
export async function logQuickItem(mealId, quickItemKey, quantity = 1) {
    const quickItem = QUICK_ITEMS[quickItemKey];
    if (!quickItem) {
        throw new Error('Quick item not found');
    }

    const meal = await getMeal(mealId);
    if (!meal) {
        throw new Error('Meal not found');
    }

    // Status guards - same as logFoodToMeal for data integrity
    if (meal.status === MEAL_STATUS.SKIPPED || meal.status === MEAL_STATUS.UNLOGGED) {
        throw new Error('Cannot log food to skipped or unlogged meal');
    }

    const item = {
        ...createFoodItem({
            ...quickItem,
            quantity,
        }),
        isQuickItem: true,
        quickItemKey,
    };

    meal.loggedItems.push(item);

    // Update totals
    meal.totals.calories += quickItem.calories * quantity;
    meal.totals.protein += quickItem.protein * quantity;
    meal.totals.carbs += quickItem.carbs * quantity;
    meal.totals.fats += quickItem.fats * quantity;

    return saveMeal(meal);
}

/**
 * Log estimated food item
 */
export async function logEstimatedItem(mealId, itemData) {
    const meal = await getMeal(mealId);
    if (!meal) {
        throw new Error('Meal not found');
    }

    const item = createFoodItem({
        ...itemData,
        type: FOOD_TYPE.ESTIMATED,
    });

    meal.loggedItems.push(item);

    // Update totals
    const qty = item.quantity || 1;
    meal.totals.calories += item.calories * qty;
    meal.totals.protein += item.protein * qty;
    meal.totals.carbs += item.carbs * qty;
    meal.totals.fats += item.fats * qty;

    return saveMeal(meal);
}

// =====================================
// Phase-Based Macro Targets
// =====================================

/**
 * Phase types for nutrition goals
 */
export const NUTRITION_PHASE = {
    BULK: 'bulk',
    CUT: 'cut',
    MAINTAIN: 'maintain',
};

/**
 * Get macro targets for a phase
 * @param {string} phase - BULK, CUT, or MAINTAIN
 * @param {number} bodyWeight - User's body weight in kg
 */
export function getPhaseMacroTargets(phase, bodyWeight = 70) {
    const baseCalories = bodyWeight * 30; // Rough maintenance

    switch (phase) {
        case NUTRITION_PHASE.BULK:
            return {
                calories: Math.round(baseCalories * 1.15),
                protein: Math.round(bodyWeight * 2), // 2g/kg
                carbs: Math.round((baseCalories * 1.15 * 0.5) / 4), // 50% from carbs
                fats: Math.round((baseCalories * 1.15 * 0.25) / 9), // 25% from fats
            };
        case NUTRITION_PHASE.CUT:
            return {
                calories: Math.round(baseCalories * 0.8),
                protein: Math.round(bodyWeight * 2.2), // Higher protein for muscle preservation
                carbs: Math.round((baseCalories * 0.8 * 0.4) / 4),
                fats: Math.round((baseCalories * 0.8 * 0.3) / 9),
            };
        case NUTRITION_PHASE.MAINTAIN:
        default:
            return {
                calories: Math.round(baseCalories),
                protein: Math.round(bodyWeight * 1.8),
                carbs: Math.round((baseCalories * 0.45) / 4),
                fats: Math.round((baseCalories * 0.3) / 9),
            };
    }
}

/**
 * Calculate progress towards macro targets
 */
export function calculateMacroProgress(currentTotals, targets) {
    return {
        calories: {
            current: currentTotals.calories,
            target: targets.calories,
            percent: Math.round((currentTotals.calories / targets.calories) * 100),
        },
        protein: {
            current: currentTotals.protein,
            target: targets.protein,
            percent: Math.round((currentTotals.protein / targets.protein) * 100),
        },
        carbs: {
            current: currentTotals.carbs,
            target: targets.carbs,
            percent: Math.round((currentTotals.carbs / targets.carbs) * 100),
        },
        fats: {
            current: currentTotals.fats,
            target: targets.fats,
            percent: Math.round((currentTotals.fats / targets.fats) * 100),
        },
    };
}

