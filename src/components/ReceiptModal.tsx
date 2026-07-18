import React, { useRef, useState, useEffect } from "react";
import { Transaction } from "../types";
import { formatRupiah, formatDate, downloadFile } from "../utils/format";
import { db } from "../utils/db";
import { Printer, Download, X, CopyCheck, FileText, Usb, CheckCircle2, AlertCircle, Bluetooth } from "lucide-react";
import { jsPDF } from "jspdf";
import {
  isWebUSBSupported,
  isBluetoothSupported,
  getConnectedPrinter,
  connectPrinter,
  connectBluetoothPrinter,
  disconnectPrinter,
  printDirectEscPos,
  PrinterDevice,
  autoConnectPrinter,
} from "../utils/printer";

interface ReceiptModalProps {
  transaction: Transaction;
  onClose: () => void;
  onPrintSuccess?: () => void;
}

export default function ReceiptModal({
  transaction,
  onClose,
  onPrintSuccess,
}: ReceiptModalProps) {
  const [currentPrintCount, setCurrentPrintCount] = useState(
    transaction.printCount,
  );
  const [totalCustomerDebt, setTotalCustomerDebt] = useState<number>(0);
  const [connectedPrinter, setConnectedPrinter] = useState<PrinterDevice | null>(getConnectedPrinter());
  const [printerError, setPrinterError] = useState<string | null>(null);
  const [isPrintingDirect, setIsPrintingDirect] = useState<boolean>(false);
  const [showUsbSettings, setShowUsbSettings] = useState<boolean>(true);
  const receiptRef = useRef<HTMLDivElement>(null);
  const isIframe = typeof window !== "undefined" && window.self !== window.top;

  const formatPrinterError = (err: any): string => {
    let msg = err.message || String(err);
    if (msg.includes("permissions policy") || msg.includes("disallowed")) {
      return "Izin USB diblokir di dalam frame pratinjau. Silakan Buka di Tab Baru (ikon panah keluar di pojok kanan atas browser Anda) untuk menggunakan fitur printer USB thermal secara langsung.";
    }
    if (
      msg.toLowerCase().includes("access denied") ||
      msg.toLowerCase().includes("failed to execute 'open'") ||
      msg.toLowerCase().includes("securityerror")
    ) {
      return (
        "AKSES PRINTER DITOLAK (Access Denied):\n\n" +
        "Sistem operasi (Windows/Mac) Anda mengunci port USB printer ini dengan driver bawaan (Epson/Printer standard).\n\n" +
        "💡 Solusi 1: Cetak via Browser (Sangat Mudah & Aman)\n" +
        "Silakan tutup opsi USB ini dan klik tombol merah \"Cetak Nota (Print)\" di paling bawah. Metode ini menggunakan dialog cetak bawaan yang kompatibel dengan semua jenis printer/driver tanpa perlu mengubah apa pun.\n\n" +
        "💡 Solusi 2: Gunakan Driver WinUSB (Cetak Instan Tanpa Dialog)\n" +
        "Untuk Windows, Anda perlu mengganti driver printer ke WinUSB:\n" +
        "1. Unduh software gratis Zadig di zadig.akeo.ie\n" +
        "2. Colok printer via USB, buka Zadig\n" +
        "3. Klik Options -> List All Devices\n" +
        "4. Pilih printer USB Anda dari dropdown\n" +
        "5. Ganti Driver target ke WinUSB, lalu klik Replace Driver\n" +
        "6. Segarkan aplikasi ini dan hubungkan kembali."
      );
    }
    return msg;
  };

  const renderPrinterError = () => {
    if (!printerError) return null;

    const isAccessDenied =
      printerError.toLowerCase().includes("access denied") ||
      printerError.toLowerCase().includes("failed to execute 'open'") ||
      printerError.toLowerCase().includes("akses printer ditolak");

    const isUnableToClaim =
      printerError.toLowerCase().includes("unable to claim interface") ||
      printerError.toLowerCase().includes("gagal mengklaim antarmuka") ||
      printerError.toLowerCase().includes("claiminterface");

    if (isUnableToClaim) {
      return (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left animate-in fade-in duration-200">
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle className="w-4.5 h-4.5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h5 className="font-bold text-xs text-amber-800 uppercase tracking-tight">
                Port Printer Terkunci (Unable to claim interface)
              </h5>
              <p className="text-[10px] text-amber-700 font-medium leading-relaxed mt-0.5">
                Koneksi printer USB sedang digunakan atau dikunci oleh proses lain di komputer Anda.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="bg-white border border-amber-100 rounded-lg p-2.5 shadow-xs">
              <span className="font-bold text-[11px] text-slate-800 block mb-1">💡 Cara Mengatasi:</span>
              <ul className="list-disc pl-4 text-[10px] text-slate-600 font-medium space-y-1">
                <li>
                  Tutup tab browser lain atau aplikasi kasir lain yang mungkin sedang terhubung ke printer.
                </li>
                <li>
                  Matikan printer thermal Anda selama 3 detik, lalu nyalakan kembali untuk mereset koneksi internal printer.
                </li>
                <li>
                  Klik tombol <b className="text-blue-700">"Hubungkan Printer USB"</b> kembali.
                </li>
                <li>
                  Jika Anda menggunakan Windows dan belum mengganti driver ke <b className="font-bold">WinUSB</b> melalui aplikasi <b className="font-bold text-blue-700">Zadig</b>, ikuti petunjuk Solusi 2 di bawah.
                </li>
              </ul>
            </div>
          </div>
        </div>
      );
    }

    if (isAccessDenied) {
      return (
        <div className="bg-red-50/50 border border-red-200 rounded-xl p-4 text-left animate-in fade-in duration-200">
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle className="w-4.5 h-4.5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h5 className="font-bold text-xs text-red-800 uppercase tracking-tight">
                Akses Printer USB Ditolak (Access Denied)
              </h5>
              <p className="text-[10px] text-red-600/90 font-medium leading-relaxed mt-0.5">
                Sistem operasi Anda sedang mengunci port USB printer ini dengan driver bawaan (Epson/Printer standard).
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Solusi 1 */}
            <div className="bg-white/80 border border-slate-100 rounded-lg p-2.5 shadow-xs">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="flex items-center justify-center w-4.5 h-4.5 rounded-full bg-emerald-50 text-[10px] font-black text-emerald-700 border border-emerald-150">
                  1
                </span>
                <span className="font-bold text-[11px] text-slate-800">
                  Solusi Termudah &amp; Instan (Rekomendasi)
                </span>
              </div>
              <p className="text-[10px] text-slate-600 font-medium leading-relaxed pl-6">
                Cukup klik tombol merah besar <b className="text-red-600 font-extrabold">"Cetak Nota (Print)"</b> di paling bawah modal ini. Metode ini menggunakan dialog cetak browser biasa yang otomatis bisa mencetak ke printer apa saja tanpa perlu setup driver tambahan.
              </p>
            </div>

            {/* Solusi 2 */}
            <div className="bg-white/80 border border-slate-100 rounded-lg p-2.5 shadow-xs">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="flex items-center justify-center w-4.5 h-4.5 rounded-full bg-blue-50 text-[10px] font-black text-blue-700 border border-blue-150">
                  2
                </span>
                <span className="font-bold text-[11px] text-slate-800">
                  Cetak Instan Langsung (Konfigurasi Windows)
                </span>
              </div>
              <div className="text-[10px] text-slate-600 font-medium leading-relaxed pl-6 space-y-1">
                <p>Agar printer bisa diakses langsung lewat web browser Google Chrome:</p>
                <ol className="list-decimal pl-3.5 space-y-1 mt-1 text-slate-700">
                  <li>
                    Unduh software gratis <b className="text-blue-600 font-bold">Zadig</b> di website resmi <a href="https://zadig.akeo.ie" target="_blank" rel="noopener noreferrer" className="underline font-bold text-blue-700">zadig.akeo.ie</a>
                  </li>
                  <li>Hubungkan kabel USB printer ke PC/Laptop Anda.</li>
                  <li>Buka aplikasi Zadig, pilih menu <b className="font-bold">Options</b> &gt; centang <b className="font-bold">List All Devices</b>.</li>
                  <li>Di dropdown atas, pilih perangkat printer USB Anda (contoh: <i>Epson TM-T82</i>).</li>
                  <li>Pastikan driver target di sebelah kanan tanda panah hijau adalah <b className="font-bold text-emerald-700">WinUSB</b>.</li>
                  <li>Klik tombol besar <b className="font-bold text-blue-700">Replace Driver</b> atau <b className="font-bold text-blue-700">Reinstall Driver</b>.</li>
                  <li>Refresh halaman web kasir ini dan coba hubungkan kembali!</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-start gap-1.5 p-3 bg-red-50 border border-red-100 rounded-lg text-[10px] font-semibold text-red-600 whitespace-pre-line text-left leading-relaxed">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-500" />
        <span>{printerError}</span>
      </div>
    );
  };

  const handleConnectPrinter = async () => {
    setPrinterError(null);
    try {
      const dev = await connectPrinter();
      setConnectedPrinter(dev);
    } catch (err: any) {
      setPrinterError(formatPrinterError(err));
    }
  };

  const handleConnectBluetoothPrinter = async () => {
    setPrinterError(null);
    try {
      const dev = await connectBluetoothPrinter();
      setConnectedPrinter(dev);
    } catch (err: any) {
      setPrinterError(formatPrinterError(err));
    }
  };

  const handleDisconnectPrinter = async () => {
    try {
      await disconnectPrinter();
      setConnectedPrinter(null);
    } catch (err) {
      console.warn(err);
    }
  };

  const handleDirectPrint = async () => {
    setPrinterError(null);
    setIsPrintingDirect(true);
    try {
      // Increment print count in DB
      await db.updateTransactionPrintCount(transaction.id);
      setCurrentPrintCount((prev) => (prev || 0) + 1);
      if (onPrintSuccess) {
        onPrintSuccess();
      }

      await printDirectEscPos(transaction, totalCustomerDebt, isDuplicate);
    } catch (err: any) {
      setPrinterError(formatPrinterError(err));
    } finally {
      setIsPrintingDirect(false);
    }
  };

  useEffect(() => {
    if ((isWebUSBSupported() || isBluetoothSupported()) && !connectedPrinter) {
      autoConnectPrinter()
        .then((dev) => {
          if (dev) {
            setConnectedPrinter(dev);
          }
        })
        .catch((err) => {
          console.warn("Auto-connect failed on modal load:", err);
        });
    }
  }, []);

  useEffect(() => {
    const fetchDebt = async () => {
      // Ignore general customers
      if (
        transaction.customerName.toLowerCase() === "pelanggan umum" ||
        transaction.customerId === "cust-1"
      ) {
        setTotalCustomerDebt(0);
        return;
      }

      try {
        const [txs, payments] = await Promise.all([
          db.getTransactions(),
          db.getDebtPayments(),
        ]);

        const targetTime = new Date(transaction.date).getTime();

        const customerTxs = txs.filter(
          (t) =>
            t.customerId === transaction.customerId &&
            new Date(t.date).getTime() <= targetTime,
        );
        const customerPayments = payments.filter(
          (p) =>
            p.customerId === transaction.customerId &&
            new Date(p.date).getTime() <= targetTime,
        );

        const totalDebt = customerTxs.reduce(
          (sum, t) => sum + (t.paymentMethod === "debt" ? t.remainingDebt : 0),
          0,
        );
        const totalPaid = customerPayments.reduce(
          (sum, p) => sum + p.amountPaid,
          0,
        );

        setTotalCustomerDebt(totalDebt - totalPaid);
      } catch (error) {
        console.warn("Error calculating exact debt:", error);
      }
    };
    fetchDebt();
  }, [transaction.customerId, transaction.date]);

  // Function to increment print count and trigger print
  const handlePrint = async () => {
    // Increment count in DB
    await db.updateTransactionPrintCount(transaction.id);
    setCurrentPrintCount((prev) => (prev || 0) + 1);
    if (onPrintSuccess) {
      onPrintSuccess();
    }

    // Trigger printing
    // To support clean printing even in iframes, we can create a temporary window or styled iframe
    // and write the receipt's HTML into it, then print that! This is extremely robust.
    const printContent = receiptRef.current?.innerHTML;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Cetak Struk - ${transaction.invoiceNumber}</title>
            <style>
              @page {
                size: 80mm auto;
                margin: 0;
              }
              html, body {
                width: 80mm;
                margin: 0;
                padding: 0;
                background: #fff;
                font-family: 'Courier New', Courier, monospace;
                font-size: 11px;
                color: #000;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .receipt-print-wrapper {
                width: 74mm;
                margin: 0 auto;
                padding: 4mm 2mm;
                box-sizing: border-box;
              }
              .center, .text-center { text-align: center; }
              .bold, .font-bold, .font-black, .font-extrabold { font-weight: bold; }
              .text-right { text-align: right; }
              .text-left { text-align: left; }
              .flex { display: flex; }
              .justify-between { justify-content: space-between; }
              .items-center { align-items: center; }
              .space-y-1 > * + * { margin-top: 0.25rem; }
              .space-y-1\\.5 > * + * { margin-top: 0.375rem; }
              .space-y-2 > * + * { margin-top: 0.5rem; }
              .mt-1 { margin-top: 0.25rem; }
              .mt-2 { margin-top: 0.5rem; }
              .mt-3 { margin-top: 0.75rem; }
              .mt-4 { margin-top: 1rem; }
              .mb-1 { margin-bottom: 0.25rem; }
              .mb-2 { margin-bottom: 0.5rem; }
              .mb-3 { margin-bottom: 0.75rem; }
              .mb-4 { margin-bottom: 1rem; }
              .pt-1 { padding-top: 0.25rem; }
              .pb-1 { padding-bottom: 0.25rem; }
              .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
              .pr-2 { padding-right: 0.5rem; }
              .uppercase { text-transform: uppercase; }
              .tracking-tight { letter-spacing: -0.025em; }
              .tracking-wider { letter-spacing: 0.05em; }
              .tracking-widest { letter-spacing: 0.1em; }
              .text-\\[8px\\] { font-size: 8px; }
              .text-\\[9px\\] { font-size: 9px; }
              .text-\\[10px\\] { font-size: 10px; }
              .text-\\[11px\\] { font-size: 11px; }
              .text-xs { font-size: 11px; }
              .text-sm { font-size: 13px; }
              .text-red-600, .text-red-500 { color: #000 !important; }
              .text-slate-400, .text-slate-500 { color: #000 !important; }
              .text-slate-600 { color: #000 !important; }
              .text-slate-800, .text-slate-900, .text-slate-950 { color: #000 !important; }
              .border-t { border-top: 1px dashed #000; }
              .border-b { border-bottom: 1px dashed #000; }
              .border-dashed { border-style: dashed; }
              
              .line { border-top: 1px dashed #000; margin: 8px 0; }
              .double-line { border-top: 2px double #000; margin: 8px 0; }
              table { width: 100%; border-collapse: collapse; }
              td, th { padding: 2px 0; vertical-align: top; color: #000 !important; }
              .duplicate-banner {
                border: 1px dashed #000 !important;
                background-color: #fff !important;
                color: #000 !important;
                padding: 5px;
                text-align: center;
                font-weight: bold;
                font-size: 13px;
                margin-bottom: 10px;
              }
              @media print {
                html, body { width: 80mm; margin: 0; padding: 0; background: #fff; }
                .receipt-print-wrapper { width: 74mm; margin: 0 auto; padding: 4mm 2mm; box-sizing: border-box; }
                @page { margin: 0; }
              }
            </style>
          </head>
          <body>
            <div class="receipt-print-wrapper">
              ${printContent}
            </div>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() { window.close(); }, 500);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } else {
      // Fallback: simple alert or local print
      window.print();
    }
  };

  // Function to download receipt as a structured .txt file
  const handleDownload = () => {
    const isDuplicate = currentPrintCount >= 1;
    let txt = "";
    txt += `================================================\n`;
    txt += `              CV DPJ BERKAH UNGGAS\n`;
    txt += `  Kp. Pangkalan RT. 010 RW. 004 Desa Pangkalan\n`;
    txt += `           Kec. Bojong Kab. Purwakarta\n`;
    txt += `           Telp/Hp. +62 818-0734-9347\n`;
    txt += `================================================\n`;
    if (isDuplicate) {
      txt += `*** DUPLIKAT ***\n`;
    }
    txt += `No. Nota  : ${transaction.invoiceNumber}\n`;
    txt += `Tanggal   : ${formatDate(transaction.date)}\n`;
    txt += `Pelanggan : ${transaction.customerName}\n`;
    if (transaction.notes && transaction.notes.trim()) {
      txt += `Catatan   : ${transaction.notes.trim()}\n`;
    }
    txt += `================================================\n`;

    transaction.items.forEach((item, index) => {
      const line1 = `${index + 1}. ${item.name}`;
      let qtyStr = "";
      if (transaction.usePenerimaan) {
        const qtyTerima =
          item.receivedQuantity !== undefined && item.receivedQuantity !== null
            ? item.receivedQuantity
            : item.quantity;
        qtyStr = `Trm: ${qtyTerima} ${item.unit} x ${formatRupiah(item.price)} (Krm: ${item.quantity})`;
      } else {
        qtyStr = `${item.quantity} ${item.unit} x ${formatRupiah(item.price)}`;
      }
      const subTotalStr = formatRupiah(item.subtotal);

      txt += `${line1}\n`;
      txt += `   ${qtyStr.padEnd(30)} ${subTotalStr.padStart(12)}\n`;
    });

    txt += `------------------------------------------------\n`;
    txt += `TOTAL     : ${formatRupiah(transaction.totalAmount).padStart(34)}\n`;
    txt += `METODE    : ${transaction.paymentMethod.toUpperCase().padStart(34)}\n`;
    if (transaction.paymentMethod === "mix" || (transaction.paymentMethod === "debt" && (transaction.cashAmount || transaction.transferAmount))) {
      txt += ` - CASH   : ${formatRupiah(transaction.cashAmount || 0).padStart(34)}\n`;
      txt += ` - TRSF   : ${formatRupiah(transaction.transferAmount || 0).padStart(34)}\n`;
    }
    txt += `BAYAR     : ${formatRupiah(transaction.amountPaid).padStart(34)}\n`;

    const previousDebt =
      totalCustomerDebt -
      (transaction.paymentMethod === "debt" ? transaction.remainingDebt : 0);

    if (previousDebt > 0) {
      txt += `UTANG SBLMNYA:${formatRupiah(previousDebt).padStart(31)}\n`;
    }

    if (totalCustomerDebt > 0) {
      txt += `TOTAL UTANG:${formatRupiah(totalCustomerDebt).padStart(33)}\n`;
    }

    txt += `================================================\n`;
    txt += `            INFO REKENING PEMBAYARAN\n`;
    txt += `         (A/N Panji Paranantias Mulyono)\n`;
    txt += `  BCA: 7410888879\n`;
    txt += `  BRI: 007501001986565\n`;
    txt += `  MANDIRI: 173008118881\n`;
    txt += `================================================\n`;
    txt += `        Terima Kasih Atas Kunjungan Anda\n`;
    txt += `          Ayam Segar, Halal & Higienis\n`;
    txt += `================================================\n`;

    downloadFile(txt, `Struk_${transaction.invoiceNumber}.txt`, "text/plain");
  };

  const handleDownloadPDF = () => {
    const isDuplicate = currentPrintCount >= 1;
    const previousDebt =
      totalCustomerDebt -
      (transaction.paymentMethod === "debt" ? transaction.remainingDebt : 0);

    // Calculate dynamic page height in mm based on content length
    let pageHeight = 120; // baseline height
    if (isDuplicate) pageHeight += 15;
    if (transaction.notes && transaction.notes.trim()) pageHeight += 5;
    pageHeight += transaction.items.length * 8.5; // Each item takes about 8.5mm
    if (transaction.paymentMethod === "mix" || (transaction.paymentMethod === "debt" && (transaction.cashAmount || transaction.transferAmount))) {
      pageHeight += 8;
    }
    if (previousDebt > 0) pageHeight += 8;
    if (totalCustomerDebt > 0) pageHeight += 8;

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [80, pageHeight],
    });

    let y = 8;

    // 1. DUPLICATE BANNER (classic thermal printout style)
    if (isDuplicate) {
      doc.setFont("Courier", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text("*********************************", 40, y, { align: "center" });
      y += 4;
      doc.text("***       D U P L I K A T     ***", 40, y, { align: "center" });
      y += 4;
      doc.text("*********************************", 40, y, { align: "center" });
      y += 6;
    }

    // 2. BUSINESS HEADER
    doc.setFont("Courier", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("CV DPJ BERKAH UNGGAS", 40, y, { align: "center" });
    y += 5;

    doc.setFont("Courier", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text("Kp. Pangkalan RT. 010 RW. 004 Desa Pangkalan", 40, y, { align: "center" });
    y += 3.5;
    doc.text("Kec. Bojong Kab. Purwakarta", 40, y, { align: "center" });
    y += 3.5;
    doc.text("Telp/Hp. +62 818-0734-9347", 40, y, { align: "center" });
    y += 5;

    // Divider
    doc.setFont("Courier", "normal");
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text("------------------------------------------", 40, y, { align: "center" });
    y += 4.5;

    // 3. METADATA
    doc.setFont("Courier", "bold");
    doc.setFontSize(8.5);

    // No. Nota
    doc.setTextColor(148, 163, 184); // Label
    doc.text("No. Nota:", 6, y);
    doc.setTextColor(15, 23, 42); // Value
    doc.text(transaction.invoiceNumber, 74, y, { align: "right" });
    y += 4;

    // Tanggal
    doc.setTextColor(148, 163, 184); // Label
    doc.text("Tanggal :", 6, y);
    doc.setTextColor(15, 23, 42); // Value
    doc.text(formatDate(transaction.date), 74, y, { align: "right" });
    y += 4;

    // Pelanggan
    doc.setTextColor(148, 163, 184); // Label
    doc.text("Pelanggan:", 6, y);
    doc.setTextColor(15, 23, 42); // Value
    doc.text(transaction.customerName, 74, y, { align: "right" });
    y += 4;

    // Catatan
    if (transaction.notes && transaction.notes.trim()) {
      doc.setTextColor(148, 163, 184); // Label
      doc.text("Catatan  :", 6, y);
      doc.setTextColor(15, 23, 42); // Value
      doc.text(transaction.notes.trim(), 74, y, { align: "right" });
      y += 4;
    }

    y += 0.5;
    doc.setFont("Courier", "normal");
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text("------------------------------------------", 40, y, { align: "center" });
    y += 4.5;

    // 4. ITEMS TABLE HEADER
    doc.setFont("Courier", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text("Item / Deskripsi", 6, y);
    doc.text("Subtotal", 74, y, { align: "right" });
    y += 4;

    doc.setFont("Courier", "normal");
    doc.setFontSize(9);
    doc.text("------------------------------------------", 40, y, { align: "center" });
    y += 4.5;

    // 5. ITEMS ROWS
    transaction.items.forEach((item) => {
      // Item Name
      doc.setFont("Courier", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(item.name, 6, y);

      // Subtotal on the same line
      doc.text(formatRupiah(item.subtotal), 74, y, { align: "right" });
      y += 4;

      // Item Qty details (matching exact styling of green & gray)
      doc.setFont("Courier", "normal");
      doc.setFontSize(8);
      if (transaction.usePenerimaan) {
        const qtyTerima =
          item.receivedQuantity !== undefined && item.receivedQuantity !== null
            ? item.receivedQuantity
            : item.quantity;

        doc.setTextColor(15, 118, 110); // emerald-700
        const greenPart = `Trm: ${qtyTerima} ${item.unit}`;
        doc.text(greenPart, 8, y);
        const greenWidth = doc.getTextWidth(greenPart);

        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(` x ${formatRupiah(item.price)} (Krm: ${item.quantity})`, 8 + greenWidth, y);
      } else {
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(
          `${item.quantity} ${item.unit} x ${formatRupiah(item.price)}`,
          8,
          y
        );
      }
      y += 4.5;
    });

    doc.setFont("Courier", "normal");
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text("------------------------------------------", 40, y, { align: "center" });
    y += 4.5;

    // 6. TOTALS
    // TOTAL BELANJA
    doc.setFont("Courier", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text("TOTAL BELANJA:", 6, y);
    doc.text(formatRupiah(transaction.totalAmount), 74, y, { align: "right" });
    y += 4.5;

    // Metode Pembayaran
    doc.setFont("Courier", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text("Metode Pembayaran:", 6, y);

    doc.setFont("Courier", "bold");
    doc.setTextColor(15, 23, 42);
    const payMethodName = transaction.paymentMethod === "debt"
      ? "Utang"
      : transaction.paymentMethod === "mix"
        ? "Campuran (Mix)"
        : transaction.paymentMethod.toUpperCase();
    doc.text(payMethodName, 74, y, { align: "right" });
    y += 4;

    // Mix/Debt Details
    if (transaction.paymentMethod === "mix" || (transaction.paymentMethod === "debt" && (transaction.cashAmount || transaction.transferAmount))) {
      doc.setFont("Courier", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);

      doc.text(" - Cash :", 8, y);
      doc.setTextColor(15, 23, 42);
      doc.text(formatRupiah(transaction.cashAmount || 0), 74, y, { align: "right" });
      y += 4;

      doc.setTextColor(100, 116, 139);
      doc.text(" - Transfer:", 8, y);
      doc.setTextColor(15, 23, 42);
      doc.text(formatRupiah(transaction.transferAmount || 0), 74, y, { align: "right" });
      y += 4;
    }

    // Jumlah Dibayar
    doc.setFont("Courier", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text("Jumlah Dibayar:", 6, y);

    doc.setFont("Courier", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(formatRupiah(transaction.amountPaid), 74, y, { align: "right" });
    y += 4.5;

    // Utang Sebelumnya
    if (previousDebt > 0) {
      doc.setFont("Courier", "normal");
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text("------------------------------------------", 40, y, { align: "center" });
      y += 4;

      doc.setFont("Courier", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text("Utang Sebelumnya:", 6, y);
      doc.text(formatRupiah(previousDebt), 74, y, { align: "right" });
      y += 4;
    }

    // Total Utang
    if (totalCustomerDebt > 0) {
      doc.setFont("Courier", "normal");
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text("------------------------------------------", 40, y, { align: "center" });
      y += 4;

      doc.setFont("Courier", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text("Total Utang:", 6, y);
      doc.text(formatRupiah(totalCustomerDebt), 74, y, { align: "right" });
      y += 4;
    }

    doc.setFont("Courier", "normal");
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text("------------------------------------------", 40, y, { align: "center" });
    y += 5;

    // 7. BANK ACCOUNTS
    doc.setFont("Courier", "bold");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("INFO REKENING PEMBAYARAN", 40, y, { align: "center" });
    y += 3.5;

    doc.setFont("Courier", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("(A/N Panji Paranantias Mulyono)", 40, y, { align: "center" });
    y += 4;

    // BCA
    doc.setFont("Courier", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("BCA:", 10, y);
    doc.setFont("Courier", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("7410888879", 70, y, { align: "right" });
    y += 3.5;

    // BRI
    doc.setFont("Courier", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text("BRI:", 10, y);
    doc.setFont("Courier", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("007501001986565", 70, y, { align: "right" });
    y += 3.5;

    // MANDIRI
    doc.setFont("Courier", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text("MANDIRI:", 10, y);
    doc.setFont("Courier", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("173008118881", 70, y, { align: "right" });
    y += 4.5;

    doc.setFont("Courier", "normal");
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text("------------------------------------------", 40, y, { align: "center" });
    y += 4.5;

    // 8. FOOTER GREETING
    doc.setFont("Courier", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text("Terima Kasih Atas Kunjungan Anda", 40, y, { align: "center" });
    y += 3.5;

    doc.text("Barang yang sudah dibeli tidak dapat ditukar/dikembalikan", 40, y, { align: "center" });
    y += 4;

    doc.setFont("Courier", "normal");
    doc.setFontSize(6.5);
    doc.text("Sistem Kasir v1.0 • CV DPJ Berkah Unggas", 40, y, { align: "center" });

    doc.save(`Struk_${transaction.invoiceNumber}.pdf`);
  };

  const isDuplicate = currentPrintCount >= 1;

  return (
    <div
      id="receipt-modal-container"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-955/40 backdrop-blur-sm p-4"
    >
      <div className="flex min-h-full items-center justify-center">
        <div
          className="w-full max-w-md rounded-2xl bg-white p-4 sm:p-5 shadow-2xl relative border-t-8 border-slate-900 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[92vh] my-8"
          style={{ width: "403.2px" }}
        >
          {/* Header Options */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3 shrink-0">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-tight">
              <CopyCheck className="text-slate-900 w-4 h-4" /> Detail Struk Belanja
            </h3>
            <button
              id="close-receipt-btn"
              onClick={onClose}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Receipt Container (Classic paper slip design) */}
          <div className="bg-white border border-slate-300 rounded-xl p-4 mb-4 font-mono text-[10px] sm:text-xs text-slate-900 flex-1 overflow-y-auto">
            <div ref={receiptRef} className="receipt-paper">
              {/* DUPLICATE BANNER (Only visible if printed before) */}
              {isDuplicate && (
                <div className="duplicate-banner border border-dashed border-slate-950 text-slate-950 p-3 text-center font-black text-xs mb-4 rounded-xl tracking-widest">
                  *** DUPLIKAT ***
                </div>
              )}

              {/* Business Header */}
              <div className="text-center mb-4">
                <h4 className="text-sm font-black text-slate-950 tracking-tight uppercase">
                  CV DPJ Berkah Unggas
                </h4>
                <p className="text-[8px] text-slate-400 font-semibold mt-1 leading-normal max-w-[280px] mx-auto normal-case font-sans">
                  Kp. Pangkalan RT. 010 RW. 004 Desa Pangkalan
                  <br /> Kec. Bojong Kab. Purwakarta
                  <br />
                  Telp/Hp. +62 818-0734-9347
                </p>
                <div className="border-t border-dashed border-slate-300 my-3"></div>
              </div>

              {/* Metadata */}
              <div className="space-y-1 mb-4 text-[11px] font-bold">
                <div className="flex justify-between">
                  <span className="text-slate-400">No. Nota:</span>
                  <span className="text-slate-900">
                    {transaction.invoiceNumber}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tanggal:</span>
                  <span className="text-slate-800">
                    {formatDate(transaction.date)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Pelanggan:</span>
                  <span className="text-slate-900">
                    {transaction.customerName}
                  </span>
                </div>
                {transaction.notes && transaction.notes.trim() && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Catatan:</span>
                    <span className="text-slate-900 break-words text-right max-w-[150px]">
                      {transaction.notes}
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-slate-300 my-3"></div>

              {/* Items Table */}
              <table className="w-full mb-4 text-[11px]">
                <thead>
                  <tr className="border-b border-dashed border-slate-300 text-slate-400 text-[10px] font-bold">
                    <th className="text-left pb-1 uppercase tracking-wider font-bold">
                      Item / Deskripsi
                    </th>
                    <th className="text-right pb-1 uppercase tracking-wider font-bold">
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dashed divide-slate-150">
                  {transaction.items.map((item, index) => (
                    <tr key={index} className="align-top font-bold">
                      <td className="py-2 pr-2">
                        <div className="text-slate-900 font-black">
                          {item.name}
                        </div>
                        <div className="text-[10px] mt-0.5 font-bold">
                          {transaction.usePenerimaan ? (
                            (() => {
                              const qtyTerima =
                                item.receivedQuantity !== undefined &&
                                  item.receivedQuantity !== null
                                  ? item.receivedQuantity
                                  : item.quantity;
                              const susut = Math.max(0, item.quantity - qtyTerima);
                              return (
                                <div className="text-slate-600">
                                  <span className="text-emerald-700 font-black">
                                    Trm: {qtyTerima} {item.unit}
                                  </span>{" "}
                                  <span className="text-slate-400 font-normal">
                                    x {formatRupiah(item.price)}
                                  </span>{" "}
                                  <span className="text-slate-400 font-normal">
                                    (Krm: {item.quantity})
                                  </span>
                                </div>
                              );
                            })()
                          ) : (
                            <span className="text-slate-400">
                              {item.quantity} {item.unit} x {formatRupiah(item.price)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 text-right text-slate-900">
                        {formatRupiah(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-dashed border-slate-300 my-3"></div>

              {/* Calculations & Payment summary */}
              <div className="space-y-1.5 text-[11px] font-bold">
                <div className="flex justify-between text-xs font-black text-slate-950 pt-1">
                  <span>TOTAL BELANJA:</span>
                  <span className="text-slate-950 text-sm font-black">
                    {formatRupiah(transaction.totalAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Metode Pembayaran:</span>
                  <span className="uppercase text-slate-900 font-bold">
                    {transaction.paymentMethod === "debt"
                      ? "Utang"
                      : transaction.paymentMethod === "mix"
                        ? "Campuran (Mix)"
                        : transaction.paymentMethod}
                  </span>
                </div>
                {(transaction.paymentMethod === "mix" || (transaction.paymentMethod === "debt" && (transaction.cashAmount || transaction.transferAmount))) && (
                  <>
                    <div className="flex justify-between text-slate-500 pl-4">
                      <span>- Cash :</span>
                      <span className="text-slate-800">{formatRupiah(transaction.cashAmount || 0)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500 pl-4">
                      <span>- Transfer:</span>
                      <span className="text-slate-800">{formatRupiah(transaction.transferAmount || 0)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>Jumlah Dibayar:</span>
                  <span className="text-slate-900">
                    {formatRupiah(transaction.amountPaid)}
                  </span>
                </div>

                {(() => {
                  const previousDebt =
                    totalCustomerDebt -
                    (transaction.paymentMethod === "debt"
                      ? transaction.remainingDebt
                      : 0);
                  return (
                    <>
                      {previousDebt > 0 && (
                        <div className="flex justify-between text-slate-950 font-black pt-1 border-t border-dashed border-slate-300">
                          <span>Utang Sebelumnya:</span>
                          <span>{formatRupiah(previousDebt)}</span>
                        </div>
                      )}
                      {totalCustomerDebt > 0 && (
                        <div className="flex justify-between text-slate-950 font-black pt-1 border-t border-dashed border-slate-300">
                          <span>Total Utang:</span>
                          <span>{formatRupiah(totalCustomerDebt)}</span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Bank accounts section */}
              <div className="border-t border-dashed border-slate-300 my-3 pt-3 text-[9px] text-slate-600 font-bold space-y-1">
                <div className="text-center uppercase text-[8px] text-slate-400 tracking-wider font-bold">Info Rekening Pembayaran</div>
                <div className="text-center text-[8px] text-slate-500 font-medium normal-case font-sans">(A/N Panji Paranantias Mulyono)</div>
                <div className="flex justify-between px-2 font-mono">
                  <span>BCA:</span>
                  <span className="text-slate-950 font-black">7410888879</span>
                </div>
                <div className="flex justify-between px-2 font-mono">
                  <span>BRI:</span>
                  <span className="text-slate-950 font-black">007501001986565</span>
                </div>
                <div className="flex justify-between px-2 font-mono">
                  <span>MANDIRI:</span>
                  <span className="text-slate-950 font-black">173008118881</span>
                </div>
              </div>

              <div className="border-t border-dashed border-slate-300 my-4"></div>

              {/* Footer Greeting */}
              <div className="text-center text-[10px] text-slate-400 space-y-1 font-bold">
                <p>Terima Kasih Atas Kunjungan Anda</p>
                <p>Barang yang sudah dibeli tidak dapat ditukar/dikembalikan</p>
                <p className="text-[8px] tracking-wider uppercase mt-2">
                  Sistem Kasir v1.0 • CV DPJ Berkah Unggas
                </p>
              </div>
            </div>
          </div>

          {/* Thermal Printer Direct Print Control */}
          {(isWebUSBSupported() || isBluetoothSupported()) && (
            <div className="mb-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl shrink-0 transition-all duration-200">
              <div className="w-full flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5 uppercase text-[9px] tracking-wider text-slate-500 font-extrabold">
                  {connectedPrinter?.type === "bluetooth" ? (
                    <Bluetooth className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                  ) : (
                    <Usb className={`w-3.5 h-3.5 text-slate-600 ${connectedPrinter ? "animate-pulse" : ""}`} />
                  )}
                  Printer Thermal {connectedPrinter?.type ? `(${connectedPrinter.type.toUpperCase()})` : "80mm"}
                </span>
                <div className="flex items-center gap-2">
                  {connectedPrinter ? (
                    <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-bold">
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Terhubung
                    </span>
                  ) : (
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-bold">
                      Belum Terhubung
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-200/60 space-y-2 text-xs animate-in fade-in duration-200">
                {connectedPrinter ? (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-700 truncate">
                      Nama: <span className="text-slate-900 font-extrabold">{connectedPrinter.name}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        id="direct-escpos-print-btn"
                        onClick={handleDirectPrint}
                        disabled={isPrintingDirect}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold uppercase tracking-wide text-[10px] py-2 px-2.5 shadow-sm transition duration-150 cursor-pointer disabled:bg-emerald-400"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        {isPrintingDirect ? "Mencetak..." : "Cetak Langsung (ESC/POS)"}
                      </button>
                      <button
                        id="disconnect-printer-btn"
                        onClick={handleDisconnectPrinter}
                        className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold text-[10px] py-2 px-2.5 transition duration-150 cursor-pointer"
                      >
                        Putus
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                      Hubungkan printer thermal 80mm via kabel USB atau koneksi Bluetooth untuk cetak struk instan.
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      {isWebUSBSupported() && (
                        <button
                          id="connect-printer-btn"
                          onClick={handleConnectPrinter}
                          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-850 font-black uppercase tracking-wider text-[10px] py-2 px-2 shadow-sm transition duration-150 cursor-pointer"
                        >
                          <Usb className="w-3.5 h-3.5 text-slate-600" /> Hubungkan USB
                        </button>
                      )}

                      {isBluetoothSupported() && (
                        <button
                          id="connect-bluetooth-printer-btn"
                          onClick={handleConnectBluetoothPrinter}
                          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-850 font-black uppercase tracking-wider text-[10px] py-2 px-2 shadow-sm transition duration-150 cursor-pointer"
                        >
                          <Bluetooth className="w-3.5 h-3.5 text-blue-600" /> Bluetooth
                        </button>
                      )}
                    </div>

                    {isIframe && (
                      <p className="text-[9px] text-amber-700 font-medium bg-amber-50 border border-amber-100/50 rounded-lg p-2 mt-1 leading-normal">
                        ⚠️ <b>Tips Iframe:</b> Klik tombol <b>"Buka di Tab Baru"</b> di pojok kanan atas browser Anda agar Chrome dapat membuka dialog koneksi printer USB/Bluetooth.
                      </p>
                    )}
                  </div>
                )}

                {renderPrinterError()}
              </div>
            </div>
          )}

          {/* Dialog Actions */}
          <div className="space-y-2 shrink-0">
            <button
              id="print-receipt-btn"
              onClick={handlePrint}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white font-black uppercase tracking-wider text-xs py-3.5 px-4 shadow-md shadow-red-600/10 transition-all duration-200 cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Cetak Nota (Print)
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                id="download-receipt-pdf-btn"
                onClick={handleDownloadPDF}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50/40 hover:bg-red-50 text-red-700 font-bold text-xs py-2.5 px-3 shadow-sm transition-all duration-200 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" /> Download PDF
              </button>

              <button
                id="download-receipt-txt-btn"
                onClick={handleDownload}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs py-2.5 px-3 shadow-sm transition-all duration-200 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Download TXT
              </button>
            </div>
          </div>

          {isDuplicate && (
            <p className="text-center text-[11px] text-red-500 font-bold mt-3">
              * Cetakan ini adalah salinan (duplikat) yang ditandai secara
              otomatis.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
