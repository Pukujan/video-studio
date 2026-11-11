// prints the music links on the pinned account's Flow home page
import { attach, gotoFlow } from '../lib.mjs'
const { page: p } = await attach()
await gotoFlow(p, '/'); await p.waitForTimeout(3000)
const links = await p.$$eval('a', as => as.map(a => a.innerText.trim().slice(0, 30) + ' -> ' + a.href).filter(s => /music/i.test(s)))
console.log(links.join('\n'))
process.exit(0)
