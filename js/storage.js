(function (global) {
  const KEYS = Object.freeze({
    truffles: 'truffles_mig',
    orders: 'orders_mig',
    settings: 'settings_mig',
    batches: 'batches_mig',
  });

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function loadAppData(defaultTruffles) {
    const storedBatches = readJSON(KEYS.batches, null);
    return {
      truffles: readJSON(KEYS.truffles, null) || JSON.parse(JSON.stringify(defaultTruffles)),
      orders: readJSON(KEYS.orders, []),
      settings: readJSON(KEYS.settings, null) || { pixKey: '', pixName: '', pixCity: '' },
      batches: Array.isArray(storedBatches) ? storedBatches : [],
      batchMigrationRequired: !Array.isArray(storedBatches),
    };
  }

  function saveSalesData(data) {
    writeJSON(KEYS.truffles, data.truffles);
    writeJSON(KEYS.orders, data.orders);
    writeJSON(KEYS.batches, data.batches);
  }

  function saveSettings(settings) {
    writeJSON(KEYS.settings, settings);
  }

  function snapshot(keys) {
    return keys.reduce((copy, key) => {
      copy[key] = localStorage.getItem(key);
      return copy;
    }, {});
  }

  function restore(snapshotData) {
    Object.entries(snapshotData).forEach(([key, value]) => {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {}
    });
  }

  global.TrufasMig = global.TrufasMig || {};
  global.TrufasMig.storage = {
    KEYS,
    readJSON,
    writeJSON,
    loadAppData,
    saveSalesData,
    saveSettings,
    snapshot,
    restore,
  };
})(window);
