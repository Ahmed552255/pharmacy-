// ===================== استيرادات Firebase =====================
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import {
    getDatabase, ref, onValue, set, push, update, get,
    query, orderByChild, equalTo
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-database.js";

// ===================== تهيئة Firebase =====================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ===================== التخزين المحلي IndexedDB =====================
class LocalDrugDB {
    constructor() {
        this.db = null;
        this.DB_NAME = 'SukunDrugsDB';
        this.STORE_NAME = 'drugs';
        this.VERSION = 1;
    }

    async open() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, this.VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                    store.createIndex('by_name', 'name', { unique: false });
                    store.createIndex('by_form', 'form', { unique: false });
                    store.createIndex('by_frequency', 'frequency', { unique: false });
                }
            };
            req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
            req.onerror = reject;
        });
    }

    async getAllDrugs() {
        const tx = this.db.transaction(this.STORE_NAME, 'readonly');
        const req = tx.objectStore(this.STORE_NAME).getAll();
        return new Promise(resolve => { req.onsuccess = () => resolve(req.result || []); });
    }

    async saveDrugs(drugs) {
        const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
        const store = tx.objectStore(this.STORE_NAME);
        store.clear();
        drugs.forEach(d => store.add(d));
        return new Promise(resolve => { tx.oncomplete = resolve; });
    }

    async addOrUpdateDrug(drug) {
        return new Promise(resolve => {
            const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const getReq = store.get(drug.id);
            getReq.onsuccess = () => {
                const existing = getReq.result;
                if (existing) {
                    existing.frequency = (existing.frequency || 0) + 1;
                    store.put(existing);
                } else {
                    drug.frequency = 1;
                    store.add(drug);
                }
                tx.oncomplete = () => resolve(true);
            };
        });
    }

    async searchDrugs(term, formFilter = null) {
        const all = await this.getAllDrugs();
        const lower = term.toLowerCase();
        let res = all.filter(d => d.name.toLowerCase().includes(lower) ||
                                 (d.genericName && d.genericName.toLowerCase().includes(lower)));
        if (formFilter && formFilter !== 'all') res = res.filter(d => d.form === formFilter);
        res.sort((a, b) => (b.frequency || 0) - (a.frequency || 0) || a.name.localeCompare(b.name));
        return res;
    }
}

const localDB = new LocalDrugDB();

// ===================== مزامنة الأدوية من Firebase =====================
async function syncDrugsFromCloud() {
    try {
        const snap = await get(ref(db, 'drugs'));
        const drugs = snap.exists()
            ? Object.values(snap.val()).map(d => ({ ...d, id: d.id || crypto.randomUUID?.() || Date.now() + '-' + Math.random() }))
            : [];
        await localDB.saveDrugs(drugs);
        return drugs;
    } catch {
        console.warn('تعذر الاتصال بـ Firebase، استخدام المحلي فقط');
        return localDB.getAllDrugs();
    }
}

// ===================== إضافة دواء جديد (محلي + سحابي) =====================
async function addNewDrug(name, form, strength = '') {
    const id = crypto.randomUUID?.() || Date.now() + '-' + Math.random();
    const drug = {
        id, name: name.trim(), genericName: '', form, strength,
        price: null, frequency: 1, createdAt: new Date().toISOString()
    };
    await localDB.addOrUpdateDrug(drug);
    try { await set(ref(db, `drugs/${id}`), drug); } catch {}
    return drug;
}

// ===================== زيادة عداد الاستخدام =====================
async function incrementDrugUsage(name, form) {
    const drugs = await localDB.getAllDrugs();
    const target = drugs.find(d => d.name === name && d.form === form);
    if (target) {
        target.frequency = (target.frequency || 0) + 1;
        await localDB.addOrUpdateDrug(target);
        try { await update(ref(db, `drugs/${target.id}`), { frequency: target.frequency }); } catch {}
    } else {
        await addNewDrug(name, form);
    }
}

// ===================== عناصر واجهة المستخدم =====================
const UI = {
    welcome: document.getElementById('welcomeMessage'),
    queueBtn: document.getElementById('queueModalBtn'),
    queueBadge: document.getElementById('queueBadgeCount'),
    queueModal: document.getElementById('queueModal'),
    closeQueueBtn: document.getElementById('closeQueueModalBtn'),
    queueTabs: document.querySelectorAll('.queue-tab'),
    queueList: document.getElementById('queueModalList'),
    waitingCount: document.getElementById('waitingTabCount'),
    doneCount: document.getElementById('doneTabCount'),
    patientCard: document.getElementById('currentPatientCard'),
    patientNameDisp: document.getElementById('currentPatientNameDisplay'),
    patientAgeDisp: document.getElementById('currentPatientAgeDisplay'),
    patientNameClick: document.getElementById('patientNameClickable'),
    diagnosis: document.getElementById('diagnosisTextarea'),
    emptyRxMsg: document.getElementById('emptyPrescriptionMsg'),
    rxContent: document.getElementById('prescriptionContent'),
    rxItems: document.getElementById('rxItemsContainer'),
    drugSearch: document.getElementById('drugSearchInput'),
    drugSuggestions: document.getElementById('drugSuggestions'),
    formSelect: document.getElementById('drugFormSelect'),
    startAddBtn: document.getElementById('startAddDrugBtn'),
    exchangeBtn: document.getElementById('exchangeModeBtn'),
    dosePanel: document.getElementById('dosePanel'),
    selectedDrug: document.getElementById('selectedDrugDisplay'),
    selectedForm: document.getElementById('selectedFormDisplay'),
    doseNumber: document.getElementById('doseNumberInput'),
    unitLabel: document.getElementById('unitLabel'),
    exchangeInfo: document.getElementById('exchangeInfo'),
    exchangeDrugName: document.getElementById('exchangeDrugName'),
    doseSuggestions: document.getElementById('doseSuggestionsContainer'),
    applyDoseBtn: document.getElementById('applyDoseBtn'),
    cancelDoseBtn: document.getElementById('cancelDoseBtn'),
    finishBtn: document.getElementById('finishBtn'),
    saveTplBtn: document.getElementById('saveTemplateBtn'),
    tplBtn: document.getElementById('templatesBtn'),
    tplModal: document.getElementById('templatesModal'),
    saveTplModal: document.getElementById('saveTemplateModal'),
    tplList: document.getElementById('templatesList'),
    logoutBtn: document.getElementById('logoutBtn')
};

// ===================== الجلسة والمتغيرات العامة =====================
const uid = sessionStorage.getItem('userUid');
const role = sessionStorage.getItem('userRole');
const sessionName = sessionStorage.getItem('userName');
if (!uid || role !== 'doctor') {
    sessionStorage.clear();
    window.location.replace('index.html');
    throw new Error('جلسة غير صالحة');
}

const today = new Date().toISOString().split('T')[0]; // yyyy-mm-dd
let doctor = { name: sessionName || 'طبيب' };
let appointments = [];
let currentApt = null;
let rxItems = [];
let favorites = new Set();
let doseState = { drug: null, form: 'tablet', exchange: false, exchangeDrug: null, quantity: '' };
let queueTab = 'waiting';
let searchTimer;

// ===================== دوال مساعدة =====================
function toast(msg, err = false) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.background = err ? '#B23B3B' : '#4A3B2C';
    t.innerHTML = `<i class="fas ${err ? 'fa-exclamation-triangle' : 'fa-check'}"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function esc(str) { return String(str).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m]); }

async function searchLocal(term, form) {
    if (!term) return [];
    const drugs = await localDB.searchDrugs(term.toLowerCase(), form);
    return drugs.map(d => ({ ...d, isFav: favorites.has(d.name) || d.frequency > 2 }))
                .sort((a, b) => (b.isFav - a.isFav) || (b.frequency || 0) - (a.frequency || 0))
                .slice(0, 15);
}

function updateUnitLabel() {
    const map = { tablet: 'قرص', syrup: 'مل', injection: 'سم', suppository: 'لبوس', drops: 'نقطة' };
    UI.unitLabel.textContent = map[UI.formSelect.value] || '';
}

function resetDosePanel() {
    UI.dosePanel.style.display = 'none';
    doseState = { drug: null, form: 'tablet', exchange: false, exchangeDrug: null, quantity: '' };
    UI.drugSearch.value = '';
    UI.exchangeBtn.style.background = '';
    UI.exchangeInfo.style.display = 'none';
    UI.drugSuggestions.style.display = 'none';
}

// ===================== تحميل بيانات الطبيب =====================
async function loadDoctor() {
    try {
        const snap = await get(ref(db, `users/${uid}`));
        if (snap.exists()) {
            doctor = { ...doctor, ...snap.val() };
            UI.welcome.textContent = `د. ${doctor.name || sessionName}`;
        } else {
            UI.welcome.textContent = `د. ${sessionName}`;
        }
        const favSnap = await get(ref(db, `favorites/${uid}`));
        if (favSnap.exists()) favorites = new Set(Object.values(favSnap.val()));
    } catch (err) {
        toast('تعذر تحميل بعض البيانات', true);
    }
}

// ===================== قائمة الانتظار =====================
function startAppointmentsListener() {
    const q = query(ref(db, 'appointments'), orderByChild('doctorId'), equalTo(uid));
    onValue(q, snap => {
        const all = [];
        snap.forEach(c => {
            const apt = { id: c.key, ...c.val() };
            if (apt.date === today && apt.status !== 'ملغي') all.push(apt);
        });
        all.sort((a, b) => a.time?.localeCompare(b.time || ''));
        appointments = all;
        updateQueueUI();
    }, err => toast('فشل تحميل قائمة الانتظار', true));
}

function updateQueueUI() {
    const waiting = appointments.filter(a => a.status === 'انتظار').length;
    const done = appointments.filter(a => a.status === 'منتهي').length;
    UI.queueBadge.textContent = waiting;
    UI.waitingCount.textContent = waiting;
    UI.doneCount.textContent = done;
    renderQueueList();
}

function renderQueueList() {
    const filtered = appointments.filter(a => queueTab === 'waiting' ? a.status === 'انتظار' : a.status === 'منتهي');
    UI.queueList.innerHTML = filtered.length
        ? filtered.map(a => `<div class="queue-item-modal" data-id="${a.id}"><b>${esc(a.patientName)}</b> - ${a.time} - ${a.age || '--'} سنة ${a.status === 'منتهي' ? '<span style="color:green">✓ تم</span>' : ''}</div>`).join('')
        : '<div class="empty-state">لا يوجد مرضى</div>';
    document.querySelectorAll('.queue-item-modal').forEach(el => el.onclick = () => selectFromQueue(el.dataset.id));
}

async function selectFromQueue(id) {
    const apt = appointments.find(a => a.id === id);
    if (!apt || apt.status === 'منتهي') return;
    if (apt.status === 'انتظار') await update(ref(db, `appointments/${id}`), { status: 'قيد الكشف' });
    currentApt = apt;
    rxItems = [];
    UI.diagnosis.value = '';
    UI.patientCard.style.display = 'flex';
    UI.patientNameDisp.textContent = apt.patientName;
    UI.patientAgeDisp.textContent = `${apt.age || '--'} سنة`;
    UI.emptyRxMsg.style.display = 'none';
    UI.rxContent.style.display = 'block';
    renderRxItems();
    UI.queueModal.style.display = 'none';
}

// ===================== فتح الملف الطبي كصفحة جديدة =====================
UI.patientNameClick.onclick = () => {
    if (!currentApt?.patientId) {
        toast('لا يوجد معرف للمريض', true);
        return;
    }
    const params = new URLSearchParams({
        patientId: currentApt.patientId,
        patientName: currentApt.patientName
    });
    window.open(`patient-file.html?${params.toString()}`, '_blank');
};

// ===================== الروشتة =====================
function renderRxItems() {
    UI.rxItems.innerHTML = rxItems.length
        ? rxItems.map((item, i) => `
            <div class="rx-item">
                <div class="rx-main-row">
                    <div class="rx-drug-info">
                        <span class="rx-drug-name">${esc(item.drug)}</span>
                        <span class="rx-form-badge">${esc(item.form)}</span>
                    </div>
                    <div class="rx-dose-info">
                        <span class="rx-dose-text">${esc(item.dose)}</span>
                        <button class="icon-btn-sm" data-action="remove" data-index="${i}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>`).join('')
        : '<div class="empty-state">لم تُضِف أدوية بعد</div>';

    document.querySelectorAll('[data-action="remove"]').forEach(btn => btn.onclick = () => {
        rxItems.splice(parseInt(btn.dataset.index), 1);
        renderRxItems();
    });
}

// ===================== البحث واقتراح الأدوية =====================
async function showSuggestions(term) {
    const form = UI.formSelect.value;
    const matches = await searchLocal(term, form);
    if (!matches.length) {
        UI.drugSuggestions.innerHTML = `<div class="suggestion-item" id="addNewDrugOption" style="background:#FEF5EC;cursor:pointer"><i class="fas fa-plus-circle" style="color:var(--primary)"></i> إضافة "${esc(term)}" كدواء جديد</div>`;
        UI.drugSuggestions.style.display = 'block';
        document.getElementById('addNewDrugOption').onclick = () => addNewFromSearch(term);
        return;
    }
    UI.drugSuggestions.innerHTML = matches.map(d => {
        const fav = d.isFav ? '<span class="favorites-tag"><i class="fas fa-star"></i> مفضل</span>' : '';
        const formIcon = { tablet:'💊',syrup:'🥄',injection:'💉',suppository:'🧴',drops:'💧' }[d.form] || '💊';
        return `<div class="suggestion-item" data-name="${esc(d.name)}" data-form="${d.form}" data-strength="${esc(d.strength || '')}">
            <div class="suggestion-main"><span class="drug-name">${formIcon} ${esc(d.name)}</span> ${fav} <span class="usage-count">(${d.frequency || 0})</span></div>
        </div>`;
    }).join('');
    UI.drugSuggestions.style.display = 'block';
}

async function addNewFromSearch(name) {
    const form = UI.formSelect.value;
    const drug = await addNewDrug(name, form);
    doseState.drug = drug.name;
    prepareDosePanel();
    toast(`تمت إضافة "${name}"`);
    UI.drugSuggestions.style.display = 'none';
}

UI.drugSearch.oninput = () => {
    clearTimeout(searchTimer);
    const val = UI.drugSearch.value.trim();
    if (!val) return UI.drugSuggestions.style.display = 'none';
    searchTimer = setTimeout(() => showSuggestions(val), 200);
};

UI.drugSuggestions.addEventListener('click', e => {
    const item = e.target.closest('[data-name]');
    if (!item) return;
    doseState.drug = item.dataset.name;
    UI.formSelect.value = item.dataset.form;
    prepareDosePanel();
});

UI.startAddBtn.onclick = () => {
    const val = UI.drugSearch.value.trim();
    if (val) { doseState.drug = val; prepareDosePanel(); }
    else toast('اكتب اسم الدواء أولاً', true);
};

// ===================== لوحة الجرعة =====================
function prepareDosePanel() {
    UI.selectedDrug.textContent = doseState.drug;
    UI.selectedForm.textContent = UI.formSelect.options[UI.formSelect.selectedIndex].text;
    UI.dosePanel.style.display = 'block';
    UI.doseNumber.value = '';
    UI.doseNumber.focus();
    updateUnitLabel();
    generateDoseSuggestions();
}

function loadDosePrefs(drug, form) {
    const key = `dose_${uid}_${drug}_${form}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
}
function saveDosePref(drug, form, dose) {
    const key = `dose_${uid}_${drug}_${form}`;
    let prefs = loadDosePrefs(drug, form).filter(p => p !== dose);
    prefs.unshift(dose);
    localStorage.setItem(key, JSON.stringify(prefs.slice(0, 5)));
}

function generateDoseSuggestions() {
    const qty = UI.doseNumber.value.trim();
    const unit = UI.unitLabel.textContent;
    const drug = doseState.drug;
    const form = UI.formSelect.value;

    let list = loadDosePrefs(drug, form).map(p => ({ text: p, pref: true }));
    if (qty && !isNaN(parseInt(qty))) {
        const base = `${qty} ${unit}`;
        ['يومياً', 'كل 8 ساعات', 'كل 12 ساعة', 'مرة واحدة يومياً', 'عند اللزوم', 'قبل النوم', 'بعد الأكل بساعة'].forEach(t => {
            const text = `${base} ${t}`;
            if (!list.some(l => l.text === text)) list.push({ text, pref: false, timing: t.includes('النوم') ? 'bedtime' : t.includes('بعد الأكل') ? 'after1h' : 'any' });
        });
    }
    if (!list.length) {
        list = [
            { text: `1 ${unit} يومياً`, pref: false, timing: 'any' },
            { text: `1 ${unit} كل 8 ساعات`, pref: false, timing: 'any' },
            { text: `1 ${unit} كل 12 ساعة`, pref: false, timing: 'any' },
            { text: `1 ${unit} مرة واحدة يومياً`, pref: false, timing: 'any' },
            { text: `1 ${unit} قبل النوم`, pref: false, timing: 'bedtime' },
            { text: `1 ${unit} بعد الأكل بساعة`, pref: false, timing: 'after1h' }
        ];
    }

    UI.doseSuggestions.innerHTML = list.slice(0, 7).map((s, i) => {
        const icon = s.timing === 'bedtime' ? '<i class="fas fa-bed"></i>' : s.timing === 'after1h' ? '<i class="fas fa-clock"></i>' : '';
        return `<div class="dose-suggestion-row" data-timing="${s.timing || 'any'}">
            <span>${esc(s.text)} ${icon} ${s.pref ? '<i class="fas fa-history" style="opacity:0.6"></i>' : ''}</span>
            <div>
                <button class="timing-btn-sm" data-timing="before">قبل</button>
                <button class="timing-btn-sm" data-timing="after">بعد</button>
                <button class="timing-btn-sm ${i===0?'active':''}" data-timing="any">عادي</button>
            </div>
        </div>`;
    }).join('');

    document.querySelectorAll('.timing-btn-sm').forEach(btn => btn.onclick = (e) => {
        e.stopPropagation();
        const row = btn.closest('.dose-suggestion-row');
        row.querySelectorAll('.timing-btn-sm').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
}

UI.doseNumber.oninput = generateDoseSuggestions;
UI.formSelect.onchange = () => { updateUnitLabel(); if (UI.drugSearch.value.trim()) showSuggestions(UI.drugSearch.value.trim()); };

UI.applyDoseBtn.onclick = async () => {
    const qty = UI.doseNumber.value.trim();
    if (!doseState.drug || !qty) return toast('أدخل الدواء والكمية', true);
    const form = UI.formSelect.value;
    const formText = UI.formSelect.options[UI.formSelect.selectedIndex].text;
    let doseStr = `${qty} ${UI.unitLabel.textContent}`;
    const activeRow = document.querySelector('.dose-suggestion-row');
    if (activeRow) {
        const activeTiming = activeRow.querySelector('.timing-btn-sm.active')?.dataset.timing || 'any';
        const map = { before: 'قبل الأكل', after: 'بعد الأكل', bedtime: 'قبل النوم', after1h: 'بعد الأكل بساعة' };
        if (activeTiming !== 'any') doseStr += ` ${map[activeTiming] || ''}`;
    }
    if (doseState.exchange && doseState.exchangeDrug) doseStr += ` (بالتبادل مع ${doseState.exchangeDrug})`;
    rxItems.push({ drug: doseState.drug, form: formText, dose: doseStr, exchange: doseState.exchangeDrug || null });
    await incrementDrugUsage(doseState.drug, form);
    saveDosePref(doseState.drug, form, doseStr);
    renderRxItems();
    resetDosePanel();
};

UI.cancelDoseBtn.onclick = resetDosePanel;
UI.exchangeBtn.onclick = () => {
    if (!doseState.drug) return toast('اختر دواءً أولاً', true);
    doseState.exchange = !doseState.exchange;
    UI.exchangeBtn.style.background = doseState.exchange ? 'var(--primary)' : '';
    if (!doseState.exchange) { doseState.exchangeDrug = null; UI.exchangeDrugName.textContent = ''; UI.exchangeInfo.style.display = 'none'; }
};

// ===================== إنهاء الكشف → حفظ في medical_records =====================
UI.finishBtn.onclick = async () => {
    if (!currentApt) return toast('لا يوجد مريض حالي', true);
    const diagnosis = UI.diagnosis.value.trim();
    if (!rxItems.length && !diagnosis) return toast('أضف أدوية أو تشخيص', true);
    try {
        // حفظ في جدول medical_records كسجل جديد
        const recordRef = push(ref(db, 'medical_records'));
        await set(recordRef, {
            patientId: currentApt.patientId,
            patientName: currentApt.patientName,
            doctorId: uid,
            doctorName: doctor.name,
            diagnosis: diagnosis,
            items: rxItems,
            createdAt: new Date().toISOString(),
            appointmentId: currentApt.id
        });
        // تحديث حالة الموعد
        await update(ref(db, `appointments/${currentApt.id}`), { status: 'منتهي' });
        toast('✅ تم إنهاء الكشف وحفظ الروشتة');
        // إعادة تعيين الواجهة
        currentApt = null;
        rxItems = [];
        UI.patientCard.style.display = 'none';
        UI.emptyRxMsg.style.display = 'block';
        UI.rxContent.style.display = 'none';
        UI.diagnosis.value = '';
    } catch (err) {
        toast('فشل الحفظ', true);
        console.error(err);
    }
};

// ===================== القوالب =====================
UI.tplBtn.onclick = async () => {
    const snap = await get(ref(db, `templates/${uid}`));
    UI.tplList.innerHTML = '';
    if (snap.exists()) {
        Object.entries(snap.val()).forEach(([id, t]) => {
            const div = document.createElement('div');
            div.style.cssText = 'padding:12px;cursor:pointer;border-bottom:1px solid #eee;';
            div.innerHTML = `<b>${esc(t.name)}</b><br><small>${t.items?.length || 0} أصناف</small>`;
            div.onclick = () => {
                rxItems = t.items || [];
                if (t.diagnosis) UI.diagnosis.value = t.diagnosis;
                renderRxItems();
                UI.tplModal.style.display = 'none';
                toast(`تم تحميل القالب: ${t.name}`);
            };
            UI.tplList.appendChild(div);
        });
    } else UI.tplList.innerHTML = '<div class="empty-state">لا توجد قوالب</div>';
    UI.tplModal.style.display = 'flex';
};

UI.saveTplBtn.onclick = () => {
    if (!rxItems.length && !UI.diagnosis.value.trim()) return toast('لا يوجد محتوى لحفظه', true);
    UI.saveTplModal.style.display = 'flex';
    document.getElementById('templateNameInput').value = '';
    document.getElementById('templateNameInput').focus();
};

window.saveAsTemplate = async function() {
    const name = document.getElementById('templateNameInput').value.trim();
    if (!name) return toast('اكتب اسم القالب', true);
    try {
        await push(ref(db, `templates/${uid}`), {
            name, items: rxItems, diagnosis: UI.diagnosis.value.trim(), createdAt: new Date().toISOString()
        });
        toast('✅ تم حفظ القالب');
        UI.saveTplModal.style.display = 'none';
    } catch { toast('فشل الحفظ', true); }
};

// ===================== المودالات والأزرار =====================
UI.queueBtn.onclick = () => { UI.queueModal.style.display = 'flex'; renderQueueList(); };
UI.closeQueueBtn.onclick = () => UI.queueModal.style.display = 'none';
UI.queueTabs.forEach(t => t.onclick = () => {
    UI.queueTabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    queueTab = t.dataset.queueTab;
    renderQueueList();
});
window.onclick = (e) => {
    if (e.target === UI.queueModal) UI.queueModal.style.display = 'none';
    if (e.target === UI.tplModal) UI.tplModal.style.display = 'none';
    if (e.target === UI.saveTplModal) UI.saveTplModal.style.display = 'none';
    if (!UI.drugSearch.contains(e.target) && !UI.drugSuggestions.contains(e.target)) UI.drugSuggestions.style.display = 'none';
};

UI.logoutBtn.onclick = async () => {
    try { await signOut(auth); } catch {}
    sessionStorage.clear();
    window.location.href = 'index.html';
};

// ===================== بدء التشغيل =====================
(async () => {
    UI.welcome.textContent = `د. ${sessionName}`;
    await localDB.open();
    await syncDrugsFromCloud();
    await loadDoctor();
    startAppointmentsListener();
    updateUnitLabel();
})();
