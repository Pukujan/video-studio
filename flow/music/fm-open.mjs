import { chromium } from 'playwright-core'
import { checkMusicAccount } from './account.mjs'
const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
const ctx = b.contexts()[0]
let p = ctx.pages().find(x => x.url().includes('flowmusic.app')) || await ctx.newPage()
await p.goto('https://www.flowmusic.app/session'); await p.waitForTimeout(5000)
await checkMusicAccount(p)
console.log(p.url()); console.log((await p.innerText('body')).slice(0, 400))
process.exit(0)
