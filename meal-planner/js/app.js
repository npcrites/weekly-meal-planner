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
  favorites: [],
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
  renderSavedMeals();
}

function renderSavedMeals() {
  const section = document.getElementById('savedMealsSection');
  const list = document.getElementById('savedMealsList');
  if (!state.favorites || !state.favorites.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  list.innerHTML = state.favorites.map((meal, i) => `
    <div class="saved-meal" data-fav-idx="${i}">
      <div class="saved-meal-name">${meal.name}</div>
      <div class="saved-meal-actions">
        <button class="pill-btn ghost" data-add-fav="${i}">+ this week</button>
        <button class="delete-btn" data-remove-fav="${i}">×</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-add-fav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fav = state.favorites[btn.dataset.addFav];
      state.mealPlan.push({ ...fav, ingredients: [...(fav.ingredients || [])], instructions: [...(fav.instructions || [])] });
      save(); renderPlan();
    });
  });
  list.querySelectorAll('[data-remove-fav]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.favorites.splice(btn.dataset.removeFav, 1);
      save(); renderSavedMeals();
    });
  });
}

function isFavorited(meal) {
  return (state.favorites || []).some(f => f.name === meal.name);
}

function toggleFavorite(meal) {
  if (!state.favorites) state.favorites = [];
  const i = state.favorites.findIndex(f => f.name === meal.name);
  if (i >= 0) state.favorites.splice(i, 1);
  else state.favorites.push({ ...meal, ingredients: [...(meal.ingredients || [])], instructions: [...(meal.instructions || [])] });
  save();
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
  grid.innerHTML = state.mealPlan.map((meal, i) => `
    <div class="meal-card" data-meal-idx="${i}" style="cursor:pointer">
      <button class="meal-card-delete" data-delete-meal="${i}" aria-label="Remove meal">×</button>
      <div class="meal-card-day">${meal.day}${meal.type ? ' · ' + meal.type : ''}</div>
      <div class="meal-card-name">${meal.name}</div>
      <div class="meal-card-meta">
        ${meal.time ? `<span class="meal-tag">${meal.time}</span>` : ''}
        ${meal.appliances ? meal.appliances.map(a => `<span class="meal-tag">${a}</span>`).join('') : ''}
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('[data-delete-meal]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.deleteMeal);
      state.mealPlan.splice(idx, 1);
      save();
      renderPlan();
    });
  });

  grid.querySelectorAll('.meal-card').forEach(card => {
    card.addEventListener('click', () => openRecipeModal(parseInt(card.dataset.mealIdx)));
  });
}

let editingMealIdx = null;

function ingredientStatus(ing) {
  const lower = ing.toLowerCase();
  const inPantry = state.pantry.some(p => {
    const pName = p.name.toLowerCase();
    return lower.includes(pName) || pName.includes(lower);
  });
  if (inPantry) return 'pantry';
  const checkedOff = state.shopList.some(s => s.checked && (lower.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(lower)));
  if (checkedOff) return 'bought';
  return null;
}

function renderIngredientRows(ingredients) {
  const list = document.getElementById('recipeIngredients');
  list.innerHTML = ingredients.map((ing, i) => {
    const status = ingredientStatus(ing);
    const badge = status ? `<span class="ingredient-badge ${status}">${status === 'pantry' ? 'have' : 'bought'}</span>` : '';
    return `
      <div class="ingredient-row">
        <input type="text" value="${ing.replace(/"/g, '&quot;')}" data-ing-idx="${i}" autocorrect="off" autocapitalize="off" spellcheck="false" />
        ${badge}
        <button class="delete-btn" data-remove-ing="${i}">×</button>
      </div>
    `;
  }).join('');
  list.querySelectorAll('[data-remove-ing]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.removeIng);
      const meal = state.mealPlan[editingMealIdx];
      meal.ingredients.splice(idx, 1);
      renderIngredientRows(meal.ingredients);
    });
  });
}

function openRecipeModal(idx) {
  editingMealIdx = idx;
  const meal = state.mealPlan[idx];
  document.getElementById('recipeTitle').textContent = meal.name;
  document.getElementById('recipeMeta').textContent = `${meal.day}${meal.type ? ' · ' + meal.type : ''}${meal.time ? ' · ' + meal.time : ''}`;
  if (!meal.ingredients) meal.ingredients = [];
  renderIngredientRows(meal.ingredients);
  document.getElementById('recipeInstructions').innerHTML = meal.instructions && meal.instructions.length
    ? meal.instructions.map(s => `<li>${s}</li>`).join('')
    : '<li>no instructions — regenerate your meal plan to get them</li>';
  document.getElementById('recipeAppliances').innerHTML = meal.appliances
    ? meal.appliances.map(a => `<span class="meal-tag">${a}</span>`).join('') : '';
  updateFavoriteStar(meal);
  openModal('recipeModal');
}

function updateFavoriteStar(meal) {
  const star = document.getElementById('favoriteStar');
  const fav = isFavorited(meal);
  star.textContent = fav ? '★' : '☆';
  star.style.color = fav ? 'var(--accent)' : '';
}

document.getElementById('favoriteStar').addEventListener('click', () => {
  if (editingMealIdx === null) return;
  const meal = state.mealPlan[editingMealIdx];
  toggleFavorite(meal);
  updateFavoriteStar(meal);
  renderSavedMeals();
});

document.getElementById('addIngredientBtn').addEventListener('click', () => {
  const meal = state.mealPlan[editingMealIdx];
  if (!meal.ingredients) meal.ingredients = [];
  meal.ingredients.push('');
  renderIngredientRows(meal.ingredients);
  // Focus the newly added input
  const inputs = document.querySelectorAll('#recipeIngredients input');
  inputs[inputs.length - 1].focus();
});

document.getElementById('saveRecipeBtn').addEventListener('click', () => {
  const meal = state.mealPlan[editingMealIdx];
  // Read current values from inputs
  const inputs = document.querySelectorAll('#recipeIngredients input');
  meal.ingredients = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
  save();
  renderPlan();
  closeModal('recipeModal');
});

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
              <div class="pantry-item-name" data-edit="${item.id}">${item.name}</div>
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

  list.querySelectorAll('[data-edit]').forEach(el => {
    el.addEventListener('click', () => {
      const item = state.pantry.find(i => i.id === el.dataset.edit);
      if (!item) return;
      document.getElementById('editItemId').value = item.id;
      document.getElementById('editItemName').value = item.name;
      document.getElementById('editItemCategory').value = item.category;
      document.getElementById('editItemQty').value = item.qty || '';
      setToggleVal('editLowStockToggle', item.low ? 'true' : 'false');
      openModal('editPantryModal');
    });
  });
}

document.getElementById('confirmEditItem').addEventListener('click', () => {
  const id = document.getElementById('editItemId').value;
  const item = state.pantry.find(i => i.id === id);
  if (!item) return;
  item.name = document.getElementById('editItemName').value.trim() || item.name;
  item.category = document.getElementById('editItemCategory').value;
  item.qty = document.getElementById('editItemQty').value.trim();
  item.low = getToggleVal('editLowStockToggle') === 'true';
  save(); renderPantry(document.getElementById('pantrySearch').value); closeModal('editPantryModal');
});

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
  ['shopList', 'planGroceriesView'].forEach(id => {
    const list = document.getElementById(id);
    if (!list) return;
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

['whoToggle', 'catToggle', 'lowStockToggle', 'lunchToggle', 'editLowStockToggle'].forEach(initToggle);

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

// Plan tab toggle: meals vs groceries
document.querySelectorAll('#planViewToggle .toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#planViewToggle .toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const showGroceries = btn.dataset.view === 'groceries';
    document.getElementById('mealPlanGrid').style.display = showGroceries ? 'none' : '';
    document.getElementById('planGroceriesView').style.display = showGroceries ? '' : 'none';
    document.getElementById('savedMealsSection').style.display = showGroceries ? 'none' : (state.favorites && state.favorites.length ? '' : 'none');
  });
});

document.getElementById('clearPlanBtn').addEventListener('click', () => {
  if (confirm('Clear this week\'s meal plan?')) {
    state.mealPlan = [];
    state.shopList = [];
    save(); renderPlan(); renderShop();
  }
});

// ─── GENERATE MEAL PLAN ───────────────────────────────────────────────────────
const WEEK_DAYS = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday'];
let daySelections = {};

function initDayPicker() {
  WEEK_DAYS.forEach(d => {
    const saved = (state.settings.mealDays || {})[d] || {};
    daySelections[d] = { dinner: !!saved.dinner, lunch: !!saved.lunch };
  });
  const el = document.getElementById('dayPicker');
  el.innerHTML = `
    <div class="day-picker">
      <div class="dp-corner"></div>
      ${WEEK_DAYS.map(d => `<div class="dp-day">${d.slice(0,3)}</div>`).join('')}
      <div class="dp-label">D</div>
      ${WEEK_DAYS.map(d => `<button class="dp-btn ${daySelections[d].dinner ? 'active' : ''}" data-day="${d}" data-type="dinner"></button>`).join('')}
      <div class="dp-label">L</div>
      ${WEEK_DAYS.map(d => `<button class="dp-btn ${daySelections[d].lunch ? 'active' : ''}" data-day="${d}" data-type="lunch"></button>`).join('')}
    </div>`;
  el.querySelectorAll('.dp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const { day, type } = btn.dataset;
      daySelections[day][type] = !daySelections[day][type];
      btn.classList.toggle('active', daySelections[day][type]);
    });
  });
}

document.getElementById('generatePlanBtn').addEventListener('click', () => {
  document.getElementById('promptSection').style.display = 'none';
  document.getElementById('planPasteArea').value = '';
  initDayPicker();
  openModal('generateModal');
});

document.getElementById('buildPromptBtn').addEventListener('click', () => {
  state.settings.mealDays = JSON.parse(JSON.stringify(daySelections));
  save();

  const pantryNames = state.pantry.map(i => i.name).join(', ');
  const favNames = (state.favorites || []).map(f => f.name).filter(Boolean);
  const dinnerDays = WEEK_DAYS.filter(d => daySelections[d].dinner);
  const lunchDays = WEEK_DAYS.filter(d => daySelections[d].lunch);
  const mealLines = [
    dinnerDays.length ? `Dinners needed: ${dinnerDays.join(', ')}` : '',
    lunchDays.length ? `Lunches needed: ${lunchDays.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `IMPORTANT: Return ONLY a raw JSON array. No markdown, no code blocks, no explanation, no React app. Just the JSON array starting with [ and ending with ].

Generate a weekly meal plan for Nick and Pascale (2 people in San Francisco).
${mealLines || 'No meals specified.'}
Grocery budget remaining this week: ~$${state.settings.groceryBudget} for Trader Joe\'s or Good Life Grocers in Bernal Heights SF.
Current pantry: ${pantryNames || 'mostly empty'}.
Available appliances: air fryer, stove, oven, rice cooker, food processor.
Prefer meals that use pantry items. Mix of cuisines, no dietary restrictions.
Quality matters — use fresh, whole ingredients. No frozen pizza, processed shortcuts, or low-effort meals.
Schedule perishables (fish, seafood, fresh herbs) early in the week (Saturday/Sunday/Monday).
${favNames.length ? `Favorite meals to mix into rotation occasionally (include 1-2 if they fit): ${favNames.map(n => `"${n}"`).join(', ')}.` : ''}
Only include entries for the meals listed above. Do NOT add placeholder entries like "N/A" or "lunch not requested" for days that weren't asked for — just omit them from the array.

Each meal MUST have its own detailed, specific instructions tailored to that exact recipe — not generic steps. Include 5-8 numbered steps with exact temperatures, times, quantities, and techniques. Every step should be actionable and unique to the meal. No placeholder text.

Return ONLY a JSON array, no other text:
[{"day":"Monday","type":"dinner","name":"Pan-seared chicken with lemon and herbs","time":"30 min","ingredients":["2 chicken breasts","1 lemon","2 cloves garlic","fresh thyme","olive oil","salt and pepper"],"instructions":["Pat chicken dry and season generously with salt and pepper on both sides.","Heat 2 tbsp olive oil in a skillet over medium-high heat until shimmering.","Sear chicken 5-6 minutes per side until golden brown and internal temp reaches 165°F.","Remove chicken, lower heat, add minced garlic and thyme to pan, sauté 30 seconds.","Squeeze juice of half a lemon into pan, scrape up brown bits, simmer 1 minute.","Spoon pan sauce over chicken and serve immediately."],"appliances":["stove"]}]`;

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
    let clean = raw.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('[');
    const end = clean.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      clean = clean.slice(start, end + 1);
    }
    const plan = JSON.parse(clean);
    if (Array.isArray(plan)) {
      // Drop placeholder entries Claude sometimes inserts for unrequested meals
      const filtered = plan.filter(m => m && m.name && !/^n\/?a/i.test(m.name) && !/not requested/i.test(m.name));
      state.mealPlan = filtered;
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
