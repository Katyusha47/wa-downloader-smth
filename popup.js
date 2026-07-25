document.addEventListener('DOMContentLoaded', () => {
  const updateBtn = document.getElementById('updateChat');
  const downloadBtn = document.getElementById('downloadBtn');
  const logEl = document.getElementById('log');

  function log(msg) {
    const time = new Date().toLocaleTimeString();
    logEl.value += `[${time}] ${msg}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  updateBtn.addEventListener('click', () => {
    log('Requesting scan of current chat...');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) {
        log('No active tab');
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { action: 'scan' }, (resp) => {
        if (!resp) {
          log('No response from page. Make sure WhatsApp Web is open in the active tab.');
          return;
        }
        log(`Found ${resp.count} media items in the current chat`);
        downloadBtn.disabled = resp.count === 0;
      });
    });
  });

  downloadBtn.addEventListener('click', () => {
    const filters = {
      images: document.getElementById('optImages').checked,
      video: document.getElementById('optVideo').checked,
      audio: document.getElementById('optAudio').checked,
      documents: document.getElementById('optDocs').checked
    };

    log('Starting download...');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) {
        log('No active tab');
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { action: 'download', filters, limit: 100 }, (resp) => {
        if (!resp) {
          log('No response from page.');
          return;
        }
        log(`Download started: ${resp.count} items`);
      });
    });
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'log') {
      log(msg.text);
    }
    if (msg.action === 'done') {
      log(`Done — processed ${msg.count} items`);
    }
  });
});