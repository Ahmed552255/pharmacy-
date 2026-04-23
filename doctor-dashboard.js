// ---------- استيرادات Firebase ----------
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import {
    getDatabase,
    ref,
    onValue,
    set,
    push,
    update,
    get,
    query,
    orderByChild,
    equalTo
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-database.js";

// ---------- تهيئة Firebase ----------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ---------- نظام التخزين المحلي (IndexedDB) ----------
class LocalDrugDB {
    constructor() {
        this.db = null;
        this.DB_NAME = 'SukunDrugsDB';
        this.STORE_NAME = 'drugs';
        this.VERSION = 1;
    }

    async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                    store.createIndex('by_name', 'name', { unique: false });
                    store.createIndex('by_form', 'form', { unique: false });
                    store.createIndex('by_frequency', 'frequency', { unique: false });
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            request.onerror = reject;
        });
    }

    async getAllDrugs() {
        return new Promise((resolve) => {
            const tx = this.db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => resolve([]);
        });
    }

    async saveDrugs(drugsArray) {
        const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
        const store = tx.objectStore(this.STORE_NAME);
        // مسح القديم ثم إضافة الجديد
        await store.clear();
        for (const drug of drugsArray) {
            store.add(drug);
        }
        return new Promise((resolve) => {
            tx.oncomplete = resolve;
            tx.onerror = () => resolve(false);
        });
    }

    async addOrUpdateDrug(drug) {
        return new Promise((resolve) => {
            const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const getRequest = store.get(drug.id);
            getRequest.onsuccess = () => {
                const existing = getRequest.result;
                if (existing) {
                    // تحديث العداد
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
        const drugs = await this.getAllDrugs();
        const lowerTerm = term.toLowerCase();
        let results = drugs.filter(d => 
            d.name.toLowerCase().includes(lowerTerm) ||
            (d.genericName && d.genericName.toLowerCase().includes(lowerTerm))
        );
        if (formFilter && formFilter !== 'all') {
            results = results.filter(d => d.form === formFilter);
        }
        // ترتيب حسب التفضيل (frequency) ثم الأبجدي
        results.sort((a, b) => (b.frequency || 0) - (a.frequency || 0) || a.name.localeCompare(b.name));
        return results;
    }
}

const localDrugDB = new LocalDrugDB();

// ---------- مزامنة الأدوية من Firebase إلى المحلي ----------
async function syncDrugsFromFirebase() {
    try {
        const snap = await get(ref(db, 'drugs'));
        let drugs = [];
        if (snap.exists()) {
            const obj = snap.val();
            drugs = Object.values(obj).map(d => ({
                ...d,
                id: d.id || crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random()
            }));
        }
        await localDrugDB.saveDrugs(drugs);
        console.log(`✅ تمت مزامنة ${drugs.length} دواء مع المحلي`);
        return drugs;
    } catch (err) {
        console.warn('تعذر الاتصال بـ Firebase، استخدام البيانات المحلية فقط');
        return await localDrugDB.getAllDrugs();
    }
}

// ---------- إضافة دواء جديد إلى السحابة والمحلي ----------
async function addNewDrugToBoth(name, form, strength = '', price = null) {
    const drugId = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random();
    const newDrug = {
        id: drugId,
        name: name.trim(),
        genericName: '',
        form: form,
        strength: strength,
        price: price,
        frequency: 1,
        createdAt: new Date().toISOString()
    };
    
    // حفظ محلياً
    await localDrugDB.addOrUpdateDrug(newDrug);
    
    // حفظ في Firebase (إذا كان متصلاً)
    try {
        await set(ref(db, `drugs/${drugId}`), newDrug);
    } catch (e) {
        console.warn('تعذر حفظ الدواء في السحابة حالياً');
    }
    
    return newDrug;
}

// ---------- تحديث عداد استخدام الدواء (محلياً وسحابياً) ----------
async function incrementDrugUsage(drugName, form) {
    const drugs = await localDrugDB.getAllDrugs();
    const drug = drugs.find(d => d.name === drugName && d.form === form);
    if (drug) {
        drug.frequency = (drug.frequency || 0) + 1;
        await localDrugDB.addOrUpdateDrug(drug);
        try {
            await update(ref(db, `drugs/${drug.id}`), { frequency: drug.frequency });
        } catch (e) {}
    } else {
        // إذا لم يكن موجوداً، أضفه تلقائياً
        await addNewDrugToBoth(drugName, form);
    }
}

// ---------- عناصر واجهة المستخدم ----------
const UI = {
    welcomeMessage: document.getElementById('welcomeMessage'),
    queueModalBtn: document.getElementById('queueModalBtn'),
    queueBadgeCount: document.getElementById('queueBadgeCount'),
    queueModal: document.getElementById('queueModal'),
    closeQueueModalBtn: document.getElementById('closeQueueModalBtn'),
    queueTabs: document.querySelectorAll('.queue-tab'),
    queueModalList: document.getElementById('queueModalList'),
    waitingTabCount: document.getElementById('waitingTabCount'),
    doneTabCount: document.getElementById('doneTabCount'),
    currentPatientCard: document.getElementById('currentPatientCard'),
    currentPatientNameDisplay: document.getElementById('currentPatientNameDisplay'),
    currentPatientAgeDisplay: document.getElementById('currentPatientAgeDisplay'),
    patientNameClickable: document.getElementById('patientNameClickable'),
    diagnosisTextarea: document.getElementById('diagnosisTextarea'),
    emptyPrescriptionMsg: document.getElementById('emptyPrescriptionMsg'),
    prescriptionContent: document.getElementById('prescriptionContent'),
    rxItemsContainer: document.getElementById('rxItemsContainer'),
    drugSearchInput: document.getElementById('drugSearchInput'),
    drugSuggestions: document.getElementById('drugSuggestions'),
    drugFormSelect: document.getElementById('drugFormSelect'),
    startAddDrugBtn: document.getElementById('startAddDrugBtn'),
    exchangeModeBtn: document.getElementById('exchangeModeBtn'),
    dosePanel: document.getElementById('dosePanel'),
    selectedDrugDisplay: document.getElementById('selectedDrugDisplay'),
    selectedFormDisplay: document.getElementById('selectedFormDisplay'),
    doseNumberInput: document.getElementById('doseNumberInput'),
    unitLabel: document.getElementById('unitLabel'),
    exchangeInfo: document.getElementById('exchangeInfo'),
    exchangeDrugName: document.getElementById('exchangeDrugName'),
    doseSuggestionsContainer: document.getElementById('doseSuggestionsContainer'),
    applyDoseBtn: document.getElementById('applyDoseBtn'),
    cancelDoseBtn: document.getElementById('cancelDoseBtn'),
    finishBtn: document.getElementById('finishBtn'),
    saveTemplateBtn: document.getElementById('saveTemplateBtn'),
    templatesBtn: document.getElementById('templatesBtn'),
    templatesModal: document.getElementById('templatesModal'),
    saveTemplateModal: document.getElementById('saveTemplateModal'),
    templatesList: document.getElementById('templatesList'),
    logoutBtn: document.getElementById('logoutBtn')
};

// ---------- التحقق من الجلسة ----------
const sessionUid = sessionStorage.getItem('userUid');
const sessionRole = sessionStorage.getItem('userRole');
const sessionName = sessionStorage.getItem('userName');

if (!sessionUid || sessionRole !== 'doctor') {
    sessionStorage.clear();
    window.location.replace('index.html');
    throw new Error('جلسة غير صالحة.');
}

// ---------- الحالة العامة ----------
const currentUser = {
    uid: sessionUid,
    name: sessionName || 'طبيب'
};

let doctorInfo = { name: currentUser.name };
let todayAppointments = [];
let currentAppointment = null;
let currentPrescription = [];
let favoriteDrugs = new Set();
let doseState = {
    drug: null,
    form: 'tablet',
    isExchange: false,
    exchangeDrug: null,
    quantity: '',
    timing: 'any'
};
let currentQueueTab = 'waiting';

// ---------- دوال مساعدة ----------
function getLocalDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
const today = getLocalDateString();

function showToast(msg, isErr = false) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.background = isErr ? '#B23B3B' : '#4A3B2C';
    t.innerHTML = `<i class="fas ${isErr ? 'fa-exclamation-triangle' : 'fa-check'}"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m] || m);
}

// ---------- البحث المحلي السريع (مع تفضيلات الاستخدام) ----------
async function searchDrugsLocal(term, selectedForm = null) {
    if (!term || term.length < 1) return [];
    const lowerTerm = term.toLowerCase().trim();
    let drugs = await localDrugDB.searchDrugs(lowerTerm, selectedForm);
    
    // تمييز المفضلة (بناءً على الاستخدام المتكرر أو المفضلة الصريحة)
    drugs = drugs.map(d => ({
        ...d,
        isFavorite: favoriteDrugs.has(d.name) || (d.frequency > 3) // استخدام أكثر من 3 مرات يعتبر مفضل
    }));
    
    // ترتيب: المفضلة أولاً، ثم تكرار الاستخدام
    drugs.sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return (b.frequency || 0) - (a.frequency || 0);
    });
    
    return drugs.slice(0, 15);
}

// ---------- عرض الاقتراحات مع خيار إضافة دواء جديد ----------
async function displayDrugSuggestions(term) {
    const selectedForm = UI.drugFormSelect.value;
    const matches = await searchDrugsLocal(term, selectedForm);
    
    if (matches.length === 0) {
        UI.drugSuggestions.innerHTML = `
            <div class="suggestion-item" id="addNewDrugOption" style="background: #FEF5EC; cursor: pointer;">
                <i class="fas fa-plus-circle" style="color: var(--primary);"></i>
                <span>إضافة "${escapeHtml(term)}" كدواء جديد (${UI.drugFormSelect.options[UI.drugFormSelect.selectedIndex].text})</span>
            </div>
        `;
        UI.drugSuggestions.style.display = 'block';
        document.getElementById('addNewDrugOption').addEventListener('click', () => addNewDrugFromSearch(term));
        return;
    }

    UI.drugSuggestions.innerHTML = matches.map(drug => {
        const favIcon = drug.isFavorite ? '<span class="favorites-tag"><i class="fas fa-star"></i> مفضل</span>' : '';
        const formIcon = { 'tablet':'💊','syrup':'🥄','injection':'💉','suppository':'🧴','drops':'💧' }[drug.form] || '💊';
        const strengthBadge = drug.strength ? `<span class="strength-info">${escapeHtml(drug.strength)}</span>` : '';
        const usageCount = drug.frequency ? `<span class="usage-count" title="استخدم ${drug.frequency} مرة">(${drug.frequency})</span>` : '';
        
        return `
        <div class="suggestion-item" data-drug-name="${escapeHtml(drug.name)}" data-drug-form="${escapeHtml(drug.form)}" data-drug-strength="${escapeHtml(drug.strength || '')}">
            <div class="suggestion-main">
                <span class="drug-name">${formIcon} ${escapeHtml(drug.name)}</span>
                ${favIcon}
                ${usageCount}
            </div>
            <div class="suggestion-details">
                ${strengthBadge}
            </div>
        </div>
        `;
    }).join('');
    UI.drugSuggestions.style.display = 'block';
}

// إضافة دواء جديد من شريط البحث
async function addNewDrugFromSearch(name) {
    const form = UI.drugFormSelect.value;
    const newDrug = await addNewDrugToBoth(name, form);
    doseState.drug = newDrug.name;
    prepareDosePanel();
    showToast(`تمت إضافة "${name}" إلى قائمة الأدوية`);
    UI.drugSuggestions.style.display = 'none';
}

// ---------- تحميل بيانات الطبيب (معدلة) ----------
async function loadDoctorData(uid) {
    try {
        const snap = await get(ref(db, `users/${uid}`));
        if (snap.exists()) {
            const data = snap.val();
            doctorInfo = { ...doctorInfo, ...data };
            UI.welcomeMessage.textContent = `د. ${doctorInfo.name || currentUser.name}`;
        } else {
            UI.welcomeMessage.textContent = `د. ${currentUser.name}`;
        }

        const favSnap = await get(ref(db, `favorites/${uid}`));
        if (favSnap.exists()) {
            favoriteDrugs = new Set(Object.values(favSnap.val()));
        }
        return true;
    } catch (err) {
        console.error('فشل تحميل بيانات الطبيب:', err);
        showToast('تعذر تحميل بعض البيانات', true);
        return true;
    }
}

// ---------- تحميل المواعيد (بدون تغيير) ----------
function loadAppointments() {
    const appointmentsRef = ref(db, 'appointments');
    const doctorAppointmentsQuery = query(
        appointmentsRef,
        orderByChild('doctorId'),
        equalTo(currentUser.uid)
    );

    onValue(doctorAppointmentsQuery, (snap) => {
        const all = [];
        snap.forEach(child => {
            const apt = { id: child.key, ...child.val() };
            if (apt.date === today && apt.status !== 'ملغي') {
                all.push(apt);
            }
        });
        all.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        todayAppointments = all;
        updateQueueBadgeAndModal();
    }, (error) => {
        console.error('خطأ في تحميل الحجوزات:', error);
        showToast('خطأ في تحميل قائمة الانتظار', true);
    });
}

function updateQueueBadgeAndModal() {
    const waitingCount = todayAppointments.filter(a => a.status === 'انتظار').length;
    const doneCount = todayAppointments.filter(a => a.status === 'منتهي').length;
    UI.queueBadgeCount.textContent = waitingCount;
    UI.waitingTabCount.textContent = waitingCount;
    UI.doneTabCount.textContent = doneCount;
    renderQueueModalList();
}

function renderQueueModalList() {
    const filtered = todayAppointments.filter(a =>
        currentQueueTab === 'waiting' ? a.status === 'انتظار' : a.status === 'منتهي'
    );

    if (filtered.length === 0) {
        UI.queueModalList.innerHTML = '<div class="empty-state">لا يوجد مرضى في هذه القائمة</div>';
        return;
    }

    UI.queueModalList.innerHTML = filtered.map(apt => `
        <div class="queue-item-modal" data-id="${apt.id}">
            <b>${escapeHtml(apt.patientName)}</b> - ${apt.time} - ${apt.age || '--'} سنة
            ${apt.status === 'منتهي' ? '<span style="color:green;">✓ تم</span>' : ''}
        </div>
    `).join('');

    document.querySelectorAll('.queue-item-modal').forEach(el => {
        el.addEventListener('click', () => selectPatientFromQueue(el.dataset.id));
    });
}

async function selectPatientFromQueue(appointmentId) {
    const apt = todayAppointments.find(a => a.id === appointmentId);
    if (!apt) return;
    if (apt.status === 'منتهي') {
        showToast('لا يمكن اختيار مريض منتهي الكشف', true);
        return;
    }
    if (apt.status === 'انتظار') {
        await update(ref(db, `appointments/${appointmentId}`), { status: 'قيد الكشف' });
    }
    currentAppointment = apt;
    currentPrescription = [];
    UI.diagnosisTextarea.value = '';
    updateCurrentPatientUI();
    UI.emptyPrescriptionMsg.style.display = 'none';
    UI.prescriptionContent.style.display = 'block';
    renderPrescriptionItems();
    UI.queueModal.style.display = 'none';
}

function updateCurrentPatientUI() {
    if (!currentAppointment) {
        UI.currentPatientCard.style.display = 'none';
        return;
    }
    UI.currentPatientCard.style.display = 'flex';
    UI.currentPatientNameDisplay.textContent = currentAppointment.patientName;
    UI.currentPatientAgeDisplay.textContent = `${currentAppointment.age || '--'} سنة`;
}

UI.patientNameClickable.addEventListener('click', async () => {
    if (!currentAppointment?.patientId) {
        showToast('لا يوجد معرف للمريض', true);
        return;
    }
    try {
        const prescriptionsRef = ref(db, 'prescriptions');
        const patientQuery = query(prescriptionsRef, orderByChild('patientId'), equalTo(currentAppointment.patientId));
        const snap = await get(patientQuery);
        let history = '';
        if (snap.exists()) {
            snap.forEach(child => {
                const p = child.val();
                const date = p.createdAt ? p.createdAt.split('T')[0] : 'تاريخ غير معروف';
                history += `${date} : ${p.items?.length || 0} أدوية\n`;
            });
        }
        alert(`📋 سجل المريض ${currentAppointment.patientName}:\n${history || 'لا توجد روشتات سابقة'}`);
    } catch (err) {
        showToast('تعذر جلب السجل', true);
    }
});

function renderPrescriptionItems() {
    if (currentPrescription.length === 0) {
        UI.rxItemsContainer.innerHTML = '<div class="empty-state">لم تُضِف أي أدوية بعد</div>';
        return;
    }
    UI.rxItemsContainer.innerHTML = currentPrescription.map((item, idx) => `
        <div class="rx-item">
            <div class="rx-main-row">
                <div class="rx-drug-info">
                    <span class="rx-drug-name">${escapeHtml(item.drug)}</span>
                    <span class="rx-form-badge">${escapeHtml(item.form)}</span>
                </div>
                <div class="rx-dose-info">
                    <span class="rx-dose-text">${escapeHtml(item.dose)}</span>
                    <div class="rx-actions">
                        <button class="icon-btn-sm" data-action="remove" data-index="${idx}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    document.querySelectorAll('[data-action="remove"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            currentPrescription.splice(index, 1);
            renderPrescriptionItems();
        });
    });
}

function updateUnitLabel() {
    const forms = { tablet: 'قرص', syrup: 'مل', injection: 'سم', suppository: 'لبوس', drops: 'نقطة' };
    UI.unitLabel.textContent = forms[UI.drugFormSelect.value] || '';
}
UI.drugFormSelect.addEventListener('change', () => {
    updateUnitLabel();
    if (UI.drugSearchInput.value.trim()) {
        displayDrugSuggestions(UI.drugSearchInput.value.trim());
    }
});

// البحث مع debounce بسيط
let searchTimeout;
UI.drugSearchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const term = UI.drugSearchInput.value.trim();
    if (term.length < 1) {
        UI.drugSuggestions.style.display = 'none';
        return;
    }
    searchTimeout = setTimeout(() => displayDrugSuggestions(term), 200);
});

// اختيار دواء من الاقتراحات
UI.drugSuggestions.addEventListener('click', (e) => {
    const item = e.target.closest('[data-drug-name]');
    if (item) {
        const drugName = item.dataset.drugName;
        const drugForm = item.dataset.drugForm || 'tablet';
        UI.drugFormSelect.value = drugForm;
        doseState.drug = drugName;
        prepareDosePanel();
    }
});

UI.startAddDrugBtn.addEventListener('click', () => {
    const custom = UI.drugSearchInput.value.trim();
    if (custom) {
        doseState.drug = custom;
        prepareDosePanel();
    } else {
        showToast('الرجاء إدخال اسم الدواء', true);
    }
});

UI.exchangeModeBtn.addEventListener('click', () => {
    if (!doseState.drug) {
        showToast('اختر الدواء الأساسي أولاً', true);
        return;
    }
    doseState.isExchange = !doseState.isExchange;
    UI.exchangeModeBtn.style.background = doseState.isExchange ? 'var(--primary)' : '';
    if (!doseState.isExchange) {
        doseState.exchangeDrug = null;
        UI.exchangeDrugName.textContent = '';
        UI.exchangeInfo.style.display = 'none';
    }
});

function prepareDosePanel() {
    if (!doseState.drug) return;
    UI.selectedDrugDisplay.textContent = doseState.drug;
    UI.selectedFormDisplay.textContent = UI.drugFormSelect.options[UI.drugFormSelect.selectedIndex].text;
    UI.dosePanel.style.display = 'block';
    UI.doseNumberInput.value = '';
    UI.doseNumberInput.focus();
    updateUnitLabel();
    generateDoseSuggestions();
}

function getDosePreferencesKey(drug, form) {
    return `dosePref_${currentUser.uid}_${drug}_${form}`;
}

function loadDosePreferences(drug, form) {
    const key = getDosePreferencesKey(drug, form);
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
}

function saveDosePreference(drug, form, doseString) {
    const key = getDosePreferencesKey(drug, form);
    let prefs = loadDosePreferences(drug, form);
    prefs = prefs.filter(p => p !== doseString);
    prefs.unshift(doseString);
    if (prefs.length > 5) prefs.pop();
    localStorage.setItem(key, JSON.stringify(prefs));
}

function generateDoseSuggestions() {
    const quantity = UI.doseNumberInput.value.trim();
    const drug = doseState.drug;
    const form = UI.drugFormSelect.value;
    const unit = UI.unitLabel.textContent;

    let suggestions = [];

    if (drug) {
        const prefs = loadDosePreferences(drug, form);
        suggestions = prefs.map(p => ({ text: p, isPref: true }));
    }

    if (quantity && !isNaN(parseInt(quantity))) {
        const num = parseInt(quantity);
        const base = `${num} ${unit}`;
        const built = [
            { text: `${base} يومياً`, timing: 'any' },
            { text: `${base} كل 8 ساعات`, timing: 'any' },
            { text: `${base} كل 12 ساعة`, timing: 'any' },
            { text: `${base} مرة واحدة يومياً`, timing: 'any' },
            { text: `${base} عند اللزوم`, timing: 'any' },
            { text: `${base} قبل النوم`, timing: 'bedtime' },
            { text: `${base} بعد الأكل بساعة`, timing: 'after1h' }
        ];
        built.forEach(b => {
            if (!suggestions.some(s => s.text === b.text)) {
                suggestions.push({ text: b.text, isPref: false, timing: b.timing });
            }
        });
    }

    if (suggestions.length === 0) {
        const base = `1 ${unit}`;
        const defaultSuggestions = [
            { text: `${base} يومياً`, timing: 'any' },
            { text: `${base} كل 8 ساعات`, timing: 'any' },
            { text: `${base} كل 12 ساعة`, timing: 'any' },
            { text: `${base} مرة واحدة يومياً`, timing: 'any' },
            { text: `${base} قبل النوم`, timing: 'bedtime' },
            { text: `${base} بعد الأكل بساعة`, timing: 'after1h' }
        ];
        defaultSuggestions.forEach(s => suggestions.push({ ...s, isPref: false }));
    }

    const displaySuggestions = suggestions.slice(0, 7);

    UI.doseSuggestionsContainer.innerHTML = displaySuggestions.map((s, idx) => {
        let timingIcon = '';
        if (s.timing === 'bedtime') timingIcon = '<i class="fas fa-bed" title="قبل النوم"></i>';
        else if (s.timing === 'after1h') timingIcon = '<i class="fas fa-clock" title="بعد الأكل بساعة"></i>';
        
        return `
        <div class="dose-suggestion-row" data-timing="${s.timing || 'any'}">
            <span>
                ${escapeHtml(s.text)} 
                ${s.isPref ? '<i class="fas fa-history" style="opacity:0.6; margin-right:6px;"></i>' : ''}
                ${timingIcon}
            </span>
            <div>
                <button class="timing-btn-sm" data-timing="before" title="قبل الأكل"><i class="fas fa-utensils"></i> قبل</button>
                <button class="timing-btn-sm" data-timing="after" title="بعد الأكل"><i class="fas fa-utensils"></i> بعد</button>
                <button class="timing-btn-sm ${idx === 0 ? 'active' : ''}" data-timing="any" title="لا يهم"><i class="fas fa-minus"></i> عادي</button>
            </div>
        </div>
        `;
    }).join('');

    document.querySelectorAll('.timing-btn-sm').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const parentRow = btn.closest('.dose-suggestion-row');
            parentRow.querySelectorAll('.timing-btn-sm').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

UI.doseNumberInput.addEventListener('input', generateDoseSuggestions);
UI.drugFormSelect.addEventListener('change', generateDoseSuggestions);

UI.applyDoseBtn.addEventListener('click', async () => {
    const quantity = UI.doseNumberInput.value.trim();
    if (!doseState.drug || !quantity) {
        showToast('الرجاء إدخال الدواء والكمية', true);
        return;
    }

    const formValue = UI.drugFormSelect.value;
    const formText = UI.drugFormSelect.options[UI.drugFormSelect.selectedIndex].text;
    let doseString = `${quantity} ${UI.unitLabel.textContent}`;

    const activeRow = document.querySelector('.dose-suggestion-row');
    if (activeRow) {
        const timingBtn = activeRow.querySelector('.timing-btn-sm.active');
        const timing = timingBtn ? timingBtn.dataset.timing : 'any';
        const timingText = { 
            before: 'قبل الأكل', 
            after: 'بعد الأكل', 
            bedtime: 'قبل النوم',
            after1h: 'بعد الأكل بساعة',
            any: '' 
        }[timing] || '';
        if (timingText) doseString += ` ${timingText}`;
    }

    if (doseState.isExchange && doseState.exchangeDrug) {
        doseString += ` (بالتبادل مع ${doseState.exchangeDrug})`;
    }

    currentPrescription.push({
        drug: doseState.drug,
        form: formText,
        dose: doseString,
        exchange: doseState.isExchange ? doseState.exchangeDrug : null
    });

    // ✅ تحديث عداد الاستخدام للدواء (محلياً وسحابياً)
    await incrementDrugUsage(doseState.drug, formValue);
    
    saveDosePreference(doseState.drug, formValue, doseString);
    renderPrescriptionItems();
    resetDosePanel();
});

function resetDosePanel() {
    UI.dosePanel.style.display = 'none';
    doseState = {
        drug: null,
        form: 'tablet',
        isExchange: false,
        exchangeDrug: null,
        quantity: '',
        timing: 'any'
    };
    UI.drugSearchInput.value = '';
    UI.exchangeModeBtn.style.background = '';
    UI.exchangeInfo.style.display = 'none';
    UI.drugSuggestions.style.display = 'none';
}

UI.cancelDoseBtn.addEventListener('click', resetDosePanel);

// إنهاء الكشف
UI.finishBtn.addEventListener('click', async () => {
    if (!currentAppointment) {
        showToast('لا يوجد مريض حالي', true);
        return;
    }
    const diagnosis = UI.diagnosisTextarea.value.trim();
    if (currentPrescription.length === 0 && !diagnosis) {
        showToast('الرجاء إضافة أدوية أو تشخيص قبل إنهاء الكشف', true);
        return;
    }
    try {
        const prescriptionRef = ref(db, `prescriptions/${currentAppointment.id}`);
        await set(prescriptionRef, {
            patientName: currentAppointment.patientName,
            patientId: currentAppointment.patientId,
            doctorId: currentUser.uid,
            doctorName: doctorInfo.name || currentUser.name,
            diagnosis: diagnosis,
            items: currentPrescription,
            createdAt: new Date().toISOString()
        });
        await update(ref(db, `appointments/${currentAppointment.id}`), { status: 'منتهي' });
        showToast('✅ تم إنهاء الكشف وحفظ الروشتة بنجاح');
        currentAppointment = null;
        currentPrescription = [];
        UI.currentPatientCard.style.display = 'none';
        UI.emptyPrescriptionMsg.style.display = 'block';
        UI.prescriptionContent.style.display = 'none';
        UI.diagnosisTextarea.value = '';
    } catch (err) {
        console.error('فشل الحفظ:', err);
        showToast('حدث خطأ أثناء حفظ البيانات', true);
    }
});

// القوالب
UI.templatesBtn.addEventListener('click', async () => {
    try {
        const templatesRef = ref(db, `templates/${currentUser.uid}`);
        const snap = await get(templatesRef);
        UI.templatesList.innerHTML = '';
        if (snap.exists()) {
            const templates = snap.val();
            Object.entries(templates).forEach(([id, t]) => {
                const div = document.createElement('div');
                div.style.cssText = 'padding:12px; cursor:pointer; border-bottom:1px solid #eee;';
                div.innerHTML = `<b>${escapeHtml(t.name)}</b><br><small>${t.items?.length || 0} أصناف</small>`;
                div.addEventListener('click', () => {
                    currentPrescription = t.items || [];
                    if (t.diagnosis) UI.diagnosisTextarea.value = t.diagnosis;
                    renderPrescriptionItems();
                    UI.templatesModal.style.display = 'none';
                    showToast(`تم تحميل القالب: ${t.name}`);
                });
                UI.templatesList.appendChild(div);
            });
        } else {
            UI.templatesList.innerHTML = '<div class="empty-state">لا توجد قوالب محفوظة</div>';
        }
        UI.templatesModal.style.display = 'flex';
    } catch (err) {
        showToast('تعذر تحميل القوالب', true);
    }
});

UI.saveTemplateBtn.addEventListener('click', () => {
    if (currentPrescription.length === 0 && !UI.diagnosisTextarea.value.trim()) {
        showToast('لا يوجد محتوى لحفظه كقالب', true);
        return;
    }
    UI.saveTemplateModal.style.display = 'flex';
    document.getElementById('templateNameInput').value = '';
    document.getElementById('templateNameInput').focus();
});

window.saveAsTemplate = async function() {
    const nameInput = document.getElementById('templateNameInput');
    const name = nameInput.value.trim();
    if (!name) {
        showToast('الرجاء إدخال اسم للقالب', true);
        return;
    }
    const templateData = {
        name: name,
        items: currentPrescription,
        diagnosis: UI.diagnosisTextarea.value.trim(),
        createdAt: new Date().toISOString()
    };
    try {
        await push(ref(db, `templates/${currentUser.uid}`), templateData);
        showToast('✅ تم حفظ القالب بنجاح');
        UI.saveTemplateModal.style.display = 'none';
    } catch (err) {
        showToast('فشل حفظ القالب', true);
    }
};

// إدارة المودالات
UI.queueModalBtn.addEventListener('click', () => {
    UI.queueModal.style.display = 'flex';
    renderQueueModalList();
});
UI.closeQueueModalBtn.addEventListener('click', () => UI.queueModal.style.display = 'none');
UI.queueTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        UI.queueTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentQueueTab = tab.dataset.queueTab;
        renderQueueModalList();
    });
});
window.addEventListener('click', (e) => {
    if (e.target === UI.templatesModal) UI.templatesModal.style.display = 'none';
    if (e.target === UI.saveTemplateModal) UI.saveTemplateModal.style.display = 'none';
    if (e.target === UI.queueModal) UI.queueModal.style.display = 'none';
    if (!UI.drugSearchInput.contains(e.target) && !UI.drugSuggestions.contains(e.target)) {
        UI.drugSuggestions.style.display = 'none';
    }
});

UI.logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (err) {}
    sessionStorage.clear();
    window.location.href = 'index.html';
});

// ---------- بدء التشغيل ----------
(async function init() {
    UI.welcomeMessage.textContent = `د. ${currentUser.name}`;
    
    // فتح IndexedDB ومزامنة الأدوية من Firebase
    await localDrugDB.open();
    await syncDrugsFromFirebase();
    
    await loadDoctorData(currentUser.uid);
    loadAppointments();
    updateUnitLabel();
})();
