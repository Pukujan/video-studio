import { chromium } from 'playwright-core'
import { checkMusicAccount } from './account.mjs'
const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
const ctx = b.contexts()[0]
const p = await ctx.newPage()
const media = []
p.on('response', r => { const ct = r.headers()['content-type'] || ''; if (/audio|mpeg|wav|m4a/.test(ct) || /\.(mp3|wav|m4a)(\?|$)/.test(r.url())) media.push(ct + ' ' + r.url().slice(0, 200)) })
await p.goto(process.argv[2]); await p.waitForTimeout(5000)
await checkMusicAccount(p)
console.log((await p.innerText('body')).slice(0, 800))
console.log('--- buttons'); console.log((await p.$$eval('button', bs => bs.map(b => (b.getAttribute('aria-label') || '') + '|' + b.innerText.trim().slice(0, 30)).filter(s => s.length > 1))).join('\n'))
console.log('--- audio', await p.$$eval('audio, source', a => a.map(x => x.src)))
console.log('--- media', media.join('\n'))
await p.close(); process.exit(0)
