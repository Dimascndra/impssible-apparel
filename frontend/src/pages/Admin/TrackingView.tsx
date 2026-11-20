import React, { useState } from 'react';
import { apiClient, formatDate, formatDateTime } from '../../api/client';
import { Job, TrackingStep } from '../../types';
import {
  GitBranch,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  X,
  History,
  ArrowRight
} from 'lucide-react';

interface TrackingViewProps {
  jobs: Job[];
  onRefreshJobs: () => void;
}

const PRODUCTION_STAGES = [
  { name: 'Antrean Desain', defaultProgress: 10 },
  { name: 'Proses Desain', defaultProgress: 25 },
  { name: 'ACC Desain', defaultProgress: 40 },
  { name: 'Cetak Pola', defaultProgress: 55 },
  { name: 'Press Sublim', defaultProgress: 70 },
  { name: 'Jahit', defaultProgress: 85 },
  { name: 'QC & Finishing', defaultProgress: 95 },
  { name: 'Siap Diambil/Kirim', defaultProgress: 100 },
];

export const TrackingView: React.FC<TrackingViewProps> = ({ jobs, onRefreshJobs }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [trackingHistory, setTrackingHistory] = useState<TrackingStep[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Update modal state
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [targetJob, setTargetJob] = useState<Job | null>(null);
  const [selectedStage, setSelectedStage] = useState(PRODUCTION_STAGES[0].name);
  const [progressVal, setProgressVal] = useState(PRODUCTION_STAGES[0].defaultProgress);
  const [noteVal, setNoteVal] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleOpenUpdate = (job: Job) => {
    setTargetJob(job);
    const curStage = job.production?.stage || PRODUCTION_STAGES[0].name;
    setSelectedStage(curStage);
    const matched = PRODUCTION_STAGES.find((s) => s.name === curStage);
    setProgressVal(matched ? matched.defaultProgress : (job.production?.progress || 10));
    setNoteVal('');
    setUpdateModalOpen(true);
  };

  const handleStageSelect = (stageName: string) => {
    setSelectedStage(stageName);
    const matched = PRODUCTION_STAGES.find((s) => s.name === stageName);
    if (matched) {
      setProgressVal(matched.defaultProgress);
    }
  };

  const handleSubmitUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetJob) return;

    setIsUpdating(true);
    try {
      await apiClient(`/api/admin/tracking/${targetJob.id}`, {
        method: 'POST',
        body: JSON.stringify({
          stage: selectedStage,
          note: noteVal.trim() || undefined,
        }),
      });
      alert(`Progres produksi ${targetJob.spk} berhasil diperbarui.`);
      setUpdateModalOpen(false);
      onRefreshJobs();
    } catch (err: any) {
      alert('Gagal update tracking: ' + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleViewHistory = async (job: Job) => {
    setSelectedJob(job);
    setHistoryModalOpen(true);
    setHistoryLoading(true);

    try {
      const data = await apiClient<{ history: TrackingStep[] }>(
        `/api/admin/tracking/${job.id}`
      );
      setTrackingHistory(data.history || []);
    } catch (err: any) {
      alert('Gagal memuat riwayat tracking: ' + err.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const filteredJobs = jobs.filter(
    (j) =>
      !searchQuery ||
      j.spk.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.product.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase text-neutral-900 tracking-tight">
            Tracking Alur Produksi
          </h2>
          <p className="text-neutral-500 text-xs">
            Kelola 8 tahapan produksi jersey dan apparel secara transparan ke customer.
          </p>
        </div>

        <div className="w-full sm:w-72 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Cari SPK atau customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-neutral-300 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-[#ff1b1b]"
          />
        </div>
      </div>

      {/* Jobs Tracking Table / Cards */}
      <div className="bg-white border border-[#d8d5ce] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">SPK</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Produk</th>
                <th className="py-3 px-4">Tahap Saat Ini</th>
                <th className="py-3 px-4">Progres</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-neutral-400">
                    Tidak ada data SPK.
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => {
                  const currentStage = job.production?.stage || 'Antrean Desain';
                  const progress = job.production?.progress || 0;
                  const isDone = progress >= 100;

                  return (
                    <tr key={job.id} className="hover:bg-neutral-50 transition">
                      <td className="py-3.5 px-4 font-bold text-neutral-900">
                        {job.spk}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-700 font-medium">
                        {job.customer}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-600">
                        {job.product} ({job.qty} pcs)
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                            isDone
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {currentStage}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="w-32">
                          <div className="flex justify-between text-[10px] font-bold text-neutral-600 mb-1">
                            <span>{progress}%</span>
                          </div>
                          <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                isDone ? 'bg-[#13a45a]' : 'bg-[#ff1b1b]'
                              }`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleViewHistory(job)}
                          className="px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold text-[11px] transition"
                        >
                          Riwayat
                        </button>
                        <button
                          onClick={() => handleOpenUpdate(job)}
                          className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-black text-white font-semibold text-[11px] transition"
                        >
                          Update Progres
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Update Progres Produksi */}
      {updateModalOpen && targetJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setUpdateModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black uppercase text-neutral-900 mb-1">
              Update Progres Produksi
            </h3>
            <p className="text-xs text-neutral-500 mb-6">
              {targetJob.spk} · {targetJob.customer} ({targetJob.product})
            </p>

            <form onSubmit={handleSubmitUpdate} className="space-y-4 text-xs">
              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1.5">
                  Pilih Tahapan Produksi
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PRODUCTION_STAGES.map((st) => (
                    <button
                      key={st.name}
                      type="button"
                      onClick={() => handleStageSelect(st.name)}
                      className={`p-2.5 rounded-xl border text-left font-bold transition flex items-center justify-between ${
                        selectedStage === st.name
                          ? 'border-[#ff1b1b] bg-[#ff1b1b]/5 text-[#ff1b1b]'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      <span>{st.name}</span>
                      <span className="text-[10px] text-neutral-400">{st.defaultProgress}%</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">
                  Catatan Progres (Opsional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Contoh: Kain dryfit sudah selesai dipress sublimasi, lanjut jahit."
                  value={noteVal}
                  onChange={(e) => setNoteVal(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setUpdateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-100 text-neutral-700 font-bold uppercase"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-5 py-2 rounded-xl bg-[#ff1b1b] hover:bg-[#e01616] text-white font-bold uppercase transition disabled:opacity-50"
                >
                  {isUpdating ? 'Menyimpan...' : 'Simpan Progres'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Riwayat Tracking */}
      {historyModalOpen && selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setHistoryModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black uppercase text-neutral-900 mb-1">
              Riwayat Tracking
            </h3>
            <p className="text-xs text-neutral-500 mb-4">
              {selectedJob.spk} · {selectedJob.customer}
            </p>

            <div className="space-y-3 max-h-96 overflow-y-auto text-xs">
              {historyLoading ? (
                <div className="p-8 text-center text-neutral-400">Memuat riwayat...</div>
              ) : trackingHistory.length === 0 ? (
                <div className="p-8 text-center text-neutral-400">Belum ada riwayat tercatat.</div>
              ) : (
                trackingHistory.map((step, idx) => (
                  <div key={idx} className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 text-[#13a45a] shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <strong className="text-neutral-900 font-bold block">{step.stage} ({step.progress}%)</strong>
                      {step.note && <span className="text-neutral-600 block mt-0.5">{step.note}</span>}
                    </div>
                    <span className="text-[10px] text-neutral-400 whitespace-nowrap">
                      {formatDateTime(step.created_at)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
