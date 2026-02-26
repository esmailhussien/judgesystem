const API_URL = 'https://judge.olivesom3a.workers.dev/?token=MySuperSecretKey2024';
let allJudgesData = [], currentSuggestions = [], isSaving = false, tournamentsHistory = [];
let currentRole = null, currentLoggedInJudge = null;
let nomMode = 'auto'; // للترشيح
let currentDistribution = [], currentDistCourtsCount = 1, currentDistTournament = '';

function createEl(tag, className, innerHTML = '') { const el = document.createElement(tag); if (className) el.className = className; if (innerHTML) el.innerHTML = innerHTML; return el; }

function initApp() { document.getElementById('login-view').style.display = 'flex'; }

// --- محرك الطباعة الجذري ضد الورقة البيضاء ---
let isPrinting = false; let currentPrintTargetId = null; let currentPrintWasHidden = false;

function executePrint(elementId, wasHidden) {
    if (isPrinting) return; isPrinting = true;
    currentPrintTargetId = elementId; currentPrintWasHidden = wasHidden;
    const el = document.getElementById(elementId);
    el.classList.add('print-target'); if (wasHidden) el.classList.remove('hidden', 'no-print');
    document.querySelectorAll('.app-view').forEach(v => v.style.display = 'none'); document.getElementById('login-view').style.display = 'none';
    setTimeout(() => { window.print(); }, 600);
}

function cleanupPrintState() {
    if (!isPrinting) return; isPrinting = false;
    if (currentPrintTargetId) { const el = document.getElementById(currentPrintTargetId); if (el) { el.classList.remove('print-target'); if (currentPrintWasHidden) el.classList.add('hidden', 'no-print'); } }
    currentPrintTargetId = null;
    if (currentRole === 'admin') document.getElementById('admin-view').style.display = 'block'; else if (currentRole === 'referee') document.getElementById('referee-view').style.display = 'block'; else document.getElementById('login-view').style.display = 'flex';
}
window.addEventListener('afterprint', cleanupPrintState);
window.addEventListener('focus', () => { if (isPrinting) setTimeout(cleanupPrintState, 1500); });

// --- Auth ---
async function handleLogin(e) {
    e.preventDefault();
    const user = document.getElementById('loginUser').value.trim(); const pass = document.getElementById('loginPass').value.trim();
    const btn = document.getElementById('loginBtn'); btn.innerHTML = '<i class="ri-loader-4-line animate-spin align-middle text-xl"></i> جاري التحقق...'; btn.disabled = true;

    try {
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'login', data: { username: user, password: pass } }) });
        const textData = await response.text(); let res; try { res = JSON.parse(textData); } catch (e) { throw new Error("استجابة غير صالحة من السيرفر."); }

        if (res.status === 'success') {
            currentRole = res.data.role; document.getElementById('login-view').style.display = 'none';
            if (currentRole === 'admin') {
                document.getElementById('admin-view').style.display = 'block'; showAdminScreen('dashboard'); loadAllJudgesForManual();
            } else if (currentRole === 'referee') {
                currentLoggedInJudge = res.data.info;
                document.getElementById('referee-view').style.display = 'block';
                document.getElementById('refUserName').innerText = currentLoggedInJudge.Name; document.getElementById('refUserCat').innerText = `حكم ${currentLoggedInJudge.Category}`;
                document.getElementById('refUserPhoto').src = currentLoggedInJudge.Photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentLoggedInJudge.Name)}&background=fff&color=137fec`;
                loadMyInvitations();
            }
        } else { Swal.fire('خطأ', res.message, 'error'); }
    } catch (error) { Swal.fire('فشل الاتصال', error.message, 'error'); } finally { btn.innerHTML = 'دخول للمنصة'; btn.disabled = false; }
}
function logout() { location.reload(); }

function showAdminScreen(id) {
    document.querySelectorAll('.admin-section').forEach(d => d.classList.add('hidden'));
    document.querySelectorAll('#admin-view header .nav-btn').forEach(btn => { btn.classList.remove('is-active', 'text-blue-600'); btn.classList.add('text-slate-600'); });
    const activeTopBtn = document.getElementById(`btn-admin-${id}`); if (activeTopBtn) { activeTopBtn.classList.add('is-active', 'text-blue-600'); activeTopBtn.classList.remove('text-slate-600'); }
    document.querySelectorAll('#admin-view .nav__item').forEach(btn => { btn.classList.remove('is-active', 'text-primary'); btn.classList.add('text-slate-400'); });
    const activeBotBtn = document.getElementById(`nav-admin-${id}`); if (activeBotBtn) { activeBotBtn.classList.add('is-active', 'text-primary'); activeBotBtn.classList.remove('text-slate-400'); }
    document.getElementById(`admin-screen-${id}`).classList.remove('hidden');
    if (id === 'dashboard') loadDashboard(); if (id === 'database') loadAllJudges(); if (id === 'records') loadRecords();
}

async function loadDashboard() {
    try {
        const res = await fetch(`${API_URL}&action=getDashboardStats`).then(r => r.json());
        if (res.status === 'success') { document.getElementById('kpi-total').innerText = res.data.total; document.getElementById('kpi-active').innerText = res.data.active; document.getElementById('kpi-inactive').innerText = res.data.inactive; document.getElementById('kpi-pending').innerText = res.data.pendingNoms; }
    } catch (e) { }
}

// --- Nominate (Auto/Manual) ---
function setNomMode(mode) {
    nomMode = mode;
    currentSuggestions = [];
    renderSuggestions();
    document.getElementById('resultsWrapper').classList.add('hidden');

    const btnAuto = document.getElementById('btn-mode-auto');
    const btnManual = document.getElementById('btn-mode-manual');

    // Active button: filled background, white text, shadow
    const activeClasses = ['bg-primary', 'text-white', 'shadow-md'];
    // Inactive button: transparent background, muted text
    const inactiveClasses = ['text-slate-600', 'hover:bg-white/80'];

    if (mode === 'auto') {
        btnAuto.className = `px-8 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeClasses.join(' ')}`;
        btnManual.className = `px-8 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${inactiveClasses.join(' ')}`;
        document.getElementById('auto-section').classList.remove('hidden');
        document.getElementById('manual-section').classList.add('hidden');
        document.getElementById('totalJudgesWrapper').classList.remove('hidden');
    } else {
        btnManual.className = `px-8 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeClasses.join(' ')}`;
        btnAuto.className = `px-8 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${inactiveClasses.join(' ')}`;
        document.getElementById('auto-section').classList.add('hidden');
        document.getElementById('manual-section').classList.remove('hidden');
        document.getElementById('totalJudgesWrapper').classList.add('hidden');
    }
}

async function getSuggestions() {
    const tournament = document.getElementById('tournamentName').value.trim();
    const totalJudges = parseInt(document.getElementById('totalJudges').value) || 0;
    const c_dwali = parseInt(document.getElementById('c_dwali').value) || 0, c_kari = parseInt(document.getElementById('c_kari').value) || 0, c_oula = parseInt(document.getElementById('c_oula').value) || 0, c_thania = parseInt(document.getElementById('c_thania').value) || 0, c_thalitha = parseInt(document.getElementById('c_thalitha').value) || 0;
    if (!tournament || totalJudges <= 0) return Swal.fire('تنبيه', 'استكمل البيانات', 'warning');
    if ((c_dwali + c_kari + c_oula + c_thania + c_thalitha) !== totalJudges) return Swal.fire('خطأ', 'مجموع الفئات لا يساوي العدد الكلي.', 'error');

    Swal.fire({ title: 'جاري التوليد...', didOpen: () => Swal.showLoading() });
    try {
        const res = await fetch(`${API_URL}&action=getSmartSuggestions&c_dwali=${c_dwali}&c_kari=${c_kari}&c_oula=${c_oula}&c_thania=${c_thania}&c_thalitha=${c_thalitha}`).then(r => r.json());
        if (res.status === 'success') {
            currentSuggestions = res.data; renderSuggestions(); document.getElementById('resultsWrapper').classList.remove('hidden'); Swal.close();
        }
    } catch (e) { }
}

function addManualJudge() {
    const val = document.getElementById('manualJudgeSearch').value.trim();
    if (!val) return;
    const judge = allJudgesData.find(j => `${j.Name} (${j.Category})` === val);
    if (!judge) return Swal.fire('تنبيه', 'الحكم غير موجود', 'error');
    if (currentSuggestions.find(j => j.JudgeID === judge.JudgeID)) return Swal.fire('تنبيه', 'تمت إضافته مسبقاً', 'warning');

    currentSuggestions.push(judge); renderSuggestions();
    document.getElementById('resultsWrapper').classList.remove('hidden');
    document.getElementById('manualJudgeSearch').value = '';
}

function removeDraftJudge(index) {
    currentSuggestions.splice(index, 1); renderSuggestions();
    if (currentSuggestions.length === 0) document.getElementById('resultsWrapper').classList.add('hidden');
}

function renderSuggestions() {
    document.getElementById('draftCount').innerText = currentSuggestions.length;
    document.getElementById('suggestionsArea').innerHTML = currentSuggestions.map((j, i) => `
                <div class="bg-white p-3 rounded-xl border flex justify-between items-center shadow-sm">
                    <div><h5 class="font-bold text-sm text-slate-700">${j.Name}</h5><span class="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">${j.Category}</span></div>
                    ${nomMode === 'manual' ? `<button onclick="removeDraftJudge(${i})" class="text-red-500 hover:bg-red-50 p-1 rounded-lg"><i class="ri-delete-bin-line text-[18px]"></i></button>` : ''}
                </div>`).join('');
}

async function saveFinalList() {
    if (isSaving || currentSuggestions.length === 0) return;
    const tournament = document.getElementById('tournamentName').value.trim();
    const tDate = document.getElementById('tournamentDate').value;
    const tPlace = document.getElementById('tournamentPlace').value.trim();
    const tDesc = document.getElementById('tournamentDesc').value.trim();

    if (!tournament || !tDate || !tPlace) return Swal.fire('تنبيه', 'أدخل اسم وتاريخ ومكان البطولة أولاً', 'warning');

    const confirmedList = currentSuggestions.map(j => ({ id: j.JudgeID, name: j.Name, category: j.Category }));
    const { isConfirmed } = await Swal.fire({ title: 'إرسال الدعوات', text: 'سيتم إرسال دعوات للحكام المختارين في حساباتهم (ومدة الصلاحية 12 ساعة).', icon: 'question', showCancelButton: true, confirmButtonText: 'إرسال الآن' });
    if (!isConfirmed) return;
    isSaving = true; Swal.showLoading();
    try {
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'saveFinalList', data: { tournament, tDate, tPlace, tDesc, confirmed: confirmedList, apologized: [] } }) }).then(r => r.json());
        if (res.status === 'success') {
            Swal.fire('تم الإرسال', 'تم الإرسال بنجاح. تابع الردود من شاشة السجلات.', 'success');
            document.getElementById('resultsWrapper').classList.add('hidden');
            document.getElementById('tournamentName').value = '';
            document.getElementById('tournamentDate').value = '';
            document.getElementById('tournamentPlace').value = '';
            document.getElementById('tournamentDesc').value = '';
            currentSuggestions = [];
        }
    } catch (e) { } finally { isSaving = false; }
}

// --- Records & Courts Distribution ---
async function loadRecords() {
    document.getElementById('recordsArea').innerHTML = '<div class="text-center p-6"><i class="ri-loader-4-line animate-spin text-primary text-3xl"></i></div>';
    try {
        const res = await fetch(`${API_URL}&action=getTournamentsHistory`).then(r => r.json());
        if (res.status === 'success') { tournamentsHistory = res.data; renderRecords(tournamentsHistory); }
    } catch (e) { document.getElementById('recordsArea').innerHTML = '<div class="text-center text-red-500">فشل التحميل</div>'; }
}

function filterRecords() {
    const text = document.getElementById('searchTournamentHistory').value.toLowerCase();
    const filtered = tournamentsHistory.filter(t => t.tournament.toLowerCase().includes(text));
    renderRecords(filtered);
}

function renderRecords(data) {
    const area = document.getElementById('recordsArea'); area.innerHTML = '';
    if (data.length === 0) { area.innerHTML = `<div class="text-center text-slate-500 p-6">لا توجد بطولات</div>`; return; }

    data.forEach(t => {
        const card = createEl('div', 'bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md');
        const head = createEl('div', 'flex justify-between items-center border-b border-slate-100 pb-3 mb-3');
        head.innerHTML = `<h3 class="font-bold text-lg text-slate-800 flex items-center gap-2"><i class="ri-trophy-line text-primary"></i> ${t.tournament}</h3><span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">${t.date}</span>`;
        card.appendChild(head);

        const body = createEl('div', 'space-y-3');
        if (t.confirmed.length > 0) body.innerHTML += `<div><h4 class="text-xs font-bold text-green-600 mb-1">تم التعيين (${t.confirmed.length}):</h4><div class="flex flex-wrap">${t.confirmed.map(j => `<span class="inline-block bg-green-50 text-green-700 text-[11px] font-bold px-2 py-1 rounded border border-green-100 m-0.5">${j.name} (${j.cat})</span>`).join('')}</div></div>`;
        if (t.pending.length > 0) body.innerHTML += `<div class="pt-2 border-t border-slate-50"><h4 class="text-xs font-bold text-orange-500 mb-1">دعوات بالانتظار (${t.pending.length}):</h4><div class="flex flex-wrap">${t.pending.map(j => `<span class="inline-block bg-orange-50 text-orange-700 text-[11px] font-bold px-2 py-1 rounded border border-orange-100 m-0.5">${j.name} (${j.cat})</span>`).join('')}</div></div>`;
        if (t.apologized.length > 0) body.innerHTML += `<div class="pt-2 border-t border-slate-50"><h4 class="text-xs font-bold text-red-500 mb-1">اعتذارات/انتهاء المهلة (${t.apologized.length}):</h4><div class="flex flex-wrap">${t.apologized.map(j => `<span class="inline-block bg-red-50 text-red-700 text-[11px] font-bold px-2 py-1 rounded border border-red-100 m-0.5">${j.name} (${j.cat})</span>`).join('')}</div></div>`;
        card.appendChild(body);

        if (t.confirmed.length > 0) {
            const actionsDiv = createEl('div', 'flex justify-end mt-4 pt-3 border-t border-slate-100');
            const distBtn = createEl('button', 'bg-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-black transition-colors shadow-md', '<i class="ri-file-list-3-line text-[18px]"></i> توزيع الملاعب والطباعة');
            distBtn.onclick = () => startCourtDistribution(t.tournament);
            actionsDiv.appendChild(distBtn); card.appendChild(actionsDiv);
        }
        area.appendChild(card);
    });
}

async function startCourtDistribution(tName) {
    const tourney = tournamentsHistory.find(t => t.tournament === tName);
    const { value: courtsCountStr } = await Swal.fire({
        title: 'إعداد الملاعب', text: `يوجد ${tourney.confirmed.length} حكام معتمدين للبطولة. أدخل عدد الملاعب لتوزيعهم آلياً:`,
        input: 'number', inputValue: 1, inputAttributes: { min: 1, step: 1 },
        showCancelButton: true, confirmButtonText: 'توزيع الحكام', cancelButtonText: 'إلغاء'
    });

    if (courtsCountStr) {
        currentDistCourtsCount = parseInt(courtsCountStr);
        currentDistTournament = tName;
        currentDistribution = JSON.parse(JSON.stringify(tourney.confirmed));
        currentDistribution.forEach((j, i) => { j.court = (i % currentDistCourtsCount) + 1; });
        document.getElementById('distTournamentName').innerText = tName;
        renderCourtDistribution();
        document.getElementById('courtDistributionModal').classList.remove('hidden');
    }
}

function renderCourtDistribution() {
    const area = document.getElementById('courtDistributionArea'); area.innerHTML = '';
    for (let c = 1; c <= currentDistCourtsCount; c++) {
        let courtJudges = currentDistribution.map((j, idx) => ({ j, idx })).filter(item => item.j.court === c);
        let courtOptions = Array.from({ length: currentDistCourtsCount }, (_, k) => `<option value="${k + 1}" ${k + 1 === c ? 'selected' : ''}>الملعب ${k + 1}</option>`).join('');

        let html = `
                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-6">
                    <h4 class="font-bold text-lg text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center gap-2"><i class="ri-flag-line text-primary"></i> الملعب رقم (${c}) <span class="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded mr-auto">${courtJudges.length} حكام</span></h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        ${courtJudges.map(item => `
                            <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col justify-between">
                                <div class="mb-3">
                                    <h5 class="text-sm font-bold text-slate-800">${item.j.name}</h5>
                                    <span class="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded mt-1 inline-block">${item.j.cat}</span>
                                </div>
                                <div class="flex items-center justify-between border-t border-slate-200 pt-2 gap-2">
                                    <label class="text-[10px] text-slate-500 font-bold shrink-0">نقل إلى:</label>
                                    <div class="relative">
                                        <select onchange="changeDistributionCourt(${item.idx}, this.value)" class="stitch-select-compact appearance-none text-xs border border-slate-300 rounded-lg bg-white py-1.5 outline-none focus:border-primary font-bold text-slate-700 cursor-pointer w-full">
                                            ${courtOptions}
                                        </select>
                                        <i class="ri-arrow-down-s-line absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none"></i>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        area.innerHTML += html;
    }
}

function changeDistributionCourt(index, newCourt) { currentDistribution[index].court = parseInt(newCourt); renderCourtDistribution(); }
function closeCourtDistribution() { document.getElementById('courtDistributionModal').classList.add('hidden'); }

function printCourtDistribution() {
    document.getElementById('printTournamentName').innerText = currentDistTournament;
    let tbody = '';
    if (currentDistCourtsCount === 1) {
        tbody = currentDistribution.map((j, i) => `<tr><td>${i + 1}</td><td><strong>${j.name}</strong></td><td>${j.cat}</td></tr>`).join('');
    } else {
        for (let c = 1; c <= currentDistCourtsCount; c++) {
            let cJudges = currentDistribution.filter(j => j.court === c);
            if (cJudges.length > 0) {
                tbody += `<tr class="court-header"><td colspan="3">الملعب رقم (${c})</td></tr>`;
                tbody += cJudges.map((j, i) => `<tr><td>${i + 1}</td><td><strong>${j.name}</strong></td><td>${j.cat}</td></tr>`).join('');
            }
        }
    }
    document.getElementById('printTableBody').innerHTML = tbody;
    executePrint('printMainListArea', true);
}

// --- Database & Manual Fetch ---
async function loadAllJudgesForManual() {
    try {
        const res = await fetch(`${API_URL}&action=getJudges`).then(r => r.json());
        if (res.status === 'success') {
            allJudgesData = res.data;
            document.getElementById('judgesDatalist').innerHTML = allJudgesData.map(j => `<option value="${j.Name} (${j.Category})">`).join('');
        }
    } catch (e) { }
}

async function loadAllJudges() {
    document.getElementById('allJudgesTableBody').innerHTML = `<tr><td colspan="3" class="text-center p-6"><i class="ri-loader-4-line animate-spin text-primary text-2xl"></i></td></tr>`;
    try {
        const res = await fetch(`${API_URL}&action=getJudges`).then(r => r.json());
        if (res.status === 'success') { allJudgesData = res.data; document.getElementById('judgesDatalist').innerHTML = allJudgesData.map(j => `<option value="${j.Name} (${j.Category})">`).join(''); renderJudgesTable(allJudgesData); }
    } catch (e) { }
}
function filterJudges() {
    const text = document.getElementById('searchJudgeName').value.toLowerCase();
    const cat = document.getElementById('filterCategory').value;
    const filtered = allJudgesData.filter(j => (j.Name.toLowerCase().includes(text)) && (cat === 'all' || j.Category.replace(/ى/g, 'ي').includes(cat.replace(/ى/g, 'ي'))));
    renderJudgesTable(filtered);
}

function renderJudgesTable(data) {
    document.getElementById('allJudgesTableBody').innerHTML = data.map(j => {
        const isActive = (j.Active === true || String(j.Active).toUpperCase() === 'TRUE');
        const statusIcon = isActive ? '<i class="ri-toggle-fill text-green-500 text-2xl leading-none"></i>' : '<i class="ri-toggle-line text-slate-400 text-2xl leading-none"></i>';
        const activeLabel = isActive ? 'نشط' : 'إيقاف';

        return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                <td class="p-4 font-bold text-slate-700">
                    <div class="flex items-center gap-2">
                        <div class="w-2.5 h-2.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-500'} shadow-[0_0_8px_rgba(0,0,0,0.15)] ${isActive ? 'shadow-green-500/50' : 'shadow-red-500/50'}"></div>
                        ${j.Name}
                    </div>
                </td>
                <td class="p-4 text-center">
                    <span class="bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-xs font-bold border border-primary/20 block w-max mx-auto">${j.Category}</span>
                </td>
                <td class="p-4 text-center">
                    <button onclick="openReport('${j.JudgeID}')" class="text-primary bg-blue-50 hover:bg-primary shadow-sm hover:shadow-md hover:shadow-primary/30 hover:text-white p-2.5 rounded-xl transition-all" title="السجل والملف">
                        <i class="ri-eye-line text-xl"></i>
                    </button>
                </td>
                <td class="p-4 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="editJudgeProfileUI('${j.JudgeID}')" class="text-slate-600 bg-slate-100 hover:bg-slate-800 hover:text-white px-3 py-2 rounded-xl transition-all shadow-sm hover:shadow-md border border-slate-200" title="تعديل البيانات">
                            <i class="ri-edit-line text-lg"></i> تعديل
                        </button>
                        <button onclick="toggleJudgeStatusUI('${j.JudgeID}', ${isActive})" class="flex items-center gap-2 ${isActive ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-600 bg-slate-100 border-slate-200'} border px-3 py-1.5 rounded-xl transition-all shadow-sm hover:shadow-md" title="التبديل">
                            ${statusIcon} <span class="text-sm font-bold min-w-[32px]">${activeLabel}</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function toggleJudgeStatusUI(judgeId, currentStatus) {
    const isActive = (currentStatus === true || String(currentStatus).toUpperCase() === 'TRUE');
    const newStatus = !isActive;
    const actionText = newStatus ? "تفعيل" : "إيقاف";

    const { isConfirmed } = await Swal.fire({
        title: `تأكيد ال${actionText}`,
        text: `هل أنت متأكد من ${actionText} حساب هذا الحكم؟`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، متأكد',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: newStatus ? '#10b981' : '#ef4444' // emerald/red
    });

    if (isConfirmed) {
        Swal.fire({ title: 'جاري التحديث...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'toggleJudgeStatus', data: { judgeId: judgeId, status: newStatus } })
            }).then(r => r.json());

            if (res.status === 'success') {
                Swal.fire('تم بنجاح', 'تم تحديث حالة الحكم بنجاح', 'success');
                loadAllJudges();
                loadDashboard(); // Refresh KPI
            } else {
                Swal.fire('خطأ', res.message, 'error');
            }
        } catch (e) { Swal.fire('خطأ', 'حدث خطأ في الاتصال', 'error'); }
    }
}

async function editJudgeProfileUI(judgeId) {
    const judge = allJudgesData.find(j => String(j.JudgeID) === String(judgeId));
    if (!judge) return;

    const { value: formValues } = await Swal.fire({
        title: '<div class="flex items-center gap-2 justify-center"><i class="ri-user-settings-line text-primary border-b-2 border-primary pb-2"></i> تعديل بيانات الحكم</div>',
        html: `
            <div class="text-right space-y-5 text-sm px-2 mt-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                <div>
                    <label class="block font-bold text-slate-700 mb-2">اسم الحكم الرباعي</label>
                    <input id="edit-name" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm" value="${judge.Name || ''}">
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-2">رقم الهاتف (واتساب / تسجيل الدخول)</label>
                    <input id="edit-phone" dir="ltr" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-left transition-all shadow-sm" value="${judge.Phone || ''}">
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-2">الفئة / التصنيف</label>
                    <div class="relative">
                        <select id="edit-category" class="appearance-none w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-white font-bold text-slate-700 transition-all shadow-sm">
                            <option value="دولي" ${judge.Category === 'دولي' ? 'selected' : ''}>دولي</option>
                            <option value="قاري" ${judge.Category === 'قاري' ? 'selected' : ''}>قاري</option>
                            <option value="اولى" ${judge.Category === 'اولى' ? 'selected' : ''}>اولى</option>
                            <option value="ثانية" ${judge.Category === 'ثانية' ? 'selected' : ''}>ثانية</option>
                            <option value="ثالثة" ${judge.Category === 'ثالثة' ? 'selected' : ''}>ثالثة</option>
                        </select>
                        <i class="ri-arrow-down-s-line absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xl"></i>
                    </div>
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-2">رقم الهوية / الرقم القومي</label>
                    <input id="edit-national" dir="ltr" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-left transition-all shadow-sm" value="${judge.NationalID || ''}">
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-2">المؤهل الدراسي (Educational)</label>
                    <input id="edit-educational" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm" value="${judge.Educational || ''}">
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-2">الدرجة / الحزام (Belt)</label>
                    <input id="edit-belt" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm" value="${judge.Belt || ''}">
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-2">سنة الحصول على الدرجة</label>
                    <input id="edit-degreeyear" type="number" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm" value="${judge['Year of the degree'] || ''}">
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-2">الوظيفة (Job)</label>
                    <input id="edit-job" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm" value="${judge.Job || ''}">
                </div>
            </div>
            <div class="mt-6 border-t border-slate-200 pt-4 flex justify-between items-center">
                 <button onclick="deleteJudgeUI('${judge.JudgeID}')" class="text-red-500 font-bold hover:bg-red-50 px-4 py-2 rounded-xl transition-all"><i class="ri-delete-bin-line"></i> حذف نهائي</button>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'حفظ التحديثات',
        cancelButtonText: 'إلغاء الأمر',
        confirmButtonColor: '#137fec',
        customClass: { popup: 'rounded-[2rem] p-6 !w-[500px]', confirmButton: 'font-bold px-6 py-3 rounded-xl', cancelButton: 'font-bold px-6 py-3 rounded-xl bg-slate-200 text-slate-700' },
        preConfirm: () => {
            const name = document.getElementById('edit-name').value.trim();
            const phone = document.getElementById('edit-phone').value.trim();
            const nationalId = document.getElementById('edit-national').value.trim();
            if (!name || !phone || !nationalId) {
                Swal.showValidationMessage("الاسم، الهاتف، والرقم القومي إجبارية");
                return false;
            }
            return {
                Name: name,
                Phone: phone,
                Category: document.getElementById('edit-category').value.trim(),
                NationalID: nationalId,
                Educational: document.getElementById('edit-educational').value.trim(),
                Belt: document.getElementById('edit-belt').value.trim(),
                "Year of the degree": document.getElementById('edit-degreeyear').value.trim(),
                Job: document.getElementById('edit-job').value.trim()
            };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'جاري الحفظ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'updateJudgeProfile', data: { judgeId: judgeId, updates: formValues } })
            }).then(r => r.json());

            if (res.status === 'success') {
                Swal.fire('تم بنجاح', 'لقد تم تحديث بيانات الحكم', 'success');
                loadAllJudges();
            } else {
                Swal.fire('خطأ', res.message, 'error');
            }
        } catch (e) { Swal.fire('خطأ', 'حدث خطأ في الاتصال', 'error'); }
    }
}

async function deleteJudgeUI(judgeId) {
    const { isConfirmed } = await Swal.fire({
        title: 'تأكيد الحذف النهائي',
        text: 'هل أنت متأكد من رغبتك في حذف هذا الحكم نهائياً؟ لا يمكن التراجع عن هذا الإجراء.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'تراجع'
    });
    if (isConfirmed) {
        Swal.fire({ title: 'جاري الحذف...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'deleteJudge', data: { judgeId: judgeId } })
            }).then(r => r.json());

            if (res.status === 'success') {
                Swal.fire('تم الحذف', 'تم مسح سجل الحكم بنجاح', 'success');
                loadAllJudges();
                loadDashboard();
            } else {
                Swal.fire('خطأ', res.message, 'error');
            }
        } catch (e) { Swal.fire('خطأ', 'حدث خطأ في الاتصال', 'error'); }
    }
}

async function addNewJudgeUI() {
    const { value: formValues } = await Swal.fire({
        title: '<div class="flex items-center gap-2 justify-center"><i class="ri-user-add-line text-primary border-b-2 border-primary pb-2"></i> إضافة حكم جديد</div>',
        html: `
            <div class="text-right space-y-4 text-sm px-2 mt-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                <div>
                    <label class="block font-bold text-slate-700 mb-2">رقم قيد الحكم (ID فريد) <span class="text-red-500">*</span></label>
                    <input id="add-id" type="number" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm" placeholder="مثال: 1234">
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-2">الاسم الرباعي <span class="text-red-500">*</span></label>
                    <input id="add-name" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm">
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-2">رقم الهاتف <span class="text-red-500">*</span></label>
                    <input id="add-phone" dir="ltr" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-left transition-all shadow-sm">
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-2">الرقم القومي <span class="text-red-500">*</span></label>
                    <input id="add-national" dir="ltr" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-left transition-all shadow-sm">
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-2">الفئة / التصنيف</label>
                    <div class="relative">
                        <select id="add-category" class="appearance-none w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-white font-bold text-slate-700 transition-all shadow-sm">
                            <option value="دولي">دولي</option>
                            <option value="قاري">قاري</option>
                            <option value="اولى" selected>اولى</option>
                            <option value="ثانية">ثانية</option>
                            <option value="ثالثة">ثالثة</option>
                        </select>
                        <i class="ri-arrow-down-s-line absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xl"></i>
                    </div>
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-2">المؤهل الدراسي</label>
                    <input id="add-educational" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-primary outline-none transition-all shadow-sm">
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-2">الدرجة / الحزام</label>
                    <input id="add-belt" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-primary outline-none transition-all shadow-sm">
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-2">سنة الحصول على الدرجة</label>
                    <input id="add-degreeyear" type="number" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-primary outline-none transition-all shadow-sm">
                </div>
                <div>
                    <label class="block font-bold text-slate-700 mb-2">الوظيفة</label>
                    <input id="add-job" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-primary outline-none transition-all shadow-sm">
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'إنشاء ملف الحكم',
        cancelButtonText: 'إلغاء الأمر',
        confirmButtonColor: '#137fec',
        customClass: { popup: 'rounded-[2rem] p-6 !w-[500px]', confirmButton: 'font-bold px-6 py-3 rounded-xl', cancelButton: 'font-bold px-6 py-3 rounded-xl bg-slate-200 text-slate-700' },
        preConfirm: () => {
            const judgeId = document.getElementById('add-id').value.trim();
            const name = document.getElementById('add-name').value.trim();
            const phone = document.getElementById('add-phone').value.trim();
            const nationalId = document.getElementById('add-national').value.trim();
            if (!judgeId || !name || !phone || !nationalId) {
                Swal.showValidationMessage("تم تمييز الحقول الإجبارية (*)");
                return false;
            }
            return {
                JudgeID: judgeId,
                Name: name,
                Phone: phone,
                Category: document.getElementById('add-category').value.trim(),
                NationalID: nationalId,
                Educational: document.getElementById('add-educational').value.trim(),
                Belt: document.getElementById('add-belt').value.trim(),
                "Year of the degree": document.getElementById('add-degreeyear').value.trim(),
                Job: document.getElementById('add-job').value.trim(),
                Active: true
            };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'جاري إنشاء الحكم...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'addJudge', data: { judgeData: formValues } })
            }).then(r => r.json());

            if (res.status === 'success') {
                Swal.fire('تم بنجاح', res.data || 'تم إنشاء الحكم بنجاح', 'success');
                loadAllJudges();
                loadDashboard();
            } else {
                Swal.fire('خطأ', res.message, 'error');
            }
        } catch (e) { Swal.fire('خطأ', 'حدث خطأ في الاتصال', 'error'); }
    }
}

// --- Referee Functions ---
async function loadMyInvitations() {
    const area = document.getElementById('invitationsArea'); area.innerHTML = '<div class="text-center p-8"><i class="ri-loader-4-line animate-spin text-primary text-3xl"></i></div>';
    try {
        const res = await fetch(`${API_URL}&action=getMyInvitations&judgeId=${currentLoggedInJudge.JudgeID}`).then(r => r.json());
        if (res.status === 'success' && res.data.length > 0) {
            area.innerHTML = res.data.map(inv => {
                const isConfirmed = inv.status === 'Confirmed';
                const statusBadge = isConfirmed ? `<div class="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-bl-lg">تم تعيينك رسمياً</div>` : `<div class="absolute top-0 right-0 bg-orange-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-bl-lg">لديك مهلة 12 ساعة للرد</div>`;
                const buttonsHtml = isConfirmed
                    ? `<div class="bg-green-50 text-green-700 p-3 rounded-xl text-center text-sm font-bold border border-green-200">لقد أتممت قبول الدعوة بنجاح. نتمنى لك التوفيق في البطولة!</div>`
                    : `<div class="flex gap-3"><button onclick="respondInvite('${inv.tournament}', 'accept')" class="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-xl transition-all shadow-sm"><i class="ri-checkbox-circle-line align-middle ml-1 text-sm"></i> قبول</button><button onclick="respondInvite('${inv.tournament}', 'decline')" class="flex-1 bg-red-50 hover:bg-red-500 hover:text-white text-red-600 font-bold py-3 rounded-xl transition-all border border-red-200 shadow-sm"><i class="ri-close-circle-line align-middle ml-1 text-sm"></i> اعتذار</button></div>`;
                return `<div class="bg-white p-5 rounded-2xl border-2 ${isConfirmed ? 'border-green-200' : 'border-orange-200'} shadow-md relative overflow-hidden">${statusBadge}
                <h3 class="font-bold text-lg text-slate-800 mt-4 mb-2"><i class="ri-football-line text-primary align-middle ml-1"></i> ${inv.tournament}</h3>
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600 mb-5 space-y-2">
                   <p><i class="ri-calendar-event-line text-primary ml-1"></i> <b>التاريخ:</b> ${inv.tDate || 'غير محدد'}</p>
                   <p><i class="ri-map-pin-line text-primary ml-1"></i> <b>المكان:</b> ${inv.tPlace || 'غير محدد'}</p>
                   ${inv.tDesc ? `<p><i class="ri-sticky-note-line text-primary ml-1"></i> <b>ملاحظة:</b> <span class="text-slate-500">${inv.tDesc}</span></p>` : ''}
                </div>
                ${buttonsHtml}</div>`;
            }).join('');
        } else { area.innerHTML = `<div class="bg-white rounded-3xl p-6 border shadow-sm text-center"><div class="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3"><i class="ri-check-double-line text-3xl text-primary"></i></div><h2 class="font-bold text-lg text-slate-800">لا توجد دعوات حالياً</h2></div>`; }
    } catch (e) { }
}

async function respondInvite(tournament, responseType) {
    const isAccept = responseType === 'accept';
    const { isConfirmed } = await Swal.fire({ title: isAccept ? 'تأكيد القبول' : 'تأكيد الاعتذار', text: isAccept ? 'هل أنت متأكد من قبولك؟' : 'سيتم تسجيل اعتذارك وتعيين حكم بديل. متأكد؟', icon: isAccept ? 'question' : 'warning', showCancelButton: true, confirmButtonText: 'نعم', confirmButtonColor: isAccept ? '#22c55e' : '#ef4444' });
    if (isConfirmed) {
        Swal.fire({ title: 'جاري تسجيل الرد...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'respondToInvitation', data: { tournament: tournament, judgeId: currentLoggedInJudge.JudgeID, response: responseType } }) }).then(r => r.json());
            if (res.status === 'success') { Swal.fire('تم بنجاح', res.data, 'success'); loadMyInvitations(); } else { Swal.fire('خطأ', res.message, 'error'); }
        } catch (e) { }
    }
}

// --- Profile Modal ---
async function openReport(id) {
    Swal.showLoading();
    try {
        const res = await fetch(`${API_URL}&action=getJudgeProfile&id=${id}`).then(r => r.json());
        if (res.status === 'success') {
            const info = res.data.info || {};
            const history = res.data.history || { total: 0, confirmed: [], apologized: [] };

            document.getElementById('r-photo').src = info.Photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(info.Name)}&background=fff&color=137fec`;
            document.getElementById('r-name').innerText = info.Name;
            document.getElementById('r-category').innerText = info.Category;
            document.getElementById('r-nationalId').innerText = info.NationalID;
            document.getElementById('r-phone').innerText = info.Phone;
            document.getElementById('r-belt').innerText = info.Belt;
            document.getElementById('r-assignCount').innerText = history.total || 0;

            let histHtml = '';

            if (history.confirmed && history.confirmed.length > 0) {
                histHtml += `<div class="text-green-600 font-bold mb-2 mt-2 text-xs bg-green-50 p-2 rounded-lg border border-green-100 flex items-center justify-between"><span>التأكيد <i class="ri-check-line"></i></span><span class="bg-white px-2 py-0.5 rounded-full">${history.confirmed.length} مشاركة</span></div>`;
                histHtml += history.confirmed.map(h => `<li class="py-3 border-b border-slate-100 last:border-0">
                  <div class="flex justify-between items-center mb-1">
                    <span class="font-bold flex items-center gap-2"><i class="ri-checkbox-circle-fill text-green-500 text-lg"></i> <span class="break-words line-clamp-1">${h.tournament}</span></span>
                    <span class="text-slate-500 text-[10px] bg-slate-100 px-2 py-1 rounded-md font-bold shrink-0">${h.tDate || h.date}</span>
                  </div>
                  <div class="text-[11px] text-slate-500 pr-7 space-y-1 mt-1 font-medium">
                    <p><i class="ri-map-pin-line ml-1 text-slate-400"></i> ${h.tPlace || 'غير محدد'}</p>
                    ${h.tDesc && h.tDesc !== 'لا يوجد' ? `<p><i class="ri-sticky-note-line ml-1 text-slate-400"></i> ${h.tDesc}</p>` : ''}
                  </div>
                </li>`).join('');
            }

            if (history.apologized && history.apologized.length > 0) {
                histHtml += `<div class="text-red-500 font-bold mt-4 mb-2 text-xs bg-red-50 p-2 rounded-lg border border-red-100 flex items-center justify-between"><span>الاعتذار <i class="ri-close-line"></i></span><span class="bg-white px-2 py-0.5 rounded-full">${history.apologized.length} مرة</span></div>`;
                histHtml += history.apologized.map(h => `<li class="py-3 border-b border-slate-100 last:border-0">
                  <div class="flex justify-between items-center mb-1">
                    <span class="font-bold flex items-center gap-2"><i class="ri-close-circle-fill text-red-500 text-lg"></i> <span class="break-words line-clamp-1">${h.tournament}</span></span>
                    <span class="text-slate-500 text-[10px] bg-slate-100 px-2 py-1 rounded-md font-bold shrink-0">${h.tDate || h.date}</span>
                  </div>
                  <div class="text-[11px] text-slate-500 pr-7 space-y-1 mt-1 font-medium">
                    <p><i class="ri-map-pin-line ml-1 text-slate-400"></i> ${h.tPlace || 'غير محدد'}</p>
                    ${h.tDesc && h.tDesc !== 'لا يوجد' ? `<p><i class="ri-sticky-note-line ml-1 text-slate-400"></i> ${h.tDesc}</p>` : ''}
                  </div>
                </li>`).join('');
            }

            if (!histHtml) histHtml = '<li class="text-center text-slate-400 py-4 font-bold bg-slate-50 rounded-xl border border-slate-100">لا توجد مشاركات أو اعتذارات مسجلة</li>';

            document.getElementById('r-historyList').innerHTML = histHtml;
            document.getElementById('reportModal').classList.remove('hidden');
            Swal.close();
        }
    } catch (e) { }
}
function closeReport() { document.getElementById('reportModal').classList.add('hidden'); }
function printReport() { executePrint('reportModal', false); }

// --- ESC key + backdrop-click to close any open modal ---
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('courtDistributionModal').classList.contains('hidden')) { closeCourtDistribution(); return; }
    if (!document.getElementById('reportModal').classList.contains('hidden')) { closeReport(); return; }
});

// Backdrop click — only fire when the click target IS the backdrop overlay itself
document.getElementById('courtDistributionModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCourtDistribution();
});
document.getElementById('reportModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeReport();
});
