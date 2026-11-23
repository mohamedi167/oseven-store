import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  Check,
  Download,
  RotateCcw,
  Share2,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  Category,
  FeaturedOutfit,
  Language,
  OfferTimer,
  OutfitSlot,
  Product,
  ProductColor,
} from '../types';
import { getCutoutDataUrl } from '../utils/cutout';
import { CutoutImage } from './CutoutImage';
import { useT } from '../utils/i18n';
import { formatEGP, getEffectivePrice } from '../utils/pricing';

export interface OutfitPieceSelection {
  product: Product;
  colorId: string;
  size: string;
}

export type OutfitState = Record<'top' | 'pants' | 'shoes' | 'accessory', OutfitPieceSelection | null>;

interface Props {
  products: Product[];
  categories: Category[];
  activeOffers: OfferTimer[];
  featuredOutfits: FeaturedOutfit[];
  lang: Language;
  outfitState: OutfitState;
  setOutfitState: React.Dispatch<React.SetStateAction<OutfitState>>;
  onBack: () => void;
  onAddItemsToCart: (
    items: { product: Product; color: ProductColor; size: string; quantity: number }[]
  ) => void;
}

const SLOTS: ('top' | 'pants' | 'shoes' | 'accessory')[] = ['top', 'pants', 'shoes', 'accessory'];

export const OutfitBuilder: React.FC<Props> = ({
  products,
  categories,
  activeOffers,
  featuredOutfits,
  lang,
  outfitState,
  setOutfitState,
  onBack,
  onAddItemsToCart,
}) => {
  const t = useT(lang);
  const [activeSlot, setActiveSlot] = useState<'top' | 'pants' | 'shoes' | 'accessory'>('top');
  const [copied, setCopied] = useState(false);
  const [addedAll, setAddedAll] = useState(false);

  const categorySlotMap = useMemo(() => {
    const m = new Map<string, OutfitSlot>();
    categories.forEach((c) => m.set(c.id, c.outfitSlot));
    return m;
  }, [categories]);

  const productsForSlot = useMemo(() => {
    return products.filter((p) => {
      if (!p.showInStore) return false;
      const slot = categorySlotMap.get(p.categoryId) || 'none';
      if (activeSlot === 'accessory') {
        return slot === 'accessory' || slot === 'top';
      }
      return slot === activeSlot;
    });
  }, [products, categorySlotMap, activeSlot]);

  const getColorObj = (sel: OutfitPieceSelection | null): ProductColor | null => {
    if (!sel) return null;
    return (
      sel.product.colors.find((c) => c.id === sel.colorId) ||
      sel.product.colors[0] || {
        id: 'default',
        name: 'Standard',
        nameAr: 'أساسي',
        hex: '#141414',
        images: sel.product.images,
      }
    );
  };

  const getPieceImage = (sel: OutfitPieceSelection | null): string => {
    if (!sel) return '';
    const c = getColorObj(sel);
    return c?.images[0] || sel.product.images[0] || '';
  };


  const totals = useMemo(() => {
    let total = 0;
    let original = 0;
    let count = 0;
    for (const slot of SLOTS) {
      const sel = outfitState[slot];
      if (!sel) continue;
      count++;
      const p = getEffectivePrice(sel.product, activeOffers);
      total += p.finalPrice;
      original += p.originalPrice;
    }
    return { total, original, count };
  }, [outfitState, activeOffers]);

  const selectPiece = (slot: 'top' | 'pants' | 'shoes' | 'accessory', product: Product) => {
    setOutfitState((prev) => ({
      ...prev,
      [slot]: {
        product,
        colorId: product.colors[0]?.id || 'default',
        size: product.sizes[0] || 'M',
      },
    }));
  };

  const loadFeaturedOutfit = (fit: FeaturedOutfit) => {
    const findSel = (id: string | null, colorId: string | null): OutfitPieceSelection | null => {
      if (!id) return null;
      const prod = products.find((p) => p.id === id);
      if (!prod) return null;
      return {
        product: prod,
        colorId: colorId || prod.colors[0]?.id || 'default',
        size: prod.sizes[0] || 'M',
      };
    };

    setOutfitState({
      top: findSel(fit.topId, fit.topColor),
      pants: findSel(fit.pantsId, fit.pantsColor),
      shoes: findSel(fit.shoesId, fit.shoesColor),
      accessory: findSel(fit.accessoryId, fit.accessoryColor),
    });
  };

  const handleAddFullOutfit = () => {
    const batch: { product: Product; color: ProductColor; size: string; quantity: number }[] = [];
    for (const slot of SLOTS) {
      const sel = outfitState[slot];
      if (!sel) continue;
      const col = getColorObj(sel);
      if (!col) continue;
      batch.push({
        product: sel.product,
        color: col,
        size: sel.size,
        quantity: 1,
      });
    }
    if (batch.length === 0) return;
    onAddItemsToCart(batch);
    setAddedAll(true);
    setTimeout(() => setAddedAll(false), 1800);
  };

  const handleShareOutfit = async () => {
    const parts: string[] = [];
    for (const slot of SLOTS) {
      const sel = outfitState[slot];
      if (sel) {
        parts.push(`${slot}:${sel.product.id}:${sel.colorId}:${sel.size}`);
      }
    }
    const url = `${window.location.origin}/?view=outfit&fit=${encodeURIComponent(parts.join(','))}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.history.replaceState(null, '', `/?view=outfit&fit=${encodeURIComponent(parts.join(','))}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadCard = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grad = ctx.createLinearGradient(0, 0, 0, 1200);
    grad.addColorStop(0, '#2A160F');
    grad.addColorStop(1, '#120A07');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 900, 1200);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 42px Outfit, sans-serif';
    ctx.fillText('OSEVEN', 56, 84);
    ctx.fillStyle = '#C2B2A8';
    ctx.font = '20px Plus Jakarta Sans, sans-serif';
    ctx.fillText(`CURATED FIT · ${formatEGP(totals.total, 'en')}`, 56, 120);

    const drawSlotImage = (src: string, x: number, y: number, w: number, h: number) =>
      new Promise<void>((resolve) => {
        if (!src) return resolve();
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const ratio = Math.min(w / img.width, h / img.height);
          const dw = img.width * ratio;
          const dh = img.height * ratio;
          ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = src;
      });

    const [topUrl, pantsUrl, shoesUrl] = await Promise.all([
      getCutoutDataUrl(getPieceImage(outfitState.top)),
      getCutoutDataUrl(getPieceImage(outfitState.pants)),
      getCutoutDataUrl(getPieceImage(outfitState.shoes)),
    ]);

    await drawSlotImage(topUrl, 210, 155, 480, 360);
    await drawSlotImage(pantsUrl, 230, 485, 440, 390);
    await drawSlotImage(shoesUrl, 270, 860, 360, 230);

    const link = document.createElement('a');
    link.download = 'OSEVEN-Outfit.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const slotLabel = (slot: 'top' | 'pants' | 'shoes' | 'accessory') => {
    if (slot === 'top') return t.slotTop;
    if (slot === 'pants') return t.slotPants;
    if (slot === 'shoes') return t.slotShoes;
    return t.slotAccessory;
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen py-10 px-4 sm:px-8 max-w-7xl mx-auto"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#C2B2A8] hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
          {t.backToStore}
        </button>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleShareOutfit}
            className="px-3.5 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            {copied ? t.copiedLink : t.shareOutfit}
          </button>
          <button
            type="button"
            onClick={handleDownloadCard}
            className="px-3.5 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            {t.downloadCard}
          </button>
        </div>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white">{t.outfitBuilderTitle}</h1>
        <p className="mt-2 text-sm text-[#C2B2A8] max-w-2xl">{t.outfitBuilderDesc}</p>
      </div>

      {/* Featured Admin-Curated Outfits Strip */}
      {featuredOutfits.length > 0 && (
        <div className="mb-8">
          <div className="text-xs uppercase tracking-wider text-[#C2B2A8] mb-3 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#7A0C1E]" />
            <span>{t.featuredOutfits}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {featuredOutfits.map((fit) => (
              <button
                key={fit.id}
                type="button"
                onClick={() => loadFeaturedOutfit(fit)}
                className="text-left rtl:text-right rounded-xl backdrop-blur-lg bg-white/[0.05] border border-white/12 p-4 hover:border-[#7A0C1E] hover:bg-white/[0.08] transition-all cursor-pointer"
              >
                <div className="font-semibold text-sm text-white">
                  {lang === 'ar' ? fit.nameAr : fit.name}
                </div>
                <p className="text-xs text-[#C2B2A8] mt-1 line-clamp-2">
                  {lang === 'ar' ? fit.descriptionAr : fit.description}
                </p>
                <span className="inline-block mt-2.5 text-xs font-semibold text-[#FF8C9E]">
                  {t.loadOutfit} →
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Split: Live Mannequin / Flat-Lay Stage + Glassy Selector Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Live Mannequin / Flat-Lay Stage */}
        <div className="lg:col-span-6 rounded-2xl backdrop-blur-xl bg-[radial-gradient(circle_at_50%_35%,_rgba(107,66,38,0.35),_rgba(18,10,7,0.92))] border border-white/15 p-6 relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs uppercase tracking-widest text-[#C2B2A8]">
              OSEVEN · LIVE FIT
            </span>
            <button
              type="button"
              onClick={() =>
                setOutfitState({ top: null, pants: null, shoes: null, accessory: null })
              }
              className="text-xs text-[#C2B2A8] hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t.resetOutfit}
            </button>
          </div>

          <div className="relative min-h-[540px] flex flex-col items-center justify-center py-2 select-none">
              {/* Subtle mannequin axis spine */}
              <div className="pointer-events-none absolute inset-y-8 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />

            {/* TOP SLOT */}
            <div
              onClick={() => setActiveSlot('top')}
              className={`relative z-20 w-64 h-52 flex items-center justify-center rounded-xl transition-all cursor-pointer ${
                activeSlot === 'top' ? 'ring-1 ring-[#7A0C1E]/70 bg-white/[0.03]' : ''
              }`}
            >
              <AnimatePresence mode="wait">
                {outfitState.top ? (
                  <motion.div
                    key={`${outfitState.top.product.id}-${outfitState.top.colorId}`}
                    initial={{ opacity: 0, scale: 0.86, y: -14 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                    className="relative w-full h-full flex items-center justify-center"
                  >
                    <CutoutImage
                      src={getPieceImage(outfitState.top)}
                      alt={outfitState.top.product.name}
                      className="max-h-full max-w-full object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,0.65)]"
                    />
                  </motion.div>
                ) : (
                  <span className="text-xs text-white/40 border border-dashed border-white/20 rounded-xl px-5 py-8">
                    + {t.slotTop}
                  </span>
                )}
              </AnimatePresence>
            </div>

            {/* OPTIONAL LAYER / ACCESSORY FLOATING SIDE */}
            {outfitState.accessory && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => setActiveSlot('accessory')}
                className="absolute right-2 top-16 z-30 w-32 h-32 rounded-xl bg-black/35 border border-white/15 p-2 flex items-center justify-center cursor-pointer"
              >
                <CutoutImage
                  src={getPieceImage(outfitState.accessory)}
                  alt={outfitState.accessory.product.name}
                  className="max-h-full max-w-full object-contain"
                />
                <button
                  type="button"
                  aria-label="Remove layer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOutfitState((p) => ({ ...p, accessory: null }));
                  }}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[#7A0C1E] text-white flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            )}

            {/* PANTS SLOT */}
            <div
              onClick={() => setActiveSlot('pants')}
              className={`relative z-10 -mt-5 w-60 h-56 flex items-center justify-center rounded-xl transition-all cursor-pointer ${
                activeSlot === 'pants' ? 'ring-1 ring-[#7A0C1E]/70 bg-white/[0.03]' : ''
              }`}
            >
              <AnimatePresence mode="wait">
                {outfitState.pants ? (
                  <motion.div
                    key={`${outfitState.pants.product.id}-${outfitState.pants.colorId}`}
                    initial={{ opacity: 0, scale: 0.88, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                    className="relative w-full h-full flex items-center justify-center"
                  >
                    <CutoutImage
                      src={getPieceImage(outfitState.pants)}
                      alt={outfitState.pants.product.name}
                      className="max-h-full max-w-full object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,0.65)]"
                    />
                  </motion.div>
                ) : (
                  <span className="text-xs text-white/40 border border-dashed border-white/20 rounded-xl px-5 py-8">
                    + {t.slotPants}
                  </span>
                )}
              </AnimatePresence>
            </div>

            {/* SHOES SLOT */}
            <div
              onClick={() => setActiveSlot('shoes')}
              className={`relative z-20 -mt-4 w-52 h-32 flex items-center justify-center rounded-xl transition-all cursor-pointer ${
                activeSlot === 'shoes' ? 'ring-1 ring-[#7A0C1E]/70 bg-white/[0.03]' : ''
              }`}
            >
              <AnimatePresence mode="wait">
                {outfitState.shoes ? (
                  <motion.div
                    key={`${outfitState.shoes.product.id}-${outfitState.shoes.colorId}`}
                    initial={{ opacity: 0, scale: 0.85, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                    className="relative w-full h-full flex items-center justify-center"
                  >
                    <CutoutImage
                      src={getPieceImage(outfitState.shoes)}
                      alt={outfitState.shoes.product.name}
                      className="max-h-full max-w-full object-contain drop-shadow-[0_14px_24px_rgba(0,0,0,0.75)]"
                    />
                  </motion.div>
                ) : (
                  <span className="text-xs text-white/40 border border-dashed border-white/20 rounded-xl px-5 py-5">
                    + {t.slotShoes}
                  </span>
                )}
              </AnimatePresence>
            </div>
          </div>
          {/* Selected Pieces Controls (Color + Size + Remove) */}
          <div className="mt-4 pt-4 border-t border-white/10 space-y-2.5">
            {SLOTS.map((slot) => {
              const sel = outfitState[slot];
              if (!sel) return null;
              const priceInfo = getEffectivePrice(sel.product, activeOffers);
              return (
                <div
                  key={slot}
                  className="rounded-xl bg-black/35 border border-white/10 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] uppercase tracking-wider text-[#C2B2A8]">
                      {slotLabel(slot)}
                    </div>
                    <div className="text-sm font-semibold text-white truncate">
                      {lang === 'ar' ? sel.product.nameAr : sel.product.name}
                    </div>
                  </div>

                  {/* Color dots */}
                  <div className="flex items-center gap-1.5">
                    {sel.product.colors.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        title={lang === 'ar' ? c.nameAr : c.name}
                        onClick={() =>
                          setOutfitState((prev) => ({
                            ...prev,
                            [slot]: prev[slot] ? { ...prev[slot]!, colorId: c.id } : null,
                          }))
                        }
                        style={{ backgroundColor: c.hex }}
                        className={`w-5 h-5 rounded-full border-2 cursor-pointer transition-transform ${
                          sel.colorId === c.id ? 'border-white scale-110' : 'border-white/25'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Size selector */}
                  <select
                    value={sel.size}
                    onChange={(e) =>
                      setOutfitState((prev) => ({
                        ...prev,
                        [slot]: prev[slot] ? { ...prev[slot]!, size: e.target.value } : null,
                      }))
                    }
                    className="px-2 py-1 rounded bg-[#1D110C] border border-white/15 text-xs font-mono-num text-white"
                  >
                    {sel.product.sizes.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>

                  <span className="font-mono-num text-xs font-semibold text-white shrink-0">
                    {formatEGP(priceInfo.finalPrice, lang)}
                  </span>

                  <button
                    type="button"
                    aria-label={`Remove ${slot}`}
                    onClick={() => setOutfitState((prev) => ({ ...prev, [slot]: null }))}
                    className="p-1 text-white/50 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Total & Add Full Outfit Button */}
          <div className="mt-5 pt-4 border-t border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs text-[#C2B2A8]">{t.outfitTotal}</div>
              <div className="flex items-baseline gap-2.5">
                <span className="font-mono-num text-2xl font-bold text-white">
                  {formatEGP(totals.total, lang)}
                </span>
                {totals.original > totals.total && (
                  <span className="font-mono-num text-sm text-[#C2B2A8] line-through">
                    {formatEGP(totals.original, lang)}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              disabled={totals.count === 0}
              onClick={handleAddFullOutfit}
              className="px-6 py-3 rounded-xl bg-[#7A0C1E] hover:bg-[#991228] disabled:opacity-40 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {addedAll ? <Check className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
              {addedAll
                ? lang === 'ar'
                  ? 'تمت إضافة الطقم للحقيبة'
                  : 'Full Outfit Added'
                : t.addFullOutfit}
            </button>
          </div>
        </div>

        {/* Right: Glassy Piece Selector Panel */}
        <div className="lg:col-span-6 rounded-2xl backdrop-blur-xl bg-white/[0.05] border border-white/15 p-5 sm:p-6">
          {/* Category Slot Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 rounded-xl bg-black/35 border border-white/10 mb-6">
            {SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => setActiveSlot(slot)}
                className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap truncate cursor-pointer ${
                  activeSlot === slot
                    ? 'bg-[#7A0C1E] text-white'
                    : 'text-[#C2B2A8] hover:text-white'
                }`}
              >
                {slotLabel(slot)}
              </button>
            ))}
          </div>

          {/* Product Thumbnails Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[640px] overflow-y-auto pr-1">
            {productsForSlot.map((product) => {
              const isSelected = outfitState[activeSlot]?.product.id === product.id;
              const priceInfo = getEffectivePrice(product, activeOffers);
              const img = product.colors[0]?.images[0] || product.images[0] || '';
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => selectPiece(activeSlot, product)}
                  className={`group text-left rtl:text-right rounded-xl p-2.5 border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#7A0C1E] bg-[#7A0C1E]/20'
                      : 'border-white/12 bg-white/[0.04] hover:border-white/30'
                  }`}
                >
                  <div className="aspect-square w-full rounded-lg bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.06)_0%,_transparent_74%)] p-2 mb-2.5 overflow-hidden">
                    <CutoutImage
                      src={img}
                      alt={lang === 'ar' ? product.nameAr : product.name}
                      className="w-full h-full object-contain drop-shadow-[0_14px_20px_rgba(0,0,0,0.65)] group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <div className="text-xs font-semibold text-white truncate">
                    {lang === 'ar' ? product.nameAr : product.name}
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="font-mono-num text-xs font-bold text-white">
                      {formatEGP(priceInfo.finalPrice, lang)}
                    </span>
                    {priceInfo.isOnOffer && priceInfo.originalPrice > priceInfo.finalPrice && (
                      <span className="font-mono-num text-[10px] text-[#C2B2A8] line-through">
                        {formatEGP(priceInfo.originalPrice, lang)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </motion.section>
  );
};
