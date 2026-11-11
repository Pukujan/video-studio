import { chromium } from 'playwright-core'
const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
const ctx = b.contexts()[0]
const p = ctx.pages().find(x => x.url().includes('flowmusic.app')) || await ctx.newPage()
if (!p.url().includes('flowmusic.app')) await p.goto('https://www.flowmusic.app/')
await p.bringToFront()
await p.getByText('Log in', { exact: true }).first().click().catch(e => console.log('click', e.message))
await p.waitForTimeout(4000); console.log(p.url())
process.exit(0)
