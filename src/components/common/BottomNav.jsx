/**
 * BottomNav - Mobile bottom navigation with all tabs
 */

import { useAppStore, VIEWS } from '../../store/appStore';

export default function BottomNav() {
    const { currentView, setView } = useAppStore();

    const navItems = [
        { view: VIEWS.TODAY, label: 'Today', icon: <TodayIcon /> },
        { view: VIEWS.DASHBOARD, label: 'Dashboard', icon: <DashboardIcon /> },
        { view: VIEWS.TASKS, label: 'Tasks', icon: <TasksIcon /> },
        { view: VIEWS.TRAINING, label: 'Training', icon: <TrainingIcon /> },
        { view: VIEWS.MEALS, label: 'Meals', icon: <MealsIcon /> },
        { view: VIEWS.CALENDAR, label: 'Calendar', icon: <CalendarIcon /> },
        { view: VIEWS.ANALYTICS, label: 'Analytics', icon: <AnalyticsIcon /> },
        { view: VIEWS.TEMPLATES, label: 'Templates', icon: <TemplatesIcon /> },
    ];

    return (
        <nav className="bottom-nav" aria-label="Main navigation" role="navigation">
            <div className="bottom-nav-scroll">
                {navItems.map(({ view, label, icon }) => (
                    <button
                        key={view}
                        className={`bottom-nav-item ${currentView === view ? 'active' : ''}`}
                        onClick={() => setView(view)}
                        aria-current={currentView === view ? 'page' : undefined}
                        aria-label={label}
                    >
                        {icon}
                        <span>{label}</span>
                    </button>
                ))}
            </div>
        </nav>
    );
}

// Icons
function TodayIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
    );
}

function DashboardIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
        </svg>
    );
}

function TasksIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4"></path>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
        </svg>
    );
}

function TrainingIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6.5 6.5h11"></path>
            <path d="M6.5 17.5h11"></path>
            <path d="M4 12h1"></path>
            <path d="M19 12h1"></path>
            <rect x="5" y="4" width="3" height="16" rx="1"></rect>
            <rect x="16" y="4" width="3" height="16" rx="1"></rect>
        </svg>
    );
}

function MealsIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
            <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
            <line x1="6" y1="1" x2="6" y2="4"></line>
            <line x1="10" y1="1" x2="10" y2="4"></line>
            <line x1="14" y1="1" x2="14" y2="4"></line>
        </svg>
    );
}

function CalendarIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
    );
}

function AnalyticsIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
        </svg>
    );
}

function TemplatesIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="9" y1="21" x2="9" y2="9"></line>
        </svg>
    );
}
