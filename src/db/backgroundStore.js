/**
 * backgroundStore - Manages custom background preferences and storage
 * Uses IndexedDB to store uploaded images with size optimization
 */

import { getDB, STORES } from './database';

// Maximum file size (3MB for safety with IndexedDB)
const MAX_FILE_SIZE = 3 * 1024 * 1024;
// Maximum image dimensions
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;

export const BACKGROUND_TYPES = {
    DEFAULT: 'default',
    IMAGE: 'image',
    GIF: 'gif',
    VIDEO: 'video',
};

const DEFAULT_BACKGROUND_SETTINGS = {
    type: BACKGROUND_TYPES.DEFAULT,
    imageData: null, // base64 or blob URL
    fileName: null,
    overlayOpacity: 0.3, // Darkness overlay for text readability
    blur: 0, // Optional blur effect
    brightness: 100, // Brightness percentage
};

/**
 * Get current background settings
 */
export async function getBackgroundSettings() {
    try {
        const db = await getDB();
        const settings = await db.get(STORES.SETTINGS, 'backgroundSettings');
        return settings || DEFAULT_BACKGROUND_SETTINGS;
    } catch (error) {
        console.error('Error loading background settings:', error);
        return DEFAULT_BACKGROUND_SETTINGS;
    }
}

/**
 * Save background settings
 */
export async function saveBackgroundSettings(settings) {
    try {
        const db = await getDB();
        // SETTINGS store uses keyPath: 'key', so we need to include the key in the object
        await db.put(STORES.SETTINGS, { key: 'backgroundSettings', ...settings });
        return settings;
    } catch (error) {
        console.error('Error saving background settings:', error);
        throw error;
    }
}

/**
 * Resize an image to fit within max dimensions while maintaining aspect ratio
 */
function resizeImage(img, maxWidth, maxHeight) {
    let { width, height } = img;

    if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width));
        width = maxWidth;
    }

    if (height > maxHeight) {
        width = Math.round(width * (maxHeight / height));
        height = maxHeight;
    }

    return { width, height };
}

/**
 * Compress and convert an image file to base64
 */
export function processImageFile(file) {
    return new Promise((resolve, reject) => {
        // Check if it's a GIF (don't resize GIFs to preserve animation)
        if (file.type === 'image/gif') {
            const reader = new FileReader();
            reader.onload = () => {
                if (reader.result.length > MAX_FILE_SIZE) {
                    reject(new Error(`GIF file is too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`));
                } else {
                    resolve({
                        type: BACKGROUND_TYPES.GIF,
                        imageData: reader.result,
                        fileName: file.name,
                    });
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
            return;
        }

        // Check if it's a video
        if (file.type.startsWith('video/')) {
            const reader = new FileReader();
            reader.onload = () => {
                if (reader.result.length > MAX_FILE_SIZE) {
                    reject(new Error(`Video file is too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`));
                } else {
                    resolve({
                        type: BACKGROUND_TYPES.VIDEO,
                        imageData: reader.result,
                        fileName: file.name,
                    });
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
            return;
        }

        // Regular image - resize and compress
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const { width, height } = resizeImage(img, MAX_WIDTH, MAX_HEIGHT);

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Convert to JPEG with compression
                const quality = 0.8;
                const dataUrl = canvas.toDataURL('image/jpeg', quality);

                resolve({
                    type: BACKGROUND_TYPES.IMAGE,
                    imageData: dataUrl,
                    fileName: file.name,
                });
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

/**
 * Upload and set a custom background
 */
export async function setCustomBackground(file) {
    try {
        const processed = await processImageFile(file);
        const settings = await getBackgroundSettings();

        const newSettings = {
            ...settings,
            ...processed,
        };

        await saveBackgroundSettings(newSettings);
        return newSettings;
    } catch (error) {
        console.error('Error setting custom background:', error);
        throw error;
    }
}

/**
 * Reset to default background
 */
export async function resetToDefaultBackground() {
    await saveBackgroundSettings(DEFAULT_BACKGROUND_SETTINGS);
    return DEFAULT_BACKGROUND_SETTINGS;
}

/**
 * Update background overlay/effects settings
 */
export async function updateBackgroundEffects(effects) {
    const settings = await getBackgroundSettings();
    const newSettings = {
        ...settings,
        ...effects,
    };
    await saveBackgroundSettings(newSettings);
    return newSettings;
}
