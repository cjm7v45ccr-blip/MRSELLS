// Seed script - run with: node seed.js
// SAFE: This script only adds missing data. It NEVER deletes existing products or categories.
require('dotenv').config();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, process.env.DB_PATH || 'store.db');

async function seed() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  let db;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables if they don't exist
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    description TEXT, image_url TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    description TEXT, price REAL NOT NULL, compare_at_price REAL, image_url TEXT,
    category_id INTEGER, featured INTEGER DEFAULT 0, in_stock INTEGER DEFAULT 1,
    stock_count INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  )`);

  // Get existing categories to avoid duplicates
  const existingCats = db.run('SELECT slug FROM categories');
  // Hacky: check if queryAll works by reading any row
  let hasCategories = false;
  try {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM categories');
    stmt.step();
    const row = stmt.getAsObject();
    hasCategories = row.count > 0;
    stmt.free();
  } catch (e) {}

  // Insert categories only if table is empty
  if (!hasCategories) {
    const catStmt = db.prepare('INSERT INTO categories (name, slug, description, image_url) VALUES (?, ?, ?, ?)');
    const categories = [
      ['Electronics', 'electronics', 'Latest gadgets and electronics', 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400'],
      ['Clothing', 'clothing', 'Premium apparel and fashion', 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=400'],
      ['Accessories', 'accessories', 'Complete your look', 'https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?w=400'],
      ['Home', 'home', 'Elevate your living space', 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400'],
      ['Sports', 'sports', 'Gear up for performance', 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400']
    ];
    for (const cat of categories) {
      try { catStmt.run(cat); } catch (e) {} // ignore duplicate errors
    }
    catStmt.free();
    console.log('Default categories created.');
  } else {
    console.log('Categories already exist, skipping...');
  }

  // Insert products that don't already exist (by slug)
  const prodStmt = db.prepare(`INSERT OR IGNORE INTO products (name, slug, description, price, compare_at_price, image_url, category_id, featured, in_stock, stock_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const products = [
    ['Apple AirPods Pro (3rd Generation)', 'apple-airpods-pro-3', 'Premium wireless earbuds featuring heart rate sensing, advanced Active Noise Cancellation, and a revised comfortable fit.', 249.00, 249.00, 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/airpods-pro-3-hero-select-202409?wid=400', null, 1, 1, 30],
    ['Fear of God ESSENTIALS Classic Hoodie', 'fear-of-god-essentials-classic-hoodie', 'A relaxed-fit pullover crafted from a heavy cotton-blend fleece, detailed with a tonal rubberized logo on the chest.', 105.00, 150.00, 'https://image-cdn.hypb.st/https%3A%2F%2Fhypebeast.com%2Fimage%2F2023%2F01%2Ffear-of-god-essentials-spring-2023-classic-hoodie-collection-1.jpg?w=400', null, 1, 1, 20],
    ['Fear of God ESSENTIALS Signature Classic Sweat Shorts', 'fear-of-god-essentials-signature-classic-shorts', 'Comfortable lounge shorts made from core fleece, featuring a relaxed fit, an elastic waistband, and extended drawstrings.', 86.00, 115.00, 'https://image-cdn.hypb.st/https%3A%2F%2Fhypebeast.com%2Fimage%2F2023%2F01%2Ffear-of-god-essentials-spring-2023-signature-shorts-collection-1.jpg?w=400', null, 1, 1, 25],
    ['Apple AirPods Pro (2nd Generation) USB-C', 'apple-airpods-pro-2', 'High-fidelity wireless earbuds built with the H2 chip, providing dynamic noise cancellation and up to 30 hours of battery life with the MagSafe case.', 199.99, 249.99, 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MQD83?wid=400', null, 1, 1, 35],
    ['Apple AirPods 4 (with Active Noise Cancellation)', 'apple-airpods-4', 'Open-ear wireless headphones redesigned for a secure fit, featuring Adaptive Audio and a compact USB-C charging case.', 179.00, 179.00, 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/airpods-4-hero-select-202409?wid=400', null, 1, 1, 40]
  ];

  let insertedCount = 0;
  for (const prod of products) {
    try {
      prodStmt.run(prod);
      insertedCount++;
    } catch (e) {
      // Slug already exists - skip silently
    }
  }
  prodStmt.free();

  // Save
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log(`Database seeding complete. ${insertedCount} new products added.`);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});