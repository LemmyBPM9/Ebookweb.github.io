/**
 * js/storage/settings-store.js
 * Synchronous localStorage settings manager for themes and typography.
 * Includes defensive in-memory fallback for environments where localStorage is blocked.
 */

export const THEMES = Object.freeze({
  WARM_PAPER: 'warm-paper',
  SOFT_DARK: 'soft-dark',
  DAYLIGHT: 'daylight',
  SAGE: 'sage',
  SOLARIZED_LIGHT: 'solarized-light',
  SOLARIZED_DARK: 'solarized-dark',
  NORD: 'nord',
  OLED_BLACK: 'oled-black',
  ROSE_PINE: 'rose-pine',
  E_INK: 'e-ink'
});

export const VALID_THEMES = Object.freeze(Object.values(THEMES));
export const DEFAULT_THEME = THEMES.WARM_PAPER;

export const DEFAULT_TYPOGRAPHY = Object.freeze({
  fontFamily: 'serif',   // 'serif' | 'sans' | 'dyslexic'
  fontSize: 18,         // px: 14 to 32
  lineHeight: 1.75,     // unitless: 1.3 to 2.4
  maxWidth: 720         // px: 540 to 1000
});

export const STORAGE_KEYS = Object.freeze({
  THEME: 'webreader_theme',
  TYPOGRAPHY: 'webreader_typography',
  READING_MODE: 'webreader_reading_mode',
  LAST_BOOK_ID: 'webreader_last_book_id'
});

export class SettingsManager {
  static _memoryFallback = new Map();

  /**
   * Safe localStorage getter with fallback.
   * @private
   */
  static _safeGet(key) {
    try {
      if (typeof localStorage !== 'undefined') {
        const val = localStorage.getItem(key);
        if (val !== null) return val;
      }
    } catch (e) {
      // Fall through to memory fallback
    }
    return this._memoryFallback.has(key) ? this._memoryFallback.get(key) : null;
  }

  /**
   * Safe localStorage setter with fallback.
   * @private
   */
  static _safeSet(key, value) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch (e) {
      // Fallback in-memory
    }
    this._memoryFallback.set(key, value);
  }

  /**
   * Gets the active theme ID.
   * @returns {string}
   */
  static getTheme() {
    const theme = this._safeGet(STORAGE_KEYS.THEME);
    return VALID_THEMES.includes(theme) ? theme : THEMES.WARM_PAPER;
  }

  /**
   * Sets the active theme ID and updates the document root data-theme.
   * @param {string} themeId
   */
  static setTheme(themeId) {
    const validTheme = VALID_THEMES.includes(themeId) ? themeId : THEMES.WARM_PAPER;
    this._safeSet(STORAGE_KEYS.THEME, validTheme);
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.theme = validTheme;
      document.documentElement.setAttribute('data-theme', validTheme);
    }
  }

  /**
   * Gets typography settings, merged with defaults.
   * @returns {Object}
   */
  static getTypography() {
    const raw = this._safeGet(STORAGE_KEYS.TYPOGRAPHY);
    if (!raw) return { ...DEFAULT_TYPOGRAPHY };
    try {
      const parsed = JSON.parse(raw);
      return {
        fontFamily: ['serif', 'sans', 'dyslexic'].includes(parsed.fontFamily)
          ? parsed.fontFamily
          : DEFAULT_TYPOGRAPHY.fontFamily,
        fontSize: typeof parsed.fontSize === 'number' && parsed.fontSize >= 12 && parsed.fontSize <= 40
          ? parsed.fontSize
          : DEFAULT_TYPOGRAPHY.fontSize,
        lineHeight: typeof parsed.lineHeight === 'number' && parsed.lineHeight >= 1.2 && parsed.lineHeight <= 2.8
          ? parsed.lineHeight
          : DEFAULT_TYPOGRAPHY.lineHeight,
        maxWidth: typeof parsed.maxWidth === 'number' && parsed.maxWidth >= 480 && parsed.maxWidth <= 1200
          ? parsed.maxWidth
          : DEFAULT_TYPOGRAPHY.maxWidth
      };
    } catch (e) {
      return { ...DEFAULT_TYPOGRAPHY };
    }
  }

  /**
   * Updates partial typography settings.
   * @param {Object} partial
   */
  static setTypography(partial) {
    const current = this.getTypography();
    const updated = { ...current, ...partial };
    this._safeSet(STORAGE_KEYS.TYPOGRAPHY, JSON.stringify(updated));
  }

  /**
   * Gets the active reading mode.
   * @returns {'paginated' | 'scroll'}
   */
  static getReadingMode() {
    const mode = this._safeGet(STORAGE_KEYS.READING_MODE);
    return mode === 'scroll' ? 'scroll' : 'paginated';
  }

  /**
   * Sets reading mode.
   * @param {'paginated' | 'scroll'} mode
   */
  static setReadingMode(mode) {
    const validMode = mode === 'scroll' ? 'scroll' : 'paginated';
    this._safeSet(STORAGE_KEYS.READING_MODE, validMode);
  }

  /**
   * Gets ID of the last active book.
   * @returns {string|null}
   */
  static getLastBookId() {
    return this._safeGet(STORAGE_KEYS.LAST_BOOK_ID);
  }

  /**
   * Sets ID of the last active book.
   * @param {string|null} bookId
   */
  static setLastBookId(bookId) {
    if (bookId) {
      this._safeSet(STORAGE_KEYS.LAST_BOOK_ID, String(bookId));
    } else {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(STORAGE_KEYS.LAST_BOOK_ID);
        }
      } catch (e) {}
      this._memoryFallback.delete(STORAGE_KEYS.LAST_BOOK_ID);
    }
  }

  /**
   * Contract facade: returns complete settings object.
   * @returns {{ theme: string, typography: Object, readingMode: string, lastBookId: string|null }}
   */
  static getSettings() {
    return {
      theme: this.getTheme(),
      typography: this.getTypography(),
      readingMode: this.getReadingMode(),
      lastBookId: this.getLastBookId()
    };
  }

  /**
   * Contract facade: saves partial settings.
   * @param {Object} partialSettings
   */
  static saveSettings(partialSettings) {
    if (!partialSettings || typeof partialSettings !== 'object') return;
    if (partialSettings.theme) {
      this.setTheme(partialSettings.theme);
    }
    if (partialSettings.typography) {
      this.setTypography(partialSettings.typography);
    }
    if (partialSettings.readingMode) {
      this.setReadingMode(partialSettings.readingMode);
    }
    if ('lastBookId' in partialSettings) {
      this.setLastBookId(partialSettings.lastBookId);
    }
  }
}
