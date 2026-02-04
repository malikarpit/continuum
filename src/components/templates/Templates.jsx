/**
 * Templates - Manage predefined day templates and time blocks
 * Allows editing default tasks for each time block
 */

import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import {
    getAllTemplates,
    getTemplate,
    saveTemplate,
    deleteTemplate,
    createTemplate,
    DEFAULT_TIME_BLOCKS,
    HOLIDAY_TEMPLATE,

    DAYS_OF_WEEK,
} from '../../db/templateStore';
import { recordAction, ACTION_TYPES } from '../../db/actionHistory';

// Common emoji list for block icons
const BLOCK_EMOJIS = [
    '🌅', '☀️', '🌤️', '🌙', '🌟', '⭐', '💼', '💻', '📖', '🎯',
    '🏋️', '🏃', '🚴', '🧘', '🏖️', '🍵', '☕', '🍕', '🥗', '🍽️',
    '😴', '💤', '🛌', '🎵', '🎨', '✈️', '🚗', '🏠', '🏫', '🏪',
    '📝', '✅', '📅', '⏰', '📧', '📱', '🌿', '🌸', '❤️', '🔥',
    '🎉', '🎊', '🎁', '🎈', '🎂', '🥳', '🎃', '👻', '🤖', '👾',
];

export default function Templates() {
    const { showToast, refreshActionHistory } = useAppStore();

    const [templates, setTemplates] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [editingBlock, setEditingBlock] = useState(null);
    const [showAddTaskModal, setShowAddTaskModal] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(null); // blockId or null
    const [newTask, setNewTask] = useState({ title: '', category: 'personal', priority: 'medium' });
    const [loading, setLoading] = useState(true);



    async function loadTemplates() {
        setLoading(true);
        try {
            const allTemplates = await getAllTemplates();
            setTemplates(allTemplates);

            // Select default template
            const defaultTemplate = allTemplates.find(t => t.isDefault);
            if (defaultTemplate) {
                setSelectedTemplate(defaultTemplate);
            }
        } catch (error) {
            console.error('Error loading templates:', error);
            showToast('Failed to load templates', 'error');
        }
        setLoading(false);
    }

    // Load templates
    useEffect(() => {
        loadTemplates();
    }, []);

    // Save changes to template
    const handleSaveTemplate = async () => {
        if (!selectedTemplate) return;

        try {
            // Get the original state before saving
            const originalTemplate = await getTemplate(selectedTemplate.id);

            await saveTemplate(selectedTemplate);

            // Record action with previous state for undo
            recordAction(
                ACTION_TYPES.TEMPLATE_SAVED,
                `Saved template "${selectedTemplate.name}"`,
                { template: originalTemplate },
                { templateId: selectedTemplate.id, templateName: selectedTemplate.name }
            );
            refreshActionHistory();

            showToast('Template saved!', 'success');
            loadTemplates();
        } catch (error) {
            showToast('Failed to save template', 'error');
        }
    };

    // Update time block
    const updateTimeBlock = (blockId, updates) => {
        if (!selectedTemplate) return;

        const updatedBlocks = selectedTemplate.timeBlocks.map(block =>
            block.id === blockId ? { ...block, ...updates } : block
        );

        setSelectedTemplate({
            ...selectedTemplate,
            timeBlocks: updatedBlocks,
        });
    };

    // Add task to block
    const handleAddTask = () => {
        if (!editingBlock || !newTask.title.trim()) return;

        const block = selectedTemplate.timeBlocks.find(b => b.id === editingBlock);
        if (!block) return;

        const taskIndex = (block.defaultTasks || []).length;
        const updatedTasks = [...(block.defaultTasks || []), { ...newTask }];
        updateTimeBlock(editingBlock, { defaultTasks: updatedTasks });

        // Record action for undo
        recordAction(
            ACTION_TYPES.TEMPLATE_TASK_ADDED,
            `Added task "${newTask.title}" to ${block.name}`,
            null, // No previous state needed for add operations
            { templateId: selectedTemplate.id, blockId: editingBlock, taskIndex, taskTitle: newTask.title }
        );
        refreshActionHistory();

        setNewTask({ title: '', category: 'personal', priority: 'medium' });
        setShowAddTaskModal(false);
        showToast('Task added to block', 'success');
    };

    // Remove task from block
    const handleRemoveTask = (blockId, taskIndex) => {
        const block = selectedTemplate.timeBlocks.find(b => b.id === blockId);
        if (!block) return;

        const removedTask = block.defaultTasks[taskIndex];
        const updatedTasks = block.defaultTasks.filter((_, i) => i !== taskIndex);
        updateTimeBlock(blockId, { defaultTasks: updatedTasks });

        // Record action for undo
        recordAction(
            ACTION_TYPES.TEMPLATE_TASK_DELETED,
            `Removed task "${removedTask.title}" from ${block.name}`,
            { task: removedTask, taskIndex },
            { templateId: selectedTemplate.id, blockId, taskTitle: removedTask.title }
        );
        refreshActionHistory();
    };

    // Update block time
    const handleUpdateBlockTime = (blockId, field, value) => {
        updateTimeBlock(blockId, { [field]: value });
    };

    // --- Modals State ---
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createModalName, setCreateModalName] = useState('');

    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null); // { type: 'delete_template' | 'delete_block' | 'reset', data: any }
    const [confirmMessage, setConfirmMessage] = useState('');

    // --- Action Handlers Replaced with Modals ---

    // Open Create Modal
    const handleCreateTemplateClick = () => {
        setCreateModalName('');
        setShowCreateModal(true);
    };

    // Confirm Create
    const handleConfirmCreate = async () => {
        if (!createModalName.trim()) return;

        try {
            const newTemplate = await createTemplate({
                name: createModalName.trim(),
                isDefault: false,
                isHoliday: false,
                timeBlocks: structuredClone(DEFAULT_TIME_BLOCKS),
            });
            await saveTemplate(newTemplate);

            recordAction(
                ACTION_TYPES.TEMPLATE_CREATED,
                `Created template "${newTemplate.name}"`,
                null,
                { templateId: newTemplate.id, templateName: newTemplate.name }
            );
            refreshActionHistory();

            setTemplates([...templates, newTemplate]);
            setSelectedTemplate(newTemplate);
            showToast('New template created', 'success');
            setShowCreateModal(false);
        } catch (error) {
            console.error(error);
            showToast('Failed to create template', 'error');
        }
    };

    // Delete Template Click
    const handleDeleteTemplateClick = () => {
        if (!selectedTemplate) return;
        setConfirmMessage(`Are you sure you want to delete template "${selectedTemplate.name}"?`);
        setConfirmAction({ type: 'delete_template' });
        setShowConfirmModal(true);
    };

    // Delete Block Click
    const handleDeleteBlockClick = (blockId) => {
        setConfirmMessage('Delete this time block?');
        setConfirmAction({ type: 'delete_block', data: blockId });
        setShowConfirmModal(true);
    };

    // Reset Defaults Click
    const handleResetDefaultsClick = () => {
        setConfirmMessage('Reset template to default values? This will clear all your customizations.');
        setConfirmAction({ type: 'reset' });
        setShowConfirmModal(true);
    };

    // Confirm Action Execution
    const executeConfirmAction = async () => {
        if (!confirmAction) return;

        switch (confirmAction.type) {
            case 'delete_template':
                await handleDeleteTemplate();
                break;
            case 'delete_block':
                handleDeleteBlock(confirmAction.data);
                break;
            case 'reset':
                handleResetDefaults();
                break;
        }
        setShowConfirmModal(false);
        setConfirmAction(null);
    };

    // Function implementations (modified to remove prompts/confirms)
    const handleResetDefaults = () => {
        if (selectedTemplate.isHoliday) {
            setSelectedTemplate({
                ...selectedTemplate,
                ...HOLIDAY_TEMPLATE,
                id: selectedTemplate.id
            });
        } else {
            setSelectedTemplate({
                ...selectedTemplate,
                timeBlocks: structuredClone(DEFAULT_TIME_BLOCKS),
            });
        }
        showToast('Reset to defaults', 'info');
    };

    // Add Block
    const handleAddBlock = () => {
        if (!selectedTemplate) return;

        const newBlock = {
            id: `block_${Date.now()}`,
            name: 'New Block',
            startTime: '12:00',
            endTime: '13:00',
            color: '#94a3b8',
            icon: '📝',
            defaultTasks: []
        };

        const updatedBlocks = [...selectedTemplate.timeBlocks, newBlock]
            .sort((a, b) => a.startTime.localeCompare(b.startTime));

        setSelectedTemplate({
            ...selectedTemplate,
            timeBlocks: updatedBlocks
        });

        recordAction(
            ACTION_TYPES.TEMPLATE_BLOCK_ADDED,
            `Added time block "${newBlock.name}"`,
            null,
            { templateId: selectedTemplate.id, blockId: newBlock.id }
        );
        refreshActionHistory();
    };

    const handleDeleteTemplate = async () => {
        try {
            const templateToDelete = await getTemplate(selectedTemplate.id);
            await deleteTemplate(selectedTemplate.id);

            recordAction(
                ACTION_TYPES.TEMPLATE_DELETED,
                `Deleted template "${selectedTemplate.name}"`,
                { template: templateToDelete },
                { templateId: selectedTemplate.id, templateName: selectedTemplate.name }
            );
            refreshActionHistory();

            const remaining = templates.filter(t => t.id !== selectedTemplate.id);
            setTemplates(remaining);
            setSelectedTemplate(remaining[0] || null);
            showToast('Template deleted', 'success');
        } catch (error) {
            showToast('Failed to delete template', 'error');
        }
    };

    const handleDeleteBlock = (blockId) => {
        const blockIndex = selectedTemplate.timeBlocks.findIndex(b => b.id === blockId);
        const blockToDelete = selectedTemplate.timeBlocks[blockIndex];

        const updatedBlocks = selectedTemplate.timeBlocks.filter(b => b.id !== blockId);
        setSelectedTemplate({
            ...selectedTemplate,
            timeBlocks: updatedBlocks
        });

        recordAction(
            ACTION_TYPES.TEMPLATE_BLOCK_DELETED,
            `Deleted time block "${blockToDelete.name}"`,
            { block: blockToDelete, blockIndex },
            { templateId: selectedTemplate.id, blockId, blockName: blockToDelete.name }
        );
        refreshActionHistory();
    };

    // --- Holiday Mode Editing ---
    const updateHolidayPriority = (index, field, value) => {
        const updatedPriorities = [...(selectedTemplate.priorities || [])];
        updatedPriorities[index] = { ...updatedPriorities[index], [field]: value };
        setSelectedTemplate({ ...selectedTemplate, priorities: updatedPriorities });
    };

    const addHolidayPriority = () => {
        const newPriority = {
            id: `p-${Date.now()}`,
            title: 'New Priority',
            description: 'Description...',
            required: false
        };
        setSelectedTemplate({
            ...selectedTemplate,
            priorities: [...(selectedTemplate.priorities || []), newPriority]
        });
    };

    const deleteHolidayPriority = (index) => {
        const updatedPriorities = selectedTemplate.priorities.filter((_, i) => i !== index);
        setSelectedTemplate({ ...selectedTemplate, priorities: updatedPriorities });
    };

    if (loading) {
        return (
            <div className="templates-view animate-fade-in">
                <div className="loading-state">Loading templates...</div>
            </div>
        );
    }

    return (
        <div className="templates-view animate-fade-in">
            <header className="view-header">
                <div>
                    <h1 className="view-title">Day Templates</h1>
                    <p className="view-subtitle text-secondary">
                        Configure default tasks for each time block
                    </p>
                </div>
            </header>

            {/* Template Selector */}
            <div className="template-selector-container">
                <div className="template-selector">
                    {templates.map(template => (
                        <button
                            key={template.id}
                            className={`template-btn ${selectedTemplate?.id === template.id ? 'active' : ''} ${template.isHoliday ? 'holiday' : ''}`}
                            onClick={() => setSelectedTemplate(template)}
                        >
                            <span className="template-icon">{template.isHoliday ? '🏖️' : '📅'}</span>
                            <div className="template-btn-content">
                                <span className="template-name">{template.name}</span>
                                {template.isDefault && <span className="default-badge">Default</span>}
                                {template.dayOfWeek !== null && template.dayOfWeek !== undefined && (
                                    <span className="day-badge">{DAYS_OF_WEEK[template.dayOfWeek]?.short}</span>
                                )}
                            </div>
                        </button>
                    ))}
                    <button className="template-btn create-new" onClick={handleCreateTemplateClick}>
                        <span className="template-icon">➕</span>
                        <span className="template-name">New Template</span>
                    </button>
                </div>
            </div>

            {/* Template Header Actions */}
            {selectedTemplate && (
                <div className="editor-header-actions">
                    {!selectedTemplate.isDefault && !selectedTemplate.isHoliday && (
                        <button className="btn btn-ghost text-error btn-sm" onClick={handleDeleteTemplateClick}>
                            <span className="icon">🗑️</span> Delete Template
                        </button>
                    )}
                </div>
            )}

            {/* Template Editor */}
            {selectedTemplate && !selectedTemplate.isHoliday && (
                <div className="template-editor">
                    {/* Day Assignment Dropdown */}
                    {!selectedTemplate.isDefault && (
                        <div className="day-assignment-section">
                            <label className="day-assignment-label">
                                <span className="label-icon">📆</span>
                                Assign to Day:
                            </label>
                            <select
                                className="day-select"
                                value={selectedTemplate.dayOfWeek ?? ''}
                                onChange={(e) => {
                                    const value = e.target.value === '' ? null : parseInt(e.target.value);
                                    setSelectedTemplate({
                                        ...selectedTemplate,
                                        dayOfWeek: value
                                    });
                                }}
                            >
                                <option value="">None (Manual only)</option>
                                {DAYS_OF_WEEK.map(day => (
                                    <option key={day.value} value={day.value}>
                                        {day.label} - Auto-apply every {day.label}
                                    </option>
                                ))}
                            </select>
                            {selectedTemplate.dayOfWeek !== null && selectedTemplate.dayOfWeek !== undefined && (
                                <p className="day-assignment-hint">
                                    ✨ This template will automatically be used on every <strong>{DAYS_OF_WEEK[selectedTemplate.dayOfWeek]?.label}</strong>, overriding the default template.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="editor-actions">
                        <button className="btn btn-primary" onClick={handleSaveTemplate}>
                            💾 Save Changes
                        </button>
                        <button className="btn btn-secondary" onClick={handleResetDefaultsClick}>
                            🔄 Reset Defaults
                        </button>
                    </div>

                    <div className="blocks-header-row">
                        <h3>Time Blocks</h3>
                        <button className="btn btn-sm btn-outline" onClick={handleAddBlock}>
                            + Add Block
                        </button>
                    </div>

                    <div className="time-blocks-list">
                        {selectedTemplate.timeBlocks?.map(block => (
                            <div
                                key={block.id}
                                className="time-block-card card"
                                style={{ '--block-color': block.color }}
                            >
                                <div className="block-header">
                                    <div className="block-icon-picker">
                                        <button
                                            className="emoji-button"
                                            onClick={() => setShowEmojiPicker(showEmojiPicker === block.id ? null : block.id)}
                                            title="Choose icon"
                                            style={{ backgroundColor: block.color }}
                                        >
                                            {block.icon || '📌'}
                                        </button>
                                        {showEmojiPicker === block.id && (
                                            <div className="emoji-dropdown">
                                                <div className="emoji-grid">
                                                    {BLOCK_EMOJIS.map((emoji, i) => (
                                                        <button
                                                            key={i}
                                                            className="emoji-option"
                                                            onClick={() => {
                                                                handleUpdateBlockTime(block.id, 'icon', emoji);
                                                                setShowEmojiPicker(null);
                                                            }}
                                                        >
                                                            {emoji}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="color-picker-row">
                                                    <label>Color:</label>
                                                    <input
                                                        type="color"
                                                        value={block.color}
                                                        onChange={e => handleUpdateBlockTime(block.id, 'color', e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="block-info">
                                        <div className="block-title-row">
                                            <input
                                                type="text"
                                                className="block-name-input"
                                                value={block.name}
                                                onChange={e => handleUpdateBlockTime(block.id, 'name', e.target.value)}
                                            />
                                            <button
                                                className="btn-delete-block"
                                                onClick={() => handleDeleteBlockClick(block.id)}
                                                title="Delete Block"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                        <div className="block-time-editor">
                                            <input
                                                type="time"
                                                className="time-input"
                                                value={block.startTime}
                                                onChange={e => handleUpdateBlockTime(block.id, 'startTime', e.target.value)}
                                            />
                                            <span>to</span>
                                            <input
                                                type="time"
                                                className="time-input"
                                                value={block.endTime === '00:00' ? '24:00' : block.endTime}
                                                onChange={e => handleUpdateBlockTime(block.id, 'endTime', e.target.value === '24:00' ? '00:00' : e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Block Tasks */}
                                <div className="block-tasks">
                                    <div className="tasks-header">
                                        <span className="tasks-title">Default Tasks</span>
                                        <button
                                            className="btn btn-sm btn-ghost"
                                            onClick={() => {
                                                setEditingBlock(block.id);
                                                setShowAddTaskModal(true);
                                            }}
                                        >
                                            + Add Task
                                        </button>
                                    </div>

                                    {block.defaultTasks?.length > 0 ? (
                                        <ul className="task-list">
                                            {block.defaultTasks.map((task, index) => (
                                                <li key={index} className="task-item">
                                                    <div className="task-content">
                                                        <span className="task-title">{task.title}</span>
                                                        <span className={`task-category badge badge-${task.priority === 'high' ? 'error' : task.priority === 'medium' ? 'warning' : 'info'}`}>
                                                            {task.category}
                                                        </span>
                                                    </div>
                                                    <button
                                                        className="btn btn-ghost btn-icon btn-sm"
                                                        onClick={() => handleRemoveTask(block.id, index)}
                                                    >
                                                        ×
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="empty-tasks text-muted">No default tasks</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Holiday Template View */}
            {selectedTemplate?.isHoliday && (
                <div className="holiday-template-view">
                    <div className="holiday-info card">
                        <div className="flex justify-between items-center mb-4">
                            <h2>🏖️ Holiday / Travel Day Mode</h2>
                            <div className="editor-actions-inline">
                                <button className="btn btn-primary btn-sm" onClick={handleSaveTemplate}>
                                    💾 Save
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={handleResetDefaultsClick}>
                                    🔄 Reset
                                </button>
                            </div>
                        </div>
                        <p className="text-secondary mt-2 mb-6">
                            On holidays or travel days, only these priorities are tracked to maintain minimal continuity.
                        </p>

                        <div className="holiday-priorities mt-6">
                            <div className="flex justify-between items-center mb-2">
                                <h3>Priorities</h3>
                                <button className="btn btn-sm btn-ghost" onClick={addHolidayPriority}>+ Add Priority</button>
                            </div>

                            {selectedTemplate.priorities?.map((priority, index) => (
                                <div key={index} className="priority-item editable">
                                    <div className="priority-icon">
                                        <span className="icon-fake">{priority.id === 'movement' ? '🚶' : priority.id === 'protein' ? '🥚' : '💧'}</span>
                                    </div>
                                    <div className="priority-details w-full">
                                        <input
                                            className="input-inline-bold"
                                            value={priority.title}
                                            onChange={e => updateHolidayPriority(index, 'title', e.target.value)}
                                            placeholder="Priority Title"
                                        />
                                        <input
                                            className="input-inline"
                                            value={priority.description}
                                            onChange={e => updateHolidayPriority(index, 'description', e.target.value)}
                                            placeholder="Description"
                                        />
                                    </div>
                                    <button
                                        className="btn btn-ghost btn-sm text-error"
                                        onClick={() => deleteHolidayPriority(index)}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="success-criteria mt-8">
                            <h3>Success Criteria</h3>
                            <p className="text-sm text-secondary mb-3">Define what "Good" looks like (1/3, 2/3, 3/3 of priorities)</p>
                            <ul className="criteria-list">
                                <li>
                                    <span className="criteria-count">1/{selectedTemplate.priorities?.length || 3}</span>
                                    <span>Acceptable</span>
                                </li>
                                <li>
                                    <span className="criteria-count">2/{selectedTemplate.priorities?.length || 3}</span>
                                    <span>Good</span>
                                </li>
                                <li>
                                    <span className="criteria-count">3/{selectedTemplate.priorities?.length || 3}</span>
                                    <span>Perfect</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Template Modal */}
            {showCreateModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">Create New Template</h2>
                            <button className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <label className="text-secondary block mb-2">Template Name</label>
                            <input
                                type="text"
                                className="input-full"
                                placeholder="e.g. Tuesday, Weekend, Heavy Training"
                                value={createModalName}
                                onChange={e => setCreateModalName(e.target.value)}
                                autoFocus
                                onKeyDown={e => e.key === 'Enter' && handleConfirmCreate()}
                            />
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleConfirmCreate}>Create</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {showConfirmModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">Confirm Action</h2>
                            <button className="btn btn-ghost" onClick={() => setShowConfirmModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <p>{confirmMessage}</p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowConfirmModal(false)}>Cancel</button>
                            <button className="btn btn-error" onClick={executeConfirmAction}>Confirm</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Task Modal - Existing */}
            {showAddTaskModal && (
                <div className="modal-overlay" onClick={() => setShowAddTaskModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Add Default Task</h2>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowAddTaskModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="label">Task Title</label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="e.g., Morning stretch"
                                    value={newTask.title}
                                    onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                                />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="label">Category</label>
                                    <select
                                        className="input"
                                        value={newTask.category}
                                        onChange={e => setNewTask({ ...newTask, category: e.target.value })}
                                    >
                                        <option value="personal">Personal</option>
                                        <option value="health">Health</option>
                                        <option value="college">College</option>
                                        <option value="campus">Campus</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="label">Priority</label>
                                    <select
                                        className="input"
                                        value={newTask.priority}
                                        onChange={e => setNewTask({ ...newTask, priority: e.target.value })}
                                    >
                                        <option value="high">High</option>
                                        <option value="medium">Medium</option>
                                        <option value="low">Low</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowAddTaskModal(false)}>
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleAddTask}
                                disabled={!newTask.title.trim()}
                            >
                                Add Task
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{templateStyles}</style>
        </div>
    );
}

const templateStyles = `
  .templates-view {
    max-width: 900px;
    margin: 0 auto;
  }

  .view-header {
    margin-bottom: var(--spacing-6);
  }

  .view-title {
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
  }

  .template-selector {
    display: flex;
    gap: var(--spacing-3);
    margin-bottom: var(--spacing-6);
    flex-wrap: wrap;
  }

  .template-btn {
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--color-bg-card);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    min-width: 130px;
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
  }

  .template-btn:hover {
    border-color: var(--color-accent);
    transform: translateY(-2px);
    color: var(--color-accent);
  }

  .template-btn.active {
    border-color: var(--color-accent);
    background: var(--color-accent-light);
    box-shadow: 0 0 0 2px rgba(20, 184, 166, 0.2);
    color: var(--color-accent);
  }

  .template-btn.holiday {
    border-color: var(--color-warning);
  }
  
  .template-btn.holiday:hover {
    color: var(--color-warning);
  }
  
  .template-btn.holiday.active {
    background: rgba(245, 158, 11, 0.15);
    color: var(--color-warning);
  }
  
  .template-btn.create-new {
    border-style: dashed;
    opacity: 0.7;
    color: var(--color-text-secondary);
  }
  
  .template-btn.create-new:hover {
    opacity: 1;
    border-style: solid;
    color: var(--color-accent);
  }
  
  .template-name {
    color: inherit;
    font-weight: var(--font-weight-medium);
  }
  
  .template-btn-content {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-1);
  }

  .default-badge {
    font-size: 0.65rem;
    padding: 2px 6px;
    background: var(--color-success);
    color: white;
    border-radius: var(--radius-sm);
    text-transform: uppercase;
    font-weight: bold;
  }
  
  .editor-header-actions {
      display: flex;
      justify-content: flex-end;
      margin-bottom: var(--spacing-4);
  }
  
  .blocks-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--spacing-4);
      margin-top: var(--spacing-6);
  }

  .editor-actions {
    display: flex;
    gap: var(--spacing-3);
    margin-bottom: var(--spacing-6);
  }
  
  .editor-actions-inline {
    display: flex;
    gap: var(--spacing-2);
  }

  .time-blocks-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
  }

  .time-block-card {
    padding: var(--spacing-4);
    border-left: 3px solid var(--block-color);
  }

  .block-header {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-4);
    margin-bottom: var(--spacing-4);
  }

  .block-color {
    width: 24px;
    height: 24px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .block-info {
    flex: 1;
  }

  .block-name {
    margin-bottom: var(--spacing-2);
  }
  
  .block-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-2);
  }
  
  .block-name-input {
    background: transparent;
    border: none;
    border-bottom: 1px solid transparent;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    padding: 2px 0;
    width: 100%;
  }
  
  .block-name-input:focus {
    border-bottom-color: var(--color-accent);
    outline: none;
  }
  
  .block-color-picker {
      width: 32px;
      height: 32px;
      padding: 0;
      border: none;
      border-radius: 50%;
      overflow: hidden;
      cursor: pointer;
      flex-shrink: 0;
  }
  
  .btn-delete-block {
      background: transparent;
      border: none;
      cursor: pointer;
      opacity: 0.6;
      transition: all 0.2s;
      font-size: 1.1rem;
      padding: 4px;
      border-radius: var(--radius-sm);
  }
  
  .btn-delete-block:hover {
      opacity: 1;
      background: rgba(239, 68, 68, 0.15);
  }
  
  .btn-outline {
      background: transparent;
      border: 1px solid var(--color-accent);
      color: var(--color-accent);
      padding: var(--spacing-2) var(--spacing-4);
      border-radius: var(--radius-full);
      font-weight: var(--font-weight-medium);
      transition: all var(--transition-fast);
  }
  
  .btn-outline:hover {
      background: var(--color-accent-light);
      transform: translateY(-1px);
  }

  .block-time-editor {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
  }

  .time-input {
    width: 120px;
    padding: var(--spacing-2);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-family: inherit;
  }

  .block-tasks {
    margin-top: var(--spacing-4);
    padding-top: var(--spacing-4);
    border-top: 1px solid var(--color-border);
  }

  .tasks-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-3);
  }

  .tasks-title {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    font-size: var(--font-size-sm);
    letter-spacing: 0.05em;
  }

  .task-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .task-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-2);
  }

  .task-content {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
  }

  .task-title {
    font-weight: var(--font-weight-medium);
  }

  .empty-tasks {
    padding: var(--spacing-4);
    text-align: center;
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-md);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-4);
  }

  /* Holiday Template View */
  .holiday-template-view {
    max-width: 600px;
    margin: 0 auto;
  }

  .holiday-info {
    padding: var(--spacing-6);
    border: 2px solid var(--color-warning);
  }

  .holiday-priorities {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
  }

  .priority-item {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-4);
    padding: var(--spacing-4);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-lg);
  }

  .priority-icon {
    font-size: 1.5rem;
  }

  .priority-details strong {
    font-size: var(--font-size-lg);
  }

  .success-criteria h3 {
    margin-bottom: var(--spacing-3);
  }

  .criteria-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .criteria-list li {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    padding: var(--spacing-2) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .criteria-list li:last-child {
    border-bottom: none;
  }
  
  .input-inline {
      width: 100%;
      background: transparent;
      border: 1px solid transparent;
      padding: 4px 8px;
      border-radius: var(--radius-sm);
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
  }
  
  .input-inline-bold {
      width: 100%;
      background: transparent;
      border: 1px solid transparent;
      padding: 4px 8px;
      border-radius: var(--radius-sm);
      color: var(--color-text-primary);
      font-weight: bold;
      font-size: var(--font-size-lg);
  }
  
  .input-inline:focus, .input-inline-bold:focus {
      background: var(--color-bg-input);
      border-color: var(--color-border);
      outline: none;
  }
  
  .icon-select {
      background: transparent;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
  }
  
  .icon-fake {
      font-size: 1.5rem;
  }

  .criteria-count {
    font-weight: var(--font-weight-bold);
    color: var(--color-success);
    min-width: 40px;
  }

  .loading-state {
    text-align: center;
    padding: var(--spacing-8);
    color: var(--color-text-secondary);
  }
  
  /* Day Badge on template buttons */
  .day-badge {
    font-size: 0.6rem;
    padding: 2px 6px;
    background: var(--color-info);
    color: white;
    border-radius: var(--radius-sm);
    text-transform: uppercase;
    font-weight: bold;
  }
  
  /* Day Assignment Section */
  .day-assignment-section {
    background: var(--color-bg-tertiary);
    padding: var(--spacing-4);
    border-radius: var(--radius-lg);
    margin-bottom: var(--spacing-4);
    border: 1px solid var(--color-border);
  }
  
  .day-assignment-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    font-weight: var(--font-weight-medium);
    margin-bottom: var(--spacing-3);
    color: var(--color-text-primary);
  }
  
  .label-icon {
    font-size: 1rem;
  }
  
  .day-select {
    width: 100%;
    padding: var(--spacing-3);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-size: var(--font-size-md);
    cursor: pointer;
  }
  
  .day-select:focus {
    outline: none;
    border-color: var(--color-accent);
  }
  
  .day-assignment-hint {
    margin-top: var(--spacing-3);
    padding: var(--spacing-3);
    background: rgba(20, 184, 166, 0.1);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    color: var(--color-accent);
    border-left: 3px solid var(--color-accent);
  }
  
  /* Emoji Picker */
  .block-icon-picker {
    position: relative;
  }
  
  .emoji-button {
    width: 36px;
    height: 36px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-lg);
    font-size: 1.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }
  
  .emoji-button:hover {
    transform: scale(1.1);
    border-color: rgba(255, 255, 255, 0.4);
  }
  
  .emoji-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 100;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-3);
    margin-top: var(--spacing-2);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
    min-width: 250px;
  }
  
  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  }
  
  .emoji-option {
    background: var(--color-bg-tertiary);
    border: none;
    border-radius: 4px;
    padding: 4px;
    font-size: 1.25rem;
    cursor: pointer;
  }
  
  .emoji-option:hover {
    background: var(--color-accent-light);
  }
  
  .color-picker-row {
      display: flex;
      align-items: center;
      gap: 8px;
  }
  
  /* New input styles */
  .input-full {
    width: 100%;
    padding: var(--spacing-3);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-size: var(--font-size-md);
  }
  
  .input-full:focus {
    outline: none;
    border-color: var(--color-accent);
  }
  
  .btn-error {
     background-color: var(--color-error);
     color: white;
  }
  
  .btn-error:hover {
     background-color: #dc2626; /* Darker red */
  }
`;
