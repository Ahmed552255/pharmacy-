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
    
    await localDrugDB.addOrUpdateDrug(newDrug);
    
    try {
        await set(ref(db, `drugs/${drugId}`), newDrug);
    } catch (e) {
        console.warn('تعذر حفظ الدواء في السحابة حالياً');
    }
    
    return newDrug;
}

// ---------- تحديث عداد استخدام الدواء ----------
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

let doctorInfo = { name: currentUser.name, specialty: '' };
let todayAppointments = [];
let currentAppointment = null;
// حقل جديد: currentPrescription أصبح يحمل كائنات { drug_id, drug, form, dose }
let currentPrescription = [];
let favoriteDrugs = new Set();
let doseState = {
    drug: null,
    drug_id: null,
    form: 'tablet',
    isExchange: false,
    exchangeDrug: null,
    quantity: '',
    timing: 'any'
};
let currentQueueTab = 'waiting';

// ---------- مفتاح التخزين المحلي لجلسة الكشف الحالية ----------
const SESSION_STORAGE_KEY = 'currentDoctorSession';

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

// ---------- تخزين واسترجاع جلسة الكشف الحالية ----------
function saveCurrentSession() {
    if (currentAppointment && currentPrescription.length > 0) {
        const session = {
            appointment: currentAppointment,
            prescription: currentPrescription,
            diagnosis: UI.diagnosisTextarea.value
        };
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }
}

function loadSavedSession() {
    const saved = localStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) {
        try {
            const session = JSON.parse(saved);
            if (session.appointment && session.prescription) {
                currentAppointment = session.appointment;
                currentPrescription = session.prescription;
                UI.diagnosisTextarea.value = session.diagnosis || '';
                updateCurrentPatientUI();
                UI.emptyPrescriptionMsg.style.display = 'none';
                UI.prescriptionContent.style.display = 'block';
                renderPrescriptionItems();
                return true;
            }
        } catch (e) {
            console.warn('تعذر استرجاع الجلسة المحفوظة');
        }
    }
    return false;
}

// ---------- البحث المحلي السريع ----------
async function searchDrugsLocal(term, selectedForm = null) {
    if (!term || term.length < 1) return [];
    const lowerTerm = term.toLowerCase().trim();
    let drugs = await localDrugDB.searchDrugs(lowerTerm, selectedForm);
    
    drugs = drugs.map(d => ({
        ...d,
        isFavorite: favoriteDrugs.has(d.name) || (d.frequency > 3)
    }));
    
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
        <div class="suggestion-item" data-drug-name="${escapeHtml(drug.name)}" data-drug-id="${drug.id}" data-drug-form="${escapeHtml(drug.form)}" data-drug-strength="${escapeHtml(drug.strength || '')}">
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

async function addNewDrugFromSearch(name) {
    const form = UI.drugFormSelect.value;
    const newDrug = await addNewDrugToBoth(name, form);
    doseState.drug = newDrug.name;
    doseState.drug_id = newDrug.id;
    prepareDosePanel();
    showToast(`تمت إضافة "${name}" إلى قائمة الأدوية`);
    UI.drugSuggestions.style.display = 'none';
}

// ---------- تحميل بيانات الطبيب ----------
async function loadDoctorData(uid) {
    try {
        const snap = await get(ref(db, `users/${uid}`));
        if (snap.exists()) {
            const data = snap.val();
            doctorInfo = { 
                ...doctorInfo, 
                ...data,
                specialty: data.specialty || ''   // استخدام specialty بدلاً من specialization
            };
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

// ---------- تحميل المواعيد ----------
function loadAppointments() {
    const appointmentsRef = ref(db, 'appointments');
    // التغيير: استخدم doctor_id بدلاً من doctorId
    const doctorAppointmentsQuery = query(
        appointmentsRef,
        orderByChild('doctor_id'),
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
    saveCurrentSession(); // حفظ الجلسة فوراً بعد اختيار المريض
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

// --------------------- ملف المريض (معدل لاستخدام prescriptions و prescription_items) ---------------------
UI.patientNameClickable.addEventListener('click', () => {
    if (!currentAppointment?.patientId) {
        showToast('لا يوجد معرف للمريض', true);
        return;
    }
    openPatientFile(currentAppointment.patientId, currentAppointment.patientName);
});

async function openPatientFile(patientId, patientName) {
    // استعلام عن جميع الوصفات لهذا المريض
    const prescriptionsRef = ref(db, 'prescriptions');
    const patientQuery = query(prescriptionsRef, orderByChild('patient_id'), equalTo(patientId));
    
    let prescriptionsList = [];
    try {
        const snap = await get(patientQuery);
        if (snap.exists()) {
            snap.forEach(child => {
                prescriptionsList.push({ id: child.key, ...child.val() });
            });
        }
    } catch (err) {
        showToast('تعذر جلب الملف الطبي', true);
        return;
    }

    // ترتيب تنازلي حسب التاريخ
    prescriptionsList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // بناء النافذة
    const existingModal = document.getElementById('patientFileModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'patientFileModal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px; max-height: 80vh; overflow-y: auto;">
            <span class="close-modal" id="closePatientFileModal">&times;</span>
            <h2>📄 ملف المريض: ${escapeHtml(patientName)}</h2>
            <div id="patientRecordsContainer"></div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('closePatientFileModal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    const container = document.getElementById('patientRecordsContainer');
    if (prescriptionsList.length === 0) {
        container.innerHTML = '<div class="empty-state">لا توجد كشوفات سابقة</div>';
        return;
    }

    // جلب الأدوية لكل وصفة من prescription_items
    const drugsCache = await localDrugDB.getAllDrugs(); // للترجمة من drug_id إلى اسم
    const drugMap = Object.fromEntries(drugsCache.map(d => [d.id, d]));

    container.innerHTML = '';
    for (const pres of prescriptionsList) {
        const date = pres.created_at ? pres.created_at.split('T')[0] : 'غير معروف';
        let itemsHtml = '';
        try {
            const itemsSnap = await get(ref(db, `prescription_items/${pres.id}`));
            if (itemsSnap.exists()) {
                const itemsObj = itemsSnap.val();
                const itemsArr = Object.values(itemsObj);
                itemsHtml = itemsArr.map(it => {
                    const drugInfo = drugMap[it.drug_id] || {};
                    const drugName = drugInfo.name || it.drug_id || 'غير معروف';
                    return `<li>${escapeHtml(drugName)} - ${escapeHtml(it.dose)}</li>`;
                }).join('');
            } else {
                itemsHtml = '<li>لا توجد أدوية مسجلة</li>';
            }
        } catch (e) {
            itemsHtml = '<li>تعذر تحميل الأدوية</li>';
        }

        const recordDiv = document.createElement('div');
        recordDiv.style.cssText = 'border:1px solid #ddd; border-radius:8px; padding:10px; margin-bottom:8px;';
        recordDiv.innerHTML = `
            <strong>📅 ${date}</strong>
            <div style="margin-top:5px;"><b>التشخيص:</b> ${escapeHtml(pres.diagnosis || 'غير مذكور')}</div>
            <div><b>الأدوية:</b><ul style="margin:5px 0 0 20px;">${itemsHtml}</ul></div>
        `;
        container.appendChild(recordDiv);
    }
}

// -------------------------------------------------------------------------

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
            saveCurrentSession();
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

UI.drugSuggestions.addEventListener('click', (e) => {
    const item = e.target.closest('[data-drug-name]');
    if (item) {
        doseState.drug = item.dataset.drugName;
        doseState.drug_id = item.dataset.drugId;   // التقاط معرّف الدواء
        doseState.form = item.dataset.drugForm || 'tablet';
        UI.drugFormSelect.value = doseState.form;
        prepareDosePanel();
    }
});

UI.startAddDrugBtn.addEventListener('click', () => {
    const custom = UI.drugSearchInput.value.trim();
    if (custom) {
        doseState.drug = custom;
        doseState.drug_id = null;   // سيتم إنشاؤه عند الإضافة
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
    // إذا لم يكن لدينا drug_id، حاول العثور عليه من الأدوية المحلية
    if (!doseState.drug_id) {
        localDrugDB.getAllDrugs().then(drugs => {
            const found = drugs.find(d => d.name === doseState.drug && d.form === UI.drugFormSelect.value);
            if (found) doseState.drug_id = found.id;
        });
    }
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
            { text: `${base} قبل النوم`, timing: 'bedtime' }
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

    // إذا لم يكن لدينا drug_id بعد (دواء جديد مخصص)، أنشئه الآن
    if (!doseState.drug_id) {
        const newDrug = await addNewDrugToBoth(doseState.drug, formValue);
        doseState.drug_id = newDrug.id;
    }

    currentPrescription.push({
        drug_id: doseState.drug_id,        // مفتاح الربط بجدول drugs
        drug: doseState.drug,              // للعرض فقط
        form: formText,
        dose: doseString,
        exchange: doseState.isExchange ? doseState.exchangeDrug : null
    });

    await incrementDrugUsage(doseState.drug, formValue);
    saveDosePreference(doseState.drug, formValue, doseString);
    renderPrescriptionItems();
    saveCurrentSession();
    resetDosePanel();
});

function resetDosePanel() {
    UI.dosePanel.style.display = 'none';
    doseState = {
        drug: null,
        drug_id: null,
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

UI.diagnosisTextarea.addEventListener('input', () => {
    saveCurrentSession();
});

// ---------- إنهاء الكشف (حفظ في prescriptions و prescription_items) ----------
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
        const now = new Date().toISOString();
        const prescriptionId = currentAppointment.id;  // استخدام معرّف الموعد كمعرّف للروشتة
        
        // بناء كائن التحديثات دفعة واحدة (Batch Write)
        const updates = {};
        
        // 1. الروشتة الرئيسية
        updates[`prescriptions/${prescriptionId}`] = {
            patient_id: currentAppointment.patientId,
            doctor_id: currentUser.uid,
            diagnosis: diagnosis,
            created_at: now,
            status: 'لم تصرف بعد',
            pharmacist_id: '',
            pharmacist_name: '',
            dispensed_at: ''
        };
        
        // 2. الأدوية الموصوفة (جدول prescription_items)
        currentPrescription.forEach((item, index) => {
            updates[`prescription_items/${prescriptionId}/item_${index}`] = {
                drug_id: item.drug_id,
                dose: item.dose,
                form: item.form
            };
        });
        
        // 3. تحديث حالة الموعد إلى منتهي
        updates[`appointments/${currentAppointment.id}/status`] = 'منتهي';
        
        // تنفيذ جميع الكتابات في طلب واحد
        await update(ref(db), updates);
        
        showToast('✅ تم إنهاء الكشف وحفظ الروشتة بنجاح');
        currentAppointment = null;
        currentPrescription = [];
        UI.currentPatientCard.style.display = 'none';
        UI.emptyPrescriptionMsg.style.display = 'block';
        UI.prescriptionContent.style.display = 'none';
        UI.diagnosisTextarea.value = '';
        localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (err) {
        console.error('فشل الحفظ:', err);
        showToast('حدث خطأ أثناء حفظ البيانات', true);
    }
});

// ---------- القوالب (محدثة لاستخدام prescription_templates و template_items) ----------
UI.templatesBtn.addEventListener('click', async () => {
    try {
        const templatesRef = ref(db, `prescription_templates/${currentUser.uid}`);
        const snap = await get(templatesRef);
        UI.templatesList.innerHTML = '';
        if (snap.exists()) {
            const templates = snap.val();
            const drugsCache = await localDrugDB.getAllDrugs();
            const drugMap = Object.fromEntries(drugsCache.map(d => [d.id, d]));
            
            for (const [id, t] of Object.entries(templates)) {
                const div = document.createElement('div');
                div.style.cssText = 'padding:12px; cursor:pointer; border-bottom:1px solid #eee;';
                div.innerHTML = `<b>${escapeHtml(t.name)}</b><br><small>${t.itemCount || 0} أصناف</small>`;
                div.addEventListener('click', async () => {
                    // تحميل عناصر القالب من template_items
                    const itemsSnap = await get(ref(db, `template_items/${id}`));
                    currentPrescription = [];
                    if (itemsSnap.exists()) {
                        const itemsObj = itemsSnap.val();
                        currentPrescription = Object.values(itemsObj).map(it => {
                            const drugInfo = drugMap[it.drug_id] || {};
                            return {
                                drug_id: it.drug_id,
                                drug: drugInfo.name || it.drug_id,
                                form: it.form,
                                dose: it.dose
                            };
                        });
                    }
                    if (t.diagnosis) UI.diagnosisTextarea.value = t.diagnosis;
                    renderPrescriptionItems();
                    saveCurrentSession();
                    UI.templatesModal.style.display = 'none';
                    showToast(`تم تحميل القالب: ${t.name}`);
                });
                UI.templatesList.appendChild(div);
            }
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
    const templateId = push(ref(db, `prescription_templates/${currentUser.uid}`)).key;
    const templateData = {
        name: name,
        diagnosis: UI.diagnosisTextarea.value.trim(),
        doctor_id: currentUser.uid,
        created_at: new Date().toISOString()
    };
    const updates = {};
    updates[`prescription_templates/${currentUser.uid}/${templateId}`] = templateData;
    
    // حفظ عناصر القالب في template_items
    currentPrescription.forEach((item, idx) => {
        updates[`template_items/${templateId}/item_${idx}`] = {
            drug_id: item.drug_id,
            dose: item.dose,
            form: item.form
        };
    });
    
    try {
        await update(ref(db), updates);
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
    await localDrugDB.open();
    await syncDrugsFromFirebase();
    await loadDoctorData(currentUser.uid);
    loadSavedSession();
    loadAppointments();
    updateUnitLabel();
})();
