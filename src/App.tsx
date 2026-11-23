import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Globe, Layers, ShoppingBag } from 'lucide-react';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutPage } from './components/CheckoutPage';
import { CollectionGridView } from './components/CollectionGridModal';
import { CollectionsSection } from './components/CollectionsSection';
import { HeroRing3D } from './components/HeroRing3D';
import { OfferCountdownBanner } from './components/OfferCountdownBanner';
import { OutfitBuilder, type OutfitState } from './components/OutfitBuilder';
import { ProductDetailView } from './components/ProductDetailView';
import { AdminDashboard } from './components/admin/AdminDashboard';
import type {
  CartItem,
  Language,
  Product,
  ProductColor,
  StoreBootstrap,
} from './types';
import { useT } from './utils/i18n';
import { isOfferActiveNow } from './utils/pricing';

type StoreView =
  | { name: 'home' }
  | { name: 'product'; productId: string }
  | { name: 'collection'; categoryId: string | 'all'; offerFilterIds?: string[] | null }
  | { name: 'outfit' }
  | { name: 'checkout' }
  | { name: 'admin' };

const CART_STORAGE_KEY = 'oseven_cart_v1';
const LANG_STORAGE_KEY = 'oseven_lang_v1';

export default function App() {
  const [lang, setLang] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      return saved === 'ar' || saved === 'en' ? saved : 'en';
    } catch {
      return 'en';
    }
  });
  const t = useT(lang);

  const [view, setView] = useState<StoreView>(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
      return { name: 'admin' };
    }
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/checkout')) {
      return { name: 'checkout' };
    }
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'outfit') {
        return { name: 'outfit' };
      }
    }
    return { name: 'home' };
  });

  const [storeData, setStoreData] = useState<StoreBootstrap>({
    categories: [],
    products: [],
    activeOffers: [],
    shippingZones: [],
    featuredOutfits: [],
  });
  const [loading, setLoading] = useState(true);

  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });

  const [outfitState, setOutfitState] = useState<OutfitState>({
    top: null,
    pants: null,
    shoes: null,
    accessory: null,
  });

  const fetchStoreData = useCallback(async () => {
    try {
      const res = await fetch('/api/store/bootstrap');
      if (!res.ok) return;
      const json = (await res.json()) as StoreBootstrap;
      setStoreData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStoreData();
  }, [fetchStoreData]);

  // Keep HTML dir & lang synced for Arabic RTL / English LTR
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.translate = false;
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // ignore storage quota errors
    }
  }, [lang]);

  // Persist cart items
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore storage quota errors
    }
  }, [cart]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const onPop = () => {
      if (window.location.pathname.startsWith('/admin')) {
        setView({ name: 'admin' });
      } else if (window.location.pathname.startsWith('/checkout')) {
        setView({ name: 'checkout' });
      } else {
        setView({ name: 'home' });
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Hydrate shared ?fit=... outfit link once products load
  useEffect(() => {
    if (storeData.products.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const fitParam = params.get('fit');
    if (fitParam) {
      const next: OutfitState = { top: null, pants: null, shoes: null, accessory: null };
      fitParam.split(',').forEach((entry) => {
        const [slot, prodId, colorId, size] = entry.split(':');
        if (slot === 'top' || slot === 'pants' || slot === 'shoes' || slot === 'accessory') {
          const prod = storeData.products.find((p) => p.id === prodId);
          if (prod) {
            next[slot] = {
              product: prod,
              colorId: colorId || prod.colors[0]?.id || 'default',
              size: size || prod.sizes[0] || 'M',
            };
          }
        }
      });
      setOutfitState(next);
    }
  }, [storeData.products]);

  // Periodically prune expired timed offers automatically
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const liveOffers = useMemo(
    () => storeData.activeOffers.filter((o) => isOfferActiveNow(o, nowTick)),
    [storeData.activeOffers, nowTick]
  );

  const primaryOffer = liveOffers[0] || null;

  const navigateAdmin = () => {
    window.history.pushState(null, '', '/admin');
    setView({ name: 'admin' });
  };

  const navigateCheckout = () => {
    setCartOpen(false);
    if (!window.location.pathname.startsWith('/checkout')) {
      window.history.pushState(null, '', '/checkout');
    }
    setView({ name: 'checkout' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateHome = () => {
    if (
      window.location.pathname.startsWith('/admin') ||
      window.location.pathname.startsWith('/checkout')
    ) {
      window.history.pushState(null, '', '/');
    }
    setView({ name: 'home' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (view.name !== 'checkout' && view.name !== 'admin') {
      if (
        window.location.pathname.startsWith('/checkout') ||
        window.location.pathname.startsWith('/admin')
      ) {
        window.history.replaceState(null, '', '/');
      }
    }
  }, [view.name]);

  const addToCart = (payload: {
    product: Product;
    color: ProductColor;
    size: string;
    quantity: number;
  }) => {
    const key = `${payload.product.id}__${payload.color.id}__${payload.size}`;
    const img = payload.color.images[0] || payload.product.images[0] || '';
    setCart((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) =>
          i.key === key ? { ...i, quantity: i.quantity + payload.quantity } : i
        );
      }
      return [
        ...prev,
        {
          key,
          productId: payload.product.id,
          name: payload.product.name,
          nameAr: payload.product.nameAr,
          colorId: payload.color.id,
          colorName: payload.color.name,
          colorNameAr: payload.color.nameAr,
          colorHex: payload.color.hex,
          size: payload.size,
          quantity: payload.quantity,
          image: img,
        },
      ];
    });
  };

  const addBatchToCart = (
    items: { product: Product; color: ProductColor; size: string; quantity: number }[]
  ) => {
    items.forEach(addToCart);
    setCartOpen(true);
  };

  const addProductToOutfit = (product: Product, colorId?: string, size?: string) => {
    const cat = storeData.categories.find((c) => c.id === product.categoryId);
    const slot = cat?.outfitSlot && cat.outfitSlot !== 'none' ? cat.outfitSlot : 'top';
    setOutfitState((prev) => ({
      ...prev,
      [slot]: {
        product,
        colorId: colorId || product.colors[0]?.id || 'default',
        size: size || product.sizes[0] || 'M',
      },
    }));
    setView({ name: 'outfit' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalBagCount = useMemo(
    () => cart.reduce((acc, item) => acc + item.quantity, 0),
    [cart]
  );

  if (view.name === 'admin') {
    return (
      <AdminDashboard
        onExitToStore={navigateHome}
        onStoreChanged={fetchStoreData}
      />
    );
  }

  const activeProduct =
    view.name === 'product'
      ? storeData.products.find((p) => p.id === view.productId) || null
      : null;

  return (
    <div
      translate="no"
      className="min-h-screen bg-[#120A07] text-white flex flex-col notranslate"
    >
      {/* Offer Timer Banner */}
      <OfferCountdownBanner
        offer={primaryOffer}
        lang={lang}
        onSelectOffer={() => {
          if (primaryOffer) {
            setView({
              name: 'collection',
              categoryId: 'all',
              offerFilterIds: primaryOffer.productIds,
            });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
      />

      {/* Top Navigation Bar (Strict 3-Zone Contract) */}
      <header className="sticky top-0 z-30 h-16 bg-[#120A07]/92 backdrop-blur-md border-b border-white/10 px-4 sm:px-8 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={navigateHome}
          className="flex items-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <img
            src="/assets/aistudio/WhatsApp_Image_2026-11-21_at_6.50.58_PM_6e3acad9.jpeg"
            alt="OSEVEN"
            className="h-7 w-auto object-contain rounded-sm mix-blend-screen"
          />
          <span className="font-display text-lg font-extrabold tracking-[0.14em] text-white">
            {t.brand}
          </span>
        </button>

        {/* Zone 2: Clean Single-Line Nav Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#C2B2A8]">
          <button
            type="button"
            onClick={() => {
              navigateHome();
            }}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t.navDrops}
          </button>
          <button
            type="button"
            onClick={() => {
              if (view.name !== 'home') {
                setView({ name: 'home' });
                setTimeout(() => {
                  document.getElementById('collections')?.scrollIntoView({ behavior: 'smooth' });
                }, 120);
              } else {
                document.getElementById('collections')?.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t.navCollections}
          </button>
          <button
            type="button"
            onClick={() => {
              setView({ name: 'outfit' });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t.navOutfitBuilder}
          </button>
          <button
            type="button"
            onClick={() => {
              setView({ name: 'collection', categoryId: 'all' });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t.navShopAll}
          </button>
        </nav>

        {/* Zone 3: Language + Bag CTA */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            aria-label={lang === 'en' ? 'Switch to Arabic' : 'Switch to English'}
            onClick={() => setLang((l) => (l === 'en' ? 'ar' : 'en'))}
            className="px-2.5 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{lang === 'en' ? 'AR' : 'EN'}</span>
          </button>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="px-4 py-2 rounded-lg bg-[#7A0C1E] hover:bg-[#991228] text-xs sm:text-sm font-semibold text-white flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>
              {t.bag} (<span className="font-mono-num">{totalBagCount}</span>)
            </span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {loading ? (
          <div className="min-h-[70vh] flex items-center justify-center text-sm text-[#C2B2A8]">
            Loading OSEVEN Studio...
          </div>
        ) : view.name === 'product' && activeProduct ? (
          <ProductDetailView
            product={activeProduct}
            categories={storeData.categories}
            activeOffers={liveOffers}
            lang={lang}
            onBack={() => setView({ name: 'home' })}
            onAddToCart={(payload) => {
              addToCart(payload);
              setCartOpen(true);
            }}
            onAddToOutfit={addProductToOutfit}
          />
        ) : view.name === 'collection' ? (
          <CollectionGridView
            categories={storeData.categories}
            products={storeData.products}
            activeOffers={liveOffers}
            selectedCategoryId={view.categoryId}
            offerFilterIds={view.offerFilterIds}
            lang={lang}
            onChangeCategory={(id) => setView({ name: 'collection', categoryId: id })}
            onSelectProduct={(p) => {
              setView({ name: 'product', productId: p.id });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onAddToOutfit={(p) => addProductToOutfit(p)}
            onBack={navigateHome}
          />
        ) : view.name === 'checkout' ? (
          <CheckoutPage
            cart={cart}
            products={storeData.products}
            activeOffers={liveOffers}
            shippingZones={storeData.shippingZones}
            lang={lang}
            onUpdateQty={(key, qty) => {
              if (qty <= 0) {
                setCart((p) => p.filter((i) => i.key !== key));
              } else {
                setCart((p) => p.map((i) => (i.key === key ? { ...i, quantity: qty } : i)));
              }
            }}
            onRemoveItem={(key) => setCart((p) => p.filter((i) => i.key !== key))}
            onClearCart={() => setCart([])}
            onOpenBag={() => setCartOpen(true)}
            onBackToStore={navigateHome}
          />
        ) : view.name === 'outfit' ? (
          <OutfitBuilder
            products={storeData.products}
            categories={storeData.categories}
            activeOffers={liveOffers}
            featuredOutfits={storeData.featuredOutfits}
            lang={lang}
            outfitState={outfitState}
            setOutfitState={setOutfitState}
            onBack={navigateHome}
            onAddItemsToCart={addBatchToCart}
          />
        ) : (
          <>
            {/* 1. Zero-Gravity 3D Hero Ring */}
            <HeroRing3D
              products={storeData.products}
              categories={storeData.categories}
              activeOffers={liveOffers}
              lang={lang}
              onSelectProduct={(p) => {
                setView({ name: 'product', productId: p.id });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onAddToOutfit={(p) => addProductToOutfit(p)}
              onOpenOutfitBuilder={() => {
                setView({ name: 'outfit' });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />

            {/* 2. Zero-Gravity Glassmorphism Collections */}
            <CollectionsSection
              categories={storeData.categories}
              products={storeData.products}
              lang={lang}
              onSelectCategory={(id) => {
                setView({ name: 'collection', categoryId: id });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenOutfitBuilder={() => {
                setView({ name: 'outfit' });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />

            {/* 3. Signature Outfit Builder Callout */}
            <section className="py-16 px-4 sm:px-8 max-w-7xl mx-auto">
              <div className="rounded-3xl backdrop-blur-xl bg-[linear-gradient(135deg,_rgba(74,44,29,0.5)_0%,_rgba(122,12,30,0.32)_100%)] border border-white/15 p-8 sm:p-12 flex flex-col lg:flex-row items-center justify-between gap-8">
                <div className="max-w-xl">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#C2B2A8] mb-2">
                    {t.brand} · {t.navOutfitBuilder}
                  </p>
                  <h2 className="text-3xl sm:text-4xl font-bold text-white [text-wrap:balance]">
                    {t.outfitBuilderTitle}
                  </h2>
                  <p className="mt-3 text-sm sm:text-base text-[#EAE0DA]/85 leading-relaxed">
                    {t.outfitBuilderDesc}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setView({ name: 'outfit' });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-7 py-4 rounded-xl bg-[#7A0C1E] hover:bg-[#991228] text-white font-semibold text-sm sm:text-base flex items-center gap-2.5 shadow-xl transition-colors cursor-pointer"
                  >
                    <Layers className="w-4 h-4" />
                    {t.buildYourOutfit}
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Clean Minimal Footer */}
      <footer className="border-t border-white/10 py-10 px-4 sm:px-8 bg-[#0E0705]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#C2B2A8]">
          <div className="flex items-center gap-3">
            <span className="font-display font-bold text-white tracking-widest">OSEVEN</span>
            <span aria-hidden="true">·</span>
            <span>© {new Date().getFullYear()} OSEVEN Streetwear Studio</span>
          </div>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => {
                setView({ name: 'outfit' });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-white transition-colors cursor-pointer"
            >
              {t.navOutfitBuilder}
            </button>
            <button
              type="button"
              onClick={() => {
                setView({ name: 'collection', categoryId: 'all' });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-white transition-colors cursor-pointer"
            >
              {t.navShopAll}
            </button>
            <button
              type="button"
              onClick={navigateAdmin}
              className="hover:text-white transition-colors cursor-pointer"
            >
              {t.adminLink}
            </button>
          </div>
        </div>
      </footer>

      {/* Cart Bag Drawer */}
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        products={storeData.products}
        activeOffers={liveOffers}
        lang={lang}
        onUpdateQty={(key, qty) => {
          if (qty <= 0) {
            setCart((p) => p.filter((i) => i.key !== key));
          } else {
            setCart((p) => p.map((i) => (i.key === key ? { ...i, quantity: qty } : i)));
          }
        }}
        onRemoveItem={(key) => setCart((p) => p.filter((i) => i.key !== key))}
        onProceedToCheckout={navigateCheckout}
      />
    </div>
  );
}