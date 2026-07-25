# WA Downloader Clone

This repository contains a minimal, open-source Chrome extension that replicates the core behavior of tools like **WA Media Downloader Pro**: adding direct download buttons to media in WhatsApp Web.

## Features

- Injects a **Download** button on WhatsApp Web media tiles
- Supports common media targets (images, videos, downloadable links/files)
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
3. Hover/open media and click **Download** when the button appears

## Validation

```bash
npm test
```

This runs a syntax check for the extension content script.

## Notes

- This project is an independent implementation and does not include proprietary assets/code from any third-party extension.
