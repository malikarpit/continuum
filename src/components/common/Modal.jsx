/**
 * Accessible Modal Component
 * Features: focus trapping, ESC close, body scroll lock, ARIA attributes
 */

import { useEffect, useRef, useCallback } from 'react';

/**
 * Modal wrapper with accessibility features
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Close handler
 * @param {string} props.title - Modal title for aria-labelledby
 * @param {React.ReactNode} props.children - Modal content
 * @param {string} props.size - Modal size: 'sm', 'md', 'lg' (default: 'md')
 */
export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
    const modalRef = useRef(null);
    const previousActiveElement = useRef(null);

    // Focus trap - get all focusable elements
    const getFocusableElements = useCallback(() => {
        if (!modalRef.current) return [];
        return modalRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
    }, []);

    // Handle ESC key to close
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            return;
        }

        // Focus trap
        if (e.key === 'Tab') {
            const focusable = getFocusableElements();
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }, [onClose, getFocusableElements]);

    // Handle overlay click
    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    // Setup/cleanup effects
    useEffect(() => {
        if (isOpen) {
            // Store previously focused element
            previousActiveElement.current = document.activeElement;

            // Lock body scroll
            document.body.style.overflow = 'hidden';

            // Add keyboard listener
            document.addEventListener('keydown', handleKeyDown);

            // Focus first focusable element
            requestAnimationFrame(() => {
                const focusable = getFocusableElements();
                if (focusable.length > 0) {
                    focusable[0].focus();
                }
            });
        }

        return () => {
            // Restore body scroll
            document.body.style.overflow = '';

            // Remove keyboard listener
            document.removeEventListener('keydown', handleKeyDown);

            // Restore focus to previous element
            if (previousActiveElement.current && isOpen) {
                previousActiveElement.current.focus();
            }
        };
    }, [isOpen, handleKeyDown, getFocusableElements]);

    if (!isOpen) return null;

    const sizeClasses = {
        sm: 'modal-sm',
        md: '',
        lg: 'modal-lg',
    };

    const modalId = `modal-${title?.replace(/\s+/g, '-').toLowerCase() || 'dialog'}`;

    return (
        <div
            className="modal-overlay"
            onClick={handleOverlayClick}
            role="presentation"
        >
            <div
                ref={modalRef}
                className={`modal ${sizeClasses[size] || ''}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${modalId}-title`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2 id={`${modalId}-title`} className="modal-title">
                        {title}
                    </h2>
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon modal-close-btn"
                        onClick={onClose}
                        aria-label="Close modal"
                    >
                        <CloseIcon />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

/**
 * Modal body wrapper
 */
export function ModalBody({ children }) {
    return <div className="modal-body">{children}</div>;
}

/**
 * Modal footer wrapper
 */
export function ModalFooter({ children }) {
    return <div className="modal-footer">{children}</div>;
}

function CloseIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
    );
}
