// ============ Auth ============
const AUTH_TOKEN = localStorage.getItem('admin_token');
if (!AUTH_TOKEN) window.location.href = '/admin/login';

const API = {
  async get(url) {
    const r = await fetch(url, { headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` } });
    if (r.status === 401 || r.status === 403) { localStorage.removeItem('admin_token'); window.location.href = '/admin/login'; }
    if (!r.ok) throw new Error(`API Error: ${r.status}`);
    return r.json();
  },
  async post(url, d) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AUTH_TOKEN}` },
      body: JSON.stringify(d)
    });
    if (r.status === 401 || r.status === 403) { localStorage.removeItem('admin_token'); window.location.href = '/admin/login'; }
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Request failed'); }
    return r.json();
  },
  async put(url, d) {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AUTH_TOKEN}` },
      body: JSON.stringify(d)
    });
    if (r.status === 401 || r.status === 403) { localStorage.removeItem('admin_token'); window.location.href = '/admin/login'; }
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Request failed'); }
    return r.json();
  },
  async delete(url) {
    const r = await fetch(url, { method: 'DELETE', headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` } });
    if (r.status === 401 || r.status === 403) { localStorage.removeItem('admin_token'); window.location.href = '/admin/login'; }
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Request failed'); }
    return r.json();
  },
  async upload(file) {
    const fd = new FormData();
    fd.append('image', file);
    const r = await fetch('/api/admin/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` },
      body: fd
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Upload failed'); }
    return r.json();
  }
};

// ============ Helpers ============
const $ = id => document.getElementById(id);
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
const dateTime = d => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const shortDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const money = n => `$${Number(n || 0).toFixed(2)}`;
const statusClass = s => `status-${s || 'pending'}`;

function showToast(title, msg) {
  $('toastTitle').textContent = title;
  $('toastMessage').textContent = msg;
  $('adminToast').classList.add('show');
  setTimeout(() => $('adminToast').classList.remove('show'), 4000);
}

document.getElementById('logoutBtn')?.addEventListener('click', () => {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_email');
  window.location.href = '/admin/login';
});

// ============ Store Name Sync ============
let storeSettings = {};

async function syncStoreName() {
  try {
    storeSettings = await API.get('/api/admin/settings');
    const name = storeSettings.store_name || 'Store';
    if ($('sidebarStoreName')) $('sidebarStoreName').textContent = name;
    if ($('adminPageTitle')) $('adminPageTitle').textContent = `${name} — Admin`;
    document.title = `${name} — Admin`;
  } catch(e) {
    // Silent fail
  }
}

// Call on load
syncStoreName();

// ============ Sidebar Navigation ============
let currentSection = 'dashboard';

document.querySelectorAll('.nav-item[data-section]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(link.dataset.section);
  });
});

document.getElementById('sidebarToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('show');
});

document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('show');
  });
});

const TITLES = {
  dashboard: 'Dashboard', orders: 'Orders', products: 'Products', customers: 'Customers',
  'store-editor': 'Store Settings', categories: 'Categories', coupons: 'Coupons',
  payments: 'Payments', policies: 'Policies', 'gift-cards': 'Gift Cards',
  newsletter: 'Subscribers', analytics: 'Analytics', staff: 'Staff',
  activity: 'Activity Log', profile: 'Admin Profile'
};

function navigateTo(section) {
  currentSection = section;
  document.querySelectorAll('.nav-item[data-section]').forEach(i => i.classList.toggle('active', i.dataset.section === section));
  $('pageTitle').textContent = TITLES[section] || 'Dashboard';
  const area = $('contentArea');
  area.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-muted);"><div class="spinner"></div><p style="margin-top:16px;font-size:0.9rem;">Loading...</p></div>`;

  const loaders = {
    dashboard: loadDashboard,
    orders: loadOrders,
    products: loadProducts,
    customers: loadCustomers,
    'store-editor': loadStoreEditor,
    categories: loadCategories,
    coupons: loadCoupons,
    payments: loadPaymentSettings,
    policies: loadPolicies,
    'gift-cards': loadGiftCards,
    newsletter: loadNewsletter,
    analytics: loadAnalytics,
    staff: loadStaff,
    activity: loadActivity,
    profile: loadProfile
  };
  if (loaders[section]) loaders[section]();
}

// ============ DASHBOARD ============
async function loadDashboard() {
  const area = $('contentArea');
  try {
    const stats = await API.get('/api/admin/stats');
    const storeName = storeSettings.store_name || 'Store';

    area.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card" style="--stat-color:#10b981;"><div class="stat-icon" style="background:var(--success-light);color:var(--success);"><i class="fas fa-dollar-sign"></i></div>
          <div class="stat-info"><span class="stat-label">Revenue</span><span class="stat-value">${money(stats.totalRevenue)}</span></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:var(--info-light);color:var(--info);"><i class="fas fa-shopping-bag"></i></div>
          <div class="stat-info"><span class="stat-label">Orders</span><span class="stat-value">${stats.totalOrders}</span></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:var(--primary-light);color:var(--primary);"><i class="fas fa-box"></i></div>
          <div class="stat-info"><span class="stat-label">Products</span><span class="stat-value">${stats.totalProducts}</span></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:var(--warning-light);color:var(--warning);"><i class="fas fa-clock"></i></div>
          <div class="stat-info"><span class="stat-label">Pending Orders</span><span class="stat-value">${stats.pendingOrders}</span></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:var(--error-light);color:var(--error);"><i class="fas fa-exclamation-triangle"></i></div>
          <div class="stat-info"><span class="stat-label">Out of Stock</span><span class="stat-value">${stats.outOfStock}</span></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:#dbeafe;color:#2563eb;"><i class="fas fa-users"></i></div>
          <div class="stat-info"><span class="stat-label">Customers</span><span class="stat-value">${stats.totalCustomers}</span></div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
        <div class="card">
          <div class="card-title"><i class="fas fa-shopping-cart" style="color:var(--primary);"></i> Recent Orders</div>
          <div id="recentOrdersList"></div>
        </div>
        <div class="card">
          <div class="card-title"><i class="fas fa-star" style="color:var(--warning);"></i> Top Products</div>
          <div id="topProductsList">
            ${(stats.topProducts || []).map((p, i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-light);"><span><span style="color:var(--text-muted);margin-right:8px;">${i+1}.</span>${esc(p.product_name)}</span><span style="font-weight:600;color:var(--primary);">${p.total_sold} sold</span></div>`).join('') || '<p style="color:var(--text-muted);padding:20px;text-align:center;">No sales yet</p>'}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-title"><i class="fas fa-chart-bar" style="color:var(--success);"></i> 7-Day Sales</div>
        <div id="salesChart" style="display:flex;align-items:flex-end;gap:4px;height:120px;padding:16px 0;">
          ${(stats.salesData || []).map((d, i) => {
            const maxRev = Math.max(...(stats.salesData || []).map(s => s.revenue), 1);
            const h = Math.max(8, (d.revenue / maxRev) * 100);
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
              <span style="font-size:0.65rem;color:var(--text-muted);">${money(d.revenue)}</span>
              <div style="width:100%;height:${h}px;background:var(--primary-gradient);border-radius:4px 4px 0 0;opacity:${i === stats.salesData.length - 1 ? '1' : '0.5'};transition:var(--transition);"></div>
              <span style="font-size:0.6rem;color:var(--text-muted);">${d.date ? d.date.slice(5) : ''}</span>
            </div>`;
          }).join('') || '<p style="color:var(--text-muted);width:100%;text-align:center;">No data</p>'}
        </div>
      </div>
    `;

    try {
      const orders = await API.get('/api/admin/orders?limit=5');
      const list = $('recentOrdersList');
      if (orders.length === 0) { list.innerHTML = '<p style="color:var(--text-muted);padding:16px;text-align:center;">No orders yet</p>'; return; }
      list.innerHTML = orders.map(o => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-light);cursor:pointer;" onclick="openOrderDetail(${o.id})">
        <div><strong style="color:var(--text);">#${o.id}</strong><span style="color:var(--text-muted);margin-left:8px;font-size:0.85rem;">${esc(o.customer_name)}</span></div>
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="status-badge ${statusClass(o.status)}">${cap(o.status)}</span>
          <strong style="color:var(--text);">${money(o.total)}</strong>
        </div>
      </div>`).join('');
    } catch(e) {
      $('recentOrdersList').innerHTML = '<p style="color:var(--text-muted);padding:16px;text-align:center;">Failed to load</p>';
    }
  } catch(e) {
    area.innerHTML = '<div style="text-align:center;padding:60px;color:var(--error);"><i class="fas fa-exclamation-circle" style="font-size:2rem;"></i><p style="margin-top:12px;">Failed to load dashboard</p></div>';
  }
}

// ============ ORDERS ============
async function loadOrders() {
  const area = $('contentArea');
  try {
    const orders = await API.get('/api/admin/orders');
    area.innerHTML = `
      <div class="section-toolbar">
        <div class="toolbar-left">
          <select id="orderFilter" class="form-select" onchange="loadOrders()">
            <option value="all">All Orders</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-outline btn-sm" onclick="exportOrders()"><i class="fas fa-download"></i> Export CSV</button>
        </div>
      </div>
      <div class="table-container" id="ordersTableContainer"></div>
    `;
    renderOrdersTable(orders);
  } catch(e) { area.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-muted);">Failed to load orders</p>'; }
}

function renderOrdersTable(orders) {
  const filter = $('orderFilter')?.value || 'all';
  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);
  const container = $('ordersTableContainer');
  if (filtered.length === 0) { container.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg><p>No orders found</p></div>'; return; }
  container.innerHTML = `<table class="data-table"><thead><tr><th>#</th><th>Customer</th><th>Email</th><th>Items</th><th>Date</th><th>Status</th><th>Payment</th><th>Total</th><th></th></tr></thead><tbody>
    ${filtered.map(o => `<tr>
      <td><strong>#${o.id}</strong></td>
      <td>${esc(o.customer_name)}</td>
      <td style="color:var(--text-muted);font-size:0.85rem;">${esc(o.customer_email)}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);font-size:0.85rem;">${(o.items || []).map(i => `${i.product_name} x${i.quantity}`).join(', ')}</td>
      <td style="color:var(--text-muted);font-size:0.85rem;">${shortDate(o.created_at)}</td>
      <td><span class="status-badge ${statusClass(o.status)}">${cap(o.status)}</span></td>
      <td>${getPaymentBadge(o.payment_status)}</td>
      <td style="font-weight:600;">${money(o.total)}</td>
      <td><button class="action-btn view" onclick="openOrderDetail(${o.id})" title="View Order"><i class="fas fa-eye"></i></button></td>
    </tr>`).join('')}
  </tbody></table>`;
}

function getPaymentBadge(ps) {
  const styles = {
    unpaid: 'background:var(--error-light);color:var(--error);',
    awaiting_payment: 'background:var(--warning-light);color:var(--warning);',
    paid: 'background:var(--success-light);color:var(--success);',
    refunded: 'background:var(--primary-light);color:var(--primary);'
  };
  return `<span style="display:inline-flex;padding:3px 12px;border-radius:100px;font-size:0.75rem;font-weight:600;${styles[ps] || styles.unpaid}">${cap(ps || 'unpaid').replace('_', ' ')}</span>`;
}

async function exportOrders() {
  const filter = $('orderFilter')?.value || 'all';
  try {
    // Get a short-lived export session token from the server
    const resp = await fetch('/api/admin/orders/export/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    if (!resp.ok) throw new Error('Failed to generate export token');
    const { token: exportToken } = await resp.json();
    // Open CSV download using the server-side token (no JWT in URL)
    window.open(`/api/admin/orders/export/csv?status=${filter}&token=${exportToken}`, '_blank');
  } catch (e) {
    showToast('Export Failed', e.message || 'Could not generate export');
  }
}

async function openOrderDetail(orderId) {
  try {
    const order = await API.get(`/api/orders/${orderId}`);
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div class="modal modal-lg">
      <div class="modal-header">
        <h2>Order #${order.id}</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="grid-2" style="margin-bottom:20px;">
        <div><label style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Customer</label><div style="margin-top:4px;">${esc(order.customer_name)}</div></div>
        <div><label style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Email</label><div style="margin-top:4px;">${esc(order.customer_email)}</div></div>
        <div><label style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Status</label><div style="margin-top:4px;"><span class="status-badge ${statusClass(order.status)}">${cap(order.status)}</span></div></div>
        <div><label style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Payment</label><div style="margin-top:4px;">${getPaymentBadge(order.payment_status)}</div></div>
        <div style="grid-column:1/-1;"><label style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Shipping</label><div style="margin-top:4px;">${esc(order.shipping_address)}, ${esc(order.city)}, ${esc(order.state)} ${esc(order.zip_code)}</div></div>
      </div>
      <div style="margin-bottom:20px;">
        <label style="font-size:0.85rem;font-weight:600;display:block;margin-bottom:8px;">Items</label>
        <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">
          ${(order.items || []).map(i => `<div style="display:flex;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--border-light);font-size:0.85rem;"><span>${esc(i.product_name)} × ${i.quantity}</span><span style="font-weight:600;">${money(i.price * i.quantity)}</span></div>`).join('')}
          ${order.discount > 0 ? `<div style="display:flex;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--border-light);color:var(--success);font-size:0.85rem;">Discount ${esc(order.coupon_code || '')} <span>-${money(order.discount)}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;padding:12px 16px;font-weight:700;font-size:1rem;background:var(--bg);">Total <span>${money(order.total)}</span></div>
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label>Change Status</label>
          <div style="display:flex;gap:8px;">
            <select id="orderStatusSelect" style="flex:1;">
              <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="confirmed" ${order.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
              <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Shipped</option>
              <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Delivered</option>
              <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
            <button class="btn btn-primary btn-sm" onclick="updateOrderStatus(${order.id})">Update</button>
          </div>
        </div>
        <div class="form-group">
          <label>Tracking Number</label>
          <div style="display:flex;gap:8px;">
            <input type="text" id="trackingInput" value="${esc(order.tracking_number || '')}" style="flex:1;">
            <button class="btn btn-primary btn-sm" onclick="saveTracking(${order.id})">Save</button>
          </div>
        </div>
        <div class="form-group">
          <label>Payment Status</label>
          <div style="display:flex;gap:8px;">
            <select id="paymentStatusSelect" style="flex:1;">
              <option value="unpaid" ${order.payment_status === 'unpaid' ? 'selected' : ''}>Unpaid</option>
              <option value="awaiting_payment" ${order.payment_status === 'awaiting_payment' ? 'selected' : ''}>Awaiting Payment</option>
              <option value="paid" ${order.payment_status === 'paid' ? 'selected' : ''}>Paid</option>
              <option value="refunded" ${order.payment_status === 'refunded' ? 'selected' : ''}>Refunded</option>
            </select>
            <button class="btn btn-primary btn-sm" onclick="updatePayment(${order.id})">Update</button>
          </div>
        </div>
      </div>
      <div style="margin-top:16px;font-size:0.8rem;color:var(--text-muted);">Created: ${dateTime(order.created_at)}</div>
    </div>`;
    document.body.appendChild(modal);
  } catch(e) { showToast('Error', 'Failed to load order'); }
}

async function updateOrderStatus(id) { try { await API.put(`/api/admin/orders/${id}/status`, { status: $('orderStatusSelect').value }); showToast('Success', 'Status updated'); loadOrders(); } catch(e) { showToast('Error', e.message); } }
async function saveTracking(id) { try { await API.put(`/api/admin/orders/${id}/tracking`, { tracking_number: $('trackingInput').value }); showToast('Success', 'Tracking saved'); loadOrders(); } catch(e) { showToast('Error', e.message); } }
async function updatePayment(id) { try { await API.put(`/api/admin/orders/${id}/payment`, { payment_status: $('paymentStatusSelect').value, payment_reference: '' }); showToast('Success', 'Payment updated'); loadOrders(); } catch(e) { showToast('Error', e.message); } }

// ============ PRODUCTS ============
let categories = [];
let productImages = [];
let searchTimeout = null;
let currentVariants = [];

async function loadProducts() {
  const area = $('contentArea');
  try {
    const data = await API.get('/api/admin/products?limit=200');
    const products = data.products || data;
    categories = await API.get('/api/categories');
    area.innerHTML = `
      <div class="section-toolbar">
        <div class="toolbar-left">
          <button class="btn btn-primary btn-sm" onclick="openProductForm()"><i class="fas fa-plus"></i> Add Product</button>
        </div>
        <div class="toolbar-right">
          <div class="search-bar"><i class="fas fa-search"></i><input type="text" id="productSearch" placeholder="Search products..."></div>
        </div>
      </div>
      <div class="table-container" id="productsTableContainer"></div>
    `;
    $('productSearch').addEventListener('input', function() {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => renderProductsTable(products, this.value), 300);
    });
    renderProductsTable(products, '');
  } catch(e) { area.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-muted);">Failed to load products</p>'; }
}

function renderProductsTable(products, search) {
  const filtered = search ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.description || '').toLowerCase().includes(search.toLowerCase())) : products;
  const container = $('productsTableContainer');
  if (filtered.length === 0) { container.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg><p>No products found</p></div>'; return; }
  container.innerHTML = `<table class="data-table"><thead><tr><th></th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Featured</th><th></th></tr></thead><tbody>
    ${filtered.map(p => `<tr>
      <td><img src="${p.image_url || 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=200'}" class="thumb" onerror="this.src='https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=200'"></td>
      <td><strong>${esc(p.name)}</strong></td>
      <td><span style="color:var(--text-muted);font-size:0.85rem;">${p.category_name || '—'}</span></td>
      <td style="font-weight:600;">${money(p.price)}</td>
      <td style="color:${p.in_stock ? 'var(--success)' : 'var(--error)'};font-weight:600;">${p.in_stock ? `${p.stock_count} available` : 'Out of stock'}</td>
      <td>${p.featured ? '<span style="color:var(--warning);"><i class="fas fa-star"></i></span>' : '<span style="color:var(--text-muted);">—</span>'}</td>
      <td><div style="display:flex;gap:4px;">
        <button class="action-btn edit" onclick="openProductForm(${p.id})" title="Edit"><i class="fas fa-pen"></i></button>
        <button class="action-btn view" onclick="openVariantsManager(${p.id}, '${esc(p.name)}')" title="Variants"><i class="fas fa-palette"></i></button>
        <button class="action-btn delete" onclick="deleteProduct(${p.id})" title="Delete"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`).join('')}
  </tbody></table>`;
}

async function openProductForm(productId = null) {
  const isEdit = !!productId;
  const title = isEdit ? 'Edit Product' : 'Add Product';
  const btnText = isEdit ? 'Update Product' : 'Create Product';

  let defaultData = { name: '', slug: '', description: '', price: '', compare_at_price: '', image_url: '', category_id: '', featured: false, in_stock: true, stock_count: 0 };

  if (isEdit) {
    try {
      const data = await API.get('/api/admin/products?limit=200');
      const products_list = data.products || data;
      const p = products_list.find(x => x.id === productId);
      if (p) {
        defaultData = {
          name: p.name, slug: p.slug, description: p.description || '',
          price: p.price, compare_at_price: p.compare_at_price || '',
          image_url: p.image_url || '', category_id: p.category_id || '',
          featured: !!p.featured, in_stock: !!p.in_stock, stock_count: p.stock_count || 0
        };
        try { productImages = JSON.parse(p.images || '[]'); } catch(e) { productImages = []; }
      }
    } catch(e) { showToast('Error', 'Failed to load product'); return; }
  } else { productImages = []; }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };

  modal.innerHTML = `<div class="modal modal-lg">
    <div class="modal-header">
      <h2>${title}</h2>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
    </div>
    <form id="productForm" onsubmit="return false;">
      ${isEdit ? `<input type="hidden" id="editProductId" value="${productId}">` : ''}
      <div class="grid-2">
        <div class="form-group"><label>Product Name</label><input type="text" id="pfName" value="${esc(defaultData.name)}" required placeholder="e.g. Wireless Headphones"></div>
        <div class="form-group"><label>Slug</label><input type="text" id="pfSlug" value="${esc(defaultData.slug)}" required placeholder="wireless-headphones"></div>
      </div>
      <div class="form-group"><label>Description</label><textarea id="pfDesc" rows="3" placeholder="Product description with details...">${esc(defaultData.description)}</textarea></div>
      <div class="grid-2">
        <div class="form-group"><label>Price ($)</label><input type="number" id="pfPrice" step="0.01" value="${defaultData.price}" required placeholder="0.00"></div>
        <div class="form-group"><label>Compare at Price ($)</label><input type="number" id="pfCompare" step="0.01" value="${defaultData.compare_at_price}" placeholder="Original price for discount display"></div>
      </div>
      <div class="grid-2">
        <div class="form-group"><label>Image URL</label><input type="url" id="pfImage" value="${esc(defaultData.image_url)}" placeholder="https://..."></div>
        <div class="form-group"><label>Category</label><select id="pfCategory">
          <option value="">No category</option>
          ${categories.map(c => `<option value="${c.id}" ${defaultData.category_id == c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select></div>
      </div>
      <div class="grid-2" style="align-items:end;">
        <div class="form-group"><label>Stock Count</label><input type="number" id="pfStock" min="0" value="${defaultData.stock_count}" placeholder="0"></div>
        <div style="display:flex;gap:20px;padding-bottom:16px;">
          <label class="checkbox-label"><input type="checkbox" id="pfFeatured" ${defaultData.featured ? 'checked' : ''}> Featured product</label>
          <label class="checkbox-label"><input type="checkbox" id="pfInStock" ${defaultData.in_stock ? 'checked' : ''}> In stock</label>
        </div>
      </div>
      <div style="margin-top:8px;padding-top:16px;border-top:1px solid var(--border-light);">
        <label style="font-size:0.85rem;font-weight:600;display:block;margin-bottom:8px;">Additional Images</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;" id="imagePreviewList">
          ${productImages.map((img, idx) => `<div style="position:relative;width:64px;height:64px;border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--border);"><img src="${esc(img)}" style="width:100%;height:100%;object-fit:cover;"><button type="button" style="position:absolute;top:2px;right:2px;width:20px;height:20px;background:var(--error);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;border:none;cursor:pointer;" onclick="removeProductImage(${idx})">×</button></div>`).join('')}
        </div>
        <div class="drop-zone" style="padding:16px;" onclick="document.getElementById('imageUploadInput').click()">
          <input type="file" id="imageUploadInput" accept="image/*" multiple style="display:none;" onchange="uploadProductImages(this)">
          <p style="font-size:0.85rem;"><i class="fas fa-cloud-upload-alt"></i> Click to upload images</p>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button type="submit" class="btn btn-primary" id="pfSubmitBtn"><i class="fas fa-save"></i> ${btnText}</button>
      </div>
    </form>
  </div>`;
  document.body.appendChild(modal);

  if (!isEdit) {
    $('pfName').addEventListener('input', function() {
      $('pfSlug').value = this.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    });
  }

  // Image upload handler
  window.uploadProductImages = async function(input) {
    const files = input.files;
    if (!files.length) return;
    for (const file of files) {
      try {
        const result = await API.upload(file);
        productImages.push(result.url);
      } catch(e) {
        showToast('Error', 'Failed to upload image');
      }
    }
    input.value = '';
    // Refresh preview
    const preview = document.getElementById('imagePreviewList');
    if (preview) {
      preview.innerHTML = productImages.map((img, idx) =>
        `<div style="position:relative;width:64px;height:64px;border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--border);">
          <img src="${esc(img)}" style="width:100%;height:100%;object-fit:cover;">
          <button type="button" style="position:absolute;top:2px;right:2px;width:20px;height:20px;background:var(--error);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;border:none;cursor:pointer;" onclick="removeProductImage(${idx})">×</button>
        </div>`
      ).join('');
    }
  };

  window.removeProductImage = function(idx) {
    productImages.splice(idx, 1);
    const preview = document.getElementById('imagePreviewList');
    if (preview) {
      preview.innerHTML = productImages.map((img, i) =>
        `<div style="position:relative;width:64px;height:64px;border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--border);">
          <img src="${esc(img)}" style="width:100%;height:100%;object-fit:cover;">
          <button type="button" style="position:absolute;top:2px;right:2px;width:20px;height:20px;background:var(--error);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;border:none;cursor:pointer;" onclick="removeProductImage(${i})">×</button>
        </div>`
      ).join('');
    }
  };

  $('productForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const data = {
      name: $('pfName').value.trim(), slug: $('pfSlug').value.trim(),
      description: $('pfDesc').value.trim(),
      price: parseFloat($('pfPrice').value) || 0,
      compare_at_price: $('pfCompare').value ? parseFloat($('pfCompare').value) : null,
      image_url: $('pfImage').value.trim(), images: productImages,
      category_id: $('pfCategory').value ? parseInt($('pfCategory').value) : null,
      featured: $('pfFeatured').checked, in_stock: $('pfInStock').checked,
      stock_count: parseInt($('pfStock').value) || 0
    };
    const btn = $('pfSubmitBtn');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    try {
      if (isEdit) { await API.put(`/api/admin/products/${productId}`, data); showToast('Success', 'Product updated'); }
      else { await API.post('/api/admin/products', data); showToast('Success', 'Product created'); }
      modal.remove(); loadProducts();
    } catch(err) { showToast('Error', err.message); btn.disabled = false; btn.innerHTML = btnText; }
  });
}

// ============ VARIANTS MANAGER ============
async function openVariantsManager(productId, productName) {
  try {
    const variants = await API.get(`/api/admin/products/${productId}/variants`);
    currentVariants = variants.length ? variants : [];

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.onclick = e => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `<div class="modal modal-lg">
      <div class="modal-header">
        <h2>Variants — ${esc(productName)}</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:16px;">Manage color and size combinations for this product. Each variant has its own stock count.</p>
      <div class="variants-editor">
        <div class="variants-header">
          <span>Color</span>
          <span>Color (Hex)</span>
          <span>Size</span>
          <span>Stock</span>
          <span>Price +/-</span>
          <span></span>
        </div>
        <div class="variants-list" id="variantsList">
          ${currentVariants.length === 0 ? '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:0.85rem;">No variants yet. Add color/size combinations below.</div>' :
            currentVariants.map((v, i) => `
              <div class="variant-row" data-index="${i}">
                <input type="text" class="v-color" value="${esc(v.color)}" placeholder="e.g. Black">
                <div style="display:flex;gap:8px;align-items:center;">
                  <div class="variant-color-preview" style="background:${v.color_hex || '#ccc'};"></div>
                  <input type="text" class="v-hex" value="${esc(v.color_hex || '')}" placeholder="#000000" style="flex:1;">
                </div>
                <input type="text" class="v-size" value="${esc(v.size)}" placeholder="e.g. M">
                <input type="number" class="v-stock" value="${v.stock_count}" min="0" style="width:70px;">
                <input type="number" class="v-price" value="${v.price_modifier}" step="0.01" style="width:70px;" placeholder="+0.00">
                <button class="variant-remove-btn" onclick="removeVariantRow(${i})">×</button>
              </div>
            `).join('')}
        </div>
      </div>
      <button class="btn btn-outline btn-sm" onclick="addVariantRow()" style="margin-bottom:16px;"><i class="fas fa-plus"></i> Add Variant</button>

      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="saveVariants(${productId})"><i class="fas fa-save"></i> Save Variants</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  } catch(e) {
    showToast('Error', 'Failed to load variants');
  }
}

function addVariantRow() {
  const list = document.getElementById('variantsList');
  // Remove empty state if present
  const empty = list.querySelector('div[style*="text-align:center"]');
  if (empty) empty.remove();

  const idx = list.querySelectorAll('.variant-row').length;
  const row = document.createElement('div');
  row.className = 'variant-row';
  row.dataset.index = idx;
  row.innerHTML = `
    <input type="text" class="v-color" placeholder="e.g. Black">
    <div style="display:flex;gap:8px;align-items:center;">
      <div class="variant-color-preview" style="background:#ccc;"></div>
      <input type="text" class="v-hex" placeholder="#000000" style="flex:1;" oninput="this.previousElementSibling.style.background=this.value||'#ccc'">
    </div>
    <input type="text" class="v-size" placeholder="e.g. M">
    <input type="number" class="v-stock" value="0" min="0" style="width:70px;">
    <input type="number" class="v-price" value="0" step="0.01" style="width:70px;" placeholder="+0.00">
    <button class="variant-remove-btn" onclick="removeVariantRow(${idx})">×</button>
  `;
  list.appendChild(row);
}

function removeVariantRow(idx) {
  const list = document.getElementById('variantsList');
  const rows = list.querySelectorAll('.variant-row');
  if (rows.length <= 1) {
    list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:0.85rem;">No variants yet. Add color/size combinations below.</div>';
    return;
  }
  const row = rows[idx];
  if (row) row.remove();
  // Re-index
  list.querySelectorAll('.variant-row').forEach((r, i) => {
    r.dataset.index = i;
    const removeBtn = r.querySelector('.variant-remove-btn');
    if (removeBtn) removeBtn.setAttribute('onclick', `removeVariantRow(${i})`);
  });
}

async function saveVariants(productId) {
  const list = document.getElementById('variantsList');
  const rows = list.querySelectorAll('.variant-row');
  const variants = [];

  rows.forEach(r => {
    const color = r.querySelector('.v-color')?.value || '';
    const color_hex = r.querySelector('.v-hex')?.value || '';
    const size = r.querySelector('.v-size')?.value || '';
    const stock_count = parseInt(r.querySelector('.v-stock')?.value) || 0;
    const price_modifier = parseFloat(r.querySelector('.v-price')?.value) || 0;
    variants.push({ color, color_hex, size, stock_count, price_modifier, is_active: 1 });
  });

  try {
    await API.put(`/api/admin/products/${productId}/variants`, { variants });
    showToast('Success', `${variants.length} variant(s) saved`);
    // Refresh modal
    const name = document.querySelector('.modal-header h2')?.textContent?.replace('Variants — ', '') || '';
    document.querySelector('.modal-overlay.active')?.remove();
    openVariantsManager(productId, name);
  } catch(e) {
    showToast('Error', e.message);
  }
}

async function deleteProduct(id) {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  try { await API.delete(`/api/admin/products/${id}`); showToast('Success', 'Deleted'); loadProducts(); }
  catch(e) { showToast('Error', e.message); }
}

// ============ CATEGORIES ============
async function loadCategories() {
  const area = $('contentArea');
  try {
    const cats = await API.get('/api/categories');
    area.innerHTML = `
      <div class="section-toolbar">
        <div class="toolbar-left">
          <button class="btn btn-primary btn-sm" onclick="openCategoryForm()"><i class="fas fa-plus"></i> Add Category</button>
        </div>
      </div>
      <div class="table-container">${cats.length === 0 ? '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg><p>No categories</p></div>' :
        `<table class="data-table"><thead><tr><th></th><th>Name</th><th>Slug</th><th></th></tr></thead><tbody>
          ${cats.map(c => `<tr><td><img src="${c.image_url || ''}" class="thumb" onerror="this.style.display='none'" style="${!c.image_url ? 'display:none' : ''}"></td>
          <td><strong>${esc(c.name)}</strong></td><td><code style="color:var(--text-muted);font-size:0.85rem;">${esc(c.slug)}</code></td>
          <td><div style="display:flex;gap:4px;"><button class="action-btn edit" onclick="openCategoryForm(${c.id})" title="Edit"><i class="fas fa-pen"></i></button>
          <button class="action-btn delete" onclick="deleteCategory(${c.id})" title="Delete"><i class="fas fa-trash"></i></button></div></td></tr>`).join('')}
        </tbody></table>`}</div>`;
  } catch(e) { area.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-muted);">Failed to load</p>'; }
}

async function openCategoryForm(categoryId = null) {
  const isEdit = !!categoryId;
  let defaults = { name: '', slug: '', description: '', image_url: '' };
  if (isEdit) { try { const cats = await API.get('/api/categories'); const c = cats.find(x => x.id === categoryId); if (c) defaults = c; } catch(e) {} }
  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:420px;">
    <div class="modal-header">
      <h2>${isEdit ? 'Edit' : 'Add'} Category</h2>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
    </div>
    <form id="catForm">
      <div class="form-group"><label>Name</label><input type="text" id="catName" value="${esc(defaults.name)}" required></div>
      <div class="form-group"><label>Slug</label><input type="text" id="catSlug" value="${esc(defaults.slug)}" required></div>
      <div class="form-group"><label>Image URL</label><input type="url" id="catImage" value="${esc(defaults.image_url || '')}"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Create'}</button>
      </div>
    </form>
  </div>`;
  document.body.appendChild(modal);
  if (!isEdit) {
    $('catName').addEventListener('input', function() { $('catSlug').value = this.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); });
  }
  $('catForm').addEventListener('submit', async e => {
    e.preventDefault();
    const d = { name: $('catName').value.trim(), slug: $('catSlug').value.trim(), description: '', image_url: $('catImage').value.trim() };
    try { if (isEdit) { await API.put(`/api/admin/categories/${categoryId}`, d); showToast('Success', 'Updated'); } else { await API.post('/api/admin/categories', d); showToast('Success', 'Created'); } modal.remove(); loadCategories(); }
    catch(err) { showToast('Error', err.message); }
  });
}

async function deleteCategory(id) { if (!confirm('Delete this category?')) return; try { await API.delete(`/api/admin/categories/${id}`); showToast('Success', 'Deleted'); loadCategories(); } catch(e) { showToast('Error', e.message); } }

// ============ CUSTOMERS ============
async function loadCustomers() {
  const area = $('contentArea');
  try {
    const customers = await API.get('/api/admin/customers');
    area.innerHTML = `<div class="table-container">${customers.length === 0 ? '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><p>No customers</p></div>' :
      `<table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Orders</th><th>Spent</th><th>Status</th><th></th></tr></thead><tbody>
        ${customers.map(c => `<tr>
          <td><strong>${esc(c.name)}</strong></td>
          <td style="color:var(--text-muted);">${esc(c.email)}</td>
          <td>${c.order_count}</td>
          <td style="font-weight:600;">${money(c.total_spent)}</td>
          <td>${c.banned ? '<span style="color:var(--error);font-weight:600;">Banned</span>' : '<span style="color:var(--success);">Active</span>'}</td>
          <td><button class="action-btn view" onclick="viewCustomerProfile(${c.id})" title="View"><i class="fas fa-eye"></i></button></td>
        </tr>`).join('')}
      </tbody></table>`}</div>`;
  } catch(e) { area.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-muted);">Failed to load</p>'; }
}

async function viewCustomerProfile(id) {
  try {
    const c = await API.get(`/api/admin/customers/${id}`);
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div class="modal modal-lg">
      <div class="modal-header">
        <h2>${esc(c.name)}</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="grid-3" style="margin-bottom:20px;">
        <div style="padding:16px;border:1px solid var(--border);border-radius:var(--radius);"><div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Email</div><div style="margin-top:4px;">${esc(c.email)}</div></div>
        <div style="padding:16px;border:1px solid var(--border);border-radius:var(--radius);"><div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Orders</div><div style="margin-top:4px;font-weight:600;font-size:1.2rem;">${c.total_orders}</div></div>
        <div style="padding:16px;border:1px solid var(--border);border-radius:var(--radius);"><div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Total Spent</div><div style="margin-top:4px;font-weight:700;font-size:1.2rem;color:var(--success);">${money(c.total_spent)}</div></div>
      </div>
      ${c.orders && c.orders.length > 0 ? `<div style="margin-bottom:20px;"><label style="font-size:0.85rem;font-weight:600;display:block;margin-bottom:8px;">Order History</label>${c.orders.map(o => `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-light);font-size:0.85rem;"><span>#${o.id} — ${shortDate(o.created_at)}</span><span class="status-badge ${statusClass(o.status)}">${cap(o.status)}</span></div>`).join('')}</div>` : ''}
      ${c.wishlist && c.wishlist.length > 0 ? `<div style="margin-bottom:20px;"><label style="font-size:0.85rem;font-weight:600;display:block;margin-bottom:8px;">Wishlist</label><div style="display:flex;flex-wrap:wrap;gap:6px;">${c.wishlist.map(w => `<span style="padding:4px 12px;background:var(--bg);border-radius:100px;font-size:0.8rem;">${esc(w.name)}</span>`).join('')}</div></div>` : ''}
      <button class="btn ${c.banned ? 'btn-primary' : 'btn-danger'} btn-sm" onclick="toggleBan(${c.id})">${c.banned ? '<i class="fas fa-unlock"></i> Unban User' : '<i class="fas fa-ban"></i> Ban User'}</button>
    </div>`;
    document.body.appendChild(modal);
  } catch(e) { showToast('Error', 'Failed to load profile'); }
}

async function toggleBan(id) {
  if (!confirm('Toggle ban for this customer?')) return;
  try { await API.put(`/api/admin/customers/${id}/ban`); showToast('Success', 'Toggled'); loadCustomers(); } catch(e) { showToast('Error', e.message); }
}

// ============ COUPONS ============
async function loadCoupons() {
  const area = $('contentArea');
  try {
    const coupons = await API.get('/api/admin/coupons');
    area.innerHTML = `
      <div class="section-toolbar">
        <div class="toolbar-left">
          <button class="btn btn-primary btn-sm" onclick="openCouponForm()"><i class="fas fa-plus"></i> Create Coupon</button>
        </div>
      </div>
      <div class="table-container">${coupons.length === 0 ? '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"/></svg><p>No coupons yet</p></div>' :
        `<table class="data-table"><thead><tr><th>Code</th><th>Discount</th><th>Min Order</th><th>Uses</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody>
          ${coupons.map(c => `<tr><td><strong style="font-family:monospace;">${esc(c.code)}</strong></td>
            <td>${c.discount_percent > 0 ? `${c.discount_percent}% off` : ''}${c.discount_amount > 0 ? `${money(c.discount_amount)} off` : '—'}</td>
            <td>${c.min_order > 0 ? money(c.min_order) : 'None'}</td>
            <td>${c.max_uses > 0 ? `${c.used_count}/${c.max_uses}` : 'Unlimited'}</td>
            <td style="color:var(--text-muted);font-size:0.85rem;">${c.expires_at ? shortDate(c.expires_at) : 'Never'}</td>
            <td><span style="color:${c.is_active ? 'var(--success)' : 'var(--error)'};font-weight:600;">${c.is_active ? 'Active' : 'Inactive'}</span></td>
            <td><div style="display:flex;gap:4px;"><button class="action-btn edit" onclick="openCouponForm(${c.id})"><i class="fas fa-pen"></i></button>
            <button class="action-btn delete" onclick="deleteCoupon(${c.id})"><i class="fas fa-trash"></i></button></div></td>
          </tr>`).join('')}
        </tbody></table>`}</div>`;
  } catch(e) { area.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-muted);">Failed to load</p>'; }
}

async function openCouponForm(couponId = null) {
  const isEdit = !!couponId;
  let def = { code: '', discount_percent: 0, discount_amount: 0, min_order: 0, max_uses: 0, is_active: true, expires_at: '' };
  if (isEdit) { try { const list = await API.get('/api/admin/coupons'); const c = list.find(x => x.id === couponId); if (c) def = c; } catch(e) {} }
  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:480px;">
    <div class="modal-header">
      <h2>${isEdit ? 'Edit' : 'Create'} Coupon</h2>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
    </div>
    <form id="couponForm">
      <div class="grid-2">
        <div class="form-group"><label>Coupon Code</label><input type="text" id="cpCode" value="${esc(def.code)}" style="text-transform:uppercase;font-family:monospace;" required></div>
        <div class="form-group"><label>Discount %</label><input type="number" id="cpPercent" min="0" max="100" value="${def.discount_percent}"></div>
      </div>
      <div class="grid-2">
        <div class="form-group"><label>Fixed Amount ($)</label><input type="number" id="cpAmount" min="0" step="0.01" value="${def.discount_amount}"></div>
        <div class="form-group"><label>Min Order ($)</label><input type="number" id="cpMin" min="0" step="0.01" value="${def.min_order}"></div>
      </div>
      <div class="grid-2">
        <div class="form-group"><label>Max Uses (0 = unlimited)</label><input type="number" id="cpMaxUses" min="0" value="${def.max_uses}"></div>
        <div class="form-group"><label>Expires</label><input type="date" id="cpExpires" value="${def.expires_at ? def.expires_at.split('T')[0] : ''}"></div>
      </div>
      <label class="checkbox-label"><input type="checkbox" id="cpActive" ${def.is_active ? 'checked' : ''}> Active</label>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Create'}</button>
      </div>
    </form>
  </div>`;
  document.body.appendChild(modal);
  $('couponForm').addEventListener('submit', async e => {
    e.preventDefault();
    const d = {
      code: $('cpCode').value, discount_percent: parseFloat($('cpPercent').value) || 0,
      discount_amount: parseFloat($('cpAmount').value) || 0, min_order: parseFloat($('cpMin').value) || 0,
      max_uses: parseInt($('cpMaxUses').value) || 0, expires_at: $('cpExpires').value || null,
      is_active: $('cpActive').checked
    };
    try { if (isEdit) { await API.put(`/api/admin/coupons/${couponId}`, d); showToast('Success', 'Updated'); } else { await API.post('/api/admin/coupons', d); showToast('Success', 'Created'); } modal.remove(); loadCoupons(); }
    catch(err) { showToast('Error', err.message); }
  });
}
async function deleteCoupon(id) { if (!confirm('Delete this coupon?')) return; try { await API.delete(`/api/admin/coupons/${id}`); showToast('Success', 'Deleted'); loadCoupons(); } catch(e) { showToast('Error', e.message); } }

// ============ STORE SETTINGS (modern tabs) ============
async function loadStoreEditor() {
  const area = $('contentArea');
  try {
    const s = await API.get('/api/admin/settings');
    area.innerHTML = `
      <div class="settings-tabs" id="settingsTabs">
        <button class="settings-tab active" data-settings-tab="general">General</button>
        <button class="settings-tab" data-settings-tab="hero">Hero Section</button>
        <button class="settings-tab" data-settings-tab="contact">Contact</button>
        <button class="settings-tab" data-settings-tab="colors">Colors</button>
        <button class="settings-tab" data-settings-tab="social">Social Links</button>
      </div>
      <div id="settingsContent"></div>
      <div style="margin-top:20px;"><button class="btn btn-primary" onclick="saveSettings()"><i class="fas fa-save"></i> Save All Settings</button></div>
    `;
    window._settings = s;
    window._currentSettingsTab = 'general';
    renderSettingsTab('general');

    document.querySelectorAll('[data-settings-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('[data-settings-tab]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        window._currentSettingsTab = tab.dataset.settingsTab;
        renderSettingsTab(tab.dataset.settingsTab);
      });
    });
  } catch(e) { area.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-muted);">Failed to load settings</p>'; }
}

function renderSettingsTab(tab) {
  const s = window._settings || {};
  const container = $('settingsContent');
  const fields = {
    general: `
      <div class="settings-card">
        <h3><i class="fas fa-store"></i> Store Identity</h3>
        <div class="form-group"><label>Store Name</label><input type="text" id="sStoreName" value="${esc(s.store_name || '')}" class="sf" placeholder="Your store name"></div>
        <div class="form-group"><label>Tagline</label><input type="text" id="sTagline" value="${esc(s.store_tagline || '')}" class="sf" placeholder="A short tagline"></div>
        <div class="form-group"><label>Logo Text</label><input type="text" id="sLogo" value="${esc(s.store_logo || '')}" class="sf" placeholder="Appears in navigation and footer"></div>
        <div class="form-group"><label>Store Description</label><textarea id="sDescription" rows="2" class="sf" placeholder="Describe your store">${esc(s.store_description || '')}</textarea></div>
        <div class="form-group"><label>Footer Description</label><textarea id="sFooter" rows="2" class="sf" placeholder="Footer about text">${esc(s.footer_description || '')}</textarea></div>
      </div>`,
    hero: `
      <div class="settings-card">
        <h3><i class="fas fa-images"></i> Hero Section</h3>
        <div class="form-group"><label>Badge Text</label><input type="text" id="sHeroBadge" value="${esc(s.hero_badge || '')}" class="sf" placeholder="e.g. New Collection"></div>
        <div class="form-group"><label>Title</label><input type="text" id="sHeroTitle" value="${esc(s.hero_title || '')}" class="sf" placeholder="Main heading"></div>
        <div class="form-group"><label>Subtitle</label><textarea id="sHeroSubtitle" rows="2" class="sf" placeholder="Hero subtitle">${esc(s.hero_subtitle || '')}</textarea></div>
      </div>`,
    contact: `
      <div class="settings-card">
        <h3><i class="fas fa-address-card"></i> Contact Information</h3>
        <div class="form-group"><label>Support Email</label><input type="email" id="sSupportEmail" value="${esc(s.support_email || '')}" class="sf" placeholder="support@example.com"></div>
        <div class="form-group"><label>Support Phone</label><input type="tel" id="sSupportPhone" value="${esc(s.support_phone || '')}" class="sf" placeholder="+1 (555) 000-0000"></div>
        <div class="form-group"><label>Address</label><input type="text" id="sSupportAddress" value="${esc(s.support_address || '')}" class="sf" placeholder="123 Main St, City, State"></div>
      </div>`,
    colors: `
      <div class="settings-card">
        <h3><i class="fas fa-palette"></i> Theme Colors</h3>
        <div class="grid-2">
          <div class="form-group"><label>Primary Color</label><div style="display:flex;gap:8px;"><input type="color" id="sPrimaryColor" value="${s.primary_color || '#8b5cf6'}" style="width:44px;height:40px;padding:2px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;"><input type="text" id="sPrimaryColorText" value="${s.primary_color || '#8b5cf6'}" class="sf" style="flex:1;"></div></div>
          <div class="form-group"><label>Accent Color</label><div style="display:flex;gap:8px;"><input type="color" id="sAccentColor" value="${s.accent_color || '#6d28d9'}" style="width:44px;height:40px;padding:2px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;"><input type="text" id="sAccentColorText" value="${s.accent_color || '#6d28d9'}" class="sf" style="flex:1;"></div></div>
        </div>
      </div>`,
    social: `
      <div class="settings-card">
        <h3><i class="fas fa-share-alt"></i> Social Media</h3>
        <div class="grid-2">
          <div class="form-group"><label>Facebook URL</label><input type="url" id="sFacebook" value="${esc(s.facebook_url || '')}" class="sf" placeholder="https://facebook.com/..."></div>
          <div class="form-group"><label>Instagram URL</label><input type="url" id="sInstagram" value="${esc(s.instagram_url || '')}" class="sf" placeholder="https://instagram.com/..."></div>
        </div>
        <div class="grid-2">
          <div class="form-group"><label>Twitter / X URL</label><input type="url" id="sTwitter" value="${esc(s.twitter_url || '')}" class="sf" placeholder="https://twitter.com/..."></div>
          <div class="form-group"><label>LinkedIn URL</label><input type="url" id="sLinkedin" value="${esc(s.linkedin_url || '')}" class="sf" placeholder="https://linkedin.com/..."></div>
        </div>
      </div>`
  };
  container.innerHTML = fields[tab] || '<p>Select a tab</p>';

  // Sync color inputs
  if (tab === 'colors') {
    $('sPrimaryColor').addEventListener('input', function() { $('sPrimaryColorText').value = this.value; });
    $('sPrimaryColorText').addEventListener('input', function() { $('sPrimaryColor').value = this.value; });
    $('sAccentColor').addEventListener('input', function() { $('sAccentColorText').value = this.value; });
    $('sAccentColorText').addEventListener('input', function() { $('sAccentColor').value = this.value; });
  }
}

async function saveSettings() {
  const payload = {};
  document.querySelectorAll('.sf').forEach(el => {
    const key = el.id.replace(/^s/, '').replace(/^./, c => c.toLowerCase());
    if (el.value !== undefined) payload[key] = el.value;
  });
  const fieldMap = {
    storeName: 'store_name', tagline: 'store_tagline', logo: 'store_logo',
    description: 'store_description', footer: 'footer_description',
    heroBadge: 'hero_badge', heroTitle: 'hero_title', heroSubtitle: 'hero_subtitle',
    supportEmail: 'support_email', supportPhone: 'support_phone', supportAddress: 'support_address',
    primaryColor: 'primary_color', primaryColorText: 'primary_color',
    accentColor: 'accent_color', accentColorText: 'accent_color',
    facebook: 'facebook_url', instagram: 'instagram_url', twitter: 'twitter_url', linkedin: 'linkedin_url'
  };
  const finalPayload = {};
  for (const [elId, key] of Object.entries(fieldMap)) {
    const el = $(`s${elId.charAt(0).toUpperCase() + elId.slice(1)}`) || $(`s${elId}`);
    if (el && el.value !== undefined) finalPayload[key] = el.value;
  }
  try {
    await API.put('/api/admin/settings', finalPayload);
    showToast('Success', 'Settings saved');
    syncStoreName();
  } catch(e) { showToast('Error', e.message); }
}

// ============ PAYMENT SETTINGS ============
async function loadPaymentSettings() {
  const area = $('contentArea');
  try {
    const s = await API.get('/api/admin/settings');
    area.innerHTML = `<form id="payForm" style="max-width:600px;">
      <div class="settings-card">
        <h3><i class="fab fa-cash-app"></i> Cash App Payments</h3>
        <div class="grid-2">
          <div class="form-group"><label>Enabled</label>
            <select id="payEnabled">
              <option value="true" ${s.cash_app_enabled === 'true' ? 'selected' : ''}>Enabled</option>
              <option value="false" ${s.cash_app_enabled !== 'true' ? 'selected' : ''}>Disabled</option>
            </select>
          </div>
          <div class="form-group"><label>$Cashtag</label><input type="text" id="payCashtag" value="${esc(s.cash_app_cashtag || '')}" placeholder="$yourcashtag"></div>
        </div>
        <div class="grid-2">
          <div class="form-group"><label>Payment Link</label><input type="url" id="payLink" value="${esc(s.cash_app_payment_link || '')}" placeholder="https://cash.app/..."></div>
          <div class="form-group"><label>Display Name</label><input type="text" id="payName" value="${esc(s.cash_app_display_name || '')}" placeholder="Your Business Name"></div>
        </div>
        <div class="form-group"><label>Note Prefix</label><input type="text" id="payNote" value="${esc(s.cash_app_note_prefix || 'Store order')}"></div>
      </div>
      <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save Payment Settings</button>
    </form>`;
    $('payForm').addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await API.put('/api/admin/settings', {
          cash_app_enabled: $('payEnabled').value, cash_app_cashtag: $('payCashtag').value,
          cash_app_payment_link: $('payLink').value, cash_app_display_name: $('payName').value,
          cash_app_note_prefix: $('payNote').value
        });
        showToast('Success', 'Payment settings saved');
      } catch(err) { showToast('Error', err.message); }
    });
  } catch(e) { area.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-muted);">Failed to load</p>'; }
}

// ============ POLICIES ============
async function loadPolicies() {
  const area = $('contentArea');
  try {
    const s = await API.get('/api/admin/settings');
    area.innerHTML = `<form id="polForm" style="max-width:700px;">
      <div class="settings-card">
        <h3><i class="fas fa-gavel"></i> Store Policies</h3>
        <div class="form-group"><label>Sales Final Notice</label><textarea id="pol1" rows="2" class="sf2">${esc(s.policy_sales_final || '')}</textarea></div>
        <div class="form-group"><label>Returns Policy</label><textarea id="pol2" rows="2" class="sf2">${esc(s.policy_returns || '')}</textarea></div>
        <div class="form-group"><label>Shipping Policy</label><textarea id="pol3" rows="2" class="sf2">${esc(s.policy_shipping || '')}</textarea></div>
        <div class="form-group"><label>Support Policy</label><textarea id="pol4" rows="2" class="sf2">${esc(s.policy_support || '')}</textarea></div>
      </div>
      <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save Policies</button>
    </form>`;
    $('polForm').addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await API.put('/api/admin/settings', {
          policy_sales_final: $('pol1').value, policy_returns: $('pol2').value,
          policy_shipping: $('pol3').value, policy_support: $('pol4').value
        });
        showToast('Success', 'Policies saved');
      } catch(err) { showToast('Error', err.message); }
    });
  } catch(e) { area.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-muted);">Failed to load</p>'; }
}

// ============ SIMPLE TABLE LOADERS ============
async function loadGiftCards() {
  const area = $('contentArea');
  try {
    const items = await API.get('/api/admin/gift-cards');
    area.innerHTML = `<div class="section-toolbar"><div class="toolbar-left"><button class="btn btn-primary btn-sm" onclick="createGiftCard()"><i class="fas fa-plus"></i> Create Gift Card</button></div></div>
      <div class="table-container">${items.length === 0 ? '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg><p>No gift cards</p></div>' :
        `<table class="data-table"><thead><tr><th>Code</th><th>Value</th><th>Balance</th><th>Customer</th><th>Status</th></tr></thead><tbody>
          ${items.map(c => `<tr><td><strong style="font-family:monospace;">${esc(c.code)}</strong></td>
            <td>${money(c.initial_value)}</td><td style="font-weight:600;">${money(c.current_balance)}</td>
            <td style="color:var(--text-muted);font-size:0.85rem;">${esc(c.customer_email || '—')}</td>
            <td>${c.current_balance > 0 ? '<span style="color:var(--success);font-weight:600;">Active</span>' : '<span style="color:var(--text-muted);">Used</span>'}</td>
          </tr>`).join('')}
        </tbody></table>`}</div>`;
  } catch(e) { area.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-muted);">Failed to load</p>'; }
}

async function createGiftCard() {
  const value = prompt('Enter gift card value ($):');
  if (!value || isNaN(value) || parseFloat(value) <= 0) return;
  try {
    await API.post('/api/admin/gift-cards', { initial_value: parseFloat(value) });
    showToast('Success', 'Gift card created');
    loadGiftCards();
  } catch(e) { showToast('Error', e.message); }
}

async function loadNewsletter() {
  const area = $('contentArea');
  try {
    const d = await API.get('/api/admin/newsletter');
    const items = d.subscribers || [];
    area.innerHTML = `<div class="table-container">${items.length === 0 ? '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg><p>No subscribers yet</p></div>' :
      `<table class="data-table"><thead><tr><th>Email</th><th>Subscribed</th></tr></thead><tbody>
        ${items.map(s => `<tr><td>${esc(s.email)}</td><td style="color:var(--text-muted);font-size:0.85rem;">${dateTime(s.created_at)}</td></tr>`).join('')}
      </tbody></table><div style="padding:12px 16px;border-top:1px solid var(--border);font-size:0.85rem;color:var(--text-muted);"><strong>${d.total || items.length}</strong> total subscribers</div>`}</div>`;
  } catch(e) { area.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-muted);">Failed to load</p>'; }
}

async function loadActivity() {
  const area = $('contentArea');
  try {
    const items = await API.get('/api/admin/activity');
    area.innerHTML = `<div class="table-container">${items.length === 0 ? '<div class="empty-state"><p>No activity yet</p></div>' :
      `<table class="data-table"><thead><tr><th>Action</th><th>Details</th><th>Time</th></tr></thead><tbody>
        ${items.map(a => `<tr><td><span class="status-badge" style="background:var(--bg);color:var(--text);">${esc(a.action)}</span></td><td style="color:var(--text-muted);font-size:0.85rem;max-width:300px;">${esc(a.details || '—')}</td><td style="color:var(--text-muted);font-size:0.85rem;">${dateTime(a.created_at)}</td></tr>`).join('')}
      </tbody></table>`}</div>`;
  } catch(e) { area.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-muted);">Failed to load</p>'; }
}

async function loadStaff() {
  const area = $('contentArea');
  try {
    const items = await API.get('/api/admin/staff');
    area.innerHTML = `<div class="section-toolbar"><div class="toolbar-left"><button class="btn btn-primary btn-sm" onclick="createStaffAccount()"><i class="fas fa-plus"></i> Add Staff</button></div></div>
      <div class="table-container">${items.length === 0 ? '<div class="empty-state"><p>No staff accounts</p></div>' :
        `<table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last Login</th><th>Status</th></tr></thead><tbody>
          ${items.map(s => `<tr><td><strong>${esc(s.name)}</strong></td><td style="color:var(--text-muted);">${esc(s.email)}</td>
            <td><span class="status-badge" style="background:${s.role === 'manager' ? 'var(--primary-light)' : 'var(--bg)'};color:${s.role === 'manager' ? 'var(--primary)' : 'var(--text)'};">${cap(s.role)}</span></td>
            <td style="color:var(--text-muted);font-size:0.85rem;">${s.last_login ? dateTime(s.last_login) : 'Never'}</td>
            <td>${s.is_active ? '<span style="color:var(--success);">Active</span>' : '<span style="color:var(--text-muted);">Inactive</span>'}</td>
          </tr>`).join('')}
        </tbody></table>`}</div>`;
  } catch(e) { area.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-muted);">Failed to load</p>'; }
}

async function createStaffAccount() {
  const name = prompt('Staff name:');
  if (!name) return;
  const email = prompt('Staff email:');
  if (!email) return;
  const password = prompt('Password (min 6 chars):');
  if (!password || password.length < 6) { showToast('Error', 'Password must be 6+ characters'); return; }
  try {
    await API.post('/api/admin/staff', { name, email, password, role: 'staff' });
    showToast('Success', 'Staff account created');
    loadStaff();
  } catch(e) { showToast('Error', e.message); }
}

// ============ ANALYTICS ============
async function loadAnalytics() {
  const area = $('contentArea');
  try {
    const a = await API.get('/api/admin/analytics?period=30');
    area.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-icon" style="background:var(--info-light);color:var(--info);"><i class="fas fa-shopping-bag"></i></div>
          <div class="stat-info"><span class="stat-label">Orders (30d)</span><span class="stat-value">${a.metrics.totalOrders}</span></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:var(--success-light);color:var(--success);"><i class="fas fa-dollar-sign"></i></div>
          <div class="stat-info"><span class="stat-label">Revenue (30d)</span><span class="stat-value">${money(a.metrics.totalRevenue)}</span></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:var(--primary-light);color:var(--primary);"><i class="fas fa-chart-line"></i></div>
          <div class="stat-info"><span class="stat-label">Avg Order</span><span class="stat-value">${money(a.metrics.averageOrderValue)}</span></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:var(--warning-light);color:var(--warning);"><i class="fas fa-users"></i></div>
          <div class="stat-info"><span class="stat-label">New Customers</span><span class="stat-value">${a.metrics.newCustomers}</span></div></div>
      </div>
      <div class="card">
        <div class="card-title"><i class="fas fa-star" style="color:var(--warning);"></i> Top Selling Products</div>
        ${(a.topProducts || []).map((p, i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-light);">
          <span><span style="color:var(--text-muted);margin-right:8px;">${i+1}.</span> ${esc(p.product_name)}</span>
          <div><span style="color:var(--text-muted);font-size:0.85rem;">${p.units_sold} units · </span><span style="font-weight:600;color:var(--success);">${money(p.revenue)}</span></div>
        </div>`).join('') || '<p style="color:var(--text-muted);padding:20px;text-align:center;">No sales data</p>'}
      </div>`;
  } catch(e) { area.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-muted);">Failed to load</p>'; }
}

// ============ ADMIN PROFILE ============
async function loadProfile() {
  const area = $('contentArea');
  try {
    const s = await API.get('/api/admin/profile');
    area.innerHTML = `<div style="max-width:500px;">
      <div class="settings-card">
        <h3><i class="fas fa-user-shield"></i> Admin Account</h3>
        <form id="profForm">
          <div class="form-group"><label>Name</label><input type="text" id="profName" value="${esc(s.name)}"></div>
          <div class="form-group"><label>Email</label><input type="email" id="profEmail" value="${esc(s.email)}"></div>
          <div class="form-group"><label>Current Password <span style="color:var(--error);">*</span></label><input type="password" id="profCurPass" required></div>
          <div class="form-group"><label>New Password (leave blank to keep current)</label><input type="password" id="profNewPass"></div>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Update Profile</button>
        </form>
      </div>
    </div>`;
    $('profForm').addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await API.put('/api/admin/profile', {
          name: $('profName').value, email: $('profEmail').value,
          current_password: $('profCurPass').value, new_password: $('profNewPass').value || undefined
        });
        showToast('Success', 'Profile updated');
        syncStoreName();
      } catch(err) { showToast('Error', err.message); }
    });
  } catch(e) { area.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-muted);">Failed to load</p>'; }
}

// ============ INIT ============
navigateTo('dashboard');