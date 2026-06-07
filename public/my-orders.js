// My Orders page - shows order history with status timeline

let customerToken = localStorage.getItem('customer_token');
let customerData = null;
let ordersRefreshTimer = null;

function getCustomer() {
  const raw = localStorage.getItem('customer_data');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function formatMoney(n) {
  const num = Number(n || 0);
  return `$${num.toFixed(2)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { 
    month: 'short', day: 'numeric', year: 'numeric', 
    hour: '2-digit', minute: '2-digit' 
  });
}

function setVisible(id, visible) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = visible ? 'block' : 'none';
}

function statusBadge(status) {
  const s = (status || 'pending').toLowerCase();
  const map = {
    pending: { label: 'Pending', cls: 'badge badge-pending' },
    confirmed: { label: 'Confirmed', cls: 'badge badge-confirmed' },
    shipped: { label: 'Shipped', cls: 'badge badge-shipped' },
    delivered: { label: 'Delivered', cls: 'badge badge-delivered' },
    cancelled: { label: 'Cancelled', cls: 'badge badge-cancelled' }
  };
  const item = map[s] || map.pending;
  return `<span class="${item.cls}">${escapeHtml(item.label)}</span>`;
}

function statusDot(status) {
  const s = (status || 'pending').toLowerCase();
  const cls = `status-${s}`;
  return `<span class="timeline-dot ${cls}"></span>`;
}

// Build a timeline of events for an order
function buildTimeline(order) {
  const events = [];
  const created = order.created_at ? new Date(order.created_at) : new Date();
  
  // 1. Order placed
  events.push({
    type: 'status',
    icon: 'order-placed',
    label: 'Order Placed',
    detail: `Order #${order.id} was placed successfully.`,
    date: created,
    isStatus: true,
    orderStatus: 'pending'
  });

  // 2. Confirmed
  if (order.status === 'confirmed' || order.status === 'shipped' || order.status === 'delivered') {
    events.push({
      type: 'status',
      icon: 'confirmed',
      label: 'Order Confirmed',
      detail: 'Your order has been confirmed and is being processed.',
      date: created, // approximate, we use order creation + small offset
      isStatus: true,
      orderStatus: 'confirmed'
    });
  }

  // 3. Tracking
  if (order.tracking_number) {
    events.push({
      type: 'tracking',
      icon: 'tracking',
      label: 'Tracking Number Added',
      detail: `Tracking: ${escapeHtml(order.tracking_number)}`,
      date: created,
      isStatus: true,
      orderStatus: 'shipped'
    });
  }

  // 4. Shipped
  if (order.status === 'shipped' || order.status === 'delivered') {
    events.push({
      type: 'status',
      icon: 'shipped',
      label: 'Shipped',
      detail: order.tracking_number 
        ? `Your order has been shipped. Tracking: ${escapeHtml(order.tracking_number)}` 
        : 'Your order has been shipped.',
      date: created,
      isStatus: true,
      orderStatus: 'shipped'
    });
  }

  // 5. Delivered
  if (order.status === 'delivered') {
    events.push({
      type: 'status',
      icon: 'delivered',
      label: 'Delivered',
      detail: 'Your order has been delivered. Thank you for shopping with us!',
      date: created,
      isStatus: true,
      orderStatus: 'delivered'
    });
  }

  // 6. Cancelled
  if (order.status === 'cancelled') {
    events.push({
      type: 'status',
      icon: 'cancelled',
      label: 'Cancelled',
      detail: 'This order has been cancelled.',
      date: created,
      isStatus: true,
      orderStatus: 'cancelled'
    });
  }

  // 7. Notes from admin (shown as info events)
  if (order.notes) {
    events.push({
      type: 'info',
      icon: 'info',
      label: 'Order Update',
      detail: escapeHtml(order.notes),
      date: created,
      isStatus: false
    });
  }

  return events;
}

function renderOrder(order) {
  const items = order.items || [];
  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discount = Number(order.discount) || 0;
  const timeline = buildTimeline(order);

  return `
    <div class="order-card">
      <div class="order-card-header">
        <div>
          <div class="order-id">Order #${escapeHtml(order.id)}</div>
          <div class="order-date">${formatDate(order.created_at)}</div>
        </div>
        ${statusBadge(order.status)}
      </div>
      <div class="order-card-body">
        <!-- Items -->
        <div class="order-items-list">
          ${items.map(item => `
            <div class="order-item-row">
              <div>
                <span class="item-name">${escapeHtml(item.product_name)}</span>
                <span class="item-qty"> × ${item.quantity}</span>
              </div>
              <span>${formatMoney(item.price * item.quantity)}</span>
            </div>
          `).join('')}
        </div>

        <!-- Totals -->
        ${discount > 0 ? `
          <div class="order-summary-row discount">
            <span>Discount ${order.coupon_code ? `(${escapeHtml(order.coupon_code)})` : ''}</span>
            <span>-${formatMoney(discount)}</span>
          </div>
        ` : ''}
        <div class="order-summary-row total">
          <span>Total</span>
          <span>${formatMoney(order.total)}</span>
        </div>

        <!-- Timeline -->
        <div class="order-timeline">
          <h4>Order Updates</h4>
          ${timeline.map((event, idx) => `
            <div class="timeline-item">
              ${event.isStatus ? statusDot(event.orderStatus) : '<span class="timeline-dot info"></span>'}
              <div class="timeline-content">
                <div class="timeline-label">${event.label}</div>
                <div class="timeline-detail">${event.detail}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Shipping Address -->
        <div class="order-address">
          <strong>Shipping Address</strong><br>
          ${escapeHtml(order.shipping_address)}, ${escapeHtml(order.city)}, ${escapeHtml(order.state)} ${escapeHtml(order.zip_code)}
          ${order.customer_phone ? `<br>Phone: ${escapeHtml(order.customer_phone)}` : ''}
        </div>
      </div>
    </div>
  `;
}

async function apiGet(endpoint) {
  const token = localStorage.getItem('customer_token');
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function showActiveTracking(profile) {
  const banner = document.getElementById('activeShipmentBanner');
  const resultDiv = document.getElementById('trackingResult');
  if (!banner || !resultDiv) return;

  if (!profile || !profile.active_tracking_number) {
    banner.innerHTML = '';
    resultDiv.innerHTML = '';
    return;
  }

  const status = String(profile.active_tracking_status || 'shipped').toLowerCase();
  const label = status.charAt(0).toUpperCase() + status.slice(1);

  banner.innerHTML = `
    <div style="padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);display:grid;gap:4px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <strong style="font-size:0.85rem;">Active Shipment From Your Profile</strong>
        <span class="badge badge-${status}">${label}</span>
      </div>
      <div style="font-size:0.85rem;color:var(--text-light);">Order #${escapeHtml(profile.active_tracking_order_id || '—')}</div>
      <div style="font-size:0.85rem;color:var(--text-light);">Tracking ${escapeHtml(profile.active_tracking_number)}</div>
    </div>
  `;

  // Auto-fill the tracking input
  const input = document.getElementById('trackingInput');
  if (input) input.value = profile.active_tracking_number;

  // Auto-display the tracking result immediately
  await lookupTracking();
}

async function loadOrders() {
  const listEl = document.getElementById('ordersList');
  const loadingEl = document.getElementById('ordersLoading');
  const authRequiredEl = document.getElementById('authRequired');
  const noOrdersEl = document.getElementById('noOrders');

  customerData = getCustomer();
  customerToken = localStorage.getItem('customer_token');

  // Show loading initially
  if (loadingEl) loadingEl.style.display = 'block';
  if (listEl) listEl.innerHTML = '';
  if (authRequiredEl) authRequiredEl.style.display = 'none';
  if (noOrdersEl) noOrdersEl.style.display = 'none';

  if (!customerToken || !customerData) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (authRequiredEl) authRequiredEl.style.display = 'block';
    return;
  }

  try {
    // Load profile to get active tracking number
    let profile = null;
    try {
      profile = await apiGet('/api/customers/profile');
    } catch (_) {}

    await showActiveTracking(profile);

    const data = await apiGet('/api/customers/orders');
    const orders = Array.isArray(data) ? data : [];

    if (loadingEl) loadingEl.style.display = 'none';

    if (!orders.length) {
      if (noOrdersEl) noOrdersEl.style.display = 'block';
      return;
    }

    if (listEl) {
      listEl.innerHTML = orders.map(renderOrder).join('');
    }
  } catch (err) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (noOrdersEl) noOrdersEl.style.display = 'none';
    if (authRequiredEl) {
      authRequiredEl.style.display = 'block';
      const p = authRequiredEl.querySelector('p');
      if (p) p.textContent = err.message || 'Failed to load orders. Please sign in again.';
    }
  }
}

// Auth modal functions
function openAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.querySelector(`.auth-tab[data-tab="${tab}"]`).classList.add('active');
  const formIds = { login: 'authLoginForm', register: 'authRegisterForm' };
  document.getElementById(formIds[tab]).classList.add('active');
}

// Auth form handlers
document.getElementById('authLoginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  const btn = e.target.querySelector('button[type="submit"]');

  try {
    btn.disabled = true;
    btn.innerHTML = 'Signing in...';
    errorEl.textContent = '';
    
    const res = await fetch('/api/customers/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Login failed');
    
    localStorage.setItem('customer_token', result.token);
    localStorage.setItem('customer_data', JSON.stringify(result.customer));
    customerToken = result.token;
    customerData = result.customer;
    closeAuthModal();
    loadOrders();
  } catch (err) {
    errorEl.textContent = err.message || 'Login failed. Please try again.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sign In';
  }
});

document.getElementById('authRegisterForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const errorEl = document.getElementById('registerError');
  const btn = e.target.querySelector('button[type="submit"]');

  if (password.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters';
    return;
  }

  try {
    btn.disabled = true;
    btn.innerHTML = 'Creating account...';
    errorEl.textContent = '';
    
    const res = await fetch('/api/customers/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Registration failed');
    
    localStorage.setItem('customer_token', result.token);
    localStorage.setItem('customer_data', JSON.stringify(result.customer));
    customerToken = result.token;
    customerData = result.customer;
    closeAuthModal();
    loadOrders();
  } catch (err) {
    errorEl.textContent = err.message || 'Registration failed. Please try again.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Create Account';
  }
});

async function lookupTracking() {
  const input = document.getElementById('trackingInput');
  const resultDiv = document.getElementById('trackingResult');
  const trackingNumber = input.value.trim();
  
  if (!trackingNumber) {
    resultDiv.innerHTML = '<span style="color:#dc2626;font-size:0.85rem;">Please enter a tracking number</span>';
    return;
  }

  resultDiv.innerHTML = '<span style="color:var(--text-light);font-size:0.85rem;">Looking up tracking number...</span>';

  try {
    const res = await fetch(`/api/track/${encodeURIComponent(trackingNumber)}`);
    const data = await res.json();

    if (!res.ok) {
      resultDiv.innerHTML = `<span style="color:#dc2626;font-size:0.85rem;">${data.error || 'No order found with that tracking number'}</span>`;
      return;
    }

    const itemsList = (data.items || []).map(i => `${escapeHtml(i.product_name)} × ${i.quantity}`).join(', ');
    const statusLabels = {
      pending: 'Pending', confirmed: 'Confirmed', shipped: 'Shipped',
      delivered: 'Delivered', cancelled: 'Cancelled'
    };
    const statusLabel = statusLabels[data.status] || data.status;

    resultDiv.innerHTML = `
      <div style="padding:12px;background:var(--bg);border-radius:var(--radius-sm);border:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong>Order #${escapeHtml(data.id)}</strong>
          <span class="badge badge-${data.status}">${escapeHtml(statusLabel)}</span>
        </div>
        <div style="font-size:0.85rem;color:var(--text-light);margin-bottom:4px;">
          Items: ${itemsList || '—'}
        </div>
        <div style="font-size:0.85rem;color:var(--text-light);margin-bottom:4px;">
          Shipping to: ${escapeHtml(data.shipping_address)}, ${escapeHtml(data.city)}, ${escapeHtml(data.state)} ${escapeHtml(data.zip_code)}
        </div>
        <div style="font-size:0.85rem;">
          <strong>Tracking:</strong> ${escapeHtml(data.tracking_number)}
        </div>
        <div style="font-size:0.8rem;color:var(--text-light);margin-top:6px;">
          Ordered: ${formatDate(data.created_at)}
        </div>
        ${data.total ? `<div style="font-weight:600;margin-top:6px;">Total: ${formatMoney(data.total)}</div>` : ''}
      </div>
    `;
  } catch (err) {
    resultDiv.innerHTML = `<span style="color:#dc2626;font-size:0.85rem;">Failed to look up tracking number. Please try again.</span>`;
  }
}

// Allow pressing Enter in the tracking input
document.getElementById('trackingInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    lookupTracking();
  }
});

function startOrdersRefreshLoop() {
  if (ordersRefreshTimer) return;
  ordersRefreshTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (!localStorage.getItem('customer_token')) return;
    loadOrders();
  }, 45000);
}

window.addEventListener('focus', () => {
  if (localStorage.getItem('customer_token')) {
    loadOrders();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && localStorage.getItem('customer_token')) {
    loadOrders();
  }
});

// Close modals on overlay click
document.getElementById('authModal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeAuthModal();
});

// Load orders on page load
loadOrders();
startOrdersRefreshLoop();
