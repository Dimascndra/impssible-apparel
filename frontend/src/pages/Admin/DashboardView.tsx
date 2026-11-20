import React from 'react';
import { Job, Invoice } from '../../types';
import { formatRupiah, formatDate } from '../../api/client';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Receipt,
  Plus,
  ArrowRight,
  GitBranch
} from 'lucide-react';
import { AdminTab } from './AdminLayout';

interface DashboardViewProps {
  jobs: Job[];
  invoices: Invoice[];
  onNavigate: (tab: AdminTab) => void;
  onOpenNewJob: () => void;
  onOpenNewInvoice: () => void;
  onSelectJob: (job: Job) => void;
}

const STAGES = [
  'Antrean Desain',
  'Proses Desain',
  'ACC Desain',
  'Cetak Pola',
  'Press Sublim',
  'Jahit',
  'QC & Finishing',
  'Siap Diambil/Kirim',
];

export const DashboardView: React.FC<DashboardViewProps> = ({
  jobs,
  invoices,
  onNavigate,
  onOpenNewJob,
  onOpenNewInvoice,
  onSelectJob,
}) => {
  const activeJobs = jobs.filter((j) => j.status !== 'SELESAI');
  const waitingJobs = jobs.filter((j) => j.status === 'MENUNGGU');
  const processingJobs = jobs.filter((j) => j.status === 'PROSES');
  const totalOutstanding = invoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

  // Compute stage distribution
  const stageCounts: Record<string, number> = {};
  STAGES.forEach((s) => {
    stageCounts[s] = 0;
  });
  jobs.forEach((j) => {
    const stage = j.production?.stage || 'Antrean Desain';
    if (stageCounts[stage] !== undefined) {
      stageCounts[stage]++;
    }
  });

  return (
    <div className="space-y-6">
      {/* Control Center Hero Banner */}
      <div className="bg-[#101011] text-white rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-xl border border-[#222]">
        <div className="absolute -right-16 -top-16 w-64 h-64 border-[40px] border-[#ff1b1b]/20 rounded-full pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <span className="text-[10px] font-black tracking-[0.2em] text-[#ff1b1b] uppercase block mb-1">
              CONTROL CENTER
            </span>
            <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight">
              Selamat Bekerja.
            </h2>
            <p className="text-neutral-400 text-sm mt-1">
              Ringkasan operasional dan alur produksi IMPOSSIBLE APPAREL hari ini.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={onOpenNewJob}
              className="px-5 py-3 rounded-xl bg-[#ff1b1b] hover:bg-[#e01616] text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-[#ff1b1b]/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Instruksi SPK Baru</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active SPK */}
        <div className="bg-white border border-[#d8d5ce] rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-bold uppercase text-neutral-500">SPK Aktif</span>
          <div className="text-3xl font-black text-[#ff1b1b] my-2">{activeJobs.length}</div>
          <small className="text-neutral-500 text-xs">Belum berstatus selesai</small>
        </div>

        {/* Waiting Design */}
        <div className="bg-white border border-[#d8d5ce] rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-bold uppercase text-neutral-500">Menunggu Desain</span>
          <div className="text-3xl font-black text-amber-500 my-2">{waitingJobs.length}</div>
          <small className="text-neutral-500 text-xs">Perlu penanganan desainer</small>
        </div>

        {/* In Production */}
        <div className="bg-white border border-[#d8d5ce] rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-bold uppercase text-neutral-500">Dalam Produksi</span>
          <div className="text-3xl font-black text-blue-600 my-2">{processingJobs.length}</div>
          <small className="text-neutral-500 text-xs">Sedang dicetak/dijahit</small>
        </div>

        {/* Outstanding Invoices */}
        <div className="bg-[#101011] text-white border border-[#222] rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-bold uppercase text-neutral-400">Tagihan Belum Lunas</span>
          <div className="text-2xl font-black text-[#d4af37] my-2">
            {formatRupiah(totalOutstanding)}
          </div>
          <small className="text-neutral-400 text-xs">Total piutang berjalan</small>
        </div>
      </div>

      {/* Overview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Production Flow Summary */}
        <div className="lg:col-span-6 bg-white border border-[#d8d5ce] rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[#eee] mb-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-[#ff1b1b]" />
                <span>Alur Tahapan Produksi</span>
              </h3>
              <button
                onClick={() => onNavigate('tracking')}
                className="text-xs font-bold text-[#ff1b1b] hover:underline flex items-center gap-1"
              >
                Lihat tracking →
              </button>
            </div>

            <div className="space-y-3">
              {STAGES.map((stageName, idx) => {
                const count = stageCounts[stageName] || 0;
                return (
                  <div key={stageName} className="flex items-center justify-between text-xs py-1.5 border-b border-neutral-100 last:border-0">
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-neutral-100 text-neutral-600 font-bold flex items-center justify-center text-[10px]">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-neutral-800">{stageName}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                      count > 0 ? 'bg-[#ff1b1b]/10 text-[#ff1b1b]' : 'bg-neutral-100 text-neutral-400'
                    }`}>
                      {count} SPK
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recent Jobs Activity */}
        <div className="lg:col-span-6 bg-white border border-[#d8d5ce] rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[#eee] mb-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#ff1b1b]" />
                <span>Aktivitas SPK Terbaru</span>
              </h3>
              <button
                onClick={() => onNavigate('instructions')}
                className="text-xs font-bold text-[#ff1b1b] hover:underline flex items-center gap-1"
              >
                Lihat semua →
              </button>
            </div>

            <div className="space-y-3">
              {jobs.slice(0, 5).map((job) => (
                <div
                  key={job.id}
                  onClick={() => {
                    onNavigate('instructions');
                    onSelectJob(job);
                  }}
                  className="p-3 rounded-xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 cursor-pointer transition flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-neutral-900 font-bold">{job.spk}</strong>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-200 text-neutral-700">
                        {job.status}
                      </span>
                    </div>
                    <span className="text-neutral-500 block mt-0.5">
                      {job.customer} · {job.product} ({job.qty} pcs)
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-neutral-400" />
                </div>
              ))}
            </div>
          </div>

          {/* Quick Invoice Action */}
          <div className="mt-6 pt-4 border-t border-neutral-200 flex items-center justify-between">
            <span className="text-xs text-neutral-500">Perlu membuat invoice atau kwitansi baru?</span>
            <button
              onClick={onOpenNewInvoice}
              className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold uppercase tracking-wider transition"
            >
              + Buat Invoice
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
