(() => {
  const BUTTON_CLASS = 'wmdc-download-btn';
  const TARGET_CLASS = 'wmdc-has-download-target';
  const BULK_BUTTON_CLASS = 'wmdc-bulk-open-btn';
  const BULK_PANEL_CLASS = 'wmdc-bulk-panel';
  const BULK_BACKDROP_CLASS = 'wmdc-bulk-backdrop';

  function getExtensionFromUrl(url, fallback = 'bin') {
    const namedMatch = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url);
    return namedMatch ? namedMatch[1].toLowerCase() : fallback;
  }

  function getDownloadTarget(container) {
    const video = container.querySelector('video[src], video source[src]');
    if (video) {
      return {
        url: video.currentSrc || video.src,
        extension: 'mp4',
        type: 'video'
      };
    }

    const audio = container.querySelector('audio[src], audio source[src]');
    if (audio) {
      return {
        url: audio.currentSrc || audio.src,
        extension: 'mp3',
        type: 'audio'
      };
    }

    const image = container.querySelector('img[src]');
    if (image) {
      const src = image.currentSrc || image.src;
      return {
        url: src,
        extension: src.includes('.webp') ? 'webp' : 'jpg',
        type: 'image'
      };
    }

    const link = container.querySelector('a[href][download], a[href*="blob:"], a[href*="mmg.whatsapp.net"]');
    if (link) {
      const href = link.href;
      return {
        url: href,
        extension: getExtensionFromUrl(href),
        type: 'document'
      };
    }

    return null;
  }

  function toFilename(extension) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `wa-media-${stamp}.${extension}`;
  }

  async function downloadUrl(url, extension) {
    let href = url;

    if (url.startsWith('blob:')) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch blob: ${response.status}`);
      }
      const blob = await response.blob();
      href = URL.createObjectURL(blob);
    }

    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = toFilename(extension);
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    if (href !== url) {
      setTimeout(() => URL.revokeObjectURL(href), 2000);
    }
  }

  function attachDownloadButton(container) {
    if (container.querySelector(`.${BUTTON_CLASS}`)) {
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
        await downloadUrl(target.url, target.extension);
        button.textContent = 'Saved';
      } catch (error) {
        console.error('[WA Downloader Clone] download failed', error);
        button.textContent = 'Retry';
      } finally {
        setTimeout(() => {
          button.disabled = false;
          button.textContent = 'Download';
        }, 1200);
      }
    });

    container.appendChild(button);
  }

  function getChatRoot() {
    return document.querySelector('#main') || document.body;
  }

  function getNodeType(node) {
    if (node.matches('video, video source')) {
      return 'video';
    }
    if (node.matches('audio, audio source')) {
      return 'audio';
    }
    if (node.matches('img')) {
      return 'image';
    }
    return 'document';
  }

  function toCandidate(node) {
    const type = getNodeType(node);

    if (type === 'image') {
      const src = node.currentSrc || node.src;
      if (!src) {
        return null;
      }
      return {
        url: src,
        type,
        extension: src.includes('.webp') ? 'webp' : 'jpg'
      };
    }

    if (type === 'video' || type === 'audio') {
      const src = node.currentSrc || node.src;
      if (!src) {
        return null;
      }
      return {
        url: src,
        type,
        extension: type === 'video' ? 'mp4' : 'mp3'
      };
    }

    const href = node.href;
    if (!href) {
      return null;
    }

    return {
      url: href,
      type,
      extension: getExtensionFromUrl(href)
    };
  }

  function collectMediaTargets() {
    const root = getChatRoot();
    const selectors = [
      'img[src]',
      'video[src], video source[src]',
      'audio[src], audio source[src]',
      'a[href][download]',
      'a[href*="blob:"]',
      'a[href*="mmg.whatsapp.net"]'
    ];

    const items = [];
    const seen = new Set();

    root.querySelectorAll(selectors.join(',')).forEach((node) => {
      const candidate = toCandidate(node);
      if (!candidate || !candidate.url || seen.has(candidate.url)) {
        return;
      }
      seen.add(candidate.url);
      items.push(candidate);
    });

    return items;
  }

  function closeBulkPanel() {
    document.querySelector(`.${BULK_BACKDROP_CLASS}`)?.remove();
    document.querySelector(`.${BULK_PANEL_CLASS}`)?.remove();
  }

  function getLabel(item, index) {
    return `${item.type.toUpperCase()} ${index + 1} · ${item.extension}`;
  }

  function renderBulkPanel(items) {
    closeBulkPanel();

    const backdrop = document.createElement('div');
    backdrop.className = BULK_BACKDROP_CLASS;
    backdrop.addEventListener('click', closeBulkPanel);

    const panel = document.createElement('div');
    panel.className = BULK_PANEL_CLASS;

    const title = document.createElement('h3');
    title.textContent = `Bulk download (${items.length} found)`;

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
      checkbox.dataset.url = item.url;
      checkbox.dataset.extension = item.extension;

      const text = document.createElement('span');
      text.textContent = getLabel(item, index);

      row.append(checkbox, text);
      list.appendChild(row);
      checkboxes.push(checkbox);
    });

    selectAll.addEventListener('click', () => {
      checkboxes.forEach((checkbox) => {
        checkbox.checked = true;
      });
    });

    clearAll.addEventListener('click', () => {
      checkboxes.forEach((checkbox) => {
        checkbox.checked = false;
      });
    });

    close.addEventListener('click', closeBulkPanel);

    downloadSelected.addEventListener('click', async () => {
      const selected = checkboxes.filter((checkbox) => checkbox.checked);
      if (!selected.length) {
        downloadSelected.textContent = 'No items selected';
        setTimeout(() => {
          downloadSelected.textContent = 'Download selected';
        }, 1200);
        return;
      }

      downloadSelected.disabled = true;
      downloadSelected.textContent = 'Downloading...';

      for (const checkbox of selected) {
        try {
          await downloadUrl(checkbox.dataset.url, checkbox.dataset.extension || 'bin');
          await new Promise((resolve) => setTimeout(resolve, 250));
        } catch (error) {
          console.error('[WA Downloader Clone] bulk download failed', error);
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

  function scanForMediaContainers(root = document) {
    const selectors = [
      '[data-testid="image-thumb"]',
      '[data-testid="video-thumb"]',
      '[data-testid="media-viewer"]',
      'div[role="button"] img[src]',
      'video[src]',
      'audio[src]',
      'a[download]'
    ];

    root.querySelectorAll(selectors.join(',')).forEach((node) => {
      const container = node.closest('div') || node.parentElement;
      if (container) {
        attachDownloadButton(container);
      }
    });
  }

  scanForMediaContainers();
  ensureBulkButton();

  const observer = new MutationObserver((entries) => {
    for (const entry of entries) {
      for (const addedNode of entry.addedNodes) {
        if (addedNode.nodeType === Node.ELEMENT_NODE) {
          scanForMediaContainers(addedNode);
        }
      }
    }
    ensureBulkButton();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Messaging: respond to popup requests for scanning and downloads
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.action === 'listChats') {
        try {
          const nodes = Array.from(document.querySelectorAll('span[title]'))
            .filter((n) => n && n.textContent && n.offsetParent !== null)
            .map((n) => n.getAttribute('title') || n.textContent.trim());
          const unique = [...new Set(nodes)].slice(0, 200);
          sendResponse({ chats: unique });
        } catch (err) {
          sendResponse({ chats: [] });
        }
        return true;
      }

      if (msg && msg.action === 'scan') {
        const items = collectMediaTargets();
        sendResponse({ count: items.length });
        return true;
      }

      if (msg && msg.action === 'download') {
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
              await downloadUrl(it.url, it.extension || 'bin');
              chrome.runtime.sendMessage({ action: 'log', text: `Saved ${i + 1}/${toProcess.length} ${it.type}` });
            } catch (err) {
              chrome.runtime.sendMessage({ action: 'log', text: `Failed ${i + 1}: ${err && err.message ? err.message : err}` });
            }
            await new Promise((r) => setTimeout(r, 150));
          }
          chrome.runtime.sendMessage({ action: 'done', count: toProcess.length });
        })();

        return true;
      }
    });
  }
})();
