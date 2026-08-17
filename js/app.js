// ─────────────────────────────────────────
//  DATA
// ─────────────────────────────────────────

const storage = window.TrufasMig.storage;
const initialData = storage.loadAppData(DEFAULT_TRUFFLES);

let truffles = initialData.truffles;
let orders   = initialData.orders;
let settings = initialData.settings;
let batches = initialData.batches;
let batchMigrationRequired = initialData.batchMigrationRequired;
let cart     = {}; // { id: qty }
let payMethod = null;
let nextId   = Math.max(...truffles.map(t => t.id), 0) + 1;
let currentDetailOrderId = null;
let orderDetailOrigin    = 'home';
let currentDetailBatchId = null;
let batchDetailOrigin    = 'home';
let pendingLegacyImport  = null;

function saveData() {
  storage.saveSalesData({ truffles, orders, batches });
}

function saveSettings() {
  storage.saveSettings(settings);
}

// ─────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────
let currentScreen = 'home';
let activeModalId = null;
const modalReturnFocus = new Map();
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const POTENTIALLY_FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex], [contenteditable="true"]';

function setInert(element, inactive) {
  if (!element) return;
  element.inert = inactive;
  if (inactive) element.setAttribute('inert', '');
  else element.removeAttribute('inert');
  element.querySelectorAll(POTENTIALLY_FOCUSABLE_SELECTOR).forEach(descendant => {
    if (inactive) {
      if (descendant.hasAttribute('data-inert-tabindex')) return;
      descendant.setAttribute('data-inert-tabindex', descendant.hasAttribute('tabindex') ? descendant.getAttribute('tabindex') : '__none__');
      descendant.setAttribute('tabindex', '-1');
    } else if (descendant.hasAttribute('data-inert-tabindex')) {
      const previous = descendant.getAttribute('data-inert-tabindex');
      descendant.removeAttribute('data-inert-tabindex');
      if (previous === '__none__') descendant.removeAttribute('tabindex');
      else descendant.setAttribute('tabindex', previous);
    }
  });
}

function setContainerInertAttribute(element, inactive) {
  if (!element) return;
  element.inert = inactive;
  if (inactive) element.setAttribute('inert', '');
  else element.removeAttribute('inert');
}

function syncAccessibilityState() {
  document.querySelectorAll('.screen').forEach(screen => {
    const active = !activeModalId && screen.id === `screen-${currentScreen}`;
    screen.setAttribute('aria-hidden', String(!active));
    setInert(screen, !active);
  });
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    const active = modal.id === activeModalId;
    modal.setAttribute('aria-hidden', String(!active));
    setInert(modal, !active);
  });
  const app = document.getElementById('app');
  const appActive = !activeModalId && currentScreen !== 'settings';
  app.setAttribute('aria-hidden', String(!appActive));
  setContainerInertAttribute(app, !appActive);
  syncCartBarAccessibility();
}

function syncCartBarAccessibility() {
  const bar = document.getElementById('cart-bar');
  if (!bar) return;
  const count = Object.values(cart || {}).reduce((sum, qty) => sum + toInt(qty), 0);
  const interactive = !activeModalId && currentScreen === 'order' && count > 0;
  bar.setAttribute('aria-hidden', String(!interactive));
  bar.tabIndex = interactive ? 0 : -1;
  setInert(bar, !interactive);
}

function focusScreen(screenName) {
  if (activeModalId || currentScreen !== screenName) return;
  const screen = document.getElementById(`screen-${screenName}`);
  const heading = screen && screen.querySelector('h1, h2, .header-title');
  const target = heading || (screen && screen.querySelector(FOCUSABLE_SELECTOR));
  if (!target) return;
  if (target === heading && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

function openAccessibleModal(id, initialFocusSelector) {
  const modal = document.getElementById(id);
  if (!modal) return;
  if (activeModalId && activeModalId !== id) closeAccessibleModal(activeModalId, false);
  const returnTarget = document.activeElement;
  if (returnTarget instanceof HTMLElement && returnTarget !== document.body) modalReturnFocus.set(id, returnTarget);
  activeModalId = id;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  setInert(modal, false);
  document.querySelectorAll('.modal-overlay').forEach(other => {
    if (other === modal) return;
    other.setAttribute('aria-hidden', 'true');
    setInert(other, true);
  });
  syncAccessibilityState();
  requestAnimationFrame(() => {
    if (activeModalId !== id) return;
    const preferred = initialFocusSelector ? modal.querySelector(initialFocusSelector) : null;
    const target = preferred || modal.querySelector(FOCUSABLE_SELECTOR) || modal.querySelector('[role="dialog"], [role="alertdialog"]');
    if (target) {
      if (!target.matches(FOCUSABLE_SELECTOR) && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  });
}

function closeAccessibleModal(id, restoreFocus = true) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  setInert(modal, true);
  if (activeModalId === id) activeModalId = null;
  syncAccessibilityState();
  const returnTarget = modalReturnFocus.get(id);
  modalReturnFocus.delete(id);
  if (restoreFocus) requestAnimationFrame(() => {
    if (activeModalId) return;
    if (returnTarget && returnTarget.isConnected && !returnTarget.closest('[inert]')) returnTarget.focus({ preventScroll: true });
    else focusScreen(currentScreen);
  });
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    setInert(modal, true);
  });
  activeModalId = null;
  modalReturnFocus.clear();
}

function closeActiveModalFromKeyboard() {
  if (activeModalId === 'migration-modal') return;
  if (activeModalId === 'modal') closeModal();
  else if (activeModalId === 'pix-modal') closePixModal();
  else if (activeModalId === 'confirm-delete-overlay') closeConfirmDelete();
  else if (activeModalId === 'reserve-confirm-modal') closeReserveConfirmModal();
  else if (activeModalId === 'batch-modal') closeBatchModal();
  else if (activeModalId === 'adjustment-modal') closeAdjustmentModal();
}

document.addEventListener('keydown', event => {
  if (!activeModalId) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeActiveModalFromKeyboard();
    return;
  }
  if (event.key !== 'Tab') return;
  const modal = document.getElementById(activeModalId);
  const focusable = [...modal.querySelectorAll(FOCUSABLE_SELECTOR)]
    .filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'));
  if (!focusable.length) { event.preventDefault(); return; }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

function activateOnKeyboard(event, action) {
  if (event.target !== event.currentTarget || event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
  event.preventDefault();
  action();
}

function navigate(to) {
  const current = document.getElementById('screen-' + currentScreen);
  const target  = document.getElementById('screen-' + to);
  if (!target) return;

  if (current !== target) {
    current.classList.add('slide-out');
    current.classList.remove('active');

    setTimeout(() => {
      current.classList.remove('slide-out');
    }, 380);

    target.classList.add('active');
  }
  currentScreen = to;
  syncAccessibilityState();

  // Esconder cart bar em telas que não são de pedido
  const cartBar = document.getElementById('cart-bar');
  if (to !== 'order') {
    cartBar.classList.add('hidden');
  }

  // Screen init
  if (to === 'home')         renderHome();
  if (to === 'order')        renderMenu();
  if (to === 'summary')      renderSummary();
  if (to === 'admin')        renderAdmin();
  if (to === 'settings')     renderSettings();
  if (to === 'orders')       renderOrders();
  if (to === 'order-detail') renderOrderDetail();
  if (to === 'batch-detail') renderBatchDetail();
  requestAnimationFrame(() => focusScreen(to));
}

// ─────────────────────────────────────────
//  HOME
// ─────────────────────────────────────────


// ─────────────────────────────────────────
//  ORDER DETAIL
// ─────────────────────────────────────────
function openOrderDetail(id, origin) {
  currentDetailOrderId = id;
  orderDetailOrigin    = origin || 'home';
  navigate('order-detail');
}

function navigateBackFromDetail() {
  navigate(orderDetailOrigin);
}

function deleteDetailOrder() {
  if (currentDetailOrderId) deleteOrder(currentDetailOrderId);
}


let pendingDeleteId = null;



function closeConfirmDelete(e) {
  if (e && e.target !== document.getElementById('confirm-delete-overlay')) return;
  closeAccessibleModal('confirm-delete-overlay');
  pendingDeleteId = null;
}

// ─────────────────────────────────────────
//  MENU / ORDER
// ─────────────────────────────────────────

function setQty(id, delta) {
  const t = truffles.find(x => x.id === id);
  if (!t) return;
  const cur = cart[id] || 0;
  const next = Math.max(0, Math.min(t.stock, cur + delta));
  if (next === 0) delete cart[id];
  else cart[id] = next;

  // Atualiza só o card afetado, sem re-renderizar tudo
  const card = document.getElementById('mc-' + id);
  if (card) {
    card.classList.toggle('in-cart', next > 0);
    card.querySelector('.qty-val').textContent = next;
    card.querySelector('.qty-btn.minus').disabled = next === 0;
    card.querySelector('.qty-btn.plus').disabled  = next >= t.stock;
  }
  updateCartBar();
}

function updateCartBar() {
  const bar = document.getElementById('cart-bar');
  const total = cartTotal();
  const count = Object.values(cart).reduce((a,b) => a+b, 0);
  document.getElementById('cart-count').textContent = count;
  document.getElementById('cart-price').textContent = fmt(total);
  if (count > 0) bar.classList.remove('hidden');
  else bar.classList.add('hidden');
  syncCartBarAccessibility();
}

function cartTotal() {
  return Object.entries(cart).reduce((sum, [id, qty]) => {
    const t = truffles.find(x => x.id == id);
    return sum + (t ? t.price * qty : 0);
  }, 0);
}

// ─────────────────────────────────────────
//  SUMMARY
// ─────────────────────────────────────────

function selectPayment(method) {
  payMethod = method;
  document.querySelectorAll('#screen-summary .pay-card').forEach(card => {
    card.classList.remove('selected');
    card.setAttribute('aria-checked', 'false');
  });
  document.getElementById('pix-body').style.display = 'none';
  document.getElementById('cash-body').style.display = 'none';

  document.getElementById('pay-' + method).classList.add('selected');
  document.getElementById('pay-' + method).setAttribute('aria-checked', 'true');

  if (method === 'pix') {
    document.getElementById('pix-body').style.display = 'block';
    // aguarda o navegador renderizar o elemento antes de desenhar no canvas
    requestAnimationFrame(() => setTimeout(drawQR, 50));
  } else {
    document.getElementById('cash-body').style.display = 'block';
  }

  updateConfirmBtn();
}

function updateConfirmBtn() {
  const btn = document.getElementById('confirm-btn');
  if (!payMethod) { btn.disabled = true; return; }
  if (payMethod === 'pix') { btn.disabled = false; return; }
  // cash
  const given = parseFloat(document.getElementById('cash-input').value) || 0;
  btn.disabled = given < cartTotal();
}

function calcChange() {
  const total = cartTotal();
  const given = parseFloat(document.getElementById('cash-input').value) || 0;
  const change = given - total;
  const box = document.getElementById('change-box');
  const val = document.getElementById('change-val');

  if (given <= 0) { box.style.display = 'none'; }
  else {
    box.style.display = 'flex';
    val.textContent = fmt(Math.abs(change));
    val.className = 'change-value ' + (change >= 0 ? 'ok' : 'short');
    val.textContent = change >= 0 ? fmt(change) : `Falta ${fmt(Math.abs(change))}`;
  }
  updateConfirmBtn();
}

function copyPix(e) {
  e.stopPropagation();
  if (!settings.pixKey) { showToast('Chave PIX não configurada'); return; }
  navigator.clipboard.writeText(settings.pixKey).catch(() => {});
  showToast('Chave PIX copiada!');
}

// ─────────────────────────────────────────
//  PIX PAYLOAD (padrão EMV/BCB)
// ─────────────────────────────────────────
function tlv(id, value) {
  return `${id}${value.length.toString().padStart(2, '0')}${value}`;
}

function crc16Pix(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function generatePixPayload(key, name, city) {
  if (!key) return null;
  const safeName = (name || 'TRUFAS').replace(/[^\w ]/g, '').substring(0, 25).toUpperCase() || 'TRUFAS';
  const safeCity = (city || 'BRASIL').replace(/[^\w ]/g, '').substring(0, 15).toUpperCase() || 'BRASIL';
  const merchant = tlv('26', tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', key));
  const additional = tlv('62', tlv('05', '***'));
  const body = tlv('00','01') + merchant + tlv('52','0000') + tlv('53','986') + tlv('58','BR') + tlv('59', safeName) + tlv('60', safeCity) + additional + '6304';
  return body + crc16Pix(body);
}

// ─────────────────────────────────────────
//  QR CODE
// ─────────────────────────────────────────
function drawQR() {
  const container = document.getElementById('qr-canvas');
  const warning   = document.getElementById('pix-not-configured');
  const wrap      = document.getElementById('qr-wrap');
  const keyLabel  = document.getElementById('pix-key-label');

  keyLabel.textContent = settings.pixKey || '—';

  if (!settings.pixKey) {
    warning.style.display = 'flex';
    wrap.style.display = 'none';
    return;
  }

  warning.style.display = 'none';
  wrap.style.display = 'block';

  const payload = generatePixPayload(settings.pixKey, settings.pixName, settings.pixCity);

  if (typeof QRCode === 'undefined') {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = () => renderQROnCanvas(container, payload);
    s.onerror = () => showToast('Sem conexão para carregar QR Code');
    document.head.appendChild(s);
    return;
  }

  renderQROnCanvas(container, payload);
}

function renderQROnCanvas(container, payload) {
  container.innerHTML = ''; // limpa QR anterior
  new QRCode(container, {
    text: payload,
    width: 180,
    height: 180,
    colorDark: '#1A1208',
    colorLight: '#FFFFFF',
    correctLevel: QRCode.CorrectLevel.M
  });
}

// ─────────────────────────────────────────
//  CONFIRM ORDER
// ─────────────────────────────────────────

function newOrder() {
  cart = {};
  navigate('home');
}


// ─────────────────────────────────────────
//  ADMIN
// ─────────────────────────────────────────


// ─────────────────────────────────────────
//  MODAL
// ─────────────────────────────────────────

function closeModal() {
  closeAccessibleModal('modal');
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modal')) closeModal();
}


// ─────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────
// Formatação de dinheiro fica em js/utils.js.

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ─────────────────────────────────────────
//  SETTINGS SCREEN
// ─────────────────────────────────────────
function renderSettings() {
  const keyEl  = document.getElementById('pix-key-display');
  const nameEl = document.getElementById('pix-name-display');
  const cityEl = document.getElementById('pix-city-display');

  keyEl.textContent  = settings.pixKey  || 'Não configurada';
  nameEl.textContent = settings.pixName || 'Não configurado';
  cityEl.textContent = settings.pixCity || 'Não configurada';

  keyEl.className  = 'value' + (settings.pixKey  ? '' : ' empty');
  nameEl.className = 'value' + (settings.pixName ? '' : ' empty');
  cityEl.className = 'value' + (settings.pixCity ? '' : ' empty');
}

function openPixModal() {
  document.getElementById('s-pix-key').value  = settings.pixKey  || '';
  document.getElementById('s-pix-name').value = settings.pixName || '';
  document.getElementById('s-pix-city').value = settings.pixCity || '';
  openAccessibleModal('pix-modal', '#s-pix-key');
}

function closePixModal(e) {
  if (e && e.target !== document.getElementById('pix-modal')) return;
  closeAccessibleModal('pix-modal');
}

function savePixSettings() {
  settings.pixKey  = document.getElementById('s-pix-key').value.trim();
  settings.pixName = document.getElementById('s-pix-name').value.trim();
  settings.pixCity = document.getElementById('s-pix-city').value.trim();
  saveSettings();
  closePixModal();
  renderSettings();
  showToast('Configurações salvas!');
}

// ─────────────────────────────────────────
//  BACKUP — EXPORT / IMPORT
// ─────────────────────────────────────────


// ─────────────────────────────────────────
//  TELA TODOS OS PEDIDOS
// ─────────────────────────────────────────
let ordersFilter = 'all';





// ─────────────────────────────────────────
//  CONFIRMAR PAGAMENTO DE RESERVA (modal)
// ─────────────────────────────────────────
let rpPayMethod = null;

function openReserveConfirmModal() {
  rpPayMethod = null;
  document.querySelectorAll('#reserve-confirm-modal .pay-card').forEach(card => {
    card.classList.remove('selected');
    card.setAttribute('aria-checked', 'false');
  });
  document.getElementById('rp-pix-body').style.display  = 'none';
  document.getElementById('rp-cash-body').style.display = 'none';
  document.getElementById('rp-cash-input').value        = '';
  document.getElementById('rp-change-box').style.display = 'none';
  document.getElementById('rp-confirm-btn').disabled    = true;
  openAccessibleModal('reserve-confirm-modal', '#rp-pay-pix');
}

function closeReserveConfirmModal(e) {
  if (e && e.target !== document.getElementById('reserve-confirm-modal')) return;
  closeAccessibleModal('reserve-confirm-modal');
}

function selectRPPayment(method) {
  rpPayMethod = method;
  document.querySelectorAll('#reserve-confirm-modal .pay-card').forEach(card => {
    card.classList.remove('selected');
    card.setAttribute('aria-checked', 'false');
  });
  document.getElementById('rp-pix-body').style.display  = 'none';
  document.getElementById('rp-cash-body').style.display = 'none';
  document.getElementById('rp-pay-' + method).classList.add('selected');
  document.getElementById('rp-pay-' + method).setAttribute('aria-checked', 'true');

  if (method === 'pix') {
    document.getElementById('rp-pix-body').style.display = 'block';
    const keyLabel  = document.getElementById('rp-pix-key-label');
    const wrap      = document.getElementById('rp-qr-wrap');
    const warning   = document.getElementById('rp-pix-warning');
    keyLabel.textContent = settings.pixKey || '—';

    if (!settings.pixKey) {
      warning.style.display = 'flex';
      wrap.style.display    = 'none';
    } else {
      warning.style.display = 'none';
      wrap.style.display    = 'block';
      const payload = generatePixPayload(settings.pixKey, settings.pixName, settings.pixCity);
      requestAnimationFrame(() => setTimeout(() => {
        const container = document.getElementById('rp-qr-canvas');
        container.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
          new QRCode(container, { text: payload, width: 180, height: 180,
            colorDark: '#1A1208', colorLight: '#FFFFFF', correctLevel: QRCode.CorrectLevel.M });
        }
      }, 50));
    }
    document.getElementById('rp-confirm-btn').disabled = false;
  } else {
    document.getElementById('rp-cash-body').style.display = 'block';
    updateRPConfirmBtn();
  }
}

function calcRPChange() {
  const order = orders.find(o => o.id === currentDetailOrderId);
  if (!order) return;
  const given  = parseFloat(document.getElementById('rp-cash-input').value) || 0;
  const change = given - order.total;
  const box    = document.getElementById('rp-change-box');
  const val    = document.getElementById('rp-change-val');

  if (given <= 0) { box.style.display = 'none'; }
  else {
    box.style.display = 'flex';
    val.className     = 'change-value ' + (change >= 0 ? 'ok' : 'short');
    val.textContent   = change >= 0 ? fmt(change) : `Falta ${fmt(Math.abs(change))}`;
  }
  updateRPConfirmBtn();
}

function updateRPConfirmBtn() {
  const btn   = document.getElementById('rp-confirm-btn');
  const order = orders.find(o => o.id === currentDetailOrderId);
  if (!rpPayMethod || !order) { btn.disabled = true; return; }
  if (rpPayMethod === 'pix')  { btn.disabled = false; return; }
  const given = parseFloat(document.getElementById('rp-cash-input').value) || 0;
  btn.disabled = given < order.total;
}


// ── CADASTRO DE REMESSA E AJUSTES RASTREÁVEIS ──
function openBatchModal() {
  if (batchMigrationRequired) { openMigrationModal(); return; }
  document.getElementById('batch-qty').value = 50;
  document.getElementById('batch-cost').value = 51;
  const activeProducts = truffles.filter(product => !product.archived);
  document.getElementById('batch-distribution-list').innerHTML = activeProducts.map(product => `<label class="distribution-row">
    <span class="distribution-name">${esc(product.name)}</span>
    <input class="distribution-input batch-dist" data-product-id="${Number(product.id)}" type="number" min="0" step="1" value="0" inputmode="numeric" oninput="updateBatchDistributionTotal()">
  </label>`).join('');
  showFormError('batch-form-error', activeProducts.length ? '' : 'Cadastre ao menos um sabor no cardápio primeiro.');
  updateBatchDistributionTotal();
  openAccessibleModal('batch-modal', '#batch-qty');
}

function closeBatchModal(event) {
  if (event && event.target !== document.getElementById('batch-modal')) return;
  closeAccessibleModal('batch-modal');
}

function updateBatchDistributionTotal() {
  const expected = toInt(document.getElementById('batch-qty').value);
  const total = [...document.querySelectorAll('.batch-dist')].reduce((sum, input) => sum + toInt(input.value), 0);
  const output = document.getElementById('batch-distribution-total');
  output.textContent = `${total} de ${expected}`;
  output.className = total === expected && expected > 0 ? 'ok' : 'bad';
}

function saveBatch() {
  const qty = toInt(document.getElementById('batch-qty').value);
  const costRaw = Number(document.getElementById('batch-cost').value);
  const inputs = [...document.querySelectorAll('.batch-dist')];
  const total = inputs.reduce((sum, input) => sum + toInt(input.value), 0);
  if (!qty || !Number.isFinite(costRaw) || costRaw < 0) { showFormError('batch-form-error', 'Informe uma quantidade e um custo válidos.'); return; }
  if (total !== qty) { showFormError('batch-form-error', 'A distribuição precisa somar exatamente a quantidade da remessa.'); return; }
  const distribution = {};
  inputs.forEach(input => {
    const amount = toInt(input.value);
    if (amount) distribution[String(input.dataset.productId)] = amount;
  });
  const number = batches.reduce((max, batch) => Math.max(max, toInt(batch.number)), 0) + 1;
  batches.push({
    id: uniqueBatchId(), number, createdAt: new Date().toISOString(), cost: toMoney(costRaw),
    purchasedQty: qty, distribution, adjustments: []
  });
  recomputeStockFromBatches();
  saveData();
  closeBatchModal();
  if (currentScreen === 'admin') renderAdmin(); else renderHome();
  showToast(`Remessa ${number} cadastrada`);
}

function openAdjustmentModal(preselectedBatchId) {
  if (batchMigrationRequired) { openMigrationModal(); return; }
  if (!batches.length) { showToast('Cadastre uma remessa primeiro'); return; }
  const batchSelect = document.getElementById('adjust-batch');
  batchSelect.innerHTML = sortedBatches().map(batch => `<option value="${batch.id}">${batchLabel(batch)} · ${batchRemaining(batch)} disponíveis</option>`).join('');
  const preferred = preselectedBatchId || (currentBatch() && currentBatch().id);
  if (preferred && batches.some(batch => batch.id === preferred)) batchSelect.value = preferred;
  document.getElementById('adjust-type').value = 'reduce';
  document.getElementById('adjust-qty').value = '';
  document.getElementById('adjust-reason').value = '';
  showFormError('adjust-form-error', '');
  updateAdjustmentOptions();
  openAccessibleModal('adjustment-modal', '#adjust-batch');
}

function closeAdjustmentModal(event) {
  if (event && event.target !== document.getElementById('adjustment-modal')) return;
  closeAccessibleModal('adjustment-modal');
}

function updateAdjustmentOptions() {
  const batch = batches.find(item => item.id === document.getElementById('adjust-batch').value);
  const productSelect = document.getElementById('adjust-product');
  if (!batch) { productSelect.innerHTML = ''; updateAdjustmentHint(); return; }
  const products = truffles.filter(product => Object.prototype.hasOwnProperty.call(batch.distribution || {}, String(product.id)));
  productSelect.innerHTML = products.map(product => `<option value="${Number(product.id)}">${esc(product.name)}</option>`).join('');
  updateAdjustmentHint();
}

function reversibleAdjustmentQty(batch, productId) {
  return Math.max(0, -(Array.isArray(batch.adjustments) ? batch.adjustments : [])
    .filter(adjustment => adjustment.reversible !== false && String(adjustment.productId) === String(productId))
    .reduce((sum, adjustment) => sum + Number(adjustment.delta || 0), 0));
}

function updateAdjustmentHint() {
  const batch = batches.find(item => item.id === document.getElementById('adjust-batch').value);
  const productId = document.getElementById('adjust-product').value;
  const type = document.getElementById('adjust-type').value;
  const hint = document.getElementById('adjust-hint');
  if (!batch || !productId) { hint.textContent = 'Nenhum sabor disponível nesta remessa.'; return; }
  const limit = type === 'reduce' ? batchAvailable(batch, productId) : reversibleAdjustmentQty(batch, productId);
  hint.textContent = type === 'reduce' ? `Até ${limit} unidades disponíveis podem ser reduzidas.` : `Até ${limit} unidades de reduções anteriores podem ser restauradas.`;
  document.getElementById('adjust-qty').max = limit;
}

function saveAdjustment() {
  const batch = batches.find(item => item.id === document.getElementById('adjust-batch').value);
  const productId = Number(document.getElementById('adjust-product').value);
  const type = document.getElementById('adjust-type').value;
  const qty = toInt(document.getElementById('adjust-qty').value);
  const reason = document.getElementById('adjust-reason').value.trim();
  if (!batch || !productId || !qty || !reason) { showFormError('adjust-form-error', 'Selecione a remessa e o sabor, informe quantidade e motivo.'); return; }
  const limit = type === 'reduce' ? batchAvailable(batch, productId) : reversibleAdjustmentQty(batch, productId);
  if (qty > limit) { showFormError('adjust-form-error', `A quantidade máxima para este ajuste é ${limit}.`); return; }
  batch.adjustments = Array.isArray(batch.adjustments) ? batch.adjustments : [];
  batch.adjustments.push({
    id: `a${Date.now()}${batch.adjustments.length}`,
    productId,
    delta: type === 'reduce' ? -qty : qty,
    reason,
    kind: type === 'reduce' ? 'reduction' : 'restoration',
    reversible: true,
    createdAt: new Date().toISOString()
  });
  recomputeStockFromBatches();
  saveData();
  closeAdjustmentModal();
  if (currentScreen === 'batch-detail') renderBatchDetail();
  else if (currentScreen === 'admin') renderAdmin();
  else renderHome();
  showToast('Ajuste registrado');
}

// ── CARDÁPIO: estoque somente por remessa ──
function renderAdmin() {
  const list = document.getElementById('admin-list');
  const activeProducts = truffles.filter(product => !product.archived);
  list.innerHTML = activeProducts.length ? activeProducts.map(product => `<div class="admin-item">
    <div class="admin-item-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9B6A3A" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/></svg></div>
    <div class="admin-item-info"><div class="admin-item-name">${esc(product.name)}</div><div class="admin-item-meta">${fmt(Number(product.price))} · Estoque: <span>${toInt(product.stock)}</span></div></div>
    <div class="admin-actions"><button class="btn-sm-icon btn-edit" onclick="openModal(${Number(product.id)})" aria-label="Editar ${esc(product.name)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z"/></svg></button>
    <button class="btn-sm-icon btn-delete" onclick="deleteTruffle(${Number(product.id)})" aria-label="Excluir ${esc(product.name)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button></div>
  </div>`).join('') : '<div class="empty-state"><p>Nenhum sabor cadastrado</p></div>';
}

function deleteTruffle(id) {
  const product = truffles.find(item => Number(item.id) === Number(id));
  if (!product) return;
  const hasPotentialStock = batches.some(batch =>
    batchAvailable(batch, id) > 0 || reversibleAdjustmentQty(batch, id) > 0
  );
  if (toInt(product.stock) > 0 || hasPotentialStock) {
    showToast('Este sabor ainda pode devolver unidades ao estoque');
    return;
  }
  product.archived = true;
  saveData();
  renderAdmin();
  showToast('Sabor arquivado; pedidos antigos continuam preservados');
}

function openModal(id) {
  const product = id ? truffles.find(item => Number(item.id) === Number(id)) : null;
  document.getElementById('modal-title').textContent = product ? 'Editar trufa' : 'Adicionar trufa';
  document.getElementById('edit-id').value = product ? product.id : '';
  document.getElementById('f-name').value = product ? product.name : '';
  document.getElementById('f-desc').value = product ? product.description : '';
  document.getElementById('f-price').value = product ? product.price : 2;
  openAccessibleModal('modal', '#f-name');
}

function saveTruffle() {
  const id = Number(document.getElementById('edit-id').value) || null;
  const name = document.getElementById('f-name').value.trim();
  const description = document.getElementById('f-desc').value.trim();
  const price = Number(document.getElementById('f-price').value);
  if (!name || !Number.isFinite(price) || price < 0) { showToast('Preencha nome e preço corretamente'); return; }
  if (id) {
    const product = truffles.find(item => Number(item.id) === id);
    if (!product) return;
    product.name = name; product.description = description; product.price = toMoney(price);
  } else {
    truffles.push({ id: nextId++, name, description, price: toMoney(price), stock: 0 });
  }
  saveData();
  closeModal();
  renderAdmin();
  showToast(id ? 'Trufa atualizada' : 'Trufa adicionada com estoque zero');
}

// ── HISTÓRICO E FILTROS POR REMESSA ──
let ordersBatchFilter = 'current';

function resolvedOrdersBatchId() {
  if (ordersBatchFilter === 'all') return null;
  if (ordersBatchFilter === 'current') return currentBatch() ? currentBatch().id : '__none__';
  return ordersBatchFilter;
}

function renderOrders() {
  if (!['all', 'confirmed', 'reserved', 'pix', 'cash'].includes(ordersFilter)) ordersFilter = 'all';
  if (!['all', 'current'].includes(ordersBatchFilter) && !batches.some(batch => batch.id === ordersBatchFilter)) {
    ordersBatchFilter = 'current';
  }
  document.querySelectorAll('#screen-orders .filter-pill').forEach(pill => pill.classList.remove('active'));
  const activeFilter = document.getElementById(`filter-${ordersFilter}`);
  if (activeFilter) activeFilter.classList.add('active');
  const current = currentBatch();
  const select = document.getElementById('orders-batch-filter');
  select.innerHTML = `<option value="current">Remessa atual${current ? ` · ${batchLabel(current)}` : ''}</option>${sortedBatches().reverse().map(batch => `<option value="${batch.id}">${batchLabel(batch)} · ${formatBatchDate(batch.createdAt)}</option>`).join('')}<option value="all">Todas as remessas</option>`;
  select.value = ordersBatchFilter;
  updateOrdersBatchDetailButton();
  renderOrdersStats();
  renderOrdersList();
}

function setOrdersBatchFilter(value) {
  ordersBatchFilter = value;
  updateOrdersBatchDetailButton();
  renderOrdersStats();
  renderOrdersList();
}

function updateOrdersBatchDetailButton() {
  const button = document.getElementById('orders-batch-detail-btn');
  if (!button) return;
  const batchId = resolvedOrdersBatchId();
  const enabled = batchId && batchId !== '__none__' && batches.some(batch => batch.id === batchId);
  button.disabled = !enabled;
  button.setAttribute('aria-disabled', String(!enabled));
}

function openFilteredBatchDetail() {
  const batchId = resolvedOrdersBatchId();
  if (!batchId || batchId === '__none__') return;
  openBatchDetail(batchId, 'orders');
}

function ordersInBatchScope() {
  const batchId = resolvedOrdersBatchId();
  return batchId === null ? [...orders] : orders.filter(order => orderAllocations(order).some(allocation => allocation.batchId === batchId));
}

function renderOrdersStats() {
  const scoped = ordersInBatchScope();
  const batchId = resolvedOrdersBatchId();
  const revenue = scoped.filter(order => order.status !== 'reserved').reduce((sum, order) => sum + orderPortion(order, batchId === '__none__' ? null : batchId).total, 0);
  const reserved = scoped.filter(order => order.status === 'reserved').length;
  document.getElementById('orders-stats').innerHTML = `<div class="stat-card"><span class="stat-value">${scoped.length}</span><span class="stat-label">Pedidos</span></div>
    <div class="stat-card"><span class="stat-value">${fmt(revenue)}</span><span class="stat-label">Arrecadado</span></div>
    <div class="stat-card"><span class="stat-value">${reserved}</span><span class="stat-label">Reservados</span></div>`;
}

function setOrdersFilter(filter) {
  ordersFilter = filter;
  document.querySelectorAll('#screen-orders .filter-pill').forEach(pill => pill.classList.remove('active'));
  const button = document.getElementById(`filter-${filter}`);
  if (button) button.classList.add('active');
  renderOrdersList();
}

function renderOrdersList() {
  const list = document.getElementById('all-orders-list');
  let filtered = ordersInBatchScope().reverse();
  if (ordersFilter === 'confirmed') filtered = filtered.filter(order => order.status !== 'reserved');
  else if (ordersFilter === 'reserved') filtered = filtered.filter(order => order.status === 'reserved');
  else if (ordersFilter === 'pix') filtered = filtered.filter(order => order.payMethod === 'pix');
  else if (ordersFilter === 'cash') filtered = filtered.filter(order => order.payMethod === 'cash');
  const batchId = resolvedOrdersBatchId();
  list.innerHTML = filtered.length ? filtered.map(order => renderOrderChip(order, batchId === '__none__' ? null : batchId, 'orders')).join('') : '<div class="empty-state"><p>Nenhum pedido encontrado</p></div>';
}

// ── BACKUP V2 E IMPORTAÇÃO RETROCOMPATÍVEL ──
function exportBackup() {
  const data = { version: 2, exportedAt: new Date().toISOString(), truffles, orders, settings, batches };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `trufas-mig-backup-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  showToast('Backup v2 exportado');
}

// Validação de backup fica em js/backup.js.

function commitImportedState(candidate) {
  const previous = { truffles, orders, settings, batches, batchMigrationRequired, nextId };
  const stored = storage.snapshot(Object.values(storage.KEYS));
  try {
    truffles = JSON.parse(JSON.stringify(candidate.truffles));
    orders = JSON.parse(JSON.stringify(candidate.orders));
    settings = JSON.parse(JSON.stringify(candidate.settings));
    batches = JSON.parse(JSON.stringify(candidate.batches));
    batchMigrationRequired = false;
    nextId = Math.max(...truffles.map(product => Number(product.id)), 0) + 1;
    normalizeReversibleBatchHistory(truffles, orders, batches);
    recomputeStockFromBatches();
    reactivateArchivedStockProducts();
    saveData();
    saveSettings();
  } catch (error) {
    ({ truffles, orders, settings, batches, batchMigrationRequired, nextId } = previous);
    storage.restore(stored);
    throw error;
  }
}

function resetTransientStateAfterImport() {
  cart = {};
  payMethod = null;
  rpPayMethod = null;
  currentDetailOrderId = null;
  orderDetailOrigin = 'home';
  currentDetailBatchId = null;
  batchDetailOrigin = 'home';
  pendingDeleteId = null;
  pendingLegacyImport = null;
  ordersFilter = 'all';
  ordersBatchFilter = 'current';
  closeAllModals();

  ['customer-name', 'order-obs', 'cash-input', 'rp-cash-input', 'edit-id', 'f-name', 'f-desc',
    's-pix-key', 's-pix-name', 's-pix-city', 'adjust-qty', 'adjust-reason'].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.value = '';
  });
  document.getElementById('f-price').value = 2;
  document.getElementById('batch-qty').value = 50;
  document.getElementById('batch-cost').value = 51;
  document.getElementById('migration-qty').value = 50;
  document.getElementById('migration-cost').value = 51;
  ['batch-distribution-list', 'migration-distribution-list', 'adjust-batch', 'adjust-product',
    'qr-canvas', 'rp-qr-canvas', 'order-detail-content', 'batch-detail-content', 'success-summary'].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.innerHTML = '';
  });
  ['batch-form-error', 'adjust-form-error', 'migration-form-error'].forEach(id => showFormError(id, ''));
  ['change-box', 'rp-change-box', 'pix-body', 'cash-body', 'rp-pix-body', 'rp-cash-body'].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.style.display = 'none';
  });
  document.querySelectorAll('.pay-card').forEach(card => {
    card.classList.remove('selected');
    card.setAttribute('aria-checked', 'false');
  });
  document.getElementById('confirm-btn').disabled = true;
  document.getElementById('rp-confirm-btn').disabled = true;
  document.querySelectorAll('input[type="file"]').forEach(input => { input.value = ''; });

  document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active', 'slide-out'));
  document.getElementById('screen-home').classList.add('active');
  currentScreen = 'home';
  syncAccessibilityState();
  updateCartBar();
  renderHome();
  requestAnimationFrame(() => focusScreen('home'));
}

function importBackup(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = event => {
    try {
      const candidate = validateBackupData(JSON.parse(event.target.result));
      if (candidate.version === 2) {
        commitImportedState(candidate);
        resetTransientStateAfterImport();
        showToast('Backup v2 importado com remessas');
      } else {
        pendingLegacyImport = candidate;
        openMigrationModal();
        showToast('Backup antigo validado; confira a Remessa 1');
      }
    } catch {
      showToast('Arquivo inválido ou corrompido');
    }
    input.value = '';
  };
  reader.readAsText(file);
}

function copyPixRP(e) {
  e.stopPropagation();
  if (!settings.pixKey) { showToast('Chave PIX não configurada'); return; }
  navigator.clipboard.writeText(settings.pixKey).catch(() => {});
  showToast('Chave PIX copiada!');
}

// Regras de remessas, estoque e alocação ficam em js/domain.js.

function migrationProducts(sourceTruffles, sourceOrders) {
  const map = new Map();
  sourceTruffles.forEach(product => map.set(String(product.id), { id: product.id, name: product.name, stock: toInt(product.stock), allocated: 0, catalogProduct: true }));
  sourceOrders.forEach(order => (Array.isArray(order.items) ? order.items : []).forEach(item => {
    const key = String(item.id);
    if (!map.has(key)) map.set(key, { id: item.id, name: item.name || 'Produto antigo', stock: 0, allocated: 0, catalogProduct: false });
    map.get(key).allocated += toInt(item.qty);
  }));
  return [...map.values()];
}

function openMigrationModal() {
  const sourceTruffles = pendingLegacyImport ? pendingLegacyImport.truffles : truffles;
  const sourceOrders = pendingLegacyImport ? pendingLegacyImport.orders : orders;
  const confirmed = sourceOrders.filter(order => order.status !== 'reserved')
    .reduce((sum, order) => sum + (order.items || []).reduce((n, item) => n + toInt(item.qty), 0), 0);
  const reserved = sourceOrders.filter(order => order.status === 'reserved')
    .reduce((sum, order) => sum + (order.items || []).reduce((n, item) => n + toInt(item.qty), 0), 0);
  const stock = sourceTruffles.reduce((sum, product) => sum + toInt(product.stock), 0);
  document.getElementById('migration-stats').innerHTML = `
    <div class="migration-stat"><strong>${confirmed}</strong><span>vendidas</span></div>
    <div class="migration-stat"><strong>${reserved}</strong><span>reservadas</span></div>
    <div class="migration-stat"><strong>${stock}</strong><span>em estoque</span></div>`;

  const products = migrationProducts(sourceTruffles, sourceOrders);
  document.getElementById('migration-distribution-list').innerHTML = products.map(product => {
    const minimum = product.allocated + product.stock;
    return `<label class="distribution-row">
      <span class="distribution-name">${esc(product.name)}<span class="distribution-meta">mínimo para preservar os dados: ${minimum}</span></span>
      <input class="distribution-input migration-dist" data-product-id="${esc(product.id)}" data-product-name="${esc(product.name)}" data-catalog-product="${product.catalogProduct}" data-minimum="${minimum}" type="number" min="${minimum}" step="1" value="${minimum}" inputmode="numeric" oninput="updateMigrationTotal()">
    </label>`;
  }).join('');
  document.getElementById('migration-qty').value = 50;
  document.getElementById('migration-cost').value = 51;
  showFormError('migration-form-error', '');
  updateMigrationTotal();
  openAccessibleModal('migration-modal', '#migration-qty');
}

function updateMigrationTotal() {
  const expected = toInt(document.getElementById('migration-qty').value);
  const total = [...document.querySelectorAll('.migration-dist')].reduce((sum, input) => sum + toInt(input.value), 0);
  const output = document.getElementById('migration-distribution-total');
  output.textContent = `${total} de ${expected}`;
  output.className = total === expected && expected > 0 ? 'ok' : 'bad';
}

function completeMigration() {
  const qtyRaw = Number(document.getElementById('migration-qty').value);
  const costRaw = Number(document.getElementById('migration-cost').value);
  const qty = isPositiveInteger(qtyRaw) ? qtyRaw : 0;
  const cost = isNonNegativeMoney(costRaw) ? toMoney(costRaw) : -1;
  const inputs = [...document.querySelectorAll('.migration-dist')];
  const invalidNumber = inputs.find(input => !isNonNegativeInteger(input.value));
  const total = invalidNumber ? -1 : inputs.reduce((sum, input) => sum + Number(input.value), 0);
  const invalid = inputs.find(input => Number(input.value) < Number(input.dataset.minimum));
  if (!qty || cost < 0 || total !== qty) {
    showFormError('migration-form-error', 'A distribuição por sabor precisa somar exatamente a quantidade comprada.');
    return;
  }
  if (invalid) {
    showFormError('migration-form-error', 'Uma distribuição ficou abaixo do mínimo necessário para preservar seu histórico e estoque.');
    return;
  }

  const completingImportedBackup = Boolean(pendingLegacyImport);
  const source = pendingLegacyImport || { truffles, orders, settings };
  const migratedTruffles = JSON.parse(JSON.stringify(source.truffles));
  const migratedOrders = JSON.parse(JSON.stringify(source.orders));
  const migratedSettings = JSON.parse(JSON.stringify(source.settings));
  const migratedProductIds = new Set(migratedTruffles.map(product => String(product.id)));
  migratedOrders.forEach(order => {
    (Array.isArray(order.items) ? order.items : []).forEach(item => {
      const productId = String(item.id);
      if (migratedProductIds.has(productId)) return;
      migratedTruffles.push({
        id: item.id,
        name: item.name || 'Produto antigo',
        description: 'Produto arquivado preservado pelo histórico de pedidos',
        price: Number(item.price || 0),
        stock: 0,
        archived: true
      });
      migratedProductIds.add(productId);
    });
  });
  const batchId = uniqueBatchId();
  const distribution = {};
  inputs.forEach(input => {
    const productId = String(input.dataset.productId);
    const amount = toInt(input.value);
    distribution[productId] = amount;
  });

  migratedOrders.forEach(order => {
    order.allocations = (Array.isArray(order.items) ? order.items : []).map(item => ({
      batchId,
      productId: item.id,
      productName: item.name || 'Produto antigo',
      qty: toInt(item.qty),
      unitPrice: Number(item.price || 0),
      reversible: true
    }));
  });
  const migratedBatches = [{ id: batchId, number: 1, createdAt: new Date().toISOString(), cost, purchasedQty: qty, distribution, adjustments: [] }];
  migratedTruffles.forEach(product => { if (!product.archived) product.price = 2; });
  try {
    const candidate = validateBackupData({
      version: 2,
      truffles: migratedTruffles,
      orders: migratedOrders,
      settings: migratedSettings,
      batches: migratedBatches
    });
    commitImportedState(candidate);
  } catch {
    showFormError('migration-form-error', 'Não foi possível validar e salvar a migração. Seus dados anteriores foram mantidos.');
    return;
  }
  resetTransientStateAfterImport();
  showToast(completingImportedBackup ? 'Backup antigo importado e organizado na Remessa 1' : 'Remessa 1 organizada sem apagar seus dados');
}

function renderBatchCard(batch) {
  const metrics = batchMetrics(batch);
  const remaining = metrics.available;
  const state = remaining === 0 && metrics.reserved === 0 ? ' empty' : remaining <= 5 ? ' low' : '';
  const recovery = metrics.cost > 0 ? Math.min(100, Math.max(0, metrics.revenue / metrics.cost * 100)) : 100;
  const alert = remaining > 0 && remaining <= 5
    ? `<div class="batch-alert">⚠ Restam ${remaining} trufa${remaining === 1 ? '' : 's'}. Já dá para preparar o próximo pacote.</div>` : '';
  return `<button type="button" class="batch-card${state}" onclick="openBatchDetail('${batch.id}', 'home')" aria-label="Abrir detalhes da ${batchLabel(batch)}">
    <div class="batch-card-head">
      <div><div class="batch-number">${batchLabel(batch)}</div><div class="batch-date">Comprada em ${formatBatchDate(batch.createdAt)}</div></div>
      <div class="batch-remaining">${remaining === 0 && metrics.reserved > 0 ? `${metrics.reserved} reservada${metrics.reserved === 1 ? '' : 's'}` : remaining === 0 ? 'Esgotada' : `${remaining} restantes`}</div>
    </div>
    <div class="batch-progress" title="Progresso para recuperar o custo"><span style="width:${recovery.toFixed(1)}%"></span></div>
    <div class="batch-kpis">
      <div class="batch-kpi">Vendidas<strong>${metrics.sold}</strong></div>
      <div class="batch-kpi">Reservadas<strong>${metrics.reserved}</strong></div>
      <div class="batch-kpi">Disponíveis<strong>${metrics.available}</strong></div>
      <div class="batch-kpi">Recebido<strong>${fmt(metrics.revenue)}</strong></div>
      <div class="batch-kpi">Falta recuperar<strong>${fmt(metrics.recover)}</strong></div>
    </div>${alert}
  </button>`;
}

function renderHome() {
  const finance = document.getElementById('home-finance');
  const revenue = confirmedRevenue();
  const costs = batches.reduce((sum, batch) => sum + toMoney(batch.cost), 0);
  const profit = revenue - costs;
  finance.innerHTML = `<div><span class="home-finance-label">Lucro acumulado</span><strong class="home-finance-value${profit < 0 ? ' negative' : ''}">${fmt(profit)}</strong></div>
    <div class="home-finance-note">${fmt(revenue)} recebidos<br>${fmt(costs)} investidos</div>`;

  const list = document.getElementById('home-batches-list');
  const open = sortedBatches().filter(batch => {
    const metrics = batchMetrics(batch);
    return metrics.available > 0 || metrics.reserved > 0;
  });
  const visible = open.length ? open : (batches.length ? [sortedBatches().slice(-1)[0]] : []);
  list.innerHTML = visible.length ? visible.map(renderBatchCard).join('') :
    `<div class="empty-batch">Cadastre a primeira remessa para liberar as vendas e acompanhar o pacote.</div>`;

  const ordersList = document.getElementById('recent-orders-list');
  if (!orders.length) {
    ordersList.innerHTML = `<div class="empty-state"><p>Nenhum pedido ainda</p></div>`;
  } else {
    ordersList.innerHTML = orders.slice(-5).reverse().map(order => renderOrderChip(order)).join('');
  }
}

function openBatchDetail(batchId, origin) {
  currentDetailBatchId = batchId;
  batchDetailOrigin = origin || (currentScreen === 'orders' ? 'orders' : 'home');
  navigate('batch-detail');
}

function navigateBackFromBatchDetail() {
  navigate(batchDetailOrigin || 'home');
}

function renderBatchDetail() {
  const batch = batches.find(item => item.id === currentDetailBatchId);
  if (!batch) { navigate('home'); return; }
  const metrics = batchMetrics(batch);
  const related = orders.filter(order => orderAllocations(order).some(allocation => allocation.batchId === batch.id)).reverse();
  const adjustments = [...(batch.adjustments || [])].reverse();
  document.getElementById('batch-detail-content').innerHTML = `
    <div class="batch-detail-hero">
      <div class="batch-detail-number">${batchLabel(batch)}</div>
      <div class="batch-detail-sub">${toInt(batch.purchasedQty)} unidades · custo ${fmt(toMoney(batch.cost))} · ${formatBatchDate(batch.createdAt)}</div>
      <div class="batch-detail-profit"><span>Resultado da remessa</span><strong>${fmt(metrics.profit)}</strong></div>
    </div>
    <div class="metrics-grid">
      <div class="metric-card"><span>Vendidas</span><strong>${metrics.sold}</strong></div>
      <div class="metric-card"><span>Reservadas</span><strong>${metrics.reserved}</strong></div>
      <div class="metric-card"><span>Disponíveis</span><strong>${metrics.available}</strong></div>
      <div class="metric-card"><span>Recebido</span><strong>${fmt(metrics.revenue)}</strong></div>
    </div>
    <div class="section-header"><div class="section-title">Pedidos desta remessa</div></div>
    <div class="orders-list">${related.length ? related.map(order => renderOrderChip(order, batch.id, 'batch-detail')).join('') : '<div class="empty-state"><p>Nenhum pedido nesta remessa</p></div>'}</div>
    <div class="section-header" style="padding-top:22px"><div class="section-title">Ajustes de estoque</div></div>
    <div class="adjustment-list">${adjustments.length ? adjustments.map(adjustment => {
      const product = truffles.find(item => String(item.id) === String(adjustment.productId));
      const productName = product ? product.name : adjustment.productName || 'Produto antigo';
      return `<div class="adjustment-row"><div class="adjustment-copy"><strong>${esc(productName)}</strong><span>${esc(adjustment.reason)} · ${formatBatchDate(adjustment.createdAt)}</span></div><div class="adjustment-delta ${adjustment.delta < 0 ? 'down' : 'up'}">${adjustment.delta > 0 ? '+' : ''}${toInt(Math.abs(adjustment.delta))}</div></div>`;
    }).join('') : '<div class="empty-batch">Nenhum ajuste registrado.</div>'}</div>`;
}

// ── PEDIDOS VINCULADOS A REMESSAS ──
function orderPortion(order, batchId) {
  if (!batchId) return { total: Number(order.total || 0), items: order.items || [] };
  const grouped = new Map();
  orderAllocations(order).filter(allocation => allocation.batchId === batchId).forEach(allocation => {
    const key = String(allocation.productId);
    if (!grouped.has(key)) grouped.set(key, { id: allocation.productId, name: allocation.productName || 'Produto', qty: 0, price: Number(allocation.unitPrice || 0) });
    grouped.get(key).qty += toInt(allocation.qty);
  });
  const items = [...grouped.values()];
  return { total: items.reduce((sum, item) => sum + item.qty * item.price, 0), items };
}

function renderOrderChip(order, batchId, forcedOrigin) {
  const isReserved = order.status === 'reserved';
  const origin = forcedOrigin || (currentScreen === 'orders' ? 'orders' : currentScreen === 'batch-detail' ? 'batch-detail' : 'home');
  const portion = orderPortion(order, batchId);
  const tagIds = [...new Set(orderAllocations(order).map(allocation => allocation.batchId))];
  const tags = tagIds.map(id => {
    const batch = batches.find(item => item.id === id);
    return batch ? `<span class="batch-tag">${batchLabel(batch)}</span>` : '';
  }).join('');
  const accessibleLabel = esc(`Abrir pedido de ${order.customer || 'Cliente'}, total ${fmt(portion.total)}${isReserved ? ', reservado' : ', confirmado'}`);
  return `<div class="order-chip${isReserved ? ' reserved' : ''}" role="button" tabindex="0" aria-label="${accessibleLabel}" onclick="openOrderDetail(${Number(order.id)}, '${origin}')" onkeydown="activateOnKeyboard(event, () => openOrderDetail(${Number(order.id)}, '${origin}'))">
    <div class="order-chip-left">
      <div class="name">${esc(order.customer || 'Cliente')}</div>
      <div class="items">${portion.items.map(item => `${toInt(item.qty)}x ${esc(item.name)}`).join(', ')}</div>
      ${tags}
      ${isReserved ? '<span class="reserved-badge" style="display:inline-block;margin-top:5px;">⏳ Reservado</span>' : ''}
    </div>
    <div class="order-chip-right">
      <div class="price">${fmt(portion.total)}</div>
      <div class="date">${esc(order.date || '')}</div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-top:2px;"><polyline points="9 18 15 12 9 6"/></svg>
    </div>
  </div>`;
}

function renderOrderDetail() {
  const order = orders.find(item => Number(item.id) === Number(currentDetailOrderId));
  if (!order) { navigate(orderDetailOrigin); return; }
  const reserved = order.status === 'reserved';
  const cashGiven = order.cashGiven != null ? Number(order.cashGiven) : (order.change != null ? Number(order.total) + Number(order.change) : 0);
  const change = Number(order.change || 0);
  const payLabel = order.payMethod === 'pix' ? 'PIX' : order.payMethod === 'cash' ? 'Dinheiro' : null;
  const tags = [...new Set(orderAllocations(order).map(allocation => allocation.batchId))].map(id => {
    const batch = batches.find(item => item.id === id);
    return batch ? `<span class="batch-tag">${batchLabel(batch)}</span>` : '';
  }).join('');
  const itemsHTML = (order.items || []).map(item => `<div class="summary-item">
    <div class="si-qty">${toInt(item.qty)}</div><div class="si-name">${esc(item.name)}</div><div class="si-price">${fmt(Number(item.price || 0) * toInt(item.qty))}</div>
  </div>`).join('');
  const paySection = (!reserved && payLabel) ? `<div class="section-card"><div class="section-card-title">Pagamento</div>
    <div class="detail-pay-row"><span class="label">Forma</span><span class="value">${payLabel}</span></div>
    ${order.payMethod === 'cash' && cashGiven > 0 ? `<div class="detail-pay-row"><span class="label">Pago</span><span class="value">${fmt(cashGiven)}</span></div>` : ''}
    ${order.payMethod === 'cash' && change > 0 ? `<div class="detail-pay-row"><span class="label">Troco</span><span class="value">${fmt(change)}</span></div>` : ''}</div>` : '';
  const obsSection = order.obs ? `<div class="section-card"><div class="section-card-title">Observação</div><div style="padding:10px 16px 14px;font-size:14px;color:var(--text-2);font-style:italic;overflow-wrap:anywhere;">${esc(order.obs)}</div></div>` : '';
  const actions = reserved ? `<div style="padding:0 16px 24px;"><button class="btn-primary" onclick="openReserveConfirmModal()" style="width:100%;margin-bottom:10px;">Confirmar pagamento</button><button class="btn-cancel-reservation" onclick="deleteDetailOrder()">Cancelar reserva</button></div>` : '';
  document.getElementById('order-detail-content').innerHTML = `<div class="detail-customer-card${reserved ? ' reserved' : ''}">
    <div class="detail-status-row"><span class="detail-status-badge ${reserved ? 'reserved' : 'confirmed'}">${reserved ? '⏳ Reservado' : '✓ Confirmado'}</span><span class="detail-date">${esc(order.date || '')}</span></div>
    <div class="detail-customer-name">${esc(order.customer || 'Cliente')}</div><div>${tags}</div></div>
    <div class="section-card" style="margin-top:0"><div class="section-card-title">Itens do pedido</div><div class="summary-items" style="padding-top:0">${itemsHTML}</div><div class="total-row main"><span>Total</span><span>${fmt(Number(order.total || 0))}</span></div></div>
    ${paySection}${obsSection}${actions}`;
}

function deleteOrder(id) {
  const order = orders.find(item => Number(item.id) === Number(id));
  if (!order) return;
  pendingDeleteId = Number(id);
  const reserved = order.status === 'reserved';
  const allocations = orderAllocations(order);
  document.getElementById('confirm-delete-title').textContent = reserved ? 'Cancelar reserva?' : 'Excluir pedido?';
  document.getElementById('confirm-delete-desc').textContent = `${order.customer || 'Cliente'} · Os ${allocations.reduce((sum, allocation) => sum + toInt(allocation.qty), 0)} itens voltarão às remessas de origem.`;
  document.getElementById('confirm-delete-btn').textContent = reserved ? 'Cancelar reserva' : 'Excluir pedido';
  openAccessibleModal('confirm-delete-overlay', '#confirm-delete-btn');
}

function reactivateReturnedProducts(order) {
  const productIds = new Set(orderAllocations(order).map(allocation => String(allocation.productId)));
  return reactivateArchivedStockProducts(productIds);
}

function confirmDeleteOrder() {
  if (pendingDeleteId === null) return;
  const removedOrder = orders.find(order => Number(order.id) === Number(pendingDeleteId));
  if (!removedOrder) { closeConfirmDelete(); return; }
  ensureHistoricalProductReferences(truffles, [removedOrder]);
  const returnedQty = orderAllocations(removedOrder).reduce((sum, allocation) => sum + toInt(allocation.qty), 0);
  orders = orders.filter(order => Number(order.id) !== Number(pendingDeleteId));
  pendingDeleteId = null;
  recomputeStockFromBatches();
  const reactivated = reactivateReturnedProducts(removedOrder);
  saveData();
  closeConfirmDelete();
  if (currentScreen === 'order-detail') navigate(orderDetailOrigin || 'home');
  else if (currentScreen === 'orders') { renderOrdersStats(); renderOrdersList(); }
  else if (currentScreen === 'batch-detail') renderBatchDetail();
  else renderHome();
  const returnedMessage = returnedQty === 1 ? '1 item devolvido à remessa de origem' : `${returnedQty} itens devolvidos às remessas de origem`;
  showToast(`Pedido removido; ${returnedMessage}${reactivated.length ? ' e sabor histórico reativado' : ''}`);
}

function renderMenu() {
  updateCartBar();
  const container = document.getElementById('menu-items-list');
  container.innerHTML = truffles.filter(product => !product.archived).map(product => {
    const qty = cart[product.id] || 0;
    const out = toInt(product.stock) <= 0;
    const low = product.stock > 0 && product.stock <= 5;
    const stockClass = out ? 'out' : low ? 'low' : '';
    const stockLabel = out ? 'Esgotado' : `${toInt(product.stock)} disponíve${product.stock === 1 ? 'l' : 'is'}`;
    return `<div class="menu-card ${qty > 0 ? 'in-cart' : ''}" id="mc-${Number(product.id)}">
      <div class="menu-card-thumb"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9B6A3A" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/></svg></div>
      <div class="menu-card-info"><div class="menu-card-name">${esc(product.name)}</div><div class="menu-card-desc">${esc(product.description)}</div>
      <div class="menu-card-footer"><div class="menu-card-price">${fmt(Number(product.price))}</div><span class="stock-badge ${stockClass}">${stockLabel}</span></div>
      <div style="margin-top:10px;display:flex;align-items:center;justify-content:flex-end">${out ? '<span style="font-size:13px;color:var(--danger);font-weight:500">Indisponível</span>' : `<div class="qty-ctrl">
        <button class="qty-btn minus" onclick="setQty(${Number(product.id)},-1)" ${qty === 0 ? 'disabled' : ''} aria-label="Remover uma unidade"><svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor"><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
        <div class="qty-val">${qty}</div>
        <button class="qty-btn plus" onclick="setQty(${Number(product.id)},1)" ${qty >= product.stock ? 'disabled' : ''} aria-label="Adicionar uma unidade"><svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      </div>`}</div></div></div>`;
  }).join('');
}

function renderSummary() {
  payMethod = null;
  document.getElementById('customer-name').value = '';
  document.getElementById('order-obs').value = '';
  document.getElementById('cash-input').value = '';
  document.getElementById('change-box').style.display = 'none';
  document.getElementById('confirm-btn').disabled = true;
  document.querySelectorAll('#screen-summary .pay-card').forEach(card => {
    card.classList.remove('selected');
    card.setAttribute('aria-checked', 'false');
  });
  document.getElementById('pix-body').style.display = 'none';
  document.getElementById('cash-body').style.display = 'none';
  const items = Object.entries(cart).map(([id, qty]) => ({ ...truffles.find(product => String(product.id) === String(id)), qty }));
  document.getElementById('summary-items-list').innerHTML = items.map(item => `<div class="summary-item"><div class="si-qty">${toInt(item.qty)}</div><div class="si-name">${esc(item.name)}</div><div class="si-price">${fmt(Number(item.price) * toInt(item.qty))}</div></div>`).join('');
  document.getElementById('subtotal-val').textContent = fmt(cartTotal());
  document.getElementById('total-val').textContent = fmt(cartTotal());
}

function createOrder(status) {
  if (batchMigrationRequired) { showToast('Conclua a organização da Remessa 1'); openMigrationModal(); return null; }
  const items = Object.entries(cart).map(([id, qty]) => {
    const product = truffles.find(item => String(item.id) === String(id));
    return product ? { id: product.id, name: product.name, qty: toInt(qty), price: Number(product.price) } : null;
  }).filter(Boolean);
  if (!items.length) { showToast('Carrinho vazio'); return null; }
  const allocations = allocationPlan(items);
  if (!allocations) { recomputeStockFromBatches(); saveData(); renderMenu(); showToast('Estoque insuficiente. O pedido não foi salvo.'); return null; }
  const total = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const customer = document.getElementById('customer-name').value.trim() || 'Cliente';
  const obs = document.getElementById('order-obs').value.trim();
  const given = Number(document.getElementById('cash-input').value) || 0;
  if (status === 'confirmed' && (!payMethod || (payMethod === 'cash' && given < total))) {
    showToast('Confira a forma de pagamento'); return null;
  }
  const now = new Date();
  const order = {
    id: uniqueOrderId(), customer, obs, items, allocations, total,
    payMethod: status === 'confirmed' ? payMethod : null,
    cashGiven: status === 'confirmed' && payMethod === 'cash' ? given : null,
    change: status === 'confirmed' && payMethod === 'cash' ? given - total : null,
    status,
    createdAt: now.toISOString(),
    date: now.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
  };
  orders.push(order);
  recomputeStockFromBatches();
  saveData();
  return order;
}

function confirmOrder() {
  const order = createOrder('confirmed');
  if (!order) return;
  document.getElementById('success-sub').textContent = order.customer !== 'Cliente' ? `Obrigada, ${order.customer}!` : 'Obrigada pela preferência';
  document.getElementById('success-summary').innerHTML = `${order.items.map(item => `<div class="ss-row"><span class="label">${item.qty}x ${esc(item.name)}</span><span class="val">${fmt(item.price * item.qty)}</span></div>`).join('')}
    <div class="ss-row"><span class="label">Total</span><span class="val total">${fmt(order.total)}</span></div>
    <div class="ss-row"><span class="label">Pagamento</span><span class="val">${order.payMethod === 'pix' ? 'PIX' : 'Dinheiro'}</span></div>
    ${order.change !== null ? `<div class="ss-row"><span class="label">Troco</span><span class="val">${fmt(order.change)}</span></div>` : ''}
    ${order.obs ? `<div class="ss-row"><span class="label">Obs.</span><span class="val" style="max-width:60%;text-align:right;font-size:13px;overflow-wrap:anywhere">${esc(order.obs)}</span></div>` : ''}`;
  cart = {};
  navigate('success');
}

function reserveOrder() {
  const order = createOrder('reserved');
  if (!order) return;
  cart = {};
  showToast(`Pedido reservado para ${order.customer}`);
  navigate('home');
}

function confirmReservedPayment() {
  const order = orders.find(item => Number(item.id) === Number(currentDetailOrderId));
  if (!order || order.status !== 'reserved' || !rpPayMethod) return;
  const given = rpPayMethod === 'cash' ? (Number(document.getElementById('rp-cash-input').value) || 0) : 0;
  if (rpPayMethod === 'cash' && given < order.total) { showToast('Valor recebido é menor que o total'); return; }
  order.payMethod = rpPayMethod;
  order.cashGiven = rpPayMethod === 'cash' ? given : null;
  order.change = rpPayMethod === 'cash' ? given - order.total : null;
  order.status = 'confirmed';
  order.paidAt = new Date().toISOString();
  saveData();
  closeReserveConfirmModal();
  renderOrderDetail();
  showToast('Pagamento confirmado!');
}

// ─────────────────────────────────────────
//  VIEWPORT HEIGHT FIX (Android Chrome)
//  window.innerHeight é sempre o espaço
//  visível real, ignorando a barra do nav.
// ─────────────────────────────────────────
function fixViewportHeight() {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
}
fixViewportHeight();
window.addEventListener('resize', fixViewportHeight);
// Refaz após interação (barra do Chrome some ao rolar)
window.addEventListener('orientationchange', () => setTimeout(fixViewportHeight, 300));

// ─────────────────────────────────────────
//  INIT — renderiza home na carga inicial
if (!batchMigrationRequired) {
  normalizeReversibleBatchHistory(truffles, orders, batches);
  recomputeStockFromBatches();
  reactivateArchivedStockProducts();
  saveData();
}
// ─────────────────────────────────────────
syncAccessibilityState();
renderHome();

// ─────────────────────────────────────────
if (batchMigrationRequired) requestAnimationFrame(openMigrationModal);

//  BLOQUEAR ZOOM (iOS ignora user-scalable)
// ─────────────────────────────────────────
document.addEventListener('touchmove', function(e) {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

let _lastTap = 0;
document.addEventListener('touchend', function(e) {
  const now = Date.now();
  if (now - _lastTap < 300) e.preventDefault();
  _lastTap = now;
}, false);

// ─────────────────────────────────────────
//  SERVICE WORKER (PWA)
// ─────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('[SW] Registrado:', reg.scope))
      .catch(err => console.warn('[SW] Falha:', err));
  });
}
