/**
 * Mind Bridge Content Script
 * Runs in https://gemini.google.com/* content context.
 * Coordinates with adapter.js and background.js.
 */
(function () {
  'strict';

  const ALLOWED_ORIGIN = 'https://gemini.google.com';

  function validateOrigin() {
    return window.location.origin === ALLOWED_ORIGIN;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!validateOrigin()) {
      sendResponse({ status: 'error', error: 'WRONG_ORIGIN', message: 'Script executed outside valid origin' });
      return true;
    }

    if (!message || typeof message.action !== 'string') {
      sendResponse({ status: 'error', error: 'INVALID_MESSAGE', message: 'Malformed message request' });
      return true;
    }

    switch (message.action) {
      case 'EXTRACT_SLICE': {
        if (typeof window.GeminiAdapter === 'undefined') {
          sendResponse({ status: 'error', error: 'ADAPTER_MISSING', message: 'Gemini DOM adapter unavailable' });
          break;
        }

        if (window.GeminiAdapter.isGenerating()) {
          sendResponse({ status: 'error', error: 'ACTIVE_GENERATION', message: 'Gemini is currently generating a response' });
          break;
        }

        setTimeout(() => {
          if (window.GeminiAdapter.isGenerating()) {
            sendResponse({ status: 'error', error: 'ACTIVE_GENERATION', message: 'Gemini is currently generating a response' });
            return;
          }

          const sliceData = window.GeminiAdapter.extractLastSlice();
          if (!sliceData) {
            sendResponse({ status: 'error', error: 'EXTRACT_FAILED', message: 'Could not extract valid prompt/response slice' });
          } else {
            sendResponse({
              status: 'ok',
              slice: sliceData.rawSlice,
              tab: {
                url: window.location.href,
                title: document.title
              }
            });
          }
        }, 1200);

        return true;
      }

      case 'INSERT_DRAFT': {
        if (typeof window.GeminiAdapter === 'undefined') {
          sendResponse({ status: 'error', error: 'ADAPTER_MISSING', message: 'Gemini DOM adapter unavailable' });
          break;
        }

        const draftText = message.draft;
        const inserted = window.GeminiAdapter.insertDraft(draftText);

        if (inserted) {
          sendResponse({ status: 'ok' });
        } else {
          sendResponse({ status: 'error', error: 'INSERT_FAILED', message: 'Failed to find prompt input element' });
        }
        break;

      default:
        sendResponse({ status: 'error', error: 'UNKNOWN_ACTION', message: `Unknown action: ${message.action}` });
        break;
    }

    return true;
  });
})();