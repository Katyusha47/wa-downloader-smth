# WA Downloader Clone

This repository contains a minimal, open-source Chrome extension that replicates the core behavior of tools like **WA Media Downloader Pro**: adding direct download buttons to media in WhatsApp Web.

## Features

- Injects a **Download** button on WhatsApp Web media tiles
- Adds a **Bulk media** panel to collect media from the active chat and select which files to download
- Supports common media targets (images, videos, audio, downloadable links/files)
- Handles blob URLs by fetching and saving locally

## Install (Developer Mode)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder:
   - `/home/runner/work/wa-downloader-smth/wa-downloader-smth`

## Usage

1. Open `https://web.whatsapp.com/`
2. Open a chat with media
3. Use either:
   - **Download** on individual media
   - **Bulk media** (bottom-right) to select many media/documents/audio/video items and download selected

## Validation

```bash
npm test
```

This runs a syntax check for the extension content script.

## Notes

- This project is an independent implementation and does not include proprietary assets/code from any third-party extension.
