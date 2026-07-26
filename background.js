chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return false;

  if (msg.action === 'downloadMedia') {
    const { url, filename } = msg;

    if (!url) {
      sendResponse({ ok: false, error: 'No URL provided' });
      return false;
    }

    const safeFilename = filename || `wa-media-${Date.now()}.bin`;

    chrome.downloads.download(
      {
        url: url,
        filename: safeFilename,
        saveAs: false,
        conflictAction: 'uniquify'
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('[WA Downloader BG] Download error:', chrome.runtime.lastError.message);
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true, downloadId });
        }
      }
    );

    return true; // async response
  }

  if (msg.action === 'downloadBatch') {
    const { items } = msg;
    if (!Array.isArray(items) || items.length === 0) {
      sendResponse({ ok: false, count: 0, error: 'No items' });
      return false;
    }

    (async () => {
      let successCount = 0;
      for (const item of items) {
        if (!item.url) continue;
        const safeFilename = item.filename || `wa-media-${Date.now()}.${item.extension || 'bin'}`;

        await new Promise((resolve) => {
          chrome.downloads.download(
            {
              url: item.url,
              filename: safeFilename,
              saveAs: false,
              conflictAction: 'uniquify'
            },
            () => {
              if (!chrome.runtime.lastError) {
                successCount++;
              }
              // Small pause between downloads to prevent throttling
              setTimeout(resolve, 200);
            }
          );
        });
      }
      sendResponse({ ok: true, count: successCount });
    })();

    return true;
  }
});
