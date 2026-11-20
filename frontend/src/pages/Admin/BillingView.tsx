import React, { useState } from 'react';
import { apiClient, formatRupiah, formatDate } from '../../api/client';
import { Invoice, Job } from '../../types';
import {
  Receipt,
  Plus,
  Download,
  Trash2,
  DollarSign,
  CreditCard,
  X,
  FileCheck2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface BillingViewProps {
  invoices: Invoice[];
  jobs: Job[];
  onRefreshAll: () => void;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
}

export const BillingView: React.FC<BillingViewProps> = ({
  invoices,
  jobs,
  onRefreshAll,
  isCreateModalOpen,
  setIsCreateModalOpen,
}) => {
  // New Invoice Form State
  const [selectedSpkId, setSelectedSpkId] = useState<number | ''>('');
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [items, setItems] = useState<Array<{ name: string; qty: number; price: number }>>([
    { name: '', qty: 12, price: 110000 },
  ]);
  const [discount, setDiscount] = useState<number>(0);
  const [shipping, setShipping] = useState<number>(0);
  const [initialPayment, setInitialPayment] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState('Transfer Bank');
  const [isSubmittingInvoice, setIsSubmittingInvoice] = useState(false);

  // Input Payment Modal State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [targetInvoice, setTargetInvoice] = useState<Invoice | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState('Transfer Bank');
  const [payNote, setPayNote] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const totalPaid = invoices.reduce((sum, inv) => sum + (inv.paid || 0), 0);
  const totalOutstanding = invoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

  // Auto fill from SPK selection
  const handleSelectSpk = (spkIdStr: string) => {
    if (!spkIdStr) {
      setSelectedSpkId('');
      return;
    }
    const id = Number(spkIdStr);
    setSelectedSpkId(id);
    const job = jobs.find((j) => j.id === id);
    if (job) {
      setCustomer(job.customer);
      setItems([
        {
          name: `${job.product} (${job.spk})`,
          qty: job.qty || 1,
          price: 110000,
        },
      ]);
    }
  };

  const handleAddItemRow = () => {
    setItems([...items, { name: '', qty: 1, price: 0 }]);
  };

  const handleUpdateItem = (
    index: number,
    field: 'name' | 'qty' | 'price',
    val: string | number
  ) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: val };
    setItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, idx) => idx !== index));
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, it) => sum + (it.qty || 0) * (it.price || 0), 0);
  };

  const calculateTotal = () => {
    return Math.max(0, calculateSubtotal() - (discount || 0) + (shipping || 0));
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingInvoice(true);

    try {
      const payload: any = {
        customer: customer.trim(),
        customer_phone: phone.trim() || undefined,
        customer_address: address.trim() || undefined,
        invoice_date: invoiceDate,
        due_date: dueDate || invoiceDate,
        job_id: selectedSpkId ? Number(selectedSpkId) : null,
        items: items.map((it) => ({
          name: it.name,
          qty: Number(it.qty),
          price: Number(it.price),
          total: Number(it.qty) * Number(it.price),
        })),
        subtotal: calculateSubtotal(),
        discount: Number(discount),
        shipping_cost: Number(shipping),
        total: calculateTotal(),
      };

      if (initialPayment > 0) {
        payload.payment = {
          amount: Number(initialPayment),
          method: paymentMethod,
          date: invoiceDate,
        };
      }

      const res = await apiClient<{ invoice: Invoice }>('/api/admin/invoices', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      alert(`Invoice ${res.invoice.invoice_no} berhasil dibuat!`);
      setIsCreateModalOpen(false);
      // Reset form
      setCustomer('');
      setPhone('');
      setAddress('');
      setItems([{ name: '', qty: 12, price: 110000 }]);
      setDiscount(0);
      setShipping(0);
      setInitialPayment(0);
      setSelectedSpkId('');

      onRefreshAll();
    } catch (err: any) {
      alert('Gagal buat invoice: ' + err.message);
    } finally {
      setIsSubmittingInvoice(false);
    }
  };

  // Open Payment Modal
  const handleOpenPayment = (inv: Invoice) => {
    setTargetInvoice(inv);
    setPayAmount(inv.balance || 0);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod('Transfer Bank');
    setPayNote('');
    setPaymentModalOpen(true);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetInvoice) return;

    setIsSubmittingPayment(true);
    try {
      const res = await apiClient<{ receipt_no?: string }>(
        `/api/admin/invoices/${targetInvoice.id}/payments`,
        {
          method: 'POST',
          body: JSON.stringify({
            amount: Number(payAmount),
            payment_date: payDate,
            method: payMethod,
            note: payNote.trim() || undefined,
          }),
        }
      );

      alert(`Pembayaran berhasil dicatat! Terbit Kwitansi: ${res.receipt_no || 'Resmi'}`);
      setPaymentModalOpen(false);
      onRefreshAll();
    } catch (err: any) {
      alert('Gagal simpan pembayaran: ' + err.message);
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Download PDF Invoice / Kwitansi
  const handleDownloadPdf = async (id: number, type: 'invoice' | 'kwitansi') => {
    try {
      const res = await fetch(`/api/admin/invoices/${id}/pdf?type=${type}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Gagal membuat PDF ${type}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type.toUpperCase()}-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Gagal unduh dokumen: ' + err.message);
    }
  };

  const handleDeleteInvoice = async (id: number, invNo: string) => {
    if (!window.confirm(`Hapus invoice ${invNo}? Transaksi pembayaran terkait juga akan dihapus.`)) {
      return;
    }

    try {
      await apiClient(`/api/admin/invoices/${id}`, { method: 'DELETE' });
      alert(`Invoice ${invNo} berhasil dihapus.`);
      onRefreshAll();
    } catch (err: any) {
      alert('Gagal hapus invoice: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase text-neutral-900 tracking-tight">
            Invoicing & Kwitansi Resmi
          </h2>
          <p className="text-neutral-500 text-xs">
            Terbitkan invoice penagihan SPK, catat termin pembayaran, dan cetak PDF resmi dua rangkap.
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-5 py-2.5 rounded-xl bg-[#ff1b1b] hover:bg-[#e01616] text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-[#ff1b1b]/20 transition"
        >
          <Plus className="w-4 h-4" />
          <span>+ Buat Invoice Baru</span>
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#d8d5ce] rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-bold uppercase text-neutral-500">Total Invoice</span>
          <div className="text-3xl font-black text-neutral-900 my-2">{invoices.length}</div>
          <small className="text-neutral-500 text-xs">Dokumen diterbitkan</small>
        </div>

        <div className="bg-white border border-[#d8d5ce] rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-bold uppercase text-neutral-500">Total Terbayar</span>
          <div className="text-2xl font-black text-[#13a45a] my-2">
            {formatRupiah(totalPaid)}
          </div>
          <small className="text-neutral-500 text-xs">Pemasukan lunas & DP</small>
        </div>

        <div className="bg-[#101011] text-white border border-[#222] rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-bold uppercase text-neutral-400">Total Sisa Tagihan (Piutang)</span>
          <div className="text-2xl font-black text-[#d4af37] my-2">
            {formatRupiah(totalOutstanding)}
          </div>
          <small className="text-neutral-400 text-xs">Menunggu pelunasan customer</small>
        </div>
      </div>

      {/* Invoice Table */}
      <div className="bg-white border border-[#d8d5ce] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Nomor Invoice</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Tanggal</th>
                <th className="py-3 px-4">Total</th>
                <th className="py-3 px-4">Status & Pembayaran</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-400">
                    Belum ada invoice diterbitkan.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const isPaidOff = inv.payment_status === 'LUNAS';
                  const isDp = inv.payment_status === 'DP';

                  return (
                    <tr key={inv.id} className="hover:bg-neutral-50 transition">
                      <td className="py-3.5 px-4 font-bold text-neutral-900">
                        {inv.invoice_no}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-neutral-800">
                        {inv.customer}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-500">
                        {formatDate(inv.invoice_date)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-neutral-900">
                        {formatRupiah(inv.total)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            isPaidOff
                              ? 'bg-emerald-100 text-emerald-800'
                              : isDp
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {inv.payment_status}
                        </span>
                        <div className="text-[11px] text-neutral-500 mt-1">
                          Dibayar: {formatRupiah(inv.paid)} · Sisa: {formatRupiah(inv.balance)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => handleDownloadPdf(inv.id, 'invoice')}
                          className="px-2.5 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold text-[11px] transition"
                        >
                          PDF Invoice
                        </button>

                        {inv.paid > 0 && (
                          <button
                            onClick={() => handleDownloadPdf(inv.id, 'kwitansi')}
                            className="px-2.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-black text-white font-semibold text-[11px] transition"
                          >
                            PDF Kwitansi
                          </button>
                        )}

                        {inv.balance > 0 && (
                          <button
                            onClick={() => handleOpenPayment(inv)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#ff1b1b] hover:bg-[#e01616] text-white font-semibold text-[11px] transition"
                          >
                            + Bayar
                          </button>
                        )}

                        <button
                          onClick={() => handleDeleteInvoice(inv.id, inv.invoice_no)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* Modal: Buat Invoice Baru */}
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
              Buat Invoice Baru
            </h3>
            <p className="text-xs text-neutral-500 mb-6">
              Pilih dari SPK untuk mengisi otomatis atau buat invoice kustom.
            </p>

            <form onSubmit={handleCreateInvoice} className="space-y-4 text-xs">
              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Tautkan ke SPK (Opsional)</label>
                <select
                  value={selectedSpkId}
                  onChange={(e) => handleSelectSpk(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl bg-white"
                >
                  <option value="">-- Tanpa Tautan SPK (Invoice Kustom) --</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.spk} — {j.customer} ({j.product})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">Nama Customer</label>
                  <input
                    type="text"
                    required
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">No. WhatsApp</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">Tanggal Terbit</label>
                  <input
                    type="date"
                    required
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">Jatuh Tempo</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                  />
                </div>
              </div>

              {/* Items Line Table */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block uppercase font-bold text-neutral-700">Rincian Item Tagihan</label>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="text-xs font-bold text-[#ff1b1b] hover:underline"
                  >
                    + Tambah Item
                  </button>
                </div>

                <div className="space-y-2 mb-3">
                  {items.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-neutral-50 rounded-xl border border-neutral-200">
                      <input
                        type="text"
                        required
                        placeholder="Nama Item / Deskripsi"
                        value={it.name}
                        onChange={(e) => handleUpdateItem(idx, 'name', e.target.value)}
                        className="flex-1 px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs"
                      />
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={it.qty}
                        onChange={(e) => handleUpdateItem(idx, 'qty', Number(e.target.value))}
                        className="w-16 px-2 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs"
                      />
                      <input
                        type="number"
                        min="0"
                        placeholder="Harga"
                        value={it.price}
                        onChange={(e) => handleUpdateItem(idx, 'price', Number(e.target.value))}
                        className="w-24 px-2 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs"
                      />
                      <span className="w-24 text-right font-bold text-neutral-800">
                        {formatRupiah((it.qty || 0) * (it.price || 0))}
                      </span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Subtotal, Diskon, Ongkir & Total */}
                <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2 text-xs">
                  <div className="flex justify-between text-neutral-600">
                    <span>Subtotal:</span>
                    <span className="font-semibold">{formatRupiah(calculateSubtotal())}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>Potongan Diskon (Rp):</span>
                    <input
                      type="number"
                      min="0"
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                      className="w-32 px-2 py-1 border border-neutral-300 rounded-lg text-right"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>Ongkos Kirim (Rp):</span>
                    <input
                      type="number"
                      min="0"
                      value={shipping}
                      onChange={(e) => setShipping(Number(e.target.value))}
                      className="w-32 px-2 py-1 border border-neutral-300 rounded-lg text-right"
                    />
                  </div>
                  <div className="pt-2 border-t border-neutral-300 flex justify-between font-bold text-neutral-900 text-sm">
                    <span>Total Tagihan:</span>
                    <span className="text-[#ff1b1b]">{formatRupiah(calculateTotal())}</span>
                  </div>
                </div>

                {/* Optional Initial Payment (DP) */}
                <div className="mt-4 p-4 bg-blue-50/50 rounded-xl border border-blue-200 space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-bold text-blue-900">Input Pembayaran Awal / DP (Opsional):</span>
                    <input
                      type="number"
                      min="0"
                      max={calculateTotal()}
                      value={initialPayment}
                      onChange={(e) => setInitialPayment(Number(e.target.value))}
                      className="w-36 px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-right font-bold text-blue-900"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-100 text-neutral-700 font-bold uppercase"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingInvoice}
                  className="px-6 py-2 rounded-xl bg-[#ff1b1b] hover:bg-[#e01616] text-white font-bold uppercase disabled:opacity-50"
                >
                  {isSubmittingInvoice ? 'Menerbitkan...' : 'Terbitkan Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Input Pembayaran & Terbitkan Kwitansi */}
      {paymentModalOpen && targetInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setPaymentModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black uppercase text-neutral-900 mb-1">
              Input Pembayaran
            </h3>
            <p className="text-xs text-neutral-500 mb-4">
              {targetInvoice.invoice_no} · {targetInvoice.customer}
            </p>

            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 mb-4 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-neutral-500">Total Invoice:</span>
                <span className="font-bold">{formatRupiah(targetInvoice.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Sudah Terbayar:</span>
                <span className="font-bold text-[#13a45a]">{formatRupiah(targetInvoice.paid)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-neutral-200">
                <span className="font-bold text-neutral-700">Sisa Tagihan:</span>
                <span className="font-black text-[#ff1b1b]">{formatRupiah(targetInvoice.balance)}</span>
              </div>
            </div>

            <form onSubmit={handleSubmitPayment} className="space-y-4 text-xs">
              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Nominal Pembayaran (Rp)</label>
                <input
                  type="number"
                  min="1"
                  max={targetInvoice.balance}
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl font-bold text-neutral-900 text-sm"
                />
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Tanggal Pembayaran</label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Metode Pembayaran</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl bg-white"
                >
                  <option value="Transfer Bank BCA">Transfer Bank BCA</option>
                  <option value="Transfer Bank Mandiri">Transfer Bank Mandiri</option>
                  <option value="Transfer Bank BRI">Transfer Bank BRI</option>
                  <option value="Tunai / Cash">Tunai / Cash</option>
                  <option value="QRIS">QRIS</option>
                </select>
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Catatan / Keterangan</label>
                <input
                  type="text"
                  placeholder="Contoh: Pelunasan sisa tagihan 50%"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div className="pt-3 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-100 text-neutral-700 font-bold uppercase"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="px-5 py-2 rounded-xl bg-[#13a45a] hover:bg-emerald-600 text-white font-bold uppercase disabled:opacity-50"
                >
                  {isSubmittingPayment ? 'Memproses...' : 'Simpan & Terbitkan Kwitansi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
