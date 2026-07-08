import { Transaction } from "../types";
import { formatRupiah, formatDate } from "./format";

// ESC/POS Commands Constants
const ESC = 0x1b;
const GS = 0x1d;

export interface PrinterDevice {
    name: string;
    vendorId: number;
    productId: number;
    type?: "usb" | "bluetooth";
}

// Global cached device references
let connectedDevice: any = null;
let connectedDeviceType: "usb" | "bluetooth" | null = null;
let selectedEndpointOut: any = null;
let claimedInterfaceNumber: number | null = null;
let bluetoothWriteCharacteristic: any = null;

// Common service UUIDs for BLE/Bluetooth Thermal Printers to search/claim
const OPTIONAL_SERVICES = [
    "000018f0-0000-1000-8000-00805f9b34fb", // Custom print service
    "0000ffe0-0000-1000-8000-00805f9b34fb", // HM-10 Serial
    "0000ffe1-0000-1000-8000-00805f9b34fb", // Some printers use ffe1 as service UUID
    "0000fff0-0000-1000-8000-00805f9b34fb", // Common Custom BLE service
    "0000e001-0000-1000-8000-00805f9b34fb", // OEM/Chinese printer
    "00004953-0000-1000-8000-00805f9b34fb",
    "49535343-fe7d-41aa-8c12-3d7153514141", // ISSC SPP
    "00001101-0000-1000-8000-00805f9b34fb", // Serial Port Profile
];

// Mapping of service UUID to known write characteristic UUIDs
const SERVICE_CHARACTERISTICS_MAP: { [key: string]: string[] } = {
    "000018f0-0000-1000-8000-00805f9b34fb": [
        "00002af1-0000-1000-8000-00805f9b34fb",
        "00002af0-0000-1000-8000-00805f9b34fb"
    ],
    "0000ffe0-0000-1000-8000-00805f9b34fb": [
        "0000ffe1-0000-1000-8000-00805f9b34fb"
    ],
    "0000ffe1-0000-1000-8000-00805f9b34fb": [
        "0000ffe1-0000-1000-8000-00805f9b34fb",
        "0000ffe2-0000-1000-8000-00805f9b34fb"
    ],
    "0000fff0-0000-1000-8000-00805f9b34fb": [
        "0000fff1-0000-1000-8000-00805f9b34fb",
        "0000fff2-0000-1000-8000-00805f9b34fb"
    ],
    "0000e001-0000-1000-8000-00805f9b34fb": [
        "0000e002-0000-1000-8000-00805f9b34fb"
    ],
    "00004953-0000-1000-8000-00805f9b34fb": [
        "00004954-0000-1000-8000-00805f9b34fb"
    ],
    "49535343-fe7d-41aa-8c12-3d7153514141": [
        "49535343-8841-43f4-a8d4-ecbe34729bb3",
        "49535343-1e4d-4bd9-ba61-23c647249616"
    ],
    "00001101-0000-1000-8000-00805f9b34fb": [
        "00001101-0000-1000-8000-00805f9b34fb"
    ]
};

/**
 * Checks if the WebUSB API is supported in the current browser.
 */
export function isWebUSBSupported(): boolean {
    return typeof navigator !== "undefined" && !!(navigator as any).usb;
}

/**
 * Checks if the Web Bluetooth API is supported in the current browser.
 */
export function isBluetoothSupported(): boolean {
    return typeof navigator !== "undefined" && !!(navigator as any).bluetooth;
}

/**
 * Returns details of the currently connected printer, if any.
 */
export function getConnectedPrinter(): PrinterDevice | null {
    if (!connectedDevice) return null;
    return {
        name: connectedDevice.productName || connectedDevice.name || "Epson Thermal Printer",
        vendorId: connectedDevice.vendorId || 0,
        productId: connectedDevice.productId || 0,
        type: connectedDeviceType || "usb",
    };
}

let activeConnectionPromise: Promise<PrinterDevice | null> | null = null;

/**
 * Robust helper to open a device, select configuration, auto-detect endpoints, 
 * and claim the interface with retry mechanics to handle locked states.
 */
async function setupDevice(device: any): Promise<PrinterDevice> {
    // 1. Open the device if not already open
    if (!device.opened) {
        await device.open();
    }

    // 2. Select configuration
    if (device.configuration === null) {
        await device.selectConfiguration(1);
    }

    // 3. Auto-detect bulk OUT endpoint and interface
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

    // 4. Claim the interface with fallback/retry
    try {
        await device.claimInterface(interfaceNumber);
    } catch (claimErr: any) {
        console.warn("First claim interface attempt failed, trying release and retry...", claimErr);
        try {
            await device.releaseInterface(interfaceNumber).catch(() => { });
            await device.claimInterface(interfaceNumber);
        } catch (retryErr: any) {
            console.warn("Release and retry failed, attempting device reset...", retryErr);
            try {
                // Try resetting the USB device to clear any stuck hardware lock
                await device.reset().catch(() => { });
                // Give the OS/USB stack 500ms to recover the device state
                await new Promise((resolve) => setTimeout(resolve, 500));

                // Re-open device after reset
                if (!device.opened) {
                    await device.open();
                }
                if (device.configuration === null) {
                    await device.selectConfiguration(1);
                }
                await device.claimInterface(interfaceNumber);
            } catch (finalErr: any) {
                console.error("Failed to claim interface after reset:", finalErr);
                if (finalErr.message && finalErr.message.includes("Unable to claim interface")) {
                    throw new Error("Gagal mengklaim antarmuka printer (Unable to claim interface). Pastikan tidak ada aplikasi kasir lain atau tab browser lain yang sedang menggunakan printer ini.");
                }
                throw finalErr;
            }
        }
    }

    // 5. Save global references
    connectedDevice = device;
    connectedDeviceType = "usb";
    selectedEndpointOut = endpointOut;
    claimedInterfaceNumber = interfaceNumber;

    // 6. Send Printer Initialization command (ESC @)
    const initCmd = new Uint8Array([ESC, 0x40]);
    await device.transferOut(endpointOut.endpointNumber, initCmd).catch(() => { });

    return {
        name: device.productName || "Epson Thermal Printer",
        vendorId: device.vendorId,
        productId: device.productId,
        type: "usb",
    };
}

/**
 * Helper to connect and set up a Bluetooth device.
 */
async function setupBluetoothDevice(device: any): Promise<PrinterDevice> {
    const server = await device.gatt.connect();

    let writeCharacteristic: any = null;

    // Try to find the write characteristic in our known services first
    for (const serviceUuid of OPTIONAL_SERVICES) {
        try {
            const service = await server.getPrimaryService(serviceUuid);

            // 1. Try specific known write characteristics first to avoid blocklist SecurityErrors
            const knownChars = SERVICE_CHARACTERISTICS_MAP[serviceUuid] || [];
            for (const charUuid of knownChars) {
                try {
                    const char = await service.getCharacteristic(charUuid);
                    if (char.properties.write || char.properties.writeWithoutResponse) {
                        writeCharacteristic = char;
                        break;
                    }
                } catch (charErr) {
                    // Ignore and check next known char
                }
            }

            // 2. If not found, try getting all characteristics for this service
            if (!writeCharacteristic) {
                const characteristics = await service.getCharacteristics();
                for (const char of characteristics) {
                    if (char.properties.write || char.properties.writeWithoutResponse) {
                        writeCharacteristic = char;
                        break;
                    }
                }
            }
        } catch (e) {
            // Ignore and try next service
        }
        if (writeCharacteristic) break;
    }

    // If not found, try scanning all services (if allowed by browser/device)
    if (!writeCharacteristic) {
        try {
            const services = await server.getPrimaryServices();
            for (const service of services) {
                const characteristics = await service.getCharacteristics();
                for (const char of characteristics) {
                    if (char.properties.write || char.properties.writeWithoutResponse) {
                        writeCharacteristic = char;
                        break;
                    }
                }
                if (writeCharacteristic) break;
            }
        } catch (e) {
            console.warn("Failed to retrieve primary services:", e);
        }
    }

    if (!writeCharacteristic) {
        try {
            device.gatt.disconnect();
        } catch (e) {
            // Ignore
        }
        throw new Error("Tidak menemukan port tulis data (Write Characteristic) pada printer Bluetooth ini.");
    }

    // Save references
    connectedDevice = device;
    connectedDeviceType = "bluetooth";
    bluetoothWriteCharacteristic = writeCharacteristic;

    // Initialize printer command
    const initCmd = new Uint8Array([ESC, 0x40]);
    try {
        if (writeCharacteristic.writeValueWithoutResponse) {
            const p = writeCharacteristic.writeValueWithoutResponse(initCmd);
            if (p && typeof p.catch === "function") {
                await p.catch(() => { });
            } else {
                await p;
            }
        } else {
            const p = writeCharacteristic.writeValue(initCmd);
            if (p && typeof p.catch === "function") {
                await p.catch(() => { });
            } else {
                await p;
            }
        }
    } catch (initErr) {
        console.warn("Failed to write printer init command:", initErr);
    }

    return {
        name: device.name || "Printer Bluetooth",
        vendorId: 0,
        productId: 0,
        type: "bluetooth",
    };
}

/**
 * Automatically attempts to reconnect to a previously paired USB or Bluetooth printer.
 * This runs without showing a browser selection dialog.
 */
export async function autoConnectPrinter(): Promise<PrinterDevice | null> {
    if (connectedDevice) {
        return getConnectedPrinter();
    }

    if (activeConnectionPromise) {
        return activeConnectionPromise;
    }

    activeConnectionPromise = (async () => {
        // 1. Try USB reconnect first
        if (isWebUSBSupported()) {
            try {
                const devices = await (navigator as any).usb.getDevices();
                if (devices && devices.length > 0) {
                    let device = devices.find((d: any) => d.vendorId === 0x04b8);
                    if (!device) {
                        device = devices[0];
                    }
                    return await setupDevice(device);
                }
            } catch (err) {
                console.warn("Auto-connect USB failed, trying Bluetooth...", err);
            }
        }

        // 2. Try Bluetooth reconnect next
        if (isBluetoothSupported()) {
            try {
                const navigatorAny = navigator as any;
                if (navigatorAny.bluetooth && navigatorAny.bluetooth.getDevices) {
                    const btDevices = await navigatorAny.bluetooth.getDevices();
                    if (btDevices && btDevices.length > 0) {
                        return await setupBluetoothDevice(btDevices[0]);
                    }
                }
            } catch (err) {
                console.warn("Auto-connect Bluetooth failed:", err);
            }
        }

        return null;
    })();

    try {
        return await activeConnectionPromise;
    } finally {
        activeConnectionPromise = null;
    }
}

/**
 * Attempts to request and connect to a WebUSB printer.
 */
export async function connectPrinter(): Promise<PrinterDevice> {
    if (!isWebUSBSupported()) {
        throw new Error("WebUSB tidak didukung di browser ini. Gunakan Google Chrome atau Microsoft Edge.");
    }

    // Disconnect any existing printer session first to release interface
    await disconnectPrinter().catch(() => { });

    try {
        // Request permission for USB device
        const device = await (navigator as any).usb.requestDevice({
            filters: [
                { vendorId: 0x04b8 }, // Epson
                { classCode: 7 },     // Printers
            ],
        }).catch(async () => {
            // Fallback: allow selecting any USB device if filtering failed or user wants another brand
            return await (navigator as any).usb.requestDevice({ filters: [] });
        });

        return await setupDevice(device);
    } catch (err: any) {
        console.error("USB Printer connection error:", err);
        throw new Error(err.message || "Gagal menghubungkan printer.");
    }
}

/**
 * Attempts to request and connect to a Web Bluetooth printer.
 */
export async function connectBluetoothPrinter(): Promise<PrinterDevice> {
    if (!isBluetoothSupported()) {
        throw new Error("Web Bluetooth tidak didukung di browser ini. Gunakan Google Chrome atau Microsoft Edge.");
    }

    // Disconnect any existing printer session first
    await disconnectPrinter().catch(() => { });

    try {
        const device = await (navigator as any).bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: OPTIONAL_SERVICES,
        });

        return await setupBluetoothDevice(device);
    } catch (err: any) {
        console.error("Bluetooth Printer connection error:", err);
        throw new Error(err.message || "Gagal menghubungkan printer via Bluetooth.");
    }
}

/**
 * Disconnects the printer and releases USB/Bluetooth interfaces.
 */
export async function disconnectPrinter(): Promise<void> {
    if (!connectedDevice) return;

    try {
        if (connectedDeviceType === "usb") {
            if (claimedInterfaceNumber !== null) {
                await connectedDevice.releaseInterface(claimedInterfaceNumber);
            }
            await connectedDevice.close();
        } else if (connectedDeviceType === "bluetooth") {
            if (connectedDevice.gatt && connectedDevice.gatt.connected) {
                await connectedDevice.gatt.disconnect();
            }
        }
    } catch (err) {
        console.warn("Error during printer close/release:", err);
    } finally {
        connectedDevice = null;
        connectedDeviceType = null;
        selectedEndpointOut = null;
        claimedInterfaceNumber = null;
        bluetoothWriteCharacteristic = null;
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
    pushText("Telp/Hp. +62 818-0734-9347\n");
    pushText("------------------------------------------------\n"); // 48 chars

    // 5. Metadata (Left Aligned)
    pushCmd([ESC, 0x61, 0x00]); // Align Left
    pushText(`No. Nota  : ${transaction.invoiceNumber}\n`);
    pushText(`Tanggal   : ${formatDate(transaction.date, true)}\n`);
    pushText(`Pelanggan : ${transaction.customerName}\n`);
    if (transaction.notes && transaction.notes.trim()) {
        pushText(`Catatan   : ${transaction.notes.trim()}\n`);
    }
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
        let qtyPriceStr = "";
        if (transaction.usePenerimaan) {
            const qtyTerima =
                item.receivedQuantity !== undefined && item.receivedQuantity !== null
                    ? item.receivedQuantity
                    : item.quantity;
            qtyPriceStr = `   Trm: ${qtyTerima} ${item.unit} x ${formatRupiah(item.price)} (Krm: ${item.quantity})`;
        } else {
            qtyPriceStr = `   ${item.quantity} ${item.unit} x ${formatRupiah(item.price)}`;
        }
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
 * Sends a raw ESC/POS transaction receipt payload directly to the connected WebUSB or Web Bluetooth printer.
 */
export async function printDirectEscPos(
    transaction: Transaction,
    totalCustomerDebt: number,
    isDuplicate: boolean
): Promise<void> {
    if (!connectedDevice) {
        throw new Error("Printer belum terhubung. Silakan hubungkan printer terlebih dahulu.");
    }

    try {
        const rawData = compileEscPosReceipt(transaction, totalCustomerDebt, isDuplicate);

        if (connectedDeviceType === "usb") {
            if (!selectedEndpointOut) {
                throw new Error("Printer USB tidak siap (endpoint output tidak ditemukan).");
            }
            // Transfer bulk data chunk-by-chunk to prevent endpoint overflow if data size is very large
            const maxChunkSize = 64; // Standard bulk endpoint buffer size
            for (let offset = 0; offset < rawData.length; offset += maxChunkSize) {
                const chunk = rawData.slice(offset, offset + maxChunkSize);
                await connectedDevice.transferOut(selectedEndpointOut.endpointNumber, chunk);
            }
        } else if (connectedDeviceType === "bluetooth") {
            // 1. Automatic reconnection check before printing
            if (!connectedDevice.gatt || !connectedDevice.gatt.connected || !bluetoothWriteCharacteristic) {
                console.warn("Bluetooth GATT server is disconnected or not set up. Reconnecting...");
                await setupBluetoothDevice(connectedDevice);
            }

            if (!bluetoothWriteCharacteristic) {
                throw new Error("Printer Bluetooth tidak siap (write characteristic tidak ditemukan).");
            }

            const maxChunkSize = 20; // 20 bytes is universally safe for BLE MTU chunking
            for (let offset = 0; offset < rawData.length; offset += maxChunkSize) {
                const chunk = rawData.slice(offset, offset + maxChunkSize);

                try {
                    if (bluetoothWriteCharacteristic.writeValueWithoutResponse) {
                        await bluetoothWriteCharacteristic.writeValueWithoutResponse(chunk);
                    } else if (bluetoothWriteCharacteristic.writeValue) {
                        await bluetoothWriteCharacteristic.writeValue(chunk);
                    } else {
                        await bluetoothWriteCharacteristic.writeValueWithResponse(chunk);
                    }
                } catch (writeErr: any) {
                    const errMsg = (writeErr.message || "").toLowerCase();
                    if (errMsg.includes("disconnected") || errMsg.includes("not connected") || errMsg.includes("gatt") || errMsg.includes("execute")) {
                        console.warn("GATT server disconnected during write. Reconnecting and retrying chunk...", writeErr);
                        await setupBluetoothDevice(connectedDevice);

                        // Retry writing the chunk
                        if (bluetoothWriteCharacteristic.writeValueWithoutResponse) {
                            await bluetoothWriteCharacteristic.writeValueWithoutResponse(chunk);
                        } else if (bluetoothWriteCharacteristic.writeValue) {
                            await bluetoothWriteCharacteristic.writeValue(chunk);
                        } else {
                            await bluetoothWriteCharacteristic.writeValueWithResponse(chunk);
                        }
                    } else {
                        throw writeErr;
                    }
                }

                // Give a tiny breather to the Bluetooth controller to avoid buffer overrun
                await new Promise((resolve) => setTimeout(resolve, 15));
            }
        }
    } catch (err: any) {
        console.error("Direct ESC/POS Print failed:", err);
        throw new Error(err.message || "Gagal mengirim data cetak ke printer.");
    }
}

/**
 * Sends a raw Uint8Array payload directly to the connected printer.
 */
export async function printRawData(rawData: Uint8Array): Promise<void> {
    if (!connectedDevice) {
        throw new Error("Printer belum terhubung. Silakan hubungkan printer terlebih dahulu.");
    }

    try {
        if (connectedDeviceType === "usb") {
            if (!selectedEndpointOut) {
                throw new Error("Printer USB tidak siap (endpoint output tidak ditemukan).");
            }
            const maxChunkSize = 64;
            for (let offset = 0; offset < rawData.length; offset += maxChunkSize) {
                const chunk = rawData.slice(offset, offset + maxChunkSize);
                await connectedDevice.transferOut(selectedEndpointOut.endpointNumber, chunk);
            }
        } else if (connectedDeviceType === "bluetooth") {
            if (!connectedDevice.gatt || !connectedDevice.gatt.connected || !bluetoothWriteCharacteristic) {
                await setupBluetoothDevice(connectedDevice);
            }
            if (!bluetoothWriteCharacteristic) {
                throw new Error("Printer Bluetooth tidak siap (write characteristic tidak ditemukan).");
            }
            const maxChunkSize = 20;
            for (let offset = 0; offset < rawData.length; offset += maxChunkSize) {
                const chunk = rawData.slice(offset, offset + maxChunkSize);
                try {
                    if (bluetoothWriteCharacteristic.writeValueWithoutResponse) {
                        const p = bluetoothWriteCharacteristic.writeValueWithoutResponse(chunk);
                        if (p && typeof p.catch === "function") {
                            await p.catch(() => { });
                        } else {
                            await p;
                        }
                    } else if (bluetoothWriteCharacteristic.writeValue) {
                        const p = bluetoothWriteCharacteristic.writeValue(chunk);
                        if (p && typeof p.catch === "function") {
                            await p.catch(() => { });
                        } else {
                            await p;
                        }
                    } else {
                        const p = bluetoothWriteCharacteristic.writeValueWithResponse(chunk);
                        if (p && typeof p.catch === "function") {
                            await p.catch(() => { });
                        } else {
                            await p;
                        }
                    }
                } catch (writeErr: any) {
                    const errMsg = (writeErr.message || "").toLowerCase();
                    if (errMsg.includes("disconnected") || errMsg.includes("not connected") || errMsg.includes("gatt") || errMsg.includes("execute")) {
                        await setupBluetoothDevice(connectedDevice);
                        if (bluetoothWriteCharacteristic.writeValueWithoutResponse) {
                            await bluetoothWriteCharacteristic.writeValueWithoutResponse(chunk);
                        } else if (bluetoothWriteCharacteristic.writeValue) {
                            await bluetoothWriteCharacteristic.writeValue(chunk);
                        } else {
                            await bluetoothWriteCharacteristic.writeValueWithResponse(chunk);
                        }
                    } else {
                        throw writeErr;
                    }
                }
                await new Promise((resolve) => setTimeout(resolve, 15));
            }
        }
    } catch (err: any) {
        console.error("printRawData failed:", err);
        throw new Error(err.message || "Gagal mengirim data ke printer.");
    }
}

/**
 * Sends a highly professional test print page to verify printer connection and formatting.
 */
export async function printTestPage(): Promise<void> {
    const chunks: Uint8Array[] = [];
    const pushCmd = (bytes: number[]) => {
        chunks.push(new Uint8Array(bytes));
    };
    const pushText = (text: string) => {
        chunks.push(encodeText(text));
    };

    // 1. Initialize Printer (ESC @)
    pushCmd([ESC, 0x40]);
    // 2. Default line spacing (ESC 2)
    pushCmd([ESC, 0x32]);

    // 3. Center align and Bold Header
    pushCmd([ESC, 0x61, 0x01]); // Align Center
    pushCmd([GS, 0x21, 0x11]);  // Double width, double height
    pushCmd([ESC, 0x45, 0x01]); // Bold ON
    pushText("CV DPJ BERKAH\n");
    pushCmd([GS, 0x21, 0x00]);  // Normal size
    pushText("UNGGAS RETAIL\n");
    pushCmd([ESC, 0x45, 0x00]); // Bold OFF
    pushText("Uji Coba Printer Berhasil!\n");
    pushText("------------------------------------------------\n");

    // 4. Left align for detailed info
    pushCmd([ESC, 0x61, 0x00]); // Align Left
    pushText(`Waktu Cetak : ${new Date().toLocaleString("id-ID")}\n`);
    pushText(`Koneksi     : ${connectedDeviceType === "bluetooth" ? "Bluetooth (BLE)" : "USB"}\n`);
    if (connectedDevice) {
        pushText(`Nama Alat   : ${connectedDevice.productName || connectedDevice.name || "Thermal Printer"}\n`);
    }
    pushText("Status      : PRINTER AKTIF & SIAP\n");
    pushText("------------------------------------------------\n");

    // 5. Center align thank you message
    pushCmd([ESC, 0x61, 0x01]); // Align Center
    pushCmd([ESC, 0x45, 0x01]); // Bold ON
    pushText("PENGATURAN SUKSES\n");
    pushCmd([ESC, 0x45, 0x00]); // Bold OFF
    pushText("Siap digunakan pada Aplikasi DPJ!\n\n");

    // Feed paper
    pushText("\n\n\n\n");

    // Combine chunks
    let totalLength = 0;
    for (const chunk of chunks) {
        totalLength += chunk.length;
    }
    const rawData = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        rawData.set(chunk, offset);
        offset += chunk.length;
    }

    // Send raw data
    await printRawData(rawData);
}
