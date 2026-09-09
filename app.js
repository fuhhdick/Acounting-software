'use strict';

/* ======================= 常量 ======================= */
const LS_KEY = 'qingbook.data.v1';

const CATEGORIES = {
  income: ['工资', '奖金', '兼职', '理财收益', '红包', '其他收入'],
  expense: ['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '教育', '通讯', '人情', '其他支出'],
};

const CATEGORY_ICON = {
  '工资': '💰', '奖金': '🎁', '兼职': '🧑‍💻', '理财收益': '📈', '红包': '🧧', '其他收入': '➕',
  '餐饮': '🍜', '交通': '🚌', '购物': '🛍️', '居住': '🏠', '娱乐': '🎮', '医疗': '💊',
  '教育': '📚', '通讯': '📱', '人情': '🎁', '其他支出': '📦',
};

const DEFAULT_ACCOUNTS = [
  { id: 'cash', name: '现金', icon: '💰', initialBalance: 0 },
  { id: 'bank', name: '银行卡', icon: '🏦', initialBalance: 0 },
  { id: 'wechat', name: '微信', icon: '💬', initialBalance: 0 },
  { id: 'alipay', name: '支付宝', icon: '🛒', initialBalance: 0 },
];

const PALETTE = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4',
  '#f472b6', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#a855f7'];

const ALL_CAT_NAMES = [...CATEGORIES.income, ...CATEGORIES.expense];

/* ======================= 状态 ======================= */
function defaultState() {
  return {
    transactions: [],
    accounts: DEFAULT_ACCOUNTS.map(a => ({ ...a })),
    budget: { monthly: 0 },
    theme: 'auto',
  };
}

function normalizeAccounts(arr) {
  return arr.map(a => ({
    id: a.id,
    name: String(a.name || '账户'),
    icon: a.icon || '💰',
    initialBalance: Number(a.initialBalance) || 0,
  }));
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw);
    const d = defaultState();
    const accounts = Array.isArray(p.accounts) && p.accounts.length ? normalizeAccounts(p.accounts) : d.accounts;
    return {
      transactions: Array.isArray(p.transactions) ? p.transactions : [],
      accounts,
      budget: { monthly: Number(p.budget && p.budget.monthly) || 0 },
      theme: ['auto', 'light', 'dark'].includes(p.theme) ? p.theme : 'auto',
    };
  } catch (e) {
    return defaultState();
  }
}

let state = load();

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { toast('保存失败：存储空间不足'); }
}

/* ======================= 表单即时状态 ======================= */
let tx = { type: 'expense', category: null };
let editingId = null;
let formAccountId = state.accounts.length ? state.accounts[0].id : '';

const filters = { type: '', month: '', category: '', account: '' };
let statsSub = 'overview';
let statsMonthValue = thisMonthStr();
let dayMonthValue = thisMonthStr();
let yearValue = String(new Date().getFullYear());

/* ======================= 工具函数 ======================= */
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function pad2(n) { return String(n).padStart(2, '0'); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function thisMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function monthLabel(ym) {
  const [y, m] = String(ym).split('-');
  return `${y}年${Number(m)}月`;
}

function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

function dateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return String(dateStr || '');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  const sameYear = d.getFullYear() === today.getFullYear();
  return sameYear ? `${d.getMonth() + 1}月${d.getDate()}日 周${week}` : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function fmtAmount(n) {
  const v = Math.abs(n || 0);
  const s = v.toFixed(2);
  const [int, dec] = s.split('.');
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
}

function fmtSignedMoney(n) {
  return (n < 0 ? '−' : '') + '¥' + fmtAmount(n);
}

function byDateDesc(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return (b.createdAt || 0) - (a.createdAt || 0);
}

function collectMonths() {
  const set = new Set();
  for (const t of state.transactions) if (t.date) set.add(t.date.slice(0, 7));
  return [...set].sort((a, b) => (a < b ? 1 : -1));
}

function collectYears() {
  const set = new Set();
  for (const t of state.transactions) if (t.date) set.add(t.date.slice(0, 4));
  set.add(String(new Date().getFullYear()));
  return [...set].sort((a, b) => (a < b ? 1 : -1));
}

function totalsForMonth(ym) {
  let income = 0, expense = 0;
  for (const t of state.transactions) {
    if (t.date && t.date.slice(0, 7) === ym) {
      if (t.type === 'income') income += t.amount; else expense += t.amount;
    }
  }
  return { income, expense };
}

function totalIncome() { let s = 0; for (const t of state.transactions) if (t.type === 'income') s += t.amount; return s; }
function totalExpense() { let s = 0; for (const t of state.transactions) if (t.type === 'expense') s += t.amount; return s; }

function accountTotals(aid) {
  let income = 0, expense = 0;
  for (const t of state.transactions) {
    if (t.accountId === aid) { if (t.type === 'income') income += t.amount; else expense += t.amount; }
  }
  const a = state.accounts.find(x => x.id === aid);
  const initial = a ? (a.initialBalance || 0) : 0;
  return { income, expense, net: income - expense, current: initial + income - expense };
}

function totalAssets() {
  let s = 0;
  for (const a of state.accounts) s += accountTotals(a.id).current;
  return s;
}

/* ======================= DOM 引用 ======================= */
const $ = id => document.getElementById(id);
const assetsCard = $('assetsCard'), monthSummary = $('monthSummary'), budgetBanner = $('budgetBanner');
const typeSeg = $('typeSeg'), categoryChipsEl = $('categoryChips');
const accountSelect = $('accountSelect'), dateInput = $('dateInput');
const amountInput = $('amountInput'), noteInput = $('noteInput');
const saveBtn = $('saveBtn'), cancelEditBtn = $('cancelEditBtn');
const searchInput = $('searchInput'), listSummary = $('listSummary'), txList = $('txList');
const filterMonth = $('filterMonth'), filterCategory = $('filterCategory'), filterAccount = $('filterAccount');
const statsMonth = $('statsMonth'), statsSummary = $('statsSummary');
const donut = $('donut'), incomeDonut = $('incomeDonut');
const dayMonth = $('dayMonth'), daySummary = $('daySummary'), dayChart = $('dayChart');
const yearSelect = $('yearSelect'), yearSummary = $('yearSummary'), yearBar = $('yearBar'), yearCompare = $('yearCompare');
const accountDonut = $('accountDonut'), incomeAccountDonut = $('incomeAccountDonut'), accountBreakdown = $('accountBreakdown');
const ovAssets = $('ovAssets'), ovSummary = $('ovSummary'), analysisList = $('analysisList');
const accountList = $('accountList'), budgetInput = $('budgetInput'), themeSeg = $('themeSeg');

/* ======================= Toast ======================= */
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ======================= 主题 ======================= */
function resolveTheme() {
  if (state.theme === 'light') return 'light';
  if (state.theme === 'dark') return 'dark';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme() {
  const resolved = resolveTheme();
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'dark' ? '#0f1115' : '#16a34a';
  const toggle = $('themeToggle');
  if (toggle) toggle.textContent = resolved === 'dark' ? '🌙' : '☀️';
}

/* ======================= 通用卡片 / 图表 ======================= */
function summaryGridHTML(income, expense, labels) {
  const l = labels || {};
  const bal = income - expense;
  return `
    <div class="sum-card sum-income"><div class="sum-label">${l.in || '收入'}</div><div class="sum-value">¥${fmtAmount(income)}</div></div>
    <div class="sum-card sum-expense"><div class="sum-label">${l.ox || '支出'}</div><div class="sum-value">¥${fmtAmount(expense)}</div></div>
    <div class="sum-card sum-balance"><div class="sum-label">${l.bal || '结余'}</div><div class="sum-value ${bal < 0 ? 'neg' : ''}">${fmtSignedMoney(bal)}</div></div>`;
}

function assetCardHTML() {
  const totalIn = totalIncome(), totalOut = totalExpense();
  const net = totalIn - totalOut;
  const initSum = state.accounts.reduce((s, a) => s + (a.initialBalance || 0), 0);
  return `<div class="asset-card">
    <div class="asset-label">总资产</div>
    <div class="asset-value">¥${fmtAmount(totalAssets())}</div>
    <div class="asset-sub">初始存款 ¥${fmtAmount(initSum)} ＋ 累计结余 ${fmtSignedMoney(net)}</div>
  </div>`;
}

function donutSVG(rows, label) {
  const size = 168, cx = 84, cy = 84, r = 62, sw = 24;
  const total = rows.reduce((s, x) => s + x.value, 0);
  const C = 2 * Math.PI * r;
  let acc = 0;
  const circles = rows.map(seg => {
    const len = seg.value / total * C;
    const c = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${sw}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 ${cx} ${cy})"></circle>`;
    acc += len;
    return c;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <g>${circles}</g>
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="12" style="fill:var(--muted)">${esc(label)}</text>
    <text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="15" font-weight="700" style="fill:var(--text)">¥${fmtAmount(total)}</text>
  </svg>`;
}

function donutBlock(rows, label) {
  const total = rows.reduce((s, x) => s + x.value, 0);
  if (!rows.length || total <= 0) return '<div class="empty">暂无数据</div>';
  const colored = rows.map((r, i) => ({ ...r, color: PALETTE[i % PALETTE.length] }));
  const legend = colored.map(r => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${r.color}"></span>
      <span class="legend-name">${esc(r.name)}</span>
      <span class="legend-val">${(r.value / total * 100).toFixed(0)}% · ¥${fmtAmount(r.value)}</span>
    </div>`).join('');
  return `<div class="donut-wrap">${donutSVG(colored, label)}<div class="legend">${legend}</div></div>`;
}

function legendHTML() {
  return `<div class="legend-item" style="margin-top:6px"><span class="legend-dot" style="background:var(--income)"></span><span class="legend-name">收入</span></div>
    <div class="legend-item" style="margin-bottom:0"><span class="legend-dot" style="background:var(--expense)"></span><span class="legend-name">支出</span></div>`;
}

function groupedBarSVG(series) {
  const W = 340, H = 200, padL = 10, padR = 10, padT = 16, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const max = Math.max(1, ...series.map(s => Math.max(s.income, s.expense)));
  const n = series.length || 1;
  const groupW = innerW / n;
  const barW = Math.min(14, groupW * 0.26);
  const labelStep = n <= 15 ? 1 : Math.ceil(n / 8);
  const yBase = padT + innerH;
  let bars = '', labels = '';
  for (let i = 0; i < n; i++) {
    const s = series[i];
    const cx = padL + groupW * i + groupW / 2;
    const hi = s.income / max * innerH;
    const he = s.expense / max * innerH;
    if (s.income > 0) bars += `<rect x="${cx - barW - 0.5}" y="${yBase - hi}" width="${barW}" height="${hi}" rx="1.5" style="fill:var(--income)"><title>${s.label} 收入 ¥${fmtAmount(s.income)}</title></rect>`;
    if (s.expense > 0) bars += `<rect x="${cx + 1.5}" y="${yBase - he}" width="${barW}" height="${he}" rx="1.5" style="fill:var(--expense)"><title>${s.label} 支出 ¥${fmtAmount(s.expense)}</title></rect>`;
    if (i % labelStep === 0) labels += `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="10" style="fill:var(--muted)">${esc(s.label)}</text>`;
  }
  return `<svg width="100%" viewBox="0 0 ${W} ${H}" role="img"><line x1="${padL}" y1="${yBase}" x2="${W - padR}" y2="${yBase}" stroke="var(--border)" stroke-width="1"></line>${bars}${labels}</svg>`;
}

/* ======================= 渲染：记账页 ======================= */
function renderAssets() { assetsCard.innerHTML = assetCardHTML(); }

function renderSummary() {
  const { income, expense } = totalsForMonth(thisMonthStr());
  monthSummary.innerHTML = summaryGridHTML(income, expense, { in: '本月收入', ox: '本月支出', bal: '本月结余' });
}

function renderBudget() {
  const { expense } = totalsForMonth(thisMonthStr());
  const monthly = state.budget.monthly;
  if (!monthly || monthly <= 0) {
    budgetBanner.innerHTML = `<div class="budget-none" id="gotoBudget">还没有设置每月预算，点这里设置 →</div>`;
    const g = $('gotoBudget');
    if (g) g.addEventListener('click', () => navigate('settings'));
    return;
  }
  const pct = Math.round(expense / monthly * 100);
  const cls = pct > 100 ? 'over' : pct >= 80 ? 'warn' : '';
  const remain = monthly - expense;
  const text = remain >= 0
    ? `本月支出 ¥${fmtAmount(expense)} / 预算 ¥${fmtAmount(monthly)}（剩余 ¥${fmtAmount(remain)}）`
    : `⚠️ 本月已超支 ¥${fmtAmount(-remain)}`;
  budgetBanner.innerHTML = `
    <div class="budget-bar">
      <div class="budget-bar-text"><span>${pct}%</span><span>${esc(text)}</span></div>
      <div class="budget-track"><div class="budget-fill ${cls}" style="width:${Math.min(pct, 100)}%"></div></div>
    </div>`;
}

function renderTypeSeg() {
  for (const btn of typeSeg.querySelectorAll('.seg-btn')) {
    btn.classList.toggle('active', btn.dataset.type === tx.type);
  }
}

function renderChips() {
  const cats = CATEGORIES[tx.type];
  categoryChipsEl.innerHTML = cats.map(c => `
    <button type="button" class="chip ${tx.type === 'expense' ? 'expense-chip' : ''} ${tx.category === c ? 'active' : ''}" data-action="pick-category" data-cat="${esc(c)}">
      <span class="chip-ico">${CATEGORY_ICON[c] || '📦'}</span>${esc(c)}
    </button>`).join('');
}

function renderAccountSelect() {
  if (!formAccountId || !state.accounts.some(a => a.id === formAccountId)) {
    formAccountId = state.accounts.length ? state.accounts[0].id : '';
  }
  accountSelect.innerHTML = state.accounts.map(a =>
    `<option value="${esc(a.id)}">${esc(a.icon)} ${esc(a.name)}</option>`).join('');
  accountSelect.value = formAccountId;
  accountSelect.disabled = state.accounts.length === 0;
}

/* ======================= 渲染：账单页 ======================= */
function renderFilterSelects() {
  const months = collectMonths();
  filterMonth.innerHTML = '<option value="">全部月份</option>' +
    months.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('');

  filterCategory.innerHTML = '<option value="">全部分类</option>' +
    `<optgroup label="收入">${CATEGORIES.income.map(c => `<option value="${c}">${c}</option>`).join('')}</optgroup>` +
    `<optgroup label="支出">${CATEGORIES.expense.map(c => `<option value="${c}">${c}</option>`).join('')}</optgroup>`;

  filterAccount.innerHTML = '<option value="">全部账户</option>' +
    state.accounts.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');

  filters.month = months.includes(filters.month) ? filters.month : '';
  filters.category = ALL_CAT_NAMES.includes(filters.category) ? filters.category : '';
  filters.account = state.accounts.some(a => a.id === filters.account) ? filters.account : '';
  filterMonth.value = filters.month;
  filterCategory.value = filters.category;
  filterAccount.value = filters.account;
}

function filteredTransactions() {
  const kw = searchInput.value.trim().toLowerCase();
  return state.transactions.filter(t => {
    if (filters.type && t.type !== filters.type) return false;
    if (filters.month && t.date && t.date.slice(0, 7) !== filters.month) return false;
    if (filters.category && t.category !== filters.category) return false;
    if (filters.account && t.accountId !== filters.account) return false;
    if (kw) {
      const hay = `${t.category} ${t.note} ${t.accountName} ${t.amount}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  }).sort(byDateDesc);
}

function renderList() {
  const list = filteredTransactions();
  let income = 0, expense = 0;
  for (const t of list) { if (t.type === 'income') income += t.amount; else expense += t.amount; }

  if (!list.length) {
    listSummary.innerHTML = '';
    txList.innerHTML = `<div class="empty"><span class="empty-ico">🗒️</span>还没有符合条件的账单</div>`;
    return;
  }

  listSummary.innerHTML = `共 ${list.length} 笔 · 收入 ¥${fmtAmount(income)} · 支出 ¥${fmtAmount(expense)}`;

  let html = '';
  let lastDate = null;
  for (const t of list) {
    if (t.date !== lastDate) {
      html += `<div class="tx-group-date">${esc(dateLabel(t.date))}</div>`;
      lastDate = t.date;
    }
    html += `
      <div class="tx-item" data-id="${esc(t.id)}">
        <div class="tx-ico">${esc(t.categoryIcon || '📦')}</div>
        <div class="tx-main">
          <div class="tx-title">${esc(t.category)}${t.note ? ` <span style="color:var(--muted);font-weight:400">· ${esc(t.note)}</span>` : ''}</div>
          <div class="tx-sub">${esc(t.accountIcon || '❓')} ${esc(t.accountName)}</div>
        </div>
        <div class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '−'}¥${fmtAmount(t.amount)}</div>
        <div class="tx-ops">
          <button class="op-btn" data-action="edit" data-id="${esc(t.id)}" title="编辑">✎</button>
          <button class="op-btn" data-action="delete" data-id="${esc(t.id)}" title="删除">🗑</button>
        </div>
      </div>`;
  }
  txList.innerHTML = html;
}

/* ======================= 渲染：统计页 ======================= */
function renderStatsNav() {
  document.querySelectorAll('.stats-sub').forEach(el => el.classList.toggle('active', el.id === 'stats-' + statsSub));
  document.querySelectorAll('.subnav-btn').forEach(b => b.classList.toggle('active', b.dataset.stat === statsSub));
}

function renderOverview() {
  const totalIn = totalIncome(), totalOut = totalExpense();
  const net = totalIn - totalOut;
  ovAssets.innerHTML = assetCardHTML();
  ovSummary.innerHTML = summaryGridHTML(totalIn, totalOut, { in: '累计收入', ox: '累计支出', bal: '累计结余' });

  const count = state.transactions.length;
  let days = 0;
  const dates = state.transactions.map(t => t.date).filter(Boolean).sort();
  if (dates.length) {
    const first = new Date(dates[0] + 'T00:00:00');
    const now = new Date(); now.setHours(0, 0, 0, 0);
    days = Math.max(1, Math.round((now - first) / 86400000) + 1);
  }
  const avgDaily = days ? totalOut / days : 0;
  const saveRate = totalIn > 0 ? net / totalIn * 100 : 0;

  const exps = state.transactions.filter(t => t.type === 'expense');
  let maxExp = null;
  for (const t of exps) if (!maxExp || t.amount > maxExp.amount) maxExp = t;

  const catMap = {};
  for (const t of exps) catMap[t.category] = (catMap[t.category] || 0) + t.amount;
  const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];

  const accMap = {};
  for (const t of exps) accMap[t.accountName] = (accMap[t.accountName] || 0) + t.amount;
  const topAcc = Object.entries(accMap).sort((a, b) => b[1] - a[1])[0];

  let topMonth = null, maxMonthOut = 0;
  for (const m of collectMonths()) {
    const o = totalsForMonth(m).expense;
    if (o > maxMonthOut) { maxMonthOut = o; topMonth = m; }
  }

  const items = [
    ['记账笔数', `${count} 笔`],
    ['结余率', `${saveRate.toFixed(1)}%`],
    ['日均支出', `¥${fmtAmount(avgDaily)}`],
  ];
  if (maxExp) items.push(['最大单笔支出', `¥${fmtAmount(maxExp.amount)}（${maxExp.category} · ${maxExp.date}）`]);
  if (topCat) items.push(['最大支出分类', `${topCat[0]} ¥${fmtAmount(topCat[1])}`]);
  if (topAcc) items.push(['最大支出账户', `${topAcc[0]} ¥${fmtAmount(topAcc[1])}`]);
  if (topMonth && maxMonthOut > 0) items.push(['支出最多月份', `${monthLabel(topMonth)} ¥${fmtAmount(maxMonthOut)}`]);

  analysisList.innerHTML = items.map(([k, v]) => `
    <div class="analysis-item"><span class="analysis-key">${esc(k)}</span><span class="analysis-value">${esc(v)}</span></div>`).join('');
}

function renderStatsSelect() {
  const months = collectMonths();
  const cur = thisMonthStr();
  const options = months.includes(cur) ? months : [cur, ...months];
  statsMonth.innerHTML = options.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('');
  if (!options.includes(statsMonthValue)) statsMonthValue = options[0];
  statsMonth.value = statsMonthValue;
}

function renderMonthStats() {
  renderStatsSelect();
  const { income, expense } = totalsForMonth(statsMonthValue);
  statsSummary.innerHTML = summaryGridHTML(income, expense, {});
  const expMap = {}, incMap = {};
  for (const t of state.transactions) {
    if (t.date && t.date.slice(0, 7) === statsMonthValue) {
      const mm = t.type === 'income' ? incMap : expMap;
      mm[t.category] = (mm[t.category] || 0) + t.amount;
    }
  }
  const expRows = Object.entries(expMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const incRows = Object.entries(incMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  donut.innerHTML = donutBlock(expRows, '总支出');
  incomeDonut.innerHTML = donutBlock(incRows, '总收入');
}

function renderDayStats() {
  const months = collectMonths();
  const cur = thisMonthStr();
  const options = months.includes(cur) ? months : [cur, ...months];
  dayMonth.innerHTML = options.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('');
  if (!options.includes(dayMonthValue)) dayMonthValue = options[0];
  dayMonth.value = dayMonthValue;

  const [y, m] = dayMonthValue.split('-').map(Number);
  const dnum = daysInMonth(y, m);
  const series = [];
  for (let d = 1; d <= dnum; d++) {
    const ds = `${dayMonthValue}-${pad2(d)}`;
    let income = 0, expense = 0;
    for (const t of state.transactions) if (t.date === ds) { if (t.type === 'income') income += t.amount; else expense += t.amount; }
    series.push({ label: String(d), income, expense });
  }
  const { income, expense } = totalsForMonth(dayMonthValue);
  daySummary.innerHTML = summaryGridHTML(income, expense, { in: '本月收入', ox: '本月支出', bal: '本月结余' });
  dayChart.innerHTML = groupedBarSVG(series) + legendHTML();
}

function renderYearStats() {
  const years = collectYears();
  yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}年</option>`).join('');
  if (!years.includes(yearValue)) yearValue = years[0];
  yearSelect.value = yearValue;

  const y = Number(yearValue);
  let yin = 0, yout = 0;
  const series = [];
  for (let m = 1; m <= 12; m++) {
    const tt = totalsForMonth(`${y}-${pad2(m)}`);
    yin += tt.income; yout += tt.expense;
    series.push({ label: `${m}月`, income: tt.income, expense: tt.expense });
  }
  yearSummary.innerHTML = summaryGridHTML(yin, yout, { in: '本年收入', ox: '本年支出', bal: '本年结余' });
  yearBar.innerHTML = groupedBarSVG(series) + legendHTML();

  yearCompare.innerHTML = years.map(yr => {
    let yi = 0, yo = 0;
    for (let m = 1; m <= 12; m++) { const tt = totalsForMonth(`${yr}-${pad2(m)}`); yi += tt.income; yo += tt.expense; }
    const net = yi - yo;
    return `<div class="year-row">
      <span class="year-name">${yr}年</span>
      <span class="year-cell">收 ¥${fmtAmount(yi)}</span>
      <span class="year-cell">支 ¥${fmtAmount(yo)}</span>
      <span class="year-cell ${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}">结余 ${fmtSignedMoney(net)}</span>
    </div>`;
  }).join('') || '<div class="empty">暂无数据</div>';
}

function renderAccountStats() {
  const expRows = state.accounts.map(a => ({ name: a.name, value: accountTotals(a.id).expense }))
    .filter(r => r.value > 0).sort((a, b) => b.value - a.value);
  const incRows = state.accounts.map(a => ({ name: a.name, value: accountTotals(a.id).income }))
    .filter(r => r.value > 0).sort((a, b) => b.value - a.value);
  accountDonut.innerHTML = donutBlock(expRows, '总支出');
  incomeAccountDonut.innerHTML = donutBlock(incRows, '总收入');

  accountBreakdown.innerHTML = state.accounts.map(a => {
    const tot = accountTotals(a.id);
    return `<div class="account-item">
      <span class="acc-ico">${esc(a.icon)}</span>
      <div class="acc-info">
        <div class="acc-name">${esc(a.name)}</div>
        <div class="acc-balance ${tot.current > 0 ? 'pos' : tot.current < 0 ? 'neg' : ''}">当前 ${fmtSignedMoney(tot.current)}</div>
      </div>
      <div class="acc-stats">
        <div class="acc-line">初始 ¥${fmtAmount(a.initialBalance || 0)}</div>
        <div class="acc-line">收 ¥${fmtAmount(tot.income)} · 支 ¥${fmtAmount(tot.expense)}</div>
      </div>
    </div>`;
  }).join('');
}

/* ======================= 渲染：设置页 ======================= */
function renderSettings() {
  budgetInput.value = state.budget.monthly > 0 ? String(state.budget.monthly) : '';

  accountList.innerHTML = state.accounts.map(a => {
    const tot = accountTotals(a.id);
    return `<div class="account-item">
      <span class="acc-ico">${esc(a.icon)}</span>
      <div class="acc-info">
        <div class="acc-name">${esc(a.name)}</div>
        <div class="acc-balance ${tot.current > 0 ? 'pos' : tot.current < 0 ? 'neg' : ''}">当前 ${fmtSignedMoney(tot.current)}</div>
      </div>
      <div class="acc-stats">
        <div class="acc-line">初始 ¥${fmtAmount(a.initialBalance || 0)}</div>
        <div class="acc-line">收 ¥${fmtAmount(tot.income)} · 支 ¥${fmtAmount(tot.expense)}</div>
      </div>
      <button class="op-btn" data-action="edit-account" data-id="${esc(a.id)}" title="修改初始余额">✎</button>
      <button class="op-btn" data-action="del-account" data-id="${esc(a.id)}" title="删除账户">🗑</button>
    </div>`;
  }).join('');

  for (const b of themeSeg.querySelectorAll('.seg-btn')) {
    b.classList.toggle('active', b.dataset.themeOpt === state.theme);
  }
}

/* ======================= 总渲染 ======================= */
function render() {
  renderAssets();
  renderSummary();
  renderBudget();
  renderTypeSeg();
  renderChips();
  renderAccountSelect();
  renderFilterSelects();
  renderList();
  renderStatsNav();
  renderOverview();
  renderMonthStats();
  renderDayStats();
  renderYearStats();
  renderAccountStats();
  renderSettings();
}

/* ======================= 导航 ======================= */
function navigate(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  window.scrollTo({ top: 0 });
}

/* ======================= 记账表单操作 ======================= */
function resetForm() {
  editingId = null;
  tx.type = 'expense';
  tx.category = null;
  amountInput.value = '';
  noteInput.value = '';
  dateInput.value = todayStr();
  saveBtn.textContent = '保存';
  cancelEditBtn.hidden = true;
  if (!state.accounts.some(a => a.id === formAccountId)) formAccountId = state.accounts[0] ? state.accounts[0].id : '';
  renderTypeSeg();
  renderChips();
  renderAccountSelect();
}

function submitTx(e) {
  e.preventDefault();
  const amount = parseFloat(amountInput.value);
  if (!isFinite(amount) || amount <= 0) { toast('请输入正确的金额'); return; }
  if (!tx.category) { toast('请选择一个分类'); return; }
  const account = state.accounts.find(a => a.id === formAccountId);
  const record = {
    id: editingId || genId(),
    type: tx.type,
    amount: Math.round(amount * 100) / 100,
    category: tx.category,
    categoryIcon: CATEGORY_ICON[tx.category] || '📦',
    accountId: account ? account.id : '',
    accountName: account ? account.name : '未选择账户',
    accountIcon: account ? account.icon : '❓',
    date: dateInput.value || todayStr(),
    note: noteInput.value.trim(),
    createdAt: Date.now(),
  };

  if (editingId) {
    const i = state.transactions.findIndex(t => t.id === editingId);
    if (i >= 0) { record.createdAt = state.transactions[i].createdAt || record.createdAt; state.transactions[i] = record; }
  } else {
    state.transactions.push(record);
  }
  save();
  resetForm();
  render();
  toast('已记账 ✓');
}

function startEdit(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) return;
  editingId = id;
  tx.type = t.type;
  tx.category = t.category;
  amountInput.value = String(t.amount);
  noteInput.value = t.note || '';
  dateInput.value = t.date || todayStr();
  formAccountId = t.accountId || '';
  saveBtn.textContent = '保存修改';
  cancelEditBtn.hidden = false;
  renderTypeSeg();
  renderChips();
  renderAccountSelect();
  navigate('add');
}

function deleteTx(id) {
  if (!confirm('确定删除这笔账单吗？')) return;
  state.transactions = state.transactions.filter(t => t.id !== id);
  save();
  if (editingId === id) resetForm();
  render();
  toast('已删除');
}

/* ======================= 设置操作 ======================= */
function addAccount() {
  const name = $('newAccountName').value.trim();
  if (!name) { toast('请输入账户名称'); return; }
  if (state.accounts.some(a => a.name === name)) { toast('账户名称已存在'); return; }
  const init = parseFloat($('newAccountInit').value);
  state.accounts.push({
    id: genId(),
    name,
    icon: $('newAccountIcon').value,
    initialBalance: isFinite(init) ? Math.round(init * 100) / 100 : 0,
  });
  save();
  $('newAccountName').value = '';
  $('newAccountInit').value = '';
  render();
  toast('账户已添加');
}

function deleteAccount(id) {
  if (state.accounts.length <= 1) { toast('至少保留一个账户'); return; }
  const a = state.accounts.find(x => x.id === id);
  if (!confirm(`确定删除账户「${a ? a.name : ''}」吗？已有的账单不会被删除。`)) return;
  state.accounts = state.accounts.filter(x => x.id !== id);
  save();
  render();
  toast('账户已删除');
}

function editAccountInitial(id) {
  const a = state.accounts.find(x => x.id === id);
  if (!a) return;
  openNumberModal(`「${a.name}」的初始余额`, a.initialBalance || 0,
    '填刚开始记账时，这个账户里已经有多少钱（信用卡欠款可填负数）',
    v => { a.initialBalance = v; save(); render(); toast('初始余额已更新'); });
}

function saveBudget() {
  const v = parseFloat(budgetInput.value);
  state.budget.monthly = isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0;
  save();
  render();
  toast('预算已保存');
}

/* ======================= 弹窗 ======================= */
let modalCb = null;
function openNumberModal(title, value, hint, cb) {
  $('modalTitle').textContent = title;
  $('modalHint').textContent = hint || '';
  $('modalInput').value = value ? String(value) : '';
  modalCb = cb;
  $('modal').hidden = false;
  setTimeout(() => { const i = $('modalInput'); if (i && i.focus) i.focus(); }, 60);
}
function closeModal() { $('modal').hidden = true; modalCb = null; }

/* ======================= 导出 / 导入 ======================= */
function exportCSV() {
  if (!state.transactions.length) { toast('暂无数据可导出'); return; }
  const rows = [['日期', '类型', '分类', '账户', '金额', '备注']];
  for (const t of [...state.transactions].sort(byDateDesc)) {
    rows.push([t.date, t.type === 'income' ? '收入' : '支出', t.category, t.accountName, t.amount.toFixed(2), t.note || '']);
  }
  const csv = '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  download(csv, '轻记账-账单.csv', 'text/csv;charset=utf-8');
  toast('已导出 CSV');
}

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportJSON() {
  download(JSON.stringify(state, null, 2), '轻记账-完整备份.json', 'application/json');
  toast('已导出完整备份');
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const p = JSON.parse(reader.result);
      if (!Array.isArray(p.transactions)) { toast('备份文件格式不正确'); return; }
      if (!confirm('导入会覆盖当前所有数据，确定继续吗？')) return;
      const d = defaultState();
      const accounts = Array.isArray(p.accounts) && p.accounts.length ? normalizeAccounts(p.accounts) : d.accounts;
      state = {
        transactions: p.transactions,
        accounts,
        budget: { monthly: Number(p.budget && p.budget.monthly) || 0 },
        theme: ['auto', 'light', 'dark'].includes(p.theme) ? p.theme : d.theme,
      };
      save();
      resetForm();
      applyTheme();
      render();
      toast('备份已导入');
    } catch (e) {
      toast('文件解析失败');
    }
  };
  reader.readAsText(file);
}

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

function clearData() {
  if (!confirm('确定清空所有记账数据吗？此操作不可恢复，建议先导出备份。')) return;
  if (!confirm('再次确认：真的要清空吗？')) return;
  state = defaultState();
  save();
  resetForm();
  render();
  toast('已清空');
}

/* ======================= 事件绑定 ======================= */
function bindEvents() {
  typeSeg.addEventListener('click', e => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    const t = btn.dataset.type;
    if (tx.type !== t) { tx.type = t; tx.category = null; }
    renderTypeSeg();
    renderChips();
  });

  categoryChipsEl.addEventListener('click', e => {
    const chip = e.target.closest('[data-action="pick-category"]');
    if (!chip) return;
    tx.category = chip.dataset.cat;
    renderChips();
  });

  accountSelect.addEventListener('change', () => { formAccountId = accountSelect.value; });
  $('txForm').addEventListener('submit', submitTx);
  cancelEditBtn.addEventListener('click', resetForm);
  $('themeToggle').addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'];
    state.theme = order[(order.indexOf(state.theme) + 1) % order.length];
    save(); applyTheme(); renderSettings();
  });

  searchInput.addEventListener('input', renderList);
  filterMonth.addEventListener('change', () => { filters.month = filterMonth.value; renderList(); });
  filterCategory.addEventListener('change', () => { filters.category = filterCategory.value; renderList(); });
  filterAccount.addEventListener('change', () => { filters.account = filterAccount.value; renderList(); });
  $('filterType').addEventListener('change', e => { filters.type = e.target.value; renderList(); });
  $('clearFiltersBtn').addEventListener('click', () => {
    filters.type = ''; filters.month = ''; filters.category = ''; filters.account = '';
    $('filterType').value = ''; searchInput.value = '';
    renderFilterSelects(); renderList();
  });

  txList.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'edit') startEdit(btn.dataset.id);
    if (btn.dataset.action === 'delete') deleteTx(btn.dataset.id);
  });

  accountList.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'del-account') deleteAccount(btn.dataset.id);
    if (btn.dataset.action === 'edit-account') editAccountInitial(btn.dataset.id);
  });

  $('statsSubnav').addEventListener('click', e => {
    const b = e.target.closest('[data-stat]');
    if (b) { statsSub = b.dataset.stat; renderStatsNav(); }
  });

  statsMonth.addEventListener('change', () => { statsMonthValue = statsMonth.value; renderMonthStats(); });
  dayMonth.addEventListener('change', () => { dayMonthValue = dayMonth.value; renderDayStats(); });
  yearSelect.addEventListener('change', () => { yearValue = yearSelect.value; renderYearStats(); });

  $('budgetSaveBtn').addEventListener('click', saveBudget);
  $('addAccountBtn').addEventListener('click', addAccount);
  $('exportCsvBtn').addEventListener('click', exportCSV);
  $('exportJsonBtn').addEventListener('click', exportJSON);
  $('importJsonInput').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) importJSON(f);
    e.target.value = '';
  });
  $('clearDataBtn').addEventListener('click', clearData);

  $('modalCancel').addEventListener('click', closeModal);
  $('modalOk').addEventListener('click', () => {
    const v = parseFloat($('modalInput').value);
    const n = isFinite(v) ? Math.round(v * 100) / 100 : 0;
    if (modalCb) modalCb(n);
    closeModal();
  });

  themeSeg.addEventListener('click', e => {
    const btn = e.target.closest('[data-theme-opt]');
    if (!btn) return;
    state.theme = btn.dataset.themeOpt;
    save(); applyTheme(); renderSettings();
  });

  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => navigate(t.dataset.view));
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.theme === 'auto') applyTheme();
  });
}

/* ======================= 启动 ======================= */
function init() {
  applyTheme();
  resetForm();
  render();
  bindEvents();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();