// node send.mjs <session url|new> "<message>"
// Sends only when flowmusic.app is signed in as the pinned account (see account.mjs).
import { chromium } from 'playwright-core'
import { checkMusicAccount } from './account.mjs'
const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
const ctx = b.contexts()[0]
let p = ctx.pages().find(x => x.url().includes('flowmusic.app'))
const [, , where, msg] = process.argv
await p.goto(where === 'new' ? 'https://www.flowmusic.app/session' : where)
await p.waitForTimeout(4000)
await checkMusicAccount(p, { strict: true })
const ta = p.getByRole('textbox', { name: 'Chat message' })
await ta.click(); await ta.fill(msg)
await p.getByRole('button', { name: 'Send message' }).click()
await p.waitForTimeout(8000)
console.log(p.url())
process.exit(0)
