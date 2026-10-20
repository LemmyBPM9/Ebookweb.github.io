/**
 * js/ui/settings-panel.js
 * Eye-Comfort Theme Swatches & Advanced Typography Customization Drawer/Panel.
 * Controls 10 WCAG AAA Themes, 8 Typefaces (Classic Serif, Literata, Merriweather,
 * Lora, EB Garamond, Crimson Pro, Sans-Serif, Dyslexic), Font Size, Font Weight,
 * Text Alignment, Line Spacing, Paragraph Spacing, Letter Spacing, Word Spacing,
 * Reading Column Width, and One-Click Typography Reset.
 */

import { EventBus, EVENTS } from '../event-bus.js';
import { SettingsManager, DEFAULT_TYPOGRAPHY } from '../storage/settings-store.js';

const FONT_WEIGHT_LABELS = Object.freeze({
  300: '300 (Light)',
  400: '400 (Regular)',
  500: '500 (Medium)',
  600: '600 (Semi-Bold)',
  700: '700 (Bold)'
});

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

    // Listen to theme and typography changes from ReaderEngine or external events
    EventBus.on(EVENTS.THEME_CHANGED, () => this.syncUI());
    EventBus.on(EVENTS.TYPOGRAPHY_CHANGED, () => this.syncUI());
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
      this._bindRadiogroupKeyboard(
        themeContainer,
        '[data-theme-choice], [data-theme], .theme-option'
      );
    }

    // 2. Font Family Segmented Control / Grid (8 Typefaces)
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
    const fontContainer = this.drawer.querySelector('#font-family-options');
    if (fontContainer) {
      this._bindRadiogroupKeyboard(fontContainer, '[data-font-choice]');
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

    // 4. Font Weight Slider
    const fontWeightSlider = this.drawer.querySelector('#font-weight-slider');
    if (fontWeightSlider) {
      const onWeightInput = () => {
        const val = parseInt(fontWeightSlider.value, 10) || 400;
        const label = this.drawer.querySelector('#font-weight-value');
        if (label) label.textContent = FONT_WEIGHT_LABELS[val] || String(val);
        EventBus.emit('ui:set-typography', { fontWeight: val });
      };
      fontWeightSlider.addEventListener('input', onWeightInput);
      fontWeightSlider.addEventListener('change', onWeightInput);
    }

    // 5. Text Alignment Segmented Control
    const alignBtns = Array.from(this.drawer.querySelectorAll('[data-align-choice]'));
    for (const btn of alignBtns) {
      btn.addEventListener('click', () => {
        const textAlign = btn.getAttribute('data-align-choice');
        if (textAlign) {
          EventBus.emit('ui:set-typography', { textAlign });
          this.syncUI();
        }
      });
    }
    const alignContainer = this.drawer.querySelector('#text-align-options');
    if (alignContainer) {
      this._bindRadiogroupKeyboard(alignContainer, '[data-align-choice]');
    }

    // 6. Line Height Slider
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

    // 7. Paragraph Spacing Slider
    const paraSpacingSlider = this.drawer.querySelector('#paragraph-spacing-slider');
    if (paraSpacingSlider) {
      const onParaInput = () => {
        const val = parseFloat(paraSpacingSlider.value);
        const safeVal = Number.isFinite(val) ? val : 1.25;
        const label = this.drawer.querySelector('#paragraph-spacing-value');
        if (label) label.textContent = `${safeVal.toFixed(2)}em`;
        EventBus.emit('ui:set-typography', { paragraphSpacing: safeVal });
      };
      paraSpacingSlider.addEventListener('input', onParaInput);
      paraSpacingSlider.addEventListener('change', onParaInput);
    }

    // 8. Letter Spacing Slider
    const letterSpacingSlider = this.drawer.querySelector('#letter-spacing-slider');
    if (letterSpacingSlider) {
      const onLetterInput = () => {
        const val = parseFloat(letterSpacingSlider.value);
        const safeVal = Number.isFinite(val) ? val : 0;
        const label = this.drawer.querySelector('#letter-spacing-value');
        if (label) label.textContent = `${safeVal.toFixed(2)}em`;
        EventBus.emit('ui:set-typography', { letterSpacing: safeVal });
      };
      letterSpacingSlider.addEventListener('input', onLetterInput);
      letterSpacingSlider.addEventListener('change', onLetterInput);
    }

    // 9. Word Spacing Slider
    const wordSpacingSlider = this.drawer.querySelector('#word-spacing-slider');
    if (wordSpacingSlider) {
      const onWordInput = () => {
        const val = parseFloat(wordSpacingSlider.value);
        const safeVal = Number.isFinite(val) ? val : 0;
        const label = this.drawer.querySelector('#word-spacing-value');
        if (label) label.textContent = `${safeVal.toFixed(2)}em`;
        EventBus.emit('ui:set-typography', { wordSpacing: safeVal });
      };
      wordSpacingSlider.addEventListener('input', onWordInput);
      wordSpacingSlider.addEventListener('change', onWordInput);
    }

    // 10. Reading Width Slider
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

    // 11. Reset Typography Defaults Button
    const resetBtn = this.drawer.querySelector('#btn-reset-typography');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const defaults = SettingsManager.resetTypography();
        EventBus.emit('ui:set-typography', defaults);
        this.syncUI();
      });
    }
  }

  _bindRadiogroupKeyboard(container, itemSelector) {
    container.addEventListener('keydown', (e) => {
      const btns = Array.from(container.querySelectorAll(itemSelector));
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
      btn.setAttribute('aria-checked', String(isMatch));
      btn.setAttribute('aria-pressed', String(isMatch));
      btn.setAttribute('tabindex', isMatch ? '0' : '-1');
    }

    const alignBtns = Array.from(this.drawer.querySelectorAll('[data-align-choice]'));
    for (const btn of alignBtns) {
      const isMatch = btn.getAttribute('data-align-choice') === (typo.textAlign || 'left');
      btn.classList.toggle('is-active', isMatch);
      btn.setAttribute('aria-checked', String(isMatch));
      btn.setAttribute('aria-pressed', String(isMatch));
      btn.setAttribute('tabindex', isMatch ? '0' : '-1');
    }

    const fontSizeSlider = this.drawer.querySelector('#font-size-slider');
    const fontSizeValue = this.drawer.querySelector('#font-size-value');
    if (fontSizeSlider) fontSizeSlider.value = String(typo.fontSize);
    if (fontSizeValue) fontSizeValue.textContent = `${typo.fontSize}px`;

    const fontWeight = Number(typo.fontWeight) || DEFAULT_TYPOGRAPHY.fontWeight;
    const fontWeightSlider = this.drawer.querySelector('#font-weight-slider');
    const fontWeightValue = this.drawer.querySelector('#font-weight-value');
    if (fontWeightSlider) fontWeightSlider.value = String(fontWeight);
    if (fontWeightValue) fontWeightValue.textContent = FONT_WEIGHT_LABELS[fontWeight] || String(fontWeight);

    const lineHeightSlider = this.drawer.querySelector('#line-height-slider');
    const lineHeightValue = this.drawer.querySelector('#line-height-value');
    if (lineHeightSlider) lineHeightSlider.value = String(typo.lineHeight);
    if (lineHeightValue) lineHeightValue.textContent = Number(typo.lineHeight).toFixed(2);

    const paraSpacing = Number(typo.paragraphSpacing ?? DEFAULT_TYPOGRAPHY.paragraphSpacing);
    const paraSpacingSlider = this.drawer.querySelector('#paragraph-spacing-slider');
    const paraSpacingValue = this.drawer.querySelector('#paragraph-spacing-value');
    if (paraSpacingSlider) paraSpacingSlider.value = String(paraSpacing);
    if (paraSpacingValue) paraSpacingValue.textContent = `${paraSpacing.toFixed(2)}em`;

    const letterSpacing = Number(typo.letterSpacing ?? DEFAULT_TYPOGRAPHY.letterSpacing);
    const letterSpacingSlider = this.drawer.querySelector('#letter-spacing-slider');
    const letterSpacingValue = this.drawer.querySelector('#letter-spacing-value');
    if (letterSpacingSlider) letterSpacingSlider.value = String(letterSpacing);
    if (letterSpacingValue) letterSpacingValue.textContent = `${letterSpacing.toFixed(2)}em`;

    const wordSpacing = Number(typo.wordSpacing ?? DEFAULT_TYPOGRAPHY.wordSpacing);
    const wordSpacingSlider = this.drawer.querySelector('#word-spacing-slider');
    const wordSpacingValue = this.drawer.querySelector('#word-spacing-value');
    if (wordSpacingSlider) wordSpacingSlider.value = String(wordSpacing);
    if (wordSpacingValue) wordSpacingValue.textContent = `${wordSpacing.toFixed(2)}em`;

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
