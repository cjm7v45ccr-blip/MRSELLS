# NOVASTORE — Premium E-Commerce Platform

A full-featured, professional e-commerce store front with a complete admin panel and RESTful API backend. Built with vanilla JavaScript, Node.js, Express, and SQLite.

![Tech Stack](https://img.shields.io/badge/stack-Node.js%20%7C%20Express%20%7C%20SQLite%20%7C%20Vanilla%20JS-blue)

---

## 📋 Table of Contents

- [Features Overview](#features-overview)
- [Customer Store Front](#-customer-store-front)
- [Admin Panel](#-admin-panel)
- [Backend API](#-backend-api)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Screenshots](#screenshots)

---

## Features Overview

### 🛍️ Customer Store Front

| Feature | Description |
|---------|-------------|
| **Hero Section** | Animated floating product cards with dynamic badge, title, and subtitle — all editable from admin |
| **Product Catalog** | 18 pre-loaded products across 5 categories with high-quality images (Unsplash) |
| **Category Filtering** | Click any category to instantly filter products (Electronics, Clothing, Home & Garden, Sports & Outdoors, Books) |
| **Live Search** | Real-time product search with debounced input — searches both name and description |
| **Shopping Cart** | Slide-out sidebar cart with quantity controls (+/-), remove items, and live total calculation |
| **Discount Display** | Shows original price strikethrough + percentage discount when `compare_at_price` is set |
| **Stock Management** | Products marked "Out of Stock" are visually indicated and cannot be added to cart |
| **Checkout Modal** | Full checkout form with name, email, phone, shipping address, city/state/zip |
| **Order Processing** | Validates cart server-side, sends buyers to secure checkout or creates manual orders |
| **Order Summary** | Displays itemized list with quantities and totals before submission |
| **Toast Notifications** | Smooth animated toasts for cart additions, order confirmation, and errors |
| **Newsletter Signup** | Collects email addresses (can be toggled on/off from admin settings) |
| **Contact Section** | Dynamic email, phone, and address — all editable from admin |
| **Social Media Links** | Facebook, Instagram, Twitter/X, LinkedIn — all configurable from admin |
| **Footer** | Brand description, quick links, customer service links, payment method icons |
| **Responsive Design** | Fully adaptive — works on mobile, tablet, and desktop |
| **Mobile Menu** | Hamburger menu with animated slide-down navigation |
| **Smooth Scrolling** | Anchor link smooth scroll for section navigation |

### 🔧 Admin Panel

| Feature | Description |
|---------|-------------|
| **Dashboard** | 6 stat cards: Total Revenue, Orders, Products, Pending Orders, Out of Stock, Customers |
| **Recent Orders** | Latest 5 orders table with status badges and dates |
| **Products CRUD** | Create, Read, Update, Delete products with image thumbnails, category, price, stock status |
| **Product Modal** | Full form with name, slug (auto-generated), description, price, compare price, image URL, category, featured toggle, stock toggle |
| **Categories CRUD** | Create, Read, Update, Delete categories with image thumbnails |
| **Category Modal** | Name, auto-slug generation, description, image URL |
| **Orders Management** | View all orders with customer info, items, totals, timestamps |
| **Order Status Update** | Inline dropdown to change order status: Pending → Confirmed → Shipped → Delivered → Cancelled |
| **Status Filtering** | Filter orders by status (All, Pending, Confirmed, Shipped, Delivered, Cancelled) |
| **Global Search** | Header search bar searches products from any page |
| **Settings Management** | Full control over store branding and content (see below) |
| **Sidebar Navigation** | Dark sidebar with icons for Dashboard, Products, Categories, Orders, Settings, View Store |
| **Mobile Responsive** | Collapsible sidebar with hamburger toggle |
| **Toast Notifications** | Success/error feedback for all CRUD operations |

### ⚙️ Admin Settings Control

| Setting Group | Fields |
|--------------|--------|
| **General** | Store Name, Tagline, Logo Text, Currency Symbol, Store Description |
| **Hero Section** | Badge Text (e.g., "New Collection"), Hero Title, Hero Subtitle |
| **Brand Colors** | Primary Color (hex) with color picker, Accent Color with color picker |
| **Contact Info** | Support Email, Support Phone, Address |
| **Social Media** | Facebook URL, Instagram URL, Twitter/X URL, LinkedIn URL |
| **Footer** | Footer Description, Enable Newsletter toggle |

### 🗄️ Backend API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/settings` | Public store settings |
| `GET` | `/api/categories` | All categories |
| `GET` | `/api/categories/:slug` | Single category |
| `GET` | `/api/products` | Products (filter: `?category=`, `?featured=true`, `?search=`) |
| `GET` | `/api/products/:slug` | Single product |
| `POST` | `/api/orders` | Place an order |
| `GET` | `/api/orders/:id` | Order details |
| `GET` | `/api/admin/settings` | All settings (admin) |
| `PUT` | `/api/admin/settings` | Update settings (admin) |
| `GET` | `/api/admin/stats` | Dashboard statistics |
| `GET` | `/api/admin/orders` | All orders with items |
| `PUT` | `/api/admin/orders/:id/status` | Update order status |
| `POST` | `/api/admin/products` | Create product |
| `PUT` | `/api/admin/products/:id` | Update product |
| `DELETE` | `/api/admin/products/:id` | Delete product |
| `POST` | `/api/admin/categories` | Create category |
| `PUT` | `/api/admin/categories/:id` | Update category |
| `DELETE` | `/api/admin/categories/:id` | Delete category |

---

## Quick Start

### Prerequisites
- **Node.js** (v16 or higher)
- **npm** (comes with Node.js)

## EmailJS Newsletter Setup

The newsletter form uses EmailJS through the backend endpoint `POST /api/newsletter/subscribe`.

Required environment variables (add them to `.env`):
- `EMAILJS_SERVICE_ID` (your service id)
- `EMAILJS_TEMPLATE_ID` (your newsletter template id)
- `EMAILJS_PUBLIC_KEY` (EmailJS public key / user id)

If you are using the backend endpoint from Node, make sure server-side API access is enabled in your EmailJS account security settings:
https://dashboard.emailjs.com/admin/account/security

A sample is provided in `.env.example`.

### Installation

```bash
# Clone or navigate to the project
cd store-front

# Install dependencies
npm install

# Seed the database with sample data
node seed.js

# Start the server
node server.js
```

### Access the Application

- **Store Front:** http://localhost:3000
- **Admin Panel:** http://localhost:3000/admin

---

## Project Structure

```
store-front/
├── server.js              # Express server + all API routes
├── seed.js                # Database seeder
├── package.json           # Project dependencies
├── store.db               # SQLite database (auto-generated)
├── README.md              # This file
└── public/                # Static files served by Express
    ├── index.html         # Customer store front page
    ├── styles.css         # Store front stylesheet
    ├── app.js             # Store front JavaScript
    ├── admin.html         # Admin panel page
    ├── admin.css          # Admin panel stylesheet
    └── admin.js           # Admin panel JavaScript
```

---

## Database Schema

### Categories Table
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| name | TEXT | Category name |
| slug | TEXT | URL-friendly identifier (unique) |
| description | TEXT | Category description |
| image_url | TEXT | Category image URL |

### Products Table
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| name | TEXT | Product name |
| slug | TEXT | URL-friendly identifier (unique) |
| description | TEXT | Product description |
| price | REAL | Current price |
| compare_at_price | REAL | Original/comparison price |
| image_url | TEXT | Product image URL |
| category_id | INTEGER | Foreign key to categories |
| featured | INTEGER | 1 = featured, 0 = not featured |
| in_stock | INTEGER | 1 = in stock, 0 = out of stock |
| created_at | DATETIME | Auto-generated timestamp |

### Orders Table
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| customer_name | TEXT | Customer's full name |
| customer_email | TEXT | Customer's email |
| customer_phone | TEXT | Customer's phone number |
| shipping_address | TEXT | Street address |
| city | TEXT | City |
| state | TEXT | State |
| zip_code | TEXT | ZIP/Postal code |
| total | REAL | Order total |
| status | TEXT | pending/confirmed/shipped/delivered/cancelled |
| created_at | DATETIME | Auto-generated timestamp |

### Order Items Table
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| order_id | INTEGER | Foreign key to orders |
| product_id | INTEGER | Foreign key to products |
| product_name | TEXT | Product name at time of order |
| quantity | INTEGER | Quantity ordered |
| price | REAL | Price at time of order |

### Settings Table
| Column | Type | Description |
|--------|------|-------------|
| key | TEXT | Setting key (primary key) |
| value | TEXT | Setting value |

---

## Tech Stack

- **Frontend:** HTML5, CSS3 (Custom Properties, Grid, Flexbox, Animations, Responsive Design), Vanilla JavaScript (ES6+, Async/Await, Fetch API)
- **Backend:** Node.js, Express.js
- **Database:** SQL.js (SQLite compiled to WebAssembly — no native compilation needed)
- **Design:** Purple accent theme, glass-morphism navbar, animated floating elements, modern transitions

## License

MIT License — free to use, modify, and distribute.
