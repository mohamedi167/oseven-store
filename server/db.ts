import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type {
  AdminStats,
  Category,
  DiscountCode,
  FeaturedOutfit,
  LoginLog,
  OfferTimer,
  Order,
  OrderStatus,
  Product,
  ShippingZone,
} from '../src/types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'oseven.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS login_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      ip TEXT NOT NULL,
      success INTEGER NOT NULL,
      reason TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      image TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      outfit_slot TEXT NOT NULL DEFAULT 'none'
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      category_id TEXT NOT NULL,
      price REAL NOT NULL,
      old_price REAL,
      description TEXT NOT NULL,
      description_ar TEXT NOT NULL,
      size_type TEXT NOT NULL DEFAULT 'clothing',
      sizes_json TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      images_json TEXT NOT NULL,
      colors_json TEXT NOT NULL,
      show_in_store INTEGER NOT NULL DEFAULT 1,
      show_in_hero INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS offers (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      title_ar TEXT NOT NULL,
      discount_type TEXT NOT NULL,
      discount_value REAL NOT NULL,
      product_ids_json TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS discount_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      value REAL NOT NULL,
      expiry_date TEXT,
      usage_limit INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      min_order REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS shipping_zones (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      price REAL NOT NULL,
      governorates_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS featured_outfits (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      description TEXT NOT NULL,
      description_ar TEXT NOT NULL,
      top_id TEXT,
      top_color TEXT,
      pants_id TEXT,
      pants_color TEXT,
      shoes_id TEXT,
      shoes_color TEXT,
      accessory_id TEXT,
      accessory_color TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      governorate TEXT NOT NULL,
      address TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      items_json TEXT NOT NULL,
      subtotal REAL NOT NULL,
      shipping_cost REAL NOT NULL,
      discount_code TEXT,
      discount_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'New',
      created_at TEXT NOT NULL
    );
  `);
}

// --- Settings helpers ---
export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

// --- Login logs ---
export function addLoginLog(entry: LoginLog): void {
  db.prepare('INSERT INTO login_logs (id, timestamp, ip, success, reason) VALUES (?, ?, ?, ?, ?)').run(
    entry.id,
    entry.timestamp,
    entry.ip,
    entry.success ? 1 : 0,
    entry.reason
  );
  // Keep latest 100 logs
  db.prepare(
    'DELETE FROM login_logs WHERE id NOT IN (SELECT id FROM login_logs ORDER BY timestamp DESC LIMIT 100)'
  ).run();
}

export function listLoginLogs(): LoginLog[] {
  const rows = db.prepare('SELECT * FROM login_logs ORDER BY timestamp DESC LIMIT 50').all() as {
    id: string;
    timestamp: string;
    ip: string;
    success: number;
    reason: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    ip: r.ip,
    success: Boolean(r.success),
    reason: r.reason,
  }));
}

// --- Categories ---
export function listCategories(): Category[] {
  const rows = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, name ASC').all() as {
    id: string;
    name: string;
    name_ar: string;
    slug: string;
    image: string;
    sort_order: number;
    outfit_slot: Category['outfitSlot'];
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    nameAr: r.name_ar,
    slug: r.slug,
    image: r.image,
    sortOrder: r.sort_order,
    outfitSlot: r.outfit_slot,
  }));
}

export function upsertCategory(c: Category): void {
  db.prepare(`
    INSERT INTO categories (id, name, name_ar, slug, image, sort_order, outfit_slot)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      name_ar = excluded.name_ar,
      slug = excluded.slug,
      image = excluded.image,
      sort_order = excluded.sort_order,
      outfit_slot = excluded.outfit_slot
  `).run(c.id, c.name, c.nameAr, c.slug, c.image, c.sortOrder, c.outfitSlot);
}

export function deleteCategory(id: string): void {
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
}

// --- Products ---
function mapProductRow(r: Record<string, unknown>): Product {
  return {
    id: String(r.id),
    name: String(r.name),
    nameAr: String(r.name_ar),
    slug: String(r.slug),
    categoryId: String(r.category_id),
    price: Number(r.price),
    oldPrice: r.old_price !== null && r.old_price !== undefined ? Number(r.old_price) : null,
    description: String(r.description),
    descriptionAr: String(r.description_ar),
    sizeType: r.size_type as Product['sizeType'],
    sizes: JSON.parse(String(r.sizes_json)),
    stock: Number(r.stock),
    images: JSON.parse(String(r.images_json)),
    colors: JSON.parse(String(r.colors_json)),
    showInStore: Boolean(r.show_in_store),
    showInHero: Boolean(r.show_in_hero),
    createdAt: String(r.created_at),
  };
}

export function listProducts(onlyVisible: boolean = false): Product[] {
  const sql = onlyVisible
    ? 'SELECT * FROM products WHERE show_in_store = 1 ORDER BY created_at DESC'
    : 'SELECT * FROM products ORDER BY created_at DESC';
  const rows = db.prepare(sql).all() as Record<string, unknown>[];
  return rows.map(mapProductRow);
}

export function getProductById(id: string): Product | null {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapProductRow(row) : null;
}

export function upsertProduct(p: Product): void {
  db.prepare(`
    INSERT INTO products (
      id, name, name_ar, slug, category_id, price, old_price,
      description, description_ar, size_type, sizes_json, stock,
      images_json, colors_json, show_in_store, show_in_hero, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      name_ar = excluded.name_ar,
      slug = excluded.slug,
      category_id = excluded.category_id,
      price = excluded.price,
      old_price = excluded.old_price,
      description = excluded.description,
      description_ar = excluded.description_ar,
      size_type = excluded.size_type,
      sizes_json = excluded.sizes_json,
      stock = excluded.stock,
      images_json = excluded.images_json,
      colors_json = excluded.colors_json,
      show_in_store = excluded.show_in_store,
      show_in_hero = excluded.show_in_hero
  `).run(
    p.id,
    p.name,
    p.nameAr,
    p.slug,
    p.categoryId,
    p.price,
    p.oldPrice,
    p.description,
    p.descriptionAr,
    p.sizeType,
    JSON.stringify(p.sizes),
    p.stock,
    JSON.stringify(p.images),
    JSON.stringify(p.colors),
    p.showInStore ? 1 : 0,
    p.showInHero ? 1 : 0,
    p.createdAt
  );
}

export function updateProductPrice(id: string, price: number, oldPrice: number | null): void {
  db.prepare('UPDATE products SET price = ?, old_price = ? WHERE id = ?').run(price, oldPrice, id);
}

export function deleteProduct(id: string): void {
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
}

// --- Offers ---
export function listOffers(): OfferTimer[] {
  const rows = db.prepare('SELECT * FROM offers ORDER BY start_at DESC').all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    titleAr: String(r.title_ar),
    discountType: r.discount_type as OfferTimer['discountType'],
    discountValue: Number(r.discount_value),
    productIds: JSON.parse(String(r.product_ids_json)),
    startAt: String(r.start_at),
    endAt: String(r.end_at),
    active: Boolean(r.active),
  }));
}

export function upsertOffer(o: OfferTimer): void {
  db.prepare(`
    INSERT INTO offers (id, title, title_ar, discount_type, discount_value, product_ids_json, start_at, end_at, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      title_ar = excluded.title_ar,
      discount_type = excluded.discount_type,
      discount_value = excluded.discount_value,
      product_ids_json = excluded.product_ids_json,
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      active = excluded.active
  `).run(
    o.id,
    o.title,
    o.titleAr,
    o.discountType,
    o.discountValue,
    JSON.stringify(o.productIds),
    o.startAt,
    o.endAt,
    o.active ? 1 : 0
  );
}

export function deleteOffer(id: string): void {
  db.prepare('DELETE FROM offers WHERE id = ?').run(id);
}

// --- Discount Codes ---
export function listDiscountCodes(): DiscountCode[] {
  const rows = db.prepare('SELECT * FROM discount_codes ORDER BY code ASC').all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    code: String(r.code),
    type: r.type as DiscountCode['type'],
    value: Number(r.value),
    expiryDate: r.expiry_date ? String(r.expiry_date) : null,
    usageLimit: r.usage_limit !== null && r.usage_limit !== undefined ? Number(r.usage_limit) : null,
    usedCount: Number(r.used_count),
    minOrder: Number(r.min_order),
    active: Boolean(r.active),
  }));
}

export function getDiscountCodeByCode(code: string): DiscountCode | null {
  const row = db
    .prepare('SELECT * FROM discount_codes WHERE UPPER(code) = UPPER(?)')
    .get(code.trim()) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    code: String(row.code),
    type: row.type as DiscountCode['type'],
    value: Number(row.value),
    expiryDate: row.expiry_date ? String(row.expiry_date) : null,
    usageLimit: row.usage_limit !== null && row.usage_limit !== undefined ? Number(row.usage_limit) : null,
    usedCount: Number(row.used_count),
    minOrder: Number(row.min_order),
    active: Boolean(row.active),
  };
}

export function upsertDiscountCode(d: DiscountCode): void {
  db.prepare(`
    INSERT INTO discount_codes (id, code, type, value, expiry_date, usage_limit, used_count, min_order, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      code = excluded.code,
      type = excluded.type,
      value = excluded.value,
      expiry_date = excluded.expiry_date,
      usage_limit = excluded.usage_limit,
      used_count = excluded.used_count,
      min_order = excluded.min_order,
      active = excluded.active
  `).run(
    d.id,
    d.code.trim().toUpperCase(),
    d.type,
    d.value,
    d.expiryDate,
    d.usageLimit,
    d.usedCount,
    d.minOrder,
    d.active ? 1 : 0
  );
}

export function incrementDiscountCodeUsage(id: string): void {
  db.prepare('UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ?').run(id);
}

export function deleteDiscountCode(id: string): void {
  db.prepare('DELETE FROM discount_codes WHERE id = ?').run(id);
}

// --- Shipping Zones ---
export function listShippingZones(): ShippingZone[] {
  const rows = db.prepare('SELECT * FROM shipping_zones ORDER BY price ASC').all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    nameAr: String(r.name_ar),
    price: Number(r.price),
    governorates: JSON.parse(String(r.governorates_json)),
  }));
}

export function upsertShippingZone(z: ShippingZone): void {
  db.prepare(`
    INSERT INTO shipping_zones (id, name, name_ar, price, governorates_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      name_ar = excluded.name_ar,
      price = excluded.price,
      governorates_json = excluded.governorates_json
  `).run(z.id, z.name, z.nameAr, z.price, JSON.stringify(z.governorates));
}

export function deleteShippingZone(id: string): void {
  db.prepare('DELETE FROM shipping_zones WHERE id = ?').run(id);
}

export function findShippingCostForGovernorate(governorate: string): number {
  const zones = listShippingZones();
  const normalized = governorate.trim().toLowerCase();
  for (const z of zones) {
    if (z.governorates.some((g) => g.trim().toLowerCase() === normalized)) {
      return z.price;
    }
  }
  return zones.length > 0 ? zones[zones.length - 1].price : 70;
}

// --- Featured Outfits ---
export function listFeaturedOutfits(): FeaturedOutfit[] {
  const rows = db.prepare('SELECT * FROM featured_outfits').all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    nameAr: String(r.name_ar),
    description: String(r.description),
    descriptionAr: String(r.description_ar),
    topId: r.top_id ? String(r.top_id) : null,
    topColor: r.top_color ? String(r.top_color) : null,
    pantsId: r.pants_id ? String(r.pants_id) : null,
    pantsColor: r.pants_color ? String(r.pants_color) : null,
    shoesId: r.shoes_id ? String(r.shoes_id) : null,
    shoesColor: r.shoes_color ? String(r.shoes_color) : null,
    accessoryId: r.accessory_id ? String(r.accessory_id) : null,
    accessoryColor: r.accessory_color ? String(r.accessory_color) : null,
  }));
}

export function upsertFeaturedOutfit(o: FeaturedOutfit): void {
  db.prepare(`
    INSERT INTO featured_outfits (
      id, name, name_ar, description, description_ar,
      top_id, top_color, pants_id, pants_color,
      shoes_id, shoes_color, accessory_id, accessory_color
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      name_ar = excluded.name_ar,
      description = excluded.description,
      description_ar = excluded.description_ar,
      top_id = excluded.top_id,
      top_color = excluded.top_color,
      pants_id = excluded.pants_id,
      pants_color = excluded.pants_color,
      shoes_id = excluded.shoes_id,
      shoes_color = excluded.shoes_color,
      accessory_id = excluded.accessory_id,
      accessory_color = excluded.accessory_color
  `).run(
    o.id,
    o.name,
    o.nameAr,
    o.description,
    o.descriptionAr,
    o.topId,
    o.topColor,
    o.pantsId,
    o.pantsColor,
    o.shoesId,
    o.shoesColor,
    o.accessoryId,
    o.accessoryColor
  );
}

export function deleteFeaturedOutfit(id: string): void {
  db.prepare('DELETE FROM featured_outfits WHERE id = ?').run(id);
}

// --- Orders ---
function mapOrderRow(r: Record<string, unknown>): Order {
  return {
    id: String(r.id),
    orderNumber: String(r.order_number),
    customerName: String(r.customer_name),
    phone: String(r.phone),
    governorate: String(r.governorate),
    address: String(r.address),
    notes: String(r.notes || ''),
    items: JSON.parse(String(r.items_json)),
    subtotal: Number(r.subtotal),
    shippingCost: Number(r.shipping_cost),
    discountCode: r.discount_code ? String(r.discount_code) : null,
    discountAmount: Number(r.discount_amount || 0),
    total: Number(r.total),
    status: r.status as OrderStatus,
    createdAt: String(r.created_at),
  };
}

export function listOrders(): Order[] {
  const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return rows.map(mapOrderRow);
}

export function createOrder(o: Order): void {
  db.prepare(`
    INSERT INTO orders (
      id, order_number, customer_name, phone, governorate, address, notes,
      items_json, subtotal, shipping_cost, discount_code, discount_amount, total, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    o.id,
    o.orderNumber,
    o.customerName,
    o.phone,
    o.governorate,
    o.address,
    o.notes,
    JSON.stringify(o.items),
    o.subtotal,
    o.shippingCost,
    o.discountCode,
    o.discountAmount,
    o.total,
    o.status,
    o.createdAt
  );
}

export function updateOrderStatus(id: string, status: OrderStatus): void {
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
}

export function getAdminStats(): AdminStats {
  const orders = listOrders();
  const products = listProducts(false);
  const todayPrefix = new Date().toISOString().slice(0, 10);

  let ordersToday = 0;
  let revenueToday = 0;
  let totalRevenue = 0;
  let pendingOrders = 0;
  const productSales = new Map<string, { productId: string; name: string; sold: number; revenue: number }>();

  for (const o of orders) {
    if (o.status !== 'Cancelled') {
      totalRevenue += o.total;
      if (o.createdAt.startsWith(todayPrefix)) {
        ordersToday++;
        revenueToday += o.total;
      }
      for (const item of o.items) {
        const cur = productSales.get(item.productId) || {
          productId: item.productId,
          name: item.name,
          sold: 0,
          revenue: 0,
        };
        cur.sold += item.quantity;
        cur.revenue += item.price * item.quantity;
        productSales.set(item.productId, cur);
      }
    }
    if (o.status === 'New' || o.status === 'Confirmed') {
      pendingOrders++;
    }
  }

  const topProducts = Array.from(productSales.values())
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 5);

  const lowStockCount = products.filter((p) => p.stock <= 5).length;

  return {
    ordersToday,
    revenueToday,
    totalRevenue,
    totalOrders: orders.length,
    pendingOrders,
    topProducts,
    lowStockCount,
  };
}
