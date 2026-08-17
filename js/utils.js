// Utilitários pequenos e seguros para uso em toda a PWA.
function fmt(val) {
  return 'R$ ' + Number(val || 0).toFixed(2).replace('.', ',');
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function toInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function toMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100) / 100) : 0;
}
