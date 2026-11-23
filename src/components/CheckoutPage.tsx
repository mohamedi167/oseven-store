import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
} from 'lucide-react';
import type {
  CartItem,
  Language,
  OfferTimer,
  Order,
  Product,
  ShippingZone,
} from '../types';
import { useT } from '../utils/i18n';
import { formatEGP, getEffectivePrice } from '../utils/pricing';
import { CutoutImage } from './CutoutImage';

interface Props {
  cart: CartItem[];
  products: Product[];
  activeOffers: OfferTimer[];
  shippingZones: ShippingZone[];
  lang: Language;
  onUpdateQty: (key: string, qty: number) => void;
  onRemoveItem: (key: string) => void;
  onClearCart: () => void;
  onOpenBag: () => void;
  onBackToStore: () => void;
}

export const CheckoutPage: React.FC<Props> = ({
  cart,
  products,
  activeOffers,
  shippingZones,
  lang,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onOpenBag,
  onBackToStore,
}) => {
  const t = useT(lang);

  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [discountInput, setDiscountInput] = useState('');
  const [discountResult, setDiscountResult] = useState<{
    valid: boolean;
    code?: string;
    discountAmount?: number;
    error?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);

  const allGovernorates = useMemo(() => {
    const list: { gov: string; zoneName: string; price: number }[] = [];
    for (const z of shippingZones || []) {
      for (const g of z.governorates || []) {
        list.push({ gov: g, zoneName: lang === 'ar' ? z.nameAr : z.name, price: Number(z.price) || 0 });
      }
    }
    return list;
  }, [shippingZones, lang]);

  const enrichedCart = useMemo(() => {
    return (cart || []).map((item) => {
      const prod = (products || []).find((p) => p.id === item.productId);
      const pricing = prod
        ? getEffectivePrice(prod, activeOffers || [])
        : { finalPrice: 0, originalPrice: 0, isOnOffer: false };
      return { item, prod, pricing };
    });
  }, [cart, products, activeOffers]);

  const subtotal = useMemo(
    () =>
      enrichedCart.reduce(
        (acc, row) => acc + (Number(row.pricing.finalPrice) || 0) * (Number(row.item.quantity) || 0),
        0
      ),
    [enrichedCart]
  );

  const shippingCost = useMemo(() => {
    if (!governorate) return 0;
    const match = allGovernorates.find((g) => g.gov === governorate);
    return match ? Number(match.price) || 0 : 0;
  }, [governorate, allGovernorates]);

  const discountAmount = discountResult?.valid ? Number(discountResult.discountAmount) || 0 : 0;
  const total = Math.max(0, subtotal - discountAmount + shippingCost);

  const handleValidateDiscount = async () => {
    if (!discountInput.trim()) return;
    try {
      const res = await fetch('/api/store/validate-discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: discountInput.trim(), subtotal }),
      });
      const data = await res.json();
      setDiscountResult(data);
    } catch {
      setDiscountResult({
        valid: false,
        error: lang === 'ar' ? 'تعذر التحقق من الكود.' : 'Could not verify code.',
      });
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!customerName.trim() || !phone.trim() || !governorate || !address.trim()) {
      setErrorMsg(
        lang === 'ar'
          ? 'يرجى استكمال جميع حقول التوصيل المطلوبة.'
          : 'Please complete all required delivery fields.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          phone: phone.trim(),
          governorate,
          address: address.trim(),
          notes: notes.trim(),
          discountCode: discountResult?.valid ? discountResult.code : undefined,
          items: (cart || []).map((c) => ({
            productId: c.productId,
            quantity: c.quantity,
            size: c.size,
            colorName: c.colorName,
            colorHex: c.colorHex,
            image: c.image,
          })),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data?.error || 'Could not place order.');
        setSubmitting(false);
        return;
      }

      const rawOrder = (data?.order || data) as Partial<Order> & { order_number?: string };
      const normalizedItems = Array.isArray(rawOrder?.items)
        ? rawOrder.items
        : enrichedCart.map(({ item, pricing }) => ({
            productId: item.productId,
            name: lang === 'ar' ? item.nameAr || item.name : item.name,
            price: Number(pricing.finalPrice) || 0,
            quantity: Number(item.quantity) || 1,
            size: item.size || '',
            colorName: lang === 'ar' ? item.colorNameAr || item.colorName : item.colorName || '',
            image: item.image || '',
          }));

      const normalizedOrder: Order = {
        ...(rawOrder as Order),
        orderNumber:
          rawOrder?.orderNumber ||
          rawOrder?.order_number ||
          `OSEV-${Date.now().toString().slice(-6)}`,
        customerName: rawOrder?.customerName || customerName.trim(),
        phone: rawOrder?.phone || phone.trim(),
        governorate: rawOrder?.governorate || governorate,
        address: rawOrder?.address || address.trim(),
        items: normalizedItems,
        subtotal: Number(rawOrder?.subtotal ?? subtotal) || 0,
        shippingCost: Number(rawOrder?.shippingCost ?? shippingCost) || 0,
        discountAmount: Number(rawOrder?.discountAmount ?? discountAmount) || 0,
        total: Number(rawOrder?.total ?? total) || 0,
      };

      setConfirmedOrder(normalizedOrder);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      try {
        onClearCart();
      } catch (clearErr) {
        console.error('Clear cart error:', clearErr);
      }
    } catch {
      setErrorMsg(
        lang === 'ar'
          ? 'خطأ في الاتصال بالخادم، يرجى المحاولة مرة أخرى.'
          : 'Network error placing order. Please retry.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Dedicated full-page confirmation receipt
  if (confirmedOrder) {
    const orderItems = Array.isArray(confirmedOrder.items) ? confirmedOrder.items : [];
    const orderSubtotal = Number(confirmedOrder.subtotal) || 0;
    const orderShipping = Number(confirmedOrder.shippingCost) || 0;
    const orderDiscount = Number(confirmedOrder.discountAmount) || 0;
    const orderTotal = Number(confirmedOrder.total) || 0;

    return (
      <section className="min-h-[82vh] py-14 px-4 sm:px-8 max-w-3xl mx-auto">
        <div className="rounded-3xl backdrop-blur-xl bg-white/[0.04] border border-white/15 p-8 sm:p-10 shadow-2xl space-y-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-4">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h1 className="text-3xl font-bold text-white">{t.orderConfirmed}</h1>
            <p className="text-sm sm:text-base text-[#C2B2A8] mt-2">{t.orderConfirmedDesc}</p>
            <div className="mt-4 font-mono-num text-sm bg-white/5 border border-white/15 px-4 py-1.5 rounded-lg text-white">
              {confirmedOrder.orderNumber}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-2xl bg-black/25 border border-white/10 p-5 text-sm">
            <div>
              <div className="text-xs text-[#C2B2A8] mb-1">{t.fullName}</div>
              <div className="font-semibold text-white">{confirmedOrder.customerName}</div>
            </div>
            <div>
              <div className="text-xs text-[#C2B2A8] mb-1">{t.phone}</div>
              <div className="font-mono-num font-semibold text-white">{confirmedOrder.phone}</div>
            </div>
            <div>
              <div className="text-xs text-[#C2B2A8] mb-1">{t.governorate}</div>
              <div className="font-semibold text-white">{confirmedOrder.governorate}</div>
            </div>
            <div>
              <div className="text-xs text-[#C2B2A8] mb-1">{t.fullAddress}</div>
              <div className="font-medium text-white">{confirmedOrder.address}</div>
            </div>
          </div>

          <div className="space-y-3">
            {orderItems.map((item, idx) => {
              const itemPrice = Number(item?.price) || 0;
              const itemQty = Number(item?.quantity) || 1;
              return (
                <div
                  key={`${item?.productId || 'item'}-${idx}`}
                  className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.03] border border-white/10"
                >
                  <div className="w-14 h-16 rounded-lg bg-white/[0.04] border border-white/10 p-1 shrink-0">
                    <CutoutImage
                      src={item?.image || ''}
                      alt={item?.name || 'Product'}
                      className="w-full h-full object-contain drop-shadow-md"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {item?.name || ''}
                    </div>
                    <div className="text-xs text-[#C2B2A8] mt-0.5">
                      {[item?.colorName, item?.size].filter(Boolean).join(' · ')} × {itemQty}
                    </div>
                  </div>
                  <div className="font-mono-num text-sm font-bold text-white shrink-0">
                    {formatEGP(itemPrice * itemQty, lang)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl bg-black/25 border border-white/10 p-5 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-[#C2B2A8]">{t.subtotal}</span>
              <span className="font-mono-num">{formatEGP(orderSubtotal, lang)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#C2B2A8]">{t.shipping}</span>
              <span className="font-mono-num">{formatEGP(orderShipping, lang)}</span>
            </div>
            {orderDiscount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>{t.discount}</span>
                <span className="font-mono-num">-{formatEGP(orderDiscount, lang)}</span>
              </div>
            )}
            <div className="pt-3 border-t border-white/10 flex justify-between font-bold text-lg text-white">
              <span>{t.total}</span>
              <span className="font-mono-num">{formatEGP(orderTotal, lang)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onBackToStore}
            className="w-full py-4 rounded-xl bg-[#7A0C1E] hover:bg-[#991228] text-white font-semibold text-sm transition-colors cursor-pointer"
          >
            {t.continueShopping}
          </button>
        </div>
      </section>
    );
  }

  // Empty cart state if user opens /checkout directly with empty bag
  if (!cart || cart.length === 0) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="min-h-[75vh] py-16 px-4 sm:px-8 max-w-2xl mx-auto flex flex-col items-center justify-center text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-[#C2B2A8] mb-5">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">{t.checkoutTitle}</h1>
        <p className="text-sm text-[#C2B2A8] mb-8">{t.cartEmpty}</p>
        <button
          type="button"
          onClick={onBackToStore}
          className="px-7 py-3.5 rounded-xl bg-[#7A0C1E] hover:bg-[#991228] text-white text-sm font-semibold transition-colors cursor-pointer"
        >
          {t.continueShopping}
        </button>
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen py-10 px-4 sm:px-8 max-w-7xl mx-auto"
    >
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <button
          type="button"
          onClick={onBackToStore}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#C2B2A8] hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
          {t.backToStore}
        </button>

        <button
          type="button"
          onClick={onOpenBag}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium px-4 py-2 rounded-lg bg-white/5 border border-white/15 text-[#C2B2A8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <ShoppingBag className="w-4 h-4" />
          {t.editBag}
        </button>
      </div>

      {/* Heading */}
      <div className="mb-10">
        <p className="text-xs tracking-[0.2em] uppercase text-[#C2B2A8] mb-2">
          {t.brand} · {t.checkoutTitle}
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-white">{t.checkoutTitle}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        {/* Left Column: Delivery Form & Payment Method */}
        <form
          id="separate-checkout-form"
          onSubmit={handleSubmitOrder}
          className="lg:col-span-7 space-y-6"
        >
          {errorMsg && (
            <div className="p-4 rounded-xl bg-red-500/15 border border-red-500/40 text-sm text-red-200">
              {errorMsg}
            </div>
          )}

          {/* Delivery Details Card */}
          <div className="rounded-3xl backdrop-blur-xl bg-white/[0.04] border border-white/12 p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-2.5 pb-4 border-b border-white/10">
              <MapPin className="w-5 h-5 text-[#7A0C1E]" />
              <h2 className="text-lg font-bold text-white">{t.deliveryDetails}</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#C2B2A8] mb-1.5">{t.fullName} *</label>
                <input
                  required
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#7A0C1E]"
                />
              </div>

              <div>
                <label className="block text-xs text-[#C2B2A8] mb-1.5">{t.phone} *</label>
                <input
                  required
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010xxxxxxxx"
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-sm text-white font-mono-num placeholder:text-white/30 focus:outline-none focus:border-[#7A0C1E]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#C2B2A8] mb-1.5">{t.governorate} *</label>
              <select
                required
                value={governorate}
                onChange={(e) => setGovernorate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#1D110C] border border-white/15 text-sm text-white focus:outline-none focus:border-[#7A0C1E]"
              >
                <option value="">{t.selectGovernorate}</option>
                {allGovernorates.map((g) => (
                  <option key={g.gov} value={g.gov}>
                    {g.gov} ({formatEGP(g.price, lang)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-[#C2B2A8] mb-1.5">{t.fullAddress} *</label>
              <textarea
                required
                rows={3}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#7A0C1E]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#C2B2A8] mb-1.5">{t.notes}</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#7A0C1E]"
              />
            </div>
          </div>

          {/* Payment Method Card */}
          <div className="rounded-3xl backdrop-blur-xl bg-white/[0.04] border border-white/12 p-6 sm:p-8 space-y-4">
            <div className="flex items-center gap-2.5 pb-4 border-b border-white/10">
              <Banknote className="w-5 h-5 text-[#7A0C1E]" />
              <h2 className="text-lg font-bold text-white">{t.paymentMethod}</h2>
            </div>

            <div className="rounded-2xl border border-[#7A0C1E] bg-[#7A0C1E]/15 p-4 flex items-start gap-3.5">
              <div className="w-5 h-5 rounded-full border-4 border-[#7A0C1E] bg-white shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-sm text-white">{t.cashOnDelivery}</div>
                <p className="text-xs text-[#C2B2A8] mt-1 leading-relaxed">
                  {t.cashOnDeliveryDesc}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs text-[#C2B2A8]">
              <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5">
                <Truck className="w-4 h-4 text-[#C2B2A8] shrink-0" />
                <span>
                  {lang === 'ar' ? 'توصيل لجميع محافظات مصر' : 'Nationwide Egypt delivery'}
                </span>
              </div>
              <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5">
                <ShieldCheck className="w-4 h-4 text-[#C2B2A8] shrink-0" />
                <span>
                  {lang === 'ar' ? 'تغليف مميز وجودة مضمونة' : 'Verified OSEVEN packaging'}
                </span>
              </div>
            </div>
          </div>
        </form>

        {/* Right Column: Order Summary, Items & Promo Code */}
        <aside className="lg:col-span-5 lg:sticky lg:top-24 rounded-3xl backdrop-blur-xl bg-white/[0.04] border border-white/12 p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <h2 className="text-lg font-bold text-white">{t.orderSummary}</h2>
            <span className="font-mono-num text-xs text-[#C2B2A8]">
              {cart.reduce((acc, i) => acc + i.quantity, 0)}{' '}
              {lang === 'ar' ? 'قطع' : 'items'}
            </span>
          </div>

          {/* Bag Items */}
          <div className="space-y-3.5 max-h-[340px] overflow-y-auto pr-1">
            {enrichedCart.map(({ item, pricing }) => (
              <div
                key={item.key}
                className="flex gap-3 p-3 rounded-2xl bg-black/25 border border-white/10"
              >
                <div className="w-16 h-20 rounded-xl bg-white/[0.04] border border-white/10 p-1.5 shrink-0">
                  <CutoutImage
                    src={item.image}
                    alt={lang === 'ar' ? item.nameAr : item.name}
                    className="w-full h-full object-contain drop-shadow-md"
                  />
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-white truncate">
                        {lang === 'ar' ? item.nameAr : item.name}
                      </h3>
                      <button
                        type="button"
                        aria-label="Remove item"
                        onClick={() => onRemoveItem(item.key)}
                        className="text-white/40 hover:text-red-400 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[#C2B2A8] mt-1">
                      <span
                        style={{ backgroundColor: item.colorHex }}
                        className="w-2.5 h-2.5 rounded-full border border-white/30"
                      />
                      <span>{lang === 'ar' ? item.colorNameAr : item.colorName}</span>
                      <span>·</span>
                      <span className="font-mono-num">{item.size}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center rounded-lg border border-white/15 bg-black/30">
                      <button
                        type="button"
                        onClick={() => onUpdateQty(item.key, item.quantity - 1)}
                        className="px-2 py-1 text-white/80 hover:text-white cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-2 font-mono-num text-xs">{item.quantity}</span>
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

          {/* Discount Code */}
          <div>
            <label className="block text-xs text-[#C2B2A8] mb-1.5">{t.discountCode}</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="w-3.5 h-3.5 text-[#C2B2A8] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value.toUpperCase())}
                  placeholder="OSEVEN15"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm text-white font-mono-num uppercase focus:outline-none focus:border-[#7A0C1E]"
                />
              </div>
              <button
                type="button"
                onClick={handleValidateDiscount}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white cursor-pointer transition-colors"
              >
                {t.apply}
              </button>
            </div>
            {discountResult && (
              <p
                className={`text-xs mt-1.5 ${
                  discountResult.valid ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {discountResult.valid
                  ? `Applied ${discountResult.code}: -${formatEGP(discountResult.discountAmount || 0, lang)}`
                  : discountResult.error}
              </p>
            )}
          </div>

          {/* Totals Breakdown */}
          <div className="pt-4 border-t border-white/10 space-y-2.5 text-sm">
            <div className="flex justify-between text-[#C2B2A8]">
              <span>{t.subtotal}</span>
              <span className="font-mono-num text-white">{formatEGP(subtotal, lang)}</span>
            </div>
            <div className="flex justify-between text-[#C2B2A8]">
              <span>{t.shipping}</span>
              <span className="font-mono-num text-white">
                {governorate ? formatEGP(shippingCost, lang) : t.selectGovernorateHint}
              </span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>{t.discount}</span>
                <span className="font-mono-num">-{formatEGP(discountAmount, lang)}</span>
              </div>
            )}
            <div className="pt-3 border-t border-white/10 flex justify-between font-bold text-lg text-white">
              <span>{t.total}</span>
              <span className="font-mono-num">{formatEGP(total, lang)}</span>
            </div>
          </div>

          <button
            type="submit"
            form="separate-checkout-form"
            disabled={submitting}
            className="w-full py-4 rounded-xl bg-[#7A0C1E] hover:bg-[#991228] disabled:opacity-50 text-white text-sm sm:text-base font-semibold transition-colors shadow-xl cursor-pointer"
          >
            {submitting ? '...' : t.placeOrder}
          </button>
        </aside>
      </div>
    </motion.section>
  );
};