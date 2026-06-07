// ============ State Management ============
let products = [];
let categories = [];
let currentCategory = 'all';
let currentPage = 1;
let totalPages = 1;
let searchTimeout = null;
let customerToken = localStorage.getItem('customer_token');
let customerData = null;
let currentSort = 'newest';
let wishlistItems = [];
let storeSettings = {};
let paymentOptions = {};
let selectedPaymentMethod = 'cash_app';
let currentPaymentNote = '';
let cart = JSON.parse(localStorage.getItem('store_cart') || '[]');
let appliedCoupon = null;
let aiEnabled = true;
let currentSearch = '';
let productCount = 0;

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400';

const API = {
  async get(endpoint) {
    const res = await fetch(endpoint);
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'API Error: ' + res.status); }
    return res.json();
  },
  async post(endpoint, data) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Request failed'); }
    return res.json();
  }
};

const API_AUTH = {
  async get(endpoint) {
    const res = await fetch(endpoint, { headers: { 'Authorization': 'Bearer ' + customerToken } });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Request failed'); }
    return res.json();
  },
  async post(endpoint, data) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + customerToken },
      body: JSON.stringify(data)
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Request failed'); }
    return res.json();
  },
  async put(endpoint, data) {
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + customerToken },
      body: JSON.stringify(data)
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Request failed'); }
    return res.json();
  },
  async delete(endpoint) {
    const res = await fetch(endpoint, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + customerToken } });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Request failed'); }
    return res.json();
  }
};

// ============ Persistent Chat Bar ============
function initPersistentChat() {
  const bar = document.getElementById('persistentChatBar');
  const input = document.getElementById('persistentChatInput');
  const send = document.getElementById('persistentChatSend');
  if (!bar || !input || !send) return;

  // Show bar when AI fullscreen is closed
  bar.classList.add('show');

  send.addEventListener('click', () => {
    const text = input.value.trim();
    if (text) {
      // Open fullscreen AI and send query
      openAiPanel();
      const aiInput = document.getElementById('aiInput');
      if (aiInput) aiInput.value = text;
      setTimeout(() => { if (aiInput) askAi(aiInput.value); }, 400);
      input.value = '';
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send.click();
    }
  });

  // Hide when AI fullscreen opens, show when it closes
  const observer = new MutationObserver(() => {
    const overlay = document.getElementById('aiFullscreenOverlay');
    if (overlay && overlay.classList.contains('active')) {
      bar.classList.remove('show');
    } else {
      bar.classList.add('show');
    }
  });
  const overlay = document.getElementById('aiFullscreenOverlay');
  if (overlay) observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
}

// ============ Store Name Sync (from admin settings) ============
// All MRSELLS references are replaced dynamically via applySettingsToDom().
// The HTML uses <span id="storeLogoText"> etc. which get updated automatically.
// No hardcoded name remains — every visual occurrence is controlled by:
//   storeLogoText, storeLogoTextFooter, storeLogoTextFooter2, pageTitle, og tags

// ============ Products ============
async function loadProducts() {
  try {
    let url = '/api/products';
    const params = new URLSearchParams();
    if (currentCategory && currentCategory !== 'all') params.set('category', currentCategory);
    if (currentSearch) params.set('search', currentSearch);
    if (currentPage > 1) params.set('page', currentPage);
    if (currentSort !== 'newest') params.set('sort', currentSort);
    params.set('limit', '12');
    const query = params.toString();
    if (query) url += '?' + query;

    const data = await API.get(url);
    products = data.products || [];
    const pagination = data.pagination || {};
    currentPage = pagination.page || 1;
    totalPages = pagination.totalPages || 1;
    productCount = pagination.total || 0;
    renderProducts(products);
    renderPagination(pagination);
    updateProductCountTitle();
  } catch (err) {
    console.error('Failed to load products:', err);
    renderProducts([]);
  }
}

function updateProductCountTitle() {
  const titleEl = document.getElementById('productsTitle');
  const subtitleEl = document.getElementById('productsSubtitle');
  if (currentCategory !== 'all') {
    const cat = categories.find(c => c.slug === currentCategory);
    if (cat) {
      titleEl.textContent = cat.name;
      subtitleEl.textContent = cat.description || `Browse all ${cat.name.toLowerCase()} products.`;
    } else {
      titleEl.textContent = 'Products';
      subtitleEl.textContent = `Showing our product selection.`;
    }
  } else {
    titleEl.textContent = 'All Products';
    subtitleEl.textContent = productCount > 0
      ? `Showing ${productCount} ${productCount === 1 ? 'product' : 'products'} in our catalog.`
      : 'Browse our complete selection of premium products.';
  }
}

function renderProducts(productsToRender) {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  if (!productsToRender || productsToRender.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
        <h3>No products found</h3>
        <p>${currentSearch ? 'Try a different search term.' : 'Check back soon for new arrivals.'}</p>
      </div>`;
    return;
  }

  grid.innerHTML = productsToRender.map(product => {
    const discount = product.compare_at_price && Number(product.compare_at_price) > Number(product.price)
      ? Math.round((1 - Number(product.price) / Number(product.compare_at_price)) * 100) : 0;
    const inWishlist = wishlistItems.some(w => w.product_id === product.id || w.id === product.id);
    const inStock = product.in_stock && Number(product.stock_count) > 0;

    return `
      <article class="product-card" data-id="${product.id}" onclick="window.location.href='/product/${encodeURIComponent(product.slug)}'" role="link" tabindex="0">
        <div class="product-image-wrapper">
          <img src="${escapeHtml(product.image_url || FALLBACK_IMAGE)}" alt="${escapeHtml(product.name)}" class="product-image" loading="lazy" onerror="this.src='${FALLBACK_IMAGE}'">
          ${discount > 0 ? `<span class="product-badge sale">-${discount}%</span>` : ''}
          ${product.featured && !discount ? `<span class="product-badge featured">Featured</span>` : ''}
          ${!inStock ? `<span class="product-badge out-of-stock" style="top:auto;bottom:12px;">Out of stock</span>` : ''}
          ${customerToken ? `<button class="wishlist-btn ${inWishlist ? 'active' : ''}" onclick="event.stopPropagation(); toggleWishlist(${product.id})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${inWishlist ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>` : ''}
        </div>
        <div class="product-info">
          <span class="product-category">${escapeHtml(product.category_name || 'General')}</span>
          <h3 class="product-name">${escapeHtml(product.name)}</h3>
          <div class="product-price-row">
            <span class="product-price">${formatMoney(product.price)}</span>
            ${product.compare_at_price ? `<span class="product-compare">${formatMoney(product.compare_at_price)}</span>` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function renderPagination(pagination) {
  const container = document.getElementById('pagination');
  if (!container) return;
  if (!pagination || pagination.totalPages <= 1) { container.innerHTML = ''; return; }
  let html = '<div class="pagination">';
  html += `<button class="page-btn" onclick="changePage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>`;
  for (let i = 1; i <= pagination.totalPages; i++) {
    if (i === currentPage || i === 1 || i === pagination.totalPages || Math.abs(i - currentPage) <= 1) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
    } else if (i === currentPage - 2 || i === currentPage + 2) {
      html += '<span class="page-ellipsis">…</span>';
    }
  }
  html += `<button class="page-btn" onclick="changePage(${currentPage + 1})" ${currentPage >= pagination.totalPages ? 'disabled' : ''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button>`;
  html += '</div>';
  container.innerHTML = html;
}

function changePage(page) {
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  loadProducts();
  const el = document.getElementById('products');
  if (el) window.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' });
}

function filterByCategory(slug) {
  currentCategory = slug;
  currentPage = 1;
  document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.category === slug));
  loadProducts();
  const el = document.getElementById('products');
  if (el) window.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' });
}

// ============ Categories ============
async function loadCategories() {
  try {
    categories = await API.get('/api/categories');
    renderCategories();
    buildCategoryFilterTabs();
    updateCategoryCounts();
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

function renderCategories() {
  const grid = document.getElementById('categoriesGrid');
  if (!grid) return;
  if (!categories || categories.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-light);grid-column:1/-1;text-align:center;padding:40px;">No categories yet.</p>';
    return;
  }
  grid.innerHTML = categories.map(cat => {
    const img = cat.image_url || `https://source.unsplash.com/400x300/?${encodeURIComponent(cat.name)}`;
    return `<a class="category-card" href="#products" onclick="event.preventDefault(); filterByCategory('${escapeHtml(cat.slug)}');" data-category-slug="${escapeHtml(cat.slug)}">
      <img src="${escapeHtml(img)}" alt="${escapeHtml(cat.name)}" loading="lazy" onerror="this.src='${FALLBACK_IMAGE}'">
      <div class="category-overlay"><h3>${escapeHtml(cat.name)}</h3><span class="category-count" data-cat-slug="${escapeHtml(cat.slug)}">Loading…</span></div></a>`;
  }).join('');
}

function buildCategoryFilterTabs() {
  const tabs = document.getElementById('filterTabs');
  if (!tabs) return;
  tabs.innerHTML = '<button class="filter-tab active" data-category="all" onclick="filterByCategory(\'all\')">All</button>' +
    categories.map(cat => `<button class="filter-tab" data-category="${escapeHtml(cat.slug)}" onclick="filterByCategory('${escapeHtml(cat.slug)}')">${escapeHtml(cat.name)}</button>`).join('');
}

async function updateCategoryCounts() {
  for (const cat of categories) {
    try {
      const data = await API.get('/api/products?category=' + encodeURIComponent(cat.slug) + '&limit=1');
      const count = data.pagination?.total ?? 0;
      const el = document.querySelector('[data-cat-slug="' + cat.slug + '"]');
      if (el) el.textContent = count + (count === 1 ? ' product' : ' products');
    } catch (e) { /* ignore */ }
  }
}

// ============ Cart ============
function addToCart(productId) {
  const product = products.find(p => p.id === productId);
  if (!product || !product.in_stock) return;
  const existing = cart.find(item => item.product_id === productId);
  if (existing) { existing.quantity += 1; } else {
    cart.push({ product_id: product.id, product_slug: product.slug, product_name: product.name, price: product.price, image_url: product.image_url, quantity: 1 });
  }
  saveCart(); updateCart();
  showToast('Added to Cart', product.name + ' has been added to your cart.');
}

function removeFromCart(productId) { cart = cart.filter(item => item.product_id !== productId); saveCart(); updateCart(); }

function updateQuantity(productId, delta) {
  const item = cart.find(i => i.product_id === productId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) { removeFromCart(productId); } else { saveCart(); updateCart(); }
}

function saveCart() { localStorage.setItem('store_cart', JSON.stringify(cart)); }

function updateCartTotals(subtotal, discount) {
  if (discount === undefined) discount = 0;
  const total = Math.max(0, subtotal - discount);
  const totalEl = document.getElementById('cartTotal');
  if (totalEl) totalEl.textContent = formatMoney(total);
  const coEl = document.getElementById('checkoutTotal');
  if (coEl) coEl.textContent = formatMoney(total);
  const discountRow = document.getElementById('discountRow');
  if (discount > 0) { if (discountRow) discountRow.style.display = 'flex'; const da = document.getElementById('discountAmount'); if (da) da.textContent = '-' + formatMoney(discount); }
  else { if (discountRow) discountRow.style.display = 'none'; }
}

function updateCart() {
  saveCart();
  const badge = document.getElementById('cartBadge');
  if (badge) badge.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
  const itemsContainer = document.getElementById('cartItems');
  if (!itemsContainer) return;
  if (cart.length === 0) {
    itemsContainer.innerHTML = '<div class="cart-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg><p>Your cart is empty</p></div>';
    updateCartTotals(0, 0);
    const cb = document.getElementById('checkoutBtn'); if (cb) cb.disabled = true;
    const cs = document.getElementById('couponSection'); if (cs) cs.style.display = 'none';
    return;
  }
  const cb = document.getElementById('checkoutBtn'); if (cb) cb.disabled = false;
  const cs = document.getElementById('couponSection'); if (cs) cs.style.display = 'block';
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  updateCartTotals(subtotal, appliedCoupon ? appliedCoupon.discount : 0);
  itemsContainer.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img src="${escapeHtml(item.image_url || FALLBACK_IMAGE)}" alt="${escapeHtml(item.product_name)}" onerror="this.src='${FALLBACK_IMAGE}'">
      <div class="cart-item-details">
        <div class="cart-item-name">${escapeHtml(item.product_name)}</div>
        <div class="cart-item-price">${formatMoney(item.price)}</div>
        <div class="cart-item-actions">
          <button class="quantity-btn" onclick="updateQuantity(${item.product_id}, -1)">−</button>
          <span class="quantity">${item.quantity}</span>
          <button class="quantity-btn" onclick="updateQuantity(${item.product_id}, 1)">+</button>
          <button class="remove-item" onclick="removeFromCart(${item.product_id})">Remove</button>
        </div>
      </div>
    </div>`).join('');
}

// ============ Coupon ============
document.getElementById('applyCouponBtn')?.addEventListener('click', async () => {
  const code = document.getElementById('couponInput').value.trim();
  if (!code) return;
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  try {
    const result = await API.post('/api/coupons/validate', { code, subtotal });
    if (result.valid) {
      appliedCoupon = result;
      document.getElementById('couponMessage').innerHTML = '<span style="color:#059669;">Coupon applied! You save ' + formatMoney(result.discount) + '</span>';
      updateCartTotals(subtotal, result.discount);
    }
  } catch (err) {
    appliedCoupon = null;
    document.getElementById('couponMessage').innerHTML = '<span style="color:#dc2626;">' + escapeHtml(err.message) + '</span>';
    updateCartTotals(subtotal, 0);
  }
});

// ============ Cart Sidebar ============
function openCart() { document.getElementById('cartSidebar')?.classList.add('active'); document.getElementById('cartOverlay')?.classList.add('active'); document.body.style.overflow = 'hidden'; }
function closeCart() { document.getElementById('cartSidebar')?.classList.remove('active'); document.getElementById('cartOverlay')?.classList.remove('active'); document.body.style.overflow = ''; }
document.getElementById('cartToggle')?.addEventListener('click', openCart);
document.getElementById('closeCart')?.addEventListener('click', closeCart);
document.getElementById('cartOverlay')?.addEventListener('click', closeCart);

// ============ Checkout ============
async function autoFillCheckoutFromProfile() {
  if (!customerToken) return;
  try {
    const profile = await API_AUTH.get('/api/customers/profile');
    if (profile) {
      const fields = { customerName: profile.name, customerEmail: profile.email, customerPhone: profile.phone, shippingAddress: profile.shipping_address, city: profile.city, state: profile.state, zipCode: profile.zip_code };
      for (const [id, value] of Object.entries(fields)) { const el = document.getElementById(id); if (el && value) el.value = value; }
    }
  } catch (e) { /* best-effort */ }
}

document.getElementById('checkoutBtn')?.addEventListener('click', () => { if (cart.length > 0) openCheckout(); });

function openCheckout() {
  const modal = document.getElementById('checkoutModal');
  const itemsContainer = document.getElementById('checkoutItems');
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = appliedCoupon ? appliedCoupon.discount : 0;
  const total = subtotal - discount;
  currentPaymentNote = buildPaymentNote();
  itemsContainer.innerHTML = (appliedCoupon ? '<div class="checkout-item"><span>Subtotal</span><span>' + formatMoney(subtotal) + '</span></div><div class="checkout-item" style="color:#059669;"><span>Discount</span><span>−' + formatMoney(discount) + '</span></div>' : '') + cart.map(item => '<div class="checkout-item"><span>' + escapeHtml(item.product_name) + ' × ' + item.quantity + '</span><span>' + formatMoney(item.price * item.quantity) + '</span></div>').join('');
  document.getElementById('checkoutTotal').textContent = formatMoney(total);
  renderPaymentOptions(total);
  autoFillCheckoutFromProfile();
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

document.getElementById('closeCheckout')?.addEventListener('click', () => { document.getElementById('checkoutModal').classList.remove('active'); document.body.style.overflow = ''; });
document.getElementById('checkoutModal')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) { document.getElementById('checkoutModal').classList.remove('active'); document.body.style.overflow = ''; } });

function buildPaymentNote() {
  const prefix = (paymentOptions.cash_app && paymentOptions.cash_app.note_prefix) || storeSettings.cash_app_note_prefix || 'Store order';
  return prefix + ' ' + Date.now().toString().slice(-6);
}

function renderPaymentOptions(total) {
  const optionsContainer = document.getElementById('paymentOptions');
  const instructions = document.getElementById('paymentInstructions');
  if (!optionsContainer || !instructions) return;
  const cashApp = paymentOptions.cash_app || {};
  selectedPaymentMethod = 'cash_app';
  if (cashApp.enabled) {
    optionsContainer.innerHTML = '<label class="payment-option active"><input type="radio" name="paymentMethod" value="cash_app" checked><span><strong>Cash App</strong><small>Send ' + formatMoney(total) + ' to ' + escapeHtml(cashApp.display_name || '$Cashtag') + ' and include the payment note.</small></span></label>';
  } else {
    optionsContainer.innerHTML = '<div class="payment-option active" style="cursor:default;"><span><strong>Place your order</strong><small>Your order will be processed after submission.</small></span></div>';
  }
  updatePaymentInstructions(total);
}

function updatePaymentInstructions(total) {
  const instructions = document.getElementById('paymentInstructions');
  const cashApp = paymentOptions.cash_app || {};
  if (!instructions) return;
  if (selectedPaymentMethod !== 'cash_app' || !cashApp.enabled) { instructions.classList.remove('active'); instructions.innerHTML = ''; return; }
  instructions.classList.add('active');
  instructions.innerHTML = '<div><strong>Cash App payment:</strong> Send ' + formatMoney(total) + ' to ' + escapeHtml(cashApp.display_name || '$Cashtag') + '.</div><div><strong>Payment note:</strong> ' + escapeHtml(currentPaymentNote) + '</div><div>Your order will be marked paid after the admin confirms the Cash App payment.</div>' + (cashApp.payment_link ? '<a href="' + escapeHtml(cashApp.payment_link) + '" target="_blank" rel="noopener">Open Cash App</a>' : '');
}

document.getElementById('checkoutForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const formData = {
    customer_name: document.getElementById('customerName').value.trim(),
    customer_email: document.getElementById('customerEmail').value.trim(),
    customer_phone: document.getElementById('customerPhone').value.trim(),
    shipping_address: document.getElementById('shippingAddress').value.trim(),
    city: document.getElementById('city').value.trim(),
    state: document.getElementById('state').value.trim(),
    zip_code: document.getElementById('zipCode').value.trim(),
    items: cart.map(item => ({ product_id: item.product_id, product_name: item.product_name, quantity: item.quantity, price: item.price })),
    coupon_code: appliedCoupon ? appliedCoupon.code : null,
    payment_method: selectedPaymentMethod,
    payment_note: selectedPaymentMethod === 'cash_app' ? currentPaymentNote : '',
    payment_reference: ''
  };
  if (customerData && customerData.id) formData.customer_id = customerData.id;
  try {
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true; submitBtn.innerHTML = 'Processing...';
    const order = await API.post('/api/orders', formData);
    document.getElementById('checkoutModal').classList.remove('active');
    document.body.style.overflow = '';
    cart = []; appliedCoupon = null;
    document.getElementById('couponInput').value = '';
    document.getElementById('couponMessage').innerHTML = '';
    updateCart(); form.reset();
    const cashApp = paymentOptions.cash_app || {};
    let paymentMessage = '';
    if (cashApp.enabled && selectedPaymentMethod === 'cash_app') paymentMessage = ' Send ' + formatMoney(order.total) + ' to ' + escapeHtml(cashApp.display_name || '$Cashtag') + (currentPaymentNote ? ' with note: ' + currentPaymentNote : '');
    showToast('Order Placed', 'Order #' + order.id + ' has been placed successfully.' + paymentMessage);
  } catch (err) { showToast('Error', err.message || 'Failed to place order.', 'error'); }
  finally { const submitBtn = form.querySelector('button[type="submit"]'); submitBtn.disabled = false; submitBtn.textContent = 'Place Order'; }
});

// ============ Mobile Menu ============
document.getElementById('menuToggle')?.addEventListener('click', () => { document.getElementById('navLinks')?.classList.toggle('show'); });
document.querySelectorAll('.nav-links a').forEach(link => { link.addEventListener('click', () => { document.getElementById('navLinks')?.classList.remove('show'); }); });

// ============ Customer Auth ============
function loadCustomerAuth() {
  const token = localStorage.getItem('customer_token');
  const data = localStorage.getItem('customer_data');
  if (token && data) { customerToken = token; try { customerData = JSON.parse(data); } catch (e) { customerData = null; } }
  updateAuthUI();
  if (cart.length > 0) updateCart();
  if (customerToken) loadWishlist();
}

function updateAuthUI() {
  const authContainer = document.getElementById('authContainer');
  if (!authContainer) return;
  const ordersBtn = document.getElementById('ordersBtn');
  const footerOrders = document.getElementById('footerMyOrders');
  if (customerData) {
    authContainer.innerHTML = '<div class="customer-menu"><button class="icon-btn" onclick="toggleCustomerMenu()"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></button><div class="customer-dropdown" id="customerDropdown"><div class="dropdown-header"><strong>' + escapeHtml(customerData.name) + '</strong><small>' + escapeHtml(customerData.email) + '</small></div><a href="/my-orders" onclick="closeCustomerMenu();"><i class="fas fa-box"></i> My Orders</a><a href="#" onclick="event.preventDefault(); openProfileModal(); closeCustomerMenu();"><i class="fas fa-user"></i> My Profile</a><hr><a href="#" onclick="event.preventDefault(); logoutCustomer();"><i class="fas fa-sign-out-alt"></i> Sign Out</a></div></div>';
    if (ordersBtn) ordersBtn.style.display = 'inline-flex';
    if (footerOrders) footerOrders.style.display = 'block';
  } else {
    authContainer.innerHTML = '<button class="signin-btn" onclick="openAuthModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Sign In</button>';
    if (ordersBtn) ordersBtn.style.display = 'none';
    if (footerOrders) footerOrders.style.display = 'none';
  }
}

function toggleCustomerMenu() { document.getElementById('customerDropdown')?.classList.toggle('show'); }
function closeCustomerMenu() { document.getElementById('customerDropdown')?.classList.remove('show'); }
document.addEventListener('click', (e) => { if (!e.target.closest('.customer-menu')) closeCustomerMenu(); });

function logoutCustomer() {
  localStorage.removeItem('customer_token'); localStorage.removeItem('customer_data');
  customerToken = null; customerData = null; wishlistItems = [];
  updateAuthUI(); renderProducts(products);
  showToast('Signed Out', 'You have been signed out.');
}

// ============ Auth Modal ============
function openAuthModal() { document.getElementById('authModal')?.classList.add('active'); document.body.style.overflow = 'hidden'; }
function closeAuthModal() { document.getElementById('authModal')?.classList.remove('active'); document.body.style.overflow = ''; }
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.querySelector('.auth-tab[data-tab="' + tab + '"]')?.classList.add('active');
  document.getElementById({ login: 'authLoginForm', register: 'authRegisterForm' }[tab])?.classList.add('active');
}

document.getElementById('authLoginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  const btn = e.target.querySelector('button[type="submit"]');
  try {
    btn.disabled = true; btn.innerHTML = 'Signing in...'; errorEl.textContent = '';
    const result = await API.post('/api/customers/login', { email, password });
    localStorage.setItem('customer_token', result.token);
    localStorage.setItem('customer_data', JSON.stringify(result.customer));
    customerToken = result.token; customerData = result.customer;
    updateAuthUI(); loadWishlist(); closeAuthModal();
    showToast('Welcome', 'Hi ' + result.customer.name + '!');
  } catch (err) { errorEl.textContent = err.message || 'Login failed.'; }
  finally { btn.disabled = false; btn.innerHTML = 'Sign In'; }
});

document.getElementById('authRegisterForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const errorEl = document.getElementById('registerError');
  const btn = e.target.querySelector('button[type="submit"]');
  if (password.length < 6) { errorEl.textContent = 'Password must be at least 6 characters'; return; }
  try {
    btn.disabled = true; btn.innerHTML = 'Creating account...'; errorEl.textContent = '';
    const result = await API.post('/api/customers/register', { name, email, password });
    localStorage.setItem('customer_token', result.token);
    localStorage.setItem('customer_data', JSON.stringify(result.customer));
    customerToken = result.token; customerData = result.customer;
    updateAuthUI(); loadWishlist(); closeAuthModal();
    showToast('Welcome', 'Account created!');
  } catch (err) { errorEl.textContent = err.message || 'Registration failed.'; }
  finally { btn.disabled = false; btn.innerHTML = 'Create Account'; }
});

// ============ Wishlist ============
async function loadWishlist() {
  if (!customerToken) return;
  try {
    const res = await fetch('/api/customers/wishlist', { headers: { 'Authorization': 'Bearer ' + customerToken } });
    if (res.ok) wishlistItems = await res.json(); else wishlistItems = [];
    if (products.length > 0) renderProducts(products);
  } catch (err) { wishlistItems = []; }
}

async function toggleWishlist(productId) {
  if (!customerToken) { openAuthModal(); return; }
  try {
    const res = await fetch('/api/customers/wishlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + customerToken },
      body: JSON.stringify({ product_id: productId })
    });
    const data = await res.json();
    if (data.wishlisted) { wishlistItems.push({ product_id: productId, id: productId }); showToast('Added to Wishlist', 'Product added to your wishlist'); }
    else { wishlistItems = wishlistItems.filter(w => w.product_id !== productId && w.id !== productId); showToast('Removed', 'Product removed from your wishlist'); }
    renderProducts(products);
  } catch (err) { showToast('Error', err.message || 'Failed to update wishlist', 'error'); }
}

// ============ Store Settings ============
function applyThemeFromSettings(settings) {
  const primary = settings.primary_color || '';
  const accent = settings.accent_color || '';
  if (/^#[0-9a-f]{6}$/i.test(primary)) document.documentElement.style.setProperty('--accent', primary);
  if (/^#[0-9a-f]{6}$/i.test(accent)) document.documentElement.style.setProperty('--accent-dark', accent);
}

function applySettingsToDom(settings) {
  const setText = (id, value) => { const el = document.getElementById(id); if (el && value !== undefined && value !== null && value !== '') el.textContent = value; };
  const storeName = settings.store_name || 'Store';
  const storeLogo = settings.store_logo || storeName;
  const storeTagline = settings.store_tagline || '';
  const storeDesc = settings.store_description || 'Premium products curated for modern living.';
  const aiName = settings.ai_name || 'AI Assistant';
  setText('storeLogoText', storeLogo);
  setText('storeLogoTextFooter', storeLogo);
  setText('storeLogoTextFooter2', storeLogo);
  setText('contactEmail', settings.support_email);
  setText('contactPhone', settings.support_phone);
  setText('contactAddress', settings.support_address);
  setText('footerDescription', settings.footer_description || storeDesc);
  setText('heroBadge', settings.hero_badge);
  setText('heroTitle', settings.hero_title);
  setText('heroSubtitle', settings.hero_subtitle);
  setText('aiChatPageName', aiName);
  setText('aiPanelTitle', aiName);
  setText('aiPanelName', aiName);
  // Set the visible <title id="pageTitle"> element so it always reflects the dynamic store name.
  // The element's initial text is used as the per-page prefix (e.g. "My Orders", "Product").
  const pageTitleEl = document.getElementById('pageTitle');
  const pagePrefix = (pageTitleEl && pageTitleEl.textContent && pageTitleEl.textContent.trim()) || '';
  if (pageTitleEl) pageTitleEl.textContent = pagePrefix;
  // Build document.title. For the main home page, use the tagline; for other pages, append the store name.
  const bodyPageTitle = document.body && document.body.dataset ? (document.body.dataset.pageTitle || '') : '';
  if (pagePrefix && /home|store|landing/i.test(bodyPageTitle || pagePrefix)) {
    // Home/store page: use "<storeName> — <tagline>" or just the store name.
    document.title = storeTagline ? (storeName + ' — ' + storeTagline) : storeName;
  } else if (pagePrefix) {
    // Sub page: use "<pagePrefix> — <storeName>" (or <pagePrefix> | <storeName> on product pages)
    const sep = bodyPageTitle && /product/i.test(bodyPageTitle) ? ' | ' : ' — ';
    document.title = pagePrefix + sep + storeName;
  } else {
    document.title = storeName;
  }
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.content = storeDesc;
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.content = storeTagline ? (storeName + ' — ' + storeTagline) : storeName;
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.content = storeDesc;
  const newsletterSection = document.getElementById('newsletterSection');
  if (newsletterSection) newsletterSection.style.display = settings.enable_newsletter === 'true' ? 'block' : 'none';
  const applySocial = (id, url) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (url && url !== '#' && /^https?:\/\//.test(url)) { el.href = url; el.style.display = 'inline-flex'; }
    else { el.style.display = 'none'; }
  };
  applySocial('socialFacebook', settings.facebook_url);
  applySocial('socialInstagram', settings.instagram_url);
  applySocial('socialTwitter', settings.twitter_url);
  applySocial('socialLinkedin', settings.linkedin_url);
  storeSettings = settings;
  aiEnabled = settings.ai_enabled !== 'false';
  applyThemeFromSettings(settings);
}

async function loadStoreSettings() {
  try {
    const settings = await API.get('/api/settings');
    applySettingsToDom(settings);
    try { paymentOptions = await API.get('/api/payment-options'); } catch (e) { /* optional */ }
    applyThemeFromSettings(settings);
  } catch (err) { console.error('Failed to load store settings:', err); }
}

// ============ Profile Modal ============
function openProfileModal() { const modal = document.getElementById('profileModal'); if (!modal) return; modal.classList.add('active'); document.body.style.overflow = 'hidden'; loadProfileData(); }
function closeProfileModal() { document.getElementById('profileModal')?.classList.remove('active'); document.body.style.overflow = ''; }

async function loadProfileData() {
  if (!customerToken || !customerData) return;
  try {
    const profile = await API_AUTH.get('/api/customers/profile');
    document.getElementById('profileName').value = profile.name || '';
    document.getElementById('profileEmail').value = profile.email || '';
    document.getElementById('profilePhone').value = profile.phone || '';
    document.getElementById('profileAddress').value = profile.shipping_address || '';
    document.getElementById('profileCity').value = profile.city || '';
    document.getElementById('profileState').value = profile.state || '';
    document.getElementById('profileZip').value = profile.zip_code || '';
    document.getElementById('profileAvatar').textContent = getInitial(profile.name);
    if (profile.created_at) { const d = new Date(profile.created_at); document.getElementById('profileMemberSince').textContent = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
    const trackingEl = document.getElementById('profileTrackingInfo');
    if (trackingEl) {
      if (profile.active_tracking_number) {
        const status = String(profile.active_tracking_status || 'shipped').toLowerCase();
        const label = status.charAt(0).toUpperCase() + status.slice(1);
        trackingEl.innerHTML = '<div style="padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-light);display:grid;gap:4px;"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;"><strong style="font-size:0.85rem;">Active Shipment</strong><span style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:100px;font-size:0.75rem;font-weight:600;">' + label + '</span></div><div>Order #' + escapeHtml(String(profile.active_tracking_order_id || '—')) + '</div><div style="color:var(--text-light);">Tracking: ' + escapeHtml(profile.active_tracking_number) + '</div></div>';
      } else { trackingEl.innerHTML = '<div style="padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-light);color:var(--text-light);">No active shipment right now.</div>'; }
    }
    document.getElementById('profileError').textContent = '';
    document.getElementById('profileSuccess').style.display = 'none';
  } catch (err) { document.getElementById('profileError').textContent = err.message || 'Failed to load profile'; }
}

document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('profileName').value.trim();
  const phone = document.getElementById('profilePhone').value.trim();
  const address = document.getElementById('profileAddress').value.trim();
  const city = document.getElementById('profileCity').value.trim();
  const state = document.getElementById('profileState').value.trim();
  const zip = document.getElementById('profileZip').value.trim();
  const errorEl = document.getElementById('profileError');
  const successEl = document.getElementById('profileSuccess');
  const btn = e.target.querySelector('button[type="submit"]');
  try {
    btn.disabled = true; btn.innerHTML = 'Saving...'; errorEl.textContent = ''; successEl.style.display = 'none';
    await API_AUTH.put('/api/customers/profile', { name, phone, shipping_address: address, city, state, zip_code: zip });
    customerData.name = name; localStorage.setItem('customer_data', JSON.stringify(customerData)); updateAuthUI();
    successEl.style.display = 'block'; setTimeout(() => { successEl.style.display = 'none'; }, 3000);
  } catch (err) { errorEl.textContent = err.message || 'Failed to update profile'; }
  finally { btn.disabled = false; btn.innerHTML = 'Save Profile'; }
});
document.getElementById('profileModal')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeProfileModal(); });

// ============ Search + Sort ============
document.getElementById('searchInput')?.addEventListener('input', (e) => {
  const value = e.target.value.trim();
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => { currentSearch = value; currentPage = 1; loadProducts(); }, 300);
});
document.getElementById('sortSelect')?.addEventListener('change', (e) => { currentSort = e.target.value; currentPage = 1; loadProducts(); });

// ============ Newsletter ============
document.getElementById('newsletterForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('newsletterEmail').value.trim();
  const msgEl = document.getElementById('newsletterMessage');
  const btn = e.target.querySelector('button[type="submit"]');
  msgEl.className = 'newsletter-message'; msgEl.textContent = '';
  try { btn.disabled = true; btn.innerHTML = 'Subscribing...'; const res = await API.post('/api/newsletter/subscribe', { email }); msgEl.className = 'newsletter-message success'; msgEl.textContent = res.message || 'Successfully subscribed!'; e.target.reset(); }
  catch (err) { msgEl.className = 'newsletter-message error'; msgEl.textContent = err.message || 'Failed to subscribe.'; }
  finally { btn.disabled = false; btn.innerHTML = 'Subscribe'; }
});

// ============ Hero Cards ============
async function applyHeroCards() {
  try {
    const data = await API.get('/api/products?sort=newest&limit=6&featured=true');
    const featured = (data.products || []).filter(p => p.image_url);
    const cards = [document.getElementById('heroCard1'), document.getElementById('heroCard2'), document.getElementById('heroCard3')];
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]; if (!card) continue;
      const product = featured[i];
      if (product) {
        const img = card.querySelector('img'); if (img) { img.src = product.image_url; img.alt = product.name; img.onerror = () => { img.src = FALLBACK_IMAGE; }; }
        const strong = card.querySelector('.hero-card-body strong'); const span = card.querySelector('.hero-card-body span');
        if (strong) strong.textContent = product.name.length > 22 ? product.name.substring(0, 22) + '…' : product.name;
        if (span) span.textContent = formatMoney(product.price);
        card.onclick = () => { window.location.href = '/product/' + encodeURIComponent(product.slug); };
        card.style.cursor = 'pointer';
      }
    }
  } catch (e) { /* keep defaults */ }
}

// ============ Update Counts ============
async function updateCounts() {
  try { const allData = await API.get('/api/products?limit=1'); const count = allData.pagination?.total || 0; const heroCount = document.getElementById('heroProductCount'); if (heroCount) heroCount.textContent = count + '+'; } catch (e) { /* ignore */ }
  const heroCat = document.getElementById('heroCategoryCount');
  if (heroCat) heroCat.textContent = (categories && categories.length) || 0;
}

// ============ Initialize ============
async function init() {
  loadStoreSettings();
  loadCategories();
  loadProducts();
  loadCustomerAuth();
  initAiAssistant();
  initPersistentChat();
  applyHeroCards();
  updateCounts();
  updateCart();
  document.getElementById('footerYear').textContent = new Date().getFullYear();
}

init();