import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Layers, Search } from 'lucide-react';
import type { Category, Language, OfferTimer, Product } from '../types';
import { useT } from '../utils/i18n';
import { formatEGP, getEffectivePrice } from '../utils/pricing';
import { CutoutImage } from './CutoutImage';

interface Props {
  categories: Category[];
  products: Product[];
  activeOffers: OfferTimer[];
  selectedCategoryId: string | 'all';
  offerFilterIds?: string[] | null;
  lang: Language;
  onChangeCategory: (id: string | 'all') => void;
  onSelectProduct: (product: Product) => void;
  onAddToOutfit: (product: Product) => void;
  onBack: () => void;
}

export const CollectionGridView: React.FC<Props> = ({
  categories,
  products,
  activeOffers,
  selectedCategoryId,
  offerFilterIds,
  lang,
  onChangeCategory,
  onSelectProduct,
  onAddToOutfit,
  onBack,
}) => {
  const t = useT(lang);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'featured' | 'low' | 'high'>('featured');

  const activeCategory = categories.find((c) => c.id === selectedCategoryId);

  const filtered = useMemo(() => {
    let list = products.filter((p) => p.showInStore);
    if (offerFilterIds && offerFilterIds.length > 0 && selectedCategoryId === 'all') {
      list = list.filter((p) => offerFilterIds.includes(p.id));
    } else if (selectedCategoryId !== 'all') {
      list = list.filter((p) => p.categoryId === selectedCategoryId);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.nameAr.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
      );
    }
    if (sort === 'low') {
      list = [...list].sort(
        (a, b) => getEffectivePrice(a, activeOffers).finalPrice - getEffectivePrice(b, activeOffers).finalPrice
      );
    } else if (sort === 'high') {
      list = [...list].sort(
        (a, b) => getEffectivePrice(b, activeOffers).finalPrice - getEffectivePrice(a, activeOffers).finalPrice
      );
    }
    return list;
  }, [products, selectedCategoryId, offerFilterIds, search, sort, activeOffers]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen py-12 px-4 sm:px-8 max-w-7xl mx-auto"
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

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#C2B2A8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="pl-9 pr-4 py-2 rounded-lg bg-white/5 border border-white/15 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#7A0C1E]"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as 'featured' | 'low' | 'high')}
            className="px-3 py-2 rounded-lg bg-[#1D110C] border border-white/15 text-sm text-white focus:outline-none focus:border-[#7A0C1E]"
          >
            <option value="featured">{t.sortFeatured}</option>
            <option value="low">{t.sortPriceLow}</option>
            <option value="high">{t.sortPriceHigh}</option>
          </select>
        </div>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white">
          {offerFilterIds && selectedCategoryId === 'all'
            ? lang === 'ar'
              ? 'قطع العرض المحدود'
              : 'Timed Offer Selection'
            : activeCategory
              ? lang === 'ar'
                ? activeCategory.nameAr
                : activeCategory.name
              : t.allProducts}
        </h1>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-8">
        <button
          type="button"
          onClick={() => onChangeCategory('all')}
          className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
            selectedCategoryId === 'all'
              ? 'bg-[#7A0C1E] text-white'
              : 'bg-white/5 border border-white/10 text-[#C2B2A8] hover:text-white'
          }`}
        >
          {t.allProducts}
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onChangeCategory(cat.id)}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              selectedCategoryId === cat.id
                ? 'bg-[#7A0C1E] text-white'
                : 'bg-white/5 border border-white/10 text-[#C2B2A8] hover:text-white'
            }`}
          >
            {lang === 'ar' ? cat.nameAr : cat.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-16 text-center text-[#C2B2A8]">
          {lang === 'ar' ? 'لا توجد قطع مطابقة لبحثك.' : 'No pieces match your current filter.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {filtered.map((product) => {
            const pricing = getEffectivePrice(product, activeOffers);
            const cat = categories.find((c) => c.id === product.categoryId);
            const img = product.colors[0]?.images[0] || product.images[0] || '';
            return (
              <div
                key={product.id}
                className="group rounded-2xl backdrop-blur-lg bg-white/[0.05] border border-white/12 p-4 hover:-translate-y-1 hover:border-[#7A0C1E]/60 transition-all flex flex-col"
              >
                <button
                  type="button"
                  onClick={() => onSelectProduct(product)}
                  className="relative aspect-[4/3] w-full rounded-xl overflow-hidden bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.06)_0%,_transparent_72%)] mb-4 cursor-pointer"
                >
                  <CutoutImage
                    src={img}
                    alt={lang === 'ar' ? product.nameAr : product.name}
                    className="w-full h-full object-contain p-3 drop-shadow-[0_18px_24px_rgba(0,0,0,0.68)] group-hover:scale-105 transition-transform duration-500"
                  />
                </button>

                <div className="flex items-center justify-between gap-2 text-xs text-[#C2B2A8] mb-1">
                  <span className="uppercase tracking-wider truncate">
                    {lang === 'ar' ? cat?.nameAr : cat?.name}
                  </span>
                  {pricing.isOnOffer && (
                    <span className="text-[#FF7B8E] font-medium shrink-0">
                      {lang === 'ar' ? 'عرض محدود' : 'Offer'}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onSelectProduct(product)}
                  className="text-left rtl:text-right font-semibold text-base text-white hover:text-[#FF9AA9] transition-colors truncate cursor-pointer"
                >
                  {lang === 'ar' ? product.nameAr : product.name}
                </button>

                <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono-num text-sm font-bold text-white">
                      {formatEGP(pricing.finalPrice, lang)}
                    </span>
                    {pricing.isOnOffer && pricing.originalPrice > pricing.finalPrice && (
                      <span className="font-mono-num text-xs text-[#C2B2A8] line-through">
                        {formatEGP(pricing.originalPrice, lang)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      {product.colors.slice(0, 4).map((c) => (
                        <span
                          key={c.id}
                          title={c.name}
                          style={{ backgroundColor: c.hex }}
                          className="w-3.5 h-3.5 rounded-full border border-white/30"
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => onAddToOutfit(product)}
                      title={t.addToOutfit}
                      className="p-2 rounded-lg bg-white/5 hover:bg-[#7A0C1E] text-white transition-colors cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.section>
  );
};
