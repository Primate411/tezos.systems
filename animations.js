/**
 * Animation system for stat card flip effects
 * Manages animation queue to prevent overlapping flips
 */

import { sleep } from './utils.js';

const FLIP_DURATION = 600; // milliseconds - matches CSS transition
const STAGGER_DELAY = 100; // milliseconds between card flips

/**
 * Animation queue to prevent overlapping animations
 */
class AnimationQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
    }

    /**
     * Add animation to queue
     * @param {Function} animationFn - Async function that performs the animation
     */
    async add(animationFn) {
        this.queue.push(animationFn);
        if (!this.isProcessing) {
            await this.process();
        }
    }

    /**
     * Process animation queue
     */
    async process() {
        this.isProcessing = true;
        while (this.queue.length > 0) {
            const animation = this.queue.shift();
            try {
                await animation();
            } catch (error) {
                console.error('Animation error:', error);
            }
        }
        this.isProcessing = false;
    }

    /**
     * Clear all pending animations
     */
    clear() {
        this.queue = [];
    }

    /**
     * Get queue length
     * @returns {number} Number of pending animations
     */
    get length() {
        return this.queue.length;
    }
}

// Global animation queue instance
const animQueue = new AnimationQueue();

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
 * Update card value with flip animation (queued)
 * @param {string} cardId - ID of the stat card (data-stat attribute)
 * @param {string|number} newValue - New value to display
 * @param {Function} formatter - Formatter function for the value
 * @returns {Promise} Resolves when animation is queued
 */
export async function updateStatWithAnimation(cardId, newValue, formatter) {
    await animQueue.add(async () => {
        const card = document.querySelector(`[data-stat="${cardId}"]`);
        if (card) {
            await flipCard(card, newValue, formatter);
        }
    });
}

/**
 * Update multiple stats with staggered animations
 * @param {Array} updates - Array of {cardId, value, formatter} objects
 * @returns {Promise} Resolves when all animations complete
 */
export async function updateStatsWithStagger(updates) {
    for (const update of updates) {
        await updateStatWithAnimation(update.cardId, update.value, update.formatter);
        // Add stagger delay
        if (updates.indexOf(update) < updates.length - 1) {
            await sleep(STAGGER_DELAY);
        }
    }
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

/**
 * Clear animation queue
 */
export function clearAnimations() {
    animQueue.clear();
}

/**
 * Check if animations are currently processing
 * @returns {boolean} True if animations are processing
 */
export function isAnimating() {
    return animQueue.isProcessing || animQueue.length > 0;
}
