import {
  Item,
  Customer,
  Transaction,
  DebtPayment,
  PriceMemory,
  CustomerDebtSummary,
  ActivityLog,
  AppUser,
} from "../types";
import { supabase } from "./supabase";

export const db = {
  // --- ITEMS API ---
  async getItems(): Promise<Item[]> {
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .order("name");
    if (error) {
      console.warn("Error fetching items:", error);
      return [];
    }
    return data.map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      createdAt: item.created_at,
    }));
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
  },

  // --- CUSTOMERS API ---
  async getCustomers(): Promise<Customer[]> {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("name");
    if (error) {
      console.warn("Error fetching customers:", error);
      return [];
    }
    return data.map((cust) => ({
      id: cust.id,
      name: cust.name,
      phone: cust.phone || "-",
      address: cust.address || "",
      createdAt: cust.created_at,
    }));
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
  },

  // --- TRANSACTIONS API ---
  async getTransactions(): Promise<Transaction[]> {
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

    return data.map((tx) => ({
      id: tx.id,
      invoiceNumber: tx.invoice_number,
      customerId: tx.customer_id,
      customerName: tx.customer_name,
      totalAmount: Number(tx.total_amount),
      paymentMethod: tx.payment_method,
      amountPaid: Number(tx.amount_paid),
      remainingDebt: Number(tx.remaining_debt),
      date: tx.date,
      printCount: tx.print_count,
      notes: tx.notes,
      items: tx.transaction_items.map((item: any) => ({
        itemId: item.item_id,
        name: item.name,
        price: Number(item.price),
        quantity: Number(item.quantity),
        subtotal: Number(item.subtotal),
        unit: item.unit,
      })),
    }));
  },

  async saveTransaction(transaction: Transaction): Promise<void> {
    const txPayload = {
      invoice_number: transaction.invoiceNumber,
      customer_id: transaction.customerId,
      customer_name: transaction.customerName,
      total_amount: transaction.totalAmount,
      payment_method: transaction.paymentMethod,
      amount_paid: transaction.amountPaid,
      remaining_debt: transaction.remainingDebt,
      date: transaction.date,
      print_count: transaction.printCount || 0,
      notes: transaction.notes,
    };

    // Insert transaction
    const { data: txData, error: txError } = await supabase
      .from("transactions")
      .insert(txPayload)
      .select()
      .single();

    if (txError || !txData) {
      console.warn("Error saving transaction:", txError);
      return;
    }

    // Insert transaction items
    const itemsPayload = transaction.items.map((item) => ({
      transaction_id: txData.id,
      item_id: item.itemId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.subtotal,
      unit: item.unit,
    }));

    await supabase.from("transaction_items").insert(itemsPayload);

    // Update price memories
    for (const item of transaction.items) {
      const pmPayload = {
        item_id: item.itemId,
        last_price: item.price,
      };
      // Upsert price memory
      await supabase
        .from("price_memory")
        .upsert(pmPayload, { onConflict: "item_id" });
    }

    // Log transaction creation
    await this.addActivityLog(
      "CREATE",
      "Penjualan",
      `Membuat Transaksi Baru: ${transaction.invoiceNumber} (${transaction.customerName}) - Total: Rp ${transaction.totalAmount.toLocaleString("id-ID")}`
    );
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
    }
  },

  // --- DEBT PAYMENTS API ---
  async getDebtPayments(): Promise<DebtPayment[]> {
    const { data, error } = await supabase
      .from("debt_payments")
      .select("*")
      .order("date", { ascending: false });
    if (error) {
      console.warn("Error fetching debt payments:", error);
      return [];
    }

    return data.map((dp) => ({
      id: dp.id,
      customerId: dp.customer_id,
      transactionId: dp.transaction_id,
      invoiceNumber: dp.invoice_number,
      date: dp.date,
      amountPaid: Number(dp.amount_paid),
      paymentMethod: dp.payment_method,
      notes: dp.notes,
    }));
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
  },

  // --- PRICE MEMORY API ---
  async getPriceMemories(): Promise<PriceMemory> {
    const { data, error } = await supabase.from("price_memory").select("*");
    if (error) return {};

    const memories: PriceMemory = {};
    data.forEach((pm) => {
      memories[pm.item_id] = Number(pm.last_price);
    });
    return memories;
  },

  // --- CUSTOMER DEBT CALCULATIONS ---
  async getCustomerDebtSummaries(): Promise<CustomerDebtSummary[]> {
    const [customers, txs, payments] = await Promise.all([
      this.getCustomers(),
      this.getTransactions(),
      this.getDebtPayments(),
    ]);

    const summaries: CustomerDebtSummary[] = [];

    for (const customer of customers) {
      if (customer.name.toLowerCase() === "pelanggan umum" || customer.id === "cust-1") continue;

      const customerTxs = txs.filter((t) => t.customerId === customer.id);
      const customerPayments = payments.filter((p) => p.customerId === customer.id);

      let totalDebt = 0;
      let lastActive = new Date(0).toISOString();

      customerTxs.forEach((t) => {
        if (t.paymentMethod === "debt") {
          totalDebt += t.remainingDebt;
          if (new Date(t.date) > new Date(lastActive)) {
            lastActive = t.date;
          }
        }
      });

      let totalPaid = 0;
      customerPayments.forEach((p) => {
        totalPaid += p.amountPaid;
        if (new Date(p.date) > new Date(lastActive)) {
          lastActive = p.date;
        }
      });

      const remainingDebt = totalDebt - totalPaid;

      if (totalDebt > 0 || totalPaid > 0) {
        summaries.push({
          customerId: customer.id,
          customerName: customer.name,
          totalDebt,
          totalPaid,
          remainingDebt,
          lastActive: lastActive === new Date(0).toISOString() ? "" : lastActive,
        });
      }
    }

    // Sort by last active descending
    return summaries.sort((a, b) => {
      if (!a.lastActive) return 1;
      if (!b.lastActive) return -1;
      return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
    });
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
    } catch (err) {
      console.error("Error seeding/resetting database:", err);
      throw err;
    }
  },

  // --- ACTIVITY LOGS API ---
  async getActivityLogs(): Promise<ActivityLog[]> {
    try {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) {
        return data.map((log) => ({
          id: log.id,
          action: log.action as ActivityLog["action"],
          module: log.module,
          description: log.description,
          timestamp: log.created_at,
        }));
      }
    } catch (e) {
      console.warn("Supabase activity_logs table failed, falling back to local storage:", e);
    }

    const localLogsStr = localStorage.getItem("dpj_activity_logs");
    if (localLogsStr) {
      try {
        return JSON.parse(localLogsStr);
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
    const newLog: ActivityLog = {
      id,
      action,
      module,
      description,
      timestamp,
    };

    try {
      const { error } = await supabase.from("activity_logs").insert({
        id,
        action,
        module,
        description,
        created_at: timestamp,
      });
      if (!error) return;
    } catch (e) {
      // Ignored, will fallback to local storage
    }

    try {
      const logs = await this.getActivityLogs();
      const updatedLogs = [newLog, ...logs].slice(0, 1000);
      localStorage.setItem("dpj_activity_logs", JSON.stringify(updatedLogs));
    } catch (e) {
      console.error("Failed to save activity log to local storage:", e);
    }
  },

  async clearActivityLogs(): Promise<void> {
    try {
      await supabase.from("activity_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    } catch (e) { }
    localStorage.removeItem("dpj_activity_logs");
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

    const txPayload = {
      customer_id: transaction.customerId,
      customer_name: transaction.customerName,
      total_amount: transaction.totalAmount,
      payment_method: transaction.paymentMethod,
      amount_paid: transaction.amountPaid,
      remaining_debt: remainingDebt,
      notes: transaction.notes,
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
      item_id: item.itemId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.subtotal,
      unit: item.unit,
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
      const pmPayload = {
        item_id: item.itemId,
        last_price: item.price,
      };
      await supabase
        .from("price_memory")
        .upsert(pmPayload, { onConflict: "item_id" });
    }

    // 7. Log activity
    await this.addActivityLog(
      "EDIT",
      "Penjualan",
      `Mengubah Transaksi ${transaction.invoiceNumber} (${transaction.customerName}) - Total Baru: Rp ${transaction.totalAmount.toLocaleString("id-ID")}`
    );
  },

  async deleteTransaction(id: string): Promise<void> {
    const { data: tx } = await supabase
      .from("transactions")
      .select("invoice_number, customer_name, total_amount")
      .eq("id", id)
      .single();

    const invoiceNum = tx ? tx.invoice_number : "Unknown";
    const custName = tx ? tx.customer_name : "Unknown";
    const totalAmount = tx ? Number(tx.total_amount) : 0;

    const { error } = await supabase
      .from("transactions")
      .delete()
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
  },

  // --- USERS / LOGIN API ---
  async getUsers(): Promise<AppUser[]> {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("username");
      if (!error && data) {
        return data.map((u) => ({
          id: u.id,
          username: u.username,
          password: u.password,
          role: u.role as 'superadmin' | 'admin' | 'kasir',
          fullname: u.fullname,
          createdAt: u.created_at,
        }));
      }
    } catch (e) {
      console.warn("Supabase users table failed, falling back to local storage:", e);
    }

    // Local storage fallback
    const localUsersStr = localStorage.getItem("dpj_users");
    if (localUsersStr) {
      try {
        return JSON.parse(localUsersStr);
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
  },
};
