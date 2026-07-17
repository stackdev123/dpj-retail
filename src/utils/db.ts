import {
  Item,
  Customer,
  Transaction,
  DebtPayment,
  PriceMemory,
  CustomerDebtSummary,
  ActivityLog,
  AppUser,
  PaymentMethod,
  StockIn,
  StockOpname,
} from "../types";
import { supabase } from "./supabase";

// Cache store for optimizing Postgres network egress and response times
const queryCache: { [key: string]: { data: any; timestamp: number } } = {};
const CACHE_TTL_MS = 10000; // 10 seconds of TTL to keep data fresh across clients but eliminate redundant/parallel queries

function getCached<T>(key: string): T | null {
  const cached = queryCache[key];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data as T;
  }
  return null;
}

function setCached(key: string, data: any): void {
  queryCache[key] = {
    data,
    timestamp: Date.now(),
  };
}

function invalidateCache(keys?: string[]): void {
  if (!keys) {
    // Clear all
    for (const k in queryCache) {
      delete queryCache[k];
    }
  } else {
    keys.forEach((key) => {
      delete queryCache[key];
    });
  }
}

export const db = {
  // --- ITEMS API ---
  async getItems(): Promise<Item[]> {
    const cached = getCached<Item[]>("items");
    if (cached) return cached;

    const { data, error } = await supabase
      .from("items")
      .select("*")
      .order("name");
    if (error) {
      console.warn("Error fetching items:", error);
      return [];
    }
    const mapped = data.map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      createdAt: item.created_at,
    }));
    setCached("items", mapped);
    return mapped;
  },

  async saveItem(item: Item): Promise<void> {
    const isNew = item.id.startsWith("item-") || !item.id;
    const payload = {
      name: item.name,
      unit: item.unit,
    };

    if (isNew) {
      await supabase.from("items").insert(payload);
      await this.addActivityLog("CREATE", "Produk", `Menambahkan produk baru: ${item.name} (${item.unit})`);
    } else {
      await supabase.from("items").update(payload).eq("id", item.id);
      await this.addActivityLog("EDIT", "Produk", `Mengubah detail produk: ${item.name} (${item.unit})`);
    }
    invalidateCache(["items", "priceMemories", "customerDebtSummaries"]);
  },

  async deleteItem(id: string): Promise<void> {
    const { data: item } = await supabase
      .from("items")
      .select("name")
      .eq("id", id)
      .single();
    const itemName = item ? item.name : "Unknown Item";

    await supabase.from("items").delete().eq("id", id);
    await this.addActivityLog("DELETE", "Produk", `Menghapus produk: ${itemName}`);
    invalidateCache(["items", "priceMemories", "customerDebtSummaries"]);
  },

  // --- CUSTOMERS API ---
  async getCustomers(): Promise<Customer[]> {
    const cached = getCached<Customer[]>("customers");
    if (cached) return cached;

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("name");
    if (error) {
      console.warn("Error fetching customers:", error);
      return [];
    }
    const mapped = data.map((cust) => ({
      id: cust.id,
      name: cust.name,
      phone: cust.phone || "-",
      address: cust.address || "",
      createdAt: cust.created_at,
    }));
    setCached("customers", mapped);
    return mapped;
  },

  async saveCustomer(customer: Customer): Promise<Customer> {
    const isNew = customer.id.startsWith("cust-") || !customer.id;
    const payload = {
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
    };

    let result;
    if (isNew) {
      const { data } = await supabase
        .from("customers")
        .insert(payload)
        .select()
        .single();
      result = data;
      await this.addActivityLog("CREATE", "Pelanggan", `Mendaftarkan pelanggan baru: ${customer.name}`);
    } else {
      const { data } = await supabase
        .from("customers")
        .update(payload)
        .eq("id", customer.id)
        .select()
        .single();
      result = data;
      await this.addActivityLog("EDIT", "Pelanggan", `Mengubah profil pelanggan: ${customer.name}`);
    }

    invalidateCache(["customers", "customerDebtSummaries"]);

    return {
      id: result.id,
      name: result.name,
      phone: result.phone || "-",
      address: result.address || "",
      createdAt: result.created_at,
    };
  },

  async deleteCustomer(id: string): Promise<void> {
    const { data: cust } = await supabase
      .from("customers")
      .select("name")
      .eq("id", id)
      .single();
    const custName = cust ? cust.name : "Unknown Customer";

    await supabase.from("customers").delete().eq("id", id);
    await this.addActivityLog("DELETE", "Pelanggan", `Menghapus pelanggan: ${custName}`);
    invalidateCache(["customers", "customerDebtSummaries"]);
  },

  // --- TRANSACTIONS API ---
  async getTransactions(): Promise<Transaction[]> {
    const cached = getCached<Transaction[]>("transactions");
    if (cached) return cached;

    const { data, error } = await supabase
      .from("transactions")
      .select(
        `
        *,
        transaction_items (*)
      `,
      )
      .order("date", { ascending: false });

    if (error) {
      console.warn("Error fetching transactions:", error);
      return [];
    }

    const mapped = data.map((tx) => {
      let paymentMethod = tx.payment_method as PaymentMethod;
      let cashAmount = undefined;
      let transferAmount = undefined;
      let notes = tx.notes || "";
      let isDeleted = false;

      if (notes && notes.includes("[DELETED]")) {
        isDeleted = true;
        notes = notes.replace(/\[DELETED\]\s*/, "").trim();
      }

      if (notes && notes.includes("[MIX_PAYMENT:")) {
        const match = notes.match(/\[MIX_PAYMENT:cash=(\d+);transfer=(\d+)\]/);
        if (match) {
          paymentMethod = 'mix';
          cashAmount = Number(match[1]);
          transferAmount = Number(match[2]);
          notes = notes.replace(/\[MIX_PAYMENT:[^\]]+\]\s*/, "").trim();
        }
      }

      return {
        id: tx.id,
        invoiceNumber: tx.invoice_number,
        customerId: tx.customer_id,
        customerName: tx.customer_name,
        totalAmount: Number(tx.total_amount),
        paymentMethod,
        amountPaid: Number(tx.amount_paid),
        remainingDebt: Number(tx.remaining_debt),
        date: tx.date,
        printCount: tx.print_count,
        notes: notes || undefined,
        cashAmount,
        transferAmount,
        usePenerimaan: tx.use_penerimaan || false,
        isDeleted,
        items: tx.transaction_items.map((item: any) => ({
          itemId: item.item_id,
          name: item.name,
          price: Number(item.price),
          quantity: Number(item.quantity),
          subtotal: Number(item.subtotal),
          unit: item.unit,
          receivedQuantity: item.received_quantity !== null && item.received_quantity !== undefined ? Number(item.received_quantity) : undefined,
        })),
      };
    });
    setCached("transactions", mapped);
    return mapped;
  },

  async saveTransaction(transaction: Transaction): Promise<void> {
    let dbPaymentMethod = transaction.paymentMethod;
    let notes = transaction.notes || "";

    if (transaction.paymentMethod === "mix") {
      dbPaymentMethod = "cash";
      notes = `[MIX_PAYMENT:cash=${transaction.cashAmount || 0};transfer=${transaction.transferAmount || 0}]${notes ? " " + notes : ""}`;
    }

    const isValidUUID = (uuid: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);

    let customerId: string | null = transaction.customerId;
    if (!customerId || !isValidUUID(customerId)) {
      const { data: generalCust } = await supabase
        .from("customers")
        .select("id")
        .ilike("name", "Pelanggan Umum")
        .limit(1);

      if (generalCust && generalCust.length > 0) {
        customerId = generalCust[0].id;
      } else {
        customerId = null;
      }
    }

    const txPayload = {
      invoice_number: transaction.invoiceNumber,
      customer_id: customerId,
      customer_name: transaction.customerName,
      total_amount: transaction.totalAmount,
      payment_method: dbPaymentMethod,
      amount_paid: transaction.amountPaid,
      remaining_debt: transaction.remainingDebt,
      date: transaction.date,
      print_count: transaction.printCount || 0,
      notes: notes || null,
      use_penerimaan: transaction.usePenerimaan || false,
    };

    // Insert transaction
    const { data: txData, error: txError } = await supabase
      .from("transactions")
      .insert(txPayload)
      .select()
      .single();

    if (txError || !txData) {
      console.warn("Error saving transaction:", txError);
      throw new Error(txError?.message || "Gagal menyimpan transaksi ke database.");
    }

    // Insert transaction items
    const itemsPayload = transaction.items.map((item) => ({
      transaction_id: txData.id,
      item_id: (item.itemId && isValidUUID(item.itemId)) ? item.itemId : null,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.subtotal,
      unit: item.unit,
      received_quantity: item.receivedQuantity !== undefined ? item.receivedQuantity : null,
    }));

    const { error: itemsError } = await supabase.from("transaction_items").insert(itemsPayload);
    if (itemsError) {
      console.warn("Error saving transaction items:", itemsError);
      throw new Error(itemsError.message || "Gagal menyimpan detail item transaksi ke database.");
    }

    // Update price memories
    for (const item of transaction.items) {
      if (item.itemId && isValidUUID(item.itemId)) {
        const pmPayload = {
          item_id: item.itemId,
          last_price: item.price,
        };
        // Upsert price memory
        await supabase
          .from("price_memory")
          .upsert(pmPayload, { onConflict: "item_id" });
      }
    }

    // Log transaction creation
    await this.addActivityLog(
      "CREATE",
      "Penjualan",
      `Membuat Transaksi Baru: ${transaction.invoiceNumber} (${transaction.customerName}) - Total: Rp ${transaction.totalAmount.toLocaleString("id-ID")}`
    );

    invalidateCache(["transactions", "priceMemories", "customerDebtSummaries", "activityLogs"]);
  },

  async updateTransactionPrintCount(id: string): Promise<void> {
    // get current count
    const { data } = await supabase
      .from("transactions")
      .select("print_count")
      .eq("id", id)
      .single();
    if (data) {
      await supabase
        .from("transactions")
        .update({ print_count: data.print_count + 1 })
        .eq("id", id);
      invalidateCache(["transactions"]);
    }
  },

  // --- DEBT PAYMENTS API ---
  async getDebtPayments(): Promise<DebtPayment[]> {
    const cached = getCached<DebtPayment[]>("debtPayments");
    if (cached) return cached;

    const { data, error } = await supabase
      .from("debt_payments")
      .select("*")
      .order("date", { ascending: false });
    if (error) {
      console.warn("Error fetching debt payments:", error);
      return [];
    }

    const mapped = data.map((dp) => ({
      id: dp.id,
      customerId: dp.customer_id,
      transactionId: dp.transaction_id,
      invoiceNumber: dp.invoice_number,
      date: dp.date,
      amountPaid: Number(dp.amount_paid),
      paymentMethod: dp.payment_method,
      notes: dp.notes,
    }));
    setCached("debtPayments", mapped);
    return mapped;
  },

  async saveCustomerPayment(
    customerId: string,
    totalAmountPaid: number,
    paymentMethod: "cash" | "transfer",
    notes: string,
  ): Promise<void> {
    const { data: transactions } = await supabase
      .from("transactions")
      .select("*")
      .eq("customer_id", customerId)
      .eq("payment_method", "debt")
      .gt("remaining_debt", 0)
      .order("date", { ascending: true });

    const unpaidTxs = transactions || [];
    let remainingPaymentToDistribute = totalAmountPaid;

    if (unpaidTxs.length === 0) {
      // General payment
      await supabase.from("debt_payments").insert({
        customer_id: customerId,
        transaction_id: null,
        invoice_number: "Setoran Umum",
        amount_paid: totalAmountPaid,
        payment_method: paymentMethod,
        notes: notes || "Pembayaran Setoran Umum (Tanpa Nota Terbuka)",
      });
    } else {
      for (const tx of unpaidTxs) {
        if (remainingPaymentToDistribute <= 0) break;

        const txRemaining = Number(tx.remaining_debt);
        const amountToApply = Math.min(
          txRemaining,
          remainingPaymentToDistribute,
        );

        await supabase.from("debt_payments").insert({
          customer_id: customerId,
          transaction_id: tx.id,
          invoice_number: tx.invoice_number,
          amount_paid: amountToApply,
          payment_method: paymentMethod,
          notes:
            notes ||
            `Setoran Pelanggan (Otomatis terbagi ke ${tx.invoice_number})`,
        });

        // Update transaction remaining_debt
        await supabase
          .from("transactions")
          .update({ remaining_debt: Math.max(0, txRemaining - amountToApply) })
          .eq("id", tx.id);

        remainingPaymentToDistribute -= amountToApply;
      }

      // If there's leftover payment
      if (remainingPaymentToDistribute > 0) {
        const lastTx = unpaidTxs[unpaidTxs.length - 1];
        await supabase.from("debt_payments").insert({
          customer_id: customerId,
          transaction_id: lastTx.id,
          invoice_number: lastTx.invoice_number,
          amount_paid: remainingPaymentToDistribute,
          payment_method: paymentMethod,
          notes: notes
            ? `${notes} (Kelebihan Pembayaran)`
            : "Kelebihan Pembayaran Setoran",
        });

        await supabase
          .from("transactions")
          .update({ remaining_debt: 0 })
          .eq("id", lastTx.id);
      }
    }

    // Get customer name for logging
    const { data: customer } = await supabase
      .from("customers")
      .select("name")
      .eq("id", customerId)
      .single();
    const customerName = customer ? customer.name : "Pelanggan";

    await this.addActivityLog(
      "CREATE",
      "Pelanggan",
      `Menerima Pembayaran Piutang: ${customerName} sebesar Rp ${totalAmountPaid.toLocaleString("id-ID")} via ${paymentMethod === "cash" ? "Cash" : "Transfer"}`
    );

    invalidateCache(["transactions", "debtPayments", "customerDebtSummaries", "activityLogs"]);
  },

  async deleteDebtPayment(paymentId: string): Promise<void> {
    const { data: payment, error: getError } = await supabase
      .from("debt_payments")
      .select("*")
      .eq("id", paymentId)
      .single();

    if (getError || !payment) {
      console.warn("Payment not found for delete:", getError);
      throw new Error("Payment not found");
    }

    const txId = payment.transaction_id;
    const customerId = payment.customer_id;
    const amountPaid = Number(payment.amount_paid);

    const { error: delError } = await supabase
      .from("debt_payments")
      .delete()
      .eq("id", paymentId);

    if (delError) {
      console.warn("Error deleting payment:", delError);
      throw delError;
    }

    if (txId) {
      const { data: transaction } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", txId)
        .single();

      if (transaction) {
        const { data: otherPayments } = await supabase
          .from("debt_payments")
          .select("amount_paid")
          .eq("transaction_id", txId);

        const totalPayments = otherPayments ? otherPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0) : 0;
        const remainingDebt = Math.max(0, Number(transaction.total_amount) - Number(transaction.amount_paid) - totalPayments);

        await supabase
          .from("transactions")
          .update({ remaining_debt: remainingDebt })
          .eq("id", txId);
      }
    }

    const { data: customer } = await supabase
      .from("customers")
      .select("name")
      .eq("id", customerId)
      .single();
    const customerName = customer ? customer.name : "Pelanggan";

    await this.addActivityLog(
      "DELETE",
      "Pelanggan",
      `Menghapus Pembayaran Piutang: ${customerName} sebesar Rp ${amountPaid.toLocaleString("id-ID")}`
    );

    invalidateCache(["transactions", "debtPayments", "customerDebtSummaries", "activityLogs"]);
  },

  async editDebtPayment(
    paymentId: string,
    updatedAmount: number,
    paymentMethod: "cash" | "transfer",
    notes: string,
  ): Promise<void> {
    const { data: payment, error: getError } = await supabase
      .from("debt_payments")
      .select("*")
      .eq("id", paymentId)
      .single();

    if (getError || !payment) {
      console.warn("Payment not found for edit:", getError);
      throw new Error("Payment not found");
    }

    const txId = payment.transaction_id;
    const customerId = payment.customer_id;
    const oldAmount = Number(payment.amount_paid);

    const { error: updError } = await supabase
      .from("debt_payments")
      .update({
        amount_paid: updatedAmount,
        payment_method: paymentMethod,
        notes: notes,
      })
      .eq("id", paymentId);

    if (updError) {
      console.warn("Error updating payment:", updError);
      throw updError;
    }

    if (txId) {
      const { data: transaction } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", txId)
        .single();

      if (transaction) {
        const { data: otherPayments } = await supabase
          .from("debt_payments")
          .select("amount_paid")
          .eq("transaction_id", txId);

        const totalPayments = otherPayments ? otherPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0) : 0;
        const remainingDebt = Math.max(0, Number(transaction.total_amount) - Number(transaction.amount_paid) - totalPayments);

        await supabase
          .from("transactions")
          .update({ remaining_debt: remainingDebt })
          .eq("id", txId);
      }
    }

    const { data: customer } = await supabase
      .from("customers")
      .select("name")
      .eq("id", customerId)
      .single();
    const customerName = customer ? customer.name : "Pelanggan";

    await this.addActivityLog(
      "EDIT",
      "Pelanggan",
      `Mengubah Pembayaran Piutang: ${customerName} dari Rp ${oldAmount.toLocaleString("id-ID")} menjadi Rp ${updatedAmount.toLocaleString("id-ID")}`
    );

    invalidateCache(["transactions", "debtPayments", "customerDebtSummaries", "activityLogs"]);
  },

  // --- PRICE MEMORY API ---
  async getPriceMemories(): Promise<PriceMemory> {
    const cached = getCached<PriceMemory>("priceMemories");
    if (cached) return cached;

    const { data, error } = await supabase.from("price_memory").select("*");
    if (error) return {};

    const memories: PriceMemory = {};
    data.forEach((pm) => {
      memories[pm.item_id] = Number(pm.last_price);
    });
    setCached("priceMemories", memories);
    return memories;
  },

  // --- CUSTOMER DEBT CALCULATIONS ---
  async getCustomerDebtSummaries(): Promise<CustomerDebtSummary[]> {
    const cached = getCached<CustomerDebtSummary[]>("customerDebtSummaries");
    if (cached) return cached;

    const [customers, txs, payments] = await Promise.all([
      this.getCustomers(),
      this.getTransactions(),
      this.getDebtPayments(),
    ]);

    const summaries: CustomerDebtSummary[] = [];

    for (const customer of customers) {
      if (customer.name.toLowerCase() === "pelanggan umum" || customer.id === "cust-1") continue;

      const customerTxs = txs.filter((t) => t.customerId === customer.id && !t.isDeleted);
      const customerPayments = payments.filter((p) => p.customerId === customer.id);

      const temp: any[] = [];

      // Add sales transactions
      customerTxs.forEach((tx) => {
        temp.push({
          id: tx.id,
          date: tx.date,
          type: "sale",
          paymentMethod: tx.paymentMethod,
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
          paymentMethod: pay.paymentMethod,
          debit: 0,
          credit: pay.amountPaid,
        });
      });

      // Sort chronologically
      temp.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      let totalPembelian = 0;
      let totalTransfer = 0;
      let totalCash = 0;
      let lastActive = "";

      temp.forEach((entry) => {
        if (!lastActive || new Date(entry.date) > new Date(lastActive)) {
          lastActive = entry.date;
        }

        totalPembelian += entry.debit || 0;

        if (entry.type === "payment") {
          if (entry.paymentMethod === "transfer") {
            totalTransfer += entry.credit || 0;
          } else {
            totalCash += entry.credit || 0;
          }
        } else {
          // Sale
          if (entry.paymentMethod === "transfer") {
            totalTransfer += entry.credit || 0;
          } else if (entry.paymentMethod === "cash" || entry.paymentMethod === "debt") {
            totalCash += entry.credit || 0;
          } else if (entry.paymentMethod === "mix") {
            totalTransfer += entry.transferAmount || 0;
            totalCash += entry.cashAmount || 0;
          }
        }
      });

      const remainingDebt = totalPembelian - totalTransfer - totalCash;

      if (totalPembelian > 0 || (totalTransfer + totalCash) > 0) {
        summaries.push({
          customerId: customer.id,
          customerName: customer.name,
          totalDebt: totalPembelian,
          totalPaid: totalTransfer + totalCash,
          remainingDebt,
          lastActive,
          totalPembelian,
          totalTransfer,
          totalCash,
        });
      }
    }

    // Sort by last active descending
    const sorted = summaries.sort((a, b) => {
      if (!a.lastActive) return 1;
      if (!b.lastActive) return -1;
      return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
    });
    setCached("customerDebtSummaries", sorted);
    return sorted;
  },

  // RESET FUNCTION
  async resetDatabase(): Promise<void> {
    try {
      // 1. Clear existing data (use delete on all tables)
      await supabase.from("price_memory").delete().neq("item_id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("debt_payments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("transaction_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("transactions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("customers").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      try {
        await supabase.from("users").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      } catch (e) {
        console.warn("Could not delete users in reset, table might not exist yet");
      }

      // 2. Insert items
      const { data: insertedItems, error: itemsError } = await supabase
        .from("items")
        .insert([
          { name: "Ayam Broiler Utuh", unit: "kg" },
          { name: "Fillet Dada", unit: "kg" },
          { name: "Ayam Kampung", unit: "ekor" },
          { name: "Ati Ampela", unit: "pasang" },
          { name: "Sayap Ayam", unit: "kg" },
        ])
        .select();

      if (itemsError || !insertedItems) throw itemsError || new Error("Failed to seed items");

      // 3. Insert customers
      const { data: insertedCustomers, error: custError } = await supabase
        .from("customers")
        .insert([
          { name: "Pelanggan Umum", phone: "-", address: "-" },
          { name: "Warung Bakso Pak No", phone: "08123456789", address: "Jl. Pemuda No. 12" },
          { name: "Bu Sri Catering", phone: "08567891234", address: "Perumahan Berkah No. 5" },
          { name: "Soto Ayam Cak Mo", phone: "08771234567", address: "Pasar Baru Kios B-1" },
        ])
        .select();

      if (custError || !insertedCustomers) throw custError || new Error("Failed to seed customers");

      const broiler = insertedItems.find(i => i.name === "Ayam Broiler Utuh");
      const fillet = insertedItems.find(i => i.name === "Fillet Dada");
      const atiAmpela = insertedItems.find(i => i.name === "Ati Ampela");

      const umum = insertedCustomers.find(c => c.name === "Pelanggan Umum");
      const pakNo = insertedCustomers.find(c => c.name === "Warung Bakso Pak No");
      const buSri = insertedCustomers.find(c => c.name === "Bu Sri Catering");

      // 4. Helper function to generate past dates relative to now
      const getPastDate = (daysAgo: number, hoursOffset: number) => {
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        d.setHours(d.getHours() - hoursOffset);
        return d.toISOString();
      };

      // 5. Insert Sample Transactions
      // Transaction A: Pelanggan Umum (Cash)
      if (umum && broiler) {
        const { data: txA } = await supabase
          .from("transactions")
          .insert({
            invoice_number: "INV-260626-001",
            customer_id: umum.id,
            customer_name: umum.name,
            total_amount: 350000,
            payment_method: "cash",
            amount_paid: 350000,
            remaining_debt: 0,
            date: getPastDate(2, 4),
            print_count: 1,
            notes: "Lunas",
          })
          .select()
          .single();

        if (txA) {
          await supabase.from("transaction_items").insert({
            transaction_id: txA.id,
            item_id: broiler.id,
            name: "Ayam Broiler Utuh",
            price: 35000,
            quantity: 10,
            subtotal: 350000,
            unit: "kg",
          });
        }
      }

      // Transaction B: Warung Bakso Pak No (Debt with DP)
      let txBId = "";
      if (pakNo && fillet) {
        const { data: txB } = await supabase
          .from("transactions")
          .insert({
            invoice_number: "INV-260626-002",
            customer_id: pakNo.id,
            customer_name: pakNo.name,
            total_amount: 1375000,
            payment_method: "debt",
            amount_paid: 500000,
            remaining_debt: 875000,
            date: getPastDate(5, 2),
            print_count: 1,
            notes: "Utang Toko (DP 500rb)",
          })
          .select()
          .single();

        if (txB) {
          txBId = txB.id;
          await supabase.from("transaction_items").insert({
            transaction_id: txB.id,
            item_id: fillet.id,
            name: "Fillet Dada",
            price: 55000,
            quantity: 25,
            subtotal: 1375000,
            unit: "kg",
          });

          // Price Memory
          await supabase.from("price_memory").upsert({
            item_id: fillet.id,
            last_price: 55000,
          });
        }
      }

      // Transaction C: Bu Sri Catering (Debt, No DP)
      if (buSri && broiler && atiAmpela) {
        const { data: txC } = await supabase
          .from("transactions")
          .insert({
            invoice_number: "INV-260626-003",
            customer_id: buSri.id,
            customer_name: buSri.name,
            total_amount: 615000,
            payment_method: "debt",
            amount_paid: 0,
            remaining_debt: 615000,
            date: getPastDate(3, 1),
            print_count: 1,
            notes: "Tempo 1 minggu",
          })
          .select()
          .single();

        if (txC) {
          await supabase.from("transaction_items").insert([
            {
              transaction_id: txC.id,
              item_id: broiler.id,
              name: "Ayam Broiler Utuh",
              price: 34000,
              quantity: 15,
              subtotal: 510000,
              unit: "kg",
            },
            {
              transaction_id: txC.id,
              item_id: atiAmpela.id,
              name: "Ati Ampela",
              price: 3500,
              quantity: 30,
              subtotal: 105000,
              unit: "pasang",
            },
          ]);

          // Price Memories
          await supabase.from("price_memory").upsert([
            { item_id: broiler.id, last_price: 34000 },
            { item_id: atiAmpela.id, last_price: 3500 },
          ]);
        }
      }

      // 6. Insert Debt Payment (Cicilan dari Warung Bakso Pak No)
      if (pakNo && txBId) {
        // Warung Bakso Pak No pays 300,000 for txB
        await supabase.from("debt_payments").insert({
          customer_id: pakNo.id,
          transaction_id: txBId,
          invoice_number: "INV-260626-002",
          amount_paid: 300000,
          payment_method: "transfer",
          date: getPastDate(2, 1),
          notes: "Cicilan ke-1 (Transfer)",
        });

        // Update remaining debt of txB from 875000 to 575000
        await supabase
          .from("transactions")
          .update({ remaining_debt: 575000 })
          .eq("id", txBId);
      }

      // 7. Seed users
      try {
        await supabase.from("users").insert([
          { username: "superadmin", password: "superadmin123", role: "superadmin", fullname: "Super Administrator" },
          { username: "admin", password: "admin123", role: "admin", fullname: "Administrator" },
          { username: "kasir", password: "kasir123", role: "kasir", fullname: "Kasir Toko" },
        ]);
      } catch (e) {
        console.warn("Could not insert default users in reset, table might not exist");
      }

      const defaultUsers: AppUser[] = [
        {
          id: "user-superadmin",
          username: "superadmin",
          password: "superadmin123",
          role: "superadmin",
          fullname: "Super Administrator",
          createdAt: new Date().toISOString(),
        },
        {
          id: "user-admin",
          username: "admin",
          password: "admin123",
          role: "admin",
          fullname: "Administrator",
          createdAt: new Date().toISOString(),
        },
        {
          id: "user-kasir",
          username: "kasir",
          password: "kasir123",
          role: "kasir",
          fullname: "Kasir Toko",
          createdAt: new Date().toISOString(),
        },
      ];
      localStorage.setItem("dpj_users", JSON.stringify(defaultUsers));

      await this.addActivityLog(
        "RESET",
        "Sistem",
        "Melakukan reset dan seeding ulang seluruh database ke data awal pabrik"
      );
      invalidateCache();
    } catch (err) {
      console.error("Error seeding/resetting database:", err);
      throw err;
    }
  },

  // --- ACTIVITY LOGS API ---
  async getActivityLogs(): Promise<ActivityLog[]> {
    const cached = getCached<ActivityLog[]>("activityLogs");
    if (cached) return cached;

    try {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .neq("action", "HEARTBEAT")
        .order("created_at", { ascending: false });
      if (!error && data) {
        const mapped = data.map((log) => ({
          id: log.id,
          action: log.action as ActivityLog["action"],
          module: log.module,
          description: log.description,
          timestamp: log.created_at,
        }));
        setCached("activityLogs", mapped);
        return mapped;
      }
    } catch (e) {
      console.warn("Supabase activity_logs table failed, falling back to local storage:", e);
    }

    const localLogsStr = localStorage.getItem("dpj_activity_logs");
    if (localLogsStr) {
      try {
        const parsed = JSON.parse(localLogsStr) as ActivityLog[];
        const filtered = parsed.filter(log => log.action !== 'HEARTBEAT');
        setCached("activityLogs", filtered);
        return filtered;
      } catch (e) {
        return [];
      }
    }
    return [];
  },

  async addActivityLog(
    action: ActivityLog["action"],
    module: string,
    description: string
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const id = `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Automatically append currently logged-in user to description for CREATE, EDIT, DELETE, RESET
    let finalDescription = description;
    if (action === "CREATE" || action === "EDIT" || action === "DELETE" || action === "RESET") {
      try {
        const savedUser = localStorage.getItem("dpj_current_user");
        if (savedUser) {
          const user = JSON.parse(savedUser) as AppUser;
          if (user) {
            const operatorName = user.fullname || user.username;
            if (operatorName && !description.includes("(oleh:")) {
              finalDescription = `${description} (oleh: ${operatorName})`;
            }
          }
        }
      } catch (e) {
        console.warn("Failed to retrieve current user for activity log:", e);
      }
    }

    const newLog: ActivityLog = {
      id,
      action,
      module,
      description: finalDescription,
      timestamp,
    };

    try {
      const { error } = await supabase.from("activity_logs").insert({
        id,
        action,
        module,
        description: finalDescription,
        created_at: timestamp,
      });
      if (!error) {
        invalidateCache(["activityLogs"]);
        return;
      }
    } catch (e) {
      // Ignored, will fallback to local storage
    }

    try {
      const logs = await this.getActivityLogs();
      const updatedLogs = [newLog, ...logs].slice(0, 1000);
      localStorage.setItem("dpj_activity_logs", JSON.stringify(updatedLogs));
      invalidateCache(["activityLogs"]);
    } catch (e) {
      console.error("Failed to save activity log to local storage:", e);
    }
  },

  async clearActivityLogs(): Promise<void> {
    try {
      await supabase.from("activity_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    } catch (e) { }
    localStorage.removeItem("dpj_activity_logs");
    invalidateCache(["activityLogs"]);
  },

  // --- EDIT & DELETE TRANSACTIONS API ---
  async editTransaction(transaction: Transaction): Promise<void> {
    // 1. Get existing debt payments to recalculate remaining debt
    let totalPayments = 0;
    try {
      const { data: payments } = await supabase
        .from("debt_payments")
        .select("amount_paid")
        .eq("transaction_id", transaction.id);

      if (payments) {
        totalPayments = payments.reduce((sum, p) => sum + Number(p.amount_paid), 0);
      }
    } catch (e) {
      console.warn("Error fetching existing debt payments for edit:", e);
    }

    // 2. Delete payments if method is no longer 'debt'
    if (transaction.paymentMethod !== "debt") {
      try {
        await supabase
          .from("debt_payments")
          .delete()
          .eq("transaction_id", transaction.id);
        totalPayments = 0;
      } catch (e) {
        console.warn("Error deleting debt payments on payment method change:", e);
      }
    }

    // 3. Recalculate remaining_debt
    const remainingDebt =
      transaction.paymentMethod === "debt"
        ? Math.max(0, transaction.totalAmount - transaction.amountPaid - totalPayments)
        : 0;

    let dbPaymentMethod = transaction.paymentMethod;
    let notes = transaction.notes || "";

    if (transaction.paymentMethod === "mix") {
      dbPaymentMethod = "cash";
      notes = `[MIX_PAYMENT:cash=${transaction.cashAmount || 0};transfer=${transaction.transferAmount || 0}]${notes ? " " + notes : ""}`;
    }

    const isValidUUID = (uuid: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);

    let customerId: string | null = transaction.customerId;
    if (!customerId || !isValidUUID(customerId)) {
      const { data: generalCust } = await supabase
        .from("customers")
        .select("id")
        .ilike("name", "Pelanggan Umum")
        .limit(1);

      if (generalCust && generalCust.length > 0) {
        customerId = generalCust[0].id;
      } else {
        customerId = null;
      }
    }

    const txPayload = {
      customer_id: customerId,
      customer_name: transaction.customerName,
      total_amount: transaction.totalAmount,
      payment_method: dbPaymentMethod,
      amount_paid: transaction.amountPaid,
      remaining_debt: remainingDebt,
      notes: notes || null,
      use_penerimaan: transaction.usePenerimaan || false,
    };

    // 4. Update transaction
    const { error: txError } = await supabase
      .from("transactions")
      .update(txPayload)
      .eq("id", transaction.id);

    if (txError) {
      console.warn("Error updating transaction:", txError);
      throw txError;
    }

    // 5. Delete and re-insert transaction items
    const { error: delError } = await supabase
      .from("transaction_items")
      .delete()
      .eq("transaction_id", transaction.id);

    if (delError) {
      console.warn("Error deleting old items on transaction edit:", delError);
    }

    const itemsPayload = transaction.items.map((item) => ({
      transaction_id: transaction.id,
      item_id: (item.itemId && isValidUUID(item.itemId)) ? item.itemId : null,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.subtotal,
      unit: item.unit,
      received_quantity: item.receivedQuantity !== undefined ? item.receivedQuantity : null,
    }));

    const { error: insError } = await supabase
      .from("transaction_items")
      .insert(itemsPayload);

    if (insError) {
      console.warn("Error inserting new items on transaction edit:", insError);
      throw insError;
    }

    // 6. Update price memories
    for (const item of transaction.items) {
      if (item.itemId && isValidUUID(item.itemId)) {
        const pmPayload = {
          item_id: item.itemId,
          last_price: item.price,
        };
        await supabase
          .from("price_memory")
          .upsert(pmPayload, { onConflict: "item_id" });
      }
    }

    // 7. Log activity
    await this.addActivityLog(
      "EDIT",
      "Penjualan",
      `Mengubah Transaksi ${transaction.invoiceNumber} (${transaction.customerName}) - Total Baru: Rp ${transaction.totalAmount.toLocaleString("id-ID")}`
    );

    invalidateCache(["transactions", "debtPayments", "priceMemories", "customerDebtSummaries", "activityLogs"]);
  },

  async deleteTransaction(id: string): Promise<void> {
    const { data: tx } = await supabase
      .from("transactions")
      .select("invoice_number, customer_name, total_amount, notes")
      .eq("id", id)
      .single();

    const invoiceNum = tx ? tx.invoice_number : "Unknown";
    const custName = tx ? tx.customer_name : "Unknown";
    const totalAmount = tx ? Number(tx.total_amount) : 0;
    let notes = tx ? tx.notes || "" : "";

    if (!notes.includes("[DELETED]")) {
      notes = `[DELETED] ${notes}`.trim();
    }

    const { error } = await supabase
      .from("transactions")
      .update({ notes })
      .eq("id", id);

    if (error) {
      console.warn("Error deleting transaction:", error);
      throw error;
    }

    await this.addActivityLog(
      "DELETE",
      "Penjualan",
      `Menghapus Transaksi ${invoiceNum} (${custName}) senilai Rp ${totalAmount.toLocaleString("id-ID")}`
    );

    invalidateCache(["transactions", "customerDebtSummaries", "activityLogs"]);
  },

  async restoreTransaction(id: string): Promise<void> {
    const { data: tx } = await supabase
      .from("transactions")
      .select("invoice_number, customer_name, total_amount, notes")
      .eq("id", id)
      .single();

    const invoiceNum = tx ? tx.invoice_number : "Unknown";
    const custName = tx ? tx.customer_name : "Unknown";
    const totalAmount = tx ? Number(tx.total_amount) : 0;
    let notes = tx ? tx.notes || "" : "";

    if (notes.includes("[DELETED]")) {
      notes = notes.replace(/\[DELETED\]\s*/, "").trim();
    }

    const { error } = await supabase
      .from("transactions")
      .update({ notes: notes || null })
      .eq("id", id);

    if (error) {
      console.warn("Error restoring transaction:", error);
      throw error;
    }

    await this.addActivityLog(
      "RESTORE",
      "Penjualan",
      `Memulihkan Transaksi ${invoiceNum} (${custName}) senilai Rp ${totalAmount.toLocaleString("id-ID")}`
    );

    invalidateCache(["transactions", "customerDebtSummaries", "activityLogs"]);
  },

  // --- USERS / LOGIN API ---
  async getUsers(): Promise<AppUser[]> {
    const cached = getCached<AppUser[]>("users");
    if (cached) return cached;

    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("username");
      if (!error && data) {
        const mapped = data.map((u) => ({
          id: u.id,
          username: u.username,
          password: u.password,
          role: u.role as 'superadmin' | 'admin' | 'kasir',
          fullname: u.fullname,
          createdAt: u.created_at,
        }));
        setCached("users", mapped);
        return mapped;
      }
    } catch (e) {
      console.warn("Supabase users table failed, falling back to local storage:", e);
    }

    // Local storage fallback
    const localUsersStr = localStorage.getItem("dpj_users");
    if (localUsersStr) {
      try {
        const parsed = JSON.parse(localUsersStr);
        setCached("users", parsed);
        return parsed;
      } catch (e) {
        // Fall to default
      }
    }

    // Default users if empty
    const defaultUsers: AppUser[] = [
      {
        id: "user-superadmin",
        username: "superadmin",
        password: "superadmin123",
        role: "superadmin",
        fullname: "Super Administrator",
        createdAt: new Date().toISOString(),
      },
      {
        id: "user-admin",
        username: "admin",
        password: "admin123",
        role: "admin",
        fullname: "Administrator",
        createdAt: new Date().toISOString(),
      },
      {
        id: "user-kasir",
        username: "kasir",
        password: "kasir123",
        role: "kasir",
        fullname: "Kasir Toko",
        createdAt: new Date().toISOString(),
      },
    ];
    localStorage.setItem("dpj_users", JSON.stringify(defaultUsers));
    setCached("users", defaultUsers);
    return defaultUsers;
  },

  async saveUser(user: AppUser): Promise<void> {
    const isNew = user.id.startsWith("user-") || !user.id;
    const dbPayload = {
      username: user.username,
      password: user.password,
      role: user.role,
      fullname: user.fullname,
    };

    let savedOnSupabase = false;
    try {
      if (isNew) {
        const { error } = await supabase.from("users").insert({
          id: user.id.startsWith("user-") ? undefined : user.id,
          ...dbPayload
        });
        if (!error) savedOnSupabase = true;
      } else {
        const { error } = await supabase.from("users").update(dbPayload).eq("id", user.id);
        if (!error) savedOnSupabase = true;
      }
    } catch (e) {
      console.warn("Failed to save user to Supabase:", e);
    }

    // Always update local storage for reliability and fallback
    const localUsers = await this.getUsers();
    if (isNew) {
      const newUser: AppUser = {
        ...user,
        id: user.id || `user-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      const updated = [...localUsers, newUser];
      localStorage.setItem("dpj_users", JSON.stringify(updated));
      await this.addActivityLog(
        "CREATE",
        "Sistem",
        `Menambahkan pengguna baru: ${user.fullname} (${user.username}) dengan hak akses ${user.role.toUpperCase()}`
      );
    } else {
      const updated = localUsers.map((u) => {
        if (u.id === user.id) {
          return { ...u, ...user };
        }
        return u;
      });
      localStorage.setItem("dpj_users", JSON.stringify(updated));
      await this.addActivityLog(
        "EDIT",
        "Sistem",
        `Mengubah detail pengguna: ${user.fullname} (${user.username})`
      );
    }
    invalidateCache(["users"]);
  },

  async deleteUser(id: string): Promise<void> {
    const localUsers = await this.getUsers();
    const userToDelete = localUsers.find((u) => u.id === id);
    const fullname = userToDelete ? userToDelete.fullname : "Unknown";

    try {
      await supabase.from("users").delete().eq("id", id);
    } catch (e) {
      console.warn("Failed to delete user from Supabase:", e);
    }

    const updated = localUsers.filter((u) => u.id !== id);
    localStorage.setItem("dpj_users", JSON.stringify(updated));

    await this.addActivityLog(
      "DELETE",
      "Sistem",
      `Menghapus akun pengguna: ${fullname}`
    );
    invalidateCache(["users"]);
  },

  // --- ONLINE STATUS API ---
  async updateOnlineStatus(userId: string, isLoggingOut: boolean = false): Promise<void> {
    let user: any = null;
    try {
      const savedUser = localStorage.getItem("dpj_current_user");
      if (savedUser) {
        user = JSON.parse(savedUser);
      }
    } catch (e) { }

    if (!user || user.id !== userId) {
      try {
        const users = await this.getUsers();
        user = users.find((u) => u.id === userId);
      } catch (e) { }
    }

    if (!user) return;

    const now = new Date();
    const hbId = `hb-${userId}`;

    // 1. Try to update online status on Supabase using activity_logs table (upsert/delete)
    try {
      if (isLoggingOut) {
        await supabase.from("activity_logs").delete().eq("id", hbId);
      } else {
        await supabase.from("activity_logs").upsert({
          id: hbId,
          action: "HEARTBEAT",
          module: "Sistem",
          description: JSON.stringify({
            id: user.id,
            username: user.username,
            fullname: user.fullname,
            role: user.role,
            lastActive: now.toISOString(),
          }),
          created_at: now.toISOString(),
        });
      }
    } catch (e) {
      console.warn("Failed to update online status on Supabase, using local storage fallback:", e);
    }

    // 2. Also update local storage for dual-sync reliability and fallback
    let onlineUsers: any[] = [];
    try {
      const stored = localStorage.getItem("dpj_online_users");
      if (stored) {
        onlineUsers = JSON.parse(stored);
      }
    } catch (e) {
      onlineUsers = [];
    }

    onlineUsers = onlineUsers.filter((u) => {
      const lastActive = new Date(u.lastActive);
      const diffMs = now.getTime() - lastActive.getTime();
      return diffMs < 5 * 60 * 1000 && u.id !== userId;
    });

    if (!isLoggingOut) {
      onlineUsers.push({
        id: user.id,
        username: user.username,
        fullname: user.fullname,
        role: user.role,
        lastActive: now.toISOString(),
      });
    }

    localStorage.setItem("dpj_online_users", JSON.stringify(onlineUsers));
  },

  async getOnlineUsers(): Promise<any[]> {
    const now = new Date();

    // 1. Try to fetch active heartbeat rows from Supabase
    try {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("action", "HEARTBEAT");

      if (!error && data) {
        const onlineUsers: any[] = [];
        data.forEach((log) => {
          try {
            const parsed = JSON.parse(log.description);
            const lastActive = new Date(log.created_at || parsed.lastActive);
            const diffMs = now.getTime() - lastActive.getTime();
            // Active if updated in the last 5 minutes (handles browser tab sleep and background limits)
            if (diffMs < 5 * 60 * 1000) {
              onlineUsers.push({
                ...parsed,
                lastActive: lastActive.toISOString(),
              });
            }
          } catch (e) {
            // Ignore bad parses
          }
        });

        localStorage.setItem("dpj_online_users", JSON.stringify(onlineUsers));
        return onlineUsers;
      }
    } catch (e) {
      console.warn("Failed to fetch online users from Supabase, falling back to local storage:", e);
    }

    // 2. Fallback to local storage
    let onlineUsers: any[] = [];
    try {
      const stored = localStorage.getItem("dpj_online_users");
      if (stored) {
        onlineUsers = JSON.parse(stored);
      }
    } catch (e) {
      onlineUsers = [];
    }

    onlineUsers = onlineUsers.filter((u) => {
      const lastActive = new Date(u.lastActive);
      const diffMs = now.getTime() - lastActive.getTime();
      return diffMs < 5 * 60 * 1000;
    });

    return onlineUsers;
  },

  // --- STOCK API ---
  async getStockIns(): Promise<StockIn[]> {
    const cached = getCached<StockIn[]>("stock_ins");
    if (cached) return cached;

    // Try fetching from Supabase
    try {
      const { data, error } = await supabase
        .from("stock_ins")
        .select("*")
        .order("date", { ascending: false });

      if (!error && data) {
        const mapped: StockIn[] = data.map((d: any) => ({
          id: d.id,
          date: d.date,
          itemId: d.item_id,
          itemName: d.item_name,
          quantity: Number(d.quantity),
          pricePerItem: d.price_per_item !== null && d.price_per_item !== undefined ? Number(d.price_per_item) : undefined,
          supplier: d.supplier || undefined,
          notes: d.notes || undefined,
        }));
        // Update local storage backup
        localStorage.setItem("dpj_stock_ins", JSON.stringify(mapped));
        setCached("stock_ins", mapped);
        return mapped;
      }
    } catch (e) {
      console.warn("Supabase stock_ins table not yet available, using LocalStorage fallback.");
    }

    // Fallback to LocalStorage
    const localStockInStr = localStorage.getItem("dpj_stock_ins");
    let stockIns: StockIn[] = [];
    if (localStockInStr) {
      try {
        stockIns = JSON.parse(localStockInStr);
      } catch (e) {
        stockIns = [];
      }
    }
    setCached("stock_ins", stockIns);
    return stockIns;
  },

  async saveStockIn(stockIn: StockIn): Promise<void> {
    const stockIns = await this.getStockIns();
    const isNew = !stockIns.some((s) => s.id === stockIn.id);

    // Save to local storage first (always consistent)
    let updated: StockIn[] = [];
    if (isNew) {
      updated = [...stockIns, stockIn];
      await this.addActivityLog(
        "CREATE",
        "Stok",
        `Stok Masuk Baru: ${stockIn.itemName} (${stockIn.quantity} unit) oleh Supplier ${stockIn.supplier || '-'}`
      );
    } else {
      updated = stockIns.map((s) => (s.id === stockIn.id ? stockIn : s));
      await this.addActivityLog(
        "EDIT",
        "Stok",
        `Mengubah Transaksi Stok Masuk: ${stockIn.itemName} menjadi ${stockIn.quantity} unit`
      );
    }
    localStorage.setItem("dpj_stock_ins", JSON.stringify(updated));

    // Try saving to Supabase
    try {
      const payload = {
        id: stockIn.id,
        date: stockIn.date,
        item_id: stockIn.itemId,
        item_name: stockIn.itemName,
        quantity: stockIn.quantity,
        price_per_item: stockIn.pricePerItem || null,
        supplier: stockIn.supplier || null,
        notes: stockIn.notes || null,
      };

      await supabase.from("stock_ins").upsert(payload, { onConflict: "id" });
    } catch (e) {
      console.warn("Could not save stock_in to Supabase:", e);
    }

    invalidateCache(["stock_ins"]);
  },

  async deleteStockIn(id: string): Promise<void> {
    const stockIns = await this.getStockIns();
    const found = stockIns.find((s) => s.id === id);
    if (!found) return;

    // Delete from local storage
    const updated = stockIns.filter((s) => s.id !== id);
    localStorage.setItem("dpj_stock_ins", JSON.stringify(updated));

    await this.addActivityLog(
      "DELETE",
      "Stok",
      `Menghapus Transaksi Stok Masuk: ${found.itemName} (${found.quantity} unit)`
    );

    // Try deleting from Supabase
    try {
      await supabase.from("stock_ins").delete().eq("id", id);
    } catch (e) {
      console.warn("Could not delete stock_in from Supabase:", e);
    }

    invalidateCache(["stock_ins"]);
  },

  async getStockOpnames(): Promise<StockOpname[]> {
    const cached = getCached<StockOpname[]>("stock_opnames");
    if (cached) return cached;

    // Try fetching from Supabase
    try {
      const { data, error } = await supabase
        .from("stock_opnames")
        .select("*")
        .order("date", { ascending: false });

      if (!error && data) {
        const mapped: StockOpname[] = data.map((d: any) => ({
          id: d.id,
          date: d.date,
          itemId: d.item_id,
          itemName: d.item_name,
          actualQuantity: Number(d.actual_quantity),
          previousQuantity: Number(d.previous_quantity),
          notes: d.notes || undefined,
        }));
        // Update local storage backup
        localStorage.setItem("dpj_stock_opnames", JSON.stringify(mapped));
        setCached("stock_opnames", mapped);
        return mapped;
      }
    } catch (e) {
      console.warn("Supabase stock_opnames table not yet available, using LocalStorage fallback.");
    }

    // Fallback to LocalStorage
    const localOpnameStr = localStorage.getItem("dpj_stock_opnames");
    let opnames: StockOpname[] = [];
    if (localOpnameStr) {
      try {
        opnames = JSON.parse(localOpnameStr);
      } catch (e) {
        opnames = [];
      }
    }
    setCached("stock_opnames", opnames);
    return opnames;
  },

  async saveStockOpname(opname: StockOpname): Promise<void> {
    const opnames = await this.getStockOpnames();
    const updated = [...opnames, opname];

    // Save to local storage first (always consistent)
    localStorage.setItem("dpj_stock_opnames", JSON.stringify(updated));

    await this.addActivityLog(
      "CREATE",
      "Stok",
      `Opname Stok: ${opname.itemName} disesuaikan ke ${opname.actualQuantity} unit (Sebelumnya: ${opname.previousQuantity} unit)`
    );

    // Try saving to Supabase
    try {
      const payload = {
        id: opname.id,
        date: opname.date,
        item_id: opname.itemId,
        item_name: opname.itemName,
        actual_quantity: opname.actualQuantity,
        previous_quantity: opname.previousQuantity,
        notes: opname.notes || null,
      };

      await supabase.from("stock_opnames").upsert(payload, { onConflict: "id" });
    } catch (e) {
      console.warn("Could not save stock_opname to Supabase:", e);
    }

    invalidateCache(["stock_opnames"]);
  },
};
