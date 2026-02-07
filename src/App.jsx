import { useEffect } from 'react';
import { useAppStore, VIEWS } from './store/appStore';
import Navigation from './components/common/Navigation';
import BottomNav from './components/common/BottomNav';
import BackgroundLayer from './components/common/BackgroundLayer';
import Today from './components/today/Today';
import Dashboard from './components/dashboard/Dashboard';
import Tasks from './components/tasks/Tasks';
import Training from './components/training/Training';
import Meals from './components/meals/Meals';
import Calendar from './components/calendar/Calendar';
import Analytics from './components/analytics/Analytics';
import Templates from './components/templates/Templates';
import Settings from './components/settings/Settings';
import Toast from './components/common/Toast';
import { swManager } from './services/ServiceWorkerManager';
import './styles/main.css';

function App() {
  const {
    currentView,
    isInitialized,
    isLoading,
    error,
    toast,
    initializeApp
  } = useAppStore();

  useEffect(() => {
    initializeApp();

    // Register Service Worker for background notifications
    swManager.register().then((registration) => {
      if (registration) {
        // console.log('[App] Service Worker registered successfully');
        // Try to enable periodic background sync
        swManager.requestPeriodicSync();
      }
    });
  }, [initializeApp]);

  // Render current view
  const renderView = () => {
    switch (currentView) {
      case VIEWS.TODAY:
        return <Today />;
      case VIEWS.DASHBOARD:
        return <Dashboard />;
      case VIEWS.TASKS:
        return <Tasks />;
      case VIEWS.TRAINING:
        return <Training />;
      case VIEWS.MEALS:
        return <Meals />;
      case VIEWS.CALENDAR:
        return <Calendar />;
      case VIEWS.ANALYTICS:
        return <Analytics />;
      case VIEWS.TEMPLATES:
        return <Templates />;
      case VIEWS.SETTINGS:
        return <Settings />;
      default:
        return <Today />;
    }
  };

  // Loading state
  if (!isInitialized || isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-logo">
            <span className="text-accent">C</span>ontinuum
          </div>
          <div className="loading-spinner"></div>
          <p className="text-secondary mt-4">Loading your day...</p>
        </div>
        <style>{`
          .loading-screen {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--gradient-hero);
          }
          .loading-content {
            text-align: center;
          }
          .loading-logo {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 2rem;
          }
          .loading-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid var(--color-border);
            border-top-color: var(--color-accent);
            border-radius: 50%;
            margin: 0 auto;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="error-screen">
        <div className="error-content">
          <h1 className="text-error">Something went wrong</h1>
          <p className="text-secondary mt-4">{error}</p>
          <button
            className="btn btn-primary mt-6"
            onClick={() => window.location.reload()}
          >
            Reload App
          </button>
        </div>
        <style>{`
          .error-screen {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--gradient-hero);
          }
          .error-content {
            text-align: center;
            padding: 2rem;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="app">
      <BackgroundLayer />
      <Navigation />
      <main className="page">
        {renderView()}
      </main>
      <BottomNav />
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}

export default App;
