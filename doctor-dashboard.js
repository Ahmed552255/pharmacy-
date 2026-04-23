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
                id: d.id || (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random())
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

// ---------- مودال سجل المريض (جديد) ----------
let patientHistoryModal = null;
function createPatientHistoryModal() {
    if (patientHistoryModal) return patientHistoryModal;
    const modal = document.createElement('div');
    modal.id = 'patientHistoryModal';
    modal.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.2); backdrop-filter: blur(6px);
        display: none; align-items: center; justify-content: center; z-index: 2000;
    `;
    modal.innerHTML = `
        <div style="background: white; border-radius: 32px; width: 90%; max-width: 700px; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column;">
            <div style="padding: 20px 24px; border-bottom: 1px solid #F0E0D0; display: flex; justify-content: space-between;">
                <h3 style="margin:0;">📋 سجل المريض <span id="historyPatientName"></span></h3>
                <button id="closeHistoryModalBtn" style="background:none; border:none; font-size:28px; cursor:pointer;">&times;</button>
            </div>
            <div id="historyRecordsList" style="flex:1; overflow-y: auto; padding: 16px;">
                <div class="empty-state">جاري تحميل السجلات...</div>
            </div>
            <div id="historyDetailsPanel" style="padding: 16px; border-top: 1px solid #F0E0D0; background: #FEF5EC; display: none;">
                <h4>تفاصيل الروشتة</h4>
                <div id="historyDetailsContent"></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    patientHistoryModal = modal;
    document.getElementById('closeHistoryModalBtn').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });
    return modal;
}

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

async function addNewDrugFromSearch(name) {
    const form = UI.drugFormSelect.value;
    const newDrug = await addNewDrugToBoth(name, form);
    doseState.drug = newDrug.name;
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

// ---------- تحميل المواعيد ----------
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

// ---------- فتح سجل المريض (مودال جديد) ----------
UI.patientNameClickable.addEventListener('click', async () => {
    if (!currentAppointment?.patientId) {
        showToast('لا يوجد معرف للمريض', true);
        return;
    }
    const modal = createPatientHistoryModal();
    document.getElementById('historyPatientName').textContent = currentAppointment.patientName;
    const listDiv = document.getElementById('historyRecordsList');
    listDiv.innerHTML = '<div class="empty-state">جاري تحميل السجلات...</div>';
    modal.style.display = 'flex';
    
    try {
        const recordsRef = ref(db, `patient_records/${currentAppointment.patientId}`);
        const snap = await get(recordsRef);
        const records = [];
        if (snap.exists()) {
            snap.forEach(child => records.push({ id: child.key, ...child.val() }));
        }
        records.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        
        if (records.length === 0) {
            listDiv.innerHTML = '<div class="empty-state">لا توجد سجلات سابقة لهذا المريض</div>';
            return;
        }
        
        listDiv.innerHTML = records.map(rec => {
            const date = rec.createdAt ? new Date(rec.createdAt).toLocaleDateString('ar-EG') : 'غير معروف';
            return `
                <div class="queue-item-modal" style="margin-bottom:8px;" data-record-id="${rec.id}">
                    <div style="display:flex; justify-content:space-between;">
                        <b>${date}</b>
                        <span>د. ${escapeHtml(rec.doctorName || '')}</span>
                    </div>
                    <div>التشخيص: ${escapeHtml(rec.diagnosis || 'غير محدد')}</div>
                    <div>عدد الأدوية: ${rec.items?.length || 0}</div>
                </div>
            `;
        }).join('');
        
        document.querySelectorAll('[data-record-id]').forEach(el => {
            el.addEventListener('click', () => {
                const recordId = el.dataset.recordId;
                const record = records.find(r => r.id === recordId);
                if (record) showRecordDetails(record);
            });
        });
    } catch (err) {
        listDiv.innerHTML = '<div class="empty-state">تعذر تحميل السجلات</div>';
        console.error(err);
    }
});

function showRecordDetails(record) {
    const panel = document.getElementById('historyDetailsPanel');
    const content = document.getElementById('historyDetailsContent');
    const items = record.items || [];
    let itemsHtml = '';
    items.forEach(item => {
        itemsHtml += `<div style="background:white; border-radius:12px; padding:8px; margin:5px 0;">${escapeHtml(item.drug)} - ${escapeHtml(item.dose)}</div>`;
    });
    content.innerHTML = `
        <p><strong>التشخيص:</strong> ${escapeHtml(record.diagnosis || 'غير محدد')}</p>
        <p><strong>الأدوية:</strong></p>
        ${itemsHtml}
        <p><small>بتاريخ: ${record.createdAt ? new Date(record.createdAt).toLocaleString('ar-EG') : ''}</small></p>
        <button id="useThisPrescriptionBtn" class="btn btn-primary" style="margin-top:8px;">استخدام هذه الروشتة</button>
    `;
    panel.style.display = 'block';
    document.getElementById('useThisPrescriptionBtn').addEventListener('click', () => {
        currentPrescription = [...record.items];
        if (record.diagnosis) UI.diagnosisTextarea.value = record.diagnosis;
        renderPrescriptionItems();
        patientHistoryModal.style.display = 'none';
        showToast('تم تحميل الروشتة السابقة');
    });
}

// ---------- حفظ سجل المريض (تُستدعى عند إنهاء الكشف) ----------
async function savePatientRecord(patientId, diagnosis, items) {
    if (!patientId) return;
    const recordRef = push(ref(db, `patient_records/${patientId}`));
    const record = {
        diagnosis: diagnosis,
        items: items,
        doctorId: currentUser.uid,
        doctorName: doctorInfo.name || currentUser.name,
        createdAt: new Date().toISOString(),
        appointmentId: currentAppointment?.id || null
    };
    await set(recordRef, record);
}

// ---------- إنهاء الكشف (معدلة لحفظ السجل) ----------
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
        // 1. حفظ الروشتة الأساسية
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
        
        // 2. حفظ سجل المريض في جدول patient_records
        await savePatientRecord(currentAppointment.patientId, diagnosis, currentPrescription);
        
        // 3. تحديث حالة الموعد
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

// ... (باقي الدوال بدون تغيير: renderPrescriptionItems, updateUnitLabel, drugFormSelect, dose panel, templates, logout, init)

// ---------- بدء التشغيل ----------
(async function init() {
    UI.welcomeMessage.textContent = `د. ${currentUser.name}`;
    await localDrugDB.open();
    await syncDrugsFromFirebase();
    await loadDoctorData(currentUser.uid);
    loadAppointments();
    updateUnitLabel();
})();
