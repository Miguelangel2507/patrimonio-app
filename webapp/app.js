'use strict';
/*
 * Patrimonio — personal finance PWA.
 * Vanilla JS, no build step, no framework. State lives in memory + localStorage.
 * Rendering: full re-render of the active screen/modal into innerHTML on every
 * structural change, via string templates. Text inputs write straight into
 * state on 'input' (no re-render) so focus/cursor position is never lost;
 * everything else (taps, selections, toggles) triggers a re-render.
 */
(function () {

  // ============================================================
  // Constants
  // ============================================================
  const PALETTE = ['oklch(72% 0.15 155)', 'oklch(66% 0.14 235)', 'oklch(64% 0.16 280)', 'oklch(66% 0.18 320)', 'oklch(70% 0.19 350)', 'oklch(72% 0.15 45)', 'oklch(64% 0.19 25)', 'oklch(75% 0.14 85)', 'oklch(66% 0.12 190)', 'oklch(58% 0.02 260)'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const ACC_TYPE_LABELS = { banco: 'Banco', efectivo: 'Efectivo', ahorro: 'Ahorro', tarjeta: 'Tarjeta de crédito', inversion: 'Cuenta de inversión' };
  const FREQ_LABELS = { weekly: 'Semanal', monthly: 'Mensual', annual: 'Anual' };
  const EXPENSE_CATS = ['Supermercado', 'Restaurantes', 'Transporte', 'Vivienda', 'Ocio', 'Salud', 'Compras', 'Suscripciones', 'Otros'];
  const INCOME_CATS = ['Nómina', 'Freelance', 'Regalos', 'Otros'];
  const RECURRING_PRESETS = {
    rent: { label: 'Alquiler / Hipoteca', catName: 'Vivienda', note: 'Alquiler' },
    health: { label: 'Médico privado', catName: 'Salud', note: 'Seguro médico' },
    gym: { label: 'Gimnasio', catName: 'Gimnasio', note: 'Cuota gimnasio' },
    sub: { label: 'Suscripción', catName: 'Suscripciones', note: '' },
  };
  const STORAGE_KEY = 'patrimonio_app_v1';
  const SHEET_ID = '1HH2NiaaXDIKJwmATv3Ofk0mBmfBhwUxDbjwpRrTHBAw';

  // ============================================================
  // Small helpers
  // ============================================================
  function uid() { return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function defaultCategories() {
    const out = [];
    const FIXED_EXPENSE = new Set(['Vivienda', 'Suscripciones', 'Salud']);
    EXPENSE_CATS.forEach((name, i) => out.push({ id: 'e' + i, name, type: 'expense', color: PALETTE[i % PALETTE.length], kind: FIXED_EXPENSE.has(name) ? 'fixed' : 'daily' }));
    INCOME_CATS.forEach((name, i) => out.push({ id: 'i' + i, name, type: 'income', color: PALETTE[(i + 4) % PALETTE.length] }));
    return out;
  }
  function sumAmt(list) { return list.reduce((a, t) => a + t.amount, 0); }
  function parseNum(s) { const n = parseFloat(String(s || '0').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; }
  // Inverse of parseNum: format a JS number the way these comma-decimal inputs
  // expect, so prefilling a field programmatically round-trips correctly
  // (a raw String(n) with a "." would be misread by parseNum as a thousands separator).
  function numToInputStr(n) { return String(n).replace('.', ','); }
  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function getDeep(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
  function setDeep(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    cur[parts[parts.length - 1]] = value;
  }

  // ============================================================
  // Icons — plain SVG strings (ported from the design's React icon helpers)
  // ============================================================
  const Icons = {
    check(color) { return `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 7l4 4 6-8" stroke="${color}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`; },
    chevronDown(color) { return `<svg width="11" height="11" viewBox="0 0 11 11"><path d="M1 4l4.5 5 4.5-5" stroke="${color}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`; },
    chevronUp(color) { return `<svg width="11" height="11" viewBox="0 0 11 11"><path d="M1 7l4.5-5 4.5 5" stroke="${color}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`; },
    chevronRight(color) { return `<svg width="8" height="14" viewBox="0 0 8 14"><path d="M1 1l6 6-6 6" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`; },
    close() { return `<svg width="14" height="14" viewBox="0 0 14 14"><g stroke="oklch(30% 0.01 90)" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></g></svg>`; },
    closeThin(color) { return `<svg width="11" height="11" viewBox="0 0 11 11"><g stroke="${color}" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="10" y2="10"/><line x1="10" y1="1" x2="1" y2="10"/></g></svg>`; },
    back() { return `<svg width="10" height="16" viewBox="0 0 10 16"><path d="M8 1L1 8l7 7" stroke="oklch(30% 0.01 90)" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`; },
    plus(color) { return `<svg width="16" height="16" viewBox="0 0 16 16"><g stroke="${color}" stroke-width="2" stroke-linecap="round"><line x1="8" y1="1" x2="8" y2="15"/><line x1="1" y1="8" x2="15" y2="8"/></g></svg>`; },
    plusFat() { return `<svg width="24" height="24" viewBox="0 0 24 24"><g stroke="#fff" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/></g></svg>`; },
    search() { return `<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5" fill="none" stroke="oklch(30% 0.01 90)" stroke-width="1.6"/><line x1="11" y1="11" x2="15" y2="15" stroke="oklch(30% 0.01 90)" stroke-width="1.6" stroke-linecap="round"/></svg>`; },
    gear() {
      let rects = '';
      for (let i = 0; i < 8; i++) rects += `<rect x="8.9" y="2" width="2.2" height="3" rx="0.6" transform="rotate(${i * 45} 10 10)"/>`;
      return `<svg width="20" height="20" viewBox="0 0 20 20"><g fill="oklch(30% 0.01 90)">${rects}<circle cx="10" cy="10" r="5"/></g><circle cx="10" cy="10" r="2" fill="#fff"/></svg>`;
    },
    eyeOpen() { return `<svg width="18" height="18" viewBox="0 0 20 20"><path d="M2 10c1.5-3.5 4.7-6 8-6s6.5 2.5 8 6c-1.5 3.5-4.7 6-8 6s-6.5-2.5-8-6z" fill="none" stroke="oklch(50% 0.01 90)" stroke-width="1.4"/><line x1="3" y1="16" x2="17" y2="4" stroke="oklch(50% 0.01 90)" stroke-width="1.4"/></svg>`; },
    eyeClosed() { return `<svg width="18" height="18" viewBox="0 0 20 20"><path d="M2 10c1.5-3.5 4.7-6 8-6s6.5 2.5 8 6c-1.5 3.5-4.7 6-8 6s-6.5-2.5-8-6z" fill="none" stroke="oklch(50% 0.01 90)" stroke-width="1.4"/><circle cx="10" cy="10" r="2.6" fill="oklch(50% 0.01 90)"/></svg>`; },
    arrowLeft() { return `<svg width="9" height="14" viewBox="0 0 9 14"><path d="M7 1L1 7l6 6" stroke="oklch(30% 0.01 90)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`; },
    arrowRight() { return `<svg width="9" height="14" viewBox="0 0 9 14"><path d="M2 1l6 6-6 6" stroke="oklch(30% 0.01 90)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`; },
    reorder() { return `<svg width="16" height="16" viewBox="0 0 16 16"><g stroke="oklch(30% 0.01 90)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v12M4 2L1.5 4.5M4 2l2.5 2.5"/><path d="M12 14V2M12 14l2.5-2.5M12 14l-2.5-2.5"/></g></svg>`; },
    pencil() { return `<svg width="12" height="12" viewBox="0 0 13 13"><path d="M1 12l1-3.5L9.5 1 12 3.5 4.5 11z" stroke="oklch(50% 0.01 90)" stroke-width="1.4" fill="none" stroke-linejoin="round"/></svg>`; },
    tabHome() { return `<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 10l8-7 8 7v9a1 1 0 01-1 1h-4v-6H8v6H4a1 1 0 01-1-1z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`; },
    tabStats() { return `<svg width="22" height="22" viewBox="0 0 22 22"><g fill="currentColor"><rect x="2" y="12" width="4" height="8" rx="1"/><rect x="9" y="6" width="4" height="14" rx="1"/><rect x="16" y="2" width="4" height="18" rx="1"/></g></svg>`; },
    tabInvest() { return `<svg width="22" height="22" viewBox="0 0 22 22"><path d="M2 17l6-6 4 3 8-9" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 5h5v5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`; },
    tabAccounts() { return `<svg width="22" height="22" viewBox="0 0 22 22"><rect x="2" y="5" width="18" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M2 9h18" stroke="currentColor" stroke-width="1.7"/><circle cx="16" cy="13.5" r="1.4" fill="currentColor"/></svg>`; },
    misc(kind) {
      const c = 'oklch(45% 0.12 235)';
      const sp = 'stroke="' + c + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"';
      if (kind === 'building') return `<svg width="20" height="20" viewBox="0 0 20 20"><g ${sp}>
        <rect x="4" y="3" width="12" height="14" rx="1.2"/>
        <rect x="6.5" y="5.5" width="1.6" height="1.6" fill="${c}" stroke="none"/>
        <rect x="11.9" y="5.5" width="1.6" height="1.6" fill="${c}" stroke="none"/>
        <rect x="6.5" y="9" width="1.6" height="1.6" fill="${c}" stroke="none"/>
        <rect x="11.9" y="9" width="1.6" height="1.6" fill="${c}" stroke="none"/>
        <rect x="8.5" y="12.5" width="3" height="4.5" fill="${c}" stroke="none"/>
      </g></svg>`;
      if (kind === 'pie') return `<svg width="20" height="20" viewBox="0 0 20 20">
        <path d="M10 2a8 8 0 108 8h-8z" fill="oklch(45% 0.13 155)"/>
        <path d="M12 2.3A8 8 0 0118 8h-6z" fill="oklch(62% 0.11 155)"/>
      </svg>`;
      if (kind === 'wallet') return `<svg width="20" height="20" viewBox="0 0 20 20"><g ${sp}>
        <rect x="2" y="5" width="16" height="11" rx="2"/>
        <path d="M2 8h16"/>
        <circle cx="14" cy="12" r="1" fill="${c}" stroke="none"/>
      </g></svg>`;
      if (kind === 'briefcase') return `<svg width="20" height="20" viewBox="0 0 20 20"><g stroke="oklch(45% 0.13 155)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <rect x="2.5" y="6" width="15" height="10" rx="1.5"/>
        <path d="M7 6V4.5a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0113 4.5V6"/>
      </g></svg>`;
      return '';
    },
    accountType(type) {
      const c = 'oklch(45% 0.01 90)';
      const sp = 'stroke="' + c + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"';
      if (type === 'banco') return `<svg width="16" height="16" viewBox="0 0 16 16"><g ${sp}>
        <path d="M2 6l6-4 6 4"/><line x1="2" y1="6" x2="14" y2="6"/>
        <line x1="3" y1="6" x2="3" y2="12"/><line x1="8" y1="6" x2="8" y2="12"/><line x1="13" y1="6" x2="13" y2="12"/>
        <line x1="2" y1="13" x2="14" y2="13"/>
      </g></svg>`;
      if (type === 'efectivo') return `<svg width="16" height="16" viewBox="0 0 16 16"><g ${sp}>
        <rect x="1.5" y="4" width="13" height="8" rx="1.2"/><circle cx="8" cy="8" r="2"/>
      </g></svg>`;
      if (type === 'ahorro') return `<svg width="16" height="16" viewBox="0 0 16 16"><g ${sp}>
        <path d="M2 9a5 5 0 015-5c2 0 3 1 3.5 2h1.5l1 1.5-1 1v1.5l-1.5.5-.5 1.5H7.5L7 11H5a2 2 0 01-2-2z"/>
        <circle cx="5.5" cy="8" r="0.6" fill="${c}" stroke="none"/>
      </g></svg>`;
      if (type === 'tarjeta') return `<svg width="16" height="16" viewBox="0 0 16 16"><g ${sp}>
        <rect x="1.5" y="3.5" width="13" height="9" rx="1.3"/><line x1="1.5" y1="6.5" x2="14.5" y2="6.5"/>
      </g></svg>`;
      if (type === 'inversion') return `<svg width="16" height="16" viewBox="0 0 16 16"><g ${sp}>
        <path d="M2 12l4-4 3 2 5-6"/><path d="M10.5 4H14v3.5"/>
      </g></svg>`;
      return `<svg width="16" height="16" viewBox="0 0 16 16"><circle ${sp} cx="8" cy="8" r="5"/></svg>`;
    },
    category(name) {
      const n = (name || '').toLowerCase();
      const sp = 'stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"';
      if (n.includes('supermercado')) return `<svg width="20" height="20" viewBox="0 0 20 20"><g ${sp}>
        <path d="M2 3h2l1.5 10h9L17 6H5.5"/>
        <circle cx="8" cy="16" r="1.1" fill="#fff" stroke="none"/><circle cx="14" cy="16" r="1.1" fill="#fff" stroke="none"/>
      </g></svg>`;
      if (n.includes('restaurante')) return `<svg width="20" height="20" viewBox="0 0 20 20"><g ${sp}>
        <path d="M4 2v7M4 2v0M6 2v5a2 2 0 01-2 2M4 9v9"/>
        <path d="M15 2c-1.5 0-2.5 2-2.5 5s1 4 2.5 4M15 2v16"/>
      </g></svg>`;
      if (n.includes('transporte')) return `<svg width="20" height="20" viewBox="0 0 20 20"><g ${sp}>
        <path d="M3 12l1.4-5a2 2 0 012-1.5h7.2a2 2 0 012 1.5L17 12"/>
        <rect x="2" y="12" width="16" height="4" rx="1"/>
        <circle cx="6" cy="16.5" r="1.2" fill="#fff" stroke="none"/><circle cx="14" cy="16.5" r="1.2" fill="#fff" stroke="none"/>
      </g></svg>`;
      if (n.includes('vivienda')) return `<svg width="20" height="20" viewBox="0 0 20 20"><path ${sp} d="M3 10l7-6 7 6v7a1 1 0 01-1 1h-4v-5H8v5H4a1 1 0 01-1-1z"/></svg>`;
      if (n.includes('ocio')) return `<svg width="20" height="20" viewBox="0 0 20 20"><g ${sp}>
        <rect x="2" y="6" width="16" height="9" rx="4"/>
        <circle cx="7" cy="10.5" r="0.9" fill="#fff" stroke="none"/><circle cx="9" cy="12.3" r="0.9" fill="#fff" stroke="none"/><circle cx="14" cy="11.3" r="1.1" fill="#fff" stroke="none"/>
      </g></svg>`;
      if (n.includes('salud')) return `<svg width="20" height="20" viewBox="0 0 20 20"><path ${sp} d="M10 17s-6.5-4.2-6.5-8.7A3.8 3.8 0 0110 5.7a3.8 3.8 0 016.5 2.6C16.5 12.8 10 17 10 17z"/></svg>`;
      if (n.includes('compras')) return `<svg width="20" height="20" viewBox="0 0 20 20"><g ${sp}>
        <path d="M5 6h10l-1 11H6z"/><path d="M7 6a3 3 0 016 0"/>
      </g></svg>`;
      if (n.includes('suscripcion')) return `<svg width="20" height="20" viewBox="0 0 20 20"><g ${sp}>
        <path d="M3 9a7 7 0 0112-4.5M17 5v4h-4"/><path d="M17 11a7 7 0 01-12 4.5M3 15v-4h4"/>
      </g></svg>`;
      if (n.includes('nómina') || n.includes('nomina')) return `<svg width="20" height="20" viewBox="0 0 20 20"><g ${sp}>
        <rect x="3" y="7" width="14" height="9" rx="1.5"/><path d="M7 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/>
      </g></svg>`;
      if (n.includes('freelance')) return `<svg width="20" height="20" viewBox="0 0 20 20"><g ${sp}>
        <rect x="3" y="5" width="14" height="9" rx="1"/><line x1="2" y1="15" x2="18" y2="15"/><line x1="1" y1="15" x2="1" y2="17"/><line x1="19" y1="15" x2="19" y2="17"/>
      </g></svg>`;
      if (n.includes('regalo')) return `<svg width="20" height="20" viewBox="0 0 20 20"><g ${sp}>
        <rect x="3" y="8" width="14" height="9" rx="1"/><line x1="10" y1="8" x2="10" y2="17"/>
        <path d="M3 8h14v-1a1 1 0 00-1-1h-3a2.5 2.5 0 00-3 0h-3a1 1 0 00-1 1z"/>
      </g></svg>`;
      if (n.includes('otros')) return `<svg width="20" height="20" viewBox="0 0 20 20"><g fill="#fff"><circle cx="5" cy="10" r="1.3"/><circle cx="10" cy="10" r="1.3"/><circle cx="15" cy="10" r="1.3"/></g></svg>`;
      return esc((name || '?')[0].toUpperCase());
    }
  };

  function ringFor(color, selected) { return selected ? '0 0 0 3px #fff, 0 0 0 5px ' + color : 'none'; }

  // ============================================================
  // App state container
  // ============================================================
  const App = {
    state: null,
    _dragList: null, _dragIndex: 0, _dragStartY: 0, _onDragMove: null, _onDragUp: null,

    initialState() {
      return {
        onboardingDone: false, userName: '', hideBalances: false,
        accounts: [], transactions: [], categories: defaultCategories(),
        recurringRules: [], investments: [], netWorthHistory: [], investmentHistory: [],
        screen: 'home', modal: null,
        obName: '', obAccName: '', obAccType: 'banco', obBalance: '', obColor: PALETTE[0],
        txType: 'expense', txAmount: '', txDate: todayISO(), txAccountId: '', txCategoryId: '', txNote: '', txRepeat: false, txFreq: 'monthly', txLockInvestment: false,
        txFundMode: 'existing', txFundId: '', txFundName: '', txFundIsin: '', txFundPrice: '', txFundUnits: '',
        showNewCategory: false, newCatName: '', newCatColor: PALETTE[0],
        accForm: { name: '', type: 'banco', balance: '', isDebt: false, color: PALETTE[0] }, editingAccountId: null,
        addMoneyAmount: '', addMoneyNote: '', addMoneyAccountId: '',
        transferFrom: '', transferTo: '', transferAmount: '',
        activeFundId: null, fundAction: null, fundActionAmount: '', fundActionPrice: '', fundActionUnits: '', fundActionFee: '', fundActionAccountId: '', fundActionDate: todayISO(),
        editingPlanId: null, planEditAmount: '', planEditDay: '', planEditFreq: 'monthly', planEditAccountId: '',
        editingPrice: false, editingPriceValue: '',
        statsTab: 'income', statsPeriod: 'month', statsRef: todayISO(),
        historyRange: '3m',
        activeAccountIndex: 0,
        dragId: null, dragY: 0,
        investYear: new Date().getFullYear(),
        txSearch: '', txFilter: 'all',
        catTab: 'expense',
        catInlineOpen: false,
        editingTxId: null, txEditAmount: '', txEditDate: '', txEditCategoryId: '', txEditAccountId: '', txEditNote: '',
        editingCategoryId: null, catKind: 'daily', catBudgetType: 'amount', catBudgetValue: '', catBudgetReturnTo: null,
        jornal: 0, editingJornal: false, editingJornalValue: '',
        recurringInlineOpen: false, editingRecurringId: null,
        recEditType: 'expense', recEditAmount: '', recEditCategoryId: '', recEditAccountId: '', recEditFreq: 'monthly', recEditDay: '', recEditNote: '',
        monthlyCloses: [], sheetPrices: {}, sheetPricesStatus: 'idle', sheetPricesUpdatedAt: null, confirmingRuleId: null,
      };
    },

    init() {
      this.state = this.initialState();
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) Object.assign(this.state, JSON.parse(raw));
      } catch (e) {}
      this.syncSnapshots();
      this.render();
      this.fetchSheetPrices();
    },

    // setState merges a patch (object) into state, commits (persist + snapshot sync),
    // then re-renders. `render:false` skips the re-render for cases handled manually.
    setState(patch, cb) {
      Object.assign(this.state, patch);
      this.commit();
      if (cb) cb();
    },
    commit() {
      this.persist();
      this.syncSnapshotsQuiet();
      this.render();
    },
    pickPersisted() {
      const s = this.state;
      return {
        onboardingDone: s.onboardingDone, userName: s.userName, hideBalances: s.hideBalances,
        accounts: s.accounts, transactions: s.transactions, categories: s.categories,
        recurringRules: s.recurringRules, investments: s.investments,
        netWorthHistory: s.netWorthHistory, investmentHistory: s.investmentHistory,
        jornal: s.jornal, monthlyCloses: s.monthlyCloses,
      };
    },
    persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.pickPersisted())); } catch (e) {} },

    computeNetWorth() {
      const accTotal = this.state.accounts.reduce((a, acc) => a + acc.balance, 0);
      const fundTotal = this.state.investments.reduce((a, f) => a + f.units * f.currentPrice, 0);
      return accTotal + fundTotal;
    },

    // Same as original syncSnapshots(), but mutates state directly instead of
    // calling setState (we're already inside a commit cycle).
    syncSnapshotsQuiet() {
      const nw = this.computeNetWorth();
      const today = todayISO();
      const hist = this.state.netWorthHistory;
      const last = hist[hist.length - 1];
      const investedTotal = this.state.investments.reduce((a, f) => a + f.totalInvested, 0);
      const marketTotal = this.state.investments.reduce((a, f) => a + f.units * f.currentPrice, 0);
      const ihist = this.state.investmentHistory;
      const ilast = ihist[ihist.length - 1];
      const nwChanged = !last || last.date !== today || last.value !== nw;
      const iChanged = !ilast || ilast.date !== today || ilast.invested !== investedTotal || ilast.market !== marketTotal;
      if (!nwChanged && !iChanged) return;
      this.state.netWorthHistory = (last && last.date === today) ? hist.slice(0, -1).concat([{ date: today, value: nw }]) : hist.concat([{ date: today, value: nw }]);
      this.state.investmentHistory = (ilast && ilast.date === today) ? ihist.slice(0, -1).concat([{ date: today, invested: investedTotal, market: marketTotal }]) : ihist.concat([{ date: today, invested: investedTotal, market: marketTotal }]);
      this.captureMonthlyCloseIfNeeded();
      this.persist();
    },
    syncSnapshots() { this.syncSnapshotsQuiet(); },

    // Automatic "real close" snapshot: only fires when the app happens to be open
    // on the actual last calendar day of a month, capturing each fund's live VL.
    // Months the app wasn't open for at month-end have no real close, and the
    // monthly-return math below falls back to a cost-basis (flat) estimate for them.
    captureMonthlyCloseIfNeeded() {
      if (!this.state.investments.length) return;
      const now = new Date();
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      if (now.getDate() !== lastDayOfMonth) return;
      const monthKey = todayISO().slice(0, 7);
      if (this.state.monthlyCloses.some(m => m.month === monthKey)) return;
      const perFund = {};
      this.state.investments.forEach(f => { perFund[f.id] = { units: f.units, price: f.currentPrice }; });
      const market = this.state.investments.reduce((a, f) => a + f.units * f.currentPrice, 0);
      const invested = this.state.investments.reduce((a, f) => a + f.totalInvested, 0);
      this.state.monthlyCloses = [...this.state.monthlyCloses, { month: monthKey, market, invested, perFund }];
    },
    // Net cash into/out of the funds (buys positive, sells negative) up to but
    // not including dateISO.
    investedAsOfDate(dateISO) {
      let invested = 0;
      this.state.investments.forEach(f => {
        (f.ops || []).forEach(op => { if (op.date < dateISO) invested += (op.type === 'buy' ? op.amount : -op.amount); });
      });
      return invested;
    },
    // Best-effort market value at a date when there's no real monthlyClose:
    // each fund is valued at its units held as of that date times the price
    // from its most recent purchase at or before that date — a real observed
    // VL, just not a same-day snapshot. This is what "estimado con el precio
    // de tus compras" means; valuing at pure cost (assuming flat 0% growth)
    // would silently fold any real prior movement into whatever month finally
    // gets a real snapshot to compare against.
    marketValueAsOfDate(dateISO) {
      let total = 0;
      this.state.investments.forEach(f => {
        const ops = (f.ops || []).filter(o => o.date < dateISO).sort((a, b) => a.date < b.date ? -1 : (a.date > b.date ? 1 : 0));
        if (!ops.length) return;
        let units = 0;
        ops.forEach(o => { units += (o.type === 'buy' ? o.units : -o.units); });
        total += units * ops[ops.length - 1].price;
      });
      return total;
    },
    // Modified Dietz monthly return for 'YYYY-MM'. Real BMV/EMV come from
    // monthlyCloses when available; otherwise each end falls back to
    // marketValueAsOfDate. The "real" flag (dot in the UI) reflects only
    // whether THIS month's end has a real snapshot — a month can have a real
    // end and an estimated start at the same time.
    monthlyReturn(monthKey) {
      const [y, m] = monthKey.split('-').map(Number);
      const monthStart = new Date(y, m - 1, 1);
      const monthEnd = new Date(y, m, 0);
      const monthStartISO = monthStart.toISOString().slice(0, 10);
      const monthEndISO = monthEnd.toISOString().slice(0, 10);
      const daysInMonth = monthEnd.getDate();
      const closes = this.state.monthlyCloses;
      const priorClose = closes.filter(c => c.month < monthKey).sort((a, b) => a.month < b.month ? -1 : 1).pop();
      const thisClose = closes.find(c => c.month === monthKey);
      const now = new Date();
      const isCurrentMonth = now.getFullYear() === y && now.getMonth() === m - 1;
      const bmv = priorClose ? priorClose.market : this.marketValueAsOfDate(monthStartISO);

      let cfTotal = 0, weightedCf = 0;
      this.state.investments.forEach(f => {
        (f.ops || []).forEach(op => {
          if (op.date >= monthStartISO && op.date <= monthEndISO) {
            const signed = op.type === 'buy' ? op.amount : -op.amount;
            const d = new Date(op.date + 'T00:00:00');
            const daysRemaining = daysInMonth - d.getDate() + 1;
            cfTotal += signed;
            weightedCf += signed * (daysRemaining / daysInMonth);
          }
        });
      });

      let emv, real;
      if (thisClose) { emv = thisClose.market; real = true; }
      else if (isCurrentMonth) { emv = this.state.investments.reduce((a, f) => a + f.units * f.currentPrice, 0); real = false; }
      else if (monthEnd < now) {
        // Valued at the last known purchase price up to and including this
        // month's last day — NOT bmv + cfTotal, which is 0% by construction
        // and would silently discard any price movement the ops did capture.
        const dayAfterMonthEnd = new Date(monthEnd); dayAfterMonthEnd.setDate(dayAfterMonthEnd.getDate() + 1);
        emv = this.marketValueAsOfDate(dayAfterMonthEnd.toISOString().slice(0, 10));
        real = false;
      }
      else { return { returnPct: null, real: false, hasData: false }; }
      const denom = bmv + weightedCf;
      const hasData = bmv > 1e-6 || Math.abs(cfTotal) > 1e-6 || emv > 1e-6;
      const returnPct = hasData && denom > 1e-6 ? ((emv - bmv - cfTotal) / denom) * 100 : (hasData ? 0 : null);
      return { returnPct, real, hasData };
    },
    navInvestYear(dir) { this.setState({ investYear: this.state.investYear + dir }); },
    // Chains the year's monthly Modified Dietz returns; months with no data
    // (nothing invested yet) are skipped rather than counted as 0%.
    annualReturn(year) {
      let compound = 1, any = false;
      for (let m = 1; m <= 12; m++) {
        const r = this.monthlyReturn(year + '-' + String(m).padStart(2, '0'));
        if (r.hasData && r.returnPct !== null) { compound *= (1 + r.returnPct / 100); any = true; }
      }
      return any ? (compound - 1) * 100 : null;
    },
    toggleFundPriceSource() {
      const fund = this.currentFund(); if (!fund) return;
      const investments = this.state.investments.map(f => f.id === fund.id ? { ...f, priceSource: f.priceSource === 'manual' ? 'auto' : 'manual' } : f);
      this.setState({ investments });
    },
    // JSONP fetch of the public Google Sheet (avoids CORS entirely — the gviz
    // endpoint's documented cross-origin mechanism is a script tag + callback,
    // not a fetch()-friendly response).
    fetchSheetPrices() {
      if (this._sheetFetchInFlight) return;
      this._sheetFetchInFlight = true;
      this.setState({ sheetPricesStatus: 'loading' });
      const cbName = '__gvizCb' + Date.now();
      const cleanup = () => { delete window[cbName]; if (script.parentNode) script.remove(); this._sheetFetchInFlight = false; };
      window[cbName] = (json) => {
        try {
          const rows = (json.table && json.table.rows) || [];
          const prices = {};
          rows.forEach(row => {
            const c = row.c || [];
            const isin = c[0] && c[0].v != null ? String(c[0].v).trim() : '';
            const vlCell = c[2];
            const vl = vlCell && typeof vlCell.v === 'number' ? vlCell.v : null;
            if (isin && vl !== null) prices[isin] = vl;
          });
          const investments = this.state.investments.map(f => {
            if (f.priceSource === 'manual') return f;
            const isin = (f.isin || '').trim();
            return (isin && prices[isin] !== undefined) ? { ...f, currentPrice: prices[isin] } : f;
          });
          this.setState({ investments, sheetPrices: prices, sheetPricesStatus: 'ok', sheetPricesUpdatedAt: new Date().toISOString() });
        } catch (e) { this.setState({ sheetPricesStatus: 'error' }); }
        cleanup();
      };
      const script = document.createElement('script');
      script.src = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:json;responseHandler=' + cbName;
      script.onerror = () => { this.setState({ sheetPricesStatus: 'error' }); cleanup(); };
      document.body.appendChild(script);
    },

    // -------- formatting --------
    fmt(n) { if (this.state.hideBalances) return '••••• €'; return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €'; },
    fmtAbs(n) { return this.fmt(Math.abs(n)); },
    fmtSigned(n) { if (this.state.hideBalances) return '•••••'; const s = n < 0 ? '-' : '+'; return s + new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n)) + ' €'; },
    fmtPct(n) { if (n === null || n === undefined || !isFinite(n)) return '—'; const s = n >= 0 ? '+' : ''; return s + n.toFixed(2).replace('.', ',') + '%'; },
    dateLabelShort(iso) { const d = new Date(iso + 'T00:00:00'); return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + '.'; },
    addFrequency(dateStr, freq) {
      const d = new Date(dateStr + 'T00:00:00');
      if (freq === 'weekly') d.setDate(d.getDate() + 7);
      else if (freq === 'annual') d.setFullYear(d.getFullYear() + 1);
      else d.setMonth(d.getMonth() + 1);
      return d.toISOString().slice(0, 10);
    },
  };

  // ============================================================
  // Actions — navigation
  // ============================================================
  Object.assign(App, {
    setScreen(s) { this.setState({ screen: s, modal: null }); },
    openModal(m) { this.setState({ modal: m }); },
    closeModal() {
      const returnTo = this.state.modal === 'categoryBudget' ? this.state.catBudgetReturnTo : null;
      this.setState({ modal: returnTo || null, fundAction: null, activeFundId: this.state.modal === 'fundDetail' ? null : this.state.activeFundId, editingPrice: false });
    },
    openSettings() { this.setState({ modal: 'settings' }); },
    toggleCatInline() { this.setState({ catInlineOpen: !this.state.catInlineOpen }); },
    openAllTx() { this.setState({ modal: 'allTx', txSearch: '', txFilter: 'all' }); },
    openReorder() { this.setState({ modal: 'reorder' }); },
    openAddAccount() { this.setState({ accForm: { name: '', type: 'banco', balance: '', isDebt: false, color: PALETTE[0] }, modal: 'addAccount' }); },
    openAddInvestment() { this.setState({ txType: 'investment', txLockInvestment: true, txAmount: '', txFundMode: 'existing', txFundId: '', txFundName: '', txFundIsin: '', txFundPrice: '', txFundUnits: '', txRepeat: false, txAccountId: this.state.accounts[0] ? this.state.accounts[0].id : '', modal: 'addTx' }); },
    openAddTxDefault() { this.setState({ txType: 'expense', txLockInvestment: false, txAmount: '', txCategoryId: '', txRepeat: false, txAccountId: this.state.accounts[0] ? this.state.accounts[0].id : '', modal: 'addTx' }); },
    toggleHide() { this.setState({ hideBalances: !this.state.hideBalances }); },

    // -------- onboarding --------
    completeOnboarding() {
      if (!this.state.obAccName.trim()) return;
      let bal = parseNum(this.state.obBalance);
      const isDebt = this.state.obAccType === 'tarjeta';
      if (isDebt) bal = -Math.abs(bal);
      const acc = { id: uid(), name: this.state.obAccName.trim(), type: this.state.obAccType, balance: bal, isDebt, color: this.state.obColor, order: 0 };
      const tx = { id: uid(), type: 'adjustment', amount: bal, date: todayISO(), accountId: acc.id, note: 'Saldo inicial' };
      this.setState({ accounts: [acc], transactions: [tx], userName: this.state.obName.trim() || 'Tú', onboardingDone: true });
    },

    // -------- add transaction --------
    setTxType(t) { this.setState({ txType: t, txCategoryId: '', showNewCategory: false }); },
    toggleTxRepeat() { this.setState({ txRepeat: !this.state.txRepeat }); },
    setTxFreq(f) { this.setState({ txFreq: f }); },
    selectFund(id) {
      const f = this.state.investments.find(x => x.id === id);
      this.setState({ txFundMode: 'existing', txFundId: id, txFundPrice: f ? numToInputStr(f.currentPrice) : this.state.txFundPrice });
    },
    selectNewFund() { this.setState({ txFundMode: 'new', txFundId: '' }); },
    toggleNewCategory() { this.setState({ showNewCategory: !this.state.showNewCategory }); },

    addCategoryInline() {
      const name = this.state.newCatName.trim(); if (!name) return;
      const type = this.state.txType === 'income' ? 'income' : 'expense';
      const cat = { id: uid(), name, type, color: this.state.newCatColor, kind: type === 'expense' ? 'daily' : undefined };
      this.setState({ categories: [...this.state.categories, cat], newCatName: '', newCatColor: PALETTE[0], showNewCategory: false, txCategoryId: cat.id });
    },
    addCategoryFromModal() {
      const name = this.state.newCatName.trim(); if (!name) return;
      const cat = { id: uid(), name, type: this.state.catTab, color: this.state.newCatColor, kind: this.state.catTab === 'expense' ? 'daily' : undefined };
      this.setState({ categories: [...this.state.categories, cat], newCatName: '', newCatColor: PALETTE[0] });
    },
    openCategoryBudget(id) {
      const cat = this.state.categories.find(c => c.id === id);
      if (!cat) return;
      this.setState({
        editingCategoryId: id,
        catKind: cat.kind || 'daily',
        catBudgetType: cat.budgetType || 'amount',
        catBudgetValue: cat.budgetValue ? numToInputStr(cat.budgetValue) : '',
        catBudgetReturnTo: this.state.modal === 'settings' ? 'settings' : null,
        modal: 'categoryBudget',
      });
    },
    saveCategoryBudget() {
      const id = this.state.editingCategoryId;
      const value = parseNum(this.state.catBudgetValue);
      const hasValue = this.state.catBudgetValue.trim() !== '' && value > 0;
      const categories = this.state.categories.map(c => c.id === id ? {
        ...c,
        kind: this.state.catKind,
        budgetType: hasValue ? this.state.catBudgetType : null,
        budgetValue: hasValue ? value : 0,
      } : c);
      this.setState({ categories, modal: this.state.catBudgetReturnTo || null, editingCategoryId: null });
    },
    clearCategoryBudget() {
      const id = this.state.editingCategoryId;
      const categories = this.state.categories.map(c => c.id === id ? { ...c, budgetType: null, budgetValue: 0 } : c);
      this.setState({ categories, modal: this.state.catBudgetReturnTo || null, editingCategoryId: null });
    },
    categoryBudgetRows(kind, expenseList) {
      const spentByCat = {};
      expenseList.forEach(t => { spentByCat[t.categoryId] = (spentByCat[t.categoryId] || 0) + t.amount; });
      const jornal = this.state.jornal || 0;
      const rows = this.state.categories
        .filter(c => c.type === 'expense' && (c.kind || 'daily') === kind)
        .map(c => {
          const spent = spentByCat[c.id] || 0;
          const hasBudget = c.budgetType === 'amount' || c.budgetType === 'percent';
          const limit = c.budgetType === 'percent' ? (c.budgetValue / 100) * jornal : (c.budgetType === 'amount' ? c.budgetValue : 0);
          return { id: c.id, name: c.name, color: c.color, spent, hasBudget, budgetType: c.budgetType, budgetValue: c.budgetValue, limit };
        })
        .filter(r => r.spent > 0 || r.hasBudget)
        .sort((a, b) => b.spent - a.spent);
      return { rows, total: rows.reduce((a, r) => a + r.spent, 0) };
    },
    deleteCategory(id) {
      if (!window.confirm('¿Eliminar esta categoría?')) return;
      this.setState({ categories: this.state.categories.filter(c => c.id !== id) });
    },

    saveTx() {
      if (this.state.txType === 'investment') { this.saveInvestmentTx(); return; }
      const amt = parseNum(this.state.txAmount);
      if (!amt || amt <= 0) { alert('Introduce un importe válido'); return; }
      if (!this.state.txAccountId) { alert('Selecciona una cuenta'); return; }
      const type = this.state.txType;
      const accounts = this.state.accounts.map(a => {
        if (a.id !== this.state.txAccountId) return a;
        return { ...a, balance: type === 'expense' ? a.balance - amt : a.balance + amt };
      });
      const tx = { id: uid(), type, amount: amt, date: this.state.txDate, accountId: this.state.txAccountId, categoryId: this.state.txCategoryId || null, note: this.state.txNote };
      let recurringRules = this.state.recurringRules;
      if (this.state.txRepeat) {
        const rule = { id: uid(), type, amount: amt, accountId: this.state.txAccountId, categoryId: this.state.txCategoryId || null, note: this.state.txNote, frequency: this.state.txFreq, nextDate: this.addFrequency(this.state.txDate, this.state.txFreq) };
        recurringRules = [...recurringRules, rule];
        tx.recurringRuleId = rule.id;
      }
      this.setState({ accounts, transactions: [tx, ...this.state.transactions], recurringRules, modal: null, txAmount: '', txNote: '', txCategoryId: '', txRepeat: false });
    },

    saveInvestmentTx() {
      if (!this.state.txAccountId) { alert('Selecciona la cuenta de origen'); return; }
      const price = parseNum(this.state.txFundPrice);
      const units = parseNum(this.state.txFundUnits);
      if (!price || price <= 0) { alert('Indica el precio por participación'); return; }
      if (!units || units <= 0) { alert('Indica las unidades'); return; }
      const amt = price * units;
      let investments = this.state.investments.map(f => ({ ...f }));
      let fund;
      if (this.state.txFundMode === 'new') {
        if (!this.state.txFundName.trim()) { alert('Indica el nombre del fondo'); return; }
        fund = { id: uid(), name: this.state.txFundName.trim(), isin: this.state.txFundIsin.trim(), units: 0, avgCost: 0, currentPrice: price, totalInvested: 0, ops: [], priceSource: this.state.txFundIsin.trim() ? 'auto' : 'manual' };
        investments.push(fund);
      } else {
        fund = investments.find(f => f.id === this.state.txFundId);
        if (!fund) { alert('Selecciona un fondo'); return; }
      }
      const newUnits = fund.units + units;
      const newInvested = fund.totalInvested + amt;
      fund.units = newUnits; fund.totalInvested = newInvested; fund.avgCost = newUnits ? newInvested / newUnits : 0; fund.currentPrice = price;
      const newOp = { id: uid(), type: 'buy', date: this.state.txDate, units, price, amount: amt };
      fund.ops = [newOp, ...fund.ops];
      const accounts = this.state.accounts.map(a => a.id === this.state.txAccountId ? { ...a, balance: a.balance - amt } : a);
      const tx = { id: uid(), type: 'investment_buy', amount: amt, date: this.state.txDate, accountId: this.state.txAccountId, fundId: fund.id, opId: newOp.id, note: this.state.txNote || fund.name };
      let recurringRules = this.state.recurringRules;
      if (this.state.txRepeat) {
        const rule = { id: uid(), type: 'investment', amount: amt, accountId: this.state.txAccountId, fundId: fund.id, note: this.state.txNote || ('Plan ' + fund.name), frequency: this.state.txFreq, nextDate: this.addFrequency(this.state.txDate, this.state.txFreq) };
        recurringRules = [...recurringRules, rule];
        tx.recurringRuleId = rule.id;
      }
      this.setState({ investments, accounts, transactions: [tx, ...this.state.transactions], recurringRules, modal: null, txAmount: '', txFundPrice: '', txFundUnits: '', txFundName: '', txFundIsin: '', txNote: '', txRepeat: false, txFundId: '' });
    },

    // -------- recurring --------
    // Investment rules confirm via openConfirmDueRule -> the fund buy sheet
    // (editable date/units/price), not here — this only handles income/expense.
    confirmRecurring(ruleId) {
      const rule = this.state.recurringRules.find(r => r.id === ruleId);
      if (!rule || rule.type === 'investment') return;
      const today = todayISO();
      const accounts = this.state.accounts.map(a => a.id === rule.accountId ? { ...a, balance: rule.type === 'expense' ? a.balance - rule.amount : a.balance + rule.amount } : a);
      const tx = { id: uid(), type: rule.type, amount: rule.amount, date: today, accountId: rule.accountId, categoryId: rule.categoryId, note: rule.note, recurringRuleId: rule.id };
      const recurringRules = this.state.recurringRules.map(r => r.id === ruleId ? { ...r, nextDate: this.addFrequency(r.nextDate, r.frequency) } : r);
      this.setState({ accounts, transactions: [tx, ...this.state.transactions], recurringRules });
    },
    skipRecurring(ruleId) {
      const recurringRules = this.state.recurringRules.map(r => r.id === ruleId ? { ...r, nextDate: this.addFrequency(r.nextDate, r.frequency) } : r);
      this.setState({ recurringRules });
    },
    deleteRecurring(ruleId) {
      if (!window.confirm('¿Eliminar esta regla recurrente?')) return;
      this.setState({ recurringRules: this.state.recurringRules.filter(r => r.id !== ruleId), editingPlanId: null });
    },
    togglePlanEdit(rule) {
      this.setState({ editingPlanId: rule.id, planEditAmount: numToInputStr(rule.amount), planEditDay: String(new Date(rule.nextDate + 'T00:00:00').getDate()), planEditFreq: rule.frequency, planEditAccountId: rule.accountId, modal: 'planEdit' });
    },
    savePlanEdit(ruleId) {
      const amt = parseNum(this.state.planEditAmount);
      if (!amt || amt <= 0) { alert('Importe inválido'); return; }
      const day = Math.min(28, Math.max(1, parseInt(this.state.planEditDay, 10) || 1));
      const freq = this.state.planEditFreq;
      const accountId = this.state.planEditAccountId;
      const today = todayISO();
      const recurringRules = this.state.recurringRules.map(r => {
        if (r.id !== ruleId) return r;
        const d = new Date(r.nextDate + 'T00:00:00'); d.setDate(day);
        let nextDate = d.toISOString().slice(0, 10);
        if (nextDate < today) { d.setMonth(d.getMonth() + 1); nextDate = d.toISOString().slice(0, 10); }
        return { ...r, amount: amt, frequency: freq, accountId, nextDate };
      });
      this.setState({ recurringRules, editingPlanId: null, modal: null });
    },
    deletePlanFromPage() {
      if (!this.state.editingPlanId) return;
      if (!window.confirm('¿Eliminar este plan?')) return;
      this.setState({ recurringRules: this.state.recurringRules.filter(r => r.id !== this.state.editingPlanId), editingPlanId: null, modal: null });
    },
    toggleRecurringInline() { this.setState({ recurringInlineOpen: !this.state.recurringInlineOpen }); },
    openRecurringEdit(id) {
      const rule = this.state.recurringRules.find(r => r.id === id);
      if (!rule || rule.type === 'investment') return;
      this.setState({
        editingRecurringId: id,
        recEditType: rule.type,
        recEditAmount: numToInputStr(rule.amount),
        recEditCategoryId: rule.categoryId || '',
        recEditAccountId: rule.accountId,
        recEditFreq: rule.frequency,
        recEditDay: String(new Date(rule.nextDate + 'T00:00:00').getDate()),
        recEditNote: rule.note || '',
        modal: 'recurringEdit',
      });
    },
    openRecurringNew(presetKey) {
      const preset = RECURRING_PRESETS[presetKey];
      let categories = this.state.categories;
      let categoryId = '';
      let note = '';
      if (preset) {
        let cat = categories.find(c => c.name === preset.catName && c.type === 'expense');
        if (!cat) {
          cat = { id: uid(), name: preset.catName, type: 'expense', color: PALETTE[categories.length % PALETTE.length], kind: 'fixed' };
          categories = [...categories, cat];
        }
        categoryId = cat.id;
        note = preset.note;
      }
      this.setState({
        categories,
        editingRecurringId: null,
        recEditType: 'expense',
        recEditAmount: '',
        recEditCategoryId: categoryId,
        recEditAccountId: this.state.accounts[0] ? this.state.accounts[0].id : '',
        recEditFreq: 'monthly',
        recEditDay: String(new Date().getDate()),
        recEditNote: note,
        modal: 'recurringEdit',
      });
    },
    saveRecurringEdit() {
      const amt = parseNum(this.state.recEditAmount);
      if (!amt || amt <= 0) { alert('Introduce un importe válido'); return; }
      if (!this.state.recEditAccountId) { alert('Selecciona una cuenta'); return; }
      const day = Math.min(28, Math.max(1, parseInt(this.state.recEditDay, 10) || 1));
      const today = todayISO();
      const computeNextDate = (baseIso) => {
        const d = new Date(baseIso + 'T00:00:00'); d.setDate(day);
        let nextDate = d.toISOString().slice(0, 10);
        if (nextDate < today) { d.setMonth(d.getMonth() + 1); nextDate = d.toISOString().slice(0, 10); }
        return nextDate;
      };
      let recurringRules;
      if (this.state.editingRecurringId) {
        recurringRules = this.state.recurringRules.map(r => r.id !== this.state.editingRecurringId ? r : {
          ...r,
          amount: amt,
          categoryId: this.state.recEditCategoryId || null,
          accountId: this.state.recEditAccountId,
          frequency: this.state.recEditFreq,
          note: this.state.recEditNote,
          nextDate: computeNextDate(r.nextDate),
        });
      } else {
        const rule = {
          id: uid(), type: this.state.recEditType, amount: amt,
          accountId: this.state.recEditAccountId, categoryId: this.state.recEditCategoryId || null,
          note: this.state.recEditNote, frequency: this.state.recEditFreq,
          nextDate: computeNextDate(today),
        };
        recurringRules = [...this.state.recurringRules, rule];
      }
      this.setState({ recurringRules, editingRecurringId: null, modal: null });
    },
    deleteRecurringFromEdit() {
      const id = this.state.editingRecurringId;
      if (!id) { this.setState({ modal: null }); return; }
      if (!window.confirm('¿Eliminar esta regla recurrente?')) return;
      this.setState({ recurringRules: this.state.recurringRules.filter(r => r.id !== id), editingRecurringId: null, modal: null });
    },

    // -------- accounts --------
    createAccount() {
      const f = this.state.accForm;
      if (!f.name.trim()) { alert('Indica un nombre'); return; }
      let bal = parseNum(f.balance);
      const isDebt = f.type === 'tarjeta';
      if (isDebt) bal = -Math.abs(bal);
      const acc = { id: uid(), name: f.name.trim(), type: f.type, balance: bal, isDebt, color: f.color, order: this.state.accounts.length };
      const tx = { id: uid(), type: 'adjustment', amount: bal, date: todayISO(), accountId: acc.id, note: 'Saldo inicial' };
      this.setState({ accounts: [...this.state.accounts, acc], transactions: [tx, ...this.state.transactions], modal: null });
    },
    openEditAccount(id) {
      const acc = this.state.accounts.find(a => a.id === id);
      if (!acc) return;
      this.setState({ editingAccountId: id, accForm: { name: acc.name, type: acc.type, balance: '', isDebt: acc.isDebt, color: acc.color }, modal: 'editAccount' });
    },
    saveEditAccount() {
      const { editingAccountId, accForm } = this.state;
      const accounts = this.state.accounts.map(a => a.id === editingAccountId ? { ...a, name: accForm.name.trim() || a.name, color: accForm.color } : a);
      this.setState({ accounts, modal: null, editingAccountId: null });
    },
    deleteAccountAction() {
      if (!window.confirm('Se eliminará la cuenta y sus movimientos. ¿Continuar?')) return;
      const id = this.state.editingAccountId;
      const accounts = this.state.accounts.filter(a => a.id !== id);
      const transactions = this.state.transactions.filter(t => t.accountId !== id && t.toAccountId !== id);
      const recurringRules = this.state.recurringRules.filter(r => r.accountId !== id);
      this.setState({ accounts, transactions, recurringRules, modal: null, editingAccountId: null, activeAccountIndex: 0 });
    },
    openAddMoney(accountId) { this.setState({ addMoneyAccountId: accountId || (this.state.accounts[0] ? this.state.accounts[0].id : ''), addMoneyAmount: '', addMoneyNote: '', modal: 'addMoney' }); },
    addMoney() {
      const amt = parseNum(this.state.addMoneyAmount);
      if (!amt || amt <= 0 || !this.state.addMoneyAccountId) { alert('Completa los datos'); return; }
      const accounts = this.state.accounts.map(a => a.id === this.state.addMoneyAccountId ? { ...a, balance: a.balance + amt } : a);
      const tx = { id: uid(), type: 'adjustment', amount: amt, date: todayISO(), accountId: this.state.addMoneyAccountId, note: this.state.addMoneyNote || 'Añadir dinero' };
      this.setState({ accounts, transactions: [tx, ...this.state.transactions], modal: null, addMoneyAmount: '', addMoneyNote: '' });
    },
    openTransfer() { this.setState({ transferFrom: '', transferTo: '', transferAmount: '', modal: 'transfer' }); },
    doTransfer() {
      const amt = parseNum(this.state.transferAmount);
      const { transferFrom, transferTo } = this.state;
      if (!amt || amt <= 0 || !transferFrom || !transferTo || transferFrom === transferTo) { alert('Completa los datos correctamente'); return; }
      const fromAcc = this.state.accounts.find(a => a.id === transferFrom);
      const toAcc = this.state.accounts.find(a => a.id === transferTo);
      const accounts = this.state.accounts.map(a => {
        if (a.id === transferFrom) return { ...a, balance: a.balance - amt };
        if (a.id === transferTo) return { ...a, balance: a.balance + amt };
        return a;
      });
      const linkId = uid();
      const txOut = { id: uid(), type: 'transfer_out', amount: -amt, date: todayISO(), accountId: transferFrom, toAccountId: transferTo, note: 'Transferencia a ' + toAcc.name, linkedId: linkId };
      const txIn = { id: uid(), type: 'transfer_in', amount: amt, date: todayISO(), accountId: transferTo, toAccountId: transferFrom, note: 'Transferencia de ' + fromAcc.name, linkedId: linkId };
      this.setState({ accounts, transactions: [txIn, txOut, ...this.state.transactions], modal: null, transferAmount: '', transferFrom: '', transferTo: '' });
    },
    startDragReorder(id, e) {
      e.preventDefault();
      this._dragList = [...this.state.accounts].sort((a, b) => a.order - b.order);
      this._dragIndex = this._dragList.findIndex(a => a.id === id);
      this._dragStartY = e.clientY;
      this.setState({ dragId: id, dragY: 0 });
      this._onDragMove = (ev) => this.onDragReorderMove(ev);
      this._onDragUp = () => this.endDragReorder();
      window.addEventListener('pointermove', this._onDragMove);
      window.addEventListener('pointerup', this._onDragUp);
    },
    onDragReorderMove(e) {
      if (!this.state.dragId) return;
      const dy = e.clientY - this._dragStartY;
      const ROW_H = 54;
      let newIndex = this._dragIndex + Math.round(dy / ROW_H);
      newIndex = Math.max(0, Math.min(this._dragList.length - 1, newIndex));
      if (newIndex !== this._dragIndex) {
        const list = [...this._dragList];
        const [item] = list.splice(this._dragIndex, 1);
        list.splice(newIndex, 0, item);
        this._dragList = list;
        this._dragIndex = newIndex;
        this._dragStartY = e.clientY;
        const accounts = this.state.accounts.map(a => { const i = list.findIndex(x => x.id === a.id); return i >= 0 ? { ...a, order: i } : a; });
        this.setState({ accounts, dragY: 0 });
      } else {
        this.state.dragY = dy;
        this.updateDragVisual();
      }
    },
    // Live drag offset: patch just the dragged row's transform instead of a full
    // re-render, so the pointer-follow feels smooth (60fps) instead of janky.
    updateDragVisual() {
      const el = document.querySelector('.reorder-row[data-dragging="1"]');
      if (el) el.style.transform = 'translateY(' + this.state.dragY + 'px)';
    },
    endDragReorder() {
      window.removeEventListener('pointermove', this._onDragMove);
      window.removeEventListener('pointerup', this._onDragUp);
      this.setState({ dragId: null, dragY: 0 });
    },
    onAccountsScroll(e) {
      const cardW = 336;
      const idx = Math.round(e.target.scrollLeft / cardW);
      if (idx !== this.state.activeAccountIndex) { this.state.activeAccountIndex = idx; this.updateAccountDots(idx); }
    },
    updateAccountDots(idx) {
      const dots = document.querySelectorAll('.account-dot');
      dots.forEach((d, i) => {
        d.style.width = i === idx ? '18px' : '6px';
        d.style.background = i === idx ? 'oklch(58% 0.15 155)' : 'oklch(88% 0.006 90)';
      });
    },

    // -------- fund detail --------
    openFund(id) { this.setState({ activeFundId: id, modal: 'fundDetail', fundAction: null, editingPrice: false }); },
    currentFund() { return this.state.investments.find(f => f.id === this.state.activeFundId); },
    startBuy() { this.setState({ fundAction: 'buy', fundActionAmount: '', fundActionUnits: '', fundActionFee: '', fundActionDate: todayISO(), fundActionAccountId: this.state.accounts[0] ? this.state.accounts[0].id : '' }); },
    startSell() { this.setState({ fundAction: 'sell', fundActionUnits: '', fundActionAmount: '', fundActionFee: '', fundActionDate: todayISO(), fundActionAccountId: this.state.accounts[0] ? this.state.accounts[0].id : '' }); },
    openConfirmDueRule(ruleId) {
      const rule = this.state.recurringRules.find(r => r.id === ruleId);
      if (!rule || rule.type !== 'investment') return;
      const fund = this.state.investments.find(f => f.id === rule.fundId);
      const price = fund && fund.currentPrice ? fund.currentPrice : 0;
      const units = price > 0 ? (rule.amount / price) : 0;
      this.setState({
        activeFundId: rule.fundId, modal: 'fundDetail', editingPrice: false,
        fundAction: 'buy', confirmingRuleId: ruleId,
        fundActionAmount: numToInputStr(rule.amount),
        fundActionUnits: units > 0 ? numToInputStr(+units.toFixed(4)) : '',
        fundActionFee: '', fundActionDate: rule.nextDate || todayISO(),
        fundActionAccountId: rule.accountId || (this.state.accounts[0] ? this.state.accounts[0].id : ''),
      });
    },
    cancelFundAction() { this.setState({ fundAction: null, confirmingRuleId: null }); },
    startEditPrice() { const f = this.currentFund(); if (!f) return; this.setState({ editingPrice: true, editingPriceValue: numToInputStr(f.currentPrice) }); },
    saveEditPrice() {
      const price = parseNum(this.state.editingPriceValue);
      if (!price || price <= 0) { this.setState({ editingPrice: false }); return; }
      const investments = this.state.investments.map(f => f.id === this.state.activeFundId ? { ...f, currentPrice: price } : f);
      this.setState({ investments, editingPrice: false });
    },
    startEditJornal() { this.setState({ editingJornal: true, editingJornalValue: this.state.jornal ? numToInputStr(this.state.jornal) : '' }); },
    saveEditJornal() {
      const value = parseNum(this.state.editingJornalValue) || 0;
      this.setState({ jornal: Math.max(0, value), editingJornal: false });
    },
    confirmFundBuy() {
      const fund = this.currentFund(); if (!fund) return;
      const units = parseNum(this.state.fundActionUnits);
      const amt = parseNum(this.state.fundActionAmount);
      const fee = parseNum(this.state.fundActionFee) || 0;
      const date = this.state.fundActionDate || todayISO();
      if (!units || units <= 0 || !amt || amt <= 0 || !this.state.fundActionAccountId) { alert('Completa los datos'); return; }
      const price = amt / units, cost = amt + fee, cashOut = amt + fee;
      const ruleId = this.state.confirmingRuleId;
      const newOp = { id: uid(), type: 'buy', date, units, price, amount: cost };
      const investments = this.state.investments.map(f => {
        if (f.id !== fund.id) return f;
        const newUnits = f.units + units, newInvested = f.totalInvested + cost;
        return { ...f, units: newUnits, totalInvested: newInvested, avgCost: newInvested / newUnits, currentPrice: price, ops: [newOp, ...f.ops] };
      });
      const accounts = this.state.accounts.map(a => a.id === this.state.fundActionAccountId ? { ...a, balance: a.balance - cashOut } : a);
      const tx = { id: uid(), type: 'investment_buy', amount: cashOut, date, accountId: this.state.fundActionAccountId, fundId: fund.id, opId: newOp.id, note: fund.name };
      let recurringRules = this.state.recurringRules;
      if (ruleId) {
        tx.recurringRuleId = ruleId;
        recurringRules = recurringRules.map(r => r.id === ruleId ? { ...r, nextDate: this.addFrequency(r.nextDate, r.frequency) } : r);
      }
      this.setState({ investments, accounts, transactions: [tx, ...this.state.transactions], recurringRules, fundAction: null, confirmingRuleId: null, modal: ruleId ? null : this.state.modal });
    },
    confirmFundSell() {
      const fund = this.currentFund(); if (!fund) return;
      const units = parseNum(this.state.fundActionUnits);
      const amt = parseNum(this.state.fundActionAmount);
      const fee = parseNum(this.state.fundActionFee) || 0;
      if (!units || units <= 0 || units > fund.units + 1e-9 || !amt || amt <= 0 || !this.state.fundActionAccountId) { alert('Datos inválidos'); return; }
      const date = this.state.fundActionDate || todayISO();
      const price = amt / units, proceeds = amt - fee;
      const newOp = { id: uid(), type: 'sell', date, units, price, amount: proceeds };
      const investments = this.state.investments.map(f => {
        if (f.id !== fund.id) return f;
        const newUnits = f.units - units;
        const newInvested = newUnits > 1e-9 ? f.totalInvested * (newUnits / f.units) : 0;
        return { ...f, units: newUnits, totalInvested: newInvested, avgCost: newUnits > 1e-9 ? newInvested / newUnits : 0, currentPrice: price, ops: [newOp, ...f.ops] };
      });
      const accounts = this.state.accounts.map(a => a.id === this.state.fundActionAccountId ? { ...a, balance: a.balance + proceeds } : a);
      const tx = { id: uid(), type: 'investment_sell', amount: proceeds, date, accountId: this.state.fundActionAccountId, fundId: fund.id, opId: newOp.id, note: fund.name };
      this.setState({ investments, accounts, transactions: [tx, ...this.state.transactions], fundAction: null });
    },
    deleteFund() {
      if (!window.confirm('¿Eliminar esta inversión?')) return;
      const id = this.state.activeFundId;
      const investments = this.state.investments.filter(f => f.id !== id);
      const transactions = this.state.transactions.filter(t => t.fundId !== id);
      const recurringRules = this.state.recurringRules.filter(r => r.fundId !== id);
      this.setState({ investments, transactions, recurringRules, modal: null, activeFundId: null });
    },
    recomputeFundFromOps(ops) {
      const sorted = [...ops].sort((a, b) => a.date < b.date ? -1 : (a.date > b.date ? 1 : 0));
      let units = 0, invested = 0;
      sorted.forEach(op => {
        if (op.type === 'buy') { units += op.units; invested += op.amount; }
        else { const newUnits = units - op.units; invested = newUnits > 1e-9 ? invested * (newUnits / units) : 0; units = newUnits; }
      });
      return { units, totalInvested: invested, avgCost: units > 1e-9 ? invested / units : 0 };
    },

    // -------- transaction detail: view / edit / delete --------
    openTxDetail(id) {
      const t = this.state.transactions.find(x => x.id === id);
      if (!t) return;
      this.setState({
        editingTxId: id, modal: 'txDetail',
        txEditAmount: numToInputStr(Math.abs(t.amount)), txEditDate: t.date,
        txEditCategoryId: t.categoryId || '', txEditAccountId: t.accountId || '', txEditNote: t.note || '',
      });
    },
    saveTxEdit() {
      const t = this.state.transactions.find(x => x.id === this.state.editingTxId);
      if (!t) return;
      if (t.type !== 'expense' && t.type !== 'income' && t.type !== 'adjustment') return;
      const newAmt = parseNum(this.state.txEditAmount);
      if (!newAmt || newAmt <= 0) { alert('Introduce un importe válido'); return; }
      const signedNew = (t.type === 'expense' ? -1 : 1) * newAmt;
      const oldAccountId = t.accountId, newAccountId = this.state.txEditAccountId || t.accountId;
      let accounts = this.state.accounts;
      if (oldAccountId) accounts = accounts.map(a => a.id === oldAccountId ? { ...a, balance: a.balance - (t.type === 'expense' ? -t.amount : t.amount) } : a);
      if (newAccountId) accounts = accounts.map(a => a.id === newAccountId ? { ...a, balance: a.balance + signedNew } : a);
      const transactions = this.state.transactions.map(x => x.id === t.id ? {
        ...x, amount: newAmt, date: this.state.txEditDate || x.date,
        accountId: newAccountId, categoryId: this.state.txEditCategoryId || x.categoryId, note: this.state.txEditNote,
      } : x);
      this.setState({ accounts, transactions, modal: null, editingTxId: null });
    },
    deleteTx(id) {
      const t = this.state.transactions.find(x => x.id === id);
      if (!t) return;
      if (!window.confirm('¿Eliminar este movimiento? Se deshará su efecto en el saldo.')) return;
      let accounts = this.state.accounts;
      let investments = this.state.investments;
      let transactions = this.state.transactions;
      let recurringRules = this.state.recurringRules;

      if (t.type === 'transfer_out' || t.type === 'transfer_in') {
        const pair = transactions.filter(x => x.linkedId && x.linkedId === t.linkedId);
        pair.forEach(p => { if (p.accountId) accounts = accounts.map(a => a.id === p.accountId ? { ...a, balance: a.balance - p.amount } : a); });
        transactions = transactions.filter(x => !(x.linkedId && x.linkedId === t.linkedId));
      } else if (t.type === 'investment_buy' || t.type === 'investment_sell') {
        investments = investments.map(f => {
          if (f.id !== t.fundId) return f;
          const ops = f.ops.filter(o => o.id !== t.opId);
          const recomputed = this.recomputeFundFromOps(ops);
          return { ...f, ops, ...recomputed };
        });
        if (t.accountId) {
          const delta = t.type === 'investment_buy' ? t.amount : -t.amount; // give cash back on buy, take it back on sell
          accounts = accounts.map(a => a.id === t.accountId ? { ...a, balance: a.balance + delta } : a);
        }
        transactions = transactions.filter(x => x.id !== t.id);
      } else {
        // expense / income / adjustment: undo its effect on the account, then drop it
        if (t.accountId) {
          const undo = t.type === 'expense' ? t.amount : -t.amount; // expense subtracted amount, so add it back; income/adjustment added, so subtract
          accounts = accounts.map(a => a.id === t.accountId ? { ...a, balance: a.balance + undo } : a);
        }
        transactions = transactions.filter(x => x.id !== t.id);
      }
      this.setState({ accounts, investments, transactions, recurringRules, modal: null, editingTxId: null });
    },

    // -------- stats --------
    periodRange(period, refISO) {
      const ref = new Date(refISO + 'T00:00:00');
      let start, end, label, prevStart, prevEnd;
      if (period === 'day') {
        start = new Date(ref); end = new Date(ref);
        label = ref.getDate() + ' de ' + MONTHS[ref.getMonth()] + ' de ' + ref.getFullYear();
        prevStart = new Date(ref); prevStart.setDate(prevStart.getDate() - 1); prevEnd = new Date(prevStart);
      } else if (period === 'week') {
        const day = ref.getDay(); const diffToMon = (day === 0 ? -6 : 1 - day);
        start = new Date(ref); start.setDate(start.getDate() + diffToMon);
        end = new Date(start); end.setDate(end.getDate() + 6);
        label = 'Semana del ' + start.getDate() + ' al ' + end.getDate() + ' de ' + MONTHS[end.getMonth()];
        prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 7);
        prevEnd = new Date(end); prevEnd.setDate(prevEnd.getDate() - 7);
      } else if (period === 'year') {
        start = new Date(ref.getFullYear(), 0, 1); end = new Date(ref.getFullYear(), 11, 31);
        label = String(ref.getFullYear());
        prevStart = new Date(ref.getFullYear() - 1, 0, 1); prevEnd = new Date(ref.getFullYear() - 1, 11, 31);
      } else {
        start = new Date(ref.getFullYear(), ref.getMonth(), 1);
        end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
        const mn = MONTHS[ref.getMonth()];
        label = mn.charAt(0).toUpperCase() + mn.slice(1) + ' de ' + ref.getFullYear();
        prevStart = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
        prevEnd = new Date(ref.getFullYear(), ref.getMonth(), 0);
      }
      end.setHours(23, 59, 59, 999); prevEnd.setHours(23, 59, 59, 999);
      return { start, end, label, prevStart, prevEnd };
    },
    navPeriod(dir) {
      const ref = new Date(this.state.statsRef + 'T00:00:00');
      if (this.state.statsPeriod === 'day') ref.setDate(ref.getDate() + dir);
      else if (this.state.statsPeriod === 'week') ref.setDate(ref.getDate() + 7 * dir);
      else if (this.state.statsPeriod === 'year') ref.setFullYear(ref.getFullYear() + dir);
      else ref.setMonth(ref.getMonth() + dir);
      this.setState({ statsRef: ref.toISOString().slice(0, 10) });
    },
    inRange(dateISO, start, end) { const d = new Date(dateISO + 'T00:00:00'); return d >= start && d <= end; },
    categoryBreakdown(list) {
      const map = {};
      list.forEach(t => {
        const cat = this.state.categories.find(c => c.id === t.categoryId);
        const key = cat ? cat.id : 'none';
        if (!map[key]) map[key] = { name: cat ? cat.name : 'Sin categoría', color: cat ? cat.color : 'oklch(70% 0.01 90)', amount: 0 };
        map[key].amount += t.amount;
      });
      const arr = Object.values(map).sort((a, b) => b.amount - a.amount);
      const total = arr.reduce((a, c) => a + c.amount, 0) || 1;
      return arr.map(c => ({ ...c, pct: Math.round(c.amount / total * 100), amountText: this.fmtAbs(c.amount) }));
    },

    // -------- CSV --------
    exportCSV() {
      const rows = [['fecha', 'tipo', 'importe', 'categoria', 'cuenta', 'nota']];
      this.state.transactions.forEach(t => {
        const accName = (this.state.accounts.find(a => a.id === t.accountId) || {}).name || '';
        const catName = (this.state.categories.find(c => c.id === t.categoryId) || {}).name || '';
        rows.push([t.date, t.type, t.amount, catName, accName, (t.note || '').replace(/,/g, ';')]);
      });
      const csv = rows.map(r => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'patrimonio_transacciones.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    handleImportFile(e) {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const text = String(ev.target.result);
          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          lines.shift();
          const newTx = [];
          lines.forEach(line => {
            const parts = line.split(',');
            const [date, type, amount, catName, accName] = parts;
            const note = parts.slice(5).join(',');
            const acc = this.state.accounts.find(a => a.name === accName);
            if (!acc) return;
            const cat = this.state.categories.find(c => c.name === catName);
            newTx.push({ id: uid(), type, amount: parseFloat(amount) || 0, date, accountId: acc.id, categoryId: cat ? cat.id : null, note: note || '' });
          });
          this.setState({ transactions: [...newTx, ...this.state.transactions] });
          alert('Importadas ' + newTx.length + ' transacciones');
        } catch (err) { alert('No se pudo importar el archivo'); }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    // -------- JSON backup (full state — accounts, investments, rules, history) --------
    exportJSON() {
      const blob = new Blob([JSON.stringify(this.pickPersisted(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'patrimonio_backup.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    // Merges an exported (or externally converted) backup into the current data —
    // additive, not a replace: every imported id is regenerated so it can never
    // collide with what's already here, while cross-references (which account,
    // category or fund a transaction/rule points to) are remapped to match.
    importJSONFile(e) {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        let data;
        try { data = JSON.parse(String(ev.target.result)); } catch (err) { alert('El archivo no es un JSON válido'); return; }
        if (!data || typeof data !== 'object') { alert('El archivo no tiene el formato esperado'); return; }
        try {
          const categories = [...this.state.categories];
          const catIdMap = {};
          (data.categories || []).forEach(c => {
            const existing = categories.find(x => x.name === c.name && x.type === c.type);
            if (existing) { catIdMap[c.id] = existing.id; }
            else { const nc = { id: uid(), name: c.name, type: c.type, color: c.color || PALETTE[0] }; categories.push(nc); catIdMap[c.id] = nc.id; }
          });
          const accounts = [...this.state.accounts];
          const accIdMap = {};
          (data.accounts || []).forEach(a => {
            const na = { ...a, id: uid(), order: accounts.length };
            accIdMap[a.id] = na.id;
            accounts.push(na);
          });
          const investments = [...this.state.investments];
          const fundIdMap = {};
          (data.investments || []).forEach(f => {
            const nf = { ...f, id: uid(), ops: (f.ops || []).map(o => ({ ...o, id: uid() })) };
            fundIdMap[f.id] = nf.id;
            investments.push(nf);
          });
          const remap = (t) => ({
            ...t, id: uid(),
            accountId: t.accountId ? (accIdMap[t.accountId] || t.accountId) : t.accountId,
            toAccountId: t.toAccountId ? (accIdMap[t.toAccountId] || t.toAccountId) : t.toAccountId,
            categoryId: t.categoryId ? (catIdMap[t.categoryId] || t.categoryId) : t.categoryId,
            fundId: t.fundId ? (fundIdMap[t.fundId] || t.fundId) : t.fundId,
          });
          const transactions = [...(data.transactions || []).map(remap), ...this.state.transactions];
          const recurringRules = [...this.state.recurringRules, ...(data.recurringRules || []).map(remap)];
          const mergeHistory = (existing, incoming) => {
            const map = {};
            [...(incoming || []), ...existing].forEach(h => { map[h.date] = h; });
            return Object.values(map).sort((a, b) => a.date < b.date ? -1 : 1);
          };
          const netWorthHistory = mergeHistory(this.state.netWorthHistory, data.netWorthHistory);
          const investmentHistory = mergeHistory(this.state.investmentHistory, data.investmentHistory);
          const closesMap = {};
          [...(data.monthlyCloses || []), ...this.state.monthlyCloses].forEach(c => { closesMap[c.month] = c; });
          const monthlyCloses = Object.values(closesMap).sort((a, b) => a.month < b.month ? -1 : 1);
          const jornal = this.state.jornal || data.jornal || 0;
          this.setState({ categories, accounts, investments, transactions, recurringRules, netWorthHistory, investmentHistory, monthlyCloses, jornal, modal: null });
          alert('Importado: ' + investments.length + ' inversiones, ' + (data.transactions || []).length + ' movimientos, ' + (data.accounts || []).length + ' cuentas nuevas.');
        } catch (err) { alert('No se pudo importar el archivo: ' + err.message); }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    seedDemoData() {
      if (!window.confirm('Esto reemplazará tus datos actuales con datos de ejemplo. ¿Continuar?')) return;
      const cats = defaultCategories();
      const catByName = (n) => cats.find(c => c.name === n);
      const accId1 = uid(), accId2 = uid(), accId3 = uid();
      const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
      let bal1 = 0, bal2 = 0, bal3 = 1500;
      let transactions = [{ id: uid(), type: 'adjustment', amount: 1500, date: daysAgo(85), accountId: accId3, note: 'Saldo inicial' }];
      [80, 50, 20].forEach(d => { transactions.push({ id: uid(), type: 'income', amount: 1800, date: daysAgo(d), accountId: accId1, categoryId: catByName('Nómina').id, note: 'Nómina' }); bal1 += 1800; });
      transactions.push({ id: uid(), type: 'income', amount: 350, date: daysAgo(15), accountId: accId1, categoryId: catByName('Freelance').id, note: 'Proyecto freelance' }); bal1 += 350;
      const expenseDefs = [['Supermercado', 45], ['Restaurantes', 18], ['Transporte', 30], ['Vivienda', 650], ['Ocio', 25], ['Salud', 40], ['Compras', 60], ['Suscripciones', 12.99]];
      for (let i = 0; i < 24; i++) {
        const d = Math.floor(Math.random() * 84) + 1;
        const pick = expenseDefs[Math.floor(Math.random() * expenseDefs.length)];
        const amt = +(pick[1] * (0.7 + Math.random() * 0.6)).toFixed(2);
        transactions.push({ id: uid(), type: 'expense', amount: amt, date: daysAgo(d), accountId: accId1, categoryId: catByName(pick[0]).id, note: '' });
        bal1 -= amt;
      }
      transactions.push({ id: uid(), type: 'expense', amount: 20, date: daysAgo(5), accountId: accId2, categoryId: catByName('Ocio').id, note: 'Cine' }); bal2 -= 20;
      transactions.push({ id: uid(), type: 'adjustment', amount: 100, date: daysAgo(60), accountId: accId2, note: 'Retirada de efectivo' }); bal2 += 100;
      const fundId = uid();
      const fund = { id: fundId, name: 'Fidelity S&P 500', isin: 'IE00BYX5MX67', units: 0, avgCost: 0, currentPrice: 0, totalInvested: 0, ops: [], priceSource: 'auto' };
      const buy = (units, price, d) => { fund.ops.unshift({ id: uid(), type: 'buy', date: daysAgo(d), units, price, amount: +(units * price).toFixed(2) }); fund.units += units; fund.totalInvested += units * price; fund.currentPrice = price; };
      buy(2.1, 180, 80); buy(2.05, 195, 50); buy(1.9, 205, 20);
      fund.avgCost = fund.totalInvested / fund.units;
      fund.ops.forEach(op => { if (op.type === 'buy') transactions.push({ id: uid(), type: 'investment_buy', amount: op.amount, date: op.date, accountId: accId1, fundId, opId: op.id, note: fund.name }); });
      bal1 -= fund.totalInvested;
      const accounts = [
        { id: accId1, name: 'BBVA', type: 'banco', balance: +bal1.toFixed(2), isDebt: false, color: PALETTE[1], order: 0 },
        { id: accId2, name: 'Efectivo', type: 'efectivo', balance: +bal2.toFixed(2), isDebt: false, color: PALETTE[5], order: 1 },
        { id: accId3, name: 'Ahorro', type: 'ahorro', balance: +bal3.toFixed(2), isDebt: false, color: PALETTE[0], order: 2 }
      ];
      const recurringRules = [
        { id: uid(), type: 'expense', amount: 12.99, accountId: accId1, categoryId: catByName('Suscripciones').id, note: 'Streaming', frequency: 'monthly', nextDate: daysAgo(2) },
        { id: uid(), type: 'investment', amount: 100, accountId: accId1, fundId, note: 'Plan ' + fund.name, frequency: 'monthly', nextDate: daysAgo(1) }
      ];
      const sortedOps = fund.ops.slice().sort((a, b) => a.date < b.date ? -1 : 1);
      const sampleDays = []; for (let d = 85; d > 0; d -= 4) { sampleDays.push(d); } sampleDays.push(0);
      const netWorthHistory = [], investmentHistory = [];
      sampleDays.forEach(d => {
        const dateStr = daysAgo(d);
        let cash = 0;
        transactions.forEach(t => {
          if (t.date > dateStr) return;
          if (t.type === 'income' || t.type === 'adjustment') cash += t.amount;
          else if (t.type === 'expense' || t.type === 'investment_buy') cash -= t.amount;
          else if (t.type === 'investment_sell') cash += t.amount;
        });
        let units = 0, invested = 0, price = 0;
        sortedOps.forEach(op => { if (op.date <= dateStr) { units += op.units; invested += op.amount; price = op.price; } });
        const market = units * price;
        netWorthHistory.push({ date: dateStr, value: +(cash + market).toFixed(2) });
        investmentHistory.push({ date: dateStr, invested: +invested.toFixed(2), market: +market.toFixed(2) });
      });
      this.setState({ accounts, transactions, categories: cats, recurringRules, investments: [fund], netWorthHistory, investmentHistory, onboardingDone: true, userName: this.state.userName || 'Miguel Ángel', modal: null, screen: 'home' });
    },
    resetAll() {
      if (!window.confirm('Esto borrará todos tus datos. ¿Seguro?')) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (err) {}
      this.state = this.initialState();
      this.commit();
    },
  });

  // ============================================================
  // Shared derived-data helpers (used by more than one screen)
  // ============================================================
  Object.assign(App, {
    buildTxRow(t) {
      const s = this.state;
      const acc = s.accounts.find(a => a.id === t.accountId);
      let title, color, letter, amountColor, amountText;
      if (t.type === 'expense' || t.type === 'income') {
        const cat = s.categories.find(c => c.id === t.categoryId);
        title = cat ? cat.name : 'Sin categoría';
        color = cat ? cat.color : (t.type === 'income' ? 'oklch(72% 0.15 155)' : 'oklch(64% 0.19 25)');
        letter = (title[0] || '?').toUpperCase();
        amountColor = t.type === 'income' ? 'oklch(45% 0.13 155)' : 'oklch(58% 0.19 25)';
        amountText = (t.type === 'income' ? '+' : '-') + this.fmtAbs(t.amount);
      } else if (t.type === 'transfer_out' || t.type === 'transfer_in') {
        title = t.type === 'transfer_out' ? 'Transferencia enviada' : 'Transferencia recibida';
        color = 'oklch(58% 0.02 260)'; letter = 'T';
        amountColor = 'oklch(30% 0.01 90)';
        amountText = (t.amount < 0 ? '-' : '+') + this.fmtAbs(t.amount);
      } else if (t.type === 'investment_buy' || t.type === 'investment_sell') {
        const f = s.investments.find(x => x.id === t.fundId);
        title = (t.type === 'investment_buy' ? 'Compra: ' : 'Venta: ') + (f ? f.name : t.note || 'Fondo');
        color = 'oklch(66% 0.14 235)'; letter = 'F';
        amountColor = 'oklch(56% 0.15 235)';
        amountText = (t.type === 'investment_buy' ? '-' : '+') + this.fmtAbs(t.amount);
      } else {
        title = t.note || 'Ajuste';
        color = 'oklch(72% 0.15 155)'; letter = (title[0] || 'A').toUpperCase();
        amountColor = t.amount >= 0 ? 'oklch(45% 0.13 155)' : 'oklch(58% 0.19 25)';
        amountText = (t.amount >= 0 ? '+' : '-') + this.fmtAbs(t.amount);
      }
      const subtitle = (acc ? acc.name : '') + ' · ' + this.dateLabelShort(t.date);
      return { id: t.id, title, color, letter, amountColor, amountText, subtitle };
    },
    sortedAccounts() { return [...this.state.accounts].sort((a, b) => a.order - b.order); },
  });

  // ============================================================
  // Render: pure HTML-string templates
  // ============================================================
  const Render = {};

  Render.txRow = (row) => `
    <button type="button" class="tx-row" style="width:100%;border:none;text-align:left;cursor:pointer" data-action="openTxDetail" data-id="${row.id}">
      <div class="avatar-badge" style="width:42px;height:42px;background:${row.color};font-size:16px">${esc(row.letter)}</div>
      <div style="flex:1;min-width:0">
        <div class="tx-title">${esc(row.title)}</div>
        <div class="tx-sub">${esc(row.subtitle)}</div>
      </div>
      <div class="tx-amount" style="color:${row.amountColor}">${esc(row.amountText)}</div>
    </button>`;

  Render.accChip = (a, selectedId, action, App) => `
    <button type="button" class="acc-chip" data-action="${action}" data-id="${a.id}" style="background:${selectedId === a.id ? 'oklch(93% 0.05 155)' : '#fff'};border-color:${selectedId === a.id ? 'oklch(58% 0.15 155)' : 'transparent'}">
      <span class="acc-chip-icon">${Icons.accountType(a.type)}</span>
      <span><span style="display:block">${esc(a.name)}</span><span style="display:block;font-size:11px;color:var(--ink-soft);margin-top:2px">${esc(App.fmt(a.balance))}</span></span>
    </button>`;

  Render.accChipFlat = (a, selectedId, action) => `
    <button type="button" class="acc-chip-flat" data-action="${action}" data-id="${a.id}" style="background:${selectedId === a.id ? 'oklch(93% 0.05 155)' : '#fff'};border-color:${selectedId === a.id ? 'oklch(58% 0.15 155)' : 'transparent'}">${esc(a.name)}</button>`;

  Render.colorSwatches = (selected, action) => PALETTE.map(c => `
    <button type="button" class="color-swatch" data-action="${action}" data-value="${c}" style="background:${c};box-shadow:${ringFor(c, c === selected)}">
      ${c === selected ? Icons.check('#fff') : ''}
    </button>`).join('');

  Render.switchEl = (on, action, id) => `
    <button type="button" class="switch-track" data-action="${action}" ${id ? `data-id="${id}"` : ''} style="background:${on ? 'oklch(58% 0.15 155)' : 'oklch(88% 0.006 90)'}">
      <span class="switch-knob" style="transform:translateX(${on ? 16 : 0}px)"></span>
    </button>`;

  // -------- onboarding --------
  Render.onboarding = (s) => {
    const accTypeDefs = [['banco', 'Banco'], ['efectivo', 'Efectivo'], ['ahorro', 'Ahorro'], ['tarjeta', 'Tarjeta'], ['inversion', 'Inversión']];
    const typeChips = accTypeDefs.map(([k, label]) => `
      <button type="button" class="pill-btn ${s.obAccType === k ? 'active' : ''}" data-action="selectObType" data-value="${k}">${label}</button>`).join('');
    return `
    <div class="onboarding">
      <div class="avatar-badge" style="width:56px;height:56px;background:oklch(58% 0.15 155);font-weight:800;font-size:24px">€</div>
      <div style="font-size:28px;font-weight:800;color:var(--ink);letter-spacing:-0.5px;margin-top:20px">Antes de empezar</div>
      <div style="font-size:15px;color:var(--ink-soft);margin-top:6px;line-height:1.4">Vamos a crear tu primera cuenta para calcular tu patrimonio.</div>

      <div class="field-label" style="margin-top:28px">Tu nombre</div>
      <input type="text" class="field-input" style="margin-top:8px;padding:16px;font-size:16px" data-bind="obName" value="${esc(s.obName)}" placeholder="Ej. Miguel Ángel"/>

      <div class="field-label" style="margin-top:24px">Nombre de la cuenta</div>
      <input type="text" class="field-input" style="margin-top:8px;padding:16px;font-size:16px" data-bind="obAccName" value="${esc(s.obAccName)}" placeholder="Ej. BBVA, Efectivo, Ahorros..."/>

      <div class="field-label" style="margin-top:20px">Tipo de cuenta</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">${typeChips}</div>

      <div class="field-label" style="margin-top:20px">Saldo inicial</div>
      <input type="text" inputmode="decimal" class="field-input big" style="margin-top:8px;padding:16px" data-bind="obBalance" value="${esc(s.obBalance)}" placeholder="0,00"/>
      ${s.obAccType === 'tarjeta' ? `<div style="margin-top:8px;font-size:12px;color:var(--red)">Se guardará como deuda (saldo negativo).</div>` : ''}

      <div class="field-label" style="margin-top:20px">Color</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">${Render.colorSwatches(s.obColor, 'selectObColor')}</div>

      <button type="button" id="obSubmitBtn" class="btn-primary" style="margin-top:32px" ${!s.obAccName.trim() ? 'disabled' : ''} data-action="completeOnboarding">Empezar</button>
    </div>`;
  };

  // -------- home --------
  Render.home = (App) => {
    const s = App.state;
    const netWorth = App.computeNetWorth();
    const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : (h < 20 ? 'Buenas tardes' : 'Buenas noches'); })();
    const monthAgoIso = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); })();
    const startRef = s.netWorthHistory.filter(h => h.date <= monthAgoIso).slice(-1)[0];
    const baseVal = startRef ? startRef.value : (s.netWorthHistory[0] ? s.netWorthHistory[0].value : netWorth);
    const delta = netWorth - baseVal;
    const deltaBg = delta >= 0 ? 'oklch(93% 0.05 155)' : 'oklch(94% 0.04 25)';
    const deltaColor = delta >= 0 ? 'oklch(38% 0.1 155)' : 'oklch(50% 0.15 25)';
    const deltaLabel = (delta >= 0 ? '▲ ' : '▼ ') + App.fmtAbs(delta) + ' este mes';

    const rangeCutoffs = { '1m': 30, '3m': 90, '1y': 365, all: 100000 };
    const cutoffDays = rangeCutoffs[s.historyRange] || 90;
    const cutoffDate = new Date(); cutoffDate.setDate(cutoffDate.getDate() - cutoffDays);
    const histFiltered = s.netWorthHistory.filter(h => s.historyRange === 'all' || new Date(h.date + 'T00:00:00') >= cutoffDate);
    const hasHistory = histFiltered.length >= 2;
    let sparklinePoints = '';
    if (hasHistory) {
      const vals = histFiltered.map(h => h.value);
      const min = Math.min(...vals, 0), max = Math.max(...vals, 1);
      const range = (max - min) || 1;
      const n = histFiltered.length;
      sparklinePoints = histFiltered.map((h, i) => {
        const x = n === 1 ? 150 : (i / (n - 1)) * 300;
        const y = 66 - ((h.value - min) / range) * 62;
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');
    }
    const rangeChips = [['1m', '1M'], ['3m', '3M'], ['1y', '1A'], ['all', 'Todo']].map(([k, label]) => `
      <button type="button" data-action="selectHistoryRange" data-value="${k}" style="padding:5px 10px;border-radius:9999px;font-size:11px;font-weight:700;cursor:pointer;border:none;background:${s.historyRange === k ? 'oklch(20% 0.01 90)' : 'transparent'};color:${s.historyRange === k ? '#fff' : 'var(--ink-soft)'}">${label}</button>`).join('');

    const recentTx = s.transactions.slice(0, 6).map(t => App.buildTxRow(t));

    return `
    <div class="screen-pad">
      <div class="home-header">
        <div class="avatar-badge" style="width:48px;height:48px;background:oklch(58% 0.15 155);font-size:18px">${esc((s.userName[0] || '?').toUpperCase())}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;color:var(--ink-soft)">${greeting}</div>
          <div style="font-size:20px;font-weight:800;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.userName)}</div>
        </div>
        <button type="button" class="icon-btn" style="width:40px;height:40px" data-action="openSettings">${Icons.gear()}</button>
      </div>

      <button type="button" class="card row-flex between" style="margin-top:14px;padding:14px 18px;width:100%;border:none;text-align:left;cursor:${s.editingJornal ? 'default' : 'pointer'}" data-action="${s.editingJornal ? 'none' : 'startEditJornal'}">
        <div>
          <div class="label-caps">Jornal</div>
          ${s.editingJornal
            ? `<input type="text" inputmode="decimal" data-bind="editingJornalValue" data-blur-action="saveEditJornal" value="${esc(s.editingJornalValue)}" placeholder="0" style="border:none;background:transparent;font-size:18px;font-weight:800;color:var(--ink);margin-top:2px;width:140px;padding:0"/>`
            : `<div style="font-size:18px;font-weight:800;color:var(--ink);margin-top:2px">${esc(App.fmt(s.jornal || 0))}</div>`}
          <div style="font-size:11px;color:var(--ink-soft);margin-top:1px">Base para los presupuestos en %</div>
        </div>
        ${!s.editingJornal ? Icons.pencil() : ''}
      </button>

      <div class="net-worth-block">
        <div class="row-flex" style="justify-content:center;gap:6px;color:var(--ink-soft);font-size:14px;font-weight:600">
          <span>Patrimonio neto</span>
          <button type="button" data-action="toggleHide" style="cursor:pointer;display:flex;background:none;border:none;padding:0">${s.hideBalances ? Icons.eyeClosed() : Icons.eyeOpen()}</button>
        </div>
        <div class="net-worth-value">${esc(App.fmt(netWorth))}</div>
        <div class="delta-chip" style="background:${deltaBg};color:${deltaColor}">${esc(deltaLabel)}</div>
      </div>

      <div class="card sparkline-card">
        <div class="row-flex between">
          <div style="font-size:14px;font-weight:700;color:var(--ink)">Evolución del patrimonio</div>
          <div style="display:flex;gap:6px">${rangeChips}</div>
        </div>
        ${hasHistory
          ? `<svg width="100%" height="70" viewBox="0 0 300 70" preserveAspectRatio="none" style="margin-top:12px;display:block"><polyline points="${sparklinePoints}" fill="none" stroke="oklch(58% 0.15 155)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`
          : `<div style="margin-top:12px;padding:16px 0;text-align:center;color:var(--ink-ter);font-size:13px">Aún no hay suficientes datos para el gráfico.</div>`}
      </div>

      <div class="row-flex between" style="margin-top:24px">
        <div class="section-title">Actividad reciente</div>
        <button type="button" class="icon-btn" style="width:36px;height:36px;background:oklch(93% 0.005 90)" data-action="openAllTx">${Icons.search()}</button>
      </div>

      ${recentTx.length ? `<div style="display:flex;flex-direction:column;gap:10px;margin-top:12px;padding-bottom:24px">${recentTx.map(Render.txRow).join('')}</div>`
        : `<div class="empty-note" style="margin-top:12px">Aún no hay movimientos. Pulsa el botón "+" para registrar el primero.</div>`}
    </div>`;
  };

  // -------- stats --------
  Render.stats = (App) => {
    const s = App.state;
    const range = App.periodRange(s.statsPeriod, s.statsRef);
    const incomeList = s.transactions.filter(t => t.type === 'income' && App.inRange(t.date, range.start, range.end));
    const expenseList = s.transactions.filter(t => t.type === 'expense' && App.inRange(t.date, range.start, range.end));
    const prevIncomeList = s.transactions.filter(t => t.type === 'income' && App.inRange(t.date, range.prevStart, range.prevEnd));
    const prevExpenseList = s.transactions.filter(t => t.type === 'expense' && App.inRange(t.date, range.prevStart, range.prevEnd));
    const incomeSum = sumAmt(incomeList), expenseSum = sumAmt(expenseList);
    const prevIncomeSum = sumAmt(prevIncomeList), prevExpenseSum = sumAmt(prevExpenseList);
    const balance = incomeSum - expenseSum, prevBalance = prevIncomeSum - prevExpenseSum;
    const activeList = s.statsTab === 'income' ? incomeList : expenseList;
    const now = new Date();
    const isCurrentPeriod = now >= range.start && now <= range.end;
    const daysTotal = Math.max(1, Math.round((range.end - range.start) / 86400000) + 1);
    const daysElapsed = isCurrentPeriod ? Math.max(1, Math.round((now - range.start) / 86400000) + 1) : daysTotal;
    const avgPerDay = expenseSum / daysElapsed;
    const projection = isCurrentPeriod ? avgPerDay * daysTotal : expenseSum;
    const savingsRate = incomeSum > 0 ? ((incomeSum - expenseSum) / incomeSum * 100) : null;
    const avgTicket = expenseList.length ? expenseSum / expenseList.length : null;
    let daysNoSpend = 0;
    {
      const spendDays = new Set(expenseList.map(t => t.date));
      const endCheck = isCurrentPeriod ? now : range.end;
      for (let d = new Date(range.start); d <= endCheck; d.setDate(d.getDate() + 1)) {
        if (!spendDays.has(d.toISOString().slice(0, 10))) daysNoSpend++;
      }
    }
    const categoryBreakdown = App.categoryBreakdown(activeList);
    const fixedGroup = App.categoryBudgetRows('fixed', expenseList);
    const dailyGroup = App.categoryBudgetRows('daily', expenseList);

    const periodChips = [['day', 'Día'], ['week', 'Semana'], ['month', 'Mes'], ['year', 'Año']].map(([k, label]) => `
      <div data-action="selectStatsPeriod" data-value="${k}" style="flex:1;text-align:center;padding:10px;border-radius:9999px;font-size:13px;font-weight:700;cursor:pointer;background:${s.statsPeriod === k ? 'oklch(20% 0.01 90)' : 'transparent'};color:${s.statsPeriod === k ? '#fff' : 'oklch(40% 0.01 90)'}">${label}</div>`).join('');

    const breakdownHtml = categoryBreakdown.length ? `
      <div class="card" style="margin-top:10px;display:flex;flex-direction:column;gap:14px">
        ${categoryBreakdown.map(c => `
          <div>
            <div class="row-flex between" style="font-size:13px;margin-bottom:6px">
              <div class="row-flex gap8" style="font-weight:600;color:var(--ink)"><span style="width:8px;height:8px;border-radius:9999px;background:${c.color};display:inline-block"></span>${esc(c.name)}</div>
              <div style="font-weight:700;color:var(--ink)">${esc(c.amountText)} · ${c.pct}%</div>
            </div>
            <div class="progress-track"><div class="progress-fill" style="background:${c.color};width:${c.pct}%"></div></div>
          </div>`).join('')}
      </div>` : `<div class="empty-note" style="margin-top:10px">Aún no hay ${s.statsTab === 'income' ? 'ingresos' : 'gastos'} en este periodo.</div>`;

    const budgetRowHtml = (r) => {
      const pct = r.limit > 0 ? Math.min(100, r.spent / r.limit * 100) : (r.hasBudget ? 100 : 0);
      const over = r.hasBudget && r.spent > r.limit;
      const remaining = r.limit - r.spent;
      let footRight = '';
      if (r.hasBudget) footRight = remaining >= 0 ? (esc(App.fmt(remaining)) + ' libre') : (esc(App.fmt(-remaining)) + ' superado');
      const limitLabel = r.budgetType === 'percent' ? (r.budgetValue + '% del jornal') : (r.hasBudget ? ('Límite ' + esc(App.fmt(r.budgetValue))) : 'Sin presupuesto · toca para fijar uno');
      return `
        <button type="button" class="tx-row" style="width:100%;border:none;text-align:left;cursor:pointer;flex-direction:column;align-items:stretch;gap:8px" data-action="openCategoryBudget" data-id="${r.id}">
          <div class="row-flex between">
            <div class="row-flex gap10">
              <span style="width:32px;height:32px;border-radius:9999px;background:${r.color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">${esc((r.name[0] || '?').toUpperCase())}</span>
              <span style="font-size:14px;font-weight:700;color:var(--ink)">${esc(r.name)}</span>
            </div>
            <span style="font-size:15px;font-weight:800;color:var(--ink)">${esc(App.fmt(r.spent))}</span>
          </div>
          ${r.hasBudget ? `<div class="progress-track"><div class="progress-fill" style="background:${over ? 'oklch(58% 0.19 25)' : r.color};width:${pct}%"></div></div>` : ''}
          <div class="row-flex between" style="font-size:11px;color:var(--ink-soft)">
            <span>${limitLabel}</span>
            ${footRight ? `<span style="font-weight:700;color:${over ? 'oklch(58% 0.19 25)' : 'var(--ink-soft)'}">${footRight}</span>` : ''}
          </div>
        </button>`;
    };
    const budgetGroupHtml = (title, subtitle, group) => !group.rows.length ? '' : `
      <div style="margin-top:18px">
        <div class="row-flex between">
          <div>
            <div style="font-size:16px;font-weight:800;color:var(--ink)">${title}</div>
            <div style="font-size:12px;color:var(--ink-soft);margin-top:1px">${subtitle}</div>
          </div>
          <div style="font-size:16px;font-weight:800;color:var(--ink)">${esc(App.fmt(group.total))}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">${group.rows.map(budgetRowHtml).join('')}</div>
      </div>`;
    const categoryBudgetHtml = budgetGroupHtml('Gastos fijos', 'Recurrentes cada mes', fixedGroup) + budgetGroupHtml('Gastos diarios', 'Variables del día a día', dailyGroup);

    const incomeDelta = incomeSum - prevIncomeSum, expenseDelta = expenseSum - prevExpenseSum;
    const incomeDeltaGood = incomeDelta >= 0, expenseDeltaGood = expenseDelta <= 0;
    const deltaChip = (delta, good) => `<div style="display:inline-flex;align-items:center;margin-top:8px;padding:4px 10px;border-radius:9999px;background:${good ? 'oklch(93% 0.05 155)' : 'oklch(94% 0.04 25)'};color:${good ? 'oklch(38% 0.1 155)' : 'oklch(50% 0.15 25)'};font-size:11px;font-weight:700;white-space:nowrap">${esc(App.fmtSigned(delta))}<span style="font-weight:600"> · vs. ant.</span></div>`;

    return `
    <div class="screen-pad">
      <div class="page-title">Estadísticas</div>
      <div class="page-subtitle">Tu resumen financiero</div>

      <div class="card" style="margin-top:20px">
        <div class="grid2" style="gap:14px">
          <div>
            <div class="label-caps" style="color:oklch(45% 0.13 155)">Ingresos</div>
            <div style="font-size:25px;font-weight:800;color:var(--ink);margin-top:4px">${esc(App.fmt(incomeSum))}</div>
            ${deltaChip(incomeDelta, incomeDeltaGood)}
          </div>
          <div>
            <div class="label-caps" style="color:oklch(58% 0.19 25)">Gastos</div>
            <div style="font-size:25px;font-weight:800;color:var(--ink);margin-top:4px">${esc(App.fmt(expenseSum))}</div>
            ${deltaChip(expenseDelta, expenseDeltaGood)}
          </div>
        </div>
        <div style="height:1px;background:var(--divider);margin:16px 0"></div>
        <div class="grid2" style="gap:14px">
          <div><div class="label-caps">Balance</div><div style="font-size:19px;font-weight:800;color:var(--ink);margin-top:4px">${esc(App.fmt(balance))}</div></div>
          <div><div class="label-caps">Transacciones</div><div style="font-size:19px;font-weight:800;color:var(--ink);margin-top:4px">${incomeList.length + expenseList.length}</div></div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;border-radius:9999px;padding:5px;display:flex">${periodChips}</div>

      <div class="card" style="margin-top:12px;border-radius:9999px;padding:14px 8px;display:flex;align-items:center;justify-content:space-between">
        <button type="button" class="icon-btn" style="width:32px;height:32px;background:oklch(94% 0.005 90)" data-action="navPeriodPrev">${Icons.arrowLeft()}</button>
        <div style="font-size:15px;font-weight:800;color:var(--ink);text-align:center;padding:0 6px">${esc(range.label)}</div>
        <button type="button" class="icon-btn" style="width:32px;height:32px;background:oklch(94% 0.005 90)" data-action="navPeriodNext">${Icons.arrowRight()}</button>
      </div>

      ${categoryBudgetHtml}

      <div class="section-title-sm" style="margin-top:24px">Salud del periodo</div>
      <div class="grid2" style="margin-top:10px">
        <div class="stat-tile"><div class="stat-label">Tasa de ahorro</div><div class="stat-value">${savingsRate === null ? '—' : esc(App.fmtPct(savingsRate))}</div></div>
        <div class="stat-tile"><div class="stat-label">Ticket medio</div><div class="stat-value">${avgTicket === null ? '—' : esc(App.fmt(avgTicket))}</div></div>
        <div class="stat-tile"><div class="stat-label">Gasto medio/día</div><div class="stat-value" style="color:oklch(58% 0.19 25)">${esc(App.fmt(avgPerDay))}</div></div>
        <div class="stat-tile"><div class="stat-label">Proyección del periodo</div><div class="stat-value" style="color:oklch(58% 0.19 25)">${esc(App.fmt(projection))}</div></div>
        <div class="stat-tile" style="grid-column:1 / span 2"><div class="stat-label">Días sin gastar</div><div class="stat-value" style="color:oklch(45% 0.13 155)">${daysNoSpend}</div></div>
      </div>

      <div class="section-title-sm" style="margin-top:24px">Comparación con el periodo anterior</div>
      <div class="card" style="margin-top:10px;padding:6px 16px">
        <div class="row-flex between" style="padding:12px 0;border-bottom:1px solid var(--divider)">
          <div style="font-size:14px;color:var(--ink);font-weight:600">Ingresos</div>
          <div class="row-flex gap8"><span style="font-size:15px;font-weight:800;color:var(--ink)">${esc(App.fmt(incomeSum))}</span><span style="font-size:12px;font-weight:700;color:var(--ink-soft);background:oklch(94% 0.005 90);padding:4px 8px;border-radius:9999px">${esc(App.fmt(prevIncomeSum))}</span></div>
        </div>
        <div class="row-flex between" style="padding:12px 0;border-bottom:1px solid var(--divider)">
          <div style="font-size:14px;color:var(--ink);font-weight:600">Gastos</div>
          <div class="row-flex gap8"><span style="font-size:15px;font-weight:800;color:var(--ink)">${esc(App.fmt(expenseSum))}</span><span style="font-size:12px;font-weight:700;color:var(--ink-soft);background:oklch(94% 0.005 90);padding:4px 8px;border-radius:9999px">${esc(App.fmt(prevExpenseSum))}</span></div>
        </div>
        <div class="row-flex between" style="padding:12px 0">
          <div style="font-size:14px;color:var(--ink);font-weight:600">Balance</div>
          <div class="row-flex gap8"><span style="font-size:15px;font-weight:800;color:var(--ink)">${esc(App.fmt(balance))}</span><span style="font-size:12px;font-weight:700;color:var(--ink-soft);background:oklch(94% 0.005 90);padding:4px 8px;border-radius:9999px">${esc(App.fmt(prevBalance))}</span></div>
        </div>
      </div>

      <div class="section-title-sm" style="margin-top:24px">Por categoría</div>
      <div class="card" style="margin-top:10px;border-radius:9999px;padding:5px;display:flex">
        <div class="segmented" style="flex:1">
          <div class="seg ${s.statsTab === 'income' ? 'active' : ''}" data-action="selectStatsTab" data-value="income">Ingresos</div>
          <div class="seg ${s.statsTab === 'expense' ? 'active' : ''}" data-action="selectStatsTab" data-value="expense">Gastos</div>
        </div>
      </div>
      ${breakdownHtml}
      <div style="height:24px"></div>
    </div>`;
  };

  // -------- investments --------
  Render.investments = (App) => {
    const s = App.state;
    const totalInvested = s.investments.reduce((a, f) => a + f.totalInvested, 0);
    const marketValue = s.investments.reduce((a, f) => a + f.units * f.currentPrice, 0);
    const pnl = marketValue - totalInvested;
    const pnlPct = totalInvested > 0 ? (pnl / totalInvested * 100) : 0;
    const pnlColor = pnl >= 0 ? 'oklch(45% 0.13 155)' : 'oklch(58% 0.19 25)';
    const pnlBg = pnl >= 0 ? 'oklch(93% 0.05 155)' : 'oklch(94% 0.04 25)';
    const pnlFg = pnl >= 0 ? 'oklch(38% 0.1 155)' : 'oklch(50% 0.15 25)';

    const fundsList = s.investments.map(f => {
      const val = f.units * f.currentPrice, fp = f.totalInvested > 0 ? ((val - f.totalInvested) / f.totalInvested * 100) : 0;
      const auto = f.priceSource !== 'manual';
      const matched = auto && f.isin && s.sheetPrices[f.isin.trim()] !== undefined;
      return {
        id: f.id, letter: (f.name[0] || 'F').toUpperCase(), name: f.name, valueDisplay: App.fmt(val), pnlDisplay: App.fmtPct(fp),
        pnlColor: fp >= 0 ? 'oklch(45% 0.13 155)' : 'oklch(58% 0.19 25)',
        sourceLabel: auto ? (matched ? 'Auto' : 'Auto · sin cotización') : 'Manual',
      };
    });

    const today = todayISO();
    const fundById = {}; s.investments.forEach(f => fundById[f.id] = f);
    const plansList = s.recurringRules.filter(r => r.type === 'investment').map(r => {
      const f = fundById[r.fundId];
      const fIdx = s.investments.findIndex(x => x.id === r.fundId);
      const isDue = r.nextDate <= today;
      return { id: r.id, fundName: f ? f.name : 'Fondo', color: PALETTE[(fIdx >= 0 ? fIdx : 0) % PALETTE.length], day: new Date(r.nextDate + 'T00:00:00').getDate(), isDue, amountText: App.fmtAbs(r.amount) };
    });
    const dueRules = plansList.filter(p => p.isDue);
    const monthlyPlanTotal = s.recurringRules.filter(r => r.type === 'investment').reduce((a, r) => {
      const mult = r.frequency === 'weekly' ? 4.345 : r.frequency === 'annual' ? (1 / 12) : 1;
      return a + r.amount * mult;
    }, 0);

    const fundsRows = fundsList.length ? fundsList.map(f => `
      <div class="invest-sub-row" style="cursor:pointer" data-action="openFund" data-id="${f.id}">
        <span class="avatar-badge" style="width:28px;height:28px;background:oklch(66% 0.14 235);font-size:13px">${esc(f.letter)}</span>
        <span style="flex:1;min-width:0">
          <span style="display:block;font-size:14px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.name)}</span>
          <span style="display:block;font-size:11px;color:${f.pnlColor};font-weight:600">${esc(f.pnlDisplay)} <span style="color:var(--ink-soft);font-weight:600">· ${esc(f.sourceLabel)}</span></span>
        </span>
        <span style="font-size:14px;font-weight:800;color:var(--ink)">${esc(f.valueDisplay)}</span>
      </div>`).join('') : `<div style="padding:16px;text-align:center;color:var(--ink-soft);font-size:13px">Aún no tienes fondos. Pulsa "+" para registrar tu primer aporte.</div>`;

    const pendingHtml = dueRules.length ? `
      <div style="margin-top:24px">
        <div class="section-title-sm">Operaciones pendientes de confirmar</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
          ${dueRules.map(pl => `
            <div class="card row-flex gap10" style="padding:14px">
              <span style="width:9px;height:9px;border-radius:3px;background:${pl.color};flex-shrink:0"></span>
              <span style="flex:1;min-width:0">
                <span style="display:block;font-size:14px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(pl.fundName)}</span>
                <span style="display:block;font-size:11px;color:var(--ink-soft);margin-top:1px">Vencido · ${esc(pl.amountText)}</span>
              </span>
              <button type="button" data-action="skipRecurring" data-id="${pl.id}" style="width:30px;height:30px;border-radius:9999px;background:oklch(94% 0.04 25);display:flex;align-items:center;justify-content:center;border:none;flex-shrink:0">${Icons.closeThin('oklch(58% 0.19 25)')}</button>
              <button type="button" data-action="openConfirmDueRule" data-id="${pl.id}" style="padding:9px 16px;border-radius:9999px;background:oklch(58% 0.15 155);color:#fff;font-size:13px;font-weight:700;border:none;flex-shrink:0;cursor:pointer">Confirmar</button>
            </div>`).join('')}
        </div>
      </div>` : '';

    const plansHtml = plansList.length ? `
      <div style="margin-top:24px">
        <div style="font-size:16px;font-weight:800;color:var(--ink)">Plan mensual de aportaciones</div>
        <div class="card" style="margin-top:10px">
          <div style="font-size:11px;font-weight:700;color:oklch(55% 0.01 90);text-transform:uppercase;letter-spacing:0.5px">Plan mensual</div>
          <div style="display:flex;align-items:baseline;gap:6px;margin-top:6px">
            <div style="font-size:34px;font-weight:800;color:var(--ink)">${esc(App.fmt(monthlyPlanTotal))}</div>
            <div style="font-size:14px;color:var(--ink-soft);font-weight:600">/mes</div>
          </div>
          <div style="height:1px;background:oklch(93% 0.005 90);margin:14px 0"></div>
          <div style="display:flex;flex-direction:column">
            ${plansList.map(pl => `
              <div class="row-flex gap10" style="padding:11px 0;border-bottom:1px solid oklch(95% 0.003 90);cursor:pointer" data-action="openPlanEdit" data-id="${pl.id}">
                <span style="width:9px;height:9px;border-radius:3px;background:${pl.color};flex-shrink:0"></span>
                <span style="flex:1;min-width:0;font-size:14px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(pl.fundName)}</span>
                <span style="font-size:12px;color:var(--ink-soft);flex-shrink:0">día ${pl.day}</span>
                <span style="font-size:14px;font-weight:800;color:var(--ink);width:70px;text-align:right;flex-shrink:0">${esc(pl.amountText)}</span>
                <button type="button" data-action="openPlanEdit" data-id="${pl.id}" style="width:26px;height:26px;border-radius:9999px;background:oklch(96% 0.003 90);display:flex;align-items:center;justify-content:center;border:none;flex-shrink:0">${Icons.pencil()}</button>
              </div>`).join('')}
          </div>
        </div>
      </div>` : `<div class="empty-note" style="margin-top:10px;margin-bottom:24px">Activa "Repetir" al añadir un aporte para crear un plan periódico.</div>`;

    // -------- monthly performance heatmap (Modified Dietz) --------
    const MONTH_ABBR = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const yearMonths = MONTH_ABBR.map((label, i) => {
      const key = s.investYear + '-' + String(i + 1).padStart(2, '0');
      return { label, ...App.monthlyReturn(key) };
    });
    const monthCellsHtml = yearMonths.map(mo => {
      const has = mo.hasData && mo.returnPct !== null;
      const pos = has && mo.returnPct >= 0;
      const bg = !has ? 'oklch(96% 0.003 90)' : (pos ? 'oklch(93% 0.05 155)' : 'oklch(94% 0.04 25)');
      const fg = !has ? 'var(--ink-soft)' : (pos ? 'oklch(38% 0.1 155)' : 'oklch(50% 0.15 25)');
      return `
        <div style="background:${bg};border-radius:14px;padding:11px 6px;text-align:center;position:relative">
          ${mo.real ? `<span style="position:absolute;top:7px;right:8px;width:5px;height:5px;border-radius:9999px;background:${fg};opacity:0.7"></span>` : ''}
          <div style="font-size:10px;font-weight:700;color:${fg};opacity:0.75">${mo.label}</div>
          <div style="font-size:13px;font-weight:800;color:${fg};margin-top:4px">${has ? esc(App.fmtPct(mo.returnPct)) : '·'}</div>
        </div>`;
    }).join('');
    const yearReturn = App.annualReturn(s.investYear);
    const heatmapHtml = s.investments.length ? `
      <div style="margin-top:24px">
        <div class="row-flex between">
          <div class="section-title-sm">Rendimiento mensual</div>
          <div class="row-flex gap8">
            <button type="button" class="icon-btn" style="width:28px;height:28px;background:oklch(94% 0.005 90)" data-action="navInvestYearPrev">${Icons.arrowLeft()}</button>
            <div style="font-size:14px;font-weight:800;color:var(--ink);padding:0 2px">${s.investYear}</div>
            <button type="button" class="icon-btn" style="width:28px;height:28px;background:oklch(94% 0.005 90)" data-action="navInvestYearNext">${Icons.arrowRight()}</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px">${monthCellsHtml}</div>
        <div class="card row-flex between" style="margin-top:10px;padding:14px 16px">
          <span style="font-size:13px;font-weight:700;color:var(--ink)">Rentabilidad ${s.investYear}</span>
          <span style="font-size:15px;font-weight:800;color:${yearReturn === null ? 'var(--ink-soft)' : (yearReturn >= 0 ? pnlColor : 'oklch(58% 0.19 25)')}">${yearReturn === null ? '—' : esc(App.fmtPct(yearReturn))}</span>
        </div>
        <div style="font-size:11px;color:var(--ink-soft);margin-top:8px;line-height:1.5">Rentabilidad mensual ponderada por flujos (Modified Dietz). El punto · marca meses con cierre real (foto del valor a fin de mes, guardada automáticamente); el resto se estima con el precio de tus compras.</div>
      </div>` : '';

    // -------- annual return vs. invested --------
    let minYear = new Date().getFullYear();
    s.investments.forEach(f => (f.ops || []).forEach(op => { const y = parseInt(op.date.slice(0, 4), 10); if (y < minYear) minYear = y; }));
    const years = []; for (let y = minYear; y <= new Date().getFullYear(); y++) years.push(y);
    const annualRows = years.map(y => ({ year: y, ret: App.annualReturn(y), invested: App.investedAsOfDate((y + 1) + '-01-01') }));
    const maxAbsRet = Math.max(1, ...annualRows.map(r => Math.abs(r.ret || 0)));
    const annualChartHtml = (s.investments.length && annualRows.length) ? `
      <div style="margin-top:24px;margin-bottom:24px">
        <div class="section-title-sm">Rendimiento anual vs. invertido</div>
        <div class="card" style="margin-top:10px;padding:16px">
          ${annualRows.map(r => {
            const barColor = (r.ret || 0) >= 0 ? 'oklch(66% 0.15 155)' : 'oklch(58% 0.19 25)';
            const pct = r.ret === null ? 0 : Math.max(4, Math.min(100, Math.abs(r.ret) / maxAbsRet * 100));
            return `
            <div style="margin-top:${r.year === years[0] ? '0' : '14px'}">
              <div class="row-flex between" style="font-size:12px">
                <span style="font-weight:800;color:var(--ink)">${r.year}</span>
                <span style="color:var(--ink-soft)">Invertido: <span style="font-weight:700;color:var(--ink)">${esc(App.fmt(r.invested))}</span></span>
                <span style="font-weight:800;color:${barColor}">${r.ret === null ? '—' : esc(App.fmtPct(r.ret))}</span>
              </div>
              <div class="progress-track" style="margin-top:6px"><div class="progress-fill" style="background:${barColor};width:${pct}%"></div></div>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    const priceStatusLabel = s.sheetPricesStatus === 'loading' ? 'Actualizando precios…'
      : s.sheetPricesStatus === 'error' ? 'No se pudieron actualizar los precios'
      : s.sheetPricesUpdatedAt ? ('Precios actualizados · ' + new Date(s.sheetPricesUpdatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
      : 'Precios sin actualizar';

    return `
    <div class="screen-pad">
      <div style="display:grid;grid-template-columns:44px 1fr 44px;align-items:center">
        <div></div>
        <div class="page-title">Inversiones</div>
        <button type="button" class="icon-btn solid" style="width:44px;height:44px" data-action="openAddInvestment">${Icons.plus('#fff')}</button>
      </div>

      <div class="card" style="margin-top:20px;border-radius:24px;padding:22px">
        <div style="font-size:13px;color:var(--ink-soft);font-weight:600">Valor de mercado</div>
        <div style="font-size:32px;font-weight:800;color:var(--ink);margin-top:4px">${esc(App.fmt(marketValue))}</div>
        <div style="display:inline-flex;margin-top:10px;padding:7px 14px;border-radius:9999px;background:${pnlBg};color:${pnlFg};font-size:12px;font-weight:700">${esc(App.fmtSigned(pnl))} (${esc(App.fmtPct(pnlPct))})</div>
        <div style="height:1px;background:var(--divider);margin:16px 0"></div>
        <div class="grid2" style="gap:14px">
          <div><div class="label-caps">P&amp;L</div><div style="font-size:19px;font-weight:800;color:${pnlColor};margin-top:4px">${esc(App.fmtSigned(pnl))}</div></div>
          <div><div class="label-caps">Invertido</div><div style="font-size:19px;font-weight:800;color:var(--ink);margin-top:4px">${esc(App.fmt(totalInvested))}</div></div>
        </div>
      </div>

      <button type="button" class="row-flex between" style="margin-top:10px;padding:8px 4px;width:100%;border:none;background:none;cursor:pointer" data-action="refreshSheetPrices">
        <span style="font-size:11px;color:var(--ink-soft)">${esc(priceStatusLabel)}</span>
        <span style="font-size:11px;font-weight:700;color:oklch(58% 0.15 155)">Actualizar ↻</span>
      </button>

      ${pendingHtml}

      <div class="section-title" style="margin-top:${dueRules.length ? '24' : '20'}px">Tus fondos</div>
      <div class="card" style="margin-top:12px;padding:12px;display:flex;flex-direction:column;gap:6px">
        ${fundsRows}
      </div>

      ${plansHtml}
      ${heatmapHtml}
      ${annualChartHtml}
    </div>`;
  };

  // -------- accounts --------
  Render.accounts = (App) => {
    const s = App.state;
    const accounts = App.sortedAccounts();
    const totalBalance = accounts.reduce((a, acc) => a + acc.balance, 0);
    const accountCards = [
      { key: 'all', name: 'Saldo total', balanceDisplay: App.fmt(totalBalance), subtitle: 'En ' + accounts.length + ' cuenta' + (accounts.length === 1 ? '' : 's'), bg: '#fff', textColor: 'var(--ink)' },
      ...accounts.map(a => ({ key: a.id, name: a.name, balanceDisplay: App.fmt(a.balance), subtitle: ACC_TYPE_LABELS[a.type] || 'Cuenta', bg: a.color, textColor: '#fff' }))
    ];
    const activeIdx = Math.min(s.activeAccountIndex, accountCards.length - 1);
    const isAllSelected = activeIdx === 0;
    const selectedAccount = isAllSelected ? null : accounts[activeIdx - 1];

    const cardsHtml = accountCards.map(c => `
      <div class="account-card" style="background:${c.bg};color:${c.textColor}">
        <div style="font-size:15px;font-weight:700;opacity:0.85">${esc(c.name)}</div>
        <div style="font-size:30px;font-weight:800;margin-top:14px">${esc(c.balanceDisplay)}</div>
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid ${c.bg === '#fff' ? 'var(--divider)' : 'rgba(255,255,255,0.35)'};font-size:12px;font-weight:600;opacity:0.75">${esc(c.subtitle)}</div>
      </div>`).join('');

    const dotsHtml = accountCards.map((c, i) => `<div class="account-dot" style="width:${i === activeIdx ? '18px' : '6px'};background:${i === activeIdx ? 'oklch(58% 0.15 155)' : 'oklch(88% 0.006 90)'}"></div>`).join('');

    const quickActions = isAllSelected ? [
      { label: 'Nueva cuenta', sub: 'Añade una cuenta', bg: 'oklch(93% 0.05 155)', action: 'openAddAccount' },
      { label: 'Añadir dinero', sub: 'Ingresa fondos', bg: 'oklch(93% 0.05 155)', action: 'openAddMoney', id: accounts[0] ? accounts[0].id : '' },
      { label: 'Estadísticas', sub: 'Ver tus datos', bg: 'oklch(93% 0.04 235)', action: 'setScreen', value: 'stats' }
    ] : [
      { label: 'Añadir', sub: 'Nuevo movimiento', bg: 'oklch(93% 0.05 155)', action: 'openAddMoney', id: selectedAccount.id },
      { label: 'Transferir', sub: 'Entre cuentas', bg: 'oklch(93% 0.05 155)', action: 'openTransfer' },
      { label: 'Editar', sub: 'Nombre y color', bg: 'oklch(93% 0.05 155)', action: 'openEditAccount', id: selectedAccount.id }
    ];
    const quickHtml = quickActions.map(q => `
      <button type="button" class="quick-action" data-action="${q.action}" ${q.id ? `data-id="${q.id}"` : ''} ${q.value ? `data-value="${q.value}"` : ''}>
        <div class="quick-action-icon" style="background:${q.bg}">${Icons.plus('oklch(38% 0.1 155)')}</div>
        <div style="font-size:13px;font-weight:700;color:var(--ink);margin-top:8px">${q.label}</div>
        <div style="font-size:11px;color:var(--ink-soft);margin-top:2px">${q.sub}</div>
      </button>`).join('');

    const movementsTitle = isAllSelected ? 'Todos los movimientos' : selectedAccount.name;
    const accMoveList = s.transactions.filter(t => isAllSelected ? true : (t.accountId === selectedAccount.id || t.toAccountId === selectedAccount.id)).slice(0, 12).map(t => App.buildTxRow(t));

    return `
    <div>
      <div class="screen-pad row-flex between">
        <div style="font-size:26px;font-weight:800;color:var(--ink);letter-spacing:-0.5px">Cuentas</div>
        <div class="row-flex gap10">
          <button type="button" class="icon-btn" style="width:40px;height:40px" data-action="openReorder">${Icons.reorder()}</button>
          <button type="button" class="icon-btn solid" style="width:40px;height:40px" data-action="openAddAccount">${Icons.plus('#fff')}</button>
        </div>
      </div>

      <div class="account-scroller" data-action="none">${cardsHtml}</div>
      <div class="account-dots">${dotsHtml}</div>

      <div class="hscroll gap10 screen-pad" style="margin-top:20px">${quickHtml}</div>

      <div class="screen-pad row-flex between" style="margin-top:24px">
        <div class="section-title-sm">${esc(movementsTitle)}</div>
      </div>
      ${accMoveList.length
        ? `<div class="screen-pad" style="display:flex;flex-direction:column;gap:10px;margin-top:10px;padding-bottom:28px">${accMoveList.map(Render.txRow).join('')}</div>`
        : `<div class="screen-pad" style="margin-top:10px;padding-bottom:28px"><div class="empty-note">Esta cuenta aún no tiene movimientos.</div></div>`}
    </div>`;
  };

  // -------- bottom tab bar --------
  Render.tabBar = (s) => `
    <div class="tab-bar">
      <button type="button" class="tab-item ${s.screen === 'home' && !s.modal ? 'active' : ''}" data-action="setScreen" data-value="home">${Icons.tabHome()}<span class="tab-label">Inicio</span></button>
      <button type="button" class="tab-item ${s.screen === 'stats' && !s.modal ? 'active' : ''}" data-action="setScreen" data-value="stats">${Icons.tabStats()}<span class="tab-label">Stats</span></button>
      <div style="width:56px;visibility:hidden"></div>
      <button type="button" class="tab-item ${s.screen === 'investments' && !s.modal ? 'active' : ''}" data-action="setScreen" data-value="investments">${Icons.tabInvest()}<span class="tab-label">Invertir</span></button>
      <button type="button" class="tab-item ${s.screen === 'accounts' && !s.modal ? 'active' : ''}" data-action="setScreen" data-value="accounts">${Icons.tabAccounts()}<span class="tab-label">Cuentas</span></button>
      <button type="button" class="fab" data-action="openAddTxDefault">${Icons.plusFat()}</button>
    </div>`;

  // ============================================================
  // A couple of thin wrapper actions needed by the modal templates
  // ============================================================
  Object.assign(App, {
    openPlanEdit(id) { const rule = this.state.recurringRules.find(r => r.id === id); if (rule) this.togglePlanEdit(rule); },
    savePlanEditPage() { this.savePlanEdit(this.state.editingPlanId); },
    filteredTxList() {
      const s = this.state;
      let list = s.transactions;
      if (s.txFilter !== 'all') list = list.filter(t => t.type === s.txFilter);
      if (s.txSearch.trim()) {
        const q = s.txSearch.trim().toLowerCase();
        list = list.filter(t => {
          const cat = s.categories.find(c => c.id === t.categoryId);
          return (t.note || '').toLowerCase().includes(q) || (cat && cat.name.toLowerCase().includes(q));
        });
      }
      return list.map(t => this.buildTxRow(t));
    },
  });

  // -------- freq chips (shared by add-tx repeat panel & plan edit) --------
  Render.freqChips = (current, action, style) => {
    const defs = [['weekly', 'Semanal'], ['monthly', 'Mensual'], ['annual', 'Anual']];
    const shortDefs = [['weekly', 'Sem'], ['monthly', 'Mes'], ['annual', 'Año']];
    const list = style === 'short' ? shortDefs : defs;
    return list.map(([k, label]) => `
      <div data-action="${action}" data-value="${k}" style="flex:1;text-align:center;padding:${style === 'short' ? '11px 4px' : '10px'};border-radius:${style === 'short' ? '9px' : '9999px'};font-size:${style === 'short' ? '13px' : '12px'};font-weight:700;cursor:pointer;background:${current === k ? 'oklch(58% 0.15 155)' : (style === 'short' ? 'transparent' : 'oklch(93% 0.005 90)')};color:${current === k ? '#fff' : 'oklch(50% 0.01 90)'}">${label}</div>`).join('');
  };

  Render.modalHeader = (title) => `
    <div class="modal-header">
      <div class="modal-title">${esc(title)}</div>
      <button type="button" class="icon-btn" style="width:36px;height:36px" data-action="closeModal">${Icons.close()}</button>
    </div>`;

  Render.modalHeaderBack = (title) => `
    <div class="modal-header" style="justify-content:flex-start">
      <button type="button" data-action="closeModal" style="cursor:pointer;display:flex;background:none;border:none;padding:0">${Icons.back()}</button>
      <div style="font-size:18px;font-weight:800;color:var(--ink);flex:1">${esc(title)}</div>
    </div>`;

  // -------- add transaction --------
  Render.modalAddTx = (App) => {
    const s = App.state;
    const isTxInvestment = s.txType === 'investment';
    const accounts = App.sortedAccounts();
    const typeTabs = s.txLockInvestment ? `<div style="font-size:22px;font-weight:800;color:var(--ink);text-align:center">Nueva inversión</div>` : `
      <div class="segmented" style="padding:5px">
        <div class="seg" style="padding:15px;font-size:16px;background:${s.txType === 'expense' ? 'oklch(58% 0.15 155)' : 'transparent'};color:${s.txType === 'expense' ? '#fff' : 'var(--ink-soft)'}" data-action="selectTxType" data-value="expense">Gasto</div>
        <div class="seg" style="padding:15px;font-size:16px;background:${s.txType === 'income' ? 'oklch(58% 0.15 155)' : 'transparent'};color:${s.txType === 'income' ? '#fff' : 'var(--ink-soft)'}" data-action="selectTxType" data-value="income">Ingreso</div>
        <div class="seg" style="padding:15px;font-size:16px;background:${s.txType === 'investment' ? 'oklch(58% 0.15 155)' : 'transparent'};color:${s.txType === 'investment' ? '#fff' : 'var(--ink-soft)'}" data-action="selectTxType" data-value="investment">Inversión</div>
      </div>`;

    const amountBlock = isTxInvestment ? `
      <div style="text-align:center;margin-top:8px">
        <div class="label-caps">Total invertido</div>
        <div id="txInvestTotal" style="font-size:44px;font-weight:800;color:var(--ink);margin-top:8px">${esc(App.fmt(parseNum(s.txFundPrice) * parseNum(s.txFundUnits)))}</div>
      </div>` : `
      <div style="text-align:center;margin-top:8px">
        <div class="label-caps">Cantidad</div>
        <div style="display:flex;align-items:baseline;justify-content:center;gap:6px;margin-top:8px">
          <input type="text" inputmode="decimal" data-bind="txAmount" value="${esc(s.txAmount)}" placeholder="0,00" style="border:none;background:transparent;font-size:44px;font-weight:800;color:var(--ink);width:auto;max-width:180px;text-align:center"/>
          <span style="font-size:26px;font-weight:700;color:var(--ink-soft)">€</span>
        </div>
      </div>`;

    const fundOptionsHtml = s.investments.map(f => `
      <div class="pill-btn ${s.txFundMode === 'existing' && s.txFundId === f.id ? 'active' : ''}" data-action="selectFund" data-id="${f.id}">${esc(f.name)}</div>`).join('')
      + `<div data-action="selectNewFund" style="padding:10px 14px;border-radius:9999px;font-size:13px;font-weight:600;cursor:pointer;border:1.5px dashed oklch(70% 0.01 90);color:var(--ink-soft)">+ Nuevo fondo</div>`;

    const categoryOptions = s.categories.filter(c => c.type === (s.txType === 'income' ? 'income' : 'expense')).map(c => `
      <button type="button" class="category-chip" data-action="selectTxCategory" data-id="${c.id}">
        <span class="cat-icon" style="background:${c.color};box-shadow:${ringFor(c.color, s.txCategoryId === c.id)}">${Icons.category(c.name)}</span>
        <span class="cat-name">${esc(c.name)}</span>
      </button>`).join('');

    return `
    <div class="modal-overlay">
      <div style="padding:calc(16px + var(--safe-top)) 20px 12px;display:flex;flex-direction:column;gap:12px;flex-shrink:0">
        <div style="display:flex;justify-content:flex-end">
          <button type="button" class="icon-btn" style="width:36px;height:36px" data-action="closeModal">${Icons.close()}</button>
        </div>
        ${typeTabs}
      </div>
      <div class="modal-body">
        ${amountBlock}

        <div style="display:flex;gap:10px;margin-top:20px">
          <div class="card" style="flex:1;padding:12px;box-shadow:var(--card-shadow)">
            <div class="label-caps" style="letter-spacing:0.4px">Fecha</div>
            <input type="date" data-bind="txDate" value="${esc(s.txDate)}" style="border:none;background:transparent;font-size:14px;font-weight:700;color:var(--ink);margin-top:4px;width:100%"/>
          </div>
          <div class="card row-flex between" style="flex:1;padding:12px;cursor:pointer" data-action="toggleTxRepeat">
            <div>
              <div class="label-caps">Repetir</div>
              <div style="font-size:14px;font-weight:700;color:var(--ink);margin-top:4px">${s.txRepeat ? 'Sí' : 'No'}</div>
            </div>
            ${Render.switchEl(s.txRepeat, 'toggleTxRepeat')}
          </div>
        </div>

        ${s.txRepeat ? `<div style="display:flex;gap:8px;margin-top:10px">${Render.freqChips(s.txFreq, 'selectTxFreq')}</div>` : ''}

        ${isTxInvestment ? `
          <div class="label-caps" style="margin-top:20px">Fondo</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">${fundOptionsHtml}</div>
          ${s.txFundMode === 'new' ? `
            <input type="text" class="field-input" style="margin-top:10px" data-bind="txFundName" value="${esc(s.txFundName)}" placeholder="Nombre del fondo"/>
            <input type="text" class="field-input" style="margin-top:8px" data-bind="txFundIsin" value="${esc(s.txFundIsin)}" placeholder="ISIN (opcional)"/>
          ` : ''}
          <div style="display:flex;gap:10px;margin-top:14px">
            <div style="flex:1">
              <div class="label-caps" style="letter-spacing:0.3px">Precio/participación</div>
              <input type="text" inputmode="decimal" class="field-input" style="margin-top:6px;font-weight:700" data-bind="txFundPrice" value="${esc(s.txFundPrice)}" placeholder="0,00"/>
            </div>
            <div style="flex:1">
              <div class="label-caps" style="letter-spacing:0.3px">Unidades</div>
              <input type="text" inputmode="decimal" class="field-input" style="margin-top:6px;font-weight:700" data-bind="txFundUnits" value="${esc(s.txFundUnits)}" placeholder="0,000"/>
            </div>
          </div>
          <div class="label-caps" style="margin-top:14px">Cuenta origen</div>
        ` : `<div class="label-caps" style="margin-top:20px">Cuenta</div>`}

        <div class="hscroll gap10" style="margin-top:8px;padding-bottom:4px">${accounts.map(a => Render.accChip(a, s.txAccountId, 'selectTxAccount', App)).join('')}</div>

        ${!isTxInvestment ? `
          <div class="row-flex between" style="margin-top:20px">
            <div class="label-caps">Categoría</div>
            <button type="button" class="link-inline" data-action="toggleNewCategory">+ Nueva</button>
          </div>
          <div class="hscroll gap14" style="margin-top:8px;padding-bottom:4px">${categoryOptions}</div>
          ${s.showNewCategory ? `
            <div class="card" style="margin-top:12px;padding:14px">
              <input type="text" class="field-input" style="border:1px solid var(--divider)" data-bind="newCatName" value="${esc(s.newCatName)}" placeholder="Nombre de la categoría"/>
              <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">${Render.colorSwatches(s.newCatColor, 'selectNewCatColor').replace(/color-swatch/g, 'color-swatch sm')}</div>
              <button type="button" class="btn-primary" style="margin-top:10px;padding:12px;font-size:13px" data-action="addCategoryInline">Añadir categoría</button>
            </div>` : ''}
        ` : ''}

        <div class="label-caps" style="margin-top:20px">Notas (opcional)</div>
        <textarea class="field-input" style="margin-top:6px;height:60px" data-bind="txNote" placeholder="Añade una descripción...">${esc(s.txNote)}</textarea>

        <button type="button" class="btn-primary" style="margin-top:24px" data-action="saveTx">${s.txType === 'expense' ? 'Guardar gasto' : (s.txType === 'income' ? 'Guardar ingreso' : 'Guardar aporte')}</button>
      </div>
    </div>`;
  };

  // -------- settings --------
  Render.modalSettings = (App) => {
    const s = App.state;
    const categoriesForTab = s.categories.filter(c => c.type === s.catTab);
    const allRules = s.recurringRules.map(r => {
      let title;
      if (r.type === 'investment') { const f = s.investments.find(x => x.id === r.fundId); title = r.note || (f ? ('Plan ' + f.name) : 'Plan de inversión'); }
      else { const cat = s.categories.find(c => c.id === r.categoryId); title = r.note || (cat ? cat.name : (r.type === 'income' ? 'Ingreso' : 'Gasto')); }
      return { id: r.id, type: r.type, title, amountText: App.fmtAbs(r.amount), freqLabel: FREQ_LABELS[r.frequency] };
    });

    return `
    <div class="modal-overlay">
      ${Render.modalHeader('Ajustes')}
      <div class="modal-body">
        <div class="label-caps" style="margin-top:8px">Perfil</div>
        <input type="text" class="field-input" style="margin-top:8px;font-weight:600" data-bind="userName" value="${esc(s.userName)}"/>

        <div class="card row-flex between" style="margin-top:20px;padding:16px;cursor:pointer" data-action="toggleHide">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--ink)">Ocultar saldos</div>
            <div style="font-size:12px;color:var(--ink-soft);margin-top:2px">Muestra los importes como puntos</div>
          </div>
          ${Render.switchEl(s.hideBalances, 'toggleHide')}
        </div>

        <button type="button" class="card row-flex between" style="margin-top:10px;padding:16px;cursor:pointer;width:100%;border:none;text-align:left" data-action="toggleCatInline">
          <div style="font-size:14px;font-weight:700;color:var(--ink)">Gestionar categorías</div>
          ${s.catInlineOpen ? Icons.chevronUp('oklch(60% 0.01 90)') : Icons.chevronDown('oklch(60% 0.01 90)')}
        </button>

        ${s.catInlineOpen ? `
        <div class="card" style="margin-top:10px;padding:14px">
          <div class="segmented">
            <div class="seg ${s.catTab === 'expense' ? 'active' : ''}" style="padding:9px;font-size:13px" data-action="selectCatTab" data-value="expense">Gastos</div>
            <div class="seg ${s.catTab === 'income' ? 'active' : ''}" style="padding:9px;font-size:13px" data-action="selectCatTab" data-value="income">Ingresos</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
            ${categoriesForTab.map(c => `
              <div class="row-flex gap12" style="background:oklch(97% 0.003 90);border-radius:14px;padding:12px 14px">
                <span style="width:32px;height:32px;border-radius:9999px;background:${c.color};flex-shrink:0"></span>
                <span style="flex:1;font-size:14px;font-weight:600;color:var(--ink)">${esc(c.name)}</span>
                ${c.type === 'expense' ? `<button type="button" class="icon-btn" style="width:26px;height:26px;background:oklch(94% 0.005 90)" data-action="openCategoryBudget" data-id="${c.id}">${Icons.pencil()}</button>` : ''}
                <button type="button" class="icon-btn" style="width:26px;height:26px;background:oklch(94% 0.005 90)" data-action="deleteCategory" data-id="${c.id}">${Icons.closeThin('oklch(50% 0.01 90)')}</button>
              </div>`).join('')}
          </div>
          <div style="margin-top:14px;background:oklch(97% 0.003 90);border-radius:14px;padding:14px">
            <input type="text" class="field-input" style="border:1px solid var(--divider)" data-bind="newCatName" value="${esc(s.newCatName)}" placeholder="Nueva categoría"/>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">${Render.colorSwatches(s.newCatColor, 'selectNewCatColor').replace(/color-swatch/g, 'color-swatch sm')}</div>
            <button type="button" class="btn-primary" style="margin-top:10px;padding:12px;font-size:13px" data-action="addCategoryFromModal">Añadir</button>
          </div>
        </div>` : ''}

        <button type="button" class="card row-flex between" style="margin-top:22px;padding:16px;cursor:pointer;width:100%;border:none;text-align:left" data-action="toggleRecurringInline">
          <div style="font-size:14px;font-weight:700;color:var(--ink)">Transacciones recurrentes${allRules.length ? ' (' + allRules.length + ')' : ''}</div>
          ${s.recurringInlineOpen ? Icons.chevronUp('oklch(60% 0.01 90)') : Icons.chevronDown('oklch(60% 0.01 90)')}
        </button>

        ${s.recurringInlineOpen ? `
        <div class="card" style="margin-top:10px;padding:14px">
          <div class="label-caps">Gastos fijos predefinidos</div>
          <div class="hscroll gap10" style="margin-top:8px;padding-bottom:4px">
            ${Object.entries(RECURRING_PRESETS).map(([key, p]) => `<div class="pill-btn" style="flex-shrink:0" data-action="openRecurringNew" data-id="${key}">${esc(p.label)}</div>`).join('')}
          </div>

          ${allRules.length ? `
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            ${allRules.map(r => `
              <button type="button" class="card row-flex between" style="padding:12px 14px;width:100%;border:none;text-align:left;cursor:pointer" data-action="${r.type === 'investment' ? 'openPlanEdit' : 'openRecurringEdit'}" data-id="${r.id}">
                <div>
                  <div style="font-size:13px;font-weight:700;color:var(--ink)">${esc(r.title)}</div>
                  <div style="font-size:11px;color:var(--ink-soft);margin-top:2px">${esc(r.amountText)} · ${r.freqLabel}</div>
                </div>
                ${Icons.pencil()}
              </button>`).join('')}
          </div>` : `<div class="empty-note" style="margin-top:14px">Aún no tienes transacciones recurrentes.</div>`}

          <button type="button" class="btn-secondary" style="margin-top:14px;padding:12px;font-size:13px" data-action="openRecurringNew" data-id="blank">+ Nuevo recurrente</button>
        </div>` : ''}

        <div class="label-caps" style="margin-top:22px">Datos</div>
        <button type="button" style="margin-top:8px;width:100%;padding:14px;border-radius:14px;border:none;background:oklch(93% 0.05 155);color:oklch(38% 0.1 155);font-size:14px;font-weight:700;cursor:pointer;text-align:left" data-action="loadDemoData">Cargar datos de ejemplo</button>
        <button type="button" style="margin-top:8px;width:100%;padding:14px;border-radius:14px;border:none;background:#fff;color:var(--ink);font-size:14px;font-weight:700;cursor:pointer;text-align:left;box-shadow:var(--card-shadow)" data-action="exportCSV">Exportar datos (CSV)</button>
        <label style="display:block;margin-top:8px;width:100%;padding:14px;border-radius:14px;background:#fff;color:var(--ink);font-size:14px;font-weight:700;cursor:pointer;box-shadow:var(--card-shadow);box-sizing:border-box">Importar datos (CSV)
          <input type="file" accept=".csv" data-action="handleImportFile" style="display:none"/>
        </label>
        <button type="button" style="margin-top:16px;width:100%;padding:14px;border-radius:14px;border:none;background:#fff;color:var(--ink);font-size:14px;font-weight:700;cursor:pointer;text-align:left;box-shadow:var(--card-shadow)" data-action="exportJSON">Exportar copia de seguridad completa (JSON)</button>
        <label style="display:block;margin-top:8px;width:100%;padding:14px;border-radius:14px;background:#fff;color:var(--ink);font-size:14px;font-weight:700;cursor:pointer;box-shadow:var(--card-shadow);box-sizing:border-box">Importar copia de seguridad (JSON)
          <input type="file" accept=".json" data-action="handleImportJSON" style="display:none"/>
        </label>
        <button type="button" style="margin-top:16px;width:100%;padding:14px;border-radius:14px;border:none;background:oklch(94% 0.04 25);color:var(--red);font-size:14px;font-weight:700;cursor:pointer" data-action="resetAll">Borrar todos los datos</button>
      </div>
    </div>`;
  };

  // -------- add / edit account --------
  Render.modalAddAccount = (App) => {
    const s = App.state;
    const f = s.accForm;
    const accTypeDefs = [['banco', 'Banco'], ['efectivo', 'Efectivo'], ['ahorro', 'Ahorro'], ['tarjeta', 'Tarjeta'], ['inversion', 'Inversión']];
    const typeChips = accTypeDefs.map(([k, label]) => `<button type="button" class="pill-btn ${f.type === k ? 'active' : ''}" data-action="selectAccType" data-value="${k}">${label}</button>`).join('');
    return `
    <div class="modal-overlay">
      ${Render.modalHeader('Nueva cuenta')}
      <div class="modal-body">
        <div class="label-caps">Nombre</div>
        <input type="text" class="field-input" style="margin-top:8px" data-bind="accForm.name" value="${esc(f.name)}" placeholder="Ej. BBVA, Efectivo, Ahorros..."/>
        <div class="label-caps" style="margin-top:18px">Tipo</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">${typeChips}</div>
        <div class="label-caps" style="margin-top:18px">Saldo inicial</div>
        <input type="text" inputmode="decimal" class="field-input big" style="margin-top:8px" data-bind="accForm.balance" value="${esc(f.balance)}" placeholder="0,00"/>
        ${f.type === 'tarjeta' ? `<div style="margin-top:8px;font-size:12px;color:var(--red)">Se guardará como deuda (saldo negativo).</div>` : ''}
        <div class="label-caps" style="margin-top:18px">Color</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">${Render.colorSwatches(f.color, 'selectAccColor')}</div>
        <button type="button" class="btn-primary" style="margin-top:26px" data-action="createAccount">Crear cuenta</button>
      </div>
    </div>`;
  };
  Render.modalEditAccount = (App) => {
    const s = App.state;
    const f = s.accForm;
    return `
    <div class="modal-overlay">
      ${Render.modalHeader('Editar cuenta')}
      <div class="modal-body">
        <div class="label-caps">Nombre</div>
        <input type="text" class="field-input" style="margin-top:8px" data-bind="accForm.name" value="${esc(f.name)}"/>
        <div class="label-caps" style="margin-top:18px">Color</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">${Render.colorSwatches(f.color, 'selectAccColor')}</div>
        <button type="button" class="btn-primary" style="margin-top:26px" data-action="saveEditAccount">Guardar cambios</button>
        <button type="button" class="btn-danger-text" style="margin-top:12px" data-action="deleteAccountAction">Eliminar cuenta</button>
      </div>
    </div>`;
  };

  // -------- add money --------
  Render.modalAddMoney = (App) => {
    const s = App.state;
    const accounts = App.sortedAccounts();
    return `
    <div class="modal-overlay">
      ${Render.modalHeader('Añadir dinero')}
      <div class="modal-body">
        <div class="label-caps">Cuenta</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">${accounts.map(a => Render.accChipFlat(a, s.addMoneyAccountId, 'selectAddMoneyAccount')).join('')}</div>
        <div class="label-caps" style="margin-top:18px">Cantidad</div>
        <input type="text" inputmode="decimal" class="field-input big" style="margin-top:8px" data-bind="addMoneyAmount" value="${esc(s.addMoneyAmount)}" placeholder="0,00"/>
        <div class="label-caps" style="margin-top:18px">Nota (opcional)</div>
        <input type="text" class="field-input" style="margin-top:8px" data-bind="addMoneyNote" value="${esc(s.addMoneyNote)}" placeholder="Ej. Nómina"/>
        <button type="button" class="btn-primary" style="margin-top:26px" data-action="addMoney">Añadir</button>
      </div>
    </div>`;
  };

  // -------- transfer --------
  Render.modalTransfer = (App) => {
    const s = App.state;
    const accounts = App.sortedAccounts();
    return `
    <div class="modal-overlay">
      ${Render.modalHeader('Transferir')}
      <div class="modal-body">
        <div class="label-caps">Desde</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">${accounts.map(a => Render.accChipFlat(a, s.transferFrom, 'selectTransferFrom')).join('')}</div>
        <div class="label-caps" style="margin-top:18px">Hacia</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">${accounts.map(a => Render.accChipFlat(a, s.transferTo, 'selectTransferTo')).join('')}</div>
        <div class="label-caps" style="margin-top:18px">Cantidad</div>
        <input type="text" inputmode="decimal" class="field-input big" style="margin-top:8px" data-bind="transferAmount" value="${esc(s.transferAmount)}" placeholder="0,00"/>
        <button type="button" class="btn-primary" style="margin-top:26px" data-action="doTransfer">Transferir</button>
      </div>
    </div>`;
  };

  // -------- reorder accounts --------
  Render.modalReorder = (App) => {
    const s = App.state;
    const accounts = App.sortedAccounts();
    const rows = accounts.map(a => {
      const dragging = s.dragId === a.id;
      return `
      <div class="reorder-row" data-dragging="${dragging ? '1' : '0'}" style="transform:${dragging ? 'translateY(' + s.dragY + 'px)' : 'none'};z-index:${dragging ? 5 : 1};box-shadow:${dragging ? '0 8px 20px rgba(0,0,0,0.18)' : 'none'}">
        <button type="button" class="drag-handle" data-action="startDragReorder" data-id="${a.id}">
          <span class="drag-dot"></span><span class="drag-dot"></span><span class="drag-dot"></span><span class="drag-dot"></span><span class="drag-dot"></span><span class="drag-dot"></span>
        </button>
        <span style="width:30px;height:30px;border-radius:9999px;background:${a.color};display:flex;align-items:center;justify-content:center;flex-shrink:0">${Icons.accountType(a.type)}</span>
        <span style="flex:1;font-size:14px;font-weight:600;color:var(--ink)">${esc(a.name)}</span>
      </div>`;
    }).join('');
    return `
    <div class="modal-overlay">
      ${Render.modalHeader('Reordenar cuentas')}
      <div class="modal-body">
        <div style="font-size:12px;color:var(--ink-soft);margin-bottom:10px">Mantén pulsado el asa y arrastra para reordenar.</div>
        <div style="display:flex;flex-direction:column;gap:8px">${rows}</div>
        <button type="button" class="btn-primary" style="margin-top:20px" data-action="closeModal">Listo</button>
      </div>
    </div>`;
  };

  // -------- fund detail --------
  Render.modalFundDetail = (App) => {
    const s = App.state;
    const fund = App.currentFund();
    const fundVal = fund ? fund.units * fund.currentPrice : 0;
    const fundPnl = fund ? fundVal - fund.totalInvested : 0;
    const fundPnlPct = fund && fund.totalInvested > 0 ? (fundPnl / fund.totalInvested * 100) : 0;
    const accounts = App.sortedAccounts();
    const fundOps = fund ? fund.ops.map(o => ({
      id: o.id, label: (o.type === 'buy' ? 'Compra' : 'Venta'), dateLabel: App.dateLabelShort(o.date),
      unitsText: o.units.toFixed(3) + ' uds a ' + App.fmt(o.price),
      amountText: (o.type === 'buy' ? '-' : '+') + App.fmtAbs(o.amount),
      color: o.type === 'buy' ? 'oklch(58% 0.19 25)' : 'oklch(45% 0.13 155)'
    })) : [];

    const sheet = (s.fundAction === 'buy' || s.fundAction === 'sell') ? `
      <div class="bottom-sheet-wrap">
        <button type="button" class="bottom-sheet-backdrop" data-action="cancelFundAction" aria-label="Cerrar"></button>
        <div class="bottom-sheet">
          <div style="font-size:26px;font-weight:800;color:var(--ink);letter-spacing:-0.3px">${s.confirmingRuleId ? 'Confirmar aporte' : (s.fundAction === 'buy' ? 'Comprar' : 'Vender')}</div>
          ${s.confirmingRuleId ? `<div style="font-size:13px;color:var(--ink-soft);margin-top:4px">Revisa fecha, unidades y precio antes de confirmar.</div>` : ''}
          <div class="label-caps" style="margin-top:20px">Fecha</div>
          <input type="date" class="field-input" style="margin-top:6px;font-weight:600;background:oklch(94% 0.005 90)" data-bind="fundActionDate" value="${esc(s.fundActionDate)}"/>
          <div class="label-caps" style="margin-top:16px">Cuenta</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">${accounts.map(a => Render.accChipFlat(a, s.fundActionAccountId, 'selectFundActionAccount')).join('')}</div>
          <div class="label-caps" style="margin-top:16px">${s.fundAction === 'buy' ? 'Unidades' : 'Unidades a vender'}</div>
          <input type="text" inputmode="decimal" class="field-input" style="margin-top:6px;font-weight:600;background:oklch(94% 0.005 90)" data-bind="fundActionUnits" value="${esc(s.fundActionUnits)}" placeholder="0"/>
          <div class="label-caps" style="margin-top:16px">${s.fundAction === 'buy' ? 'Importe total pagado' : 'Importe total recibido'}</div>
          <input type="text" inputmode="decimal" class="field-input" style="margin-top:6px;font-weight:600;background:oklch(94% 0.005 90)" data-bind="fundActionAmount" value="${esc(s.fundActionAmount)}" placeholder="0,00"/>
          <div class="label-caps" style="margin-top:16px">Comisión (opcional)</div>
          <input type="text" inputmode="decimal" class="field-input" style="margin-top:6px;font-weight:600;background:oklch(94% 0.005 90)" data-bind="fundActionFee" value="${esc(s.fundActionFee)}" placeholder="0,00"/>
          ${s.fundAction === 'buy'
            ? `<button type="button" style="margin-top:22px;width:100%;padding:16px;border-radius:9999px;border:none;background:oklch(70% 0.16 150);color:oklch(18% 0.05 150);font-size:16px;font-weight:800;cursor:pointer" data-action="confirmFundBuy">${s.confirmingRuleId ? 'Confirmar aporte' : 'Registrar compra'}</button>`
            : `<button type="button" style="margin-top:22px;width:100%;padding:16px;border-radius:9999px;border:none;background:oklch(20% 0.01 90);color:#fff;font-size:16px;font-weight:800;cursor:pointer" data-action="confirmFundSell">Registrar venta</button>`}
        </div>
      </div>` : '';

    return `
    <div class="modal-overlay">
      ${Render.modalHeaderBack(fund ? fund.name : '')}
      <div class="modal-body" style="position:relative">
        <div style="font-size:12px;color:var(--ink-soft);margin-top:2px">${esc(fund ? fund.isin : '')}</div>
        <div style="margin-top:16px;background:oklch(93% 0.05 155);border-radius:22px;padding:20px">
          <div style="font-size:13px;color:oklch(38% 0.1 155);font-weight:600">Valor de mercado</div>
          <div style="font-size:30px;font-weight:800;color:oklch(22% 0.06 155);margin-top:4px">${esc(App.fmt(fundVal))}</div>
          <div style="display:inline-flex;margin-top:10px;padding:7px 14px;border-radius:9999px;background:#fff;color:${fundPnl >= 0 ? 'oklch(45% 0.13 155)' : 'oklch(58% 0.19 25)'};font-size:12px;font-weight:700">${esc(App.fmtSigned(fundPnl))} (${esc(App.fmtPct(fundPnlPct))})</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:14px">
          <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--ink-soft);font-weight:600">Unidades</div><div style="font-size:14px;font-weight:800;color:var(--ink);margin-top:4px">${fund ? fund.units.toFixed(3) : '0'}</div></div>
          <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--ink-soft);font-weight:600">Coste medio</div><div style="font-size:14px;font-weight:800;color:var(--ink);margin-top:4px">${esc(App.fmt(fund ? fund.avgCost : 0))}</div></div>
          <div class="card" style="padding:12px;cursor:pointer" data-action="${s.editingPrice ? 'none' : 'startEditPrice'}">
            <div style="font-size:11px;color:var(--ink-soft);font-weight:600">Precio actual</div>
            ${s.editingPrice
              ? `<input type="text" inputmode="decimal" data-bind="editingPriceValue" data-blur-action="saveEditPrice" value="${esc(s.editingPriceValue)}" style="width:100%;border:none;font-size:14px;font-weight:800;margin-top:4px;background:transparent" autofocus/>`
              : `<div style="font-size:14px;font-weight:800;color:var(--ink);margin-top:4px">${esc(App.fmt(fund ? fund.currentPrice : 0))}</div>`}
          </div>
        </div>
        <div style="margin-top:12px;font-size:13px;color:var(--ink-soft)">Total invertido: <span style="font-weight:800;color:var(--ink)">${esc(App.fmt(fund ? fund.totalInvested : 0))}</span></div>

        ${fund && fund.isin ? `
        <div class="card row-flex between" style="margin-top:12px;padding:14px 16px">
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--ink)">Precio automático</div>
            <div style="font-size:11px;color:var(--ink-soft);margin-top:1px">Se actualiza desde tu hoja de precios por ISIN</div>
          </div>
          ${Render.switchEl(fund.priceSource !== 'manual', 'toggleFundPriceSource')}
        </div>` : ''}

        <div style="display:flex;gap:10px;margin-top:16px">
          <button type="button" style="flex:1;padding:15px;border-radius:9999px;border:none;background:oklch(58% 0.15 155);color:#fff;font-size:17px;font-weight:800;cursor:pointer" data-action="startBuy">+ Comprar</button>
          <button type="button" style="flex:1;padding:15px;border-radius:9999px;border:none;background:oklch(93% 0.005 90);color:var(--ink);font-size:17px;font-weight:800;cursor:pointer" data-action="startSell">− Vender</button>
        </div>

        ${sheet}

        <div class="section-title-sm" style="margin-top:20px">Operaciones</div>
        ${fundOps.length ? `
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
            ${fundOps.map(op => `
              <div class="card row-flex between" style="padding:12px 14px">
                <div>
                  <div style="font-size:13px;font-weight:700;color:var(--ink)">${esc(op.label)}</div>
                  <div style="font-size:11px;color:var(--ink-soft);margin-top:2px">${esc(op.dateLabel)} · ${esc(op.unitsText)}</div>
                </div>
                <div style="font-size:14px;font-weight:800;color:${op.color}">${esc(op.amountText)}</div>
              </div>`).join('')}
          </div>` : `<div class="empty-note" style="margin-top:10px">Aún no hay compras ni ventas registradas.</div>`}

        <button type="button" class="btn-danger-text" style="margin-top:24px" data-action="deleteFund">Eliminar inversión</button>
      </div>
    </div>`;
  };

  // -------- plan edit --------
  Render.modalPlanEdit = (App) => {
    const s = App.state;
    const rule = s.recurringRules.find(r => r.id === s.editingPlanId);
    const fund = rule ? s.investments.find(x => x.id === rule.fundId) : null;
    const fundIdx = rule ? s.investments.findIndex(x => x.id === rule.fundId) : -1;
    const accounts = App.sortedAccounts();
    return `
    <div class="modal-overlay">
      ${Render.modalHeaderBack('Plan mensual')}
      <div class="modal-body">
        <div class="row-flex gap10" style="margin-top:6px">
          <span style="width:10px;height:10px;border-radius:3px;background:${PALETTE[(fundIdx >= 0 ? fundIdx : 0) % PALETTE.length]};flex-shrink:0"></span>
          <div style="font-size:22px;font-weight:800;color:var(--ink)">${esc(fund ? fund.name : 'Fondo')}</div>
        </div>
        <div style="font-size:13px;color:var(--ink-soft);margin-top:4px">Próximo aporte: ${esc(rule ? App.dateLabelShort(rule.nextDate) : '')}</div>

        <div class="card" style="margin-top:22px;border-radius:20px">
          <div class="label-caps">Importe</div>
          <div style="display:flex;align-items:baseline;gap:6px;margin-top:6px">
            <input type="text" inputmode="decimal" data-bind="planEditAmount" value="${esc(s.planEditAmount)}" style="border:none;background:transparent;font-size:32px;font-weight:800;color:var(--ink);width:140px"/>
            <span style="font-size:18px;font-weight:700;color:oklch(55% 0.01 90)">€</span>
          </div>
          <div style="height:1px;background:oklch(93% 0.005 90);margin:16px 0"></div>
          <div class="label-caps">Día del mes</div>
          <input type="text" inputmode="numeric" class="field-input" style="margin-top:8px;font-weight:700;background:oklch(96% 0.003 90)" data-bind="planEditDay" value="${esc(s.planEditDay)}"/>
          <div class="label-caps" style="margin-top:16px">Frecuencia</div>
          <div style="display:flex;background:oklch(96% 0.003 90);border-radius:12px;padding:4px;margin-top:8px">${Render.freqChips(s.planEditFreq, 'selectPlanEditFreq', 'short')}</div>
          <div class="label-caps" style="margin-top:16px">Cuenta origen</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">${accounts.map(a => Render.accChipFlat(a, s.planEditAccountId, 'selectPlanEditAccount')).join('')}</div>
        </div>

        <button type="button" style="margin-top:18px;width:100%;padding:16px;border-radius:9999px;border:none;background:oklch(58% 0.15 155);color:#fff;font-size:15px;font-weight:800;cursor:pointer" data-action="savePlanEditPage">Guardar cambios</button>
        <button type="button" class="btn-danger-text" style="margin-top:18px" data-action="deletePlanFromPage">Eliminar plan</button>
      </div>
    </div>`;
  };

  // -------- category budget --------
  Render.chipToggle = (options, current, action) => `
    <div style="display:flex;background:oklch(96% 0.003 90);border-radius:12px;padding:4px;margin-top:8px">
      ${options.map(([k, label]) => `
        <div data-action="${action}" data-value="${k}" style="flex:1;text-align:center;padding:10px;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;background:${current === k ? 'oklch(58% 0.15 155)' : 'transparent'};color:${current === k ? '#fff' : 'oklch(50% 0.01 90)'}">${label}</div>`).join('')}
    </div>`;
  Render.modalCategoryBudget = (App) => {
    const s = App.state;
    const cat = s.categories.find(c => c.id === s.editingCategoryId);
    const hasExistingBudget = !!(cat && cat.budgetType);
    return `
    <div class="modal-overlay">
      ${Render.modalHeaderBack('Presupuesto')}
      <div class="modal-body">
        <div class="row-flex gap10" style="margin-top:6px">
          <span style="width:36px;height:36px;border-radius:9999px;background:${cat ? cat.color : '#ccc'};flex-shrink:0"></span>
          <div style="font-size:22px;font-weight:800;color:var(--ink)">${esc(cat ? cat.name : '')}</div>
        </div>

        <div class="label-caps" style="margin-top:22px">Tipo de gasto</div>
        ${Render.chipToggle([['fixed', 'Fijo'], ['daily', 'Día a día']], s.catKind, 'selectCatKind')}

        <div class="label-caps" style="margin-top:20px">Límite</div>
        ${Render.chipToggle([['amount', '€ Importe'], ['percent', '% Ingresos']], s.catBudgetType, 'selectCatBudgetType')}

        <div class="card" style="margin-top:14px;border-radius:20px">
          <div style="display:flex;align-items:baseline;gap:6px">
            <input type="text" inputmode="decimal" data-bind="catBudgetValue" value="${esc(s.catBudgetValue)}" placeholder="0" style="border:none;background:transparent;font-size:32px;font-weight:800;color:var(--ink);width:140px"/>
            <span style="font-size:18px;font-weight:700;color:oklch(55% 0.01 90)">${s.catBudgetType === 'percent' ? '%' : '€'}</span>
          </div>
        </div>
        <div style="font-size:12px;color:var(--ink-soft);margin-top:8px">${s.catBudgetType === 'percent' ? ('Se calcula sobre tu Jornal (' + esc(App.fmt(s.jornal || 0)) + '). Déjalo en 0 para no fijar límite.') : 'Límite mensual para esta categoría. Déjalo en 0 para no fijar límite.'}</div>

        <button type="button" style="margin-top:22px;width:100%;padding:16px;border-radius:9999px;border:none;background:oklch(58% 0.15 155);color:#fff;font-size:15px;font-weight:800;cursor:pointer" data-action="saveCategoryBudget">Guardar</button>
        ${hasExistingBudget ? `<button type="button" class="btn-danger-text" style="margin-top:14px" data-action="clearCategoryBudget">Quitar presupuesto</button>` : ''}
      </div>
    </div>`;
  };

  // -------- recurring rule edit --------
  Render.modalRecurringEdit = (App) => {
    const s = App.state;
    const isNew = !s.editingRecurringId;
    const accounts = App.sortedAccounts();
    const cats = s.categories.filter(c => c.type === s.recEditType);
    const categoryOptions = cats.map(c => `
      <button type="button" class="category-chip" data-action="selectRecEditCategory" data-id="${c.id}">
        <span class="cat-icon" style="background:${c.color};box-shadow:${ringFor(c.color, s.recEditCategoryId === c.id)}">${Icons.category(c.name)}</span>
        <span class="cat-name">${esc(c.name)}</span>
      </button>`).join('');
    return `
    <div class="modal-overlay">
      ${Render.modalHeaderBack(isNew ? 'Nuevo recurrente' : 'Editar recurrente')}
      <div class="modal-body">
        ${isNew ? `
          <div class="label-caps" style="margin-top:6px">Tipo</div>
          ${Render.chipToggle([['expense', 'Gasto'], ['income', 'Ingreso']], s.recEditType, 'selectRecEditType')}
        ` : ''}

        <div class="card" style="margin-top:16px;border-radius:20px">
          <div class="label-caps">Importe</div>
          <div style="display:flex;align-items:baseline;gap:6px;margin-top:6px">
            <input type="text" inputmode="decimal" data-bind="recEditAmount" value="${esc(s.recEditAmount)}" style="border:none;background:transparent;font-size:32px;font-weight:800;color:var(--ink);width:140px"/>
            <span style="font-size:18px;font-weight:700;color:oklch(55% 0.01 90)">€</span>
          </div>
        </div>

        <div class="label-caps" style="margin-top:18px">Categoría</div>
        <div class="hscroll gap14" style="margin-top:8px;padding-bottom:4px">${categoryOptions}</div>

        <div class="label-caps" style="margin-top:14px">Día del mes</div>
        <input type="text" inputmode="numeric" class="field-input" style="margin-top:8px;font-weight:700;background:oklch(96% 0.003 90)" data-bind="recEditDay" value="${esc(s.recEditDay)}"/>

        <div class="label-caps" style="margin-top:16px">Frecuencia</div>
        <div style="display:flex;background:oklch(96% 0.003 90);border-radius:12px;padding:4px;margin-top:8px">${Render.freqChips(s.recEditFreq, 'selectRecEditFreq', 'short')}</div>

        <div class="label-caps" style="margin-top:16px">Cuenta</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">${accounts.map(a => Render.accChipFlat(a, s.recEditAccountId, 'selectRecEditAccount')).join('')}</div>

        <div class="label-caps" style="margin-top:16px">Nota (opcional)</div>
        <input type="text" class="field-input" style="margin-top:8px" data-bind="recEditNote" value="${esc(s.recEditNote)}" placeholder="Ej. Alquiler piso"/>

        <button type="button" style="margin-top:22px;width:100%;padding:16px;border-radius:9999px;border:none;background:oklch(58% 0.15 155);color:#fff;font-size:15px;font-weight:800;cursor:pointer" data-action="saveRecurringEdit">${isNew ? 'Crear' : 'Guardar cambios'}</button>
        ${!isNew ? `<button type="button" class="btn-danger-text" style="margin-top:14px" data-action="deleteRecurringFromEdit">Eliminar</button>` : ''}
      </div>
    </div>`;
  };

  // -------- all transactions --------
  Render.txFilteredListInner = (App) => {
    const rows = App.filteredTxList();
    return rows.length ? `<div style="display:flex;flex-direction:column;gap:10px">${rows.map(Render.txRow).join('')}</div>` : `<div class="empty-note" style="margin-top:20px">Sin resultados.</div>`;
  };
  Render.modalAllTx = (App) => {
    const s = App.state;
    const filterDefs = [['all', 'Todo'], ['income', 'Ingresos'], ['expense', 'Gastos'], ['investment_buy', 'Inversiones']];
    const chips = filterDefs.map(([k, label]) => `<div class="pill-btn ${s.txFilter === k ? 'active' : ''}" style="flex-shrink:0" data-action="selectTxFilter" data-value="${k}">${label}</div>`).join('');
    return `
    <div class="modal-overlay">
      ${Render.modalHeader('Todos los movimientos')}
      <div style="padding:0 20px;flex-shrink:0">
        <input type="text" id="txSearchInput" class="field-input" style="border-radius:9999px;padding:13px 16px" data-bind="txSearch" value="${esc(s.txSearch)}" placeholder="Buscar por nota o categoría..."/>
        <div class="hscroll gap8" style="margin-top:10px">${chips}</div>
      </div>
      <div class="modal-body" style="padding-top:14px">
        <div id="txFilteredList">${Render.txFilteredListInner(App)}</div>
      </div>
    </div>`;
  };

  // -------- transaction detail (view / edit / delete) --------
  Render.modalTxDetail = (App) => {
    const s = App.state;
    const t = s.transactions.find(x => x.id === s.editingTxId);
    if (!t) return `<div class="modal-overlay">${Render.modalHeader('Movimiento')}<div class="modal-body"></div></div>`;
    const accounts = App.sortedAccounts();
    const editable = t.type === 'expense' || t.type === 'income' || t.type === 'adjustment';
    const row = App.buildTxRow(t);

    let body;
    if (editable) {
      const categoryOptions = t.type === 'adjustment' ? '' : `
        <div class="label-caps" style="margin-top:20px">Categoría</div>
        <div class="hscroll gap14" style="margin-top:8px;padding-bottom:4px">
          ${s.categories.filter(c => c.type === t.type).map(c => `
            <button type="button" class="category-chip" data-action="selectTxEditCategory" data-id="${c.id}">
              <span class="cat-icon" style="background:${c.color};box-shadow:${ringFor(c.color, s.txEditCategoryId === c.id)}">${Icons.category(c.name)}</span>
              <span class="cat-name">${esc(c.name)}</span>
            </button>`).join('')}
        </div>`;
      body = `
        <div style="text-align:center;margin-top:8px">
          <div class="label-caps">${t.type === 'expense' ? 'Gasto' : (t.type === 'income' ? 'Ingreso' : 'Ajuste')}</div>
          <div style="display:flex;align-items:baseline;justify-content:center;gap:6px;margin-top:8px">
            <input type="text" inputmode="decimal" data-bind="txEditAmount" value="${esc(s.txEditAmount)}" style="border:none;background:transparent;font-size:44px;font-weight:800;color:var(--ink);width:auto;max-width:180px;text-align:center"/>
            <span style="font-size:26px;font-weight:700;color:var(--ink-soft)">€</span>
          </div>
        </div>
        <div class="card" style="margin-top:20px;padding:12px">
          <div class="label-caps" style="letter-spacing:0.4px">Fecha</div>
          <input type="date" data-bind="txEditDate" value="${esc(s.txEditDate)}" style="border:none;background:transparent;font-size:14px;font-weight:700;color:var(--ink);margin-top:4px;width:100%"/>
        </div>
        ${categoryOptions}
        <div class="label-caps" style="margin-top:20px">Cuenta</div>
        <div class="hscroll gap10" style="margin-top:8px;padding-bottom:4px">${accounts.map(a => Render.accChip(a, s.txEditAccountId, 'selectTxEditAccount', App)).join('')}</div>
        <div class="label-caps" style="margin-top:20px">Notas (opcional)</div>
        <textarea class="field-input" style="margin-top:6px;height:60px" data-bind="txEditNote" placeholder="Añade una descripción...">${esc(s.txEditNote)}</textarea>
        <button type="button" class="btn-primary" style="margin-top:24px" data-action="saveTxEdit">Guardar cambios</button>
        <button type="button" class="btn-danger-text" style="margin-top:12px" data-action="deleteTx" data-id="${t.id}">Eliminar movimiento</button>`;
    } else {
      const kindLabel = t.type === 'transfer_out' || t.type === 'transfer_in' ? 'Transferencia' : (t.type === 'investment_buy' ? 'Compra de fondo' : 'Venta de fondo');
      const hint = t.type === 'transfer_out' || t.type === 'transfer_in'
        ? 'Las transferencias no se pueden editar, solo eliminar (se deshace en ambas cuentas).'
        : 'Para gestionar esta inversión con más detalle, ve a la pestaña Invertir y abre el fondo.';
      body = `
        <div style="text-align:center;margin-top:8px">
          <div class="label-caps">${kindLabel}</div>
          <div style="font-size:34px;font-weight:800;color:var(--ink);margin-top:8px">${esc(row.amountText)}</div>
        </div>
        <div class="card" style="margin-top:20px">
          <div style="font-size:15px;font-weight:700;color:var(--ink)">${esc(row.title)}</div>
          <div style="font-size:13px;color:var(--ink-soft);margin-top:4px">${esc(row.subtitle)}</div>
          ${t.note ? `<div style="font-size:13px;color:var(--ink-soft);margin-top:8px">${esc(t.note)}</div>` : ''}
        </div>
        <div class="empty-note" style="margin-top:16px">${hint}</div>
        <button type="button" class="btn-danger-text" style="margin-top:16px" data-action="deleteTx" data-id="${t.id}">Eliminar movimiento</button>`;
    }

    return `
    <div class="modal-overlay">
      ${Render.modalHeader('Movimiento')}
      <div class="modal-body">${body}</div>
    </div>`;
  };

  Render.modal = (App) => {
    switch (App.state.modal) {
      case 'addTx': return Render.modalAddTx(App);
      case 'settings': return Render.modalSettings(App);
      case 'addAccount': return Render.modalAddAccount(App);
      case 'editAccount': return Render.modalEditAccount(App);
      case 'addMoney': return Render.modalAddMoney(App);
      case 'transfer': return Render.modalTransfer(App);
      case 'reorder': return Render.modalReorder(App);
      case 'fundDetail': return Render.modalFundDetail(App);
      case 'planEdit': return Render.modalPlanEdit(App);
      case 'allTx': return Render.modalAllTx(App);
      case 'txDetail': return Render.modalTxDetail(App);
      case 'categoryBudget': return Render.modalCategoryBudget(App);
      case 'recurringEdit': return Render.modalRecurringEdit(App);
      default: return '';
    }
  };

  // ============================================================
  // Master render + action dispatch tables
  // ============================================================
  Object.assign(App, {
    // Temporary on-screen diagnostic strip — pulled once the bottom-gap issue is
    // confirmed fixed on a real device. Prints hard numbers instead of guesses.
    DEBUG_VIEWPORT: false,
    // Appended directly to <body>, as a sibling of #app rather than a descendant —
    // rules out any nested-fixed-inside-fixed containing-block quirk in #app itself.
    // Kept thin (28px) and pointer-events:none so it can't block any real button.
    ensureRawBottomProbe() {
      if (document.getElementById('rawBottomProbe')) return;
      const el = document.createElement('div');
      el.id = 'rawBottomProbe';
      el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:28px;z-index:99999;background:rgba(255,149,0,0.999);pointer-events:none';
      document.body.appendChild(el);
    },
    paintDebugStrip() {
      const el = document.getElementById('debugStrip');
      if (!el) return;
      // Fill with a same-length placeholder FIRST and force layout, so the
      // strip's real flex height (and therefore everything measured below,
      // like the tab bar's bottom edge) reflects what actually renders —
      // measuring an empty strip understates its height and throws off
      // every downstream number.
      el.textContent = 'GAP xxxxxxxxxxxxxxxxxxxxxxxxxx\nxxxxxx xxx=xxxx xxx=xxx xxxxxxx=xxx xxx=x | xxxxx-xxxxxx:x xxxxx xx x=xxxx (xxxxxx = xxxxx xx xxxx xxxxx)\n#xxx xxxx=xxx..xxx | xxx-xxx xxxxxx=xxx.x | xxxxx xxxxxx=xxx.x | xxxx-xxxxx xxx=xxx.x\nxxxx-xxxxxx=xxxx | --xxx-xx=xxxxx';
      void el.offsetHeight;
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;bottom:0;left:0;height:0;padding-bottom:env(safe-area-inset-bottom);visibility:hidden';
      document.body.appendChild(probe);
      const safeBottom = getComputedStyle(probe).paddingBottom;
      document.body.removeChild(probe);
      const fixedProbe = document.createElement('div');
      fixedProbe.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:1px;visibility:hidden';
      document.body.appendChild(fixedProbe);
      const fixedBottomY = fixedProbe.getBoundingClientRect().top;
      document.body.removeChild(fixedProbe);
      const appRect = document.getElementById('app').getBoundingClientRect();
      const stripRect = el.getBoundingClientRect();
      const probeEl = document.getElementById('rawBottomProbe');
      const probeRect = probeEl ? probeEl.getBoundingClientRect() : null;
      const tabBarEl = document.querySelector('.tab-bar');
      const tabBarRect = tabBarEl ? tabBarEl.getBoundingClientRect() : null;
      const appVh = getComputedStyle(document.documentElement).getPropertyValue('--app-vh');
      const vv = window.visualViewport;
      const gap = tabBarRect ? (window.innerHeight - tabBarRect.bottom).toFixed(1) : 'n/a';
      el.textContent =
        'GAP tab-bar-bottom..innerH = ' + gap + 'px' +
        '\ninnerH=' + window.innerHeight + ' vvH=' + (vv ? vv.height : 'n/a') + ' screenH=' + screen.height + ' dpr=' + window.devicePixelRatio +
        ' | fixed-bottom:0 lands at y=' + fixedBottomY + ' (should = innerH if they agree)' +
        '\n#app rect=' + appRect.top.toFixed(0) + '..' + appRect.bottom.toFixed(0) +
        (tabBarRect ? ' | tab-bar bottom=' + tabBarRect.bottom.toFixed(1) : '') +
        ' | strip bottom=' + stripRect.bottom.toFixed(1) +
        (probeRect ? ' | body-probe top=' + probeRect.top.toFixed(1) : '') +
        '\nsafe-bottom=' + safeBottom + ' | --app-vh=' + appVh;
    },
    render() {
      const s = this.state;
      const root = document.getElementById('app');
      const prevScreen = root.querySelector('.screen');
      const prevModalBody = root.querySelector('.modal-body');
      const prevSheet = root.querySelector('.bottom-sheet');
      const savedScroll = {
        screen: prevScreen ? prevScreen.scrollTop : 0,
        modal: prevModalBody ? prevModalBody.scrollTop : 0,
        sheet: prevSheet ? prevSheet.scrollTop : 0,
      };

      let html;
      if (!s.onboardingDone) {
        html = Render.onboarding(s);
      } else {
        let screenHtml;
        if (s.screen === 'stats') screenHtml = Render.stats(this);
        else if (s.screen === 'investments') screenHtml = Render.investments(this);
        else if (s.screen === 'accounts') screenHtml = Render.accounts(this);
        else screenHtml = Render.home(this);
        const debugStrip = App.DEBUG_VIEWPORT ? `<div id="debugStrip" style="flex-shrink:0;background:rgba(255,0,68,0.999);color:#fff;font:11px/1.4 ui-monospace,monospace;padding:6px 10px calc(6px + env(safe-area-inset-bottom));white-space:pre-wrap"></div>` : '';
        html = `<div class="app-main"><div class="screen">${screenHtml}</div></div>${!s.modal ? Render.tabBar(s) : ''}${debugStrip}${s.modal ? Render.modal(this) : ''}`;
      }
      root.innerHTML = html;
      if (App.DEBUG_VIEWPORT) { App.ensureRawBottomProbe(); App.paintDebugStrip(); }

      const newScreen = root.querySelector('.screen'); if (newScreen) newScreen.scrollTop = savedScroll.screen;
      const newModalBody = root.querySelector('.modal-body'); if (newModalBody) newModalBody.scrollTop = savedScroll.modal;
      const newSheet = root.querySelector('.bottom-sheet'); if (newSheet) newSheet.scrollTop = savedScroll.sheet;

      if (s.editingPrice) {
        const priceInput = root.querySelector('[data-blur-action="saveEditPrice"]');
        if (priceInput) { priceInput.focus(); priceInput.select(); }
      }
      if (s.editingJornal) {
        const jornalInput = root.querySelector('[data-blur-action="saveEditJornal"]');
        if (jornalInput) { jornalInput.focus(); jornalInput.select(); }
      }
    },
  });

  const SIMPLE_SETTERS = {
    selectObType: (s, id, v) => { s.obAccType = v; },
    selectObColor: (s, id, v) => { s.obColor = v; },
    selectHistoryRange: (s, id, v) => { s.historyRange = v; },
    selectStatsTab: (s, id, v) => { s.statsTab = v; },
    selectStatsPeriod: (s, id, v) => { s.statsPeriod = v; },
    selectTxAccount: (s, id) => { s.txAccountId = id; },
    selectTxCategory: (s, id) => { s.txCategoryId = id; },
    selectTxFreq: (s, id, v) => { s.txFreq = v; },
    selectAccType: (s, id, v) => { s.accForm = { ...s.accForm, type: v }; },
    selectAccColor: (s, id, v) => { s.accForm = { ...s.accForm, color: v }; },
    selectAddMoneyAccount: (s, id) => { s.addMoneyAccountId = id; },
    selectTransferFrom: (s, id) => { s.transferFrom = id; },
    selectTransferTo: (s, id) => { s.transferTo = id; },
    selectFundActionAccount: (s, id) => { s.fundActionAccountId = id; },
    selectPlanEditFreq: (s, id, v) => { s.planEditFreq = v; },
    selectPlanEditAccount: (s, id) => { s.planEditAccountId = id; },
    selectCatTab: (s, id, v) => { s.catTab = v; },
    selectNewCatColor: (s, id, v) => { s.newCatColor = v; },
    selectTxFilter: (s, id, v) => { s.txFilter = v; },
    selectTxEditCategory: (s, id) => { s.txEditCategoryId = id; },
    selectTxEditAccount: (s, id) => { s.txEditAccountId = id; },
    selectCatKind: (s, id, v) => { s.catKind = v; },
    selectCatBudgetType: (s, id, v) => { s.catBudgetType = v; },
    selectRecEditType: (s, id, v) => { s.recEditType = v; s.recEditCategoryId = ''; },
    selectRecEditCategory: (s, id) => { s.recEditCategoryId = id; },
    selectRecEditAccount: (s, id) => { s.recEditAccountId = id; },
    selectRecEditFreq: (s, id, v) => { s.recEditFreq = v; },
  };

  const ACTIONS = {
    none: () => {},
    setScreen: (id, value) => App.setScreen(value),
    openSettings: () => App.openSettings(),
    closeModal: () => App.closeModal(),
    openAllTx: () => App.openAllTx(),
    openReorder: () => App.openReorder(),
    openAddAccount: () => App.openAddAccount(),
    openAddInvestment: () => App.openAddInvestment(),
    openAddTxDefault: () => App.openAddTxDefault(),
    toggleHide: () => App.toggleHide(),
    navInvestYearPrev: () => App.navInvestYear(-1),
    navInvestYearNext: () => App.navInvestYear(1),
    refreshSheetPrices: () => App.fetchSheetPrices(),
    toggleFundPriceSource: () => App.toggleFundPriceSource(),
    toggleCatInline: () => App.toggleCatInline(),
    completeOnboarding: () => App.completeOnboarding(),
    selectTxType: (id, value) => App.setTxType(value),
    toggleTxRepeat: () => App.toggleTxRepeat(),
    selectFund: (id) => App.selectFund(id),
    selectNewFund: () => App.selectNewFund(),
    toggleNewCategory: () => App.toggleNewCategory(),
    addCategoryInline: () => App.addCategoryInline(),
    addCategoryFromModal: () => App.addCategoryFromModal(),
    deleteCategory: (id) => App.deleteCategory(id),
    openCategoryBudget: (id) => App.openCategoryBudget(id),
    saveCategoryBudget: () => App.saveCategoryBudget(),
    clearCategoryBudget: () => App.clearCategoryBudget(),
    saveTx: () => App.saveTx(),
    confirmRecurring: (id) => App.confirmRecurring(id),
    skipRecurring: (id) => App.skipRecurring(id),
    deleteRecurring: (id) => App.deleteRecurring(id),
    openPlanEdit: (id) => App.openPlanEdit(id),
    savePlanEditPage: () => App.savePlanEditPage(),
    deletePlanFromPage: () => App.deletePlanFromPage(),
    toggleRecurringInline: () => App.toggleRecurringInline(),
    openRecurringEdit: (id) => App.openRecurringEdit(id),
    openRecurringNew: (id) => App.openRecurringNew(id),
    saveRecurringEdit: () => App.saveRecurringEdit(),
    deleteRecurringFromEdit: () => App.deleteRecurringFromEdit(),
    openAddMoney: (id) => App.openAddMoney(id),
    addMoney: () => App.addMoney(),
    openTransfer: () => App.openTransfer(),
    doTransfer: () => App.doTransfer(),
    openEditAccount: (id) => App.openEditAccount(id),
    saveEditAccount: () => App.saveEditAccount(),
    deleteAccountAction: () => App.deleteAccountAction(),
    createAccount: () => App.createAccount(),
    openFund: (id) => App.openFund(id),
    openConfirmDueRule: (id) => App.openConfirmDueRule(id),
    startBuy: () => App.startBuy(),
    startSell: () => App.startSell(),
    cancelFundAction: () => App.cancelFundAction(),
    startEditPrice: () => App.startEditPrice(),
    startEditJornal: () => App.startEditJornal(),
    confirmFundBuy: () => App.confirmFundBuy(),
    confirmFundSell: () => App.confirmFundSell(),
    deleteFund: () => App.deleteFund(),
    loadDemoData: () => App.seedDemoData(),
    exportCSV: () => App.exportCSV(),
    exportJSON: () => App.exportJSON(),
    openTxDetail: (id) => App.openTxDetail(id),
    saveTxEdit: () => App.saveTxEdit(),
    deleteTx: (id) => App.deleteTx(id),
    resetAll: () => App.resetAll(),
  };

  // ============================================================
  // Event wiring + bootstrap
  // ============================================================
  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('app');

    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;
      if (action === 'none' || action === 'handleImportFile' || action === 'handleImportJSON') return;
      const id = el.dataset.id;
      const value = el.dataset.value;
      if (SIMPLE_SETTERS[action]) { SIMPLE_SETTERS[action](App.state, id, value); App.commit(); return; }
      if (ACTIONS[action]) ACTIONS[action](id, value, e);
    });

    root.addEventListener('input', (e) => {
      const el = e.target;
      const bind = el.dataset.bind;
      if (!bind) return;
      if (bind === 'txSearch') {
        App.state.txSearch = el.value;
        const list = document.getElementById('txFilteredList');
        if (list) list.innerHTML = Render.txFilteredListInner(App);
        return;
      }
      setDeep(App.state, bind, el.value);
      if (bind === 'txFundPrice' || bind === 'txFundUnits') {
        const disp = document.getElementById('txInvestTotal');
        if (disp) disp.textContent = App.fmt(parseNum(App.state.txFundPrice) * parseNum(App.state.txFundUnits));
      }
      if (bind === 'obAccName') {
        const btn = document.getElementById('obSubmitBtn');
        if (btn) {
          const filled = !!el.value.trim();
          btn.disabled = !filled;
          btn.style.background = filled ? 'oklch(58% 0.15 155)' : 'oklch(90% 0.006 90)';
          btn.style.color = filled ? '#fff' : 'oklch(65% 0.01 90)';
        }
      }
      App.persist();
    });

    root.addEventListener('change', (e) => {
      if (e.target.dataset.action === 'handleImportFile') App.handleImportFile(e);
      if (e.target.dataset.action === 'handleImportJSON') App.importJSONFile(e);
    });

    root.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('[data-action="startDragReorder"]');
      if (!el) return;
      App.startDragReorder(el.dataset.id, e);
    });

    const BLUR_ACTIONS = { saveEditPrice: () => App.saveEditPrice(), saveEditJornal: () => App.saveEditJornal() };
    root.addEventListener('blur', (e) => {
      const fn = e.target && e.target.dataset && BLUR_ACTIONS[e.target.dataset.blurAction];
      if (fn) fn();
    }, true);

    root.addEventListener('scroll', (e) => {
      if (e.target.classList && e.target.classList.contains('account-scroller')) App.onAccountsScroll(e);
    }, true);

    // Real viewport height, measured directly instead of trusting vh/dvh units —
    // iOS has shipped several viewport-unit bugs specifically for standalone
    // home-screen apps, where 100vh/100dvh doesn't equal window.innerHeight.
    const setAppVh = () => document.documentElement.style.setProperty('--app-vh', window.innerHeight + 'px');
    setAppVh();
    window.addEventListener('resize', setAppVh);
    window.addEventListener('orientationchange', setAppVh);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', setAppVh);

    App.init();

    // No service worker: any previously-installed one on this device gets
    // actively removed so it can never again serve a stale cached shell.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => regs.forEach((reg) => reg.unregister()))
        .catch(() => {});
    }
  });

  window.__Render = Render;
  window.App = App;
  window.__Patrimonio = { Icons, PALETTE, MONTHS, ACC_TYPE_LABELS, FREQ_LABELS, uid, todayISO, parseNum, sumAmt, esc, ringFor, setDeep, getDeep, STORAGE_KEY, defaultCategories };
})();
