export type Language = 'en' | 'ar';

export type OutfitSlot = 'top' | 'pants' | 'shoes' | 'accessory' | 'none';

export interface Category {
  id: string;
  name: string;
  nameAr: string;
  slug: string;
  image: string;
  sortOrder: number;
  outfitSlot: OutfitSlot;
}

export interface ProductColor {
  id: string;
  name: string;
  nameAr: string;
  hex: string;
  images: string[];
}

export interface Product {
  id: string;
  name: string;
  nameAr: string;
  slug: string;
  categoryId: string;
  price: number;
  oldPrice: number | null;
  description: string;
  descriptionAr: string;
  sizeType: 'clothing' | 'shoes' | 'one_size';
  sizes: string[];
  stock: number;
  images: string[];
  colors: ProductColor[];
  showInStore: boolean;
  showInHero: boolean;
  createdAt: string;
}

export interface OfferTimer {
  id: string;
  title: string;
  titleAr: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  productIds: string[];
  startAt: string;
  endAt: string;
  active: boolean;
}

export interface DiscountCode {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  expiryDate: string | null;
  usageLimit: number | null;
  usedCount: number;
  minOrder: number;
  active: boolean;
}

export interface ShippingZone {
  id: string;
  name: string;
  nameAr: string;
  price: number;
  governorates: string[];
}

export interface FeaturedOutfit {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  topId: string | null;
  topColor: string | null;
  pantsId: string | null;
  pantsColor: string | null;
  shoesId: string | null;
  shoesColor: string | null;
  accessoryId: string | null;
  accessoryColor: string | null;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  originalPrice: number;
  quantity: number;
  size: string;
  colorName: string;
  colorHex: string;
  image: string;
}

export type OrderStatus = 'New' | 'Confirmed' | 'Shipped' | 'Delivered' | 'Cancelled';

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  governorate: string;
  address: string;
  notes: string;
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  discountCode: string | null;
  discountAmount: number;
  total: number;
  status: OrderStatus;
  createdAt: string;
}

export interface CartItem {
  key: string;
  productId: string;
  name: string;
  nameAr: string;
  colorId: string;
  colorName: string;
  colorNameAr: string;
  colorHex: string;
  size: string;
  quantity: number;
  image: string;
}

export interface LoginLog {
  id: string;
  timestamp: string;
  ip: string;
  success: boolean;
  reason: string;
}

export interface StoreBootstrap {
  categories: Category[];
  products: Product[];
  activeOffers: OfferTimer[];
  shippingZones: ShippingZone[];
  featuredOutfits: FeaturedOutfit[];
}

export interface AdminStats {
  ordersToday: number;
  revenueToday: number;
  totalRevenue: number;
  totalOrders: number;
  pendingOrders: number;
  topProducts: { productId: string; name: string; sold: number; revenue: number }[];
  lowStockCount: number;
}
