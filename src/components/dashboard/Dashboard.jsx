/**
 * Dashboard - Main entry point showing today's overview
 * Now with contextual stats (no fake zeros) and time-aware urgency
 */

import { useState, useEffect } from 'react';
import { useAppStore, VIEWS } from '../../store/appStore';
import { TASK_STATUS } from '../../db/taskStore';
import { TRAINING_STATUS } from '../../db/trainingStore';
import { getCurrentTimeBlock, DEFAULT_TIME_BLOCKS, formatTimeRange } from '../../db/templateStore';
import { getActivePhase, calculatePhaseWeek, getPhaseProgress } from '../../db/phaseStore';

// Context-aware quotes
const QUOTES = {
  default: [
    "Discipline is choosing between what you want now and what you want most.",
    "Small daily improvements lead to stunning results.",
    "Progress, not perfection.",
  ],
  morning: [
    "Today is a new opportunity to become better.",
    "The way you start your day determines how you finish it.",
  ],
  lowEnergy: [
    "Small steps still move you forward.",
    "Even a slow day is better than a missed day.",
  ],
  highStreak: [
    "Consistency is your superpower.",
    "Your streak is proof of your commitment.",
  ],
  recovery: [
    "Rest is productive. Your body rebuilds stronger.",
    "Recovery is when progress happens.",
  ],
  holiday: [
    "Enjoy your break. Minimum effort keeps continuity alive.",
    "Even on vacation, tiny habits maintain momentum.",
  ],
};

export default function Dashboard() {
  const {
    currentDay,
    tasks,
    taskStats,
    training,
    meals,
    nutrition,
    settings,
    setView
  } = useAppStore();

  // Phase state
  const [activePhase, setActivePhase] = useState(null);
  const [phaseProgress, setPhaseProgress] = useState(null);

  // Load active phase on mount
  useEffect(() => {
    const loadPhase = async () => {
      const phase = await getActivePhase();
      if (phase) {
        setActivePhase(phase);
        const progress = await getPhaseProgress(phase.id);
        setPhaseProgress(progress);
      }
    };
    loadPhase();
  }, []);

  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const currentHour = today.getHours();

  // Determine if holiday mode
  const isHolidayMode = currentDay?.templateId === 'holiday' || currentDay?.isHoliday;

  // Calculate progress
  const taskProgress = taskStats.total > 0 ? (taskStats.completed / taskStats.total) * 100 : 0;
  const mealProgress = nutrition.mealsTotal > 0 ? (nutrition.mealsLogged / nutrition.mealsTotal) * 100 : 0;
  const proteinProgress = settings.proteinTarget > 0 ? Math.min((nutrition.protein / settings.proteinTarget) * 100, 100) : 0;

  // Get workout urgency based on time
  const getWorkoutUrgency = () => {
    if (!training) return { level: 'none', message: 'No workout planned' };
    if (training.status === TRAINING_STATUS.COMPLETED) return { level: 'done', message: 'Done ✓' };
    if (training.status === TRAINING_STATUS.REST) return { level: 'rest', message: 'Rest Day' };
    if (training.status === TRAINING_STATUS.SKIPPED) return { level: 'skipped', message: 'Skipped' };
    if (training.status === TRAINING_STATUS.IN_PROGRESS) return { level: 'active', message: 'In Progress...' };

    // Time-based urgency for pending workouts
    if (currentHour < 12) return { level: 'scheduled', message: 'Scheduled' };
    if (currentHour < 17) return { level: 'suggested', message: 'Ready when you are' };
    if (currentHour < 20) return { level: 'urgent', message: "Don't forget!" };
    return { level: 'final', message: 'Last chance today' };
  };

  const workoutUrgency = getWorkoutUrgency();

  // Select appropriate quote
  const getQuote = () => {
    if (isHolidayMode) return QUOTES.holiday[0];
    if (currentHour < 10) return QUOTES.morning[Math.floor(Math.random() * QUOTES.morning.length)];
    return QUOTES.default[Math.floor(Math.random() * QUOTES.default.length)];
  };

  // Check if data has been logged
  const hasNutritionData = nutrition.protein > 0 || nutrition.calories > 0 || nutrition.mealsLogged > 0;

  // Pending tasks
  const pendingTasks = tasks.filter(t => t.status === TASK_STATUS.PENDING).slice(0, 3);

  // Current time block - use effective template from currentDay if available
  const effectiveTimeBlocks = currentDay?.effectiveTemplate?.timeBlocks || DEFAULT_TIME_BLOCKS;
  const currentBlock = getCurrentTimeBlock(today, effectiveTimeBlocks);

  return (
    <div className="dashboard animate-fade-in">
      {/* Holiday Mode Banner */}
      {isHolidayMode && (
        <div className="holiday-banner">
          <span className="holiday-icon">🏖️</span>
          <div className="holiday-content">
            <strong>Holiday Mode Active</strong>
            <p>Reduced requirements • Continuity preserved</p>
          </div>
        </div>
      )}

      {/* Phase Progress Banner */}
      {activePhase && phaseProgress && (
        <div className="phase-banner">
          <div className="phase-header">
            <div className="phase-icon">📈</div>
            <div className="phase-info">
              <div className="phase-title">
                {activePhase.name} • Week {phaseProgress.currentWeek}
              </div>
              <div className="phase-subtitle">
                {phaseProgress.daysRemaining} days remaining • {phaseProgress.percentComplete}% complete
              </div>
            </div>
          </div>
          <div className="phase-progress-bar">
            <div
              className="phase-progress-fill"
              style={{ width: `${phaseProgress.percentComplete}%` }}
            />
          </div>
          {activePhase.weeklyTargets && (
            <div className="phase-targets">
              <span className="target-item">
                🥚 Protein: {activePhase.weeklyTargets.nutrition?.proteinTarget || settings.proteinTarget}g
              </span>
              <span className="target-item">
                🔥 Calories: {activePhase.weeklyTargets.nutrition?.calorieTarget || settings.calorieTarget}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Hero Section */}
      <section className="dashboard-hero">
        <div className="hero-greeting">
          <span className={`badge ${isHolidayMode ? 'badge-warning' : 'badge-accent'}`}>
            {isHolidayMode ? '🏖️ Holiday' : 'Active Day'}
          </span>
          <h1 className="hero-title">{dayName}</h1>
          <p className="hero-date text-secondary">{dateStr}</p>
          {currentBlock && (
            <div className="current-block-indicator">
              <span className="block-dot" style={{ background: currentBlock.color }}></span>
              <span className="block-name">{currentBlock.name}</span>
              <span className="block-time">{formatTimeRange(currentBlock.startTime, currentBlock.endTime)}</span>
            </div>
          )}
        </div>

        <div className="hero-quote">
          <p className="quote-text">"{getQuote()}"</p>
        </div>
      </section>

      {/* Quick Stats */}
      <section className="dashboard-stats">
        <div className="stat-card" onClick={() => setView(VIEWS.TASKS)}>
          <div className="stat-icon stat-icon-tasks">
            <TasksIcon />
          </div>
          <div className="stat-content">
            <div className="stat-value">
              {taskStats.total > 0 ? `${taskStats.completed}/${taskStats.total}` :
                <span className="text-muted">No tasks</span>}
            </div>
            <div className="stat-label">Tasks Completed</div>
          </div>
          <CircleProgress percentage={taskProgress} color="var(--color-accent)" />
        </div>

        <div className={`stat-card workout-card urgency-${workoutUrgency.level}`} onClick={() => setView(VIEWS.TRAINING)}>
          <div className="stat-icon stat-icon-training">
            <TrainingIcon />
          </div>
          <div className="stat-content">
            <div className={`stat-value ${workoutUrgency.level === 'urgent' || workoutUrgency.level === 'final' ? 'text-warning' : ''}`}>
              {training?.status === TRAINING_STATUS.COMPLETED ? (
                <span className="text-success-dark">{training.exercises?.length || 0} exercises</span>
              ) : training?.status === TRAINING_STATUS.IN_PROGRESS ? (
                `${training.currentExerciseIndex + 1}/${training.exercises?.length || 0} active`
              ) : (
                workoutUrgency.message
              )}
            </div>
            <div className="stat-label">
              {training?.status === TRAINING_STATUS.COMPLETED ? 'Workout Complete' :
                training?.status === TRAINING_STATUS.IN_PROGRESS ? 'In Progress' :
                  "Today's Workout"}
            </div>
          </div>
          <CircleProgress
            percentage={training?.status === TRAINING_STATUS.COMPLETED ? 100 :
              training?.status === TRAINING_STATUS.IN_PROGRESS ?
                ((training.currentExerciseIndex || 0) / (training.exercises?.length || 1)) * 100 : 0}
            color="var(--color-success)"
          />
        </div>

        <div className="stat-card" onClick={() => setView(VIEWS.MEALS)}>
          <div className="stat-icon stat-icon-meals">
            <MealsIcon />
          </div>
          <div className="stat-content">
            <div className="stat-value">
              {nutrition.mealsLogged > 0 ? `${nutrition.mealsLogged}/${nutrition.mealsTotal}` :
                <span className="text-muted">Not logged</span>}
            </div>
            <div className="stat-label">Meals Logged</div>
          </div>
          <CircleProgress percentage={mealProgress} color="var(--color-warning)" />
        </div>

        <div className="stat-card" onClick={() => setView(VIEWS.MEALS)}>
          <div className="stat-icon stat-icon-protein">
            <ProteinIcon />
          </div>
          <div className="stat-content">
            <div className="stat-value">
              {nutrition.protein > 0 ? `${nutrition.protein}g` :
                <span className="text-muted">Not logged</span>}
            </div>
            <div className="stat-label">
              {nutrition.protein > 0 ? `of ${settings.proteinTarget}g protein` : 'Protein'}
            </div>
          </div>
          <CircleProgress percentage={proteinProgress} color="var(--color-success)" />
        </div>
      </section>

      {/* Pending Tasks */}
      {pendingTasks.length > 0 && (
        <section className="dashboard-section">
          <div className="section-header">
            <h2 className="section-title">Up Next</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setView(VIEWS.TASKS)}>
              View All
            </button>
          </div>
          <div className="task-list">
            {pendingTasks.map(task => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </section>
      )}

      {/* Nutrition Summary */}
      <section className="dashboard-section">
        <div className="section-header">
          <h2 className="section-title">Today's Nutrition</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => setView(VIEWS.MEALS)}>
            Log Food
          </button>
        </div>
        <div className="nutrition-summary card">
          {hasNutritionData ? (
            <>
              <div className="nutrition-grid">
                <div className="nutrition-item">
                  <div className="nutrition-value">{nutrition.calories}</div>
                  <div className="nutrition-label">Calories</div>
                </div>
                <div className="nutrition-item primary">
                  <div className="nutrition-value text-success">{nutrition.protein}g</div>
                  <div className="nutrition-label">Protein</div>
                </div>
                <div className="nutrition-item">
                  <div className="nutrition-value">{nutrition.carbs}g</div>
                  <div className="nutrition-label">Carbs</div>
                </div>
                <div className="nutrition-item">
                  <div className="nutrition-value">{nutrition.fats}g</div>
                  <div className="nutrition-label">Fats</div>
                </div>
              </div>
              <div className="protein-progress mt-4">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-secondary">Protein Progress</span>
                  <span className="text-sm font-medium">{Math.round(proteinProgress)}%</span>
                </div>
                <div className="progress-bar progress-bar-success">
                  <div className="progress-bar-fill" style={{ width: `${proteinProgress}%` }}></div>
                </div>
              </div>
            </>
          ) : (
            <div className="nutrition-empty">
              <span className="empty-icon">🍽️</span>
              <p>No meals logged yet today</p>
              <button className="btn btn-primary btn-sm mt-3" onClick={() => setView(VIEWS.MEALS)}>
                Log First Meal
              </button>
            </div>
          )}
        </div>
      </section>



      <style>{`
        .dashboard {
          max-width: 1000px;
          margin: 0 auto;
          padding-bottom: 100px;
        }

        /* Holiday Banner */
        .holiday-banner {
          display: flex;
          align-items: center;
          gap: var(--spacing-4);
          padding: var(--spacing-4);
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(245, 158, 11, 0.1) 100%);
          border: 1px solid rgba(251, 191, 36, 0.3);
          border-radius: var(--radius-xl);
          margin-bottom: var(--spacing-6);
        }

        .holiday-icon {
          font-size: 2rem;
        }

        .holiday-content p {
          font-size: var(--font-size-sm);
          color: var(--color-text-secondary);
          margin-top: var(--spacing-1);
        }

        /* Phase Banner */
        .phase-banner {
          padding: var(--spacing-4);
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%);
          border: 1px solid rgba(99, 102, 241, 0.3);
          border-radius: var(--radius-xl);
          margin-bottom: var(--spacing-6);
        }

        .phase-header {
          display: flex;
          align-items: center;
          gap: var(--spacing-3);
          margin-bottom: var(--spacing-3);
        }

        .phase-icon {
          font-size: 1.5rem;
        }

        .phase-info {
          flex: 1;
        }

        .phase-title {
          font-weight: var(--font-weight-semibold);
          font-size: var(--font-size-base);
        }

        .phase-subtitle {
          font-size: var(--font-size-sm);
          color: var(--color-text-secondary);
          margin-top: var(--spacing-1);
        }

        .phase-progress-bar {
          height: 6px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: var(--radius-full);
          overflow: hidden;
          margin-bottom: var(--spacing-3);
        }

        .phase-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--color-accent) 0%, var(--color-primary) 100%);
          border-radius: var(--radius-full);
          transition: width 0.3s ease;
        }

        .phase-targets {
          display: flex;
          gap: var(--spacing-4);
          font-size: var(--font-size-sm);
          color: var(--color-text-secondary);
        }

        .target-item {
          display: flex;
          align-items: center;
          gap: var(--spacing-1);
        }

        .dashboard-hero {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--spacing-8);
          flex-wrap: wrap;
          gap: var(--spacing-4);
        }

        .hero-title {
          font-size: var(--font-size-4xl);
          font-weight: var(--font-weight-bold);
          margin: var(--spacing-2) 0;
        }

        .hero-date {
          font-size: var(--font-size-lg);
        }

        .current-block-indicator {
          display: flex;
          align-items: center;
          gap: var(--spacing-2);
          margin-top: var(--spacing-3);
          padding: var(--spacing-2) var(--spacing-3);
          background: rgba(255, 255, 255, 0.05);
          border-radius: var(--radius-full);
          font-size: var(--font-size-sm);
        }

        .block-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .block-name {
          font-weight: var(--font-weight-medium);
        }

        .block-time {
          color: var(--color-text-muted);
        }

        .hero-quote {
          max-width: 300px;
          padding: var(--spacing-4);
          background: var(--color-bg-card);
          border-left: 3px solid var(--color-accent);
          border-radius: var(--radius-md);
        }

        .quote-text {
          font-style: italic;
          color: var(--color-text-secondary);
          font-size: var(--font-size-sm);
        }

        .dashboard-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: var(--spacing-4);
          margin-bottom: var(--spacing-8);
        }

        .stat-card {
          display: flex;
          align-items: center;
          gap: var(--spacing-3);
          padding: var(--spacing-3) var(--spacing-4);
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .stat-card:hover {
          background: var(--color-bg-card-hover);
          transform: translateY(-2px);
        }

        /* Urgency styles */
        .stat-card.urgency-urgent,
        .stat-card.urgency-final {
          border-color: var(--color-warning);
          animation: urgency-pulse 2s infinite;
        }

        @keyframes urgency-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.4); }
          50% { box-shadow: 0 0 20px 0 rgba(251, 191, 36, 0.2); }
        }

        .stat-icon {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-lg);
          flex-shrink: 0;
        }

        .stat-icon svg {
          width: 20px;
          height: 20px;
        }

        .stat-icon-tasks {
          background: var(--color-accent-light);
          color: var(--color-accent);
        }

        .stat-icon-training {
          background: var(--color-success-light);
          color: var(--color-success);
        }

        .stat-icon-meals {
          background: var(--color-warning-light);
          color: var(--color-warning);
        }

        .stat-icon-protein {
          background: var(--color-info-light);
          color: var(--color-info);
        }

        .stat-content {
          flex: 1;
        }

        .stat-value {
          font-size: var(--font-size-lg);
          font-weight: var(--font-weight-semibold);
        }

        .stat-value .text-muted {
          font-size: var(--font-size-sm);
          font-weight: var(--font-weight-normal);
        }

        .stat-label {
          font-size: var(--font-size-xs);
          color: var(--color-text-secondary);
        }

        .dashboard-section {
          margin-bottom: var(--spacing-8);
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--spacing-4);
        }

        .section-title {
          font-size: var(--font-size-xl);
          font-weight: var(--font-weight-semibold);
        }

        .task-list {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-3);
        }

        .task-card {
          display: flex;
          align-items: center;
          gap: var(--spacing-4);
          padding: var(--spacing-4);
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          transition: all var(--transition-fast);
        }

        .task-card:hover {
          background: var(--color-bg-card-hover);
        }

        .task-checkbox {
          width: 24px;
          height: 24px;
          border: 2px solid var(--color-border-light);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .task-checkbox:hover {
          border-color: var(--color-accent);
        }

        .task-info {
          flex: 1;
        }

        .task-title {
          font-weight: var(--font-weight-medium);
          margin-bottom: var(--spacing-1);
        }

        .task-meta {
          display: flex;
          gap: var(--spacing-2);
        }

        .nutrition-summary {
          padding: var(--spacing-6);
        }

        .nutrition-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: var(--spacing-4);
          text-align: center;
        }

        .nutrition-item.primary {
          position: relative;
        }

        .nutrition-item.primary::after {
          content: '★';
          position: absolute;
          top: -8px;
          right: 50%;
          transform: translateX(50%);
          color: var(--color-success);
          font-size: 0.7rem;
        }

        .nutrition-value {
          font-size: var(--font-size-2xl);
          font-weight: var(--font-weight-bold);
        }

        .nutrition-label {
          font-size: var(--font-size-sm);
          color: var(--color-text-secondary);
          margin-top: var(--spacing-1);
        }

        .nutrition-empty {
          text-align: center;
          padding: var(--spacing-6);
          color: var(--color-text-secondary);
        }

        .nutrition-empty .empty-icon {
          font-size: 2.5rem;
          margin-bottom: var(--spacing-3);
          display: block;
        }



        @media (max-width: 768px) {
          .nutrition-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          
          .dashboard-hero {
            flex-direction: column;
          }
          
          .hero-quote {
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

// Task Card Component
function TaskCard({ task }) {
  return (
    <div className="task-card">
      <div className="task-checkbox" />
      <div className="task-info">
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          <span className="badge badge-accent" style={{ textTransform: 'capitalize' }}>
            {task.category}
          </span>
          {task.priority === 'high' && (
            <span className="badge badge-error">High</span>
          )}
        </div>
      </div>
    </div>
  );
}

// Circle Progress Component
function CircleProgress({ percentage, color }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width="44" height="44" className="circle-progress">
      <circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        stroke="var(--color-bg-tertiary)"
        strokeWidth="4"
      />
      <circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 22 22)"
        style={{ transition: 'stroke-dashoffset var(--transition-base)' }}
      />
    </svg>
  );
}

// Icons
function TasksIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function TrainingIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5h11" />
      <path d="M6.5 17.5h11" />
      <path d="M3 12h18" />
      <path d="M4 8v8" />
      <path d="M20 8v8" />
    </svg>
  );
}

function MealsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </svg>
  );
}

function ProteinIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}


