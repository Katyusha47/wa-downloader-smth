(() => {
  const BUTTON_CLASS = 'wmdc-download-btn';
  const TARGET_CLASS = 'wmdc-has-download-target';
  const BULK_BUTTON_CLASS = 'wmdc-bulk-open-btn';
  const BULK_PANEL_CLASS = 'wmdc-bulk-panel';
  const BULK_BACKDROP_CLASS = 'wmdc-bulk-backdrop';

  // --- Filtering & Validation Helpers ---

  function isIgnoredImage(img) {
    if (!img) return true;
    const src = img.currentSrc || img.src || '';
    if (!src) return true;

    // Filter out emojis, avatars, stickers, reactions, inline SVGs
    if (
      src.includes('/emoji/') ||
      src.includes('pps.whatsapp.net') ||
      src.includes('/pps/') ||
      src.includes('data:image/svg+xml') ||
      src.includes('data:image/gif') ||
      src.includes('sticker') ||
      src.includes('reaction')
    ) {
      return true;
    }

    // Ignore tiny images (avatars, icons, reaction badges)
    const width = img.naturalWidth || img.width || img.clientWidth || 0;
    const height = img.naturalHeight || img.height || img.clientHeight || 0;
    if ((width > 0 && width < 60) || (height > 0 && height < 60)) {
      return true;
    }

    // Ignore images inside header, status bar, or side pane
    if (img.closest('#pane-side') || img.closest('header')) {
      return true;
    }

    return false;
  }

  function getExtensionFromUrl(url, fallback = 'bin') {
    if (!url) return fallback;
    const namedMatch = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url);
    return namedMatch ? namedMatch[1].toLowerCase() : fallback;
  }

  function formatTimestampFilename(prefix = 'wa-media', ext = 'bin') {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `${prefix}-${stamp}.${ext}`;
  }

  // Extract original document or media filename from DOM
  function extractFilenameFromContainer(container, defaultExt) {
    // Check for document title/name in text elements inside document card
    const titleEl = container.querySelector('[title*="."], span[dir="auto"][title], [data-testid="document-thumb"] + div span');
    if (titleEl) {
      const name = titleEl.getAttribute('title') || titleEl.textContent?.trim();
      if (name && name.includes('.')) {
        return name.replace(/[/\\?%*:|"<>]/g, '_');
      }
    }
    return formatTimestampFilename('wa-media', defaultExt);
  }

  // Locate the actual WhatsApp Web message bubble container
  function getMessageBubbleContainer(node) {
    if (!node) return null;
    return (
      node.closest('[data-testid="msg-container"]') ||
      node.closest('div[role="row"]') ||
      node.closest('.message-in, .message-out') ||
      node.parentElement
    );
  }

  // --- Target Extraction ---

  function getDownloadTarget(container) {
    if (!container) return null;

    // 1. Video
    const video = container.querySelector('video[src], video source[src]');
    if (video) {
      const src = video.currentSrc || video.src;
      if (src) {
        return {
          url: src,
          extension: 'mp4',
          type: 'video',
          filename: formatTimestampFilename('wa-video', 'mp4')
        };
      }
    }

    // 2. Audio / Voice Note
    const audio = container.querySelector('audio[src], audio source[src], [data-testid="audio-player"] audio');
    if (audio) {
      const src = audio.currentSrc || audio.src;
      if (src) {
        return {
          url: src,
          extension: 'mp3',
          type: 'audio',
          filename: formatTimestampFilename('wa-audio', 'mp3')
        };
      }
    }

    // 3. Document attachment
    const docLink = container.querySelector('a[href][download], [data-testid="document-thumb"] a[href], a[href*="mmg.whatsapp.net"]');
    if (docLink && docLink.href) {
      const ext = getExtensionFromUrl(docLink.href, 'pdf');
      const filename = extractFilenameFromContainer(container, ext);
      return {
        url: docLink.href,
        extension: ext,
        type: 'document',
        filename
      };
    }

    // 4. Image
    const images = Array.from(container.querySelectorAll('img[src]')).filter((img) => !isIgnoredImage(img));
    if (images.length > 0) {
      const image = images[0];
      const src = image.currentSrc || image.src;
      const ext = src.includes('.webp') ? 'webp' : 'jpg';
      return {
        url: src,
        extension: ext,
        type: 'image',
        filename: formatTimestampFilename('wa-image', ext)
      };
    }

    return null;
  }

  // Convert blob: URLs to Data URLs so service worker / background script can download them cleanly
  async function prepareUrlForDownload(url) {
    if (url.startsWith('blob:')) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Blob fetch failed: ${response.status}`);
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (err) {
        console.warn('[WA Downloader] Fallback to direct blob URL due to fetch error:', err);
        return url;
      }
    }
    return url;
  }

  // --- Download Execution ---

  async function triggerDownload(target) {
    if (!target || !target.url) throw new Error('Invalid download target');

    const downloadUrl = await prepareUrlForDownload(target.url);

    // Try background service worker download first
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: 'downloadMedia',
            url: downloadUrl,
            filename: target.filename || formatTimestampFilename('wa-media', target.extension || 'bin')
          },
          (response) => {
            if (chrome.runtime.lastError || !response || !response.ok) {
              const errMsg = chrome.runtime.lastError?.message || response?.error || 'Background download failed';
              // Fallback to dynamic anchor click
              fallbackAnchorDownload(downloadUrl, target.filename || formatTimestampFilename('wa-media', target.extension));
              resolve();
            } else {
              resolve();
            }
          }
        );
      });
    } else {
      fallbackAnchorDownload(downloadUrl, target.filename || formatTimestampFilename('wa-media', target.extension));
    }
  }

  function fallbackAnchorDownload(url, filename) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  // --- In-Message Download Button Injection ---

  function attachDownloadButton(node) {
    const container = getMessageBubbleContainer(node);
    if (!container || container.querySelector(`.${BUTTON_CLASS}`)) {
      return;
    }

    const target = getDownloadTarget(container);
    if (!target || !target.url) {
      return;
    }

    container.classList.add(TARGET_CLASS);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.textContent = 'Download';

    const stopInteraction = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    button.addEventListener('mousedown', stopInteraction);
    button.addEventListener('pointerdown', stopInteraction);
    button.addEventListener('touchstart', stopInteraction);

    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      button.disabled = true;
      button.textContent = 'Saving...';

      try {
        await triggerDownload(target);
        button.textContent = 'Saved';
      } catch (error) {
        console.error('[WA Downloader Clone] download failed', error);
        button.textContent = 'Retry';
      } finally {
        setTimeout(() => {
          button.disabled = false;
          button.textContent = 'Download';
        }, 1500);
      }
    });

    container.appendChild(button);
  }

  // --- Bulk Download Capabilities ---

  function getChatRoot() {
    return document.querySelector('#main') || document.body;
  }

  function collectMediaTargets() {
    const root = getChatRoot();
    const selectors = [
      'img[src]',
      'video[src], video source[src]',
      'audio[src], audio source[src], [data-testid="audio-player"] audio',
      'a[href][download]',
      'a[href*="blob:"]',
      'a[href*="mmg.whatsapp.net"]'
    ];

    const items = [];
    const seen = new Set();

    root.querySelectorAll(selectors.join(',')).forEach((node) => {
      if (node.tagName === 'IMG' && isIgnoredImage(node)) {
        return;
      }

      const container = getMessageBubbleContainer(node);
      const target = getDownloadTarget(container || node);
      if (!target || !target.url || seen.has(target.url)) {
        return;
      }

      seen.add(target.url);
      items.push(target);
    });

    return items;
  }

  function closeBulkPanel() {
    document.querySelector(`.${BULK_BACKDROP_CLASS}`)?.remove();
    document.querySelector(`.${BULK_PANEL_CLASS}`)?.remove();
  }

  function getLabel(item, index) {
    const nameStr = item.filename ? ` (${item.filename})` : '';
    return `${item.type.toUpperCase()} ${index + 1} · ${item.extension}${nameStr}`;
  }

  function renderBulkPanel(items) {
    closeBulkPanel();

    const backdrop = document.createElement('div');
    backdrop.className = BULK_BACKDROP_CLASS;
    backdrop.addEventListener('click', closeBulkPanel);

    const panel = document.createElement('div');
    panel.className = BULK_PANEL_CLASS;

    const title = document.createElement('h3');
    title.textContent = `Bulk download (${items.length} items found)`;

    const actions = document.createElement('div');
    actions.className = 'wmdc-bulk-actions';

    const selectAll = document.createElement('button');
    selectAll.type = 'button';
    selectAll.textContent = 'Select all';

    const clearAll = document.createElement('button');
    clearAll.type = 'button';
    clearAll.textContent = 'Clear';

    const downloadSelected = document.createElement('button');
    downloadSelected.type = 'button';
    downloadSelected.textContent = 'Download selected';

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';

    actions.append(selectAll, clearAll, downloadSelected, close);

    const list = document.createElement('div');
    list.className = 'wmdc-bulk-list';

    const checkboxes = [];
    items.forEach((item, index) => {
      const row = document.createElement('label');
      row.className = 'wmdc-bulk-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;

      const text = document.createElement('span');
      text.textContent = getLabel(item, index);

      row.append(checkbox, text);
      list.appendChild(row);
      checkboxes.push({ checkbox, item });
    });

    selectAll.addEventListener('click', () => {
      checkboxes.forEach(({ checkbox }) => (checkbox.checked = true));
    });

    clearAll.addEventListener('click', () => {
      checkboxes.forEach(({ checkbox }) => (checkbox.checked = false));
    });

    close.addEventListener('click', closeBulkPanel);

    downloadSelected.addEventListener('click', async () => {
      const selected = checkboxes.filter(({ checkbox }) => checkbox.checked);
      if (!selected.length) {
        downloadSelected.textContent = 'No items selected';
        setTimeout(() => {
          downloadSelected.textContent = 'Download selected';
        }, 1200);
        return;
      }

      downloadSelected.disabled = true;
      downloadSelected.textContent = 'Downloading...';

      for (let i = 0; i < selected.length; i++) {
        const { item } = selected[i];
        try {
          await triggerDownload(item);
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error) {
          console.error('[WA Downloader Clone] bulk download item failed', error);
        }
      }

      downloadSelected.textContent = 'Done';
      setTimeout(() => {
        downloadSelected.disabled = false;
        downloadSelected.textContent = 'Download selected';
      }, 1200);
    });

    panel.append(title, actions, list);
    document.body.append(backdrop, panel);
  }

  function ensureBulkButton() {
    if (document.querySelector(`.${BULK_BUTTON_CLASS}`)) {
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = BULK_BUTTON_CLASS;
    button.textContent = 'Bulk media';

    button.addEventListener('click', () => {
      const items = collectMediaTargets();
      if (!items.length) {
        button.textContent = 'No media found';
        setTimeout(() => {
          button.textContent = 'Bulk media';
        }, 1200);
        return;
      }
      renderBulkPanel(items);
    });

    document.body.appendChild(button);
  }

  // --- Scanning & Observer (Debounced for performance) ---

  function scanForMediaContainers(root = document) {
    const selectors = [
      '[data-testid="msg-container"]',
      '[data-testid="image-thumb"]',
      '[data-testid="video-thumb"]',
      '[data-testid="document-thumb"]',
      '[data-testid="audio-player"]',
      'video[src]',
      'audio[src]',
      'a[download]'
    ];

    const nodes = root.querySelectorAll ? root.querySelectorAll(selectors.join(',')) : [];
    nodes.forEach((node) => {
      attachDownloadButton(node);
    });
  }

  let scanScheduled = false;
  function scheduledScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanForMediaContainers();
      ensureBulkButton();
      scanScheduled = false;
    });
  }

  // Initial scan
  scanForMediaContainers();
  ensureBulkButton();

  // Observer with debouncing
  const observer = new MutationObserver((entries) => {
    let hasRelevantChanges = false;
    for (const entry of entries) {
      if (entry.addedNodes.length > 0) {
        hasRelevantChanges = true;
        break;
      }
    }
    if (hasRelevantChanges) {
      scheduledScan();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // --- Chrome Extension Runtime Messaging ---

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || !msg.action) return false;

      if (msg.action === 'listChats') {
        try {
          // Target left side pane specifically to get actual chat thread titles
          const sidePane = document.querySelector('#pane-side');
          let chats = [];
          if (sidePane) {
            chats = Array.from(sidePane.querySelectorAll('span[title]'))
              .map((n) => n.getAttribute('title') || n.textContent.trim())
              .filter((t) => t && t.length > 0);
          } else {
            chats = Array.from(document.querySelectorAll('span[title]'))
              .filter((n) => n && n.offsetParent !== null)
              .map((n) => n.getAttribute('title') || n.textContent.trim());
          }
          const unique = [...new Set(chats)].slice(0, 150);
          sendResponse({ chats: unique });
        } catch (err) {
          sendResponse({ chats: [] });
        }
        return true;
      }

      if (msg.action === 'selectChat') {
        const title = msg.title || '';
        try {
          const sidePane = document.querySelector('#pane-side') || document;
          const candidates = Array.from(sidePane.querySelectorAll('span[title]')).filter(
            (n) => n && (n.getAttribute('title') === title || n.textContent.trim() === title)
          );
          if (candidates.length) {
            const clickable = candidates[0].closest('div[role="row"], div[role="button"], li');
            if (clickable) {
              clickable.click();
              sendResponse({ ok: true });
              return true;
            }
          }
        } catch (err) {
          // ignore
        }
        sendResponse({ ok: false });
        return true;
      }

      if (msg.action === 'scan') {
        const items = collectMediaTargets();
        sendResponse({ count: items.length });
        return true;
      }

      if (msg.action === 'download') {
        const filters = msg.filters || {};
        let items = collectMediaTargets();
        items = items.filter((it) => {
          if (it.type === 'image' && !filters.images) return false;
          if (it.type === 'video' && !filters.video) return false;
          if (it.type === 'audio' && !filters.audio) return false;
          if (it.type === 'document' && !filters.documents) return false;
          return true;
        });

        const limit = typeof msg.limit === 'number' ? msg.limit : items.length;
        const toProcess = items.slice(0, limit);
        sendResponse({ status: 'started', count: toProcess.length });

        (async () => {
          for (let i = 0; i < toProcess.length; i++) {
            const it = toProcess[i];
            try {
              await triggerDownload(it);
              chrome.runtime.sendMessage({ action: 'log', text: `Saved ${i + 1}/${toProcess.length} ${it.type}` });
            } catch (err) {
              chrome.runtime.sendMessage({ action: 'log', text: `Failed ${i + 1}: ${err?.message || err}` });
            }
            await new Promise((r) => setTimeout(r, 200));
          }
          chrome.runtime.sendMessage({ action: 'done', count: toProcess.length });
        })();

        return true;
      }
    });
  }
})();
