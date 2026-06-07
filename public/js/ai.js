// ============ AI Assistant Module ============
// Manages conversation memory, full-screen AI view, and smarter responses

let aiConversation = []; // Array of {role:'user'|'assistant', text, products}

// ===== Full-Screen AI Page Controls =====
function openAiPanel(e) {
  if (e) e.preventDefault();
  const overlay = document.getElementById('aiFullscreenOverlay');
  if (!overlay) return;
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    const input = document.getElementById('aiInput');
    if (input) input.focus();
  }, 300);
}

function closeAiPanel() {
  const overlay = document.getElementById('aiFullscreenOverlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('aiFullscreenOverlay');
    if (overlay && overlay.classList.contains('active')) closeAiPanel();
  }
});

// ===== Typing Indicator =====
function showAiTyping() {
  const el = document.getElementById('aiResult');
  if (!el) return;
  el.innerHTML = '<div class="ai-typing"><div class="ai-typing-dots"><span></span><span></span><span></span></div><span>Thinking…</span></div>';
}

function clearAiResult() {
  const el = document.getElementById('aiResult');
  if (el) el.innerHTML = '';
}

// ===== Markdown Strip (keeps bold + headings) =====
function stripMarkdown(text) {
  if (!text) return '';
  return String(text)
    .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[ADD_TO_CART:\d+\]/g, '')
    .replace(/\[VIEW_PRODUCT:\d+\]/g, '')
    .replace(/\[SHOW_CATEGORY:[^\]]+\]/g, '')
    .replace(/\[APPLY_COUPON:[^\]]+\]/g, '')
    .replace(/\[GO_TO_PRODUCT:\d+\]/g, '')
    .trim();
}

// ===== Render AI Message =====
function renderAiMessage(text) {
  const el = document.getElementById('aiResult');
  if (!el) return;
  const formatted = stripMarkdown(text);
  const msg = document.createElement('div');
  msg.className = 'ai-message';
  msg.innerHTML = formatted || 'Here is what I found for you. Try asking about a category or a specific product!';
  el.appendChild(msg);
}

// ===== Render Product Grid =====
function renderAiProducts(productsList) {
  const el = document.getElementById('aiResult');
  if (!el || !productsList || productsList.length === 0) return;

  const grid = document.createElement('div');
  grid.className = 'ai-products-grid';
  grid.innerHTML = productsList.map(p => {
    const discount = p.compare_at_price && Number(p.compare_at_price) > Number(p.price)
      ? Math.round((1 - Number(p.price) / Number(p.compare_at_price)) * 100) : 0;
    return '<div class="ai-product-card" onclick="window.location.href=\'/product/' + encodeURIComponent(p.slug || '') + '\'">' +
      '<img class="ai-product-image" src="' + escapeHtml(p.image_url || FALLBACK_IMAGE) + '" alt="' + escapeHtml(p.name) + '" loading="lazy" onerror="this.src=\'' + FALLBACK_IMAGE + '\'">' +
      '<div class="ai-product-body">' +
        '<div class="ai-product-name">' + escapeHtml(p.name) + '</div>' +
        '<div><span class="ai-product-price">' + formatMoney(p.price) + '</span>' +
        (p.compare_at_price ? '<span class="ai-product-compare">' + formatMoney(p.compare_at_price) + '</span>' : '') +
        (discount > 0 ? ' <span style="color:var(--error);font-size:0.7rem;font-weight:700;margin-left:4px;">-' + discount + '%</span>' : '') + '</div>' +
      '</div></div>';
  }).join('');
  el.appendChild(grid);
}

// ===== Build Context-Aware Explanation =====
function explainProducts(productsList, categoryName, query) {
  if (!productsList || productsList.length === 0) return '';
  const count = productsList.length;
  const items = productsList.slice(0, 4).map((p, i) => {
    const price = formatMoney(p.price);
    const onSale = p.compare_at_price ? ' (was ' + formatMoney(p.compare_at_price) + ', save ' + Math.round((1 - Number(p.price) / Number(p.compare_at_price)) * 100) + '%)' : '';
    const stock = p.in_stock ? '' : ' (out of stock)';
    return (i + 1) + '. **' + p.name + '** — ' + price + onSale + stock;
  }).join('\n\n');
  
  let intro;
  if (categoryName) {
    intro = 'I found ' + count + ' ' + categoryName.toLowerCase() + ' products matching **"' + query + '"**:';
  } else {
    intro = 'Here are ' + count + ' products for **"' + query + '"**:';
  }
  return intro + '\n\n' + items + '\n\nClick any product below to see details and add to cart.';
}

// ===== AI Data Fetch Helpers =====
async function fetchProductsByCategorySlug(slug, limit) {
  try {
    const res = await fetch('/api/products?category=' + encodeURIComponent(slug) + '&limit=' + (limit || 24));
    if (!res.ok) return [];
    const data = await res.json();
    return data.products || [];
  } catch (e) {
    return [];
  }
}

async function fetchOnSaleForAi(limit) {
  try {
    const res = await fetch('/api/products?limit=' + (limit || 24) + '&sort=price_asc');
    if (!res.ok) return [];
    const data = await res.json();
    return (data.products || []).filter(p => p.compare_at_price && Number(p.compare_at_price) > Number(p.price));
  } catch (e) {
    return [];
  }
}

async function fetchFeaturedForAi(limit) {
  try {
    const res = await fetch('/api/products?limit=' + (limit || 24) + '&featured=true');
    if (!res.ok) return [];
    const data = await res.json();
    return data.products || [];
  } catch (e) {
    return [];
  }
}

async function fetchAllProductsForAi(limit) {
  try {
    const res = await fetch('/api/products?limit=' + (limit || 12));
    if (!res.ok) return [];
    const data = await res.json();
    return data.products || [];
  } catch (e) {
    return [];
  }
}

// ===== Detect category from natural language query =====
function detectCategoryFromQuery(query) {
  if (!query || !categories || categories.length === 0) return null;
  const lower = query.toLowerCase().trim();
  
  // Try exact match first
  const exactMatch = categories.find(cat => 
    lower === cat.name.toLowerCase() || lower === cat.slug.toLowerCase()
  );
  if (exactMatch) return { slug: exactMatch.slug, name: exactMatch.name };

  // Try "show me [category]", "find [category]", "search [category]", "i want [category]"
  const patterns = [
    /^(?:show me|find|search for|search|i want|i need|looking for|get me)\s+(.+?)$/i,
    /^(?:any|some|the)\s+(.+?)$/i,
  ];
  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match && match[1]) {
      const word = match[1].trim();
      const catMatch = categories.find(cat => 
        cat.name.toLowerCase() === word || cat.slug.toLowerCase() === word
      );
      if (catMatch) return { slug: catMatch.slug, name: catMatch.name };
      // Check if word is contained in category name
      const contained = categories.find(cat => 
        cat.name.toLowerCase().includes(word) || word.includes(cat.name.toLowerCase())
      );
      if (contained) return { slug: contained.slug, name: contained.name };
    }
  }

  // Check if the query contains a category name as a standalone word
  for (const cat of categories) {
    const catName = cat.name.toLowerCase();
    const catSlug = cat.slug.toLowerCase();
    // Does the query contain the category name as a whole word?
    const wordRegex = new RegExp('\\b' + catName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    const slugRegex = new RegExp('\\b' + catSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (wordRegex.test(lower) || slugRegex.test(lower)) {
      return { slug: cat.slug, name: cat.name };
    }
  }

  return null;
}

// ===== Main askAi Function =====
async function askAi(query) {
  if (!query || !query.trim()) return;
  
  const input = document.getElementById('aiInput');
  const sendBtn = document.getElementById('aiSend');
  if (input) input.value = '';
  if (sendBtn) sendBtn.disabled = true;

  // Show search term in header
  const header = document.getElementById('aiCanvasHeader');
  const searchTerm = document.getElementById('aiActiveSearch');
  if (header && searchTerm) {
    header.style.display = 'block';
    searchTerm.textContent = query.trim().toLowerCase();
  }

  showAiTyping();

  const lower = query.toLowerCase().trim();
  let matchedProducts = [];
  let explanation = '';
  let categoryMatch = detectCategoryFromQuery(query);

  // --- Intent routing ---
  if (categoryMatch) {
    matchedProducts = await fetchProductsByCategorySlug(categoryMatch.slug, 24);
    explanation = explainProducts(matchedProducts, categoryMatch.name, query);
  } else if (/sale|discount|cheap|deal|on sale/.test(lower)) {
    matchedProducts = await fetchOnSaleForAi(24);
    explanation = matchedProducts.length > 0
      ? explainProducts(matchedProducts, 'products on sale', query)
      : 'No products are on sale right now. Check back soon!';
  } else if (/featured|highlight|recommended|trending/.test(lower)) {
    matchedProducts = await fetchFeaturedForAi(24);
    explanation = matchedProducts.length > 0
      ? explainProducts(matchedProducts, 'featured products', query)
      : 'No featured products available right now.';
  } else if (/popular|top|best ?seller/.test(lower)) {
    matchedProducts = await fetchAllProductsForAi(12);
    explanation = matchedProducts.length > 0
      ? explainProducts(matchedProducts, 'popular products', query)
      : 'No products available right now.';
  } else if (/show all|browse all|catalog|everything/.test(lower)) {
    matchedProducts = await fetchAllProductsForAi(24);
    explanation = matchedProducts.length > 0
      ? 'Here is our full catalog of **' + matchedProducts.length + ' products**. Browse and click any to learn more.'
      : 'No products in the catalog yet.';
  } else if (/recommend|surprise|suggest|ideas|pick for me/.test(lower)) {
    matchedProducts = await fetchFeaturedForAi(8);
    if (matchedProducts.length === 0) matchedProducts = await fetchAllProductsForAi(8);
    explanation = matchedProducts.length > 0
      ? 'I hand-picked these for you:\n\n' + explainProducts(matchedProducts, '', query)
      : 'No recommendations available right now.';
  } else {
    // Try server-side AI chat (natural language)
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query, history: aiConversation.slice(-10) })
      });
      if (res.ok) {
        const data = await res.json();
        explanation = data.reply || '';
        if (data.products && data.products.length > 0) {
          matchedProducts = data.products;
        } else {
          matchedProducts = await fetchAllProductsForAi(12);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        explanation = errData.error || 'Try asking about a specific category like electronics, clothing, or home.';
        matchedProducts = await fetchAllProductsForAi(12);
      }
    } catch (err) {
      explanation = 'I had trouble connecting. Try asking about a specific category.';
      matchedProducts = await fetchAllProductsForAi(12);
    }
  }

  // Clear typing + render
  clearAiResult();
  renderAiMessage(explanation);
  if (matchedProducts.length > 0) {
    renderAiProducts(matchedProducts);
  }

  // Save to conversation memory
  aiConversation.push({ role: 'user', text: query });
  aiConversation.push({ role: 'assistant', text: explanation, products: matchedProducts });

  if (sendBtn) sendBtn.disabled = false;
  if (input) input.focus();

  // Scroll canvas to top
  const canvas = document.getElementById('aiCanvas');
  if (canvas) canvas.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== Init AI Assistant =====
function initAiAssistant() {
  const aiInput = document.getElementById('aiInput');
  const aiSend = document.getElementById('aiSend');
  if (!aiInput || !aiSend) return;

  aiSend.addEventListener('click', () => {
    const text = aiInput.value.trim();
    if (text) askAi(text);
  });

  aiInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = aiInput.value.trim();
      if (text) askAi(text);
    }
  });

  // Wire up welcome chips
  document.querySelectorAll('#aiResult .ai-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.getAttribute('data-query');
      if (q) { aiInput.value = q; askAi(q); }
    });
  });

  // Wire up filter pills as query shortcuts
  document.querySelectorAll('.ai-filter-pill').forEach(pill => {
    if (pill.getAttribute('data-bound')) return;
    pill.setAttribute('data-bound', 'true');
    pill.addEventListener('click', () => {
      document.querySelectorAll('.ai-filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const text = pill.textContent.trim();
      // Map pill text to queries
      const map = {
        'Sells from ': 'Show products available',
        'Your deals': 'Show me deals and discounts',
        'Following': 'Show featured products',
        'New arrivals': 'Show newest products',
        'Best rated': 'Show popular products',
        'Price drop': 'Show products on sale'
      };
      let q = map[text];
      if (!q) q = text;
      const aiInput = document.getElementById('aiInput');
      if (aiInput) { aiInput.value = q; askAi(q); }
    });
  });

  // Wire up other ai-chip elements
  document.querySelectorAll('.ai-chip').forEach(chip => {
    if (chip.getAttribute('data-bound')) return;
    chip.setAttribute('data-bound', 'true');
    chip.addEventListener('click', () => {
      const q = chip.getAttribute('data-query');
      const aiInput = document.getElementById('aiInput');
      if (q && aiInput) { aiInput.value = q; askAi(q); }
    });
  });
}