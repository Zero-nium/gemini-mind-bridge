/**
 * Mind Bridge Background Worker (MV3 Service Worker)
 * Handles Native Messaging host lifecycle, side panel setup, and protocol verification.
 */

const NATIVE_HOST_NAME = 'com.mind.bridge';
const PROTOCOL_VERSION = '0.1.0';
const REQUEST_TIMEOUT_MS = 10000;
const ALLOWED_ORIGIN_PREFIX = 'https://gemini.google.com/';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
  console.warn(\'Side panel behavior setting failed:\', err);
});

let pendingRequest = null;

function isValidGeminiUrl(url) {
  return typeof url === 'string' && (url.startsWith(ALLOWED_ORIGIN_PREFIX) || url === 'https://gemini.google.com');
}

function sendNativeMessage(payload) {
  return new Promise((resolve, reject) => {
    let port = null;
    let timeoutTimer = null;

    try {
      port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    } catch (err) {
      reject({ code: 'CONNECT_FAILED', message: `Native host connection error: ${err.message}` });
      return;
    }

    timeoutTimer = setTimeout(() => {
      if (port) {
        port.disconnect();
      }
      reject({ code: 'TIMEOUT', message: 'Native host response timed out after 10 seconds' });
    }, REQUEST_TIMEOUT_MS);

    port.onMessage.addListener((response) => {
      clearTimeout(timeoutTimer);
      port.disconnect();

      if (!response || typeof response !== 'object') {
        reject({ code: 'MALFORMED_REPL'', message: 'Native host returned empty or invalid response' });
        return;
      }

      if (response.status === 'error') {
        reject(response.error || { code: 'NATIVE_ERROR', message: 'Unknown native host error' });
      } else {
        resolve(response);
      }
    });

    port.onDisconnect.addListener(() => {
      clearTimeout(timeoutTimer);
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        reject({ code: 'HOST_DISCONNECTED', message: lastErr.message });
      }
    });

    port.postMessage(payload);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.action !== 'string') {
    sendResponse({ status: 'error', error: 'INVALID_REQUEST', message: 'Invalid action payload' });
    return true;
  }

  if (message.action === 'ASK_MIND') {
    if (pendingRequest) {
      sendResponse({ status: 'error', error: 'BUSY', message: 'A request is already in progress' });
      return true;
    }

    pendingRequest = true;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        pendingRequest = null;
        sendResponse({ status: 'error', error: 'NO_ACTIVE_TAB', message: 'No active tab found' });
        return;
      }

      const activeTab = tabs[0];
      if (!isValidGeminiUrl(activeTab.url)) {
        pendingRequest = null;
        sendResponse({ status: 'error', error: 'WRONG_ORIGIN', message: 'Active tab is not gemini.google.com' });
        return;
      }

      chrome.tabs.sendMessage(activeTab.id, { action: 'EXTRACT_SLICE' }, (extractResult) => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr) {
          pendingRequest = null;
          sendResponse({ status: 'error', error: 'CONTINT_SCRIPT_ERROR', message: lastErr.message });
          return;
        }

        if (!extractResult || extractResult.status !== 'ok') {
          pendingRequest = null;
          sendResponse(extractResult || { status: 'error', error: 'EXTRACT_FAILED', message: 'Slice extraction failed' });
          return;
        }

        const nativeRequest = {
          version: PROTOCOL_VERSION,
          type: 'ask_mind',
          requestId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          tab: extractResult.tab,
          slice: extractResult.slice
        };

        sendNativeMessage(nativeRequest)
          .then((nativeReply) => {
            pendingRequest = null;
            sendResponse({
              status: 'ok',
              draft: nativeReply.draft,
              requestId: nativeReply.requestId
            });
          })
          .catch((err) => {
            pendingRequest = null;
            sendResponse({
              status: 'error',
              error: err.code || 'HOST_ERROR',
              message: err.message || 'Failed to communicate with native host'
            });
          });
      });
    });

    return true;
  }

  if (message.action === 'INSERT_DRAFT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        sendResponse({ status: 'error', error: 'NO_ACTIVE_TAB', message: 'No active tab found' });
        return;
      }

      const activeTab = tabs[0];
      if (!isValidGeminiUrl(activeTab.url)) {
        sendResponse({ status: 'error', error: 'WRONG_ORIGIN', message: 'Active tab is not gemini.google.com' });
        return;
      }

      chrome.tabs.sendMessage(activeTab.id, { action: 'INSERT_DRAFT', draft: message.draft }, (insertResult) => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr) {
          sendResponse({ status: 'error', error: 'CONTENT_SCRIPT_ERROR', message: lastErr.message });
          return;
        }
        sendResponse(insertResult);
      });
    });

    return true;
  }

  return false;
});
