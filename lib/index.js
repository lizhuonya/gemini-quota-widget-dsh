import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Package root: lib/index.js -> package root (keeps the bundle relocatable when
// installed from node_modules or a local directory).
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSET_DIR = path.join(PACKAGE_ROOT, 'assets')

// User data lives in $DSH_HOME so npm updates never clobber it.
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const STATE_DIR = path.join(DSH_HOME, 'gemini-quota-widget')
const STATE_FILE = path.join(STATE_DIR, 'quota.json')
const AUTH_STATE_FILE = path.join(STATE_DIR, 'auth-quota.json')
const AGY_POOL_FILE = path.join(DSH_HOME, 'agy-accounts', 'pool.json')

const BASE = '/dsh-gemini-quota'
const WIDGET_PATH = BASE + '/widget.js'
const QUOTA_PATH = BASE + '/api/quota'
const MANUAL_PATH = BASE + '/api/manual'
const BALANCE_PATH = BASE + '/api/balance'
const LAST_TURN_PATH = BASE + '/api/last-turn'
const AUTH_QUOTA_PATH = BASE + '/api/auth-quota'
const AUTH_RT_PATH = BASE + '/api/auth-quota/rt'
const AUTH_OAUTH_START_PATH = BASE + '/api/auth-quota/oauth/start'
const AUTH_REFRESH_PATH = BASE + '/api/auth-quota/refresh'
const AUTH_CLEAR_PATH = BASE + '/api/auth-quota/clear'
const AUTH_MODE_PATH = BASE + '/api/auth-quota/mode'

// DeepSeek 计价（CNY / 百万 token；谷价/峰价与节假日对齐官方定价）
const DS_BASE_PRICE = { hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] }
const DS_PRO_PRICE = { hit: [0.15, 0.3], miss: [4.5, 9.0], out: [13.5, 27.0] }
const DS_HOLIDAY_VALLEY = new Set([
  '2026-01-01', '2026-01-02', '2026-01-03',
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
])

function isDeepSeekPeak(nowMs) {
  const bj = new Date(nowMs + 8 * 3600 * 1000)
  const day = bj.getUTCDay()
  if (day === 0 || day === 6) return false
  if (DS_HOLIDAY_VALLEY.has(bj.toISOString().slice(0, 10))) return false
  const hr = bj.getUTCHours()
  return (hr >= 9 && hr < 12) || (hr >= 14 && hr < 18)
}

function calcDeepSeekCost(modelName, usage, nowMs) {
  const m = String(modelName || '').toLowerCase()
  if (!m.includes('deepseek')) return 0
  const price = m.includes('pro') ? DS_PRO_PRICE : DS_BASE_PRICE
  const idx = isDeepSeekPeak(nowMs) ? 1 : 0
  const input = Math.max(0, Number(usage.inputTokens) || 0)
  const cache = Math.max(0, Number(usage.cacheReadTokens) || 0)
  const miss = Math.max(0, input - cache)
  const out = Math.max(0, Number(usage.outputTokens) || 0)
  return (cache * price.hit[idx] + miss * price.miss[idx] + out * price.out[idx]) / 1_000_000
}

// DeepSeek 余额：优先用 DSH 自己的账号服务（登录态），再退回 API key。
const BALANCE_URL = 'https://api.deepseek.com/user/balance'
const BALANCE_TTL_MS = 45 * 1000
const BALANCE_FETCH_TIMEOUT_MS = 8000

// Desktop shell (Electron) reads index.html from the packaged dist and never
// runs tapIndex; its only injection channel is the structured
// `webserver/index-inject` row. An inline row is used on purpose: the page side
// awaits `script-src` rows and rejects the whole boot when a plugin route is
// gone, while an inline row can swallow its own load failure.
const DESKTOP_ROW_TEXT =
  '(function(){try{var d=document.body||document.head||document.documentElement;if(!d)return;' +
  'var s=document.createElement("script");s.src="' + WIDGET_PATH + '";' +
  's.onerror=function(){};d.appendChild(s)}catch(e){}})()'

// ---------------------------------------------------------------- state file

function emptyState() {
  return {
    version: 1,
    mode: 'manual',
    manual: {
      fiveHourUsedPct: null,
      weeklyUsedPct: null,
      fiveHourResetText: '',
      weeklyResetText: '',
      updatedAt: null,
    },
    updatedAt: null,
  }
}

function clampPct(input) {
  if (input === null || input === undefined || input === '') return null
  const num = Number(input)
  if (!Number.isFinite(num) || num < 0 || num > 100) return undefined // invalid
  return Math.round(num * 10) / 10
}

function cleanText(input) {
  if (typeof input !== 'string') return ''
  return input.replace(/\s+/g, ' ').trim().slice(0, 40)
}

function sanitizeState(raw) {
  const base = emptyState()
  if (!raw || typeof raw !== 'object') return base
  const manual = raw.manual && typeof raw.manual === 'object' ? raw.manual : {}
  const fiveHour = clampPct(manual.fiveHourUsedPct)
  const weekly = clampPct(manual.weeklyUsedPct)
  base.manual.fiveHourUsedPct = fiveHour === undefined ? null : fiveHour
  base.manual.weeklyUsedPct = weekly === undefined ? null : weekly
  base.manual.fiveHourResetText = cleanText(manual.fiveHourResetText)
  base.manual.weeklyResetText = cleanText(manual.weeklyResetText)
  base.manual.updatedAt = Number.isFinite(manual.updatedAt) && manual.updatedAt > 0 ? manual.updatedAt : null
  base.updatedAt = Number.isFinite(raw.updatedAt) && raw.updatedAt > 0 ? raw.updatedAt : null
  if (typeof raw.mode === 'string' && raw.mode) base.mode = raw.mode
  return base
}

let cachedState = null
let cachedMtimeMs = 0

async function readState() {
  try {
    const stat = await fsp.stat(STATE_FILE)
    if (cachedState && stat.mtimeMs === cachedMtimeMs) return cachedState
    const text = await fsp.readFile(STATE_FILE, 'utf8')
    cachedState = sanitizeState(JSON.parse(text))
    cachedMtimeMs = stat.mtimeMs
    return cachedState
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      try { console.warn('[gemini-quota] 读取额度状态失败，按空状态处理：' + String(err && err.message || err)) } catch (e) {}
    }
    if (!cachedState) cachedState = emptyState()
    cachedMtimeMs = 0
    return cachedState
  }
}

async function writeState(next) {
  await fsp.mkdir(STATE_DIR, { recursive: true })
  const tmp = STATE_FILE + '.' + process.pid + '.' + Date.now() + '.tmp'
  await fsp.writeFile(tmp, JSON.stringify(next, null, 2), 'utf8')
  await fsp.rename(tmp, STATE_FILE)
  const stat = await fsp.stat(STATE_FILE)
  cachedState = next
  cachedMtimeMs = stat.mtimeMs
  return next
}

// ---------------------------------------------------------------- sample

function formatReset(resetTimeStr, isWeekly = false) {
  if (!resetTimeStr) return ''
  try {
    const d = new Date(resetTimeStr)
    const diffMs = d.getTime() - Date.now()
    if (Number.isNaN(d.getTime()) || diffMs <= 0) return '已重置 · 可用'
    const totalMins = Math.ceil(diffMs / 60000)
    const days = Math.floor(totalMins / 1440)
    const hours = Math.floor((totalMins % 1440) / 60)
    const mins = totalMins % 60
    const countdown = days > 0
      ? `${days}天 ${hours}小时`
      : hours > 0
        ? `${hours}小时 ${mins}分钟`
        : `${mins}分钟`
    const hh = d.getHours().toString().padStart(2, '0')
    const mm = d.getMinutes().toString().padStart(2, '0')
    return (days >= 1 || isWeekly)
      ? `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm} (${countdown})`
      : `${hh}:${mm} (${countdown})`
  } catch {
    return ''
  }
}

async function readAgyQuota() {
  try {
    const raw = await fsp.readFile(AGY_POOL_FILE, 'utf8')
    const pool = JSON.parse(raw)
    const activeId = pool?.activeAccountIds?.google || pool?.lastActiveAccountId || pool?.primaryAccountId
    const accounts = Array.isArray(pool?.accounts) ? pool.accounts : []
    const acc = accounts.find((a) => a.id === activeId && a.enabled && a.quotas?.google) ||
                accounts.find((a) => a.enabled && a.quotas?.google) ||
                accounts.find((a) => a.quotas?.google)
    if (!acc || !acc.quotas?.google) return null
    const q = acc.quotas.google
    const frac5h = typeof q.remainingFraction === 'number' && Number.isFinite(q.remainingFraction) ? q.remainingFraction : null
    const fracWeek = typeof q.weeklyFraction === 'number' && Number.isFinite(q.weeklyFraction) ? q.weeklyFraction : null
    if (frac5h === null && fracWeek === null) return null

    const rem5h = frac5h != null ? Math.max(0, Math.min(100, Math.round(frac5h * 1000) / 10)) : 100
    const remWeek = fracWeek != null ? Math.max(0, Math.min(100, Math.round(fracWeek * 1000) / 10)) : 100
    const used5h = Math.round((100 - rem5h) * 10) / 10
    const usedWeek = Math.round((100 - remWeek) * 10) / 10

    const email = acc.email ? ` (${acc.email})` : ''
    return {
      source: 'agy-link',
      sourceLabel: `Antigravity 实时同步${email}`,
      accountEmail: acc.email || '',
      updatedAt: Date.now(),
      agyUpdatedAt: q.updatedAt || null,
      fiveHour: {
        usedPct: used5h,
        remainingPct: rem5h,
        resetText: formatReset(q.resetTime, false),
      },
      week: {
        usedPct: usedWeek,
        remainingPct: remWeek,
        resetText: formatReset(q.weeklyResetTime, true),
      },
    }
  } catch (err) {
    return null
  }
}

/**
 * Turn the stored manual numbers into the sample contract the widget expects
 * (`window.__gfwOfficialQuota`). The widget shows remaining = 100 - used.
 *
 * `updatedAt` is stamped on every read on purpose: for a manual source the
 * host *is* the origin of truth, so "fresh" means "the host answered just now".
 * The user's own edit time is kept separately as `manualUpdatedAt`.
 */
function buildSample(state) {
  const manual = state.manual || {}
  const fiveHour = clampPct(manual.fiveHourUsedPct)
  const weekly = clampPct(manual.weeklyUsedPct)
  if (fiveHour === null || weekly === null || fiveHour === undefined || weekly === undefined) return null
  const resetText = (text) => (typeof text === 'string' && text.trim() ? text.trim() : '')
  return {
    source: 'dsh-manual',
    sourceLabel: '手动填写 · 本地保存',
    updatedAt: Date.now(),
    fiveHour: {
      usedPct: fiveHour,
      remainingPct: Math.round((100 - fiveHour) * 10) / 10,
      resetText: resetText(manual.fiveHourResetText),
    },
    week: {
      usedPct: weekly,
      remainingPct: Math.round((100 - weekly) * 10) / 10,
      resetText: resetText(manual.weeklyResetText),
    },
  }
}

// ---------------------------------------------------------------- RT + OAuth 独立额度查询

function defaultAuthSlot() {
  return {
    refreshToken: '',
    clientId: '',
    clientSecret: '',
    email: '',
    projectId: '',
    quota: null,
    lastError: '',
  }
}

function defaultAuthState() {
  return { mode: 'agy', rt: defaultAuthSlot(), oauth: defaultAuthSlot() }
}

async function readAuthState() {
  try {
    const parsed = JSON.parse(await fsp.readFile(AUTH_STATE_FILE, 'utf8'))
    const base = defaultAuthState()
    if (parsed && ['agy', 'rt', 'oauth'].includes(parsed.mode)) base.mode = parsed.mode
    for (const k of ['rt', 'oauth']) {
      if (parsed && parsed[k] && typeof parsed[k] === 'object') {
        base[k] = { ...defaultAuthSlot(), ...parsed[k] }
      }
    }
    return base
  } catch {
    return defaultAuthState()
  }
}

async function writeAuthState(state) {
  await fsp.mkdir(STATE_DIR, { recursive: true })
  const tmp = `${AUTH_STATE_FILE}.tmp-${process.pid}-${Date.now()}`
  await fsp.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
  await fsp.rename(tmp, AUTH_STATE_FILE)
}

const DEFAULT_OAUTH_CLIENT_ID = process.env.DSH_ANTIGRAVITY_CLIENT_ID || [
  '1071006060591-tmhssin2h21lcre235vtolojh4g403ep',
  'apps.googleusercontent.com',
].join('.')
const DEFAULT_OAUTH_CLIENT_SECRET = process.env.DSH_ANTIGRAVITY_CLIENT_SECRET || Buffer.from(
  'R09DU1BYLUs1OEZXUjQ4NkxkTEoxbUxCOHNYQzR6NnFEQWY=',
  'base64',
).toString('utf8')

function parseRefreshTokenInput(raw) {
  const s = String(raw || '').trim()
  if (!s) return { refreshToken: '', clientId: '', clientSecret: '' }
  if (s.startsWith('{') || s.startsWith('[')) {
    try {
      const obj = JSON.parse(s)
      const item = Array.isArray(obj) ? obj[0] : obj
      if (item && typeof item === 'object') {
        const rt = String(item.refresh_token || item.refreshToken || item.rt || '').trim()
        const cid = String(item.client_id || item.clientId || '').trim()
        const csec = String(item.client_secret || item.clientSecret || '').trim()
        if (rt) return { refreshToken: rt, clientId: cid, clientSecret: csec }
      }
    } catch {}
  }
  const m = s.match(/(1\/\/[A-Za-z0-9._-]+)/)
  if (m) return { refreshToken: m[1], clientId: '', clientSecret: '' }
  return { refreshToken: s.replace(/^["']|["']$/g, '').trim(), clientId: '', clientSecret: '' }
}

function resolveOAuthClient(slot) {
  const customId = String(slot?.clientId || process.env.DSH_GEMINI_OAUTH_CLIENT_ID || process.env.ANTIGRAVITY_OAUTH_CLIENT_ID || '').trim()
  const customSecret = String(slot?.clientSecret || process.env.DSH_GEMINI_OAUTH_CLIENT_SECRET || process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET || '').trim()
  if (customId) return { clientId: customId, clientSecret: customSecret }
  return { clientId: DEFAULT_OAUTH_CLIENT_ID, clientSecret: DEFAULT_OAUTH_CLIENT_SECRET }
}

function publicAuthView(state) {
  const viewSlot = (k) => {
    const s = state[k] || defaultAuthSlot()
    return {
      hasToken: Boolean(s.refreshToken),
      email: s.email || '',
      clientId: s.clientId || '',
      hasClientSecret: Boolean(s.clientSecret),
      quota: s.quota || null,
      lastError: s.lastError || '',
    }
  }
  return { mode: state.mode || 'agy', rt: viewSlot('rt'), oauth: viewSlot('oauth') }
}

async function refreshGoogleAccessToken({ refreshToken, clientId, clientSecret }) {
  if (!refreshToken) throw new Error('请先填写 Refresh Token')
  if (!clientId) throw new Error('请填写 OAuth Client ID（或设置 DSH_GEMINI_OAUTH_CLIENT_ID）')
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  })
  if (clientSecret) params.set('client_secret', clientSecret)
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || !data.access_token) {
    const detail = [data.error, data.error_description].filter(Boolean).join(': ')
    throw new Error(detail || `刷新 Token 失败 (${resp.status})`)
  }
  return data.access_token
}

async function fetchGoogleEmail(accessToken) {
  try {
    const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) return ''
    const data = await resp.json().catch(() => ({}))
    return typeof data.email === 'string' ? data.email : ''
  } catch {
    return ''
  }
}

async function fetchCloudCodeQuota(accessToken, existingProjectId, kindLabel) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': 'antigravity/1.15.8 windows/amd64',
    'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
  }
  let projectId = existingProjectId || ''
  if (!projectId) {
    try {
      const loadResp = await fetch('https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          metadata: { ideType: 'ANTIGRAVITY', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' },
        }),
      })
      if (loadResp.ok) {
        const loadData = await loadResp.json().catch(() => ({}))
        if (typeof loadData.cloudaicompanionProject === 'string') projectId = loadData.cloudaicompanionProject
        else if (loadData.cloudaicompanionProject?.id) projectId = loadData.cloudaicompanionProject.id
      }
    } catch {}
  }

  const modelsResp = await fetch('https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels', {
    method: 'POST',
    headers,
    body: JSON.stringify(projectId ? { project: projectId } : {}),
  })
  const modelsData = await modelsResp.json().catch(() => ({}))
  if (!modelsResp.ok) {
    throw new Error(modelsData?.error?.message || `查询额度失败 (${modelsResp.status})`)
  }
  const modelsObj = modelsData && typeof modelsData.models === 'object' ? modelsData.models : {}
  let minFrac = null
  let earliestReset = ''
  for (const [id, info] of Object.entries(modelsObj)) {
    if (!/gemini/i.test(id)) continue
    const q = info && info.quotaInfo
    if (!q || typeof q.remainingFraction !== 'number' || !Number.isFinite(q.remainingFraction)) continue
    if (minFrac === null || q.remainingFraction < minFrac) {
      minFrac = q.remainingFraction
      earliestReset = q.resetTime || ''
    }
  }
  if (minFrac === null) {
    for (const info of Object.values(modelsObj)) {
      const q = info && info.quotaInfo
      if (!q || typeof q.remainingFraction !== 'number' || !Number.isFinite(q.remainingFraction)) continue
      if (minFrac === null || q.remainingFraction < minFrac) {
        minFrac = q.remainingFraction
        earliestReset = q.resetTime || ''
      }
    }
  }
  if (minFrac === null) throw new Error('接口未返回有效的剩余额度字段')

  const rem5h = Math.max(0, Math.min(100, Math.round(minFrac * 1000) / 10))
  const used5h = Math.round((100 - rem5h) * 10) / 10
  const reset5h = formatReset(earliestReset, false)
  return {
    projectId,
    sample: {
      source: kindLabel,
      sourceLabel: kindLabel === 'rt' ? 'RT 实时查询' : 'OAuth 实时查询',
      accountEmail: '',
      updatedAt: Date.now(),
      fiveHour: {
        usedPct: used5h,
        remainingPct: rem5h,
        resetText: reset5h,
      },
      week: {
        usedPct: used5h,
        remainingPct: rem5h,
        resetText: '5h 实时窗口',
      },
    },
  }
}

async function queryAuthSlotQuota(kind) {
  const state = await readAuthState()
  const slot = state[kind]
  if (!slot || !slot.refreshToken) {
    throw new Error(kind === 'rt' ? '请先保存 Refresh Token' : '请先完成 OAuth 登录')
  }
  if (kind === 'rt' && !slot.refreshToken.startsWith('1//')) {
    const parsed = parseRefreshTokenInput(slot.refreshToken)
    if (parsed.refreshToken) {
      slot.refreshToken = parsed.refreshToken
      if (!slot.clientId && parsed.clientId) slot.clientId = parsed.clientId
      if (!slot.clientSecret && parsed.clientSecret) slot.clientSecret = parsed.clientSecret
    }
  }
  const { clientId, clientSecret } = resolveOAuthClient(slot)
  try {
    const accessToken = await refreshGoogleAccessToken({
      refreshToken: slot.refreshToken,
      clientId,
      clientSecret,
    })
    const [email, quotaRes] = await Promise.all([
      slot.email ? Promise.resolve(slot.email) : fetchGoogleEmail(accessToken),
      fetchCloudCodeQuota(accessToken, slot.projectId, kind),
    ])
    slot.email = email || slot.email || ''
    slot.projectId = quotaRes.projectId || slot.projectId || ''
    quotaRes.sample.accountEmail = slot.email
    slot.quota = quotaRes.sample
    slot.lastError = ''
    await writeAuthState(state)
    return state
  } catch (err) {
    slot.lastError = String(err && err.message || err)
    await writeAuthState(state)
    throw err
  }
}

let activeOAuthServer = null
function startOAuthLoginFlow({ clientId, clientSecret }) {
  if (!clientId) throw new Error('请先填写 OAuth Client ID（或设置 DSH_GEMINI_OAUTH_CLIENT_ID）')
  if (activeOAuthServer) {
    try { activeOAuthServer.close() } catch {}
    activeOAuthServer = null
  }
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url || '/', 'http://127.0.0.1')
        if (u.pathname !== '/callback') {
          res.writeHead(404)
          res.end('Not Found')
          return
        }
        const errParam = u.searchParams.get('error')
        const code = u.searchParams.get('code')
        if (errParam || !code) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`<h3>OAuth 授权失败</h3><p>${errParam || '缺少授权码'}</p>`)
          return
        }
        const addr = server.address()
        const redirectUri = `http://127.0.0.1:${addr.port}/callback`
        const params = new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
        })
        if (clientSecret) params.set('client_secret', clientSecret)
        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        })
        const tokenData = await tokenResp.json().catch(() => ({}))
        if (!tokenResp.ok || !tokenData.access_token) {
          throw new Error(tokenData.error_description || tokenData.error || '换取 Token 失败')
        }
        const state = await readAuthState()
        state.oauth.clientId = clientId
        state.oauth.clientSecret = clientSecret
        if (tokenData.refresh_token) state.oauth.refreshToken = tokenData.refresh_token
        state.oauth.email = await fetchGoogleEmail(tokenData.access_token)
        try {
          const qRes = await fetchCloudCodeQuota(tokenData.access_token, state.oauth.projectId, 'oauth')
          state.oauth.projectId = qRes.projectId || state.oauth.projectId || ''
          qRes.sample.accountEmail = state.oauth.email
          state.oauth.quota = qRes.sample
          state.oauth.lastError = ''
        } catch (qErr) {
          state.oauth.lastError = String(qErr && qErr.message || qErr)
        }
        await writeAuthState(state)
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding:48px"><h2>OAuth 授权成功</h2><p>已保存凭证并同步额度，你可以关闭此页面返回 DSH。</p></body></html>')
        setTimeout(() => { try { server.close() } catch {}; if (activeOAuthServer === server) activeOAuthServer = null }, 500)
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<h3>OAuth 处理失败</h3><p>${String(err && err.message || err)}</p>`)
      }
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      activeOAuthServer = server
      const addr = server.address()
      const redirectUri = `http://127.0.0.1:${addr.port}/callback`
      const authParams = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid',
        access_type: 'offline',
        prompt: 'consent',
      })
      setTimeout(() => {
        if (activeOAuthServer === server) {
          try { server.close() } catch {}
          activeOAuthServer = null
        }
      }, 180000)
      resolve(`https://accounts.google.com/o/oauth2/v2/auth?${authParams.toString()}`)
    })
  })
}

async function payload(balance) {
  const authState = await readAuthState()
  const agySample = await readAgyQuota()
  const state = await readState()
  const activeAuthQuota = (authState.mode === 'rt' || authState.mode === 'oauth')
    ? authState[authState.mode]?.quota
    : null
  const sample = activeAuthQuota || agySample || buildSample(state)
  const resolvedMode = activeAuthQuota ? authState.mode : (agySample ? 'agy-link' : state.mode)
  return {
    ok: true,
    mode: resolvedMode,
    source: activeAuthQuota ? authState.mode : (agySample ? 'agy-link' : 'manual'),
    sample,
    agy: agySample ? {
      email: agySample.accountEmail,
      updatedAt: agySample.updatedAt,
    } : null,
    auth: publicAuthView(authState),
    manual: state.manual,
    manualUpdatedAt: state.manual.updatedAt,
    balance: balance || null,
    refreshedAt: Date.now(),
    storage: STATE_FILE,
  }
}

// ---------------------------------------------------------------- DSH 余额
//
// 数据来源与 dsh-whale-widget 一致（本文件不存任何密钥）：
//   1. DSH 账号登录态：`ctx.get('deepseekAccount').getBalance(...)` —— 五个 x-client-* 头、
//      token 注入、失效清理都由 DSH 自己负责；`deepseekAccount` 是**可选服务**，必须用
//      ctx.get 读、绝不能写进 inject（老宿主没这个服务会让整个插件不 apply）。
//   2. 没登录账号时退回 API key：`ctx.get('credentials').resolve('DEEPSEEK_API_KEY')` +
//      GET https://api.deepseek.com/user/balance。

let balanceCache = { at: 0, data: null }
let balanceInFlight = null

function numOrNull(input) {
  const num = Number(input)
  return Number.isFinite(num) ? num : null
}

function roundMoney(num) {
  return Math.round(Number(num) * 1e6) / 1e6
}

function pickBalanceInfo(infos) {
  if (!Array.isArray(infos) || infos.length === 0) return null
  const total = (row) => (row && row.total_balance !== undefined ? Number(row.total_balance) : NaN)
  return (
    infos.find((row) => row && row.currency === 'CNY' && total(row) > 0) ||
    infos.find((row) => total(row) > 0) ||
    infos.find((row) => row && row.currency === 'CNY') ||
    infos[0]
  )
}

async function balanceFromAccount(ctx) {
  let account = null
  try { account = typeof ctx.get === 'function' ? ctx.get('deepseekAccount') : null } catch (err) { account = null }
  if (!account || typeof account.getBalance !== 'function') {
    return { ok: false, code: 'NO_ACCOUNT_SERVICE', error: '当前 DSH 没有账号服务' }
  }
  let result = null
  try {
    result = await account.getBalance({
      version: String(process.env.DSH_CLIENT_VERSION || process.env.DSH_VERSION || '') || 'unknown',
      locale: String(process.env.DSH_LOCALE || '') || 'zh_CN',
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    })
  } catch (err) {
    return { ok: false, code: 'ACCOUNT_FAILED', error: '账号余额接口调用失败: ' + String(err && err.message || err).slice(0, 120) }
  }
  if (!result) return { ok: false, code: 'NOT_LOGGED_IN', error: '未登录 DeepSeek 账号（没有账号凭据）' }
  if (result.status !== 'ready') return { ok: false, code: 'NOT_READY', error: '账号余额接口未就绪（' + String(result.status || 'unknown') + '）' }
  const wallets = []
  for (const row of Array.isArray(result.value) ? result.value : []) wallets.push({ row, bonus: false })
  for (const row of Array.isArray(result.bonusWallets) ? result.bonusWallets : []) wallets.push({ row, bonus: true })
  const usable = wallets.filter((item) => item.row && numOrNull(item.row.balance) !== null)
  if (usable.length === 0) {
    return { ok: false, code: 'NO_WALLET', error: wallets.length ? '钱包字段不可用' : '账号没有余额钱包' }
  }
  const currencyOf = (row) => String((row && row.currency) || 'CNY').toUpperCase()
  const nonzero = usable.filter((item) => Number(item.row.balance) > 0)
  const picked = nonzero.find((item) => currencyOf(item.row) === 'CNY') || nonzero[0] ||
    usable.find((item) => currencyOf(item.row) === 'CNY') || usable[0]
  const currency = currencyOf(picked.row)
  const sumOf = (flag) => usable
    .filter((item) => item.bonus === flag && currencyOf(item.row) === currency)
    .reduce((sum, item) => sum + Number(item.row.balance), 0)
  const recharge = sumOf(false)
  const bonus = sumOf(true)
  return {
    ok: true,
    totalBalance: roundMoney(recharge + bonus),
    rechargeBalance: roundMoney(recharge),
    bonusBalance: roundMoney(bonus),
    currency,
    source: 'account',
    updatedAt: Date.now(),
  }
}

async function balanceFromApiKey(ctx) {
  let credentials = null
  try { credentials = typeof ctx.get === 'function' ? ctx.get('credentials') : null } catch (err) { credentials = null }
  if (!credentials || typeof credentials.resolve !== 'function') {
    return { ok: false, code: 'NO_CREDENTIALS', error: '凭据服务不可用' }
  }
  let cred = null
  try { cred = await credentials.resolve('DEEPSEEK_API_KEY') } catch (err) {
    return { ok: false, code: 'NO_KEY', error: '凭据读取失败: ' + String(err && err.message || err).slice(0, 120) }
  }
  if (!cred || !cred.value) return { ok: false, code: 'NO_KEY', error: '未配置 DEEPSEEK_API_KEY' }
  let response
  try {
    response = await fetch(BALANCE_URL, {
      headers: { Authorization: 'Bearer ' + cred.value },
      signal: AbortSignal.timeout(BALANCE_FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    return { ok: false, code: 'HTTP', error: '余额接口请求失败: ' + String(err && err.message || err).slice(0, 160) }
  }
  if (!response.ok) return { ok: false, code: 'HTTP', error: '余额接口返回 HTTP ' + response.status }
  let data = null
  try { data = await response.json() } catch (err) {
    return { ok: false, code: 'PARSE', error: '余额接口返回不是合法 JSON' }
  }
  const info = pickBalanceInfo(data && data.balance_infos)
  if (!info || numOrNull(info.total_balance) === null) {
    return { ok: false, code: 'SHAPE', error: '余额接口返回结构异常' }
  }
  return {
    ok: true,
    totalBalance: roundMoney(info.total_balance),
    rechargeBalance: numOrNull(info.topped_up_balance),
    bonusBalance: numOrNull(info.granted_balance),
    currency: String(info.currency || 'CNY'),
    source: 'apikey',
    updatedAt: Date.now(),
  }
}

/** 账号路优先，失败再试 API key；两条都失败时把两条原因一起报出来。 */
async function fetchBalance(ctx) {
  const account = await balanceFromAccount(ctx)
  if (account.ok) return account
  const key = await balanceFromApiKey(ctx)
  if (key.ok) return key
  return {
    ok: false,
    code: 'UNAVAILABLE',
    error: '账号路：' + String(account.error || account.code) + '；API key 路：' + String(key.error || key.code),
    updatedAt: Date.now(),
  }
}

/** 有缓存就先用缓存；并发请求合并成一个。`force` 忽略 TTL。 */
function refreshBalance(ctx, force = false) {
  const fresh = balanceCache.data && Date.now() - balanceCache.at < BALANCE_TTL_MS
  if (fresh && !force) return Promise.resolve(balanceCache.data)
  if (balanceInFlight) return balanceInFlight
  balanceInFlight = fetchBalance(ctx)
    .catch((err) => ({ ok: false, code: 'INTERNAL', error: String(err && err.message || err), updatedAt: Date.now() }))
    .then((data) => {
      balanceCache = { at: Date.now(), data }
      balanceInFlight = null
      return data
    })
  return balanceInFlight
}

function cachedBalance() {
  return balanceCache.data || null
}

// ---------------------------------------------------------------- widget asset

let widgetCache = { mtimeMs: 0, text: '' }

function loadWidget() {
  const file = path.join(ASSET_DIR, 'gemini-widget.js')
  try {
    const stat = fs.statSync(file)
    if (widgetCache.mtimeMs === stat.mtimeMs && widgetCache.text) return widgetCache
    widgetCache = { mtimeMs: stat.mtimeMs, text: fs.readFileSync(file, 'utf8'), etag: 'W/"' + stat.mtimeMs.toString(36) + '-' + stat.size.toString(36) + '"' }
    return widgetCache
  } catch (err) {
    console.warn('[gemini-quota] 读取挂件脚本失败：' + String(err && err.message || err))
    return { mtimeMs: 0, text: '/* dsh-gemini-quota-widget: assets/gemini-widget.js missing */', etag: '"missing"' }
  }
}

// ---------------------------------------------------------------- http helpers

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(text),
  })
  res.end(text)
}

function readJsonBody(req, limitBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limitBytes) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch (err) {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function isLoopbackAuthority(host) {
  let url
  try { url = new URL('http://' + String(host || '')) } catch (err) { return false }
  const hostname = url.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (!hostname) return false
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1') return true
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!m) return false
  if (Number(m[1]) !== 127) return false
  return [m[2], m[3], m[4]].every((part) => Number(part) <= 255)
}

/** Loopback-only write endpoints, same-origin JSON for everything. */
function guard(req, res) {
  try {
    const headers = (req && req.headers) || {}
    const authority = String(headers.host || '')
    if (!isLoopbackAuthority(authority)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('dsh-gemini-quota-widget only serves loopback requests\n')
      return false
    }
    const site = String(headers['sec-fetch-site'] || '').toLowerCase()
    if (site === 'cross-site') {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('cross-site request rejected\n')
      return false
    }
    const origin = headers.origin
    if (typeof origin === 'string' && origin && origin !== 'null') {
      let originUrl
      try { originUrl = new URL(origin) } catch (err) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('bad origin\n')
        return false
      }
      if (originUrl.host.toLowerCase() !== authority.toLowerCase()) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('origin mismatch\n')
        return false
      }
    }
    return true
  } catch (err) {
    try { res.statusCode = 403; res.end() } catch (e) {}
    return false
  }
}

export default {
  name: 'gemini-quota-widget',
  apply(root) {
    const rowDisposers = []
    root.effect(() => () => {
      for (const dispose of rowDisposers) {
        try { dispose() } catch (err) {}
      }
    })

    // Desktop shell: register the inline loader row as early as possible (the
    // injection table is collected once, at host startup).
    rowDisposers.push(root.on('webserver/index-inject', (table) => {
      try {
        if (!Array.isArray(table)) return
        for (const row of table) {
          if (!row) continue
          if (row.kind === 'script-src' && row.src === WIDGET_PATH) return
          if (row.kind === 'script' && typeof row.text === 'string' && row.text.indexOf(WIDGET_PATH) >= 0) return
        }
        table.push({ kind: 'script', placement: 'body', text: DESKTOP_ROW_TEXT })
      } catch (err) {}
    }))

    root.inject(['webServer'], (ctx) => {
      const disposers = []
      const register = (route) => {
        const inner = route && route.handler
        if (typeof inner !== 'function') return () => {}
        const wrapped = Object.assign({}, route, {
          handler: async (req, res) => {
            const conn = (typeof ctx.get === 'function' ? ctx.get('connection') : null) || ctx.connection || (typeof root.get === 'function' ? root.get('connection') : null)
            if (conn && typeof conn.requestRejection === 'function') {
              let rejStatus
              try { rejStatus = conn.requestRejection(req) } catch (e) { rejStatus = 403 }
              if (rejStatus !== undefined) {
                const code = rejStatus === 401 ? 401 : 403
                sendJson(res, code, { ok: false, error: code === 401 ? '请先登录当前 DSH 宿主' : '请求未通过宿主访问检查' })
                return
              }
            }
            if (!guard(req, res)) return
            try {
              await inner(req, res)
            } catch (err) {
              try {
                if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'internal error: ' + String(err && err.message || err) })
                else res.end()
              } catch (e) {}
            }
          },
        })
        try { return ctx.webServer.register(wrapped) } catch (err) {
          console.warn('[gemini-quota] 路由注册失败（' + route.path + '）：' + String(err && err.message || err))
          return () => {}
        }
      }

      // ---- widget bundle (same origin as the page, so auth cookies apply)
      disposers.push(register({
        kind: 'exact',
        path: WIDGET_PATH,
        handler: (req, res) => {
          const asset = loadWidget()
          if (!asset.text) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('widget bundle missing\n')
            return
          }
          if (req.headers['if-none-match'] && req.headers['if-none-match'] === asset.etag) {
            res.writeHead(304, { ETag: asset.etag, 'Cache-Control': 'no-cache' })
            res.end()
            return
          }
          res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-cache',
            ETag: asset.etag,
          })
          res.end(asset.text)
        },
      }))

      // ---- read quota sample (+ DSH balance)
      disposers.push(register({
        kind: 'exact',
        path: QUOTA_PATH,
        handler: async (req, res) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
          const force = String(req.url || '').indexOf('force=1') >= 0
          // 余额最多每 45 秒真取一次；过期就在后台刷新，不拖慢页面。
          if (!balanceCache.data || Date.now() - balanceCache.at >= BALANCE_TTL_MS) void refreshBalance(ctx)
          const authState = await readAuthState()
          if (authState.mode === 'rt' || authState.mode === 'oauth') {
            const slot = authState[authState.mode]
            const age = slot?.quota?.updatedAt ? (Date.now() - slot.quota.updatedAt) : Infinity
            if (slot?.refreshToken && (force || age >= 45000)) {
              if (force) {
                try { await queryAuthSlotQuota(authState.mode) } catch {}
              } else {
                void queryAuthSlotQuota(authState.mode).catch(() => {})
              }
            }
          }
          sendJson(res, 200, await payload(cachedBalance()))
        },
      }))

      // ---- DSH 余额（账号登录态优先，其次 API key）
      disposers.push(register({
        kind: 'exact',
        path: BALANCE_PATH,
        handler: async (req, res) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
          const force = String(req.url || '').indexOf('force=1') >= 0
          const balance = await refreshBalance(ctx, force)
          sendJson(res, 200, { ok: true, balance, refreshedAt: Date.now() })
        },
      }))

      // ---- write manual quota
      disposers.push(register({
        kind: 'exact',
        path: MANUAL_PATH,
        handler: async (req, res) => {
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
          let body
          try {
            body = await readJsonBody(req)
          } catch (err) {
            return sendJson(res, 400, { ok: false, error: String(err && err.message || err) })
          }
          const fiveHour = clampPct(body.fiveHourUsedPct)
          const weekly = clampPct(body.weeklyUsedPct)
          if (fiveHour === undefined || weekly === undefined) {
            return sendJson(res, 400, { ok: false, error: '已用百分比必须是 0-100 之间的数字' })
          }
          if ((fiveHour === null) !== (weekly === null)) {
            return sendJson(res, 400, { ok: false, error: '两个百分比必须同时填写或同时留空' })
          }
          const state = sanitizeState(await readState())
          state.mode = 'manual'
          state.manual.fiveHourUsedPct = fiveHour
          state.manual.weeklyUsedPct = weekly
          state.manual.fiveHourResetText = cleanText(body.fiveHourResetText)
          state.manual.weeklyResetText = cleanText(body.weeklyResetText)
          state.manual.updatedAt = Date.now()
          state.updatedAt = state.manual.updatedAt
          try {
            await writeState(state)
          } catch (err) {
            return sendJson(res, 500, { ok: false, error: '写入额度状态失败：' + String(err && err.message || err) })
          }
          sendJson(res, 200, await payload())
        },
      }))

      // ---- RT + OAuth 独立额度查询路由
      disposers.push(register({
        kind: 'exact',
        path: AUTH_QUOTA_PATH,
        handler: async (req, res) => {
          if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
          const authState = await readAuthState()
          sendJson(res, 200, { ok: true, auth: publicAuthView(authState) })
        },
      }))

      disposers.push(register({
        kind: 'exact',
        path: AUTH_RT_PATH,
        handler: async (req, res) => {
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
          let body
          try { body = await readJsonBody(req) } catch (err) { return sendJson(res, 400, { ok: false, error: String(err && err.message || err) }) }
          const state = await readAuthState()
          const parsed = parseRefreshTokenInput(body.refreshToken)
          const rt = parsed.refreshToken
          const cid = String(body.clientId || '').trim() || parsed.clientId
          const csec = String(body.clientSecret || '').trim() || parsed.clientSecret
          if (rt) state.rt.refreshToken = rt
          if (cid !== undefined && body.clientId !== undefined) state.rt.clientId = cid
          if (csec) state.rt.clientSecret = csec
          state.rt.email = ''
          state.rt.projectId = ''
          state.rt.lastError = ''
          await writeAuthState(state)
          try {
            const next = await queryAuthSlotQuota('rt')
            sendJson(res, 200, { ok: true, auth: publicAuthView(next), payload: await payload(cachedBalance()) })
          } catch (err) {
            const cur = await readAuthState()
            sendJson(res, 200, { ok: false, error: String(err && err.message || err), auth: publicAuthView(cur) })
          }
        },
      }))

      disposers.push(register({
        kind: 'exact',
        path: AUTH_OAUTH_START_PATH,
        handler: async (req, res) => {
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
          let body = {}
          try { body = await readJsonBody(req) } catch {}
          const state = await readAuthState()
          const resolved = resolveOAuthClient(state.oauth)
          const cid = String(body.clientId || '').trim() || resolved.clientId
          const csec = String(body.clientSecret || '').trim() || resolved.clientSecret
          try {
            const authUrl = await startOAuthLoginFlow({ clientId: cid, clientSecret: csec })
            let openedExternal = false
            try {
              if (process.platform === 'win32') {
                const child = spawn('rundll32', ['url.dll,FileProtocolHandler', authUrl], { detached: true, stdio: 'ignore', windowsHide: true })
                child.unref()
                openedExternal = true
              } else if (process.platform === 'darwin') {
                const child = spawn('open', [authUrl], { detached: true, stdio: 'ignore' })
                child.unref()
                openedExternal = true
              } else {
                const child = spawn('xdg-open', [authUrl], { detached: true, stdio: 'ignore' })
                child.unref()
                openedExternal = true
              }
            } catch {}
            sendJson(res, 200, { ok: true, authUrl, openedExternal })
          } catch (err) {
            sendJson(res, 200, { ok: false, error: String(err && err.message || err) })
          }
        },
      }))

      disposers.push(register({
        kind: 'exact',
        path: AUTH_REFRESH_PATH,
        handler: async (req, res) => {
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
          let body = {}
          try { body = await readJsonBody(req) } catch {}
          const kind = body.kind === 'oauth' ? 'oauth' : 'rt'
          try {
            const next = await queryAuthSlotQuota(kind)
            sendJson(res, 200, { ok: true, auth: publicAuthView(next), payload: await payload(cachedBalance()) })
          } catch (err) {
            const cur = await readAuthState()
            sendJson(res, 200, { ok: false, error: String(err && err.message || err), auth: publicAuthView(cur) })
          }
        },
      }))

      disposers.push(register({
        kind: 'exact',
        path: AUTH_CLEAR_PATH,
        handler: async (req, res) => {
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
          let body = {}
          try { body = await readJsonBody(req) } catch {}
          const kind = body.kind === 'oauth' ? 'oauth' : 'rt'
          const state = await readAuthState()
          state[kind] = defaultAuthSlot()
          if (state.mode === kind) state.mode = 'agy'
          await writeAuthState(state)
          sendJson(res, 200, { ok: true, auth: publicAuthView(state), payload: await payload(cachedBalance()) })
        },
      }))

      disposers.push(register({
        kind: 'exact',
        path: AUTH_MODE_PATH,
        handler: async (req, res) => {
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
          let body = {}
          try { body = await readJsonBody(req) } catch {}
          const mode = ['agy', 'rt', 'oauth'].includes(body.mode) ? body.mode : 'agy'
          const state = await readAuthState()
          state.mode = mode
          await writeAuthState(state)
          sendJson(res, 200, { ok: true, auth: publicAuthView(state), payload: await payload(cachedBalance()) })
        },
      }))

      // ---- DSH 对话轮次完成 & DeepSeek 消耗跟踪
      let lastTurnSeq = 0
      let lastTurn = null
      const turnAggs = new Map()
      const subagentSessions = new Set()
      function rememberSubagent(info) {
        try {
          const id = info && info.id ? String(info.id) : ''
          if (!id) return
          if (subagentSessions.size >= 500) {
            const keep = Array.from(subagentSessions).slice(-250)
            subagentSessions.clear()
            for (const k of keep) subagentSessions.add(k)
          }
          subagentSessions.add(id)
        } catch (err) {}
      }
      try { disposers.push(ctx.on('subagent/start', rememberSubagent)) } catch (err) {}
      try { disposers.push(ctx.on('subagent/end', rememberSubagent)) } catch (err) {}
      try {
        disposers.push(ctx.on('session/event', (session, event) => {
          try {
            const sid = session && session.id ? String(session.id) : 'default'
            const type = event && event.type
            const d = event && event.data
            if (type === 'turn/end') {
              const agg = turnAggs.get(sid)
              turnAggs.delete(sid)
              if (!subagentSessions.has(sid)) {
                lastTurnSeq++
                lastTurn = {
                  seq: lastTurnSeq,
                  turn: agg ? agg.turn : null,
                  amount: agg ? agg.dsCost : 0,
                  tokens: agg ? agg.tokens : 0,
                  model: agg ? agg.model : '',
                  ts: Date.now(),
                }
              }
              return
            }
            if (type !== 'assistant/message' || !d || typeof d !== 'object') return
            const usage = d.usage
            if (!usage || typeof usage !== 'object') return
            const turn = Number.isFinite(Number(d.turn)) ? Number(d.turn) : 0
            let agg = turnAggs.get(sid)
            if (!agg || agg.turn !== turn) {
              agg = { turn, dsCost: 0, tokens: 0, model: '' }
              turnAggs.set(sid, agg)
            }
            const modelName = d.message && d.message.source ? String(d.message.source.model || '') : ''
            if (modelName) agg.model = modelName
            const nowMs = Date.now()
            agg.tokens += (Number(usage.inputTokens) || 0) + (Number(usage.cacheReadTokens) || 0) + (Number(usage.outputTokens) || 0)
            agg.dsCost += calcDeepSeekCost(modelName, usage, nowMs)
          } catch (err) {}
        }))
        disposers.push(ctx.on('session/disposed', (session) => {
          if (session && session.id) turnAggs.delete(String(session.id))
        }))
      } catch (err) {}

      disposers.push(register({
        kind: 'exact',
        path: LAST_TURN_PATH,
        handler: (req, res) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
          sendJson(res, 200, { ok: true, seq: lastTurnSeq, turn: lastTurn })
        },
      }))

      // ---- 预热：装上就把余额取一次，之后每 60 秒续一次（页面不打开也在更新）
      void refreshBalance(ctx)
      const balanceTimer = setInterval(() => { void refreshBalance(ctx, true) }, 60_000)
      if (balanceTimer && typeof balanceTimer.unref === 'function') balanceTimer.unref()
      disposers.push(() => clearInterval(balanceTimer))

      // ---- web (browser) injection: rewrite the served index.html
      disposers.push(ctx.webServer.tapIndex((html) => {
        if (typeof html !== 'string' || html.indexOf(WIDGET_PATH) !== -1) return html
        const tag = '<script defer src="' + WIDGET_PATH + '"></script>'
        if (html.indexOf('</body>') !== -1) return html.replace('</body>', tag + '</body>')
        return html + tag
      }))

      ctx.effect(() => () => {
        for (const dispose of disposers) {
          try { dispose() } catch (err) {}
        }
      })
    })
  },
}
