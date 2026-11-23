import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Layers } from 'lucide-react';
import type { Category, Language, Product } from '../types';
import { useT } from '../utils/i18n';
import { CutoutImage } from './CutoutImage';

interface Props {
  categories: Category[];
  products: Product[];
  lang: Language;
  onSelectCategory: (categoryId: string | 'all') => void;
  onOpenOutfitBuilder: () => void;
}

export const CollectionsSection: React.FC<Props> = ({
  categories,
  products,
  lang,
  onSelectCategory,
  onOpenOutfitBuilder,
}) => {
  const t = useT(lang);

  return (
    <section
      id="collections"
      className="relative py-24 px-4 sm:px-8 max-w-7xl mx-auto"
    >
      {/* Atmospheric subtle glow */}
      <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 w-[580px] h-[260px] rounded-full bg-[#4A2C1D]/25 blur-[110px]" />

      <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-6 mb-14">
        <div className="max-w-2xl">
          <p className="text-xs tracking-[0.2em] uppercase text-[#C2B2A8] mb-2">
            {t.brand} · 02
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white [text-wrap:balance]">
            {t.collectionsTitle}
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#C2B2A8] leading-relaxed">
            {t.collectionsDesc}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onSelectCategory('all')}
            className="px-4 py-2.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            {t.allProducts} ({products.length})
          </button>
          <button
            type="button"
            onClick={onOpenOutfitBuilder}
            className="px-5 py-2.5 rounded-lg bg-[#7A0C1E] hover:bg-[#991228] text-sm font-semibold text-white transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Layers className="w-4 h-4" />
            {t.buildYourOutfit}
          </button>
        </div>
      </div>

      {/* Zero-Gravity Glassmorphism Collection Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {categories.map((cat, idx) => {
          const count = products.filter((p) => p.categoryId === cat.id).length;
          return (
            <motion.button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.45, delay: idx * 0.06 }}
              whileHover={{ y: -6, scale: 1.015 }}
              style={{ animationDelay: `${idx * 0.9}s` }}
              className="animate-float-slow group relative text-left rtl:text-right rounded-2xl p-5 backdrop-blur-xl bg-white/[0.06] border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.45)] hover:border-[#7A0C1E]/70 hover:bg-white/[0.09] transition-colors cursor-pointer overflow-hidden"
            >
              {/* Soft inner glass glow */}
              <div className="pointer-events-none absolute -top-20 -right-20 w-48 h-48 rounded-full bg-[#7A0C1E]/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.06)_0%,_transparent_72%)] mb-5">
                <CutoutImage
                  src={cat.image}
                  alt={lang === 'ar' ? cat.nameAr : cat.name}
                  className="w-full h-full object-contain p-4 drop-shadow-[0_20px_28px_rgba(0,0,0,0.7)] group-hover:scale-105 transition-transform duration-500"
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs text-[#C2B2A8] mb-1">
                    {count} {lang === 'ar' ? 'قطع' : count === 1 ? 'piece' : 'pieces'}
                  </div>
                  <h3 className="text-xl font-bold text-white truncate">
                    {lang === 'ar' ? cat.nameAr : cat.name}
                  </h3>
                </div>
                <span className="w-10 h-10 rounded-full border border-white/20 bg-white/5 flex items-center justify-center text-white group-hover:bg-[#7A0C1E] group-hover:border-[#7A0C1E] transition-colors shrink-0">
                  <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
};
