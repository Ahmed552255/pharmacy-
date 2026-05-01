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
let loadedTemplateId = null; // لتتبع القالب المُحمّل

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

/** استخراج اسم المريض بشكل موحد */
function getPatientName(apt) {
    return apt.patient_name || apt.patientName || 'غير معروف';
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

// ---------- تخزين واسترجاع جلسة الكشف الحالية ----------
function saveCurrentSession() {
    if (currentAppointment && currentPrescription.length > 0) {
        const session = {
            appointment: currentAppointment,
            prescription: currentPrescription,
            diagnosis: UI.diagnosisTextarea.value,
            loadedTemplateId: loadedTemplateId
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
                loadedTemplateId = session.loadedTemplateId || null;
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
    updateCurrentPatientUI();
    UI.emptyPrescriptionMsg.style.display = 'none';
    UI.prescriptionContent.style.display = 'block';
    renderPrescriptionItems();
    UI.queueModal.style.display = 'none';
    saveCurrentSession();
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
            saveCurrentSession();
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
                saveCurrentSession();
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
            { text: `${base} يومياً` },
            { text: `${base} كل 8 ساعات` },
            { text: `${base} كل 12 ساعة` },
            { text: `${base} مرة واحدة يومياً` },
            { text: `${base} عند اللزوم` }
        ];
        built.forEach(b => {
            if (!suggestions.some(s => s.text === b.text)) {
                suggestions.push({ text: b.text, isPref: false });
            }
        });
    }

    if (suggestions.length === 0) {
        const defaultSuggestions = [
            { text: `1 ${unit} يومياً` },
            { text: `2 ${unit} يومياً` },
            { text: `1 ${unit} كل 8 ساعات` },
            { text: `1 ${unit} كل 12 ساعة` },
            { text: `1 ${unit} مرة واحدة` }
        ];
        suggestions = defaultSuggestions.map(s => ({ ...s, isPref: false }));
    }

    UI.doseSuggestionsContainer.innerHTML = suggestions.slice(0, 8).map(s => `
        <button class="dose-chip-btn" data-dose-text="${escapeHtml(s.text)}">
            ${escapeHtml(s.text)} ${s.isPref ? '<i class="fas fa-history" style="opacity:0.6; margin-right:4px;"></i>' : ''}
        </button>
    `).join('');

    document.querySelectorAll('.dose-chip-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const doseText = btn.dataset.doseText;
            applyDoseFromSuggestion(doseText);
        });
    });
    
    UI.doseSuggestionsContainer.innerHTML += `
        <button id="customDoseTriggerBtn" class="dose-chip-btn" style="background: var(--primary-light);">
            ✏️ جرعة مخصصة
        </button>
    `;
    document.getElementById('customDoseTriggerBtn').addEventListener('click', () => {
        showCustomDoseInput();
    });
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
    saveCurrentSession();
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
    saveCurrentSession();
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
        saveCurrentSession();
        showToast('تم مسح الوصفة');
    }
});

UI.diagnosisTextarea.addEventListener('input', () => {
    saveCurrentSession();
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
        currentAppointment = null;
        currentPrescription = [];
        loadedTemplateId = null;
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
                    saveCurrentSession();
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
    await localDrugDB.open();                  // يفتح IndexedDB ويقوم بأول مزامنة سحابية بصمت
    await loadDoctorData(currentUser.uid);
    addNewFormOptions();
    loadSavedSession();
    loadAppointments();
    updateUnitLabel();
})();
