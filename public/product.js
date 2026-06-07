let product = null;
let relatedProducts = [];
let quantity = 1;
let appliedCoupon = null;
let cart = JSON.parse(localStorage.getItem('store_cart') || '[]');
let storeSettings = {};

const API = {
  async get(endpoint) {
    const res = await fetch(endpoint);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `API Error: ${res.status}`);
    }
    return res.json();
  },
  async post(endpoint, data) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  }
};

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function slugFromPath() {
  const match = window.location.pathname.match(/^\/product\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function getFallbackImage() {
  return 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900';
}

function setStoreBrand(settings) {
  const name = settings.store_name || 'Store';
  const logo = document.getElementById('storeLogoText');
  const footerLogo = document.getElementById('storeLogoTextFooter');
  if (logo) logo.textContent = name;
  if (footerLogo) footerLogo.textContent = name;
  document.title = `${product ? product.name : 'Product'} | ${name}`;
}

function updateCartBadge() {
  const badge = document.getElementById('cartBadge');
  if (!badge) return;
  const totalItems = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  badge.textContent = totalItems;
}

function saveCart() {
  localStorage.setItem('store_cart', JSON.stringify(cart));
  updateCartBadge();
}

function addToCart(productItem, addQuantity = quantity) {
  if (!productItem || !productItem.in_stock) return;
  const qty = Math.max(1, Math.min(Number(addQuantity || 1), Number(productItem.stock_count || 1)));
  const existing = cart.find(item => item.product_id === productItem.id);
  if (existing) {
    existing.quantity = Math.min(Number(productItem.stock_count || 1), Number(existing.quantity || 0) + qty);
  } else {
    cart.push({
      product_id: productItem.id,
      product_name: productItem.name,
      price: Number(productItem.price),
      image_url: productItem.image_url,
      quantity: qty
    });
  }
  saveCart();
  updateCart();
  showToast('Added to Cart', `${productItem.name} has been added to your cart.`);
}

function removeFromCart(productId) {
  cart = cart.filter(item => item.product_id !== productId);
  saveCart();
  updateCart();
}

function updateQuantityInCart(productId, delta) {
  const item = cart.find(entry => entry.product_id === productId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    removeFromCart(productId);
  } else {
    saveCart();
    updateCart();
  }
}

function updateCartTotals(subtotal, discount = 0) {
  const total = subtotal - discount;
  const cartTotal = document.getElementById('cartTotal');
  const checkoutTotal = document.getElementById('checkoutTotal');
  if (cartTotal) cartTotal.textContent = formatMoney(total);
  if (checkoutTotal) checkoutTotal.textContent = formatMoney(total);

  const discountRow = document.getElementById('discountRow');
  const discountAmount = document.getElementById('discountAmount');
  if (discountRow && discountAmount) {
    if (discount > 0) {
      discountRow.style.display = 'flex';
      discountAmount.textContent = `-${formatMoney(discount)}`;
    } else {
      discountRow.style.display = 'none';
    }
  }
}

function updateCart() {
  const itemsContainer = document.getElementById('cartItems');
  const checkoutBtn = document.getElementById('checkoutBtn');
  const couponSection = document.getElementById('couponSection');

  if (!itemsContainer || !checkoutBtn) return;

  const hasItems = cart.length > 0;
  checkoutBtn.disabled = !hasItems;
  if (couponSection) couponSection.style.display = hasItems ? 'block' : 'none';

  if (!hasItems) {
    itemsContainer.innerHTML = `
      <div class="cart-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        <p>Your cart is empty</p>
      </div>
    `;
    updateCartTotals(0, 0);
    return;
  }

  const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  updateCartTotals(subtotal, appliedCoupon ? appliedCoupon.discount : 0);

  itemsContainer.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img src="${item.image_url || getFallbackImage()}" alt="${escapeHtml(item.product_name)}" onerror="this.src='${getFallbackImage()}'">
      <div class="cart-item-details">
        <div class="cart-item-name">${escapeHtml(item.product_name)}</div>
        <div class="cart-item-price">${formatMoney(item.price)}</div>
        <div class="cart-item-actions">
          <button class="quantity-btn" onclick="updateQuantityInCart(${item.product_id}, -1)" aria-label="Decrease quantity">-</button>
          <span class="quantity">${item.quantity}</span>
          <button class="quantity-btn" onclick="updateQuantityInCart(${item.product_id}, 1)" aria-label="Increase quantity">+</button>
          <button class="remove-item" onclick="removeFromCart(${item.product_id})">Remove</button>
        </div>
      </div>
    </div>
  `).join('');
}

function openCart() {
  document.getElementById('cartSidebar')?.classList.add('active');
  document.getElementById('cartOverlay')?.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  document.getElementById('cartSidebar')?.classList.remove('active');
  document.getElementById('cartOverlay')?.classList.remove('active');
  document.body.style.overflow = '';
}

async function autoFillCheckout() {
  // Check if customer is logged in (same token used by main store app.js)
  const customerToken = localStorage.getItem('customer_token');
  if (!customerToken) return;

  try {
    const res = await fetch('/api/customers/profile', {
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    if (!res.ok) return;
    const profile = await res.json();
    
    if (profile) {
      const nameField = document.getElementById('customerName');
      const emailField = document.getElementById('customerEmail');
      const phoneField = document.getElementById('customerPhone');
      const addressField = document.getElementById('shippingAddress');
      const cityField = document.getElementById('city');
      const stateField = document.getElementById('state');
      const zipField = document.getElementById('zipCode');
      
      // Always auto-fill all fields from the customer's saved profile
      if (nameField && profile.name) nameField.value = profile.name;
      if (emailField && profile.email) emailField.value = profile.email;
      if (phoneField && profile.phone) phoneField.value = profile.phone;
      if (addressField && profile.shipping_address) addressField.value = profile.shipping_address;
      if (cityField && profile.city) cityField.value = profile.city;
      if (stateField && profile.state) stateField.value = profile.state;
      if (zipField && profile.zip_code) zipField.value = profile.zip_code;
    }
  } catch (e) {
    // Auto-fill is optional, silently fail
  }
}

function openCheckout() {
  const modal = document.getElementById('checkoutModal');
  const itemsContainer = document.getElementById('checkoutItems');
  if (!modal || !itemsContainer) return;

  const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  const discount = appliedCoupon ? appliedCoupon.discount : 0;
  const total = subtotal - discount;

  itemsContainer.innerHTML = (appliedCoupon ? `
    <div class="checkout-item">
      <span>Subtotal</span>
      <span>${formatMoney(subtotal)}</span>
    </div>
    <div class="checkout-item" style="color:#059669;">
      <span>Discount ${appliedCoupon.code ? `(${escapeHtml(appliedCoupon.code)})` : ''}</span>
      <span>-${formatMoney(discount)}</span>
    </div>
  ` : '') + cart.map(item => `
    <div class="checkout-item">
      <span>${escapeHtml(item.product_name)} x ${item.quantity}</span>
      <span>${formatMoney(item.price * item.quantity)}</span>
    </div>
  `).join('');

  document.getElementById('checkoutTotal').textContent = formatMoney(total);

  // Show sales final notice in checkout
  const checkoutNotice = document.getElementById('checkoutSalesNotice');
  const checkoutSalesText = document.getElementById('checkoutSalesText');
  if (checkoutNotice && checkoutSalesText && storeSettings.policy_sales_final) {
    checkoutSalesText.textContent = storeSettings.policy_sales_final;
    checkoutNotice.style.display = 'flex';
  }

  // Auto-fill customer info from saved profile if logged in
  autoFillCheckout();

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeCheckout() {
  document.getElementById('checkoutModal')?.classList.remove('active');
  document.body.style.overflow = '';
}

function showToast(title, message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastMessage').textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function setQuantity(nextQuantity) {
  if (!product || !product.in_stock) return;
  quantity = Math.max(1, Math.min(nextQuantity, Number(product.stock_count || 1)));
  const quantityValue = document.getElementById('quantityValue');
  if (quantityValue) quantityValue.textContent = String(quantity);
}

function renderProduct() {
  if (!product) return;

  const discount = product.compare_at_price ? Math.round((1 - Number(product.price) / Number(product.compare_at_price)) * 100) : 0;
  const image = document.getElementById('productImage');
  const breadcrumb = document.getElementById('breadcrumbProduct');
  const badge = document.getElementById('productBadge');
  const category = document.getElementById('productCategory');
  const name = document.getElementById('productName');
  const availability = document.getElementById('productAvailability');
  const price = document.getElementById('productPrice');
  const compare = document.getElementById('productCompare');
  const chip = document.getElementById('discountChip');
  const shortDescription = document.getElementById('productShortDescription');
  const description = document.getElementById('productDescription');
  const sku = document.getElementById('productSku');
  const categoryName = document.getElementById('productCategoryName');
  const stockCount = document.getElementById('productStockCount');
  const badgeText = document.getElementById('productBadgeText');
  const detailsList = document.getElementById('detailsList');
  const promiseList = document.getElementById('promiseList');
  const notFound = document.getElementById('notFoundState');
  const state = document.getElementById('productState');

  if (notFound) notFound.style.display = 'none';
  if (state) state.style.display = 'grid';

  if (image) {
    image.src = product.image_url || getFallbackImage();
    image.alt = product.name;
    image.onerror = () => { image.src = getFallbackImage(); };
  }

  // Render thumbnail gallery from additional images
  const thumbnailsContainer = document.getElementById('productThumbnails');
  if (thumbnailsContainer) {
    let allImages = [];
    try {
      allImages = product.images ? JSON.parse(product.images) : [];
    } catch (e) {
      allImages = [];
    }
    // Include primary image as first thumbnail if there are additional images
    if (allImages.length > 0) {
      const primaryImg = product.image_url || getFallbackImage();
      const uniqueImages = [primaryImg, ...allImages.filter(u => u !== primaryImg)];
      thumbnailsContainer.style.display = 'flex';
      thumbnailsContainer.innerHTML = uniqueImages.map((url, i) => `
        <img src="${url}" alt="${escapeHtml(product.name)} image ${i + 1}"
             style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:2px solid ${i === 0 ? 'var(--accent)' : 'var(--border)'};cursor:pointer;transition:border-color 0.2s;"
             onmouseover="this.style.borderColor='var(--accent)'"
             onmouseout="this.style.borderColor='${i === 0 ? 'var(--accent)' : 'var(--border)'}'"
             onclick="document.getElementById('productImage').src='${url}'; document.querySelectorAll('.product-thumbnails img').forEach((img,idx)=>{img.style.borderColor=idx===${i}?'var(--accent)':'var(--border)'});"
             onerror="this.src='${getFallbackImage()}'">
      `).join('');
    } else {
      thumbnailsContainer.style.display = 'none';
      thumbnailsContainer.innerHTML = '';
    }
  }

  if (breadcrumb) breadcrumb.textContent = product.name;
  if (badge) badge.textContent = product.featured ? 'Featured' : 'In Stock';
  if (category) category.textContent = product.category_name || 'General';
  if (name) name.textContent = product.name;
  if (availability) {
    availability.textContent = product.in_stock ? `${Number(product.stock_count || 0)} in stock` : 'Out of stock';
    availability.style.color = product.in_stock ? '#059669' : '#dc2626';
    availability.style.background = product.in_stock ? 'rgba(5, 150, 105, 0.1)' : 'rgba(220, 38, 38, 0.1)';
  }
  if (price) price.textContent = formatMoney(product.price);
  if (compare) {
    if (product.compare_at_price) {
      compare.textContent = formatMoney(product.compare_at_price);
      compare.style.display = 'inline-block';
    } else {
      compare.style.display = 'none';
    }
  }
  if (chip) {
    if (discount > 0) {
      chip.style.display = 'inline-flex';
      chip.textContent = `Save ${discount}%`;
    } else {
      chip.style.display = 'none';
    }
  }
  if (shortDescription) shortDescription.textContent = product.description || '';
  if (description) description.textContent = product.description || 'No description available.';
  if (sku) sku.textContent = `#${product.id}`;
  if (categoryName) categoryName.textContent = product.category_name || 'General';
  if (stockCount) stockCount.textContent = `${Number(product.stock_count || 0)} units`;
  if (badgeText) badgeText.textContent = product.featured ? 'Top seller' : 'New arrival';
  if (detailsList) {
    detailsList.innerHTML = `
      <li><span>Product ID</span><strong>#${product.id}</strong></li>
      <li><span>Category</span><strong>${escapeHtml(product.category_name || 'General')}</strong></li>
      <li><span>Availability</span><strong>${product.in_stock ? 'Ready to ship' : 'Out of stock'}</strong></li>
      <li><span>Price</span><strong>${formatMoney(product.price)}</strong></li>
      ${product.compare_at_price ? `<li><span>Compare at</span><strong>${formatMoney(product.compare_at_price)}</strong></li>` : ''}
    `;
  }
  if (promiseList) {
    promiseList.innerHTML = `
      <div class="promise-item">
        <i class="fa-solid fa-gavel"></i>
        <div>
          <strong>All sales are final</strong>
          <span>Please review your order carefully before purchasing.</span>
        </div>
      </div>
      <div class="promise-item">
        <i class="fa-solid fa-headset"></i>
        <div>
          <strong>Contact customer support</strong>
          <span>If you have a real issue, reach out to our support team for help.</span>
        </div>
      </div>
      <div class="promise-item">
        <i class="fa-solid fa-truck-fast"></i>
        <div>
          <strong>Fast processing</strong>
          <span>Orders are processed and shipped as quickly as possible.</span>
        </div>
      </div>
    `;
  }

  setQuantity(1);
  updateProductControls();
}

function updateProductControls() {
  const minus = document.getElementById('qtyMinus');
  const plus = document.getElementById('qtyPlus');
  const addBtn = document.getElementById('addToCartBtn');
  const buyNowBtn = document.getElementById('buyNowBtn');
  if (!product) return;

  if (minus) minus.disabled = quantity <= 1;
  if (plus) plus.disabled = !product.in_stock || quantity >= Number(product.stock_count || 1);
  if (addBtn) addBtn.disabled = !product.in_stock;
  if (buyNowBtn) buyNowBtn.disabled = !product.in_stock;
}

function renderRelated(items) {
  const grid = document.getElementById('relatedGrid');
  if (!grid) return;
  if (!items || items.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:32px 0;color:var(--text-light);">No related products found.</div>`;
    return;
  }

  grid.innerHTML = items.map(item => `
    <div class="related-card" onclick="window.location.href='/product/${encodeURIComponent(item.slug)}'">
      <img src="${item.image_url || getFallbackImage()}" alt="${escapeHtml(item.name)}" onerror="this.src='${getFallbackImage()}'">
      <div class="related-info">
        <span class="category">${escapeHtml(item.category_name || 'General')}</span>
        <h3>${escapeHtml(item.name)}</h3>
        <div class="price">${formatMoney(item.price)}</div>
        <button class="btn btn-outline btn-sm" type="button" onclick="event.stopPropagation(); window.location.href='/product/${encodeURIComponent(item.slug)}'">View Product</button>
      </div>
    </div>
  `).join('');
}

function activateTab(tabName) {
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
  const activePanel = document.getElementById(`tab-${tabName}`);
  if (activePanel) activePanel.classList.add('active');
}

function loadRelatedProducts() {
  if (!product) return;
  API.get(`/api/products/${encodeURIComponent(product.slug)}/related`)
    .then(items => {
      relatedProducts = items || [];
      renderRelated(relatedProducts);
    })
    .catch(() => {
      renderRelated([]);
    });
}

function loadStoreSettings() {
  return API.get('/api/settings')
    .then(settings => {
      storeSettings = settings || {};
      setStoreBrand(storeSettings);
      renderPoliciesFromSettings();
    })
    .catch(() => {
      setStoreBrand({});
    });
}

function renderPoliciesFromSettings() {
  const s = storeSettings;
  if (!s || Object.keys(s).length === 0) return;

  // Sales final notice banner on product card
  const salesFinalBanner = document.getElementById('salesFinalBanner');
  const salesFinalText = document.getElementById('salesFinalText');
  if (salesFinalBanner && salesFinalText && s.policy_sales_final) {
    salesFinalText.textContent = s.policy_sales_final;
    salesFinalBanner.style.display = 'flex';
  }

  // Shipping tab policy texts
  const policyShipping = document.getElementById('policyShippingText');
  const policyReturns = document.getElementById('policyReturnsText');
  const policySupport = document.getElementById('policySupportText');
  if (policyShipping && s.policy_shipping) policyShipping.textContent = s.policy_shipping;
  if (policyReturns && s.policy_returns) policyReturns.textContent = s.policy_returns;
  if (policySupport && s.policy_support) policySupport.textContent = s.policy_support;

  // Sales final text in sidebar
  const promiseSalesFinal = document.getElementById('promiseSalesFinal');
  if (promiseSalesFinal && s.policy_sales_final) promiseSalesFinal.textContent = s.policy_sales_final;

  // Support contact info in sidebar
  const supportContactInfo = document.getElementById('supportContactInfo');
  if (supportContactInfo) {
    let contactText = s.policy_support || 'If you have a real issue with your order, please reach out to our customer support team.';
    if (s.support_email) contactText += ` Email: ${s.support_email}`;
    if (s.support_phone) contactText += ` | Phone: ${s.support_phone}`;
    supportContactInfo.textContent = contactText;
  }

  // FAQ section - load admin-controlled FAQ content
  const faqGrid = document.getElementById('faqGrid');
  if (faqGrid) {
    const faqs = [];
    if (s.policy_faq_1_q && s.policy_faq_1_a) faqs.push({ q: s.policy_faq_1_q, a: s.policy_faq_1_a });
    if (s.policy_faq_2_q && s.policy_faq_2_a) faqs.push({ q: s.policy_faq_2_q, a: s.policy_faq_2_a });
    if (s.policy_faq_3_q && s.policy_faq_3_a) faqs.push({ q: s.policy_faq_3_q, a: s.policy_faq_3_a });
    if (s.policy_faq_4_q && s.policy_faq_4_a) faqs.push({ q: s.policy_faq_4_q, a: s.policy_faq_4_a });
    if (faqs.length > 0) {
      faqGrid.innerHTML = faqs.map(f => `
        <div class="faq-card">
          <strong>${escapeHtml(f.q)}</strong>
          <p>${escapeHtml(f.a)}</p>
        </div>
      `).join('');
    }
  }
}

async function loadProduct() {
  const slug = slugFromPath();
  if (!slug) {
    document.getElementById('notFoundState').style.display = 'grid';
    return;
  }

  try {
    product = await API.get(`/api/products/${encodeURIComponent(slug)}`);
    setStoreBrand(storeSettings);
    renderProduct();
    await loadRelatedProducts();
  } catch (err) {
    const notFound = document.getElementById('notFoundState');
    const state = document.getElementById('productState');
    if (state) state.style.display = 'none';
    if (notFound) notFound.style.display = 'grid';
    const card = document.querySelector('.not-found-card p');
    if (card) card.textContent = err.message || 'We could not find that product.';
  }
}

function bindEvents() {
  document.getElementById('menuToggle')?.addEventListener('click', () => {
    document.getElementById('navLinks')?.classList.toggle('show');
  });

  document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
      document.getElementById('navLinks')?.classList.remove('show');
    });
  });

  document.getElementById('cartToggle')?.addEventListener('click', openCart);
  document.getElementById('closeCart')?.addEventListener('click', closeCart);
  document.getElementById('cartOverlay')?.addEventListener('click', closeCart);
  document.getElementById('checkoutBtn')?.addEventListener('click', openCheckout);
  document.getElementById('closeCheckout')?.addEventListener('click', closeCheckout);
  document.getElementById('checkoutModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCheckout();
  });
  document.getElementById('qtyMinus')?.addEventListener('click', () => {
    setQuantity(quantity - 1);
    updateProductControls();
  });
  document.getElementById('qtyPlus')?.addEventListener('click', () => {
    setQuantity(quantity + 1);
    updateProductControls();
  });
  document.getElementById('addToCartBtn')?.addEventListener('click', () => {
    addToCart(product, quantity);
  });
  document.getElementById('buyNowBtn')?.addEventListener('click', () => {
    addToCart(product, quantity);
    openCheckout();
  });

  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => activateTab(button.dataset.tab));
  });

  document.getElementById('applyCouponBtn')?.addEventListener('click', async () => {
    const code = document.getElementById('couponInput').value.trim();
    if (!code) return;

    const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    try {
      const result = await API.post('/api/coupons/validate', { code, subtotal });
      if (result.valid) {
        appliedCoupon = result;
        document.getElementById('couponMessage').innerHTML = `<span style="color:#059669;">Coupon applied! You save ${formatMoney(result.discount)}</span>`;
        updateCartTotals(subtotal, result.discount);
      }
    } catch (err) {
      appliedCoupon = null;
      document.getElementById('couponMessage').innerHTML = `<span style="color:#dc2626;">${escapeHtml(err.message)}</span>`;
      updateCartTotals(subtotal, 0);
    }
  });

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
      items: cart.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        price: item.price
      })),
      coupon_code: appliedCoupon ? appliedCoupon.code : null
    };

    try {
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing...';

      const order = await API.post('/api/orders', formData);
      closeCheckout();
      closeCart();
      cart = [];
      appliedCoupon = null;
      saveCart();
      document.getElementById('couponInput').value = '';
      document.getElementById('couponMessage').innerHTML = '';
      form.reset();
      updateCart();
      showToast('Order Placed', `Order #${order.id} has been placed successfully. Total: ${formatMoney(order.total)}`);
    } catch (err) {
      showToast('Error', err.message || 'Failed to place order. Please try again.');
    } finally {
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Place Order';
    }
  });
}

async function init() {
  bindEvents();
  updateCartBadge();
  updateCart();
  await loadStoreSettings();
  await loadProduct();
}

init();
