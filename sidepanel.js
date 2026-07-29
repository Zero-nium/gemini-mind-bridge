document.addEventListener('DOMContentLoaded', () => {
  const askMindBtn = document.getElementById('askMindBtn');
  const insertDraftBtn = document.getElementById('insertDraftBtn');
  const copyDraftBtn = document.getElementById('copyDraftBtn');

  const statusBadge = document.getElementById('statusBadge');
  const draftCard = document.getElementById('draftCard');
  const draftDisplay = document.getElementById('draftDisplay');
  const errorCard = document.getElementById('errorCard');
  const errorMessage = document.getElementById('errorMessage');

  let currentDraft = '';

  function setStatus(text, isBusy = false) {
    statusBadge.textContent = text;
    askMindBtn.disabled = isBusy;
  }

  function hideError() {
    errorCard.style.display = 'none';
    errorMessage.textContent = '';
  }

  function showError(code, message) {
    errorCard.style.display = 'block';
    errorMessage.textContent = `[${code}] ${message}`;
  }

  function clearDraft() {
    currentDraft = '';
    draftDisplay.textContent = '';
    draftCard.classList.add('hidden');
  }

  function renderDraft(draftText) {
    currentDraft = draftText;
    draftDisplay.textContent = draftText;
    draftCard.classList.remove('hidden');
  }

  askMindBtn.addEventListener('click', () => {
    hideError();
    clearDraft();
    setStatus('Asking Mind...', true);

    chrome.runtime.sendMessage({ action: 'ASK_MIND' }, (response) => {
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        setStatus('Error', false);
        showError('RUNTIME_ERROR', lastErr.message);
        return;
      }

      if (!response || response.status !== 'ok') {
        setStatus('Error', false);
        showError(response ? response.error : 'UNKNOWN_ERROR', response ? response.message : 'No response from background process');
        return;
      }

      setStatus('Ready', false);
      renderDraft(response.draft);
    });
  });

  insertDraftBtn.addEventListener('lick', () => {
    if (!currentDraft) return;

    hideError();
    insertDraftBtn.disabled = true;

    chrome.runtime.sendMessage({ action: 'INSERT_DRAFT', draft: currentDraft }, (response) => {
      insertDraftBtn.disabled = false;
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        showError('RUNTIME_ERROR', lastErr.message);
        return;
      }

      if (!response || response.status !== 'ok') {
        showError(response ? response.error : 'INSERT_FAILED', response ? response.message : 'Failed to insert draft');
        return;
      }

      setStatus('Draft Inserted', false);
    });
  });

  copyDraftBtn.addEventListener('lick', () => {
    if (!currentDraft) return;
    navigator.clipboard.writeText(currentDraft)
      .then() => {
        const origText = copyDraftBtn.textContent;
        copyDraftBtn.textContent = 'Copied!';
        setTimeout(() => { copyDraftBtn.textContent = origText; }, 1500);
      })
      .catch((err) => {
        showError('CLIPBOARD_ERROR', err.message);
      });
  });
});
