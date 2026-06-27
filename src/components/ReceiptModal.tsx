import React, { useRef, useState, useEffect } from "react";
import { Transaction } from "../types";
import { formatRupiah, formatDate, downloadFile } from "../utils/format";
import { db } from "../utils/db";
import { Printer, Download, X, CopyCheck, FileText, Usb, CheckCircle2, AlertCircle } from "lucide-react";
import { jsPDF } from "jspdf";
import {
  isWebUSBSupported,
  getConnectedPrinter,
  connectPrinter,
  disconnectPrinter,
  printDirectEscPos,
  PrinterDevice,
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
  const receiptRef = useRef<HTMLDivElement>(null);
  const isIframe = typeof window !== "undefined" && window.self !== window.top;

  const handleConnectPrinter = async () => {
    setPrinterError(null);
    try {
      const dev = await connectPrinter();
      setConnectedPrinter(dev);
    } catch (err: any) {
      let msg = err.message || "Gagal menyambungkan ke printer.";
      if (msg.includes("permissions policy") || msg.includes("disallowed")) {
        msg = "Izin USB diblokir di dalam frame pratinjau. Silakan Buka di Tab Baru (ikon panah keluar di pojok kanan atas browser Anda) untuk menggunakan fitur printer USB thermal secara langsung.";
      }
      setPrinterError(msg);
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
      setPrinterError(err.message || "Gagal mencetak langsung. Pastikan printer Epson TM-80UB terhubung.");
    } finally {
      setIsPrintingDirect(false);
    }
  };

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
        const txs = await db.getTransactions();
        const payments = await db.getDebtPayments();

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
              body {
                font-family: 'Courier New', Courier, monospace;
                width: 80mm;
                margin: 0 auto;
                padding: 10px;
                font-size: 12px;
                color: #000;
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
              .text-xs { font-size: 12px; }
              .text-sm { font-size: 14px; }
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
                font-size: 14px;
                margin-bottom: 10px;
              }
              @media print {
                body { width: 80mm; margin: 0; padding: 0; }
                @page { margin: 0; }
              }
            </style>
          </head>
          <body>
            ${printContent}
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
    txt += `           Telp/Hp. +62 877-6908-0999\n`;
    txt += `================================================\n`;
    if (isDuplicate) {
      txt += `*** DUPLIKAT ***\n`;
    }
    txt += `No. Nota  : ${transaction.invoiceNumber}\n`;
    txt += `Tanggal   : ${formatDate(transaction.date)}\n`;
    txt += `Pelanggan : ${transaction.customerName}\n`;
    txt += `================================================\n`;

    transaction.items.forEach((item, index) => {
      const line1 = `${index + 1}. ${item.name}`;
      const qtyStr = `${item.quantity} ${item.unit} x ${formatRupiah(item.price)}`;
      const subTotalStr = formatRupiah(item.subtotal);

      txt += `${line1}\n`;
      txt += `   ${qtyStr.padEnd(30)} ${subTotalStr.padStart(12)}\n`;
    });

    txt += `------------------------------------------------\n`;
    txt += `TOTAL     : ${formatRupiah(transaction.totalAmount).padStart(34)}\n`;
    txt += `METODE    : ${transaction.paymentMethod.toUpperCase().padStart(34)}\n`;
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
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a5", // perfect size for standard trade invoices
    });

    // Outer framing / border
    doc.setDrawColor(0, 0, 0); // black top border accent
    doc.setLineWidth(1.5);
    doc.line(5, 5, 143, 5); // black top border

    // Header logo / title
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0); // black
    doc.text("CV DPJ BERKAH UNGGAS", 10, 15);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(6.5);
    doc.text("Kp. Pangkalan RT. 010 RW. 004 Desa Pangkalan Kecamatan Bojong Kabupaten Purwakarta", 10, 23.5);
    doc.text("Telp/Hp. +62 877-6908-0999", 10, 27);

    // Receipt Label
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text("NOTA PENJUALAN", 100, 15);

    // Metadata separator
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(10, 30, 138, 30);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(`No. Nota  : ${transaction.invoiceNumber}`, 10, 36);
    doc.text(`Tanggal   : ${formatDate(transaction.date)}`, 10, 41);

    // Safety Truncate for Customer Name to avoid overlap with Stamp box
    let customerNameDisplay = transaction.customerName;
    if (isDuplicate && customerNameDisplay.length > 25) {
      customerNameDisplay = customerNameDisplay.substring(0, 22) + "...";
    } else if (customerNameDisplay.length > 40) {
      customerNameDisplay = customerNameDisplay.substring(0, 37) + "...";
    }
    doc.text(`Pelanggan : ${customerNameDisplay}`, 10, 46);

    if (isDuplicate) {
      doc.setFillColor(255, 255, 255);
      doc.rect(82, 33, 56, 13, "F");
      doc.setDrawColor(0, 0, 0);
      doc.rect(82, 33, 56, 13, "D");
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text("*** DUPLIKAT ***", 96, 38);
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7);
      doc.text("Sudah Pernah Dicetak", 93, 42);
    }

    // Table Header (using neat lines instead of heavy solid black background block to save ink)
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(10, 51, 138, 51);
    doc.line(10, 57, 138, 57);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text("Nama Item", 12, 55);
    doc.text("Qty x Harga", 62, 55);
    doc.text("Subtotal", 136, 55, { align: "right" });

    // Table content
    doc.setTextColor(0, 0, 0);
    doc.setFont("Helvetica", "normal");
    let y = 61;
    const pageBottomLimit = 180; // A5 height is 210mm, so 180mm is a safe limit

    transaction.items.forEach((item, index) => {
      // Auto page break if y exceeds limit
      if (y > pageBottomLimit) {
        doc.addPage();

        // Redraw border on new page
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(1.5);
        doc.line(5, 5, 143, 5);

        // Mini Header on new page
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text("CV DPJ BERKAH UNGGAS", 10, 12);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.text(`No. Nota: ${transaction.invoiceNumber} (Sambungan)`, 10, 16);

        // Redraw Table Header (neat lines)
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.3);
        doc.line(10, 19, 138, 19);
        doc.line(10, 25, 138, 25);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.text("Nama Item", 12, 23);
        doc.text("Qty x Harga", 62, 23);
        doc.text("Subtotal", 136, 23, { align: "right" });

        doc.setTextColor(0, 0, 0);
        doc.setFont("Helvetica", "normal");
        y = 29;
      }

      // zebra background shading is removed to save ink

      // Safety Truncate Item Name to avoid column overlap
      const itemNameDisplay =
        item.name.length > 25 ? item.name.substring(0, 23) + ".." : item.name;

      doc.text(itemNameDisplay, 12, y);
      doc.text(
        `${item.quantity} ${item.unit} x ${formatRupiah(item.price)}`,
        62,
        y,
      );
      doc.text(formatRupiah(item.subtotal), 136, y, { align: "right" });
      y += 5.5;
    });

    // If summary block will overflow the page bottom, push it to a new page
    if (y + 35 > 200) {
      doc.addPage();

      // Redraw top border
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1.5);
      doc.line(5, 5, 143, 5);

      // Mini Header
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text("CV DPJ BERKAH UNGGAS", 10, 12);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(`No. Nota: ${transaction.invoiceNumber} (Ringkasan)`, 10, 16);

      y = 24;
    }

    // Summary line
    doc.setDrawColor(0, 0, 0);
    doc.line(10, y + 1, 138, y + 1);
    y += 6;

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text("Metode Pembayaran:", 10, y);
    doc.setFont("Helvetica", "bold");
    doc.text(
      transaction.paymentMethod === "debt"
        ? "TEMPO (UTANG)"
        : transaction.paymentMethod.toUpperCase(),
      42,
      y,
    );

    doc.setFont("Helvetica", "normal");
    doc.text("TOTAL BELANJA:", 82, y);
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(formatRupiah(transaction.totalAmount), 136, y, { align: "right" });

    y += 5;
    doc.setTextColor(0, 0, 0);
    doc.setFont("Helvetica", "normal");
    doc.text("Jumlah Dibayar:", 82, y);
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(formatRupiah(transaction.amountPaid), 136, y, { align: "right" });

    const previousDebt =
      totalCustomerDebt -
      (transaction.paymentMethod === "debt" ? transaction.remainingDebt : 0);

    if (previousDebt > 0) {
      y += 5;
      doc.setTextColor(0, 0, 0);
      doc.setFont("Helvetica", "bold");
      doc.text("UTANG SBLMNYA:", 82, y);
      doc.text(formatRupiah(previousDebt), 136, y, { align: "right" });
    }

    if (totalCustomerDebt > 0) {
      y += 5;
      doc.setTextColor(0, 0, 0);
      doc.setFont("Helvetica", "bold");
      doc.text("TOTAL UTANG:", 82, y);
      doc.text(formatRupiah(totalCustomerDebt), 136, y, { align: "right" });
    }

    // Footer message
    y += 8;
    if (y + 10 > 200) {
      doc.addPage();

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1.5);
      doc.line(5, 5, 143, 5);

      y = 15;
    }
    doc.setDrawColor(0, 0, 0);
    doc.line(10, y, 138, y);

    y += 5;
    doc.setFont("Helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text(
      "Terima kasih atas kunjungan Anda di CV DPJ Berkah Unggas.",
      74,
      y,
      { align: "center" },
    );
    doc.text(
      "Ayam segar langsung dari pemotongan halal & higienis.",
      74,
      y + 3.5,
      { align: "center" },
    );

    doc.save(`Struk_${transaction.invoiceNumber}.pdf`);
  };

  const isDuplicate = currentPrintCount >= 1;

  return (
    <div
      id="receipt-modal-container"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 overflow-y-auto"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-4 sm:p-5 shadow-2xl relative border-t-8 border-slate-900 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]"
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
                <div className="text-[10px] font-bold uppercase tracking-wider mt-1 text-slate-950">
                  Sudah Pernah Dicetak Sebelumnya
                </div>
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
                Telp/Hp. +62 877-6908-0999
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
                      <div className="text-[10px] text-slate-400 font-bold mt-0.5">
                        {item.quantity} {item.unit} x {formatRupiah(item.price)}
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
                <span className="uppercase text-slate-900">
                  {transaction.paymentMethod === "debt"
                    ? "Utang"
                    : transaction.paymentMethod}
                </span>
              </div>
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
                        <span>Total Semua Utang:</span>
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

        {/* Epson USB Direct Print Control */}
        {isWebUSBSupported() && (
          <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs shrink-0">
            <div className="flex items-center justify-between font-bold text-slate-800">
              <span className="flex items-center gap-1.5 uppercase text-[10px] tracking-wider text-slate-500">
                <Usb className="w-3.5 h-3.5 text-slate-600 animate-pulse" /> Printer Epson TM-80UB (80mm)
              </span>
              {connectedPrinter ? (
                <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1 font-bold">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Terhubung
                </span>
              ) : (
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                  Belum Terhubung
                </span>
              )}
            </div>

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
              <div className="space-y-1.5">
                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                  Hubungkan printer Epson TM-80UB via kabel USB untuk mencetak struk secara langsung instan tanpa dialog browser.
                </p>
                <button
                  id="connect-printer-btn"
                  onClick={handleConnectPrinter}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-black uppercase tracking-wider text-[10px] py-2 px-3 shadow-sm transition duration-150 cursor-pointer"
                >
                  <Usb className="w-3.5 h-3.5 text-slate-600" /> Hubungkan Printer USB
                </button>
                {isIframe && (
                  <p className="text-[9px] text-amber-700 font-medium bg-amber-50 border border-amber-100/50 rounded-lg p-2 mt-1 leading-normal">
                    ⚠️ <b>Tips Iframe:</b> Klik tombol <b>"Buka di Tab Baru"</b> di pojok kanan atas browser Anda agar Chrome dapat membuka dialog koneksi printer USB.
                  </p>
                )}
              </div>
            )}

            {printerError && (
              <div className="flex items-start gap-1 p-2 bg-red-50 border border-red-100 rounded-lg text-[10px] font-semibold text-red-600">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{printerError}</span>
              </div>
            )}
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
  );
}
