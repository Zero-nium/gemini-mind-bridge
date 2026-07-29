/**
 * Gemini DOM Adapter
 * Isolated selectors and DOM manipulation logic for gemini.google.com.
 * Strictly enforces read and insert boundaries without executing submit actions.
 */
(function (global) {
  'use strict';

  const UNTRUSTED_TAG_REGEX = /<\/?gemini_untrusted_output>/g;

  const SELECTORS = {
    // Custom elements / primary semantic containers
    userQuery: 'user-query, [data-test-id="user-query"], .user-query-container',
    modelResponse: 'model-response, [data-test-id="model-response"], .model-response-text',

    // Active generation indicators
    stopButton: 'button[aria-label*="Stop"], button[aria-label*="stop"], [data-test-id="stop-button"], .stop-generating-button',

    // Framework-managed prompt input container
    promptInput: 'rich-textarea div[contenteditable="true"], div[contenteditable="true"][role="textbox"], textarea[aria-label*="Prompt"]'
  };

  function sanitizeText(text) {
    if (!text) return '';
    return text.replace(UNTRUSTED_TAG_REGEX, '');
  }

  const GeminiAdapter = {
    isGenerating: function () {
      const stopBtn = document.querySelector(SELECTORS.stopButton);
      return stopBtn !== null && stopBtn.offsetWidth > 0 && stopBtn.offsetHeight > 0;
    },

    extractLastSlice: function () {
      if (this.isGenerating()) {
        return null;
      }

      const userNodes = document.querySelectorAll(SELCUTORS.userQuery);
      const modelNodes = document.querySelectorAll(SELECTORS.modelResponse);

      if (userNodes.length === 0 || modelNodes.length === 0) {
        return null;
      }

      const lastUserText = sanitizeText(userNodes[userNodes.length - 1].innerText || userNodes[userNodes.length - 1].textContent || '').trim();
      const lastModelText = sanitizeText(modelNodes[modelNodes.length - 1].innerText || modelNodes[modelNodes.length - 1].textContent || '').trim();

      if (!lastUserText || !lastModelText) {
        return null;
      }

      const formattedSlice = `User: ${lastUserText}
^G\n\ngemini: ${lastModelText}`;

      return {
        prompt: lastUserText,
        response: lastModelText,
        rawSlice: formattedSlice
      };
    },

    insertDraft: function (text) {
      if (!text || typeof text !== 'string') {
        return false;
      }

      const inputEl = document.querySelector(SELECTORS.promptInput);
      if (!inputEl) {
        return false;
      }

      inputEl.focus();

      if (inputEl.tagName.toLowerCase() === 'textarea') {
        inputEl.value = text;
      } else {
        inputEl.textContent = text;
      }

      inputEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

      return true;
    }
  };

  global.GeminiAdapter = GeminiAdapter;
})(typeof window !== 'undefined' ? window : this);
