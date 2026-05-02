// ─── STATE ───────────────────────────────────────────────────────────────────
const DEFAULTS = {
  groceryBudget: 125,
  diningBudget: 87,
  hardCap: 250,
  dinnersPerWeek: 5,
  includeLunches: false,
  supabaseUrl: '',
  supabaseKey: '',
};

const STAPLES = [
  { name: 'frozen fruit', category: 'frozen', qty: 'stocked', staple: true },
  { name: 'honey', category: 'pantry', qty: 'stocked', staple: true },
  { name: 'flour', category: 'pantry', qty: 'stocked', staple: true },
  { name: 'sugar', category: 'pantry', qty: 'stocked', staple: true },
  { name: 'brown sugar', category: 'pantry', qty: 'stocked', staple: true },
  { name: 'corn starch', category: 'pantry', qty: 'stocked', staple: true },
  { name: 'olive oil', category: 'pantry', qty: 'stocked', staple: true },
  { name: 'soy sauce', category: 'pantry', qty: 'stocked', staple: true },
  { name: 'mirin', category: 'pantry', qty: 'stocked', staple: true },
  { name: 'garlic', category: 'produce', qty: 'stocked', staple: true },
  { name: 'onion', category: 'produce', qty: 'stocked', staple: true },
  { name: 'greek yogurt', category: 'dairy', qty: 'stocked', staple: true },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CAT_ORDER = ['produce', 'protein', 'dairy', 'grains', 'pantry', 'frozen', 'other'];
const CAT_LABELS = { produce: 'produce', protein: 'protein', dairy: 'dairy', grains: 'grains', pantry: 'pantry staples', frozen: 'frozen', other: 'other' };

let state = {
  settings: { ...DEFAULTS },
  pantry: [],
  spending: [],
  mealPlan: [],
  shopList: [],
};

// ─── PERSISTENCE ─────────────────────────────────────────────────────────────
function load() {
  try {
    const saved = localStorage.getItem('pantry_app_v1');
    if (saved) state = { ...state, ...JSON.parse(saved) };
    if (!state.pantry.length) state.pantry = STAPLES.map((s, i) => ({ ...s, id: `staple_${i}` }));
  } catch(e) { state.pantry = STAPLES.map((s, i) => ({ ...s, id: `staple_${i}` })); }
}

function save() {
  localStorage.setItem('pantry_app_v1', JSON.stringify(state));
  syncSupabase();
}

async function syncSupabase() {
  const { supabaseUrl, supabaseKey } = state.settings;
  if (!supabaseUrl || !supabaseKey) return;
  try {
    await fetch(`${supabaseUrl}/rest/v1/pantry_state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ id: 'household', data: JSON.stringify(state), updated_at: new Date().toISOString() }),
    });
  } catch(e) { /* offline — local data is fine */ }
}

async function loadFromSupabase() {
  const { supabaseUrl, supabaseKey } = state.settings;
  if (!supabaseUrl || !supabaseKey) return;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/pantry_state?id=eq.household&select=data,updated_at`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const rows = await res.json();
    if (rows && rows[0]) {
      const remote = JSON.parse(rows[0].data);
      state = { ...state, ...remote };
      localStorage.setItem('pantry_app_v1', JSON.stringify(state));
      renderAll();
    }
  } catch(e) { /* use local */ }
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function fmt$(n) { return '$' + (Math.round(n * 100) / 100).toFixed(0); }

function getWeekStart() {
  const now = new Date();
  const sat = new Date(now);
  // getDay(): 0=Sun,1=Mon,...,6=Sat — roll back to most recent Saturday
  sat.setDate(now.getDate() - ((now.getDay() + 1) % 7));
  sat.setHours(0, 0, 0, 0);
  return sat;
}

function getWeekLabel() {
  const sat = getWeekStart();
  const fri = new Date(sat);
  fri.setDate(sat.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${sat.toLocaleDateString('en-US', opts)} – ${fri.toLocaleDateString('en-US', opts)}`;
}

function weekSpending() {
  return state.spending.filter(s => new Date(s.date) >= getWeekStart());
}

// ─── RENDER ──────────────────────────────────────────────────────────────────
function renderAll() {
  renderBudget();
  renderPlan();
  renderPantry();
  renderLog();
  renderShop();
}

function renderBudget() {
  const { groceryBudget, diningBudget, hardCap } = state.settings;
  const week = weekSpending();
  const grocerySpent = week.filter(s => s.category === 'groceries').reduce((a, s) => a + s.amount, 0);
  const diningSpent = week.filter(s => s.category === 'dining').reduce((a, s) => a + s.amount, 0);
  const total = grocerySpent + diningSpent;

  document.getElementById('grocerySpent').textContent = fmt$(grocerySpent);
  document.getElementById('groceryTarget').textContent = fmt$(groceryBudget);
  document.getElementById('diningSpent').textContent = fmt$(diningSpent);
  document.getElementById('diningTarget').textContent = fmt$(diningBudget);

  const gPct = Math.min((grocerySpent / groceryBudget) * 100, 100);
  const dPct = Math.min((diningSpent / diningBudget) * 100, 100);

  const gBar = document.getElementById('groceryBar');
  const dBar = document.getElementById('diningBar');
  gBar.style.width = gPct + '%';
  dBar.style.width = dPct + '%';
  gBar.className = 'budget-bar-fill' + (gPct >= 100 ? ' over' : gPct >= 80 ? ' warn' : '');
  dBar.className = 'budget-bar-fill' + (dPct >= 100 ? ' over' : dPct >= 80 ? ' warn' : '');

  const totalEl = document.getElementById('totalLine');
  totalEl.innerHTML = `${fmt$(total)} <span class="cap-label">/ ${fmt$(hardCap)} cap</span>`;
  const pct = total / hardCap;
  totalEl.className = 'budget-total-value' + (pct >= 1 ? ' over' : pct >= .85 ? ' warn' : '');
}

function renderPlan() {
  const grid = document.getElementById('mealPlanGrid');
  if (!state.mealPlan.length) {
    grid.innerHTML = `<div class="empty-state"><p>no plan yet</p><p>tap generate to create this week's meals</p></div>`;
    return;
  }
  grid.innerHTML = state.mealPlan.map(meal => `
    <div class="meal-card">
      <div class="meal-card-day">${meal.day}${meal.type ? ' · ' + meal.type : ''}</div>
      <div class="meal-card-name">${meal.name}</div>
      <div class="meal-card-meta">
        ${meal.time ? `<span class="meal-tag">${meal.time}</span>` : ''}
        ${meal.ingredients ? meal.ingredients.slice(0, 3).map(i => `<span class="meal-tag">${i}</span>`).join('') : ''}
      </div>
    </div>
  `).join('');
}

function renderPantry(filter = '') {
  const list = document.getElementById('pantryList');
  const items = filter
    ? state.pantry.filter(i => i.name.toLowerCase().includes(filter.toLowerCase()))
    : state.pantry;

  const grouped = {};
  CAT_ORDER.forEach(c => grouped[c] = []);
  items.forEach(item => { (grouped[item.category] || grouped['other']).push(item); });

  const html = CAT_ORDER.filter(c => grouped[c].length).map(cat => `
    <div class="pantry-category">
      <div class="pantry-cat-label">${CAT_LABELS[cat]}</div>
      ${grouped[cat].map(item => `
        <div class="pantry-item" data-id="${item.id}">
          <div class="pantry-item-left">
            ${item.staple ? '<div class="staple-dot"></div>' : ''}
            <div>
              <div class="pantry-item-name">${item.name}</div>
              ${item.qty ? `<div class="pantry-item-qty">${item.qty}</div>` : ''}
            </div>
          </div>
          <div class="pantry-item-right">
            ${item.low ? '<span class="low-badge">low</span>' : ''}
            <button class="delete-btn" data-delete="${item.id}">×</button>
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');

  list.innerHTML = html || `<div class="empty-state"><p>nothing here</p><p>add ingredients to your pantry</p></div>`;

  list.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.pantry = state.pantry.filter(i => i.id !== btn.dataset.delete);
      save(); renderPantry(document.getElementById('pantrySearch').value);
    });
  });
}

function renderLog() {
  const log = document.getElementById('spendingLog');
  const entries = [...state.spending].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!entries.length) {
    log.innerHTML = `<div class="log-empty">no spending logged yet</div>`;
    return;
  }
  log.innerHTML = entries.map(e => `
    <div class="spend-entry">
      <div class="spend-left">
        <div class="spend-place">${e.place || 'unlabeled'}</div>
        <div class="spend-meta">
          <span class="spend-who">${e.who}</span>
          <span class="spend-cat-tag ${e.category}">${e.category === 'dining' ? 'dining out' : e.category}</span>
          <span>${new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          ${e.note ? `<span>${e.note}</span>` : ''}
        </div>
      </div>
      <div class="spend-right">
        <span class="spend-amount">${fmt$(e.amount)}</span>
        <button class="delete-btn" data-delete-spend="${e.id}">×</button>
      </div>
    </div>
  `).join('');

  log.querySelectorAll('[data-delete-spend]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.spending = state.spending.filter(s => s.id !== btn.dataset.deleteSpend);
      save(); renderLog(); renderBudget();
    });
  });
}

function renderShop() {
  const list = document.getElementById('shopList');
  if (!state.shopList.length) {
    list.innerHTML = `<div class="empty-state"><p>list is empty</p><p>add items or generate a meal plan</p></div>`;
    return;
  }
  const grouped = {};
  state.shopList.forEach(item => {
    const store = item.store || 'any';
    if (!grouped[store]) grouped[store] = [];
    grouped[store].push(item);
  });
  const storeOrder = ["Trader Joe's", "Good Life Grocers", "any"];
  const stores = [...new Set([...storeOrder, ...Object.keys(grouped)])].filter(s => grouped[s]);

  list.innerHTML = stores.map(store => `
    <div class="shop-store-group">
      <div class="shop-store-label">${store}</div>
      ${grouped[store].map(item => `
        <div class="shop-item" data-shop-id="${item.id}">
          <button class="shop-check ${item.checked ? 'checked' : ''}" data-check="${item.id}"></button>
          <span class="shop-item-name ${item.checked ? 'checked' : ''}">${item.name}</span>
          ${item.qty ? `<span class="shop-item-qty">${item.qty}</span>` : ''}
          <button class="delete-btn" data-delete-shop="${item.id}">×</button>
        </div>
      `).join('')}
    </div>
  `).join('');

  list.querySelectorAll('[data-check]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = state.shopList.find(i => i.id === btn.dataset.check);
      if (item) { item.checked = !item.checked; save(); renderShop(); }
    });
  });
  list.querySelectorAll('[data-delete-shop]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.shopList = state.shopList.filter(i => i.id !== btn.dataset.deleteShop);
      save(); renderShop();
    });
  });
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ─── MODALS ───────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); });
});

// ─── TOGGLE GROUPS ────────────────────────────────────────────────────────────
function initToggle(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}
function getToggleVal(groupId) {
  const active = document.querySelector(`#${groupId} .toggle-btn.active`);
  return active ? active.dataset.val : null;
}
function setToggleVal(groupId, val) {
  document.querySelectorAll(`#${groupId} .toggle-btn`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === val);
  });
}

['whoToggle', 'catToggle', 'lowStockToggle', 'lunchToggle'].forEach(initToggle);

// ─── ADD PANTRY ITEM ─────────────────────────────────────────────────────────
document.getElementById('addItemBtn').addEventListener('click', () => {
  document.getElementById('newItemName').value = '';
  document.getElementById('newItemQty').value = '';
  openModal('addItemModal');
});
document.getElementById('confirmAddItem').addEventListener('click', () => {
  const name = document.getElementById('newItemName').value.trim();
  if (!name) return;
  state.pantry.push({
    id: uid(), name,
    category: document.getElementById('newItemCategory').value,
    qty: document.getElementById('newItemQty').value.trim(),
    low: getToggleVal('lowStockToggle') === 'true',
    staple: false,
  });
  save(); renderPantry(); closeModal('addItemModal');
});

// ─── PANTRY SEARCH ────────────────────────────────────────────────────────────
document.getElementById('pantrySearch').addEventListener('input', e => {
  renderPantry(e.target.value);
});

// ─── ADD SPENDING ─────────────────────────────────────────────────────────────
document.getElementById('addSpendBtn').addEventListener('click', () => {
  document.getElementById('spendPlace').value = '';
  document.getElementById('spendAmount').value = '';
  document.getElementById('spendNote').value = '';
  openModal('addSpendModal');
});
document.getElementById('confirmAddSpend').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('spendAmount').value);
  if (!amount || amount <= 0) return;
  state.spending.push({
    id: uid(),
    who: getToggleVal('whoToggle'),
    category: getToggleVal('catToggle'),
    place: document.getElementById('spendPlace').value.trim(),
    amount,
    note: document.getElementById('spendNote').value.trim(),
    date: new Date().toISOString(),
  });
  save(); renderLog(); renderBudget(); closeModal('addSpendModal');
});

// ─── ADD SHOP ITEM ────────────────────────────────────────────────────────────
document.getElementById('addShopItemBtn').addEventListener('click', () => {
  document.getElementById('newShopItem').value = '';
  document.getElementById('shopItemQty').value = '';
  openModal('addShopModal');
});
document.getElementById('confirmAddShopItem').addEventListener('click', () => {
  const name = document.getElementById('newShopItem').value.trim();
  if (!name) return;
  state.shopList.push({
    id: uid(), name,
    store: document.getElementById('shopItemStore').value,
    qty: document.getElementById('shopItemQty').value.trim(),
    checked: false,
  });
  save(); renderShop(); closeModal('addShopModal');
});
document.getElementById('clearCheckedBtn').addEventListener('click', () => {
  state.shopList = state.shopList.filter(i => !i.checked);
  save(); renderShop();
});

// ─── RECEIPT SCAN ─────────────────────────────────────────────────────────────
document.getElementById('receiptScanBtn').addEventListener('click', () => {
  document.getElementById('receiptPasteArea').value = '';
  openModal('receiptModal');
});
document.getElementById('confirmReceipt').addEventListener('click', () => {
  const raw = document.getElementById('receiptPasteArea').value.trim();
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.items && Array.isArray(parsed.items)) {
      parsed.items.forEach(item => {
        const exists = state.pantry.find(p => p.name.toLowerCase() === item.name.toLowerCase());
        if (!exists) {
          state.pantry.push({ id: uid(), name: item.name, category: item.category || 'other', qty: item.qty || '', low: false, staple: false });
        } else {
          exists.qty = item.qty || exists.qty;
          exists.low = false;
        }
      });
      if (parsed.total && parsed.store) {
        state.spending.push({
          id: uid(), who: 'Nick', category: 'groceries',
          place: parsed.store, amount: parsed.total,
          note: 'from receipt scan', date: new Date().toISOString(),
        });
      }
      save(); renderAll(); closeModal('receiptModal');
      alert(`Imported ${parsed.items.length} items from receipt.`);
    }
  } catch(e) { alert('Could not parse JSON. Make sure you copied exactly what Claude returned.'); }
});

// ─── GENERATE MEAL PLAN ───────────────────────────────────────────────────────
document.getElementById('generatePlanBtn').addEventListener('click', () => {
  document.getElementById('genDinners').value = state.settings.dinnersPerWeek;
  document.getElementById('genLunches').value = state.settings.lunchesPerWeek || 0;
  document.getElementById('promptSection').style.display = 'none';
  document.getElementById('planPasteArea').value = '';
  openModal('generateModal');
});

document.getElementById('buildPromptBtn').addEventListener('click', () => {
  const dinners = parseInt(document.getElementById('genDinners').value) || 0;
  const lunches = parseInt(document.getElementById('genLunches').value) || 0;
  state.settings.dinnersPerWeek = dinners;
  state.settings.lunchesPerWeek = lunches;
  save();

  const pantryNames = state.pantry.map(i => i.name).join(', ');
  const mealTypes = [
    dinners > 0 ? `${dinners} dinners` : '',
    lunches > 0 ? `${lunches} lunches` : '',
  ].filter(Boolean).join(' and ');

  const prompt = `IMPORTANT: Return ONLY a raw JSON array. No markdown, no code blocks, no explanation, no React app. Just the JSON array starting with [ and ending with ].

Generate a weekly meal plan for Nick and Pascale (2 people in San Francisco).
Plan: ${mealTypes || 'no meals specified'}.
Grocery budget remaining this week: ~$${state.settings.groceryBudget} for Trader Joe\'s or Good Life Grocers in Bernal Heights SF.
Current pantry: ${pantryNames || 'mostly empty'}.
Prefer meals that use pantry items. Mix of cuisines, no dietary restrictions.

Return ONLY a JSON array, no other text:
[{"day":"Monday","type":"dinner","name":"Meal Name","time":"30 min","ingredients":["ingredient1","ingredient2","ingredient3"]}]`;

  document.getElementById('generatedPrompt').textContent = prompt;
  document.getElementById('promptSection').style.display = 'block';
});

document.getElementById('copyPromptBtn').addEventListener('click', () => {
  const text = document.getElementById('generatedPrompt').textContent;
  navigator.clipboard.writeText(text).then(() => {
    document.getElementById('copyPromptBtn').textContent = 'copied ✓';
    setTimeout(() => document.getElementById('copyPromptBtn').textContent = 'copy prompt', 2000);
  });
});

document.getElementById('confirmPastePlan').addEventListener('click', () => {
  const raw = document.getElementById('planPasteArea').value.trim();
  if (!raw) return;
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const plan = JSON.parse(clean);
    if (Array.isArray(plan)) {
      state.mealPlan = plan;
      const ingredients = [...new Set(plan.flatMap(m => m.ingredients || []))];
      const pantryNames = state.pantry.map(p => p.name.toLowerCase());
      ingredients.forEach(ing => {
        if (!pantryNames.includes(ing.toLowerCase())) {
          const exists = state.shopList.find(s => s.name.toLowerCase() === ing.toLowerCase());
          if (!exists) state.shopList.push({ id: uid(), name: ing, store: "Trader Joe's", qty: '', checked: false });
        }
      });
      save(); renderPlan(); renderShop(); closeModal('generateModal');
      document.querySelector('[data-tab="plan"]').click();
    }
  } catch(e) { alert('Could not parse meal plan. Make sure you copied exactly what Claude returned.'); }
});

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
document.getElementById('settingsBtn').addEventListener('click', () => {
  const s = state.settings;
  document.getElementById('setGroceryBudget').value = s.groceryBudget;
  document.getElementById('setDiningBudget').value = s.diningBudget;
  document.getElementById('setHardCap').value = s.hardCap;
  document.getElementById('setDinners').value = s.dinnersPerWeek;
  document.getElementById('setSupabaseUrl').value = s.supabaseUrl || '';
  document.getElementById('setSupabaseKey').value = s.supabaseKey || '';
  setToggleVal('lunchToggle', s.includeLunches ? 'true' : 'false');
  openModal('settingsModal');
});
document.getElementById('confirmSettings').addEventListener('click', () => {
  const wasConnected = !!state.settings.supabaseUrl;
  state.settings.groceryBudget = parseFloat(document.getElementById('setGroceryBudget').value) || 125;
  state.settings.diningBudget = parseFloat(document.getElementById('setDiningBudget').value) || 87;
  state.settings.hardCap = parseFloat(document.getElementById('setHardCap').value) || 250;
  state.settings.dinnersPerWeek = parseInt(document.getElementById('setDinners').value) || 5;
  state.settings.includeLunches = getToggleVal('lunchToggle') === 'true';
  state.settings.supabaseUrl = document.getElementById('setSupabaseUrl').value.trim();
  state.settings.supabaseKey = document.getElementById('setSupabaseKey').value.trim();
  renderAll(); closeModal('settingsModal');
  if (state.settings.supabaseUrl && !wasConnected) {
    // First time connecting — pull remote data first, then save locally
    localStorage.setItem('pantry_app_v1', JSON.stringify(state));
    loadFromSupabase();
  } else {
    save();
    if (state.settings.supabaseUrl) loadFromSupabase();
  }
});

document.getElementById('resetWeekBtn').addEventListener('click', () => {
  if (confirm('Clear all spending for this week?')) {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    state.spending = state.spending.filter(s => new Date(s.date) < monday);
    save(); renderAll(); closeModal('settingsModal');
  }
});

// ─── THEME TOGGLE ────────────────────────────────────────────────────────────
const SUN_SVG = `<circle cx="10" cy="10" r="2.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"/>`;
const MOON_SVG = `<path d="M17 12.5a7 7 0 1 1-9.5-9.5A5.5 5.5 0 0 0 17 12.5z"/>`;

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('themeIcon');
  icon.innerHTML = theme === 'light' ? MOON_SVG : SUN_SVG;
}

document.getElementById('themeToggle').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', next);
  applyTheme(next);
});

applyTheme(localStorage.getItem('theme') === 'light' ? 'light' : 'dark');

// ─── WEEK LABEL ───────────────────────────────────────────────────────────────
document.getElementById('weekLabel').textContent = getWeekLabel();

// ─── INIT ─────────────────────────────────────────────────────────────────────
load();
renderAll();
if (state.settings.supabaseUrl) loadFromSupabase();

// Service worker registration
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
