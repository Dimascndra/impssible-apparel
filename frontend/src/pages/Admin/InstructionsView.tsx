import React, { useState, useEffect, useRef } from 'react';
import { apiClient, formatRupiah, formatDate, formatDateTime } from '../../api/client';
import { Job, OrderType, JobMessage } from '../../types';
import {
  Plus,
  Search,
  Upload,
  MessageSquare,
  KeyRound,
  ShieldAlert,
  Send,
  X,
  FileCode,
  Eye,
  FileText,
  Clock,
  CheckCircle,
  Copy,
  ExternalLink,
  DollarSign
} from 'lucide-react';

interface InstructionsViewProps {
  jobs: Job[];
  orderTypes: OrderType[];
  selectedJob: Job | null;
  onSelectJob: (job: Job | null) => void;
  onRefreshJobs: () => void;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
}

export const InstructionsView: React.FC<InstructionsViewProps> = ({
  jobs,
  orderTypes,
  selectedJob,
  onSelectJob,
  onRefreshJobs,
  isCreateModalOpen,
  setIsCreateModalOpen,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('SEMUA');

  // New SPK form state
  const [newCustomer, setNewCustomer] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newProduct, setNewProduct] = useState('');
  const [newQty, setNewQty] = useState(12);
  const [newOrderTypeId, setNewOrderTypeId] = useState<number | ''>('');
  const [newHppUnit, setNewHppUnit] = useState(0);
  const [newDeadline, setNewDeadline] = useState('');
  const [newPriority, setNewPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL');
  const [newNote, setNewNote] = useState('');
  const [newFiles, setNewFiles] = useState<FileList | null>(null);
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  // Edit job state
  const [editStatus, setEditStatus] = useState<string>('');
  const [editPriority, setEditPriority] = useState<string>('');
  const [editDesigner, setEditDesigner] = useState('');
  const [editComputer, setEditComputer] = useState('');
  const [isUpdatingJob, setIsUpdatingJob] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<JobMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Sync edit form when selectedJob changes
  useEffect(() => {
    if (selectedJob) {
      setEditStatus(selectedJob.status);
      setEditPriority(selectedJob.priority);
      setEditDesigner(selectedJob.designer || '');
      setEditComputer(selectedJob.computer || '');
    }
  }, [selectedJob]);

  // Chat poller for selected job
  useEffect(() => {
    if (!selectedJob) return;

    let active = true;
    const loadChat = async () => {
      try {
        const data = await apiClient<{ messages: JobMessage[] }>(
          `/api/admin/jobs/${selectedJob.id}/messages`
        );
        if (active) {
          setMessages(data.messages || []);
        }
      } catch {
        // Retry
      }
    };

    loadChat();
    const interval = setInterval(loadChat, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedJob]);

  // Handle Order Type Change in New SPK
  const handleOrderTypeSelect = (idStr: string) => {
    if (!idStr) {
      setNewOrderTypeId('');
      return;
    }
    const otId = Number(idStr);
    setNewOrderTypeId(otId);
    const found = orderTypes.find((ot) => ot.id === otId);
    if (found) {
      if (!newProduct) setNewProduct(found.name);
      if (found.total_hpp) setNewHppUnit(found.total_hpp);
    }
  };

  // Submit New SPK
  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingNew(true);

    try {
      const formData = new FormData();
      formData.append('customer', newCustomer);
      formData.append('customer_phone', newPhone);
      formData.append('product', newProduct);
      formData.append('qty', String(newQty));
      formData.append('hpp_unit', String(newHppUnit));
      formData.append('deadline', newDeadline);
      formData.append('priority', newPriority);
      formData.append('note', newNote);
      if (newOrderTypeId) {
        formData.append('order_type_id', String(newOrderTypeId));
      }

      if (newFiles) {
        for (let i = 0; i < newFiles.length; i++) {
          formData.append('files', newFiles[i]);
        }
      }

      const res = await apiClient<{ job: Job }>('/api/admin/jobs', {
        method: 'POST',
        body: formData,
      });

      alert(`SPK ${res.job.spk} berhasil dibuat!`);
      setIsCreateModalOpen(false);
      // Reset form
      setNewCustomer('');
      setNewPhone('');
      setNewProduct('');
      setNewQty(12);
      setNewHppUnit(0);
      setNewDeadline('');
      setNewNote('');
      setNewFiles(null);

      onRefreshJobs();
      if (res.job) onSelectJob(res.job);
    } catch (err: any) {
      alert('Gagal membuat SPK: ' + err.message);
    } finally {
      setIsSubmittingNew(false);
    }
  };

  // Update Job Status / PIC
  const handleUpdateJob = async () => {
    if (!selectedJob) return;
    setIsUpdatingJob(true);

    try {
      await apiClient(`/api/admin/jobs/${selectedJob.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: editStatus,
          priority: editPriority,
          designer: editDesigner,
          computer: editComputer,
        }),
      });
      alert('Perubahan SPK berhasil disimpan.');
      onRefreshJobs();
    } catch (err: any) {
      alert('Gagal update SPK: ' + err.message);
    } finally {
      setIsUpdatingJob(false);
    }
  };

  // Regenerate Customer Code
  const handleRegenerateCode = async () => {
    if (!selectedJob) return;
    if (!window.confirm('Buat ulang kode akses customer baru untuk SPK ini? Kode lama tidak akan berlaku lagi.')) {
      return;
    }

    try {
      const data = await apiClient<{ customer_code: string }>(
        `/api/admin/jobs/${selectedJob.id}/customer-code`,
        { method: 'POST' }
      );
      alert(`Kode akses baru customer: ${data.customer_code}`);
      onRefreshJobs();
      onSelectJob({ ...selectedJob, customer_code: data.customer_code });
    } catch (err: any) {
      alert('Gagal buat kode customer: ' + err.message);
    }
  };

  // Upload Reference File
  const handleUploadReference = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedJob) return;

    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      await apiClient(`/api/admin/jobs/${selectedJob.id}/upload/reference`, {
        method: 'POST',
        body: formData,
      });
      alert('File referensi berhasil ditambahkan.');
      onRefreshJobs();
    } catch (err: any) {
      alert('Gagal upload referensi: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  // Send Message as Instruksi
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !selectedJob) return;

    setIsSendingChat(true);
    try {
      await apiClient(`/api/admin/jobs/${selectedJob.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: chatInput.trim() }),
      });
      setChatInput('');
      const data = await apiClient<{ messages: JobMessage[] }>(
        `/api/admin/jobs/${selectedJob.id}/messages`
      );
      setMessages(data.messages || []);
    } catch (err: any) {
      alert('Gagal kirim pesan: ' + err.message);
    } finally {
      setIsSendingChat(false);
    }
  };

  const filteredJobs = jobs.filter((j) => {
    const matchStatus = statusFilter === 'SEMUA' || j.status === statusFilter;
    const matchSearch =
      !searchQuery ||
      j.spk.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.product.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Action & Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase text-neutral-900 tracking-tight">
            Instruksi Desain & SPK
          </h2>
          <p className="text-neutral-500 text-xs">
            Buat brief produksi, unggah referensi, dan pantau pengerjaan tim desain.
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-5 py-3 rounded-xl bg-[#ff1b1b] hover:bg-[#e01616] text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-[#ff1b1b]/20 transition"
        >
          <Plus className="w-4 h-4" />
          <span>+ Instruksi Baru</span>
        </button>
      </div>

      {/* Main Grid: Left SPK List, Right SPK Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Jobs Queue */}
        <div className="lg:col-span-5 bg-white border border-[#d8d5ce] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
            <h3 className="text-xs font-black uppercase tracking-wider text-neutral-900">
              Antrean SPK ({filteredJobs.length})
            </h3>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1 bg-neutral-100 border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-700"
            >
              <option value="SEMUA">Semua Status</option>
              <option value="MENUNGGU">MENUNGGU</option>
              <option value="PROSES">PROSES</option>
              <option value="REVISI">REVISI</option>
              <option value="SELESAI">SELESAI</option>
            </select>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Cari SPK, customer, produk..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-[#ff1b1b]"
            />
          </div>

          {/* Jobs List */}
          <div className="space-y-2.5 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
            {filteredJobs.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-400">
                Tidak ada data SPK yang sesuai.
              </div>
            ) : (
              filteredJobs.map((job) => {
                const isSelected = selectedJob?.id === job.id;
                return (
                  <div
                    key={job.id}
                    onClick={() => onSelectJob(job)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? 'bg-[#101011] text-white border-[#101011] shadow-md'
                        : 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <strong className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-neutral-900'}`}>
                        {job.spk}
                      </strong>
                      <div className="flex items-center gap-1.5">
                        {job.priority === 'URGENT' && (
                          <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-black uppercase">
                            URGENT
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isSelected
                              ? 'bg-[#222] text-neutral-300'
                              : 'bg-neutral-200 text-neutral-700'
                          }`}
                        >
                          {job.status}
                        </span>
                      </div>
                    </div>

                    <div className={`text-xs font-semibold truncate ${isSelected ? 'text-neutral-200' : 'text-neutral-800'}`}>
                      {job.product}
                    </div>

                    <div className={`text-[11px] mt-1 flex items-center justify-between ${isSelected ? 'text-neutral-400' : 'text-neutral-500'}`}>
                      <span>{job.customer} · {job.qty} pcs</span>
                      <span>{job.deadline ? `DL: ${job.deadline}` : '—'}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: SPK Detail & Operations */}
        <div className="lg:col-span-7 bg-white border border-[#d8d5ce] rounded-2xl p-6 shadow-sm min-h-[500px]">
          {!selectedJob ? (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center text-neutral-400">
              <FileText className="w-12 h-12 text-neutral-300 mb-3" />
              <strong className="text-sm text-neutral-700 block">Pilih SPK dari antrean</strong>
              <p className="text-xs mt-1">Detail instruksi, HPP, kode akses customer, dan chat akan tampil di sini.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-neutral-200 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-black uppercase text-neutral-900">{selectedJob.spk}</h3>
                    {selectedJob.priority === 'URGENT' && (
                      <span className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-black uppercase">
                        URGENT
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Customer: <strong className="text-neutral-800">{selectedJob.customer}</strong> · Produk: {selectedJob.product} ({selectedJob.qty} pcs)
                  </p>
                </div>

                {/* Customer Code Box */}
                <div className="p-2.5 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center gap-3">
                  <div>
                    <span className="text-[9px] uppercase font-bold text-neutral-500 block">Kode Customer</span>
                    <strong className="font-mono text-xs tracking-widest text-neutral-900">
                      {selectedJob.customer_code || 'BELUM DIBUAT'}
                    </strong>
                  </div>
                  <button
                    onClick={handleRegenerateCode}
                    className="p-1.5 rounded-lg bg-white hover:bg-neutral-200 border border-neutral-300 text-neutral-700"
                    title="Buat ulang kode akses"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-[#ff1b1b]" />
                  </button>
                </div>
              </div>

              {/* HPP Breakdown (Admin Confidential Feature) */}
              <div className="p-4 rounded-xl bg-[#101011] text-white border border-[#222]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#d4af37] flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Rincian HPP (Harga Pokok Produksi) - Rahasia Admin</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-neutral-400 block text-[11px]">HPP per Unit / Pcs:</span>
                    <strong className="text-base font-bold text-white">
                      {formatRupiah(selectedJob.hpp_unit || 0)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[11px]">Total Anggaran HPP ({selectedJob.qty} pcs):</span>
                    <strong className="text-base font-bold text-[#d4af37]">
                      {formatRupiah((selectedJob.hpp_unit || 0) * (selectedJob.qty || 1))}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Brief & Notes */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-1.5">
                  Catatan Instruksi Desain
                </h4>
                <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 text-xs text-neutral-800 leading-relaxed">
                  {selectedJob.note || 'Tidak ada catatan brief.'}
                </div>
              </div>

              {/* Status & PIC Controls */}
              <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-700 mb-3">
                  Status Pengerjaan & Tim Desain
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase mb-1">Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs"
                    >
                      <option value="MENUNGGU">MENUNGGU</option>
                      <option value="PROSES">PROSES</option>
                      <option value="REVISI">REVISI</option>
                      <option value="SELESAI">SELESAI</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase mb-1">Prioritas</label>
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs"
                    >
                      <option value="NORMAL">NORMAL</option>
                      <option value="URGENT">URGENT</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase mb-1">PIC Desain</label>
                    <input
                      type="text"
                      value={editDesigner}
                      onChange={(e) => setEditDesigner(e.target.value)}
                      placeholder="Nama desainer"
                      className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase mb-1">Komputer</label>
                    <input
                      type="text"
                      value={editComputer}
                      onChange={(e) => setEditComputer(e.target.value)}
                      placeholder="PC-DESAIN-01"
                      className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    onClick={handleUpdateJob}
                    disabled={isUpdatingJob}
                    className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold uppercase tracking-wider transition"
                  >
                    {isUpdatingJob ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </button>
                </div>
              </div>

              {/* Attachments Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-700">
                    Berkas & Lampiran SPK
                  </h4>
                  <label className="cursor-pointer text-xs font-bold text-[#ff1b1b] hover:underline flex items-center gap-1">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Tambah Referensi (+)</span>
                    <input
                      type="file"
                      multiple
                      onChange={handleUploadReference}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedJob.attachments && selectedJob.attachments.length > 0 ? (
                    selectedJob.attachments.map((att) => (
                      <div
                        key={att.id}
                        className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2 truncate mr-2">
                          {att.kind === 'cdr' ? (
                            <FileCode className="w-4 h-4 text-[#13a45a] shrink-0" />
                          ) : att.kind === 'preview' ? (
                            <Eye className="w-4 h-4 text-blue-500 shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-neutral-500 shrink-0" />
                          )}
                          <a
                            href={`/api/files/${att.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-neutral-800 hover:text-[#ff1b1b] truncate"
                          >
                            {att.filename}
                          </a>
                        </div>
                        <span className="text-[10px] text-neutral-400 whitespace-nowrap">
                          {Math.ceil(att.size / 1024)} KB
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-neutral-400">Belum ada lampiran berkas.</span>
                  )}
                </div>
              </div>

              {/* Chat with Designer */}
              <div className="border-t border-neutral-200 pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-700 mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-[#ff1b1b]" />
                  <span>Obrolan Internal dengan Tim Desain</span>
                </h4>

                <div
                  ref={chatScrollRef}
                  className="h-44 overflow-y-auto space-y-2 p-3 bg-neutral-100 rounded-xl mb-3 text-xs"
                >
                  {messages.length === 0 ? (
                    <div className="text-center py-10 text-neutral-400">Belum ada pesan internal.</div>
                  ) : (
                    messages.map((m) => {
                      const isMe = m.sender.toLowerCase().includes('instruksi');
                      return (
                        <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          <div className={`p-2.5 rounded-xl max-w-sm ${isMe ? 'bg-[#ff1b1b] text-white' : 'bg-white text-neutral-800 border'}`}>
                            <p>{m.body}</p>
                          </div>
                          <span className="text-[10px] text-neutral-400 mt-0.5">
                            {m.sender} · {formatDateTime(m.created_at)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Tulis instruksi/balasan untuk desainer..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-neutral-300 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-[#ff1b1b]"
                  />
                  <button
                    type="submit"
                    disabled={isSendingChat || !chatInput.trim()}
                    className="px-4 py-2 bg-[#ff1b1b] hover:bg-[#e01616] text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Kirim</span>
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: New SPK / Instruksi Baru */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black uppercase text-neutral-900 mb-1">
              Buat Instruksi SPK Baru
            </h3>
            <p className="text-xs text-neutral-500 mb-6">
              Data otomatis tersinkronisasi ke Dashboard Desain dan Portal Tracking Customer.
            </p>

            <form onSubmit={handleCreateJob} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">Nama Customer</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: FC Barcelona Fans"
                    value={newCustomer}
                    onChange={(e) => setNewCustomer(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">No. WhatsApp Customer</label>
                  <input
                    type="text"
                    placeholder="Contoh: 08123456789"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block uppercase font-bold text-neutral-600 mb-1">Pilih Jenis Order (Preset HPP)</label>
                  <select
                    value={newOrderTypeId}
                    onChange={(e) => handleOrderTypeSelect(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl bg-white"
                  >
                    <option value="">-- Pilih Jenis Order (Opsional) --</option>
                    {orderTypes.map((ot) => (
                      <option key={ot.id} value={ot.id}>
                        {ot.name} (HPP: {formatRupiah(ot.total_hpp || 0)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">HPP per Unit (Rp)</label>
                  <input
                    type="number"
                    required
                    value={newHppUnit}
                    onChange={(e) => setNewHppUnit(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">Nama Produk / Pesanan</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Jersey Futsal Full Printing"
                    value={newProduct}
                    onChange={(e) => setNewProduct(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">Jumlah (Qty Pcs)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newQty}
                    onChange={(e) => setNewQty(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">Deadline Selesai</label>
                  <input
                    type="date"
                    value={newDeadline}
                    onChange={(e) => setNewDeadline(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">Prioritas</label>
                  <select
                    value={newPriority}
                    onChange={(e: any) => setNewPriority(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl bg-white"
                  >
                    <option value="NORMAL">NORMAL</option>
                    <option value="URGENT">URGENT</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Brief / Catatan Instruksi Desain</label>
                <textarea
                  rows={3}
                  placeholder="Catatan detail pola, kerah, bahan, font nomor punggung..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Lampirkan Berkas Referensi / Logo</label>
                <input
                  type="file"
                  multiple
                  onChange={(e) => setNewFiles(e.target.files)}
                  className="w-full text-xs text-neutral-500"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold uppercase tracking-wider"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNew}
                  className="px-6 py-2.5 rounded-xl bg-[#ff1b1b] hover:bg-[#e01616] text-white font-bold uppercase tracking-wider transition disabled:opacity-50"
                >
                  {isSubmittingNew ? 'Menerbitkan SPK...' : 'Terbitkan SPK'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
