/**
 * WeeklyReview - Structured weekly progress review with decision tree suggestions
 * Implements SRS Section 6.2: Weekly Review Workflow
 */

import { useState, useEffect } from 'react';
import { getDB, STORES } from '../../db/database';
import { getDateString } from '../../db/dayStore';
import { getActivePhase, getPhaseProgress, calculatePhaseWeek } from '../../db/phaseStore';

export default function WeeklyReview() {
  const [weekData, setWeekData] = useState(null);
  const [previousWeekData, setPreviousWeekData] = useState(null);
  const [activePhase, setActivePhase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState([]);

  useEffect(() => {
    loadWeeklyData();
  }, []);

  const getWeekDateRange = (weeksAgo = 0) => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayOfWeek - (weeksAgo * 7));
    sunday.setHours(0, 0, 0, 0);

    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    saturday.setHours(23, 59, 59, 999);

    return {
      start: getDateString(sunday),
      end: getDateString(saturday),
    };
  };

  const loadWeeklyData = async () => {
    try {
      const db = await getDB();

      const thisWeek = getWeekDateRange(0);
      const lastWeek = getWeekDateRange(1);

      // Load all data
      const days = await db.getAll(STORES.DAYS);
      const tasks = await db.getAll(STORES.TASKS);
      const training = await db.getAll(STORES.TRAINING_SESSIONS);
      const meals = await db.getAll(STORES.MEALS);

      // Filter this week's data
      const thisWeekData = calculateWeekStats(days, tasks, training, meals, thisWeek);
      const lastWeekData = calculateWeekStats(days, tasks, training, meals, lastWeek);

      setWeekData(thisWeekData);
      setPreviousWeekData(lastWeekData);

      // Load active phase
      const phase = await getActivePhase();
      if (phase) {
        setActivePhase(phase);
      }

      // Generate recommendations based on data
      generateRecommendations(thisWeekData, lastWeekData);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load weekly data:', error);
      setLoading(false);
    }
  };

  const calculateWeekStats = (days, tasks, training, meals, dateRange) => {
    const daysInRange = days.filter(d => d.date >= dateRange.start && d.date <= dateRange.end);
    const tasksInRange = tasks.filter(t => t.date >= dateRange.start && t.date <= dateRange.end);
    const trainingInRange = training.filter(t => t.date >= dateRange.start && t.date <= dateRange.end);
    const mealsInRange = meals.filter(m => m.date >= dateRange.start && m.date <= dateRange.end);

    // Task stats
    const tasksCompleted = tasksInRange.filter(t => t.status === 'completed').length;
    const tasksTotal = tasksInRange.length;
    const taskCompletionRate = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;

    // Training stats
    const workoutsCompleted = trainingInRange.filter(t => t.status === 'completed').length;
    const workoutsTotal = trainingInRange.length;

    // Nutrition stats
    const completedMeals = mealsInRange.filter(m => m.status === 'completed');
    const totalProtein = completedMeals.reduce((sum, m) => sum + (m.totals?.protein || 0), 0);
    const totalCalories = completedMeals.reduce((sum, m) => sum + (m.totals?.calories || 0), 0);
    const daysWithMeals = new Set(completedMeals.map(m => m.date)).size;
    const avgProtein = daysWithMeals > 0 ? Math.round(totalProtein / daysWithMeals) : 0;
    const avgCalories = daysWithMeals > 0 ? Math.round(totalCalories / daysWithMeals) : 0;

    // Energy/Sleep average (from day records)
    const daysWithEnergy = daysInRange.filter(d => d.energyLevel);
    const avgEnergy = daysWithEnergy.length > 0
      ? Math.round(daysWithEnergy.reduce((sum, d) => sum + d.energyLevel, 0) / daysWithEnergy.length * 10) / 10
      : null;

    // Active days
    const activeDays = daysInRange.filter(d => d.status === 'active' || d.status === 'closed').length;

    return {
      dateRange,
      tasksCompleted,
      tasksTotal,
      taskCompletionRate,
      workoutsCompleted,
      workoutsTotal,
      avgProtein,
      avgCalories,
      avgEnergy,
      activeDays,
    };
  };

  const generateRecommendations = (current, previous) => {
    const recs = [];

    // Task completion recommendations
    if (current.taskCompletionRate < 50 && current.tasksTotal > 0) {
      recs.push({
        type: 'warning',
        icon: '📋',
        title: 'Task Load Adjustment',
        message: 'Consider reducing your daily task count. Fewer, more focused tasks lead to better consistency.',
      });
    } else if (current.taskCompletionRate >= 90) {
      recs.push({
        type: 'success',
        icon: '🎯',
        title: 'Excellent Task Completion',
        message: 'Great job! You might be ready to take on slightly more challenging tasks.',
      });
    }

    // Workout recommendations
    if (current.workoutsCompleted < 3 && current.workoutsTotal >= 3) {
      recs.push({
        type: 'info',
        icon: '💪',
        title: 'Training Consistency',
        message: 'Try to hit at least 3 workouts per week for optimal progress.',
      });
    }

    // Protein recommendations
    if (current.avgProtein > 0 && current.avgProtein < 120) {
      recs.push({
        type: 'info',
        icon: '🥚',
        title: 'Protein Intake',
        message: `Your average is ${current.avgProtein}g. Consider adding more protein sources to reach your goal.`,
      });
    }

    // Trend analysis
    if (previous && current.taskCompletionRate > previous.taskCompletionRate + 10) {
      recs.push({
        type: 'success',
        icon: '📈',
        title: 'Positive Trend',
        message: `Task completion improved by ${current.taskCompletionRate - previous.taskCompletionRate}% from last week!`,
      });
    }

    if (recs.length === 0) {
      recs.push({
        type: 'success',
        icon: '✨',
        title: 'Looking Good',
        message: 'Your metrics are on track. Keep up the great work!',
      });
    }

    setRecommendations(recs);
  };

  const renderTrend = (current, previous, higherIsBetter = true) => {
    if (!previous && previous !== 0) return null;
    const diff = current - previous;
    if (diff === 0) return <span className="trend-neutral">→</span>;

    const isPositive = higherIsBetter ? diff > 0 : diff < 0;
    return (
      <span className={`trend ${isPositive ? 'trend-up' : 'trend-down'}`}>
        {diff > 0 ? '+' : ''}{diff}
        {isPositive ? ' ↑' : ' ↓'}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="weekly-review loading">
        <div className="loading-spinner" />
        <p>Loading weekly data...</p>
      </div>
    );
  }

  return (
    <div className="weekly-review">
      <header className="review-header">
        <h2>📊 Weekly Review</h2>
        {activePhase && (
          <span className="phase-badge">
            {activePhase.name} • Week {calculatePhaseWeek(activePhase.startDate, new Date())}
          </span>
        )}
      </header>

      {/* Week Overview */}
      <section className="review-section">
        <h3>This Week's Progress</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">✓</div>
            <div className="stat-content">
              <div className="stat-value">
                {weekData?.taskCompletionRate || 0}%
                {renderTrend(weekData?.taskCompletionRate, previousWeekData?.taskCompletionRate)}
              </div>
              <div className="stat-label">Task Completion</div>
              <div className="stat-detail">{weekData?.tasksCompleted || 0} of {weekData?.tasksTotal || 0} tasks</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">💪</div>
            <div className="stat-content">
              <div className="stat-value">
                {weekData?.workoutsCompleted || 0}
                {renderTrend(weekData?.workoutsCompleted, previousWeekData?.workoutsCompleted)}
              </div>
              <div className="stat-label">Workouts</div>
              <div className="stat-detail">of {weekData?.workoutsTotal || 0} planned</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🥚</div>
            <div className="stat-content">
              <div className="stat-value">
                {weekData?.avgProtein || 0}g
                {renderTrend(weekData?.avgProtein, previousWeekData?.avgProtein)}
              </div>
              <div className="stat-label">Avg. Protein/Day</div>
              <div className="stat-detail">{weekData?.avgCalories || 0} avg. calories</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">⚡</div>
            <div className="stat-content">
              <div className="stat-value">
                {weekData?.avgEnergy || 'N/A'}
                {weekData?.avgEnergy && renderTrend(weekData?.avgEnergy, previousWeekData?.avgEnergy)}
              </div>
              <div className="stat-label">Avg. Energy Level</div>
              <div className="stat-detail">{weekData?.activeDays || 0} active days</div>
            </div>
          </div>
        </div>
      </section>

      {/* Recommendations */}
      <section className="review-section">
        <h3>Insights & Recommendations</h3>
        <div className="recommendations-list">
          {recommendations.map((rec, idx) => (
            <div key={idx} className={`recommendation-card ${rec.type}`}>
              <span className="rec-icon">{rec.icon}</span>
              <div className="rec-content">
                <strong>{rec.title}</strong>
                <p>{rec.message}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Week-over-Week Comparison */}
      {previousWeekData && (
        <section className="review-section">
          <h3>Week-over-Week</h3>
          <div className="comparison-table">
            <div className="comparison-row header">
              <span>Metric</span>
              <span>Last Week</span>
              <span>This Week</span>
              <span>Change</span>
            </div>
            <div className="comparison-row">
              <span>Tasks Completed</span>
              <span>{previousWeekData.taskCompletionRate}%</span>
              <span>{weekData?.taskCompletionRate || 0}%</span>
              <span>{renderTrend(weekData?.taskCompletionRate || 0, previousWeekData.taskCompletionRate)}</span>
            </div>
            <div className="comparison-row">
              <span>Workouts</span>
              <span>{previousWeekData.workoutsCompleted}</span>
              <span>{weekData?.workoutsCompleted || 0}</span>
              <span>{renderTrend(weekData?.workoutsCompleted || 0, previousWeekData.workoutsCompleted)}</span>
            </div>
            <div className="comparison-row">
              <span>Avg. Protein</span>
              <span>{previousWeekData.avgProtein}g</span>
              <span>{weekData?.avgProtein || 0}g</span>
              <span>{renderTrend(weekData?.avgProtein || 0, previousWeekData.avgProtein)}</span>
            </div>
            <div className="comparison-row">
              <span>Active Days</span>
              <span>{previousWeekData.activeDays}</span>
              <span>{weekData?.activeDays || 0}</span>
              <span>{renderTrend(weekData?.activeDays || 0, previousWeekData.activeDays)}</span>
            </div>
          </div>
        </section>
      )}

      <style>{weeklyReviewStyles}</style>
    </div>
  );
}

const weeklyReviewStyles = `
  .weekly-review {
    padding: var(--spacing-4);
    max-width: 800px;
    margin: 0 auto;
    color: var(--color-text-primary);
  }

  .weekly-review.loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    color: var(--color-text-secondary);
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: var(--spacing-4);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .review-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-6);
    flex-wrap: wrap;
    gap: var(--spacing-2);
  }

  .review-header h2 {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    margin: 0;
    color: var(--color-text-primary);
  }

  .phase-badge {
    background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-primary) 100%);
    color: white;
    padding: var(--spacing-1) var(--spacing-3);
    border-radius: var(--radius-full);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .review-section {
    margin-bottom: var(--spacing-8);
  }

  .review-section h3 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    margin-bottom: var(--spacing-4);
    color: var(--color-text-primary);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--spacing-4);
  }

  .stat-card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: var(--spacing-4);
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-3);
    transition: all var(--transition-fast);
  }

  .stat-card:hover {
    border-color: var(--color-accent);
    transform: translateY(-2px);
  }

  .stat-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .stat-content {
    flex: 1;
  }

  .stat-value {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    color: var(--color-text-primary);
  }

  .stat-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-top: var(--spacing-1);
  }

  .stat-detail {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    margin-top: var(--spacing-1);
  }

  .trend {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .trend-up {
    color: var(--color-success);
  }

  .trend-down {
    color: var(--color-error);
  }

  .trend-neutral {
    color: var(--color-text-muted);
  }

  /* Recommendations */
  .recommendations-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .recommendation-card {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-3);
    padding: var(--spacing-4);
    border-radius: var(--radius-lg);
    border-left: 4px solid;
  }

  .recommendation-card.success {
    background: var(--color-success-light);
    border-left-color: var(--color-success);
  }

  .recommendation-card.warning {
    background: var(--color-warning-light);
    border-left-color: var(--color-warning);
  }

  .recommendation-card.info {
    background: var(--color-info-light);
    border-left-color: var(--color-info);
  }

  .rec-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .rec-content strong {
    display: block;
    margin-bottom: var(--spacing-1);
    color: var(--color-text-primary);
  }

  .rec-content p {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  /* Comparison Table */
  .comparison-table {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  .comparison-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    padding: var(--spacing-3) var(--spacing-4);
    border-bottom: 1px solid var(--color-border);
  }

  .comparison-row:last-child {
    border-bottom: none;
  }

  .comparison-row.header {
    background: var(--color-bg-tertiary);
    font-weight: var(--font-weight-semibold);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .comparison-row span {
    display: flex;
    align-items: center;
  }

  @media (max-width: 600px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .comparison-row {
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-2);
    }

    .comparison-row.header span:nth-child(3),
    .comparison-row.header span:nth-child(4),
    .comparison-row span:nth-child(3),
    .comparison-row span:nth-child(4) {
      display: none;
    }
  }
`;
