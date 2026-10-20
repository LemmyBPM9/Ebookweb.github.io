/**
 * js/ui/toast.js
 * Accessible Non-Blocking Toast / Alert Notification Component.
 */

import { EventBus, EVENTS } from '../event-bus.js';

export class ToastManager {
  static _container = null;
  static _hideTimer = null;

  static init() {
    if (this._container) return;

    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'assertive');
      container.setAttribute('aria-atomic', 'true');
      document.body.appendChild(container);
    }
    this._container = container;

    EventBus.on(EVENTS.TOAST_SHOW, (payload = {}) => {
      this.show(payload.message || 'Notification', payload.type || 'info', payload.duration || 4000);
    });
  }

  /**
   * Displays a non-blocking toast notification.
   *
   * @param {string} message
   * @param {'info'|'error'|'success'} [type='info']
   * @param {number} [duration=4000]
   */
  static show(message, type = 'info', duration = 4000) {
    this.init();
    if (!this._container) return;

    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }

    const toastEl = document.createElement('div');
    toastEl.className = `toast toast-${type}${type === 'error' ? ' error-banner' : ''}`;
    toastEl.setAttribute('role', 'alert');

    const textSpan = document.createElement('span');
    textSpan.className = 'toast-message';
    textSpan.textContent = String(message);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close-btn';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => {
      toastEl.remove();
    });

    toastEl.appendChild(textSpan);
    toastEl.appendChild(closeBtn);

    this._container.innerHTML = '';
    this._container.appendChild(toastEl);

    if (duration > 0) {
      this._hideTimer = setTimeout(() => {
        if (toastEl.parentNode) {
          toastEl.remove();
        }
      }, duration);
    }
  }
}

export default ToastManager;
