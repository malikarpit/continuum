/**
 * Navigation - Top navigation bar
 * Accessible navigation with keyboard support and ARIA attributes
 */

import { useAppStore, VIEWS } from '../../store/appStore';

export default function Navigation() {
    const { currentView, setView } = useAppStore();

    const navLinks = [
        { view: VIEWS.TODAY, label: 'Today' },
        { view: VIEWS.DASHBOARD, label: 'Dashboard' },
        { view: VIEWS.TASKS, label: 'Tasks' },
        { view: VIEWS.TRAINING, label: 'Training' },
        { view: VIEWS.MEALS, label: 'Meals' },
        { view: VIEWS.CALENDAR, label: 'Calendar' },
        { view: VIEWS.ANALYTICS, label: 'Analytics' },
        { view: VIEWS.TEMPLATES, label: 'Templates' },
    ];

    const handleKeyDown = (e, view) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setView(view);
        }
    };

    return (
        <nav className="nav" role="navigation" aria-label="Main navigation">
            <button
                className="nav-brand"
                onClick={() => setView(VIEWS.TODAY)}
                aria-label="Continuum - Go to Today"
            >
                <span className="nav-brand-accent">C</span>ontinuum
            </button>

            <div className="nav-links" role="tablist" aria-label="Main sections">
                {navLinks.map(({ view, label }) => (
                    <button
                        key={view}
                        role="tab"
                        className={`nav-link ${currentView === view ? 'active' : ''}`}
                        onClick={() => setView(view)}
                        onKeyDown={(e) => handleKeyDown(e, view)}
                        aria-selected={currentView === view}
                        aria-current={currentView === view ? 'page' : undefined}
                        tabIndex={0}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <button
                className="btn btn-secondary btn-sm"
                onClick={() => setView(VIEWS.SETTINGS)}
                aria-label="Settings"
            >
                <SettingsIcon />
            </button>
        </nav>
    );
}

function SettingsIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
    );
}
