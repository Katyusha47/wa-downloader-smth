(() => {
  const BUTTON_CLASS = 'wmdc-download-btn';
  const TARGET_CLASS = 'wmdc-has-download-target';

  function getDownloadTarget(container) {
    const video = container.querySelector('video[src], video source[src]');
    if (video) {
      return {
        url: video.src,
        extension: 'mp4'
      };
    }

    const image = container.querySelector('img[src]');
    if (image) {
      const src = image.currentSrc || image.src;
      const ext = src.includes('.webp') ? 'webp' : 'jpg';
      return {
        url: src,
        extension: ext
      };
    }

    const link = container.querySelector('a[href][download], a[href*="blob:"], a[href*="mmg.whatsapp.net"]');
    if (link) {
      const href = link.href;
      const namedMatch = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(href);
      return {
        url: href,
        extension: namedMatch ? namedMatch[1].toLowerCase() : 'bin'
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

  function scanForMediaContainers(root = document) {
    const selectors = [
      '[data-testid="image-thumb"]',
      '[data-testid="video-thumb"]',
      '[data-testid="media-viewer"]',
      'div[role="button"] img[src]',
      'video[src]',
      'a[download]'
    ];

    const nodes = root.querySelectorAll(selectors.join(','));
    nodes.forEach((node) => {
      const container = node.closest('div') || node.parentElement;
      if (container) {
        attachDownloadButton(container);
      }
    });
  }

  scanForMediaContainers();

  const observer = new MutationObserver((entries) => {
    for (const entry of entries) {
      for (const addedNode of entry.addedNodes) {
        if (addedNode.nodeType === Node.ELEMENT_NODE) {
          scanForMediaContainers(addedNode);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
