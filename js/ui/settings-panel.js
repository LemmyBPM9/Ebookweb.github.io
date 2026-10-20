/**
 * js/ui/settings-panel.js
 * Eye-Comfort Theme Swatches & Typography Customization Drawer/Panel.
 * Controls 4 WCAG AAA Themes, Font Family (Serif, Sans, Dyslexic/Mono),
 * Font Size, Line Height, and Reading Column Width.
 */

import { EventBus, EVENTS } from '../event-bus.js';
import { SettingsManager } from '../storage/settings-store.js';

export class SettingsPanel {
  /**
   * @param {object} options
   * @param {HTMLElement} options.drawer - #settings-drawer element
   * @param {HTMLElement} options.backdrop - #drawer-backdrop element
   */
  constructor(options = {}) {
    this.drawer = options.drawer;
    this.backdrop = options.backdrop;
    this.closeBtn = this.drawer?.querySelector('#btn-close-settings');

    this._bindControls();
    this.syncUI();

    // Listen to theme changes from ReaderEngine or external events
    EventBus.on(EVENTS.THEME_CHANGED, () => this.syncUI());
  }

  _bindControls() {
    if (!this.drawer) return;

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    // 1. Theme Swatches (Handles all 10 themes with accessible radio group interaction)
    const themeBtns = Array.from(
      this.drawer.querySelectorAll('[data-theme-choice], [data-theme], .theme-option')
    );
    for (const btn of themeBtns) {
      btn.addEventListener('click', () => {
        const themeId = btn.getAttribute('data-theme-choice') || btn.getAttribute('data-theme');
        if (themeId) {
          SettingsManager.setTheme(themeId);
          document.documentElement.setAttribute('data-theme', themeId);
          if (document.body) document.body.setAttribute('data-theme', themeId);
          EventBus.emit('ui:set-theme', { themeId });
          EventBus.emit(EVENTS.THEME_CHANGED, { themeId });
          this.syncUI();
        }
      });
    }

    // Keyboard Arrow navigation inside #theme-options radio group
    const themeContainer = this.drawer.querySelector('#theme-options, .theme-swatches');
    if (themeContainer) {
      themeContainer.addEventListener('keydown', (e) => {
        const btns = Array.from(
          themeContainer.querySelectorAll('[data-theme-choice], [data-theme], .theme-option')
        );
        const currentIndex = btns.findIndex(b => b === document.activeElement);
        if (currentIndex === -1) return;

        let targetIndex = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          targetIndex = (currentIndex + 1) % btns.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          targetIndex = (currentIndex - 1 + btns.length) % btns.length;
        } else if (e.key === 'Home') {
          targetIndex = 0;
        } else if (e.key === 'End') {
          targetIndex = btns.length - 1;
        }

        if (targetIndex !== -1) {
          e.preventDefault();
          const targetBtn = btns[targetIndex];
          targetBtn.focus();
          targetBtn.click();
        }
      });
    }

    // 2. Font Family Segmented Control
    const fontBtns = Array.from(this.drawer.querySelectorAll('[data-font-choice]'));
    for (const btn of fontBtns) {
      btn.addEventListener('click', () => {
        const fontFamily = btn.getAttribute('data-font-choice');
        if (fontFamily) {
          EventBus.emit('ui:set-typography', { fontFamily });
          this.syncUI();
        }
      });
    }

    // 3. Font Size Slider
    const fontSizeSlider = this.drawer.querySelector('#font-size-slider');
    if (fontSizeSlider) {
      const onSizeInput = () => {
        const val = parseInt(fontSizeSlider.value, 10) || 18;
        const label = this.drawer.querySelector('#font-size-value');
        if (label) label.textContent = `${val}px`;
        EventBus.emit('ui:set-typography', { fontSize: val });
      };
      fontSizeSlider.addEventListener('input', onSizeInput);
      fontSizeSlider.addEventListener('change', onSizeInput);
    }

    // 4. Line Height Slider
    const lineHeightSlider = this.drawer.querySelector('#line-height-slider');
    if (lineHeightSlider) {
      const onLhInput = () => {
        const val = parseFloat(lineHeightSlider.value) || 1.75;
        const label = this.drawer.querySelector('#line-height-value');
        if (label) label.textContent = val.toFixed(2);
        EventBus.emit('ui:set-typography', { lineHeight: val });
      };
      lineHeightSlider.addEventListener('input', onLhInput);
      lineHeightSlider.addEventListener('change', onLhInput);
    }

    // 5. Reading Width Slider
    const maxWidthSlider = this.drawer.querySelector('#max-width-slider');
    if (maxWidthSlider) {
      const onWidthInput = () => {
        const val = parseInt(maxWidthSlider.value, 10) || 720;
        const label = this.drawer.querySelector('#max-width-value');
        if (label) label.textContent = `${val}px`;
        EventBus.emit('ui:set-typography', { maxWidth: val });
      };
      maxWidthSlider.addEventListener('input', onWidthInput);
      maxWidthSlider.addEventListener('change', onWidthInput);
    }
  }

  /**
   * Synchronizes control values and active states with SettingsManager.
   */
  syncUI() {
    if (!this.drawer) return;
    const theme = SettingsManager.getTheme();
    const typo = SettingsManager.getTypography();

    const themeBtns = Array.from(
      this.drawer.querySelectorAll('[data-theme-choice], [data-theme], .theme-option')
    );
    for (const btn of themeBtns) {
      const btnTheme = btn.getAttribute('data-theme-choice') || btn.getAttribute('data-theme');
      const isMatch = btnTheme === theme;
      btn.classList.toggle('is-active', isMatch);
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-checked', String(isMatch));
      btn.setAttribute('aria-pressed', String(isMatch));
      btn.setAttribute('tabindex', isMatch ? '0' : '-1');
    }

    const fontBtns = Array.from(this.drawer.querySelectorAll('[data-font-choice]'));
    for (const btn of fontBtns) {
      const isMatch = btn.getAttribute('data-font-choice') === typo.fontFamily;
      btn.classList.toggle('is-active', isMatch);
      btn.setAttribute('aria-pressed', String(isMatch));
    }

    const fontSizeSlider = this.drawer.querySelector('#font-size-slider');
    const fontSizeValue = this.drawer.querySelector('#font-size-value');
    if (fontSizeSlider) fontSizeSlider.value = String(typo.fontSize);
    if (fontSizeValue) fontSizeValue.textContent = `${typo.fontSize}px`;

    const lineHeightSlider = this.drawer.querySelector('#line-height-slider');
    const lineHeightValue = this.drawer.querySelector('#line-height-value');
    if (lineHeightSlider) lineHeightSlider.value = String(typo.lineHeight);
    if (lineHeightValue) lineHeightValue.textContent = Number(typo.lineHeight).toFixed(2);

    const maxWidthSlider = this.drawer.querySelector('#max-width-slider');
    const maxWidthValue = this.drawer.querySelector('#max-width-value');
    if (maxWidthSlider) maxWidthSlider.value = String(typo.maxWidth);
    if (maxWidthValue) maxWidthValue.textContent = `${typo.maxWidth}px`;
  }

  open() {
    if (!this.drawer) return;
    this.syncUI();
    this.drawer.classList.add('is-open', 'open');
    this.drawer.setAttribute('aria-hidden', 'false');
    if (this.backdrop) {
      this.backdrop.classList.add('is-open', 'open');
    }
    EventBus.emit(EVENTS.DRAWER_OPEN, { drawer: 'settings' });
  }

  close() {
    if (!this.drawer) return;
    this.drawer.classList.remove('is-open', 'open');
    this.drawer.setAttribute('aria-hidden', 'true');
    if (this.backdrop) {
      this.backdrop.classList.remove('is-open', 'open');
    }
    EventBus.emit(EVENTS.DRAWER_CLOSE, { drawer: 'settings' });
  }

  isOpen() {
    return Boolean(this.drawer?.classList.contains('is-open') || this.drawer?.classList.contains('open'));
  }
}

export default SettingsPanel;
