/* DSH bridge shim — bundled in front of the catgirl quota widget.
 *
 * Upstream gemini-quota-widget reads `window.__gfwOfficialQuota`, a sample the
 * Gemini desktop client injects. In DSH there is no such client, so this shim
 * pulls the same contract from the host routes served by lib/index.js and
 * dispatches the `gfw-official-quota` event the widget already listens for.
 *
 * It also wires the "额度数据与手动填写" rows that build-widget.mjs injects into
 * the widget's own settings panel.
 */
;(function () {
  'use strict';
  var BASE = '/dsh-gemini-quota';
  var POLL_MS = 15000;
  var state = null;
  var inflight = null;
  var bound = false;

  // 气泡默认显示 DSH 余额；用户点过「切换」就记住上次的视图。
  try {
    window.__gfwQuotaView = localStorage.getItem('gfw_dsh_view_v1') === 'quota' ? 'quota' : 'balance';
    window.__gfwShowTurnCost = localStorage.getItem('gfw_dsh_show_turn_cost_v1') !== '0';
    window.__gfwShowGeminiTurnQuota = localStorage.getItem('gfw_dsh_show_gemini_turn_quota_v1') !== '0';
  } catch (err) {
    window.__gfwQuotaView = 'balance';
    window.__gfwShowTurnCost = true;
    window.__gfwShowGeminiTurnQuota = true;
  }

  function el(id) { return document.getElementById(id); }

  function dispatchUpdate() {
    try { window.dispatchEvent(new Event('gfw-official-quota')); } catch (err) {}
  }

  function fmtTime(ms) {
    if (!ms) return '';
    try {
      return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
    } catch (err) { return ''; }
  }

  function formatResetText(resetTimeStr, isWeekly) {
    if (!resetTimeStr) return '';
    try {
      var d = new Date(resetTimeStr);
      var diffMs = d.getTime() - Date.now();
      if (Number.isNaN(d.getTime()) || diffMs <= 0) return '已重置 · 可用';
      var totalMins = Math.ceil(diffMs / 60000);
      var days = Math.floor(totalMins / 1440);
      var hours = Math.floor((totalMins % 1440) / 60);
      var mins = totalMins % 60;
      var countdown = days > 0
        ? days + '天 ' + hours + '小时'
        : (hours > 0 ? hours + '小时 ' + mins + '分钟' : mins + '分钟');
      var hh = String(d.getHours()).padStart(2, '0');
      var mm = String(d.getMinutes()).padStart(2, '0');
      return (days >= 1 || isWeekly)
        ? (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hh + ':' + mm + ' (' + countdown + ')'
        : hh + ':' + mm + ' (' + countdown + ')';
    } catch (e) {
      return '';
    }
  }

  function setInput(id, value) {
    var node = el(id);
    if (!node || document.activeElement === node) return;
    node.value = value == null ? '' : String(value);
  }

  function paint() {
    var src = el('gfw-dsh-src');
    if (!src) return;
    if (!state) {
      src.textContent = '读取失败 · 请刷新页面';
      src.style.color = '#dc2626';
      return;
    }
    var isAgy = state.source === 'agy-link' || (state.sample && state.sample.source === 'agy-link');
    if (isAgy) {
      src.style.color = '#059669';
      var email = (state.agy && state.agy.email) || (state.sample && state.sample.accountEmail) || '';
      var ts = (state.sample && (state.sample.agyUpdatedAt || state.sample.updatedAt)) || (state.agy && state.agy.updatedAt);
      src.textContent = 'Antigravity 实时同步' + (email ? ' · ' + email : '') + ' · ' + (fmtTime(ts) || '刚刚');
    } else {
      src.style.color = '#64748b';
      src.textContent = '等待 Antigravity 实时同步';
    }

    var cardTitle = document.querySelector('#gfw-dsh-manual-card h3');
    var cardHint = document.querySelector('#gfw-dsh-manual-card p');
    if (cardTitle && cardHint) {
      if (isAgy) {
        cardTitle.textContent = 'Gemini 额度（Antigravity 实时同步）';
        cardHint.textContent = '已自动从 dsh-agy-link 读取实时额度并同步到挂件。';
      } else {
        cardTitle.textContent = 'Gemini 额度（等待同步）';
        cardHint.textContent = '等待 dsh-agy-link 同步实时额度。';
      }
    }

    var heading = document.querySelector('#gfw-panel-quota h3');
    if (heading && (/官方剩余额度/.test(heading.textContent || '') || /剩余额度/.test(heading.textContent || ''))) {
      heading.textContent = isAgy
        ? 'Gemini 剩余额度 · Antigravity'
        : (state.sample && state.sample.source === 'dsh-manual' ? '剩余额度 · 手动填写' : 'Google 官方剩余额度');
    }
  }

  function applyState(data) {
    if (!data || data.ok !== true) return;
    state = data;
    window.__gfwOfficialQuota = data.sample || null;
    if (data.balance !== undefined) window.__gfwDshBalance = data.balance;
    dispatchUpdate();
    paint();
    paintBalance();
  }

  function getJSON(url) {
    return fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (res) { return res.ok ? res.json() : null; });
  }

  function pull() {
    if (inflight) return inflight;
    inflight = getJSON(BASE + '/api/quota')
      .then(function (data) {
        if (!data) return;
        // 如果后端还没改或者还在返回 manual，尝试向本页同源的 /plugins/agy-link/pool 索取真实 agy 额度
        if (!data.sample || data.sample.source !== 'agy-link') {
          return getJSON('/plugins/agy-link/pool')
            .then(function (poolData) {
              if (poolData && Array.isArray(poolData.accounts)) {
                var activeId = (poolData.activeAccountIds && poolData.activeAccountIds.google) || poolData.activeAccountId || poolData.primaryAccountId;
                var acc = poolData.accounts.find(function (a) { return a.id === activeId && a.enabled && a.quotas && a.quotas.google; })
                  || poolData.accounts.find(function (a) { return a.enabled && a.quotas && a.quotas.google; })
                  || poolData.accounts.find(function (a) { return a.quotas && a.quotas.google; });
                if (acc && acc.quotas && acc.quotas.google) {
                  var q = acc.quotas.google;
                  var frac5h = typeof q.remainingFraction === 'number' ? q.remainingFraction : null;
                  var fracWeek = typeof q.weeklyFraction === 'number' ? q.weeklyFraction : null;
                  if (frac5h !== null || fracWeek !== null) {
                    var rem5h = frac5h != null ? Math.max(0, Math.min(100, Math.round(frac5h * 1000) / 10)) : 100;
                    var remWeek = fracWeek != null ? Math.max(0, Math.min(100, Math.round(fracWeek * 1000) / 10)) : 100;
                    data.mode = 'agy-link';
                    data.source = 'agy-link';
                    data.agy = { email: acc.email || '', updatedAt: q.updatedAt || Date.now() };
                    data.sample = {
                      source: 'agy-link',
                      sourceLabel: 'Antigravity 实时同步' + (acc.email ? ' (' + acc.email + ')' : ''),
                      accountEmail: acc.email || '',
                      updatedAt: Date.now(),
                      agyUpdatedAt: q.updatedAt || Date.now(),
                      fiveHour: {
                        usedPct: Math.round((100 - rem5h) * 10) / 10,
                        remainingPct: rem5h,
                        resetText: formatResetText(q.resetTime, false),
                      },
                      week: {
                        usedPct: Math.round((100 - remWeek) * 10) / 10,
                        remainingPct: remWeek,
                        resetText: formatResetText(q.weeklyResetTime, true),
                      },
                    };
                  }
                }
              }
              applyState(data);
            })
            .catch(function () { applyState(data); });
        }
        applyState(data);
      })
      .catch(function () {})
      .then(function () { inflight = null; });
    return inflight;
  }

  // ------------------------------------------------------------ DSH 余额
  var balanceInFlight = null;

  function money(bal) {
    if (!bal || bal.ok !== true) return '—';
    var num = Number(bal.totalBalance);
    if (!Number.isFinite(num)) return '—';
    var cur = String(bal.currency || 'CNY').toUpperCase();
    var sym = cur === 'CNY' ? '¥' : cur === 'USD' ? '$' : cur + ' ';
    return sym + num.toFixed(2);
  }

  function balanceNoteText(bal) {
    if (!bal) return '读取中…';
    if (bal.ok !== true) return '读不到余额：' + String(bal.error || bal.code || '未知原因');
    var parts = [];
    if (bal.rechargeBalance != null) parts.push('充值 ' + money({ ok: true, currency: bal.currency, totalBalance: bal.rechargeBalance }));
    if (bal.bonusBalance != null) parts.push('赠金 ' + money({ ok: true, currency: bal.currency, totalBalance: bal.bonusBalance }));
    parts.push((bal.source === 'apikey' ? 'API key' : '账号登录') + ' · ' + (fmtTime(bal.updatedAt) || '刚刚'));
    return parts.join(' · ');
  }

  function paintBalance() {
    var amount = el('gfw-dsh-bal-amount');
    if (!amount) return;
    var bal = window.__gfwDshBalance || null;
    amount.textContent = money(bal);
    amount.style.color = bal && bal.ok === true ? '#4f46e5' : '#94a3b8';
    var note = el('gfw-dsh-bal-note');
    if (note) note.textContent = balanceNoteText(bal);
  }

  function pullBalance(force) {
    if (balanceInFlight) return balanceInFlight;
    balanceInFlight = getJSON(BASE + '/api/balance' + (force ? '?force=1' : ''))
      .then(function (data) {
        if (data && data.ok) window.__gfwDshBalance = data.balance || null;
        paintBalance();
        dispatchUpdate();
      })
      .catch(function () {})
      .then(function () { balanceInFlight = null; });
    return balanceInFlight;
  }

  // 气泡视图（DSH 余额 / Gemini 额度）由面板里的按钮切换
  function paintViewButtons() {
    var cur = window.__gfwQuotaView === 'quota' ? 'quota' : 'balance';
    [['balance', 'gfw-dsh-view-balance'], ['quota', 'gfw-dsh-view-quota']].forEach(function (pair) {
      var btn = el(pair[1]);
      if (!btn) return;
      var on = pair[0] === cur;
      btn.style.background = on ? '#7c3aed' : '';
      btn.style.borderColor = on ? '#7c3aed' : '';
      btn.style.color = on ? '#fff' : '';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function setView(view) {
    window.__gfwQuotaView = view === 'quota' ? 'quota' : 'balance';
    try { localStorage.setItem('gfw_dsh_view_v1', window.__gfwQuotaView); } catch (err) {}
    paintViewButtons();
    paintBalance();
    dispatchUpdate();
  }

  function mountBalanceCard() {
    var panel = el('gfw-panel-quota');
    if (!panel) return false;
    if (el('gfw-dsh-balance-card')) { paintBalance(); paintViewButtons(); return true; }

    var viewCard = document.createElement('div');
    viewCard.className = 'cp-card';
    viewCard.id = 'gfw-dsh-view-card';
    var viewTitle = document.createElement('h3');
    viewTitle.textContent = '气泡显示设置';
    viewCard.appendChild(viewTitle);
    var viewRow = document.createElement('div');
    viewRow.className = 'gfw-m-row';
    viewRow.style.margin = '0';
    viewRow.style.padding = '0';
    viewRow.style.borderTop = 'none';
    var viewLabel = document.createElement('span');
    viewLabel.className = 'gfw-m-label';
    viewLabel.textContent = '气泡显示';
    var viewCtrl = document.createElement('div');
    viewCtrl.className = 'gfw-m-ctrl';
    viewCtrl.style.display = 'flex';
    viewCtrl.style.gap = '6px';
    var viewBalanceBtn = document.createElement('button');
    viewBalanceBtn.type = 'button';
    viewBalanceBtn.className = 'gfw-btn-sm';
    viewBalanceBtn.id = 'gfw-dsh-view-balance';
    viewBalanceBtn.textContent = 'DSH 余额';
    viewBalanceBtn.addEventListener('click', function () { setView('balance'); });
    var viewQuotaBtn = document.createElement('button');
    viewQuotaBtn.type = 'button';
    viewQuotaBtn.className = 'gfw-btn-sm';
    viewQuotaBtn.id = 'gfw-dsh-view-quota';
    viewQuotaBtn.textContent = 'Gemini 额度';
    viewQuotaBtn.addEventListener('click', function () { setView('quota'); });
    viewCtrl.appendChild(viewBalanceBtn);
    viewCtrl.appendChild(viewQuotaBtn);
    viewRow.appendChild(viewLabel);
    viewRow.appendChild(viewCtrl);
    viewCard.appendChild(viewRow);

    var turnCostRow = document.createElement('label');
    turnCostRow.className = 'cp-row';
    turnCostRow.style.marginTop = '10px';
    turnCostRow.style.paddingTop = '10px';
    turnCostRow.style.borderTop = '1px solid var(--cp-border)';
    var turnCostSpan = document.createElement('span');
    turnCostSpan.textContent = '对话完显示 DSH 余额花费';
    var turnCostSmall = document.createElement('small');
    turnCostSmall.textContent = 'DSH 余额模式下弹窗并在气泡展示本轮花费';
    turnCostSpan.appendChild(turnCostSmall);
    var turnCostInput = document.createElement('input');
    turnCostInput.type = 'checkbox';
    turnCostInput.id = 'gfw-dsh-show-turn-cost';
    turnCostInput.checked = window.__gfwShowTurnCost !== false;
    turnCostInput.addEventListener('change', function () {
      window.__gfwShowTurnCost = !!turnCostInput.checked;
      try { localStorage.setItem('gfw_dsh_show_turn_cost_v1', window.__gfwShowTurnCost ? '1' : '0'); } catch (err) {}
      dispatchUpdate();
    });
    turnCostRow.appendChild(turnCostSpan);
    turnCostRow.appendChild(turnCostInput);
    viewCard.appendChild(turnCostRow);

    var geminiTurnRow = document.createElement('label');
    geminiTurnRow.className = 'cp-row';
    geminiTurnRow.style.marginTop = '8px';
    geminiTurnRow.style.paddingTop = '8px';
    geminiTurnRow.style.borderTop = '1px solid var(--cp-border)';
    var geminiTurnSpan = document.createElement('span');
    geminiTurnSpan.textContent = '对话完显示 Gemini 5h 剩余';
    var geminiTurnSmall = document.createElement('small');
    geminiTurnSmall.textContent = 'Gemini 额度模式下回复结束时弹窗提示 5h 剩余额度';
    geminiTurnSpan.appendChild(geminiTurnSmall);
    var geminiTurnInput = document.createElement('input');
    geminiTurnInput.type = 'checkbox';
    geminiTurnInput.id = 'gfw-dsh-show-gemini-turn-quota';
    geminiTurnInput.checked = window.__gfwShowGeminiTurnQuota !== false;
    geminiTurnInput.addEventListener('change', function () {
      window.__gfwShowGeminiTurnQuota = !!geminiTurnInput.checked;
      try { localStorage.setItem('gfw_dsh_show_gemini_turn_quota_v1', window.__gfwShowGeminiTurnQuota ? '1' : '0'); } catch (err) {}
    });
    geminiTurnRow.appendChild(geminiTurnSpan);
    geminiTurnRow.appendChild(geminiTurnInput);
    viewCard.appendChild(geminiTurnRow);

    var card = document.createElement('div');
    card.className = 'cp-card';
    card.id = 'gfw-dsh-balance-card';

    var title = document.createElement('h3');
    title.textContent = 'DSH 余额（DeepSeek）';
    card.appendChild(title);

    var hint = document.createElement('p');
    hint.textContent = '直接读你当前登录的 DSH 账号余额；没登录账号时退回 DEEPSEEK_API_KEY。密钥不经过这个插件。';
    card.appendChild(hint);

    var row = document.createElement('div');
    row.className = 'gfw-m-row';
    var label = document.createElement('span');
    label.className = 'gfw-m-label';
    label.textContent = '可用余额';
    var ctrl = document.createElement('div');
    ctrl.className = 'gfw-m-ctrl';
    var amount = document.createElement('span');
    amount.id = 'gfw-dsh-bal-amount';
    amount.style.fontSize = '22px';
    amount.style.fontWeight = '700';
    amount.textContent = '—';
    ctrl.appendChild(amount);
    row.appendChild(label);
    row.appendChild(ctrl);
    card.appendChild(row);

    var noteRow = document.createElement('div');
    noteRow.className = 'gfw-m-row';
    var noteLabel = document.createElement('span');
    noteLabel.className = 'gfw-m-label';
    noteLabel.textContent = '构成';
    var noteCtrl = document.createElement('div');
    noteCtrl.className = 'gfw-m-ctrl';
    var note = document.createElement('span');
    note.id = 'gfw-dsh-bal-note';
    note.style.fontSize = '11px';
    note.style.color = '#64748b';
    note.textContent = '读取中…';
    noteCtrl.appendChild(note);
    noteRow.appendChild(noteLabel);
    noteRow.appendChild(noteCtrl);
    card.appendChild(noteRow);

    var actionRow = document.createElement('div');
    actionRow.className = 'gfw-m-row';
    var actionLabel = document.createElement('span');
    actionLabel.className = 'gfw-m-label';
    actionLabel.textContent = '刷新';
    var actionCtrl = document.createElement('div');
    actionCtrl.className = 'gfw-m-ctrl';
    var refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'gfw-btn-sm';
    refreshBtn.id = 'gfw-dsh-bal-refresh';
    refreshBtn.textContent = '立即刷新余额';
    refreshBtn.addEventListener('click', function () {
      flash(refreshBtn, '刷新中…');
      pullBalance(true).then(function () { flash(refreshBtn, '已刷新'); });
    });
    actionCtrl.appendChild(refreshBtn);
    actionRow.appendChild(actionLabel);
    actionRow.appendChild(actionCtrl);
    card.appendChild(actionRow);

    var manualCard = el('gfw-dsh-manual-card');
    var anchor = manualCard || panel.firstChild;
    panel.insertBefore(viewCard, anchor);
    panel.insertBefore(card, anchor);
    paintBalance();
    paintViewButtons();
    return true;
  }

  function sendManual(payload) {
    return fetch(BASE + '/api/manual', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (res) { return res.json().catch(function () { return null; }); });
  }

  function flash(btn, text) {
    if (!btn) return;
    if (!btn.__gfwLabel) btn.__gfwLabel = btn.textContent;
    btn.textContent = text;
    clearTimeout(btn.__gfwTimer);
    btn.__gfwTimer = setTimeout(function () {
      if (btn.__gfwLabel) btn.textContent = btn.__gfwLabel;
    }, 1800);
  }

  function readPct(id) {
    var node = el(id);
    if (!node) return null;
    var raw = String(node.value == null ? '' : node.value).trim();
    if (!raw) return null;
    var num = Number(raw);
    return Number.isFinite(num) ? num : NaN;
  }

  function value(id) {
    var node = el(id);
    return node ? String(node.value || '').trim() : '';
  }

  function save() {
    var btn = el('gfw-dsh-save');
    var fiveHour = readPct('gfw-dsh-used-5h');
    var weekly = readPct('gfw-dsh-used-week');
    if (Number.isNaN(fiveHour) || Number.isNaN(weekly)) {
      flash(btn, '只能是数字');
      return;
    }
    if ((fiveHour === null) !== (weekly === null)) {
      flash(btn, '两个百分比都要填');
      return;
    }
    sendManual({
      fiveHourUsedPct: fiveHour,
      weeklyUsedPct: weekly,
      fiveHourResetText: value('gfw-dsh-reset-5h'),
      weeklyResetText: value('gfw-dsh-reset-week'),
    }).then(function (data) {
      if (data && data.ok) {
        applyState(data);
        flash(btn, '已保存 ✓');
      } else {
        flash(btn, (data && data.error) || '保存失败');
      }
    }).catch(function () { flash(btn, '保存失败'); });
  }

  function clear() {
    var btn = el('gfw-dsh-clear');
    sendManual({ fiveHourUsedPct: null, weeklyUsedPct: null, fiveHourResetText: '', weeklyResetText: '' })
      .then(function (data) {
        if (data && data.ok) {
          applyState(data);
          flash(btn, '已清空');
        } else {
          flash(btn, (data && data.error) || '清空失败');
        }
      })
      .catch(function () { flash(btn, '清空失败'); });
  }

  function bind() {
    if (bound) return true;
    var saveBtn = el('gfw-dsh-save');
    if (!saveBtn) return false;
    bound = true;
    saveBtn.addEventListener('click', save);
    var clearBtn = el('gfw-dsh-clear');
    if (clearBtn) clearBtn.addEventListener('click', clear);
    return true;
  }

  // The companion panel replaces the classic settings menu, so the rows injected
  // into `#gfw-quota-panel` would never be reachable. Move the whole block into
  // the quota tab of the companion panel instead.
  function mountCard() {
    var panel = el('gfw-panel-quota');
    if (!panel) return false;
    if (el('gfw-dsh-manual-card')) return true;
    var block = el('gfw-dsh-manual-block');
    if (!block) return false;
    var card = document.createElement('div');
    card.className = 'cp-card';
    card.id = 'gfw-dsh-manual-card';
    var title = document.createElement('h3');
    title.textContent = 'Gemini 额度来源';
    var hint = document.createElement('p');
    hint.textContent = '自动从 dsh-agy-link 同步实时额度。';
    card.appendChild(title);
    card.appendChild(hint);
    var balCard = el('gfw-dsh-balance-card');
    if (balCard) panel.insertBefore(card, balCard.nextSibling);
    else panel.insertBefore(card, panel.firstChild);
    card.appendChild(block);
    paint();
    return true;
  }

  var authState = null;
  var authTab = 'rt';
  var authBound = false;
  var oauthPollTimer = null;

  function paintAuthTabs() {
    var tabRt = el('gfw-auth-tab-rt');
    var tabOauth = el('gfw-auth-tab-oauth');
    var paneRt = el('gfw-auth-pane-rt');
    var paneOauth = el('gfw-auth-pane-oauth');
    if (!tabRt || !tabOauth || !paneRt || !paneOauth) return;
    var isRt = authTab !== 'oauth';
    paneRt.hidden = !isRt;
    paneOauth.hidden = isRt;
    [['rt', tabRt, isRt], ['oauth', tabOauth, !isRt]].forEach(function (item) {
      var btn = item[1], on = item[2];
      btn.style.background = on ? 'var(--cp-accent, #7953cf)' : '';
      btn.style.color = on ? '#fff' : '';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function renderSlotQuota(boxId, slot, emptyText) {
    var box = el(boxId);
    if (!box) return;
    if (!slot) { box.textContent = emptyText; return; }
    var lines = [];
    if (slot.email) lines.push('账号：' + slot.email);
    if (slot.quota && slot.quota.fiveHour) {
      var q5 = slot.quota.fiveHour;
      lines.push('5 小时剩余：' + q5.remainingPct + '%（' + (q5.resetText || '未知') + '）');
      if (slot.quota.updatedAt) lines.push('同步：' + fmtTime(slot.quota.updatedAt));
    } else if (slot.hasToken) {
      lines.push('已保存凭证，点击「刷新」查询额度');
    } else {
      lines.push(emptyText);
    }
    if (slot.lastError) lines.push('错误：' + slot.lastError);
    box.textContent = '';
    lines.forEach(function (txt, idx) {
      var div = document.createElement('div');
      if (idx > 0) div.style.marginTop = '3px';
      if (txt.indexOf('错误：') === 0) div.style.color = '#e11d48';
      div.textContent = txt;
      box.appendChild(div);
    });
  }

  function paintAuthPanel() {
    var a = authState || (state && state.auth) || null;
    paintAuthTabs();
    var tag = el('gfw-auth-active-tag');
    var mode = (a && a.mode) || 'agy';
    if (tag) {
      tag.textContent = mode === 'rt' ? '当前气泡源：RT 登录' : mode === 'oauth' ? '当前气泡源：OAuth 登录' : '独立凭证查询';
    }
    function paintUseBtn(btn, active) {
      if (!btn) return;
      btn.textContent = active ? '当前主数据源' : '设为主数据源';
      btn.style.background = active ? 'var(--cp-accent, #7953cf)' : '';
      btn.style.color = active ? '#fff' : '';
      btn.style.borderColor = active ? 'var(--cp-accent, #7953cf)' : '';
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    var isAgyMode = mode !== 'rt' && mode !== 'oauth';
    paintUseBtn(el('gfw-auth-agy-use'), isAgyMode);
    paintUseBtn(el('gfw-auth-rt-use'), mode === 'rt');
    paintUseBtn(el('gfw-auth-oauth-use'), mode === 'oauth');
    if (a) {
      var rtCid = el('gfw-auth-rt-cid');
      if (rtCid && !rtCid.value && a.rt && a.rt.clientId) rtCid.value = a.rt.clientId;
      var oauthCid = el('gfw-auth-oauth-cid');
      if (oauthCid && !oauthCid.value && a.oauth && a.oauth.clientId) oauthCid.value = a.oauth.clientId;
      renderSlotQuota('gfw-auth-rt-quota', a.rt, '未配置 RT');
      renderSlotQuota('gfw-auth-oauth-quota', a.oauth, '未登录 OAuth');
    }
  }

  function postJson(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }).then(function (r) { return r.json(); });
  }

  function applyAuthResponse(d) {
    if (d && d.auth) authState = d.auth;
    if (d && d.payload && d.payload.ok) {
      state = d.payload;
      window.__gfwOfficialQuota = state.sample || null;
      dispatchUpdate();
      paint();
    }
    paintAuthPanel();
  }

  function bindAuthPanel() {
    var box = el('gfw-gemini-auth-box');
    if (!box) return false;
    if (authBound && box.dataset.gfwAuthBound === '1') { paintAuthPanel(); return true; }
    box.dataset.gfwAuthBound = '1';
    authBound = true;

    el('gfw-auth-tab-rt').addEventListener('click', function () { authTab = 'rt'; paintAuthTabs(); });
    el('gfw-auth-tab-oauth').addEventListener('click', function () { authTab = 'oauth'; paintAuthTabs(); });
    var agyUseBtn = el('gfw-auth-agy-use');
    if (agyUseBtn) {
      agyUseBtn.addEventListener('click', function () {
        postJson(BASE + '/api/auth-quota/mode', { mode: 'agy' }).then(applyAuthResponse);
      });
    }

    el('gfw-auth-rt-save').addEventListener('click', function () {
      var btn = el('gfw-auth-rt-save');
      var rt = (el('gfw-auth-rt-token') && el('gfw-auth-rt-token').value || '').trim();
      var cid = (el('gfw-auth-rt-cid') && el('gfw-auth-rt-cid').value || '').trim();
      var csec = (el('gfw-auth-rt-csec') && el('gfw-auth-rt-csec').value || '').trim();
      flash(btn, '查询中…');
      postJson(BASE + '/api/auth-quota/rt', { refreshToken: rt, clientId: cid, clientSecret: csec })
        .then(function (d) {
          applyAuthResponse(d);
          flash(btn, d && d.ok ? '已保存' : '失败');
        })
        .catch(function () { flash(btn, '网络异常'); });
    });

    el('gfw-auth-rt-refresh').addEventListener('click', function () {
      var btn = el('gfw-auth-rt-refresh');
      flash(btn, '刷新中…');
      postJson(BASE + '/api/auth-quota/refresh', { kind: 'rt' })
        .then(function (d) { applyAuthResponse(d); flash(btn, d && d.ok ? '已刷新' : '失败'); })
        .catch(function () { flash(btn, '失败'); });
    });

    el('gfw-auth-rt-use').addEventListener('click', function () {
      postJson(BASE + '/api/auth-quota/mode', { mode: 'rt' }).then(applyAuthResponse);
    });

    el('gfw-auth-rt-clear').addEventListener('click', function () {
      postJson(BASE + '/api/auth-quota/clear', { kind: 'rt' }).then(function (d) {
        if (el('gfw-auth-rt-token')) el('gfw-auth-rt-token').value = '';
        applyAuthResponse(d);
      });
    });

    el('gfw-auth-oauth-login').addEventListener('click', function () {
      var btn = el('gfw-auth-oauth-login');
      var cid = (el('gfw-auth-oauth-cid') && el('gfw-auth-oauth-cid').value || '').trim();
      var csec = (el('gfw-auth-oauth-csec') && el('gfw-auth-oauth-csec').value || '').trim();
      flash(btn, '准备授权…');
      postJson(BASE + '/api/auth-quota/oauth/start', { clientId: cid, clientSecret: csec })
        .then(function (d) {
          if (!d || !d.ok || !d.authUrl) {
            var qBox = el('gfw-auth-oauth-quota');
            if (qBox) qBox.textContent = '错误：' + ((d && d.error) || '无法启动 OAuth');
            flash(btn, '启动失败');
            return;
          }
          if (!d.openedExternal) window.open(d.authUrl, '_blank', 'noopener');
          flash(btn, '请在浏览器授权');
          if (oauthPollTimer) clearInterval(oauthPollTimer);
          var tries = 0;
          oauthPollTimer = setInterval(function () {
            tries += 1;
            if (tries > 60) { clearInterval(oauthPollTimer); oauthPollTimer = null; return; }
            fetch(BASE + '/api/auth-quota', { cache: 'no-store' })
              .then(function (r) { return r.ok ? r.json() : null; })
              .then(function (res) {
                if (res && res.auth && res.auth.oauth && (res.auth.oauth.hasToken || res.auth.oauth.lastError)) {
                  authState = res.auth;
                  paintAuthPanel();
                  if (res.auth.oauth.quota) { clearInterval(oauthPollTimer); oauthPollTimer = null; pull(); }
                }
              }).catch(function () {});
          }, 2000);
        })
        .catch(function () { flash(btn, '网络异常'); });
    });

    el('gfw-auth-oauth-refresh').addEventListener('click', function () {
      var btn = el('gfw-auth-oauth-refresh');
      flash(btn, '刷新中…');
      postJson(BASE + '/api/auth-quota/refresh', { kind: 'oauth' })
        .then(function (d) { applyAuthResponse(d); flash(btn, d && d.ok ? '已刷新' : '失败'); })
        .catch(function () { flash(btn, '失败'); });
    });

    el('gfw-auth-oauth-use').addEventListener('click', function () {
      postJson(BASE + '/api/auth-quota/mode', { mode: 'oauth' }).then(applyAuthResponse);
    });

    el('gfw-auth-oauth-clear').addEventListener('click', function () {
      postJson(BASE + '/api/auth-quota/clear', { kind: 'oauth' }).then(applyAuthResponse);
    });

    fetch(BASE + '/api/auth-quota', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (res) { if (res && res.auth) { authState = res.auth; paintAuthPanel(); } })
      .catch(function () {});

    paintAuthPanel();
    return true;
  }

  function mountCards() {
    mountBalanceCard();
    bindAuthPanel();
  }

  function watch() {
    if (bind()) { mountCards(); paint(); return; }
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (bind()) {
        clearInterval(timer);
        mountCards();
        paint();
      } else if (tries > 480) {
        clearInterval(timer);
      }
    }, 250);
  }

  // Contract used by the (patched) widget refresh buttons.
  window.__gfwRequestRefresh = function () { return pull(); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { pull(); pullBalance(); }
  });

  // the companion panel renders its tabs lazily; retry when the DOM changes
  var mountQueued = false;
  try {
    var observer = new MutationObserver(function () {
      if (mountQueued) return;
      mountQueued = true;
      setTimeout(function () { mountQueued = false; mountCards(); }, 60);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  } catch (err) {}

  pull();
  pullBalance();
  setInterval(pull, POLL_MS);
  setInterval(pullBalance, 60000);

  // ------------------------------------------------------------ DSH 对话完成 & DeepSeek 消耗轮询
  var lastTurnSeq = null;
  var turnInFlight = false;
  function pullLastTurn() {
    if (document.hidden || turnInFlight) return;
    turnInFlight = true;
    fetch(BASE + '/api/last-turn', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok || typeof d.seq !== 'number') return;
        if (lastTurnSeq === null) {
          lastTurnSeq = d.seq;
          return;
        }
        if (d.seq > lastTurnSeq) {
          lastTurnSeq = d.seq;
          if (d.turn && Number(d.turn.amount) > 0) {
            window.__gfwLastTurnCost = d.turn;
            dispatchUpdate();
          }
          try {
            window.dispatchEvent(new CustomEvent('gfw-dsh-turn-end', { detail: d.turn || null }));
          } catch (err) {}
          if (d.turn && Number(d.turn.amount) > 0) {
            setTimeout(function () { pullBalance(true); }, 1200);
          }
        }
      })
      .catch(function () {})
      .finally(function () { turnInFlight = false; });
  }
  pullLastTurn();
  setInterval(pullLastTurn, 1500);
})();
