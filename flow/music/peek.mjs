import { chromium } from 'playwright-core'
import { pinned, ensureAccount } from '../lib.mjs'
import { checkMusicAccount } from './account.mjs'
const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
const ctx = b.contexts()[0]
const p = await ctx.newPage()
// a flow.google.com URL is opened under the pinned account; other sites as given
const url = process.argv[2] || 'https://flow.google/music'
const onFlow = url.startsWith('https://flow.google.com/')
await p.goto(onFlow ? await pinned(p, url) : url, { waitUntil: 'domcontentloaded' }).catch(e => console.log('goto', e.message))
await p.waitForTimeout(6000)
if (onFlow) await ensureAccount(p)
await checkMusicAccount(p)
console.log(p.url()); console.log((await p.innerText('body').catch(() => '')).slice(0, 1500))
console.log("done"); await p.screenshot({ path: process.argv[3] || '/private/tmp/claude-501/-Users-teresa-dev-projects-hermes-hackathon/803658f7-90de-4318-9ff9-41722fcf6237/scratchpad/fm.png' })
process.exit(0)
