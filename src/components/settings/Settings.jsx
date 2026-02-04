/**
 * Settings - App configuration with draggable/resizable widget tiles
 * Widget-based layout inspired by iOS weather app design
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store/appStore';
import { ACTION_LABELS, ACTION_ICONS, formatActionTime, canUndo, clearActionHistory } from '../../db/actionHistory';

// Default widget layout configuration (for 10-column grid)
const DEFAULT_LAYOUT = [
    { id: 'actions', title: '🔄 Recent Actions', x: 0, y: 0, w: 4, h: 3, minW: 2, minH: 2 },
    { id: 'nutrition', title: '🥗 Nutrition Goals', x: 4, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
    { id: 'training', title: '🏋️ Training Setup', x: 7, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
    { id: 'dayBoundary', title: '🌅 Day Boundary', x: 0, y: 3, w: 3, h: 2, minW: 2, minH: 2 },
    { id: 'notifications', title: '🔔 Notifications', x: 3, y: 3, w: 3, h: 2, minW: 2, minH: 2 },
    { id: 'data', title: '💾 Data Management', x: 6, y: 3, w: 2, h: 2, minW: 2, minH: 2 },
    { id: 'day', title: '📅 Day Management', x: 8, y: 3, w: 2, h: 2, minW: 2, minH: 2 },
    { id: 'about', title: '📱 About', x: 0, y: 5, w: 2, h: 2, minW: 2, minH: 2 },
    { id: 'install', title: '📲 Install App', x: 2, y: 5, w: 3, h: 2, minW: 2, minH: 2 },
];

const GRID_COLS = 10;
const CELL_SIZE = 100;
const GAP = 10;

export default function Settings() {
    const {
        settings,
        updateSettings,
        exportData,
        importData,
        closeCurrentDay,
        showToast,
        actionHistory,
        refreshActionHistory,
        undoLastAction,
    } = useAppStore();

    const [layout, setLayout] = useState(() => {
        const saved = localStorage.getItem('continuum_settings_layout');
        return saved ? JSON.parse(saved) : DEFAULT_LAYOUT;
    });
    const [hiddenWidgets, setHiddenWidgets] = useState(() => {
        const saved = localStorage.getItem('continuum_hidden_widgets');
        return saved ? JSON.parse(saved) : [];
    });
    const [editMode, setEditMode] = useState(false);
    const [dragging, setDragging] = useState(null);
    const [resizing, setResizing] = useState(null);
    const [proteinTarget, setProteinTarget] = useState(settings.proteinTarget);
    const [calorieTarget, setCalorieTarget] = useState(settings.calorieTarget);
    const [equipment, setEquipment] = useState(settings.primaryEquipment || 'gym');
    const [dayBoundaryHour, setDayBoundaryHour] = useState(settings.dayBoundaryHour || 4);
    const [notificationsEnabled, setNotificationsEnabled] = useState(settings.notificationsEnabled || false);
    const containerRef = useRef(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        refreshActionHistory();
    }, [refreshActionHistory]);

    // Save layout to localStorage
    const saveLayout = useCallback((newLayout) => {
        setLayout(newLayout);
        localStorage.setItem('continuum_settings_layout', JSON.stringify(newLayout));
    }, []);

    // Reset layout to default
    const resetLayout = () => {
        saveLayout(DEFAULT_LAYOUT);
        setHiddenWidgets([]);
        localStorage.removeItem('continuum_hidden_widgets');
        showToast('Layout reset to default', 'success');
    };

    // Hide/delete a widget
    const hideWidget = (widgetId) => {
        const newHidden = [...hiddenWidgets, widgetId];
        setHiddenWidgets(newHidden);
        localStorage.setItem('continuum_hidden_widgets', JSON.stringify(newHidden));
        showToast('Widget hidden', 'info');
    };

    // Restore all hidden widgets
    const restoreAllWidgets = () => {
        setHiddenWidgets([]);
        localStorage.removeItem('continuum_hidden_widgets');
        showToast('All widgets restored', 'success');
    };

    // Handle drag start
    const handleDragStart = (e, widgetId) => {
        if (!editMode) return;
        e.stopPropagation();
        const widget = layout.find(w => w.id === widgetId);
        const rect = e.currentTarget.getBoundingClientRect();
        setDragging({
            id: widgetId,
            startX: e.clientX,
            startY: e.clientY,
            origX: widget.x,
            origY: widget.y,
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

        const widget = layout.find(w => w.id === dragging.id);
        const clampedX = Math.max(0, Math.min(GRID_COLS - widget.w, newX));
        const clampedY = Math.max(0, newY);

        if (clampedX !== widget.x || clampedY !== widget.y) {
            const newLayout = layout.map(w =>
                w.id === dragging.id ? { ...w, x: clampedX, y: clampedY } : w
            );
            saveLayout(newLayout);
        }
    }, [dragging, layout, saveLayout]);

    // Handle resize
    const handleResize = useCallback((e) => {
        if (!resizing || !containerRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const cellWidth = CELL_SIZE + GAP;
        const cellHeight = CELL_SIZE + GAP;

        const widget = layout.find(w => w.id === resizing.id);
        const widgetLeft = widget.x * cellWidth;
        const widgetTop = widget.y * cellHeight;

        const newW = Math.max(widget.minW, Math.round((e.clientX - containerRect.left - widgetLeft + GAP) / cellWidth));
        const newH = Math.max(widget.minH, Math.round((e.clientY - containerRect.top - widgetTop + GAP) / cellHeight));

        const clampedW = Math.min(GRID_COLS - widget.x, newW);

        if (clampedW !== widget.w || newH !== widget.h) {
            const newLayout = layout.map(w =>
                w.id === resizing.id ? { ...w, w: clampedW, h: newH } : w
            );
            saveLayout(newLayout);
        }
    }, [resizing, layout, saveLayout]);

    // Mouse move handler
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

    // Handle resize start
    const handleResizeStart = (e, widgetId) => {
        if (!editMode) return;
        e.stopPropagation();
        setResizing({ id: widgetId });
    };

    const handleSaveGoals = () => {
        updateSettings({
            proteinTarget: parseInt(proteinTarget) || 130,
            calorieTarget: parseInt(calorieTarget) || 2000,
            primaryEquipment: equipment,
        });
        showToast('Settings updated!', 'success');
    };

    const handleExport = async () => {
        await exportData();
        showToast('Data exported successfully!', 'success');
    };

    const handleImport = async (e) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                await importData(file);
                showToast('Data imported successfully!', 'success');
            } catch (error) {
                showToast('Failed to import data', 'error');
            }
        }
    };

    const handleCloseDay = async () => {
        if (confirm('Are you sure you want to close today? This action cannot be undone.')) {
            await closeCurrentDay();
            showToast('Day closed successfully!', 'success');
        }
    };

    const handleUndo = async (actionId) => {
        await undoLastAction(actionId);
    };

    const handleClearHistory = () => {
        if (confirm('Clear all action history?')) {
            clearActionHistory();
            refreshActionHistory();
            showToast('Action history cleared', 'success');
        }
    };

    // Render widget content by ID
    const renderWidgetContent = (widget) => {
        switch (widget.id) {
            case 'actions':
                return (
                    <div className="widget-scroll">
                        {actionHistory && actionHistory.length > 0 ? (
                            <div className="action-list">
                                {actionHistory.slice(0, 10).map((action) => (
                                    <div key={action.id} className={`action-item ${canUndo(action) ? 'undoable' : ''}`}>
                                        <span className="action-icon">{ACTION_ICONS[action.type] || '•'}</span>
                                        <div className="action-info">
                                            <span className="action-desc">{action.description}</span>
                                            <span className="action-time">{formatActionTime(action.timestamp)}</span>
                                        </div>
                                        {canUndo(action) && (
                                            <button className="undo-btn" onClick={() => handleUndo(action.id)}>↩️</button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted text-center">No recent actions</p>
                        )}
                        {actionHistory?.length > 0 && (
                            <button className="btn btn-ghost btn-sm mt-2" onClick={handleClearHistory}>Clear History</button>
                        )}
                    </div>
                );

            case 'nutrition':
                return (
                    <div className="widget-form">
                        <div className="form-group">
                            <label>Protein (g)</label>
                            <input
                                type="number"
                                className="input input-sm"
                                value={proteinTarget}
                                onChange={e => setProteinTarget(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label>Calories</label>
                            <input
                                type="number"
                                className="input input-sm"
                                value={calorieTarget}
                                onChange={e => setCalorieTarget(e.target.value)}
                            />
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={handleSaveGoals}>Save</button>
                    </div>
                );

            case 'training':
                return (
                    <div className="widget-form">
                        <div className="form-group">
                            <label>Primary Equipment</label>
                            <select
                                className="input input-sm"
                                value={equipment}
                                onChange={e => setEquipment(e.target.value)}
                            >
                                <option value="gym">Full Gym Access</option>
                                <option value="home">Home Equipment</option>
                                <option value="minimal">Bodyweight Only</option>
                            </select>
                            <p className="text-secondary text-xs mt-1">
                                Used for workout suggestions
                            </p>
                        </div>
                        <button className="btn btn-primary btn-sm mt-auto" onClick={handleSaveGoals}>Save</button>
                    </div>
                );

            case 'data':
                return (
                    <div className="widget-buttons">
                        <button className="btn btn-secondary btn-sm" onClick={handleExport}>
                            📤 Export
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
                            📥 Import
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            style={{ display: 'none' }}
                            onChange={handleImport}
                        />
                    </div>
                );

            case 'day':
                return (
                    <div className="widget-content-centered day-widget">
                        <p className="text-sm mb-3">Mark today as complete and finalize all entries</p>
                        <button className="btn btn-lg close-today-btn" onClick={handleCloseDay}>
                            🔒 Close Today
                        </button>
                    </div>
                );

            case 'about':
                return (
                    <div className="widget-info">
                        <p><strong>Continuum</strong> v1.0.0</p>
                        <p className="text-sm text-muted">Local-first tracking</p>
                        <p className="text-sm text-muted mt-1">💾 IndexedDB • 📱 PWA</p>
                    </div>
                );

            case 'install':
                return (
                    <div className="widget-content-centered">
                        <p className="text-sm text-muted">Add to home screen for the best experience</p>
                    </div>
                );

            case 'dayBoundary':
                return (
                    <div className="widget-form">
                        <div className="form-group">
                            <label>Day Starts At</label>
                            <select
                                className="input input-sm"
                                value={dayBoundaryHour}
                                onChange={e => setDayBoundaryHour(parseInt(e.target.value))}
                            >
                                <option value={0}>12:00 AM (Midnight)</option>
                                <option value={1}>1:00 AM</option>
                                <option value={2}>2:00 AM</option>
                                <option value={3}>3:00 AM</option>
                                <option value={4}>4:00 AM (Default)</option>
                                <option value={5}>5:00 AM</option>
                                <option value={6}>6:00 AM</option>
                            </select>
                            <p className="text-secondary text-xs mt-1">
                                When the day "rolls over"
                            </p>
                        </div>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                                updateSettings({ dayBoundaryHour });
                                showToast('Day boundary updated!', 'success');
                            }}
                        >
                            Save
                        </button>
                    </div>
                );

            case 'notifications':
                return (
                    <div className="widget-form">
                        <div className="form-group">
                            <label className="toggle-label">
                                <span>Enable Notifications</span>
                                <input
                                    type="checkbox"
                                    checked={notificationsEnabled}
                                    onChange={async (e) => {
                                        const enabled = e.target.checked;
                                        if (enabled && 'Notification' in window) {
                                            const permission = await Notification.requestPermission();
                                            if (permission === 'granted') {
                                                setNotificationsEnabled(true);
                                                updateSettings({ notificationsEnabled: true });
                                                showToast('Notifications enabled!', 'success');
                                            } else {
                                                showToast('Permission denied', 'warning');
                                            }
                                        } else {
                                            setNotificationsEnabled(false);
                                            updateSettings({ notificationsEnabled: false });
                                        }
                                    }}
                                />
                            </label>
                        </div>
                        <p className="text-secondary text-xs">
                            Get reminders for meals, workouts, and day review
                        </p>
                    </div>
                );

            default:
                return <div className="text-muted">Unknown widget</div>;
        }
    };

    // Calculate grid dimensions
    const maxY = Math.max(...layout.map(w => w.y + w.h));
    const gridHeight = (maxY + 1) * (CELL_SIZE + GAP);

    return (
        <div className="settings-view animate-fade-in">
            <header className="view-header">
                <h1 className="view-title">Settings</h1>
                <div className="header-actions">
                    <button
                        className={`btn btn-sm ${editMode ? 'btn-accent' : 'btn-ghost'}`}
                        onClick={() => setEditMode(!editMode)}
                    >
                        {editMode ? '✓ Done' : '✏️ Edit Layout'}
                    </button>
                    {editMode && (
                        <button className="btn btn-ghost btn-sm" onClick={resetLayout}>
                            ↺ Reset
                        </button>
                    )}
                    {hiddenWidgets.length > 0 && (
                        <button className="btn btn-secondary btn-sm" onClick={restoreAllWidgets}>
                            + Restore ({hiddenWidgets.length})
                        </button>
                    )}
                </div>
            </header>

            {editMode && (
                <div className="edit-hint">
                    <span>🎛️ Drag widgets to move • Drag corners to resize</span>
                </div>
            )}

            <div
                ref={containerRef}
                className={`widget-grid ${editMode ? 'edit-mode' : ''}`}
                style={{ height: gridHeight, minHeight: '600px' }}
            >
                {layout.filter(w => !hiddenWidgets.includes(w.id)).map((widget) => (
                    <div
                        key={widget.id}
                        className={`widget-tile ${editMode ? 'editable' : ''} ${dragging?.id === widget.id ? 'dragging' : ''}`}
                        style={{
                            left: widget.x * (CELL_SIZE + GAP),
                            top: widget.y * (CELL_SIZE + GAP),
                            width: widget.w * CELL_SIZE + (widget.w - 1) * GAP,
                            height: widget.h * CELL_SIZE + (widget.h - 1) * GAP,
                        }}
                        onMouseDown={(e) => handleDragStart(e, widget.id)}
                    >
                        <div className="widget-header">
                            <span className="widget-title">{widget.title}</span>
                            {editMode && (
                                <div className="widget-header-actions">
                                    <button
                                        className="widget-delete-btn"
                                        onClick={(e) => { e.stopPropagation(); hideWidget(widget.id); }}
                                        title="Hide widget"
                                    >
                                        ×
                                    </button>
                                    <span className="drag-handle">⋮⋮</span>
                                </div>
                            )}
                        </div>
                        <div className="widget-body">
                            {renderWidgetContent(widget)}
                        </div>
                        {editMode && (
                            <div
                                className="resize-handle"
                                onMouseDown={(e) => handleResizeStart(e, widget.id)}
                            />
                        )}
                    </div>
                ))}
            </div>

            <style>{settingsStyles}</style>
        </div>
    );
}

const settingsStyles = `
    .settings-view {
        max-width: 900px;
        margin: 0 auto;
        padding-bottom: 100px;
    }

    .view-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--spacing-4);
    }

    .view-title {
        font-size: var(--font-size-3xl);
        font-weight: var(--font-weight-bold);
    }

    .header-actions {
        display: flex;
        gap: var(--spacing-2);
    }

    .btn-accent {
        background: var(--color-accent);
        color: white;
    }

    .edit-hint {
        background: rgba(var(--color-accent-rgb), 0.15);
        border: 1px solid var(--color-accent);
        border-radius: var(--radius-lg);
        padding: var(--spacing-3);
        margin-bottom: var(--spacing-4);
        text-align: center;
        font-size: var(--font-size-sm);
    }

    .widget-grid {
        position: relative;
        width: 100%;
    }

    .widget-grid.edit-mode {
        background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
        background-size: ${CELL_SIZE + GAP}px ${CELL_SIZE + GAP}px;
        border-radius: var(--radius-xl);
    }

    .widget-tile {
        position: absolute;
        background: linear-gradient(135deg, rgba(30, 60, 114, 0.4) 0%, rgba(42, 82, 152, 0.3) 100%);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(100, 150, 255, 0.25);
        border-radius: var(--radius-xl);
        overflow: hidden;
        transition: transform 0.1s, box-shadow 0.2s, background 0.3s;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 20px rgba(0, 30, 80, 0.3);
    }

    .widget-tile:hover {
        background: linear-gradient(135deg, rgba(40, 80, 140, 0.5) 0%, rgba(52, 102, 180, 0.4) 100%);
        border-color: rgba(120, 170, 255, 0.4);
    }

    .widget-tile.editable {
        cursor: grab;
        border-style: dashed;
        border-color: var(--color-accent);
    }

    .widget-tile.editable:hover {
        box-shadow: 0 0 20px rgba(var(--color-accent-rgb), 0.3);
    }

    .widget-tile.dragging {
        cursor: grabbing;
        opacity: 0.9;
        z-index: 100;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
    }

    .widget-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--spacing-3) var(--spacing-4);
        border-bottom: 1px solid rgba(100, 150, 255, 0.15);
        background: rgba(20, 50, 100, 0.3);
    }

    .widget-title {
        font-weight: var(--font-weight-semibold);
        font-size: var(--font-size-sm);
    }

    .drag-handle {
        color: var(--color-text-muted);
        transform: rotate(90deg);
        font-size: 1.2rem;
        letter-spacing: -3px;
    }

    .widget-body {
        flex: 1;
        padding: var(--spacing-4);
        overflow: auto;
    }

    .resize-handle {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 20px;
        height: 20px;
        cursor: nwse-resize;
        background: linear-gradient(135deg, transparent 50%, var(--color-accent) 50%);
        border-radius: 0 0 var(--radius-xl) 0;
    }

    /* Widget content styles */
    .widget-scroll {
        max-height: 100%;
        overflow-y: auto;
    }

    .action-list {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-2);
    }

    .action-item {
        display: flex;
        align-items: center;
        gap: var(--spacing-2);
        padding: var(--spacing-2);
        background: rgba(255, 255, 255, 0.05);
        border-radius: var(--radius-md);
        font-size: var(--font-size-sm);
    }

    .action-item.undoable {
        border-left: 2px solid var(--color-accent);
    }

    .action-icon {
        font-size: 1rem;
    }

    .action-info {
        flex: 1;
        min-width: 0;
    }

    .action-desc {
        display: block;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .action-time {
        font-size: 0.7rem;
        color: var(--color-text-muted);
    }

    .undo-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: var(--spacing-1);
        border-radius: var(--radius-sm);
        transition: background 0.2s;
    }

    .undo-btn:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .widget-form {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-3);
    }

    .form-group {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-1);
    }

    .form-group label {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
    }

    .input-sm {
        padding: var(--spacing-2);
        font-size: var(--font-size-sm);
    }

    .btn-sm {
        padding: var(--spacing-2) var(--spacing-3);
        font-size: var(--font-size-sm);
    }

    .widget-buttons {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-2);
    }

    .widget-content-centered {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        text-align: center;
    }

    .widget-info {
        text-align: center;
    }

    /* Widget delete button */
    .widget-header-actions {
        display: flex;
        align-items: center;
        gap: var(--spacing-2);
    }

    .widget-delete-btn {
        background: transparent;
        border: none;
        color: var(--color-text-muted);
        font-size: 1.2rem;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: var(--radius-sm);
        transition: all 0.2s;
    }

    .widget-delete-btn:hover {
        background: rgba(239, 68, 68, 0.2);
        color: var(--color-error);
    }

    /* Prominent Close Today button */
    .day-widget {
        background: rgba(245, 158, 11, 0.1);
        border-radius: var(--radius-lg);
        padding: var(--spacing-4);
    }

    .close-today-btn {
        background: linear-gradient(135deg, var(--color-warning) 0%, #d97706 100%);
        color: white;
        border: none;
        font-weight: var(--font-weight-semibold);
        padding: var(--spacing-3) var(--spacing-5);
        font-size: var(--font-size-md);
        box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
        transition: all 0.2s;
    }

    .close-today-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
    }

    .btn-lg {
        padding: var(--spacing-3) var(--spacing-5);
        font-size: var(--font-size-md);
    }

    @media (max-width: 768px) {
        .widget-grid {
            display: flex !important;
            flex-direction: column !important;
            height: auto !important;
            gap: var(--spacing-4);
        }

        .widget-tile {
            position: relative !important;
            left: auto !important;
            top: auto !important;
            width: 100% !important;
            height: auto !important;
            min-height: 150px;
        }

        .edit-hint {
            display: none;
        }

        .header-actions .btn:first-child {
            display: none;
        }
    }
`;
