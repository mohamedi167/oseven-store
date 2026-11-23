import { OfferTimer, Product } from '../types';

export interface EffectivePriceResult {
  finalPrice: number;
  originalPrice: number;
  isOnOffer: boolean;
  offerTitle?: string;
  offerTitleAr?: string;
  offerEndAt?: string;
}

export function isOfferActiveNow(offer: OfferTimer, nowMs: number = Date.now()): boolean {
  if (!offer.active) return false;
  const start = new Date(offer.startAt).getTime();
  const end = new Date(offer.endAt).getTime();
  return !Number.isNaN(start) && !Number.isNaN(end) && nowMs >= start && nowMs <= end;
}

export function getEffectivePrice(
  product: Pick<Product, 'id' | 'price' | 'oldPrice'>,
  activeOffers: OfferTimer[],
  nowMs: number = Date.now()
): EffectivePriceResult {
  let bestPrice = product.price;
  let originalPrice = product.oldPrice && product.oldPrice > product.price ? product.oldPrice : product.price;
  let matchedOffer: OfferTimer | undefined;

  for (const offer of activeOffers) {
    if (!isOfferActiveNow(offer, nowMs)) continue;
    if (!offer.productIds.includes(product.id)) continue;

    let discounted = product.price;
    if (offer.discountType === 'percentage') {
      discounted = Math.max(1, Math.round(product.price * (1 - offer.discountValue / 100)));
    } else {
      discounted = Math.max(1, Math.round(product.price - offer.discountValue));
    }

    if (discounted < bestPrice) {
      bestPrice = discounted;
      originalPrice = product.price;
      matchedOffer = offer;
    }
  }

  return {
    finalPrice: bestPrice,
    originalPrice,
    isOnOffer: Boolean(matchedOffer) || (product.oldPrice !== null && product.oldPrice > product.price),
    offerTitle: matchedOffer?.title,
    offerTitleAr: matchedOffer?.titleAr,
    offerEndAt: matchedOffer?.endAt,
  };
}

export function formatEGP(amount: number, lang: 'en' | 'ar' = 'en'): string {
  const formatted = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US').format(Math.round(amount));
  return lang === 'ar' ? `${formatted} ج.م` : `${formatted} EGP`;
}
