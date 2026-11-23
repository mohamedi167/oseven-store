import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Box, Check, Layers, Minus, Plus, ShoppingBag } from 'lucide-react';
import type { Category, Language, OfferTimer, Product, ProductColor } from '../types';
import { useT } from '../utils/i18n';
import { formatEGP, getEffectivePrice } from '../utils/pricing';
import { CutoutImage } from './CutoutImage';

interface Props {
  product: Product;
  categories: Category[];
  activeOffers: OfferTimer[];
  lang: Language;
  onBack: () => void;
  onAddToCart: (payload: {
    product: Product;
    color: ProductColor;
    size: string;
    quantity: number;
  }) => void;
  onAddToOutfit: (product: Product, colorId?: string, size?: string) => void;
}

export const ProductDetailView: React.FC<Props> = ({
  product,
  categories,
  activeOffers,
  lang,
  onBack,
  onAddToCart,
  onAddToOutfit,
}) => {
  const t = useT(lang);
  const category = categories.find((c) => c.id === product.categoryId);
  const pricing = getEffectivePrice(product, activeOffers);

  const fallbackColor: ProductColor = useMemo(
    () => ({
      id: 'default',
      name: 'Standard',
      nameAr: 'أساسي',
      hex: '#141414',
      images: product.images,
    }),
    [product.images]
  );

  const availableColors = product.colors.length > 0 ? product.colors : [fallbackColor];
  const [selectedColor, setSelectedColor] = useState<ProductColor>(availableColors[0]);
  const [selectedSize, setSelectedSize] = useState<string>(product.sizes[0] || 'M');
  const [quantity, setQuantity] = useState(1);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [tilt3D, setTilt3D] = useState({ rx: 0, ry: 0 });
  const [view3DMode, setView3DMode] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState(false);

  useEffect(() => {
    setSelectedColor(availableColors[0]);
    setSelectedSize(product.sizes[0] || 'M');
    setQuantity(1);
    setActiveImageIdx(0);
    setAddedFeedback(false);
  }, [product, availableColors]);

  useEffect(() => {
    if (!addedFeedback) return;
    const timer = window.setTimeout(() => {
      setAddedFeedback(false);
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [addedFeedback]);

  const galleryImages = useMemo(() => {
    const colorImgs = selectedColor?.images?.length ? selectedColor.images : [];
    const combined = Array.from(new Set([...colorImgs, ...product.images]));
    return combined.length > 0 ? combined : ['/assets/aistudio/_______5__0f6b9b70.jpeg'];
  }, [selectedColor, product.images]);

  const currentImg = galleryImages[activeImageIdx] || galleryImages[0];

  const handleColorPick = (c: ProductColor) => {
    setSelectedColor(c);
    setActiveImageIdx(0);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!view3DMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt3D({ rx: -y * 22, ry: x * 28 });
  };

  const handleAdd = () => {
    onAddToCart({
      product,
      color: selectedColor,
      size: selectedSize,
      quantity,
    });
    setAddedFeedback(true);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      translate="no"
      className="min-h-screen py-10 px-4 sm:px-8 max-w-6xl mx-auto notranslate"
    >
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-[#C2B2A8] hover:text-white transition-colors mb-8 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
        {t.backToStore}
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left: Gallery / 3D Inspection Stage */}
        <div className="lg:col-span-7 space-y-4">
          <div
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTilt3D({ rx: 0, ry: 0 })}
            style={{ perspective: '1000px' }}
            className="relative aspect-[4/4.2] w-full rounded-2xl backdrop-blur-xl bg-[radial-gradient(circle_at_50%_45%,_rgba(107,66,38,0.22)_0%,_rgba(255,255,255,0.03)_68%,_transparent_100%)] border border-white/15 overflow-hidden flex items-center justify-center p-8"
          >
            <button
              type="button"
              onClick={() => setView3DMode((v) => !v)}
              className={`absolute top-4 right-4 z-10 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                view3DMode
                  ? 'bg-[#7A0C1E] text-white'
                  : 'bg-[#120A07]/80 text-white hover:bg-[#120A07]'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              {view3DMode ? '3D Tilt Active' : '3D Inspect'}
            </button>

            <CutoutImage
              src={currentImg}
              alt={lang === 'ar' ? product.nameAr : product.name}
              style={
                view3DMode
                  ? {
                      transform: `rotateX(${tilt3D.rx}deg) rotateY(${tilt3D.ry}deg) scale(1.06)`,
                      transition: 'transform 120ms ease-out, opacity 200ms ease-out',
                    }
                  : undefined
              }
              className="w-full h-full object-contain drop-shadow-[0_24px_34px_rgba(0,0,0,0.75)]"
            />
          </div>

          {galleryImages.length > 1 && (
            <div className="flex items-center gap-3 overflow-x-auto pb-1">
              {galleryImages.map((img, i) => (
                <button
                  key={`${img}-${i}`}
                  type="button"
                  onClick={() => setActiveImageIdx(i)}
                  className={`w-20 h-20 rounded-xl bg-white/[0.04] border p-1.5 shrink-0 transition-all cursor-pointer ${
                    i === activeImageIdx
                      ? 'border-[#7A0C1E] scale-105 bg-white/[0.08]'
                      : 'border-white/10 opacity-75 hover:opacity-100'
                  }`}
                >
                  <CutoutImage
                    src={img}
                    alt={`${product.name} view ${i + 1}`}
                    className="w-full h-full object-contain drop-shadow-md"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Contiguous Purchase Module */}
        <div className="lg:col-span-5 rounded-2xl bg-white/[0.04] border border-white/12 p-6 sm:p-8 space-y-6 lg:sticky lg:top-24">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#C2B2A8] mb-2">
              <span className="uppercase tracking-wider">
                {lang === 'ar' ? category?.nameAr : category?.name}
              </span>
              <span aria-hidden="true">·</span>
              <span className={product.stock > 0 ? 'text-emerald-400' : 'text-red-400'}>
                {product.stock > 0 ? `${t.inStock} (${product.stock})` : t.outOfStock}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              {lang === 'ar' ? product.nameAr : product.name}
            </h1>

            <div className="flex items-baseline gap-3 mt-4">
              <span className="font-mono-num text-2xl font-bold text-white">
                {formatEGP(pricing.finalPrice, lang)}
              </span>
              {pricing.isOnOffer && pricing.originalPrice > pricing.finalPrice && (
                <span className="font-mono-num text-sm text-[#C2B2A8] line-through">
                  {formatEGP(pricing.originalPrice, lang)}
                </span>
              )}
            </div>
            {pricing.offerTitle && (
              <p className="text-xs text-[#FF8C9E] mt-1">
                {lang === 'ar' ? pricing.offerTitleAr : pricing.offerTitle}
              </p>
            )}
          </div>

          <p className="text-sm text-[#C2B2A8] leading-relaxed">
            {lang === 'ar' ? product.descriptionAr : product.description}
          </p>

          {/* Color Selector */}
          <div>
            <div className="flex items-center justify-between text-xs mb-2.5">
              <span className="text-[#C2B2A8] uppercase tracking-wider">{t.selectColor}</span>
              <span className="font-medium text-white">
                {lang === 'ar' ? selectedColor.nameAr : selectedColor.name}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {availableColors.map((c) => {
                const active = c.id === selectedColor.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleColorPick(c)}
                    title={lang === 'ar' ? c.nameAr : c.name}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                      active
                        ? 'border-[#7A0C1E] bg-[#7A0C1E]/25 text-white'
                        : 'border-white/15 bg-white/5 text-[#C2B2A8] hover:text-white'
                    }`}
                  >
                    <span
                      style={{ backgroundColor: c.hex }}
                      className="w-4 h-4 rounded-full border border-white/30 shrink-0"
                    />
                    <span>{lang === 'ar' ? c.nameAr : c.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Size Selector */}
          <div>
            <div className="flex items-center justify-between text-xs mb-2.5">
              <span className="text-[#C2B2A8] uppercase tracking-wider">{t.selectSize}</span>
              <span className="text-white/70">
                {product.sizeType === 'shoes' ? 'EU Sizing' : 'Streetwear Relaxed Fit'}
              </span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {product.sizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setSelectedSize(size)}
                  className={`py-2.5 rounded-lg text-xs font-semibold font-mono-num border transition-colors cursor-pointer ${
                    selectedSize === size
                      ? 'bg-[#7A0C1E] border-[#7A0C1E] text-white'
                      : 'bg-white/5 border-white/15 text-white/80 hover:border-white/35'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity + Actions */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-lg border border-white/15 bg-white/5 h-11">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-3 h-full text-white/80 hover:text-white cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="px-3 font-mono-num text-sm font-semibold text-white">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => setQuantity((q) => Math.min(Math.max(1, product.stock), q + 1))}
                  className="px-3 h-full text-white/80 hover:text-white cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                disabled={product.stock <= 0}
                onClick={handleAdd}
                className="flex-1 h-11 rounded-lg bg-[#7A0C1E] hover:bg-[#991228] disabled:opacity-40 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="inline-flex items-center justify-center w-4 h-4 shrink-0">
                  {addedFeedback ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <ShoppingBag className="w-4 h-4" />
                  )}
                </span>
                <span>
                  {addedFeedback
                    ? lang === 'ar'
                      ? 'تمت الإضافة'
                      : 'Added to Bag'
                    : t.addToCart}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => onAddToOutfit(product, selectedColor.id, selectedSize)}
              className="w-full h-11 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Layers className="w-4 h-4" />
              {t.addToOutfit}
            </button>
          </div>
        </div>
      </div>
    </motion.section>
  );
};