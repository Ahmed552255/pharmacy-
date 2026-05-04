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

// ---------- استيراد إدارة الأدوية المحلية (الإصدار الذكي) ----------
import { LocalDrugManager } from './local-drug-manager.js';

// ---------- تهيئة Firebase ----------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ---------- مدير الجلسات المحلية (IndexedDB) ----------
class DoctorSessionManager {
    constructor() {
        this.dbName = 'DoctorSessionsDB';
        this.storeName = 'sessions';
        this.db = null;
    }

    async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'sessionId' });
                }
            };
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async saveSession(sessionData) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            store.put(sessionData);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getSession(sessionId) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const request = store.get(sessionId);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteSession(sessionId) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            store.delete(sessionId);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getAllSessions() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async getActiveSession() {
        return this.getSession('__active__');
    }

    async setActiveSession(sessionId) {
        await this.saveSession({ sessionId: '__active__', activeSessionId: sessionId });
    }

    async clearActiveSession() {
        await this.deleteSession('__active__');
    }
}

const sessionManager = new DoctorSessionManager();

// ---------- تهيئة قاعدة البيانات المحلية الذكية ----------
const localDrugDB = new LocalDrugManager(db, 'drugs');

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
    dosePanel: document.getElementById('dosePanel'),
    selectedDrugDisplay: document.getElementById('selectedDrugDisplay'),
    selectedFormDisplay: document.getElementById('selectedFormDisplay'),
    doseNumberInput: document.getElementById('doseNumberInput'),
    unitLabel: document.getElementById('unitLabel'),
    doseSuggestionsContainer: document.getElementById('doseSuggestionsContainer'),
    applyDoseBtn: document.getElementById('applyDoseBtn'),
    cancelDoseBtn: document.getElementById('cancelDoseBtn'),
    finishBtn: document.getElementById('finishBtn'),
    saveTemplateBtn: document.getElementById('saveTemplateBtn'),
    templatesBtn: document.getElementById('templatesBtn'),
    templatesModal: document.getElementById('templatesModal'),
    saveTemplateModal: document.getElementById('saveTemplateModal'),
    templatesList: document.getElementById('templatesList'),
    closeTemplatesModalBtn: document.getElementById('closeTemplatesModalBtn'),
    closeSaveTemplateModalBtn: document.getElementById('closeSaveTemplateModalBtn'),
    saveAsNewTemplateBtn: document.getElementById('saveAsNewTemplateBtn'),
    overwriteTemplateBtn: document.getElementById('overwriteTemplateBtn'),
    templateNameInput: document.getElementById('templateNameInput'),
    clearPrescriptionBtn: document.getElementById('clearPrescriptionBtn'),
    savedSessionsBtn: document.getElementById('savedSessionsBtn'),          // عنصر جديد
    savedSessionsModal: document.getElementById('savedSessionsModal'),    // مودال جديد
    savedSessionsList: document.getElementById('savedSessionsList'),      // قائمة المودال
    closeSavedSessionsModalBtn: document.getElementById('closeSavedSessionsModalBtn'),
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
let currentPrescription = [];
let favoriteDrugs = new Set();
let doseState = {
    drug: null,
    drug_id: null,
    form: 'tablet',
    quantity: '',
    timing: 'any'
};
let currentQueueTab = 'waiting';
let loadedTemplateId = null;
let activeSessionId = null;       // معرّف الجلسة النشطة في IndexedDB

// ---------- ثوابت ----------
const ACTIVE_SESSION_KEY = '__active__';

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

/** استخراج اسم المريض بشكل موحد */
function getPatientName(apt) {
    return apt.patient_name || apt.patientName || 'غير معروف';
}

// ---------- تخزين الجلسة في IndexedDB ----------
async function saveCurrentSessionToIndexedDB() {
    if (!currentAppointment) return;
    const sessionId = activeSessionId || currentAppointment.id;
    const sessionData = {
        sessionId: sessionId,
        appointment: currentAppointment,
        prescription: currentPrescription,
        diagnosis: UI.diagnosisTextarea.value,
        loadedTemplateId: loadedTemplateId,
        lastUpdated: new Date().toISOString()
    };
    await sessionManager.saveSession(sessionData);
    if (!activeSessionId) {
        activeSessionId = sessionId;
        await sessionManager.setActiveSession(sessionId);
    }
}

async function loadSavedSessionFromIndexedDB() {
    // محاولة استرجاع آخر جلسة نشطة
    const activeSession = await sessionManager.getActiveSession();
    let sessionId = activeSession?.activeSessionId;
    if (!sessionId) {
        // لا توجد جلسة نشطة، جرب أول جلسة موجودة
        const allSessions = await sessionManager.getAllSessions();
        if (allSessions.length > 0) {
            sessionId = allSessions[0].sessionId;
        }
    }
    if (sessionId) {
        const saved = await sessionManager.getSession(sessionId);
        if (saved) {
            currentAppointment = saved.appointment;
            currentPrescription = saved.prescription || [];
            UI.diagnosisTextarea.value = saved.diagnosis || '';
            loadedTemplateId = saved.loadedTemplateId || null;
            activeSessionId = saved.sessionId;
            updateCurrentPatientUI();
            UI.emptyPrescriptionMsg.style.display = 'none';
            UI.prescriptionContent.style.display = 'block';
            renderPrescriptionItems();
            return true;
        }
    }
    return false;
}

async function removeCurrentSessionFromDB() {
    if (activeSessionId) {
        await sessionManager.deleteSession(activeSessionId);
        await sessionManager.clearActiveSession();
        activeSessionId = null;
    }
}

// ---------- عرض المودال الخاص بالمرضى المحفوظين محلياً ----------
function renderSavedSessionsModal() {
    sessionManager.getAllSessions().then(sessions => {
        UI.savedSessionsList.innerHTML = '';
        if (sessions.length === 0) {
            UI.savedSessionsList.innerHTML = '<div class="empty-state">لا توجد جلسات محفوظة</div>';
            return;
        }
        sessions.forEach(s => {
            const div = document.createElement('div');
            div.className = 'queue-item-modal';
            const patientName = getPatientName(s.appointment);
            div.innerHTML = `<b>${escapeHtml(patientName)}</b> - ${s.appointment.time || ''} - ${s.appointment.age || '--'} سنة`;
            div.addEventListener('click', async () => {
                // تفعيل هذه الجلسة
                currentAppointment = s.appointment;
                currentPrescription = s.prescription || [];
                UI.diagnosisTextarea.value = s.diagnosis || '';
                loadedTemplateId = s.loadedTemplateId || null;
                activeSessionId = s.sessionId;
                await sessionManager.setActiveSession(s.sessionId);
                updateCurrentPatientUI();
                UI.emptyPrescriptionMsg.style.display = 'none';
                UI.prescriptionContent.style.display = 'block';
                renderPrescriptionItems();
                UI.savedSessionsModal.style.display = 'none';
            });
            UI.savedSessionsList.appendChild(div);
        });
    });
}

// ---------- دوال الأدوية (باستخدام المدير الذكي) ----------
async function searchDrugsLocal(term, selectedForm = null) {
    if (!term || term.length < 1) return [];
    let drugs = await localDrugDB.searchDrugs(term.toLowerCase().trim(), selectedForm);
    
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
    await localDrugDB.addNewDrug(newDrug);
    return newDrug;
}

async function incrementDrugUsage(drugName, form) {
    const drugs = await localDrugDB.getAllDrugs();
    const drug = drugs.find(d => d.name === drugName && d.form === form);
    if (drug) {
        await localDrugDB.incrementDrugUsage(drug.id);
    } else {
        await addNewDrugToBoth(drugName, form);
    }
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
        const formIcon = { 'tablet':'💊','syrup':'🥄','injection':'💉','suppository':'🧴','drops':'💧','fizzy':'🫧','spray':'💨','cream':'🧴' }[drug.form] || '💊';
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
                specialty: data.specialty || ''
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

    UI.queueModalList.innerHTML = filtered.map(apt => {
        const name = getPatientName(apt);
        return `
        <div class="queue-item-modal" data-id="${apt.id}">
            <b>${escapeHtml(name)}</b> - ${apt.time} - ${apt.age || '--'} سنة
            ${apt.status === 'منتهي' ? '<span style="color:green;">✓ تم</span>' : ''}
        </div>`;
    }).join('');

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
    loadedTemplateId = null;
    activeSessionId = apt.id;   // استخدام معرف الموعد كمعرّف الجلسة المحلية
    updateCurrentPatientUI();
    UI.emptyPrescriptionMsg.style.display = 'none';
    UI.prescriptionContent.style.display = 'block';
    renderPrescriptionItems();
    UI.queueModal.style.display = 'none';
    await saveCurrentSessionToIndexedDB();
}

function updateCurrentPatientUI() {
    if (!currentAppointment) {
        UI.currentPatientCard.style.display = 'none';
        return;
    }
    UI.currentPatientCard.style.display = 'flex';
    UI.currentPatientNameDisplay.textContent = getPatientName(currentAppointment);
    UI.currentPatientAgeDisplay.textContent = `${currentAppointment.age || '--'} سنة`;
}

// --------------------- ملف المريض ---------------------
UI.patientNameClickable.addEventListener('click', () => {
    const patientId = currentAppointment?.patientId || currentAppointment?.patient_id;
    const patientName = currentAppointment ? getPatientName(currentAppointment) : '';
    if (!patientId) {
        showToast('المريض غير مسجل برقم هوية', true);
        return;
    }
    window.location.href = `detail.html?patientId=${patientId}&patientName=${encodeURIComponent(patientName)}`;
});

// ---------------------------------------------------------------------------------

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
                        <button class="icon-btn-sm edit" data-action="edit" data-index="${idx}">
                            <i class="fas fa-edit"></i>
                        </button>
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
            saveCurrentSessionToIndexedDB();
        });
    });

    document.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            const item = currentPrescription[index];
            if (item) {
                doseState.drug = item.drug;
                doseState.form = item.form;
                UI.drugSearchInput.value = item.drug;
                UI.drugFormSelect.value = item.form;
                prepareDosePanel();
                currentPrescription.splice(index, 1);
                renderPrescriptionItems();
                saveCurrentSessionToIndexedDB();
            }
        });
    });
}

// ---------- قائمة وحدات الأشكال الصيدلانية ----------
function updateUnitLabel() {
    const forms = { 
        tablet: 'قرص', 
        syrup: 'مل', 
        injection: 'سم', 
        suppository: 'لبوس', 
        drops: 'نقطة',
        fizzy: 'فوار',
        spray: 'بخة',
        cream: 'جم'
    };
    UI.unitLabel.textContent = forms[UI.drugFormSelect.value] || '';
}

function addNewFormOptions() {
    const select = UI.drugFormSelect;
    if (!select) return;
    const newOptions = [
        { value: 'fizzy', text: '🧊 فوار' },
        { value: 'spray', text: '💨 بخاخ' },
        { value: 'cream', text: '🧴 كريم' }
    ];
    newOptions.forEach(opt => {
        if (!select.querySelector(`option[value="${opt.value}"]`)) {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.text;
            select.appendChild(option);
        }
    });
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
    searchTimeout = setTimeout(() => displayDrugSuggestions(term), 100);
});

UI.drugSuggestions.addEventListener('click', (e) => {
    const item = e.target.closest('[data-drug-name]');
    if (item) {
        doseState.drug = item.dataset.drugName;
        doseState.drug_id = item.dataset.drugId;
        doseState.form = item.dataset.drugForm || 'tablet';
        UI.drugFormSelect.value = doseState.form;
        prepareDosePanel();
    }
});

UI.startAddDrugBtn.addEventListener('click', () => {
    const custom = UI.drugSearchInput.value.trim();
    if (custom) {
        doseState.drug = custom;
        doseState.drug_id = null;
        prepareDosePanel();
    } else {
        showToast('الرجاء إدخال اسم الدواء', true);
    }
});

function prepareDosePanel() {
    if (!doseState.drug) return;
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

// ---------- عرض اقتراحات الجرعات (مبنية على التفضيلات المحفوظة فقط) ----------
function generateDoseSuggestions() {
    const drug = doseState.drug;
    const form = UI.drugFormSelect.value;
    const typed = UI.doseNumberInput.value.trim();

    // تحميل التفضيلات المحفوظة فقط
    const savedPrefs = loadDosePreferences(drug, form);

    // فلترة إذا كتب المستخدم شيئاً (يبحث داخل الجرعات المحفوظة)
    const filtered = typed.length > 0 
        ? savedPrefs.filter(pref => pref.toLowerCase().includes(typed.toLowerCase()))
        : savedPrefs;

    UI.doseSuggestionsContainer.innerHTML = '';

    if (filtered.length > 0) {
        filtered.slice(0, 8).forEach(pref => {
            const chip = document.createElement('button');
            chip.className = 'dose-chip-btn';
            chip.dataset.doseText = pref;
            chip.innerHTML = `${escapeHtml(pref)} <i class="fas fa-history" style="opacity:0.6; margin-right:4px;"></i>`;
            chip.addEventListener('click', () => applyDoseFromSuggestion(pref));
            UI.doseSuggestionsContainer.appendChild(chip);
        });
    } else if (typed.length > 0) {
        // لا توجد تفضيلات مطابقة
        const emptyMsg = document.createElement('div');
        emptyMsg.style.cssText = 'font-size:0.85rem; color:var(--text-light); margin:8px 0;';
        emptyMsg.textContent = 'لا توجد جرعات محفوظة مطابقة';
        UI.doseSuggestionsContainer.appendChild(emptyMsg);
    }

    // زر الجرعة المخصصة دائماً موجود
    const customBtn = document.createElement('button');
    customBtn.id = 'customDoseTriggerBtn';
    customBtn.className = 'dose-chip-btn';
    customBtn.style.background = 'var(--primary-light)';
    customBtn.textContent = '✏️ جرعة مخصصة';
    customBtn.addEventListener('click', () => showCustomDoseInput());
    UI.doseSuggestionsContainer.appendChild(customBtn);
}

async function applyDoseFromSuggestion(doseText) {
    if (!doseState.drug || !doseText) return;
    const formValue = UI.drugFormSelect.value;
    const formText = UI.drugFormSelect.options[UI.drugFormSelect.selectedIndex].text;

    if (!doseState.drug_id) {
        const newDrug = await addNewDrugToBoth(doseState.drug, formValue);
        doseState.drug_id = newDrug.id;
    }

    currentPrescription.push({
        drug_id: doseState.drug_id,
        drug: doseState.drug,
        form: formText,
        dose: doseText
    });

    await incrementDrugUsage(doseState.drug, formValue);
    saveDosePreference(doseState.drug, formValue, doseText);
    renderPrescriptionItems();
    saveCurrentSessionToIndexedDB();
    resetDosePanel();
}

function showCustomDoseInput() {
    const customDose = prompt('أدخل الجرعة كاملة (مثال: 2 قرص بعد الأكل):');
    if (customDose && customDose.trim()) {
        applyDoseFromSuggestion(customDose.trim());
    }
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

    if (!doseState.drug_id) {
        const newDrug = await addNewDrugToBoth(doseState.drug, formValue);
        doseState.drug_id = newDrug.id;
    }

    currentPrescription.push({
        drug_id: doseState.drug_id,
        drug: doseState.drug,
        form: formText,
        dose: doseString
    });

    await incrementDrugUsage(doseState.drug, formValue);
    saveDosePreference(doseState.drug, formValue, doseString);
    renderPrescriptionItems();
    saveCurrentSessionToIndexedDB();
    resetDosePanel();
});

function resetDosePanel() {
    UI.dosePanel.style.display = 'none';
    doseState = {
        drug: null,
        drug_id: null,
        form: 'tablet',
        quantity: '',
        timing: 'any'
    };
    UI.drugSearchInput.value = '';
    UI.drugSuggestions.style.display = 'none';
}

UI.cancelDoseBtn.addEventListener('click', resetDosePanel);

UI.clearPrescriptionBtn.addEventListener('click', () => {
    if (currentPrescription.length === 0) return;
    if (confirm('هل أنت متأكد من مسح جميع الأدوية من الوصفة؟')) {
        currentPrescription = [];
        loadedTemplateId = null;
        renderPrescriptionItems();
        saveCurrentSessionToIndexedDB();
        showToast('تم مسح الوصفة');
    }
});

UI.diagnosisTextarea.addEventListener('input', () => {
    saveCurrentSessionToIndexedDB();
});

// ---------- إنهاء الكشف ----------
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
        const prescriptionId = currentAppointment.id;
        
        let patientName = getPatientName(currentAppointment);
        if (patientName === 'غير معروف' && currentAppointment.patient_id) {
            const patientSnap = await get(ref(db, `patients/${currentAppointment.patient_id}`));
            if (patientSnap.exists()) {
                patientName = patientSnap.val().name || patientName;
            }
        }

        const updates = {};
        
        const prescriptionData = {
            patient_id: currentAppointment.patient_id || currentAppointment.patientId || '',
            patient_name: patientName,
            doctor_id: currentUser.uid,
            diagnosis: diagnosis,
            created_at: now,
            status: 'لم تصرف بعد',
            pharmacist_id: '',
            pharmacist_name: '',
            dispensed_at: '',
            item_count: currentPrescription.length
        };

        if (loadedTemplateId) {
            prescriptionData.template_id = loadedTemplateId;
        } else {
            currentPrescription.forEach((item, index) => {
                updates[`prescription_items/${prescriptionId}/item_${index}`] = {
                    drug_id: item.drug_id,
                    dose: item.dose,
                    form: item.form
                };
            });
        }

        updates[`prescriptions/${prescriptionId}`] = prescriptionData;
        updates[`appointments/${currentAppointment.id}/status`] = 'منتهي';
        
        await update(ref(db), updates);
        
        showToast('✅ تم إنهاء الكشف وحفظ الروشتة بنجاح');
        await removeCurrentSessionFromDB();   // مسح الجلسة المحلية
        currentAppointment = null;
        currentPrescription = [];
        loadedTemplateId = null;
        UI.currentPatientCard.style.display = 'none';
        UI.emptyPrescriptionMsg.style.display = 'block';
        UI.prescriptionContent.style.display = 'none';
        UI.diagnosisTextarea.value = '';
        // لا داعي لمسح localStorage بعد الآن
    } catch (err) {
        console.error('فشل الحفظ:', err);
        showToast('حدث خطأ أثناء حفظ البيانات', true);
    }
});

// ---------- القوالب ----------
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
                div.style.cssText = 'padding:12px; cursor:pointer; border-bottom:1px solid #eee; display: flex; justify-content: space-between; align-items: center;';
                div.innerHTML = `<div><b>${escapeHtml(t.name)}</b><br><small>${t.itemCount || 0} أصناف</small></div>`;
                
                const selectBtn = document.createElement('button');
                selectBtn.textContent = 'تحميل';
                selectBtn.className = 'btn btn-outline';
                selectBtn.style.padding = '4px 12px';
                selectBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
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
                    loadedTemplateId = id;
                    renderPrescriptionItems();
                    saveCurrentSessionToIndexedDB();
                    UI.templatesModal.style.display = 'none';
                    showToast(`تم تحميل القالب: ${t.name}`);
                });
                div.appendChild(selectBtn);
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
    UI.templateNameInput.value = '';
    UI.saveTemplateModal.style.display = 'flex';
    UI.templateNameInput.focus();
});

async function saveAsNewTemplate(name) {
    const templateId = push(ref(db, `prescription_templates/${currentUser.uid}`)).key;
    const templateData = {
        name: name,
        diagnosis: UI.diagnosisTextarea.value.trim(),
        doctor_id: currentUser.uid,
        created_at: new Date().toISOString(),
        itemCount: currentPrescription.length
    };
    const updates = {};
    updates[`prescription_templates/${currentUser.uid}/${templateId}`] = templateData;
    
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
    } catch (err) {
        showToast('فشل حفظ القالب', true);
    }
}

UI.saveAsNewTemplateBtn.addEventListener('click', async () => {
    const name = UI.templateNameInput.value.trim();
    if (!name) {
        showToast('الرجاء إدخال اسم للقالب', true);
        return;
    }
    await saveAsNewTemplate(name);
    UI.saveTemplateModal.style.display = 'none';
});

if (UI.overwriteTemplateBtn) {
    UI.overwriteTemplateBtn.addEventListener('click', async () => {
        const name = UI.templateNameInput.value.trim();
        if (!name) {
            showToast('الرجاء إدخال اسم للقالب', true);
            return;
        }
        await saveAsNewTemplate(name);
        showToast('تم إنشاء قالب جديد مع الاحتفاظ بالقديم');
        UI.saveTemplateModal.style.display = 'none';
    });
}

// ---------- إدارة المودالات ----------
UI.queueModalBtn.addEventListener('click', () => {
    UI.queueModal.style.display = 'flex';
    renderQueueModalList();
});
UI.closeQueueModalBtn.addEventListener('click', () => UI.queueModal.style.display = 'none');
UI.closeTemplatesModalBtn.addEventListener('click', () => UI.templatesModal.style.display = 'none');
UI.closeSaveTemplateModalBtn.addEventListener('click', () => UI.saveTemplateModal.style.display = 'none');

// ---------- مودال المرضى المحفوظين محلياً ----------
UI.savedSessionsBtn.addEventListener('click', () => {
    UI.savedSessionsModal.style.display = 'flex';
    renderSavedSessionsModal();
});
UI.closeSavedSessionsModalBtn.addEventListener('click', () => UI.savedSessionsModal.style.display = 'none');

UI.queueTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        UI.queueTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentQueueTab = tab.dataset.queueTab;
        renderQueueModalList();
    });
});

window.addEventListener('click', (e) => {
    if (e.target === UI.queueModal) UI.queueModal.style.display = 'none';
    if (e.target === UI.templatesModal) UI.templatesModal.style.display = 'none';
    if (e.target === UI.saveTemplateModal) UI.saveTemplateModal.style.display = 'none';
    if (e.target === UI.savedSessionsModal) UI.savedSessionsModal.style.display = 'none';
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
    await sessionManager.open();            // فتح قاعدة بيانات الجلسات المحلية
    await localDrugDB.open();
    UI.welcomeMessage.textContent = `د. ${currentUser.name}`;
    await loadDoctorData(currentUser.uid);
    addNewFormOptions();
    
    // استرجاع آخر جلسة نشطة (أو أي جلسة محفوظة)
    const restored = await loadSavedSessionFromIndexedDB();
    if (!restored) {
        // في حال عدم وجود جلسات محلية تبقى الشاشة فارغة لحين الاختيار
        UI.currentPatientCard.style.display = 'none';
        UI.prescriptionContent.style.display = 'none';
    }
    
    loadAppointments();
    updateUnitLabel();
})();
