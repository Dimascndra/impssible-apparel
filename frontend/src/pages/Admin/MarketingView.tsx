import React, { useState, useEffect } from 'react';
import { apiClient, formatRupiah, formatDate, formatDateTime } from '../../api/client';
import {
  Megaphone,
  Sparkles,
  Calendar,
  Image as ImageIcon,
  BarChart3,
  Link2,
  Plus,
  Trash2,
  CheckCircle,
  Clock,
  Send,
  Upload,
  Bot,
  Video,
  ShieldCheck
} from 'lucide-react';

export const MarketingView: React.FC = () => {
  const [subTab, setSubTab] = useState<'overview' | 'content' | 'library' | 'ads' | 'analytics' | 'connections'>('overview');
  const [summary, setSummary] = useState<any>({});
  const [posts, setPosts] = useState<any[]>([]);
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [adsList, setAdsList] = useState<any[]>([]);
  const [connections, setConnections] = useState<any>({});
  const [loading, setLoading] = useState(false);

  // AI Generator Form
  const [genProduct, setGenProduct] = useState('');
  const [genPlatform, setGenPlatform] = useState('Instagram');
  const [genTone, setGenTone] = useState('Energetic & Bold');
  const [genPrompt, setGenPrompt] = useState('');
  const [generatedResult, setGeneratedResult] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // New Post Form
  const [postTitle, setPostTitle] = useState('');
  const [postCaption, setPostCaption] = useState('');
  const [postPlatform, setPostPlatform] = useState('Instagram');
  const [postHashtags, setPostHashtags] = useState('');
  const [isSavingPost, setIsSavingPost] = useState(false);

  // New Ad Form
  const [adCampaign, setAdCampaign] = useState('');
  const [adPlatform, setAdPlatform] = useState('Meta Ads (Instagram / FB)');
  const [adBudget, setAdBudget] = useState(500000);
  const [adStart, setAdStart] = useState('');
  const [adEnd, setAdEnd] = useState('');
  const [isSavingAd, setIsSavingAd] = useState(false);

  const loadMarketingData = async () => {
    setLoading(true);
    try {
      const sumRes = await apiClient('/api/admin/marketing/summary').catch(() => ({}));
      setSummary(sumRes);
      if (sumRes.posts) setPosts(sumRes.posts);
      if (sumRes.media) setMediaList(sumRes.media);
      if (sumRes.ads) setAdsList(sumRes.ads);
      if (sumRes.connections) setConnections(sumRes.connections);
    } catch (err: any) {
      console.error('Failed to load marketing summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMarketingData();
  }, []);

  // AI Generation
  const handleGenerateCopy = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    try {
      const res = await apiClient('/api/admin/marketing/generate', {
        method: 'POST',
        body: JSON.stringify({
          product: genProduct,
          platform: genPlatform,
          tone: genTone,
          prompt: genPrompt,
        }),
      });
      setGeneratedResult(res);
      setPostTitle(`Konten ${genPlatform} - ${genProduct || 'Custom Apparel'}`);
      setPostCaption(res.caption || res.copy || '');
      setPostHashtags(res.hashtags || '#impossibleapparel #customjersey');
      setPostPlatform(genPlatform);
    } catch (err: any) {
      alert('Gagal menghasilkan AI copy: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Save Post
  const handleSavePost = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPost(true);
    try {
      await apiClient('/api/admin/marketing/posts', {
        method: 'POST',
        body: JSON.stringify({
          title: postTitle,
          caption: postCaption,
          platform: postPlatform,
          hashtags: postHashtags,
          status: 'DRAFT',
        }),
      });
      alert('Draft konten berhasil disimpan.');
      setPostTitle('');
      setPostCaption('');
      setPostHashtags('');
      setSubTab('library');
      loadMarketingData();
    } catch (err: any) {
      alert('Gagal simpan post: ' + err.message);
    } finally {
      setIsSavingPost(false);
    }
  };

  // Change Post Status
  const handleUpdatePostStatus = async (id: number, status: string) => {
    try {
      await apiClient(`/api/admin/marketing/posts/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      loadMarketingData();
    } catch (err: any) {
      alert('Gagal ubah status: ' + err.message);
    }
  };

  // Publish Post
  const handlePublishPost = async (id: number) => {
    try {
      await apiClient(`/api/admin/marketing/posts/${id}/publish`, {
        method: 'POST',
      });
      alert('Konten berhasil dipublikasikan!');
      loadMarketingData();
    } catch (err: any) {
      alert('Gagal publish: ' + err.message);
    }
  };

  // Upload Media
  const handleUploadMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      await apiClient('/api/admin/marketing/media', {
        method: 'POST',
        body: formData,
      });
      alert('Media berhasil diunggah ke pustaka.');
      loadMarketingData();
    } catch (err: any) {
      alert('Gagal upload media: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  const handleDeleteMedia = async (id: number) => {
    if (!window.confirm('Hapus media ini?')) return;
    try {
      await apiClient(`/api/admin/marketing/media/${id}`, { method: 'DELETE' });
      loadMarketingData();
    } catch (err: any) {
      alert('Gagal hapus media: ' + err.message);
    }
  };

  // Save Ad Plan
  const handleSaveAd = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAd(true);
    try {
      await apiClient('/api/admin/marketing/ads', {
        method: 'POST',
        body: JSON.stringify({
          campaign_name: adCampaign,
          platform: adPlatform,
          budget: Number(adBudget),
          start_date: adStart,
          end_date: adEnd,
        }),
      });
      alert('Rencana iklan berhasil dibuat.');
      setAdCampaign('');
      setAdBudget(500000);
      setAdStart('');
      setAdEnd('');
      loadMarketingData();
    } catch (err: any) {
      alert('Gagal simpan rencana iklan: ' + err.message);
    } finally {
      setIsSavingAd(false);
    }
  };

  // Approve Ad Plan
  const handleApproveAd = async (id: number) => {
    try {
      await apiClient(`/api/admin/marketing/ads/${id}/approve`, { method: 'POST' });
      alert('Budget rencana iklan disetujui internal.');
      loadMarketingData();
    } catch (err: any) {
      alert('Gagal approve iklan: ' + err.message);
    }
  };

  const handleDeleteAd = async (id: number) => {
    if (!window.confirm('Hapus rencana iklan ini?')) return;
    try {
      await apiClient(`/api/admin/marketing/ads/${id}`, { method: 'DELETE' });
      loadMarketingData();
    } catch (err: any) {
      alert('Gagal hapus iklan: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase text-neutral-900 tracking-tight">
            Studio Marketing & Iklan
          </h2>
          <p className="text-neutral-500 text-xs">
            Kelola pembuatan konten AI, kalender posting sosmed, approval draft, dan rencana budget iklan.
          </p>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 border-b border-neutral-200">
        {[
          { id: 'overview', label: 'Ringkasan', icon: <Megaphone className="w-3.5 h-3.5" /> },
          { id: 'content', label: 'AI Studio Konten', icon: <Sparkles className="w-3.5 h-3.5" /> },
          { id: 'library', label: 'Pustaka & Kalender', icon: <Calendar className="w-3.5 h-3.5" /> },
          { id: 'ads', label: 'Rencana Iklan', icon: <BarChart3 className="w-3.5 h-3.5" /> },
          { id: 'connections', label: 'Koneksi & Guard', icon: <Link2 className="w-3.5 h-3.5" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition ${
              subTab === tab.id
                ? 'bg-[#101011] text-white'
                : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-[#d8d5ce]'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* SubTab 1: Overview */}
      {subTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#d8d5ce] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold uppercase text-neutral-500">Total Konten</span>
              <div className="text-3xl font-black text-neutral-900 my-2">{posts.length}</div>
              <small className="text-neutral-500 text-xs">Draft & terpublikasi</small>
            </div>

            <div className="bg-white border border-[#d8d5ce] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold uppercase text-neutral-500">Perlu Review</span>
              <div className="text-3xl font-black text-amber-500 my-2">
                {posts.filter((p) => p.status === 'REVIEW').length}
              </div>
              <small className="text-neutral-500 text-xs">Menunggu persetujuan admin</small>
            </div>

            <div className="bg-white border border-[#d8d5ce] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold uppercase text-neutral-500">Rencana Iklan</span>
              <div className="text-3xl font-black text-blue-600 my-2">{adsList.length}</div>
              <small className="text-neutral-500 text-xs">Kampanye terjadwal</small>
            </div>

            <div className="bg-[#101011] text-white border border-[#222] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold uppercase text-neutral-400">Total Budget Iklan</span>
              <div className="text-2xl font-black text-[#d4af37] my-2">
                {formatRupiah(adsList.reduce((acc, a) => acc + (a.budget || 0), 0))}
              </div>
              <small className="text-neutral-400 text-xs">Rencana anggaran Meta & TikTok</small>
            </div>
          </div>

          {/* AI Guard Info */}
          <div className="bg-white border border-[#d8d5ce] rounded-2xl p-6 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-700">
                <Bot className="w-6 h-6 text-[#ff1b1b]" />
              </div>
              <div>
                <strong className="text-sm font-bold text-neutral-900 block">AI Video Budget Guard</strong>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Membatasi generate video dan estimasi kuota agar operasional marketing tetap terkontrol.
                </p>
              </div>
            </div>
            <button
              onClick={() => setSubTab('connections')}
              className="text-xs font-bold text-[#ff1b1b] hover:underline"
            >
              Atur kuota →
            </button>
          </div>
        </div>
      )}

      {/* SubTab 2: AI Content Studio */}
      {subTab === 'content' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-6 bg-white border border-[#d8d5ce] rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-black uppercase text-neutral-900 mb-1 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#ff1b1b]" />
              <span>AI Copywriting Generator</span>
            </h3>
            <p className="text-xs text-neutral-500 mb-6">
              Hasilkan caption promosi, hook video pendek, dan hashtag otomatis berbasis AI.
            </p>

            <form onSubmit={handleGenerateCopy} className="space-y-4 text-xs">
              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Produk / Topik</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Jersey Futsal Komunitas Bahan Dryfit Hexagon"
                  value={genProduct}
                  onChange={(e) => setGenProduct(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">Platform</label>
                  <select
                    value={genPlatform}
                    onChange={(e) => setGenPlatform(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl bg-white"
                  >
                    <option value="Instagram">Instagram (Feed / Reels)</option>
                    <option value="TikTok">TikTok (Short Video)</option>
                    <option value="Facebook">Facebook Page</option>
                  </select>
                </div>

                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">Tone of Voice</label>
                  <select
                    value={genTone}
                    onChange={(e) => setGenTone(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl bg-white"
                  >
                    <option value="Energetic & Bold">Energetic & Bold</option>
                    <option value="Professional & Formal">Professional & Formal</option>
                    <option value="Casual & Friendly">Casual & Friendly</option>
                    <option value="Hard Selling & Promo">Hard Selling & Promo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">
                  Instruksi Tambahan (Opsional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Contoh: Sertakan diskon 10% untuk pesanan di atas 24 pcs dan garansi warna tahan cuci..."
                  value={genPrompt}
                  onChange={(e) => setGenPrompt(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <button
                type="submit"
                disabled={isGenerating}
                className="w-full py-3 bg-[#ff1b1b] hover:bg-[#e01616] text-white font-bold uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 shadow-md shadow-[#ff1b1b]/20 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isGenerating ? 'AI Sedang Menulis...' : 'Generate Copywriting AI'}</span>
              </button>
            </form>
          </div>

          {/* Result & Save as Draft */}
          <div className="lg:col-span-6 bg-white border border-[#d8d5ce] rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-black uppercase text-neutral-900 mb-1">
              Simpan Draft Konten
            </h3>
            <p className="text-xs text-neutral-500 mb-6">
              Review hasil copywriting dan jadwalkan postingan ke kalender.
            </p>

            <form onSubmit={handleSavePost} className="space-y-4 text-xs">
              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Judul Konten</label>
                <input
                  type="text"
                  required
                  placeholder="Judul atau tema postingan"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Caption / Teks Konten</label>
                <textarea
                  rows={6}
                  required
                  placeholder="Teks caption..."
                  value={postCaption}
                  onChange={(e) => setPostCaption(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl leading-relaxed"
                />
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Hashtags</label>
                <input
                  type="text"
                  placeholder="#jerseycustom #impossibleapparel"
                  value={postHashtags}
                  onChange={(e) => setPostHashtags(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingPost || !postCaption.trim()}
                className="w-full py-3 bg-neutral-900 hover:bg-black text-white font-bold uppercase tracking-wider rounded-xl transition disabled:opacity-50"
              >
                {isSavingPost ? 'Menyimpan Draft...' : 'Simpan ke Pustaka Kalender (Draft)'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SubTab 3: Library & Calendar */}
      {subTab === 'library' && (
        <div className="space-y-8">
          {/* Media Assets Manager */}
          <div className="bg-white border border-[#d8d5ce] rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-200 mb-4">
              <div>
                <h3 className="text-sm font-black uppercase text-neutral-900">Pustaka Media Marketing</h3>
                <p className="text-xs text-neutral-400">Foto katalog & video promosi</p>
              </div>
              <label className="cursor-pointer px-4 py-2 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold uppercase transition flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                <span>Unggah Media (+)</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={handleUploadMedia}
                  className="hidden"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {mediaList.length === 0 ? (
                <div className="col-span-full p-8 text-center text-xs text-neutral-400">
                  Belum ada media diunggah.
                </div>
              ) : (
                mediaList.map((m) => (
                  <div key={m.id} className="relative group rounded-xl overflow-hidden bg-neutral-100 aspect-square border border-neutral-200">
                    <img
                      src={`/api/admin/marketing/media/${m.id}/file`}
                      alt="Media"
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => handleDeleteMedia(m.id)}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 text-red-400 hover:text-white opacity-0 group-hover:opacity-100 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Posts Approval & Status Pipeline */}
          <div className="bg-white border border-[#d8d5ce] rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-black uppercase text-neutral-900 pb-4 border-b border-neutral-200 mb-4">
              Daftar Konten & Alur Approval ({posts.length})
            </h3>

            <div className="space-y-4">
              {posts.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-400">
                  Belum ada konten dijadwalkan.
                </div>
              ) : (
                posts.map((post) => (
                  <div key={post.id} className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 text-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div>
                        <strong className="text-sm font-bold text-neutral-900">{post.title}</strong>
                        <span className="text-neutral-500 ml-2">Platform: {post.platform}</span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] bg-neutral-200 text-neutral-700">
                        {post.status}
                      </span>
                    </div>

                    <p className="text-neutral-700 leading-relaxed my-2 line-clamp-3">
                      {post.caption}
                    </p>

                    <div className="pt-3 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-[11px] text-neutral-400">{post.hashtags}</span>

                      <div className="flex items-center gap-2">
                        {post.status === 'DRAFT' && (
                          <button
                            onClick={() => handleUpdatePostStatus(post.id, 'REVIEW')}
                            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold"
                          >
                            Ajukan Review
                          </button>
                        )}
                        {post.status === 'REVIEW' && (
                          <button
                            onClick={() => handleUpdatePostStatus(post.id, 'APPROVED')}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold"
                          >
                            Approve
                          </button>
                        )}
                        {post.status === 'APPROVED' && (
                          <button
                            onClick={() => handlePublishPost(post.id)}
                            className="px-3 py-1.5 rounded-lg bg-[#13a45a] hover:bg-emerald-600 text-white font-bold"
                          >
                            Publish Sekarang
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SubTab 4: Ads Planner */}
      {subTab === 'ads' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 bg-white border border-[#d8d5ce] rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-black uppercase text-neutral-900 mb-1">
              Rencana Budget Iklan Baru
            </h3>
            <p className="text-xs text-neutral-500 mb-6">
              Rencanakan kampanye Meta atau TikTok Ads dengan persetujuan internal.
            </p>

            <form onSubmit={handleSaveAd} className="space-y-4 text-xs">
              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Nama Kampanye</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Promo Jersey Turnamen Ramadhan"
                  value={adCampaign}
                  onChange={(e) => setAdCampaign(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Platform Iklan</label>
                <select
                  value={adPlatform}
                  onChange={(e) => setAdPlatform(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl bg-white"
                >
                  <option value="Meta Ads (Instagram / FB)">Meta Ads (Instagram / FB)</option>
                  <option value="TikTok Ads">TikTok Ads</option>
                  <option value="Google Ads">Google Ads</option>
                </select>
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Anggaran Budget (Rp)</label>
                <input
                  type="number"
                  min="50000"
                  step="50000"
                  required
                  value={adBudget}
                  onChange={(e) => setAdBudget(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">Tanggal Mulai</label>
                  <input
                    type="date"
                    required
                    value={adStart}
                    onChange={(e) => setAdStart(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">Tanggal Selesai</label>
                  <input
                    type="date"
                    required
                    value={adEnd}
                    onChange={(e) => setAdEnd(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSavingAd}
                className="w-full py-3 bg-[#ff1b1b] hover:bg-[#e01616] text-white font-bold uppercase tracking-wider rounded-xl transition shadow-md shadow-[#ff1b1b]/20 disabled:opacity-50"
              >
                {isSavingAd ? 'Menyimpan...' : 'Simpan Rencana Iklan'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-[#d8d5ce] rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-black uppercase text-neutral-900 pb-4 border-b border-neutral-200 mb-4">
              Daftar Rencana Iklan ({adsList.length})
            </h3>

            <div className="space-y-3">
              {adsList.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-400">
                  Belum ada rencana iklan tercatat.
                </div>
              ) : (
                adsList.map((ad) => (
                  <div key={ad.id} className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 text-xs">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <strong className="text-sm font-bold text-neutral-900 block">{ad.campaign_name}</strong>
                        <span className="text-neutral-500">{ad.platform} · {ad.start_date} s/d {ad.end_date}</span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] bg-neutral-200 text-neutral-700">
                        {ad.status}
                      </span>
                    </div>

                    <div className="p-2.5 bg-white rounded-lg border border-neutral-200 flex items-center justify-between">
                      <span className="font-bold text-neutral-800">Budget: {formatRupiah(ad.budget)}</span>
                      <div className="flex items-center gap-2">
                        {ad.status === 'DRAFT' && (
                          <button
                            onClick={() => handleApproveAd(ad.id)}
                            className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px]"
                          >
                            Setujui Budget
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteAd(ad.id)}
                          className="p-1 rounded text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SubTab 5: Connections & Guard */}
      {subTab === 'connections' && (
        <div className="bg-white border border-[#d8d5ce] rounded-2xl p-6 shadow-sm space-y-6">
          <h3 className="text-base font-black uppercase text-neutral-900 pb-2 border-b border-neutral-200">
            Koneksi Platform Sosmed & Batasan Kuota AI
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-xl border border-neutral-200 bg-neutral-50 text-xs space-y-3">
              <strong className="text-sm font-bold text-neutral-900 block">Instagram Graph API</strong>
              <p className="text-neutral-500">Status: <span className="text-[#13a45a] font-bold">Siap Konfigurasi</span></p>
              <input
                type="text"
                placeholder="Instagram Access Token"
                defaultValue={connections?.instagram?.token || ''}
                className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg"
              />
            </div>

            <div className="p-5 rounded-xl border border-neutral-200 bg-neutral-50 text-xs space-y-3">
              <strong className="text-sm font-bold text-neutral-900 block">TikTok Content API</strong>
              <p className="text-neutral-500">Status: <span className="text-[#13a45a] font-bold">Siap Konfigurasi</span></p>
              <input
                type="text"
                placeholder="TikTok Client Key"
                defaultValue={connections?.tiktok?.key || ''}
                className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg"
              />
            </div>

            <div className="p-5 rounded-xl border border-neutral-200 bg-neutral-50 text-xs space-y-3">
              <strong className="text-sm font-bold text-neutral-900 block">AI Video Guard (Veo)</strong>
              <p className="text-neutral-500">Batas generate video per bulan</p>
              <input
                type="number"
                defaultValue={15}
                className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
