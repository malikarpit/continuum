/**
 * Today - Real-time day progress view with time-based task display
 * Shows current day state, time blocks, and what to do NOW
 */

import { useState, useEffect } from 'react';
import { useAppStore, VIEWS } from '../../store/appStore';
import Modal, { ModalBody, ModalFooter } from '../common/Modal';
import { useRealTime, formatTime, formatDate } from '../../hooks/useRealTime';
import {
  DEFAULT_TIME_BLOCKS,
  HOLIDAY_TEMPLATE,
  getCurrentTimeBlock,
  getNextTimeBlock,
  formatTimeRange,
  getEffectiveTemplate,
  initializeDefaultTemplates,
} from '../../db/templateStore';
import { calculateDayProgressWithBoundary } from '../../db/dayEngine';
import { TASK_STATUS } from '../../db/taskStore';

export default function Today() {
  const {
    currentDay,
    tasks,
    taskStats,
    training,
    nutrition,
    settings,
    completeTask,
    skipTask,
    showToast,
    refreshDay,
    updateEnergy,
    toggleHolidayMode,
    updateHolidayPriority,
    setView,
  } = useAppStore();

  const { currentTime, isOnline, syncStatus, lastSyncTime, forceSync } = useRealTime();

  const [template, setTemplate] = useState(null);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [showEnergyModal, setShowEnergyModal] = useState(false);
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [taskFilter, setTaskFilter] = useState('all'); // 'all' | 'template' | 'manual'

  // Derive holiday state from currentDay (persisted)
  const isHoliday = currentDay?.isHoliday || false;
  const holidayProgress = currentDay?.holidayProgress || { movement: false, protein: false, hydration: false };

  // Load template on mount
  useEffect(() => {
    const loadTemplate = async () => {
      await initializeDefaultTemplates();
      // Use getEffectiveTemplate to respect day-of-week assignments
      const effectiveTemplate = await getEffectiveTemplate(new Date());
      setTemplate(effectiveTemplate);
    };
    loadTemplate();
  }, []); // Reload on mount

  // Check for energy level check-in requirement
  useEffect(() => {
    if (currentDay && !currentDay.energyLevel && !currentDay.isHoliday) {
      setShowEnergyModal(true);
    }
  }, [currentDay]);

  // Get current and next time blocks
  const timeBlocks = template?.timeBlocks || DEFAULT_TIME_BLOCKS;
  const currentBlock = getCurrentTimeBlock(currentTime, timeBlocks);
  const nextBlock = getNextTimeBlock(currentTime, timeBlocks);
  const dayProgress = calculateDayProgressWithBoundary(currentTime, settings?.dayBoundaryHour || 4);

  // Animate progress bar on load
  useEffect(() => {
    const timer = setTimeout(() => setAnimatedProgress(dayProgress), 100);
    return () => clearTimeout(timer);
  }, [dayProgress]);

  // Get tasks for current block
  const getCurrentBlockTasks = () => {
    if (!currentBlock) return [];
    return tasks.filter(task => {
      // Match by scheduled time or category
      if (task.scheduledTime) {
        const [taskHour] = task.scheduledTime.split(':').map(Number);
        const [blockStartHour] = currentBlock.startTime.split(':').map(Number);
        const [blockEndHour] = currentBlock.endTime.split(':').map(Number);
        return taskHour >= blockStartHour && taskHour < (blockEndHour || 24);
      }
      return false;
    });
  };

  // Get all today's tasks grouped by time block
  const getTasksByBlock = () => {
    const grouped = {};
    timeBlocks.forEach(block => {
      const [blockStartHour] = block.startTime.split(':').map(Number);
      const [blockEndHour] = block.endTime.split(':').map(Number) || [24];
      grouped[block.id] = tasks.filter(task => {
        // Match by blockId first (canonical)
        if (task.blockId === block.id) return true;
        // Fall back to scheduledTime if no blockId
        if (task.scheduledTime && !task.blockId) {
          const [taskHour] = task.scheduledTime.split(':').map(Number);
          return taskHour >= blockStartHour && taskHour < (blockEndHour || 24);
        }
        return false;
      });
    });
    return grouped;
  };

  // Handle marking as holiday - now persists to database
  const handleMarkHoliday = async () => {
    await toggleHolidayMode(true);
    setShowHolidayModal(false);
    showToast('Today marked as Holiday mode 🏖️', 'success');
  };

  // Handle exiting holiday mode - persists to database
  const handleExitHoliday = async () => {
    await toggleHolidayMode(false);
    showToast('Holiday mode disabled', 'info');
  };

  // Handle holiday priority toggle - now persists to database
  const handleHolidayPriority = async (priority) => {
    const newValue = !holidayProgress[priority];
    await updateHolidayPriority(priority, newValue);

    const newProgress = { ...holidayProgress, [priority]: newValue };
    const completed = Object.values(newProgress).filter(Boolean).length;
    if (completed === 3) {
      showToast('Perfect holiday! All 3 priorities done! 🎉', 'success');
    } else if (completed === 2) {
      showToast('Great job! 2/3 priorities completed 👍', 'success');
    } else if (completed === 1) {
      showToast('Good! 1/3 priorities completed ✓', 'info');
    }
  };

  // Quick task complete
  const handleQuickComplete = async (taskId) => {
    await completeTask(taskId);
    showToast('Task completed! ✓', 'success');
  };

  // Handle energy selection
  const handleEnergySelect = async (level) => {
    await updateEnergy(level);
    setShowEnergyModal(false);
    const messages = {
      1: "Take it easy today. Recovery is productive. 🌿",
      2: "Listen to your body. Light movement helps. 🚶",
      3: "Solid baseline. You've got this. 💪",
      4: "Great energy! Let's make progress. 🚀",
      5: "Unstoppable! Crush your goals! 🔥"
    };
    showToast(messages[level], 'success');
  };

  // Holiday Mode View
  if (isHoliday) {
    const completedCount = Object.values(holidayProgress).filter(Boolean).length;
    const successLevel = completedCount >= 3 ? 'Perfect' : completedCount >= 2 ? 'Good' : completedCount >= 1 ? 'Acceptable' : 'Pending';

    return (
      <div className="today-view animate-fade-in">
        {/* Header */}
        <header className="today-header">
          <div className="date-time">
            <div className="current-date">{formatDate(currentTime)}</div>
            <div className="current-time">
              <span className="time-value">{formatTime(currentTime)}</span>
              <span className={`sync-status ${syncStatus}`}>
                {isOnline ? '🟢' : '🔴'} {syncStatus === 'synced' ? 'Synced' : syncStatus === 'offline' ? 'Offline' : 'Syncing...'}
              </span>
            </div>
            {template && (
              <div className="active-template-badge holiday">
                Using Template: <strong>{template.name}</strong>
              </div>
            )}
          </div>
          <div className="holiday-badge">
            <span className="badge badge-warning">🏖️ Holiday Mode</span>
          </div>
        </header>

        {/* Holiday Progress */}
        <section className="holiday-section card">
          <h2>Survival Priorities</h2>
          <p className="text-secondary mb-4">
            Complete any 1+ priority to maintain continuity. No guilt, just minimal adherence.
          </p>

          <div className="holiday-priorities">
            {HOLIDAY_TEMPLATE.priorities.map(priority => (
              <div
                key={priority.id}
                className={`priority-card ${holidayProgress[priority.id] ? 'completed' : ''}`}
                onClick={() => handleHolidayPriority(priority.id)}
              >
                <div className="priority-check">
                  {holidayProgress[priority.id] ? '✓' : '○'}
                </div>
                <div className="priority-info">
                  <div className="priority-title">{priority.title}</div>
                  <div className="priority-desc text-secondary">{priority.description}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="holiday-status mt-6">
            <div className="status-badge" data-level={successLevel.toLowerCase()}>
              {completedCount}/3 - {successLevel}
            </div>
          </div>
        </section>

        {/* Exit Holiday Mode */}
        <button
          className="btn btn-secondary w-full mt-4"
          onClick={handleExitHoliday}
        >
          Exit Holiday Mode
        </button>

        <style>{todayStyles}</style>
      </div>
    );
  }

  // Regular Day View
  return (
    <div className="today-view animate-fade-in">
      {/* Header with Live Clock */}
      <header className="today-header">
        <div className="date-time">
          <div className="current-date">{formatDate(currentTime)}</div>
          <div className="current-time">
            <span className="time-value">{formatTime(currentTime)}</span>
            <span className={`sync-status ${syncStatus}`}>
              {isOnline ? '🟢' : '🔴'} {syncStatus === 'synced' ? 'Synced' : syncStatus === 'offline' ? 'Offline' : 'Syncing...'}
            </span>
          </div>
          {template && (
            <div className="active-template-badge">
              Using Template: <strong>{template.name}</strong>
            </div>
          )}
          {currentDay?.energyLevel && (
            <div className="energy-badge-display">
              {['🔋', '😐', '🙂', '💪', '⚡'][currentDay.energyLevel - 1]} Energy: {['Low', 'Okay', 'Good', 'High', 'Max'][currentDay.energyLevel - 1]}
            </div>
          )}
        </div>
        <button
          className="btn btn-holiday-action"
          onClick={() => setShowHolidayModal(true)}
        >
          🏖️ Mark Holiday
        </button>
      </header>

      {/* Day Progress Bar */}
      <section className="day-progress-section">
        <div className="progress-header">
          <span className="progress-label">Day Progress</span>
          <span className="progress-value">{dayProgress}%</span>
        </div>
        <div className="day-progress-bar">
          <div
            className="day-progress-fill"
            style={{ width: `${animatedProgress}%` }}
          />
          <div
            className="day-progress-marker"
            style={{ left: `${dayProgress}%` }}
          />
        </div>
        <div className="time-labels">
          <span>5 AM</span>
          <span>9 AM</span>
          <span>2 PM</span>
          <span>6 PM</span>
          <span>9 PM</span>
          <span>12 AM</span>
        </div>
      </section>

      {/* Timeline Visualization */}
      <section className="timeline-section">
        <div className="timeline">
          {timeBlocks.map((block, index) => {
            const [blockStartHour] = block.startTime.split(':').map(Number);
            const [blockEndHour] = block.endTime.split(':').map(Number) || [24];
            const currentHour = currentTime.getHours();

            const isPast = currentHour >= (blockEndHour || 24);
            const isCurrent = currentBlock?.id === block.id;
            const isFuture = currentHour < blockStartHour;

            return (
              <div
                key={block.id}
                className={`timeline-block ${isPast ? 'past' : ''} ${isCurrent ? 'current' : ''} ${isFuture ? 'future' : ''}`}
                style={{ '--block-color': block.color }}
                onClick={() => setSelectedBlock(block)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedBlock(block)}
              >
                <div className="block-indicator" />
                <div className="block-name">{block.name.replace(' Block', '')}</div>
                <div className="block-time">{formatTimeRange(block.startTime, block.endTime)}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Current Block - What to do NOW */}
      {currentBlock && (
        <section className="current-block-section card">
          <div className="section-header">
            <div className="current-indicator">
              <span className="pulse-dot" />
              <span>RIGHT NOW</span>
            </div>
            <div
              className="block-badge"
              style={{ background: currentBlock.color }}
            >
              {currentBlock.name}
            </div>
          </div>

          <div className="current-tasks">
            {currentBlock.defaultTasks?.length > 0 ? (
              currentBlock.defaultTasks.map((templateTask, i) => {
                // Match by blockId and templateTaskId for stable matching
                const matchedTask = tasks.find(t =>
                  (t.blockId === currentBlock.id && t.templateTaskId === templateTask.id) ||
                  (t.blockId === currentBlock.id && t.title === templateTask.title)
                );
                const isCompleted = matchedTask?.status === TASK_STATUS.COMPLETED;

                return (
                  <div
                    key={templateTask.id || i}
                    className={`current-task-item ${isCompleted ? 'completed' : ''}`}
                  >
                    <div
                      className="task-checkbox"
                      onClick={() => matchedTask && handleQuickComplete(matchedTask.id)}
                    >
                      {isCompleted ? '✓' : '○'}
                    </div>
                    <div className="task-info">
                      <div className="task-title">{templateTask.title}</div>
                      <span
                        className="task-category badge"
                        style={{ textTransform: 'capitalize' }}
                      >
                        {templateTask.category}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-block">
                <p className="text-secondary">No specific tasks for this block</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Coming Up Next */}
      {nextBlock && currentBlock?.id !== nextBlock.id && (
        <section className="upcoming-section card">
          <div className="section-header">
            <span className="section-title">⏭️ Coming Up</span>
            <span className="text-secondary">{formatTimeRange(nextBlock.startTime, nextBlock.endTime)}</span>
          </div>
          <div
            className="next-block-preview"
            style={{ borderLeftColor: nextBlock.color }}
          >
            <strong>{nextBlock.name}</strong>
            <div className="next-tasks">
              {nextBlock.defaultTasks?.slice(0, 2).map((task, i) => (
                <span key={i} className="next-task-item">{task.title}</span>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Task Filter & Quick Stats */}
      <section className="task-filter-section">
        <div className="filter-buttons">
          <button
            className={`filter-btn ${taskFilter === 'all' ? 'active' : ''}`}
            onClick={() => setTaskFilter('all')}
          >
            All Tasks
          </button>
          <button
            className={`filter-btn ${taskFilter === 'template' ? 'active' : ''}`}
            onClick={() => setTaskFilter('template')}
          >
            📅 Template
          </button>
          <button
            className={`filter-btn ${taskFilter === 'manual' ? 'active' : ''}`}
            onClick={() => setTaskFilter('manual')}
          >
            ✏️ Manual
          </button>
        </div>
        <div className="filter-count text-muted">
          {(() => {
            const templateTasks = tasks.filter(t => t.templateTaskId || t.source === 'template');
            const manualTasks = tasks.filter(t => !t.templateTaskId && t.source !== 'template');
            if (taskFilter === 'template') return `${templateTasks.length} template tasks`;
            if (taskFilter === 'manual') return `${manualTasks.length} manual tasks`;
            return `${tasks.length} total tasks`;
          })()}
        </div>
      </section>

      {/* Quick Stats */}
      <section className="quick-stats">
        <div className="stat-item">
          <div className="stat-value">{taskStats.completed}/{taskStats.total}</div>
          <div className="stat-label">Tasks</div>
        </div>
        <div className="stat-item">
          <div className="stat-value text-success">{nutrition.protein}g</div>
          <div className="stat-label">Protein</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{nutrition.mealsLogged}/{nutrition.mealsTotal}</div>
          <div className="stat-label">Meals</div>
        </div>
      </section>

      {/* Time Block Popup */}
      {selectedBlock && (
        <div className="modal-overlay" onClick={() => setSelectedBlock(null)}>
          <div className="modal block-popup" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ borderColor: selectedBlock.color }}>
              <h2 className="modal-title">
                <span style={{ color: selectedBlock.color }}>{selectedBlock.name}</span>
              </h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelectedBlock(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="block-popup-time">
                {formatTimeRange(selectedBlock.startTime, selectedBlock.endTime)}
              </div>

              {(() => {
                const blockTasks = tasks.filter(t => t.blockId === selectedBlock.id);
                const completed = blockTasks.filter(t => t.status === TASK_STATUS.COMPLETED).length;
                const total = blockTasks.length;
                const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

                return (
                  <>
                    <div className="block-completion">
                      <div className="completion-circle" style={{ '--progress': percentage, '--color': selectedBlock.color }}>
                        <span>{percentage}%</span>
                      </div>
                      <div className="completion-text">
                        <strong>{completed}/{total}</strong> tasks completed
                      </div>
                    </div>

                    <div className="block-task-list">
                      <h4>Tasks</h4>
                      {blockTasks.length === 0 ? (
                        <p className="text-muted">No tasks assigned to this block</p>
                      ) : (
                        blockTasks.map(task => (
                          <div key={task.id} className={`block-task-item ${task.status === TASK_STATUS.COMPLETED ? 'completed' : ''}`}>
                            <span className="task-status-icon">
                              {task.status === TASK_STATUS.COMPLETED ? '✓' : task.status === TASK_STATUS.SKIPPED ? '⏭' : '○'}
                            </span>
                            <span className="task-title">{task.title}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Holiday Modal - Accessible */}
      <Modal
        isOpen={showHolidayModal}
        onClose={() => setShowHolidayModal(false)}
        title="Mark as Holiday?"
      >
        <ModalBody>
          <p className="text-secondary mb-4">
            Holiday mode switches to minimal tracking with only 3 priorities:
          </p>
          <ul className="holiday-preview">
            <li>🚶 Movement - Any walk or stairs</li>
            <li>🥚 Protein - 2+ eggs or protein source</li>
            <li>💧 Hydration - 4+ glasses water</li>
          </ul>
          <p className="text-muted text-sm mt-4">
            Complete 1+ to maintain continuity. This is NOT marked as skipped or inactive.
          </p>
        </ModalBody>
        <ModalFooter>
          <button className="btn btn-secondary" onClick={() => setShowHolidayModal(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleMarkHoliday}>
            Enable Holiday Mode
          </button>
        </ModalFooter>
      </Modal>

      {/* Energy Check-in Modal */}
      {showEnergyModal && (
        <div className="modal-overlay">
          <div className="modal energy-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header center-header">
              <h2 className="modal-title">Energy Check-in</h2>
            </div>
            <div className="modal-body text-center">
              <p className="text-secondary mb-6">
                How are you feeling today? This helps adapt your workout and tasks.
              </p>

              <div className="energy-options">
                {[
                  { level: 1, label: 'Low', emoji: '🔋', desc: 'Drained' },
                  { level: 2, label: 'Okay', emoji: '😐', desc: 'Meh' },
                  { level: 3, label: 'Good', emoji: '🙂', desc: 'Normal' },
                  { level: 4, label: 'High', emoji: '💪', desc: 'Strong' },
                  { level: 5, label: 'Max', emoji: '⚡', desc: 'Peak' },
                ].map((option) => (
                  <button
                    key={option.level}
                    className="energy-btn"
                    onClick={() => handleEnergySelect(option.level)}
                  >
                    <div className="energy-emoji">{option.emoji}</div>
                    <div className="energy-label">{option.label}</div>
                    <div className="energy-desc">{option.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{todayStyles}</style>
    </div>
  );
}

const todayStyles = `
  .today-view {
    max-width: 900px;
    margin: 0 auto;
  }

  .today-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--spacing-6);
    flex-wrap: wrap;
    gap: var(--spacing-4);
  }

  .date-time {
    flex: 1;
  }

  .current-date {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin-bottom: var(--spacing-1);
  }

  .current-time {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    flex-wrap: wrap;
  }

  .active-template-badge {
    margin-top: var(--spacing-2);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    background: var(--color-bg-tertiary);
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    display: inline-block;
    border: 1px solid var(--color-border);
  }

  .active-template-badge strong {
    color: var(--color-accent);
  }

  .active-template-badge.holiday {
    border-color: var(--color-warning);
    background: rgba(245, 158, 11, 0.1);
  }

  .active-template-badge.holiday strong {
    color: var(--color-warning);
  }

  .energy-badge-display {
    margin-top: var(--spacing-2);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    background: var(--color-bg-tertiary);
    padding: 4px 10px;
    border-radius: var(--radius-full);
    display: inline-block;
    opacity: 0.8;
  }

  .time-value {
    font-size: var(--font-size-4xl);
    font-weight: var(--font-weight-bold);
    font-variant-numeric: tabular-nums;
  }

  .sync-status {
    font-size: var(--font-size-sm);
    padding: var(--spacing-1) var(--spacing-2);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
  }

  .sync-status.synced {
    color: var(--color-success);
  }

  .sync-status.offline {
    color: var(--color-warning);
  }

  /* Day Progress Bar */
  .day-progress-section {
    margin-bottom: var(--spacing-6);
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: var(--spacing-2);
  }

  .progress-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .progress-value {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--color-accent);
  }

  .day-progress-bar {
    height: 12px;
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-full);
    position: relative;
    overflow: visible;
  }

  .day-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--color-accent), var(--color-success));
    border-radius: var(--radius-full);
    transition: width 1s ease;
  }

  .day-progress-marker {
    position: absolute;
    top: -4px;
    width: 4px;
    height: 20px;
    background: var(--color-text-primary);
    border-radius: var(--radius-sm);
    transform: translateX(-50%);
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
  }

  .time-labels {
    display: flex;
    justify-content: space-between;
    margin-top: var(--spacing-2);
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  /* Timeline */
  .timeline-section {
    margin-bottom: var(--spacing-6);
    overflow-x: auto;
  }

  .timeline {
    display: flex;
    gap: var(--spacing-2);
    min-width: max-content;
  }

  .timeline-block {
    flex: 1;
    min-width: 100px;
    padding: var(--spacing-3);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    text-align: center;
    transition: all var(--transition-fast);
    position: relative;
    cursor: pointer;
  }

  .timeline-block:hover {
    transform: scale(1.02);
    border-color: var(--block-color);
    background: var(--color-bg-card-hover);
  }

  .timeline-block.past {
    opacity: 0.5;
    background: var(--color-bg-tertiary);
  }

  .timeline-block.current {
    border-color: var(--block-color);
    box-shadow: 0 0 15px color-mix(in srgb, var(--block-color) 30%, transparent);
  }

  .timeline-block.current .block-indicator {
    width: 8px;
    height: 8px;
    background: var(--block-color);
    border-radius: var(--radius-full);
    position: absolute;
    top: 8px;
    right: 8px;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .timeline-block.future {
    opacity: 0.7;
  }

  .block-name {
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-sm);
    margin-bottom: var(--spacing-1);
  }

  .block-time {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  /* Current Block Section */
  .current-block-section {
    padding: var(--spacing-6);
    margin-bottom: var(--spacing-4);
    border-left: 4px solid var(--color-accent);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-4);
  }

  .current-indicator {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    font-weight: var(--font-weight-semibold);
    color: var(--color-accent);
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    background: var(--color-accent);
    border-radius: var(--radius-full);
    animation: pulse 1.5s infinite;
  }

  .block-badge {
    padding: var(--spacing-1) var(--spacing-3);
    border-radius: var(--radius-full);
    font-size: var(--font-size-sm);
    color: white;
  }

  .current-tasks {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .current-task-item {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-3);
    padding: var(--spacing-3);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }

  .current-task-item:hover {
    background: var(--color-bg-card-hover);
  }

  .current-task-item.completed {
    opacity: 0.6;
  }

  .current-task-item.completed .task-title {
    text-decoration: line-through;
  }

  .task-checkbox {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--color-border-light);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--font-size-lg);
    transition: all var(--transition-fast);
  }

  .task-checkbox:hover {
    border-color: var(--color-success);
    background: var(--color-success-light);
    color: var(--color-success);
  }

  .current-task-item.completed .task-checkbox {
    background: var(--color-success);
    border-color: var(--color-success);
    color: white;
  }

  .task-info {
    flex: 1;
  }

  .task-title {
    font-weight: var(--font-weight-medium);
    margin-bottom: var(--spacing-1);
  }

  .task-category {
    font-size: var(--font-size-xs);
  }

  /* Upcoming Section */
  .upcoming-section {
    padding: var(--spacing-4);
    margin-bottom: var(--spacing-6);
  }

  .section-title {
    font-weight: var(--font-weight-semibold);
  }

  .next-block-preview {
    margin-top: var(--spacing-3);
    padding-left: var(--spacing-4);
    border-left: 3px solid var(--color-border);
  }

  .next-tasks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2);
    margin-top: var(--spacing-2);
  }

  .next-task-item {
    padding: var(--spacing-1) var(--spacing-2);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
  }

  /* Task Filter Section */
  .task-filter-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-3) var(--spacing-4);
    background: var(--color-bg-card);
    border-radius: var(--radius-lg);
    margin-bottom: var(--spacing-4);
  }

  .filter-buttons {
    display: flex;
    gap: var(--spacing-2);
  }

  .filter-btn {
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .filter-btn:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .filter-btn.active {
    background: var(--color-accent-light);
    border-color: var(--color-accent);
    color: var(--color-accent);
    font-weight: var(--font-weight-medium);
  }

  .filter-count {
    font-size: var(--font-size-sm);
  }

  /* Line Graph Animation (translucent tail) */
  @keyframes lineGlow {
    0% { stroke-opacity: 0.6; }
    50% { stroke-opacity: 1; }
    100% { stroke-opacity: 0.6; }
  }

  .progress-line,
  .day-progress-fill {
    animation: lineGlow 3s ease-in-out infinite;
  }

  /* Quick Stats */
  .quick-stats {
    display: flex;
    justify-content: space-around;
    padding: var(--spacing-4);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    margin-bottom: var(--spacing-6);
  }

  .stat-item {
    text-align: center;
  }

  .stat-value {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
  }


  .stat-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  /* Holiday Button */
  .btn-holiday-action {
    background: linear-gradient(135deg, rgba(6, 182, 212, 0.15) 0%, rgba(34, 211, 238, 0.1) 100%);
    color: #22d3ee;
    border: 1px solid rgba(34, 211, 238, 0.4);
    padding: var(--spacing-2) var(--spacing-4);
    font-size: var(--font-size-sm);
    border-radius: var(--radius-lg);
    font-weight: var(--font-weight-medium);
    transition: all 0.2s ease;
  }

  .btn-holiday-action:hover {
    background: linear-gradient(135deg, rgba(6, 182, 212, 0.25) 0%, rgba(34, 211, 238, 0.2) 100%);
    border-color: rgba(34, 211, 238, 0.6);
    box-shadow: 0 0 20px rgba(34, 211, 238, 0.3);
  }

  /* Holiday Mode */
  .holiday-section {
    padding: var(--spacing-6);
    margin-bottom: var(--spacing-6);
    border: 2px solid var(--color-warning);
  }

  .holiday-badge {
    font-size: var(--font-size-lg);
  }

  .holiday-priorities {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .priority-card {
    display: flex;
    align-items: center;
    gap: var(--spacing-4);
    padding: var(--spacing-4);
    background: var(--color-bg-tertiary);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .priority-card:hover {
    border-color: var(--color-accent);
  }

  .priority-card.completed {
    border-color: var(--color-success);
    background: var(--color-success-light);
  }

  .priority-check {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--color-border-light);
    border-radius: var(--radius-full);
    font-size: var(--font-size-lg);
  }

  .priority-card.completed .priority-check {
    background: var(--color-success);
    border-color: var(--color-success);
    color: white;
  }

  .priority-title {
    font-weight: var(--font-weight-semibold);
    font-size: var(--font-size-lg);
  }

  .priority-desc {
    font-size: var(--font-size-sm);
  }

  .holiday-status {
    text-align: center;
  }

  .status-badge {
    display: inline-block;
    padding: var(--spacing-2) var(--spacing-4);
    border-radius: var(--radius-full);
    font-weight: var(--font-weight-semibold);
    background: var(--color-bg-tertiary);
  }

  .status-badge[data-level="perfect"] {
    background: var(--color-success);
    color: white;
  }

  .status-badge[data-level="good"] {
    background: var(--color-info);
    color: white;
  }

  .status-badge[data-level="acceptable"] {
    background: var(--color-warning);
    color: var(--color-bg-primary);
  }

  .holiday-preview {
    list-style: none;
    padding: 0;
  }

  .holiday-preview li {
    padding: var(--spacing-2) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .holiday-preview li:last-child {
    border-bottom: none;
  }

  /* Energy Modal */
  .center-header {
    justify-content: center;
    text-align: center;
  }

  .energy-modal {
    max-width: 500px;
  }

  .energy-options {
    display: flex;
    justify-content: space-between;
    gap: var(--spacing-2);
  }

  @media (max-width: 500px) {
    .energy-options {
      flex-wrap: wrap;
    }
    .energy-btn {
      min-width: 45%;
    }
  }

  .energy-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--spacing-3) var(--spacing-2);
    background: var(--color-bg-tertiary);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .energy-btn:hover {
    background: var(--color-bg-card-hover);
    border-color: var(--color-accent);
    transform: translateY(-4px);
  }

  .energy-emoji {
    font-size: 2rem;
    margin-bottom: var(--spacing-2);
  }

  .energy-label {
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  .energy-desc {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  /* Time Block Popup */
  .block-popup {
    max-width: 450px;
  }

  .block-popup-time {
    text-align: center;
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin-bottom: var(--spacing-4);
  }

  .block-completion {
    display: flex;
    align-items: center;
    gap: var(--spacing-4);
    padding: var(--spacing-4);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-lg);
    margin-bottom: var(--spacing-4);
  }

  .completion-circle {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: conic-gradient(
      var(--color, var(--color-accent)) calc(var(--progress, 0) * 1%),
      var(--color-bg-secondary) calc(var(--progress, 0) * 1%)
    );
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .completion-circle::before {
    content: '';
    position: absolute;
    width: 50px;
    height: 50px;
    background: var(--color-bg-tertiary);
    border-radius: 50%;
  }

  .completion-circle span {
    position: relative;
    z-index: 1;
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  .completion-text {
    color: var(--color-text-secondary);
  }

  .block-task-list h4 {
    margin-bottom: var(--spacing-3);
    color: var(--color-text-secondary);
  }

  .block-task-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--color-bg-card);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-2);
  }

  .block-task-item.completed {
    opacity: 0.6;
  }

  .block-task-item.completed .task-title {
    text-decoration: line-through;
  }

  .task-status-icon {
    font-size: 1rem;
  }

  .block-task-item.completed .task-status-icon {
    color: var(--color-success);
  }
`;
