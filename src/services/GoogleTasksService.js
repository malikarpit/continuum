/**
 * GoogleTasksService - Sync tasks with Google Tasks API
 * Implements "last write wins" conflict resolution
 */

import { googleAuth } from './GoogleAuthService';

const TASKS_API_BASE = 'https://tasks.googleapis.com/tasks/v1';
const SYNC_STATE_KEY = 'continuum_google_tasks_sync';

class GoogleTasksService {
    constructor() {
        this.defaultTaskListId = null;
        this.lastSyncTime = null;
    }

    /**
     * Initialize and get default task list
     */
    async init() {
        if (!googleAuth.isAuthenticated()) {
            throw new Error('Not authenticated with Google');
        }

        try {
            // Get all task lists
            const lists = await this.getTaskLists();

            // Look for Continuum list
            let continuumList = lists.find(l => l.title === 'Continuum');

            if (!continuumList) {
                // Create it if it doesn't exist
                try {
                    continuumList = await this.createTaskList('Continuum');
                } catch (e) {
                    console.error('Failed to create Continuum task list, using default', e);
                    continuumList = lists[0];
                }
            }

            this.defaultTaskListId = continuumList?.id || '@default';

            // Load sync state
            const syncState = localStorage.getItem(SYNC_STATE_KEY);
            if (syncState) {
                this.lastSyncTime = JSON.parse(syncState).lastSync;
            }

            return this.defaultTaskListId;
        } catch (error) {
            console.error('Google Tasks init error:', error);
            throw error;
        }
    }

    /**
     * Create a new task list
     */
    async createTaskList(title) {
        const response = await googleAuth.apiRequest(
            `${TASKS_API_BASE}/users/@me/lists`,
            {
                method: 'POST',
                body: JSON.stringify({ title }),
            }
        );
        return response.json();
    }

    /**
     * Get all task lists
     */
    async getTaskLists() {
        const response = await googleAuth.apiRequest(`${TASKS_API_BASE}/users/@me/lists`);
        const data = await response.json();
        return data.items || [];
    }

    /**
     * Get tasks from a list
     * @param {string} taskListId - Task list ID (defaults to default list)
     * @param {boolean} showCompleted - Include completed tasks
     */
    async getTasks(taskListId = null, showCompleted = true) {
        const listId = taskListId || this.defaultTaskListId || '@default';
        const params = new URLSearchParams({
            showCompleted: showCompleted.toString(),
            maxResults: '100',
        });

        const response = await googleAuth.apiRequest(
            `${TASKS_API_BASE}/lists/${listId}/tasks?${params}`
        );
        const data = await response.json();
        return data.items || [];
    }

    /**
     * Create a task in Google Tasks
     * @param {Object} task - Continuum task object
     * @param {string} taskListId - Task list ID
     */
    async createTask(task, taskListId = null) {
        const listId = taskListId || this.defaultTaskListId || '@default';

        const googleTask = this.toGoogleTask(task);

        const response = await googleAuth.apiRequest(
            `${TASKS_API_BASE}/lists/${listId}/tasks`,
            {
                method: 'POST',
                body: JSON.stringify(googleTask),
            }
        );

        if (!response.ok) {
            throw new Error('Failed to create task in Google Tasks');
        }

        return response.json();
    }

    /**
     * Update a task in Google Tasks
     * @param {string} taskId - Google Task ID
     * @param {Object} task - Continuum task object
     * @param {string} taskListId - Task list ID
     */
    async updateTask(taskId, task, taskListId = null) {
        const listId = taskListId || this.defaultTaskListId || '@default';

        const googleTask = this.toGoogleTask(task);

        const response = await googleAuth.apiRequest(
            `${TASKS_API_BASE}/lists/${listId}/tasks/${taskId}`,
            {
                method: 'PATCH',
                body: JSON.stringify(googleTask),
            }
        );

        if (!response.ok) {
            throw new Error('Failed to update task in Google Tasks');
        }

        return response.json();
    }

    /**
     * Delete a task from Google Tasks
     */
    async deleteTask(taskId, taskListId = null) {
        const listId = taskListId || this.defaultTaskListId || '@default';

        const response = await googleAuth.apiRequest(
            `${TASKS_API_BASE}/lists/${listId}/tasks/${taskId}`,
            { method: 'DELETE' }
        );

        return response.ok;
    }

    /**
     * Mark a task as complete
     */
    async completeTask(taskId, taskListId = null) {
        const listId = taskListId || this.defaultTaskListId || '@default';

        const response = await googleAuth.apiRequest(
            `${TASKS_API_BASE}/lists/${listId}/tasks/${taskId}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ status: 'completed' }),
            }
        );

        return response.json();
    }

    /**
     * Convert Continuum task to Google Tasks format
     */
    toGoogleTask(task) {
        const googleTask = {
            title: task.name || task.title,
            notes: task.description || task.notes || '',
            status: task.completed ? 'completed' : 'needsAction',
        };

        // Add due date if present
        if (task.dueDate) {
            const dueDate = new Date(task.dueDate);
            if (task.dueTime) {
                const [hours, minutes] = task.dueTime.split(':');
                dueDate.setHours(parseInt(hours), parseInt(minutes));
            }
            googleTask.due = dueDate.toISOString();
        }

        return googleTask;
    }

    /**
     * Convert Google Task to Continuum format
     */
    fromGoogleTask(googleTask) {
        const task = {
            googleTaskId: googleTask.id,
            name: googleTask.title,
            notes: googleTask.notes || '',
            completed: googleTask.status === 'completed',
            lastSyncedAt: new Date().toISOString(),
        };

        if (googleTask.due) {
            const dueDate = new Date(googleTask.due);
            task.dueDate = dueDate.toISOString().split('T')[0];
            // Google Tasks due dates are date-only, so no time component
        }

        if (googleTask.completed) {
            task.completedAt = googleTask.completed;
        }

        return task;
    }

    /**
     * Sync tasks between Continuum and Google Tasks
     * Uses "last write wins" strategy
     * @param {Array} localTasks - Local Continuum tasks
     * @param {Function} onUpdate - Callback when a local task needs updating
     */
    async syncTasks(localTasks, onUpdate) {
        if (!googleAuth.isAuthenticated()) {
            throw new Error('Not authenticated with Google');
        }

        await this.init();

        const googleTasks = await this.getTasks();
        const syncResults = {
            created: 0,
            updated: 0,
            deleted: 0,
            conflicts: 0,
        };

        // Create a map of Google tasks by ID
        const googleTaskMap = new Map(googleTasks.map(t => [t.id, t]));

        // Sync local tasks to Google
        for (const localTask of localTasks) {
            try {
                if (localTask.googleTaskId) {
                    // Task exists in Google - check for updates
                    const googleTask = googleTaskMap.get(localTask.googleTaskId);

                    if (googleTask) {
                        // Both exist - compare timestamps (last write wins)
                        const googleUpdated = new Date(googleTask.updated);
                        const localUpdated = new Date(localTask.updatedAt || localTask.createdAt);

                        if (localUpdated > googleUpdated) {
                            // Local is newer - push to Google
                            await this.updateTask(localTask.googleTaskId, localTask);
                            syncResults.updated++;
                        } else if (googleUpdated > localUpdated) {
                            // Google is newer - pull to local
                            const updatedLocal = this.fromGoogleTask(googleTask);
                            onUpdate?.(localTask.id, updatedLocal);
                            syncResults.updated++;
                        }
                        // Remove from map to track remaining (new in Google)
                        googleTaskMap.delete(localTask.googleTaskId);
                    } else {
                        // Task was deleted in Google - could restore or delete locally
                        // For now, re-create in Google (local wins)
                        const created = await this.createTask(localTask);
                        onUpdate?.(localTask.id, { googleTaskId: created.id });
                        syncResults.created++;
                    }
                } else {
                    // New local task - create in Google
                    const created = await this.createTask(localTask);
                    onUpdate?.(localTask.id, { googleTaskId: created.id });
                    syncResults.created++;
                }
            } catch (error) {
                console.error('Error syncing task:', localTask.id, error);
                syncResults.conflicts++;
            }
        }

        // Handle tasks that only exist in Google (not in local)
        // These are either new from Google or deleted locally
        for (const [googleTaskId, googleTask] of googleTaskMap) {
            // New task from Google - import to local
            const localTask = this.fromGoogleTask(googleTask);
            onUpdate?.(null, localTask); // null id = create new
            syncResults.created++;
        }

        // Update sync state
        this.lastSyncTime = new Date().toISOString();
        localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
            lastSync: this.lastSyncTime,
        }));

        return syncResults;
    }

    /**
     * Get last sync time
     */
    getLastSyncTime() {
        return this.lastSyncTime;
    }
}

export const googleTasksService = new GoogleTasksService();
export default GoogleTasksService;
