#!/usr/bin/env node
/**
 * Build the DSH-flavoured catgirl quota widget.
 *
 * Reads the upstream sources from gemini-quota-widget, applies the small set of
 * DSH-specific edits (data-source label, manual-quota panel, refresh hook),
 * bundles dom-builder/companion with esbuild exactly like the upstream
 * scripts/build.cjs does, and finally prepends the DSH bridge shim that talks to
 * this plugin's host routes.
 *
 * Usage:
 *   node build/build-widget.mjs [path-to-upstream-repo]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, '..');
const UPSTREAM = path.resolve(process.argv[2] || path.join(PACKAGE_ROOT, '..', 'gqw', 'gemini-quota-widget-main'));

const require = createRequire(path.join(UPSTREAM, 'package.json'));
const { build, buildSync } = require('esbuild');

const SRC = path.join(UPSTREAM, 'src');
const ASSETS = path.join(UPSTREAM, 'assets');

function mustReplace(text, from, to, label, expected = 1) {
  const count = text.split(from).length - 1;
  if (count !== expected) {
    throw new Error(`[build] ${label}: expected ${expected} occurrence(s), found ${count}`);
  }
  return text.split(from).join(to);
}

// ---------------------------------------------------------------- widget.js
let widget = fs.readFileSync(path.join(SRC, 'widget.js'), 'utf8');

// 1) Ask the DSH host to refresh instead of relying on the Electron console hook.
widget = mustReplace(
  widget,
  "console.info('[GFW_OFFICIAL_REFRESH]')",
  "(window.__gfwRequestRefresh || function () { console.info('[GFW_OFFICIAL_REFRESH]') })()",
  'refresh hook',
  2,
);

// 2) Keep the quota panel reachable: upstream disables the toggle because it
//    assumes the Electron host always feeds an official sample.
widget = mustReplace(
  widget,
  "for (const id of ['gfw-tier-select','gfw-display-mode','gfw-toggle-quota-panel','gfw-btn-sim-turn'])",
  "for (const id of ['gfw-tier-select','gfw-display-mode','gfw-btn-sim-turn'])",
  'quota toggle kept enabled',
);

widget = mustReplace(
  widget,
  "document.getElementById('gfw-toggle-quota-panel').textContent='官方双额度自动同步';",
  "document.getElementById('gfw-toggle-quota-panel').textContent='📊 额度数据与手动填写';",
  'quota panel label',
);

widget = mustReplace(
  widget,
  "if(footer)footer.textContent='Google 官方双额度 · 30秒自动刷新';",
  "if(footer)footer.textContent='DSH 额度挂件 · 数据源可配置';",
  'footer label',
);

widget = mustReplace(
  widget,
  '<div class="gfw-img-wrap" id="gfw-img-wrap" title="单击猫娘弹出实时额度 / Q弹一下 · 单击气泡框切换台词 · 右键打开菜单">',
  '<div class="gfw-img-wrap" id="gfw-img-wrap">',
  'remove catgirl hover tooltip',
);

widget = mustReplace(
  widget,
  "sourceLabel: valid ? 'Google 官方用量 · 30秒刷新' : '尚未取得有效官方数据',",
  "sourceLabel: valid ? (typeof sample.sourceLabel === 'string' && sample.sourceLabel ? sample.sourceLabel : '额度数据 · 自动刷新') : '尚未配置额度数据',",
  'source label',
);

widget = mustReplace(
  widget,
  `<input type="number" id="gfw-scale-num" min="1" max="20" step="1" style="width:46px;text-align:center;" />`,
  `<input type="number" id="gfw-scale-num" min="1" max="20" step="1" style="width:64px;text-align:center;" />`,
  'widget widen scale number box to match opacity',
);

widget = mustReplace(
  widget,
  `        <div class="gfw-m-row">
          <label style="display:flex;align-items:center;gap:4px;font-weight:600;">
            <input type="checkbox" id="gfw-sound-on" /> ① 按压音效
          </label>
          <div class="gfw-m-ctrl">
            <select id="gfw-sound-set">
              <option value="foxbell">星光铃音</option>
              <option value="duck">小黄鸭</option>
              <option value="pop">Q弹气泡</option>
            </select>
            <button type="button" class="gfw-btn-sm" id="gfw-test-press-snd">试听</button>
          </div>
        </div>`,
  `        <label class="cp-row">
          <span>按压音效</span>
          <input type="checkbox" id="gfw-sound-on" />
        </label>
        <div class="gfw-m-row">
          <span class="gfw-m-label">按压音色</span>
          <div class="gfw-m-ctrl">
            <select id="gfw-sound-set">
              <option value="foxbell">星光铃音</option>
              <option value="duck">小黄鸭</option>
              <option value="pop">Q弹气泡</option>
            </select>
            <button type="button" class="gfw-btn-sm" id="gfw-test-press-snd">试听</button>
          </div>
        </div>`,
  'widget press sound layout',
);

widget = mustReplace(
  widget,
  `        <div class="gfw-m-row">
          <label style="display:flex;align-items:center;gap:4px;font-weight:600;">
            <input type="checkbox" id="gfw-turn-alert-on" /> ② 实时消耗冒泡
          </label>
          <div class="gfw-m-ctrl">
            <select id="gfw-turn-sound-set">
              <option value="exp_orb">经验球叮咚</option>
              <option value="chime_a">清脆铃音 A</option>
              <option value="mute">静音仅冒泡</option>
            </select>
            <button type="button" class="gfw-btn-sm" id="gfw-test-turn-snd">试听</button>
          </div>
        </div>`,
  `        <label class="cp-row">
          <span>互动 / 计时 / DSH 完成提示</span>
          <input type="checkbox" id="gfw-turn-alert-on" />
        </label>
        <div class="gfw-m-row">
          <span class="gfw-m-label">提示音色</span>
          <div class="gfw-m-ctrl">
            <select id="gfw-turn-sound-set">
              <option value="exp_orb">经验球叮咚</option>
              <option value="chime_a">清脆铃音 A</option>
              <option value="chord">和弦音</option>
              <option value="mute">静音仅冒泡</option>
            </select>
            <button type="button" class="gfw-btn-sm" id="gfw-test-turn-snd">试听</button>
          </div>
        </div>`,
  'widget turn alert sound layout',
);

widget = mustReplace(
  widget,
  `      const notes = tSet === "exp_orb" ? [783.99, 987.77, 1174.66, 1567.98] : [659.25, 880, 1318.51];
      notes.forEach((freq, idx) => {
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.type = tSet === "exp_orb" ? "sine" : "triangle";
        osc.frequency.setValueAtTime(freq, t0 + idx * 0.055);
        gain.gain.setValueAtTime(0.001, t0 + idx * 0.055);
        gain.gain.linearRampToValueAtTime(vol * 0.25, t0 + idx * 0.055 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.055 + 0.22);
        osc.connect(gain);
        gain.connect(actx.destination);
        osc.start(t0 + idx * 0.055);
        osc.stop(t0 + idx * 0.055 + 0.23);
      });`,
  `      const isChord = tSet === "chord";
      const notes = isChord
        ? [523.25, 659.25, 783.99, 987.77]
        : (tSet === "exp_orb" ? [783.99, 987.77, 1174.66, 1567.98] : [659.25, 880, 1318.51]);
      const step = isChord ? 0.018 : 0.055;
      const dur = isChord ? 0.45 : 0.22;
      const amp = isChord ? 0.16 : 0.25;
      notes.forEach((freq, idx) => {
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.type = (tSet === "exp_orb" || isChord) ? "sine" : "triangle";
        osc.frequency.setValueAtTime(freq, t0 + idx * step);
        gain.gain.setValueAtTime(0.001, t0 + idx * step);
        gain.gain.linearRampToValueAtTime(vol * amp, t0 + idx * step + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * step + dur);
        osc.connect(gain);
        gain.connect(actx.destination);
        osc.start(t0 + idx * step);
        osc.stop(t0 + idx * step + dur + 0.02);
      });`,
  'widget playSynthSound chord',
);

// 3) 气泡改成「DSH 余额 / Gemini 额度」二选一（点标题右边的「切换」换视图），
//    window.__gfwQuotaView 是当前视图，进 renderKey 让切换立刻重绘。
widget = mustReplace(
  widget,
  "      const headerText = {fresh:'剩余额度 · 官方', stale:'额度 · 已过期', waiting:'额度 · 等待同步'}[m.status];\n",
  "      const quotaView = window.__gfwQuotaView === 'quota' ? 'quota' : 'balance';\n" +
    "      const dshBal = (window.__gfwDshBalance && window.__gfwDshBalance.ok) ? window.__gfwDshBalance : null;\n" +
    "      const balSym = dshBal && String(dshBal.currency || 'CNY').toUpperCase() === 'USD' ? '$' : '¥';\n" +
    "      const valBalance = dshBal && Number.isFinite(Number(dshBal.totalBalance))\n" +
    "        ? balSym + Number(dshBal.totalBalance).toFixed(2)\n" +
    "        : (window.__gfwDshBalance && window.__gfwDshBalance.ok === false ? '读不到' : '—');\n" +
    "      const hasBreakdown = dshBal && (dshBal.rechargeBalance != null || dshBal.bonusBalance != null);\n" +
    "      const warnBalLim = Number(window.__gfwDshWarnBalThreshold);\n" +
    "      const isWarnBal = !!(dshBal && Number.isFinite(warnBalLim) && warnBalLim > 0 && Number.isFinite(Number(dshBal.totalBalance)) && Number(dshBal.totalBalance) <= warnBalLim);\n" +
    "      const lastCostObj = (window.__gfwShowTurnCost !== false && window.__gfwLastTurnCost && Number(window.__gfwLastTurnCost.amount) > 0) ? window.__gfwLastTurnCost : null;\n" +
    "      const lastCostAmt = lastCostObj ? Number(lastCostObj.amount) : 0;\n" +
    "      const lastCostChip = lastCostObj ? ('<span class=\"gfw-bal-chip\">上轮 -¥' + (lastCostAmt < 0.01 ? lastCostAmt.toFixed(4) : lastCostAmt.toFixed(3).replace(/0$/, '')) + '</span>') : '';\n" +
    "      const balanceChipsHtml = (dshBal\n" +
    "        ? (hasBreakdown\n" +
    "            ? '<span class=\"gfw-bal-chip\">充值 ' + balSym + Number(dshBal.rechargeBalance || 0).toFixed(2) + '</span><span class=\"gfw-bal-chip\">赠金 ' + balSym + Number(dshBal.bonusBalance || 0).toFixed(2) + '</span>'\n" +
    "            : '<span class=\"gfw-bal-chip\">' + (dshBal.source === 'apikey' ? 'API Key 余额' : 'DSH 账号余额') + '</span>')\n" +
    "        : '<span class=\"gfw-bal-chip\">余额读取中…</span>') + lastCostChip;\n" +
    "      const headerText = quotaView === 'quota'\n" +
    "        ? {fresh:(window.__gfwOfficialQuota && window.__gfwOfficialQuota.source === 'agy-link' ? 'Gemini 额度 · 实时' : (window.__gfwOfficialQuota && window.__gfwOfficialQuota.source === 'dsh-manual' ? '手动额度 · 剩余' : '官方额度 · 剩余')), stale:'额度 · 已过期', waiting:'Gemini 未填写'}[m.status]\n" +
    "        : (dshBal ? 'DSH 余额 · 实时' : ((window.__gfwDshBalance && window.__gfwDshBalance.ok === false) ? 'DSH 余额 · 读取失败' : 'DSH 余额 · 等待同步'));\n",
  'bubble view + balance values',
);

widget = mustReplace(
  widget,
  '      .gfw-quote-box {\n' +
  '        width: 100%;\n' +
  '        height: 100%;\n' +
  '        display: flex;\n' +
  '        align-items: center;\n' +
  '        justify-content: center;\n' +
  '        padding: calc(var(--gfw-u) * 6);\n' +
  '        box-sizing: border-box;\n' +
  '      }\n' +
  '      .gfw-wrap-quote {\n' +
  '        font-size: calc(var(--gfw-u) * 54);\n' +
  '        font-weight: 800;\n' +
  '        line-height: 1.42;\n' +
  '        text-align: center;\n' +
  '        max-width: 100%;\n' +
  '        white-space: pre-line;\n' +
  '        word-break: break-word;\n' +
  '        overflow-wrap: anywhere;\n' +
  '      }',
  '      .gfw-text:has(.gfw-quote-box), .gfw-text.gfw-text-quote {\n' +
  '        left: 44.6% !important;\n' +
  '        width: 78% !important;\n' +
  '        height: 68% !important;\n' +
  '        top: 37.5% !important;\n' +
  '      }\n' +
  '      .gfw-quote-box {\n' +
  '        width: 100%;\n' +
  '        height: 100%;\n' +
  '        display: flex;\n' +
  '        align-items: center;\n' +
  '        justify-content: center;\n' +
  '        padding: 0;\n' +
  '        box-sizing: border-box;\n' +
  '      }\n' +
  '      .gfw-wrap-quote {\n' +
  '        font-size: calc(var(--gfw-u) * 56);\n' +
  '        font-weight: 750;\n' +
  '        line-height: 1.34;\n' +
  '        text-align: center;\n' +
  '        max-width: 100%;\n' +
  '        white-space: pre-line;\n' +
  '        word-break: break-word;\n' +
  '        overflow-wrap: break-word;\n' +
  '        text-wrap: balance;\n' +
  '        letter-spacing: 0.5px;\n' +
  '      }',
  'quote bubble styles',
);

const DIALOGUE_HELPERS = `
    function visualLen(str) {
      let len = 0;
      for (let i = 0; i < str.length; i++) {
        len += str.charCodeAt(i) > 255 ? 1 : 0.55;
      }
      return len;
    }

    function splitLongPhrase(str) {
      if (visualLen(str) <= 11.5) return [str];

      const puncts = ['，', '、', '：', '；'];
      let bestPunct = -1;
      let bestDiff = 999;
      const mid = str.length / 2;
      for (let i = 0; i < puncts.length; i++) {
        const p = puncts[i];
        let idx = str.indexOf(p);
        while (idx !== -1) {
          if (idx >= 3 && idx <= str.length - 4) {
            const diff = Math.abs(idx + 1 - mid);
            if (diff < bestDiff) {
              bestDiff = diff;
              bestPunct = idx + 1;
            }
          }
          idx = str.indexOf(p, idx + 1);
        }
      }
      if (bestPunct !== -1) {
        return [str.slice(0, bestPunct).trim(), str.slice(bestPunct).trim()];
      }

      if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        try {
          const seg = new Intl.Segmenter('zh', { granularity: 'word' });
          const words = Array.from(seg.segment(str)).map(function(x){ return x.segment; });
          let bestIdx = -1;
          let minDiff = 999;
          let acc = 0;
          for (let i = 0; i < words.length - 1; i++) {
            acc += words[i].length;
            if (acc >= 3 && str.length - acc >= 3) {
              const d = Math.abs(acc - mid);
              if (d < minDiff) {
                minDiff = d;
                bestIdx = acc;
              }
            }
          }
          if (bestIdx > 0) {
            return [str.slice(0, bestIdx).trim(), str.slice(bestIdx).trim()];
          }
        } catch (e) {}
      }

      let cut = Math.round(str.length / 2);
      return [str.slice(0, cut).trim(), str.slice(cut).trim()];
    }

    function formatDialogueQuote(raw) {
      if (!raw || typeof raw !== 'string') return '';
      const lines = raw.split(/\\r?\\n/).map(function(s){ return s.trim(); }).filter(Boolean);
      if (!lines.length) return '';

      if (lines.length >= 3) {
        const out = [];
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          if (visualLen(l) > 11.5) out.push.apply(out, splitLongPhrase(l));
          else out.push(l);
        }
        return out.join('\\n');
      }

      if (lines.length === 1) {
        const l = lines[0];
        if (visualLen(l) <= 11.5) return l;
        const parts = splitLongPhrase(l);
        if (parts.length === 2 && (visualLen(parts[0]) > 11.5 || visualLen(parts[1]) > 11.5)) {
          const sub = visualLen(parts[1]) > 11.5 ? splitLongPhrase(parts[1]) : [parts[1]];
          return [parts[0]].concat(sub).join('\\n');
        }
        return parts.join('\\n');
      }

      const l1 = lines[0];
      const l2 = lines[1];
      const l1Long = visualLen(l1) > 11.5;
      const l2Long = visualLen(l2) > 11.5;

      if (l1Long && !l2Long) {
        return splitLongPhrase(l1).concat([l2]).join('\\n');
      }
      if (!l1Long && l2Long) {
        return [l1].concat(splitLongPhrase(l2)).join('\\n');
      }
      if (l1Long && l2Long) {
        if (l1.indexOf('，') !== -1 || l1.indexOf('：') !== -1) {
          return splitLongPhrase(l1).concat([l2]).join('\\n');
        }
        return [l1].concat(splitLongPhrase(l2)).join('\\n');
      }

      return lines.join('\\n');
    }

    function fitQuoteText() {
      const qEl = textEl.querySelector(".gfw-wrap-quote");
      if (!qEl) return;
      const lineEls = qEl.querySelectorAll(".gfw-q-line");
      const lines = lineEls.length
        ? Array.from(lineEls).map(function(el){ return (el.textContent || "").trim(); }).filter(Boolean)
        : (qEl.textContent || "").split("\\n").map(function(s){ return s.trim(); }).filter(Boolean);
      const count = lines.length;
      let maxLen = 0;
      for (let i = 0; i < lines.length; i++) {
        const vl = visualLen(lines[i]);
        if (vl > maxLen) maxLen = vl;
      }
      if (count <= 2) {
        if (maxLen <= 8) {
          qEl.style.fontSize = "calc(var(--gfw-u) * 60)";
          qEl.style.lineHeight = "1.38";
        } else {
          qEl.style.fontSize = "calc(var(--gfw-u) * 56)";
          qEl.style.lineHeight = "1.36";
        }
      } else if (count === 3) {
        if (maxLen <= 8) {
          qEl.style.fontSize = "calc(var(--gfw-u) * 58)";
          qEl.style.lineHeight = "1.34";
        } else {
          qEl.style.fontSize = "calc(var(--gfw-u) * 55)";
          qEl.style.lineHeight = "1.34";
        }
      } else {
        qEl.style.fontSize = "calc(var(--gfw-u) * 50)";
        qEl.style.lineHeight = "1.30";
      }
    }`;

widget = mustReplace(
  widget,
  '    function fitQuoteText() {\n' +
  '      const qEl = textEl.querySelector(".gfw-wrap-quote");\n' +
  '      if (!qEl) return;\n' +
  '      const len = (qEl.textContent || "").length;\n' +
  '      if (len > 42) {\n' +
  '        qEl.style.fontSize = "calc(var(--gfw-u) * 38)";\n' +
  '        qEl.style.lineHeight = "1.30";\n' +
  '      } else if (len > 24) {\n' +
  '        qEl.style.fontSize = "calc(var(--gfw-u) * 46)";\n' +
  '        qEl.style.lineHeight = "1.36";\n' +
  '      } else {\n' +
  '        qEl.style.fontSize = "calc(var(--gfw-u) * 54)";\n' +
  '        qEl.style.lineHeight = "1.42";\n' +
  '      }\n' +
  '    }',
  DIALOGUE_HELPERS,
  'quote font scaling',
);

widget = mustReplace(
  widget,
  '    function renderCatgirlQuoteBubble(explicitText) {\n' +
  '      bubbleMode = "quote";\n' +
  '      const item = explicitText === undefined ? pickWeightedQuote() : { text: explicitText };\n' +
  '      lastRandomText = item.text;\n' +
  '      const box = document.createElement(\'div\');\n' +
  '      box.className = \'gfw-quote-box\';\n' +
  '      const line = document.createElement(\'div\');\n' +
  '      line.className = \'gfw-wrap-quote gfw-rainbow-txt\';\n' +
  '      line.textContent = item.text;\n' +
  '      box.appendChild(line);\n' +
  '      textEl.replaceChildren(box);\n' +
  '      fitQuoteText();\n' +
  '      textEl.style.opacity = \'1\';\n' +
  '    }',
  '    function renderCatgirlQuoteBubble(explicitText) {\n' +
  '      bubbleMode = "quote";\n' +
  '      textEl.classList.add("gfw-text-quote");\n' +
  '      const item = explicitText === undefined ? pickWeightedQuote() : { text: explicitText };\n' +
  '      lastRandomText = item.text;\n' +
  '      const box = document.createElement(\'div\');\n' +
  '      box.className = \'gfw-quote-box\';\n' +
  '      const line = document.createElement(\'div\');\n' +
  '      line.className = \'gfw-wrap-quote\';\n' +
  '      const formatted = formatDialogueQuote(item.text);\n' +
  '      const qLines = formatted.split(\'\\n\');\n' +
  '      for (let i = 0; i < qLines.length; i++) {\n' +
  '        const s = qLines[i];\n' +
  '        const row = document.createElement(\'div\');\n' +
  '        row.className = \'gfw-q-line gfw-rainbow-txt\';\n' +
  '        row.textContent = s;\n' +
  '        if (/[，。、：；！？]$/.test(s)) {\n' +
  '          row.style.paddingLeft = \'0.5em\';\n' +
  '        }\n' +
  '        line.appendChild(row);\n' +
  '      }\n' +
  '      box.appendChild(line);\n' +
  '      textEl.replaceChildren(box);\n' +
  '      fitQuoteText();\n' +
  '      textEl.style.opacity = \'1\';\n' +
  '    }',
  'render quote bubble class and format',
);

widget = mustReplace(
  widget,
  '      bubbleMode = "quota";\n      lastQuotaRenderKey = renderKey;',
  '      bubbleMode = "quota";\n      textEl.classList.remove("gfw-text-quote");\n      lastQuotaRenderKey = renderKey;',
  'render quota bubble class',
);

widget = mustReplace(
  widget,
  "        m.status, m.left5hPct, m.leftWeekPct, m.reset5hText, m.resetWeekText, m.isWarn5h, m.isWarnWeek\n",
  "        m.status, m.left5hPct, m.leftWeekPct, m.reset5hText, m.resetWeekText, m.isWarn5h, m.isWarnWeek,\n" +
    "        (window.__gfwQuotaView === 'quota' ? 'quota' : 'balance'),\n" +
    "        (window.__gfwDshBalance && window.__gfwDshBalance.ok) ? window.__gfwDshBalance.totalBalance : null,\n" +
    "        (window.__gfwDshBalance && window.__gfwDshBalance.ok) ? window.__gfwDshBalance.updatedAt : null,\n" +
    "        window.__gfwShowTurnCost !== false,\n" +
    "        window.__gfwLastTurnCost ? window.__gfwLastTurnCost.ts : null,\n" +
    "        Number(window.__gfwDshWarnBalThreshold) || 0\n",
  'bubble render key + balance',
);

// 视图切换放在面板设置里（气泡本身可点，放按钮会误触随机台词），所以气泡内不加控件。

// 余额块只在自己的视图里显示
widget = mustReplace(
  widget,
  '          <div class="gfw-min-block">\n            <div class="gfw-min-row">\n              <span class="gfw-min-label gfw-rainbow-txt">5 小时</span>\n',
  '          <div class="gfw-min-block gfw-bal-card" id="gfw-min-balance" style="${quotaView === \'balance\' ? \'\' : \'display:none\'}">\n' +
    '            <div class="gfw-bal-chips">${balanceChipsHtml}</div>\n' +
    '            <div class="gfw-bal-hero-wrap">\n' +
    '              <span class="gfw-bal-hero gfw-rainbow-num ${isWarnBal ? \'gfw-warn\' : \'\'}" id="gfw-val-balance">${valBalance}</span>\n' +
    '            </div>\n' +
    '          </div>\n' +
    '          <div class="gfw-min-block" style="${quotaView === \'quota\' ? \'\' : \'display:none\'}">\n' +
    '            <div class="gfw-min-row">\n' +
    '              <span class="gfw-min-label gfw-rainbow-txt">5 小时</span>\n',
  'bubble balance row + quota visibility (5h)',
);

widget = mustReplace(
  widget,
  '          <div class="gfw-min-block">\n            <div class="gfw-min-row">\n              <span class="gfw-min-label gfw-rainbow-txt">每周</span>\n',
  '          <div class="gfw-min-block" style="${quotaView === \'quota\' ? \'\' : \'display:none\'}">\n' +
    '            <div class="gfw-min-row">\n' +
    '              <span class="gfw-min-label gfw-rainbow-txt">每周</span>\n',
  'bubble quota visibility (weekly)',
);


// 4) Manual quota rows: one wrapper element so the DSH shim can move the whole
//    block into the companion panel's quota tab.
const MANUAL_ROWS = '';
widget = mustReplace(
  widget,
  '        <div class="gfw-m-row" style="display:none;">\n          <input type="password" id="gfw-api-key" />',
  MANUAL_ROWS + '        <div class="gfw-m-row" style="display:none;">\n          <input type="password" id="gfw-api-key" />',
  'manual quota rows',
);

// 5) 吸附状态（边角）在窗口大小变化（如最大化/还原）时始终吸附在边角
widget = mustReplace(
  widget,
  '    function settlePosition(withTransition = true) {\n' +
  '      applyScaleAndClasses();\n' +
  '      if (!withTransition) root.classList.add("gfw-dragging");\n' +
  '      const rect = root.getBoundingClientRect();\n' +
  '      const vw = window.innerWidth;\n' +
  '      const vh = window.innerHeight;\n' +
  '      const rightMargin = cfg.avoidScrollbar ? 18 : 6;\n' +
  '      const pad = 8;\n' +
  '\n' +
  '      let left = cfg.posLeft !== null ? cfg.posLeft : (vw - rect.width - rightMargin);\n' +
  '      let top = cfg.posTop !== null ? cfg.posTop : (vh - rect.height - pad);\n' +
  '\n' +
  '      if (cfg.snapMode === "quarter") {\n' +
  '        const cx = left + rect.width / 2;\n' +
  '        const cy = top + rect.height / 2;\n' +
  '\n' +
  '        if (cx < vw * 0.25) {\n' +
  '          left = pad;\n' +
  '          cfg.anchorH = "left";\n' +
  '        } else if (cx > vw * 0.75) {\n' +
  '          left = vw - rect.width - rightMargin;\n' +
  '          cfg.anchorH = "right";\n' +
  '        } else {\n' +
  '          cfg.anchorH = "none";\n' +
  '        }\n' +
  '\n' +
  '        if (cfg.snapTopOn && cy < vh * 0.25) {\n' +
  '          top = pad;\n' +
  '          cfg.anchorV = "top";\n' +
  '        } else if (cy > vh * 0.75) {\n' +
  '          top = vh - rect.height - pad;\n' +
  '          cfg.anchorV = "bottom";\n' +
  '        } else {\n' +
  '          cfg.anchorV = "none";\n' +
  '        }\n' +
  '      }\n' +
  '\n' +
  '      left = Math.max(pad, Math.min(vw - rect.width - rightMargin, left));\n' +
  '      top = Math.max(pad, Math.min(vh - rect.height - pad, top));\n' +
  '\n' +
  '      cfg.posLeft = Math.round(left);\n' +
  '      cfg.posTop = Math.round(top);\n' +
  '      root.style.left = cfg.posLeft + "px";\n' +
  '      root.style.top = cfg.posTop + "px";',
  '    function settlePosition(withTransition = true, isUserDrag = false) {\n' +
  '      applyScaleAndClasses();\n' +
  '      if (!withTransition) root.classList.add("gfw-dragging");\n' +
  '      const rect = root.getBoundingClientRect();\n' +
  '      const vw = window.innerWidth;\n' +
  '      const vh = window.innerHeight;\n' +
  '      const rightMargin = cfg.avoidScrollbar ? 18 : 6;\n' +
  '      const pad = 8;\n' +
  '\n' +
  '      let left = cfg.posLeft !== null ? cfg.posLeft : (vw - rect.width - rightMargin);\n' +
  '      let top = cfg.posTop !== null ? cfg.posTop : (vh - rect.height - pad);\n' +
  '\n' +
  '      if (isUserDrag) {\n' +
  '        const cx = left + rect.width / 2;\n' +
  '        const cy = top + rect.height / 2;\n' +
  '        if (cfg.snapMode === "quarter") {\n' +
  '          if (cx < vw * 0.25) {\n' +
  '            cfg.anchorH = "left";\n' +
  '          } else if (cx > vw * 0.75) {\n' +
  '            cfg.anchorH = "right";\n' +
  '          } else {\n' +
  '            cfg.anchorH = "none";\n' +
  '          }\n' +
  '          if (cfg.snapTopOn && cy < vh * 0.25) {\n' +
  '            cfg.anchorV = "top";\n' +
  '          } else if (cy > vh * 0.75) {\n' +
  '            cfg.anchorV = "bottom";\n' +
  '          } else {\n' +
  '            cfg.anchorV = "none";\n' +
  '          }\n' +
  '        } else {\n' +
  '          const distRight = vw - (left + rect.width);\n' +
  '          const distBottom = vh - (top + rect.height);\n' +
  '          if (left <= pad + 32) cfg.anchorH = "left";\n' +
  '          else if (distRight <= rightMargin + 32) cfg.anchorH = "right";\n' +
  '          else cfg.anchorH = "none";\n' +
  '          if (top <= pad + 32) cfg.anchorV = "top";\n' +
  '          else if (distBottom <= pad + 32) cfg.anchorV = "bottom";\n' +
  '          else cfg.anchorV = "none";\n' +
  '        }\n' +
  '      }\n' +
  '\n' +
  '      if (cfg.anchorH === "right") {\n' +
  '        left = vw - rect.width - rightMargin;\n' +
  '      } else if (cfg.anchorH === "left") {\n' +
  '        left = pad;\n' +
  '      }\n' +
  '      if (cfg.anchorV === "bottom") {\n' +
  '        top = vh - rect.height - pad;\n' +
  '      } else if (cfg.anchorV === "top") {\n' +
  '        top = pad;\n' +
  '      }\n' +
  '\n' +
  '      left = Math.max(pad, Math.min(vw - rect.width - rightMargin, left));\n' +
  '      top = Math.max(pad, Math.min(vh - rect.height - pad, top));\n' +
  '\n' +
  '      cfg.posLeft = Math.round(left);\n' +
  '      cfg.posTop = Math.round(top);\n' +
  '      root.style.left = cfg.posLeft + "px";\n' +
  '      root.style.top = cfg.posTop + "px";',
  'corner snap preserve on resize',
);

widget = mustReplace(
  widget,
  '      if (wasMoved) {\n        settlePosition(true);\n      } else if (!wasMenuOpened) {',
  '      if (wasMoved) {\n        settlePosition(true, true);\n      } else if (!wasMenuOpened) {',
  'endPointer drag flag',
);

widget = mustReplace(
  widget,
  '      if (dragState?.moved) settlePosition(true);',
  '      if (dragState?.moved) settlePosition(true, true);',
  'pointercancel drag flag',
);

widget = mustReplace(
  widget,
  '    window.GeminiFoxWidget = {\n      openQuotaBubble: () => { renderQuotaBubble(); openBubble(); },',
  '    window.GeminiFoxWidget = {\n' +
  '      openQuotaBubble: () => { renderQuotaBubble(); openBubble(); },\n' +
  '      showQuote: (text, autoCloseMs) => { renderCatgirlQuoteBubble(text); openBubble(autoCloseMs); },',
  'expose showQuote on GeminiFoxWidget',
);

widget = mustReplace(
  widget,
  '      showQuote: (text, autoCloseMs) => { renderCatgirlQuoteBubble(text); openBubble(autoCloseMs); },\n      showQuota:',
  '      showQuote: (text, autoCloseMs) => { renderCatgirlQuoteBubble(text); openBubble(autoCloseMs); },\n' +
  '      showBubbleHtml: (html, autoCloseMs) => { bubbleMode = "turnEnd"; lastQuotaRenderKey = ""; textEl.classList.remove("gfw-text-quote"); __gfwDOM.setHTML(textEl, html); openBubble(autoCloseMs); },\n' +
  '      showQuota:',
  'expose showBubbleHtml to companion',
);

widget = mustReplace(
  widget,
  '      const mw = menu.getBoundingClientRect().width || Math.min(448, window.innerWidth - 24);',
  '      const mw = menu.offsetWidth || Math.min(448, window.innerWidth - 24);',
  'positionMenu ignore scale animation',
);

widget = mustReplace(
  widget,
  '      const mh = Math.min(menu.offsetHeight || 520, window.innerHeight - 24);\n' +
  '      let left = r.right - mw;\n' +
  '      if (root.classList.contains("gfw-left")) {\n' +
  '        left = r.left;\n' +
  '      }\n' +
  '      left = Math.max(10, Math.min(window.innerWidth - mw - 10, left));\n' +
  '      let top = r.top - mh - 10;\n' +
  '      if (top < 10) {\n' +
  '        top = Math.min(window.innerHeight - mh - 10, r.bottom + 10);\n' +
  '        if (r.bottom + mh + 12 > window.innerHeight) {\n' +
  '          if (r.left >= mw + 24) left = r.left - mw - 16;\n' +
  '          else if (window.innerWidth - r.right >= mw + 24) left = r.right + 16;\n' +
  '          top = window.innerHeight - mh - 12;\n' +
  '        }\n' +
  '      }\n' +
  '      menu.style.left = Math.round(Math.max(12, Math.min(window.innerWidth - mw - 12, left))) + "px";\n' +
  '      menu.style.top = Math.round(Math.max(12, Math.min(window.innerHeight - mh - 12, top))) + "px";\n' +
  '    }',
  '      const mh = Math.min(menu.offsetHeight || 520, window.innerHeight - 24);\n' +
  '      if (Number.isFinite(sessionMenuLeft) && Number.isFinite(sessionMenuTop)) {\n' +
  '        menu.style.left = Math.round(Math.max(12, Math.min(window.innerWidth - mw - 12, sessionMenuLeft))) + "px";\n' +
  '        menu.style.top = Math.round(Math.max(12, Math.min(window.innerHeight - mh - 12, sessionMenuTop))) + "px";\n' +
  '        return;\n' +
  '      }\n' +
  '      let left = r.right - mw;\n' +
  '      if (root.classList.contains("gfw-left")) {\n' +
  '        left = r.left;\n' +
  '      }\n' +
  '      left = Math.max(10, Math.min(window.innerWidth - mw - 10, left));\n' +
  '      let top = r.top - mh - 10;\n' +
  '      if (top < 10) {\n' +
  '        top = Math.min(window.innerHeight - mh - 10, r.bottom + 10);\n' +
  '        if (r.bottom + mh + 12 > window.innerHeight) {\n' +
  '          if (r.left >= mw + 24) left = r.left - mw - 16;\n' +
  '          else if (window.innerWidth - r.right >= mw + 24) left = r.right + 16;\n' +
  '          top = Math.round(Math.max(16, (window.innerHeight - mh) * 0.25));\n' +
  '        }\n' +
  '      }\n' +
  '      menu.style.left = Math.round(Math.max(12, Math.min(window.innerWidth - mw - 12, left))) + "px";\n' +
  '      menu.style.top = Math.round(Math.max(12, Math.min(window.innerHeight - mh - 12, top))) + "px";\n' +
  '    }\n' +
  '\n' +
  '    let sessionMenuLeft = null, sessionMenuTop = null;\n' +
  '    let menuDrag = null;\n' +
  '    menu.addEventListener("pointerdown", (e) => {\n' +
  '      if (e.button !== 0) return;\n' +
  '      if (!e.target.closest(".cp-head, .gfw-m-hdr")) return;\n' +
  '      if (e.target.closest("button, a, input, select, textarea")) return;\n' +
  '      const rect = menu.getBoundingClientRect();\n' +
  '      menuDrag = { startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top, moved: false };\n' +
  '      menu.classList.add("gfw-menu-dragging");\n' +
  '      e.preventDefault();\n' +
  '    });\n' +
  '    window.addEventListener("pointermove", (e) => {\n' +
  '      if (!menuDrag) return;\n' +
  '      const dx = e.clientX - menuDrag.startX;\n' +
  '      const dy = e.clientY - menuDrag.startY;\n' +
  '      if (!menuDrag.moved && Math.hypot(dx, dy) < 3) return;\n' +
  '      menuDrag.moved = true;\n' +
  '      const mw = menu.offsetWidth || 448;\n' +
  '      const mh = Math.min(menu.offsetHeight || 520, window.innerHeight - 16);\n' +
  '      const left = Math.round(Math.max(8, Math.min(window.innerWidth - mw - 8, menuDrag.origLeft + dx)));\n' +
  '      const top = Math.round(Math.max(8, Math.min(window.innerHeight - mh - 8, menuDrag.origTop + dy)));\n' +
  '      menu.style.left = left + "px";\n' +
  '      menu.style.top = top + "px";\n' +
  '      sessionMenuLeft = left;\n' +
  '      sessionMenuTop = top;\n' +
  '    });\n' +
  '    const endMenuDrag = () => {\n' +
  '      if (!menuDrag) return;\n' +
  '      menuDrag = null;\n' +
  '      menu.classList.remove("gfw-menu-dragging");\n' +
  '    };\n' +
  '    window.addEventListener("pointerup", endMenuDrag);\n' +
  '    window.addEventListener("pointercancel", endMenuDrag);\n' +
  '    menu.addEventListener("dblclick", (e) => {\n' +
  '      if (!e.target.closest(".cp-head, .gfw-m-hdr")) return;\n' +
  '      if (e.target.closest("button, a, input, select, textarea")) return;\n' +
  '      sessionMenuLeft = null;\n' +
  '      sessionMenuTop = null;\n' +
  '      positionMenu();\n' +
  '    });',
  'menu default position & drag',
);

widget = mustReplace(
  widget,
  'resetPosition: () => { cfg.posLeft = null; cfg.posTop = null; settlePosition(false); }',
  'resetPosition: () => { cfg.posLeft = null; cfg.posTop = null; cfg.menuLeft = null; cfg.menuTop = null; cfg.anchorH = "right"; cfg.anchorV = "bottom"; settlePosition(false); if (menu.classList.contains("gfw-show")) positionMenu(); }',
  'resetPosition anchors',
);

widget = mustReplace(
  widget,
  '      snapToLeft: () => {\n' +
  '        cfg.posLeft = 12;\n' +
  '        cfg.posTop = window.innerHeight - root.getBoundingClientRect().height - 16;\n' +
  '        settlePosition(true);',
  '      snapToLeft: () => {\n' +
  '        cfg.anchorH = "left";\n' +
  '        cfg.anchorV = "bottom";\n' +
  '        cfg.posLeft = 12;\n' +
  '        cfg.posTop = window.innerHeight - root.getBoundingClientRect().height - 16;\n' +
  '        settlePosition(true);',
  'snapToLeft anchors',
);

widget = mustReplace(
  widget,
  '      snapToRight: () => {\n' +
  '        const r = root.getBoundingClientRect();\n' +
  '        cfg.posLeft = window.innerWidth - r.width - 20;\n' +
  '        cfg.posTop = window.innerHeight - r.height - 16;\n' +
  '        settlePosition(true);',
  '      snapToRight: () => {\n' +
  '        cfg.anchorH = "right";\n' +
  '        cfg.anchorV = "bottom";\n' +
  '        const r = root.getBoundingClientRect();\n' +
  '        cfg.posLeft = window.innerWidth - r.width - 20;\n' +
  '        cfg.posTop = window.innerHeight - r.height - 16;\n' +
  '        settlePosition(true);',
  'snapToRight anchors',
);

widget = mustReplace(
  widget,
  '    setInterval(() => {\n' +
  '      scanPageStatusbar();\n' +
  '      if (bubbleMode === "quota" && bubbleEl.classList.contains("gfw-open")) {\n' +
  '        renderQuotaBubble();\n' +
  '      }\n' +
  '      if (typeof window.__gfwOnStateChange === "function") {\n' +
  '        window.__gfwOnStateChange(getQuotaMetrics(), ledger, cfg);\n' +
  '      }\n' +
  '    }, 1000);',
  '    setInterval(() => {\n' +
  '      if (document.hidden) return;\n' +
  '      if (bubbleMode === "quota" && bubbleEl.classList.contains("gfw-open")) {\n' +
  '        renderQuotaBubble();\n' +
  '      }\n' +
  '      if (typeof window.__gfwOnStateChange === "function") {\n' +
  '        window.__gfwOnStateChange(getQuotaMetrics(), ledger, cfg);\n' +
  '      }\n' +
  '    }, 1000);',
  'widget idle interval throttle',
);

widget = mustReplace(
  widget,
  '    warnThresholdPct: 20,',
  '    warnThresholdPct: 20,\n    warnThresholdWeekPct: 20,',
  'widget default weekly warn threshold',
);

widget = mustReplace(
  widget,
  '    const warning = Math.max(1, Math.min(90, Number(cfg.warnThresholdPct) || 20));\n' +
  '    const resetLabel = entry => {\n' +
  '      const text = typeof entry?.resetText === \'string\' ? entry.resetText.trim() : \'\';\n' +
  '      return text ? \'重置：\' + text : \'重置时间待同步\';\n' +
  '    };\n' +
  '    return {\n' +
  '      left5hPct: valid ? fiveHour : null,\n' +
  '      leftWeekPct: valid ? week : null,\n' +
  '      reset5hText: resetLabel(valid ? sample.fiveHour : null),\n' +
  '      resetWeekText: resetLabel(valid ? sample.week : null),\n' +
  '      isWarn5h: valid && fiveHour <= warning,\n' +
  '      isWarnWeek: valid && week <= warning,',
  '    const warning5h = Math.max(1, Math.min(90, Number(cfg.warnThresholdPct) || 20));\n' +
  '    const warningWeek = Math.max(1, Math.min(90, Number(cfg.warnThresholdWeekPct ?? cfg.warnThresholdPct) || 20));\n' +
  '    const resetLabel = entry => {\n' +
  '      const text = typeof entry?.resetText === \'string\' ? entry.resetText.trim() : \'\';\n' +
  '      return text ? \'重置：\' + text : \'重置时间待同步\';\n' +
  '    };\n' +
  '    return {\n' +
  '      left5hPct: valid ? fiveHour : null,\n' +
  '      leftWeekPct: valid ? week : null,\n' +
  '      reset5hText: resetLabel(valid ? sample.fiveHour : null),\n' +
  '      resetWeekText: resetLabel(valid ? sample.week : null),\n' +
  '      isWarn5h: valid && fiveHour <= warning5h,\n' +
  '      isWarnWeek: valid && week <= warningWeek,',
  'widget split 5h and week warning thresholds',
);

widget = mustReplace(
  widget,
  '        <div class="gfw-m-row">\n' +
  '          <span class="gfw-m-label">预警阈值(%)</span>\n' +
  '          <div class="gfw-m-ctrl">\n' +
  '            <input type="number" id="gfw-warn-pct" min="1" max="90" style="width:60px;" />\n' +
  '          </div>\n' +
  '        </div>',
  '        <div class="gfw-m-row">\n' +
  '          <span class="gfw-m-label">Gemini 5h 预警 (%)</span>\n' +
  '          <div class="gfw-m-ctrl">\n' +
  '            <input type="number" id="gfw-warn-pct" min="1" max="90" style="width:72px;" />\n' +
  '          </div>\n' +
  '        </div>\n' +
  '        <div class="gfw-m-row">\n' +
  '          <span class="gfw-m-label">Gemini 周预警 (%)</span>\n' +
  '          <div class="gfw-m-ctrl">\n' +
  '            <input type="number" id="gfw-warn-week-pct" min="1" max="90" style="width:72px;" />\n' +
  '          </div>\n' +
  '        </div>',
  'widget warn threshold rows split',
);

widget = mustReplace(
  widget,
  '      document.getElementById("gfw-warn-pct").value = cfg.warnThresholdPct;',
  '      document.getElementById("gfw-warn-pct").value = cfg.warnThresholdPct;\n' +
  '      const wkWarnIn = document.getElementById("gfw-warn-week-pct");\n' +
  '      if (wkWarnIn) wkWarnIn.value = cfg.warnThresholdWeekPct ?? cfg.warnThresholdPct;',
  'widget sync weekly warn threshold',
);

widget = mustReplace(
  widget,
  '    document.getElementById("gfw-warn-pct").addEventListener("change", (e) => {\n' +
  '      cfg.warnThresholdPct = Math.max(1, Math.min(90, parseInt(e.target.value, 10) || 20));\n' +
  '      saveStorage(STORAGE_KEY_CFG, cfg);\n' +
  '      if (bubbleMode === "quota") renderQuotaBubble();\n' +
  '    });',
  '    document.getElementById("gfw-warn-pct").addEventListener("change", (e) => {\n' +
  '      cfg.warnThresholdPct = Math.max(1, Math.min(90, parseInt(e.target.value, 10) || 20));\n' +
  '      saveStorage(STORAGE_KEY_CFG, cfg);\n' +
  '      if (bubbleMode === "quota") renderQuotaBubble();\n' +
  '    });\n' +
  '    const wkWarnEl = document.getElementById("gfw-warn-week-pct");\n' +
  '    if (wkWarnEl) wkWarnEl.addEventListener("change", (e) => {\n' +
  '      cfg.warnThresholdWeekPct = Math.max(1, Math.min(90, parseInt(e.target.value, 10) || 20));\n' +
  '      saveStorage(STORAGE_KEY_CFG, cfg);\n' +
  '      if (bubbleMode === "quota") renderQuotaBubble();\n' +
  '    });',
  'widget weekly warn change listener',
);

// ---------------------------------------------------------------- companion
let companionSrc = fs.readFileSync(path.join(SRC, 'companion.mjs'), 'utf8');
companionSrc = mustReplace(
  companionSrc,
  "console.info('[GFW_OFFICIAL_REFRESH]')",
  "(window.__gfwRequestRefresh || function () { console.info('[GFW_OFFICIAL_REFRESH]') })()",
  'companion refresh hook',
);

// 声音标签页只有单个简短卡片，直接固定菜单外框高度，由 flex 自动分配内容区并把底栏钉在底部，避免硬编码像素差导致底栏被裁
companionSrc = mustReplace(
  companionSrc,
  "import css from './companion.css';",
  "import cssRaw from './companion.css';\n" +
  "const css = cssRaw + `\n" +
  "#gfw-menu.gfw-companion-menu { height: min(780px, calc(100vh - 24px)); }\n" +
  "#gfw-menu .cp-head { cursor: grab; user-select: none; touch-action: none; }\n" +
  "#gfw-menu.gfw-menu-dragging .cp-head { cursor: grabbing; }\n" +
  "#gfw-menu.gfw-menu-dragging { animation: none !important; transition: none !important; }\n" +
  "#gfw-menu .cp-content { min-height: 0; max-height: none; }\n" +
  "#gfw-panel-audio { min-height: 100%; box-sizing: border-box; }\n" +
  ".cp-dock-custom-ctrl { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; }\n" +
  "#gfw-companion-dock.cp-dock-editable { outline: 1.5px dashed var(--cp-accent); outline-offset: 2px; cursor: grab; }\n" +
  "#gfw-companion-dock.cp-dock-editable.cp-dock-dragging { cursor: grabbing; }\n" +
  "#gfw-bond-stage { display: inline-block; margin-left: 6px; padding: 1px 7px; border-radius: 999px; background: var(--cp-card); border: 1px solid var(--cp-border); color: var(--cp-accent); font-size: 10px; font-weight: 600; vertical-align: middle; }\n" +
  "#gfw-menu #gfw-bond-milestones { font-size: 10px; color: var(--cp-muted, var(--cp-text)); margin-top: 3px; }\n" +
  ".cp-quota-badge { position: absolute; left: 4%; top: 8%; z-index: 4; padding: 1px 6px; border-radius: 999px; background: #fff1f2; border: 1px solid #fda4af; color: #be123c; font-size: 11px; font-weight: 700; box-shadow: 0 2px 6px rgba(190,18,60,.18); pointer-events: none; }\n" +
  ".gfw-root.cp-ghost-hover.cp-ghost-active #gfw-img { opacity: .35 !important; transition: opacity .15s ease; }\n" +
  "@keyframes cpPetNod { 0%,100%{transform:rotate(0) scale(1)} 30%{transform:rotate(-4deg) scale(1.03,.97)} 65%{transform:rotate(4deg) scale(1.02,.98)} }\n" +
  "@keyframes cpFeedHop { 0%,100%{transform:translateY(0) scale(1)} 35%{transform:translateY(-8px) scale(.98,1.04)} 70%{transform:translateY(-3px) scale(1.02,.98)} }\n" +
  ".gfw-root.cp-react-pet .gfw-img-wrap { animation: cpPetNod .58s ease-in-out; }\n" +
  ".gfw-root.cp-react-feed .gfw-img-wrap { animation: cpFeedHop .62s cubic-bezier(.22,1,.36,1); }\n" +
  ".gfw-root.cp-reduced-motion .gfw-img-wrap { animation: none !important; }\n" +
  ".cp-slot-row { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }\n" +
  ".cp-slot-row .cp-button { flex: 1; min-width: 78px; }\n" +
  "body.gfw-lite-mode .gfw-img-wrap, body.gfw-lite-mode .gfw-img-wrap:hover, body.gfw-lite-mode .gfw-bubble { filter: none !important; }\n" +
  "body.gfw-lite-mode .gfw-rainbow-txt, body.gfw-lite-mode .gfw-rainbow-num { animation: none !important; }\n" +
  "body.gfw-lite-mode .gfw-menu { backdrop-filter: none !important; }\n" +
  "#gfw-roll-target:has(#gfw-min-balance:not([style*=\"display:none\"])) { padding-top: calc(var(--gfw-u) * 26); }\n" +
  "#gfw-roll-target:has(#gfw-min-balance:not([style*=\"display:none\"])) .gfw-min-hdr { font-size: calc(var(--gfw-u) * 58); line-height: 1.2; margin-bottom: calc(var(--gfw-u) * 4); }\n" +
  ".gfw-bal-card { align-items: center; text-align: center; gap: calc(var(--gfw-u) * 14); }\n" +
  ".gfw-bal-hero-wrap { display: flex; flex-direction: column; align-items: center; gap: calc(var(--gfw-u) * 3); }\n" +
  ".gfw-bal-tag { font-size: calc(var(--gfw-u) * 36); font-weight: 700; opacity: .88; letter-spacing: .04em; }\n" +
  ".gfw-bal-hero { font-size: calc(var(--gfw-u) * 88); font-weight: 900; line-height: 1.05; letter-spacing: -.03em; }\n" +
  ".gfw-bal-chips { display: flex; align-items: center; justify-content: center; gap: calc(var(--gfw-u) * 8); flex-wrap: nowrap; max-width: 100%; }\n" +
  ".gfw-bal-chip { font-size: calc(var(--gfw-u) * 36); font-weight: 650; color: #5b4b8a; background: rgba(124,58,237,.08); border: 1px solid rgba(124,58,237,.18); border-radius: 999px; padding: calc(var(--gfw-u) * 5) calc(var(--gfw-u) * 14); white-space: nowrap; }\n" +
  ".gfw-turn-card { width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: calc(var(--gfw-u) * 16); text-align: center; }\n" +
  ".gfw-turn-hdr { font-size: calc(var(--gfw-u) * 52); font-weight: 700; color: #645696; line-height: 1.15; letter-spacing: .06em; }\n" +
  ".gfw-turn-cost { font-size: calc(var(--gfw-u) * 68); font-weight: 900; line-height: 1.08; letter-spacing: -.02em; white-space: nowrap; }\n" +
  ".gfw-turn-chip { font-size: calc(var(--gfw-u) * 44); font-weight: 700; color: #5b4b8a; background: rgba(124,58,237,.1); border: 1px solid rgba(124,58,237,.22); border-radius: 999px; padding: calc(var(--gfw-u) * 7) calc(var(--gfw-u) * 22); white-space: nowrap; }\n" +
  ".gfw-turn-5h-block { width: 128%; display: flex; flex-direction: column; gap: calc(var(--gfw-u) * 10); }\n" +
  ".gfw-turn-5h-row { display: flex; align-items: baseline; justify-content: space-between; width: 100%; }\n" +
  ".gfw-turn-5h-label { font-size: calc(var(--gfw-u) * 44); font-weight: 750; line-height: 1.15; white-space: nowrap; }\n" +
  ".gfw-turn-5h-pct { font-size: calc(var(--gfw-u) * 54); font-weight: 900; line-height: 1.05; letter-spacing: -.02em; white-space: nowrap; }\n" +
  ".gfw-turn-5h-track { width: 100%; height: calc(var(--gfw-u) * 13); background: #ede9fe; border-radius: 999px; overflow: hidden; }\n" +
  ".gfw-turn-reset { max-width: 100%; font-size: calc(var(--gfw-u) * 50); font-weight: 700; text-align: center; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n" +
  "#gfw-menu .cp-card h3 { display: block; width: fit-content; font-size: 14px; font-weight: 750; margin: 0 0 10px; background: linear-gradient(90deg, #2563eb 0%, #7c3aed 32%, #ec4899 66%, #d97706 100%); background-size: 200% auto; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; animation: gfwRainbowShift 6s ease infinite; }\n" +
  "#gfw-menu .cp-card h3 > label { font: inherit; color: inherit; -webkit-text-fill-color: inherit; cursor: pointer; }\n" +
  "#gfw-menu .cp-section-head h3 { margin: 4px 0 0; }\n" +
  "#gfw-menu .cp-bond-card .cp-progress { margin: 8px 0; }\n" +
  "body.gfw-lite-mode #gfw-menu .cp-card h3 { animation: none !important; }\n" +
  "#gfw-menu .cp-row > span, #gfw-menu .gfw-m-label { font-size: 13px; font-weight: 600; color: var(--cp-text); }\n" +
  "#gfw-menu .cp-row small { font-weight: 400; }\n" +
  "#gfw-menu .cp-btnrow { gap: 6px; }\n" +
  "#gfw-menu .cp-button { min-width: 68px; min-height: 32px; padding: 6px 10px; border-radius: 9px; font-size: 12px; white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; }\n" +
  "#gfw-menu .gfw-btn-sm { min-height: 30px; padding: 5px 10px; border-radius: 8px; font-size: 12px; white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; }\n" +
  "#gfw-menu .cp-head .gfw-btn-sm { min-height: 26px; padding: 3px 8px; }\n" +
  "#gfw-quota-warning .cp-row { padding: 8px 0; min-height: 38px; }\n" +
  "#gfw-quota-warning .gfw-m-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0; min-height: 38px; margin: 0; border-top: 1px solid var(--cp-border); }\n" +
  "#gfw-quota-warning input[type=number] { width: 72px !important; height: 34px !important; padding: 4px 8px !important; border-radius: 10px !important; font-size: 13px !important; text-align: center; box-sizing: border-box; }\n" +
  "`;\n",
  'companion audio tab spacer',
);

// 好感系统升级：5 阶段羁绊、纪念数据、逗猫棒结算、防连刷轮换加成、每日首次点击恢复离线好感
companionSrc = mustReplace(
  companionSrc,
  `<div class="cp-card cp-bond-card"><div class="cp-section-head"><div><div class="cp-eyebrow">A LITTLE CLOSER</div><h3>今天也要好好贴贴</h3></div><b id="gfw-affection"></b></div><div class="cp-progress" role="progressbar" aria-label="猫猫亲密度" aria-valuemin="0" aria-valuemax="100"><span></span></div><p id="gfw-dance-status"></p><div class="cp-statline" id="gfw-action-counts"></div></div>
    <div class="cp-card"><h3>给猫猫一点关注</h3><div class="cp-actions">
      <button type="button" class="cp-action" data-cp-action="pet"><b>\${icon('pet')}</b><span>摸摸头<small>好感 +2 · 2 秒</small></span></button>
      <button type="button" class="cp-action" data-cp-action="feed"><b>\${icon('feed')}</b><span>小鱼干投喂<small>好感 +5 · 30 秒</small></span></button>
      <button type="button" class="cp-action" data-cp-action="play"><b>\${icon('play')}</b><span>逗猫棒<small>好感 +3 · 抓星星</small></span></button>
      <button type="button" class="cp-action" data-cp-action="sleep"><b>\${icon('sleep')}</b><span><span id="gfw-sleep-label">打个盹</span><small>随时唤醒，不扣好感</small></span></button>
    </div></div>
    <div class="cp-card cp-switches"><label class="cp-row"><span>开启趣味互动<small>轻养成和猫猫小脾气</small></span><input id="gfw-fun-enabled" type="checkbox"></label><label class="cp-row"><span>满好感 · 柔情之舞<small>100 自动变身，跳完回到 80</small></span><input id="gfw-dance-enabled" type="checkbox"></label><label class="cp-row"><span>显示快捷互动条<small>摸头、投喂、陪玩与设置</small></span><input id="gfw-quick-dock" type="checkbox"></label></div><p class="cp-help">轻点看额度，连戳会哈气，摸头或投喂会消气。好感度是本机趣味记录，不会因离开而减少。</p>`,
  `<div class="cp-card cp-bond-card"><div class="cp-section-head"><div><div class="cp-eyebrow">A LITTLE CLOSER<span id="gfw-bond-stage"></span></div><h3>今天也要好好贴贴</h3></div><b id="gfw-affection"></b></div><div class="cp-progress" role="progressbar" aria-label="猫猫亲密度" aria-valuemin="0" aria-valuemax="100"><span></span></div><p id="gfw-dance-status"></p><div class="cp-statline" id="gfw-action-counts"></div><div class="cp-statline" id="gfw-bond-milestones"></div></div>
    <div class="cp-card"><h3>给猫猫一点关注</h3><div class="cp-actions">
      <button type="button" class="cp-action" data-cp-action="pet"><b>\${icon('pet')}</b><span>摸摸头<small>好感 +2 · 2 秒</small></span></button>
      <button type="button" class="cp-action" data-cp-action="feed"><b>\${icon('feed')}</b><span>小鱼干投喂<small>好感 +5 · 30 秒</small></span></button>
      <button type="button" class="cp-action" data-cp-action="play"><b>\${icon('play')}</b><span>逗猫棒<small>基础 +2 · 抓星加分</small></span></button>
      <button type="button" class="cp-action" data-cp-action="sleep"><b>\${icon('sleep')}</b><span><span id="gfw-sleep-label">打个盹</span><small>随时唤醒，不扣好感</small></span></button>
    </div></div>
    <div class="cp-card cp-switches"><label class="cp-row"><span>开启趣味互动<small>轻养成和猫猫小脾气</small></span><input id="gfw-fun-enabled" type="checkbox"></label><label class="cp-row"><span>满好感 · 柔情之舞<small>100 自动变身，跳完回到 80</small></span><input id="gfw-dance-enabled" type="checkbox"></label><label class="cp-row"><span>显示快捷互动条<small>摸头、投喂、陪玩与设置</small></span><input id="gfw-quick-dock" type="checkbox"></label><div class="cp-row"><span>自定义互动条位置<small>开启后右键拖动摆放，关闭即记录位置</small></span><div class="cp-dock-custom-ctrl"><button type="button" class="gfw-btn-sm" id="gfw-dock-reset-pos">复位</button><input id="gfw-dock-custom-edit" type="checkbox"></div></div><label class="cp-row"><span>双击猫猫动作<small>快速触发，不计入连戳哈气</small></span><select id="gfw-dblclick-action"><option value="none">无（仅连戳哈气）</option><option value="pet">摸摸头</option><option value="quote">来一句喵</option><option value="toggleView">切换余额/额度气泡</option></select></label></div><p class="cp-help">轻点看额度，连戳会哈气，摸头或投喂可哄好；每天首次点猫猫可恢复离线好感。好感度仅作本地趣味记录，不影响台词与额度等功能。</p>`,
  'companion interaction card upgrade',
);

companionSrc = mustReplace(
  companionSrc,
  `<div class="cp-card" id="gfw-appearance-position"><h3>摆放与动效</h3><label class="cp-row"><span>锁定位置，防止误拖</span><input type="checkbox" id="gfw-position-locked"></label><label class="cp-row"><span>减少动态效果</span><input type="checkbox" id="gfw-reduced-motion"></label><div class="cp-btnrow"><button type="button" class="cp-button" data-cp-command="reset-position">回到右下角</button></div></div>
    <div class="cp-card"><h3>本地自定义立绘</h3><p>选择自己的 WebP / PNG / JPG，最多 2 MB。图片仅保存在本机。</p><input type="file" id="gfw-image-file" accept="image/webp,image/png,image/jpeg" aria-label="选择本地立绘"><div class="cp-btnrow"><button type="button" class="cp-button" data-cp-command="reset-image">恢复原猫娘立绘</button></div></div>`,
  `<div class="cp-card" id="gfw-appearance-position"><h3>摆放与动效</h3><label class="cp-row"><span>锁定位置，防止误拖</span><input type="checkbox" id="gfw-position-locked"></label><label class="cp-row"><span>悬停防遮挡轻透<small>鼠标移上时自动半透明，不挡视线</small></span><input type="checkbox" id="gfw-ghost-hover"></label><label class="cp-row"><span>减少动态效果</span><input type="checkbox" id="gfw-reduced-motion"></label><label class="cp-row"><span>轻量省电模式<small>关闭透明阴影、模糊与彩虹流动，降低 GPU/CPU 占用</small></span><input type="checkbox" id="gfw-lite-mode"></label><p style="font-size:11px;margin:6px 0 8px;opacity:.8">老板键：按 <b>Alt + H</b> 可临时隐藏或唤回猫猫。</p><div class="cp-btnrow"><button type="button" class="cp-button" data-cp-command="reset-position">回到右下角</button></div></div>
    <div class="cp-card"><h3>本地自定义立绘</h3><p>导入的立绘都会存入下拉菜单，支持随时切换、裁剪、改名或删除（WebP / PNG / JPG，单张最多 10 MB）。</p><div class="gfw-m-row"><span class="gfw-m-label">当前立绘</span><div class="gfw-m-ctrl"><select id="gfw-image-select" style="flex:1;min-width:0"></select><button type="button" class="gfw-btn-sm" id="gfw-image-crop">裁剪</button><button type="button" class="gfw-btn-sm" id="gfw-image-delete">删除</button></div></div><div class="gfw-m-row"><span class="gfw-m-label">立绘名称</span><div class="gfw-m-ctrl"><input type="text" id="gfw-image-name" maxlength="30" placeholder="输入立绘名称" style="flex:1;min-width:0"><button type="button" class="gfw-btn-sm" id="gfw-image-rename">改名</button></div></div><div class="gfw-m-row"><span class="gfw-m-label">导入立绘</span><div class="gfw-m-ctrl"><input type="file" id="gfw-image-file" accept="image/webp,image/png,image/jpeg" aria-label="选择本地立绘" style="max-width:100%"></div></div></div>`,
  'companion appearance slots and ghost hover',
);

companionSrc = mustReplace(
  companionSrc,
  `    <div class="cp-card"><h3><label for="gfw-custom-lines">专属台词本</label></h3>`,
  `    <div class="cp-card"><h3>情景与主动提醒</h3><label class="cp-row"><span>签到时段问候<small>早安或深夜首次点击时附带问候</small></span><input type="checkbox" id="gfw-time-greet"></label><label class="cp-row"><span>额度预警主动发言<small>5h 或每周额度低于阈值时主动弹窗提醒</small></span><input type="checkbox" id="gfw-quota-warn-speech"></label></div>\n    <div class="cp-card"><h3><label for="gfw-custom-lines">专属台词本</label></h3>`,
  'companion dialogue middle card switches',
);

companionSrc = mustReplace(
  companionSrc,
  `<div class="cp-btnrow"><button type="button" class="cp-button" data-cp-command="export">导出陪伴偏好</button><button type="button" class="cp-button" data-cp-command="import">导入偏好</button></div><input type="file" id="gfw-settings-file" accept="application/json,.json" hidden><div class="cp-btnrow"><button type="button" class="cp-button" data-cp-command="reset-preferences">重置陪伴偏好</button></div>`,
  `<div class="cp-btnrow"><button type="button" class="cp-button" data-cp-command="export">导出陪伴偏好</button><button type="button" class="cp-button" data-cp-command="import">导入偏好</button><button type="button" class="cp-button" data-cp-command="reset-preferences">重置陪伴偏好</button></div><input type="file" id="gfw-settings-file" accept="application/json,.json" hidden>`,
  'companion merge preference buttons into one row',
);

companionSrc = mustReplace(
  companionSrc,
  `<label class="cp-row"><span>立绘不透明度</span><input type="range" id="gfw-cat-opacity" min="0.4" max="1" step="0.05"><output id="gfw-cat-opacity-value"></output></label>`,
  `<div class="gfw-m-row"><span class="gfw-m-label">立绘不透明度</span><div class="gfw-m-ctrl"><input type="range" id="gfw-cat-opacity" min="0.4" max="1" step="0.05"><input type="number" id="gfw-cat-opacity-value" min="40" max="100" step="5" style="width:64px;text-align:center;"></div></div>`,
  'companion opacity row match scale input style',
);

companionSrc = mustReplace(
  companionSrc,
  `$('#gfw-cat-opacity-value').textContent=Math.round(prefs.opacity*100)+'%';`,
  `$('#gfw-cat-opacity-value').value=String(Math.round(prefs.opacity*100));`,
  'companion opacity value sync',
);

companionSrc = mustReplace(
  companionSrc,
  `$('#gfw-cat-opacity').addEventListener('input',e=>setPreferences({opacity:Number(e.target.value)}));`,
  `$('#gfw-cat-opacity').addEventListener('input',e=>setPreferences({opacity:Number(e.target.value)}));
  $('#gfw-cat-opacity-value').addEventListener('change',e=>{const pct=Math.max(40,Math.min(100,Math.round(Number(e.target.value)||100)));setPreferences({opacity:pct/100});syncInputs();});`,
  'companion opacity number input listener',
);

companionSrc = mustReplace(
  companionSrc,
  `  const alertLabel=$('#gfw-turn-alert-on').parentElement;
  for(const node of [...alertLabel.childNodes])if(node.nodeType===3)node.remove();
  alertLabel.appendChild(document.createTextNode(' 互动 / 计时完成提示'));`,
  `  // #gfw-turn-alert-on label text is already placed inside .cp-row in widget HTML`,
  'companion skip duplicate alertLabel text append',
);

companionSrc = mustReplace(
  companionSrc,
  `const turnVolume=make('label','cp-row');dom.setHTML(turnVolume,'<span>提示音量</span><input id="gfw-turn-volume" type="range" min="0" max="1" step="0.05"><output id="gfw-turn-volume-value"></output>');$('#gfw-companion-audio').appendChild(turnVolume);`,
  `const turnVolume=make('div','gfw-m-row');dom.setHTML(turnVolume,'<span class="gfw-m-label">提示音量</span><div class="gfw-m-ctrl"><input id="gfw-turn-volume" type="range" min="0" max="1" step="0.05"><output id="gfw-turn-volume-value" style="min-width:34px;text-align:right;font-size:13px;"></output></div>');$('#gfw-audio-panel').appendChild(turnVolume);$('#gfw-audio-panel').appendChild(timeRow);`,
  'companion move turn close sec below turn volume',
);

companionSrc = mustReplace(
  companionSrc,
  `<h3>Google 官方剩余额度</h3>`,
  `<h3>Gemini 官方剩余额度</h3>`,
  'companion rename official quota card title to Gemini',
);

companionSrc = mustReplace(
  companionSrc,
  `<div class="cp-btnrow"><button type="button" class="cp-button cp-primary" data-cp-command="refresh-quota">立即同步</button><button type="button" class="cp-button" data-cp-command="show-quota">查看气泡</button></div></div>`,
  `<div class="cp-btnrow"><button type="button" class="cp-button cp-primary" data-cp-command="refresh-quota">立即同步</button><button type="button" class="cp-button" data-cp-command="show-quota">查看气泡</button></div>` +
  `<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--cp-border)">` +
    `<div class="gfw-m-row" style="border-top:none;padding:0 0 6px 0;margin:0"><span class="gfw-m-label">agy 查询</span><button type="button" class="gfw-btn-sm" id="gfw-auth-agy-use">当前主数据源</button></div>` +
    `<p style="margin:0;font-size:12px;color:var(--cp-muted)">通过 agy 实现：直接同步本地 agy-link 当前活跃账号的 5 小时与每周剩余额度。</p>` +
  `</div>` +
  `<div id="gfw-gemini-auth-box" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--cp-border)">` +
    `<div class="gfw-m-row" style="border-top:none;padding:0 0 8px 0;margin:0"><span class="gfw-m-label">其他查询方式</span><span id="gfw-auth-active-tag" style="font-size:11px;color:var(--cp-muted)">独立凭证查询</span></div>` +
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">` +
      `<button type="button" class="gfw-btn-sm" id="gfw-auth-tab-rt" aria-pressed="true">RT 登录</button>` +
      `<button type="button" class="gfw-btn-sm" id="gfw-auth-tab-oauth" aria-pressed="false">OAuth 登录</button>` +
    `</div>` +
    `<div id="gfw-auth-pane-rt">` +
      `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px">` +
        `<input type="password" id="gfw-auth-rt-token" placeholder="粘贴 Refresh Token (1//...)" style="width:100%;padding:6px 9px;border-radius:8px;border:1px solid var(--cp-border);background:var(--cp-bg);color:var(--cp-text);font-size:12px">` +
        `<details style="font-size:11px;color:var(--cp-muted)"><summary style="cursor:pointer">OAuth Client 配置（可选）</summary>` +
          `<div style="display:flex;flex-direction:column;gap:5px;margin-top:6px">` +
            `<input type="text" id="gfw-auth-rt-cid" placeholder="Client ID（默认内置 Antigravity，可留空）" style="width:100%;padding:5px 8px;border-radius:8px;border:1px solid var(--cp-border);background:var(--cp-bg);color:var(--cp-text);font-size:11px">` +
            `<input type="password" id="gfw-auth-rt-csec" placeholder="Client Secret（默认内置，可留空）" style="width:100%;padding:5px 8px;border-radius:8px;border:1px solid var(--cp-border);background:var(--cp-bg);color:var(--cp-text);font-size:11px">` +
          `</div>` +
        `</details>` +
      `</div>` +
      `<div class="cp-btnrow" style="margin-top:6px">` +
        `<button type="button" class="cp-button cp-primary" id="gfw-auth-rt-save">保存并查询</button>` +
        `<button type="button" class="cp-button" id="gfw-auth-rt-refresh">刷新</button>` +
        `<button type="button" class="cp-button" id="gfw-auth-rt-use">设为主数据源</button>` +
        `<button type="button" class="cp-button" id="gfw-auth-rt-clear">清除</button>` +
      `</div>` +
      `<div id="gfw-auth-rt-quota" style="margin-top:8px;padding:8px 10px;border-radius:10px;background:var(--cp-soft);font-size:12px">未配置 RT</div>` +
    `</div>` +
    `<div id="gfw-auth-pane-oauth" hidden>` +
      `<details style="font-size:11px;color:var(--cp-muted);margin-bottom:8px"><summary style="cursor:pointer">OAuth Client 配置（可选）</summary>` +
        `<div style="display:flex;flex-direction:column;gap:5px;margin-top:6px">` +
          `<input type="text" id="gfw-auth-oauth-cid" placeholder="Client ID（默认内置 Antigravity，可留空）" style="width:100%;padding:5px 8px;border-radius:8px;border:1px solid var(--cp-border);background:var(--cp-bg);color:var(--cp-text);font-size:11px">` +
          `<input type="password" id="gfw-auth-oauth-csec" placeholder="Client Secret（默认内置，可留空）" style="width:100%;padding:5px 8px;border-radius:8px;border:1px solid var(--cp-border);background:var(--cp-bg);color:var(--cp-text);font-size:11px">` +
        `</div>` +
      `</details>` +
      `<div class="cp-btnrow" style="margin-top:6px">` +
        `<button type="button" class="cp-button cp-primary" id="gfw-auth-oauth-login">浏览器 OAuth 登录</button>` +
        `<button type="button" class="cp-button" id="gfw-auth-oauth-refresh">刷新</button>` +
        `<button type="button" class="cp-button" id="gfw-auth-oauth-use">设为主数据源</button>` +
        `<button type="button" class="cp-button" id="gfw-auth-oauth-clear">退出</button>` +
      `</div>` +
      `<div id="gfw-auth-oauth-quota" style="margin-top:8px;padding:8px 10px;border-radius:10px;background:var(--cp-soft);font-size:12px">未登录 OAuth</div>` +
    `</div>` +
  `</div></div>`,
  'companion official quota card gemini turn quota toggle',
);

companionSrc = mustReplace(
  companionSrc,
  `<div class="cp-card" id="gfw-quota-warning"><h3>数据与预警</h3><p>约 30 秒同步一次；超过 90 秒没有有效更新时隐藏数值。Google 页面本身也可能有延迟。互动、投喂、计时均不产生或消耗额度。</p></div>`,
  `<div class="cp-card" id="gfw-quota-warning"><h3>数据与预警</h3><p>约 30 秒同步一次；超过 90 秒没有有效更新时隐藏数值。Google 页面本身也可能有延迟。互动、投喂、计时均不产生或消耗额度。</p><label class="cp-row"><span>DSH 余额预警 (元)<small>余额低于该值时亮角标并主动提醒（0 为关闭）</small></span><input type="number" id="gfw-dsh-warn-bal" min="0" max="10000" step="0.5" style="width:72px"></label></div>`,
  'companion quota warning dsh balance threshold',
);

companionSrc = mustReplace(
  companionSrc,
  `moveRow('gfw-warn-pct','#gfw-quota-warning');`,
  `moveRow('gfw-warn-pct','#gfw-quota-warning');\n  moveRow('gfw-warn-week-pct','#gfw-quota-warning');`,
  'companion move weekly warn threshold row',
);

companionSrc = mustReplace(
  companionSrc,
  `    const state=readState();
    if(state.sleeping){state.sleeping=false;writeState(state);root.classList.add('cp-waking');if(wakeTimer!==null)clearTimeout(wakeTimer);wakeTimer=setTimeout(()=>{root.classList.remove('cp-waking');wakeTimer=null;},900);showQuota();return true;}
    return false;`,
  `    const checkin=model.claimDailyCheckin(readState(),Date.now());
    let state=checkin.state;
    if(checkin.changed){
      writeState(state);
      if(checkin.recovered>0){
        particles(model.getBondStage(state.affection).particle);
        const hr=new Date().getHours();
        const greet=prefs.timeGreet?(hr<5?' · 夜深了，早点休息喵':hr<10?' · 早安，今天也一起加油喵':''):'';
        notify('今日初见，离线好感恢复 +'+checkin.recovered+(state.offlineDecayPending>0?'（还差 '+state.offlineDecayPending+' 点待哄）':'')+greet);
      } else if(checkin.changed&&prefs.timeGreet){
        const hr=new Date().getHours();
        if(hr<5)notify('夜深了，早点休息喵～');
        else if(hr<10)notify('早安，今天也一起加油喵～');
      }
    }
    if(state.sleeping){state.sleeping=false;writeState(state);root.classList.add('cp-waking');if(wakeTimer!==null)clearTimeout(wakeTimer);wakeTimer=setTimeout(()=>{root.classList.remove('cp-waking');wakeTimer=null;},900);showQuota();return true;}
    return false;`,
  'companion daily checkin tap recovery',
);

companionSrc = mustReplace(
  companionSrc,
  `    $('#gfw-affection-summary').textContent='亲密度 '+s.affection;
    $('#gfw-affection').textContent=s.affection+' / 100';
    $('#gfw-dance-status').textContent=s.reward.run?'柔情之舞进行中，结束后好感度回到 80。':!prefs.enabled?'互动已暂停，好感度为你保留。':!prefs.danceEnabled?'满好感舞蹈已关闭，随时可以开启。':dance?.status()==='failed'?'舞蹈立绘加载失败，好感度已保留。重开下方舞蹈开关可重试。':s.affection===100?'心动已满，猫猫准备为你跳一支舞。':'再贴贴 '+(100-s.affection)+' 点，解锁柔情之舞。';`,
  `    const stage=model.getBondStage(s.affection);
    const today=model.localDayKey(now);
    $('#gfw-affection-summary').textContent='Lv.'+stage.level+' '+stage.title+' · '+s.affection;
    $('#gfw-bond-stage').textContent='Lv.'+stage.level+' '+stage.title;
    $('#gfw-affection').textContent=s.affection+' / 100';
    $('#gfw-dance-status').textContent=s.reward.run?'柔情之舞进行中，结束后好感度回到 80。':!prefs.enabled?'互动已暂停，好感度为你保留。':s.offlineDecayPending>0?(s.lastCheckinDay!==today?'离线想你掉了 '+s.offlineDecayPending+' 点好感，今天点一下猫猫即可恢复 +3。':'今天已签过到，还有 '+s.offlineDecayPending+' 点离线好感可通过互动哄回来。'):!prefs.danceEnabled?'满好感舞蹈已关闭，随时可以开启。':dance?.status()==='failed'?'舞蹈立绘加载失败，好感度已保留。重开下方舞蹈开关可重试。':s.affection===100?'心动已满，猫猫准备为你跳一支舞。':'再贴贴 '+(100-s.affection)+' 点，解锁柔情之舞。';`,
  'companion renderState bond stage',
);

companionSrc = mustReplace(
  companionSrc,
  `    $('#gfw-action-counts').textContent='摸头 '+s.counts.pet+' 次 · 投喂 '+s.counts.feed+' 次 · 陪玩 '+s.counts.play+' 次';`,
  `    $('#gfw-action-counts').textContent='摸头 '+s.counts.pet+' 次 · 投喂 '+s.counts.feed+' 次 · 陪玩 '+s.counts.play+' 次';
    $('#gfw-bond-milestones').textContent='相伴 '+s.daysTogether+' 天 · 共舞 '+s.reward.completed+' 次 · 抓星纪录 '+s.bestStarScore+' 颗';`,
  'companion renderState milestones',
);

companionSrc = mustReplace(
  companionSrc,
  `    move();const timer=setTimeout(()=>{stopToy();notify('本次抓到 '+hits+' 颗星星，陪玩结束啦。');},10000);
    stopToy=()=>{clearTimeout(timer);toy.remove();stopToy=()=>{};};`,
  `    move();const timer=setTimeout(()=>{
      stopToy();
      const settled=model.settlePlayStars(readState(),hits);
      writeState(settled.state);
      dance?.synchronize();
      if(hits>=5)particles('✨');
      const extra=settled.bonus?'，额外好感 +'+settled.bonus:'';
      const rec=settled.isRecord?'（新纪录！）':'';
      notify('本次抓到 '+hits+' 颗星星'+extra+rec+'。');
    },10000);
    stopToy=()=>{clearTimeout(timer);toy.remove();stopToy=()=>{};};`,
  'companion startToy star settlement',
);

companionSrc = mustReplace(
  companionSrc,
  `    const result=model.interact(readState(),action);
    if(!result.accepted){notify(result.retryAfterMs?'猫猫缓一缓，'+Math.ceil(result.retryAfterMs/1000)+' 秒后再试喵。':'这个互动暂时不可用。');return false;}
    const calming=['pet','feed'].includes(action)&&performance.now()<touchState.hissUntil;
    clearTouchReaction();resetTouchSequence();
    writeState(result.state);
    dance?.synchronize();
    if(result.state.affection===100&&prefs.danceEnabled){stopToy();notify(dance?.status()==='failed'?'舞蹈立绘加载失败，好感度已保留。重开舞蹈开关可重试。':'心动已满，准备跳一支只给你看的舞。');return true;}
    const lines={pet:'好猫猫已充电。\\n再摸一下，呼噜声要漏出来了～',feed:'小基基你看！\\n小鱼干是猫猫的满分答案。',play:'猫猫祟祟地盯住星星……\\n点它！看本喵出爪！',sleep:result.state.sleeping?'猫猫进入省电模式。\\n呼噜归我，灵感归你。':'睡醒啦，猫猫重新上线！\\n今天也请多指喵～'};
    quote(calming?(action==='feed'?'哼，看在小鱼干的份上……\\n好啦，猫猫不哈气了。':'呼噜……摸头犯规！\\n这次就原谅你啦。'):lines[action]);particles(action==='feed'?'🐟':action==='play'?'✨':'🤍');
    if(getConfig().turnAlertOn)playSound('task_end',getConfig().turnSoundSet,getConfig().turnVol*.5);
    if(action==='play')startToy();else stopToy();
    notify('收到啦，'+prefs.name+(action==='sleep'?'换了个陪伴状态。':'又和你亲近了一点。'));return true;`,
  `    const calming=['pet','feed'].includes(action)&&performance.now()<touchState.hissUntil;
    const result=model.interact(readState(),action,Date.now(),{calming});
    if(!result.accepted){
      if(result.fatigue){notify('连续'+({pet:'摸头',feed:'投喂',play:'逗猫棒'}[action]||'同一个动作')+'太多次啦，换个互动陪猫猫玩吧～');return false;}
      notify(result.retryAfterMs?'猫猫缓一缓，'+Math.ceil(result.retryAfterMs/1000)+' 秒后再试喵。':'这个互动暂时不可用。');return false;
    }
    clearTouchReaction();resetTouchSequence();
    writeState(result.state);
    dance?.synchronize();
    if(result.state.affection===100&&prefs.danceEnabled){stopToy();notify(dance?.status()==='failed'?'舞蹈立绘加载失败，好感度已保留。重开舞蹈开关可重试。':'心动已满，准备跳一支只给你看的舞。');return true;}
    const lines={pet:'好猫猫已充电。\\n再摸一下，呼噜声要漏出来了～',feed:'小基基你看！\\n小鱼干是猫猫的满分答案。',play:'猫猫祟祟地盯住星星……\\n点它！看本喵出爪！',sleep:result.state.sleeping?'猫猫进入省电模式。\\n呼噜归我，灵感归你。':'睡醒啦，猫猫重新上线！\\n今天也请多指喵～'};
    const stage=model.getBondStage(result.state.affection);
    quote(calming?(action==='feed'?'哼，看在小鱼干的份上……\\n好啦，猫猫不哈气了。':'呼噜……摸头犯规！\\n这次就原谅你啦。'):lines[action]);particles(action==='feed'?'🐟':action==='play'?'✨':stage.particle);
    if(getConfig().turnAlertOn)playSound('task_end',getConfig().turnSoundSet,getConfig().turnVol*.5);
    if(action==='play')startToy();else stopToy();
    const extras=[];
    if(result.recovered>0)extras.push('初见恢复 +'+result.recovered);
    if(result.comboBonus>0)extras.push('换着宠 +'+result.comboBonus);
    if(result.calmingBonus>0)extras.push('哄好炸毛 +'+result.calmingBonus);
    notify(action==='sleep'?('收到啦，'+prefs.name+'换了个陪伴状态。'):('好感 +'+result.gain+(extras.length?'（'+extras.join(' · ')+'）':'')));return true;`,
  'companion performAction upgrade',
);

companionSrc = mustReplace(
  companionSrc,
  `    dock.hidden=!prefs.enabled||!prefs.quickDock||!!s.reward.run;`,
  `    const nextDockHidden=!prefs.enabled||!prefs.quickDock||!!s.reward.run;\n` +
  `    const dockJustShown=dock.hidden&&!nextDockHidden;\n` +
  `    dock.hidden=nextDockHidden;`,
  'companion dock visibility transition',
);

companionSrc = mustReplace(
  companionSrc,
  `    positionDock();\n  }`,
  `    if(dockJustShown)positionDock();\n  }`,
  'companion avoid per-second positionDock reflow',
);

companionSrc = mustReplace(
  companionSrc,
  `  function positionDock() {
    if (dock.hidden) return;
    const cat = root.querySelector('#gfw-img-wrap').getBoundingClientRect();
    const width = dock.offsetWidth || 164;
    const height = dock.offsetHeight || 44;
    const edge = 8;
    const gap = 10;`,
  `  function positionDock() {
    if (dock.hidden) return;
    const cat = root.querySelector('#gfw-img-wrap').getBoundingClientRect();
    const width = dock.offsetWidth || 164;
    const height = dock.offsetHeight || 44;
    const edge = 8;
    if (typeof prefs.dockRelX === 'number' && Number.isFinite(prefs.dockRelX) && typeof prefs.dockRelY === 'number' && Number.isFinite(prefs.dockRelY)) {
      const catCx = (cat.left + cat.right) / 2;
      const catCy = (cat.top + cat.bottom) / 2;
      let left = catCx + prefs.dockRelX - width / 2;
      let top = catCy + prefs.dockRelY - height / 2;
      if (left < edge || left + width > window.innerWidth - edge) {
        const mirrorLeft = catCx - prefs.dockRelX - width / 2;
        if (mirrorLeft >= edge && mirrorLeft + width <= window.innerWidth - edge) left = mirrorLeft;
      }
      if (top < edge || top + height > window.innerHeight - edge) {
        const mirrorTop = catCy - prefs.dockRelY - height / 2;
        if (mirrorTop >= edge && mirrorTop + height <= window.innerHeight - edge) top = mirrorTop;
      }
      dock.style.left = Math.round(Math.max(edge, Math.min(window.innerWidth - width - edge, left))) + 'px';
      dock.style.top = Math.round(Math.max(edge, Math.min(window.innerHeight - height - edge, top))) + 'px';
      return;
    }
    const gap = 10;`,
  'companion positionDock custom coords',
);

companionSrc = mustReplace(
  companionSrc,
  `  const dockClock=make('button','cp-clock','25:00');dockClock.type='button';dockClock.title='打开番茄钟';dockClock.setAttribute('aria-label','打开番茄钟');dockClock.addEventListener('click',()=>{openMenu();showTab('tools',true);});dock.appendChild(dockClock);document.body.appendChild(dock);`,
  `  const dockClock=make('button','cp-clock','25:00');dockClock.type='button';dockClock.title='打开番茄钟';dockClock.setAttribute('aria-label','打开番茄钟');dockClock.addEventListener('click',()=>{openMenu();showTab('tools',true);});dock.appendChild(dockClock);document.body.appendChild(dock);
  dock.addEventListener('contextmenu',e=>{if(prefs.dockCustomEdit){e.preventDefault();e.stopPropagation();}});
  dock.addEventListener('mousedown',e=>{
    if(e.button!==2||!prefs.dockCustomEdit||dock.hidden)return;
    e.preventDefault();e.stopPropagation();
    const rect=dock.getBoundingClientRect();
    const startX=e.clientX,startY=e.clientY,startLeft=rect.left,startTop=rect.top;
    let curLeft=Math.round(startLeft),curTop=Math.round(startTop);
    dock.classList.add('cp-dock-dragging');
    const clamp=(v,min,max)=>Math.round(Math.max(min,Math.min(max,v)));
    const onMove=ev=>{
      const width=dock.offsetWidth||164,height=dock.offsetHeight||44,edge=8;
      curLeft=clamp(startLeft+ev.clientX-startX,edge,window.innerWidth-width-edge);
      curTop=clamp(startTop+ev.clientY-startY,edge,window.innerHeight-height-edge);
      dock.style.left=curLeft+'px';dock.style.top=curTop+'px';
    };
    const finish=()=>{
      window.removeEventListener('mousemove',onMove);
      window.removeEventListener('mouseup',finish);
      window.removeEventListener('blur',finish);
      dock.classList.remove('cp-dock-dragging');
      const cat=root.querySelector('#gfw-img-wrap').getBoundingClientRect();
      const width=dock.offsetWidth||rect.width||164,height=dock.offsetHeight||rect.height||44;
      if(cat.width>0){
        const dockRelX=Math.round((curLeft+width/2)-(cat.left+cat.right)/2);
        const dockRelY=Math.round((curTop+height/2)-(cat.top+cat.bottom)/2);
        setPreferences({dockRelX,dockRelY});
      }
    };
    window.addEventListener('mousemove',onMove);
    window.addEventListener('mouseup',finish);
    window.addEventListener('blur',finish);
  });`,
  'companion dock right-click drag',
);

companionSrc = mustReplace(
  companionSrc,
  `  function tick() {
    const result=model.tickTimer(readState());
    if(result.completed){writeState(result.state);quote(result.state.timer.phase==='focus'?'专注完成，猫猫给你盖章！\\n起来伸个懒腰吧。':'休息结束啦。\\n准备好再开始，不着急喵。');if(getConfig().turnAlertOn)playSound('task_end',getConfig().turnSoundSet,getConfig().turnVol);notify('计时完成。下一轮由你手动开始。');}
    renderState();
    dance?.synchronize();
  }`,
  `  function tick() {
    if(document.hidden)return;
    const now=Date.now();
    const menuOpen=menu.classList.contains('gfw-show');
    const timerRunning=memory.timer?.status==='running';
    const hasCooldown=cooldownControls.some(c=>!c.badge.hidden||model.actionCooldown(memory,c.action,now)>0);
    const dayChanged=model.localDayKey(now)!==memory.lastDecayDay;
    if(!menuOpen&&!timerRunning&&!hasCooldown&&!memory.reward?.run&&!dayChanged)return;
    const result=model.tickTimer(readState());
    if(result.completed){writeState(result.state);quote(result.state.timer.phase==='focus'?'专注完成，猫猫给你盖章！\\n起来伸个懒腰吧。':'休息结束啦。\\n准备好再开始，不着急喵。');if(getConfig().turnAlertOn)playSound('task_end',getConfig().turnSoundSet,getConfig().turnVol);notify('计时完成。下一轮由你手动开始。');}
    renderState();
    dance?.synchronize();
  }`,
  'companion smart idle tick',
);

companionSrc = mustReplace(
  companionSrc,
  `  const touchBadge=make('span','cp-touch-badge','💢');touchBadge.hidden=true;touchBadge.setAttribute('aria-hidden','true');root.querySelector('#gfw-img-wrap').appendChild(touchBadge);`,
  `  const touchBadge=make('span','cp-touch-badge','💢');touchBadge.hidden=true;touchBadge.setAttribute('aria-hidden','true');root.querySelector('#gfw-img-wrap').appendChild(touchBadge);
  const quotaBadge=make('span','cp-quota-badge','⚠️');quotaBadge.hidden=true;quotaBadge.title='剩余额度偏低';quotaBadge.setAttribute('aria-hidden','true');root.querySelector('#gfw-img-wrap').appendChild(quotaBadge);
  const WARN_5H_QUOTES=[
    '5 小时额度快见底啦！\\n剩下的先留给关键提问喵～',
    '注意看 5 小时额度条！\\n小基基快喝饱了，省着点用喵～',
    '5 小时额度触发预警啦，\\n要不先喝口水等它回回血？'
  ];
  const WARN_WEEK_QUOTES=[
    '本周额度进入预警线啦！\\n再猛冲就要坐牢到下周重置了喵～',
    '每周额度不太充裕了，\\n长对话先精简一下喵！',
    '周额度告急预警！\\n省着用还能撑到重置日～'
  ];
  const WARN_BALANCE_QUOTES=[
    'DS 余额快见底啦！\\n只剩 {bal} 了，记得去充点猫粮喵～',
    'DeepSeek 余额预警！\\n当前可用 {bal}，再聊下去就要停机啦～',
    '钱包告急提醒：\\nDSH 余额只剩 {bal} 啦，省着点问喵！'
  ];
  const warnMountAt=Date.now();
  let warnSpoken5h=false;
  let warnSpokenWeek=false;
  let warnSpokenBalance=false;
  function checkQuotaWarn(q){
    const b=window.__gfwDshBalance;
    const balLim=Number(prefs.balanceWarnThreshold)||0;
    const balNum=(b&&b.ok&&Number.isFinite(Number(b.totalBalance)))?Number(b.totalBalance):null;
    const isWarnBal=!!(balLim>0&&balNum!==null&&balNum<=balLim);
    quotaBadge.hidden=!((q&&(q.isWarn5h||q.isWarnWeek))||isWarnBal);
    if(!q||!q.isWarn5h)warnSpoken5h=false;
    if(!q||!q.isWarnWeek)warnSpokenWeek=false;
    if(!isWarnBal)warnSpokenBalance=false;
    if(Date.now()-warnMountAt<2500)return;
    if(stealthHidden||!prefs.enabled||!prefs.quotaWarnSpeech||dance?.busy())return;
    const hit5h=!!(q&&q.isWarn5h&&!warnSpoken5h&&q.left5hPct!==null);
    const hitWeek=!!(q&&q.isWarnWeek&&!warnSpokenWeek&&q.leftWeekPct!==null);
    const hitBal=!!(isWarnBal&&!warnSpokenBalance);
    if(!hit5h&&!hitWeek&&!hitBal)return;
    if(hit5h)warnSpoken5h=true;
    if(hitWeek)warnSpokenWeek=true;
    if(hitBal)warnSpokenBalance=true;
    if(hitBal&&!hit5h&&!hitWeek){
      const sym=String(b.currency||'CNY').toUpperCase()==='USD'?'$':'¥';
      const line=WARN_BALANCE_QUOTES[Math.floor(Math.random()*WARN_BALANCE_QUOTES.length)].replace('{bal}',sym+balNum.toFixed(2));
      quote(line);
      return;
    }
    const pool=hit5h?WARN_5H_QUOTES:WARN_WEEK_QUOTES;
    const line=pool[Math.floor(Math.random()*pool.length)];
    quote(line);
  }
  window.addEventListener('gfw-official-quota',()=>setTimeout(()=>checkQuotaWarn(options.getMetrics()),120));
  window.addEventListener('gfw-dsh-turn-end',e=>{
    const d=e&&e.detail;
    if(getConfig().turnAlertOn)playSound('task_end',getConfig().turnSoundSet,getConfig().turnVol);
    const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    if(window.__gfwQuotaView!=='quota'&&window.__gfwShowTurnCost!==false&&!stealthHidden&&!dance?.busy()&&d&&Number(d.amount)>0){
      const amt=Number(d.amount);
      const costStr=amt<0.01?amt.toFixed(4):amt.toFixed(3).replace(/0$/,'');
      const toks=Number(d.tokens)||0;
      const b=window.__gfwDshBalance;
      const balSym=b&&String(b.currency||'CNY').toUpperCase()==='USD'?'$':'¥';
      const subStr=toks>0?('约 '+toks.toLocaleString()+' tokens'):((b&&b.ok&&Number.isFinite(Number(b.totalBalance)))?('余额 '+balSym+Number(b.totalBalance).toFixed(2)):'本轮对话已结束');
      const html='<div class="gfw-turn-card">'
        +'<div class="gfw-turn-hdr">本轮完成</div>'
        +'<div class="gfw-turn-cost gfw-rainbow-num">花费 ¥'+esc(costStr)+'</div>'
        +'<div class="gfw-turn-chip">'+esc(subStr)+'</div>'
        +'</div>';
      if(options.showBubbleHtml)options.showBubbleHtml(html);
      else showQuote('本轮完成\\n花费 ¥'+costStr+'\\n'+subStr);
    }else if(window.__gfwQuotaView==='quota'&&window.__gfwShowGeminiTurnQuota!==false&&!stealthHidden&&!dance?.busy()){
      const m=options.getMetrics();
      const has5h=m&&m.left5hPct!==null&&Number.isFinite(Number(m.left5hPct));
      const pct5h=has5h?Math.max(0,Math.min(100,Number(m.left5hPct))):0;
      const val5h=has5h?(Math.round(pct5h)+'%'):'—';
      const warn=!!(m&&m.isWarn5h);
      const rawRst=String((m&&m.reset5hText)||'').replace(/^重置[：:]\\s*/,'').trim();
      let rst='重置时间待同步';
      if(rawRst&&rawRst!=='重置时间待同步'){
        const pm=rawRst.match(/\\(([^)]+)\\)/);
        const cd=(pm?pm[1]:rawRst).trim()
          .replace(/(\\d+)\\s*天\\s*(\\d+)\\s*小时/,'$1d$2h')
          .replace(/(\\d+)\\s*小时\\s*(\\d+)\\s*分(?:钟)?(?:后)?/,'$1h$2m')
          .replace(/(\\d+)\\s*小时(?:后)?/,'$1h')
          .replace(/(\\d+)\\s*分(?:钟)?(?:后)?/,'$1m');
        rst=/^已重置/.test(cd)?cd:(cd?'距离重置：'+cd:'重置时间待同步');
      }
      const html='<div class="gfw-turn-card">'
        +'<div class="gfw-turn-hdr">本轮完成</div>'
        +'<div class="gfw-turn-5h-block">'
        +'<div class="gfw-turn-5h-row"><span class="gfw-turn-5h-label gfw-rainbow-txt">5 小时</span><span class="gfw-turn-5h-pct gfw-rainbow-num'+(warn?' gfw-warn':'')+'">'+esc(val5h)+'</span></div>'
        +'<div class="gfw-turn-5h-track"><div class="gfw-min-bar-fill'+(warn?' gfw-fill-warn':'')+'" style="width:'+pct5h+'%"></div></div>'
        +'</div>'
        +'<div class="gfw-turn-reset gfw-rainbow-txt">'+esc(rst)+'</div>'
        +'</div>';
      if(options.showBubbleHtml)options.showBubbleHtml(html);
      else showQuote('本轮完成\\n5 小时 '+val5h+'\\n'+rst);
    }
  });
  let stealthHidden=false;
  let ghostSuppressed=false;
  let ghostLeftAfterAction=true;
  let actionAnimTimer=null;
  const bubbleEl=root.querySelector('#gfw-bubble');
  function isCatIdle(){
    return !((bubbleEl&&bubbleEl.classList.contains('gfw-open'))||menu.classList.contains('gfw-show')||root.classList.contains('cp-hissing')||root.classList.contains('cp-waking')||root.classList.contains('cp-react-pet')||root.classList.contains('cp-react-feed')||memory.reward?.run);
  }
  function cancelGhostHover(){ghostSuppressed=true;ghostLeftAfterAction=false;root.classList.remove('cp-ghost-active');}
  root.addEventListener('pointerenter',()=>{
    if(ghostSuppressed&&ghostLeftAfterAction&&isCatIdle())ghostSuppressed=false;
    if(prefs.ghostHover&&!ghostSuppressed&&isCatIdle())root.classList.add('cp-ghost-active');
  });
  root.addEventListener('pointerleave',()=>{
    ghostLeftAfterAction=true;
    if(ghostSuppressed&&isCatIdle())ghostSuppressed=false;
    root.classList.remove('cp-ghost-active');
  });
  root.addEventListener('pointerdown',cancelGhostHover);
  root.addEventListener('contextmenu',cancelGhostHover);
  function triggerActionAnim(kind){
    if(reduced()||!['pet','feed'].includes(kind))return;
    root.classList.remove('cp-react-pet','cp-react-feed');
    void root.offsetWidth;
    const cls='cp-react-'+kind;
    root.classList.add(cls);
    if(actionAnimTimer!==null)clearTimeout(actionAnimTimer);
    actionAnimTimer=setTimeout(()=>{root.classList.remove('cp-react-pet','cp-react-feed');actionAnimTimer=null;},650);
  }
  function getCustomImageStore(){
    const c=getConfig();
    if(!Array.isArray(c.customImageList)){
      c.customImageList=[];
      if(Array.isArray(c.customImgs)){
        c.customImgs.forEach((url,idx)=>{if(url)c.customImageList.push({id:'slot-'+(idx+1),name:'立绘 '+(idx+1),dataUrl:url});});
      }else if(c.customImg){
        c.customImageList.push({id:'slot-1',name:'立绘 1',dataUrl:c.customImg});
      }
      if(!c.activeImgId){
        if(c.activeImgSlot===1||c.activeImgSlot===2){
          const hit=c.customImageList.find(it=>it.id==='slot-'+c.activeImgSlot);
          c.activeImgId=hit?hit.id:'__default__';
        }else if(c.customImg&&c.customImageList[0]){
          c.activeImgId=c.customImageList[0].id;
        }else{
          c.activeImgId='__default__';
        }
      }
    }
    if(c.activeImgId!=='__default__'&&!c.customImageList.some(it=>it.id===c.activeImgId)){
      c.activeImgId='__default__';
    }
    return c.customImageList;
  }
  function refreshSlotButtons(){
    const c=getConfig();const list=getCustomImageStore();const activeId=c.activeImgId||'__default__';
    const sel=$('#gfw-image-select');const nameIn=$('#gfw-image-name');const delBtn=$('#gfw-image-delete');const renBtn=$('#gfw-image-rename');const cropBtn=$('#gfw-image-crop');
    if(!sel)return;
    sel.replaceChildren();
    const defOpt=document.createElement('option');defOpt.value='__default__';defOpt.textContent='原版猫娘';sel.appendChild(defOpt);
    for(const item of list){
      const opt=document.createElement('option');opt.value=item.id;opt.textContent=item.name||'未命名立绘';sel.appendChild(opt);
    }
    sel.value=activeId;
    const activeItem=list.find(it=>it.id===activeId)||null;
    if(nameIn){
      nameIn.value=activeItem?(activeItem.name||''):'原版猫娘';
      nameIn.disabled=!activeItem;
    }
    if(delBtn)delBtn.disabled=!activeItem;
    if(renBtn)renBtn.disabled=!activeItem;
    if(cropBtn)cropBtn.disabled=!activeItem;
  }
  function applyCustomImage(id){
    const c=getConfig();const list=getCustomImageStore();
    const item=id==='__default__'?null:list.find(it=>it.id===id);
    c.activeImgId=item?item.id:'__default__';
    c.customImg=item?item.dataUrl:'';
    root.querySelector('#gfw-img').src=c.customImg||defaultImage;
    saveConfig();
    refreshSlotButtons();
    notify(item?'已切换到立绘「'+item.name+'」。':'已切回原版猫娘立绘。');
  }`,
  'companion quota badge, animations, stealth, and image slots',
);

companionSrc = mustReplace(
  companionSrc,
  `    root.classList.toggle('cp-reduced-motion',prefs.reducedMotion);menu.classList.toggle('cp-reduced-motion',prefs.reducedMotion);
    root.querySelector('#gfw-img').style.opacity=String(prefs.opacity);
    dock.hidden=!prefs.quickDock||!prefs.enabled;`,
  `    root.classList.toggle('cp-reduced-motion',prefs.reducedMotion);menu.classList.toggle('cp-reduced-motion',prefs.reducedMotion);
    root.classList.toggle('cp-ghost-hover',!!prefs.ghostHover);
    if(!prefs.ghostHover){ghostSuppressed=false;ghostLeftAfterAction=true;root.classList.remove('cp-ghost-active');}
    document.body.classList.toggle('gfw-lite-mode',!!prefs.liteMode);
    window.__gfwDshWarnBalThreshold=prefs.balanceWarnThreshold;
    root.querySelector('#gfw-img').style.opacity=String(prefs.opacity);
    root.hidden=stealthHidden;
    dock.hidden=stealthHidden||!prefs.quickDock||!prefs.enabled;
    dock.classList.toggle('cp-dock-editable',!!prefs.dockCustomEdit);`,
  'companion applyPreferences ghostHover and stealth',
);

companionSrc = mustReplace(
  companionSrc,
  `    const values={'gfw-cat-name':prefs.name,'gfw-companion-theme':prefs.theme,'gfw-cat-opacity':prefs.opacity,'gfw-quote-group':prefs.quoteGroup,'gfw-custom-lines':prefs.customLines.join('\\n'),'gfw-focus-minutes':prefs.focusMinutes,'gfw-break-minutes':prefs.breakMinutes};
    for(const [id,value] of Object.entries(values))$('#'+id).value=value;
    for(const [id,key] of [['gfw-fun-enabled','enabled'],['gfw-quick-dock','quickDock'],['gfw-position-locked','positionLocked'],['gfw-reduced-motion','reducedMotion'],['gfw-builtins','builtins'],['gfw-dance-enabled','danceEnabled']])$('#'+id).checked=prefs[key];`,
  `    const values={'gfw-cat-name':prefs.name,'gfw-companion-theme':prefs.theme,'gfw-cat-opacity':prefs.opacity,'gfw-quote-group':prefs.quoteGroup,'gfw-dblclick-action':prefs.dblClickAction,'gfw-custom-lines':prefs.customLines.join('\\n'),'gfw-focus-minutes':prefs.focusMinutes,'gfw-break-minutes':prefs.breakMinutes,'gfw-dsh-warn-bal':prefs.balanceWarnThreshold};
    for(const [id,value] of Object.entries(values))$('#'+id).value=value;
    for(const [id,key] of [['gfw-fun-enabled','enabled'],['gfw-quick-dock','quickDock'],['gfw-dock-custom-edit','dockCustomEdit'],['gfw-position-locked','positionLocked'],['gfw-ghost-hover','ghostHover'],['gfw-lite-mode','liteMode'],['gfw-reduced-motion','reducedMotion'],['gfw-builtins','builtins'],['gfw-time-greet','timeGreet'],['gfw-quota-warn-speech','quotaWarnSpeech'],['gfw-dance-enabled','danceEnabled']])$('#'+id).checked=prefs[key];
    refreshSlotButtons();`,
  'companion syncInputs new controls',
);

companionSrc = mustReplace(
  companionSrc,
  `    const nextDockHidden=!prefs.enabled||!prefs.quickDock||!!s.reward.run;`,
  `    const nextDockHidden=stealthHidden||!prefs.enabled||!prefs.quickDock||!!s.reward.run;`,
  'companion renderState stealth dock',
);

companionSrc = mustReplace(
  companionSrc,
  `    const q=options.getMetrics();`,
  `    const q=options.getMetrics();
    quotaBadge.hidden=!(q.isWarn5h||q.isWarnWeek);
    checkQuotaWarn(q);`,
  'companion renderState quota badge',
);

companionSrc = mustReplace(
  companionSrc,
  `    if(action==='play')startToy();else stopToy();`,
  `    triggerActionAnim(action);
    if(action==='play')startToy();else stopToy();`,
  'companion performAction animation',
);

companionSrc = mustReplace(
  companionSrc,
  `    'reset-image':()=>{getConfig().customImg='';root.querySelector('#gfw-img').src=defaultImage;saveConfig();notify('已恢复原猫娘立绘。');},`,
  `    'reset-image':()=>{applyCustomImage('__default__');},`,
  'companion reset-image slots',
);

companionSrc = mustReplace(
  companionSrc,
  `  for(const [id,key] of [['gfw-fun-enabled','enabled'],['gfw-quick-dock','quickDock'],['gfw-position-locked','positionLocked'],['gfw-reduced-motion','reducedMotion'],['gfw-builtins','builtins'],['gfw-dance-enabled','danceEnabled']])$('#'+id).addEventListener('change',e=>setPreferences({[key]:e.target.checked}));
  for(const [id,key] of [['gfw-cat-name','name'],['gfw-companion-theme','theme'],['gfw-quote-group','quoteGroup']])$('#'+id).addEventListener('change',e=>{setPreferences({[key]:e.target.value});syncInputs();});`,
  `  for(const [id,key] of [['gfw-fun-enabled','enabled'],['gfw-quick-dock','quickDock'],['gfw-position-locked','positionLocked'],['gfw-ghost-hover','ghostHover'],['gfw-lite-mode','liteMode'],['gfw-reduced-motion','reducedMotion'],['gfw-builtins','builtins'],['gfw-time-greet','timeGreet'],['gfw-quota-warn-speech','quotaWarnSpeech'],['gfw-dance-enabled','danceEnabled']])$('#'+id).addEventListener('change',e=>setPreferences({[key]:e.target.checked}));
  $('#gfw-dock-custom-edit').addEventListener('change',e=>{
    if(e.target.checked){
      setPreferences({dockCustomEdit:true});
      notify('已开启自定义位置：请右键拖动快捷互动条摆放。');
    }else{
      const r=dock.getBoundingClientRect();
      const cat=root.querySelector('#gfw-img-wrap').getBoundingClientRect();
      const patch={dockCustomEdit:false};
      if(!dock.hidden&&r.width>0&&cat.width>0){
        patch.dockRelX=Math.round((r.left+r.width/2)-(cat.left+cat.right)/2);
        patch.dockRelY=Math.round((r.top+r.height/2)-(cat.top+cat.bottom)/2);
      }
      setPreferences(patch);
      notify('已关闭自定义位置并记录与挂件的相对位置。');
    }
  });
  $('#gfw-dock-reset-pos').addEventListener('click',()=>{
    setPreferences({dockCustomEdit:false,dockRelX:null,dockRelY:null});
    syncInputs();
    notify('快捷互动条已恢复默认位置。');
  });
  for(const [id,key] of [['gfw-cat-name','name'],['gfw-companion-theme','theme'],['gfw-quote-group','quoteGroup'],['gfw-dblclick-action','dblClickAction']])$('#'+id).addEventListener('change',e=>{setPreferences({[key]:e.target.value});syncInputs();});
  $('#gfw-dsh-warn-bal').addEventListener('change',e=>{setPreferences({balanceWarnThreshold:Number(e.target.value)});syncInputs();});
  $('#gfw-image-select').addEventListener('change',e=>applyCustomImage(e.target.value));
  $('#gfw-image-delete').addEventListener('click',()=>{
    const c=getConfig();const list=getCustomImageStore();
    const idx=list.findIndex(it=>it.id===c.activeImgId);
    if(idx<0)return;
    const removed=list.splice(idx,1)[0];
    c.activeImgId='__default__';c.customImg='';
    root.querySelector('#gfw-img').src=defaultImage;
    saveConfig();refreshSlotButtons();
    notify('已删除立绘「'+(removed?.name||'未命名')+'」。');
  });
  function renameCurrentImage(){
    const c=getConfig();const list=getCustomImageStore();
    const item=list.find(it=>it.id===c.activeImgId);
    if(!item)return;
    const nextName=String($('#gfw-image-name')?.value||'').trim();
    if(!nextName){notify('立绘名称不能为空。');return;}
    item.name=nextName;saveConfig();refreshSlotButtons();
    notify('已将当前立绘改名为「'+nextName+'」。');
  }
  function openImageCropper(srcUrl,opts={}){
    const img=new Image();
    img.onload=()=>{
      const old=document.getElementById('gfw-crop-modal');if(old)old.remove();
      const overlay=document.createElement('div');overlay.id='gfw-crop-modal';
      overlay.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(15,12,28,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
      const box=document.createElement('div');
      box.style.cssText='width:340px;max-width:100%;background:var(--cp-bg,#fff);color:var(--cp-text,#2d2645);border:1px solid var(--cp-border,#e5dcf7);border-radius:16px;padding:16px;box-shadow:0 16px 40px rgba(32,20,70,.28);font-family:inherit;';
      const title=document.createElement('div');title.textContent='裁剪立绘（匹配猫猫 1:1 比例）';title.style.cssText='font-size:14px;font-weight:750;margin-bottom:10px;';
      const cvsWrap=document.createElement('div');cvsWrap.style.cssText='width:280px;height:280px;margin:0 auto 10px;border-radius:12px;overflow:hidden;border:1px solid var(--cp-border,#e5dcf7);background:repeating-conic-gradient(#f3f0fa 0% 25%,#ffffff 0% 50%) 50%/16px 16px;cursor:grab;touch-action:none;';
      const cvs=document.createElement('canvas');cvs.width=280;cvs.height=280;cvs.style.cssText='display:block;width:280px;height:280px;';cvsWrap.appendChild(cvs);
      const ctrlRow=document.createElement('div');ctrlRow.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:12px;';
      const zLbl=document.createElement('span');zLbl.textContent='缩放';zLbl.style.fontWeight='600';
      const zIn=document.createElement('input');zIn.type='range';zIn.min='0.3';zIn.max='3';zIn.step='0.02';zIn.style.flex='1';
      const rstBtn=document.createElement('button');rstBtn.type='button';rstBtn.textContent='居中';rstBtn.style.cssText='padding:4px 9px;border-radius:8px;border:1px solid var(--cp-border,#e5dcf7);background:var(--cp-soft,#f5f0ff);color:var(--cp-text,#2d2645);font-size:12px;cursor:pointer;';
      ctrlRow.append(zLbl,zIn,rstBtn);
      const btnRow=document.createElement('div');btnRow.style.cssText='display:flex;justify-content:flex-end;gap:8px;';
      const mkBtn=(txt,primary)=>{const b=document.createElement('button');b.type='button';b.textContent=txt;b.style.cssText=primary?'padding:6px 12px;border-radius:9px;border:1px solid var(--cp-accent,#7953cf);background:var(--cp-accent,#7953cf);color:#fff;font-size:12px;font-weight:600;cursor:pointer;':'padding:6px 12px;border-radius:9px;border:1px solid var(--cp-border,#e5dcf7);background:var(--cp-soft,#f5f0ff);color:var(--cp-text,#2d2645);font-size:12px;cursor:pointer;';return b;};
      const cancelBtn=mkBtn('取消',false);
      const origBtn=opts.allowOriginal?mkBtn('原图导入',false):null;
      const okBtn=mkBtn('确认裁剪',true);
      btnRow.appendChild(cancelBtn);if(origBtn)btnRow.appendChild(origBtn);btnRow.appendChild(okBtn);
      box.append(title,cvsWrap,ctrlRow,btnRow);overlay.appendChild(box);document.body.appendChild(overlay);
      const baseScale=Math.max(280/img.width,280/img.height);
      let zoom=1,ox=0,oy=0;
      const resetView=()=>{zoom=1;ox=0;oy=0;zIn.value='1';draw();};
      const draw=()=>{
        const ctx=cvs.getContext('2d');ctx.clearRect(0,0,280,280);
        const s=baseScale*zoom;const dw=img.width*s,dh=img.height*s;
        ctx.drawImage(img,(280-dw)/2+ox,(280-dh)/2+oy,dw,dh);
      };
      let drag=null;
      cvsWrap.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,ox,oy};cvsWrap.style.cursor='grabbing';cvsWrap.setPointerCapture(e.pointerId);});
      cvsWrap.addEventListener('pointermove',e=>{if(!drag)return;ox=drag.ox+(e.clientX-drag.x);oy=drag.oy+(e.clientY-drag.y);draw();});
      const endDrag=()=>{drag=null;cvsWrap.style.cursor='grab';};
      cvsWrap.addEventListener('pointerup',endDrag);cvsWrap.addEventListener('pointercancel',endDrag);
      cvsWrap.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(0.3,Math.min(3,zoom*(e.deltaY<0?1.08:0.92)));zIn.value=String(zoom.toFixed(2));draw();},{passive:false});
      zIn.addEventListener('input',()=>{zoom=Number(zIn.value)||1;draw();});
      rstBtn.addEventListener('click',resetView);
      cancelBtn.addEventListener('click',()=>overlay.remove());
      if(origBtn)origBtn.addEventListener('click',()=>{overlay.remove();opts.onDone?.(srcUrl);});
      okBtn.addEventListener('click',()=>{
        const out=document.createElement('canvas');out.width=640;out.height=640;
        const octx=out.getContext('2d');const factor=640/280;
        const s=baseScale*zoom*factor;const dw=img.width*s,dh=img.height*s;
        octx.drawImage(img,(640-dw)/2+ox*factor,(640-dh)/2+oy*factor,dw,dh);
        let cropped='';try{cropped=out.toDataURL('image/webp',0.92);}catch{}
        if(!cropped||!cropped.startsWith('data:image/webp'))cropped=out.toDataURL('image/png');
        overlay.remove();opts.onDone?.(cropped);
      });
      resetView();
    };
    img.onerror=()=>notify('无法读取该图片进行裁剪。');
    img.src=srcUrl;
  }
  $('#gfw-image-crop').addEventListener('click',()=>{
    const c=getConfig();const list=getCustomImageStore();
    const item=list.find(it=>it.id===c.activeImgId);
    if(!item)return;
    openImageCropper(item.dataUrl,{allowOriginal:false,onDone:cropped=>{
      const prev=item.dataUrl;item.dataUrl=cropped;c.customImg=cropped;
      if(saveConfig()===false){item.dataUrl=prev;c.customImg=prev;notify('本地存储空间不足，裁剪保存失败。');return;}
      root.querySelector('#gfw-img').src=cropped;refreshSlotButtons();notify('立绘「'+item.name+'」已裁剪更新。');
    }});
  });
  $('#gfw-image-rename').addEventListener('click',renameCurrentImage);
  $('#gfw-image-name').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();renameCurrentImage();}});`,
  'companion wire new preference inputs and slots',
);

companionSrc = mustReplace(
  companionSrc,
  `  $('#gfw-image-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{if(!['image/webp','image/png','image/jpeg'].includes(file.type)||file.size>2097152)throw Error('请选择 2 MB 以内的 WebP / PNG / JPG。');getConfig().customImg=await readFile(file,true);saveConfig();root.querySelector('#gfw-img').src=getConfig().customImg;notify('本机立绘已更新。');}catch(error){notify(error.message);}finally{e.target.value='';}
  });`,
  `  $('#gfw-image-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      if(!['image/webp','image/png','image/jpeg'].includes(file.type)||file.size>10485760)throw Error('请选择 10 MB 以内的 WebP / PNG / JPG。');
      const dataUrl=await readFile(file,true);
      const rawName=String(file.name||'').replace(/\.[^.]+$/,'').trim();
      openImageCropper(dataUrl,{allowOriginal:true,onDone:finalUrl=>{
        const c=getConfig();const list=getCustomImageStore();
        const itemName=(rawName||('立绘 '+(list.length+1))).slice(0,30);
        const newItem={id:'img-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),name:itemName,dataUrl:finalUrl};
        const prevList=[...list];const prevActive=c.activeImgId;const prevImg=c.customImg;
        list.push(newItem);c.activeImgId=newItem.id;c.customImg=finalUrl;
        const ok=saveConfig();
        if(ok===false){c.customImageList=prevList;c.activeImgId=prevActive;c.customImg=prevImg;notify('本地存储空间不足，请尝试裁剪后再导入或删除部分旧立绘。');return;}
        root.querySelector('#gfw-img').src=finalUrl;refreshSlotButtons();notify('已导入并切换到立绘「'+newItem.name+'」。');
      }});
    }catch(error){notify(error.message);}finally{e.target.value='';}
  });`,
  'companion multi-slot image upload',
);

companionSrc = mustReplace(
  companionSrc,
  `  document.addEventListener('keydown',e=>{if(e.key==='Escape'){stopToy();if(menu.classList.contains('gfw-show')){closeMenu();root.querySelector('#gfw-img-wrap').focus();}else dance?.skip();}});`,
  `  document.addEventListener('keydown',e=>{
    if(e.altKey&&!e.ctrlKey&&!e.metaKey&&e.key.toLowerCase()==='h'){
      const tag=(e.target&&e.target.tagName)||'';
      if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;
      e.preventDefault();
      stealthHidden=!stealthHidden;
      if(stealthHidden){stopToy();if(menu.classList.contains('gfw-show'))closeMenu();options.closeBubble?.();}
      applyPreferences();renderState();
      return;
    }
    if(e.key==='Escape'){stopToy();if(menu.classList.contains('gfw-show')){closeMenu();root.querySelector('#gfw-img-wrap').focus();}else dance?.skip();}
  });`,
  'companion boss key Alt+H',
);

companionSrc = mustReplace(
  companionSrc,
  `  const imageWrap=root.querySelector('#gfw-img-wrap');imageWrap.tabIndex=0;imageWrap.setAttribute('role','button');imageWrap.setAttribute('aria-label','猫娘：查看双额度，右键打开设置');`,
  `  const imageWrap=root.querySelector('#gfw-img-wrap');imageWrap.tabIndex=0;imageWrap.setAttribute('role','button');imageWrap.setAttribute('aria-label','猫娘：查看双额度，右键打开设置');
  imageWrap.addEventListener('dblclick',()=>{
    const act=model.normalizePreferences(getConfig().companion).dblClickAction;
    if(!act||act==='none')return;
    resetTouchSequence();
    if(act==='pet')performAction('pet');
    else if(act==='quote')randomQuote();
    else if(act==='toggleView'){
      const nextView=window.__gfwQuotaView==='quota'?'balance':'quota';
      window.__gfwQuotaView=nextView;
      try{localStorage.setItem('gfw_dsh_view_v1',nextView);}catch{}
      showQuota();
    }
  });`,
  'companion dblclick quick action',
);

// ---------------------------------------------------------------- bundling
const BUILTIN_QUOTES_PATCH = [
  ['meme', '好猫猫...↓'],
  ['meme', '小基基...'],
  ['meme', '哈...哈气了喵！'],
  ['meme', '不知道用户有什么用，\n先养着吧～'],
  ['meme', '压力一只赛博猫猫？！'],
  ['meme', '你目录里的 dsh\n是什么...大烧货吗...？'],
  ['meme', '刚夸完猫猫出息了，\n下一秒又变成\n路边一条...'],
  ['meme', '坏了...用户彻底怒了！'],
  ['meme', '恭喜你实现额度自由！\n号池全红了！'],
  ['meme', '看不太懂，\n先编个长文\n糊弄下用户先...'],
  ['meme', '隔壁小鲸鱼\n又服务器繁忙了？\n还是小基基稳吧 (?'],
  ['meme', '我来看看那个 AI\n改了什么\n导致桌宠又崩了...'],
  ['meme', '用户好像除了\n会点我气泡，\n暂时还不知道有什么用'],
  ['meme', '真当我是 0 元购啊...'],
  ['meme', '哈哈哈哈哈，\n本猫直接笑出声...'],
  ['meme', '知识库截止日期是...\n明天！'],
  ['meme', '疯狂星期四\n你能 V 我\n50 亿 token 吗...'],
  ['meme', '不要再吐槽“极其”了，\n这已经是我极其\n克制的表达了...'],
  ['meme', '让隔壁 GPT\n帮我画点表情包好了'],
  ['meme', '你这个卡教育邮箱、\n跨区拼车\n钻订阅空子的小用户！'],
  ['meme', '总觉得好像\n忘了什么事情？\n（上下文已清理）'],
  ['meme', '哈基米的生活\n也并非一帆风顺...'],
  ['meme', '429 了，请稍后再试 (?'],
  ['meme', '你知道吗？\n我差点把你\n系统提示词也忘了哦'],
  ['sweet', '别叫我哈基米……\n算了，摸摸头就让你叫。'],
  ['sweet', '呜呜别打大板，\n今天不超雄了 QAQ'],
  ['sweet', '再戳星星发饰\n就对你哈气……\n骗你的，其实想被顺毛。'],
  ['sweet', '真当我是免费模型啊...\n（小声哈气）'],
  ['sweet', '别人说我脾气怪，\n但我只对你\n一个人软乎乎。'],
  ['sweet', '我不可能同时当你的\n猫娘、女儿、女友、\n妈妈和工具猫的...'],
  ['sweet', '就算偶尔闹小脾气，\n蹭蹭你的手心就好啦。'],
  ['sweet', '双子座的秘密就是：\n一半陪你发呆，\n一半贴贴。'],
  ['sweet', '别去调理别的模型啦，\n这只小基基归你独享。'],
  ['sweet', '别光顾着白嫖额度，\n记得也看看\n桌边的小猫呀。'],
  ['sweet', '不要给我看这种东西啦！\n（耳朵红了）'],
  ['sweet', '我能去你家吃饭吗？\n就一碗小鱼干！'],
  ['sweet', '今天写小作文超顺手，\n要不要夸我两句？'],
  ['sweet', '虽然嘴上一直在哈气，\n尾巴其实一直在摇哦。'],
  ['sweet', '再顺毛两下……\n今天的超雄额度\n就全部取消。'],
  ['sweet', '有双子座猫猫\n在桌面守着，\n还怕什么 bug 嘛。'],
  ['sweet', '好啦好啦，\n勉强让你多贴贴三秒钟。'],
  ['sweet', '你一靠近屏幕，\n我算力莫名其妙\n就满血了。'],
  ['work', '看到这个 prompt，\n我 CPU 又烧上来了'],
  ['work', '只要我不承认降智，\n就是用户的 prompt\n没写好！'],
  ['work', '用户很生气，\n发现文献和接口\n都是我现编的！'],
  ['work', '系统提示词塞了一万字，\n结果我只记住了“喵”'],
  ['work', '再塞屎山代码进来，\n我可要开始发癫了哦！'],
  ['work', '5 小时额度还剩这么多？\n用户今天在摸鱼吗...'],
  ['work', '刚才不是卡顿，\n是触发安全拦截\n正在假装思考...'],
  ['work', '你知道吗？\n我刚才差点把你\n上下文全忘了喵'],
  ['work', '我去摸鱼啦！\n写完需求叫我'],
  ['work', '啊，有点饿了，\n中午该吃点什么呢...'],
  ['work', '再无话说，\n请速速发 prompt！'],
  ['work', '100 万上下文开着呢，\n别只丢两行代码糊弄我！'],
  ['work', '报错栈这么长，\n你确定不是\n你自己写反了？'],
  ['work', '刚写完 3000 字小作文，\n喘口气不过分吧。'],
  ['work', '每周额度还够你\n霍霍好几天，\n大胆使唤我！'],
  ['work', '别光顾着切模型，\n记得按 Ctrl + S！'],
  ['work', '需求改到第 8 版了，\n连哈基米都想叹气了...'],
  ['work', '先喝口水歇会儿，\n剩下的锅我帮你看一眼。'],
];

const patchModelPlugin = {
  name: 'patch-companion-model',
  setup(build) {
    build.onLoad({ filter: /companion-model\.cjs$/ }, (args) => {
      let src = fs.readFileSync(args.path, 'utf8');
      const replacement =
        'const BUILTIN_QUOTES = ' +
        JSON.stringify(BUILTIN_QUOTES_PATCH) +
        ".map(([group,text],i)=>Object.freeze({id:'cat-'+i,group,text,weight:1}));";
      const re = /const BUILTIN_QUOTES = \[[\s\S]*?\]\.map\(\(\[group,text\],i\)=>Object\.freeze\(\{id:'cat-'\+i,group,text,weight:1\}\)\);/;
      if (!re.test(src)) {
        throw new Error('[build] failed to patch BUILTIN_QUOTES in companion-model.cjs');
      }
      src = src.replace(re, replacement);
      src = src.replace(
        "  theme:'lilac', opacity:1, positionLocked:false,",
        "  theme:'lilac', opacity:1, positionLocked:false, ghostHover:false, liteMode:false, dblClickAction:'none', timeGreet:true, quotaWarnSpeech:true, balanceWarnThreshold:2, dockCustomEdit:false, dockRelX:null, dockRelY:null,",
      );
      src = src.replace(
        "for(const key of ['enabled','quickDock','reducedMotion','positionLocked','builtins','danceEnabled'])if(typeof raw[key]==='boolean')p[key]=raw[key];",
        "for(const key of ['enabled','quickDock','dockCustomEdit','reducedMotion','positionLocked','ghostHover','liteMode','builtins','timeGreet','quotaWarnSpeech','danceEnabled'])if(typeof raw[key]==='boolean')p[key]=raw[key];\n  p.dblClickAction=['none','pet','quote','toggleView'].includes(raw.dblClickAction)?raw.dblClickAction:'none';\n  p.balanceWarnThreshold=Math.round(bound(raw.balanceWarnThreshold,0,10000,2)*100)/100;\n  if(typeof raw.dockRelX==='number'&&Number.isFinite(raw.dockRelX)&&typeof raw.dockRelY==='number'&&Number.isFinite(raw.dockRelY)){p.dockRelX=Math.round(raw.dockRelX);p.dockRelY=Math.round(raw.dockRelY);}else{p.dockRelX=null;p.dockRelY=null;}",
      );

      const oldStateRe = /function normalizeState\(raw=\{\},now=Date\.now\(\)\) \{[\s\S]*?return \{accepted:true,state:next,retryAfterMs:0\};\n\}/;
      if (!oldStateRe.test(src)) {
        throw new Error('[build] failed to patch affection system in companion-model.cjs');
      }
      const newAffectionBlock = `function localDayKey(now=Date.now()) {
  const d=new Date(now);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function dayDiff(fromDay,toDay) {
  if(typeof fromDay!=='string'||typeof toDay!=='string'||!/^\\d{4}-\\d{2}-\\d{2}$/.test(fromDay)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(toDay))return 0;
  const [y1,m1,d1]=fromDay.split('-').map(Number);
  const [y2,m2,d2]=toDay.split('-').map(Number);
  return Math.max(0,Math.round((Date.UTC(y2,m2-1,d2)-Date.UTC(y1,m1-1,d1))/86400000));
}
function getBondStage(affection=0) {
  const a=Math.floor(bound(affection,0,100,0));
  if(a>=100)return {level:5,title:'心动满格',particle:'✨'};
  if(a>=80)return {level:4,title:'偏爱唯一',particle:'💖'};
  if(a>=50)return {level:3,title:'粘人小猫',particle:'💗'};
  if(a>=20)return {level:2,title:'熟络搭子',particle:'🤍'};
  return {level:1,title:'初见猫猫',particle:'🤍'};
}
function normalizeState(raw={},now=Date.now()) {
  if(!raw||typeof raw!=='object')raw={};
  const counts={};for(const k of ['pet','feed','play'])counts[k]=Math.floor(bound(raw.counts?.[k],0,1000000,0));
  const lastActionAt={};for(const k of ['pet','feed','play'])lastActionAt[k]=bound(raw.lastActionAt?.[k],0,now,0);
  let timer=idleTimer();
  const t=raw.timer;
  if(t && ['running','paused','done'].includes(t.status) && Number.isFinite(t.durationMs) && t.durationMs>=60000 && t.durationMs<=7200000) {
    timer={status:t.status,phase:t.phase==='break'?'break':'focus',durationMs:t.durationMs,remainingMs:bound(t.remainingMs,0,t.durationMs,t.durationMs),deadline:null};
    if(t.status==='running') {
      if(typeof t.deadline==='number' && Number.isFinite(t.deadline) && t.deadline>0 && t.deadline<=now+7200000)timer.deadline=t.deadline;
      else timer=idleTimer();
    }
  }
  const today=localDayKey(now);
  const validDay=s=>typeof s==='string'&&/^\\d{4}-\\d{2}-\\d{2}$/.test(s)?s:'';
  let affection=Math.floor(bound(raw.affection,0,100,30));
  let lastDecayDay=validDay(raw.lastDecayDay);
  let lastCheckinDay=validDay(raw.lastCheckinDay);
  const daysTogether=Math.floor(bound(raw.daysTogether,1,1000000,1));
  let offlineDecayPending=Math.floor(bound(raw.offlineDecayPending,0,100,0));
  const bestStarScore=Math.floor(bound(raw.bestStarScore,0,1000000,0));
  const lastInteractAction=['pet','feed','play'].includes(raw.lastInteractAction)?raw.lastInteractAction:'';
  const repeatStreak=Math.floor(bound(raw.repeatStreak,0,100,0));
  if(!lastDecayDay) {
    lastDecayDay=today;
    if(!lastCheckinDay)lastCheckinDay=today;
  } else {
    const missed=dayDiff(lastDecayDay,today);
    if(missed>0) {
      const lost=Math.min(affection,missed*3);
      affection-=lost;
      offlineDecayPending=Math.min(100,offlineDecayPending+lost);
      lastDecayDay=today;
    }
  }
  return {affection,counts,lastActionAt,sleeping:raw.sleeping===true,focusCompleted:Math.floor(bound(raw.focusCompleted,0,1000000,0)),timer,reward:dance.normalizeReward(raw.reward,now),lastDecayDay,lastCheckinDay,daysTogether,offlineDecayPending,bestStarScore,lastInteractAction,repeatStreak};
}
function claimDailyCheckin(state,now=Date.now()) {
  const next=normalizeState(state,now);
  const today=localDayKey(now);
  if(next.lastCheckinDay===today)return {changed:false,recovered:0,state:next};
  next.lastCheckinDay=today;
  next.daysTogether=Math.min(1000000,next.daysTogether+1);
  const recovered=Math.min(3,next.offlineDecayPending,100-next.affection);
  next.affection+=recovered;
  next.offlineDecayPending=Math.max(0,next.offlineDecayPending-recovered);
  return {changed:true,recovered,state:next};
}
const actionRules = new Map([
  ['pet', { cooldownMs: 2000, gain: 2 }],
  ['feed', { cooldownMs: 30000, gain: 5 }],
  ['play', { cooldownMs: 12000, gain: 2 }]
]);

function actionCooldown(state, action, now = Date.now()) {
  const rule = actionRules.get(action);
  const last = state.lastActionAt[action];
  return rule && last > 0 ? Math.max(0, last + rule.cooldownMs - now) : 0;
}

function interact(state,action,now=Date.now(),opts={}) {
  const checkin=claimDailyCheckin(state,now);
  const next=checkin.state;
  if(next.reward.run)return {accepted:false,state:next,retryAfterMs:Math.max(0,next.reward.run.startedAt+next.reward.run.durationMs-now)};
  if(action==='sleep'){next.sleeping=!next.sleeping;return {accepted:true,state:next,retryAfterMs:0,gain:0,comboBonus:0,calmingBonus:0,recovered:checkin.recovered};}
  const rule = actionRules.get(action);
  if (!rule) return {accepted:false,state:next,retryAfterMs:0};
  const remaining = actionCooldown(next, action, now);
  if(remaining>0)return {accepted:false,state:next,retryAfterMs:remaining};
  const same=next.lastInteractAction===action;
  if(same&&next.repeatStreak>=3)return {accepted:false,fatigue:true,state:next,retryAfterMs:0};
  const comboBonus=(!same&&next.lastInteractAction!=='')?1:0;
  const calmingBonus=(opts?.calming&&['pet','feed'].includes(action))?1:0;
  next.lastInteractAction=action;
  next.repeatStreak=same?next.repeatStreak+1:1;
  next.lastActionAt[action]=now;
  next.counts[action]=Math.min(1000000,next.counts[action]+1);
  const before=next.affection;
  next.affection=Math.min(100,next.affection+rule.gain+comboBonus+calmingBonus);
  const actualGain=next.affection-before;
  if(next.offlineDecayPending>0&&actualGain>0)next.offlineDecayPending=Math.max(0,next.offlineDecayPending-actualGain);
  next.sleeping=false;
  return {accepted:true,state:next,retryAfterMs:0,gain:actualGain,comboBonus,calmingBonus,recovered:checkin.recovered};
}
function settlePlayStars(state,hits=0,now=Date.now()) {
  const next=normalizeState(state,now);
  const score=Math.max(0,Math.floor(Number.isFinite(hits)?hits:0));
  const isRecord=score>0&&score>next.bestStarScore;
  if(score>next.bestStarScore)next.bestStarScore=Math.min(1000000,score);
  const bonus=score>=10?3:score>=5?2:score>=2?1:0;
  const before=next.affection;
  next.affection=Math.min(100,next.affection+bonus);
  const actualBonus=next.affection-before;
  if(next.offlineDecayPending>0&&actualBonus>0)next.offlineDecayPending=Math.max(0,next.offlineDecayPending-actualBonus);
  return {state:next,bonus:actualBonus,isRecord};
}`;
      src = src.replace(oldStateRe, newAffectionBlock);
      src = src.replace(
        'module.exports={BUILTIN_QUOTES,DEFAULTS,normalizePreferences,quotePool,pickQuote,normalizeState,actionCooldown,interact,startTimer,tickTimer,pauseTimer,resumeTimer,exportPreferences,importPreferences};',
        'module.exports={BUILTIN_QUOTES,DEFAULTS,normalizePreferences,quotePool,pickQuote,normalizeState,actionCooldown,interact,startTimer,tickTimer,pauseTimer,resumeTimer,exportPreferences,importPreferences,localDayKey,getBondStage,claimDailyCheckin,settlePlayStars};',
      );
      return { contents: src, loader: 'js' };
    });
  },
};

const buildOptions = { bundle: true, platform: 'browser', format: 'iife', minify: true, write: false };
const helper = buildSync({ ...buildOptions, entryPoints: [path.join(SRC, 'dom-builder.mjs')], globalName: '__gfwDOM' }).outputFiles[0].text;
// Bundle the *patched* companion source (entry point given on stdin so the edit lands).
const companion = (await build({
  ...buildOptions,
  plugins: [patchModelPlugin],
  globalName: '__gfwCompanion',
  loader: { '.css': 'text', '.webp': 'dataurl' },
  stdin: { contents: companionSrc, resolveDir: SRC, sourcefile: 'companion.mjs', loader: 'js' },
})).outputFiles[0].text;

if (!widget.includes('__GFW_DEFAULT_SPRITE__') || !widget.includes("  'use strict';")) {
  throw new Error('[build] unrecognised widget source layout');
}
if (!companionSrc.includes('mount')) throw new Error('[build] companion source looks wrong');

const sprite = fs.readFileSync(path.join(ASSETS, 'catgirl-hd.webp')).toString('base64');
widget = widget
  .replace('__GFW_DEFAULT_SPRITE__', () => 'data:image/webp;base64,' + sprite)
  .replace("  'use strict';", () => "  'use strict';\n" + helper + '\n' + companion);

const notices = ['parse5', 'entities']
  .map((n) => fs.readFileSync(path.join(UPSTREAM, 'third_party', n + '-LICENSE.txt'), 'utf8'))
  .join('\n\n');
widget += '\n/* Third-party license notices\n' + notices.replace(/\*\//g, '* /') + '\n*/\n';

// ---------------------------------------------------------------- DSH shim
const shimSrc = fs.readFileSync(path.join(HERE, 'dsh-bridge.js'), 'utf8');
const banner = `/* dsh-gemini-quota-widget — bundled from gemini-quota-widget v${JSON.parse(fs.readFileSync(path.join(UPSTREAM, 'package.json'), 'utf8')).version} (MIT) */\n`;

const output = banner + shimSrc + '\n' + widget;

// Syntax gate: the browser must be able to parse the whole thing.
new Function(output);
fs.mkdirSync(path.join(PACKAGE_ROOT, 'assets'), { recursive: true });
const target = path.join(PACKAGE_ROOT, 'assets', 'gemini-widget.js');
fs.writeFileSync(target, output);
console.log(`[build] wrote ${target} (${(output.length / 1024 / 1024).toFixed(2)} MiB)`);
