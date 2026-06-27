import React, { useState, useEffect } from "react";
import {
  Customer,
  Transaction,
  DebtPayment,
  CustomerDebtSummary,
} from "../types";
import { db } from "../utils/db";
import { formatRupiah, formatDate, downloadFile } from "../utils/format";
import {
  Search,
  Wallet,
  FileText,
  User,
  ArrowLeft,
  History,
  Plus,
  DollarSign,
  Download,
  RefreshCw,
  Calendar,
  Check,
  BookOpen,
} from "lucide-react";
import { jsPDF } from "jspdf";

export default function DebtLedger() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debtPayments, setDebtPayments] = useState<DebtPayment[]>([]);
  const [debtSummaries, setDebtSummaries] = useState<CustomerDebtSummary[]>([]);

  const [searchQuery, setSearchQuery] = useState("");

  // Selected customer for Ledger Detail view
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [ledgerSubTab, setLedgerSubTab] = useState<"all" | "unpaid">("all");

  // Ledger date filters
  const [ledgerStartDate, setLedgerStartDate] = useState("");
  const [ledgerEndDate, setLedgerEndDate] = useState("");

  // Repayment form state
  const [isRepaying, setIsRepaying] = useState(false);
  const [repayTxId, setRepayTxId] = useState("");
  const [repayAmount, setRepayAmount] = useState<number | "">("");
  const [repayMethod, setRepayMethod] = useState<"cash" | "transfer">("cash");
  const [repayNotes, setRepayNotes] = useState("");

  // Reload everything from DB
  const loadData = async () => {
    setCustomers(await db.getCustomers());
    setTransactions(await db.getTransactions());
    setDebtPayments(await db.getDebtPayments());
    setDebtSummaries(await db.getCustomerDebtSummaries());
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    loadData();
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const selectedSummary = debtSummaries.find(
    (s) => s.customerId === selectedCustomerId,
  );

  // Filter transactions and payments for the selected customer
  const customerInvoices = transactions.filter(
    (t) => t.customerId === selectedCustomerId && t.paymentMethod === "debt",
  );

  const customerPayments = debtPayments.filter(
    (p) => p.customerId === selectedCustomerId,
  );

  // Filter all transactions for this customer (to include cash/transfer and debt)
  const customerTransactions = transactions.filter(
    (t) => t.customerId === selectedCustomerId,
  );

  // Combine sales and payments chronologically into a running-balanced ledger
  const { ledgerEntries, openingBalance } = (() => {
    if (!selectedCustomerId) return { ledgerEntries: [], openingBalance: 0 };

    const temp: any[] = [];

    // Add sales transactions
    customerTransactions.forEach((tx) => {
      temp.push({
        id: tx.id,
        date: tx.date,
        type: "sale",
        reference: tx.invoiceNumber,
        paymentMethod: tx.paymentMethod,
        description: tx.items.map((i) => `${i.quantity} ${i.unit}`).join(", "),
        debit: tx.totalAmount,
        credit: tx.amountPaid, // amount paid initially
      });
    });

    // Add payments
    customerPayments.forEach((pay) => {
      temp.push({
        id: pay.id,
        date: pay.date,
        type: "payment",
        reference: pay.invoiceNumber,
        paymentMethod: pay.paymentMethod,
        description: pay.notes || "Pembayaran Setoran",
        debit: 0,
        credit: pay.amountPaid,
      });
    });

    // Sort chronologically
    temp.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    let currentBalance = 0;
    let openingBal = 0;
    const finalEntries: any[] = [];

    const startTs = ledgerStartDate ? new Date(ledgerStartDate).getTime() : 0;
    // For end date, push it to the end of the day if provided
    const endTs = ledgerEndDate
      ? new Date(ledgerEndDate + "T23:59:59.999").getTime()
      : Infinity;

    temp.forEach((entry) => {
      const entryTs = new Date(entry.date).getTime();

      if (entryTs < startTs) {
        openingBal += entry.debit - entry.credit;
        currentBalance = openingBal;
      } else if (entryTs <= endTs) {
        currentBalance += entry.debit - entry.credit;
        finalEntries.push({
          ...entry,
          runningBalance: currentBalance,
        });
      }
    });

    return { ledgerEntries: finalEntries, openingBalance: openingBal };
  })();

  // Unpaid invoices (where remainingDebt > 0)
  const unpaidInvoices = customerInvoices.filter((t) => t.remainingDebt > 0);

  // Filter the customers list on the main ledger dashboard
  const filteredSummaries = debtSummaries.filter(
    (summary) =>
      summary.customerName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      summary.customerName.toLowerCase() !== "pelanggan umum", // Hide general/cash customer since they can't have debt
  );

  // Grand total of all outstanding debts
  const totalStoreCredit = debtSummaries.reduce(
    (sum, s) => sum + s.remainingDebt,
    0,
  );

  const handleOpenCustomerRepay = () => {
    if (!selectedSummary) return;
    setRepayAmount(selectedSummary.remainingDebt); // Default to paying off the total remaining debt
    setRepayMethod("cash");
    setRepayNotes("");
    setIsRepaying(true);

    // Smooth scroll to repayment form container
    setTimeout(() => {
      const element = document.getElementById("repay-form-container");
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  };

  const handleOpenRepay = (txId: string) => {
    const tx = transactions.find((t) => t.id === txId);
    if (!tx) return;
    setRepayAmount(tx.remainingDebt); // Default to paying off the remaining debt of this specific invoice
    setRepayMethod("cash");
    setRepayNotes(`Cicilan untuk nota ${tx.invoiceNumber}`);
    setIsRepaying(true);

    // Smooth scroll to repayment form container
    setTimeout(() => {
      const element = document.getElementById("repay-form-container");
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  };

  const handleDirectCustomerRepay = (summary: CustomerDebtSummary) => {
    setSelectedCustomerId(summary.customerId);
    setRepayAmount(summary.remainingDebt); // Default to paying off the total remaining debt
    setRepayMethod("cash");
    setRepayNotes("");
    setIsRepaying(true);

    // Smooth scroll to repayment form container
    setTimeout(() => {
      const element = document.getElementById("repay-form-container");
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);
  };

  const handleSubmitRepayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !selectedCustomerId ||
      !selectedSummary ||
      !repayAmount ||
      Number(repayAmount) <= 0
    ) {
      alert("Silakan masukkan jumlah pembayaran yang valid.");
      return;
    }

    if (Number(repayAmount) > selectedSummary.remainingDebt) {
      alert(
        `Jumlah bayar (${formatRupiah(Number(repayAmount))}) tidak boleh melebihi sisa utang pelanggan (${formatRupiah(selectedSummary.remainingDebt)}).`,
      );
      return;
    }

    // Save payment to DB using customer-wide FIFO distribution
    await db.saveCustomerPayment(
      selectedCustomerId,
      Number(repayAmount),
      repayMethod,
      repayNotes.trim(),
    );

    // Refresh UI States
    await loadData();
    setIsRepaying(false);
    setRepayAmount("");
    setRepayNotes("");

    alert("Setoran berhasil dicatat!");
  };

  // Export ledger to text file
  const handleDownloadLedger = () => {
    if (!selectedCustomer || !selectedSummary) return;

    const totalPenjualan = ledgerEntries.reduce(
      (sum, entry) => sum + entry.debit,
      0,
    );
    const totalPembayaran = ledgerEntries.reduce(
      (sum, entry) => sum + entry.credit,
      0,
    );

    let txt = `==================================================\n`;
    txt += `          LEDGER PIUTANG / UTANG PELANGGAN\n`;
    txt += `               CV DPJ BERKAH UNGGAS\n`;
    txt += `==================================================\n`;
    txt += `Pelanggan   : ${selectedCustomer.name}\n`;
    txt += `No. Telepon : ${selectedCustomer.phone || "-"}\n`;
    txt += `Alamat      : ${selectedCustomer.address || "-"}\n`;
    txt += `Tanggal Ekspor : ${formatDate(new Date().toISOString())}\n`;
    txt += `--------------------------------------------------\n`;
    txt += `TOTAL PENJUALAN     : ${formatRupiah(totalPenjualan)}\n`;
    txt += `TOTAL PEMBAYARAN    : ${formatRupiah(totalPembayaran)}\n`;
    txt += `SISA UTANG SEKARANG : ${formatRupiah(selectedSummary.remainingDebt)}\n`;
    txt += `==================================================\n\n`;

    txt += `1. DAFTAR NOTA UTANG (INVOICES)\n`;
    txt += `--------------------------------------------------\n`;
    txt += `No. Nota      | Tanggal     | Total Belanja | Sisa Utang\n`;
    txt += `--------------------------------------------------\n`;
    customerInvoices.forEach((tx) => {
      const dateStr = formatDate(tx.date, false);
      const invoiceNo = tx.invoiceNumber.padEnd(13);
      const totalStr = formatRupiah(tx.totalAmount).padStart(13);
      const debtStr = formatRupiah(tx.remainingDebt).padStart(12);
      txt += `${invoiceNo} | ${dateStr.padEnd(11)} | ${totalStr} | ${debtStr}\n`;
    });
    txt += `--------------------------------------------------\n\n`;

    txt += `2. RIWAYAT PEMBAYARAN UTANG (PAYMENTS)\n`;
    txt += `--------------------------------------------------\n`;
    txt += `Tanggal     | No. Nota      | Metode   | Jumlah Bayar\n`;
    txt += `--------------------------------------------------\n`;
    if (customerPayments.length === 0) {
      txt += `Belum ada riwayat pembayaran.\n`;
    } else {
      customerPayments.forEach((pay) => {
        const dateStr = formatDate(pay.date, false);
        const invoiceNo = pay.invoiceNumber.padEnd(13);
        const methodStr = pay.paymentMethod.toUpperCase().padEnd(8);
        const amountStr = formatRupiah(pay.amountPaid).padStart(12);
        txt += `${dateStr.padEnd(11)} | ${invoiceNo} | ${methodStr} | ${amountStr}\n`;
        if (pay.notes) {
          txt += `   Catatan: ${pay.notes}\n`;
        }
      });
    }
    txt += `--------------------------------------------------\n`;
    txt += `\n==================================================\n`;
    txt += `Sistem Kasir CV DPJ Berkah Unggas\n`;
    txt += `==================================================\n`;

    downloadFile(
      txt,
      `Ledger_${selectedCustomer.name.replace(/\s+/g, "_")}.txt`,
      "text/plain",
    );
  };

  const handleDownloadLedgerPDF = async () => {
    if (!selectedCustomer || !selectedSummary) return;

    const totalPenjualan = ledgerEntries.reduce(
      (sum, entry) => sum + entry.debit,
      0,
    );
    const totalPembayaran = ledgerEntries.reduce(
      (sum, entry) => sum + entry.credit,
      0,
    );

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const loadImage = (url: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.src = url;
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
      });

    try {
      const logoImg = await loadImage("/logo.png");
      doc.addImage(logoImg, "PNG", 14, 8, 16, 16);

      // Brand Header
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text("CV DPJ BERKAH UNGGAS", 34, 13);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text("Pusat Grosir & Retail Ayam Segar  •  Halal, Higienis & Berkualitas", 34, 17.5);
      doc.setFontSize(7);
      doc.text("Kp. Pangkalan RT. 010 RW. 004 Desa Pangkalan Kecamatan Bojong Kabupaten Purwakarta", 34, 21.5);
      doc.text("Telp/Hp. +62 877-6908-0999", 34, 25.5);
    } catch (e) {
      // Fallback
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text("CV DPJ BERKAH UNGGAS", 14, 13);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text("Pusat Grosir & Retail Ayam Segar  •  Halal, Higienis & Berkualitas", 14, 17.5);
      doc.setFontSize(7);
      doc.text("Kp. Pangkalan RT. 010 RW. 004 Desa Pangkalan Kecamatan Bojong Kabupaten Purwakarta", 14, 21.5);
      doc.text("Telp/Hp. +62 877-6908-0999", 14, 25.5);
    }

    // Header divider line (red)
    doc.setLineWidth(0.6);
    doc.setDrawColor(220, 38, 38); // red-600
    doc.line(14, 29, 196, 29);

    // Document Title
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("LAPORAN BUKU BESAR PIUTANG (LEDGER)", 14, 37);

    // Customer Info Left Panel
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);

    // Safety truncation to avoid overlap with Outstanding Stats Card at x=136
    const limitString = (str: string, maxLen: number) => {
      if (str.length > maxLen) {
        return str.substring(0, maxLen - 3) + "...";
      }
      return str;
    };

    const cleanPhone = selectedCustomer.phone || "-";
    const cleanAddress = selectedCustomer.address || "-";

    doc.text(
      `Nama Pelanggan  : ${limitString(selectedCustomer.name, 45)}`,
      14,
      44,
    );
    doc.text(`No. Telepon     : ${limitString(cleanPhone, 45)}`, 14, 49);
    doc.text(`Alamat          : ${limitString(cleanAddress, 55)}`, 14, 54);
    doc.text(
      `Tanggal Unduh   : ${formatDate(new Date().toISOString(), true)}`,
      14,
      59,
    );

    // Outstanding Stats Card Right Panel (Clean and simple card displaying only Total Outstanding Debt)
    doc.setFillColor(254, 242, 242); // soft red-50
    doc.rect(136, 42, 60, 19, "F");
    doc.setDrawColor(254, 202, 202); // red-200
    doc.setLineWidth(0.3);
    doc.rect(136, 42, 60, 19, "D");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(220, 38, 38); // red-600
    doc.text("TOTAL SISA PIUTANG TEMPO", 140, 47);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(13);
    doc.text(formatRupiah(selectedSummary.remainingDebt), 140, 55);

    // Table Headers
    const tableY = 69;
    doc.setFillColor(15, 23, 42); // slate-900 header
    doc.rect(14, tableY, 182, 8, "F");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);

    // Print header labels
    doc.text("Tanggal", 16, tableY + 5.5);
    doc.text("Ref / Nota", 50, tableY + 5.5);
    doc.text("Tipe", 92, tableY + 5.5);
    doc.text("Debit (+)", 145, tableY + 5.5, { align: "right" });
    doc.text("Kredit (-)", 169, tableY + 5.5, { align: "right" });
    doc.text("Saldo Utang", 194, tableY + 5.5, { align: "right" });

    // Table rows
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);

    let y = tableY + 13;
    const pageBottom = 275;

    // Add Saldo Awal row if ledgerStartDate exists
    if (ledgerStartDate) {
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(formatDate(ledgerStartDate, false), 16, y);
      doc.text("-", 50, y);
      doc.text("Saldo Awal", 92, y);
      doc.text("-", 145, y, { align: "right" });
      doc.text("-", 169, y, { align: "right" });
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(formatRupiah(openingBalance), 194, y, { align: "right" });
      y += 6;
      doc.setDrawColor(241, 245, 249); // slate-100
      doc.setLineWidth(0.2);
      doc.line(14, y - 2.5, 196, y - 2.5);
    }

    ledgerEntries.forEach((entry, idx) => {
      // Auto page break
      if (y > pageBottom) {
        doc.addPage();

        // Redraw Header on new page
        doc.setFillColor(15, 23, 42);
        doc.rect(14, 15, 182, 8, "F");
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        doc.text("Tanggal", 16, 20.5);
        doc.text("Ref / Nota", 50, 20.5);
        doc.text("Tipe", 92, 20.5);
        doc.text("Debit (+)", 145, 20.5, { align: "right" });
        doc.text("Kredit (-)", 169, 20.5, { align: "right" });
        doc.text("Saldo Utang", 194, 20.5, { align: "right" });

        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        y = 28;
      }

      // Row Background shading
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252); // slate-50
        doc.rect(14, y - 4, 182, 6, "F");
      }

      // Render columns
      doc.setFont("Helvetica", "normal");
      doc.text(formatDate(entry.date, false), 16, y);
      doc.text(entry.reference, 50, y);

      const typeStr =
        entry.type === "sale"
          ? entry.paymentMethod === "debt"
            ? "Penjualan (Tempo)"
            : "Penjualan (Tunai)"
          : "Setoran Cicilan";
      doc.text(typeStr, 92, y);

      const debitText = entry.debit > 0 ? formatRupiah(entry.debit) : "-";
      doc.text(debitText, 145, y, { align: "right" });

      const creditText = entry.credit > 0 ? formatRupiah(entry.credit) : "-";
      doc.text(creditText, 169, y, { align: "right" });

      const balanceText = formatRupiah(entry.runningBalance);
      doc.setFont("Helvetica", "bold");
      doc.text(balanceText, 194, y, { align: "right" });

      y += 6;
    });

    // Decorative end separator or summary row page overflow check
    if (y + 15 > pageBottom) {
      doc.addPage();
      y = 20;
    }

    // Summary row at the bottom of the table (Accrued totals)
    doc.setLineWidth(0.4);
    doc.setDrawColor(15, 23, 42); // slate-900 line
    doc.line(14, y + 1, 196, y + 1);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text("TOTAL AKUMULASI", 50, y + 5);

    doc.text(formatRupiah(totalPenjualan), 145, y + 5, { align: "right" });
    doc.text(formatRupiah(totalPembayaran), 169, y + 5, { align: "right" });
    doc.text(formatRupiah(selectedSummary.remainingDebt), 194, y + 5, {
      align: "right",
    });

    // Double lines below the summary row
    doc.setLineWidth(0.3);
    doc.line(14, y + 7, 196, y + 7);
    doc.line(14, y + 7.8, 196, y + 7.8);

    y += 13;

    // Check if the Bank info + footer will overflow
    if (y + 35 > pageBottom) {
      doc.addPage();
      y = 15;
    }

    // Draw Bank Accounts Panel
    doc.setFillColor(248, 250, 252); // slate-50 background for bank info
    doc.rect(14, y + 2, 182, 14, "F");
    doc.setDrawColor(226, 232, 240); // slate-200 border
    doc.setLineWidth(0.2);
    doc.rect(14, y + 2, 182, 14, "D");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text("INFO REKENING PEMBAYARAN (A/N PANJI PARANANTIAS MULYONO) :", 18, y + 6);

    doc.setFont("Helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("BCA: 7410888879", 18, y + 12);
    doc.text("BRI: 007501001986565", 70, y + 12);
    doc.text("MANDIRI: 173008118881", 130, y + 12);

    y += 18;

    // Check footer page overflow
    if (y + 15 > pageBottom) {
      doc.addPage();
      y = 15;
    }

    doc.setLineWidth(0.3);
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.line(14, y + 2, 196, y + 2);

    doc.setFont("Helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(
      "Laporan ini adalah dokumen digital resmi yang diterbitkan oleh CV DPJ Berkah Unggas.",
      14,
      y + 8,
    );
    doc.text(
      "Silakan hubungi bagian keuangan jika terdapat ketidakcocokan saldo.",
      14,
      y + 12,
    );

    doc.save(
      `Ledger_BukuBesar_${selectedCustomer.name.replace(/\s+/g, "_")}.pdf`,
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. LEDGER DETAIL SCREEN FOR SELECTED CUSTOMER */}
      {selectedCustomerId ? (
        <div className="space-y-6">
          {/* Back Navigation Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setSelectedCustomerId(null);
                  setIsRepaying(false);
                }}
                className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2 uppercase">
                  <User className="text-red-600 w-4 h-4" /> Ledger{" "}
                  {selectedCustomer?.name}
                </h2>
                <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                  Telepon: {selectedCustomer?.phone || "-"} • Alamat:{" "}
                  {selectedCustomer?.address || "-"}
                </p>
              </div>
            </div>

            {/* Actions for Ledger */}
            <div className="flex gap-2">
              <button
                id="download-ledger-pdf-btn"
                onClick={handleDownloadLedgerPDF}
                className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs py-2.5 px-4 shadow-sm transition-all duration-200 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" /> Download PDF
              </button>

              <button
                id="download-ledger-btn"
                onClick={handleDownloadLedger}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs py-2.5 px-4 shadow-sm transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Download TXT
              </button>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-red-500/[0.03] border border-red-500/15 rounded-2xl p-5 shadow-sm">
              <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">
                Total Sisa Utang
              </span>
              <h3 className="text-2xl font-black text-red-600 mt-1 font-mono">
                {formatRupiah(selectedSummary?.remainingDebt || 0)}
              </h3>
              <p className="text-[10px] text-red-500/70 font-bold mt-1">
                Harus segera ditagih / dilunasi
              </p>
            </div>
            <div className="bg-emerald-500/[0.03] border border-emerald-500/15 rounded-2xl p-5 shadow-sm">
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                Total Sudah Dibayar
              </span>
              <h3 className="text-2xl font-black text-emerald-600 mt-1 font-mono">
                {formatRupiah(selectedSummary?.totalPaid || 0)}
              </h3>
              <p className="text-[10px] text-emerald-600/70 font-bold mt-1">
                Dicicil dari seluruh riwayat
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-150 rounded-2xl p-5 shadow-sm">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Aktivitas Terakhir
              </span>
              <h3 className="text-sm font-bold text-slate-800 mt-2">
                {formatDate(selectedSummary?.lastActive || "", false)}
              </h3>
              <p className="text-[10px] text-slate-400 font-semibold mt-1">
                Penjualan atau setoran terakhir
              </p>
            </div>
          </div>

          {/* Ledger Content: Invoices and Repayments */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Outstanding invoices (8 cols) */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200/50 p-5 shadow-sm">
                <h4 className="text-xs font-black text-slate-800 tracking-wider uppercase mb-4 flex items-center gap-1.5 border-b border-slate-50 pb-2">
                  <FileText className="text-red-600 w-4 h-4" /> Daftar Nota
                  Utang (Belum Lunas)
                </h4>

                {unpaidInvoices.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs font-semibold">
                    Luar biasa! Pelanggan ini tidak memiliki tunggakan utang
                    saat ini. 🎉
                  </div>
                ) : (
                  <div className="space-y-3">
                    {unpaidInvoices.map((tx) => (
                      <div
                        key={tx.id}
                        className="border border-slate-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:border-red-500/20 hover:bg-slate-50/20 transition-all duration-150"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">
                              {tx.invoiceNumber}
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold">
                              • {formatDate(tx.date, false)}
                            </span>
                          </div>

                          {/* Invoice Items preview */}
                          <div className="text-[10px] text-slate-500 font-medium mt-1.5 truncate max-w-[300px]">
                            {tx.items
                              .map(
                                (i) =>
                                  `${i.name} (${i.quantity} ${i.unit})`,
                              )
                              .join(", ")}
                          </div>

                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2.5 text-[11px] font-semibold">
                            <div>
                              <span className="text-slate-400">
                                Total Nota:
                              </span>{" "}
                              <span className="font-bold text-slate-800 font-mono">
                                {formatRupiah(tx.totalAmount)}
                              </span>
                            </div>
                            <div>
                              <span className="text-red-500">
                                Sisa Utang:
                              </span>{" "}
                              <span className="font-black text-red-600 font-mono">
                                {formatRupiah(tx.remainingDebt)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Payment CTA */}
                        <button
                          id={`pay-invoice-btn-${tx.id}`}
                          onClick={() => handleOpenRepay(tx.id)}
                          className="rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white font-bold text-xs py-2 px-4 shadow-md shadow-red-600/10 transition-all duration-200 flex items-center justify-center gap-1.5 self-start sm:self-center cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Setor Cicilan
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Repayments History */}
              <div className="bg-white rounded-2xl border border-slate-200/50 p-5 shadow-sm">
                <h4 className="text-xs font-black text-slate-800 tracking-wider uppercase mb-4 flex items-center gap-1.5 border-b border-slate-50 pb-2">
                  <History className="text-red-600 w-4 h-4" /> Riwayat
                  Angsuran / Pembayaran Utang
                </h4>

                {customerPayments.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs font-medium">
                    Belum ada riwayat pembayaran setoran untuk pelanggan
                    ini.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 pb-2">
                          <th className="pb-2 font-bold uppercase tracking-wider text-[10px]">
                            Tanggal
                          </th>
                          <th className="pb-2 font-bold uppercase tracking-wider text-[10px]">
                            Referensi Nota
                          </th>
                          <th className="pb-2 font-bold uppercase tracking-wider text-[10px] text-center">
                            Metode
                          </th>
                          <th className="pb-2 font-bold uppercase tracking-wider text-[10px] text-right">
                            Jumlah Setor
                          </th>
                          <th className="pb-2 font-bold uppercase tracking-wider text-[10px]">
                            Catatan
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {customerPayments.map((pay) => (
                          <tr
                            key={pay.id}
                            className="hover:bg-slate-50/30 transition-all duration-150"
                          >
                            <td className="py-3 text-slate-500 font-semibold">
                              {formatDate(pay.date, true)}
                            </td>
                            <td className="py-3 font-bold text-slate-800">
                              {pay.invoiceNumber}
                            </td>
                            <td className="py-3 text-center">
                              <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-0.5 text-[9px] font-black text-slate-700 uppercase tracking-wide">
                                {pay.paymentMethod}
                              </span>
                            </td>
                            <td className="py-3 text-right font-mono font-bold text-emerald-600">
                              {formatRupiah(pay.amountPaid)}
                            </td>
                            <td className="py-3 text-slate-500 italic max-w-[150px] truncate font-medium">
                              {pay.notes || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Repayment Form Panel (4 cols) */}
            <div
              id="repay-form-container"
              className="lg:col-span-5 xl:col-span-4 space-y-4"
            >
              {isRepaying ? (
                <div className="bg-white rounded-2xl border border-red-200/60 p-5 shadow-lg space-y-4 animate-in fade-in duration-200 relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-red-500"></div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5 pb-2 border-b border-slate-50">
                    <DollarSign className="w-4 h-4 text-red-600" /> Catat
                    Pembayaran Utang
                  </h4>

                  <div className="text-xs font-semibold text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-150 space-y-1">
                    <div>
                      Pelanggan:{" "}
                      <span className="font-black text-slate-900">
                        {selectedCustomer?.name}
                      </span>
                    </div>
                    <div>
                      Total Sisa Piutang:{" "}
                      <span className="font-black text-red-600 font-mono">
                        {formatRupiah(selectedSummary?.remainingDebt || 0)}
                      </span>
                    </div>
                  </div>

                  <form onSubmit={handleSubmitRepayment} className="space-y-4">
                    {/* Amount Input */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Jumlah Setor (Rp){" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                          Rp
                        </span>
                        <input
                          id="repay-amount-input"
                          type="number"
                          required
                          value={repayAmount}
                          onChange={(e) =>
                            setRepayAmount(
                              e.target.value === ""
                                ? ""
                                : Number(e.target.value),
                            )
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-8 pr-3 text-xs font-black text-slate-900 focus:border-red-500 focus:outline-none transition-all duration-200"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 font-semibold mt-1.5 leading-relaxed">
                        Setoran akan otomatis memotong nota terutang paling lama
                        terlebih dahulu (FIFO).
                      </p>
                    </div>

                    {/* Payment Method */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Metode Setoran
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          id="repay-cash-btn"
                          type="button"
                          onClick={() => setRepayMethod("cash")}
                          className={`py-2 px-3 rounded-lg border text-center text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${repayMethod === "cash"
                              ? "border-red-500 bg-red-500/5 text-red-600 shadow-sm"
                              : "border-slate-100 bg-slate-50/50 text-slate-600"
                            }`}
                        >
                          Cash (Tunai)
                        </button>
                        <button
                          id="repay-transfer-btn"
                          type="button"
                          onClick={() => setRepayMethod("transfer")}
                          className={`py-2 px-3 rounded-lg border text-center text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${repayMethod === "transfer"
                              ? "border-red-500 bg-red-500/5 text-red-600 shadow-sm"
                              : "border-slate-100 bg-slate-50/50 text-slate-600"
                            }`}
                        >
                          Transfer Bank
                        </button>
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Catatan Setoran
                      </label>
                      <textarea
                        id="repay-notes-input"
                        placeholder="Contoh: Cicilan tahap 2, lunas, dll."
                        value={repayNotes}
                        onChange={(e) => setRepayNotes(e.target.value)}
                        rows={2}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-xs text-slate-900 focus:border-red-500 focus:outline-none resize-none transition-all duration-200"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsRepaying(false);
                        }}
                        className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 text-xs font-bold transition cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        id="submit-repayment-btn"
                        type="submit"
                        className="rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white px-4 py-2.5 text-xs font-bold shadow-md shadow-red-600/10 transition-all duration-200 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-4 h-4" /> Simpan Pembayaran
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200/80 p-8 text-center text-slate-400 text-xs font-semibold max-w-sm mx-auto space-y-3">
                  <div className="text-2xl">💰</div>
                  <p>Silakan pilih nota untuk memulai angsuran.</p>
                </div>
              )}

              {/* Info Rekening Pembayaran Card */}
              <div className="bg-white rounded-2xl border border-slate-200/50 p-5 shadow-sm space-y-3 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-slate-800"></div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5 pb-2 border-b border-slate-100">
                  <Wallet className="w-4 h-4 text-slate-600" /> Info Rekening Pembayaran
                </h4>
                <p className="text-[10px] text-slate-500 font-bold leading-none uppercase">
                  A/N Panji Paranantias Mulyono
                </p>
                <div className="space-y-1.5 text-xs font-semibold">
                  <div className="flex justify-between bg-slate-50 p-2 rounded-lg border border-slate-150">
                    <span className="text-slate-500">BCA</span>
                    <span className="font-mono font-black text-slate-900">7410888879</span>
                  </div>
                  <div className="flex justify-between bg-slate-50 p-2 rounded-lg border border-slate-150">
                    <span className="text-slate-500">BRI</span>
                    <span className="font-mono font-black text-slate-900">007501001986565</span>
                  </div>
                  <div className="flex justify-between bg-slate-50 p-2 rounded-lg border border-slate-150">
                    <span className="text-slate-500">MANDIRI</span>
                    <span className="font-mono font-black text-slate-900">173008118881</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Alamat Keuangan / Toko:</p>
                  <p className="text-[10px] text-slate-600 font-semibold leading-relaxed">
                    Kp. Pangkalan RT. 010 RW. 004 Desa Pangkalan Kecamatan Bojong Kabupaten Purwakarta
                    <br />
                    <span className="text-slate-800 font-bold">Telp/Hp: +62 877-6908-0999</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 2. MAIN LEDGER DASHBOARD */
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight uppercase">
                Ledger & Piutang
              </h2>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                Kelola penjualan dengan tempo kredit dan tagihan piutang
                pelanggan
              </p>
            </div>

            {/* Quick Aggregate Credit */}
            <div className="bg-red-500/[0.03] border border-red-500/12 rounded-2xl py-2 px-4 shadow-sm flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-xl text-red-600">
                <Wallet className="w-5 h-5 shrink-0" />
              </div>
              <div>
                <p className="text-[10px] font-extrabold text-red-500 uppercase tracking-widest leading-none mb-1">
                  Total Piutang Toko
                </p>
                <p className="text-base font-black text-red-600 font-mono leading-none mt-0.5">
                  {formatRupiah(totalStoreCredit)}
                </p>
              </div>
            </div>
          </div>

          {/* Search bar & Refresh action */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                id="search-ledger-input"
                type="text"
                placeholder="Cari nama pelanggan berutang..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-xs font-semibold text-slate-900 shadow-sm focus:border-red-500 focus:outline-none transition-all duration-200"
              />
            </div>
            <button
              onClick={handleRefresh}
              className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-all duration-200 cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Customer Debt Lists */}
          {filteredSummaries.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/50 p-16 text-center text-slate-400 text-xs font-semibold max-w-sm mx-auto space-y-2">
              <div className="text-3xl">🎉</div>
              <p>
                Tidak ada data piutang pelanggan terdaftar atau yang cocok
                dengan pencarian Anda.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/50 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-150 bg-slate-50/75 text-slate-500">
                      <th className="py-3.5 px-4 font-black uppercase tracking-wider text-[10px]">
                        Pelanggan
                      </th>
                      <th className="py-3.5 px-4 font-black uppercase tracking-wider text-[10px] text-right">
                        Total Belanja (Tempo)
                      </th>
                      <th className="py-3.5 px-4 font-black uppercase tracking-wider text-[10px] text-right">
                        Sisa Tagihan
                      </th>
                      <th className="py-3.5 px-4 font-black uppercase tracking-wider text-[10px] text-center">
                        Status
                      </th>
                      <th className="py-3.5 px-4 font-black uppercase tracking-wider text-[10px]">
                        Aktivitas Terakhir
                      </th>
                      <th className="py-3.5 px-4 font-black uppercase tracking-wider text-[10px] text-right">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSummaries.map((summary) => (
                      <tr
                        key={summary.customerId}
                        className="hover:bg-slate-50/40 transition-all duration-150"
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="rounded-xl bg-slate-50 p-2 text-slate-500 border border-slate-100 shrink-0">
                              <User className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-extrabold text-slate-900 text-xs sm:text-sm">
                                {summary.customerName}
                              </div>
                              <span className="text-[10px] text-slate-400 font-semibold">
                                ID: {summary.customerId}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-700">
                          {formatRupiah(summary.totalDebt)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-black text-red-600 text-xs sm:text-sm">
                          {formatRupiah(summary.remainingDebt)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {summary.remainingDebt > 0 ? (
                            <span className="inline-flex items-center rounded-full bg-red-50 border border-red-100 px-2.5 py-0.5 text-[9px] font-black text-red-600 uppercase tracking-wide">
                              Belum Lunas
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 text-[9px] font-black text-emerald-600 uppercase tracking-wide">
                              Lunas
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 font-semibold">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-300" />
                            {formatDate(summary.lastActive, false)}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {summary.remainingDebt > 0 && (
                              <button
                                id={`direct-repay-btn-${summary.customerId}`}
                                onClick={() =>
                                  handleDirectCustomerRepay(summary)
                                }
                                className="rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 font-extrabold text-[10px] py-1.5 px-3 transition duration-150 cursor-pointer uppercase tracking-wider flex items-center gap-1 shadow-sm shadow-red-600/5"
                              >
                                <Plus className="w-3 h-3" /> Setor
                              </button>
                            )}
                            <button
                              id={`view-ledger-btn-${summary.customerId}`}
                              onClick={() =>
                                setSelectedCustomerId(summary.customerId)
                              }
                              className="rounded-xl bg-[#0b0f19] hover:bg-slate-800 text-white font-black text-[10px] py-1.5 px-3 shadow-md transition duration-200 cursor-pointer uppercase tracking-wider"
                            >
                              Ledger
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
