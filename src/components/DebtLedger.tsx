import React, { useState, useEffect } from "react";
import {
  Customer,
  Transaction,
  DebtPayment,
  CustomerDebtSummary,
} from "../types";
import { db } from "../utils/db";
import { formatRupiah, formatDate } from "../utils/format";
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
  ChevronDown,
  Sparkles,
  X,
} from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";

export default function DebtLedger() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debtPayments, setDebtPayments] = useState<DebtPayment[]>([]);
  const [debtSummaries, setDebtSummaries] = useState<CustomerDebtSummary[]>([]);

  // Navigation tab
  const [tab, setTab] = useState<"detail" | "rekap">("detail");

  const [expandedDates, setExpandedDates] = useState<{ [key: string]: boolean }>({});

  const getLocalDateString = (isoString: string) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatTime = (isoString: string) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  const getEntryLabel = (entry: any) => {
    const timeStr = formatTime(entry.date);
    const refStr = entry.reference ? `${entry.reference}` : "";
    const descStr = entry.description ? `(${entry.description})` : "";
    return `${timeStr} - ${refStr} ${descStr}`;
  };

  const toggleDateExpanded = (dateKey: string) => {
    setExpandedDates((prev) => ({
      ...prev,
      [dateKey]: !prev[dateKey],
    }));
  };

  // Selected customer for Ledger Detail view
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Month filter states
  const [filterType, setFilterType] = useState<"all" | "month">("month");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`; // e.g. "2026-06"
  });

  // Modal open states
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  // Pay Modal form state
  const [repayAmount, setRepayAmount] = useState<number | "">("");
  const [repayMethod, setRepayMethod] = useState<"cash" | "transfer">("cash");
  const [repayNotes, setRepayNotes] = useState("");

  // Manual Transaction Modal form state
  const [manualType, setManualType] = useState<"debit" | "kredit">("debit");
  const [manualAmount, setManualAmount] = useState<number | "">("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualPayMethod, setManualPayMethod] = useState<"cash" | "transfer">("cash");

  // Search query for rekap customer list
  const [searchQuery, setSearchQuery] = useState("");

  // Base64 monochrome logo for PDF reports
  const [logoBase64, setLogoBase64] = useState<string>("");
  const [logoDimensions, setLogoDimensions] = useState<{ width: number; height: number }>({ width: 16, height: 16 });

  // Reload everything from DB
  const loadData = async () => {
    const [custs, txs, payments, summaries] = await Promise.all([
      db.getCustomers(),
      db.getTransactions(),
      db.getDebtPayments(),
      db.getCustomerDebtSummaries(),
    ]);

    // Filter out Pelanggan Umum
    const filteredCusts = custs.filter(c => c.name.toLowerCase() !== "pelanggan umum");
    const filteredSummaries = summaries.filter(s => s.customerName.toLowerCase() !== "pelanggan umum");

    setCustomers(filteredCusts);
    setTransactions(txs);
    setDebtPayments(payments);
    setDebtSummaries(filteredSummaries);

    // Auto select the first customer if none selected yet
    if (!selectedCustomerId && filteredCusts.length > 0) {
      setSelectedCustomerId(filteredCusts[0].id);
    }
  };

  useEffect(() => {
    loadData();

    // Load logo on mount
    const img = new Image();
    img.src = "/logo.png";
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        setLogoBase64(canvas.toDataURL("image/png"));
        const ratio = img.width / img.height;
        // Keeping height at 16mm, set width proportionally
        setLogoDimensions({
          width: 16 * ratio,
          height: 16
        });
      }
    };
  }, []);

  // When selectedCustomerId is null and customers loaded, auto-select first
  useEffect(() => {
    if (!selectedCustomerId && customers.length > 0) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, selectedCustomerId]);

  // Reset expanded dates when customer changes
  useEffect(() => {
    setExpandedDates({});
  }, [selectedCustomerId]);

  const handleRefresh = () => {
    loadData();
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const selectedSummary = debtSummaries.find(
    (s) => s.customerId === selectedCustomerId,
  );

  // Filter transactions and payments for the selected customer
  const customerTransactions = transactions.filter(
    (t) => t.customerId === selectedCustomerId,
  );

  const customerPayments = debtPayments.filter(
    (p) => p.customerId === selectedCustomerId,
  );

  // Combined sales and payments chronologically into a running-balanced ledger
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
        cashAmount: tx.cashAmount,
        transferAmount: tx.transferAmount,
      });
    });

    // Add payments
    customerPayments.forEach((pay) => {
      temp.push({
        id: pay.id,
        date: pay.date,
        type: "payment",
        reference: pay.invoiceNumber || "Setoran",
        paymentMethod: pay.paymentMethod,
        description: pay.notes || "Setoran Cicilan",
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

    let startTs = 0;
    let endTs = Infinity;

    if (filterType === "month" && selectedMonth) {
      const [yyyy, mm] = selectedMonth.split("-");
      const year = parseInt(yyyy);
      const month = parseInt(mm) - 1;
      startTs = new Date(year, month, 1).getTime();
      endTs = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
    }

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

  // Indonesian Ledger Date Formatter
  const formatLedgerDate = (isoString: string) => {
    if (!isoString) return "-";
    const d = new Date(isoString);
    const day = String(d.getDate()).padStart(2, "0");
    const months = [
      "JUN", // fallback index mapping check
      "JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGS", "SEP", "OKT", "NOV", "DES"
    ];
    // Real indexing
    const realMonths = [
      "JAN", "FEB", "MAR", "APR", "MEI", "JUN",
      "JUL", "AGS", "SEP", "OKT", "NOV", "DES"
    ];
    const month = realMonths[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  };

  // Submit setoran/repayment
  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !repayAmount || Number(repayAmount) <= 0) {
      alert("Masukkan jumlah setoran yang valid.");
      return;
    }

    try {
      await db.saveCustomerPayment(
        selectedCustomerId,
        Number(repayAmount),
        repayMethod,
        repayNotes.trim() || "Pembayaran Setoran"
      );
      await loadData();
      setIsPayModalOpen(false);
      setRepayAmount("");
      setRepayNotes("");
      alert("Setoran berhasil dicatat!");
    } catch (err) {
      console.error(err);
      alert("Gagal mencatat setoran.");
    }
  };

  // Submit manual transaction
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !selectedCustomer || !manualAmount || Number(manualAmount) <= 0) {
      alert("Masukkan jumlah nominal yang valid.");
      return;
    }

    const amt = Number(manualAmount);

    try {
      if (manualType === "debit") {
        // Create manual purchase / debt transaction
        const mockTx: Transaction = {
          id: Math.random().toString(36).substring(2, 11),
          invoiceNumber: "MANUAL-" + Math.floor(1000 + Math.random() * 9000),
          customerId: selectedCustomerId,
          customerName: selectedCustomer.name,
          totalAmount: amt,
          paymentMethod: "debt",
          amountPaid: 0,
          remainingDebt: amt,
          date: new Date().toISOString(),
          printCount: 0,
          notes: manualNotes.trim() || "Debit Manual (Penyesuaian Buku)",
          items: [
            {
              itemId: "adj-debit",
              name: manualNotes.trim() || "Penyesuaian Debit Buku",
              price: amt,
              quantity: 1,
              subtotal: amt,
              unit: "Transaksi",
            },
          ],
        };
        await db.saveTransaction(mockTx);
      } else {
        // Create manual credit (repayment)
        await db.saveCustomerPayment(
          selectedCustomerId,
          amt,
          manualPayMethod,
          manualNotes.trim() || "Kredit Manual (Penyesuaian Buku)"
        );
      }

      await loadData();
      setIsManualModalOpen(false);
      setManualAmount("");
      setManualNotes("");
      alert("Transaksi penyesuaian berhasil dicatat!");
    } catch (err) {
      console.error(err);
      alert("Gagal mencatat transaksi manual.");
    }
  };

  // Export to PDF (indonesian invoice-style printout)
  const handleDownloadPDF = () => {
    if (!selectedCustomer) return;

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    // ==========================================
    // 1. KOP SURAT (FORMAL INDONESIAN HEADER WITH LOGO)
    // ==========================================
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", 14, 10, logoDimensions.width, logoDimensions.height);
    }

    const textX = logoBase64 ? 14 + logoDimensions.width + 3 : 14;

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text("CV DPJ BERKAH UNGGAS", textX, 14);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text("Kp. Pangkalan RT. 010 RW. 004 Desa Pangkalan, Kec. Bojong, Kab. Purwakarta", textX, 19);
    doc.text("Telp/Hp. +62 828-0734-9347 | Email: cvdpjberkahunggas@gmail.com", textX, 23);

    // Double-line Kop Surat border (traditional Indonesian style)
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.8);
    doc.line(14, 28, 196, 28);
    doc.setLineWidth(0.25);
    doc.line(14, 29.5, 196, 29.5);

    // ==========================================
    // 2. DOCUMENT TITLE & METADATA
    // ==========================================
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text("LAPORAN BUKU BESAR (LEDGER)", 105, 38, { align: "center" });

    // Customer details block (Left)
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("PELANGGAN", 14, 46);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(selectedCustomer.name.toUpperCase(), 14, 51);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Telp  : ${selectedCustomer.phone || "-"}`, 14, 56);
    doc.text(`Almt : ${selectedCustomer.address || "-"}`, 14, 61);

    // Document Metadata block (Right)
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text("PERIODE & STATUS", 196, 46, { align: "right" });

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Periode  : ${filterType === "month" ? selectedMonth : "Semua Periode"}`, 196, 51, { align: "right" });

    const remainingDebt = selectedSummary?.remainingDebt || 0;
    doc.setFont("Helvetica", "bold");
    doc.text(`Tagihan : ${formatRupiah(remainingDebt)}`, 196, 56, { align: "right" });

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Dicetak  : ${formatLedgerDate(new Date().toISOString())}`, 196, 61, { align: "right" });

    // Divider before table
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setLineWidth(0.2);
    doc.line(14, 65, 196, 65);

    // ==========================================
    // 3. TABLE HEADERS WITH DISPLAY SHADING
    // ==========================================
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(14, 66, 182, 8, "F");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("TANGGAL", 16, 71);
    doc.text("DEBIT (BELI)", 55, 71);
    doc.text("KREDIT (TRF)", 95, 71);
    doc.text("KREDIT (CASH)", 135, 71);
    doc.text("SALDO AKHIR", 175, 71);

    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.line(14, 74, 196, 74);

    let y = 80;
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59); // slate-800

    // Saldo awal if applicable
    if (openingBalance !== 0) {
      doc.setFont("Helvetica", "bold");
      doc.text("SALDO AWAL", 16, y);
      doc.setFont("Helvetica", "normal");
      doc.text("-", 55, y);
      doc.text("-", 95, y);
      doc.text("-", 135, y);
      doc.setFont("Helvetica", "bold");
      doc.text(formatRupiah(openingBalance), 175, y);
      doc.setFont("Helvetica", "normal");
      y += 6;
    }

    // ==========================================
    // 4. TABLE ROWS
    // ==========================================
    ledgerEntries.forEach((entry) => {
      const isSale = entry.type === "sale";
      const debitVal = entry.debit > 0 ? formatRupiah(entry.debit) : "-";

      let creditTrfVal = "-";
      let creditCashVal = "-";

      if (isSale) {
        if (entry.paymentMethod === "transfer") {
          creditTrfVal = formatRupiah(entry.credit);
        } else if (entry.paymentMethod === "cash" || entry.paymentMethod === "debt") {
          creditCashVal = formatRupiah(entry.credit);
        } else if (entry.paymentMethod === "mix") {
          creditTrfVal = formatRupiah(entry.transferAmount || 0);
          creditCashVal = formatRupiah(entry.cashAmount || 0);
        }
      } else {
        if (entry.paymentMethod === "transfer") {
          creditTrfVal = formatRupiah(entry.credit);
        } else if (entry.paymentMethod === "cash") {
          creditCashVal = formatRupiah(entry.credit);
        }
      }

      // Draw light gray line between rows
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.15);
      doc.line(14, y - 4, 196, y - 4);

      doc.setFont("Helvetica", "bold");
      doc.setTextColor(79, 70, 229); // Indigo-600 exactly like display
      doc.text(formatLedgerDate(entry.date), 16, y);

      doc.setFont("Helvetica", "normal");
      doc.setTextColor(30, 41, 59);
      doc.text(debitVal, 55, y);
      doc.text(creditTrfVal, 95, y);
      doc.text(creditCashVal, 135, y);
      doc.text(entry.runningBalance === 0 ? "-" : formatRupiah(entry.runningBalance), 175, y);

      y += 6;

      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });

    // ==========================================
    // 5. REKAPITULASI (SUMMARY ROW)
    // ==========================================
    // Check page space for rekap row
    if (y > 265) {
      doc.addPage();
      y = 20;
    }

    // Top border line for summary
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.line(14, y - 4, 196, y - 4);

    doc.setFont("Helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("REKAPITULASI", 16, y);
    doc.text(totalDebitBeli > 0 ? formatRupiah(totalDebitBeli) : "-", 55, y);
    doc.text(totalKreditTrf > 0 ? formatRupiah(totalKreditTrf) : "-", 95, y);
    doc.text(totalKreditCash > 0 ? formatRupiah(totalKreditCash) : "-", 135, y);

    const finalBal = openingBalance + totalDebitBeli - totalKreditTrf - totalKreditCash;
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(finalBal === 0 ? "-" : formatRupiah(finalBal), 175, y);

    y += 6;
    // Bottom border line for summary
    doc.setDrawColor(15, 23, 42);
    doc.line(14, y - 4, 196, y - 4);

    // ==========================================
    // 6. PAYMENT INFO & SIGNATURE BLOCKS
    // ==========================================
    // Check if we need a new page for payment info + signature
    if (y > 210) {
      doc.addPage();
      y = 20;
    } else {
      y += 10;
    }

    // Styled Bank Info Box
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(14, y, 182, 33, "FD");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text("INFORMASI REKENING PEMBAYARAN", 18, y + 6);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text("Mohon transfer pembayaran / cicilan ke salah satu rekening resmi CV DPJ Berkah Unggas berikut:", 18, y + 11);

    doc.setFont("Helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("• BCA", 18, y + 18);
    doc.setFont("Helvetica", "normal");
    doc.text(":  7410888879", 38, y + 18);
    doc.setFont("Helvetica", "bold");
    doc.text("(A/N Panji Paranantias Mulyono)", 70, y + 18);

    doc.setFont("Helvetica", "bold");
    doc.text("• BRI", 18, y + 23);
    doc.setFont("Helvetica", "normal");
    doc.text(":  0075 0100 1986 565", 38, y + 23);
    doc.setFont("Helvetica", "bold");
    doc.text("(A/N Panji Paranantias Mulyono)", 70, y + 23);

    doc.setFont("Helvetica", "bold");
    doc.text("• MANDIRI", 18, y + 28);
    doc.setFont("Helvetica", "normal");
    doc.text(":  173 0081 1888 1", 38, y + 28);
    doc.setFont("Helvetica", "bold");
    doc.text("(A/N Panji Paranantias Mulyono)", 70, y + 28);

    // Signature Area
    y += 44;
    if (y > 275) {
      doc.addPage();
      y = 25;
    }

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("Purwakarta, " + formatLedgerDate(new Date().toISOString()), 150, y, { align: "center" });

    y += 5;
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("CV DPJ BERKAH UNGGAS", 150, y, { align: "center" });

    y += 18;
    doc.text("( _____________________ )", 150, y, { align: "center" });

    // Save PDF
    doc.save(`Ledger_${selectedCustomer.name.replace(/\s+/g, "_")}.pdf`);
  };

  // Export to PDF for Rekap (all customers)
  const handleDownloadRekapPDF = () => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    // ==========================================
    // 1. KOP SURAT (FORMAL INDONESIAN HEADER WITH LOGO)
    // ==========================================
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", 14, 10, logoDimensions.width, logoDimensions.height);
    }

    const textX = logoBase64 ? 14 + logoDimensions.width + 3 : 14;

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text("CV DPJ BERKAH UNGGAS", textX, 14);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text("Kp. Pangkalan RT. 010 RW. 004 Desa Pangkalan, Kec. Bojong, Kab. Purwakarta", textX, 19);
    doc.text("Telp/Hp. +62 828-0734-9347 | Email: cvdpjberkahunggas@gmail.com", textX, 23);

    // Double-line Kop Surat border
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.8);
    doc.line(14, 28, 196, 28);
    doc.setLineWidth(0.25);
    doc.line(14, 29.5, 196, 29.5);

    // ==========================================
    // 2. DOCUMENT TITLE & METADATA
    // ==========================================
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text("LAPORAN REKAPITULASI PIUTANG PELANGGAN", 105, 38, { align: "center" });

    // Metadata details
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`Total Pelanggan : ${filteredSummaries.length} Orang`, 14, 44);
    doc.text(`Dicetak  : ${formatLedgerDate(new Date().toISOString())}`, 14, 49);

    doc.text(`Total Pembelian : ${formatRupiah(totalRekapPembelian)}`, 196, 44, { align: "right" });
    doc.text(`Total Transfer  : ${formatRupiah(totalRekapTransfer)}`, 196, 49, { align: "right" });
    doc.text(`Total Cash      : ${formatRupiah(totalRekapCash)}`, 196, 54, { align: "right" });
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`Sisa Piutang    : ${formatRupiah(totalRekapRemaining)}`, 196, 59, { align: "right" });

    // Divider before table at Y=63
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setLineWidth(0.2);
    doc.line(14, 63, 196, 63);

    // ==========================================
    // 3. TABLE HEADERS WITH DISPLAY SHADING
    // ==========================================
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(14, 63, 182, 8, "F");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("NAMA PELANGGAN", 16, 68);
    doc.text("TOTAL PEMBELIAN", 98, 68, { align: "right" });
    doc.text("TOTAL TRANSFER", 130, 68, { align: "right" });
    doc.text("TOTAL CASH", 162, 68, { align: "right" });
    doc.text("SISA PIUTANG", 194, 68, { align: "right" });

    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.line(14, 71, 196, 71);

    let y = 77;
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59); // slate-800

    // ==========================================
    // 4. TABLE ROWS
    // ==========================================
    filteredSummaries.forEach((summary, idx) => {
      // Draw light gray line between rows
      if (idx > 0) {
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.15);
        doc.line(14, y - 4, 196, y - 4);
      }

      // 1. PELANGGAN (Name & ID exactly like display)
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(summary.customerName.toUpperCase(), 16, y);
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`ID: ${summary.customerId}`, 16, y + 3.5);

      // 2. TOTAL PEMBELIAN
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text(summary.totalPembelian > 0 ? formatRupiah(summary.totalPembelian) : "-", 98, y + 1, { align: "right" });

      // 3. TOTAL TRANSFER (blue)
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(29, 78, 216); // blue-700
      doc.text(summary.totalTransfer > 0 ? formatRupiah(summary.totalTransfer) : "-", 130, y + 1, { align: "right" });

      // 4. TOTAL CASH (green)
      doc.setTextColor(4, 120, 87); // emerald-700
      doc.text(summary.totalCash > 0 ? formatRupiah(summary.totalCash) : "-", 162, y + 1, { align: "right" });

      // 5. SISA PIUTANG (indigo)
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(67, 56, 202); // indigo-700
      doc.text(summary.remainingDebt > 0 ? formatRupiah(summary.remainingDebt) : "-", 194, y + 1, { align: "right" });

      y += 8;

      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });

    // ==========================================
    // 5. SUMMARY ROW (REKAPITULASI)
    // ==========================================
    if (y > 265) {
      doc.addPage();
      y = 20;
    }

    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.line(14, y - 4, 196, y - 4);

    doc.setFont("Helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("TOTAL KESELURUHAN", 16, y);
    doc.text(formatRupiah(totalRekapPembelian), 98, y, { align: "right" });
    doc.setTextColor(29, 78, 216);
    doc.text(formatRupiah(totalRekapTransfer), 130, y, { align: "right" });
    doc.setTextColor(4, 120, 87);
    doc.text(formatRupiah(totalRekapCash), 162, y, { align: "right" });
    doc.setTextColor(67, 56, 202);
    doc.text(formatRupiah(totalRekapRemaining), 194, y, { align: "right" });

    y += 6;
    doc.line(14, y - 4, 196, y - 4);

    // ==========================================
    // 6. PAYMENT INFO & SIGNATURE BLOCKS
    // ==========================================
    if (y > 210) {
      doc.addPage();
      y = 20;
    } else {
      y += 10;
    }

    // Bank Info
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.rect(14, y, 182, 33, "FD");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text("INFORMASI REKENING PEMBAYARAN", 18, y + 6);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text("Mohon transfer pembayaran / cicilan ke salah satu rekening resmi CV DPJ Berkah Unggas berikut:", 18, y + 11);

    doc.setFont("Helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("• BCA", 18, y + 18);
    doc.setFont("Helvetica", "normal");
    doc.text(":  7410888879", 38, y + 18);
    doc.setFont("Helvetica", "bold");
    doc.text("(A/N Panji Paranantias Mulyono)", 70, y + 18);

    doc.setFont("Helvetica", "bold");
    doc.text("• BRI", 18, y + 23);
    doc.setFont("Helvetica", "normal");
    doc.text(":  0075 0100 1986 565", 38, y + 23);
    doc.setFont("Helvetica", "bold");
    doc.text("(A/N Panji Paranantias Mulyono)", 70, y + 23);

    doc.setFont("Helvetica", "bold");
    doc.text("• MANDIRI", 18, y + 28);
    doc.setFont("Helvetica", "normal");
    doc.text(":  173 0081 1888 1", 38, y + 28);
    doc.setFont("Helvetica", "bold");
    doc.text("(A/N Panji Paranantias Mulyono)", 70, y + 28);

    // Signature Area
    y += 44;
    if (y > 275) {
      doc.addPage();
      y = 25;
    }

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("Purwakarta, " + formatLedgerDate(new Date().toISOString()), 150, y, { align: "center" });

    y += 5;
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("CV DPJ BERKAH UNGGAS", 150, y, { align: "center" });

    y += 18;
    doc.text("( _____________________ )", 150, y, { align: "center" });

    doc.save("Rekapitulasi_Piutang_Pelanggan.pdf");
  };

  // Export to Excel (XLSX)
  const handleDownloadXLSX = () => {
    if (!selectedCustomer) return;

    const dataRows = ledgerEntries.map((entry) => {
      const isSale = entry.type === "sale";
      const debit = entry.debit || 0;

      let creditTrf = 0;
      let creditCash = 0;

      if (isSale) {
        if (entry.paymentMethod === "transfer") {
          creditTrf = entry.credit;
        } else if (entry.paymentMethod === "cash" || entry.paymentMethod === "debt") {
          creditCash = entry.credit;
        } else if (entry.paymentMethod === "mix") {
          creditTrf = entry.transferAmount || 0;
          creditCash = entry.cashAmount || 0;
        }
      } else {
        if (entry.paymentMethod === "transfer") {
          creditTrf = entry.credit;
        } else if (entry.paymentMethod === "cash") {
          creditCash = entry.credit;
        }
      }

      return {
        "TANGGAL": formatLedgerDate(entry.date),
        "DEBIT (BELI)": debit,
        "KREDIT (TRF)": creditTrf,
        "KREDIT (CASH)": creditCash,
        "SALDO AKHIR": entry.runningBalance,
      };
    });

    // Add opening balance row
    if (openingBalance !== 0) {
      dataRows.unshift({
        "TANGGAL": "SALDO AWAL",
        "DEBIT (BELI)": 0,
        "KREDIT (TRF)": 0,
        "KREDIT (CASH)": 0,
        "SALDO AKHIR": openingBalance,
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ledger");

    XLSX.writeFile(workbook, `Ledger_${selectedCustomer.name.replace(/\s+/g, "_")}.xlsx`);
  };

  // Export to Image (JPG) using html2canvas
  const handleDownloadJPG = async () => {
    const element = document.getElementById("ledger-capture-area");
    if (!element) {
      alert("Elemen ledger tidak ditemukan untuk di-capture.");
      return;
    }
    try {
      const canvas = await html2canvas(element, {
        scale: 2, // High resolution
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const link = document.createElement("a");
      link.href = imgData;
      link.download = `Ledger_${selectedCustomer?.name || "Pelanggan"}.jpg`;
      link.click();
    } catch (err) {
      console.error("Error exporting JPG:", err);
      alert("Gagal mengunduh JPG.");
    }
  };

  // Export Rekap to Excel (XLSX)
  const handleDownloadRekapXLSX = () => {
    const dataRows = filteredSummaries.map((summary) => ({
      "NAMA PELANGGAN": summary.customerName.toUpperCase(),
      "ID PELANGGAN": summary.customerId,
      "TOTAL PEMBELIAN": summary.totalPembelian,
      "TOTAL TRANSFER": summary.totalTransfer,
      "TOTAL CASH": summary.totalCash,
      "SISA PIUTANG": summary.remainingDebt,
    }));

    // Add sum row
    dataRows.push({
      "NAMA PELANGGAN": "TOTAL KESELURUHAN",
      "ID PELANGGAN": "",
      "TOTAL PEMBELIAN": totalRekapPembelian,
      "TOTAL TRANSFER": totalRekapTransfer,
      "TOTAL CASH": totalRekapCash,
      "SISA PIUTANG": totalRekapRemaining,
    });

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Piutang");
    XLSX.writeFile(workbook, "Rekapitulasi_Piutang_Pelanggan.xlsx");
  };

  // Export Rekap to Image (JPG) using html2canvas
  const handleDownloadRekapJPG = async () => {
    const element = document.getElementById("rekap-capture-area");
    if (!element) {
      alert("Elemen rekap tidak ditemukan untuk di-capture.");
      return;
    }
    try {
      const canvas = await html2canvas(element, {
        scale: 2, // High resolution
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const link = document.createElement("a");
      link.href = imgData;
      link.download = `Rekap_Piutang_Pelanggan.jpg`;
      link.click();
    } catch (err) {
      console.error("Error exporting JPG:", err);
      alert("Gagal mengunduh JPG.");
    }
  };

  // Calculate sums for the footer
  const totalDebitBeli = ledgerEntries.reduce((sum, entry) => sum + (entry.debit || 0), 0);
  const totalKreditTrf = ledgerEntries.reduce((sum, entry) => {
    if (entry.type === "payment") {
      return sum + (entry.paymentMethod === "transfer" ? entry.credit : 0);
    } else {
      if (entry.paymentMethod === "transfer") return sum + entry.credit;
      if (entry.paymentMethod === "mix") return sum + (entry.transferAmount || 0);
      return sum;
    }
  }, 0);
  const totalKreditCash = ledgerEntries.reduce((sum, entry) => {
    if (entry.type === "payment") {
      return sum + (entry.paymentMethod === "cash" ? entry.credit : 0);
    } else {
      if (entry.paymentMethod === "cash" || entry.paymentMethod === "debt") return sum + entry.credit;
      if (entry.paymentMethod === "mix") return sum + (entry.cashAmount || 0);
      return sum;
    }
  }, 0);

  // Filter summaries for REKAP view
  const filteredSummaries = debtSummaries.filter(
    (summary) =>
      summary.customerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalRekapPembelian = filteredSummaries.reduce((sum, s) => sum + s.totalPembelian, 0);
  const totalRekapTransfer = filteredSummaries.reduce((sum, s) => sum + s.totalTransfer, 0);
  const totalRekapCash = filteredSummaries.reduce((sum, s) => sum + s.totalCash, 0);
  const totalRekapRemaining = filteredSummaries.reduce((sum, s) => sum + s.remainingDebt, 0);

  return (
    <div className="space-y-6">
      {/* HEADER CONTROL BAR WITH SAME LOOK AND FEEL AS USER'S IMAGE */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

          {/* LEFT AREA: TITLE & PILLS */}
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
              LEDGER
            </h1>

            {/* DETAIL / REKAP TOGGLE PILLS */}
            <div className="inline-flex bg-slate-100/80 p-0.5 rounded-full border border-slate-200">
              <button
                type="button"
                onClick={() => setTab("detail")}
                className={`px-4 py-1 text-[10px] font-black uppercase tracking-wider rounded-full transition-all duration-150 cursor-pointer ${tab === "detail"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                  }`}
              >
                Detail
              </button>
              <button
                type="button"
                onClick={() => setTab("rekap")}
                className={`px-4 py-1 text-[10px] font-black uppercase tracking-wider rounded-full transition-all duration-150 cursor-pointer ${tab === "rekap"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                  }`}
              >
                Rekap
              </button>
            </div>
          </div>

          {/* RIGHT AREA: BULAN, EXPORT BUTTONS, BAYAR */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">

            {/* BULAN / DATE SELECTOR (ONLY FOR DETAIL TAB) */}
            {tab === "detail" && selectedCustomerId && (
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1 shadow-sm shrink-0">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as "all" | "month")}
                  className="appearance-none bg-transparent pr-5 text-[10px] font-black text-slate-700 focus:outline-none cursor-pointer uppercase"
                >
                  <option value="month">BULAN</option>
                  <option value="all">SEMUA</option>
                </select>

                {filterType === "month" && (
                  <div className="flex items-center border-l border-slate-200 pl-2">
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="bg-transparent text-[11px] font-bold text-slate-900 focus:outline-none cursor-pointer"
                    />
                  </div>
                )}
              </div>
            )}

            {/* DARK EXPORT PILLS: PDF, JPG, XLSX */}
            {((tab === "detail" && selectedCustomerId) || tab === "rekap") && (
              <div className="flex items-center bg-[#0b0f19] text-white rounded-xl p-0.5 shadow-md">
                <button
                  type="button"
                  onClick={tab === "detail" ? handleDownloadPDF : handleDownloadRekapPDF}
                  className="px-3 py-1.5 text-[9px] font-black uppercase tracking-wider hover:bg-slate-800 rounded-lg transition cursor-pointer"
                >
                  PDF
                </button>
                <button
                  type="button"
                  onClick={tab === "detail" ? handleDownloadJPG : handleDownloadRekapJPG}
                  className="px-3 py-1.5 text-[9px] font-black uppercase tracking-wider hover:bg-slate-800 rounded-lg transition border-l border-r border-slate-800 cursor-pointer"
                >
                  JPG
                </button>
                <button
                  type="button"
                  onClick={tab === "detail" ? handleDownloadXLSX : handleDownloadRekapXLSX}
                  className="px-3 py-1.5 text-[9px] font-black uppercase tracking-wider hover:bg-slate-800 rounded-lg transition cursor-pointer"
                >
                  XLSX
                </button>
              </div>
            )}

            {/* GREEN BAYAR ACTION BUTTON (ONLY FOR DETAIL TAB) */}
            {tab === "detail" && selectedCustomerId && (
              <button
                type="button"
                onClick={() => {
                  setRepayAmount(selectedSummary?.remainingDebt || "");
                  setIsPayModalOpen(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest py-2 px-5 rounded-xl shadow-sm hover:shadow transition cursor-pointer"
              >
                BAYAR
              </button>
            )}
          </div>
        </div>

        {/* CUSTOMER PICKER BLOCK (ONLY IN DETAIL TAB) */}
        {tab === "detail" && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-t border-slate-100 pt-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none sm:mt-0.5 shrink-0">
              PILIH PELANGGAN:
            </span>
            <div className="relative inline-block min-w-[240px]">
              <select
                id="ledger-customer-select"
                value={selectedCustomerId || ""}
                onChange={(e) => setSelectedCustomerId(e.target.value || null)}
                className="w-full appearance-none bg-white border-2 border-indigo-600/10 rounded-xl py-2 pl-3.5 pr-10 text-xs font-black text-indigo-700 focus:outline-none focus:border-indigo-600 transition shadow-sm cursor-pointer uppercase"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id} className="text-slate-800 font-bold">
                    {c.name.toUpperCase()}
                  </option>
                ))}
              </select>
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-indigo-600 pointer-events-none">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>

            {selectedCustomer && (
              <div className="text-[11px] font-semibold text-slate-500 mt-1 sm:mt-0 sm:ml-2">
                Telepon: <span className="text-slate-800 font-bold">{selectedCustomer.phone || "-"}</span> •
                Alamat: <span className="text-slate-800 font-bold">{selectedCustomer.address || "-"}</span> •
                Sisa Tagihan: <span className="text-red-600 font-extrabold">{formatRupiah(selectedSummary?.remainingDebt || 0)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CONTENT SWITCH AREA */}
      {tab === "detail" ? (
        /* DETAIL TAB: GRID-BORDERED LEDGER TABLE CAPTURE AREA */
        selectedCustomerId ? (
          <div className="space-y-4">
            <div
              id="ledger-capture-area"
              className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6"
            >
              {/* Internal brand header hidden on screen but beautiful for JPG capture */}
              <div className="hidden print:block border-b-2 border-slate-900 pb-4">
                <h2 className="text-xl font-black text-slate-900">CV DPJ BERKAH UNGGAS</h2>
                <p className="text-xs text-slate-500">Ledger Buku Besar - {selectedCustomer?.name.toUpperCase()}</p>
              </div>

              {/* GRID STYLE TABLE ACCORDING TO USER'S SCREENSHOT */}
              <div className="border-2 border-slate-950 rounded-xl overflow-hidden shadow-sm bg-white">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b-2 border-slate-950 text-slate-900">
                      <th className="py-4 px-3 text-center text-xs font-black uppercase tracking-wider border-r border-slate-950 w-1/5">
                        TANGGAL
                      </th>
                      <th className="py-4 px-3 text-center text-xs font-black uppercase tracking-wider border-r border-slate-950 w-1/5">
                        DEBIT (BELI)
                      </th>
                      <th className="py-4 px-3 text-center text-xs font-black uppercase tracking-wider border-r border-slate-950 w-1/5">
                        KREDIT (TRF)
                      </th>
                      <th className="py-4 px-3 text-center text-xs font-black uppercase tracking-wider border-r border-slate-950 w-1/5">
                        KREDIT (CASH)
                      </th>
                      <th className="py-4 px-3 text-center text-xs font-black uppercase tracking-wider w-1/5">
                        SALDO AKHIR
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y border-slate-950">

                    {/* Opening Balance row (Saldo Awal) */}
                    {openingBalance !== 0 && (
                      <tr className="hover:bg-slate-50/20 transition-all">
                        <td className="py-4 px-3 text-center text-xs font-black text-slate-400 border-r border-slate-950">
                          SALDO AWAL
                        </td>
                        <td className="py-4 px-3 text-center text-xs font-bold text-slate-400 border-r border-slate-950">
                          -
                        </td>
                        <td className="py-4 px-3 text-center text-xs font-bold text-slate-400 border-r border-slate-950">
                          -
                        </td>
                        <td className="py-4 px-3 text-center text-xs font-bold text-slate-400 border-r border-slate-950">
                          -
                        </td>
                        <td className="py-4 px-3 text-center text-xs sm:text-sm font-bold text-slate-800 font-mono">
                          {formatRupiah(openingBalance)}
                        </td>
                      </tr>
                    )}

                    {/* Data entries */}
                    {ledgerEntries.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400 text-xs font-semibold">
                          Tidak ada riwayat transaksi pada periode ini.
                        </td>
                      </tr>
                    ) : (() => {
                      const groups: { [key: string]: any[] } = {};
                      ledgerEntries.forEach((entry) => {
                        const key = getLocalDateString(entry.date);
                        if (!groups[key]) {
                          groups[key] = [];
                        }
                        groups[key].push(entry);
                      });

                      const uniqueKeys: string[] = [];
                      ledgerEntries.forEach((entry) => {
                        const key = getLocalDateString(entry.date);
                        if (!uniqueKeys.includes(key)) {
                          uniqueKeys.push(key);
                        }
                      });

                      return uniqueKeys.map((key) => {
                        const entriesInGroup = groups[key];
                        let sumDebit = 0;
                        let sumCreditTrf = 0;
                        let sumCreditCash = 0;

                        entriesInGroup.forEach((entry) => {
                          const isSale = entry.type === "sale";
                          const debitVal = entry.debit > 0 ? entry.debit : 0;
                          sumDebit += debitVal;

                          let creditTrf = 0;
                          let creditCash = 0;

                          if (isSale) {
                            if (entry.paymentMethod === "transfer") {
                              creditTrf = entry.credit;
                            } else if (entry.paymentMethod === "cash" || entry.paymentMethod === "debt") {
                              creditCash = entry.credit;
                            } else if (entry.paymentMethod === "mix") {
                              creditTrf = entry.transferAmount || 0;
                              creditCash = entry.cashAmount || 0;
                            }
                          } else {
                            if (entry.paymentMethod === "transfer") {
                              creditTrf = entry.credit;
                            } else if (entry.paymentMethod === "cash") {
                              creditCash = entry.credit;
                            }
                          }

                          sumCreditTrf += creditTrf;
                          sumCreditCash += creditCash;
                        });

                        const lastEntry = entriesInGroup[entriesInGroup.length - 1];
                        const runningBalance = lastEntry.runningBalance;
                        const isExpanded = !!expandedDates[key];

                        return (
                          <React.Fragment key={key}>
                            <tr className="hover:bg-slate-50/40 transition-all">
                              {/* TANGGAL: Clickable and shows drop down status */}
                              <td
                                onClick={() => toggleDateExpanded(key)}
                                className="py-4 px-3 text-center text-xs font-black text-indigo-600 border-r border-slate-950 uppercase tracking-wide cursor-pointer hover:bg-indigo-50/60 transition-colors select-none"
                                title="Klik untuk detail transaksi"
                              >
                                <div className="flex items-center justify-center gap-1.5">
                                  <span>{formatLedgerDate(lastEntry.date)}</span>
                                  <span className="text-[9px] text-indigo-400 font-bold">
                                    {isExpanded ? "▲" : "▼"}
                                  </span>
                                </div>
                              </td>

                              {/* DEBIT (BELI) */}
                              <td className="py-4 px-3 text-center text-xs sm:text-sm font-bold text-slate-900 font-mono border-r border-slate-950">
                                {sumDebit > 0 ? formatRupiah(sumDebit) : "-"}
                              </td>

                              {/* KREDIT (TRF) */}
                              <td className="py-4 px-3 text-center text-xs sm:text-sm font-bold text-slate-900 font-mono border-r border-slate-950">
                                {sumCreditTrf > 0 ? formatRupiah(sumCreditTrf) : "-"}
                              </td>

                              {/* KREDIT (CASH) */}
                              <td className="py-4 px-3 text-center text-xs sm:text-sm font-bold text-slate-900 font-mono border-r border-slate-950">
                                {sumCreditCash > 0 ? formatRupiah(sumCreditCash) : "-"}
                              </td>

                              {/* SALDO AKHIR */}
                              <td className="py-4 px-3 text-center text-xs sm:text-sm font-bold text-slate-900 font-mono">
                                {runningBalance === 0 ? "-" : formatRupiah(runningBalance)}
                              </td>
                            </tr>

                            {/* EXPANDED DETAILS FOR THE DATE */}
                            {isExpanded && entriesInGroup.map((entry, subIdx) => {
                              const isSaleSub = entry.type === "sale";
                              const debitSubVal = entry.debit > 0 ? entry.debit : 0;

                              let creditTrfSub = 0;
                              let creditCashSub = 0;

                              if (isSaleSub) {
                                if (entry.paymentMethod === "transfer") {
                                  creditTrfSub = entry.credit;
                                } else if (entry.paymentMethod === "cash" || entry.paymentMethod === "debt") {
                                  creditCashSub = entry.credit;
                                } else if (entry.paymentMethod === "mix") {
                                  creditTrfSub = entry.transferAmount || 0;
                                  creditCashSub = entry.cashAmount || 0;
                                }
                              } else {
                                if (entry.paymentMethod === "transfer") {
                                  creditTrfSub = entry.credit;
                                } else if (entry.paymentMethod === "cash") {
                                  creditCashSub = entry.credit;
                                }
                              }

                              return (
                                <tr key={`${entry.id}-${subIdx}`} className="bg-slate-50/60 hover:bg-slate-100/60 transition-all text-slate-500">
                                  <td className="py-2.5 px-3 border-r border-slate-950">
                                    <div className="flex items-center gap-1.5 pl-3 text-[11px] font-medium font-sans text-left text-slate-500">
                                      <span className="text-indigo-400 font-bold">↳</span>
                                      <span className="truncate max-w-[150px] sm:max-w-[200px]" title={getEntryLabel(entry)}>
                                        {getEntryLabel(entry)}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-center text-[11px] font-mono text-slate-500 border-r border-slate-950">
                                    {debitSubVal > 0 ? formatRupiah(debitSubVal) : "-"}
                                  </td>
                                  <td className="py-2.5 px-3 text-center text-[11px] font-mono text-slate-500 border-r border-slate-950">
                                    {creditTrfSub > 0 ? formatRupiah(creditTrfSub) : "-"}
                                  </td>
                                  <td className="py-2.5 px-3 text-center text-[11px] font-mono text-slate-500 border-r border-slate-950">
                                    {creditCashSub > 0 ? formatRupiah(creditCashSub) : "-"}
                                  </td>
                                  <td className="py-2.5 px-3 text-center text-[11px] font-mono text-slate-500">
                                    {entry.runningBalance === 0 ? "-" : formatRupiah(entry.runningBalance)}
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      });
                    })()}

                    {/* REKAPITULASI SUMMARY ROW EXACTLY LIKE USER'S IMAGE */}
                    <tr className="bg-slate-50/50 border-t-2 border-slate-950 font-black">
                      <td className="py-4 px-3 text-center text-xs uppercase tracking-wider border-r border-slate-950">
                        REKAPITULASI
                      </td>
                      <td className="py-4 px-3 text-center text-xs sm:text-sm text-slate-900 font-mono border-r border-slate-950">
                        {totalDebitBeli > 0 ? formatRupiah(totalDebitBeli) : "-"}
                      </td>
                      <td className="py-4 px-3 text-center text-xs sm:text-sm text-slate-900 font-mono border-r border-slate-950">
                        {totalKreditTrf > 0 ? formatRupiah(totalKreditTrf) : "-"}
                      </td>
                      <td className="py-4 px-3 text-center text-xs sm:text-sm text-slate-900 font-mono border-r border-slate-950">
                        {totalKreditCash > 0 ? formatRupiah(totalKreditCash) : "-"}
                      </td>

                      <td className="py-4 px-3 text-center text-xs sm:text-sm text-slate-900 font-mono">
                        {openingBalance + totalDebitBeli - totalKreditTrf - totalKreditCash === 0
                          ? "-"
                          : formatRupiah(openingBalance + totalDebitBeli - totalKreditTrf - totalKreditCash)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-slate-400 font-semibold text-xs">
            Silakan pilih pelanggan terlebih dahulu untuk menampilkan ledger.
          </div>
        )
      ) : (
        /* REKAP TAB: CUSTOMER SUMMARY GRID OVERVIEW */
        <div id="rekap-capture-area" className="space-y-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          {/* Logo brand header specifically for JPG capture */}
          <div className="hidden print:block border-b-2 border-slate-900 pb-4 mb-4 flex items-center gap-4">
            {logoBase64 && (
              <img src={logoBase64} className="w-12 h-12 object-contain" referrerPolicy="no-referrer" />
            )}
            <div>
              <h2 className="text-lg font-black text-slate-900">CV DPJ BERKAH UNGGAS</h2>
              <p className="text-xs text-slate-500 font-semibold">LAPORAN REKAPITULASI PIUTANG PELANGGAN</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">
                  Ikhtisar Rekapitulasi Piutang Pelanggan
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Klik tombol "Ledger" untuk melihat detail buku besar masing-masing pelanggan
                </p>
              </div>

              {/* SEARCH INPUT */}
              <div className="relative min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                <input
                  type="text"
                  placeholder="Cari nama pelanggan..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs font-bold text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {filteredSummaries.length === 0 ? (
              <div className="py-12 text-center text-slate-400 font-semibold text-xs">
                Tidak ada data pelanggan yang cocok.
              </div>
            ) : (
              <div className="border-2 border-slate-950 rounded-2xl overflow-hidden bg-white shadow-md">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-900 border-b-2 border-slate-950">
                      <th className="py-4 px-4 font-black uppercase tracking-wider text-[11px] border-r border-slate-200">
                        Nama Pelanggan
                      </th>
                      <th className="py-4 px-4 font-black uppercase tracking-wider text-[11px] text-center border-r border-slate-200">
                        Total Pembelian
                      </th>
                      <th className="py-4 px-4 font-black uppercase tracking-wider text-[11px] text-center border-r border-slate-200">
                        Total Transfer
                      </th>
                      <th className="py-4 px-4 font-black uppercase tracking-wider text-[11px] text-center border-r border-slate-200">
                        Total Cash
                      </th>
                      <th className="py-4 px-4 font-black uppercase tracking-wider text-[11px] text-center bg-indigo-50/70 text-indigo-950 border-r border-slate-200">
                        Sisa Piutang
                      </th>
                      <th className="py-4 px-4 font-black uppercase tracking-wider text-[11px] text-center">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y border-slate-200">
                    {filteredSummaries.map((summary) => (
                      <tr key={summary.customerId} className="hover:bg-slate-50/50 transition border-b border-slate-150">
                        <td className="py-4 px-4 border-r border-slate-200">
                          <div className="font-black text-slate-900 tracking-wide text-[11px]">{summary.customerName.toUpperCase()}</div>
                          <div className="text-[8px] text-slate-400 font-bold">ID: {summary.customerId}</div>
                        </td>
                        <td className="py-4 px-4 text-center font-mono font-extrabold text-slate-900 text-[11px] border-r border-slate-200">
                          {summary.totalPembelian > 0 ? formatRupiah(summary.totalPembelian) : "-"}
                        </td>
                        <td className="py-4 px-4 text-center font-mono font-bold text-blue-600 text-[11px] border-r border-slate-200">
                          {summary.totalTransfer > 0 ? formatRupiah(summary.totalTransfer) : "-"}
                        </td>
                        <td className="py-4 px-4 text-center font-mono font-bold text-emerald-600 text-[11px] border-r border-slate-200">
                          {summary.totalCash > 0 ? formatRupiah(summary.totalCash) : "-"}
                        </td>
                        <td className="py-4 px-4 text-center font-mono font-black text-indigo-600 bg-indigo-50/10 text-[11px] border-r border-slate-200">
                          {summary.remainingDebt > 0 ? formatRupiah(summary.remainingDebt) : "-"}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCustomerId(summary.customerId);
                              setTab("detail");
                            }}
                            className="rounded-lg bg-[#0b0f19] hover:bg-slate-800 text-white font-black text-[9px] py-1.5 px-3 uppercase tracking-wider cursor-pointer transition shadow-sm"
                          >
                            Ledger
                          </button>
                        </td>
                      </tr>
                    ))}

                    {/* GRAND TOTAL ROW EXACTLY MATCHING FOOTER STYLE */}
                    <tr className="bg-slate-50 border-t-2 border-slate-950 font-black">
                      <td className="py-4 px-4 text-[10px] font-black uppercase tracking-wider border-r border-slate-200">
                        TOTAL KESELURUHAN
                      </td>
                      <td className="py-4 px-4 text-center font-mono font-extrabold text-slate-900 text-[11px] border-r border-slate-200">
                        {formatRupiah(totalRekapPembelian)}
                      </td>
                      <td className="py-4 px-4 text-center font-mono font-bold text-blue-600 text-[11px] border-r border-slate-200">
                        {formatRupiah(totalRekapTransfer)}
                      </td>
                      <td className="py-4 px-4 text-center font-mono font-bold text-emerald-600 text-[11px] border-r border-slate-200">
                        {formatRupiah(totalRekapCash)}
                      </td>
                      <td className="py-4 px-4 text-center font-mono font-black text-indigo-600 bg-indigo-50/30 text-[11px] border-r border-slate-200">
                        {formatRupiah(totalRekapRemaining)}
                      </td>
                      <td className="bg-[#0b0f19] py-4 px-4 text-center">
                        <span className="text-white/20 text-[9px] font-black tracking-widest uppercase">
                          CLOSED
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 1. PAY MODAL (BAYAR) */}
      {isPayModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="flex min-h-full items-center justify-center">
            <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl relative overflow-hidden space-y-4 animate-in zoom-in-95 duration-150 my-8">
              <div className="absolute top-0 left-0 right-0 h-[4px] bg-emerald-600"></div>

              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-600" /> Catat Pembayaran / Setoran
                </h3>
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="text-slate-400 hover:text-slate-900 transition p-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 border border-slate-150 text-xs font-semibold text-slate-600 space-y-1">
                <div>
                  Pelanggan: <span className="font-black text-slate-900">{selectedCustomer.name.toUpperCase()}</span>
                </div>
                <div>
                  Total Sisa Piutang: <span className="font-black text-red-600 font-mono">{formatRupiah(selectedSummary?.remainingDebt || 0)}</span>
                </div>
              </div>

              <form onSubmit={handlePaySubmit} className="space-y-4">
                {/* Repay Amount */}
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    Jumlah Setor (Rp) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      Rp
                    </span>
                    <input
                      type="number"
                      required
                      value={repayAmount}
                      onChange={(e) =>
                        setRepayAmount(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-8 pr-3 text-xs font-black text-slate-900 focus:border-indigo-500 focus:outline-none"
                      placeholder="Masukkan jumlah pembayaran"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold mt-1.5">
                    Setoran akan memotong nota piutang terutang terlama terlebih dahulu (FIFO).
                  </p>
                </div>

                {/* Repay Method */}
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                    Metode Setoran
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRepayMethod("cash")}
                      className={`py-2 px-3 rounded-xl border text-center text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${repayMethod === "cash"
                          ? "border-emerald-600 bg-emerald-50 text-emerald-700 shadow-xs"
                          : "border-slate-200 bg-slate-50/50 text-slate-600"
                        }`}
                    >
                      Cash (Tunai)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRepayMethod("transfer")}
                      className={`py-2 px-3 rounded-xl border text-center text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${repayMethod === "transfer"
                          ? "border-emerald-600 bg-emerald-50 text-emerald-700 shadow-xs"
                          : "border-slate-200 bg-slate-50/50 text-slate-600"
                        }`}
                    >
                      Transfer Bank
                    </button>
                  </div>
                </div>

                {/* Repay Notes */}
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    Catatan Setoran
                  </label>
                  <textarea
                    placeholder="Contoh: Cicilan nota ke-3, bayar lunas, dll."
                    value={repayNotes}
                    onChange={(e) => setRepayNotes(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none resize-none"
                  />
                </div>

                {/* Form buttons */}
                <div className="flex gap-2.5 justify-end pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsPayModalOpen(false)}
                    className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 text-xs font-bold transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-xs font-black uppercase tracking-wider shadow-sm transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" /> Simpan
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 2. MANUAL ADJUSTMENT MODAL (MANUAL) */}
      {isManualModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="flex min-h-full items-center justify-center">
            <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl relative overflow-hidden space-y-4 animate-in zoom-in-95 duration-150 my-8">
              <div className="absolute top-0 left-0 right-0 h-[4px] bg-slate-900"></div>

              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-600" /> Transaksi Penyesuaian Manual
                </h3>
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="text-slate-400 hover:text-slate-900 transition p-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 border border-slate-150 text-xs font-semibold text-slate-600">
                Pelanggan: <span className="font-black text-slate-900">{selectedCustomer.name.toUpperCase()}</span>
              </div>

              <form onSubmit={handleManualSubmit} className="space-y-4">
                {/* Type toggle: Debit (Beli / Utang) vs Kredit (Setor / Potong) */}
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                    Tipe Penyesuaian
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setManualType("debit")}
                      className={`py-2 px-3 rounded-xl border text-center text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${manualType === "debit"
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700 shadow-xs"
                          : "border-slate-200 bg-slate-50/50 text-slate-600"
                        }`}
                    >
                      Debit (Beli / Utang)
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualType("kredit")}
                      className={`py-2 px-3 rounded-xl border text-center text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${manualType === "kredit"
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700 shadow-xs"
                          : "border-slate-200 bg-slate-50/50 text-slate-600"
                        }`}
                    >
                      Kredit (Setor / Potong)
                    </button>
                  </div>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    Nominal Penyesuaian (Rp) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      Rp
                    </span>
                    <input
                      type="number"
                      required
                      value={manualAmount}
                      onChange={(e) =>
                        setManualAmount(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-8 pr-3 text-xs font-black text-slate-900 focus:border-indigo-500 focus:outline-none"
                      placeholder="Masukkan jumlah nominal"
                    />
                  </div>
                </div>

                {/* If Kredit, choose payment method */}
                {manualType === "kredit" && (
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                      Metode Pembayaran
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setManualPayMethod("cash")}
                        className={`py-2 px-3 rounded-xl border text-center text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${manualPayMethod === "cash"
                            ? "border-emerald-600 bg-emerald-50 text-emerald-700 shadow-xs"
                            : "border-slate-200 bg-slate-50/50 text-slate-600"
                          }`}
                      >
                        Cash (Tunai)
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualPayMethod("transfer")}
                        className={`py-2 px-3 rounded-xl border text-center text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${manualPayMethod === "transfer"
                            ? "border-emerald-600 bg-emerald-50 text-emerald-700 shadow-xs"
                            : "border-slate-200 bg-slate-50/50 text-slate-600"
                          }`}
                      >
                        Transfer Bank
                      </button>
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    Keterangan / Catatan
                  </label>
                  <textarea
                    placeholder="Contoh: Saldo awal buku besar, koreksi selisih kas, dll."
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none resize-none"
                  />
                </div>

                {/* Form buttons */}
                <div className="flex gap-2.5 justify-end pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsManualModalOpen(false)}
                    className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 text-xs font-bold transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 text-xs font-black uppercase tracking-wider shadow-sm transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" /> Simpan Penyesuaian
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
