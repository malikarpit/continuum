/**
 * Tasks - Task management view with draggable tile grid
 * Features: movable, resizable, editable task tiles on a fine-grained grid
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store/appStore';
import { TASK_STATUS, TASK_CATEGORY, SKIP_REASONS } from '../../db/taskStore';
import { DEFAULT_TIME_BLOCKS } from '../../db/templateStore';

// Grid configuration - larger cells for better visibility
const GRID_COLS = 12;
const CELL_SIZE = 50;
const GAP = 8;

// Block definitions with icons for UI
const BLOCK_INFO = {
    morning: { icon: '🌅', label: 'Morning', description: 'Focus & Energy' },
    midday: { icon: '☀️', label: 'Midday', description: 'Deep Work' },
    afternoon: { icon: '🌤️', label: 'Afternoon', description: 'Projects' },
    evening: { icon: '🌆', label: 'Evening', description: 'Training & Dinner' },
    night: { icon: '🌙', label: 'Night', description: 'Wind Down' },
    unscheduled: { icon: '📋', label: 'Unscheduled', description: '' },
};

// Generate initial layout for tasks
function generateTaskLayout(tasks) {
    const saved = localStorage.getItem('continuum_tasks_layout');
    const savedLayout = saved ? JSON.parse(saved) : {};

    return tasks.map((task, index) => {
        // Use saved position or generate new one
        if (savedLayout[task.id]) {
            return { ...savedLayout[task.id], taskId: task.id };
        }
        // Default: spread tasks across 3 columns
        const col = (index % 3) * 4; // 0, 4, 8 positions
        const row = Math.floor(index / 3) * 3;
        return {
            taskId: task.id,
            x: col,
            y: row,
            w: 4,
            h: 3,
            minW: 3,
            minH: 2,
        };
    });
}

export default function Tasks() {
    const { tasks, taskStats, addTask, completeTask, skipTask, deleteTask, showToast } = useAppStore();
    const [showAddModal, setShowAddModal] = useState(false);
    const [showSkipModal, setShowSkipModal] = useState(null);
    const [filter, setFilter] = useState('all');
    const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
    const [editMode, setEditMode] = useState(false);
    const [dragging, setDragging] = useState(null);
    const [resizing, setResizing] = useState(null);
    const [taskLayout, setTaskLayout] = useState([]);
    const containerRef = useRef(null);

    // Filter tasks
    const filteredTasks = tasks.filter(task => {
        if (filter === 'all') return true;
        if (filter === 'pending') return task.status === TASK_STATUS.PENDING;
        if (filter === 'completed') return task.status === TASK_STATUS.COMPLETED;
        if (filter === 'skipped') return task.status === TASK_STATUS.SKIPPED;
        return task.category === filter;
    });

    // Initialize/update layout when tasks change (use IDs for stable comparison)
    const taskIds = useMemo(() => filteredTasks.map(t => t.id).join(','), [filteredTasks]);
    useEffect(() => {
        setTaskLayout(prev => {
            // Only regenerate if tasks actually changed
            const existingIds = new Set(prev.map(l => l.taskId));
            const currentIds = new Set(filteredTasks.map(t => t.id));

            // Check if IDs match
            if (existingIds.size === currentIds.size &&
                [...existingIds].every(id => currentIds.has(id))) {
                return prev;
            }
            return generateTaskLayout(filteredTasks);
        });
    }, [taskIds]);

    // Save layout to localStorage
    const saveLayout = useCallback((newLayout) => {
        setTaskLayout(newLayout);
        const layoutMap = {};
        newLayout.forEach(item => {
            layoutMap[item.taskId] = item;
        });
        localStorage.setItem('continuum_tasks_layout', JSON.stringify(layoutMap));
    }, []);

    // Handle drag start
    const handleDragStart = (e, taskId) => {
        if (!editMode) return;
        e.stopPropagation();
        const item = taskLayout.find(l => l.taskId === taskId);
        const rect = e.currentTarget.getBoundingClientRect();
        setDragging({
            id: taskId,
            startX: e.clientX,
            startY: e.clientY,
            origX: item.x,
            origY: item.y,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
        });
    };

    // Handle drag
    const handleDrag = useCallback((e) => {
        if (!dragging || !containerRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const cellWidth = CELL_SIZE + GAP;
        const cellHeight = CELL_SIZE + GAP;

        const newX = Math.round((e.clientX - containerRect.left - dragging.offsetX) / cellWidth);
        const newY = Math.round((e.clientY - containerRect.top - dragging.offsetY) / cellHeight);

        const item = taskLayout.find(l => l.taskId === dragging.id);
        const clampedX = Math.max(0, Math.min(GRID_COLS - item.w, newX));
        const clampedY = Math.max(0, newY);

        if (clampedX !== item.x || clampedY !== item.y) {
            const newLayout = taskLayout.map(l =>
                l.taskId === dragging.id ? { ...l, x: clampedX, y: clampedY } : l
            );
            saveLayout(newLayout);
        }
    }, [dragging, taskLayout, saveLayout]);

    // Handle resize start
    const handleResizeStart = (e, taskId) => {
        if (!editMode) return;
        e.stopPropagation();
        setResizing({ id: taskId });
    };

    // Handle resize
    const handleResize = useCallback((e) => {
        if (!resizing || !containerRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const cellWidth = CELL_SIZE + GAP;
        const cellHeight = CELL_SIZE + GAP;

        const item = taskLayout.find(l => l.taskId === resizing.id);
        const itemLeft = item.x * cellWidth;
        const itemTop = item.y * cellHeight;

        const newW = Math.max(item.minW, Math.round((e.clientX - containerRect.left - itemLeft + GAP) / cellWidth));
        const newH = Math.max(item.minH, Math.round((e.clientY - containerRect.top - itemTop + GAP) / cellHeight));

        const clampedW = Math.min(GRID_COLS - item.x, newW);

        if (clampedW !== item.w || newH !== item.h) {
            const newLayout = taskLayout.map(l =>
                l.taskId === resizing.id ? { ...l, w: clampedW, h: newH } : l
            );
            saveLayout(newLayout);
        }
    }, [resizing, taskLayout, saveLayout]);

    // Mouse event handlers
    useEffect(() => {
        const handleMouseMove = (e) => {
            if (dragging) handleDrag(e);
            if (resizing) handleResize(e);
        };

        const handleMouseUp = () => {
            setDragging(null);
            setResizing(null);
        };

        if (dragging || resizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging, resizing, handleDrag, handleResize]);

    // Reset layout
    const resetLayout = () => {
        localStorage.removeItem('continuum_tasks_layout');
        setTaskLayout(generateTaskLayout(filteredTasks));
        showToast('Layout reset', 'success');
    };

    const handleComplete = async (taskId) => {
        await completeTask(taskId);
        showToast('Task completed!', 'success');
    };

    const handleSkip = async (taskId, reason) => {
        await skipTask(taskId, reason);
        setShowSkipModal(null);
        showToast('Task skipped', 'info');
    };

    // Get current block based on time
    const getCurrentBlockId = () => {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const currentMinutes = hours * 60 + minutes;

        for (const block of DEFAULT_TIME_BLOCKS) {
            const [startHour, startMin] = block.startTime.split(':').map(Number);
            const [endHour, endMin] = block.endTime.split(':').map(Number);
            let startMinutes = startHour * 60 + startMin;
            let endMinutes = endHour * 60 + endMin;
            if (endMinutes === 0) endMinutes = 24 * 60;

            if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
                return block.id;
            }
        }
        return null;
    };

    // Calculate grid height based on tasks
    const maxY = taskLayout.reduce((max, item) => Math.max(max, item.y + item.h), 6);
    const gridHeight = maxY * (CELL_SIZE + GAP);

    return (
        <div className="tasks-view animate-fade-in">
            <header className="view-header">
                <div>
                    <h1 className="view-title">Tasks</h1>
                    <p className="view-subtitle text-secondary">
                        {taskStats.completed} of {taskStats.total} completed today
                    </p>
                </div>
                <div className="header-actions">
                    <div className="view-toggle">
                        <button
                            className={`toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                            onClick={() => setViewMode('grid')}
                            title="Grid View"
                        >
                            <GridIcon />
                        </button>
                        <button
                            className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                            onClick={() => setViewMode('list')}
                            title="List View"
                        >
                            <ListIcon />
                        </button>
                    </div>
                    {viewMode === 'grid' && (
                        <button
                            className={`btn ${editMode ? 'btn-accent' : 'btn-secondary'}`}
                            onClick={() => setEditMode(!editMode)}
                        >
                            {editMode ? '✓ Done' : '⚙ Edit Layout'}
                        </button>
                    )}
                    <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                        <PlusIcon />
                        Add Task
                    </button>
                </div>
            </header>

            {/* Progress Bar */}
            <div className="task-progress-container">
                <div className="progress-bar">
                    <div
                        className="progress-bar-fill"
                        style={{ width: `${taskStats.total > 0 ? (taskStats.completed / taskStats.total) * 100 : 0}%` }}
                    />
                </div>
                <div className="progress-stats">
                    <span className="text-success">{taskStats.completed} done</span>
                    <span className="text-muted">{taskStats.pending} pending</span>
                    <span className="text-warning">{taskStats.skipped} skipped</span>
                </div>
            </div>

            {/* Filters */}
            <div className="task-filters">
                {['all', 'pending', 'completed', 'skipped'].map(f => (
                    <button
                        key={f}
                        className={`filter-btn ${filter === f ? 'active' : ''}`}
                        onClick={() => setFilter(f)}
                    >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                ))}
            </div>

            {/* Edit mode banner */}
            {editMode && (
                <div className="edit-mode-banner">
                    <span>📐 Edit Mode: Drag tiles to move, drag corners to resize</span>
                    <button className="btn btn-ghost btn-sm" onClick={resetLayout}>
                        Reset Layout
                    </button>
                </div>
            )}

            {/* Grid View */}
            {viewMode === 'grid' ? (
                <div
                    ref={containerRef}
                    className={`task-grid-container ${editMode ? 'edit-mode' : ''}`}
                    style={{
                        minHeight: gridHeight,
                        position: 'relative',
                    }}
                >
                    {/* Grid overlay in edit mode */}
                    {editMode && (
                        <div
                            className="grid-overlay"
                            style={{
                                position: 'absolute',
                                inset: 0,
                                backgroundImage: `
                                    linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
                                    linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
                                `,
                                backgroundSize: `${CELL_SIZE + GAP}px ${CELL_SIZE + GAP}px`,
                                pointerEvents: 'none',
                                zIndex: 0,
                            }}
                        />
                    )}

                    {filteredTasks.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">📝</div>
                            <h3>No tasks found</h3>
                            <p className="text-secondary">Add your first task to get started</p>
                        </div>
                    ) : (
                        taskLayout.map(item => {
                            const task = filteredTasks.find(t => t.id === item.taskId);
                            if (!task) return null;

                            const isCompleted = task.status === TASK_STATUS.COMPLETED;
                            const isSkipped = task.status === TASK_STATUS.SKIPPED;
                            const isPending = task.status === TASK_STATUS.PENDING;
                            const blockInfo = task.blockId ? BLOCK_INFO[task.blockId] : null;

                            const cellWidth = CELL_SIZE + GAP;
                            const cellHeight = CELL_SIZE + GAP;

                            return (
                                <div
                                    key={task.id}
                                    className={`task-tile ${isCompleted ? 'completed' : ''} ${isSkipped ? 'skipped' : ''} ${editMode ? 'editable' : ''} ${dragging?.id === task.id ? 'dragging' : ''}`}
                                    style={{
                                        position: 'absolute',
                                        left: item.x * cellWidth,
                                        top: item.y * cellHeight,
                                        width: item.w * cellWidth - GAP,
                                        height: item.h * cellHeight - GAP,
                                    }}
                                    onMouseDown={(e) => handleDragStart(e, task.id)}
                                >
                                    {/* Drag handle in edit mode */}
                                    {editMode && (
                                        <div className="tile-drag-handle">
                                            <DragIcon />
                                        </div>
                                    )}

                                    <div className="tile-content">
                                        <div className="tile-header">
                                            <div
                                                className={`tile-checkbox ${isCompleted ? 'checked' : ''} ${isSkipped ? 'skipped' : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (isPending) handleComplete(task.id);
                                                }}
                                            >
                                                {isCompleted && <CheckIcon />}
                                                {isSkipped && <XIcon />}
                                            </div>
                                            <div className="tile-title">{task.title}</div>
                                        </div>

                                        {task.description && (
                                            <div className="tile-description">{task.description}</div>
                                        )}

                                        <div className="tile-meta">
                                            <span className="badge badge-accent" style={{ textTransform: 'capitalize' }}>
                                                {task.category}
                                            </span>
                                            {task.priority === 'high' && (
                                                <span className="badge badge-error">High</span>
                                            )}
                                            {blockInfo && (
                                                <span className="badge badge-info">{blockInfo.icon}</span>
                                            )}
                                        </div>

                                        {isPending && !editMode && (
                                            <div className="tile-actions">
                                                <button
                                                    className="tile-action-btn"
                                                    title="Skip"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowSkipModal(task.id);
                                                    }}
                                                >
                                                    <SkipIcon />
                                                </button>
                                                <button
                                                    className="tile-action-btn danger"
                                                    title="Delete"
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        try {
                                                            await deleteTask(task.id);
                                                            showToast('Task deleted', 'info');
                                                        } catch (err) {
                                                            showToast('Failed to delete task', 'error');
                                                        }
                                                    }}
                                                >
                                                    <TrashIcon />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Resize handle in edit mode */}
                                    {editMode && (
                                        <div
                                            className="tile-resize-handle"
                                            onMouseDown={(e) => handleResizeStart(e, task.id)}
                                        >
                                            <ResizeIcon />
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            ) : (
                /* List View */
                <div className="task-list">
                    {filteredTasks.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">📝</div>
                            <h3>No tasks found</h3>
                            <p className="text-secondary">
                                {filter === 'all' ? 'Add your first task to get started' : `No ${filter} tasks`}
                            </p>
                        </div>
                    ) : (
                        filteredTasks.map(task => (
                            <TaskItem
                                key={task.id}
                                task={task}
                                onComplete={() => handleComplete(task.id)}
                                onSkip={() => setShowSkipModal(task.id)}
                                onDelete={() => deleteTask(task.id)}
                            />
                        ))
                    )}
                </div>
            )}

            {/* Add Task Modal */}
            {showAddModal && (
                <AddTaskModal
                    onClose={() => setShowAddModal(false)}
                    onAdd={async (taskData) => {
                        await addTask(taskData);
                        setShowAddModal(false);
                        showToast('Task added!', 'success');
                    }}
                />
            )}

            {/* Skip Task Modal */}
            {showSkipModal && (
                <SkipTaskModal
                    task={tasks.find(t => t.id === showSkipModal)}
                    onClose={() => setShowSkipModal(null)}
                    onSkip={(reason) => handleSkip(showSkipModal, reason)}
                />
            )}

            <style>{tasksStyles}</style>
        </div>
    );
}

// Task Item Component for List View
function TaskItem({ task, onComplete, onSkip, onDelete }) {
    const isCompleted = task.status === TASK_STATUS.COMPLETED;
    const isSkipped = task.status === TASK_STATUS.SKIPPED;
    const isPending = task.status === TASK_STATUS.PENDING;
    const blockInfo = task.blockId ? BLOCK_INFO[task.blockId] : null;

    return (
        <div className={`task-item ${isCompleted ? 'completed' : ''}`}>
            <div
                className={`task-checkbox ${isCompleted ? 'checked' : ''} ${isSkipped ? 'skipped' : ''}`}
                onClick={isPending ? onComplete : undefined}
            >
                {isCompleted && <CheckIcon />}
                {isSkipped && <XIcon />}
            </div>

            <div className="task-content">
                <div className="task-title">{task.title}</div>
                {task.description && (
                    <div className="task-description">{task.description}</div>
                )}
                <div className="task-meta">
                    <span className="badge badge-accent" style={{ textTransform: 'capitalize' }}>
                        {task.category}
                    </span>
                    {task.priority === 'high' && (
                        <span className="badge badge-error">High</span>
                    )}
                    {blockInfo && (
                        <span className="badge badge-info">{blockInfo.icon} {blockInfo.label}</span>
                    )}
                    {isSkipped && task.skipReason && (
                        <span className="badge badge-warning">{task.skipReason}</span>
                    )}
                </div>
            </div>

            {isPending && (
                <div className="task-actions">
                    <button className="task-action-btn" title="Skip" onClick={onSkip}>
                        <SkipIcon />
                    </button>
                    <button className="task-action-btn danger" title="Delete" onClick={async () => {
                        try {
                            await onDelete();
                        } catch (err) {
                            // Error handled by parent
                        }
                    }}>
                        <TrashIcon />
                    </button>
                </div>
            )}
        </div>
    );
}

// Add Task Modal
function AddTaskModal({ onClose, onAdd }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState(TASK_CATEGORY.PERSONAL);
    const [priority, setPriority] = useState('medium');
    const [blockId, setBlockId] = useState('');
    const [scheduledTime, setScheduledTime] = useState('');
    const [recurringType, setRecurringType] = useState('none'); // none, daily, weekly
    const [selectedDays, setSelectedDays] = useState([]);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const toggleDay = (dayIndex) => {
        setSelectedDays(prev =>
            prev.includes(dayIndex)
                ? prev.filter(d => d !== dayIndex)
                : [...prev, dayIndex]
        );
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!title.trim()) return;

        const taskData = {
            title: title.trim(),
            description: description.trim(),
            category,
            priority,
            blockId: blockId || null,
            scheduledTime,
        };

        // Add recurring pattern if enabled
        if (recurringType !== 'none') {
            taskData.type = 'recurring';
            taskData.recurringPattern = {
                type: recurringType,
                daysOfWeek: recurringType === 'weekly' ? selectedDays : undefined,
            };
        }

        onAdd(taskData);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Add New Task</h2>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>
                        <XIcon />
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label className="label">Task Title *</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="What do you need to do?"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className="form-group">
                            <label className="label">Description</label>
                            <textarea
                                className="input"
                                placeholder="Add details (optional)"
                                rows={2}
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                            />
                        </div>

                        {/* Time Block Selection */}
                        <div className="form-group">
                            <label className="label">Time Block</label>
                            <div className="block-selector">
                                {DEFAULT_TIME_BLOCKS.map(block => {
                                    const info = BLOCK_INFO[block.id];
                                    return (
                                        <button
                                            key={block.id}
                                            type="button"
                                            className={`block-option ${blockId === block.id ? 'selected' : ''}`}
                                            style={{ '--block-color': block.color }}
                                            onClick={() => setBlockId(block.id)}
                                        >
                                            <span className="block-option-icon">{info.icon}</span>
                                            <div className="block-option-text">
                                                <span className="block-option-label">{info.label}</span>
                                                <span className="block-option-time">{block.startTime} - {block.endTime}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                                <button
                                    type="button"
                                    className={`block-option ${blockId === '' ? 'selected' : ''}`}
                                    onClick={() => setBlockId('')}
                                >
                                    <span className="block-option-icon">📋</span>
                                    <div className="block-option-text">
                                        <span className="block-option-label">None</span>
                                    </div>
                                </button>
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="label">Category</label>
                                <select
                                    className="input"
                                    value={category}
                                    onChange={e => setCategory(e.target.value)}
                                >
                                    {Object.values(TASK_CATEGORY).map(cat => (
                                        <option key={cat} value={cat}>
                                            {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="label">Priority</label>
                                <select
                                    className="input"
                                    value={priority}
                                    onChange={e => setPriority(e.target.value)}
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="label">Scheduled Time (optional)</label>
                            <input
                                type="time"
                                className="input"
                                value={scheduledTime}
                                onChange={e => setScheduledTime(e.target.value)}
                            />
                        </div>

                        {/* Recurring Options */}
                        <div className="form-group">
                            <label className="label">Repeat</label>
                            <div className="recurring-options">
                                <button
                                    type="button"
                                    className={`recurring-btn ${recurringType === 'none' ? 'active' : ''}`}
                                    onClick={() => setRecurringType('none')}
                                >
                                    ✗ Once
                                </button>
                                <button
                                    type="button"
                                    className={`recurring-btn ${recurringType === 'daily' ? 'active' : ''}`}
                                    onClick={() => setRecurringType('daily')}
                                >
                                    🔁 Daily
                                </button>
                                <button
                                    type="button"
                                    className={`recurring-btn ${recurringType === 'weekly' ? 'active' : ''}`}
                                    onClick={() => setRecurringType('weekly')}
                                >
                                    📅 Weekly
                                </button>
                            </div>
                        </div>

                        {/* Day Picker for Weekly */}
                        {recurringType === 'weekly' && (
                            <div className="form-group">
                                <label className="label">Select Days</label>
                                <div className="day-picker">
                                    {dayNames.map((day, i) => (
                                        <button
                                            key={day}
                                            type="button"
                                            className={`day-btn ${selectedDays.includes(i) ? 'active' : ''}`}
                                            onClick={() => toggleDay(i)}
                                        >
                                            {day}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={!title.trim()}>
                            Add Task
                        </button>
                    </div>
                </form>
            </div>
            <style>{modalStyles}</style>
        </div>
    );
}

// Skip Task Modal with priority warning
function SkipTaskModal({ task, onClose, onSkip }) {
    const [reason, setReason] = useState('');
    const [customReason, setCustomReason] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        const finalReason = reason === 'Custom reason' ? customReason : reason;
        if (!finalReason.trim()) return;
        onSkip(finalReason);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Skip Task</h2>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>
                        <XIcon />
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {/* Priority Warning */}
                        {task?.priority === 'high' && (
                            <div className="skip-warning">
                                <span className="warning-icon">⚠️</span>
                                <div>
                                    <strong>High Priority Task</strong>
                                    <p>Skipping high-priority tasks may affect your continuity score</p>
                                </div>
                            </div>
                        )}

                        <p className="text-secondary mb-4">
                            Please provide a reason for skipping. This helps with reflection.
                        </p>

                        <div className="reason-options">
                            {SKIP_REASONS.map(r => (
                                <button
                                    key={r}
                                    type="button"
                                    className={`reason-btn ${reason === r ? 'active' : ''}`}
                                    onClick={() => setReason(r)}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>

                        {reason === 'Custom reason' && (
                            <div className="form-group mt-4">
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="Enter your reason..."
                                    value={customReason}
                                    onChange={e => setCustomReason(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn btn-warning"
                            disabled={!reason || (reason === 'Custom reason' && !customReason.trim())}
                        >
                            Skip Task
                        </button>
                    </div>
                </form>
            </div>
            <style>{modalStyles}</style>
        </div>
    );
}

// Styles
const tasksStyles = `
    .tasks-view {
        max-width: 900px;
        margin: 0 auto;
        padding-bottom: 100px;
    }

    .view-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: var(--spacing-6);
        flex-wrap: wrap;
        gap: var(--spacing-4);
    }

    .view-title {
        font-size: var(--font-size-3xl);
        font-weight: var(--font-weight-bold);
    }

    .view-subtitle {
        margin-top: var(--spacing-1);
    }

    .header-actions {
        display: flex;
        gap: var(--spacing-3);
        align-items: center;
        flex-wrap: wrap;
    }

    .view-toggle {
        display: flex;
        background: var(--color-bg-card);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        overflow: hidden;
    }

    .toggle-btn {
        padding: var(--spacing-2) var(--spacing-3);
        background: transparent;
        border: none;
        color: var(--color-text-muted);
        cursor: pointer;
        transition: all var(--transition-fast);
    }

    .toggle-btn:hover {
        background: var(--color-bg-tertiary);
        color: var(--color-text-primary);
    }

    .toggle-btn.active {
        background: var(--color-accent);
        color: white;
    }

    .toggle-btn svg {
        width: 18px;
        height: 18px;
    }

    .task-progress-container {
        margin-bottom: var(--spacing-6);
    }

    .progress-stats {
        display: flex;
        justify-content: space-between;
        margin-top: var(--spacing-2);
        font-size: var(--font-size-sm);
    }

    .task-filters {
        display: flex;
        gap: var(--spacing-2);
        margin-bottom: var(--spacing-6);
        overflow-x: auto;
        padding-bottom: var(--spacing-2);
    }

    .filter-btn {
        padding: var(--spacing-2) var(--spacing-4);
        background: var(--color-bg-card);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-full);
        color: var(--color-text-secondary);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        white-space: nowrap;
        transition: all var(--transition-fast);
    }

    .filter-btn:hover {
        border-color: var(--color-accent);
        color: var(--color-text-primary);
    }

    .filter-btn.active {
        background: var(--color-accent);
        border-color: var(--color-accent);
        color: white;
    }

    /* Edit mode banner */
    .edit-mode-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--spacing-3) var(--spacing-4);
        background: rgba(20, 184, 166, 0.15);
        border: 1px solid var(--color-accent);
        border-radius: var(--radius-lg);
        margin-bottom: var(--spacing-4);
        font-size: var(--font-size-sm);
        color: var(--color-accent);
    }

    /* Grid container */
    .task-grid-container {
        position: relative;
        min-height: 400px;
    }

    .task-grid-container.edit-mode {
        border: 2px dashed rgba(20, 184, 166, 0.3);
        border-radius: var(--radius-xl);
        padding: var(--spacing-2);
    }

    /* Task tile */
    .task-tile {
        background: linear-gradient(135deg, rgba(30, 60, 114, 0.4) 0%, rgba(42, 82, 152, 0.3) 100%);
        border: 1px solid rgba(100, 150, 255, 0.2);
        border-radius: var(--radius-lg);
        overflow: hidden;
        transition: box-shadow 0.2s, transform 0.1s;
        z-index: 1;
        display: flex;
        flex-direction: column;
    }

    .task-tile:hover {
        border-color: rgba(100, 150, 255, 0.4);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    .task-tile.completed {
        opacity: 0.7;
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, var(--color-bg-card) 100%);
        border-color: var(--color-success);
        position: relative;
    }

    .task-tile.completed::after {
        content: '✓';
        position: absolute;
        top: 8px;
        right: 8px;
        color: var(--color-success);
        font-size: 1rem;
        font-weight: bold;
    }

    .task-tile.completed .tile-title {
        text-decoration: line-through;
        color: var(--color-text-muted);
    }

    .task-tile.editable {
        cursor: grab;
    }

    .task-tile.dragging {
        cursor: grabbing;
        z-index: 100;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
        transform: scale(1.02);
    }

    /* Drag handle */
    .tile-drag-handle {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--spacing-1);
        background: rgba(255, 255, 255, 0.1);
        color: var(--color-text-muted);
    }

    .tile-drag-handle svg {
        width: 16px;
        height: 16px;
    }

    /* Tile content */
    .tile-content {
        flex: 1;
        padding: var(--spacing-3);
        display: flex;
        flex-direction: column;
        gap: var(--spacing-2);
        overflow: hidden;
    }

    .tile-header {
        display: flex;
        align-items: flex-start;
        gap: var(--spacing-2);
    }

    .tile-checkbox {
        width: 20px;
        height: 20px;
        border: 2px solid var(--color-border-light);
        border-radius: var(--radius-sm);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all var(--transition-fast);
    }

    .tile-checkbox:hover {
        border-color: var(--color-success);
        background: var(--color-success-light);
    }

    .tile-checkbox.checked {
        background: var(--color-success);
        border-color: var(--color-success);
    }

    .tile-checkbox.skipped {
        background: var(--color-warning);
        border-color: var(--color-warning);
    }

    .tile-checkbox svg {
        width: 12px;
        height: 12px;
        color: white;
    }

    .tile-title {
        font-weight: var(--font-weight-medium);
        font-size: var(--font-size-sm);
        line-height: 1.3;
        color: #ffffff;
    }

    .tile-description {
        font-size: var(--font-size-xs);
        color: var(--color-text-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .tile-meta {
        display: flex;
        gap: var(--spacing-1);
        flex-wrap: wrap;
        margin-top: auto;
    }

    .tile-meta .badge {
        font-size: 0.65rem;
        padding: 2px 6px;
    }

    .tile-actions {
        display: flex;
        gap: var(--spacing-1);
        margin-top: auto;
        padding-top: var(--spacing-2);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .tile-action-btn {
        padding: var(--spacing-1);
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--radius-sm);
        color: var(--color-text-muted);
        cursor: pointer;
        transition: all var(--transition-fast);
    }

    .tile-action-btn:hover {
        background: var(--color-bg-tertiary);
        border-color: var(--color-border);
        color: var(--color-text-primary);
    }

    .tile-action-btn.danger:hover {
        border-color: var(--color-error);
        color: var(--color-error);
    }

    .tile-action-btn svg {
        width: 14px;
        height: 14px;
    }

    /* Resize handle */
    .tile-resize-handle {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 20px;
        height: 20px;
        cursor: se-resize;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(20, 184, 166, 0.3);
        border-radius: var(--radius-sm) 0 var(--radius-lg) 0;
        color: var(--color-accent);
    }

    .tile-resize-handle svg {
        width: 12px;
        height: 12px;
    }

    /* List view styles */
    .task-list {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-3);
    }

    .task-item {
        display: flex;
        align-items: flex-start;
        gap: var(--spacing-3);
        padding: var(--spacing-4);
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-lg);
        transition: all var(--transition-fast);
    }

    .task-item:hover {
        background: rgba(255, 255, 255, 0.08);
    }

    .task-item.completed {
        opacity: 0.6;
    }

    .task-item.completed .task-title {
        text-decoration: line-through;
    }

    .task-checkbox {
        width: 22px;
        height: 22px;
        border: 2px solid var(--color-border-light);
        border-radius: var(--radius-md);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin-top: 2px;
        transition: all var(--transition-fast);
    }

    .task-checkbox:hover {
        border-color: var(--color-success);
        background: var(--color-success-light);
    }

    .task-checkbox.checked {
        background: var(--color-success);
        border-color: var(--color-success);
    }

    .task-checkbox.skipped {
        background: var(--color-warning);
        border-color: var(--color-warning);
    }

    .task-content {
        flex: 1;
        min-width: 0;
    }

    .task-title {
        font-weight: var(--font-weight-medium);
        margin-bottom: var(--spacing-1);
    }

    .task-description {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        margin-bottom: var(--spacing-2);
    }

    .task-meta {
        display: flex;
        gap: var(--spacing-2);
        flex-wrap: wrap;
    }

    .task-actions {
        display: flex;
        gap: var(--spacing-1);
        opacity: 0;
        transition: opacity var(--transition-fast);
    }

    .task-item:hover .task-actions {
        opacity: 1;
    }

    .task-action-btn {
        padding: var(--spacing-1);
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--radius-sm);
        color: var(--color-text-muted);
        cursor: pointer;
        transition: all var(--transition-fast);
    }

    .task-action-btn:hover {
        background: var(--color-bg-tertiary);
        border-color: var(--color-border);
        color: var(--color-text-primary);
    }

    .task-action-btn.danger:hover {
        border-color: var(--color-error);
        color: var(--color-error);
    }

    .empty-state {
        text-align: center;
        padding: var(--spacing-12);
        background: var(--color-bg-card);
        border: 1px dashed var(--color-border);
        border-radius: var(--radius-xl);
    }

    .empty-icon {
        font-size: 3rem;
        margin-bottom: var(--spacing-4);
    }
`;

const modalStyles = `
    .form-group {
        margin-bottom: var(--spacing-4);
    }
    .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--spacing-4);
    }
    @media (max-width: 500px) {
        .form-row {
            grid-template-columns: 1fr;
        }
    }
    textarea.input {
        resize: vertical;
        min-height: 60px;
    }
    select.input {
        cursor: pointer;
    }

    /* Block selector */
    .block-selector {
        display: flex;
        flex-wrap: wrap;
        gap: var(--spacing-2);
    }

    .block-option {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--spacing-1);
        padding: var(--spacing-3);
        background: var(--color-bg-tertiary);
        border: 2px solid var(--color-border);
        border-radius: var(--radius-lg);
        cursor: pointer;
        transition: all var(--transition-fast);
        min-width: 70px;
    }

    .block-option:hover {
        border-color: var(--block-color, var(--color-accent));
    }

    .block-option.selected {
        background: linear-gradient(135deg, var(--block-color, var(--color-accent)) 0%, transparent 100%);
        border-color: var(--block-color, var(--color-accent));
    }

    .block-option-icon {
        font-size: 1.5rem;
    }

    .block-option-text {
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .block-option-label {
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-medium);
        color: #ffffff;
    }

    .block-option-time {
        font-size: 10px;
        color: var(--color-text-muted);
        margin-top: 2px;
    }

    /* Reason buttons */
    .reason-options {
        display: flex;
        flex-wrap: wrap;
        gap: var(--spacing-2);
    }
    .reason-btn {
        padding: var(--spacing-2) var(--spacing-4);
        background: var(--color-bg-tertiary);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-full);
        color: var(--color-text-secondary);
        font-size: var(--font-size-sm);
        cursor: pointer;
        transition: all var(--transition-fast);
    }
    .reason-btn:hover {
        border-color: var(--color-accent);
        color: var(--color-text-primary);
    }
    .reason-btn.active {
        background: var(--color-accent);
        border-color: var(--color-accent);
        color: white;
    }

    /* Skip warning */
    .skip-warning {
        display: flex;
        gap: var(--spacing-3);
        padding: var(--spacing-4);
        background: rgba(251, 191, 36, 0.15);
        border: 1px solid var(--color-warning);
        border-radius: var(--radius-lg);
        margin-bottom: var(--spacing-4);
    }

    .skip-warning .warning-icon {
        font-size: 1.5rem;
    }

    .skip-warning p {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        margin-top: var(--spacing-1);
    }

    /* Recurring Task Options */
    .recurring-options {
        display: flex;
        gap: var(--spacing-2);
    }

    .recurring-btn {
        flex: 1;
        padding: var(--spacing-2) var(--spacing-3);
        background: var(--color-bg-tertiary);
        border: 2px solid var(--color-border);
        border-radius: var(--radius-lg);
        color: var(--color-text-secondary);
        font-size: var(--font-size-sm);
        cursor: pointer;
        transition: all var(--transition-fast);
    }

    .recurring-btn:hover {
        border-color: var(--color-accent);
        background: var(--color-bg-card-hover);
    }

    .recurring-btn.active {
        background: var(--color-accent-light);
        border-color: var(--color-accent);
        color: var(--color-accent);
    }

    /* Day Picker */
    .day-picker {
        display: flex;
        gap: var(--spacing-2);
        flex-wrap: wrap;
    }

    .day-btn {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--color-bg-tertiary);
        border: 2px solid var(--color-border);
        color: var(--color-text-secondary);
        font-size: var(--font-size-xs);
        cursor: pointer;
        transition: all var(--transition-fast);
    }

    .day-btn:hover {
        border-color: var(--color-accent);
    }

    .day-btn.active {
        background: var(--color-accent);
        border-color: var(--color-accent);
        color: white;
    }
`;

// Icons
function PlusIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
    );
}

function GridIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
        </svg>
    );
}

function ListIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
    );
}

function XIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
    );
}

function SkipIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 4 15 12 5 20 5 4"></polygon>
            <line x1="19" y1="5" x2="19" y2="19"></line>
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
    );
}

function DragIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="5" r="1"></circle>
            <circle cx="9" cy="12" r="1"></circle>
            <circle cx="9" cy="19" r="1"></circle>
            <circle cx="15" cy="5" r="1"></circle>
            <circle cx="15" cy="12" r="1"></circle>
            <circle cx="15" cy="19" r="1"></circle>
        </svg>
    );
}

function ResizeIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
    );
}
