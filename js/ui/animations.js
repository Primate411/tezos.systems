/**
 * Animation system for stat card flip effects
 * Manages animation queue to prevent overlapping flips
 */

// Import arcade effects (dynamic to avoid circular dependency)
let arcadeEffects = null;
try {
    import('../effects/arcade-effects.js').then(module => {
        arcadeEffects = module;
    });
} catch (e) {
    console.log('Arcade effects not available');
}

const FLIP_DURATION = 600; // milliseconds - matches CSS transition
/**
 * Flip a stat card with new value
 * @param {HTMLElement} cardElement - The stat card element
 * @param {string|number} newValue - New value to display
 * @param {Function} formatter - Formatter function for the value
 * @returns {Promise} Resolves when animation completes
 */
export async function flipCard(cardElement, newValue, formatter) {
    return new Promise((resolve) => {
        if (!cardElement) {
            console.warn('Card element not found');
            resolve();
            return;
        }

        // Find the card inner container
        const cardInner = cardElement.querySelector('.card-inner');
        if (!cardInner) {
            console.warn('Card inner not found');
            resolve();
            return;
        }

        // Find back face value element
        const statType = cardElement.getAttribute('data-stat');
        const backValue = cardElement.querySelector(`#${statType}-back`);

        if (!backValue) {
            console.warn('Back value element not found');
            resolve();
            return;
        }

        // Format and update back face with new value
        const formattedValue = formatter ? formatter(newValue) : newValue;

        // Use requestAnimationFrame for smooth rendering
        requestAnimationFrame(() => {
            backValue.textContent = formattedValue;

            // Remove loading class if present
            backValue.classList.remove('loading');

            // Add flipping class to start animation
            cardElement.classList.add('flipping');

            // Trigger arcade effects if available
            if (arcadeEffects) {
                // Hit flash on flip
                setTimeout(() => {
                    if (arcadeEffects.hitFlash) {
                        arcadeEffects.hitFlash(cardElement);
                    }
                }, 200);
            }

            // After animation completes
            setTimeout(() => {
                // Update front face
                const frontValue = cardElement.querySelector(`#${statType}-front`);
                if (frontValue) {
                    frontValue.textContent = formattedValue;
                    frontValue.classList.remove('loading');
                }

                // Remove flipping class
                cardElement.classList.remove('flipping');

                resolve();
            }, FLIP_DURATION);
        });
    });
}

/**
 * Update stat value without animation (instant)
 * @param {string} cardId - ID of the stat card
 * @param {string|number} value - Value to display
 * @param {Function} formatter - Formatter function
 */
export function updateStatInstant(cardId, value, formatter) {
    const card = document.querySelector(`[data-stat="${cardId}"]`);
    if (!card) return;

    const statType = cardId;
    const formattedValue = formatter ? formatter(value) : value;

    // Update both front and back faces
    const frontValue = card.querySelector(`#${statType}-front`);
    const backValue = card.querySelector(`#${statType}-back`);

    if (frontValue) {
        frontValue.textContent = formattedValue;
        frontValue.classList.remove('loading');
    }
    if (backValue) {
        backValue.textContent = formattedValue;
        backValue.classList.remove('loading');
    }
}

/**
 * Show loading state on a stat card
 * @param {string} cardId - ID of the stat card
 */
export function showLoading(cardId) {
    updateStatInstant(cardId, '...', null);

    const card = document.querySelector(`[data-stat="${cardId}"]`);
    if (card) {
        const frontValue = card.querySelector(`#${cardId}-front`);
        const backValue = card.querySelector(`#${cardId}-back`);

        if (frontValue) frontValue.classList.add('loading');
        if (backValue) backValue.classList.add('loading');
    }
}

/**
 * Show error state on a stat card
 * @param {string} cardId - ID of the stat card
 * @param {string} message - Error message (default: 'Error')
 */
export function showError(cardId, message = 'Error') {
    updateStatInstant(cardId, message, null);

    const card = document.querySelector(`[data-stat="${cardId}"]`);
    if (card) {
        const frontValue = card.querySelector(`#${cardId}-front`);
        const backValue = card.querySelector(`#${cardId}-back`);

        if (frontValue) {
            frontValue.classList.add('error-state');
            frontValue.classList.remove('loading');
        }
        if (backValue) {
            backValue.classList.add('error-state');
            backValue.classList.remove('loading');
        }
    }
}
