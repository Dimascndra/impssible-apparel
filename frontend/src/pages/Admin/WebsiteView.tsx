import React, { useState, useEffect } from 'react';
import { apiClient, formatRupiah } from '../../api/client';
import { WebsiteSettings, CatalogProduct } from '../../types';
import {
  Globe,
  Upload,
  Trash2,
  Plus,
  Edit2,
  X,
  ExternalLink,
  Layers,
  Image as ImageIcon,
  CheckCircle2
} from 'lucide-react';

export const WebsiteView: React.FC = () => {
  const [settings, setSettings] = useState<WebsiteSettings>({});
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states for general settings
  const [brandName, setBrandName] = useState('');
  const [heroTitle, setHeroTitle] = useState('');
  const [heroText, setHeroText] = useState('');
  const [catalogTitle, setCatalogTitle] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [address, setAddress] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Catalog Product Modal
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('Jersey');
  const [prodPrice, setProdPrice] = useState(110000);
  const [prodDesc, setProdDesc] = useState('');
  const [prodPublished, setProdPublished] = useState(true);
  const [prodFiles, setProdFiles] = useState<FileList | null>(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const setRes = await apiClient<{ settings: WebsiteSettings }>('/api/admin/website/settings');
      if (setRes.settings) {
        setSettings(setRes.settings);
        setBrandName(setRes.settings.brand_name || 'IMPOSSIBLE APPAREL');
        setHeroTitle(setRes.settings.hero_title || 'CUSTOM APPAREL, BUILT FOR YOUR IDENTITY.');
        setHeroText(setRes.settings.hero_text || 'Jersey, apparel, dan kebutuhan custom yang diproduksi dengan detail dari desain hingga selesai.');
        setCatalogTitle(setRes.settings.catalog_title || 'Katalog Impossible');
        setWhatsapp(setRes.settings.whatsapp || '');
        setAddress(setRes.settings.address || '');
      }

      const catRes = await apiClient<{ products: CatalogProduct[] }>('/api/admin/catalog');
      if (catRes.products) setCatalog(catRes.products);
    } catch (err: any) {
      console.error('Failed to load website settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Save General Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const formData = new FormData();
      formData.append('brand_name', brandName);
      formData.append('hero_title', heroTitle);
      formData.append('hero_text', heroText);
      formData.append('catalog_title', catalogTitle);
      formData.append('whatsapp', whatsapp);
      formData.append('address', address);

      await apiClient('/api/admin/website/settings', {
        method: 'PUT',
        body: formData,
      });
      alert('Pengaturan website berhasil disimpan.');
      loadData();
    } catch (err: any) {
      alert('Gagal simpan pengaturan: ' + err.message);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Upload Header Media Slider
  const handleUploadHeaderMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      await apiClient('/api/admin/website/header-media', {
        method: 'POST',
        body: formData,
      });
      alert('Media header berhasil diunggah.');
      loadData();
    } catch (err: any) {
      alert('Gagal upload media header: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  const handleDeleteHeaderMedia = async (id: number) => {
    if (!window.confirm('Hapus slide media header ini?')) return;
    try {
      await apiClient(`/api/admin/website/header-media/${id}`, { method: 'DELETE' });
      loadData();
    } catch (err: any) {
      alert('Gagal hapus media header: ' + err.message);
    }
  };

  // Catalog Products Actions
  const handleOpenProductModal = (prod?: CatalogProduct) => {
    if (prod) {
      setEditingProduct(prod);
      setProdName(prod.name);
      setProdCategory(prod.category);
      setProdPrice(prod.price);
      setProdDesc(prod.description || '');
      setProdPublished(prod.is_published ?? (prod.status === 'PUBLISH'));
    } else {
      setEditingProduct(null);
      setProdName('');
      setProdCategory('Jersey');
      setProdPrice(110000);
      setProdDesc('');
      setProdPublished(true);
    }
    setProdFiles(null);
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProduct(true);
    try {
      const formData = new FormData();
      formData.append('name', prodName);
      formData.append('category', prodCategory);
      formData.append('price', String(prodPrice));
      formData.append('description', prodDesc);
      formData.append('is_published', String(prodPublished));

      if (prodFiles) {
        for (let i = 0; i < prodFiles.length; i++) {
          formData.append('files', prodFiles[i]);
        }
      }

      if (editingProduct) {
        await apiClient(`/api/admin/catalog/${editingProduct.id}`, {
          method: 'PUT',
          body: formData,
        });
        alert('Produk katalog berhasil diperbarui.');
      } else {
        await apiClient('/api/admin/catalog', {
          method: 'POST',
          body: formData,
        });
        alert('Produk katalog berhasil ditambahkan.');
      }
      setProductModalOpen(false);
      loadData();
    } catch (err: any) {
      alert('Gagal simpan produk: ' + err.message);
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleDeleteProduct = async (id: number, name: string) => {
    if (!window.confirm(`Hapus produk "${name}" dari katalog?`)) return;
    try {
      await apiClient(`/api/admin/catalog/${id}`, { method: 'DELETE' });
      alert('Produk berhasil dihapus.');
      loadData();
    } catch (err: any) {
      alert('Gagal hapus: ' + err.message);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase text-neutral-900 tracking-tight">
            Pengaturan Website Publik
          </h2>
          <p className="text-neutral-500 text-xs">
            Atur konten landing page, slider header, dan katalog produk yang tampil untuk publik.
          </p>
        </div>

        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition"
        >
          <ExternalLink className="w-4 h-4" />
          <span>Lihat Website Publik</span>
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: General Settings & Header Slider */}
        <div className="lg:col-span-5 space-y-6">
          {/* General Form */}
          <div className="bg-white border border-[#d8d5ce] rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-black uppercase text-neutral-900 pb-3 border-b border-neutral-200 mb-4">
              Informasi & Teks Banner
            </h3>

            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Nama Brand</label>
                <input
                  type="text"
                  required
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Judul Hero (Headline)</label>
                <input
                  type="text"
                  required
                  value={heroTitle}
                  onChange={(e) => setHeroTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Subjudul Hero</label>
                <textarea
                  rows={2}
                  value={heroText}
                  onChange={(e) => setHeroText(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Nomor WhatsApp Admin</label>
                <input
                  type="text"
                  placeholder="081222333444"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Alamat Workshop</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingSettings}
                className="w-full py-2.5 rounded-xl bg-[#ff1b1b] hover:bg-[#e01616] text-white font-bold uppercase tracking-wider transition disabled:opacity-50"
              >
                {isSavingSettings ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </button>
            </form>
          </div>

          {/* Header Media Slider */}
          <div className="bg-white border border-[#d8d5ce] rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 mb-4">
              <h3 className="text-sm font-black uppercase text-neutral-900">
                Slider Media Header
              </h3>
              <label className="cursor-pointer text-xs font-bold text-[#ff1b1b] hover:underline flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Media (+)</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={handleUploadHeaderMedia}
                  className="hidden"
                />
              </label>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {settings.header_media && settings.header_media.length > 0 ? (
                settings.header_media.map((media) => (
                  <div key={media.id} className="relative group rounded-xl overflow-hidden aspect-video bg-neutral-100 border border-neutral-200">
                    <img src={media.url} alt="Slider" className="w-full h-full object-cover" />
                    <button
                      onClick={() => handleDeleteHeaderMedia(media.id)}
                      className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/70 text-red-400 hover:text-white opacity-0 group-hover:opacity-100 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="col-span-full p-6 text-center text-xs text-neutral-400">
                  Belum ada slide media ditambahkan.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Catalog Products Manager */}
        <div className="lg:col-span-7 bg-white border border-[#d8d5ce] rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-neutral-200">
            <div>
              <h3 className="text-sm font-black uppercase text-neutral-900">
                Daftar Produk Katalog ({catalog.length})
              </h3>
              <p className="text-xs text-neutral-400">Produk yang tampil di etalase landing page</p>
            </div>

            <button
              onClick={() => handleOpenProductModal()}
              className="px-4 py-2 rounded-xl bg-[#ff1b1b] hover:bg-[#e01616] text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-[#ff1b1b]/20 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Tambah Produk</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto">
            {catalog.length === 0 ? (
              <div className="col-span-full p-12 text-center text-xs text-neutral-400">
                Belum ada produk di katalog.
              </div>
            ) : (
              catalog.map((prod) => {
                const primaryImg = prod.media?.[0]?.url;
                return (
                  <div key={prod.id} className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 flex flex-col justify-between text-xs">
                    <div>
                      <div className="aspect-video rounded-lg overflow-hidden bg-neutral-200 mb-2 relative">
                        {primaryImg ? (
                          <img src={primaryImg} alt={prod.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-400">
                            <ImageIcon className="w-8 h-8" />
                          </div>
                        )}
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 text-white text-[9px] font-bold uppercase">
                          {prod.category}
                        </span>
                      </div>

                      <strong className="text-sm font-bold text-neutral-900 block truncate">{prod.name}</strong>
                      <span className="text-[#d4af37] font-bold block mt-0.5">{formatRupiah(prod.price)}</span>
                    </div>

                    <div className="pt-3 border-t border-neutral-200 mt-2 flex items-center justify-between">
                      <span className={`text-[10px] font-bold ${prod.is_published ? 'text-emerald-700' : 'text-neutral-400'}`}>
                        {prod.is_published ? '● Published' : '○ Draft'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenProductModal(prod)}
                          className="p-1.5 rounded-lg hover:bg-neutral-200 text-neutral-600"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(prod.id, prod.name)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal: Tambah/Edit Produk Katalog */}
      {productModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <button
              onClick={() => setProductModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black uppercase text-neutral-900 mb-1">
              {editingProduct ? 'Edit Produk Katalog' : 'Tambah Produk Baru'}
            </h3>
            <p className="text-xs text-neutral-500 mb-6">
              Produk akan langsung terlihat oleh customer pada halaman katalog.
            </p>

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Nama Produk</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Jersey Futsal Hexagon Premium"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">Kategori</label>
                  <select
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl bg-white"
                  >
                    <option value="Jersey">Jersey</option>
                    <option value="Polo">Polo</option>
                    <option value="Hoodie">Hoodie / Jaket</option>
                    <option value="Merchandise">Merchandise</option>
                  </select>
                </div>

                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">Harga Mulai (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={prodPrice}
                    onChange={(e) => setProdPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Deskripsi Spesifikasi</label>
                <textarea
                  rows={3}
                  placeholder="Kain dryfit premium, anti luntur, garansi jahitan..."
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Foto Produk</label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => setProdFiles(e.target.files)}
                  className="w-full text-xs text-neutral-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="prodPublished"
                  checked={prodPublished}
                  onChange={(e) => setProdPublished(e.target.checked)}
                  className="w-4 h-4 rounded text-[#ff1b1b]"
                />
                <label htmlFor="prodPublished" className="font-bold text-neutral-700 cursor-pointer">
                  Terbitkan di Website (Publish Langsung)
                </label>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-100 text-neutral-700 font-bold uppercase"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingProduct}
                  className="px-5 py-2 rounded-xl bg-[#ff1b1b] hover:bg-[#e01616] text-white font-bold uppercase disabled:opacity-50"
                >
                  {isSavingProduct ? 'Menyimpan...' : 'Simpan Produk'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
