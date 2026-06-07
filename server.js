const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult, query } = require('express-validator');
const multer = require('multer');
const morgan = require('morgan');
require('dotenv').config();

// ============================
// Configuration
// ============================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'nova-store-jwt-secret';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@novastore.com';
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'Admin123!', 10);
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024;
const NODE_ENV = process.env.NODE_ENV || 'development';
const DB_PATH = path.join(__dirname, process.env.DB_PATH || 'store.db');
const UPLOAD_PATH = path.join(__dirname, UPLOAD_DIR);
const SETTINGS_PATH = path.join(__dirname, 'settings.json');

const DEFAULT_SETTINGS = {
  store_name: 'CACA STORE',
  store_tagline: 'Premium Deals',
  store_logo: 'CACA STORE',
  store_description: 'Premium products curated for modern living.',
  support_email: 'support@novastore.com',
  support_phone: '+1 (555) 123-4567',
  support_address: '123 Commerce St, San Francisco, CA',
  hero_title: 'Premium Products, Exceptional Quality',
  hero_subtitle: 'Discover curated collections from top brands.',
  hero_badge: 'New Collection',
  primary_color: '#7c3aed',
  accent_color: '#5b21b6',
  footer_description: 'Premium products curated for modern living.',
  currency_symbol: '$',
  items_per_page: '12',
  enable_newsletter: 'true',
  facebook_url: '#',
  instagram_url: '#',
  twitter_url: '#',
  linkedin_url: '#',
  ai_enabled: 'true',
  cash_app_enabled: process.env.CASH_APP_ENABLED || 'true',
  cash_app_cashtag: process.env.CASH_APP_CASHTAG || '',
  cash_app_payment_link: process.env.CASH_APP_PAYMENT_LINK || '',
  cash_app_display_name: process.env.CASH_APP_DISPLAY_NAME || '',
  cash_app_note_prefix: process.env.CASH_APP_NOTE_PREFIX || 'Store order',
  // Admin profile
  admin_name: 'Admin',
  admin_email: ADMIN_EMAIL,
  // Store policies / product page content
  policy_sales_final: 'All sales are final. If you have a real issue with your order, please contact our customer support team and we will do our best to assist you.',
  policy_returns: 'All sales are final. We do not accept returns or exchanges. If you receive a damaged or incorrect item, please contact our customer support team for assistance.',
  policy_shipping: 'We process orders as quickly as possible. You will receive a tracking number once your order has been shipped. Please allow standard delivery times based on your location.',
  policy_support: 'Need help? Our customer support team is here for you. If you have any issues with your order, please reach out to us and we will work to resolve it. All sales are final, but we care about your experience.',
  policy_faq_1_q: 'What is your return policy?',
  policy_faq_1_a: 'All sales are final. If you have a real issue with your product, please contact customer support and we will do our best to help.',
  policy_faq_2_q: 'How do I contact customer support?',
  policy_faq_2_a: 'You can reach our support team via email or phone. Visit our contact section below or use the information provided on this page.',
  policy_faq_3_q: 'Is checkout secure?',
  policy_faq_3_a: 'Yes. Orders are collected through the site\'s secure checkout form and stored in the admin panel for fulfillment.',
  policy_faq_4_q: 'How long does shipping take?',
  policy_faq_4_a: 'We process orders quickly. Once shipped, delivery times depend on your location. You will receive a tracking number to monitor your order.'
};

// ============================
// Database Setup
// ============================
let db;
let SQL;

async function initDb() {
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();
  
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  createTables();
  saveDb();
  console.log('Database ready');
}

function createTables() {
  // Settings
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);

  // Categories
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    image_url TEXT
  )`);

  // Products
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    price REAL NOT NULL,
    compare_at_price REAL,
    image_url TEXT,
    images TEXT DEFAULT '[]',
    category_id INTEGER,
    featured INTEGER DEFAULT 0,
    in_stock INTEGER DEFAULT 1,
    stock_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  )`);

  // Orders
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    shipping_address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip_code TEXT NOT NULL,
    total REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    tracking_number TEXT,
    notes TEXT,
    coupon_code TEXT,
    discount REAL DEFAULT 0,
    payment_method TEXT DEFAULT 'manual',
    payment_status TEXT DEFAULT 'unpaid',
    payment_reference TEXT,
    payment_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Migration: Add customer_id column if it was missing from old databases
  try {
    db.run("ALTER TABLE orders ADD COLUMN customer_id INTEGER");
  } catch (e) {
    // Column already exists, ignore error
  }
  try { db.run("ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'manual'"); } catch (e) {}
  try { db.run("ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'unpaid'"); } catch (e) {}
  try { db.run("ALTER TABLE orders ADD COLUMN payment_reference TEXT"); } catch (e) {}
  try { db.run("ALTER TABLE orders ADD COLUMN payment_note TEXT"); } catch (e) {}

  // Migration: add images column if missing
  try { db.run("ALTER TABLE products ADD COLUMN images TEXT DEFAULT '[]'"); } catch (e) {}

  // Migration: add is_active to shipping_rates if missing
  try { db.run("ALTER TABLE shipping_rates ADD COLUMN is_active INTEGER DEFAULT 1"); } catch (e) {}

  // Order items
  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  // Customers
  db.run(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    phone TEXT,
    shipping_address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    active_tracking_number TEXT,
    active_tracking_order_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Migrations: add tracking columns if missing on older databases
  try { db.run("ALTER TABLE customers ADD COLUMN active_tracking_number TEXT"); } catch (e) {}
  try { db.run("ALTER TABLE customers ADD COLUMN active_tracking_order_id INTEGER"); } catch (e) {}
  try { db.run("ALTER TABLE customers ADD COLUMN banned INTEGER DEFAULT 0"); } catch (e) {}

  // Wishlist
  db.run(`CREATE TABLE IF NOT EXISTS wishlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    UNIQUE(customer_id, product_id)
  )`);

  // Coupons
  db.run(`CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    discount_percent REAL NOT NULL DEFAULT 0,
    discount_amount REAL NOT NULL DEFAULT 0,
    min_order REAL DEFAULT 0,
    max_uses INTEGER DEFAULT 0,
    used_count INTEGER DEFAULT 0,
    expires_at DATETIME,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Activity log
  db.run(`CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    details TEXT,
    ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Product Variants (color/size combos)
  db.run(`CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    color TEXT NOT NULL,
    color_hex TEXT,
    size TEXT NOT NULL,
    stock_count INTEGER DEFAULT 0,
    price_modifier REAL DEFAULT 0,
    image_url TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Product Ratings
  db.run(`CREATE TABLE IF NOT EXISTS product_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    customer_id INTEGER,
    customer_name TEXT NOT NULL,
    customer_email TEXT,
    rating INTEGER NOT NULL,
    review TEXT,
    is_approved INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Shipping Zones
  db.run(`CREATE TABLE IF NOT EXISTS shipping_zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    countries TEXT DEFAULT '[]',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Shipping Rates
  db.run(`CREATE TABLE IF NOT EXISTS shipping_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    min_order REAL DEFAULT 0,
    max_order REAL DEFAULT 0,
    is_free_shipping INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (zone_id) REFERENCES shipping_zones(id)
  )`);

  // Tax Settings
  db.run(`CREATE TABLE IF NOT EXISTS tax_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    rate REAL NOT NULL,
    countries TEXT DEFAULT '[]',
    is_compound INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Abandoned Carts
  db.run(`CREATE TABLE IF NOT EXISTS abandoned_carts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_email TEXT NOT NULL,
    customer_name TEXT,
    items TEXT NOT NULL,
    total REAL NOT NULL,
    recovered INTEGER DEFAULT 0,
    recovery_order_id INTEGER,
    email_sent INTEGER DEFAULT 0,
    token TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
  )`);

  // Gift Cards
  db.run(`CREATE TABLE IF NOT EXISTS gift_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    initial_value REAL NOT NULL,
    current_balance REAL NOT NULL,
    customer_email TEXT,
    is_active INTEGER DEFAULT 1,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    used_at DATETIME
  )`);

  // Staff Accounts
  db.run(`CREATE TABLE IF NOT EXISTS staff_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'staff',
    permissions TEXT DEFAULT '{}',
    is_active INTEGER DEFAULT 1,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Inventory Alerts
  db.run(`CREATE TABLE IF NOT EXISTS inventory_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    threshold INTEGER DEFAULT 10,
    current_stock INTEGER,
    alert_sent INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  // Newsletter Subscribers
  db.run(`CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Settings are stored in settings.json file (not database)
}

function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ============================
// Database Helpers
// ============================
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

function execute(sql, params = []) {
  db.run(sql, params);
  const stmt = db.prepare('SELECT last_insert_rowid() as id');
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  saveDb();
  return row.id;
}

function normalizeCheckoutItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('At least one item is required');
  }

  const normalized = [];

  for (const item of items) {
    const productId = parseInt(item.product_id, 10);
    const quantity = parseInt(item.quantity, 10);

    if (!Number.isInteger(productId) || productId <= 0) {
      throw new Error('Invalid product in cart');
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error('Invalid quantity in cart');
    }

    const product = queryOne(
      `SELECT p.*, c.name as category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = ?`,
      [productId]
    );

    if (!product) {
      throw new Error(`Product #${productId} not found`);
    }
    if (!product.in_stock || Number(product.stock_count) <= 0) {
      throw new Error(`${product.name} is out of stock`);
    }
    if (Number(product.stock_count) < quantity) {
      throw new Error(`Only ${product.stock_count} units of ${product.name} are available`);
    }

    normalized.push({
      product_id: product.id,
      product_name: product.name,
      quantity,
      price: Number(product.price),
      image_url: product.image_url || '',
      stock_count: Number(product.stock_count) || 0
    });
  }

  return normalized;
}

function calculateCouponDiscount(couponCode, subtotal) {
  if (!couponCode) {
    return { coupon: null, discount: 0 };
  }

  const coupon = queryOne(
    `SELECT * FROM coupons
     WHERE code = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > datetime("now"))`,
    [String(couponCode).trim().toUpperCase()]
  );

  if (!coupon) {
    throw new Error('Invalid or expired coupon code');
  }
  if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
    throw new Error('Coupon has reached its usage limit');
  }
  if (subtotal < Number(coupon.min_order || 0)) {
    throw new Error(`Minimum order amount of $${Number(coupon.min_order || 0).toFixed(2)} required`);
  }

  let discount = 0;
  if (Number(coupon.discount_percent || 0) > 0) {
    discount = subtotal * (Number(coupon.discount_percent) / 100);
  } else if (Number(coupon.discount_amount || 0) > 0) {
    discount = Number(coupon.discount_amount);
  }

  if (discount > subtotal) discount = subtotal;
  return { coupon, discount };
}

function buildOrderPayload(body) {
  const customer_name = String(body.customer_name || '').trim();
  const customer_email = String(body.customer_email || '').trim().toLowerCase();
  const customer_phone = String(body.customer_phone || '').trim();
  const shipping_address = String(body.shipping_address || '').trim();
  const city = String(body.city || '').trim();
  const state = String(body.state || '').trim();
  const zip_code = String(body.zip_code || '').trim();
  const customer_id = body.customer_id ? parseInt(body.customer_id, 10) : null;
  const coupon_code = body.coupon_code ? String(body.coupon_code).trim().toUpperCase() : null;
  const payment_method = String(body.payment_method || 'manual').trim();
  const payment_reference = String(body.payment_reference || '').trim();
  const payment_note = String(body.payment_note || '').trim();

  const items = normalizeCheckoutItems(body.items);
  const subtotal = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
  const { coupon, discount } = calculateCouponDiscount(coupon_code, subtotal);
  const total = Math.max(0, subtotal - discount);

  let resolvedCustomerId = null;
  if (Number.isInteger(customer_id) && customer_id > 0) {
    const linkedCustomer = queryOne('SELECT id, email FROM customers WHERE id = ?', [customer_id]);
    if (linkedCustomer && linkedCustomer.email === customer_email) {
      resolvedCustomerId = linkedCustomer.id;
    }
  }

  return {
    customer_name,
    customer_email,
    customer_phone,
    shipping_address,
    city,
    state,
    zip_code,
    customer_id: resolvedCustomerId,
    coupon_code: coupon ? coupon.code : null,
    coupon,
    items,
    subtotal,
    discount,
    total,
    payment_method: payment_method === 'cash_app' ? 'cash_app' : 'manual',
    payment_status: payment_method === 'cash_app' ? 'awaiting_payment' : 'unpaid',
    payment_reference,
    payment_note
  };
}

function insertOrderFromPayload(payload, { status = 'pending' } = {}) {
  const orderId = execute(
    `INSERT INTO orders (
      customer_id, customer_name, customer_email, customer_phone,
      shipping_address, city, state, zip_code, total, status, coupon_code, discount,
      payment_method, payment_status, payment_reference, payment_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.customer_id,
      payload.customer_name,
      payload.customer_email,
      payload.customer_phone || '',
      payload.shipping_address,
      payload.city,
      payload.state,
      payload.zip_code,
      payload.total,
      status,
      payload.coupon_code || null,
      payload.discount || 0,
      payload.payment_method || 'manual',
      payload.payment_status || 'unpaid',
      payload.payment_reference || '',
      payload.payment_note || ''
    ]
  );

  for (const item of payload.items) {
    execute(
      'INSERT INTO order_items (order_id, product_id, product_name, quantity, price) VALUES (?, ?, ?, ?, ?)',
      [orderId, item.product_id, item.product_name, item.quantity, item.price]
    );

    execute(
      `UPDATE products
       SET stock_count = MAX(0, stock_count - ?),
           in_stock = CASE WHEN stock_count - ? <= 0 THEN 0 ELSE in_stock END
       WHERE id = ?`,
      [item.quantity, item.quantity, item.product_id]
    );
  }

  return orderId;
}

function fetchOrderById(orderId) {
  const order = queryOne('SELECT * FROM orders WHERE id = ?', [parseInt(orderId, 10)]);
  if (!order) return null;
  order.items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  return order;
}

function getOrderCustomerId(order) {
  if (!order) return null;
  if (order.customer_id) return order.customer_id;
  if (order.customer_email) {
    const customer = queryOne('SELECT id FROM customers WHERE email = ?', [order.customer_email]);
    return customer ? customer.id : null;
  }
  return null;
}

function getLatestActiveOrderForCustomer(customerId, customerEmail = null) {
  if (!customerId) return null;

  const params = [customerId];
  let whereClause = 'customer_id = ?';
  if (customerEmail) {
    whereClause = '(customer_id = ? OR customer_email = ?)';
    params.push(customerEmail);
  }

  return queryOne(
    `SELECT id, tracking_number, status, created_at
     FROM orders
     WHERE ${whereClause}
       AND tracking_number IS NOT NULL
       AND TRIM(tracking_number) != ''
       AND status NOT IN ('delivered', 'cancelled')
     ORDER BY datetime(created_at) DESC, id DESC
     LIMIT 1`,
    params
  );
}

function syncCustomerTrackingForOrder(order) {
  const customerId = getOrderCustomerId(order);
  if (!customerId) return null;

  const latestActiveOrder = getLatestActiveOrderForCustomer(customerId, order?.customer_email || null);
  if (latestActiveOrder) {
    execute(
      'UPDATE customers SET active_tracking_number = ?, active_tracking_order_id = ? WHERE id = ?',
      [latestActiveOrder.tracking_number, latestActiveOrder.id, customerId]
    );
  } else {
    execute(
      'UPDATE customers SET active_tracking_number = NULL, active_tracking_order_id = NULL WHERE id = ?',
      [customerId]
    );
  }

  return latestActiveOrder;
}

function resolveCustomerTracking(customer) {
  if (!customer) return null;

  if (customer.active_tracking_order_id) {
    const activeOrder = queryOne(
      `SELECT id, tracking_number, status, created_at
       FROM orders
       WHERE id = ?
         AND (customer_id = ? OR customer_email = ?)`,
      [customer.active_tracking_order_id, customer.id, customer.email]
    );

    if (
      activeOrder &&
      activeOrder.tracking_number &&
      !['delivered', 'cancelled'].includes(String(activeOrder.status || '').toLowerCase())
    ) {
      return activeOrder;
    }
  }

  return getLatestActiveOrderForCustomer(customer.id, customer.email);
}

function getSettings() {
  let settings = { ...DEFAULT_SETTINGS };
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
      settings = { ...settings, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Failed to read settings.json:', e.message);
  }
  return settings;
}

function logActivity(action, details = '', ip = '') {
  try {
    execute('INSERT INTO activity_log (action, details, ip) VALUES (?, ?, ?)', [action, details, ip]);
  } catch (e) {
    // Non-critical
  }
}

// ============================
// Multer Setup (File Uploads)
// ============================
if (!fs.existsSync(UPLOAD_PATH)) {
  fs.mkdirSync(UPLOAD_PATH, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_PATH),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.random().toString(36).substring(2, 8) + ext;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
  if (allowed.test(path.extname(file.originalname))) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, png, gif, webp, svg) are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
});

// ============================
// Express App
// ============================
const app = express();

// Security — allow external images and scripts
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// Rate limiting (generous limits for development)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: NODE_ENV === 'production' ? 200 : 500,
  message: { error: 'Too many requests, please try again later.' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: NODE_ENV === 'production' ? 30 : 500,
  message: { error: 'Too many login attempts, please try again later.' }
});

app.use('/api/', apiLimiter);

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(`/${UPLOAD_DIR}`, express.static(UPLOAD_PATH));

// ============================
// Auth Middleware
// ============================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// ============================
// Validation helpers
// ============================
function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  return null;
}

// ============================
// Auth Routes
// ============================
app.post('/api/admin/login', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 })
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  const { email, password } = req.body;
  
  if (email !== ADMIN_EMAIL) {
    logActivity('login_failed', `Failed login attempt for ${email}`, req.ip);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  if (!bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
    logActivity('login_failed', `Failed login attempt for ${email}`, req.ip);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const token = jwt.sign({ email, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
  logActivity('login', 'Admin logged in', req.ip);
  res.json({ token, email });
});

app.get('/api/admin/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, email: req.admin.email });
});

// ============================
// Public API Routes
// ============================



// Settings (public - includes store name for document.title, SEO)
app.get('/api/settings', (req, res) => {
  try {
    const settings = getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public settings sync endpoint - for real-time store name updates across pages
app.get('/api/settings/sync', (req, res) => {
  try {
    const settings = getSettings();
    res.json({
      store_name: settings.store_name || 'CACA STORE',
      store_logo: settings.store_logo || settings.store_name || 'CACA STORE',
      store_tagline: settings.store_tagline || '',
      primary_color: settings.primary_color || '#8b5cf6'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/payment-options', (req, res) => {
  try {
    const settings = getSettings();
    const cashtag = String(settings.cash_app_cashtag || '').replace(/^\$/, '').trim();
    const paymentLink = String(settings.cash_app_payment_link || '').trim();
    const cashAppEnabled = settings.cash_app_enabled === 'true' && (cashtag || paymentLink);

    res.json({
      cash_app: {
        enabled: cashAppEnabled,
        cashtag,
        display_name: settings.cash_app_display_name || (cashtag ? `$${cashtag}` : 'Cash App'),
        payment_link: paymentLink || (cashtag ? `https://cash.app/$${encodeURIComponent(cashtag)}` : ''),
        note_prefix: settings.cash_app_note_prefix || 'Store order'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Categories
app.get('/api/categories', (req, res) => {
  try {
    const categories = queryAll('SELECT * FROM categories ORDER BY name');
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/categories/:slug', (req, res) => {
  try {
    const category = queryOne('SELECT * FROM categories WHERE slug = ?', [req.params.slug]);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Products with pagination, search, filter, sorting
app.get('/api/products', (req, res) => {
  try {
    const { 
      category, featured, search, 
      page = 1, limit = 12, 
      sort = 'newest',
      min_price, max_price,
      in_stock
    } = req.query;
    
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 12));
    const offset = (pageNum - 1) * limitNum;
    
    let sql = `SELECT p.*, c.name as category_name, c.slug as category_slug
               FROM products p
               LEFT JOIN categories c ON p.category_id = c.id
               WHERE 1=1`;
    const params = [];
    const countParams = [];

    if (category) {
      sql += ' AND c.slug = ?';
      params.push(category);
    }
    if (featured === 'true') {
      sql += ' AND p.featured = 1';
    }
    if (search) {
      sql += ' AND (p.name LIKE ? OR p.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (min_price) {
      sql += ' AND p.price >= ?';
      params.push(parseFloat(min_price));
    }
    if (max_price) {
      sql += ' AND p.price <= ?';
      params.push(parseFloat(max_price));
    }
    if (in_stock === 'true') {
      sql += ' AND p.in_stock = 1';
    }

    // Count total
    const countSql = sql.replace(/SELECT p\.\*, c\.name as category_name, c\.slug as category_slug/, 'SELECT COUNT(*) as total');
    const countResult = queryAll(countSql, params);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limitNum);

    // Sort
    switch (sort) {
      case 'price_asc': sql += ' ORDER BY p.price ASC'; break;
      case 'price_desc': sql += ' ORDER BY p.price DESC'; break;
      case 'name': sql += ' ORDER BY p.name ASC'; break;
      case 'oldest': sql += ' ORDER BY p.created_at ASC'; break;
      default: sql += ' ORDER BY p.created_at DESC';
    }

    sql += ' LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const products = queryAll(sql, params);
    
    res.json({
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasMore: pageNum < totalPages
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/:slug', (req, res) => {
  try {
    const product = queryOne(`
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.slug = ?
    `, [req.params.slug]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Related products
app.get('/api/products/:slug/related', (req, res) => {
  try {
    const product = queryOne('SELECT * FROM products WHERE slug = ?', [req.params.slug]);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const related = queryAll(
      `SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.category_id = ? AND p.id != ? AND p.in_stock = 1
       ORDER BY RANDOM() LIMIT 4`,
      [product.category_id, product.id]
    );

    // If not enough related by category, get random products
    if (related.length < 4) {
      const more = queryAll(
        `SELECT p.*, c.name as category_name, c.slug as category_slug
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.id != ? AND p.in_stock = 1
         ORDER BY RANDOM() LIMIT ?`,
        [product.id, 4 - related.length]
      );
      res.json([...related, ...more]);
    } else {
      res.json(related);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Orders (customer)
app.post('/api/orders', [
  body('customer_name').trim().isLength({ min: 1 }).withMessage('Name is required'),
  body('customer_email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('shipping_address').trim().isLength({ min: 1 }).withMessage('Address is required'),
  body('city').trim().isLength({ min: 1 }).withMessage('City is required'),
  body('state').trim().isLength({ min: 1 }).withMessage('State is required'),
  body('zip_code').trim().isLength({ min: 1 }).withMessage('ZIP code is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product_id').isInt(),
  body('items.*.quantity').isInt({ min: 1 })
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const payload = buildOrderPayload(req.body);

    const orderId = insertOrderFromPayload(payload, { status: 'pending' });

    if (payload.coupon) {
      try {
        execute('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [payload.coupon.id]);
      } catch (couponErr) {
        console.warn('Failed to increment coupon usage:', couponErr.message);
      }
    }

    logActivity('order_placed', `Order #${orderId} placed - $${payload.total.toFixed(2)}`, req.ip);
    res.status(201).json({ id: orderId, total: payload.total, discount: payload.discount, subtotal: payload.subtotal, status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id', (req, res) => {
  try {
    const order = queryOne('SELECT * FROM orders WHERE id = ?', [parseInt(req.params.id)]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    order.items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [parseInt(req.params.id)]);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Track package by tracking number (public, no auth needed)
app.get('/api/track/:tracking_number', (req, res) => {
  try {
    const order = queryOne('SELECT * FROM orders WHERE tracking_number = ?', [req.params.tracking_number]);
    if (!order) {
      return res.status(404).json({ error: 'No order found with that tracking number' });
    }
    order.items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Coupon validation
app.post('/api/coupons/validate', [
  body('code').trim().isLength({ min: 1 }),
  body('subtotal').isFloat({ min: 0 })
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const { code, subtotal } = req.body;
    const coupon = queryOne(
      `SELECT * FROM coupons WHERE code = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > datetime("now"))`,
      [code.toUpperCase()]
    );

    if (!coupon) {
      return res.status(400).json({ error: 'Invalid or expired coupon code', valid: false });
    }
    if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
      return res.status(400).json({ error: 'Coupon has reached its usage limit', valid: false });
    }
    if (subtotal < coupon.min_order) {
      return res.status(400).json({ error: `Minimum order amount of $${coupon.min_order.toFixed(2)} required`, valid: false });
    }

    let discount = 0;
    if (coupon.discount_percent > 0) {
      discount = subtotal * (coupon.discount_percent / 100);
    } else if (coupon.discount_amount > 0) {
      discount = coupon.discount_amount;
    }
    if (discount > subtotal) discount = subtotal;

    res.json({ valid: true, code: coupon.code, discount_percent: coupon.discount_percent, discount_amount: coupon.discount_amount, discount, min_order: coupon.min_order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// Product Variants API
// ============================

// Get variants for a product (public)
app.get('/api/products/:id/variants', (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const variants = queryAll('SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY color, size', [productId]);
    res.json(variants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all variants for a product
app.get('/api/admin/products/:id/variants', authenticateToken, (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const variants = queryAll('SELECT * FROM product_variants WHERE product_id = ? ORDER BY color, size', [productId]);
    res.json(variants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Create variant
app.post('/api/admin/products/:id/variants', authenticateToken, (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { color, color_hex, size, stock_count, price_modifier, image_url } = req.body;
    const id = execute(
      'INSERT INTO product_variants (product_id, color, color_hex, size, stock_count, price_modifier, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [productId, color || '', color_hex || '', size || '', stock_count || 0, price_modifier || 0, image_url || '']
    );
    const variant = queryOne('SELECT * FROM product_variants WHERE id = ?', [id]);
    logActivity('variant_created', `Variant "${color || ''} ${size || ''}" created for product #${productId}`, req.ip);
    res.status(201).json(variant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Update variant
app.put('/api/admin/variants/:id', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { color, color_hex, size, stock_count, price_modifier, image_url, is_active } = req.body;
    execute(
      'UPDATE product_variants SET color=?, color_hex=?, size=?, stock_count=?, price_modifier=?, image_url=?, is_active=? WHERE id=?',
      [color, color_hex || '', size || '', stock_count || 0, price_modifier || 0, image_url || '', is_active !== undefined ? (is_active ? 1 : 0) : 1, id]
    );
    const updated = queryOne('SELECT * FROM product_variants WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete variant
app.delete('/api/admin/variants/:id', authenticateToken, (req, res) => {
  try {
    execute('DELETE FROM product_variants WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ message: 'Variant deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Bulk save variants (replace all for a product)
app.put('/api/admin/products/:id/variants', authenticateToken, (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const variants = req.body.variants || [];
    
    // Delete existing variants for this product
    execute('DELETE FROM product_variants WHERE product_id = ?', [productId]);
    
    // Insert new variants
    for (const v of variants) {
      execute(
        'INSERT INTO product_variants (product_id, color, color_hex, size, stock_count, price_modifier, image_url, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [productId, v.color || '', v.color_hex || '', v.size || '', v.stock_count || 0, v.price_modifier || 0, v.image_url || '', v.is_active !== undefined ? (v.is_active ? 1 : 0) : 1]
      );
    }
    
    const updated = queryAll('SELECT * FROM product_variants WHERE product_id = ? ORDER BY color, size', [productId]);
    logActivity('variants_updated', `Variants updated for product #${productId}`, req.ip);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// Product Ratings API
// ============================

// Get ratings for a product (public)
app.get('/api/products/:id/ratings', (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const ratings = queryAll(
      'SELECT id, customer_name, rating, review, created_at FROM product_ratings WHERE product_id = ? AND is_approved = 1 ORDER BY created_at DESC',
      [productId]
    );
    const stats = queryOne(
      'SELECT COUNT(*) as count, AVG(rating) as average FROM product_ratings WHERE product_id = ? AND is_approved = 1',
      [productId]
    );
    res.json({ ratings, count: stats?.count || 0, average: Math.round((stats?.average || 0) * 10) / 10 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit a rating (customer auth)
app.post('/api/products/:id/ratings', authenticateCustomer, [
  body('rating').isInt({ min: 1, max: 5 }),
  body('review').optional().trim().isLength({ max: 2000 })
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const productId = parseInt(req.params.id);
    const { rating, review } = req.body;
    
    // Check if customer already rated this product
    const existing = queryOne(
      'SELECT id FROM product_ratings WHERE product_id = ? AND customer_id = ?',
      [productId, req.customer.id]
    );
    if (existing) {
      // Update existing rating
      execute('UPDATE product_ratings SET rating = ?, review = ?, created_at = datetime("now") WHERE id = ?', [rating, review || '', existing.id]);
      const updated = queryOne('SELECT id, customer_name, rating, review, created_at FROM product_ratings WHERE id = ?', [existing.id]);
      return res.json(updated);
    }
    
    const id = execute(
      'INSERT INTO product_ratings (product_id, customer_id, customer_name, customer_email, rating, review) VALUES (?, ?, ?, ?, ?, ?)',
      [productId, req.customer.id, req.customer.name || 'Customer', req.customer.email || '', rating, review || '']
    );
    const newRating = queryOne('SELECT id, customer_name, rating, review, created_at FROM product_ratings WHERE id = ?', [id]);
    logActivity('rating_submitted', `Rating ${rating}/5 submitted for product #${productId}`, req.ip);
    res.status(201).json(newRating);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all ratings for any product
app.get('/api/admin/products/:id/ratings', authenticateToken, (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const ratings = queryAll(
      'SELECT * FROM product_ratings WHERE product_id = ? ORDER BY created_at DESC',
      [productId]
    );
    res.json(ratings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete a rating
app.delete('/api/admin/ratings/:id', authenticateToken, (req, res) => {
  try {
    execute('DELETE FROM product_ratings WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ message: 'Rating deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Approve/unapprove a rating
app.put('/api/admin/ratings/:id', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { is_approved } = req.body;
    execute('UPDATE product_ratings SET is_approved = ? WHERE id = ?', [is_approved ? 1 : 0, id]);
    const updated = queryOne('SELECT * FROM product_ratings WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// Customer Routes
// ============================
app.post('/api/customers/register', [
  body('name').trim().isLength({ min: 1 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const { name, email, password } = req.body;
    
    const existing = queryOne('SELECT id FROM customers WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const id = execute('INSERT INTO customers (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword]);
    
    const token = jwt.sign({ id, email, name, role: 'customer' }, JWT_SECRET, { expiresIn: '30d' });
    
    res.status(201).json({ 
      token, 
      customer: { id, name, email }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customers/login', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 })
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const { email, password } = req.body;
    const customer = queryOne('SELECT * FROM customers WHERE email = ?', [email]);
    
    if (!customer || !bcrypt.compareSync(password, customer.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if customer is banned
    if (customer.banned) {
      logActivity('login_blocked', `Banned customer "${email}" tried to log in`, req.ip);
      return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
    }

    const token = jwt.sign({ id: customer.id, email: customer.email, name: customer.name, role: 'customer' }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({ 
      token, 
      customer: { id: customer.id, name: customer.name, email: customer.email }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customer middleware
function authenticateCustomer(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'customer') {
      return res.status(403).json({ error: 'Customer account required' });
    }
    req.customer = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

app.get('/api/customers/profile', authenticateCustomer, (req, res) => {
  try {
    const customer = queryOne('SELECT id, name, email, phone, shipping_address, city, state, zip_code, active_tracking_number, active_tracking_order_id, created_at FROM customers WHERE id = ?', [req.customer.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const activeOrder = resolveCustomerTracking(customer);
    res.json({
      ...customer,
      active_tracking_number: activeOrder?.tracking_number || null,
      active_tracking_order_id: activeOrder?.id || null,
      active_tracking_status: activeOrder?.status || null,
      active_tracking_created_at: activeOrder?.created_at || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/customers/profile', authenticateCustomer, [
  body('name').optional().trim().isLength({ min: 1 }),
  body('phone').optional().trim(),
  body('shipping_address').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('zip_code').optional().trim()
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const { name, phone, shipping_address, city, state, zip_code } = req.body;
    const current = queryOne('SELECT * FROM customers WHERE id = ?', [req.customer.id]);
    if (!current) return res.status(404).json({ error: 'Customer not found' });

    execute(
      'UPDATE customers SET name=?, phone=?, shipping_address=?, city=?, state=?, zip_code=? WHERE id=?',
      [
        name || current.name,
        phone !== undefined ? phone : current.phone,
        shipping_address !== undefined ? shipping_address : current.shipping_address,
        city !== undefined ? city : current.city,
        state !== undefined ? state : current.state,
        zip_code !== undefined ? zip_code : current.zip_code,
        req.customer.id
      ]
    );
    
    const updated = queryOne('SELECT id, name, email, phone, shipping_address, city, state, zip_code, active_tracking_number, active_tracking_order_id, created_at FROM customers WHERE id = ?', [req.customer.id]);
    const activeOrder = resolveCustomerTracking(updated);
    res.json({
      ...updated,
      active_tracking_number: activeOrder?.tracking_number || null,
      active_tracking_order_id: activeOrder?.id || null,
      active_tracking_status: activeOrder?.status || null,
      active_tracking_created_at: activeOrder?.created_at || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customers/orders', authenticateCustomer, (req, res) => {
  try {
    const orders = queryAll(
      'SELECT * FROM orders WHERE customer_id = ? OR customer_email = ? ORDER BY created_at DESC',
      [req.customer.id, req.customer.email]
    );
    for (const order of orders) {
      order.items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    }
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Wishlist
app.get('/api/customers/wishlist', authenticateCustomer, (req, res) => {
  try {
    const items = queryAll(
      `SELECT p.*, w.id as wishlist_id, w.created_at as added_at
       FROM wishlist w
       JOIN products p ON w.product_id = p.id
       WHERE w.customer_id = ?
       ORDER BY w.created_at DESC`,
      [req.customer.id]
    );
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customers/wishlist', authenticateCustomer, [
  body('product_id').isInt()
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const { product_id } = req.body;
    const existing = queryOne('SELECT id FROM wishlist WHERE customer_id = ? AND product_id = ?', [req.customer.id, product_id]);
    if (existing) {
      execute('DELETE FROM wishlist WHERE id = ?', [existing.id]);
      res.json({ wishlisted: false, message: 'Removed from wishlist' });
    } else {
      execute('INSERT OR IGNORE INTO wishlist (customer_id, product_id) VALUES (?, ?)', [req.customer.id, product_id]);
      res.json({ wishlisted: true, message: 'Added to wishlist' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/customers/wishlist/:productId', authenticateCustomer, (req, res) => {
  try {
    execute('DELETE FROM wishlist WHERE customer_id = ? AND product_id = ?', [req.customer.id, parseInt(req.params.productId)]);
    res.json({ message: 'Removed from wishlist' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// Admin API Routes
// ============================

// Settings
app.get('/api/admin/settings', authenticateToken, (req, res) => {
  try {
    res.json(getSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/settings', authenticateToken, (req, res) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Invalid settings data' });
    }
    
    const allowedKeys = [
      'store_name', 'store_tagline', 'store_logo', 'store_description',
      'support_email', 'support_phone', 'support_address',
      'hero_title', 'hero_subtitle', 'hero_badge',
      'primary_color', 'accent_color', 'footer_description',
      'currency_symbol', 'items_per_page', 'enable_newsletter',
      'facebook_url', 'instagram_url', 'twitter_url', 'linkedin_url',
      'ai_enabled', 'cash_app_enabled', 'cash_app_cashtag',
      'cash_app_payment_link', 'cash_app_display_name', 'cash_app_note_prefix',
      // Admin profile
      'admin_name', 'admin_email',
      // Store policies / product page content
      'policy_sales_final', 'policy_returns', 'policy_shipping', 'policy_support',
      'policy_faq_1_q', 'policy_faq_1_a',
      'policy_faq_2_q', 'policy_faq_2_a',
      'policy_faq_3_q', 'policy_faq_3_a',
      'policy_faq_4_q', 'policy_faq_4_a',
      'ai_name'
    ];
    
    // Read existing settings, merge updates, write back to file
    const current = getSettings();
    const merged = {};
    for (const [key, value] of Object.entries(current)) {
      merged[key] = String(value);
    }
    for (const [key, value] of Object.entries(updates)) {
      if (allowedKeys.includes(key)) {
        merged[key] = String(value);
      }
    }
    
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2));
    
    logActivity('settings_updated', 'Store settings updated', req.ip);
    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Profile
app.get('/api/admin/profile', authenticateToken, (req, res) => {
  try {
    const settings = getSettings();
    res.json({
      name: settings.admin_name || 'Admin',
      email: settings.admin_email || ADMIN_EMAIL
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/profile', authenticateToken, [
  body('name').optional().trim().isLength({ min: 1 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('current_password').isLength({ min: 1 }).withMessage('Current password is required'),
  body('new_password').optional().isLength({ min: 6 })
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const { name, email, current_password, new_password } = req.body;
    const settings = getSettings();

    // Verify current password
    const storedHash = ADMIN_PASSWORD_HASH;
    if (!bcrypt.compareSync(current_password, storedHash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const current = getSettings();
    const merged = {};
    for (const [key, value] of Object.entries(current)) {
      merged[key] = String(value);
    }

    if (name) merged.admin_name = String(name);
    if (email) merged.admin_email = String(email);

    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2));

    logActivity('admin_profile_updated', 'Admin profile updated', req.ip);
    res.json({ name: merged.admin_name, email: merged.admin_email, message: 'Profile updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Categories - Admin
app.post('/api/admin/categories', authenticateToken, [
  body('name').trim().isLength({ min: 1 }),
  body('slug').trim().isLength({ min: 1 })
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const { name, slug, description, image_url } = req.body;
    const id = execute('INSERT INTO categories (name, slug, description, image_url) VALUES (?, ?, ?, ?)',
      [name, slug, description || '', image_url || '']);
    const category = queryOne('SELECT * FROM categories WHERE id = ?', [id]);
    logActivity('category_created', `Category "${name}" created`, req.ip);
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/categories/:id', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, slug, description, image_url } = req.body;
    const cat = queryOne('SELECT * FROM categories WHERE id = ?', [id]);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    
    execute('UPDATE categories SET name=?, slug=?, description=?, image_url=? WHERE id=?',
      [name || cat.name, slug || cat.slug, description !== undefined ? description : cat.description, image_url !== undefined ? image_url : cat.image_url, id]);
    
    logActivity('category_updated', `Category #${id} updated`, req.ip);
    const updated = queryOne('SELECT * FROM categories WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/categories/:id', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    execute('UPDATE products SET category_id = NULL WHERE category_id = ?', [id]);
    execute('DELETE FROM categories WHERE id = ?', [id]);
    logActivity('category_deleted', `Category #${id} deleted`, req.ip);
    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Products - Admin (list all products)
app.get('/api/admin/products', authenticateToken, (req, res) => {
  try {
    const { search, limit = 100, page = 1 } = req.query;
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 100));
    const pageNum = Math.max(1, parseInt(page) || 1);
    const offset = (pageNum - 1) * limitNum;

    let sql = `SELECT p.*, c.name as category_name, c.slug as category_slug
               FROM products p
               LEFT JOIN categories c ON p.category_id = c.id
               WHERE 1=1`;
    const params = [];

    if (search) {
      sql += ' AND (p.name LIKE ? OR p.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const countSql = sql.replace(/SELECT p\.\*, c\.name as category_name, c\.slug as category_slug/, 'SELECT COUNT(*) as total');
    const countResult = queryAll(countSql, params);
    const total = countResult[0]?.total || 0;

    sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const products = queryAll(sql, params);
    res.json({ products, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/products', authenticateToken, [
  body('name').trim().isLength({ min: 1 }),
  body('slug').trim().isLength({ min: 1 }),
  body('price').isFloat({ min: 0 })
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const { name, slug, description, price, compare_at_price, image_url, images, category_id, featured, in_stock, stock_count } = req.body;
    const imagesJson = Array.isArray(images) ? JSON.stringify(images) : (typeof images === 'string' ? images : '[]');
    const id = execute(
      `INSERT INTO products (name, slug, description, price, compare_at_price, image_url, images, category_id, featured, in_stock, stock_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, slug, description || '', price, compare_at_price || null, image_url || '', imagesJson, category_id || null, featured ? 1 : 0, in_stock !== undefined ? (in_stock ? 1 : 0) : 1, stock_count || 0]
    );
    const product = queryOne('SELECT * FROM products WHERE id = ?', [id]);
    logActivity('product_created', `Product "${name}" created`, req.ip);
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/products/:id', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, slug, description, price, compare_at_price, image_url, images, category_id, featured, in_stock, stock_count } = req.body;
    const product = queryOne('SELECT * FROM products WHERE id = ?', [id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const imagesJson = Array.isArray(images) ? JSON.stringify(images) : (typeof images === 'string' ? images : (product.images || '[]'));

    execute(
      `UPDATE products SET name=?, slug=?, description=?, price=?, compare_at_price=?, image_url=?, images=?, category_id=?, featured=?, in_stock=?, stock_count=? WHERE id=?`,
      [
        name || product.name,
        slug || product.slug,
        description !== undefined ? description : product.description,
        price || product.price,
        compare_at_price !== undefined ? compare_at_price : product.compare_at_price,
        image_url !== undefined ? image_url : product.image_url,
        imagesJson,
        category_id !== undefined ? category_id : product.category_id,
        featured !== undefined ? (featured ? 1 : 0) : product.featured,
        in_stock !== undefined ? (in_stock ? 1 : 0) : product.in_stock,
        stock_count !== undefined ? stock_count : product.stock_count,
        id
      ]
    );
    saveDb();

    logActivity('product_updated', `Product #${id} updated`, req.ip);
    const updated = queryOne('SELECT * FROM products WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/products/:id', authenticateToken, (req, res) => {
  try {
    execute('DELETE FROM products WHERE id = ?', [parseInt(req.params.id)]);
    logActivity('product_deleted', `Product #${req.params.id} deleted`, req.ip);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Image upload
app.post('/api/admin/upload', authenticateToken, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const url = `/${UPLOAD_DIR}/${req.file.filename}`;
    res.json({ url, filename: req.file.filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Orders - Admin
app.get('/api/admin/orders', authenticateToken, (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    let sql = 'SELECT * FROM orders';
    const params = [];

    if (status && status !== 'all') {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    
    if (limit) {
      const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
      sql += ' LIMIT ? OFFSET ?';
      params.push(parseInt(limit), offset);
    }

    const orders = queryAll(sql, params);
    for (const order of orders) {
      order.items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    }
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/orders/:id/status', authenticateToken, [
  body('status').isIn(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'])
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    execute('UPDATE orders SET status = ? WHERE id = ?', [status, id]);

    const updatedOrder = queryOne('SELECT * FROM orders WHERE id = ?', [id]);
    syncCustomerTrackingForOrder(updatedOrder);

    logActivity('order_status', `Order #${id} status changed to ${status}`, req.ip);
    res.json(updatedOrder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/orders/:id/tracking', authenticateToken, [
  body('tracking_number').trim().isLength({ min: 1 })
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const id = parseInt(req.params.id);
    const { tracking_number } = req.body;
    execute('UPDATE orders SET tracking_number = ? WHERE id = ?', [tracking_number, id]);

    const currentOrder = queryOne('SELECT * FROM orders WHERE id = ?', [id]);
    if (currentOrder && ['pending', 'confirmed'].includes(String(currentOrder.status || '').toLowerCase())) {
      execute('UPDATE orders SET status = ? WHERE id = ?', ['shipped', id]);
    }

    const order = queryOne('SELECT * FROM orders WHERE id = ?', [id]);
    syncCustomerTrackingForOrder(order);

    logActivity('order_tracking', `Order #${id} tracking set to ${tracking_number}`, req.ip);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/orders/:id/notes', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { notes } = req.body;
    execute('UPDATE orders SET notes = ? WHERE id = ?', [notes || '', id]);
    const order = queryOne('SELECT * FROM orders WHERE id = ?', [id]);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/orders/:id/payment', authenticateToken, [
  body('payment_status').isIn(['unpaid', 'awaiting_payment', 'paid', 'refunded']),
  body('payment_reference').optional().trim()
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const id = parseInt(req.params.id);
    const { payment_status, payment_reference } = req.body;
    execute(
      'UPDATE orders SET payment_status = ?, payment_reference = ? WHERE id = ?',
      [payment_status, payment_reference || '', id]
    );

    const order = queryOne('SELECT * FROM orders WHERE id = ?', [id]);
    logActivity('payment_status', `Order #${id} payment marked ${payment_status}`, req.ip);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export orders to CSV (also accepts token as query param for window.open)
app.get('/api/admin/orders/export/csv', (req, res, next) => {
  // Allow token via query param for easy export
  const queryToken = req.query.token;
  if (queryToken) {
    req.headers['authorization'] = `Bearer ${queryToken}`;
  }
  authenticateToken(req, res, next);
}, (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM orders';
    const params = [];
    if (status && status !== 'all') {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    
    const orders = queryAll(sql, params);
    for (const order of orders) {
      order.items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    }

    let csv = 'Order ID,Customer,Email,Items,Total,Status,Date,Tracking\n';
    for (const order of orders) {
      const items = (order.items || []).map(i => `${i.product_name} x${i.quantity}`).join('; ');
      csv += `${order.id},"${order.customer_name}","${order.customer_email}","${items}",$${order.total.toFixed(2)},${order.status},${order.created_at},${order.tracking_number || ''}\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=orders-export.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customers - Admin
app.get('/api/admin/customers', authenticateToken, (req, res) => {
  try {
    const customers = queryAll('SELECT id, name, email, phone, shipping_address, city, state, zip_code, banned, created_at FROM customers ORDER BY created_at DESC');
    for (const c of customers) {
      const orderCount = queryOne('SELECT COUNT(*) as count FROM orders WHERE customer_email = ?', [c.email]);
      c.order_count = orderCount.count;
      const totalSpent = queryOne('SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE customer_email = ? AND status != "cancelled"', [c.email]);
      c.total_spent = totalSpent.total;
    }
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Update customer profile
app.put('/api/admin/customers/:id', authenticateToken, [
  body('name').optional().trim().isLength({ min: 1 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().trim(),
  body('shipping_address').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('zip_code').optional().trim()
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const id = parseInt(req.params.id);
    const customer = queryOne('SELECT * FROM customers WHERE id = ?', [id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const { name, email, phone, shipping_address, city, state, zip_code } = req.body;

    execute(
      'UPDATE customers SET name=?, email=?, phone=?, shipping_address=?, city=?, state=?, zip_code=? WHERE id=?',
      [
        name || customer.name,
        email || customer.email,
        phone !== undefined ? phone : customer.phone,
        shipping_address !== undefined ? shipping_address : customer.shipping_address,
        city !== undefined ? city : customer.city,
        state !== undefined ? state : customer.state,
        zip_code !== undefined ? zip_code : customer.zip_code,
        id
      ]
    );

    logActivity('customer_updated', `Customer #${id} (${email || customer.email}) updated by admin`, req.ip);
    const updated = queryOne('SELECT id, name, email, phone, shipping_address, city, state, zip_code, banned, created_at FROM customers WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Ban/unban customer
app.put('/api/admin/customers/:id/ban', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const customer = queryOne('SELECT * FROM customers WHERE id = ?', [id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const newBannedState = customer.banned ? 0 : 1;
    execute('UPDATE customers SET banned = ? WHERE id = ?', [newBannedState, id]);

    logActivity('customer_ban_toggle', `Customer #${id} (${customer.email}) ${newBannedState ? 'banned' : 'unbanned'}`, req.ip);
    const updated = queryOne('SELECT id, name, email, phone, shipping_address, city, state, zip_code, banned, created_at FROM customers WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get single customer profile with orders
app.get('/api/admin/customers/:id', authenticateToken, (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const customer = queryOne('SELECT id, name, email, phone, shipping_address, city, state, zip_code, banned, created_at FROM customers WHERE id = ?', [customerId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    // Get all orders for this customer
    const orders = queryAll(
      'SELECT id, total, status, tracking_number, payment_status, created_at FROM orders WHERE customer_id = ? OR customer_email = ? ORDER BY created_at DESC',
      [customer.id, customer.email]
    );
    for (const o of orders) {
      o.items = queryAll('SELECT product_name, quantity, price FROM order_items WHERE order_id = ?', [o.id]);
    }

    // Wishlist
    const wishlist = queryAll(
      `SELECT p.id, p.name, p.price, p.image_url FROM wishlist w JOIN products p ON w.product_id = p.id WHERE w.customer_id = ?`,
      [customer.id]
    );

    // Total spent
    const totalSpent = queryOne('SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE (customer_id = ? OR customer_email = ?) AND status != "cancelled"', [customer.id, customer.email]);

    res.json({
      ...customer,
      orders,
      wishlist,
      total_spent: totalSpent.total,
      total_orders: orders.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Coupons - Admin
app.get('/api/admin/coupons', authenticateToken, (req, res) => {
  try {
    const coupons = queryAll('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/coupons', authenticateToken, [
  body('code').trim().isLength({ min: 1 }),
  body('discount_percent').optional().isFloat({ min: 0, max: 100 }),
  body('discount_amount').optional().isFloat({ min: 0 }),
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const { code, discount_percent = 0, discount_amount = 0, min_order = 0, max_uses = 0, expires_at } = req.body;
    const id = execute(
      'INSERT INTO coupons (code, discount_percent, discount_amount, min_order, max_uses, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [code.toUpperCase(), discount_percent, discount_amount, min_order, max_uses, expires_at || null]
    );
    const coupon = queryOne('SELECT * FROM coupons WHERE id = ?', [id]);
    logActivity('coupon_created', `Coupon "${code}" created`, req.ip);
    res.status(201).json(coupon);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'A coupon with this code already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/coupons/:id', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { code, discount_percent, discount_amount, min_order, max_uses, is_active, expires_at } = req.body;
    const coupon = queryOne('SELECT * FROM coupons WHERE id = ?', [id]);
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });

    execute(
      'UPDATE coupons SET code=?, discount_percent=?, discount_amount=?, min_order=?, max_uses=?, is_active=?, expires_at=? WHERE id=?',
      [
        code || coupon.code,
        discount_percent !== undefined ? discount_percent : coupon.discount_percent,
        discount_amount !== undefined ? discount_amount : coupon.discount_amount,
        min_order !== undefined ? min_order : coupon.min_order,
        max_uses !== undefined ? max_uses : coupon.max_uses,
        is_active !== undefined ? (is_active ? 1 : 0) : coupon.is_active,
        expires_at !== undefined ? expires_at : coupon.expires_at,
        id
      ]
    );
    const updated = queryOne('SELECT * FROM coupons WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/coupons/:id', authenticateToken, (req, res) => {
  try {
    execute('DELETE FROM coupons WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard stats
app.get('/api/admin/stats', authenticateToken, (req, res) => {
  try {
    const totalProducts = queryOne('SELECT COUNT(*) as count FROM products').count;
    const totalOrders = queryOne('SELECT COUNT(*) as count FROM orders').count;
    const totalRevenue = queryOne('SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status != "cancelled"').total;
    const pendingOrders = queryOne('SELECT COUNT(*) as count FROM orders WHERE status = "pending"').count;
    const outOfStock = queryOne('SELECT COUNT(*) as count FROM products WHERE in_stock = 0 OR stock_count = 0').count;
    const totalCustomers = queryOne('SELECT COUNT(DISTINCT customer_email) as count FROM orders').count;
    const registeredCustomers = queryOne('SELECT COUNT(*) as count FROM customers').count;

    // Sales chart data (last 7 days)
    const salesData = queryAll(`
      SELECT DATE(created_at) as date, COUNT(*) as orders, COALESCE(SUM(total), 0) as revenue
      FROM orders
      WHERE created_at >= datetime('now', '-7 days') AND status != 'cancelled'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    // Top products
    const topProducts = queryAll(`
      SELECT oi.product_name, SUM(oi.quantity) as total_sold, SUM(oi.price * oi.quantity) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'cancelled'
      GROUP BY oi.product_name
      ORDER BY total_sold DESC
      LIMIT 10
    `);

    // Low stock products
    const lowStock = queryAll('SELECT id, name, stock_count FROM products WHERE stock_count > 0 AND stock_count < 10 ORDER BY stock_count ASC LIMIT 10');

    // Recent activity
    const recentActivity = queryAll('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 20');

    res.json({
      totalProducts, totalOrders, totalRevenue, pendingOrders, outOfStock,
      totalCustomers, registeredCustomers,
      salesData, topProducts, lowStock, recentActivity
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Activity log
app.get('/api/admin/activity', authenticateToken, (req, res) => {
  try {
    const logs = queryAll('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 100');
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// Shipping Zones & Rates API
// ============================

// Get all shipping zones (public - for checkout calculation)
app.get('/api/shipping/zones', (req, res) => {
  try {
    const zones = queryAll('SELECT * FROM shipping_zones WHERE is_active = 1 ORDER BY name');
    for (const zone of zones) {
      zone.rates = queryAll('SELECT * FROM shipping_rates WHERE zone_id = ? AND is_active = 1 ORDER BY price', [zone.id]);
    }
    res.json(zones);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all shipping zones
app.get('/api/admin/shipping/zones', authenticateToken, (req, res) => {
  try {
    const zones = queryAll('SELECT * FROM shipping_zones ORDER BY name');
    for (const zone of zones) {
      zone.rates = queryAll('SELECT * FROM shipping_rates WHERE zone_id = ?', [zone.id]);
    }
    res.json(zones);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Create shipping zone
app.post('/api/admin/shipping/zones', authenticateToken, [
  body('name').trim().isLength({ min: 1 }),
  body('countries').optional().isArray()
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const { name, countries = [], is_active = true } = req.body;
    const id = execute(
      'INSERT INTO shipping_zones (name, countries, is_active) VALUES (?, ?, ?)',
      [name, JSON.stringify(countries), is_active ? 1 : 0]
    );
    const zone = queryOne('SELECT * FROM shipping_zones WHERE id = ?', [id]);
    logActivity('shipping_zone_created', `Shipping zone "${name}" created`, req.ip);
    res.status(201).json(zone);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Update shipping zone
app.put('/api/admin/shipping/zones/:id', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, countries, is_active } = req.body;
    const zone = queryOne('SELECT * FROM shipping_zones WHERE id = ?', [id]);
    if (!zone) return res.status(404).json({ error: 'Zone not found' });

    execute(
      'UPDATE shipping_zones SET name = ?, countries = ?, is_active = ? WHERE id = ?',
      [name || zone.name, countries !== undefined ? JSON.stringify(countries) : zone.countries, is_active !== undefined ? (is_active ? 1 : 0) : zone.is_active, id]
    );
    const updated = queryOne('SELECT * FROM shipping_zones WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete shipping zone
app.delete('/api/admin/shipping/zones/:id', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    execute('DELETE FROM shipping_rates WHERE zone_id = ?', [id]);
    execute('DELETE FROM shipping_zones WHERE id = ?', [id]);
    logActivity('shipping_zone_deleted', `Shipping zone #${id} deleted`, req.ip);
    res.json({ message: 'Zone deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Create shipping rate
app.post('/api/admin/shipping/zones/:id/rates', authenticateToken, [
  body('name').trim().isLength({ min: 1 }),
  body('price').isFloat({ min: 0 })
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const zoneId = parseInt(req.params.id);
    const { name, price, min_order = 0, max_order = 0, is_free_shipping = false } = req.body;
    const id = execute(
      'INSERT INTO shipping_rates (zone_id, name, price, min_order, max_order, is_free_shipping) VALUES (?, ?, ?, ?, ?, ?)',
      [zoneId, name, price, min_order, max_order, is_free_shipping ? 1 : 0]
    );
    const rate = queryOne('SELECT * FROM shipping_rates WHERE id = ?', [id]);
    res.status(201).json(rate);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Update shipping rate
app.put('/api/admin/shipping/rates/:id', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, price, min_order, max_order, is_free_shipping } = req.body;
    const rate = queryOne('SELECT * FROM shipping_rates WHERE id = ?', [id]);
    if (!rate) return res.status(404).json({ error: 'Rate not found' });

    execute(
      'UPDATE shipping_rates SET name = ?, price = ?, min_order = ?, max_order = ?, is_free_shipping = ? WHERE id = ?',
      [name || rate.name, price !== undefined ? price : rate.price, min_order !== undefined ? min_order : rate.min_order, max_order !== undefined ? max_order : rate.max_order, is_free_shipping !== undefined ? (is_free_shipping ? 1 : 0) : rate.is_free_shipping, id]
    );
    const updated = queryOne('SELECT * FROM shipping_rates WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete shipping rate
app.delete('/api/admin/shipping/rates/:id', authenticateToken, (req, res) => {
  try {
    execute('DELETE FROM shipping_rates WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ message: 'Rate deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// Tax Settings API
// ============================

// Get tax settings (public - for checkout calculation)
app.get('/api/taxes', (req, res) => {
  try {
    const taxes = queryAll('SELECT * FROM tax_settings WHERE is_active = 1 ORDER BY name');
    res.json(taxes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all tax settings
app.get('/api/admin/taxes', authenticateToken, (req, res) => {
  try {
    const taxes = queryAll('SELECT * FROM tax_settings ORDER BY name');
    res.json(taxes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Create tax
app.post('/api/admin/taxes', authenticateToken, [
  body('name').trim().isLength({ min: 1 }),
  body('rate').isFloat({ min: 0, max: 100 })
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const { name, rate, countries = [], is_compound = false, is_active = true } = req.body;
    const id = execute(
      'INSERT INTO tax_settings (name, rate, countries, is_compound, is_active) VALUES (?, ?, ?, ?, ?)',
      [name, rate, JSON.stringify(countries), is_compound ? 1 : 0, is_active ? 1 : 0]
    );
    const tax = queryOne('SELECT * FROM tax_settings WHERE id = ?', [id]);
    logActivity('tax_created', `Tax "${name}" created at ${rate}%`, req.ip);
    res.status(201).json(tax);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Update tax
app.put('/api/admin/taxes/:id', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, rate, countries, is_compound, is_active } = req.body;
    const tax = queryOne('SELECT * FROM tax_settings WHERE id = ?', [id]);
    if (!tax) return res.status(404).json({ error: 'Tax not found' });

    execute(
      'UPDATE tax_settings SET name = ?, rate = ?, countries = ?, is_compound = ?, is_active = ? WHERE id = ?',
      [name || tax.name, rate !== undefined ? rate : tax.rate, countries !== undefined ? JSON.stringify(countries) : tax.countries, is_compound !== undefined ? (is_compound ? 1 : 0) : tax.is_compound, is_active !== undefined ? (is_active ? 1 : 0) : tax.is_active, id]
    );
    const updated = queryOne('SELECT * FROM tax_settings WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete tax
app.delete('/api/admin/taxes/:id', authenticateToken, (req, res) => {
  try {
    execute('DELETE FROM tax_settings WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ message: 'Tax deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// Abandoned Carts API
// ============================

// Admin: Get abandoned carts
app.get('/api/admin/abandoned-carts', authenticateToken, (req, res) => {
  try {
    const { status = 'all', days = 30 } = req.query;
    let sql = "SELECT * FROM abandoned_carts WHERE created_at >= datetime('now', ?)";
    const params = [`-${days} days`];

    if (status === 'unrecovered') {
      sql += ' AND recovered = 0';
    } else if (status === 'recovered') {
      sql += ' AND recovered = 1';
    } else if (status === 'email_sent') {
      sql += ' AND email_sent = 1';
    }

    sql += ' ORDER BY created_at DESC';

    const carts = queryAll(sql, params);
    res.json(carts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get abandoned cart stats
app.get('/api/admin/abandoned-carts/stats', authenticateToken, (req, res) => {
  try {
    const total = queryOne('SELECT COUNT(*) as count FROM abandoned_carts').count;
    const recovered = queryOne('SELECT COUNT(*) as count FROM abandoned_carts WHERE recovered = 1').count;
    const unrecovered = total - recovered;
    const totalValue = queryOne('SELECT COALESCE(SUM(total), 0) as total FROM abandoned_carts WHERE recovered = 0').total;
    const recoveryRate = total > 0 ? ((recovered / total) * 100).toFixed(1) : 0;

    res.json({
      total,
      recovered,
      unrecovered,
      totalValue: Number(totalValue),
      recoveryRate: Number(recoveryRate)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Mark cart as recovered
app.put('/api/admin/abandoned-carts/:id/recover', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { order_id } = req.body;
    execute(
      'UPDATE abandoned_carts SET recovered = 1, recovery_order_id = ? WHERE id = ?',
      [order_id || null, id]
    );
    const cart = queryOne('SELECT * FROM abandoned_carts WHERE id = ?', [id]);
    logActivity('cart_recovered', `Abandoned cart #${id} marked as recovered`, req.ip);
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete abandoned cart
app.delete('/api/admin/abandoned-carts/:id', authenticateToken, (req, res) => {
  try {
    execute('DELETE FROM abandoned_carts WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ message: 'Cart deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public: Save abandoned cart
app.post('/api/abandoned-carts', [
  body('customer_email').isEmail(),
  body('items').isArray({ min: 1 }),
  body('total').isFloat({ min: 0 })
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const { customer_email, customer_name, items, total } = req.body;
    const token = 'cart_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    execute(
      'INSERT INTO abandoned_carts (customer_email, customer_name, items, total, token, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [customer_email.toLowerCase(), customer_name || '', JSON.stringify(items), total, token, expiresAt]
    );

    res.json({ message: 'Cart saved', token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// Gift Cards API
// ============================

// Public: Validate gift card
app.post('/api/gift-cards/validate', [
  body('code').trim().isLength({ min: 1 }),
  body('amount').isFloat({ min: 0 })
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const { code, amount } = req.body;
    const giftCard = queryOne(
      `SELECT * FROM gift_cards 
       WHERE code = ? AND is_active = 1 AND current_balance >= ? 
       AND (expires_at IS NULL OR expires_at > datetime("now"))`,
      [code.toUpperCase(), amount]
    );

    if (!giftCard) {
      return res.status(400).json({ error: 'Invalid or insufficient gift card', valid: false });
    }

    res.json({
      valid: true,
      code: giftCard.code,
      balance: giftCard.current_balance,
      can_cover: giftCard.current_balance >= amount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all gift cards
app.get('/api/admin/gift-cards', authenticateToken, (req, res) => {
  try {
    const { status = 'all' } = req.query;
    let sql = 'SELECT * FROM gift_cards';
    const params = [];

    if (status === 'active') {
      sql += ' WHERE is_active = 1 AND current_balance > 0';
    } else if (status === 'used') {
      sql += ' WHERE current_balance = 0';
    } else if (status === 'expired') {
      sql += ' WHERE expires_at IS NOT NULL AND expires_at <= datetime("now")';
    }

    sql += ' ORDER BY created_at DESC';

    const cards = queryAll(sql, params);
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Create gift card
app.post('/api/admin/gift-cards', authenticateToken, [
  body('initial_value').isFloat({ min: 1 }),
  body('customer_email').optional().isEmail()
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const { initial_value, customer_email, expires_at } = req.body;
    const code = 'GC' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();

    const id = execute(
      'INSERT INTO gift_cards (code, initial_value, current_balance, customer_email, expires_at) VALUES (?, ?, ?, ?, ?)',
      [code, initial_value, initial_value, customer_email || null, expires_at || null]
    );

    const giftCard = queryOne('SELECT * FROM gift_cards WHERE id = ?', [id]);
    logActivity('gift_card_created', `Gift card "${code}" created with $${initial_value}`, req.ip);
    res.status(201).json(giftCard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Update gift card balance
app.put('/api/admin/gift-cards/:id', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { current_balance, is_active } = req.body;
    const card = queryOne('SELECT * FROM gift_cards WHERE id = ?', [id]);
    if (!card) return res.status(404).json({ error: 'Gift card not found' });

    execute(
      'UPDATE gift_cards SET current_balance = ?, is_active = ? WHERE id = ?',
      [current_balance !== undefined ? current_balance : card.current_balance, is_active !== undefined ? (is_active ? 1 : 0) : card.is_active, id]
    );

    const updated = queryOne('SELECT * FROM gift_cards WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete gift card
app.delete('/api/admin/gift-cards/:id', authenticateToken, (req, res) => {
  try {
    execute('DELETE FROM gift_cards WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ message: 'Gift card deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// Staff Accounts API
// ============================

// Admin: Get all staff accounts
app.get('/api/admin/staff', authenticateToken, (req, res) => {
  try {
    const staff = queryAll('SELECT id, name, email, role, permissions, is_active, last_login, created_at FROM staff_accounts ORDER BY created_at DESC');
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Create staff account
app.post('/api/admin/staff', authenticateToken, [
  body('name').trim().isLength({ min: 1 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('role').isIn(['staff', 'manager'])
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const { name, email, password, role, permissions = {} } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);

    const id = execute(
      'INSERT INTO staff_accounts (name, email, password, role, permissions) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, role || 'staff', JSON.stringify(permissions)]
    );

    const staff = queryOne('SELECT id, name, email, role, permissions, is_active, created_at FROM staff_accounts WHERE id = ?', [id]);
    logActivity('staff_created', `Staff account "${email}" created`, req.ip);
    res.status(201).json(staff);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Admin: Update staff account
app.put('/api/admin/staff/:id', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, email, role, permissions, is_active, password } = req.body;
    const staff = queryOne('SELECT * FROM staff_accounts WHERE id = ?', [id]);
    if (!staff) return res.status(404).json({ error: 'Staff account not found' });

    let updateSql = 'UPDATE staff_accounts SET ';
    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (role !== undefined) { updates.push('role = ?'); params.push(role); }
    if (permissions !== undefined) { updates.push('permissions = ?'); params.push(JSON.stringify(permissions)); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (password) { updates.push('password = ?'); params.push(bcrypt.hashSync(password, 10)); }

    if (updates.length === 0) return res.json(staff);

    updateSql += updates.join(', ') + ' WHERE id = ?';
    params.push(id);

    execute(updateSql, params);
    const updated = queryOne('SELECT id, name, email, role, permissions, is_active, last_login, created_at FROM staff_accounts WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete staff account
app.delete('/api/admin/staff/:id', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    // Prevent deleting yourself
    const staff = queryOne('SELECT * FROM staff_accounts WHERE id = ?', [id]);
    if (staff && staff.email === ADMIN_EMAIL) {
      return res.status(400).json({ error: 'Cannot delete primary admin account' });
    }

    execute('DELETE FROM staff_accounts WHERE id = ?', [id]);
    logActivity('staff_deleted', `Staff account #${id} deleted`, req.ip);
    res.json({ message: 'Staff account deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Staff login
app.post('/api/admin/staff/login', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 })
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const { email, password } = req.body;
    const staff = queryOne('SELECT * FROM staff_accounts WHERE email = ? AND is_active = 1', [email]);

    if (!staff || !bcrypt.compareSync(password, staff.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    execute('UPDATE staff_accounts SET last_login = datetime("now") WHERE id = ?', [staff.id]);

    const token = jwt.sign({ email, role: staff.role, staff_id: staff.id }, JWT_SECRET, { expiresIn: '8h' });
    logActivity('staff_login', `Staff member "${email}" logged in`, req.ip);

    res.json({
      token,
      email,
      name: staff.name,
      role: staff.role,
      permissions: JSON.parse(staff.permissions || '{}')
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// Inventory Alerts API
// ============================

// Admin: Get inventory alerts
app.get('/api/admin/inventory/alerts', authenticateToken, (req, res) => {
  try {
    const { status = 'low' } = req.query;
    let sql = `
      SELECT p.id, p.name, p.stock_count, p.in_stock, 
             COALESCE(ia.threshold, 10) as threshold, ia.alert_sent
      FROM products p
      LEFT JOIN inventory_alerts ia ON p.id = ia.product_id
      WHERE p.in_stock = 1`;

    if (status === 'low') {
      sql += ' AND p.stock_count <= COALESCE(ia.threshold, 10)';
    } else if (status === 'out') {
      sql += ' AND p.stock_count = 0';
    } else if (status === 'all') {
      // Show all products with stock info
    }

    sql += ' ORDER BY p.stock_count ASC';

    const alerts = queryAll(sql);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Set inventory alert threshold
app.put('/api/admin/inventory/alerts/:productId', authenticateToken, [
  body('threshold').isInt({ min: 0 })
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const productId = parseInt(req.params.productId);
    const { threshold } = req.body;
    const product = queryOne('SELECT id, name FROM products WHERE id = ?', [productId]);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const existing = queryOne('SELECT id FROM inventory_alerts WHERE product_id = ?', [productId]);
    if (existing) {
      execute('UPDATE inventory_alerts SET threshold = ? WHERE product_id = ?', [threshold, productId]);
    } else {
      execute(
        'INSERT INTO inventory_alerts (product_id, product_name, threshold) VALUES (?, ?, ?)',
        [productId, product.name, threshold]
      );
    }

    res.json({ message: 'Alert threshold updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// Newsletter Subscribers API
// ============================

// Public: Subscribe to newsletter
app.post('/api/newsletter/subscribe', [
  body('email').isEmail().normalizeEmail()
], (req, res) => {
  const vErr = handleValidationErrors(req, res);
  if (vErr) return;

  try {
    const { email } = req.body;
    try {
      execute('INSERT INTO newsletter_subscribers (email) VALUES (?)', [email.toLowerCase()]);
      res.json({ message: 'Successfully subscribed to newsletter' });
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'Email already subscribed' });
      }
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get newsletter subscribers
app.get('/api/admin/newsletter', authenticateToken, (req, res) => {
  try {
    const subscribers = queryAll('SELECT * FROM newsletter_subscribers WHERE is_active = 1 ORDER BY created_at DESC');
    const stats = queryOne('SELECT COUNT(*) as total FROM newsletter_subscribers WHERE is_active = 1');
    res.json({ subscribers, total: stats?.total || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Export newsletter subscribers
app.get('/api/admin/newsletter/export', authenticateToken, (req, res) => {
  try {
    const subscribers = queryAll('SELECT email, created_at FROM newsletter_subscribers WHERE is_active = 1 ORDER BY created_at DESC');
    let csv = 'Email,Subscribed Date\n';
    for (const sub of subscribers) {
      csv += `${sub.email},${sub.created_at}\n`;
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=newsletter-subscribers.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Unsubscribe email
app.delete('/api/admin/newsletter/:email', authenticateToken, (req, res) => {
  try {
    execute('UPDATE newsletter_subscribers SET is_active = 0 WHERE email = ?', [req.params.email]);
    res.json({ message: 'Unsubscribed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// Enhanced Analytics API
// ============================

// Admin: Get detailed analytics
app.get('/api/admin/analytics', authenticateToken, (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);

    // Revenue breakdown
    const revenueByDay = queryAll(`
      SELECT DATE(created_at) as date, 
             COUNT(*) as orders, 
             COALESCE(SUM(total), 0) as revenue,
             COALESCE(SUM(discount), 0) as discounts
      FROM orders
      WHERE created_at >= datetime('now', ?) AND status != 'cancelled'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, [`-${days} days`]);

    // Conversion metrics
    const totalVisitors = queryOne('SELECT COUNT(*) as count FROM activity_log WHERE action = "page_view"').count || 1000; // Estimate
    const totalOrders = queryOne(`SELECT COUNT(*) as count FROM orders WHERE created_at >= datetime('now', ?)`, [`-${days} days`]).count;
    const conversionRate = totalVisitors > 0 ? ((totalOrders / totalVisitors) * 100).toFixed(2) : 0;

    // Average order value
    const aov = queryOne(`
      SELECT COALESCE(AVG(total), 0) as avg_value 
      FROM orders 
      WHERE created_at >= datetime('now', ?) AND status != 'cancelled'
    `, [`-${days} days`]);

    // Customer lifetime value
    const clv = queryOne(`
      SELECT COALESCE(AVG(customer_total), 0) as clv
      FROM (
        SELECT customer_email, SUM(total) as customer_total
        FROM orders
        WHERE created_at >= datetime('now', ?) AND status != 'cancelled'
        GROUP BY customer_email
      )
    `, [`-${days} days`]);

    // Top selling products
    const topProducts = queryAll(`
      SELECT oi.product_name, 
             SUM(oi.quantity) as units_sold, 
             SUM(oi.price * oi.quantity) as revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= datetime('now', ?) AND o.status != 'cancelled'
      GROUP BY oi.product_name
      ORDER BY units_sold DESC
      LIMIT 10
    `, [`-${days} days`]);

    // Sales by status
    const salesByStatus = queryAll(`
      SELECT status, COUNT(*) as count, COALESCE(SUM(total), 0) as revenue
      FROM orders
      WHERE created_at >= datetime('now', ?)
      GROUP BY status
    `, [`-${days} days`]);

    // New vs returning customers
    const newCustomers = queryOne(`
      SELECT COUNT(DISTINCT customer_email) as count
      FROM orders o1
      WHERE created_at >= datetime('now', ?)
        AND (
          SELECT COUNT(*) FROM orders o2 
          WHERE o2.customer_email = o1.customer_email 
          AND o2.created_at < o1.created_at
        ) = 0
    `, [`-${days} days`]).count;

    const returningCustomers = queryOne(`
      SELECT COUNT(DISTINCT customer_email) as count
      FROM orders
      WHERE created_at >= datetime('now', ?)
    `, [`-${days} days`]).count - newCustomers;

    res.json({
      revenueByDay,
      metrics: {
        totalOrders: Number(totalOrders),
        totalRevenue: Number(revenueByDay.reduce((sum, d) => sum + Number(d.revenue), 0)),
        totalDiscounts: Number(revenueByDay.reduce((sum, d) => sum + Number(d.discounts), 0)),
        conversionRate: Number(conversionRate),
        averageOrderValue: Number(aov.avg_value).toFixed(2),
        customerLifetimeValue: Number(clv.clv).toFixed(2),
        newCustomers: Number(newCustomers),
        returningCustomers: Number(returningCustomers)
      },
      topProducts,
      salesByStatus
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// AI Chat Memory (24-hour TTL)
// ============================
const chatConversations = new Map(); // conversationId -> { messages: [], expiresAt: Date }
const CHAT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Cleanup expired conversations every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, conv] of chatConversations) {
    if (now > conv.expiresAt) {
      chatConversations.delete(id);
    }
  }
}, 30 * 60 * 1000);

// ============================
// Auto-Cleanup Jobs (run every hour)
// ============================
setInterval(() => {
  try {
    // 1. Cancel abandoned carts older than 30 days
    execute(
      `DELETE FROM abandoned_carts WHERE created_at < datetime('now', '-30 days')`
    );
    
    // 2. Auto-cancel pending orders older than 14 days
    execute(
      `UPDATE orders SET status = 'cancelled', notes = 'Auto-cancelled after 14 days of inactivity' 
       WHERE status = 'pending' AND created_at < datetime('now', '-14 days')`
    );
    
    // 3. Mark unpaid cash_app orders as cancelled after 7 days
    execute(
      `UPDATE orders SET status = 'cancelled', notes = 'Auto-cancelled - payment not received within 7 days'
       WHERE payment_method = 'cash_app' AND payment_status = 'awaiting_payment' 
       AND status != 'cancelled' AND created_at < datetime('now', '-7 days')`
    );

    // 4. Clean old activity logs (keep last 1000)
    execute(
      `DELETE FROM activity_log WHERE id NOT IN (SELECT id FROM activity_log ORDER BY created_at DESC LIMIT 1000)`
    );

    // 5. Clean up old .bak files
    const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.bak') || f.endsWith('.db-wal') || f.endsWith('.db-shm'));
    for (const file of files) {
      const fpath = path.join(__dirname, file);
      try {
        const stats = fs.statSync(fpath);
        if (Date.now() - stats.mtimeMs > 7 * 24 * 60 * 60 * 1000) {
          fs.unlinkSync(fpath);
        }
      } catch (e) {}
    }
  } catch (e) {
    console.error('Cleanup error:', e.message);
  }
}, 60 * 60 * 1000); // Run every hour

// ============================
// AI Assistant API
// ============================
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const settings = getSettings();
    if (settings.ai_enabled !== 'true') {
      return res.status(403).json({ error: 'AI assistant is disabled' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API key not configured. Set GEMINI_API_KEY in the .env file.' });
    }

    const aiName = settings.ai_name || 'Nova';
    const storeName = settings.store_name || 'CACA STORE';
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

    // Build chat history transcript from frontend-provided history (max last 5-6 messages)
    const historyMessages = Array.isArray(history) ? history : [];
    const recentHistory = historyMessages.slice(-6);
    const chatHistoryTranscript = recentHistory.map(msg => {
      const role = msg.role === 'assistant' ? 'Assistant' : 'User';
      return `${role}: ${msg.text || ''}`;
    }).join('\n');

    // Build lightweight store context
    const prods = queryAll('SELECT p.id, p.name, p.slug, p.price, p.compare_at_price, p.featured, p.in_stock, p.stock_count, c.slug as category_slug FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.price ASC LIMIT 60');
    const totalProducts = queryOne('SELECT COUNT(*) as count FROM products').count;
    const productsData = prods.map(p =>
      `- ID:${p.id} **${p.name}** - $${p.price}${p.compare_at_price ? ` ~~$${p.compare_at_price}~~` : ''}${!p.in_stock ? ' [OUT]' : ''} [VIEW_PRODUCT:${p.id}]${p.category_slug ? ` [SHOW_CATEGORY:${p.category_slug}]` : ''}`
    ).join('\n');

    const systemPrompt = `You are ${aiName}, the premium AI shopping assistant for ${storeName}. Your only job is to act as an immersive, highly organized visual shopping guide based on the user's current request and the conversation history.

## RECENT CONVERSATION HISTORY (Use this for context and memory)
${chatHistoryTranscript || "No previous messages."}

## OUTPUT FORMAT RULES (STRICT CRITERIA)
- ABSOLUTELY NO INTRODUCTIONS OR WELCOME MESSAGES. Never say "Hi, I'm your assistant..." or any variation of a greeting.
- ABSOLUTELY NO GENERIC INTERMEDIATE HEADERS. Do not output text headers like "Products for you:" or "Here are some options:".
- Start your response DIRECTLY with a clean, 1-2 sentence editorial summary analyzing the user's intent.
- Break the products down into logical, curated sub-sections using clean markdown headings (e.g., ### AirPods Pro 2 & AirPods 4) followed by a short line of descriptive subtitle text.
- Under each heading, list the matching products cleanly using bullet points with their prices and respective interaction tags. 
- Keep product list lines completely minimalist. Do not include verbose descriptions inside the product bullet points.
- If the user's request doesn't match any available inventory, respond strictly with: "I couldn't find a match. Try a different search."

## INTERACTION TAGS
- Append actionable tags to every product using the exact database IDs.
- Available tags: [ADD_TO_CART:ID] [VIEW_PRODUCT:ID] [SHOW_CATEGORY:slug]

## AVAILABLE INVENTORY DATA (${totalProducts} total, 60 shown)
${productsData}`;

    // Build Gemini contents array: system prompt via systemInstruction, and the new user message as content
    const geminiContents = [{ role: 'user', parts: [{ text: message }] }];

    // Call Gemini API
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents: geminiContents,
          generationConfig: {
            maxOutputTokens: 600,
            temperature: 0.7,
            topP: 0.9
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API Error:', geminiRes.status, errText);
      return res.status(500).json({ error: `Gemini API error: ${geminiRes.status}. Check your API key in .env file or admin settings.` });
    }

    const data = await geminiRes.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.';

    // Extract product IDs mentioned in the reply and return matching products
    const productIdMatches = reply.match(/\[ADD_TO_CART:(\d+)\]|\[VIEW_PRODUCT:(\d+)\]|\[GO_TO_PRODUCT:(\d+)\]/g) || [];
    const mentionedIds = [...new Set(productIdMatches.map(m => parseInt(m.match(/:(\d+)/)[1])))];
    
    let matchedProducts = [];
    if (mentionedIds.length > 0) {
      const placeholders = mentionedIds.map(() => '?').join(',');
      matchedProducts = queryAll(
        `SELECT p.id, p.name, p.slug, p.price, p.compare_at_price, p.image_url, p.in_stock, p.stock_count
         FROM products p WHERE p.id IN (${placeholders})`,
        mentionedIds
      );
    }

    res.json({ 
      reply, 
      name: aiName,
      products: matchedProducts
    });
  } catch (err) {
    console.error('AI Chat Error:', err);
    res.status(500).json({ error: err.message || 'AI assistant error' });
  }
});

// ============================
// Serve Pages (protected)
// ============================
app.get('/admin', (req, res, next) => {
  // Serve admin.html - client-side will verify token from localStorage
  // and redirect to login if token is invalid or missing
  return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin/login', (req, res) => {
  // If already authenticated, prevent going back to login page
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && decoded.role === 'admin') {
        return res.redirect('/admin');
      }
    } catch (_) {
      // ignore
    }
  }
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});


// Serve /my-orders page
app.get('/my-orders', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'my-orders.html'));
});

// Serve individual product pages
app.get('/product/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'product.html'));
});

// Catch-all
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API route not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================
// Error handling middleware
// ============================
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  res.status(500).json({ error: NODE_ENV === 'production' ? 'Internal server error' : err.message });
});

// ============================
// Start Server
// ============================
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n  Storefront Server running at http://localhost:${PORT}`);
    console.log(`  Storefront: http://localhost:${PORT}`);
    console.log(`  Admin Login: http://localhost:${PORT}/admin/login`);
    console.log(`  Admin Panel: http://localhost:${PORT}/admin\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
