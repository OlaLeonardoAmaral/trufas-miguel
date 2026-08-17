// ───────────────────────────────────────
//  REMESSAS — MODELO, MIGRAÇÃO E INDICADORES
//  As funções abaixo substituem os fluxos antigos de estoque livre.
// ───────────────────────────────────────
function formatBatchDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data não informada' : date.toLocaleDateString('pt-BR');
}

function batchLabel(batch) {
  return batch ? `Remessa ${toInt(batch.number)}` : 'Remessa';
}

function sortedBatches() {
  return [...batches].sort((a, b) => (toInt(a.number) - toInt(b.number)) || String(a.createdAt).localeCompare(String(b.createdAt)));
}

function orderAllocations(order) {
  return Array.isArray(order && order.allocations) ? order.allocations : [];
}

function allocatedQty(batchId, productId) {
  return orders.reduce((total, order) => total + orderAllocations(order)
    .filter(a => a.batchId === batchId && String(a.productId) === String(productId))
    .reduce((sum, a) => sum + toInt(a.qty), 0), 0);
}

function batchAdjustmentTotal(batch, productId) {
  return (Array.isArray(batch.adjustments) ? batch.adjustments : [])
    .filter(a => String(a.productId) === String(productId))
    .reduce((sum, a) => sum + Number(a.delta || 0), 0);
}

function batchAvailable(batch, productId) {
  const purchased = toInt((batch.distribution || {})[String(productId)]);
  return Math.max(0, purchased + batchAdjustmentTotal(batch, productId) - allocatedQty(batch.id, productId));
}

function batchRemaining(batch) {
  return Object.keys(batch.distribution || {}).reduce((sum, productId) => sum + batchAvailable(batch, productId), 0);
}

function batchMetrics(batch) {
  let sold = 0;
  let reserved = 0;
  let revenue = 0;
  orders.forEach(order => {
    orderAllocations(order).forEach(allocation => {
      if (allocation.batchId !== batch.id) return;
      const qty = toInt(allocation.qty);
      if (order.status === 'reserved') reserved += qty;
      else {
        sold += qty;
        revenue += qty * Number(allocation.unitPrice || 0);
      }
    });
  });
  const available = batchRemaining(batch);
  const cost = toMoney(batch.cost);
  return { sold, reserved, available, revenue, cost, profit: revenue - cost, recover: Math.max(0, cost - revenue) };
}

function currentBatch() {
  const list = sortedBatches();
  return list.find(batch => batchMetrics(batch).available > 0)
    || list.find(batch => batchMetrics(batch).reserved > 0)
    || list[list.length - 1]
    || null;
}

function confirmedRevenue() {
  return orders.filter(order => order.status !== 'reserved').reduce((sum, order) => sum + Number(order.total || 0), 0);
}

function recomputeStockFromBatches() {
  if (batchMigrationRequired) return;
  truffles.forEach(truffle => {
    truffle.stock = batches.reduce((sum, batch) => sum + batchAvailable(batch, truffle.id), 0);
  });
}

function allocationPlan(items) {
  if (batchMigrationRequired || !batches.length) return null;
  const list = sortedBatches();
  const working = new Map();
  list.forEach(batch => Object.keys(batch.distribution || {}).forEach(productId => {
    working.set(`${batch.id}:${productId}`, batchAvailable(batch, productId));
  }));
  const allocations = [];
  for (const item of items) {
    let remaining = toInt(item.qty);
    for (const batch of list) {
      if (!remaining) break;
      const key = `${batch.id}:${item.id}`;
      const available = working.get(key) || 0;
      if (!available) continue;
      const qty = Math.min(available, remaining);
      allocations.push({
        batchId: batch.id,
        productId: item.id,
        productName: item.name,
        qty,
        unitPrice: Number(item.price),
        reversible: true
      });
      working.set(key, available - qty);
      remaining -= qty;
    }
    if (remaining) return null;
  }
  return allocations;
}

function uniqueOrderId() {
  let id = Date.now();
  while (orders.some(order => Number(order.id) === id)) id += 1;
  return id;
}

function uniqueBatchId() {
  return `b${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function showFormError(id, message) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message || '';
  element.classList.toggle('show', Boolean(message));
}
