import { chromium } from 'playwright-core'
import { checkMusicAccount } from './account.mjs'
const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
const ctx = b.contexts()[0]
const p = ctx.pages().find(x => x.url().includes('flowmusic.app'))
console.log(p.url())
await checkMusicAccount(p)
console.log((await p.innerText('body')).slice(0, 2500))
await p.screenshot({ path: process.argv[2] || 'flow/music/state.png' })
const els = await p.$$eval('button, a, textarea, input, [contenteditable="true"]', es => es.map(e => `${e.tagName} ${e.getAttribute('aria-label') || ''} | ${(e.innerText || e.placeholder || '').trim().slice(0, 40)} ${e.href || ''}`).filter(s => s.trim().length > 4))
console.log('---\n' + els.join('\n'))
process.exit(0)
