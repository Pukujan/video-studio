// Shared CDP client for all browser automation in this repo.
// Attaches to the durable signed-in Chrome (scripts/chrome-cdp.ps1).
let cached = null;

function chromium() {
  if (cached) return cached;
  try {
    cached = require('playwright-core');
  } catch {
    // fallback if playwright-core is not installed locally
    cached = require('C:/Users/pujan/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright-core');
  }
  return cached;
}

async function connect(port = process.env.CDP_PORT || '9223') {
  const { chromium: c } = chromium();
  return c.connectOverCDP(`http://127.0.0.1:${port}`);
}

// First live context of the attached browser (the real profile).
async function context(port) {
  const browser = await connect(port);
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error('no browser context on CDP — is chrome-cdp.ps1 running?');
  return { browser, ctx };
}

function done(browser) {
  // Detach (does NOT close the user's Chrome)
  browser.close().catch(() => {});
}

module.exports = { chromium, connect, context, done };
