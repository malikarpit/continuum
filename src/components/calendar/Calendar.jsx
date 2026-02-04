/**
 * Calendar - Day history view with visual indicators
 */

import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import { DAY_STATUS, getDateString, getDaysInRange } from '../../db/dayStore';
import { getDB, STORES } from '../../db/database';

export default function Calendar() {
  const { selectedDate, setSelectedDate, refreshDay } = useAppStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [daysData, setDaysData] = useState({});
  const [selectedDayInfo, setSelectedDayInfo] = useState(null);

  // Fetch days data for the current month
  useEffect(() => {
    const fetchDays = async () => {
      const db = await getDB();
      const allDays = await db.getAll(STORES.DAYS);
      const daysMap = {};
      allDays.forEach(day => {
        daysMap[day.date] = day;
      });
      setDaysData(daysMap);
    };
    fetchDays();
  }, [selectedDate]);

  // Calendar helpers
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPadding = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1));

  const handleDayClick = async (date) => {
    const dateStr = getDateString(date);
    const today = getDateString();

    // Don't allow clicking future dates
    if (dateStr > today) return;

    // Toggle collapse if clicking same date
    if (selectedDayInfo?.date === dateStr) {
      setSelectedDayInfo(null);
      return;
    }

    // Update the selected date in the store and refresh data
    setSelectedDate(dateStr);
    await refreshDay();
    const dayInfo = daysData[dateStr];
    setSelectedDayInfo({ date: dateStr, isToday: dateStr === today, ...dayInfo });
  };

  const getDayStatus = (date) => {
    const dateStr = getDateString(date);
    const today = getDateString();

    if (dateStr > today) return 'future';

    const day = daysData[dateStr];
    if (!day) return dateStr < today ? 'inactive' : 'none';
    return day.status;
  };

  // Helper functions for badge display
  const getBadgeClass = (dayInfo) => {
    if (dayInfo.isToday && dayInfo.status === 'active') return 'success';
    if (dayInfo.status === 'active') return 'info'; // Past active = completed
    if (dayInfo.status === 'closed') return 'info';
    if (dayInfo.status === 'inactive') return 'warning';
    return 'secondary';
  };

  const getBadgeText = (dayInfo) => {
    if (dayInfo.isToday && dayInfo.status === 'active') return 'Active';
    if (dayInfo.status === 'active') return 'Completed'; // Past active days
    if (dayInfo.status === 'closed') return 'Closed';
    if (dayInfo.status === 'inactive') return 'Inactive';
    return 'No data';
  };

  // Render calendar grid
  const renderCalendarDays = () => {
    const days = [];
    const today = getDateString();

    // Padding days
    for (let i = 0; i < startPadding; i++) {
      days.push(<div key={`pad-${i}`} className="calendar-day padding" />);
    }

    // Actual days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = getDateString(date);
      const status = getDayStatus(date);
      const isToday = dateStr === today;
      const isSelected = selectedDayInfo?.date === dateStr;
      const dayData = daysData[dateStr];

      days.push(
        <div
          key={dateStr}
          className={`calendar-day ${status} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
          onClick={() => handleDayClick(date)}
        >
          <span className="day-number">{day}</span>
          {dayData?.summary && (
            <div className="day-indicators">
              {dayData.summary.tasksCompleted > 0 && (
                <span className="indicator tasks" title="Tasks done">✓</span>
              )}
              {dayData.summary.trainingCompleted && (
                <span className="indicator training" title="Workout done">💪</span>
              )}
            </div>
          )}
        </div>
      );
    }

    return days;
  };

  return (
    <div className="calendar-view animate-fade-in">
      <header className="view-header">
        <div>
          <h1 className="view-title">Calendar</h1>
          <p className="view-subtitle text-secondary">Review your journey</p>
        </div>
      </header>

      {/* Month Navigation */}
      <div className="calendar-nav">
        <button className="btn btn-ghost" onClick={prevMonth}>
          ←
        </button>
        <h2 className="month-title">{monthNames[month]} {year}</h2>
        <button className="btn btn-ghost" onClick={nextMonth}>
          →
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="calendar-container card">
        <div className="calendar-header">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="calendar-day-header">{day}</div>
          ))}
        </div>
        <div className="calendar-grid">
          {renderCalendarDays()}
        </div>
      </div>

      {/* Legend */}
      <div className="calendar-legend">
        <div className="legend-item">
          <span className="legend-dot active" />
          <span>Active</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot closed" />
          <span>Closed</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot inactive" />
          <span>Inactive</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot future" />
          <span>Future</span>
        </div>
      </div>

      {/* Selected Day Info - Collapsible */}
      {selectedDayInfo && (
        <div className="day-detail card mt-6 animate-fade-in">
          <div className="day-detail-header">
            <h3>{new Date(selectedDayInfo.date + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric'
            })}</h3>
            <div className="header-actions">
              <span className={`badge badge-${getBadgeClass(selectedDayInfo)}`}>
                {getBadgeText(selectedDayInfo)}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedDayInfo(null)}
                title="Close"
              >
                ×
              </button>
            </div>
          </div>

          {selectedDayInfo.summary && (
            <>
              {/* Primary Stats */}
              <div className="day-detail-stats">
                <div className="detail-stat">
                  <span className="stat-value">
                    {selectedDayInfo.summary.tasksCompleted || 0}/{selectedDayInfo.summary.tasksTotal || 0}
                  </span>
                  <span className="stat-label">Tasks</span>
                </div>
                <div className="detail-stat">
                  <span className="stat-value">
                    {selectedDayInfo.summary.trainingCompleted ? '✓' : '–'}
                  </span>
                  <span className="stat-label">Training</span>
                </div>
                <div className="detail-stat">
                  <span className="stat-value">
                    {selectedDayInfo.summary.mealsLogged || 0}/{selectedDayInfo.summary.mealsTotal || 4}
                  </span>
                  <span className="stat-label">Meals</span>
                </div>
                <div className="detail-stat">
                  <span className="stat-value text-success">
                    {selectedDayInfo.summary.proteinTotal || 0}g
                  </span>
                  <span className="stat-label">Protein</span>
                </div>
              </div>

              {/* Extended Stats - New */}
              <div className="day-detail-stats extended">
                <div className="detail-stat">
                  <span className="stat-value">
                    {selectedDayInfo.summary.caloriesTotal || 0}
                  </span>
                  <span className="stat-label">Calories</span>
                </div>
                <div className="detail-stat">
                  <span className="stat-value">
                    {selectedDayInfo.summary.carbsTotal || 0}g
                  </span>
                  <span className="stat-label">Carbs</span>
                </div>
                <div className="detail-stat">
                  <span className="stat-value">
                    {selectedDayInfo.summary.fatsTotal || 0}g
                  </span>
                  <span className="stat-label">Fats</span>
                </div>
              </div>
            </>
          )}

          {selectedDayInfo.notes && (
            <div className="day-notes">
              <h4 className="text-sm text-secondary mb-2">Notes</h4>
              <p>{selectedDayInfo.notes}</p>
            </div>
          )}

          {(selectedDayInfo.flags?.injury || selectedDayInfo.flags?.soreness) && (
            <div className="day-flags">
              {selectedDayInfo.flags.injury && (
                <span className="badge badge-warning">Injury</span>
              )}
              {selectedDayInfo.flags.soreness && (
                <span className="badge badge-warning">Soreness</span>
              )}
            </div>
          )}
        </div>
      )}

      <style>{calendarStyles}</style>
    </div>
  );
}

const calendarStyles = `
  .calendar-view {
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

  .calendar-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-4);
  }

  .month-title {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
  }

  .calendar-container {
    padding: var(--spacing-4);
  }

  .calendar-header {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    margin-bottom: var(--spacing-2);
  }

  .calendar-day-header {
    text-align: center;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    padding: var(--spacing-2);
  }

  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: var(--spacing-1);
  }

  .calendar-day {
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-lg);
    cursor: pointer;
    position: relative;
    transition: all var(--transition-fast);
    background: var(--color-bg-tertiary);
  }

  .calendar-day:hover:not(.padding) {
    background: var(--color-bg-card-hover);
    transform: scale(1.05);
  }

  .calendar-day.padding {
    background: transparent;
  }

  .calendar-day.today {
    border: 2px solid var(--color-accent);
  }

  .calendar-day.active {
    background: var(--color-success-light);
  }

  .calendar-day.closed {
    background: var(--color-info-light);
  }

  .calendar-day.inactive {
    background: var(--color-warning-light);
    opacity: 0.7;
  }

  .calendar-day.future {
    opacity: 0.5;
    cursor: default;
  }

  .calendar-day.selected {
    box-shadow: 0 0 0 2px var(--color-accent);
    transform: scale(1.05);
    z-index: 1;
  }

  .calendar-day.selected:not(.today) {
    border: 2px solid var(--color-accent);
    background: rgba(99, 102, 241, 0.15);
  }

  .day-number {
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-sm);
  }

  .day-indicators {
    display: flex;
    gap: 2px;
    margin-top: 2px;
  }

  .indicator {
    font-size: 0.6rem;
  }

  .calendar-legend {
    display: flex;
    justify-content: center;
    gap: var(--spacing-6);
    margin-top: var(--spacing-6);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .legend-dot {
    width: 12px;
    height: 12px;
    border-radius: var(--radius-full);
  }

  .legend-dot.active {
    background: var(--color-success);
  }

  .legend-dot.closed {
    background: var(--color-info);
  }

  .legend-dot.inactive {
    background: var(--color-warning);
  }

  .legend-dot.future {
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
  }

  .day-detail {
    padding: var(--spacing-5);
  }

  .day-detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-4);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
  }

  .day-detail-stats {
    display: flex;
    justify-content: space-around;
    margin-bottom: var(--spacing-4);
  }

  .day-detail-stats.extended {
    padding-top: var(--spacing-4);
    border-top: 1px solid var(--color-border);
  }

  .detail-stat {
    text-align: center;
  }

  .detail-stat .stat-value {
    display: block;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    margin-bottom: var(--spacing-1);
  }

  .detail-stat .stat-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .day-notes {
    padding: var(--spacing-3);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-md);
    margin-top: var(--spacing-3);
  }

  .day-flags {
    display: flex;
    gap: var(--spacing-2);
    margin-top: var(--spacing-3);
  }
`;
