/**
 * BackgroundLayer - Dynamic background component
 * Supports default starry animation, custom images, GIFs, and videos
 */

import { useEffect, useState, useMemo } from 'react';
import { getBackgroundSettings, BACKGROUND_TYPES } from '../../db/backgroundStore';

// Original StarryBackground logic
function StarryAnimation() {
    const stars = useMemo(() => {
        const starCount = 200;
        const starsArray = [];
        for (let i = 0; i < starCount; i++) {
            starsArray.push({
                x: Math.random() * 100,
                y: Math.random() * 100,
                size: Math.random() * 2 + 0.5,
                opacity: Math.random() * 0.7 + 0.3,
                twinkleSpeed: Math.random() * 2 + 1,
                twinkleDelay: Math.random() * 5,
            });
        }
        return starsArray;
    }, []);

    return (
        <>
            <div className="stars-container">
                {stars.map((star, i) => (
                    <div
                        key={i}
                        className="star"
                        style={{
                            left: `${star.x}%`,
                            top: `${star.y}%`,
                            width: `${star.size}px`,
                            height: `${star.size}px`,
                            '--twinkle-duration': `${star.twinkleSpeed}s`,
                            '--twinkle-delay': `${star.twinkleDelay}s`,
                            '--star-opacity': star.opacity,
                        }}
                    />
                ))}
            </div>
            <div className="shooting-star shooting-star-1"></div>
            <div className="shooting-star shooting-star-2"></div>
            <div className="shooting-star shooting-star-3"></div>
        </>
    );
}

export default function BackgroundLayer() {
    const [bgSettings, setBgSettings] = useState(null);

    useEffect(() => {
        // Load background settings on mount
        loadSettings();

        // Listen for background updates
        const handleUpdate = () => loadSettings();
        window.addEventListener('backgroundSettingsUpdated', handleUpdate);
        return () => window.removeEventListener('backgroundSettingsUpdated', handleUpdate);
    }, []);

    const loadSettings = async () => {
        const settings = await getBackgroundSettings();
        setBgSettings(settings);
    };

    // Render appropriate background based on type
    const renderBackground = () => {
        if (!bgSettings || bgSettings.type === BACKGROUND_TYPES.DEFAULT) {
            return <StarryAnimation />;
        }

        if (bgSettings.type === BACKGROUND_TYPES.VIDEO) {
            return (
                <video
                    className="custom-bg-media"
                    src={bgSettings.imageData}
                    autoPlay
                    loop
                    muted
                    playsInline
                    style={{
                        filter: `brightness(${bgSettings.brightness || 100}%) blur(${bgSettings.blur || 0}px)`,
                    }}
                />
            );
        }

        // Image or GIF
        return (
            <div
                className="custom-bg-image"
                style={{
                    backgroundImage: `url(${bgSettings.imageData})`,
                    filter: `brightness(${bgSettings.brightness || 100}%) blur(${bgSettings.blur || 0}px)`,
                }}
            />
        );
    };

    const overlayOpacity = bgSettings?.type !== BACKGROUND_TYPES.DEFAULT
        ? (bgSettings?.overlayOpacity || 0.3)
        : 0;

    return (
        <div className="background-layer">
            {renderBackground()}

            {/* Overlay for text readability */}
            {overlayOpacity > 0 && (
                <div
                    className="bg-overlay"
                    style={{ opacity: overlayOpacity }}
                />
            )}

            <style>{backgroundStyles}</style>
        </div>
    );
}

const backgroundStyles = `
  .background-layer {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    overflow: hidden;
    background: linear-gradient(
      180deg,
      #0a0a1a 0%,
      #0d1117 30%,
      #0e1525 60%,
      #101d36 100%
    );
  }

  .custom-bg-image {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }

  .custom-bg-media {
    position: absolute;
    top: 50%;
    left: 50%;
    min-width: 100%;
    min-height: 100%;
    width: auto;
    height: auto;
    transform: translate(-50%, -50%);
    object-fit: cover;
  }

  .bg-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      180deg,
      rgba(0, 0, 0, 0.7) 0%,
      rgba(0, 0, 0, 0.5) 50%,
      rgba(0, 0, 0, 0.7) 100%
    );
    pointer-events: none;
  }

  /* ===== Starry Animation Styles ===== */
  .stars-container {
    position: absolute;
    width: 100%;
    height: 100%;
  }

  .star {
    position: absolute;
    background: white;
    border-radius: 50%;
    opacity: var(--star-opacity, 0.6);
    animation: twinkle var(--twinkle-duration, 2s) ease-in-out infinite;
    animation-delay: var(--twinkle-delay, 0s);
    box-shadow: 0 0 4px 1px rgba(255, 255, 255, 0.3);
  }

  @keyframes twinkle {
    0%, 100% {
      opacity: var(--star-opacity, 0.6);
      transform: scale(1);
    }
    50% {
      opacity: calc(var(--star-opacity, 0.6) * 0.3);
      transform: scale(0.8);
    }
  }

  .shooting-star {
    position: absolute;
    width: 150px;
    height: 2px;
    background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%);
    transform: rotate(-45deg);
    opacity: 0;
  }

  .shooting-star-1 {
    top: 15%;
    left: 70%;
    animation: shootingStar 8s linear infinite;
    animation-delay: 2s;
  }

  .shooting-star-2 {
    top: 35%;
    left: 85%;
    animation: shootingStar 12s linear infinite;
    animation-delay: 7s;
  }

  .shooting-star-3 {
    top: 25%;
    left: 60%;
    animation: shootingStar 15s linear infinite;
    animation-delay: 12s;
  }

  @keyframes shootingStar {
    0% {
      opacity: 0;
      transform: translateX(0) translateY(0) rotate(-45deg);
    }
    5% {
      opacity: 1;
    }
    15% {
      opacity: 1;
      transform: translateX(-200px) translateY(200px) rotate(-45deg);
    }
    20% {
      opacity: 0;
      transform: translateX(-300px) translateY(300px) rotate(-45deg);
    }
    100% {
      opacity: 0;
      transform: translateX(-300px) translateY(300px) rotate(-45deg);
    }
  }

  .background-layer::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: radial-gradient(
      ellipse at 50% 0%,
      rgba(10, 40, 80, 0.3) 0%,
      transparent 70%
    );
    animation: aurora 20s ease-in-out infinite alternate;
    pointer-events: none;
  }

  @keyframes aurora {
    0% {
      opacity: 0.3;
      transform: translateX(-5%);
    }
    100% {
      opacity: 0.6;
      transform: translateX(5%);
    }
  }
`;
