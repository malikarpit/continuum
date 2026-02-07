/**
 * Application Configuration
 * 
 * This file contains configuration settings for the Continuum app.
 * 
 * For Google Sign-In to work:
 * 1. Go to https://console.cloud.google.com/apis/credentials
 * 2. Create OAuth 2.0 Client ID for "Web application"
 * 3. Add your origin to "Authorized JavaScript origins" (e.g., http://localhost:5173)
 * 4. Enable Google Tasks API and Google Calendar API
 * 5. Create .env.local file with: VITE_GOOGLE_CLIENT_ID=your-client-id
 * 
 * Note: Client ID is PUBLIC (safe to commit), Client SECRET is private (we don't use it)
 */

// Google OAuth Client ID from environment variable
// For local dev: create .env.local with VITE_GOOGLE_CLIENT_ID=your-id
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '990708684672-raeih5peubmqkg2rdu0ff27rrae52ni4.apps.googleusercontent.com';

// App configuration
export const config = {
    // Google Integration
    google: {
        clientId: GOOGLE_CLIENT_ID,
        scopes: [
            'https://www.googleapis.com/auth/tasks',
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
        ],
    },

    // Notification defaults
    notifications: {
        taskLeadTime: 30, // minutes before deadline
        defaultMealSchedule: {
            breakfast: { hour: 8, minute: 0 },
            lunch: { hour: 12, minute: 30 },
            dinner: { hour: 19, minute: 0 },
        },
        defaultTrainingTime: { hour: 9, minute: 0 },
    },

    // App info
    app: {
        name: 'Continuum',
        version: '1.0.0',
    },
};

export default config;
