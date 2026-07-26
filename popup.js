document.addEventListener('DOMContentLoaded', () => {
  const updateBtn = document.getElementById('updateChat');
  const downloadBtn = document.getElementById('downloadBtn');
  const logEl = document.getElementById('log');
  const chatSelect = document.getElementById('chatSelect');

  function log(msg) {
    if (!logEl) return;
    const time = new Date().toLocaleTimeString();
    logEl.value += `[${time}] ${msg}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function populateChats(list) {
    if (!chatSelect) return;
    chatSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.textContent = 'Current Chat / Select Group';
    placeholder.value = '';
    chatSelect.appendChild(placeholder);

    if (Array.isArray(list)) {
      list.forEach((title) => {
        const opt = document.createElement('option');
        opt.value = title;
        opt.textContent = title;
        chatSelect.appendChild(opt);
      });
    }
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

      const tryInjectionThenMessage = (tabId, finalCb) => {
        tryTab(tabId, (resp) => {
          if (resp) return finalCb && finalCb(resp);
          if (chrome.scripting) {
            chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }, () => {
              tryTab(tabId, (resp2) => finalCb && finalCb(resp2));
            });
            if (chrome.scripting.insertCSS) {
              chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] }, () => {});
            }
          } else {
            finalCb && finalCb(null);
          }
        });
      };

      if (tabs && tabs[0]) {
        tryInjectionThenMessage(tabs[0].id, (resp) => {
          if (resp) return callback && callback(resp);
          chrome.tabs.query({ url: '*://web.whatsapp.com/*' }, (cands) => {
            if (cands && cands[0]) {
              tryInjectionThenMessage(cands[0].id, (r2) => callback && callback(r2));
            } else callback && callback(null);
          });
        });
      } else {
        chrome.tabs.query({ url: '*://web.whatsapp.com/*' }, (cands) => {
          if (cands && cands[0]) {
            tryInjectionThenMessage(cands[0].id, (r2) => callback && callback(r2));
          } else callback && callback(null);
        });
      }
    });
  }

  function triggerScan() {
    log('Scanning active chat for downloadable media...');
    sendMessageToWhatsapp({ action: 'scan' }, (resp) => {
      if (!resp) {
        log('No active WhatsApp Web tab found. Please open web.whatsapp.com.');
        if (downloadBtn) downloadBtn.disabled = true;
        return;
      }
      log(`Found ${resp.count} media items in active chat`);
      if (downloadBtn) downloadBtn.disabled = resp.count === 0;
    });
  }

  // Event Listeners
  if (updateBtn) {
    updateBtn.addEventListener('click', () => {
      const selected = chatSelect && chatSelect.value;
      if (selected) {
        log(`Selecting chat: "${selected}"...`);
        sendMessageToWhatsapp({ action: 'selectChat', title: selected }, (selectResp) => {
          if (!selectResp || !selectResp.ok) {
            log('Could not automatically select chat in page.');
          }
          triggerScan();
        });
      } else {
        triggerScan();
      }
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const filters = {
        images: document.getElementById('optImages')?.checked ?? true,
        video: document.getElementById('optVideo')?.checked ?? true,
        audio: document.getElementById('optAudio')?.checked ?? true,
        documents: document.getElementById('optDocs')?.checked ?? true
      };

      log('Starting download process...');
      const payload = { action: 'download', filters, limit: 200 };
      if (chatSelect && chatSelect.value) payload.chat = chatSelect.value;

      sendMessageToWhatsapp(payload, (resp) => {
        if (!resp) {
          log('No response from WhatsApp Web page.');
          return;
        }
        log(`Batch download initiated: ${resp.count} items queued.`);
      });
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'log') {
      log(msg.text);
    }
    if (msg.action === 'done') {
      log(`Download complete — processed ${msg.count} items.`);
    }
  });

  // On Load: Populate chats & initial media scan automatically
  sendMessageToWhatsapp({ action: 'listChats' }, (resp) => {
    if (resp && resp.chats) {
      populateChats(resp.chats);
      log(`Retrieved ${resp.chats.length} active chats.`);
    } else {
      log('Could not retrieve chat list. Is web.whatsapp.com open?');
    }
    triggerScan();
  });
});