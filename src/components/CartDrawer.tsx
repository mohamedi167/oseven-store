import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import type {
  CartItem,
  Language,
  OfferTimer,
  Product,
} from '../types';
import { useT } from '../utils/i18n';
import { formatEGP, getEffectivePrice } from '../utils/pricing';
import { CutoutImage } from './CutoutImage';

interface Props {
  open: boolean;
  onClose: () => void;
  cart: CartItem[];
  products: Product[];
  activeOffers: OfferTimer[];
  lang: Language;
  onUpdateQty: (key: string, qty: number) => void;
  onRemoveItem: (key: string) => void;
  onProceedToCheckout: () => void;
}

export const CartDrawer: React.FC<Props> = ({
  open,
  onClose,
  cart,
  products,
  activeOffers,
  lang,
  onUpdateQty,
  onRemoveItem,
  onProceedToCheckout,
}) => {
  const t = useT(lang);

  const enrichedCart = useMemo(() => {
    return cart.map((item) => {
      const prod = products.find((p) => p.id === item.productId);
      const pricing = prod
        ? getEffectivePrice(prod, activeOffers)
        : { finalPrice: 0, originalPrice: 0, isOnOffer: false };
      return { item, prod, pricing };
    });
  }, [cart, products, activeOffers]);

  const subtotal = useMemo(
    () => enrichedCart.reduce((acc, row) => acc + row.pricing.finalPrice * row.item.quantity, 0),
    [enrichedCart]
  );

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          />

          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="relative z-10 w-full max-w-md bg-[#160C08] border-l border-white/15 h-full flex flex-col text-white shadow-2xl"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-5 h-5 text-[#7A0C1E]" />
                <h2 className="text-lg font-bold">{t.cartTitle}</h2>
              </div>
              <button
                type="button"
                aria-label="Close bag"
                onClick={onClose}
                className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-16 text-[#C2B2A8]">
                  <ShoppingBag className="w-12 h-12 opacity-30 mb-4" />
                  <p className="text-sm">{t.cartEmpty}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {enrichedCart.map(({ item, pricing }) => (
                    <div
                      key={item.key}
                      className="flex gap-3.5 p-3 rounded-xl bg-white/[0.04] border border-white/10"
                    >
                      <div className="w-20 h-24 rounded-lg bg-white/[0.04] border border-white/10 p-1.5 shrink-0">
                        <CutoutImage
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-contain drop-shadow-md"
                        />
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-sm font-semibold text-white truncate">
                              {lang === 'ar' ? item.nameAr : item.name}
                            </h4>
                            <button
                              type="button"
                              aria-label="Remove item"
                              onClick={() => onRemoveItem(item.key)}
                              className="text-white/40 hover:text-red-400 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-[#C2B2A8] mt-1">
                            <span
                              style={{ backgroundColor: item.colorHex }}
                              className="w-3 h-3 rounded-full border border-white/30"
                            />
                            <span>{lang === 'ar' ? item.colorNameAr : item.colorName}</span>
                            <span>·</span>
                            <span className="font-mono-num">{item.size}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center rounded border border-white/15 bg-black/30">
                            <button
                              type="button"
                              onClick={() => onUpdateQty(item.key, item.quantity - 1)}
                              className="px-2 py-1 text-white/80 hover:text-white cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="px-2.5 font-mono-num text-xs">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => onUpdateQty(item.key, item.quantity + 1)}
                              className="px-2 py-1 text-white/80 hover:text-white cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="text-right">
                            <span className="font-mono-num text-sm font-bold text-white">
                              {formatEGP(pricing.finalPrice * item.quantity, lang)}
                            </span>
                            {pricing.isOnOffer && pricing.originalPrice > pricing.finalPrice && (
                              <div className="font-mono-num text-[11px] text-[#C2B2A8] line-through">
                                {formatEGP(pricing.originalPrice * item.quantity, lang)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer Totals & CTA to Dedicated Checkout Page */}
            {cart.length > 0 && (
              <div className="p-6 border-t border-white/10 bg-[#120A07] space-y-3">
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-[#C2B2A8]">
                    <span>{t.subtotal}</span>
                    <span className="font-mono-num text-white font-bold">
                      {formatEGP(subtotal, lang)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onProceedToCheckout}
                  className="w-full py-3.5 rounded-xl bg-[#7A0C1E] hover:bg-[#991228] text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  {t.proceedCheckout}
                </button>
              </div>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
};
