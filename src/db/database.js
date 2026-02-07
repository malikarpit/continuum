/**
 * Continuum Database
 * IndexedDB initialization and connection management
 * All data is stored locally - no backend required
 */

import { openDB } from 'idb';

const DB_NAME = 'ContinuumDB';
const DB_VERSION = 2;

/**
 * Object Store Names
 */
export const STORES = {
    DAYS: 'days',
    TASKS: 'tasks',
    TRAINING_SESSIONS: 'trainingSessions',
    MEALS: 'meals',
    FOOD_ITEMS: 'foodItems',
    TEMPLATES: 'templates',
    SETTINGS: 'settings',
    BACKUPS: 'backups',
    PHASES: 'phases', // New: Phase management
};

/**
 * Initialize and open the database
 */
export async function initDatabase() {
    const db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
            // console.log(`Upgrading database from version ${oldVersion} to ${newVersion}`);

            // Days store - keyed by date string (YYYY-MM-DD)
            if (!db.objectStoreNames.contains(STORES.DAYS)) {
                const daysStore = db.createObjectStore(STORES.DAYS, { keyPath: 'date' });
                daysStore.createIndex('status', 'status', { unique: false });
                daysStore.createIndex('createdAt', 'createdAt', { unique: false });
            }

            // Tasks store
            if (!db.objectStoreNames.contains(STORES.TASKS)) {
                const tasksStore = db.createObjectStore(STORES.TASKS, { keyPath: 'id' });
                tasksStore.createIndex('date', 'date', { unique: false });
                tasksStore.createIndex('category', 'category', { unique: false });
                tasksStore.createIndex('status', 'status', { unique: false });
                tasksStore.createIndex('type', 'type', { unique: false });
            }

            // Training sessions store - keyed by date
            if (!db.objectStoreNames.contains(STORES.TRAINING_SESSIONS)) {
                const trainingStore = db.createObjectStore(STORES.TRAINING_SESSIONS, { keyPath: 'date' });
                trainingStore.createIndex('trainingType', 'trainingType', { unique: false });
                trainingStore.createIndex('mode', 'mode', { unique: false });
                trainingStore.createIndex('status', 'status', { unique: false });
            }

            // Meals store
            if (!db.objectStoreNames.contains(STORES.MEALS)) {
                const mealsStore = db.createObjectStore(STORES.MEALS, { keyPath: 'id' });
                mealsStore.createIndex('date', 'date', { unique: false });
                mealsStore.createIndex('mealType', 'mealType', { unique: false });
                mealsStore.createIndex('status', 'status', { unique: false });
            }

            // Food items store (predefined foods with nutritional values)
            if (!db.objectStoreNames.contains(STORES.FOOD_ITEMS)) {
                const foodStore = db.createObjectStore(STORES.FOOD_ITEMS, { keyPath: 'id' });
                foodStore.createIndex('name', 'name', { unique: false });
                foodStore.createIndex('type', 'type', { unique: false });
                foodStore.createIndex('category', 'category', { unique: false });
            }

            // Templates store (day templates, workout templates)
            if (!db.objectStoreNames.contains(STORES.TEMPLATES)) {
                const templatesStore = db.createObjectStore(STORES.TEMPLATES, { keyPath: 'id' });
                templatesStore.createIndex('type', 'type', { unique: false });
                templatesStore.createIndex('name', 'name', { unique: false });
            }

            // Settings store
            if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
                db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
            }

            // Backups store
            if (!db.objectStoreNames.contains(STORES.BACKUPS)) {
                const backupsStore = db.createObjectStore(STORES.BACKUPS, { keyPath: 'id' });
                backupsStore.createIndex('createdAt', 'createdAt', { unique: false });
            }

            // Phases store (4-week progression) - v2
            if (!db.objectStoreNames.contains(STORES.PHASES)) {
                const phasesStore = db.createObjectStore(STORES.PHASES, { keyPath: 'id' });
                phasesStore.createIndex('startDate', 'startDate', { unique: false });
                phasesStore.createIndex('status', 'status', { unique: false });
            }

            // Version 2 migrations: Add indexes for scheduled tasks
            if (oldVersion < 2) {
                // console.log('Running v2 migrations...');
                // Add scheduledFor index to tasks if upgrading
                if (db.objectStoreNames.contains(STORES.TASKS)) {
                    const tasksStore = transaction.objectStore(STORES.TASKS);
                    if (!tasksStore.indexNames.contains('scheduledFor')) {
                        tasksStore.createIndex('scheduledFor', 'scheduledFor', { unique: false });
                    }
                }
            }
        },
    });

    return db;
}

// Database instance singleton
let dbInstance = null;

/**
 * Get database instance (lazy initialization)
 */
export async function getDB() {
    if (!dbInstance) {
        dbInstance = await initDatabase();
    }
    return dbInstance;
}

/**
 * Generic CRUD operations
 */
export async function getAll(storeName) {
    const db = await getDB();
    return db.getAll(storeName);
}

export async function getById(storeName, id) {
    const db = await getDB();
    return db.get(storeName, id);
}

export async function put(storeName, data) {
    const db = await getDB();
    return db.put(storeName, data);
}

export async function add(storeName, data) {
    const db = await getDB();
    return db.add(storeName, data);
}

export async function remove(storeName, id) {
    const db = await getDB();
    return db.delete(storeName, id);
}

export async function getByIndex(storeName, indexName, value) {
    const db = await getDB();
    return db.getAllFromIndex(storeName, indexName, value);
}

export async function getByIndexRange(storeName, indexName, range) {
    const db = await getDB();
    return db.getAllFromIndex(storeName, indexName, range);
}

export async function clear(storeName) {
    const db = await getDB();
    return db.clear(storeName);
}

/**
 * Transaction wrapper for atomic operations
 */
export async function withTransaction(storeNames, mode, callback) {
    const db = await getDB();
    const tx = db.transaction(storeNames, mode);
    try {
        const result = await callback(tx);
        await tx.done;
        return result;
    } catch (error) {
        console.error('Transaction failed:', error);
        throw error;
    }
}

/**
 * Export entire database as JSON
 * Includes localStorage preferences for complete state
 */
export async function exportDatabase() {
    const db = await getDB();
    const exportData = {
        version: DB_VERSION,
        exportedAt: new Date().toISOString(),
        data: {},
        preferences: {}, // Store localStorage items
    };

    // Export IndexedDB stores
    for (const storeName of Object.values(STORES)) {
        exportData.data[storeName] = await db.getAll(storeName);
    }

    // Export relevant localStorage items
    const PREF_KEYS = [
        'continuum_sync_tasks',
        'continuum_sync_calendar',
        'continuum_last_sync_tasks',
        'continuum_last_sync_calendar',
        'continuum_google_calendar_sync',
        'continuum_onboarding_completed',
        'continuum_theme',
    ];

    PREF_KEYS.forEach(key => {
        const value = localStorage.getItem(key);
        if (value !== null) {
            exportData.preferences[key] = value;
        }
    });

    return exportData;
}

/**
 * Import database from JSON export
 * Validates version and schema before importing
 */
export async function importDatabase(exportData) {
    if (!exportData || !exportData.data) {
        throw new Error('Invalid export data: missing required fields');
    }

    // Validate version - can't import from newer versions
    if (exportData.version && exportData.version > DB_VERSION) {
        throw new Error(`Cannot import data from newer version (${exportData.version}). Current version: ${DB_VERSION}. Please update the app first.`);
    }

    // Validate store keys and warn about unknown stores
    const validStores = Object.values(STORES);
    const unknownStores = [];
    for (const storeName of Object.keys(exportData.data)) {
        if (!validStores.includes(storeName)) {
            unknownStores.push(storeName);
            console.warn(`Skipping unknown store: ${storeName}`);
        }
    }

    // Validate items have array format
    for (const [storeName, items] of Object.entries(exportData.data)) {
        if (validStores.includes(storeName) && !Array.isArray(items)) {
            throw new Error(`Invalid data format for store "${storeName}": expected array`);
        }
    }

    const db = await getDB();

    // MERGE STRATEGY: Update existing data, add new data, keep non-conflicting local data
    // We do NOT clear the stores. This ensures we don't lose data that isn't in the backup.
    // If an ID exists in both, the IMPORTED version wins (overwrite).

    for (const [storeName, items] of Object.entries(exportData.data)) {
        if (validStores.includes(storeName)) {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);

            let successCount = 0;
            let errorCount = 0;

            for (const item of items) {
                // Basic validation: items should be objects
                if (item && typeof item === 'object') {
                    try {
                        await store.put(item);
                        successCount++;
                    } catch (e) {
                        console.error(`Failed to put item in ${storeName}:`, item, e);
                        errorCount++;
                    }
                } else {
                    console.warn(`Skipping invalid item in store ${storeName}:`, item);
                }
            }
            await tx.done;
            // console.log(`Store ${storeName}: Imported ${successCount} items, ${errorCount} errors.`);
        }
    }

    // Restore preferences if present
    if (exportData.preferences) {
        Object.entries(exportData.preferences).forEach(([key, value]) => {
            localStorage.setItem(key, value);
        });
    }

    // console.log(`Database import completed. Skipped ${unknownStores.length} unknown stores.`);
    return true;
}
