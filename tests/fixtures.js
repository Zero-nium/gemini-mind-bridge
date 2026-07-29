(function () {
  'use strict';

  function assertEqual(actual, expected, testName) {
    if (actual === expected) {
      console.log(`[PASS] ${testName}`);
    } else {
      console.error(`[FAIL] ${testName}\n  Expected: ${expected}\n  Actual:   ${actual}`);
    }
  }

  function assertNull(actual, testName) {
    if (actual === null) {
      console.log(`[PASS] ${testName}`);
    } else {
      console.error(`[FAIL] ${testName}\n  Expected null, got:`, actual);
    }
  }

  function setupCompletedTurnDOM() {
    document.body.innerHTML = `
      <div id="chat-container">
        <user-query>First user prompt</user-query>
        <model-response>First model answer</model-response>
        <user-query>What is the current status?</user-query>
        <model-response>The system is fully operational.</model-response>
      </div>
      <rich-textarea><div contenteditable="true" role="textbox"></div></rich-textarea>
    `;
  }

  function setupStreamingDOM() {
    document.body.innerHTML = `
      <div id="chat-container">
        <user-query>Tell me a long story</user-query>
        <model-response>Once upon a time in a distant...</model-response>
      </div>
      <button aria-label="Stop generating">Stop</button>
      <rich-textarea><div contenteditable="true" role="textbox"></div></rich-textarea>
    `;
  }

  function setupMissingSelectorsDOM() {
    document.body.innerHTML = `
      <div class="unknown-layout">
        <p>Some random non-matching content</p>
      </div>
    `;
  }

  function runTests() {
    console.log('=== Starting Mind Bridge Extension Fixture Tests ===');

    if (typeof window.GeminiAdapter === 'undefined') {
      console.error('GeminiAdapter is not loaded.');
      return;
    }

    setupCompletedTurnDOM();
    let slice = window.GeminiAdapter.extractLastSlice();
    assertEqual(slice.prompt, 'What is the current status?', 'Extract completed prompt');
    assertEqual(slice.response, 'The system is fully operational.', 'Extract completed response');

    setupStreamingDOM();
    assertEqual(window.GeminiAdapter.isGenerating(), true, 'Detect active streaming state');
    slice = window.GeminiAdapter.extractLastSlice();
    assertNull(slice, 'Extract slice returns null during active streaming');

    setupMissingSelectorsDOM();
    slice = window.GeminiAdapter.extractLastSlice();
    assertNull(slice, 'Extract slice returns null on missing DOM selectors');

    setupCompletedTurnDOM();
    let eventFired = false;
    const inputEl = document.querySelector('rich-textarea div[contenteditable="true"]');
    inputEl.addEventListener('input', (e) => {
      if (e.bubbles) eventFired = true;
    });

    const inserted = window.GeminiAdapter.insertDraft('Test draft insertion text');
    assertEqual(inserted, true, 'Draft insertion returns true');
    assertEqual(inputEl.textContent, 'Test draft insertion text', 'Input field text matches inserted draft');
    assertEqual(eventFired, true, 'Bubbling input event was dispatched');

    let submitClicked = false;
    const mockSubmitBtn = document.createElement('button');
    mockSubmitBtn.setAttribute('aria-label', 'Send prompt');
    mockSubmitBtn.addEventListener('click', () => { submitClicked = true; });
    document.body.appendChild(mockSubmitBtn);

    window.GeminiAdapter.insertDraft('Another draft');
    assertEqual(submitClicked, false, 'Insert draft does NOT invoke submit button');

    console.log('=== Mind Bridge Fixture Tests Complete ===');
  }

  if (typeof window !== 'undefined') {
    window.runMindBridgeTests = runTests;
  }
})();
