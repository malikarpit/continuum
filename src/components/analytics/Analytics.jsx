/**
 * Analytics - Progress tracking and insights
 */

import { useState, useEffect } from 'react';
import { getDB, STORES } from '../../db/database';
import { getDateString } from '../../db/dayStore';
import { getTaskCompletionChartData, getWeeklySummary, getTimeBlockAnalytics } from '../../db/analyticsEngine';
import WeeklyReview from './WeeklyReview';

export default function Analytics() {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'weekly'
  const [timeRange, setTimeRange] = useState('7d');
  const [stats, setStats] = useState({
    tasks: { completed: 0, total: 0, rate: 0 },
    training: { completed: 0, total: 0, avgDuration: 0 },
    nutrition: { avgCalories: 0, avgProtein: 0 },
    days: { active: 0, inactive: 0, closed: 0 },
  });
  const [weeklyData, setWeeklyData] = useState(null);
  const [blockStats, setBlockStats] = useState(null);
  const [selectedChartDay, setSelectedChartDay] = useState(null);
  const [allTasks, setAllTasks] = useState([]);

  // Calculate date range
  const getDaysAgo = (days) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return getDateString(date);
  };

  const getRangeStart = () => {
    switch (timeRange) {
      case '7d': return getDaysAgo(7);
      case '30d': return getDaysAgo(30);
      case '90d': return getDaysAgo(90);
      default: return getDaysAgo(7);
    }
  };

  useEffect(() => {
    const fetchStats = async () => {
      const db = await getDB();
      const today = getDateString();
      const startDate = getRangeStart();

      // Fetch all data
      const days = await db.getAll(STORES.DAYS);
      const tasks = await db.getAll(STORES.TASKS);
      const training = await db.getAll(STORES.TRAINING_SESSIONS);
      const meals = await db.getAll(STORES.MEALS);

      // Filter by date range
      const daysInRange = days.filter(d => d.date >= startDate && d.date <= today);
      const tasksInRange = tasks.filter(t => t.date >= startDate && t.date <= today);
      const trainingInRange = training.filter(t => t.date >= startDate && t.date <= today);
      const mealsInRange = meals.filter(m => m.date >= startDate && m.date <= today);

      // Calculate stats
      const completedTasks = tasksInRange.filter(t => t.status === 'completed').length;
      const totalTasks = tasksInRange.length;

      const completedTraining = trainingInRange.filter(t => t.status === 'completed').length;
      const totalTraining = trainingInRange.length;
      const avgDuration = completedTraining > 0
        ? Math.round(trainingInRange.filter(t => t.totalDuration).reduce((sum, t) => sum + t.totalDuration, 0) / completedTraining)
        : 0;

      const completedMeals = mealsInRange.filter(m => m.status === 'completed');
      const totalCalories = completedMeals.reduce((sum, m) => sum + (m.totals?.calories || 0), 0);
      const totalProtein = completedMeals.reduce((sum, m) => sum + (m.totals?.protein || 0), 0);
      const daysWithMeals = new Set(completedMeals.map(m => m.date)).size;

      setStats({
        tasks: {
          completed: completedTasks,
          total: totalTasks,
          rate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        },
        training: {
          completed: completedTraining,
          total: totalTraining,
          avgDuration,
        },
        nutrition: {
          avgCalories: daysWithMeals > 0 ? Math.round(totalCalories / daysWithMeals) : 0,
          avgProtein: daysWithMeals > 0 ? Math.round(totalProtein / daysWithMeals) : 0,
        },
        days: {
          active: daysInRange.filter(d => d.status === 'active').length,
          inactive: daysInRange.filter(d => d.status === 'inactive').length,
          closed: daysInRange.filter(d => d.status === 'closed').length,
        },
      });

      // Store tasks for use in popup
      setAllTasks(tasksInRange);

      // Fetch weekly chart data
      const daysForChart = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const chartData = await getTaskCompletionChartData(daysForChart);
      setWeeklyData(chartData);

      // Fetch time block analytics
      const blocks = await getTimeBlockAnalytics(daysForChart);
      setBlockStats(blocks);
    };

    fetchStats();
  }, [timeRange]);

  return (
    <div className="analytics-view animate-fade-in">
      <header className="view-header">
        <div>
          <h1 className="view-title">Analytics</h1>
          <p className="view-subtitle text-secondary">Track your progress over time</p>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="analytics-tabs">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button
          className={`tab-btn ${activeTab === 'weekly' ? 'active' : ''}`}
          onClick={() => setActiveTab('weekly')}
        >
          📅 Weekly Review
        </button>
      </div>

      {/* Weekly Review Tab */}
      {activeTab === 'weekly' && <WeeklyReview />}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* Time Range Selector */}
          <div className="time-range-selector">
            {[
              { value: '7d', label: 'Last 7 days' },
              { value: '30d', label: 'Last 30 days' },
              { value: '90d', label: 'Last 90 days' },
            ].map(option => (
              <button
                key={option.value}
                className={`range-btn ${timeRange === option.value ? 'active' : ''}`}
                onClick={() => setTimeRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Summary Cards */}
          <div className="stats-grid">
            {/* Task Stats */}
            <div className="stat-card card">
              <div className="stat-header">
                <span className="stat-icon">✓</span>
                <h3>Tasks</h3>
              </div>
              <div className="stat-value-large">{stats.tasks.rate}%</div>
              <div className="stat-detail text-secondary">
                {stats.tasks.completed} of {stats.tasks.total} completed
              </div>
              <div className="mini-progress">
                <div className="mini-progress-fill" style={{ width: `${stats.tasks.rate}%` }} />
              </div>
            </div>

            {/* Training Stats */}
            <div className="stat-card card">
              <div className="stat-header">
                <span className="stat-icon">💪</span>
                <h3>Training</h3>
              </div>
              <div className="stat-value-large">{stats.training.completed}</div>
              <div className="stat-detail text-secondary">
                workouts completed
              </div>
              {stats.training.avgDuration > 0 && (
                <div className="stat-extra text-accent">
                  Avg. {stats.training.avgDuration} min/session
                </div>
              )}
            </div>

            {/* Nutrition Stats */}
            <div className="stat-card card">
              <div className="stat-header">
                <span className="stat-icon">🍽️</span>
                <h3>Nutrition</h3>
              </div>
              <div className="stat-value-large text-success">{stats.nutrition.avgProtein}g</div>
              <div className="stat-detail text-secondary">
                avg. daily protein
              </div>
              <div className="stat-extra">
                {stats.nutrition.avgCalories} avg. calories/day
              </div>
            </div>

            {/* Day Status */}
            <div className="stat-card card">
              <div className="stat-header">
                <span className="stat-icon">📅</span>
                <h3>Continuity</h3>
              </div>
              <div className="stat-value-large">{stats.days.active + stats.days.closed}</div>
              <div className="stat-detail text-secondary">
                days tracked
              </div>
              {stats.days.inactive > 0 && (
                <div className="stat-extra text-warning">
                  {stats.days.inactive} inactive days
                </div>
              )}
            </div>
          </div>

          {/* Key Insights */}
          <section className="insights-section mt-8">
            <h2 className="section-title">Key Insights</h2>
            <div className="insights-list">
              {stats.tasks.rate >= 80 && (
                <div className="insight positive">
                  <span className="insight-icon">🎯</span>
                  <span>Excellent task completion rate! Keep it up.</span>
                </div>
              )}
              {stats.tasks.rate < 50 && stats.tasks.total > 0 && (
                <div className="insight warning">
                  <span className="insight-icon">💡</span>
                  <span>Consider reducing the number of daily tasks to stay consistent.</span>
                </div>
              )}
              {stats.nutrition.avgProtein < 100 && (
                <div className="insight info">
                  <span className="insight-icon">🥚</span>
                  <span>Try adding more protein sources to your meals.</span>
                </div>
              )}
              {stats.training.completed >= 3 && (
                <div className="insight positive">
                  <span className="insight-icon">💪</span>
                  <span>Great workout consistency! Recovery is just as important.</span>
                </div>
              )}
              {stats.days.inactive === 0 && stats.days.active + stats.days.closed > 0 && (
                <div className="insight positive">
                  <span className="insight-icon">🔥</span>
                  <span>Perfect continuity - you've opened the app every day!</span>
                </div>
              )}
            </div>
          </section>

          {/* Weekly Task Completion Chart */}
          {weeklyData && weeklyData.raw && weeklyData.raw.length > 0 && (
            <section className="chart-section mt-8">
              <h2 className="section-title">📊 Daily Task Completion</h2>
              <p className="text-sm text-secondary mb-3">Click a day to see tasks</p>
              <div className="bar-chart">
                {weeklyData.raw.slice(-7).map((dayData, i) => {
                  const value = dayData.completed || 0;
                  const maxValue = Math.max(...weeklyData.raw.map(d => d.completed || 0), 1);
                  return (
                    <div
                      key={i}
                      className="bar-item"
                      onClick={() => setSelectedChartDay({ date: dayData.date, label: dayData.label })}
                      title={`Click to see tasks for ${dayData.label}`}
                    >
                      <div
                        className="bar"
                        style={{ height: `${(value / maxValue) * 100}%` }}
                      >
                        <span className="bar-value">{value}</span>
                      </div>
                      <span className="bar-label">{dayData.label.slice(0, 3)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Task List Popup */}
          {selectedChartDay && (
            <div className="task-list-modal" onClick={() => setSelectedChartDay(null)}>
              <div className="task-list-content" onClick={e => e.stopPropagation()}>
                <div className="task-list-header">
                  <h3>Tasks - {selectedChartDay.label}</h3>
                  <button className="btn btn-ghost" onClick={() => setSelectedChartDay(null)}>×</button>
                </div>
                {(() => {
                  const dayTasks = allTasks.filter(t => t.date === selectedChartDay.date);
                  if (dayTasks.length === 0) {
                    return <p className="text-secondary text-center py-4">No tasks for this day</p>;
                  }
                  const completed = dayTasks.filter(t => t.status === 'completed');
                  const pending = dayTasks.filter(t => t.status !== 'completed');
                  return (
                    <>
                      {completed.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm text-success mb-2">✓ Completed ({completed.length})</p>
                          {completed.map(task => (
                            <div key={task.id} className="task-item completed">
                              <span className="task-status-icon">✓</span>
                              <span className="task-name">{task.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {pending.length > 0 && (
                        <div>
                          <p className="text-sm text-warning mb-2">○ Pending ({pending.length})</p>
                          {pending.map(task => (
                            <div key={task.id} className="task-item">
                              <span className="task-status-icon">○</span>
                              <span className="task-name">{task.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Time Block Completion Heatmap */}
          {blockStats && Object.keys(blockStats).length > 0 && (
            <section className="blocks-section mt-8">
              <h2 className="section-title">⏱️ Time Block Performance</h2>
              <div className="block-grid">
                {Object.entries(blockStats).map(([block, data]) => (
                  <div key={block} className="block-stat-card">
                    <div className="block-name">{block}</div>
                    <div className="block-rate" style={{ color: data.rate > 80 ? 'var(--color-success)' : data.rate > 50 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                      {data.rate || 0}%
                    </div>
                    <div className="block-detail">{data.completed || 0}/{data.total || 0} tasks</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Data Note */}
          <p className="analytics-note text-muted mt-8 text-center">
            All data stored locally on your device 🔒
          </p>

          <style>{analyticsStyles}</style>
        </>
      )}
    </div>
  );
}

const analyticsStyles = `
  .analytics-view {
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

  .analytics-tabs {
    display: flex;
    gap: var(--spacing-2);
    margin-bottom: var(--spacing-6);
    padding: var(--spacing-1);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-lg);
    width: fit-content;
  }

  .tab-btn {
    padding: var(--spacing-2) var(--spacing-4);
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .tab-btn:hover {
    color: var(--color-text-primary);
  }

  .tab-btn.active {
    background: var(--color-bg-card);
    color: var(--color-text-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .time-range-selector {
    display: flex;
    gap: var(--spacing-2);
    margin-bottom: var(--spacing-6);
  }

  .range-btn {
    padding: var(--spacing-2) var(--spacing-4);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .range-btn:hover {
    border-color: var(--color-accent);
    color: var(--color-text-primary);
  }

  .range-btn.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--spacing-4);
  }

  .stat-card {
    padding: var(--spacing-5);
  }

  .stat-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    margin-bottom: var(--spacing-3);
  }

  .stat-icon {
    font-size: 1.25rem;
  }

  .stat-header h3 {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-value-large {
    font-size: var(--font-size-4xl);
    font-weight: var(--font-weight-bold);
    line-height: 1;
    margin-bottom: var(--spacing-2);
  }

  .stat-detail {
    font-size: var(--font-size-sm);
    margin-bottom: var(--spacing-2);
  }

  .stat-extra {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .mini-progress {
    height: 4px;
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-full);
    margin-top: var(--spacing-3);
    overflow: hidden;
  }

  .mini-progress-fill {
    height: 100%;
    background: var(--color-success);
    border-radius: var(--radius-full);
    transition: width 0.5s ease;
  }

  .insights-section {
    margin-top: var(--spacing-8);
  }

  .section-title {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    margin-bottom: var(--spacing-4);
  }

  .insights-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .insight {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    padding: var(--spacing-4);
    border-radius: var(--radius-lg);
    font-size: var(--font-size-sm);
  }

  .insight.positive {
    background: var(--color-success-light);
    border-left: 3px solid var(--color-success);
  }

  .insight.warning {
    background: var(--color-warning-light);
    border-left: 3px solid var(--color-warning);
  }

  .insight.info {
    background: var(--color-info-light);
    border-left: 3px solid var(--color-info);
  }

  .insight-icon {
    font-size: 1.25rem;
  }

  .analytics-note {
    font-size: var(--font-size-sm);
  }

  /* Bar Chart Styles - Improved */
  .bar-chart {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    height: 180px;
    padding: var(--spacing-4);
    background: var(--color-bg-card);
    border-radius: var(--radius-lg);
    gap: var(--spacing-3);
  }

  .bar-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    max-width: 80px;
    cursor: pointer;
    padding: var(--spacing-2);
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
  }

  .bar-item:hover {
    background: var(--color-bg-tertiary);
  }

  .bar {
    width: 100%;
    background: linear-gradient(180deg, var(--color-accent) 0%, var(--color-primary) 100%);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    min-height: 8px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    transition: all 0.3s ease;
  }

  .bar-item:hover .bar {
    filter: brightness(1.1);
    transform: scaleY(1.02);
  }

  .bar-value {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    color: white;
    padding-top: var(--spacing-1);
  }

  .bar-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    margin-top: var(--spacing-2);
    padding-top: var(--spacing-2);
    border-top: 1px solid var(--color-border);
    width: 100%;
    text-align: center;
  }

  /* Block Grid Styles */
  .block-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--spacing-3);
  }

  .block-stat-card {
    background: var(--color-bg-card);
    border-radius: var(--radius-lg);
    padding: var(--spacing-4);
    text-align: center;
  }

  .block-name {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    margin-bottom: var(--spacing-2);
  }

  .block-rate {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
  }

  .block-detail {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    margin-top: var(--spacing-1);
  }

  /* Task List Modal */
  .task-list-modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--spacing-4);
  }

  .task-list-content {
    background: var(--color-bg-card);
    border-radius: var(--radius-xl);
    padding: var(--spacing-5);
    max-width: 400px;
    width: 100%;
    max-height: 80vh;
    overflow-y: auto;
  }

  .task-list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-4);
  }

  .task-list-header h3 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
  }

  .task-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    padding: var(--spacing-3);
    border-radius: var(--radius-md);
    background: var(--color-bg-tertiary);
    margin-bottom: var(--spacing-2);
  }

  .task-item.completed {
    opacity: 0.7;
  }

  .task-item.completed .task-name {
    text-decoration: line-through;
  }

  .task-status-icon {
    font-size: 1rem;
  }

  .task-name {
    flex: 1;
    font-size: var(--font-size-sm);
  }
`;
