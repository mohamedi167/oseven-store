import React, { useState } from 'react';
import { Plus, Trash2, Upload, X } from 'lucide-react';
import type { Category, OutfitSlot, Product, ProductColor } from '../../types';
import { adminFetch, uploadAdminImage } from './adminApi';
import { CutoutImage } from '../CutoutImage';

interface Props {
  product: Product | null;
  categories: Category[];
  onSaved: () => void;
  onCancel: () => void;
  onCategoryCreated: (cat: Category) => void;
}

const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const SHOE_SIZES = ['39', '40', '41', '42', '43', '44', '45', '46'];

export const AdminProductEditor: React.FC<Props> = ({
  product,
  categories,
  onSaved,
  onCancel,
  onCategoryCreated,
}) => {
  const [name, setName] = useState(product?.name || '');
  const [nameAr, setNameAr] = useState(product?.nameAr || '');
  const [categoryId, setCategoryId] = useState(product?.categoryId || categories[0]?.id || '');
  const [price, setPrice] = useState(product?.price ? String(product.price) : '');
  const [oldPrice, setOldPrice] = useState(product?.oldPrice ? String(product.oldPrice) : '');
  const [description, setDescription] = useState(product?.description || '');
  const [descriptionAr, setDescriptionAr] = useState(product?.descriptionAr || '');
  const [sizeType, setSizeType] = useState<'clothing' | 'shoes' | 'one_size'>(
    product?.sizeType || 'clothing'
  );
  const [sizes, setSizes] = useState<string[]>(product?.sizes || ['S', 'M', 'L', 'XL']);
  const [customSize, setCustomSize] = useState('');
  const [stock, setStock] = useState(String(product?.stock ?? 20));
  const [images, setImages] = useState<string[]>(product?.images || []);
  const [colors, setColors] = useState<ProductColor[]>(
    product?.colors?.length
      ? product.colors
      : [{ id: 'c-primary', name: 'Black', nameAr: 'أسود', hex: '#141414', images: [] }]
  );
  const [showInStore, setShowInStore] = useState(product ? product.showInStore : true);
  const [showInHero, setShowInHero] = useState(product ? product.showInHero : false);

  // Inline create category state
  const [creatingCat, setCreatingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatNameAr, setNewCatNameAr] = useState('');
  const [newCatSlot, setNewCatSlot] = useState<OutfitSlot>('top');

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSizeTypeChange = (type: 'clothing' | 'shoes' | 'one_size') => {
    setSizeType(type);
    if (type === 'clothing') setSizes(['S', 'M', 'L', 'XL']);
    else if (type === 'shoes') setSizes(['40', '41', '42', '43', '44']);
    else setSizes(['One Size']);
  };

  const toggleSize = (sz: string) => {
    setSizes((prev) => (prev.includes(sz) ? prev.filter((s) => s !== sz) : [...prev, sz]));
  };

  const handleMainImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        const u = await uploadAdminImage(f);
        urls.push(u);
      }
      setImages((prev) => [...prev, ...urls]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleColorImageUpload = async (colorIdx: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        const u = await uploadAdminImage(f);
        urls.push(u);
      }
      setColors((prev) =>
        prev.map((c, idx) => (idx === colorIdx ? { ...c, images: [...c.images, ...urls] } : c))
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleCreateCategoryInline = async () => {
    if (!newCatName.trim()) return;
    try {
      const res = await adminFetch<{ category: Category }>('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: newCatName.trim(),
          nameAr: newCatNameAr.trim() || newCatName.trim(),
          outfitSlot: newCatSlot,
          image: images[0] || colors[0]?.images[0] || '/assets/aistudio/_______5__0f6b9b70.jpeg',
        }),
      });
      onCategoryCreated(res.category);
      setCategoryId(res.category.id);
      setCreatingCat(false);
      setNewCatName('');
      setNewCatNameAr('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !categoryId || Number(price) <= 0) {
      setError('Piece name, category, and positive price are required.');
      return;
    }

    const cleanedColors = colors
      .filter((c) => c.name.trim().length > 0)
      .map((c, idx) => ({
        ...c,
        id: c.id || `c-${Date.now()}-${idx}`,
        nameAr: c.nameAr || c.name,
      }));

    const mergedMain =
      images.length > 0 ? images : cleanedColors.flatMap((c) => c.images).slice(0, 4);

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        nameAr: nameAr.trim() || name.trim(),
        categoryId,
        price: Number(price),
        oldPrice: oldPrice ? Number(oldPrice) : null,
        description: description.trim(),
        descriptionAr: descriptionAr.trim() || description.trim(),
        sizeType,
        sizes: sizes.length > 0 ? sizes : ['M'],
        stock: Number(stock) || 0,
        images: mergedMain,
        colors: cleanedColors,
        showInStore,
        showInHero,
      };

      if (product) {
        await adminFetch(`/api/admin/products/${product.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await adminFetch('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const presetSizes = sizeType === 'shoes' ? SHOE_SIZES : sizeType === 'clothing' ? CLOTHING_SIZES : ['One Size'];

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl bg-[#1A0E0A] border border-white/15 p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <h3 className="text-lg font-bold text-white">
          {product ? `Edit Piece — ${product.name}` : 'Add New Piece'}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/15 border border-red-500/40 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-[#C2B2A8] mb-1">1. Piece Name (EN) *</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dark Red Oversized Hoodie"
            className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/15 text-sm text-white"
          />
        </div>
        <div>
          <label className="block text-xs text-[#C2B2A8] mb-1">Piece Name (Arabic)</label>
          <input
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder="هودي أوفر سايز أحمر داكن"
            className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/15 text-sm text-white"
          />
        </div>
      </div>

      {/* Category + Inline Create Category */}
      <div className="space-y-3">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs text-[#C2B2A8] mb-1">2. Category / Collection *</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#120A07] border border-white/15 text-sm text-white"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.nameAr})
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setCreatingCat((v) => !v)}
            className="px-3.5 py-2.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
          >
            + Create Category
          </button>
        </div>

        {creatingCat && (
          <div className="p-4 rounded-xl bg-black/35 border border-[#7A0C1E]/50 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-[11px] text-[#C2B2A8] mb-1">New Category Name</label>
              <input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Caps & Bags"
                className="w-full px-3 py-2 rounded bg-white/5 border border-white/15 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#C2B2A8] mb-1">Arabic Name</label>
              <input
                value={newCatNameAr}
                onChange={(e) => setNewCatNameAr(e.target.value)}
                placeholder="قبعات وحقائب"
                className="w-full px-3 py-2 rounded bg-white/5 border border-white/15 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#C2B2A8] mb-1">Outfit Builder Slot</label>
              <select
                value={newCatSlot}
                onChange={(e) => setNewCatSlot(e.target.value as OutfitSlot)}
                className="w-full px-3 py-2 rounded bg-[#120A07] border border-white/15 text-xs text-white"
              >
                <option value="top">Top / Outerwear</option>
                <option value="pants">Pants</option>
                <option value="shoes">Shoes</option>
                <option value="accessory">Accessory / Layer</option>
                <option value="none">Store Only</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleCreateCategoryInline}
              className="px-4 py-2 rounded bg-[#7A0C1E] hover:bg-[#991228] text-xs font-semibold text-white cursor-pointer"
            >
              Save Category
            </button>
          </div>
        )}
      </div>

      {/* Price, Old Price, Stock */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-[#C2B2A8] mb-1">3. Price (EGP) *</label>
          <input
            required
            type="number"
            min="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/15 text-sm text-white font-mono-num"
          />
        </div>
        <div>
          <label className="block text-xs text-[#C2B2A8] mb-1">Old Price (Optional EGP)</label>
          <input
            type="number"
            min="0"
            value={oldPrice}
            onChange={(e) => setOldPrice(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/15 text-sm text-white font-mono-num"
          />
        </div>
        <div>
          <label className="block text-xs text-[#C2B2A8] mb-1">Stock Quantity *</label>
          <input
            required
            type="number"
            min="0"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/15 text-sm text-white font-mono-num"
          />
        </div>
      </div>

      {/* Colors with per-color image upload */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs text-[#C2B2A8]">4. Colors &amp; Color-Specific Images</label>
          <button
            type="button"
            onClick={() =>
              setColors((prev) => [
                ...prev,
                { id: `c-${Date.now()}`, name: '', nameAr: '', hex: '#7A0C1E', images: [] },
              ])
            }
            className="text-xs font-semibold text-[#FF8C9E] hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add Color
          </button>
        </div>

        <div className="space-y-3">
          {colors.map((c, idx) => (
            <div
              key={c.id}
              className="rounded-xl bg-black/30 border border-white/10 p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="color"
                  value={c.hex}
                  onChange={(e) =>
                    setColors((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, hex: e.target.value } : item))
                    )
                  }
                  className="w-9 h-9 rounded cursor-pointer bg-transparent border-0"
                />
                <input
                  value={c.name}
                  onChange={(e) =>
                    setColors((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, name: e.target.value } : item))
                    )
                  }
                  placeholder="Color name (e.g. Dark Red)"
                  className="flex-1 min-w-[140px] px-3 py-2 rounded bg-white/5 border border-white/15 text-xs text-white"
                />
                <input
                  value={c.nameAr}
                  onChange={(e) =>
                    setColors((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, nameAr: e.target.value } : item))
                    )
                  }
                  placeholder="اسم اللون بالعربي"
                  className="flex-1 min-w-[140px] px-3 py-2 rounded bg-white/5 border border-white/15 text-xs text-white"
                />
                <label className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploading ? 'Uploading...' : 'Upload Image(s)'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => handleColorImageUpload(idx, e.target.files)}
                  />
                </label>
                {colors.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setColors((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-2 text-white/50 hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {c.images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {c.images.map((imgUrl, imgIdx) => (
                    <div key={`${imgUrl}-${imgIdx}`} className="relative w-16 h-16 rounded-lg bg-white/[0.04] border border-white/10 p-1">
                      <CutoutImage src={imgUrl} alt="" className="w-full h-full object-contain" />
                      <button
                        type="button"
                        onClick={() =>
                          setColors((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, images: item.images.filter((_, j) => j !== imgIdx) }
                                : item
                            )
                          )
                        }
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#7A0C1E] text-white flex items-center justify-center text-[10px]"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Sizes */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs text-[#C2B2A8]">5. Size System &amp; Available Sizes</label>
          <div className="flex items-center gap-1.5">
            {(['clothing', 'shoes', 'one_size'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => handleSizeTypeChange(st)}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                  sizeType === st ? 'bg-[#7A0C1E] text-white' : 'bg-white/5 text-[#C2B2A8]'
                }`}
              >
                {st === 'clothing' ? 'Clothing' : st === 'shoes' ? 'Shoes (EU)' : 'One Size'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {Array.from(new Set([...presetSizes, ...sizes])).map((sz) => {
            const active = sizes.includes(sz);
            return (
              <button
                key={sz}
                type="button"
                onClick={() => toggleSize(sz)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono-num font-semibold border cursor-pointer ${
                  active
                    ? 'bg-[#7A0C1E] border-[#7A0C1E] text-white'
                    : 'bg-white/5 border-white/15 text-white/60'
                }`}
              >
                {sz}
              </button>
            );
          })}
          <div className="flex items-center gap-1">
            <input
              value={customSize}
              onChange={(e) => setCustomSize(e.target.value)}
              placeholder="Custom..."
              className="w-20 px-2 py-1 rounded bg-white/5 border border-white/15 text-xs text-white"
            />
            <button
              type="button"
              onClick={() => {
                if (customSize.trim()) {
                  setSizes((p) => Array.from(new Set([...p, customSize.trim()])));
                  setCustomSize('');
                }
              }}
              className="px-2.5 py-1 rounded bg-white/10 text-xs text-white cursor-pointer"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Descriptions & Main Images */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-[#C2B2A8] mb-1">6. Description (EN)</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/15 text-sm text-white"
          />
        </div>
        <div>
          <label className="block text-xs text-[#C2B2A8] mb-1">Description (Arabic)</label>
          <textarea
            rows={3}
            value={descriptionAr}
            onChange={(e) => setDescriptionAr(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/15 text-sm text-white"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-[#C2B2A8]">
            Main Gallery Images (transparent PNG or studio shot recommended)
          </label>
          <label className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Main Image(s)</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => handleMainImageUpload(e.target.files)}
            />
          </label>
        </div>
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((url, idx) => (
              <div key={`${url}-${idx}`} className="relative w-16 h-16 rounded-lg bg-white/[0.04] border border-white/10 p-1">
                <CutoutImage src={url} alt="" className="w-full h-full object-contain" />
                <button
                  type="button"
                  onClick={() => setImages((p) => p.filter((_, i) => i !== idx))}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#7A0C1E] text-white flex items-center justify-center text-[10px]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Visibility & Hero Toggles */}
      <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-white/10">
        <label className="flex items-center gap-2.5 text-sm text-white cursor-pointer">
          <input
            type="checkbox"
            checked={showInStore}
            onChange={(e) => setShowInStore(e.target.checked)}
            className="w-4 h-4 accent-[#7A0C1E]"
          />
          <span>Show on Storefront</span>
        </label>

        <label className="flex items-center gap-2.5 text-sm text-white cursor-pointer">
          <input
            type="checkbox"
            checked={showInHero}
            onChange={(e) => setShowInHero(e.target.checked)}
            className="w-4 h-4 accent-[#7A0C1E]"
          />
          <span>Show in 3D Hero Ring</span>
        </label>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 rounded-lg border border-white/15 bg-white/5 text-sm text-white cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || uploading}
          className="px-6 py-2.5 rounded-lg bg-[#7A0C1E] hover:bg-[#991228] disabled:opacity-50 text-sm font-semibold text-white cursor-pointer"
        >
          {saving ? 'Saving...' : product ? 'Save Changes' : 'Create Piece'}
        </button>
      </div>
    </form>
  );
};
