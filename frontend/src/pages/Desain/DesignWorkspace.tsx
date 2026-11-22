import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, setCsrfToken, formatDate, formatDateTime } from '../../api/client';
import { Job, UserSession, JobMessage } from '../../types';
import {
  RefreshCw,
  LogOut,
  Upload,
  MessageSquare,
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
  Computer,
  User,
  X,
  FileCode,
  Send,
  Eye
} from 'lucide-react';

const STATUS_COLUMNS: Array<'MENUNGGU' | 'PROSES' | 'REVISI' | 'SELESAI'> = [
  'MENUNGGU',
  'PROSES',
  'REVISI',
  'SELESAI',
];

export const DesignWorkspace: React.FC = () => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Modal form states
  const [editStatus, setEditStatus] = useState<'MENUNGGU' | 'PROSES' | 'REVISI' | 'SELESAI'>('MENUNGGU');
  const [editDesigner, setEditDesigner] = useState('');
  const [editComputer, setEditComputer] = useState('');
  const [isSavingJob, setIsSavingJob] = useState(false);

  // Chat states
  const [messages, setMessages] = useState<JobMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Upload states
  const [isUploadingPreview, setIsUploadingPreview] = useState(false);
  const [isUploadingCdr, setIsUploadingCdr] = useState(false);

  const navigate = useNavigate();

  // Load Auth Session
  useEffect(() => {
    async function checkAuth() {
      try {
        const me = await apiClient<any>('/api/auth/me');
        const role = me.role || me.user?.role;
        const username = me.username || me.user?.username || 'desain';
        const csrf = me.csrf || me.user?.csrf;

        if (role !== 'design' && role !== 'admin') {
          navigate('/login');
          return;
        }
        setSession({
          ok: true,
          username,
          role,
          csrf,
        });
        if (csrf) setCsrfToken(csrf);
      } catch {
        navigate('/login');
      }
    }
    checkAuth();
  }, [navigate]);

  // Load Jobs
  const loadJobs = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiClient<{ jobs: Job[] }>('/api/jobs');
      setJobs(data.jobs || []);

      // If a job is currently selected in modal, keep it fresh
      if (selectedJob) {
        const refreshed = (data.jobs || []).find((j) => j.id === selectedJob.id);
        if (refreshed) {
          setSelectedJob(refreshed);
        }
      }
    } catch (err: any) {
      console.error('Failed to load design jobs:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    const interval = setInterval(() => loadJobs(true), 6000);
    return () => clearInterval(interval);
  }, []);

  // Open Job Detail
  const handleOpenJob = (job: Job) => {
    setSelectedJob(job);
    setEditStatus(job.status);
    setEditDesigner(job.designer || '');
    setEditComputer(job.computer || '');
  };

  // Chat poller when job modal is active
  useEffect(() => {
    if (!selectedJob) return;

    let active = true;
    const fetchChat = async () => {
      try {
        const data = await apiClient<{ messages: JobMessage[] }>(
          `/api/jobs/${selectedJob.id}/messages`
        );
        if (active) {
          setMessages(data.messages || []);
          setTimeout(() => {
            chatScrollRef.current?.scrollTo({
              top: chatScrollRef.current.scrollHeight,
              behavior: 'smooth',
            });
          }, 50);
        }
      } catch {
        // chat poller retry
      }
    };

    fetchChat();
    const timer = setInterval(fetchChat, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selectedJob]);

  // Save Job Status & PIC
  const handleSaveJobInfo = async () => {
    if (!selectedJob) return;
    setIsSavingJob(true);
    try {
      await apiClient(`/api/jobs/${selectedJob.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: editStatus,
          designer: editDesigner,
          computer: editComputer,
        }),
      });
      await loadJobs(true);
      alert('Status dan PIC berhasil diperbarui.');
    } catch (err: any) {
      alert('Gagal memperbarui status: ' + err.message);
    } finally {
      setIsSavingJob(false);
    }
  };

  // Upload Preview File
  const handleUploadPreview = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedJob) return;

    setIsUploadingPreview(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      await apiClient(`/api/jobs/${selectedJob.id}/upload/preview`, {
        method: 'POST',
        body: formData,
      });
      await loadJobs(true);
      alert('File preview berhasil diunggah.');
    } catch (err: any) {
      alert('Gagal mengunggah preview: ' + err.message);
    } finally {
      setIsUploadingPreview(false);
      e.target.value = '';
    }
  };

  // Upload CDR File
  const handleUploadCdr = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedJob) return;

    setIsUploadingCdr(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      await apiClient(`/api/jobs/${selectedJob.id}/upload/cdr`, {
        method: 'POST',
        body: formData,
      });
      await loadJobs(true);
      alert('File CorelDraw (.CDR) final berhasil diunggah.');
    } catch (err: any) {
      alert('Gagal mengunggah file CDR: ' + err.message);
    } finally {
      setIsUploadingCdr(false);
      e.target.value = '';
    }
  };

  // Send Chat Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !selectedJob) return;

    setIsSendingChat(true);
    try {
      await apiClient(`/api/jobs/${selectedJob.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: chatInput.trim() }),
      });
      setChatInput('');
      const data = await apiClient<{ messages: JobMessage[] }>(
        `/api/jobs/${selectedJob.id}/messages`
      );
      setMessages(data.messages || []);
    } catch (err: any) {
      alert('Gagal mengirim pesan: ' + err.message);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiClient('/api/auth/logout', { method: 'POST', body: '{}' });
    } finally {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-[#090909] text-white">
      {/* Topbar */}
      <header className="sticky top-0 z-40 bg-[#080808]/95 backdrop-blur-md border-b border-[#222] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img
            src="/assets/impossible-logo.png"
            alt="IMPOSSIBLE APPAREL"
            className="h-10 w-auto object-contain"
          />
          <div className="border-l border-[#333] pl-4">
            <strong className="block text-xs font-black tracking-[0.2em] text-[#ff1b1b] uppercase">
              DESAIN WORKSPACE
            </strong>
            <span className="text-[11px] text-neutral-400">Antrean Produksi & Desain Vector</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-400">
            <User className="w-3.5 h-3.5 text-neutral-400" />
            <span>Akun: <strong className="text-white">{session?.username || 'Desainer'}</strong></span>
          </div>

          <button
            onClick={() => loadJobs()}
            disabled={loading}
            className="p-2.5 rounded-xl bg-[#18181b] hover:bg-[#222] border border-[#333] text-neutral-300 hover:text-white transition"
            title="Sinkronkan Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-950/30 hover:bg-red-900/50 border border-red-800/40 text-red-200 text-xs font-bold uppercase tracking-wider transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Board */}
      <main className="max-w-[1600px] mx-auto p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-white">
              Design Queue
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              Instruksi SPK masuk otomatis dari Admin. Perbarui progres kerja dan unggah hasil CDR.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-neutral-400 bg-[#141416] px-4 py-2.5 rounded-xl border border-[#262626]">
            <span className="w-2 h-2 rounded-full bg-[#13a45a] animate-pulse" />
            <span>Total <strong>{jobs.length}</strong> SPK di antrean</span>
          </div>
        </div>

        {/* Kanban Board Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-start">
          {STATUS_COLUMNS.map((columnStatus) => {
            const columnJobs = jobs.filter((j) => j.status === columnStatus);
            return (
              <div
                key={columnStatus}
                className="bg-[#121214] border border-[#262626] rounded-2xl flex flex-col max-h-[calc(100vh-220px)] overflow-hidden shadow-lg"
              >
                {/* Column Header */}
                <div className="p-4 border-b border-[#222] flex items-center justify-between bg-[#141416]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        columnStatus === 'MENUNGGU'
                          ? 'bg-amber-400'
                          : columnStatus === 'PROSES'
                          ? 'bg-blue-400'
                          : columnStatus === 'REVISI'
                          ? 'bg-rose-500'
                          : 'bg-[#13a45a]'
                      }`}
                    />
                    <h2 className="text-xs font-black uppercase tracking-wider text-white">
                      {columnStatus}
                    </h2>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-[#222] text-[11px] font-bold text-neutral-400">
                    {columnJobs.length}
                  </span>
                </div>

                {/* Cards List */}
                <div className="p-3 space-y-3 overflow-y-auto flex-1">
                  {columnJobs.length === 0 ? (
                    <div className="p-8 text-center text-xs text-neutral-600">
                      Tidak ada antrean
                    </div>
                  ) : (
                    columnJobs.map((job) => {
                      const hasCdr = job.attachments?.some((a) => a.kind === 'cdr');
                      const hasPreview = job.attachments?.some((a) => a.kind === 'preview');

                      return (
                        <div
                          key={job.id}
                          onClick={() => handleOpenJob(job)}
                          className="p-4 rounded-xl bg-[#18181b] border border-[#2a2a2a] hover:border-[#ff1b1b]/50 cursor-pointer transition duration-150 hover:-translate-y-0.5 shadow-md flex flex-col justify-between gap-3 group"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="text-xs font-black tracking-wider text-white group-hover:text-[#ff1b1b] transition">
                                {job.spk}
                              </span>
                              {job.priority === 'URGENT' && (
                                <span className="px-2 py-0.5 rounded bg-red-950/60 border border-red-600/50 text-[10px] font-black uppercase text-red-300">
                                  URGENT
                                </span>
                              )}
                            </div>

                            <h3 className="text-sm font-bold text-white line-clamp-1 mb-1">
                              {job.product}
                            </h3>
                            <p className="text-xs text-neutral-400">
                              {job.customer} · <strong className="text-neutral-300">{job.qty} pcs</strong>
                            </p>
                          </div>

                          <div className="pt-3 border-t border-[#262626] flex items-center justify-between text-[11px]">
                            <span className="text-neutral-400">
                              {job.deadline ? `Deadline: ${job.deadline}` : 'Tanpa deadline'}
                            </span>
                            <span
                              className={`flex items-center gap-1 font-bold ${
                                hasCdr ? 'text-[#13a45a]' : 'text-neutral-500'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  hasCdr ? 'bg-[#13a45a]' : 'bg-neutral-600'
                                }`}
                              />
                              <span>{hasCdr ? 'CDR Siap' : 'CDR Belum'}</span>
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Detail Job & Workflow Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#121214] border border-[#333] rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-[#222] flex items-center justify-between bg-[#141416]">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-black uppercase text-white">{selectedJob.spk}</h2>
                  {selectedJob.priority === 'URGENT' && (
                    <span className="px-2.5 py-0.5 rounded bg-red-950/80 border border-red-600 text-xs font-black text-red-300 uppercase">
                      URGENT
                    </span>
                  )}
                  <span className="px-2.5 py-0.5 rounded bg-[#222] text-xs font-bold text-neutral-300 uppercase">
                    {selectedJob.status}
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Customer: <strong className="text-white">{selectedJob.customer}</strong> · Produk: {selectedJob.product} ({selectedJob.qty} pcs)
                </p>
              </div>

              <button
                onClick={() => setSelectedJob(null)}
                className="p-2 rounded-xl bg-[#222] hover:bg-[#333] text-neutral-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Production Tracking Status Banner */}
              <div className="p-4 rounded-xl bg-[#18181b] border border-[#2a2a2a] flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-500 block">Status Tracking Produksi</span>
                  <strong className="text-sm font-bold text-white">
                    {selectedJob.production?.stage || 'Dalam Antrean'} · {selectedJob.production?.progress || 0}%
                  </strong>
                </div>
                <div className="text-xs text-neutral-400">
                  {selectedJob.deadline ? `Deadline: ${selectedJob.deadline}` : 'Tanpa deadline'}
                </div>
              </div>

              {/* Brief & Notes */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">
                  Instruksi & Catatan Khusus
                </h3>
                <div className="p-4 rounded-xl bg-[#161618] border border-[#262626] text-sm text-neutral-200 leading-relaxed">
                  {selectedJob.note || 'Tidak ada catatan tambahan untuk SPK ini.'}
                </div>
              </div>

              {/* Reference Attachments from Admin */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">
                  Lampiran Referensi dari Admin
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedJob.attachments?.filter((a) => a.kind === 'reference').length ? (
                    selectedJob.attachments
                      .filter((a) => a.kind === 'reference')
                      .map((att) => (
                        <a
                          key={att.id}
                          href={`/api/files/${att.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-3 rounded-xl bg-[#161618] border border-[#262626] hover:border-neutral-500 flex items-center justify-between text-xs transition"
                        >
                          <span className="text-white truncate mr-2">{att.filename}</span>
                          <span className="text-[10px] text-neutral-500 whitespace-nowrap">
                            {Math.ceil(att.size / 1024)} KB ↗
                          </span>
                        </a>
                      ))
                  ) : (
                    <span className="text-xs text-neutral-500">Tidak ada lampiran referensi.</span>
                  )}
                </div>
              </div>

              {/* Status & PIC Form */}
              <div className="p-5 rounded-xl bg-[#18181b] border border-[#2a2a2a]">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white mb-4">
                  Perbarui Status & Identitas Komputer
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
                      Status Desain
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e: any) => setEditStatus(e.target.value)}
                      className="w-full px-3 py-2.5 bg-[#121214] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-[#ff1b1b]"
                    >
                      {STATUS_COLUMNS.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
                      PIC Desainer
                    </label>
                    <input
                      type="text"
                      placeholder="Nama desainer"
                      value={editDesigner}
                      onChange={(e) => setEditDesigner(e.target.value)}
                      className="w-full px-3 py-2.5 bg-[#121214] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-[#ff1b1b]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
                      Komputer Kerja
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: PC-DESAIN-01"
                      value={editComputer}
                      onChange={(e) => setEditComputer(e.target.value)}
                      className="w-full px-3 py-2.5 bg-[#121214] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-[#ff1b1b]"
                    />
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleSaveJobInfo}
                    disabled={isSavingJob}
                    className="px-5 py-2.5 rounded-xl bg-[#ff1b1b] hover:bg-[#e01616] text-white text-xs font-bold uppercase tracking-wider transition disabled:opacity-50"
                  >
                    {isSavingJob ? 'Menyimpan...' : 'Simpan Status & PIC'}
                  </button>
                </div>
              </div>

              {/* Uploads Section (Preview & CorelDraw CDR) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Preview Images / PDF */}
                <div className="p-5 rounded-xl bg-[#18181b] border border-[#2a2a2a] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-bold uppercase text-white flex items-center gap-2">
                        <Eye className="w-4 h-4 text-blue-400" />
                        <span>Preview Gambar / Mockup</span>
                      </h4>
                      <span className="text-[10px] text-neutral-500">
                        {selectedJob.attachments?.filter((a) => a.kind === 'preview').length || 0} file
                      </span>
                    </div>

                    <div className="space-y-2 mb-4 max-h-36 overflow-y-auto">
                      {selectedJob.attachments?.filter((a) => a.kind === 'preview').length ? (
                        selectedJob.attachments
                          .filter((a) => a.kind === 'preview')
                          .map((att) => (
                            <div
                              key={att.id}
                              className="p-2.5 rounded-lg bg-[#141416] border border-[#262626] flex items-center justify-between text-xs"
                            >
                              <a
                                href={`/api/files/${att.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:underline truncate mr-2"
                              >
                                {att.filename}
                              </a>
                              <span className="text-[10px] text-neutral-500 whitespace-nowrap">
                                {Math.ceil(att.size / 1024)} KB
                              </span>
                            </div>
                          ))
                      ) : (
                        <p className="text-xs text-neutral-500">Belum ada preview diunggah.</p>
                      )}
                    </div>
                  </div>

                  <label className="cursor-pointer flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-dashed border-[#444] hover:border-neutral-300 text-xs text-neutral-300 font-semibold transition">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploadingPreview ? 'Mengunggah...' : 'Pilih File Preview (+)'}</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf"
                      onChange={handleUploadPreview}
                      disabled={isUploadingPreview}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Final CDR (.cdr) File */}
                <div className="p-5 rounded-xl bg-[#18181b] border border-[#2a2a2a] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-bold uppercase text-white flex items-center gap-2">
                        <FileCode className="w-4 h-4 text-[#13a45a]" />
                        <span>File CorelDraw (.CDR) Final</span>
                      </h4>
                      <span className="text-[10px] text-neutral-500">
                        {selectedJob.attachments?.filter((a) => a.kind === 'cdr').length || 0} file
                      </span>
                    </div>

                    <div className="space-y-2 mb-4 max-h-36 overflow-y-auto">
                      {selectedJob.attachments?.filter((a) => a.kind === 'cdr').length ? (
                        selectedJob.attachments
                          .filter((a) => a.kind === 'cdr')
                          .map((att) => (
                            <div
                              key={att.id}
                              className="p-2.5 rounded-lg bg-[#141416] border border-[#262626] flex items-center justify-between text-xs"
                            >
                              <a
                                href={`/api/files/${att.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#13a45a] hover:underline font-mono truncate mr-2"
                              >
                                {att.filename}
                              </a>
                              <span className="text-[10px] text-neutral-500 whitespace-nowrap">
                                {Math.ceil(att.size / 1024)} KB
                              </span>
                            </div>
                          ))
                      ) : (
                        <p className="text-xs text-neutral-500">Belum ada file CDR yang diunggah.</p>
                      )}
                    </div>
                  </div>

                  <label className="cursor-pointer flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#13a45a]/20 border border-[#13a45a]/40 hover:bg-[#13a45a]/30 text-xs text-[#13a45a] font-bold uppercase tracking-wider transition">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploadingCdr ? 'Mengunggah...' : 'Unggah File CDR Final'}</span>
                    <input
                      type="file"
                      accept=".cdr"
                      onChange={handleUploadCdr}
                      disabled={isUploadingCdr}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Internal Chat with Admin */}
              <div className="p-5 rounded-xl bg-[#18181b] border border-[#2a2a2a]">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#ff1b1b]" />
                  <span>Komunikasi Internal SPK (Desain & Instruksi)</span>
                </h3>

                <div
                  ref={chatScrollRef}
                  className="h-48 overflow-y-auto space-y-2.5 p-3 rounded-xl bg-[#121214] border border-[#262626] mb-3"
                >
                  {messages.length === 0 ? (
                    <div className="text-center py-12 text-xs text-neutral-600">
                      Belum ada pesan. Mulai obrolan untuk koordinasi pengerjaan.
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMe = msg.sender.toLowerCase().includes('desain');
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-md p-3 rounded-xl text-xs leading-relaxed ${
                              isMe
                                ? 'bg-[#ff1b1b] text-white rounded-br-none'
                                : 'bg-[#222] text-neutral-200 rounded-bl-none'
                            }`}
                          >
                            <p>{msg.body}</p>
                          </div>
                          <span className="text-[10px] text-neutral-500 mt-1">
                            {msg.sender} · {formatDateTime(msg.created_at)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Tulis pesan untuk admin instruksi..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-[#121214] border border-[#333] rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#ff1b1b]"
                  />
                  <button
                    type="submit"
                    disabled={isSendingChat || !chatInput.trim()}
                    className="px-4 py-2.5 bg-[#ff1b1b] hover:bg-[#e01616] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Kirim</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
