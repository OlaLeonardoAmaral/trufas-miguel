// Validação retrocompatível de backups importados.
function backupAssert(condition, message) {
  if (!condition) throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function normalizeImportedPositiveId(value, message) {
  const isIntegerNumber = typeof value === 'number' && Number.isSafeInteger(value);
  const isIntegerString = typeof value === 'string' && /^\d+$/.test(value);
  const normalized = isIntegerNumber || isIntegerString ? Number(value) : 0;
  backupAssert(Number.isSafeInteger(normalized) && normalized > 0, message);
  return normalized;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) >= 0;
}

function isNonNegativeMoney(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function moneyCents(value) {
  return Math.round(Number(value) * 100);
}

function ensureHistoricalProductReferences(productList, orderList) {
  const knownIds = new Set(productList.map(product => String(product.id)));
  const added = [];
  orderList.forEach(order => (Array.isArray(order.items) ? order.items : []).forEach(item => {
    const productId = String(item.id);
    if (knownIds.has(productId)) return;
    const product = {
      id: item.id,
      name: item.name || 'Produto antigo',
      description: 'Produto arquivado preservado pelo histórico de pedidos',
      price: toMoney(item.price),
      stock: 0,
      archived: true
    };
    productList.push(product);
    added.push(product);
    knownIds.add(productId);
  }));
  return added;
}

function ensureBatchProductReferences(productList, orderList, batchList) {
  const added = ensureHistoricalProductReferences(productList, orderList);
  const knownIds = new Set(productList.map(product => String(product.id)));
  const metadata = new Map();
  orderList.forEach(order => orderAllocations(order).forEach(allocation => {
    metadata.set(String(allocation.productId), {
      name: allocation.productName || 'Produto antigo',
      price: toMoney(allocation.unitPrice)
    });
  }));
  batchList.forEach(batch => (Array.isArray(batch.adjustments) ? batch.adjustments : []).forEach(adjustment => {
    if (!metadata.has(String(adjustment.productId))) metadata.set(String(adjustment.productId), {
      name: adjustment.productName || 'Produto antigo',
      price: 2
    });
  }));
  batchList.forEach(batch => Object.keys(batch.distribution || {}).forEach(productId => {
    if (knownIds.has(String(productId))) return;
    const details = metadata.get(String(productId)) || { name: `Produto antigo ${productId}`, price: 2 };
    const product = {
      id: Number.isSafeInteger(Number(productId)) ? Number(productId) : productId,
      name: details.name,
      description: 'Produto arquivado preservado pela referência da remessa',
      price: details.price,
      stock: 0,
      archived: true
    };
    productList.push(product);
    added.push(product);
    knownIds.add(String(productId));
  }));
  return added;
}

function normalizeReversibleBatchHistory(productList, orderList, batchList) {
  ensureBatchProductReferences(productList, orderList, batchList);
  orderList.forEach(order => orderAllocations(order).forEach(allocation => {
    allocation.reversible = true;
  }));
  batchList.forEach(batch => {
    batch.adjustments = (Array.isArray(batch.adjustments) ? batch.adjustments : [])
      .filter(adjustment => adjustment.kind !== 'migration')
      .map(adjustment => ({ ...adjustment, reversible: true }));
  });
}

function reactivateArchivedStockProducts(productIds) {
  const scopedIds = productIds ? new Set([...productIds].map(String)) : null;
  const reactivated = [];
  truffles.forEach(product => {
    if (scopedIds && !scopedIds.has(String(product.id))) return;
    if (!product.archived || toInt(product.stock) === 0) return;
    product.archived = false;
    reactivated.push(product.name);
  });
  return reactivated;
}

function validateBackupData(rawData) {
  backupAssert(isPlainObject(rawData), 'raiz');
  const data = JSON.parse(JSON.stringify(rawData));
  const version = data.version == null ? 1 : Number(data.version);
  backupAssert(version === 1 || version === 2, 'versão');
  backupAssert(Array.isArray(data.truffles) && Array.isArray(data.orders), 'coleções');

  const productIds = new Set();
  data.truffles.forEach(product => {
    backupAssert(isPlainObject(product), 'produto');
    product.id = normalizeImportedPositiveId(product.id, 'id de produto');
    const id = String(product.id);
    backupAssert(!productIds.has(id), 'id de produto duplicado');
    productIds.add(id);
    backupAssert(typeof product.name === 'string' && product.name.trim(), 'nome de produto');
    backupAssert(product.description == null || typeof product.description === 'string', 'descrição de produto');
    backupAssert(isNonNegativeMoney(product.price), 'preço de produto');
    backupAssert(isNonNegativeInteger(product.stock), 'estoque de produto');
    backupAssert(product.archived == null || typeof product.archived === 'boolean', 'produto arquivado');
  });

  const orderIds = new Set();
  data.orders.forEach(order => {
    backupAssert(isPlainObject(order), 'pedido');
    order.id = normalizeImportedPositiveId(order.id, 'id de pedido');
    const orderId = String(order.id);
    backupAssert(!orderIds.has(orderId), 'id de pedido duplicado');
    orderIds.add(orderId);
    backupAssert(order.status === 'reserved' || order.status === 'confirmed', 'status de pedido');
    backupAssert(Array.isArray(order.items) && order.items.length > 0, 'itens de pedido');
    backupAssert(order.customer == null || typeof order.customer === 'string', 'cliente');
    backupAssert(order.obs == null || typeof order.obs === 'string', 'observação');
    let itemTotal = 0;
    const itemIds = new Set();
    order.items.forEach(item => {
      backupAssert(isPlainObject(item), 'item do pedido');
      item.id = normalizeImportedPositiveId(item.id, 'produto do item');
      const productId = String(item.id);
      backupAssert(!itemIds.has(productId), 'produto repetido no pedido');
      itemIds.add(productId);
      backupAssert(typeof item.name === 'string' && item.name.trim(), 'nome do item');
      backupAssert(isPositiveInteger(item.qty), 'quantidade do item');
      backupAssert(isNonNegativeMoney(item.price), 'preço do item');
      itemTotal += Number(item.qty) * moneyCents(item.price);
    });
    backupAssert(isNonNegativeMoney(order.total) && moneyCents(order.total) === itemTotal, 'total do pedido');
    if (order.status === 'confirmed') {
      backupAssert(order.payMethod === 'pix' || order.payMethod === 'cash', 'pagamento confirmado');
    } else {
      backupAssert(order.payMethod == null, 'pagamento de reserva');
    }
  });

  ensureHistoricalProductReferences(data.truffles, data.orders).forEach(product => {
    productIds.add(String(product.id));
  });

  const settingsCandidate = data.settings == null ? { pixKey:'', pixName:'', pixCity:'' } : data.settings;
  backupAssert(isPlainObject(settingsCandidate), 'configurações');
  ['pixKey', 'pixName', 'pixCity'].forEach(key => {
    backupAssert(settingsCandidate[key] == null || typeof settingsCandidate[key] === 'string', `configuração ${key}`);
  });
  const normalized = {
    version,
    truffles: data.truffles,
    orders: data.orders,
    settings: {
      pixKey: settingsCandidate.pixKey || '',
      pixName: settingsCandidate.pixName || '',
      pixCity: settingsCandidate.pixCity || ''
    },
    batches: []
  };
  if (version === 1) return normalized;

  backupAssert(Array.isArray(data.batches) && data.batches.length > 0, 'remessas');
  const batchIds = new Set();
  const batchNumbers = new Set();
  const batchById = new Map();
  const capacityByProduct = new Map();
  const adjustmentIds = new Set();

  data.batches.forEach(batch => {
    backupAssert(isPlainObject(batch) && typeof batch.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(batch.id), 'id de remessa');
    backupAssert(!batchIds.has(batch.id), 'id de remessa duplicado');
    batchIds.add(batch.id);
    backupAssert(isPositiveInteger(batch.number) && !batchNumbers.has(Number(batch.number)), 'número de remessa');
    batchNumbers.add(Number(batch.number));
    backupAssert(isNonNegativeMoney(batch.cost), 'custo de remessa');
    backupAssert(isPositiveInteger(batch.purchasedQty), 'quantidade comprada');
    backupAssert(typeof batch.createdAt === 'string' && !Number.isNaN(Date.parse(batch.createdAt)), 'data de remessa');
    backupAssert(isPlainObject(batch.distribution), 'distribuição');
    const normalizedDistribution = {};
    Object.entries(batch.distribution).forEach(([productId, qty]) => {
      const normalizedProductId = String(normalizeImportedPositiveId(productId, 'produto da distribuição'));
      backupAssert(!Object.prototype.hasOwnProperty.call(normalizedDistribution, normalizedProductId), 'produto duplicado na distribuição');
      normalizedDistribution[normalizedProductId] = qty;
    });
    batch.distribution = normalizedDistribution;
    let distributionTotal = 0;
    Object.entries(batch.distribution).forEach(([productId, qty]) => {
      backupAssert(isNonNegativeInteger(qty), 'quantidade da distribuição');
      distributionTotal += Number(qty);
    });
    backupAssert(distributionTotal === Number(batch.purchasedQty), 'soma da distribuição');
    backupAssert(Array.isArray(batch.adjustments), 'ajustes');

    const runningAdjustments = new Map();
    batch.adjustments.forEach(adjustment => {
      backupAssert(isPlainObject(adjustment) && typeof adjustment.id === 'string' && adjustment.id.trim(), 'id de ajuste');
      backupAssert(!adjustmentIds.has(adjustment.id), 'id de ajuste duplicado');
      adjustmentIds.add(adjustment.id);
      adjustment.productId = normalizeImportedPositiveId(adjustment.productId, 'produto do ajuste');
      const productId = String(adjustment.productId);
      backupAssert(Object.prototype.hasOwnProperty.call(batch.distribution, productId), 'produto do ajuste');
      backupAssert(Number.isInteger(Number(adjustment.delta)) && Number(adjustment.delta) !== 0, 'quantidade do ajuste');
      backupAssert(typeof adjustment.reason === 'string' && adjustment.reason.trim(), 'motivo do ajuste');
      backupAssert(typeof adjustment.createdAt === 'string' && !Number.isNaN(Date.parse(adjustment.createdAt)), 'data do ajuste');
      backupAssert(['reduction', 'restoration', 'migration'].includes(adjustment.kind), 'tipo do ajuste');
      backupAssert(adjustment.reversible == null || typeof adjustment.reversible === 'boolean', 'reversibilidade do ajuste');
      backupAssert(adjustment.productName == null || typeof adjustment.productName === 'string', 'nome do produto ajustado');
      backupAssert(Number(adjustment.delta) > 0 ? adjustment.kind === 'restoration' : adjustment.kind !== 'restoration', 'sinal do ajuste');
      if (adjustment.kind === 'migration') return;
      adjustment.reversible = true;
      const running = (runningAdjustments.get(productId) || 0) + Number(adjustment.delta);
      backupAssert(running <= 0 && Number(batch.distribution[productId]) + running >= 0, 'sequência do ajuste');
      runningAdjustments.set(productId, running);
    });
    batch.adjustments = batch.adjustments.filter(adjustment => adjustment.kind !== 'migration');

    Object.entries(batch.distribution).forEach(([productId, qty]) => {
      const key = `${batch.id}:${productId}`;
      capacityByProduct.set(key, Number(qty) + (runningAdjustments.get(productId) || 0));
    });
    batchById.set(batch.id, batch);
  });

  const allocatedByProduct = new Map();
  data.orders.forEach(order => {
    backupAssert(Array.isArray(order.allocations) && order.allocations.length > 0, 'alocações do pedido');
    const itemById = new Map(order.items.map(item => [String(Number(item.id)), item]));
    const allocatedInOrder = new Map();
    let allocationTotal = 0;
    order.allocations.forEach(allocation => {
      backupAssert(isPlainObject(allocation) && batchIds.has(allocation.batchId), 'remessa da alocação');
      allocation.productId = normalizeImportedPositiveId(allocation.productId, 'produto da alocação');
      const productId = String(allocation.productId);
      const item = itemById.get(productId);
      const batch = batchById.get(allocation.batchId);
      backupAssert(item, 'produto da alocação');
      backupAssert(Object.prototype.hasOwnProperty.call(batch.distribution, productId), 'distribuição da alocação');
      backupAssert(isPositiveInteger(allocation.qty), 'quantidade da alocação');
      backupAssert(isNonNegativeMoney(allocation.unitPrice) && moneyCents(allocation.unitPrice) === moneyCents(item.price), 'preço da alocação');
      backupAssert(typeof allocation.productName === 'string' && allocation.productName.trim(), 'nome da alocação');
      backupAssert(allocation.reversible == null || typeof allocation.reversible === 'boolean', 'reversibilidade da alocação');
      allocation.reversible = true;
      allocatedInOrder.set(productId, (allocatedInOrder.get(productId) || 0) + Number(allocation.qty));
      const key = `${allocation.batchId}:${productId}`;
      allocatedByProduct.set(key, (allocatedByProduct.get(key) || 0) + Number(allocation.qty));
      allocationTotal += Number(allocation.qty) * moneyCents(allocation.unitPrice);
    });
    order.items.forEach(item => {
      backupAssert((allocatedInOrder.get(String(Number(item.id))) || 0) === Number(item.qty), 'total alocado do item');
    });
    backupAssert(allocationTotal === moneyCents(order.total), 'total alocado do pedido');
  });
  allocatedByProduct.forEach((allocated, key) => {
    backupAssert(capacityByProduct.has(key) && allocated <= capacityByProduct.get(key), 'capacidade da remessa');
  });
  normalizeReversibleBatchHistory(data.truffles, data.orders, data.batches);
  normalized.batches = data.batches;
  return normalized;
}
