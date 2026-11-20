import React, { useState } from 'react';
import { apiClient, formatRupiah } from '../../api/client';
import { RawMaterial, OrderType, OrderTypeMaterial } from '../../types';
import {
  Boxes,
  Plus,
  Trash2,
  Edit2,
  X,
  Layers,
  Calculator
} from 'lucide-react';

interface OrderTypesViewProps {
  rawMaterials: RawMaterial[];
  orderTypes: OrderType[];
  onRefreshAll: () => void;
}

export const OrderTypesView: React.FC<OrderTypesViewProps> = ({
  rawMaterials,
  orderTypes,
  onRefreshAll,
}) => {
  // Raw Material Modal state
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<RawMaterial | null>(null);
  const [materialName, setMaterialName] = useState('');
  const [materialUnit, setMaterialUnit] = useState('meter');
  const [materialCost, setMaterialCost] = useState(0);
  const [isSavingMaterial, setIsSavingMaterial] = useState(false);

  // Order Type Modal state
  const [orderTypeModalOpen, setOrderTypeModalOpen] = useState(false);
  const [editingOrderType, setEditingOrderType] = useState<OrderType | null>(null);
  const [otName, setOtName] = useState('');
  const [otPrice, setOtPrice] = useState(0);
  const [otMaterials, setOtMaterials] = useState<
    Array<{ raw_material_id: number; qty_required: number }>
  >([]);
  const [isSavingOrderType, setIsSavingOrderType] = useState(false);

  // --- RAW MATERIALS ACTIONS ---
  const handleOpenMaterialModal = (item?: RawMaterial) => {
    if (item) {
      setEditingMaterial(item);
      setMaterialName(item.name);
      setMaterialUnit(item.unit);
      setMaterialCost(item.cost_per_unit);
    } else {
      setEditingMaterial(null);
      setMaterialName('');
      setMaterialUnit('meter');
      setMaterialCost(0);
    }
    setMaterialModalOpen(true);
  };

  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingMaterial(true);

    try {
      if (editingMaterial) {
        await apiClient(`/api/admin/raw-materials/${editingMaterial.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: materialName.trim(),
            unit: materialUnit.trim(),
            cost_per_unit: Number(materialCost),
          }),
        });
        alert('Bahan baku berhasil diperbarui.');
      } else {
        await apiClient('/api/admin/raw-materials', {
          method: 'POST',
          body: JSON.stringify({
            name: materialName.trim(),
            unit: materialUnit.trim(),
            cost_per_unit: Number(materialCost),
          }),
        });
        alert('Bahan baku berhasil ditambahkan.');
      }
      setMaterialModalOpen(false);
      onRefreshAll();
    } catch (err: any) {
      alert('Gagal simpan bahan baku: ' + err.message);
    } finally {
      setIsSavingMaterial(false);
    }
  };

  const handleDeleteMaterial = async (id: number, name: string) => {
    if (!window.confirm(`Hapus bahan baku "${name}"?`)) return;
    try {
      await apiClient(`/api/admin/raw-materials/${id}`, { method: 'DELETE' });
      alert('Bahan baku berhasil dihapus.');
      onRefreshAll();
    } catch (err: any) {
      alert('Gagal hapus: ' + err.message);
    }
  };

  // --- ORDER TYPES ACTIONS ---
  const handleOpenOrderTypeModal = (item?: OrderType) => {
    if (item) {
      setEditingOrderType(item);
      setOtName(item.name);
      setOtPrice(item.selling_price);
      setOtMaterials(
        (item.materials || []).map((m) => ({
          raw_material_id: m.raw_material_id,
          qty_required: m.qty_required,
        }))
      );
    } else {
      setEditingOrderType(null);
      setOtName('');
      setOtPrice(0);
      setOtMaterials([]);
    }
    setOrderTypeModalOpen(true);
  };

  const handleAddMaterialRow = () => {
    if (rawMaterials.length === 0) {
      alert('Silakan buat Bahan Baku terlebih dahulu sebelum menambahkannya ke Jenis Order.');
      return;
    }
    setOtMaterials([...otMaterials, { raw_material_id: rawMaterials[0].id, qty_required: 1 }]);
  };

  const handleUpdateMaterialRow = (
    index: number,
    field: 'raw_material_id' | 'qty_required',
    val: number
  ) => {
    const updated = [...otMaterials];
    updated[index] = { ...updated[index], [field]: val };
    setOtMaterials(updated);
  };

  const handleRemoveMaterialRow = (index: number) => {
    setOtMaterials(otMaterials.filter((_, idx) => idx !== index));
  };

  // Compute calculated HPP live
  const calculateTotalHpp = () => {
    return otMaterials.reduce((sum, row) => {
      const mat = rawMaterials.find((m) => m.id === row.raw_material_id);
      const cost = mat ? mat.cost_per_unit : 0;
      return sum + cost * (row.qty_required || 0);
    }, 0);
  };

  const handleSaveOrderType = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingOrderType(true);

    try {
      const payload = {
        name: otName.trim(),
        selling_price: Number(otPrice),
        materials: otMaterials.map((m) => ({
          raw_material_id: Number(m.raw_material_id),
          qty_required: Number(m.qty_required),
        })),
      };

      if (editingOrderType) {
        await apiClient(`/api/admin/order-types/${editingOrderType.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        alert('Jenis order berhasil diperbarui.');
      } else {
        await apiClient('/api/admin/order-types', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        alert('Jenis order berhasil ditambahkan.');
      }
      setOrderTypeModalOpen(false);
      onRefreshAll();
    } catch (err: any) {
      alert('Gagal simpan jenis order: ' + err.message);
    } finally {
      setIsSavingOrderType(false);
    }
  };

  const handleDeleteOrderType = async (id: number, name: string) => {
    if (!window.confirm(`Hapus jenis order "${name}"?`)) return;
    try {
      await apiClient(`/api/admin/order-types/${id}`, { method: 'DELETE' });
      alert('Jenis order berhasil dihapus.');
      onRefreshAll();
    } catch (err: any) {
      alert('Gagal hapus: ' + err.message);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-black uppercase text-neutral-900 tracking-tight">
          Manajemen Bahan Baku & Jenis Order
        </h2>
        <p className="text-neutral-500 text-xs">
          Hitung HPP otomatis dari rincian bahan baku kain, tinta sublimasi, benang, dan aksesoris.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Panel 1: Raw Materials (Bahan Baku) */}
        <div className="lg:col-span-5 bg-white border border-[#d8d5ce] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-neutral-900 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-[#ff1b1b]" />
                <span>Bahan Baku ({rawMaterials.length})</span>
              </h3>
              <p className="text-[11px] text-neutral-400">Komponen material dasar</p>
            </div>
            <button
              onClick={() => handleOpenMaterialModal()}
              className="px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold uppercase transition flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah</span>
            </button>
          </div>

          <div className="divide-y divide-neutral-100 max-h-96 overflow-y-auto">
            {rawMaterials.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-400">
                Belum ada bahan baku tercatat.
              </div>
            ) : (
              rawMaterials.map((mat) => (
                <div key={mat.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <strong className="text-neutral-900 font-bold block">{mat.name}</strong>
                    <span className="text-neutral-500 text-[11px]">
                      {formatRupiah(mat.cost_per_unit)} / {mat.unit}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenMaterialModal(mat)}
                      className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-600"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteMaterial(mat.id, mat.name)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Panel 2: Order Types (Jenis Order) */}
        <div className="lg:col-span-7 bg-white border border-[#d8d5ce] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-neutral-900 flex items-center gap-1.5">
                <Boxes className="w-4 h-4 text-[#ff1b1b]" />
                <span>Jenis Order & Komposisi HPP ({orderTypes.length})</span>
              </h3>
              <p className="text-[11px] text-neutral-400">Preset produk dan kalkulasi biaya produksi</p>
            </div>
            <button
              onClick={() => handleOpenOrderTypeModal()}
              className="px-3.5 py-1.5 rounded-xl bg-[#ff1b1b] hover:bg-[#e01616] text-white text-xs font-bold uppercase transition flex items-center gap-1 shadow-md shadow-[#ff1b1b]/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Buat Jenis Order</span>
            </button>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {orderTypes.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-400">
                Belum ada jenis order tercatat.
              </div>
            ) : (
              orderTypes.map((ot) => (
                <div key={ot.id} className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 text-xs">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <strong className="text-sm font-bold text-neutral-900 block">{ot.name}</strong>
                      <span className="text-neutral-500">
                        Harga Jual: <strong className="text-neutral-800">{formatRupiah(ot.selling_price)}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenOrderTypeModal(ot)}
                        className="p-1.5 rounded-lg hover:bg-neutral-200 text-neutral-600"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteOrderType(ot.id, ot.name)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white border border-neutral-200 mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-neutral-500">
                      Komposisi Bahan: {ot.materials?.length || 0} jenis
                    </span>
                    <span className="font-bold text-[#d4af37]">
                      HPP Total: {formatRupiah(ot.total_hpp || 0)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal: Tambah/Edit Bahan Baku */}
      {materialModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setMaterialModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black uppercase text-neutral-900 mb-1">
              {editingMaterial ? 'Edit Bahan Baku' : 'Tambah Bahan Baku'}
            </h3>
            <p className="text-xs text-neutral-500 mb-4">Input data bahan baku kain atau aksesoris.</p>

            <form onSubmit={handleSaveMaterial} className="space-y-4 text-xs">
              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Nama Bahan</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Kain Dryfit Hexagon"
                  value={materialName}
                  onChange={(e) => setMaterialName(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Satuan</label>
                <input
                  type="text"
                  required
                  placeholder="meter / kg / pcs / roll"
                  value={materialUnit}
                  onChange={(e) => setMaterialUnit(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block uppercase font-bold text-neutral-600 mb-1">Biaya Pokok per Satuan (Rp)</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={materialCost}
                  onChange={(e) => setMaterialCost(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                />
              </div>

              <div className="pt-3 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setMaterialModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-100 text-neutral-700 font-bold uppercase"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingMaterial}
                  className="px-5 py-2 rounded-xl bg-[#ff1b1b] hover:bg-[#e01616] text-white font-bold uppercase disabled:opacity-50"
                >
                  {isSavingMaterial ? 'Menyimpan...' : 'Simpan Bahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Tambah/Edit Jenis Order */}
      {orderTypeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <button
              onClick={() => setOrderTypeModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black uppercase text-neutral-900 mb-1">
              {editingOrderType ? 'Edit Jenis Order' : 'Buat Jenis Order Baru'}
            </h3>
            <p className="text-xs text-neutral-500 mb-4">
              Konfigurasikan komposisi bahan untuk menghasilkan kalkulasi HPP otomatis.
            </p>

            <form onSubmit={handleSaveOrderType} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">Nama Jenis Order</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Jersey Futsal Full Printing"
                    value={otName}
                    onChange={(e) => setOtName(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block uppercase font-bold text-neutral-600 mb-1">Harga Jual Standar (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={otPrice}
                    onChange={(e) => setOtPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl"
                  />
                </div>
              </div>

              {/* Composition of Raw Materials */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block uppercase font-bold text-neutral-700">Komposisi Bahan Baku</label>
                  <button
                    type="button"
                    onClick={handleAddMaterialRow}
                    className="text-xs font-bold text-[#ff1b1b] hover:underline"
                  >
                    + Tambah Bahan
                  </button>
                </div>

                <div className="space-y-2 mb-3">
                  {otMaterials.length === 0 ? (
                    <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 text-center text-neutral-400">
                      Belum ada komposisi bahan baku ditambahkan.
                    </div>
                  ) : (
                    otMaterials.map((row, idx) => {
                      const mat = rawMaterials.find((m) => m.id === row.raw_material_id);
                      return (
                        <div key={idx} className="flex items-center gap-2 p-2 bg-neutral-50 rounded-xl border border-neutral-200">
                          <select
                            value={row.raw_material_id}
                            onChange={(e) => handleUpdateMaterialRow(idx, 'raw_material_id', Number(e.target.value))}
                            className="flex-1 px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs"
                          >
                            {rawMaterials.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({formatRupiah(m.cost_per_unit)}/{m.unit})
                              </option>
                            ))}
                          </select>

                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={row.qty_required}
                            onChange={(e) => handleUpdateMaterialRow(idx, 'qty_required', Number(e.target.value))}
                            placeholder="Qty"
                            className="w-20 px-2 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs"
                          />

                          <span className="text-[11px] text-neutral-500 w-12">
                            {mat?.unit || 'unit'}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleRemoveMaterialRow(idx)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Total HPP preview */}
                <div className="p-3 rounded-xl bg-[#101011] text-white flex items-center justify-between">
                  <span className="text-[11px] uppercase font-bold text-neutral-400">Total HPP per Pcs:</span>
                  <strong className="text-sm font-bold text-[#d4af37]">
                    {formatRupiah(calculateTotalHpp())}
                  </strong>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOrderTypeModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-100 text-neutral-700 font-bold uppercase"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingOrderType}
                  className="px-5 py-2 rounded-xl bg-[#ff1b1b] hover:bg-[#e01616] text-white font-bold uppercase disabled:opacity-50"
                >
                  {isSavingOrderType ? 'Menyimpan...' : 'Simpan Jenis Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
