(() => {
  const BUTTON_CLASS = 'wmdc-download-btn';
  const TARGET_CLASS = 'wmdc-has-download-target';
  const BULK_BUTTON_CLASS = 'wmdc-bulk-open-btn';
  const BULK_PANEL_CLASS = 'wmdc-bulk-panel';
  const BULK_BACKDROP_CLASS = 'wmdc-bulk-backdrop';

  const DOC_EXT_REGEX = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|txt|csv|apk|epub|json|xml|mp3|wav|tar|gz|odt|doc|xls|ppt)$/i;

  // Helper to check if extension context is valid
  function isExtensionContextValid() {
    try {
      return typeof chrome !== 'undefined' && Boolean(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  // --- Strict Filtering Helpers ---

  function isAvatarOrProfile(node) {
    if (!node) return true;

    const avatarContainer = node.closest(
      '[data-testid="avatar"], [data-testid="cell-frame-icon"], [data-testid="group-chat-profile-picture"], [data-testid="profile-picture"], header, #pane-side'
    );
    if (avatarContainer) return true;

    const src = node.currentSrc || node.src || node.href || '';
    if (
      src.includes('pps.whatsapp.net') ||
      src.includes('/pps/') ||
      src.includes('/emoji/') ||
      src.includes('data:image/svg+xml') ||
      src.includes('data:image/gif') ||
      src.includes('sticker') ||
      src.includes('reaction')
    ) {
      return true;
    }

    const width = node.naturalWidth || node.width || node.clientWidth || 0;
    const height = node.naturalHeight || node.height || node.clientHeight || 0;
    if ((width > 0 && width < 50) || (height > 0 && height < 50)) {
      return true;
    }

    return false;
  }

  // Get valid message bubble container inside active chat message feed ONLY (#main)
  function getValidMessageContainer(node) {
    if (!node) return null;

    const mainChat = node.closest('#main');
    if (!mainChat) return null;

    if (node.closest('header, footer, [data-testid="chat-controls"]')) return null;
    if (isAvatarOrProfile(node)) return null;

    const msgContainer = node.closest('[data-testid="msg-container"], div[role="row"], div[data-id]');
    if (!msgContainer) return null;
    if (msgContainer.closest('header')) return null;

    return msgContainer;
  }

  function getExtensionFromUrl(url, fallback = 'bin') {
    if (!url || url === 'pending_doc_click') return fallback;
    const namedMatch = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url);
    return namedMatch ? namedMatch[1].toLowerCase() : fallback;
  }

  function formatTimestampFilename(prefix = 'wa-media', ext = 'bin') {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `${prefix}-${stamp}.${ext}`;
  }

  function isDocumentContainer(container) {
    if (!container) return false;

    if (
      container.querySelector(
        '[data-testid="document-thumb"], [data-testid="media-doc"], [data-testid="media-document"], span[data-icon*="document"], span[data-icon*="file-"], span[data-icon="preview-generic"], span[data-icon="download-document"]'
      )
    ) {
      return true;
    }

    const elements = container.querySelectorAll('span, div, a, p');
    for (const el of elements) {
      const title = el.getAttribute('title') || '';
      const text = (el.textContent || '').trim();
      if (DOC_EXT_REGEX.test(title) || (DOC_EXT_REGEX.test(text) && text.length < 150)) {
        return true;
      }
    }

    return false;
  }

  function extractFilenameFromContainer(container, defaultExt = 'pdf') {
    if (!container) return formatTimestampFilename('wa-doc', defaultExt);

    const elements = container.querySelectorAll('span, div, a, p');
    for (const el of elements) {
      const title = el.getAttribute('title') || '';
      if (DOC_EXT_REGEX.test(title)) {
        return title.replace(/[/\\?%*:|"<>]/g, '_');
      }
      const text = (el.textContent || '').trim();
      if (DOC_EXT_REGEX.test(text) && text.length < 150) {
        return text.replace(/[/\\?%*:|"<>]/g, '_');
      }
    }

    return formatTimestampFilename('wa-doc', defaultExt);
  }

  // --- Target Extraction ---

  function getDownloadTarget(container) {
    if (!container) return null;

    // 1. Document attachment check
    if (isDocumentContainer(container)) {
      const docLink = container.querySelector('a[href][download], [data-testid="document-thumb"] a[href], a[href*="mmg.whatsapp.net"], a[href*="blob:"]');
      const filename = extractFilenameFromContainer(container, 'pdf');
      const extMatch = DOC_EXT_REGEX.exec(filename);
      const ext = extMatch ? extMatch[1].toLowerCase() : getExtensionFromUrl(docLink?.href, 'pdf');

      return {
        url: docLink?.href || 'pending_doc_click',
        extension: ext,
        type: 'document',
        filename,
        container
      };
    }

    // 2. Video
    const video = container.querySelector('video[src], video source[src]');
    if (video) {
      const src = video.currentSrc || video.src;
      if (src) {
        return {
          url: src,
          extension: 'mp4',
          type: 'video',
          filename: formatTimestampFilename('wa-video', 'mp4'),
          container
        };
      }
    }

    // 3. Audio / Voice Note
    const audio = container.querySelector('audio[src], audio source[src], [data-testid="audio-player"] audio');
    if (audio) {
      const src = audio.currentSrc || audio.src;
      if (src) {
        return {
          url: src,
          extension: 'mp3',
          type: 'audio',
          filename: formatTimestampFilename('wa-audio', 'mp3'),
          container
        };
      }
    }

    // 4. Image
    const images = Array.from(container.querySelectorAll('img[src]')).filter((img) => !isAvatarOrProfile(img));
    if (images.length > 0) {
      const image = images[0];
      const src = image.currentSrc || image.src;
      const ext = src.includes('.webp') ? 'webp' : 'jpg';
      return {
        url: src,
        extension: ext,
        type: 'image',
        filename: formatTimestampFilename('wa-image', ext),
        container
      };
    }

    return null;
  }

  // --- Document & High-Resolution Media Capture ---

  async function obtainDocumentTarget(target) {
    if (!target || target.type !== 'document') return target;

    const container = target.container;
    if (!container) return target;

    // Check if a link with valid href already exists
    let link = container.querySelector('a[href*="blob:"], a[href*="mmg.whatsapp.net"], a[href]');
    if (link && link.href && !link.href.startsWith('javascript:') && !link.href.startsWith('about:')) {
      return { ...target, url: link.href };
    }

    // Click the document download icon / button in WhatsApp Web to trigger blob creation
    const clickTarget =
      container.querySelector('[data-testid="btn-download"], span[data-icon="download"], span[data-icon="download-document"], [data-testid="document-thumb"], div[role="button"]') ||
      container;

    if (clickTarget) {
      try {
        clickTarget.click();

        // Wait up to 3.5 seconds (35 * 100ms) for WhatsApp Web to fetch document blob and insert <a href="blob:...">
        for (let i = 0; i < 35; i++) {
          await new Promise((r) => setTimeout(r, 100));
          link = container.querySelector('a[href*="blob:"], a[href*="mmg.whatsapp.net"], a[href]');
          if (link && link.href && !link.href.startsWith('javascript:') && !link.href.startsWith('about:')) {
            return { ...target, url: link.href };
          }
        }
      } catch (err) {
        console.warn('[WA Downloader] Document click trigger fallback:', err);
      }
    }

    return target;
  }

  async function obtainHighResTarget(target) {
    if (!target) return target;

    if (target.type === 'document') {
      return await obtainDocumentTarget(target);
    }

    if (target.type === 'audio') {
      return target;
    }

    const container = target.container;
    if (!container) return target;

    if (target.type === 'image') {
      const imgEl = container.querySelector('img[src]');
      if (imgEl && (imgEl.naturalWidth >= 600 || imgEl.width >= 600)) {
        return target;
      }
    }

    let mediaViewer = document.querySelector('[data-testid="media-viewer"], div[role="dialog"]');
    if (mediaViewer) {
      const highResImg = mediaViewer.querySelector('img[src]');
      const highResVideo = mediaViewer.querySelector('video[src]');
      if (target.type === 'image' && highResImg && highResImg.src) {
        return { ...target, url: highResImg.currentSrc || highResImg.src };
      }
      if (target.type === 'video' && highResVideo && (highResVideo.currentSrc || highResVideo.src)) {
        return { ...target, url: highResVideo.currentSrc || highResVideo.src };
      }
    }

    const clickTarget =
      container.querySelector('[data-testid="image-thumb"], [data-testid="video-thumb"], div[role="button"] img, div[role="button"] video') ||
      container.querySelector('img, video');

    if (!clickTarget) return target;

    try {
      clickTarget.click();

      let fullUrl = null;
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 40));
        mediaViewer = document.querySelector('[data-testid="media-viewer"], div[role="dialog"]');
        if (mediaViewer) {
          if (target.type === 'image') {
            const img = mediaViewer.querySelector('img[src]');
            if (img && img.src && !img.src.includes('data:image')) {
              fullUrl = img.currentSrc || img.src;
              break;
            }
          } else if (target.type === 'video') {
            const vid = mediaViewer.querySelector('video[src]');
            if (vid && (vid.currentSrc || vid.src)) {
              fullUrl = vid.currentSrc || vid.src;
              break;
            }
          }
        }
      }

      const closeBtn = document.querySelector(
        '[data-testid="btn-close"], [data-testid="media-viewer-close"], [aria-label="Close"], button[title="Close"]'
      );
      if (closeBtn) {
        closeBtn.click();
      } else {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      }

      if (fullUrl) {
        return { ...target, url: fullUrl };
      }
    } catch (err) {
      console.warn('[WA Downloader] Media Viewer capture fallback:', err);
    }

    return target;
  }

  async function prepareUrlForDownload(url) {
    if (!url || url === 'pending_doc_click') return url;

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
        console.warn('[WA Downloader] Fallback to direct URL:', err);
        return url;
      }
    }
    return url;
  }

  // --- Download Execution ---

  async function triggerDownload(rawTarget) {
    if (!rawTarget) throw new Error('Invalid download target');

    const target = await obtainHighResTarget(rawTarget);
    if (!target.url || target.url === 'pending_doc_click') {
      throw new Error(`Document blob not loaded for "${target.filename || 'Document'}". Click the document inside WhatsApp Web to download.`);
    }

    const downloadUrl = await prepareUrlForDownload(target.url);
    const safeFilename = target.filename || formatTimestampFilename('wa-media', target.extension || 'bin');

    if (isExtensionContextValid()) {
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            {
              action: 'downloadMedia',
              url: downloadUrl,
              filename: safeFilename
            },
            (response) => {
              if (chrome.runtime.lastError || !response || !response.ok) {
                fallbackAnchorDownload(downloadUrl, safeFilename);
              }
              resolve();
            }
          );
        } catch (err) {
          fallbackAnchorDownload(downloadUrl, safeFilename);
          resolve();
        }
      });
    } else {
      fallbackAnchorDownload(downloadUrl, safeFilename);
    }
  }

  function fallbackAnchorDownload(url, filename) {
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (e) {
      console.error('[WA Downloader] Anchor download failed:', e);
    }
  }

  function safeSendRuntimeMessage(msg) {
    if (isExtensionContextValid()) {
      try {
        chrome.runtime.sendMessage(msg, () => {
          if (chrome.runtime.lastError) {
            // Ignore
          }
        });
      } catch (e) {
        // Ignore
      }
    }
  }

  // --- In-Message Download Button Injection ---

  function attachDownloadButton(node) {
    const container = getValidMessageContainer(node);
    if (!container || container.querySelector(`.${BUTTON_CLASS}`)) {
      return;
    }

    const target = getDownloadTarget(container);
    if (!target) {
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

  // --- History Auto-Scroll Engine ---

  function getChatScrollContainer() {
    const mainChat = document.querySelector('#main');
    if (!mainChat) return null;

    const candidates = Array.from(mainChat.querySelectorAll('div'));
    for (const el of candidates) {
      if (el.scrollHeight > el.clientHeight && el.clientHeight > 200) {
        const overflowY = getComputedStyle(el).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
          return el;
        }
      }
    }
    return mainChat.querySelector('div[tabindex="-1"]') || mainChat;
  }

  async function scrollAndLoadHistory(maxTimeMs = 25000) {
    const container = getChatScrollContainer();
    if (!container) return;

    let lastHeight = container.scrollHeight;
    let sameHeightCount = 0;
    const startTime = Date.now();

    while (Date.now() - startTime < maxTimeMs) {
      container.scrollTop = 0;

      await new Promise((r) => setTimeout(r, 450));

      const newHeight = container.scrollHeight;
      if (newHeight === lastHeight) {
        sameHeightCount++;
        if (sameHeightCount >= 4) {
          break;
        }
      } else {
        sameHeightCount = 0;
        lastHeight = newHeight;
      }
    }
  }

  // --- Bulk Media Collection ---

  function collectMediaTargets() {
    const mainChat = document.querySelector('#main');
    if (!mainChat) return [];

    const selectors = [
      'div[role="row"]',
      'div[data-id]',
      '[data-testid="msg-container"]',
      '[data-testid="document-thumb"]',
      '[data-testid="image-thumb"]',
      '[data-testid="video-thumb"]',
      '[data-testid="audio-player"]',
      'video[src]',
      'audio[src]',
      'a[download]'
    ];

    const items = [];
    const seen = new Set();

    mainChat.querySelectorAll(selectors.join(',')).forEach((node) => {
      const container = getValidMessageContainer(node);
      if (!container) return;

      const target = getDownloadTarget(container);
      if (!target) return;

      const uniqueKey = container.getAttribute('data-id') || (target.filename + '_' + target.type);
      if (seen.has(uniqueKey)) return;

      seen.add(uniqueKey);
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
    return `#${index + 1} · ${item.type.toUpperCase()} · ${item.extension}${nameStr}`;
  }

  function renderBulkPanel(items) {
    closeBulkPanel();

    const backdrop = document.createElement('div');
    backdrop.className = BULK_BACKDROP_CLASS;
    backdrop.addEventListener('click', closeBulkPanel);

    const panel = document.createElement('div');
    panel.className = BULK_PANEL_CLASS;

    const title = document.createElement('h3');
    title.textContent = `Bulk download (${items.length} items: oldest to newest)`;

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
          safeSendRuntimeMessage({ action: 'log', text: `Saved ${i + 1}/${selected.length} ${item.type}` });
          await new Promise((resolve) => setTimeout(resolve, 250));
        } catch (error) {
          console.error('[WA Downloader Clone] bulk download item failed', error);
          safeSendRuntimeMessage({ action: 'log', text: `Failed ${i + 1}: ${error?.message || error}` });
        }
      }

      downloadSelected.textContent = 'Done';
      safeSendRuntimeMessage({ action: 'done', count: selected.length });
      setTimeout(() => {
        downloadSelected.disabled = false;
        downloadSelected.textContent = 'Download selected';
      }, 1200);
    });

    panel.append(title, actions, list);
    document.body.append(backdrop, panel);
  }

  function ensureBulkButton() {
    const mainChat = document.querySelector('#main');
    if (!mainChat) {
      document.querySelector(`.${BULK_BUTTON_CLASS}`)?.remove();
      return;
    }

    if (document.querySelector(`.${BULK_BUTTON_CLASS}`)) {
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = BULK_BUTTON_CLASS;
    button.textContent = 'Bulk media';

    button.addEventListener('click', async () => {
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

  // --- Observer & Debounced Scanning ---

  function scanForMediaContainers() {
    const mainChat = document.querySelector('#main');
    if (!mainChat) return;

    const selectors = [
      'div[role="row"]',
      'div[data-id]',
      '[data-testid="msg-container"]',
      '[data-testid="document-thumb"]',
      '[data-testid="image-thumb"]',
      '[data-testid="video-thumb"]',
      '[data-testid="audio-player"]',
      'video[src]',
      'audio[src]',
      'a[download]'
    ];

    mainChat.querySelectorAll(selectors.join(',')).forEach((node) => {
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

  // Observer
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

  // --- Extension Runtime Messaging ---

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || !msg.action) return false;

      if (msg.action === 'listChats') {
        try {
          const sidePane = document.querySelector('#pane-side');
          let chats = [];
          if (sidePane) {
            chats = Array.from(sidePane.querySelectorAll('span[title]'))
              .map((n) => n.getAttribute('title') || n.textContent.trim())
              .filter((t) => t && t.length > 0);
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
        (async () => {
          if (msg.deepScan) {
            await scrollAndLoadHistory();
          }
          scanForMediaContainers();
          const items = collectMediaTargets();
          sendResponse({ count: items.length });
        })();
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
              safeSendRuntimeMessage({ action: 'log', text: `Saved ${i + 1}/${toProcess.length} ${it.type}` });
            } catch (err) {
              safeSendRuntimeMessage({ action: 'log', text: `Failed ${i + 1}: ${err?.message || err}` });
            }
            await new Promise((r) => setTimeout(r, 200));
          }
          safeSendRuntimeMessage({ action: 'done', count: toProcess.length });
        })();

        return true;
      }
    });
  }
})();
