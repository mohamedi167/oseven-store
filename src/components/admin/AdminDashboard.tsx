import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Clock,
  DollarSign,
  Edit3,
  FolderKanban,
  Layers,
  LayoutDashboard,
  Lock,
  LogOut,
  Package,
  Plus,
  Settings,
  ShoppingCart,
  Store,
  Tag,
  Trash2,
  Truck,
  Upload,
} from 'lucide-react';
import type {
  AdminStats,
  Category,
  DiscountCode,
  FeaturedOutfit,
  LoginLog,
  OfferTimer,
  Order,
  OrderStatus,
  OutfitSlot,
  Product,
  ShippingZone,
} from '../../types';
import { formatEGP } from '../../utils/pricing';
import { AdminProductEditor } from './AdminProductEditor';
import { adminFetch, getAdminMemoryToken, playOrderChime, setAdminMemoryToken, uploadAdminImage } from './adminApi';
import { CutoutImage } from '../CutoutImage';

type AdminTab =
  | 'overview'
  | 'orders'
  | 'products'
  | 'prices'
  | 'categories'
  | 'discounts'
  | 'shipping'
  | 'offers'
  | 'outfits'
  | 'settings';

interface OverviewPayload {
  stats: AdminStats;
  products: Product[];
  categories: Category[];
  orders: Order[];
  offers: OfferTimer[];
  discountCodes: DiscountCode[];
  shippingZones: ShippingZone[];
  featuredOutfits: FeaturedOutfit[];
  loginLogs: LoginLog[];
  isDefaultWeakPassword: boolean;
}

interface Props {
  onExitToStore: () => void;
  onStoreChanged: () => void;
}

export const AdminDashboard: React.FC<Props> = ({ onExitToStore, onStoreChanged }) => {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [tab, setTab] = useState<AdminTab>('overview');
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [unreadOrders, setUnreadOrders] = useState(0);
  const [liveToast, setLiveToast] = useState<Order | null>(null);

  // Products editor
  const [editingProduct, setEditingProduct] = useState<Product | null | undefined>(undefined);

  // Quick prices state
  const [priceDrafts, setPriceDrafts] = useState<Record<string, { price: string; oldPrice: string }>>({});

  // Order detail modal/expanded id
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Category form
  const [catForm, setCatForm] = useState<{
    id?: string;
    name: string;
    nameAr: string;
    image: string;
    sortOrder: string;
    outfitSlot: OutfitSlot;
  }>({ name: '', nameAr: '', image: '', sortOrder: '1', outfitSlot: 'top' });

  // Discount form
  const [discForm, setDiscForm] = useState({
    code: '',
    type: 'percentage' as 'percentage' | 'fixed',
    value: '15',
    expiryDate: '',
    usageLimit: '',
    minOrder: '0',
  });

  // Shipping form
  const [shipForm, setShipForm] = useState<{
    id?: string;
    name: string;
    nameAr: string;
    price: string;
    governoratesText: string;
  }>({ name: '', nameAr: '', price: '60', governoratesText: '' });

  // Offer timer form
  const [offerForm, setOfferForm] = useState({
    title: '',
    titleAr: '',
    discountType: 'percentage' as 'percentage' | 'fixed',
    discountValue: '20',
    startAt: new Date().toISOString().slice(0, 16),
    endAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 16),
    productIds: [] as string[],
  });

  // Featured outfit form
  const [outfitForm, setOutfitForm] = useState({
    name: '',
    nameAr: '',
    description: '',
    topId: '',
    pantsId: '',
    shoesId: '',
  });

  // Settings password change
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwMessage, setPwMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const payload = await adminFetch<OverviewPayload>('/api/admin/overview');
      setData(payload);
      const drafts: Record<string, { price: string; oldPrice: string }> = {};
      payload.products.forEach((p) => {
        drafts[p.id] = {
          price: String(p.price),
          oldPrice: p.oldPrice ? String(p.oldPrice) : '',
        };
      });
      setPriceDrafts(drafts);
    } catch {
      setAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/admin/session', { credentials: 'include' })
      .then((r) => r.json())
      .then((res) => {
        if (res.authenticated) {
          setAuthenticated(true);
          loadOverview();
        }
      })
      .finally(() => setCheckingAuth(false));
  }, [loadOverview]);

  // Real-time SSE listener for incoming orders
  useEffect(() => {
    if (!authenticated) return;
    let closed = false;
    const token = getAdminMemoryToken();
    const url = token ? `/api/admin/events` : `/api/admin/events`;

    // Use fetch stream if Bearer token is needed or EventSource when cookie is set
    const es = new EventSource(url, { withCredentials: true });
    es.addEventListener('new_order', (ev) => {
      if (closed) return;
      try {
        const order = JSON.parse((ev as MessageEvent).data) as Order;
        setUnreadOrders((n) => n + 1);
        setLiveToast(order);
        playOrderChime();
        loadOverview();
        setTimeout(() => setLiveToast(null), 7000);
      } catch {
        // ignore malformed event
      }
    });

    const fallbackPoll = setInterval(() => {
      loadOverview();
    }, 20000);

    return () => {
      closed = true;
      es.close();
      clearInterval(fallbackPoll);
    };
  }, [authenticated, loadOverview]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: passwordInput }),
      });
      const json = await res.json();
      if (!res.ok) {
        setLoginError(json.error || 'Authentication failed.');
        return;
      }
      if (json.token) setAdminMemoryToken(json.token);
      setAuthenticated(true);
      setPasswordInput('');
      loadOverview();
    } catch {
      setLoginError('Network error while signing in.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setAdminMemoryToken(null);
    setAuthenticated(false);
    setData(null);
  };

  const handleMutationDone = async () => {
    await loadOverview();
    onStoreChanged();
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#120A07] flex items-center justify-center text-[#C2B2A8] text-sm">
        Loading Admin Studio...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_center,_#2B160E_0%,_#120A07_70%)] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-[#1A0E0A] border border-white/15 p-8 shadow-2xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-display text-2xl font-extrabold tracking-tight text-white">
                OSEVEN
              </span>
              <p className="text-xs text-[#C2B2A8] mt-1">Admin Studio Access</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#7A0C1E]/25 border border-[#7A0C1E]/50 flex items-center justify-center text-[#FF8C9E]">
              <Lock className="w-5 h-5" />
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <div className="p-3 rounded-lg bg-red-500/15 border border-red-500/40 text-xs text-red-200">
                {loginError}
              </div>
            )}

            <div>
              <label className="block text-xs text-[#C2B2A8] mb-1.5">Admin Password</label>
              <input
                type="password"
                required
                autoFocus
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter dashboard password"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-sm text-white focus:outline-none focus:border-[#7A0C1E]"
              />
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-3 rounded-xl bg-[#7A0C1E] hover:bg-[#991228] disabled:opacity-50 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              {loggingIn ? 'Verifying...' : 'Enter Dashboard'}
            </button>
          </form>

          <div className="pt-4 border-t border-white/10 text-center">
            <button
              type="button"
              onClick={onExitToStore}
              className="text-xs text-[#C2B2A8] hover:text-white transition-colors cursor-pointer"
            >
              ← Return to Public Storefront
            </button>
          </div>
        </div>
      </div>
    );
  }

  const navItems: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'orders', label: 'Orders', icon: <ShoppingCart className="w-4 h-4" />, badge: unreadOrders },
    { id: 'products', label: 'Products', icon: <Package className="w-4 h-4" /> },
    { id: 'prices', label: 'Quick Prices', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'categories', label: 'Categories', icon: <FolderKanban className="w-4 h-4" /> },
    { id: 'discounts', label: 'Discount Codes', icon: <Tag className="w-4 h-4" /> },
    { id: 'shipping', label: 'Shipping Rules', icon: <Truck className="w-4 h-4" /> },
    { id: 'offers', label: 'Offer Timers', icon: <Clock className="w-4 h-4" /> },
    { id: 'outfits', label: 'Featured Outfits', icon: <Layers className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  const stats = data?.stats;
  const products = data?.products || [];
  const categories = data?.categories || [];
  const orders = data?.orders || [];
  const offers = data?.offers || [];
  const discountCodes = data?.discountCodes || [];
  const shippingZones = data?.shippingZones || [];
  const featuredOutfits = data?.featuredOutfits || [];
  const loginLogs = data?.loginLogs || [];

  return (
    <div className="min-h-screen bg-[#120A07] text-white flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 bg-[#190E0A] border-b lg:border-b-0 lg:border-r border-white/10 p-5 flex flex-col justify-between shrink-0">
        <div>
          <div className="flex items-center justify-between mb-6">
            <span className="font-display text-xl font-extrabold tracking-tight">OSEVEN ADMIN</span>
            <button
              type="button"
              onClick={onExitToStore}
              title="View Storefront"
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-[#C2B2A8] hover:text-white cursor-pointer"
            >
              <Store className="w-4 h-4" />
            </button>
          </div>

          <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  if (item.id === 'orders') setUnreadOrders(0);
                }}
                className={`flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tab === item.id
                    ? 'bg-[#7A0C1E] text-white'
                    : 'text-[#C2B2A8] hover:text-white hover:bg-white/5'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-white text-[#7A0C1E] text-[10px] font-bold font-mono-num">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="hidden lg:block pt-6 border-t border-white/10 space-y-2">
          <button
            type="button"
            onClick={onExitToStore}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-white cursor-pointer"
          >
            <Store className="w-4 h-4" />
            Open Public Storefront
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-white/10 hover:border-red-400/50 text-xs font-medium text-[#C2B2A8] hover:text-red-300 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-5 sm:p-8 space-y-6">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
          <h1 className="text-2xl font-bold capitalize">{tab.replace('-', ' ')}</h1>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setTab('orders');
                setUnreadOrders(0);
              }}
              className="relative p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-white/25 cursor-pointer"
              title="Order Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadOrders > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 min-w-[18px] h-[18px] rounded-full bg-[#7A0C1E] text-white text-[10px] font-bold flex items-center justify-center font-mono-num">
                  {unreadOrders}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="lg:hidden px-3 py-2 rounded-lg border border-white/15 text-xs text-[#C2B2A8] flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
          </div>
        </div>

        {/* Weak initial password warning */}
        {data?.isDefaultWeakPassword && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-amber-200">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                You are currently using the short initial password. Set a stronger password (8+ characters) in Settings.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setTab('settings')}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-semibold cursor-pointer"
            >
              Change Password
            </button>
          </div>
        )}

        {/* Real-time New Order Notification Toast */}
        {liveToast && (
          <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-2xl bg-[#7A0C1E] border border-white/25 p-4 shadow-2xl text-white space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wider opacity-85">
              New Order Received
            </div>
            <div className="font-bold text-sm">
              {liveToast.orderNumber} · {liveToast.customerName}
            </div>
            <div className="font-mono-num text-xs">
              {formatEGP(liveToast.total)} · {liveToast.governorate}
            </div>
            <button
              type="button"
              onClick={() => {
                setTab('orders');
                setSelectedOrderId(liveToast.id);
                setUnreadOrders(0);
                setLiveToast(null);
              }}
              className="mt-2 inline-block text-xs underline font-semibold cursor-pointer"
            >
              Inspect Order →
            </button>
          </div>
        )}

        {/* ==================== 1. OVERVIEW ==================== */}
        {tab === 'overview' && stats && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="rounded-xl bg-[#1A0E0A] border border-white/10 p-5">
                <div className="text-xs text-[#C2B2A8]">Orders Today</div>
                <div className="font-mono-num text-3xl font-bold mt-2">{stats.ordersToday}</div>
                <div className="text-xs text-white/50 mt-1">
                  {stats.pendingOrders} awaiting dispatch
                </div>
              </div>
              <div className="rounded-xl bg-[#1A0E0A] border border-white/10 p-5">
                <div className="text-xs text-[#C2B2A8]">Revenue Today</div>
                <div className="font-mono-num text-3xl font-bold mt-2">
                  {formatEGP(stats.revenueToday)}
                </div>
                <div className="text-xs text-white/50 mt-1">Excludes cancelled orders</div>
              </div>
              <div className="rounded-xl bg-[#1A0E0A] border border-white/10 p-5">
                <div className="text-xs text-[#C2B2A8]">Total Store Revenue</div>
                <div className="font-mono-num text-3xl font-bold mt-2">
                  {formatEGP(stats.totalRevenue)}
                </div>
                <div className="text-xs text-white/50 mt-1">{stats.totalOrders} lifetime orders</div>
              </div>
              <div className="rounded-xl bg-[#1A0E0A] border border-white/10 p-5">
                <div className="text-xs text-[#C2B2A8]">Catalog &amp; Stock</div>
                <div className="font-mono-num text-3xl font-bold mt-2">{products.length}</div>
                <div className="text-xs text-amber-300 mt-1">
                  {stats.lowStockCount} low-stock pieces (≤ 5)
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl bg-[#1A0E0A] border border-white/10 p-6">
                <h2 className="text-base font-bold mb-4">Top Products</h2>
                {stats.topProducts.length === 0 ? (
                  <p className="text-xs text-[#C2B2A8]">No order volume recorded yet.</p>
                ) : (
                  <div className="space-y-3">
                    {stats.topProducts.map((tp) => (
                      <div
                        key={tp.productId}
                        className="flex items-center justify-between py-2 border-b border-white/5 text-sm"
                      >
                        <span className="font-medium truncate pr-4">{tp.name}</span>
                        <span className="font-mono-num text-xs text-[#C2B2A8] shrink-0">
                          {tp.sold} sold · {formatEGP(tp.revenue)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-[#1A0E0A] border border-white/10 p-6">
                <h2 className="text-base font-bold mb-4">Latest Orders</h2>
                {orders.length === 0 ? (
                  <p className="text-xs text-[#C2B2A8]">Incoming customer orders will appear here in real time.</p>
                ) : (
                  <div className="space-y-3">
                    {orders.slice(0, 5).map((o) => (
                      <div
                        key={o.id}
                        className="flex items-center justify-between py-2 border-b border-white/5 text-sm"
                      >
                        <div>
                          <div className="font-medium">
                            {o.orderNumber} · {o.customerName}
                          </div>
                          <div className="text-xs text-[#C2B2A8]">
                            {o.governorate} · {o.status}
                          </div>
                        </div>
                        <span className="font-mono-num font-bold">{formatEGP(o.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================== 2. ORDERS ==================== */}
        {tab === 'orders' && (
          <div className="space-y-4">
            {orders.length === 0 ? (
              <div className="rounded-2xl bg-[#1A0E0A] border border-white/10 p-12 text-center text-sm text-[#C2B2A8]">
                No orders yet. Orders submitted from the storefront appear here instantaneously.
              </div>
            ) : (
              orders.map((order) => {
                const expanded = selectedOrderId === order.id;
                return (
                  <div
                    key={order.id}
                    className="rounded-xl bg-[#1A0E0A] border border-white/10 p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono-num font-bold text-white">
                            {order.orderNumber}
                          </span>
                          <span className="text-xs text-[#C2B2A8]">
                            {new Date(order.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-sm text-[#C2B2A8] mt-1">
                          {order.customerName} · {order.phone} · {order.governorate}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono-num font-bold text-lg">
                          {formatEGP(order.total)}
                        </span>

                        <select
                          value={order.status}
                          onChange={async (e) => {
                            await adminFetch(`/api/admin/orders/${order.id}/status`, {
                              method: 'PATCH',
                              body: JSON.stringify({ status: e.target.value as OrderStatus }),
                            });
                            handleMutationDone();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#120A07] border border-white/20 text-xs font-semibold text-white"
                        >
                          {(['New', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'] as OrderStatus[]).map(
                            (st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            )
                          )}
                        </select>

                        <button
                          type="button"
                          onClick={() => setSelectedOrderId(expanded ? null : order.id)}
                          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs cursor-pointer"
                        >
                          {expanded ? 'Hide' : 'Details'}
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="pt-4 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="space-y-1.5">
                          <div className="font-semibold text-white">Delivery Information</div>
                          <div className="text-[#C2B2A8]">Address: {order.address}</div>
                          {order.notes && <div className="text-[#C2B2A8]">Notes: {order.notes}</div>}
                          <div className="text-[#C2B2A8]">
                            Subtotal: {formatEGP(order.subtotal)} · Shipping:{' '}
                            {formatEGP(order.shippingCost)}
                            {order.discountAmount > 0 &&
                              ` · Discount (${order.discountCode}): -${formatEGP(order.discountAmount)}`}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="font-semibold text-white">Items ({order.items.length})</div>
                          {order.items.map((it, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-2">
                              <span className="text-[#C2B2A8]">
                                {it.quantity}× {it.name} ({it.colorName}, {it.size})
                              </span>
                              <span className="font-mono-num text-white">
                                {formatEGP(it.price * it.quantity)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ==================== 3. PRODUCTS ==================== */}
        {tab === 'products' && (
          <div className="space-y-6">
            {editingProduct !== undefined ? (
              <AdminProductEditor
                product={editingProduct}
                categories={categories}
                onSaved={() => {
                  setEditingProduct(undefined);
                  handleMutationDone();
                }}
                onCancel={() => setEditingProduct(undefined)}
                onCategoryCreated={() => {
                  handleMutationDone();
                }}
              />
            ) : (
              <>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setEditingProduct(null)}
                    className="px-4 py-2.5 rounded-xl bg-[#7A0C1E] hover:bg-[#991228] text-xs sm:text-sm font-semibold text-white flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Add New Piece
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {products.map((p) => {
                    const cat = categories.find((c) => c.id === p.categoryId);
                    const img = p.colors[0]?.images[0] || p.images[0] || '';
                    return (
                      <div
                        key={p.id}
                        className="rounded-xl bg-[#1A0E0A] border border-white/10 p-4 flex flex-col justify-between gap-4"
                      >
                        <div className="flex gap-3.5">
                          <div className="w-20 h-24 rounded-lg bg-white/[0.04] border border-white/10 p-1.5 shrink-0">
                            <CutoutImage src={img} alt={p.name} className="w-full h-full object-contain" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] uppercase tracking-wider text-[#C2B2A8]">
                              {cat?.name}
                            </div>
                            <div className="font-semibold text-sm text-white truncate">{p.name}</div>
                            <div className="font-mono-num text-sm font-bold text-white mt-1">
                              {formatEGP(p.price)}
                            </div>
                            <div className="text-xs text-[#C2B2A8] mt-1">
                              Stock: {p.stock} · Colors: {p.colors.length}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs">
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={p.showInStore}
                                onChange={async (e) => {
                                  await adminFetch(`/api/admin/products/${p.id}`, {
                                    method: 'PUT',
                                    body: JSON.stringify({ showInStore: e.target.checked }),
                                  });
                                  handleMutationDone();
                                }}
                                className="accent-[#7A0C1E]"
                              />
                              <span>Store</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={p.showInHero}
                                onChange={async (e) => {
                                  await adminFetch(`/api/admin/products/${p.id}`, {
                                    method: 'PUT',
                                    body: JSON.stringify({ showInHero: e.target.checked }),
                                  });
                                  handleMutationDone();
                                }}
                                className="accent-[#7A0C1E]"
                              />
                              <span>Hero Ring</span>
                            </label>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingProduct(p)}
                              className="p-2 rounded-lg bg-white/5 hover:bg-white/15 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await adminFetch(`/api/admin/products/${p.id}`, {
                                  method: 'DELETE',
                                });
                                handleMutationDone();
                              }}
                              className="p-2 rounded-lg bg-white/5 hover:bg-red-500/30 text-red-300 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ==================== 4. QUICK PRICES ==================== */}
        {tab === 'prices' && (
          <div className="rounded-2xl bg-[#1A0E0A] border border-white/10 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase text-[#C2B2A8]">
                <tr>
                  <th className="py-3 px-4">Piece</th>
                  <th className="py-3 px-4">Price (EGP)</th>
                  <th className="py-3 px-4">Old Price (EGP)</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {products.map((p) => {
                  const draft = priceDrafts[p.id] || {
                    price: String(p.price),
                    oldPrice: p.oldPrice ? String(p.oldPrice) : '',
                  };
                  return (
                    <tr key={p.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4 font-medium">{p.name}</td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          value={draft.price}
                          onChange={(e) =>
                            setPriceDrafts((prev) => ({
                              ...prev,
                              [p.id]: { ...draft, price: e.target.value },
                            }))
                          }
                          className="w-28 px-2.5 py-1.5 rounded bg-white/5 border border-white/15 font-mono-num text-xs"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          value={draft.oldPrice}
                          placeholder="None"
                          onChange={(e) =>
                            setPriceDrafts((prev) => ({
                              ...prev,
                              [p.id]: { ...draft, oldPrice: e.target.value },
                            }))
                          }
                          className="w-28 px-2.5 py-1.5 rounded bg-white/5 border border-white/15 font-mono-num text-xs"
                        />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={async () => {
                            await adminFetch(`/api/admin/products/${p.id}/price`, {
                              method: 'PATCH',
                              body: JSON.stringify({
                                price: Number(draft.price),
                                oldPrice: draft.oldPrice ? Number(draft.oldPrice) : null,
                              }),
                            });
                            handleMutationDone();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#7A0C1E] hover:bg-[#991228] text-xs font-semibold cursor-pointer"
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ==================== 5. CATEGORIES ==================== */}
        {tab === 'categories' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (catForm.id) {
                  await adminFetch(`/api/admin/categories/${catForm.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                      ...catForm,
                      sortOrder: Number(catForm.sortOrder) || 0,
                    }),
                  });
                } else {
                  await adminFetch('/api/admin/categories', {
                    method: 'POST',
                    body: JSON.stringify({
                      ...catForm,
                      sortOrder: Number(catForm.sortOrder) || 0,
                    }),
                  });
                }
                setCatForm({ name: '', nameAr: '', image: '', sortOrder: '1', outfitSlot: 'top' });
                handleMutationDone();
              }}
              className="lg:col-span-5 rounded-2xl bg-[#1A0E0A] border border-white/10 p-5 space-y-4"
            >
              <h2 className="font-bold text-base">
                {catForm.id ? 'Edit Category' : 'Add Category / Collection'}
              </h2>
              <input
                required
                placeholder="Name (EN)"
                value={catForm.name}
                onChange={(e) => setCatForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm"
              />
              <input
                placeholder="Name (Arabic)"
                value={catForm.nameAr}
                onChange={(e) => setCatForm((p) => ({ ...p, nameAr: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  placeholder="Sort Order"
                  value={catForm.sortOrder}
                  onChange={(e) => setCatForm((p) => ({ ...p, sortOrder: e.target.value }))}
                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm font-mono-num"
                />
                <select
                  value={catForm.outfitSlot}
                  onChange={(e) =>
                    setCatForm((p) => ({ ...p, outfitSlot: e.target.value as OutfitSlot }))
                  }
                  className="px-3 py-2 rounded-lg bg-[#120A07] border border-white/15 text-sm"
                >
                  <option value="top">Outfit Slot: Top</option>
                  <option value="pants">Outfit Slot: Pants</option>
                  <option value="shoes">Outfit Slot: Shoes</option>
                  <option value="accessory">Outfit Slot: Accessory</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  Upload Cover
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const url = await uploadAdminImage(f);
                        setCatForm((p) => ({ ...p, image: url }));
                      }
                    }}
                  />
                </label>
                {catForm.image && (
                  <CutoutImage src={catForm.image} alt="" className="w-10 h-10 rounded bg-white/[0.04] border border-white/10 object-contain" />
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-[#7A0C1E] hover:bg-[#991228] text-xs font-semibold cursor-pointer"
                >
                  {catForm.id ? 'Update Category' : 'Add Category'}
                </button>
                {catForm.id && (
                  <button
                    type="button"
                    onClick={() =>
                      setCatForm({ name: '', nameAr: '', image: '', sortOrder: '1', outfitSlot: 'top' })
                    }
                    className="px-4 py-2.5 rounded-lg bg-white/5 text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <div className="lg:col-span-7 space-y-3">
              {categories.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl bg-[#1A0E0A] border border-white/10 p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <CutoutImage
                      src={c.image}
                      alt={c.name}
                      className="w-12 h-12 rounded-lg bg-white/[0.04] border border-white/10 object-contain p-1"
                    />
                    <div>
                      <div className="font-semibold text-sm">
                        {c.name} <span className="text-[#C2B2A8] text-xs">({c.nameAr})</span>
                      </div>
                      <div className="text-xs text-[#C2B2A8]">
                        Order: {c.sortOrder} · Outfit Slot: {c.outfitSlot}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCatForm({
                          id: c.id,
                          name: c.name,
                          nameAr: c.nameAr,
                          image: c.image,
                          sortOrder: String(c.sortOrder),
                          outfitSlot: c.outfitSlot,
                        })
                      }
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/15 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await adminFetch(`/api/admin/categories/${c.id}`, { method: 'DELETE' });
                        handleMutationDone();
                      }}
                      className="p-2 rounded-lg bg-white/5 hover:bg-red-500/30 text-red-300 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== 6. DISCOUNT CODES ==================== */}
        {tab === 'discounts' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await adminFetch('/api/admin/discount-codes', {
                  method: 'POST',
                  body: JSON.stringify({
                    code: discForm.code,
                    type: discForm.type,
                    value: Number(discForm.value),
                    expiryDate: discForm.expiryDate || null,
                    usageLimit: discForm.usageLimit ? Number(discForm.usageLimit) : null,
                    minOrder: Number(discForm.minOrder) || 0,
                  }),
                });
                setDiscForm({
                  code: '',
                  type: 'percentage',
                  value: '15',
                  expiryDate: '',
                  usageLimit: '',
                  minOrder: '0',
                });
                handleMutationDone();
              }}
              className="lg:col-span-5 rounded-2xl bg-[#1A0E0A] border border-white/10 p-5 space-y-4"
            >
              <h2 className="font-bold text-base">Create Discount Code</h2>
              <input
                required
                placeholder="CODE (e.g. OSEVEN20)"
                value={discForm.code}
                onChange={(e) => setDiscForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm font-mono-num uppercase"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={discForm.type}
                  onChange={(e) =>
                    setDiscForm((p) => ({ ...p, type: e.target.value as 'percentage' | 'fixed' }))
                  }
                  className="px-3 py-2 rounded-lg bg-[#120A07] border border-white/15 text-sm"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed (EGP)</option>
                </select>
                <input
                  required
                  type="number"
                  min="1"
                  value={discForm.value}
                  onChange={(e) => setDiscForm((p) => ({ ...p, value: e.target.value }))}
                  placeholder="Value"
                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm font-mono-num"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-[#C2B2A8] mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={discForm.expiryDate}
                    onChange={(e) => setDiscForm((p) => ({ ...p, expiryDate: e.target.value }))}
                    className="w-full px-2 py-2 rounded-lg bg-white/5 border border-white/15 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#C2B2A8] mb-1">Usage Limit</label>
                  <input
                    type="number"
                    placeholder="Unlimited"
                    value={discForm.usageLimit}
                    onChange={(e) => setDiscForm((p) => ({ ...p, usageLimit: e.target.value }))}
                    className="w-full px-2 py-2 rounded-lg bg-white/5 border border-white/15 text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#C2B2A8] mb-1">Min Order (EGP)</label>
                  <input
                    type="number"
                    value={discForm.minOrder}
                    onChange={(e) => setDiscForm((p) => ({ ...p, minOrder: e.target.value }))}
                    className="w-full px-2 py-2 rounded-lg bg-white/5 border border-white/15 text-xs font-mono-num"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-[#7A0C1E] hover:bg-[#991228] text-xs font-semibold cursor-pointer"
              >
                Create Code
              </button>
            </form>

            <div className="lg:col-span-7 space-y-3">
              {discountCodes.map((dc) => (
                <div
                  key={dc.id}
                  className="rounded-xl bg-[#1A0E0A] border border-white/10 p-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="font-mono-num font-bold text-base">
                      {dc.code} · {dc.type === 'percentage' ? `${dc.value}%` : formatEGP(dc.value)}
                    </div>
                    <div className="text-xs text-[#C2B2A8]">
                      Used: {dc.usedCount}
                      {dc.usageLimit ? ` / ${dc.usageLimit}` : ''} · Min: {formatEGP(dc.minOrder)}
                      {dc.expiryDate ? ` · Expires: ${dc.expiryDate}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await adminFetch('/api/admin/discount-codes', {
                          method: 'POST',
                          body: JSON.stringify({ ...dc, active: !dc.active }),
                        });
                        handleMutationDone();
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                        dc.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-[#C2B2A8]'
                      }`}
                    >
                      {dc.active ? 'Active' : 'Disabled'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await adminFetch(`/api/admin/discount-codes/${dc.id}`, {
                          method: 'DELETE',
                        });
                        handleMutationDone();
                      }}
                      className="p-2 rounded-lg bg-white/5 hover:bg-red-500/30 text-red-300 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== 7. SHIPPING RULES ==================== */}
        {tab === 'shipping' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await adminFetch('/api/admin/shipping-zones', {
                  method: 'POST',
                  body: JSON.stringify({
                    id: shipForm.id,
                    name: shipForm.name,
                    nameAr: shipForm.nameAr || shipForm.name,
                    price: Number(shipForm.price),
                    governorates: shipForm.governoratesText
                      .split(',')
                      .map((g) => g.trim())
                      .filter(Boolean),
                  }),
                });
                setShipForm({ name: '', nameAr: '', price: '60', governoratesText: '' });
                handleMutationDone();
              }}
              className="lg:col-span-5 rounded-2xl bg-[#1A0E0A] border border-white/10 p-5 space-y-4"
            >
              <h2 className="font-bold text-base">
                {shipForm.id ? 'Edit Shipping Zone' : 'Add Governorate Shipping Group'}
              </h2>
              <input
                required
                placeholder="Group Name (e.g. Cairo & Giza)"
                value={shipForm.name}
                onChange={(e) => setShipForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm"
              />
              <input
                placeholder="Arabic Name (e.g. القاهرة والجيزة)"
                value={shipForm.nameAr}
                onChange={(e) => setShipForm((p) => ({ ...p, nameAr: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm"
              />
              <input
                required
                type="number"
                min="0"
                placeholder="Shipping Cost (EGP)"
                value={shipForm.price}
                onChange={(e) => setShipForm((p) => ({ ...p, price: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm font-mono-num"
              />
              <div>
                <label className="block text-[11px] text-[#C2B2A8] mb-1">
                  Governorates (comma-separated)
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Cairo, Giza"
                  value={shipForm.governoratesText}
                  onChange={(e) => setShipForm((p) => ({ ...p, governoratesText: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-[#7A0C1E] hover:bg-[#991228] text-xs font-semibold cursor-pointer"
                >
                  {shipForm.id ? 'Save Zone' : 'Create Zone'}
                </button>
                {shipForm.id && (
                  <button
                    type="button"
                    onClick={() =>
                      setShipForm({ name: '', nameAr: '', price: '60', governoratesText: '' })
                    }
                    className="px-4 py-2.5 rounded-lg bg-white/5 text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <div className="lg:col-span-7 space-y-3">
              {shippingZones.map((z) => (
                <div
                  key={z.id}
                  className="rounded-xl bg-[#1A0E0A] border border-white/10 p-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="font-bold text-sm">
                      {z.name} · <span className="font-mono-num">{formatEGP(z.price)}</span>
                    </div>
                    <div className="text-xs text-[#C2B2A8] mt-1">
                      {z.governorates.join(', ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setShipForm({
                          id: z.id,
                          name: z.name,
                          nameAr: z.nameAr,
                          price: String(z.price),
                          governoratesText: z.governorates.join(', '),
                        })
                      }
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/15 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await adminFetch(`/api/admin/shipping-zones/${z.id}`, {
                          method: 'DELETE',
                        });
                        handleMutationDone();
                      }}
                      className="p-2 rounded-lg bg-white/5 hover:bg-red-500/30 text-red-300 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== 8. OFFER TIMERS ==================== */}
        {tab === 'offers' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await adminFetch('/api/admin/offers', {
                  method: 'POST',
                  body: JSON.stringify({
                    ...offerForm,
                    discountValue: Number(offerForm.discountValue),
                    startAt: new Date(offerForm.startAt).toISOString(),
                    endAt: new Date(offerForm.endAt).toISOString(),
                    active: true,
                  }),
                });
                setOfferForm({
                  title: '',
                  titleAr: '',
                  discountType: 'percentage',
                  discountValue: '20',
                  startAt: new Date().toISOString().slice(0, 16),
                  endAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 16),
                  productIds: [],
                });
                handleMutationDone();
              }}
              className="lg:col-span-6 rounded-2xl bg-[#1A0E0A] border border-white/10 p-5 space-y-4"
            >
              <h2 className="font-bold text-base">Create Timed Offer</h2>
              <input
                required
                placeholder="Offer Banner Title (EN)"
                value={offerForm.title}
                onChange={(e) => setOfferForm((p) => ({ ...p, title: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm"
              />
              <input
                placeholder="Arabic Title"
                value={offerForm.titleAr}
                onChange={(e) => setOfferForm((p) => ({ ...p, titleAr: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={offerForm.discountType}
                  onChange={(e) =>
                    setOfferForm((p) => ({
                      ...p,
                      discountType: e.target.value as 'percentage' | 'fixed',
                    }))
                  }
                  className="px-3 py-2 rounded-lg bg-[#120A07] border border-white/15 text-sm"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Off (EGP)</option>
                </select>
                <input
                  required
                  type="number"
                  min="1"
                  value={offerForm.discountValue}
                  onChange={(e) => setOfferForm((p) => ({ ...p, discountValue: e.target.value }))}
                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm font-mono-num"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[#C2B2A8] mb-1">Start Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    value={offerForm.startAt}
                    onChange={(e) => setOfferForm((p) => ({ ...p, startAt: e.target.value }))}
                    className="w-full px-2 py-2 rounded-lg bg-white/5 border border-white/15 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#C2B2A8] mb-1">End Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    value={offerForm.endAt}
                    onChange={(e) => setOfferForm((p) => ({ ...p, endAt: e.target.value }))}
                    className="w-full px-2 py-2 rounded-lg bg-white/5 border border-white/15 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#C2B2A8] mb-2">
                  Included Products ({offerForm.productIds.length} selected)
                </label>
                <div className="max-h-44 overflow-y-auto space-y-1.5 rounded-lg bg-black/30 p-3 border border-white/10">
                  {products.map((prod) => {
                    const checked = offerForm.productIds.includes(prod.id);
                    return (
                      <label key={prod.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setOfferForm((p) => ({
                              ...p,
                              productIds: checked
                                ? p.productIds.filter((id) => id !== prod.id)
                                : [...p.productIds, prod.id],
                            }))
                          }
                          className="accent-[#7A0C1E]"
                        />
                        <span className="truncate">{prod.name}</span>
                        <span className="ml-auto font-mono-num text-[#C2B2A8]">
                          {formatEGP(prod.price)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-[#7A0C1E] hover:bg-[#991228] text-xs font-semibold cursor-pointer"
              >
                Launch Timed Offer
              </button>
            </form>

            <div className="lg:col-span-6 space-y-3">
              {offers.map((of) => (
                <div
                  key={of.id}
                  className="rounded-xl bg-[#1A0E0A] border border-white/10 p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-bold text-sm">{of.title}</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await adminFetch('/api/admin/offers', {
                            method: 'POST',
                            body: JSON.stringify({ ...of, active: !of.active }),
                          });
                          handleMutationDone();
                        }}
                        className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                          of.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-[#C2B2A8]'
                        }`}
                      >
                        {of.active ? 'Active' : 'Paused'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await adminFetch(`/api/admin/offers/${of.id}`, { method: 'DELETE' });
                          handleMutationDone();
                        }}
                        className="p-1.5 rounded bg-white/5 text-red-300 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-[#C2B2A8]">
                    Discount: {of.discountType === 'percentage' ? `${of.discountValue}%` : formatEGP(of.discountValue)} ·{' '}
                    {of.productIds.length} pieces · Ends {new Date(of.endAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== 9. FEATURED OUTFITS ==================== */}
        {tab === 'outfits' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await adminFetch('/api/admin/outfits', {
                  method: 'POST',
                  body: JSON.stringify({
                    name: outfitForm.name,
                    nameAr: outfitForm.nameAr || outfitForm.name,
                    description: outfitForm.description,
                    topId: outfitForm.topId || null,
                    pantsId: outfitForm.pantsId || null,
                    shoesId: outfitForm.shoesId || null,
                  }),
                });
                setOutfitForm({
                  name: '',
                  nameAr: '',
                  description: '',
                  topId: '',
                  pantsId: '',
                  shoesId: '',
                });
                handleMutationDone();
              }}
              className="lg:col-span-5 rounded-2xl bg-[#1A0E0A] border border-white/10 p-5 space-y-4"
            >
              <h2 className="font-bold text-base">Create Featured Outfit</h2>
              <input
                required
                placeholder="Outfit Name"
                value={outfitForm.name}
                onChange={(e) => setOutfitForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm"
              />
              <input
                placeholder="Arabic Name"
                value={outfitForm.nameAr}
                onChange={(e) => setOutfitForm((p) => ({ ...p, nameAr: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm"
              />
              <input
                placeholder="Short description"
                value={outfitForm.description}
                onChange={(e) => setOutfitForm((p) => ({ ...p, description: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm"
              />
              <select
                value={outfitForm.topId}
                onChange={(e) => setOutfitForm((p) => ({ ...p, topId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[#120A07] border border-white/15 text-sm"
              >
                <option value="">Select Top / Outerwear...</option>
                {products
                  .filter((p) => categories.find((c) => c.id === p.categoryId)?.outfitSlot === 'top')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <select
                value={outfitForm.pantsId}
                onChange={(e) => setOutfitForm((p) => ({ ...p, pantsId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[#120A07] border border-white/15 text-sm"
              >
                <option value="">Select Pants...</option>
                {products
                  .filter((p) => categories.find((c) => c.id === p.categoryId)?.outfitSlot === 'pants')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <select
                value={outfitForm.shoesId}
                onChange={(e) => setOutfitForm((p) => ({ ...p, shoesId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[#120A07] border border-white/15 text-sm"
              >
                <option value="">Select Shoes...</option>
                {products
                  .filter((p) => categories.find((c) => c.id === p.categoryId)?.outfitSlot === 'shoes')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-[#7A0C1E] hover:bg-[#991228] text-xs font-semibold cursor-pointer"
              >
                Save Featured Outfit
              </button>
            </form>

            <div className="lg:col-span-7 space-y-3">
              {featuredOutfits.map((fit) => (
                <div
                  key={fit.id}
                  className="rounded-xl bg-[#1A0E0A] border border-white/10 p-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="font-bold text-sm">{fit.name}</div>
                    <div className="text-xs text-[#C2B2A8] mt-1">{fit.description}</div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await adminFetch(`/api/admin/outfits/${fit.id}`, { method: 'DELETE' });
                      handleMutationDone();
                    }}
                    className="p-2 rounded-lg bg-white/5 hover:bg-red-500/30 text-red-300 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== 10. SETTINGS & RECENT LOGINS ==================== */}
        {tab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPwMessage(null);
                try {
                  const res = await adminFetch<{ ok: boolean; token?: string }>(
                    '/api/admin/change-password',
                    {
                      method: 'POST',
                      body: JSON.stringify(pwForm),
                    }
                  );
                  if (res.token) setAdminMemoryToken(res.token);
                  setPwMessage({
                    ok: true,
                    text: 'Admin password updated and salted hash saved on the server.',
                  });
                  setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  loadOverview();
                } catch (err) {
                  setPwMessage({ ok: false, text: (err as Error).message });
                }
              }}
              className="lg:col-span-5 rounded-2xl bg-[#1A0E0A] border border-white/10 p-6 space-y-4"
            >
              <h2 className="font-bold text-base">Change Admin Password</h2>
              <p className="text-xs text-[#C2B2A8]">
                Minimum 8 characters combining letters with numbers or symbols. Stored securely as a salted scrypt hash on the server.
              </p>

              {pwMessage && (
                <div
                  className={`p-3 rounded-lg text-xs border ${
                    pwMessage.ok
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                      : 'bg-red-500/15 border-red-500/40 text-red-200'
                  }`}
                >
                  {pwMessage.text}
                </div>
              )}

              <div>
                <label className="block text-xs text-[#C2B2A8] mb-1">Current Password</label>
                <input
                  required
                  type="password"
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm((p) => ({ ...p, currentPassword: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/15 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-[#C2B2A8] mb-1">New Password</label>
                <input
                  required
                  type="password"
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm((p) => ({ ...p, newPassword: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/15 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-[#C2B2A8] mb-1">Confirm New Password</label>
                <input
                  required
                  type="password"
                  value={pwForm.confirmPassword}
                  onChange={(e) => setPwForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/15 text-sm"
                />
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-[#7A0C1E] hover:bg-[#991228] text-xs font-semibold cursor-pointer"
              >
                Update Password
              </button>
            </form>

            <div className="lg:col-span-7 rounded-2xl bg-[#1A0E0A] border border-white/10 p-6">
              <h2 className="font-bold text-base mb-4">Recent Login Attempts</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/10 text-[#C2B2A8] uppercase">
                    <tr>
                      <th className="py-2 pr-3">Date &amp; Time</th>
                      <th className="py-2 pr-3">IP Address</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {loginLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-2.5 pr-3 font-mono-num text-[#C2B2A8]">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-3 font-mono-num">{log.ip}</td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={log.success ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}
                          >
                            {log.success ? 'Success' : 'Failed'}
                          </span>
                        </td>
                        <td className="py-2.5 text-[#C2B2A8]">{log.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
