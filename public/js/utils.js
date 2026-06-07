// ============ Utility Functions ============

/** Escape HTML injection in text */
function escapeHtml(text) {
  if (text === undefined || text === null) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/** Format number as currency $X.XX */
function formatMoney(value) {
  return '$' + Number(value || 0).toFixed(2);
}

/** Show toast notification */
function showToast(title, message, type) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastMessage').textContent = message;
  toast.classList.remove('show', 'error');
  if (type === 'error') toast.classList.add('error');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4000);
}

/** Get initial letter for avatar */
function getInitial(name) {
  if (!name) return 'U';
  return name.charAt(0).toUpperCase();
}