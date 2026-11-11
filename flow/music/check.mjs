// prints each session's generation status and any song links
import { chromium } from 'playwright-core'
import { checkMusicAccount } from './account.mjs'
const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
const ctx = b.contexts()[0]
const p = await ctx.newPage()
let pending = 0
for (const u of process.argv.slice(2)) {
  await p.goto(u); await p.waitForTimeout(5000)
  if (u === process.argv[2]) await checkMusicAccount(p)
  const t = await p.innerText('body')
  const gen = (t.match(/\d+%/g) || [])
  const songs = await p.$$eval('a[href*="/song/"]', as => [...new Set(as.map(a => a.innerText.trim().slice(0, 40) + ' ' + a.href))])
  if (gen.length) pending++
  console.log(u.split('/').pop().slice(0, 8), 'gen', gen.join(','), '\n  ' + songs.join('\n  '))
}
await p.close(); console.log(pending ? 'PENDING' : 'ALLDONE'); process.exit(0)
