import React, { useState, useEffect } from "react";
import { Item, Customer } from "../types";
import { db } from "../utils/db";
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  User,
  ShoppingBag,
  X,
  Check,
  RefreshCw,
} from "lucide-react";

export default function DatabaseManager() {
  const [activeTab, setActiveTab] = useState<"items" | "customers">("items");

  // Database States
  const [items, setItems] = useState<Item[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(
    null,
  );

  // Form States
  const [itemName, setItemName] = useState("");
  const [itemUnit, setItemUnit] = useState("kg");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  useEffect(() => {
    handleRefresh();
  }, []);

  const handleRefresh = async () => {
    setItems(await db.getItems());
    setCustomers(await db.getCustomers());
  };

  const handleOpenAddItem = () => {
    setEditingItemId(null);
    setItemName("");
    setItemUnit("kg");
    setIsOpenModal(true);
  };

  const handleOpenEditItem = (item: Item) => {
    setEditingItemId(item.id);
    setItemName(item.name);
    setItemUnit(item.unit);
    setIsOpenModal(true);
  };

  const handleOpenAddCustomer = () => {
    setEditingCustomerId(null);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setIsOpenModal(true);
  };

  const handleOpenEditCustomer = (cust: Customer) => {
    setEditingCustomerId(cust.id);
    setCustomerName(cust.name);
    setCustomerPhone(cust.phone || "");
    setCustomerAddress(cust.address || "");
    setIsOpenModal(true);
  };

  const handleDeleteItem = async (id: string, name: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus produk "${name}"?`)) {
      await db.deleteItem(id);
      setItems(await db.getItems());
    }
  };

  const handleDeleteCustomer = async (id: string, name: string) => {
    if (name.toLowerCase() === "pelanggan umum") {
      alert("Pelanggan Umum tidak dapat dihapus.");
      return;
    }
    if (confirm(`Apakah Anda yakin ingin menghapus pelanggan "${name}"?`)) {
      await db.deleteCustomer(id);
      setCustomers(await db.getCustomers());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (activeTab === "items") {
      if (!itemName.trim()) return;
      const newItem: Item = {
        id: editingItemId || `item-${Date.now()}`,
        name: itemName.trim(),
        unit: itemUnit.trim() || "kg",
        createdAt: editingItemId
          ? items.find((i) => i.id === editingItemId)?.createdAt ||
            new Date().toISOString()
          : new Date().toISOString(),
      };
      await db.saveItem(newItem);
      setItems(await db.getItems());
    } else {
      if (!customerName.trim()) return;
      const newCustomer: Customer = {
        id: editingCustomerId || `cust-${Date.now()}`,
        name: customerName.trim(),
        phone: customerPhone.trim() || "-",
        address: customerAddress.trim() || "-",
        createdAt: editingCustomerId
          ? customers.find((c) => c.id === editingCustomerId)?.createdAt ||
            new Date().toISOString()
          : new Date().toISOString(),
      };
      await db.saveCustomer(newCustomer);
      setCustomers(await db.getCustomers());
    }

    setIsOpenModal(false);
  };

  // Filter lists based on search query
  const filteredItems = items.filter(
    (item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.unit.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredCustomers = customers.filter(
    (cust) =>
      cust.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (cust.phone && cust.phone.includes(searchQuery)) ||
      (cust.address &&
        cust.address.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  return (
    <div className="space-y-6">
      {/* Page Title & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 tracking-tight uppercase">
            Database Master
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Kelola data produk ayam dan mitra pelanggan aktif
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="inline-flex rounded-xl bg-slate-100 p-1 self-start">
          <button
            id="tab-items-btn"
            onClick={() => {
              setActiveTab("items");
              setSearchQuery("");
            }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition duration-150 cursor-pointer ${
              activeTab === "items"
                ? "bg-red-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" /> Produk Ayam
          </button>
          <button
            id="tab-customers-btn"
            onClick={() => {
              setActiveTab("customers");
              setSearchQuery("");
            }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition duration-150 cursor-pointer ${
              activeTab === "customers"
                ? "bg-red-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <User className="w-3.5 h-3.5" /> Data Pelanggan
          </button>
        </div>
      </div>

      {/* Control Actions & Search */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch justify-between">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            id="search-database-input"
            type="text"
            placeholder={
              activeTab === "items"
                ? "Cari produk ayam..."
                : "Cari pelanggan..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-xs font-bold text-slate-900 shadow-sm focus:border-red-500 focus:outline-none transition-all duration-200"
          />
        </div>

        {/* Add Button & Refresh Button */}
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-all duration-200 cursor-pointer"
            title="Muat Ulang"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            id="add-entry-btn"
            onClick={
              activeTab === "items" ? handleOpenAddItem : handleOpenAddCustomer
            }
            className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white font-bold text-xs py-2.5 px-4 shadow-md shadow-red-600/10 transition-all duration-200 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Tambah{" "}
            {activeTab === "items" ? "Produk" : "Pelanggan"}
          </button>
        </div>
      </div>

      {/* Data Table / Cards */}
      <div className="bg-white rounded-2xl border border-slate-200/50 shadow-sm overflow-hidden">
        {activeTab === "items" ? (
          /* ITEMS LIST */
          filteredItems.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs font-semibold">
              Tidak ada produk ditemukan.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-400">
                    <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider">
                      Nama Produk
                    </th>
                    <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider">
                      Satuan
                    </th>
                    <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider text-right">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/30 transition-all duration-150"
                    >
                      <td className="py-4 px-6">
                        <div className="font-bold text-slate-900 text-xs sm:text-sm">
                          {item.name}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center rounded-lg bg-red-50 border border-red-100 px-2.5 py-0.5 text-[10px] font-black text-red-700 uppercase tracking-wider">
                          {item.unit}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right space-x-1.5">
                        <button
                          onClick={() => handleOpenEditItem(item)}
                          className="inline-flex rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-[#0b0f19] transition cursor-pointer"
                          title="Ubah"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id, item.name)}
                          className="inline-flex rounded-xl p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 transition cursor-pointer"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : /* CUSTOMERS LIST */
        filteredCustomers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-semibold">
            Tidak ada pelanggan ditemukan.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-400">
                  <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider">
                    Nama Pelanggan
                  </th>
                  <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider">
                    No. Telepon
                  </th>
                  <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider">
                    Alamat
                  </th>
                  <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider text-right">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((cust) => (
                  <tr
                    key={cust.id}
                    className="hover:bg-slate-50/30 transition-all duration-150"
                  >
                    <td className="py-4 px-6">
                      <div className="font-bold text-slate-900 text-xs sm:text-sm">
                        {cust.name}
                      </div>
                      {cust.name.toLowerCase() === "pelanggan umum" && (
                        <span className="text-[10px] text-slate-400 font-bold italic mt-0.5 block">
                          Sistem Default
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-xs text-slate-600 font-semibold">
                      {cust.phone || "-"}
                    </td>
                    <td className="py-4 px-6 text-xs text-slate-600 font-semibold max-w-[200px] truncate">
                      {cust.address || "-"}
                    </td>
                    <td className="py-4 px-6 text-right space-x-1.5">
                      <button
                        onClick={() => handleOpenEditCustomer(cust)}
                        className="inline-flex rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-[#0b0f19] transition cursor-pointer"
                        title="Ubah"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {cust.name.toLowerCase() !== "pelanggan umum" && (
                        <button
                          onClick={() =>
                            handleDeleteCustomer(cust.id, cust.name)
                          }
                          className="inline-flex rounded-xl p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 transition cursor-pointer"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {isOpenModal && (
        <div
          id="db-modal-container"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl relative border-t-4 border-red-600 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-extrabold uppercase tracking-wide text-slate-900 text-xs">
                {activeTab === "items"
                  ? editingItemId
                    ? "Ubah Data Produk Ayam"
                    : "Tambah Produk Ayam Baru"
                  : editingCustomerId
                    ? "Ubah Data Pelanggan"
                    : "Tambah Pelanggan Baru"}
              </h3>
              <button
                onClick={() => setIsOpenModal(false)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {activeTab === "items" ? (
                /* ITEMS FORM */
                <>
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">
                      Nama Produk Ayam <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="item-name-input"
                      type="text"
                      required
                      placeholder="Contoh: Ayam Broiler Utuh, Fillet Dada, etc."
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none transition-all duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">
                      Satuan Produk <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="item-unit-select"
                      value={itemUnit}
                      onChange={(e) => setItemUnit(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none transition-all duration-200"
                    >
                      <option value="kg">Kilogram (kg)</option>
                      <option value="ekor">Ekor</option>
                      <option value="pasang">Pasang (untuk Ati Ampela)</option>
                      <option value="box">Box</option>
                      <option value="pack">Pack</option>
                    </select>
                  </div>
                </>
              ) : (
                /* CUSTOMERS FORM */
                <>
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">
                      Nama Pelanggan / Toko{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="customer-name-input"
                      type="text"
                      required
                      placeholder="Contoh: Warung Bakso Pak No, Bu Sri, etc."
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none transition-all duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">
                      No. Telepon / HP
                    </label>
                    <input
                      id="customer-phone-input"
                      type="text"
                      placeholder="Contoh: 081234xxxxxx"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none transition-all duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">
                      Alamat Lengkap
                    </label>
                    <textarea
                      id="customer-address-input"
                      placeholder="Contoh: Pasar Baru blok C no. 4"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none resize-none transition-all duration-200"
                    />
                  </div>
                </>
              )}

              {/* Form Buttons */}
              <div className="flex gap-2 justify-end pt-3 border-t border-slate-50 mt-4">
                <button
                  type="button"
                  onClick={() => setIsOpenModal(false)}
                  className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 text-xs font-bold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  id="submit-db-btn"
                  type="submit"
                  className="rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white px-4 py-2.5 text-xs font-bold shadow-md shadow-red-600/10 transition-all duration-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" /> Simpan Data
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
