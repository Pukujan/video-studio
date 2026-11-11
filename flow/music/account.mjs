// Account check for the Flow Music scripts.
//
// flowmusic.app has its own sign-in (Google, through its own session), separate from the
// flow.google.com/u/<N>/ accounts, so the pinned account (FLOW_ACCOUNT, see ../lib.mjs) cannot be
// chosen by URL there. These helpers read which account a flowmusic.app page is signed in as.
// send.mjs, the only script that starts work, stops unless it is the pinned one; the read-only
// scripts print a warning. Switching the account means signing in on flowmusic.app in the Claude
// Chromium window, which is the owner's job.
import { ACCOUNT } from '../lib.mjs';

export { ACCOUNT };

// Email the page is signed in as (from the user record the page embeds), or null.
export async function musicAccount(page) {
  const html = await page.content();
  const m = html.match(/\\?"role\\?":\\?"authenticated\\?",\\?"email\\?":\\?"([^"\\]+@[^"\\]+)\\?"/)
    || html.match(/\\?"email\\?":\\?"([^"\\]+@[^"\\]+)\\?"/);
  return m ? m[1].toLowerCase() : null;
}

// strict: exit(1) on any other account. Otherwise warn and carry on (read-only scripts).
export async function checkMusicAccount(page, { strict = false } = {}) {
  if (!/^https:\/\/(www\.)?flowmusic\.app\//.test(page.url())) return null;
  const email = await musicAccount(page);
  if (email === ACCOUNT) return email;
  const msg = `flowmusic.app is signed in as ${email || 'nobody'}, not the pinned account ${ACCOUNT}`;
  if (strict) {
    console.error(`ERR ${msg}. Nothing was sent. Sign in to flowmusic.app with ${ACCOUNT} in the Claude Chromium window, then run this again.`);
    process.exit(1);
  }
  console.error(`warning: ${msg}`);
  return email;
}
