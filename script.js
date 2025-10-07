// ==================
// SETUP & KONFIGURASI
// ==================
const SUPABASE_URL = 'https://dxyvftujqgkjmbqpgyfg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4eXZmdHVqcWdram1icXBneWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2Njc3MTUsImV4cCI6MjA3NTI0MzcxNX0.IVXS3hz_iO4S5B5KmQJJEcepzFqtTW-cxbmQmD7aevE';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const fmt = (n) => Number(n || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
const getPIN = () => localStorage.getItem('thc_admin_pin') || 'boss123';
const setPIN = (v) => localStorage.setItem('thc_admin_pin', v);

const THEME_KEY = 'thc_theme';
const COUNTERS_KEY = 'thc_counters';

// Cache data
let ALL_STOCKS = [], ALL_SALES = [], ALL_EXPENSES = [], ALL_PAYROLLS = [], ALL_CLIENTS = [], ALL_PAYMENTS = [];
let COUNTERS = { soldAtReset: { q12: 0, q14: 0, qi: 0 } };

function loadCounters() {
    const data = JSON.parse(localStorage.getItem(COUNTERS_KEY) || 'null');
    if (data) COUNTERS = data;
}
function saveCounters() {
    localStorage.setItem(COUNTERS_KEY, JSON.stringify(COUNTERS));
}

// ==================
// FUNGSI UTAMA & PAPARAN
// ==================
async function renderAll() {
    document.body.style.cursor = 'wait';
    await fetchAllData();
    await Promise.all([
        renderStocks(), renderExpenses(), renderClients(),
        renderSales(), renderPayments(), renderPayroll(),
        recomputeSummary(), renderReport()
    ]);
    calcSale();
    document.body.style.cursor = 'default';
}

async function fetchAllData() {
    const { data: stocks } = await supabaseClient.from('stocks').select('*');
    const { data: sales } = await supabaseClient.from('sales').select('*');
    const { data: expenses } = await supabaseClient.from('expenses').select('*');
    const { data: payrolls } = await supabaseClient.from('payrolls').select('*');
    const { data: clients } = await supabaseClient.from('clients').select('*');
    const { data: payments } = await supabaseClient.from('payments').select('*');
    ALL_STOCKS = stocks || []; ALL_SALES = sales || []; ALL_EXPENSES = expenses || [];
    ALL_PAYROLLS = payrolls || []; ALL_CLIENTS = clients || []; ALL_PAYMENTS = payments || [];
}

function renderGrouped(hostId, items, renderItemFn) {
    const host = document.getElementById(hostId);
    host.innerHTML = '';
    if (items.length === 0) {
        host.innerHTML = `<p class="note">Tiada rekod.</p>`;
        return;
    }
    const groups = {};
    items.forEach(item => {
        const date = item.date || new Date(item.created_at).toISOString().slice(0, 10);
        (groups[date] = groups[date] || []).push(item);
    });

    const sortedDates = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));

    sortedDates.forEach((date, dateIdx) => {
        const itemsHtml = groups[date].map(renderItemFn).join('');
        host.innerHTML += `<details class="date-group" ${dateIdx === 0 ? 'open' : ''}><summary class="date-group-summary">${date}</summary><div class="date-group-content">${itemsHtml}</div></details>`;
    });
}

function renderStocks() {
    renderGrouped('stockList', ALL_STOCKS, (st) => {
        const totalCost = (st.q12 * st.c12) + (st.q14 * st.c14) + (st.qi * st.ci);
        const color = `b${((st.batch || 0) % 6) || 6}`;
        return `<details class="record-item" data-id="${st.id}"><summary class="record-summary"><div><span class="summary-title"><span class="chip ${color}">#${st.batch}</span> ${st.note}</span><span class="summary-meta">Kos: RM ${fmt(totalCost)}</span></div><div class="record-actions"><button class="ghost danger" onclick="delStock(${st.id})">Padam</button></div></summary><div class="details-content">${st.q14 > 0 ? `<div class="details-row"><span class="label">14KG</span><span class="value">${st.q14} @ RM ${fmt(st.c14)}</span></div>` : ''}${st.q12 > 0 ? `<div class="details-row"><span class="label">12KG</span><span class="value">${st.q12} @ RM ${fmt(st.c12)}</span></div>` : ''}${st.qi > 0 ? `<div class="details-row"><span class="label">Industri</span><span class="value">${st.qi} @ RM ${fmt(st.ci)}</span></div>` : ''}</div></details>`;
    });
}

function renderExpenses() {
    renderGrouped('expList', ALL_EXPENSES, (ex) => {
        return `<details class="record-item" data-id="${ex.id}"><summary class="record-summary"><div><span class="summary-title">${ex.type}</span><span class="summary-meta">RM ${fmt(ex.amount)}</span></div><div class="record-actions"><button class="ghost danger" onclick="delExpense(${ex.id})">Padam</button></div></summary><div class="details-content"><p class="note">Nota: ${ex.note || '-'}</p></div></details>`;
    });
}

function renderSales() {
    renderGrouped('salesList', ALL_SALES, (s) => {
        const totalSales = (s.q12 * s.price12) + (s.q14 * s.price14) + (s.qi * s.priceI);
        const totalPaid = ((s.paid12||0) * s.price12) + ((s.paid14||0) * s.price14) + ((s.paidI||0) * s.priceI);
        const debtRM = totalSales - totalPaid;
        return `<details class="record-item" data-id="${s.id}"><summary class="record-summary"><div><span class="summary-title">${s.client_name}</span><span class="summary-meta">Jumlah: RM ${fmt(totalSales)} ${debtRM > 0.01 ? `<span class="chip danger-chip" style="margin-left: 5px;">Hutang</span>` : ''}</span></div></summary><div class="details-content">${s.q14 > 0 ? `<div class="details-row"><span class="label">14KG</span><span class="value">${s.q14} (Dibayar: ${s.paid14 || 0}) @ RM ${fmt(s.price14)}</span></div>` : ''}${s.q12 > 0 ? `<div class="details-row"><span class="label">12KG</span><span class="value">${s.q12} (Dibayar: ${s.paid12 || 0}) @ RM ${fmt(s.price12)}</span></div>` : ''}${s.qi > 0 ? `<div class="details-row"><span class="label">Industri</span><span class="value">${s.qi} (Dibayar: ${s.paidI || 0}) @ RM ${fmt(s.priceI)}</span></div>` : ''}<div class="details-row"><span class="label">Bayaran</span><span class="value">${s.payType}</span></div>${debtRM > 0.01 ? `<div class="details-row"><span class="label" style="color:var(--danger)">Baki Hutang Jualan Ini</span><span class="value" style="color:var(--danger)">RM ${fmt(debtRM)}</span></div>`: ''}<div class="divider"></div><div class="record-actions" style="justify-content: flex-end;"><button class="secondary" style="width:auto;" onclick='printReceipt(${s.id})'>Resit</button><button class="danger" style="width: auto;" onclick="delSale(${s.id})">Padam</button></div></div></details>`;
    });
}

function renderClients() {
    const tb = document.querySelector('#clientTable tbody'); tb.innerHTML = '';
    const sorted = [...ALL_CLIENTS].sort((a,b) => a.name.localeCompare(b.name));
    for (const c of sorted) {
        const debt = computeClientDebt(c.name);
        tb.innerHTML += `<tr><td>${c.name}</td><td>${c.cat || '-'}</td><td>${fmt(c.p14)}/${fmt(c.p12)}/${fmt(c.pi)}</td><td>RM ${fmt(debt.rm)}</td><td><button class="ghost danger" onclick="delClient(${c.id})">Padam</button></td></tr>`;
    }
}

function renderPayments() {
    const tb = document.querySelector('#payTable tbody'); tb.innerHTML = '';
    const sorted = [...ALL_PAYMENTS].sort((a,b) => new Date(b.date) - new Date(a.date));
    sorted.forEach(p => { tb.innerHTML += `<tr><td>${p.date}</td><td>${p.client_name}</td><td>RM ${fmt(p.amount)}</td><td>${p.method}</td><td>${p.note || '-'}</td></tr>`; });
}

function renderPayroll() {
    const tb = document.querySelector('#payrollTable tbody'); tb.innerHTML = '';
    const sorted = [...ALL_PAYROLLS].sort((a,b) => new Date(b.date) - new Date(a.date));
    sorted.forEach(p => { tb.innerHTML += `<tr><td>${p.date}</td><td>${p.name}</td><td>RM ${fmt(p.amount)}</td><td>${p.note || '-'}</td><td><button class="ghost danger" onclick="delPayroll(${p.id})">Padam</button></td></tr>`; });
}

// ==================
// FUNGSI PENGIRAAN
// ==================
function computeClientDebt(clientName) {
    const clientSales = ALL_SALES.filter(s => s.client_name === clientName);
    const clientPayments = ALL_PAYMENTS.filter(p => p.client_name === clientName);
    const totalSalesValue = clientSales.reduce((sum, s) => sum + (s.q12 * s.price12) + (s.q14 * s.price14) + (s.qi * s.priceI), 0);
    const totalPaidValue = clientPayments.reduce((sum, p) => sum + p.amount, 0);
    const debtInRM = Math.max(0, totalSalesValue - totalPaidValue);
    const sumCylinders = (records, key) => records.reduce((sum, r) => sum + (r[key] || 0), 0);
    
    const totalSold12 = sumCylinders(clientSales, 'q12');
    const totalPaid12 = sumCylinders(clientSales, 'paid12') + sumCylinders(clientPayments, 'q12');
    const debtInQ12 = totalSold12 - totalPaid12;
    const totalSold14 = sumCylinders(clientSales, 'q14');
    const totalPaid14 = sumCylinders(clientSales, 'paid14') + sumCylinders(clientPayments, 'q14');
    const debtInQ14 = totalSold14 - totalPaid14;
    const totalSoldI = sumCylinders(clientSales, 'qi');
    const totalPaidI = sumCylinders(clientSales, 'paidI') + sumCylinders(clientPayments, 'qi');
    const debtInQI = totalSoldI - totalPaidI;

    return { rm: debtInRM, q12: debtInQ12, q14: debtInQ14, qi: debtInQI };
}

function rebuildInventoryAndGetCosts() {
    let inventory = { q12: [], q14: [], qi: [] };
    const sortedStocks = [...ALL_STOCKS].sort((a, b) => new Date(a.date) - new Date(b.date) || a.batch - b.batch);
    sortedStocks.forEach(s => {
        if (s.q12 > 0) inventory.q12.push({ batch: s.batch, remain: s.q12, cost: s.c12 });
        if (s.q14 > 0) inventory.q14.push({ batch: s.batch, remain: s.q14, cost: s.c14 });
        if (s.qi > 0) inventory.qi.push({ batch: s.batch, remain: s.qi, cost: s.ci });
    });
    const popInventory = (type, qty, inv) => {
        let totalCost = 0; let need = qty;
        while (need > 0 && inv[type].length > 0) {
            const node = inv[type][0];
            const take = Math.min(node.remain, need);
            if (take > 0) { totalCost += take * node.cost; node.remain -= take; need -= take; }
            if (node.remain === 0) { inv[type].shift(); }
        }
        return totalCost;
    };
    let totalCostOfGoodsSold = 0;
    let tempInventory = JSON.parse(JSON.stringify(inventory));
    const sortedSales = [...ALL_SALES].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    sortedSales.forEach(s => {
        if (s.q12 > 0) totalCostOfGoodsSold += popInventory('q12', s.q12, tempInventory);
        if (s.q14 > 0) totalCostOfGoodsSold += popInventory('q14', s.q14, tempInventory);
        if (s.qi > 0) totalCostOfGoodsSold += popInventory('qi', s.qi, tempInventory);
    });
    return totalCostOfGoodsSold;
}

function recomputeSummary() {
    const totalIn = (key) => ALL_STOCKS.reduce((sum, s) => sum + (s[key] || 0), 0);
    const totalSold = (key) => ALL_SALES.reduce((sum, s) => sum + (s[key] || 0), 0);
    const latestStock = [...ALL_STOCKS].sort((a,b) => new Date(b.date) - new Date(a.date) || b.batch - a.batch)[0] || {q12:0, q14:0, qi:0};
    const kp = [
        { k: 'Stok Terkini 14KG', v: latestStock.q14 }, { k: 'Stok Terkini 12KG', v: latestStock.q12 }, { k: 'Stok Terkini Industri', v: latestStock.qi },
        { k: 'Baki 14KG', v: totalIn('q14') - totalSold('q14') }, { k: 'Baki 12KG', v: totalIn('q12') - totalSold('q12') }, { k: 'Baki Industri', v: totalIn('qi') - totalSold('qi') },
        { k: 'Terjual 14KG', v: totalSold('q14') - (COUNTERS.soldAtReset.q14 || 0) }, { k: 'Terjual 12KG', v: totalSold('q12') - (COUNTERS.soldAtReset.q12 || 0) }, { k: 'Terjual Industri', v: totalSold('qi') - (COUNTERS.soldAtReset.qi || 0) },
    ];
    document.getElementById('summaryBar').innerHTML = kp.map(x => `<div class="kpi"><h4>${x.k}</h4><div class="v">${(x.v || 0).toLocaleString()}</div></div>`).join('');
}

function renderReport() {
    const totalCostOfGoodsSold = rebuildInventoryAndGetCosts();
    const totalOtherCost = ALL_EXPENSES.reduce((s, x) => s + Number(x.amount || 0), 0);
    const totalPayrollCost = ALL_PAYROLLS.reduce((s, x) => s + Number(x.amount || 0), 0);
    const totalSalesRM = ALL_SALES.reduce((s, x) => s + (s.q12 * s.price12) + (s.q14 * s.price14) + (s.qi * x.priceI), 0);
    const totalPaymentsRM = ALL_PAYMENTS.reduce((s, x) => s + Number(x.amount || 0), 0);
    const totalDebtRM = totalSalesRM - totalPaymentsRM;
    const grossProfit = totalSalesRM - totalCostOfGoodsSold;
    const netProfit = grossProfit - totalOtherCost - totalPayrollCost;
    const kpis = [
        ['Jumlah Jualan', totalSalesRM, true], ['Untung Bersih', netProfit, true],
        ['Jumlah Hutang', totalDebtRM, true], ['Untung Kasar', grossProfit, true],
        ['Modal Gas Terpakai', totalCostOfGoodsSold, true], ['Modal Lain', totalOtherCost, true],
        ['Gaji Dibayar', totalPayrollCost, true], ['Bayaran Diterima', totalPaymentsRM, true],
    ];
    document.getElementById('reportKPI').innerHTML = kpis.map(([label, value, isCurrency]) => {
        return `<div class="kpi" style="background: var(--surface-2);"><h4>${label}</h4><div class="v">${isCurrency ? `RM ${fmt(value)}` : (value || 0).toLocaleString()}</div></div>`;
    }).join('');
}

// ==================
// FUNGSI AKSI
// ==================
async function addStock() {
    const form = document.getElementById('addStockForm');
    const newStock = { date: form.querySelector('#stDate').value || today(), note: form.querySelector('#stNote').value, q14: +form.querySelector('#stQ14').value || 0, c14: +form.querySelector('#stC14').value || 0, q12: +form.querySelector('#stQ12').value || 0, c12: +form.querySelector('#stC12').value || 0, qi: +form.querySelector('#stQI').value || 0, ci: +form.querySelector('#stCI').value || 0, batch: Date.now() };
    if (!newStock.note) { alert('Nota wajib diisi.'); return; }
    await supabaseClient.from('stocks').insert([newStock]);
    form.reset(); form.querySelector('#stDate').value = today();
}
async function delStock(id) {
    if (confirm('Anda pasti mahu padam rekod stok ini?')) {
        const { error } = await supabaseClient.from('stocks').delete().eq('id', id);
        if (error) { alert('Gagal memadam.'); console.error(error); }
    }
}
async function addExpense() {
    const form = document.getElementById('addExpenseForm');
    const newExpense = { date: form.querySelector('#exDate').value || today(), type: form.querySelector('#exType').value, amount: +form.querySelector('#exAmt').value || 0, note: form.querySelector('#exNote').value };
    if (newExpense.amount <= 0) { alert('Sila masukkan jumlah.'); return; }
    await supabaseClient.from('expenses').insert([newExpense]);
    form.reset(); form.querySelector('#exDate').value = today();
}
async function delExpense(id) {
    if (confirm('Anda pasti mahu padam rekod modal ini?')) {
        const { error } = await supabaseClient.from('expenses').delete().eq('id', id);
        if (error) { alert('Gagal memadam.'); console.error(error); }
    }
}
async function addClient() {
    const form = document.getElementById('addClientForm');
    const newClient = { name: form.querySelector('#clName').value, cat: form.querySelector('#clCat').value, p14: +form.querySelector('#clP14').value || 0, p12: +form.querySelector('#clP12').value || 0, pi: +form.querySelector('#clPI').value || 0 };
    if (!newClient.name) { alert('Nama pelanggan wajib diisi.'); return; }
    await supabaseClient.from('clients').insert([newClient]);
    form.reset();
}
async function delClient(id) {
    if (confirm('Anda pasti?')) {
        const { error } = await supabaseClient.from('clients').delete().eq('id', id);
        if (error) { 
            // Paparkan mesej ralat sebenar di dalam alert
            alert('Sila Tunggu Sebentar'); 
            console.error(error);
        }
    }
}
async function addSale() {
    const form = document.getElementById('addSaleForm');
    const clientName = form.querySelector('#slClient').value;
    if (!clientName) { alert('Sila pilih pelanggan.'); return; }
    const clientData = ALL_CLIENTS.find(c => c.name === clientName);
    if (!clientData) { alert('Pelanggan tidak ditemui.'); return; }
    const newSale = {
        date: form.querySelector('#slDate').value || today(), client_name: clientName,
        q14: +form.querySelector('#slQ14').value || 0, paid14: +form.querySelector('#slPaid14').value || 0,
        q12: +form.querySelector('#slQ12').value || 0, paid12: +form.querySelector('#slPaid12').value || 0,
        qi: +form.querySelector('#slQI').value || 0, paidI: +form.querySelector('#slPaidI').value || 0,
        price14: clientData.p14, price12: clientData.p12, priceI: clientData.pi,
        payType: form.querySelector('#slPayType').value, remark: form.querySelector('#slRemark').value
    };
    if (newSale.q12 + newSale.q14 + newSale.qi <= 0) { alert('Sila masukkan sekurang-kurangnya satu tong.'); return; }
    if (newSale.paid14 > newSale.q14 || newSale.paid12 > newSale.q12 || newSale.paidI > newSale.qi) { alert('Tong dibayar tidak boleh melebihi total tong.'); return; }
    const paidAmount = ((newSale.paid12||0) * newSale.price12) + ((newSale.paid14||0) * newSale.price14) + ((newSale.paidI||0) * newSale.priceI);
    if (paidAmount > 0) {
        await supabaseClient.from('payments').insert([{ date: newSale.date, client_name: newSale.client_name, amount: paidAmount, method: newSale.payType, note: `Bayaran semasa jualan. ${newSale.remark}`.trim() }]);
    }
    await supabaseClient.from('sales').insert([newSale]);
    form.reset(); form.querySelector('#slDate').value = today(); calcSale();
}
async function delSale(id) {
    if (confirm('Anda pasti mahu padam rekod jualan ini?')) {
        const { error } = await supabaseClient.from('sales').delete().eq('id', id);
        if (error) { alert('Gagal memadam.'); console.error(error); }
    }
}
async function addDebtPayment() {
    const form = document.getElementById('payDebtForm');
    const clientName = form.querySelector('#debtClient').value;
    if (!clientName) { alert('Sila pilih pelanggan.'); return; }
    const clientData = ALL_CLIENTS.find(c => c.name === clientName);
    if (!clientData) { alert('Pelanggan tidak ditemui.'); return; }
    const q14 = +form.querySelector('#payQ14').value || 0; const q12 = +form.querySelector('#payQ12').value || 0; const qi = +form.querySelector('#payQI').value || 0;
    const amount = (q14 * clientData.p14) + (q12 * clientData.p12) + (qi * clientData.pi);
    if (amount <= 0) { alert('Sila masukkan sekurang-kurangnya satu tong yang dibayar.'); return; }
    const newPayment = { date: today(), client_name: clientName, q14, q12, qi, amount, method: form.querySelector('#debtMethod').value, note: form.querySelector('#payNote').value };
    await supabaseClient.from('payments').insert([newPayment]);
    form.reset(); document.getElementById('debtInfo').innerHTML = 'Pilih pelanggan untuk lihat baki hutang.';
}
async function addPayroll() {
    const form = document.getElementById('addPayrollForm');
    const newPayroll = { date: form.querySelector('#pgDate').value || today(), name: form.querySelector('#pgName').value, amount: +form.querySelector('#pgAmt').value || 0, note: form.querySelector('#pgNote').value };
    if(newPayroll.amount <= 0 || !newPayroll.name) { alert('Sila isi nama dan jumlah gaji.'); return; }
    await supabaseClient.from('payrolls').insert([newPayroll]);
    form.reset(); form.querySelector('#pgDate').value = today();
}
async function delPayroll(id) {
    if (confirm('Anda pasti mahu padam rekod gaji ini?')) {
        const { error } = await supabaseClient.from('payrolls').delete().eq('id', id);
        if (error) { alert('Gagal memadam.'); console.error(error); }
    }
}
async function deleteAllData() {
    if (prompt('AWAS! Ini akan memadam SEMUA data dari database. Taip "PADAM SEMUA" untuk sahkan.') !== 'PADAM SEMUA') {
        alert('Operasi dibatalkan.'); return;
    }
    try {
        await supabaseClient.from('stocks').delete().gt('id', -1); await supabaseClient.from('sales').delete().gt('id', -1);
        await supabaseClient.from('expenses').delete().gt('id', -1); await supabaseClient.from('payrolls').delete().gt('id', -1);
        await supabaseClient.from('payments').delete().gt('id', -1); await supabaseClient.from('clients').delete().gt('id', -1);
        alert('Semua data telah berjaya dipadam.');
    } catch (error) { alert('Gagal memadam semua data.'); }
}
function downloadCSV(filename, data, headers) {
    const processRow = row => headers.map(header => JSON.stringify(row[header.toLowerCase().replace(/\s+/g, '_')] || '')).join(',');
    const csvContent = [headers.join(','), ...data.map(processRow)].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}
function printReceipt(saleId) {
    const s = ALL_SALES.find(x => x.id === saleId); if (!s) return;
    const total = (s.q12 * s.price12) + (s.q14 * s.price14) + (s.qi * s.priceI);
    const paid  = ((s.paid12||0) * s.price12) + ((s.paid14||0) * s.price14) + ((s.paidI||0) * s.priceI);
    const receiptHTML = `
    <div id="receipt">
      <div style="text-align:center; font-weight:bold; font-size:16px;">Tanjung Homemade Creative</div>
      <div style="text-align:center; font-size:10px; line-height:1.2;">lot633 jalan guchil bayam, 15200 kota bharu<br>Tel: 01161096469 | SSM: KT0299501-M</div>
      <hr style="border:0; border-top: 1px dashed black;">
      <div style="font-size:12px;">
        <div>No.: INV-${String(s.id).slice(0, 6).toUpperCase()}</div>
        <div>Date: ${new Date(s.date).toLocaleDateString('ms-MY')}</div>
        <div>Customer: ${s.client_name}</div>
      </div>
      <hr style="border:0; border-top: 1px dashed black;">
      <table style="width:100%; font-size:11px; border-collapse:collapse; text-align:left;">
        <thead><tr><th>Item</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Price</th><th style="text-align:right;">Amount</th></tr></thead>
        <tbody>
          ${s.q14 > 0 ? `<tr><td>Gas 14KG</td><td style="text-align:center;">${s.q14}</td><td style="text-align:right;">${fmt(s.price14)}</td><td style="text-align:right;">${fmt(s.q14 * s.price14)}</td></tr>` : ''}
          ${s.q12 > 0 ? `<tr><td>Gas 12KG</td><td style="text-align:center;">${s.q12}</td><td style="text-align:right;">${fmt(s.price12)}</td><td style="text-align:right;">${fmt(s.q12 * s.price12)}</td></tr>` : ''}
          ${s.qi > 0 ? `<tr><td>Gas IND</td><td style="text-align:center;">${s.qi}</td><td style="text-align:right;">${fmt(s.priceI)}</td><td style="text-align:right;">${fmt(s.qi * s.priceI)}</td></tr>` : ''}
        </tbody>
      </table>
      <hr style="border:0; border-top: 1px dashed black;">
      <div style="margin-top:6px; font-size:12px; text-align:right;">Total: RM ${fmt(total)}<br>Paid: RM ${fmt(paid)}<br><b>Balance: RM ${fmt(total - paid)}</b></div>
      <hr style="border:0; border-top: 1px dashed black;">
      <div style="text-align:center; font-size:11px; margin-top:6px;">Thank You</div>
    </div>`;
    
    const printContainer = document.querySelector('.print-container');
    printContainer.innerHTML = receiptHTML;

    // Panggil print() serta-merta
    window.print();

    // HANYA lengahkan proses membersihkan resit selepas 0.5 saat
    setTimeout(() => {
        printContainer.innerHTML = '';
    }, 500);
}

// ==================
// FUNGSI CARIAN KHAS
// ==================
function showClientResults(filter = '', resultsId, onSelect, clientList) {
    const resultsContainer = document.getElementById(resultsId);
    const clientInput = resultsContainer.previousElementSibling;
    const searchTerm = filter.toLowerCase();
    if (!searchTerm && document.activeElement !== clientInput) {
        resultsContainer.style.display = 'none'; return;
    }
    const filteredClients = clientList.filter(client => 
        client.name.toLowerCase().includes(searchTerm) || 
        (client.cat && client.cat.toLowerCase().includes(searchTerm))
    );
    if (filteredClients.length === 0) { resultsContainer.style.display = 'none'; return; }
    resultsContainer.innerHTML = filteredClients.map(client => 
        `<div class="search-results-item" onclick="${onSelect.name}('${client.name}')">
            ${client.name} <span style="color: var(--text-secondary); font-size: 0.8em;">(${client.cat || 'Tiada Kategori'})</span>
        </div>`
    ).join('');
    resultsContainer.style.display = 'block';
}
function selectClient(name) {
    document.getElementById('slClient').value = name;
    document.getElementById('client-search-results').style.display = 'none';
    calcSale();
}
function selectDebtClient(name) {
    document.getElementById('debtClient').value = name;
    document.getElementById('debt-client-search-results').style.display = 'none';
    document.getElementById('debtClient').dispatchEvent(new Event('input'));
}

// ==================
// SETUP PERMULAAN
// ==================
function setupUIListeners() {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${btn.dataset.view}`).classList.add('active');
    }));
    const toggleBtn = document.getElementById('toggleRecordsBtn');
    toggleBtn.addEventListener('click', () => {
        const isHidden = document.body.classList.toggle('records-hidden');
        toggleBtn.textContent = isHidden ? 'Tunjuk Rekod' : 'Sembunyi Rekod';
    });
    document.getElementById('addStock').addEventListener('click', addStock);
    document.getElementById('addExpense').addEventListener('click', addExpense);
    document.getElementById('addClient').addEventListener('click', addClient);
    document.getElementById('addSale').addEventListener('click', addSale);
    document.getElementById('btnPayDebt').addEventListener('click', addDebtPayment);
    document.getElementById('addPayroll').addEventListener('click', addPayroll);
    document.getElementById('savePIN').addEventListener('click', () => {
        const newPin = document.getElementById('setPIN').value;
        if (newPin) { setPIN(newPin); alert('PIN baru telah disimpan.'); }
        else { alert('PIN tidak boleh kosong.'); }
    });
    document.getElementById('deleteAllDataBtn').addEventListener('click', deleteAllData);
    document.getElementById('resetAllSalesBtn').addEventListener('click', async () => {
        if(prompt('AWAS! Ini akan memadam semua Jualan dan Bayaran. Taip "PADAM JUALAN" untuk sahkan.') === 'PADAM JUALAN') {
            await supabaseClient.from('sales').delete().gt('id', -1);
            await supabaseClient.from('payments').delete().gt('id', -1);
        }
    });
     document.getElementById('resetCounterBtn').addEventListener('click', () => {
        if(confirm('Anda pasti mahu reset kiraan "Terjual" kepada 0?')){
            COUNTERS.soldAtReset.q12 = ALL_SALES.reduce((sum, s) => sum + (s.q12 || 0), 0);
            COUNTERS.soldAtReset.q14 = ALL_SALES.reduce((sum, s) => sum + (s.q14 || 0), 0);
            COUNTERS.soldAtReset.qi = ALL_SALES.reduce((sum, s) => sum + (s.qi || 0), 0);
            saveCounters();
            recomputeSummary();
            alert('Kiraan "Terjual" telah direset.');
        }
    });
    document.getElementById('exportSalesCsv').addEventListener('click', () => downloadCSV(`Jualan_${today()}.csv`, ALL_SALES, ['date', 'client_name', 'q14', 'paid14', 'q12', 'paid12', 'qi', 'paidI', 'price14', 'price12', 'priceI', 'payType']));
    document.getElementById('exportStocksCsv').addEventListener('click', () => downloadCSV(`Stok_${today()}.csv`, ALL_STOCKS, ['date', 'note', 'batch', 'q14', 'c14', 'q12', 'c12', 'qi', 'ci']));
    document.getElementById('exportExpensesCsv').addEventListener('click', () => {
        const allExpenses = [...ALL_EXPENSES.map(e => ({...e, 'jenis_rekod': 'Modal Lain'})), ...ALL_PAYROLLS.map(p => ({...p, 'jenis_rekod': 'Gaji'}))];
        downloadCSV(`Perbelanjaan_${today()}.csv`, allExpenses, ['date', 'jenis_rekod', 'name', 'type', 'amount', 'note']);
    });
    const slClientInput = document.getElementById('slClient');
    slClientInput.addEventListener('input', (e) => showClientResults(e.target.value, 'client-search-results', selectClient, ALL_CLIENTS));
    slClientInput.addEventListener('focus', (e) => showClientResults('', 'client-search-results', selectClient, ALL_CLIENTS));
    const debtClientInput = document.getElementById('debtClient');
    debtClientInput.addEventListener('input', (e) => {
        const debtClients = ALL_CLIENTS.filter(c => computeClientDebt(c.name).rm > 0);
        showClientResults(e.target.value, 'debt-client-search-results', selectDebtClient, debtClients);
    });
    debtClientInput.addEventListener('focus', (e) => {
        const debtClients = ALL_CLIENTS.filter(c => computeClientDebt(c.name).rm > 0);
        showClientResults('', 'debt-client-search-results', selectDebtClient, debtClients);
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            document.getElementById('client-search-results').style.display = 'none';
            document.getElementById('debt-client-search-results').style.display = 'none';
        }
    });
    document.getElementById('debtClient').addEventListener('input', (e) => {
        const clientName = e.target.value;
        const debtInfo = document.getElementById('debtInfo');
        if (!clientName || !ALL_CLIENTS.find(c => c.name === clientName)) {
             debtInfo.innerHTML = 'Pilih pelanggan yang sah untuk lihat baki hutang.'; 
             return;
        }
        const debt = computeClientDebt(clientName);
        debtInfo.innerHTML = `Baki hutang: <b>RM ${fmt(debt.rm)}</b> | Tong (14/12/I): <b>${debt.q14}/${debt.q12}/${debt.qi}</b>`;
    });
    ['slClient', 'slQ14', 'slPaid14', 'slQ12', 'slPaid12', 'slQI', 'slPaidI'].forEach(id => document.getElementById(id).addEventListener('input', calcSale));
    document.getElementById('btnAdminLogin').addEventListener('click', () => {
        if (document.getElementById('adminPIN').value === getPIN()) {
            document.getElementById('adminLogin').style.display = 'none';
            document.getElementById('adminArea').style.display = 'block';
        } else { alert('PIN salah'); }
    });
    ['stDate', 'exDate', 'slDate', 'pgDate'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = today(); });
    const themeBtn = document.getElementById('themeBtn');
    const currentTheme = localStorage.getItem(THEME_KEY) || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    themeBtn.onclick = () => {
        const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem(THEME_KEY, newTheme);
    };
}

function calcSale(){
    const client = ALL_CLIENTS.find(c => c.name === document.getElementById('slClient').value);
    if(!client) { document.getElementById('slCalc').innerHTML = 'Pilih pelanggan yang sah.'; return; }
    const q14 = +document.getElementById('slQ14').value || 0, paid14 = +document.getElementById('slPaid14').value || 0;
    const q12 = +document.getElementById('slQ12').value || 0, paid12 = +document.getElementById('slPaid12').value || 0;
    const qi = +document.getElementById('slQI').value || 0, paidI = +document.getElementById('slPaidI').value || 0;
    
    const totalSale = (q14 * client.p14) + (q12 * client.p12) + (qi * client.pi);
    const totalPaid = (paid14 * client.p14) + (paid12 * client.p12) + (paidI * client.pi);
    const debt = totalSale - totalPaid;

    document.getElementById('slCalc').innerHTML = `Jumlah Jualan: <b>RM ${fmt(totalSale)}</b><br>Jumlah Dibayar: <b>RM ${fmt(totalPaid)}</b><br>Baki Hutang: <b>RM ${fmt(debt)}</b>`;
}

function listenToDatabaseChanges() {
    console.log('Mula mendengar perubahan database secara realtime...');
    const subscription = supabaseClient
        .channel('public-tables')
        .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
            console.log('Perubahan diterima!', payload);
            renderAll();
        })
        .subscribe();
}

document.addEventListener('DOMContentLoaded', () => {
    loadCounters();
    setupUIListeners();
    renderAll();
    listenToDatabaseChanges();
});

//nak ubah semua form input dari value 0 kepada null. Supaya user senang nak keyin