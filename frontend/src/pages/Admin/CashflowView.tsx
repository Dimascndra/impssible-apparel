import React, { useState } from 'react';
import { apiClient, formatRupiah, formatDate } from '../../api/client';
import {
  TrendingUp,
  Plus,
  Trash2,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  X,
  PieChart
} from 'lucide-react';

interface CashflowViewProps {
  cashflow: {
    summary: {
      income?: number;
      expenses?: number;
      balance?: number;
    };
    per_spk: Array<{
      id: number;
      spk: string;
      customer: string;
      product: string;
      qty: number;
      total_income: number;
      total_hpp: number;
      profit: number;
      profit_percentage: number;
    }>;
    transactions: Array<{
      id: string;
      date: string;
      type: 'INCOME' | 'EXPENSE';
      category: string;
      description: string;
      amount: number;
      reference_no?: string;
    }>;
  };
  onRefreshAll: () => void;
}

export const CashflowView: React.FC<CashflowViewProps> = ({ cashflow, onRefreshAll }) => {
  const [spkSearch, setSpkSearch] = useState('');
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);

  // Expense form state
  const [expenseCategory, setExpenseCategory] = useState('Bahan Baku & Produksi');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [isSavingExpense, setIsSavingExpense] = useState(false);

  const summary = cashflow.summary || { income: 0, expenses: 0, balance: 0 };
  const perSpk = cashflow.per_spk || [];
  const transactions = cashflow.transactions || [];

  const filteredSpk = perSpk.filter(
    (item) =>
      !spkSearch ||
      item.spk.toLowerCase().includes(spkSearch.toLowerCase()) ||
      item.customer.toLowerCase().includes(spkSearch.toLowerCase()) ||
      item.product.toLowerCase().includes(spkSearch.toLowerCase())
  );

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingExpense(true);

    try {
      await apiClient('/api/admin/cashflow/expenses', {
        method: 'POST',
        body: JSON.stringify({
          category: expenseCategory,
          description: expenseDesc.trim(),
          amount: Number(expenseAmount),
          expense_date: expenseDate,
        }),
      });
      alert('Pengeluaran berhasil dicatat ke arus kas.');
      setExpenseModalOpen(false);
      setExpenseDesc('');
      setExpenseAmount(0);
      onRefreshAll();
    } catch (err: any) {
      alert('Gagal simpan pengeluaran: ' + err.message);
    } finally {
      setIsSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (id: string | number) => {
    if (!window.confirm('Hapus transaksi pengeluaran ini dari arus kas?')) return;
    try {
      await apiClient(`/api/admin/cashflow/expenses/${id}`, { method: 'DELETE' });
      alert('Pengeluaran berhasil dihapus.');
      onRefreshAll();
    } catch (err: any) {
      alert('Gagal hapus: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase text-neutral-900 tracking-tight">
            Arus Kas & Margin Keuntungan
          </h2>
          <p className="text-neutral-500 text-xs">
            Pemasukan tercatat otomatis dari invoice, alokasi budget HPP, dan pencatatan biaya operasional.
          </p>
        </div>

        <button
          onClick={() => setExpenseModalOpen(true)}
          className="px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition"
        >
          <Plus className="w-4 h-4" />
          <span>+ Catat Pengeluaran</span>
        </button>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#d8d5ce] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 text-xs font-bold uppercase mb-2">
            <span>Pemasukan Invoice</span>
            <ArrowDownLeft className="w-4 h-4 text-[#13a45a]" />
          </div>
          <div className="text-2xl font-black text-[#13a45a]">
            {formatRupiah(summary.income || 0)}
          </div>
          <small className="text-neutral-400 text-[11px]">Total pembayaran masuk</small>
        </div>

        <div className="bg-white border border-[#d8d5ce] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 text-xs font-bold uppercase mb-2">
            <span>Pengeluaran Operasional</span>
            <ArrowUpRight className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-black text-red-600">
            {formatRupiah(summary.expenses || 0)}
          </div>
          <small className="text-neutral-400 text-[11px]">Biaya bahan, listrik & operasional</small>
        </div>

        <div className="bg-[#101011] text-white border border-[#222] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-bold uppercase mb-2">
            <span>Saldo Kas Bersih</span>
            <DollarSign className="w-4 h-4 text-[#d4af37]" />
          </div>
          <div className="text-2xl font-black text-[#d4af37]">
            {formatRupiah(summary.balance || 0)}
          </div>
          <small className="text-neutral-400 text-[11px]">Sisa saldo kas lancar</small>
        </div>
      </div>

      {/* Main Grid: Keuntungan per SPK & Riwayat Transaksi */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Keuntungan per SPK */}
        <div className="lg:col-span-7 bg-white border border-[#d8d5ce] rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200">
            <div>
              <h3 className="text-sm font-black uppercase text-neutral-900">
                Keuntungan & Budget per SPK
              </h3>
              <p className="text-xs text-neutral-400">Pemasukan vs Anggaran HPP</p>
            </div>

            <div className="w-full sm:w-64 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Cari SPK atau customer..."
                value={spkSearch}
                onChange={(e) => setSpkSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-neutral-50 border border-neutral-300 rounded-xl text-xs text-neutral-900"
              />
            </div>
          </div>

          <div className="divide-y divide-neutral-100 max-h-[500px] overflow-y-auto">
            {filteredSpk.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-400">
                Tidak ada data keuntungan SPK.
              </div>
            ) : (
              filteredSpk.map((item) => (
                <div key={item.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-neutral-900 font-bold">{item.spk}</strong>
                      <span className="text-neutral-500">· {item.customer}</span>
                    </div>
                    <span className="text-neutral-400 block mt-0.5">
                      {item.product} ({item.qty} pcs)
                    </span>
                  </div>

                  <div className="flex items-center gap-6 sm:text-right">
                    <div>
                      <span className="text-[10px] text-neutral-400 block">Pemasukan</span>
                      <strong className="text-neutral-800">{formatRupiah(item.total_income)}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 block">Budget HPP</span>
                      <span className="text-neutral-600">{formatRupiah(item.total_hpp)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 block">Laba Bersih</span>
                      <strong className={`font-bold ${item.profit >= 0 ? 'text-[#13a45a]' : 'text-red-600'}`}>
                        {formatRupiah(item.profit)} ({item.profit_percentage || 0}%)
                      </strong>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Riwayat Transaksi */}
        <div className="lg:col-span-5 bg-white border border-[#d8d5ce] rounded-2xl p-6 shadow-sm space-y-4">
          <div className="pb-3 border-b border-neutral-200">
            <h3 className="text-sm font-black uppercase text-neutral-900">
              Riwayat Arus Kas ({transactions.length})
            </h3>
            <p className="text-xs text-neutral-400">Semua aliran kas masuk dan keluar</p>
          </div>

          <div className="space-y-2.5 max-h-[500px] overflow-y-auto">
            {transactions.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-400">
                Belum ada transaksi arus kas.
              </div>
            ) : (
              transactions.map((tx) => {
                const isIncome = tx.type === 'INCOME';
                return (
                  <div
                    key={tx.id}
                    className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 flex items-start justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isIncome ? 'bg-[#13a45a]' : 'bg-red-500'
                          }`}
                        />
                        <strong className="text-neutral-900 font-bold">{tx.category}</strong>
                      </div>
                      <p className="text-neutral-600 mt-1">{tx.description}</p>
                      <span className="text-[10px] text-neutral-400 block mt-0.5">
                        {formatDate(tx.date)} {tx.reference_no && `· Ref: ${tx.reference_no}`}
                      </span>
                    </div>

                    <div className="text-right flex flex-col items-end">
                      <strong className={`font-bold ${isIncome ? 'text-[#13a45a]' : 'text-red-600'}`}>
                        {isIncome ? '+' : '-'} {formatRupiah(tx.amount)}
                      </strong>
                      {!isIncome && (
                        <button
                          onClick={() => handleDeleteExpense(tx.id)}
                          className="mt-1 p-1 text-neutral-400 hover:text-red-500"
                          title="Hapus transaksi"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal: Catat Pengeluaran Operasional */}
      {expenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setExpenseModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black uppercase text-neutral-900 mb-1">
              Catat Pengeluaran Operasional
            </h3>
            <p className="text-xs text-neutral-500 mb-4">
              Pengeluaran akan langsung mengurangi saldo kas bersih.
            </p>

            <form onSubmit={handleSaveExpense} className="space-y-4 text-xs">
              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Kategori Pengeluaran</label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl bg-white"
                >
                  <option value="Bahan Baku & Produksi">Bahan Baku & Produksi</option>
                  <option value="Listrik & Utilitas Workshop">Listrik & Utilitas Workshop</option>
                  <option value="Gaji / Upah Tukang Jahit">Gaji / Upah Tukang Jahit</option>
                  <option value="Biaya Ekspedisi / Pengiriman">Biaya Ekspedisi / Pengiriman</option>
                  <option value="Maintenance Mesin Sublim">Maintenance Mesin Sublim</option>
                  <option value="Konsumsi & Lainnya">Konsumsi & Lainnya</option>
                </select>
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Keterangan / Keperluan</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Beli 2 roll kain dryfit milano"
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Nominal Biaya (Rp)</label>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  required
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Tanggal Transaksi</label>
                <input
                  type="date"
                  required
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div className="pt-3 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setExpenseModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-100 text-neutral-700 font-bold uppercase"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingExpense}
                  className="px-5 py-2 rounded-xl bg-[#ff1b1b] hover:bg-[#e01616] text-white font-bold uppercase disabled:opacity-50"
                >
                  {isSavingExpense ? 'Menyimpan...' : 'Simpan Pengeluaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
