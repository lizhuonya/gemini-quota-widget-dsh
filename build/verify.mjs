/**
 * Offline verification for the host half.
 *
 * Loads lib/index.js with a mocked cordis root, runs the registered routes on a
 * throwaway HTTP server and checks the quota/manual contract end to end.
 * Run: node build/verify.mjs
 */
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(HERE, '..')

const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gqw-verify-'))
process.env.DSH_HOME = fakeHome

const routes = []
const taps = []
let injectTable = null

const fakeWebServer = {
  register(route) {
    routes.push(route)
    return () => {}
  },
  tapIndex(fn) {
    taps.push(fn)
    return () => {}
  },
}

const fakeAccount = {
  getState: () => ({ userId: 'verify-user' }),
  async getBalance() {
    return {
      status: 'ready',
      value: [{ currency: 'CNY', balance: '12.340000' }],
      bonusWallets: [{ currency: 'CNY', balance: '1.660000' }],
    }
  },
}

const fakeCtx = {
  get: (name) => (name === 'deepseekAccount' ? fakeAccount : undefined),
  webServer: fakeWebServer,
  effect: () => () => {},
}

const root = {
  effect(fn) {
    fn()
    return () => {}
  },
  on(event, handler) {
    if (event === 'webserver/index-inject') injectTable = injectTable || []
    if (event === 'webserver/index-inject') {
      const run = () => handler(injectTable)
      run()
      return () => {}
    }
    return () => {}
  },
  inject(_services, cb) {
    cb(fakeCtx)
  },
}

const mod = await import(new URL('../lib/index.js', import.meta.url).href)
mod.default.apply(root)

function fail(message) {
  console.error('FAIL: ' + message)
  process.exitCode = 1
}

if (routes.length !== 4) fail('expected 4 routes, got ' + routes.length)
if (taps.length !== 1) fail('expected 1 tapIndex, got ' + taps.length)
if (!injectTable || injectTable.length !== 1) fail('desktop index-inject row missing')
if (injectTable && injectTable[0] && !String(injectTable[0].text || '').includes('/dsh-gemini-quota/widget.js')) {
  fail('desktop row does not load the widget route')
}

const html = '<html><body><div id="app"></div></body></html>'
const injected = taps[0](html)
if (!injected.includes('<script defer src="/dsh-gemini-quota/widget.js"></script>')) fail('tapIndex injection missing')
if (taps[0](injected) !== injected) fail('tapIndex is not idempotent')

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host)
  const route = routes.find((r) => r.kind === 'exact' && r.path === url.pathname)
  if (!route) {
    res.writeHead(404)
    res.end('no route')
    return
  }
  route.handler(req, res)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const origin = 'http://127.0.0.1:' + port

async function call(pathname, init) {
  const res = await fetch(origin + pathname, init)
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch (err) {}
  return { status: res.status, text, json }
}

// 1) fresh state: no sample yet
const quota0 = await call('/dsh-gemini-quota/api/quota')
if (quota0.status !== 200) fail('GET quota status ' + quota0.status)
if (!quota0.json || quota0.json.ok !== true) fail('GET quota payload')
if (quota0.json && quota0.json.sample !== null) fail('expected null sample before any manual entry')

// 2) widget asset
const widget = await call('/dsh-gemini-quota/widget.js')
if (widget.status !== 200) fail('GET widget status ' + widget.status)
if (!widget.text.includes('__gfwRequestRefresh')) fail('widget bundle missing DSH bridge')
if (!widget.text.includes('gfw-dsh-save')) fail('widget bundle missing manual quota rows')

// 3) save manual quota
const saved = await call('/dsh-gemini-quota/api/manual', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ fiveHourUsedPct: 12.5, weeklyUsedPct: 30, fiveHourResetText: '2 小时后重置', weeklyResetText: '' }),
})
if (saved.status !== 200) fail('POST manual status ' + saved.status + ' ' + saved.text)
const sample = saved.json && saved.json.sample
if (!sample) fail('POST manual returned no sample')
if (sample) {
  if (sample.fiveHour.remainingPct !== 87.5) fail('fiveHour remainingPct ' + sample.fiveHour.remainingPct)
  if (sample.week.remainingPct !== 70) fail('week remainingPct ' + sample.week.remainingPct)
  if (sample.fiveHour.resetText !== '2 小时后重置') fail('reset text lost')
  if (sample.week.resetText !== '') fail('empty reset text should stay empty')
  if (!(Date.now() - sample.updatedAt < 5000)) fail('updatedAt not fresh')
  if (sample.source !== 'dsh-manual') fail('source label')
}

// 4) state persisted on disk under $DSH_HOME
const stateFile = path.join(fakeHome, 'gemini-quota-widget', 'quota.json')
if (!fs.existsSync(stateFile)) fail('state file not written: ' + stateFile)
const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
if (persisted.manual.fiveHourUsedPct !== 12.5) fail('persisted value mismatch')

// 5) rejection paths
const badRange = await call('/dsh-gemini-quota/api/manual', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ fiveHourUsedPct: 140, weeklyUsedPct: 10 }),
})
if (badRange.status !== 400) fail('out-of-range should be 400, got ' + badRange.status)

const halfFill = await call('/dsh-gemini-quota/api/manual', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ fiveHourUsedPct: 10, weeklyUsedPct: null }),
})
if (halfFill.status !== 400) fail('half-filled should be 400, got ' + halfFill.status)

const crossSite = await call('/dsh-gemini-quota/api/quota', {
  headers: { 'Sec-Fetch-Site': 'cross-site' },
})
if (crossSite.status !== 403) fail('cross-site should be 403, got ' + crossSite.status)

// 7) DSH balance: account login path (mocked deepseekAccount service)
const balance = await call('/dsh-gemini-quota/api/balance')
if (balance.status !== 200) fail('GET balance status ' + balance.status)
const bal = balance.json && balance.json.balance
if (!bal || bal.ok !== true) fail('balance payload: ' + balance.text)
if (bal) {
  if (bal.totalBalance !== 14) fail('balance total should be 12.34 + 1.66 = 14, got ' + bal.totalBalance)
  if (bal.rechargeBalance !== 12.34) fail('recharge split ' + bal.rechargeBalance)
  if (bal.bonusBalance !== 1.66) fail('bonus split ' + bal.bonusBalance)
  if (bal.currency !== 'CNY') fail('currency ' + bal.currency)
  if (bal.source !== 'account') fail('balance source ' + bal.source)
}
const quotaWithBalance = await call('/dsh-gemini-quota/api/quota')
if (!quotaWithBalance.json || !quotaWithBalance.json.balance) fail('quota payload should carry the cached balance')
if (quotaWithBalance.json && quotaWithBalance.json.balance && quotaWithBalance.json.balance.totalBalance !== 14) {
  fail('quota balance mismatch')
}
if (!widget.text.includes('gfw-min-balance')) fail('widget bundle missing the DSH balance bubble row')

// 8) clear
const cleared = await call('/dsh-gemini-quota/api/manual', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ fiveHourUsedPct: null, weeklyUsedPct: null }),
})
if (!cleared.json || cleared.json.sample !== null) fail('clear did not remove sample')

server.close()
fs.rmSync(fakeHome, { recursive: true, force: true })

if (!process.exitCode) console.log('OK: host routes, state file, manual quota contract and guards verified')
