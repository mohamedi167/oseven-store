import 'dotenv/config';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  ADMIN_COOKIE_NAME,
  checkLoginRateLimit,
  clearAdminSessionCookie,
  clearLoginFailures,
  createSessionToken,
  getClientIp,
  hashPassword,
  isStrongAdminPassword,
  makeAdminAuthMiddleware,
  recordLoginFailure,
  setAdminSessionCookie,
  verifyPassword,
  verifySessionToken,
} from './server/auth';
import {
  addLoginLog,
  createOrder,
  deleteCategory,
  deleteDiscountCode,
  deleteFeaturedOutfit,
  deleteOffer,
  deleteProduct,
  deleteShippingZone,
  findShippingCostForGovernorate,
  getAdminStats,
  getDiscountCodeByCode,
  getProductById,
  getSetting,
  incrementDiscountCodeUsage,
  initSchema,
  listCategories,
  listDiscountCodes,
  listFeaturedOutfits,
  listLoginLogs,
  listOffers,
  listOrders,
  listProducts,
  listShippingZones,
  setSetting,
  updateOrderStatus,
  updateProductPrice,
  upsertCategory,
  upsertDiscountCode,
  upsertFeaturedOutfit,
  upsertOffer,
  upsertProduct,
  upsertShippingZone,
} from './server/db';
import { seedDatabaseIfEmpty } from './server/seed';
import type { Order, OrderItem, OrderStatus, Product } from './src/types';
import { getEffectivePrice, isOfferActiveNow } from './src/utils/pricing';

const PORT = 3000;
const UPLOADS_DIR = path.resolve(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

initSchema();
seedDatabaseIfEmpty();

function getTokenVersion(): number {
  const raw = getSetting('admin_token_version');
  const parsed = raw ? parseInt(raw, 10) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

const requireAdmin = makeAdminAuthMiddleware(getTokenVersion);

// SSE clients for real-time order notifications
const sseClients = new Set<express.Response>();

function broadcastAdminEvent(event: string, payload: unknown): void {
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(frame);
    } catch {
      sseClients.delete(res);
    }
  }
}

function slugify(str: string): string {
  return (
    str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `item-${crypto.randomBytes(3).toString('hex')}`
  );
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.use(express.json({ limit: '15mb' }));

  // Serve uploaded assets directly
  app.use('/uploads', express.static(UPLOADS_DIR));

  // ==================== PUBLIC STOREFRONT ROUTES ====================

  app.get('/api/store/bootstrap', (_req, res) => {
    const categories = listCategories();
    const products = listProducts(true);
    const now = Date.now();
    const activeOffers = listOffers().filter((o) => isOfferActiveNow(o, now));
    const shippingZones = listShippingZones();
    const featuredOutfits = listFeaturedOutfits();
    res.json({
      categories,
      products,
      activeOffers,
      shippingZones,
      featuredOutfits,
    });
  });

  app.post('/api/store/validate-discount', (req, res) => {
    const { code, subtotal } = req.body || {};
    if (typeof code !== 'string' || !code.trim()) {
      res.status(400).json({ valid: false, error: 'Please enter a discount code.' });
      return;
    }

    const dc = getDiscountCodeByCode(code);
    if (!dc || !dc.active) {
      res.status(404).json({ valid: false, error: 'Invalid or inactive discount code.' });
      return;
    }
    if (dc.expiryDate && new Date(dc.expiryDate + 'T23:59:59Z').getTime() < Date.now()) {
      res.status(400).json({ valid: false, error: 'This discount code has expired.' });
      return;
    }
    if (dc.usageLimit !== null && dc.usedCount >= dc.usageLimit) {
      res.status(400).json({ valid: false, error: 'This discount code has reached its usage limit.' });
      return;
    }
    const orderSub = Number(subtotal) || 0;
    if (orderSub < dc.minOrder) {
      res.status(400).json({
        valid: false,
        error: `Minimum order of ${dc.minOrder} EGP required for this code.`,
      });
      return;
    }

    const discountAmount =
      dc.type === 'percentage'
        ? Math.min(orderSub, Math.round((orderSub * dc.value) / 100))
        : Math.min(orderSub, Math.round(dc.value));

    res.json({
      valid: true,
      code: dc.code,
      type: dc.type,
      value: dc.value,
      discountAmount,
    });
  });

  app.post('/api/orders', (req, res) => {
    const body = req.body || {};
    const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const governorate = typeof body.governorate === 'string' ? body.governorate.trim() : '';
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    const discountCodeInput = typeof body.discountCode === 'string' ? body.discountCode.trim() : '';
    const rawItems = Array.isArray(body.items) ? body.items : [];

    if (!customerName || !phone || !governorate || !address || rawItems.length === 0) {
      res.status(400).json({ error: 'Please complete all required delivery fields and add items.' });
      return;
    }

    const now = Date.now();
    const activeOffers = listOffers().filter((o) => isOfferActiveNow(o, now));
    const resolvedItems: OrderItem[] = [];
    let subtotal = 0;

    for (const raw of rawItems) {
      const productId = String(raw.productId || '');
      const qty = Math.max(1, Math.min(20, parseInt(String(raw.quantity || 1), 10) || 1));
      const size = String(raw.size || 'M');
      const colorName = String(raw.colorName || 'Default');
      const colorHex = String(raw.colorHex || '#141414');
      const image = String(raw.image || '');

      const prod = getProductById(productId);
      if (!prod || !prod.showInStore) {
        res.status(400).json({ error: `Product not available: ${productId}` });
        return;
      }

      const pricing = getEffectivePrice(prod, activeOffers, now);
      subtotal += pricing.finalPrice * qty;

      resolvedItems.push({
        productId: prod.id,
        name: prod.name,
        price: pricing.finalPrice,
        originalPrice: pricing.originalPrice,
        quantity: qty,
        size,
        colorName,
        colorHex,
        image: image || prod.images[0] || '',
      });
    }

    const shippingCost = findShippingCostForGovernorate(governorate);

    let appliedCode: string | null = null;
    let discountAmount = 0;

    if (discountCodeInput) {
      const dc = getDiscountCodeByCode(discountCodeInput);
      const validExpiry = !dc?.expiryDate || new Date(dc.expiryDate + 'T23:59:59Z').getTime() >= now;
      const validLimit = dc?.usageLimit === null || (dc && dc.usedCount < dc.usageLimit);
      if (dc && dc.active && validExpiry && validLimit && subtotal >= dc.minOrder) {
        appliedCode = dc.code;
        discountAmount =
          dc.type === 'percentage'
            ? Math.min(subtotal, Math.round((subtotal * dc.value) / 100))
            : Math.min(subtotal, Math.round(dc.value));
        incrementDiscountCodeUsage(dc.id);
      }
    }

    const total = Math.max(0, subtotal - discountAmount + shippingCost);
    const orderNumber = `OSEV-${Date.now().toString().slice(-5)}${Math.floor(10 + Math.random() * 89)}`;

    const order: Order = {
      id: crypto.randomUUID(),
      orderNumber,
      customerName,
      phone,
      governorate,
      address,
      notes,
      items: resolvedItems,
      subtotal,
      shippingCost,
      discountCode: appliedCode,
      discountAmount,
      total,
      status: 'New',
      createdAt: new Date().toISOString(),
    };

    createOrder(order);
    broadcastAdminEvent('new_order', order);

    res.status(201).json({ order });
  });

  // ==================== ADMIN AUTH ROUTES ====================

  app.get('/api/admin/session', (req, res) => {
    const cookieToken = req.cookies?.[ADMIN_COOKIE_NAME];
    const authHeader = req.headers.authorization;
    const bearer =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : undefined;
    const token = bearer || cookieToken;
    const payload = token ? verifySessionToken(token, getTokenVersion()) : null;

    if (!payload) {
      res.json({ authenticated: false });
      return;
    }

    res.json({
      authenticated: true,
      isDefaultWeakPassword: getSetting('is_default_weak_password') === '1',
    });
  });

  app.post('/api/admin/login', (req, res) => {
    const ip = getClientIp(req);
    const rate = checkLoginRateLimit(ip);
    if (!rate.allowed) {
      addLoginLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        ip,
        success: false,
        reason: `Locked out (${rate.retryAfterSec}s remaining)`,
      });
      res.status(429).json({
        error: `Too many failed attempts. Please wait ${Math.ceil(rate.retryAfterSec / 60)} minute(s) and try again.`,
        retryAfterSec: rate.retryAfterSec,
      });
      return;
    }

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const envPass = process.env.ADMIN_PASSWORD?.trim();
    const storedHash = getSetting('admin_password_hash');

    let valid = false;
    if (storedHash && verifyPassword(password, storedHash)) {
      valid = true;
    } else if (envPass && envPass.length > 0 && !getSetting('password_changed_via_ui')) {
      const a = crypto.createHash('sha256').update(password).digest();
      const b = crypto.createHash('sha256').update(envPass).digest();
      valid = crypto.timingSafeEqual(a, b);
    }

    if (!valid) {
      const fail = recordLoginFailure(ip);
      addLoginLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        ip,
        success: false,
        reason: fail.locked ? 'Wrong password (account locked)' : 'Wrong password',
      });
      res.status(401).json({
        error: fail.locked
          ? 'Too many incorrect attempts. Locked for 5 minutes.'
          : `Incorrect password. ${fail.attemptsLeft} attempt(s) left before lockout.`,
      });
      return;
    }

    clearLoginFailures(ip);
    addLoginLog({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ip,
      success: true,
      reason: 'Signed in',
    });

    const token = createSessionToken(getTokenVersion());
    setAdminSessionCookie(req, res, token);

    res.json({
      authenticated: true,
      token,
      isDefaultWeakPassword: getSetting('is_default_weak_password') === '1',
    });
  });

  app.post('/api/admin/logout', (req, res) => {
    clearAdminSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.post('/api/admin/change-password', requireAdmin, (req, res) => {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    const confirmPassword = typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';

    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: 'New password and confirmation do not match.' });
      return;
    }

    const strength = isStrongAdminPassword(newPassword);
    if (!strength.valid) {
      res.status(400).json({ error: strength.message });
      return;
    }

    const storedHash = getSetting('admin_password_hash');
    if (!storedHash || !verifyPassword(currentPassword, storedHash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const newHash = hashPassword(newPassword);
    const nextVersion = getTokenVersion() + 1;
    setSetting('admin_password_hash', newHash);
    setSetting('admin_token_version', String(nextVersion));
    setSetting('is_default_weak_password', '0');
    setSetting('password_changed_via_ui', '1');

    const freshToken = createSessionToken(nextVersion);
    setAdminSessionCookie(req, res, freshToken);

    res.json({ ok: true, token: freshToken, isDefaultWeakPassword: false });
  });

  app.get('/api/admin/login-logs', requireAdmin, (_req, res) => {
    res.json({ logs: listLoginLogs() });
  });

  // ==================== PROTECTED ADMIN ROUTES ====================

  app.get('/api/admin/events', requireAdmin, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    sseClients.add(res);
    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  app.get('/api/admin/overview', requireAdmin, (_req, res) => {
    res.json({
      stats: getAdminStats(),
      products: listProducts(false),
      categories: listCategories(),
      orders: listOrders(),
      offers: listOffers(),
      discountCodes: listDiscountCodes(),
      shippingZones: listShippingZones(),
      featuredOutfits: listFeaturedOutfits(),
      loginLogs: listLoginLogs(),
      isDefaultWeakPassword: getSetting('is_default_weak_password') === '1',
    });
  });

  // Upload image (base64 data URI) securely into public/uploads
  app.post('/api/admin/upload', requireAdmin, (req, res) => {
    const { dataUrl, filename } = req.body || {};
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      res.status(400).json({ error: 'Invalid image data.' });
      return;
    }

    const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) {
      res.status(400).json({ error: 'Only PNG, JPEG, or WEBP images are supported.' });
      return;
    }

    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > 8 * 1024 * 1024) {
      res.status(400).json({ error: 'Image must be smaller than 8 MB.' });
      return;
    }

    const baseName =
      typeof filename === 'string'
        ? slugify(filename.replace(/\.[^.]+$/, '')).slice(0, 24)
        : 'piece';
    const outName = `${baseName}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const resolved = path.resolve(UPLOADS_DIR, outName);
    if (!resolved.startsWith(UPLOADS_DIR + path.sep)) {
      res.status(400).json({ error: 'Invalid file path.' });
      return;
    }

    fs.writeFileSync(resolved, buf);
    res.json({ url: `/uploads/${outName}` });
  });

  // Products CRUD
  app.post('/api/admin/products', requireAdmin, (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.categoryId || Number(b.price) <= 0) {
      res.status(400).json({ error: 'Name, category, and positive price are required.' });
      return;
    }

    const id = b.id || `prod-${crypto.randomBytes(4).toString('hex')}`;
    const product: Product = {
      id,
      name: String(b.name).trim(),
      nameAr: String(b.nameAr || b.name).trim(),
      slug: `${slugify(String(b.name))}-${id.slice(-4)}`,
      categoryId: String(b.categoryId),
      price: Number(b.price),
      oldPrice: b.oldPrice ? Number(b.oldPrice) : null,
      description: String(b.description || ''),
      descriptionAr: String(b.descriptionAr || b.description || ''),
      sizeType: b.sizeType === 'shoes' || b.sizeType === 'one_size' ? b.sizeType : 'clothing',
      sizes: Array.isArray(b.sizes) && b.sizes.length > 0 ? b.sizes.map(String) : ['S', 'M', 'L', 'XL'],
      stock: Math.max(0, parseInt(String(b.stock ?? 10), 10) || 0),
      images: Array.isArray(b.images) ? b.images.map(String) : [],
      colors: Array.isArray(b.colors) ? b.colors : [],
      showInStore: b.showInStore !== false,
      showInHero: Boolean(b.showInHero),
      createdAt: b.createdAt || new Date().toISOString(),
    };

    upsertProduct(product);
    res.status(201).json({ product });
  });

  app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
    const existing = getProductById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    const b = req.body || {};
    const updated: Product = {
      ...existing,
      name: b.name !== undefined ? String(b.name).trim() : existing.name,
      nameAr: b.nameAr !== undefined ? String(b.nameAr).trim() : existing.nameAr,
      categoryId: b.categoryId !== undefined ? String(b.categoryId) : existing.categoryId,
      price: b.price !== undefined ? Number(b.price) : existing.price,
      oldPrice: b.oldPrice !== undefined ? (b.oldPrice ? Number(b.oldPrice) : null) : existing.oldPrice,
      description: b.description !== undefined ? String(b.description) : existing.description,
      descriptionAr: b.descriptionAr !== undefined ? String(b.descriptionAr) : existing.descriptionAr,
      sizeType: b.sizeType !== undefined ? b.sizeType : existing.sizeType,
      sizes: Array.isArray(b.sizes) ? b.sizes.map(String) : existing.sizes,
      stock: b.stock !== undefined ? Math.max(0, parseInt(String(b.stock), 10) || 0) : existing.stock,
      images: Array.isArray(b.images) ? b.images.map(String) : existing.images,
      colors: Array.isArray(b.colors) ? b.colors : existing.colors,
      showInStore: b.showInStore !== undefined ? Boolean(b.showInStore) : existing.showInStore,
      showInHero: b.showInHero !== undefined ? Boolean(b.showInHero) : existing.showInHero,
    };
    upsertProduct(updated);
    res.json({ product: updated });
  });

  app.patch('/api/admin/products/:id/price', requireAdmin, (req, res) => {
    const price = Number(req.body?.price);
    const oldPrice = req.body?.oldPrice ? Number(req.body.oldPrice) : null;
    if (!Number.isFinite(price) || price <= 0) {
      res.status(400).json({ error: 'Valid positive price is required.' });
      return;
    }
    updateProductPrice(req.params.id, price, oldPrice);
    res.json({ ok: true });
  });

  app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
    deleteProduct(req.params.id);
    res.json({ ok: true });
  });

  // Categories CRUD
  app.post('/api/admin/categories', requireAdmin, (req, res) => {
    const b = req.body || {};
    if (!b.name) {
      res.status(400).json({ error: 'Category name is required.' });
      return;
    }
    const id = b.id || `cat-${crypto.randomBytes(4).toString('hex')}`;
    const cat = {
      id,
      name: String(b.name).trim(),
      nameAr: String(b.nameAr || b.name).trim(),
      slug: `${slugify(String(b.name))}-${id.slice(-4)}`,
      image: String(b.image || '/assets/aistudio/_______5__0f6b9b70.jpeg'),
      sortOrder: parseInt(String(b.sortOrder ?? 10), 10) || 0,
      outfitSlot: (b.outfitSlot || 'top') as 'top' | 'pants' | 'shoes' | 'accessory' | 'none',
    };
    upsertCategory(cat);
    res.status(201).json({ category: cat });
  });

  app.put('/api/admin/categories/:id', requireAdmin, (req, res) => {
    const b = req.body || {};
    const cat = {
      id: req.params.id,
      name: String(b.name || '').trim(),
      nameAr: String(b.nameAr || b.name || '').trim(),
      slug: slugify(String(b.name || req.params.id)),
      image: String(b.image || '/assets/aistudio/_______5__0f6b9b70.jpeg'),
      sortOrder: parseInt(String(b.sortOrder ?? 0), 10) || 0,
      outfitSlot: (b.outfitSlot || 'top') as 'top' | 'pants' | 'shoes' | 'accessory' | 'none',
    };
    upsertCategory(cat);
    res.json({ category: cat });
  });

  app.delete('/api/admin/categories/:id', requireAdmin, (req, res) => {
    deleteCategory(req.params.id);
    res.json({ ok: true });
  });

  // Orders management
  app.get('/api/admin/orders', requireAdmin, (_req, res) => {
    res.json({ orders: listOrders() });
  });

  app.patch('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
    const status = String(req.body?.status || '') as OrderStatus;
    const allowed: OrderStatus[] = ['New', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];
    if (!allowed.includes(status)) {
      res.status(400).json({ error: 'Invalid order status.' });
      return;
    }
    updateOrderStatus(req.params.id, status);
    res.json({ ok: true });
  });

  // Offers CRUD
  app.post('/api/admin/offers', requireAdmin, (req, res) => {
    const b = req.body || {};
    const offer = {
      id: b.id || `offer-${crypto.randomBytes(4).toString('hex')}`,
      title: String(b.title || 'Timed Drop Offer'),
      titleAr: String(b.titleAr || b.title || 'عرض محدود'),
      discountType: (b.discountType === 'fixed' ? 'fixed' : 'percentage') as 'percentage' | 'fixed',
      discountValue: Math.max(1, Number(b.discountValue) || 10),
      productIds: Array.isArray(b.productIds) ? b.productIds.map(String) : [],
      startAt: String(b.startAt || new Date().toISOString()),
      endAt: String(b.endAt || new Date(Date.now() + 24 * 3600 * 1000).toISOString()),
      active: b.active !== false,
    };
    upsertOffer(offer);
    res.status(201).json({ offer });
  });

  app.delete('/api/admin/offers/:id', requireAdmin, (req, res) => {
    deleteOffer(req.params.id);
    res.json({ ok: true });
  });

  // Discount codes CRUD
  app.post('/api/admin/discount-codes', requireAdmin, (req, res) => {
    const b = req.body || {};
    if (!b.code) {
      res.status(400).json({ error: 'Discount code string is required.' });
      return;
    }
    const dc = {
      id: b.id || `disc-${crypto.randomBytes(4).toString('hex')}`,
      code: String(b.code).trim().toUpperCase(),
      type: (b.type === 'fixed' ? 'fixed' : 'percentage') as 'percentage' | 'fixed',
      value: Math.max(1, Number(b.value) || 10),
      expiryDate: b.expiryDate ? String(b.expiryDate) : null,
      usageLimit: b.usageLimit ? parseInt(String(b.usageLimit), 10) : null,
      usedCount: parseInt(String(b.usedCount || 0), 10) || 0,
      minOrder: Math.max(0, Number(b.minOrder) || 0),
      active: b.active !== false,
    };
    upsertDiscountCode(dc);
    res.status(201).json({ discountCode: dc });
  });

  app.delete('/api/admin/discount-codes/:id', requireAdmin, (req, res) => {
    deleteDiscountCode(req.params.id);
    res.json({ ok: true });
  });

  // Shipping Zones CRUD
  app.post('/api/admin/shipping-zones', requireAdmin, (req, res) => {
    const b = req.body || {};
    const zone = {
      id: b.id || `ship-${crypto.randomBytes(4).toString('hex')}`,
      name: String(b.name || 'New Zone'),
      nameAr: String(b.nameAr || b.name || 'منطقة شحن'),
      price: Math.max(0, Number(b.price) || 0),
      governorates: Array.isArray(b.governorates)
        ? b.governorates.map((g: unknown) => String(g).trim()).filter(Boolean)
        : [],
    };
    upsertShippingZone(zone);
    res.status(201).json({ shippingZone: zone });
  });

  app.delete('/api/admin/shipping-zones/:id', requireAdmin, (req, res) => {
    deleteShippingZone(req.params.id);
    res.json({ ok: true });
  });

  // Featured Outfits CRUD
  app.post('/api/admin/outfits', requireAdmin, (req, res) => {
    const b = req.body || {};
    const outfit = {
      id: b.id || `outfit-${crypto.randomBytes(4).toString('hex')}`,
      name: String(b.name || 'Curated Fit'),
      nameAr: String(b.nameAr || b.name || 'أوتفيت مختار'),
      description: String(b.description || ''),
      descriptionAr: String(b.descriptionAr || b.description || ''),
      topId: b.topId || null,
      topColor: b.topColor || null,
      pantsId: b.pantsId || null,
      pantsColor: b.pantsColor || null,
      shoesId: b.shoesId || null,
      shoesColor: b.shoesColor || null,
      accessoryId: b.accessoryId || null,
      accessoryColor: b.accessoryColor || null,
    };
    upsertFeaturedOutfit(outfit);
    res.status(201).json({ outfit });
  });

  app.delete('/api/admin/outfits/:id', requireAdmin, (req, res) => {
    deleteFeaturedOutfit(req.params.id);
    res.json({ ok: true });
  });

  // ==================== VITE / STATIC SERVING ====================

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OSEVEN server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
