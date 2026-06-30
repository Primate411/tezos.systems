/**
 * Animation system for stat card flip effects
 * Manages animation queue to prevent overlapping flips
 */

import { debugLog } from '../core/utils.js';

// Import arcade effects (dynamic to avoid circular dependency)
let arcadeEffects = null;
try {
    import('../effects/arcade-effects.js').then(module => {
        arcadeEffects = module;
    });
} catch (e) {
    debugLog('Arcade effects not available');
}

const FLIP_DURATION = 600; // milliseconds - matches CSS transition
const LOADING_COPY = {
    'total-bakers': 'Preheating the baker board',
    'tz4-adoption': 'Counting fresh keys',
    'cycle-progress': "Dough's rising",
    'network-health': 'Checking the bake',
    'issuance-rate': 'Proofing the numbers',
    'staking-apy': 'Warming the yield',
    'staking-ratio': 'Measuring the rise',
    delegated: 'Counting delegated dough',
    'total-supply': 'Sifting supply',
    'total-burned': 'Tending the oven',
    'baking-power': 'Weighing baking power',
    'reward-accounts': 'Counting reward trays',
    proposal: 'Opening the governance oven',
    'voting-period': 'Checking the voting clock',
    participation: 'Counting baker ballots',
    'tx-volume': 'Reading the mempool',
    'contract-calls': 'Counting contract calls',
    'funded-accounts': 'Finding funded wallets',
    'new-accounts': 'Spotting fresh wallets',
    'smart-contracts': 'Counting contracts',
    tokens: 'Sorting token shelves',
    rollups: 'Checking rollups',
    'active-contracts': 'Finding active contracts'
};

function loadingCopyFor(cardId) {
    return LOADING_COPY[cardId] || "Dough's rising";
}

function clearLoadingState(element) {
    if (!element) return;
    element.classList.remove('loading');
    delete element.dataset.loadingCopy;
    element.removeAttribute('aria-label');
}
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

            clearLoadingState(backValue);

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
                    clearLoadingState(frontValue);
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
        clearLoadingState(frontValue);
    }
    if (backValue) {
        backValue.textContent = formattedValue;
        clearLoadingState(backValue);
    }
}

/**
 * Show loading state on a stat card
 * @param {string} cardId - ID of the stat card
 */
export function showLoading(cardId) {
    const card = document.querySelector(`[data-stat="${cardId}"]`);
    if (card) {
        const frontValue = card.querySelector(`#${cardId}-front`);
        const backValue = card.querySelector(`#${cardId}-back`);
        const copy = loadingCopyFor(cardId);

        [frontValue, backValue].forEach((valueEl) => {
            if (!valueEl) return;
            valueEl.textContent = copy;
            valueEl.dataset.loadingCopy = copy;
            valueEl.setAttribute('aria-label', copy);
            valueEl.classList.add('loading');
        });
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
            clearLoadingState(frontValue);
        }
        if (backValue) {
            backValue.classList.add('error-state');
            clearLoadingState(backValue);
        }
    }
}
