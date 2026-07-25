document.addEventListener('DOMContentLoaded', () => {
  const updateBtn = document.getElementById('updateChat');
  const downloadBtn = document.getElementById('downloadBtn');
  const logEl = document.getElementById('log');

  function log(msg) {
    const time = new Date().toLocaleTimeString();
    logEl.value += `[${time}] ${msg}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function sendMessageToWhatsapp(message, callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tryTab = (tabId, cb) => {
        chrome.tabs.sendMessage(tabId, message, (resp) => {
          if (chrome.runtime.lastError || !resp) {
            cb && cb(null);
          } else cb && cb(resp);
        });
      };

      if (tabs && tabs[0]) {
        tryTab(tabs[0].id, (resp) => {
          if (resp) return callback && callback(resp);
          // fallback: look for any WhatsApp Web tab
          chrome.tabs.query({ url: '*://web.whatsapp.com/*' }, (cands) => {
            if (cands && cands[0]) {
              tryTab(cands[0].id, (r2) => callback && callback(r2));
            } else callback && callback(null);
          });
        });
      } else {
        chrome.tabs.query({ url: '*://web.whatsapp.com/*' }, (cands) => {
          if (cands && cands[0]) {
            tryTab(cands[0].id, (r2) => callback && callback(r2));
          } else callback && callback(null);
        });
      }
    });
  }

  updateBtn.addEventListener('click', () => {
    log('Requesting scan of current chat...');
    sendMessageToWhatsapp({ action: 'scan' }, (resp) => {
      if (!resp) {
        log('No response from page. Make sure WhatsApp Web is open in some tab.');
        return;
      }
      log(`Found ${resp.count} media items in the current chat`);
      downloadBtn.disabled = resp.count === 0;
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
    sendMessageToWhatsapp({ action: 'download', filters, limit: 100 }, (resp) => {
      if (!resp) {
        log('No response from page.');
        return;
      }
      log(`Download started: ${resp.count} items`);
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