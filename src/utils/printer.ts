import { Transaction } from "../types";
import { formatRupiah, formatDate } from "./format";

// ESC/POS Commands Constants
const ESC = 0x1b;
const GS = 0x1d;

export interface PrinterDevice {
    name: string;
    vendorId: number;
    productId: number;
}

// Global cached USB device reference
let connectedDevice: any = null;
let selectedEndpointOut: any = null;
let claimedInterfaceNumber: number | null = null;

/**
 * Checks if the WebUSB API is supported in the current browser.
 */
export function isWebUSBSupported(): boolean {
    return typeof navigator !== "undefined" && !!(navigator as any).usb;
}

/**
 * Returns details of the currently connected printer, if any.
 */
export function getConnectedPrinter(): PrinterDevice | null {
    if (!connectedDevice) return null;
    return {
        name: connectedDevice.productName || "Epson Thermal Printer",
        vendorId: connectedDevice.vendorId,
        productId: connectedDevice.productId,
    };
}

/**
 * Attempts to request and connect to a WebUSB printer.
 * If filters are specified, it tries to look for Epson printers (vendorId: 0x04b8) first,
 * then falls back to letting the user select any USB device.
 */
export async function connectPrinter(): Promise<PrinterDevice> {
    if (!isWebUSBSupported()) {
        throw new Error("WebUSB tidak didukung di browser ini. Gunakan Google Chrome atau Microsoft Edge.");
    }

    try {
        // Request permission for USB device
        // Epson vendor ID is 0x04b8. We also allow selecting any device to support other thermal printers.
        const device = await (navigator as any).usb.requestDevice({
            filters: [
                { vendorId: 0x04b8 }, // Epson
                { classCode: 7 },     // Printers
            ],
        }).catch(async () => {
            // Fallback: allow selecting any USB device if filtering failed or user wants another brand
            return await (navigator as any).usb.requestDevice({ filters: [] });
        });

        await device.open();

        // Select configuration
        if (device.configuration === null) {
            await device.selectConfiguration(1);
        }

        // Auto-detect bulk OUT endpoint and interface
        let endpointOut: any = null;
        let interfaceNumber: number | null = null;

        for (const iface of device.configuration?.interfaces || []) {
            for (const alt of iface.alternates) {
                for (const ep of alt.endpoints) {
                    if (ep.direction === "out" && ep.type === "bulk") {
                        endpointOut = ep;
                        interfaceNumber = iface.interfaceNumber;
                        break;
                    }
                }
                if (endpointOut) break;
            }
            if (endpointOut) break;
        }

        if (!endpointOut || interfaceNumber === null) {
            throw new Error("Tidak menemukan port output data (Bulk OUT endpoint) pada printer ini.");
        }

        // Claim the interface
        await device.claimInterface(interfaceNumber);

        // Save global references
        connectedDevice = device;
        selectedEndpointOut = endpointOut;
        claimedInterfaceNumber = interfaceNumber;

        // Send Printer Initialization command (ESC @)
        const initCmd = new Uint8Array([ESC, 0x40]);
        await device.transferOut(endpointOut.endpointNumber, initCmd);

        return {
            name: device.productName || "Epson Thermal Printer",
            vendorId: device.vendorId,
            productId: device.productId,
        };
    } catch (err: any) {
        console.error("USB Printer connection error:", err);
        throw new Error(err.message || "Gagal menghubungkan printer.");
    }
}

/**
 * Disconnects the printer and releases USB interfaces.
 */
export async function disconnectPrinter(): Promise<void> {
    if (!connectedDevice) return;

    try {
        if (claimedInterfaceNumber !== null) {
            await connectedDevice.releaseInterface(claimedInterfaceNumber);
        }
        await connectedDevice.close();
    } catch (err) {
        console.warn("Error during printer close/release:", err);
    } finally {
        connectedDevice = null;
        selectedEndpointOut = null;
        claimedInterfaceNumber = null;
    }
}

/**
 * Helper to encode text as standard Latin-1 / CP850 bytes
 */
function encodeText(text: string): Uint8Array {
    // Simple encoder that maps characters to standard single-byte values for ESC/POS receipt printers
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        bytes[i] = charCode < 256 ? charCode : 0x3f; // replace out-of-range chars with '?'
    }
    return bytes;
}

/**
 * Compiles a transaction into a sequence of ESC/POS bytes optimized for 80mm (48 characters wide) printers.
 */
export function compileEscPosReceipt(
    transaction: Transaction,
    totalCustomerDebt: number,
    isDuplicate: boolean
): Uint8Array {
    const chunks: Uint8Array[] = [];

    // Command helper to push bytes
    const pushCmd = (bytes: number[]) => {
        chunks.push(new Uint8Array(bytes));
    };

    const pushText = (text: string) => {
        chunks.push(encodeText(text));
    };

    // 1. Initialize Printer (ESC @)
    pushCmd([ESC, 0x40]);

    // 2. Set line spacing to default (ESC 2)
    pushCmd([ESC, 0x32]);

    // 3. Print DUPLICATE banner if needed
    if (isDuplicate) {
        pushCmd([ESC, 0x61, 0x01]); // Align Center
        pushCmd([ESC, 0x45, 0x01]); // Bold ON
        pushText("*** DUPLIKAT ***\n");
        pushText("Sudah Pernah Dicetak Sebelumnya\n");
        pushCmd([ESC, 0x45, 0x00]); // Bold OFF
        pushText("------------------------------------------------\n"); // 48 chars
    }

    // 4. Header (Center Aligned, Bold Business Title)
    pushCmd([ESC, 0x61, 0x01]); // Align Center
    pushCmd([GS, 0x21, 0x11]);  // Double width, double height
    pushCmd([ESC, 0x45, 0x01]); // Bold ON
    pushText("CV DPJ BERKAH UNGGAS\n");
    pushCmd([GS, 0x21, 0x00]);  // Normal size
    pushCmd([ESC, 0x45, 0x00]); // Bold OFF

    pushText("Pusat Grosir & Retail Ayam Segar\n");
    pushText("Halal, Higienis & Berkualitas\n");
    pushText("Kp. Pangkalan RT. 010 RW. 004 Desa Pangkalan\n");
    pushText("Kec. Bojong Kab. Purwakarta\n");
    pushText("Telp/Hp. +62 877-6908-0999\n");
    pushText("------------------------------------------------\n"); // 48 chars

    // 5. Metadata (Left Aligned)
    pushCmd([ESC, 0x61, 0x00]); // Align Left
    pushText(`No. Nota  : ${transaction.invoiceNumber}\n`);
    pushText(`Tanggal   : ${formatDate(transaction.date, true)}\n`);
    pushText(`Pelanggan : ${transaction.customerName}\n`);
    pushText("================================================\n"); // 48 chars

    // 6. Items Table (48 Characters width column layout)
    // Columns:
    // Item Name: Left aligned, multi-line if needed.
    // Qty x Price: Indented, left aligned.
    // Subtotal: Right aligned on the same line as qty x price.
    transaction.items.forEach((item, index) => {
        // Row 1: Index & Item Name
        const itemName = `${index + 1}. ${item.name}`;
        pushText(`${itemName}\n`);

        // Row 2: Qty x Price and Subtotal
        const qtyPriceStr = `   ${item.quantity} ${item.unit} x ${formatRupiah(item.price)}`;
        const subtotalStr = formatRupiah(item.subtotal);

        // Pad spaces between Qty string and Subtotal to fill up 48 chars
        // Qty starts with 3 spaces indentation.
        const spacesNeeded = 48 - qtyPriceStr.length - subtotalStr.length;
        const spaces = spacesNeeded > 0 ? " ".repeat(spacesNeeded) : " ";

        pushText(`${qtyPriceStr}${spaces}${subtotalStr}\n`);
    });

    pushText("------------------------------------------------\n");

    // 7. Calculations & Totals (Right Aligned values)
    // Left label, right value. We can format these perfectly.
    const printTotalRow = (label: string, value: string, isBold: boolean = false) => {
        if (isBold) {
            pushCmd([ESC, 0x45, 0x01]); // Bold ON
        }
        const spacesNeeded = 48 - label.length - value.length;
        const spaces = spacesNeeded > 0 ? " ".repeat(spacesNeeded) : " ";
        pushText(`${label}${spaces}${value}\n`);
        if (isBold) {
            pushCmd([ESC, 0x45, 0x00]); // Bold OFF
        }
    };

    printTotalRow("TOTAL BELANJA:", formatRupiah(transaction.totalAmount), true);
    printTotalRow("Metode Pembayaran:", transaction.paymentMethod === "debt" ? "UTANG (TEMPO)" : transaction.paymentMethod.toUpperCase());
    if (transaction.paymentMethod === "mix") {
        printTotalRow(" - Cash / Tunai:", formatRupiah(transaction.cashAmount || 0));
        printTotalRow(" - Transfer:", formatRupiah(transaction.transferAmount || 0));
    }
    printTotalRow("Jumlah Dibayar:", formatRupiah(transaction.amountPaid));

    const previousDebt =
        totalCustomerDebt -
        (transaction.paymentMethod === "debt" ? transaction.remainingDebt : 0);

    if (previousDebt > 0) {
        printTotalRow("Utang Sebelumnya:", formatRupiah(previousDebt));
    }

    if (totalCustomerDebt > 0) {
        pushText("------------------------------------------------\n");
        printTotalRow("TOTAL SEMUA UTANG:", formatRupiah(totalCustomerDebt), true);
    }

    pushText("================================================\n");

    // Info Rekening Pembayaran
    pushCmd([ESC, 0x61, 0x01]); // Align Center
    pushCmd([ESC, 0x45, 0x01]); // Bold ON
    pushText("INFO REKENING PEMBAYARAN\n");
    pushCmd([ESC, 0x45, 0x00]); // Bold OFF
    pushText("(A/N Panji Paranantias Mulyono)\n");
    pushCmd([ESC, 0x61, 0x00]); // Align Left
    printTotalRow("BCA:", "7410888879");
    printTotalRow("BRI:", "007501001986565");
    printTotalRow("MANDIRI:", "173008118881");
    pushText("================================================\n");

    // 8. Footer (Center Aligned)
    pushCmd([ESC, 0x61, 0x01]); // Align Center
    pushText("Terima Kasih Atas Kunjungan Anda\n");
    pushText("Barang yang sudah dibeli tidak dapat\n");
    pushText("ditukar / dikembalikan\n");
    pushText("\n");
    pushText("Sistem Kasir v1.0 • CV DPJ Berkah Unggas\n");
    pushText("\n\n\n\n"); // Feed lines to clear cutter line

    // 9. Paper Cut Command (GS V 66 0)
    pushCmd([GS, 0x56, 0x42, 0x10]); // Feed 16 units and partial cut

    // Join all chunks into a single flat array
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    return result;
}

/**
 * Sends a raw ESC/POS transaction receipt payload directly to the connected WebUSB printer.
 */
export async function printDirectEscPos(
    transaction: Transaction,
    totalCustomerDebt: number,
    isDuplicate: boolean
): Promise<void> {
    if (!connectedDevice || !selectedEndpointOut) {
        throw new Error("Printer Epson belum terhubung. Silakan hubungkan printer terlebih dahulu.");
    }

    try {
        const rawData = compileEscPosReceipt(transaction, totalCustomerDebt, isDuplicate);

        // Transfer bulk data chunk-by-chunk to prevent endpoint overflow if data size is very large
        const maxChunkSize = 64; // Standard bulk endpoint buffer size
        for (let offset = 0; offset < rawData.length; offset += maxChunkSize) {
            const chunk = rawData.slice(offset, offset + maxChunkSize);
            await connectedDevice.transferOut(selectedEndpointOut.endpointNumber, chunk);
        }
    } catch (err: any) {
        console.error("Direct ESC/POS Print failed:", err);
        throw new Error(err.message || "Gagal mengirim data cetak ke printer Epson.");
    }
}
