/**
 * GoogleAuthService - Simplified Google Sign-In using Google Identity Services (GIS)
 * Users just click "Sign in with Google" - no OAuth setup required from their end
 * 
 * Note: The app developer needs to set up the Client ID once in Google Cloud Console,
 * but end users simply click a button to sign in with their Google account.
 */

import { GOOGLE_CLIENT_ID } from '../config';

// Token storage keys
const TOKEN_KEY = 'continuum_google_token';
const USER_KEY = 'continuum_google_user';

// Use the configured Client ID from config.js
const DEFAULT_CLIENT_ID = GOOGLE_CLIENT_ID;

class GoogleAuthService {
    constructor() {
        this.clientId = null;
        this.accessToken = null;
        this.expiresAt = null;
        this.user = null;
        this.isInitialized = false;
        this.tokenClient = null;
    }

    /**
     * Load the Google Identity Services library
     */
    loadGoogleScript() {
        return new Promise((resolve, reject) => {
            // Check if already loaded
            if (window.google?.accounts) {
                resolve();
                return;
            }

            // Check if script is being loaded
            if (document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
                // Wait for it to load
                const checkLoaded = setInterval(() => {
                    if (window.google?.accounts) {
                        clearInterval(checkLoaded);
                        resolve();
                    }
                }, 100);
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Google Sign-In'));
            document.head.appendChild(script);
        });
    }

    /**
     * Initialize the auth service
     */
    async init(clientId = null) {
        if (this.isInitialized && this.clientId) {
            return;
        }

        // Use provided client ID, stored ID, or default
        this.clientId = clientId ||
            localStorage.getItem('continuum_google_client_id') ||
            DEFAULT_CLIENT_ID;

        if (!this.clientId) {
            console.warn('Google Client ID not configured. Google features will be disabled.');
            return;
        }

        // Load GIS library
        await this.loadGoogleScript();

        // Load stored tokens
        const storedToken = localStorage.getItem(TOKEN_KEY);
        const storedUser = localStorage.getItem(USER_KEY);

        // Load user first (needed for token refresh)
        if (storedUser) {
            try {
                this.user = JSON.parse(storedUser);
            } catch (e) {
                console.error('Error loading stored user:', e);
            }
        }

        if (storedToken) {
            try {
                const tokenData = JSON.parse(storedToken);
                this.accessToken = tokenData.accessToken;
                this.expiresAt = tokenData.expiresAt;

                // Check if token is expired - try to refresh silently
                if (this.isTokenExpired() && this.user) {

                    // Don't await here - let it refresh in background
                    this.refreshToken().catch(() => {

                    });
                }
            } catch (e) {
                console.error('Error loading stored token:', e);
                this.clearAuth();
            }
        }

        this.isInitialized = true;
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return !!this.accessToken && !this.isTokenExpired();
    }

    /**
     * Check if token is expired
     */
    isTokenExpired() {
        if (!this.expiresAt) return true;
        return Date.now() >= this.expiresAt - 60000; // 1 minute buffer
    }

    /**
     * Silently refresh the access token
     * This only works if the user is still logged into Google in the browser
     */
    async refreshToken() {
        if (!this.clientId || !this.user) {
            return false;
        }

        try {
            await this.loadGoogleScript();

            return new Promise((resolve) => {
                this.tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: this.clientId,
                    scope: 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
                    prompt: '', // Empty prompt = silent refresh
                    callback: (response) => {
                        if (response.error) {

                            resolve(false);
                            return;
                        }

                        // Store new token
                        this.accessToken = response.access_token;
                        this.expiresAt = Date.now() + (response.expires_in * 1000);

                        const tokenData = {
                            accessToken: this.accessToken,
                            expiresAt: this.expiresAt,
                        };
                        localStorage.setItem(TOKEN_KEY, JSON.stringify(tokenData));
                        // console.log('Token refreshed silently');
                        resolve(true);
                    },
                    error_callback: () => {
                        resolve(false);
                    },
                });

                this.tokenClient.requestAccessToken({ prompt: '' });
            });
        } catch (error) {
            console.error('Error refreshing token:', error);
            return false;
        }
    }

    /**
     * Start OAuth 2.0 login flow using Google Identity Services
     * This shows a native Google sign-in popup
     */
    async login() {
        if (!this.clientId) {
            throw new Error('Google Sign-In is not configured. Please contact the app administrator.');
        }

        await this.init();

        return new Promise((resolve, reject) => {
            try {
                // Initialize token client
                this.tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: this.clientId,
                    scope: 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
                    callback: async (response) => {
                        if (response.error) {
                            reject(new Error(response.error_description || response.error));
                            return;
                        }

                        // Store token
                        this.accessToken = response.access_token;
                        this.expiresAt = Date.now() + (response.expires_in * 1000);

                        const tokenData = {
                            accessToken: this.accessToken,
                            expiresAt: this.expiresAt,
                        };
                        localStorage.setItem(TOKEN_KEY, JSON.stringify(tokenData));

                        // Fetch user info
                        try {
                            await this.fetchUserInfo();
                            resolve(this.user);
                        } catch (error) {
                            reject(error);
                        }
                    },
                    error_callback: (error) => {
                        reject(new Error(error.message || 'Sign-in was cancelled or failed'));
                    },
                });

                // Request access token - this shows the Google sign-in popup
                this.tokenClient.requestAccessToken();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Fetch user profile information
     */
    async fetchUserInfo() {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch user info');
            }

            this.user = await response.json();
            localStorage.setItem(USER_KEY, JSON.stringify(this.user));
            return this.user;
        } catch (error) {
            console.error('Error fetching user info:', error);
            throw error;
        }
    }

    /**
     * Logout and clear stored data
     */
    logout() {
        // Revoke token if we have one
        if (this.accessToken && window.google?.accounts?.oauth2) {
            google.accounts.oauth2.revoke(this.accessToken, () => {

            });
        }

        this.clearAuth();
    }

    /**
     * Clear all auth data
     */
    clearAuth() {
        this.accessToken = null;
        this.expiresAt = null;
        this.user = null;
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }

    /**
     * Make authenticated API request
     */
    async apiRequest(url, options = {}) {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated');
        }

        const response = await fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (response.status === 401) {
            // Token expired
            this.clearAuth();
            throw new Error('Session expired. Please sign in again.');
        }

        return response;
    }

    /**
     * Get authenticated user info
     */
    getUser() {
        return this.user;
    }

    /**
     * Check if Google Sign-In is available (client ID configured)
     */
    isAvailable() {
        return !!this.clientId || !!DEFAULT_CLIENT_ID || !!localStorage.getItem('continuum_google_client_id');
    }
}

// Export singleton
export const googleAuth = new GoogleAuthService();
export default GoogleAuthService;
