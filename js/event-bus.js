/**
 * js/event-bus.js
 * Typed Pub/Sub EventBus with error isolation, once semantics,
 * and closure-based unsubscribe functions.
 */

export const EVENTS = Object.freeze({
  // Book Lifecycle
  BOOK_OPEN: 'book:open',
  BOOK_LOADED: 'book:loaded',
  BOOK_DELETED: 'book:deleted',

  // Navigation & Reading State
  CHAPTER_CHANGED: 'chapter:changed',
  PAGE_CHANGED: 'page:changed',
  MODE_CHANGED: 'mode:changed',
  TOC_NAVIGATE: 'toc:navigate',

  // Customization & Controls
  THEME_CHANGED: 'theme:changed',
  TYPOGRAPHY_CHANGED: 'typography:changed',
  CHROME_TOGGLE: 'chrome:toggle',

  // Bookmarks
  BOOKMARK_TOGGLE: 'bookmark:toggle',
  BOOKMARK_NAVIGATE: 'bookmark:navigate',
  BOOKMARK_ADDED: 'bookmark:added',
  BOOKMARK_DELETED: 'bookmark:deleted',

  // UI Notifications & Drawers
  TOAST_SHOW: 'toast:show',
  DRAWER_OPEN: 'drawer:open',
  DRAWER_CLOSE: 'drawer:close'
});

export class EventBus {
  static _listeners = new Map();
  static _loggingEnabled = false;

  /**
   * Toggles debug logging for all events.
   * @param {boolean} enabled
   */
  static enableLogging(enabled = true) {
    this._loggingEnabled = Boolean(enabled);
  }

  /**
   * Subscribes to an event.
   * Returns an unsubscribe function.
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} unsubscribe function
   */
  static on(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`EventBus.on: handler for "${event}" must be a function`);
    }
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);

    // Return self-contained unsubscribe closure
    return () => this.off(event, handler);
  }

  /**
   * Unsubscribes a specific handler from an event.
   * @param {string} event
   * @param {Function} handler
   */
  static off(event, handler) {
    const handlers = this._listeners.get(event);
    if (!handlers) return;
    handlers.delete(handler);
    if (handlers.size === 0) {
      this._listeners.delete(event);
    }
  }

  /**
   * Subscribes a handler to execute once, then auto-unsubscribes.
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} unsubscribe function
   */
  static once(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`EventBus.once: handler for "${event}" must be a function`);
    }
    const wrapper = (payload) => {
      this.off(event, wrapper);
      handler(payload);
    };
    return this.on(event, wrapper);
  }

  /**
   * Dispatches an event synchronously to all registered listeners.
   * Handlers are executed with error isolation so one failing listener
   * never halts execution of subsequent listeners.
   * @param {string} event
   * @param {any} [payload]
   */
  static emit(event, payload = {}) {
    if (this._loggingEnabled) {
      console.log(`[EventBus] ${event}`, payload);
    }
    const handlers = this._listeners.get(event);
    if (!handlers || handlers.size === 0) return;

    // Snapshot handlers to prevent mutation bugs during iteration
    const snapshot = Array.from(handlers);
    for (const handler of snapshot) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Uncaught exception in listener for "${event}":`, err);
      }
    }
  }

  /**
   * Returns active listener count for a specific event or total listeners.
   * @param {string} [event]
   * @returns {number}
   */
  static listenerCount(event) {
    if (event) {
      const handlers = this._listeners.get(event);
      return handlers ? handlers.size : 0;
    }
    let total = 0;
    for (const set of this._listeners.values()) {
      total += set.size;
    }
    return total;
  }

  /**
   * Clears listeners for a given event, or all listeners if no event specified.
   * Useful for test isolation and application teardown.
   * @param {string} [event]
   */
  static clear(event) {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }
}
