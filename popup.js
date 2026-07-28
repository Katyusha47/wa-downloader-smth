document.addEventListener('DOMContentLoaded', () => {
  const updateBtn = document.getElementById('updateChat');
  const downloadBtn = document.getElementById('downloadBtn');
  const logEl = document.getElementById('log');
  const chatSelect = document.getElementById('chatSelect');
  const optDeepScan = document.getElementById('optDeepScan');
  const fromDateInput = document.getElementById('fromDate');
  const toDateInput = document.getElementById('toDate');

  const btnToday = document.getElementById('btnToday');
  const btn7Days = document.getElementById('btn7Days');
  const btnAllTime = document.getElementById('btnAllTime');

  function log(msg) {
    if (!logEl) return;
    const time = new Date().toLocaleTimeString();
    logEl.value += `[${time}] ${msg}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function formatDateIso(dateObj) {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // Preset Handlers
  if (btnToday) {
    btnToday.addEventListener('click', () => {
      const todayStr = formatDateIso(new Date());
      if (fromDateInput) fromDateInput.value = todayStr;
      if (toDateInput) toDateInput.value = todayStr;
      log(`Date filter set: Today (${todayStr})`);
    });
  }

  if (btn7Days) {
    btn7Days.addEventListener('click', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (fromDateInput) fromDateInput.value = formatDateIso(past);
      if (toDateInput) toDateInput.value = formatDateIso(now);
      log(`Date filter set: Last 7 Days (${formatDateIso(past)} to ${formatDateIso(now)})`);
    });
  }

  if (btnAllTime) {
    btnAllTime.addEventListener('click', () => {
      if (fromDateInput) fromDateInput.value = '';
      if (toDateInput) toDateInput.value = '';
      log('Date filter cleared (All Time).');
    });
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
    const isDeep = optDeepScan ? optDeepScan.checked : false;
    const fromDate = fromDateInput ? fromDateInput.value : '';
    const toDate = toDateInput ? toDateInput.value : '';

    let dateRangeStr = '';
    if (fromDate || toDate) {
      dateRangeStr = ` (${fromDate || 'Start'} to ${toDate || 'Today'})`;
    }

    if (isDeep) {
      log(`Starting Deep Scan${dateRangeStr}...`);
    } else {
      log(`Scanning active chat media${dateRangeStr}...`);
    }

    if (updateBtn) updateBtn.disabled = true;

    sendMessageToWhatsapp(
      {
        action: 'scan',
        deepScan: isDeep,
        dateRange: { fromDate, toDate }
      },
      (resp) => {
        if (updateBtn) updateBtn.disabled = false;
        if (!resp) {
          log('No active WhatsApp Web tab found. Please open web.whatsapp.com.');
          if (downloadBtn) downloadBtn.disabled = true;
          return;
        }
        log(`Scan complete: Found ${resp.count} matching media items.`);
        if (downloadBtn) downloadBtn.disabled = resp.count === 0;
      }
    );
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

      const fromDate = fromDateInput ? fromDateInput.value : '';
      const toDate = toDateInput ? toDateInput.value : '';

      log('Starting date-filtered batch download...');
      const payload = {
        action: 'download',
        filters,
        dateRange: { fromDate, toDate },
        limit: 500
      };
      if (chatSelect && chatSelect.value) payload.chat = chatSelect.value;

      sendMessageToWhatsapp(payload, (resp) => {
        if (!resp) {
          log('No response from WhatsApp Web page.');
          return;
        }
        log(`Batch download initiated: ${resp.count} matching items queued.`);
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