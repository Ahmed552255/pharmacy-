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
    remove,
    query,
    orderByChild,
    equalTo
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-database.js";

import { LocalDrugManager } from './local-drug-manager.js';

// ---------- تهيئة Firebase ----------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ============================================================
// مدير الجلسات المحلية (IndexedDB)
// ============================================================
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
            request.onsuccess = (event) => { this.db = event.target.result; resolve(); };
            request.onerror  = (event) => reject(event.target.error);
        });
    }

    _tx(mode = 'readonly') {
        return this.db.transaction(this.storeName, mode).objectStore(this.storeName);
    }

    saveSession(data)       { return new Promise((res, rej) => { const r = this._tx('readwrite').put(data);  r.onsuccess = res; r.onerror = () => rej(r.error); }); }
    getSession(id)          { return new Promise((res, rej) => { const r = this._tx().get(id);               r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); }); }
    deleteSession(id)       { return new Promise((res, rej) => { const r = this._tx('readwrite').delete(id); r.onsuccess = res; r.onerror = () => rej(r.error); }); }
    getAllSessions()         { return new Promise((res, rej) => { const r = this._tx().getAll();              r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); }); }
    getActiveSession()      { return this.getSession('__active__'); }
    setActiveSession(id)    { return this.saveSession({ sessionId: '__active__', activeSessionId: id }); }
    clearActiveSession()    { return this.deleteSession('__active__'); }
}

const sessionManager = new DoctorSessionManager();
const localDrugDB    = new LocalDrugManager(db, 'drugs');

// ============================================================
// عناصر واجهة المستخدم
// ============================================================
const UI = {
    welcomeMessage:             document.getElementById('welcomeMessage'),
    queueModalBtn:              document.getElementById('queueModalBtn'),
    queueBadgeCount:            document.getElementById('queueBadgeCount'),
    queueModal:                 document.getElementById('queueModal'),
    closeQueueModalBtn:         document.getElementById('closeQueueModalBtn'),
    queueTabs:                  document.querySelectorAll('.queue-tab'),
    queueModalList:             document.getElementById('queueModalList'),
    waitingTabCount:            document.getElementById('waitingTabCount'),
    doneTabCount:               document.getElementById('doneTabCount'),
    currentPatientCard:         document.getElementById('currentPatientCard'),
    currentPatientNameDisplay:  document.getElementById('currentPatientNameDisplay'),
    currentPatientAgeDisplay:   document.getElementById('currentPatientAgeDisplay'),
    patientNameClickable:       document.getElementById('patientNameClickable'),
    diagnosisTextarea:          document.getElementById('diagnosisTextarea'),
    emptyPrescriptionMsg:       document.getElementById('emptyPrescriptionMsg'),
    prescriptionContent:        document.getElementById('prescriptionContent'),
    rxItemsContainer:           document.getElementById('rxItemsContainer'),
    drugSearchInput:            document.getElementById('drugSearchInput'),
    drugSuggestions:            document.getElementById('drugSuggestions'),
    drugFormSelect:             document.getElementById('drugFormSelect'),
    startAddDrugBtn:            document.getElementById('startAddDrugBtn'),
    dosePanel:                  document.getElementById('dosePanel'),
    selectedDrugDisplay:        document.getElementById('selectedDrugDisplay'),
    selectedFormDisplay:        document.getElementById('selectedFormDisplay'),
    doseNumberInput:            document.getElementById('doseNumberInput'),
    unitLabel:                  document.getElementById('unitLabel'),
    doseSuggestionsContainer:   document.getElementById('doseSuggestionsContainer'),
    applyDoseBtn:               document.getElementById('applyDoseBtn'),
    cancelDoseBtn:              document.getElementById('cancelDoseBtn'),
    finishBtn:                  document.getElementById('finishBtn'),
    saveTemplateBtn:            document.getElementById('saveTemplateBtn'),
    templatesBtn:               document.getElementById('templatesBtn'),
    templatesModal:             document.getElementById('templatesModal'),
    saveTemplateModal:          document.getElementById('saveTemplateModal'),
    templatesList:              document.getElementById('templatesList'),
    closeTemplatesModalBtn:     document.getElementById('closeTemplatesModalBtn'),
    closeSaveTemplateModalBtn:  document.getElementById('closeSaveTemplateModalBtn'),
    saveAsNewTemplateBtn:       document.getElementById('saveAsNewTemplateBtn'),
    overwriteTemplateBtn:       document.getElementById('overwriteTemplateBtn'),
    templateNameInput:          document.getElementById('templateNameInput'),
    clearPrescriptionBtn:       document.getElementById('clearPrescriptionBtn'),
    savedSessionsBtn:           document.getElementById('savedSessionsBtn'),
    savedSessionsModal:         document.getElementById('savedSessionsModal'),
    savedSessionsList:          document.getElementById('savedSessionsList'),
    closeSavedSessionsModalBtn: document.getElementById('closeSavedSessionsModalBtn'),
    logoutBtn:                  document.getElementById('logoutBtn')
};

// ============================================================
// التحقق من الجلسة
// ============================================================
const sessionUid  = sessionStorage.getItem('userUid');
const sessionRole = sessionStorage.getItem('userRole');
const sessionName = sessionStorage.getItem('userName');

if (!sessionUid || sessionRole !== 'doctor') {
    sessionStorage.clear();
    window.location.replace('index.html');
    throw new Error('جلسة غير صالحة.');
}

// ============================================================
// الحالة العامة
// ============================================================
const currentUser = { uid: sessionUid, name: sessionName || 'طبيب' };

let doctorInfo        = { name: currentUser.name, specialty: '' };
let todayAppointments = [];
let currentAppointment  = null;
let currentPrescription = [];
let favoriteDrugs       = new Set();
let doseState = { drug: null, drug_id: null, form: 'tablet', quantity: '', timing: 'any' };
let currentQueueTab  = 'waiting';
let loadedTemplateId = null;
let activeSessionId  = null;

// ============================================================
// دوال مساعدة
// ============================================================
function getLocalDateString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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

function getPatientName(apt) {
    return apt.patient_name || apt.patientName || 'غير معروف';
}

// ============================================================
// حوار تأكيد مخصص (بديل ودود لـ confirm/prompt)
// ============================================================
function createDialog(html, buttons) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed; inset:0; background:rgba(0,0,0,0.45);
            display:flex; align-items:center; justify-content:center; z-index:9999;
        `;
        const box = document.createElement('div');
        box.style.cssText = `
            background:#fff; border-radius:14px; padding:24px 20px 18px;
            min-width:300px; max-width:90vw; box-shadow:0 8px 32px rgba(0,0,0,0.18);
            font-family:inherit; text-align:center;
        `;
        box.innerHTML = html;
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex; gap:10px; margin-top:18px; justify-content:center; flex-wrap:wrap;';
        buttons.forEach(({ label, style, value }) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = `
                padding:9px 22px; border-radius:8px; border:none; cursor:pointer;
                font-size:0.95rem; font-family:inherit; font-weight:600;
                ${style || 'background:#eee; color:#333;'}
            `;
            b.addEventListener('click', () => { document.body.removeChild(overlay); resolve(value); });
            btnRow.appendChild(b);
        });
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    });
}

async function confirmDialog(msg) {
    return createDialog(`<p style="margin:0;font-size:1rem;color:#333;">${msg}</p>`, [
        { label: 'نعم', style: 'background:#B23B3B; color:#fff;', value: true },
        { label: 'إلغاء', style: 'background:#eee; color:#555;', value: false }
    ]);
}

async function promptDialog(msg, defaultVal = '') {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed; inset:0; background:rgba(0,0,0,0.45);
            display:flex; align-items:center; justify-content:center; z-index:9999;
        `;
        const box = document.createElement('div');
        box.style.cssText = `
            background:#fff; border-radius:14px; padding:24px 20px 18px;
            min-width:300px; max-width:90vw; box-shadow:0 8px 32px rgba(0,0,0,0.18);
            font-family:inherit;
        `;
        box.innerHTML = `<p style="margin:0 0 12px;font-size:1rem;color:#333;text-align:center;">${msg}</p>`;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = defaultVal;
        input.style.cssText = `
            width:100%; box-sizing:border-box; padding:10px 12px; border-radius:8px;
            border:1.5px solid #ccc; font-size:1rem; font-family:inherit; outline:none;
            direction:rtl;
        `;
        input.addEventListener('focus', () => input.style.borderColor = 'var(--primary, #c8784a)');
        input.addEventListener('blur',  () => input.style.borderColor = '#ccc');
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex; gap:10px; margin-top:14px; justify-content:center;';
        const okBtn = document.createElement('button');
        okBtn.textContent = 'حفظ';
        okBtn.style.cssText = 'padding:9px 22px; border-radius:8px; border:none; cursor:pointer; font-size:0.95rem; font-family:inherit; font-weight:600; background:var(--primary,#c8784a); color:#fff;';
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'إلغاء';
        cancelBtn.style.cssText = 'padding:9px 22px; border-radius:8px; border:none; cursor:pointer; font-size:0.95rem; font-family:inherit; font-weight:600; background:#eee; color:#555;';
        okBtn.addEventListener('click', () => { document.body.removeChild(overlay); resolve(input.value.trim() || null); });
        cancelBtn.addEventListener('click', () => { document.body.removeChild(overlay); resolve(null); });
        input.addEventListener('keydown', e => { if (e.key === 'Enter') okBtn.click(); if (e.key === 'Escape') cancelBtn.click(); });
        btnRow.appendChild(okBtn);
        btnRow.appendChild(cancelBtn);
        box.appendChild(input);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        setTimeout(() => { input.focus(); input.select(); }, 50);
    });
}

// ============================================================
// حفظ / تحميل الجلسة (IndexedDB)
// ============================================================
async function saveCurrentSessionToIndexedDB() {
    if (!currentAppointment) return;
    const sessionId = activeSessionId || currentAppointment.id;
    await sessionManager.saveSession({
        sessionId,
        appointment:      currentAppointment,
        prescription:     currentPrescription,
        diagnosis:        UI.diagnosisTextarea.value,
        loadedTemplateId: loadedTemplateId,
        lastUpdated:      new Date().toISOString()
    });
    if (!activeSessionId) {
        activeSessionId = sessionId;
        await sessionManager.setActiveSession(sessionId);
    }
}

async function loadSavedSessionFromIndexedDB() {
    const activeSession = await sessionManager.getActiveSession();
    let sessionId = activeSession?.activeSessionId;
    if (!sessionId) {
        const all = await sessionManager.getAllSessions();
        if (all.length) sessionId = all[0].sessionId;
    }
    if (sessionId) {
        const saved = await sessionManager.getSession(sessionId);
        if (saved) {
            currentAppointment  = saved.appointment;
            currentPrescription = saved.prescription || [];
            UI.diagnosisTextarea.value = saved.diagnosis || '';
            loadedTemplateId = saved.loadedTemplateId || null;
            activeSessionId  = saved.sessionId;
            updateCurrentPatientUI();
            UI.emptyPrescriptionMsg.style.display = 'none';
            UI.prescriptionContent.style.display  = 'block';
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

// ============================================================
// عرض مودال الجلسات المحفوظة
// ============================================================
function renderSavedSessionsModal() {
    sessionManager.getAllSessions().then(sessions => {
        UI.savedSessionsList.innerHTML = '';
        if (!sessions.length) {
            UI.savedSessionsList.innerHTML = '<div class="empty-state">لا توجد جلسات محفوظة</div>';
            return;
        }
        sessions.forEach(s => {
            const div = document.createElement('div');
            div.className = 'queue-item-modal';
            div.innerHTML = `<b>${escapeHtml(getPatientName(s.appointment))}</b> - ${s.appointment.time || ''} - ${s.appointment.age || '--'} سنة`;
            div.addEventListener('click', async () => {
                currentAppointment  = s.appointment;
                currentPrescription = s.prescription || [];
                UI.diagnosisTextarea.value = s.diagnosis || '';
                loadedTemplateId = s.loadedTemplateId || null;
                activeSessionId  = s.sessionId;
                await sessionManager.setActiveSession(s.sessionId);
                updateCurrentPatientUI();
                UI.emptyPrescriptionMsg.style.display = 'none';
                UI.prescriptionContent.style.display  = 'block';
                renderPrescriptionItems();
                UI.savedSessionsModal.style.display = 'none';
            });
            UI.savedSessionsList.appendChild(div);
        });
    });
}

// ============================================================
// إدارة الأدوية (بحث + تعديل + حذف)
// ============================================================
async function searchDrugsLocal(term, selectedForm = null) {
    if (!term || term.length < 1) return [];
    let drugs = await localDrugDB.searchDrugs(term.toLowerCase().trim(), selectedForm);
    drugs = drugs.map(d => ({ ...d, isFavorite: favoriteDrugs.has(d.name) || (d.frequency > 3) }));
    drugs.sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return (b.frequency || 0) - (a.frequency || 0);
    });
    return drugs.slice(0, 15);
}

async function addNewDrugToBoth(name, form, strength = '', price = null) {
    const drugId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const newDrug = {
        id: drugId,
        name: name.trim(),
        genericName: '',
        form,
        strength,
        price,
        frequency: 1,
        createdAt: new Date().toISOString()
    };
    await localDrugDB.addNewDrug(newDrug);
    // مزامنة مع Firebase
    try {
        await set(ref(db, `drugs_catalog/${currentUser.uid}/${drugId}`), newDrug);
    } catch (_) {}
    return newDrug;
}

async function incrementDrugUsage(drugName, form) {
    const drugs  = await localDrugDB.getAllDrugs();
    const drug   = drugs.find(d => d.name === drugName && d.form === form);
    if (drug) {
        await localDrugDB.incrementDrugUsage(drug.id);
        // مزامنة عداد الاستخدام
        try {
            await update(ref(db, `drugs_catalog/${currentUser.uid}/${drug.id}`), {
                frequency: (drug.frequency || 0) + 1
            });
        } catch (_) {}
    } else {
        await addNewDrugToBoth(drugName, form);
    }
}

// تعديل اسم دواء في كل مكان (محلي + سحابي + الوصفة الحالية)
async function renameDrug(drug) {
    const newName = await promptDialog('تعديل اسم الدواء:', drug.name);
    if (!newName || newName === drug.name) return;

    // تحديث المحلي
    drug.name = newName;
    await localDrugDB.updateDrug(drug.id, { name: newName });

    // تحديث السحابي
    try {
        await update(ref(db, `drugs_catalog/${currentUser.uid}/${drug.id}`), { name: newName });
    } catch (_) {}

    // تحديث الوصفة الحالية إن وُجد فيها
    let changed = false;
    currentPrescription.forEach(item => {
        if (item.drug_id === drug.id) { item.drug = newName; changed = true; }
    });
    if (changed) { renderPrescriptionItems(); saveCurrentSessionToIndexedDB(); }

    showToast(`✅ تم تعديل اسم الدواء إلى "${newName}"`);
    // إعادة عرض الاقتراحات إن كان مربع البحث مفتوحاً
    if (UI.drugSearchInput.value.trim()) {
        displayDrugSuggestions(UI.drugSearchInput.value.trim());
    }
}

// حذف دواء من كل مكان
async function deleteDrug(drug) {
    const ok = await confirmDialog(`هل تريد حذف دواء "<b>${escapeHtml(drug.name)}</b>" نهائياً من القائمة؟`);
    if (!ok) return;

    await localDrugDB.deleteDrug(drug.id);

    try {
        await remove(ref(db, `drugs_catalog/${currentUser.uid}/${drug.id}`));
    } catch (_) {}

    // إزالته من الوصفة الحالية
    const before = currentPrescription.length;
    currentPrescription = currentPrescription.filter(i => i.drug_id !== drug.id);
    if (currentPrescription.length !== before) { renderPrescriptionItems(); saveCurrentSessionToIndexedDB(); }

    showToast(`🗑️ تم حذف "${drug.name}"`);
    if (UI.drugSearchInput.value.trim()) {
        displayDrugSuggestions(UI.drugSearchInput.value.trim());
    } else {
        UI.drugSuggestions.style.display = 'none';
    }
}

// ============================================================
// عرض اقتراحات الأدوية مع أزرار تعديل / حذف
// ============================================================
async function displayDrugSuggestions(term) {
    const selectedForm = UI.drugFormSelect.value;
    const matches      = await searchDrugsLocal(term, selectedForm);

    if (!matches.length) {
        UI.drugSuggestions.innerHTML = `
            <div class="suggestion-item" id="addNewDrugOption" style="background:#FEF5EC; cursor:pointer;">
                <i class="fas fa-plus-circle" style="color:var(--primary);"></i>
                <span>إضافة "<b>${escapeHtml(term)}</b>" كدواء جديد (${UI.drugFormSelect.options[UI.drugFormSelect.selectedIndex].text})</span>
            </div>`;
        UI.drugSuggestions.style.display = 'block';
        document.getElementById('addNewDrugOption').addEventListener('click', () => addNewDrugFromSearch(term));
        return;
    }

    UI.drugSuggestions.innerHTML = matches.map(drug => {
        const favIcon  = drug.isFavorite ? '<span class="favorites-tag"><i class="fas fa-star"></i> مفضل</span>' : '';
        const formIcon = { tablet:'💊', syrup:'🥄', injection:'💉', suppository:'🧴', drops:'💧', fizzy:'🫧', spray:'💨', cream:'🧴' }[drug.form] || '💊';
        const badge    = drug.strength ? `<span class="strength-info">${escapeHtml(drug.strength)}</span>` : '';
        const usage    = drug.frequency ? `<span class="usage-count">(${drug.frequency})</span>` : '';
        return `
        <div class="suggestion-item suggestion-item--editable"
             data-drug-name="${escapeHtml(drug.name)}"
             data-drug-id="${drug.id}"
             data-drug-form="${escapeHtml(drug.form)}"
             data-drug-strength="${escapeHtml(drug.strength || '')}">
            <div class="suggestion-main" style="flex:1; cursor:pointer;" data-action="select">
                <span class="drug-name">${formIcon} ${escapeHtml(drug.name)}</span>
                ${favIcon} ${usage}
            </div>
            <div class="suggestion-details">${badge}</div>
            <div class="suggestion-actions" style="display:flex; gap:4px; margin-right:8px; flex-shrink:0;">
                <button class="icon-btn-sm edit" data-action="rename-drug" title="تعديل الاسم"
                        style="padding:3px 7px; font-size:0.78rem;">
                    <i class="fas fa-pencil-alt"></i>
                </button>
                <button class="icon-btn-sm" data-action="delete-drug" title="حذف الدواء"
                        style="padding:3px 7px; font-size:0.78rem; color:#B23B3B;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>`;
    }).join('');

    UI.drugSuggestions.style.display = 'block';

    // ربط الأحداث
    UI.drugSuggestions.querySelectorAll('.suggestion-item--editable').forEach(el => {
        const drug = {
            id:       el.dataset.drugId,
            name:     el.dataset.drugName,
            form:     el.dataset.drugForm,
            strength: el.dataset.drugStrength
        };
        // اختيار الدواء عند الضغط على المنطقة الرئيسية
        el.querySelector('[data-action="select"]').addEventListener('click', () => {
            doseState.drug    = drug.name;
            doseState.drug_id = drug.id;
            doseState.form    = drug.form || 'tablet';
            UI.drugFormSelect.value = doseState.form;
            prepareDosePanel();
        });
        // تعديل الاسم
        el.querySelector('[data-action="rename-drug"]').addEventListener('click', async (e) => {
            e.stopPropagation();
            const allDrugs = await localDrugDB.getAllDrugs();
            const full = allDrugs.find(d => d.id === drug.id) || drug;
            await renameDrug(full);
        });
        // حذف
        el.querySelector('[data-action="delete-drug"]').addEventListener('click', async (e) => {
            e.stopPropagation();
            await deleteDrug(drug);
        });
    });
}

async function addNewDrugFromSearch(name) {
    const form    = UI.drugFormSelect.value;
    const newDrug = await addNewDrugToBoth(name, form);
    doseState.drug    = newDrug.name;
    doseState.drug_id = newDrug.id;
    prepareDosePanel();
    showToast(`تمت إضافة "${name}" إلى قائمة الأدوية`);
    UI.drugSuggestions.style.display = 'none';
}

// ============================================================
// تحميل بيانات الطبيب
// ============================================================
async function loadDoctorData(uid) {
    try {
        const snap = await get(ref(db, `users/${uid}`));
        if (snap.exists()) {
            doctorInfo = { ...doctorInfo, ...snap.val() };
            UI.welcomeMessage.textContent = `د. ${doctorInfo.name || currentUser.name}`;
        } else {
            UI.welcomeMessage.textContent = `د. ${currentUser.name}`;
        }
        const favSnap = await get(ref(db, `favorites/${uid}`));
        if (favSnap.exists()) favoriteDrugs = new Set(Object.values(favSnap.val()));
    } catch (err) {
        console.error('فشل تحميل بيانات الطبيب:', err);
        showToast('تعذر تحميل بعض البيانات', true);
    }
}

// ============================================================
// تحميل المواعيد
// ============================================================
function loadAppointments() {
    const q = query(ref(db, 'appointments'), orderByChild('doctor_id'), equalTo(currentUser.uid));
    onValue(q, (snap) => {
        const all = [];
        snap.forEach(child => {
            const apt = { id: child.key, ...child.val() };
            if (apt.date === today && apt.status !== 'ملغي') all.push(apt);
        });
        all.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        todayAppointments = all;
        updateQueueBadgeAndModal();
    }, err => { console.error(err); showToast('خطأ في تحميل قائمة الانتظار', true); });
}

function updateQueueBadgeAndModal() {
    const waitingCount = todayAppointments.filter(a => a.status === 'انتظار').length;
    const doneCount    = todayAppointments.filter(a => a.status === 'منتهي').length;
    UI.queueBadgeCount.textContent = waitingCount;
    UI.waitingTabCount.textContent = waitingCount;
    UI.doneTabCount.textContent    = doneCount;
    renderQueueModalList();
}

function renderQueueModalList() {
    const filtered = todayAppointments.filter(a =>
        currentQueueTab === 'waiting' ? a.status === 'انتظار' : a.status === 'منتهي'
    );
    if (!filtered.length) {
        UI.queueModalList.innerHTML = '<div class="empty-state">لا يوجد مرضى في هذه القائمة</div>';
        return;
    }
    UI.queueModalList.innerHTML = filtered.map(apt => `
        <div class="queue-item-modal" data-id="${apt.id}">
            <b>${escapeHtml(getPatientName(apt))}</b> - ${apt.time} - ${apt.age || '--'} سنة
            ${apt.status === 'منتهي' ? '<span style="color:green;">✓ تم</span>' : ''}
        </div>`).join('');
    document.querySelectorAll('.queue-item-modal').forEach(el => {
        el.addEventListener('click', () => selectPatientFromQueue(el.dataset.id));
    });
}

async function selectPatientFromQueue(appointmentId) {
    const apt = todayAppointments.find(a => a.id === appointmentId);
    if (!apt) return;
    if (apt.status === 'منتهي') { showToast('لا يمكن اختيار مريض منتهي الكشف', true); return; }
    if (apt.status === 'انتظار') {
        await update(ref(db, `appointments/${appointmentId}`), { status: 'قيد الكشف' });
    }
    currentAppointment  = apt;
    currentPrescription = [];
    UI.diagnosisTextarea.value = '';
    loadedTemplateId = null;
    activeSessionId  = apt.id;
    updateCurrentPatientUI();
    UI.emptyPrescriptionMsg.style.display = 'none';
    UI.prescriptionContent.style.display  = 'block';
    renderPrescriptionItems();
    UI.queueModal.style.display = 'none';
    await saveCurrentSessionToIndexedDB();
}

function updateCurrentPatientUI() {
    if (!currentAppointment) { UI.currentPatientCard.style.display = 'none'; return; }
    UI.currentPatientCard.style.display    = 'flex';
    UI.currentPatientNameDisplay.textContent = getPatientName(currentAppointment);
    UI.currentPatientAgeDisplay.textContent  = `${currentAppointment.age || '--'} سنة`;
}

UI.patientNameClickable.addEventListener('click', () => {
    const patientId   = currentAppointment?.patientId || currentAppointment?.patient_id;
    const patientName = currentAppointment ? getPatientName(currentAppointment) : '';
    if (!patientId) { showToast('المريض غير مسجل برقم هوية', true); return; }
    window.location.href = `detail.html?patientId=${patientId}&patientName=${encodeURIComponent(patientName)}`;
});

// ============================================================
// عرض الوصفة مع تعديل الجرعة + الاسم
// ============================================================
function renderPrescriptionItems() {
    if (!currentPrescription.length) {
        UI.rxItemsContainer.innerHTML = '<div class="empty-state">لم تُضِف أي أدوية بعد</div>';
        return;
    }
    UI.rxItemsContainer.innerHTML = currentPrescription.map((item, idx) => `
        <div class="rx-item" data-index="${idx}">
            <div class="rx-main-row">
                <div class="rx-drug-info">
                    <span class="rx-drug-name" data-action="edit-rx-name" data-index="${idx}"
                          style="cursor:pointer; text-decoration:underline dotted; text-decoration-color:#aaa;"
                          title="انقر لتعديل اسم الدواء">
                        ${escapeHtml(item.drug)}
                    </span>
                    <span class="rx-form-badge">${escapeHtml(item.form)}</span>
                </div>
                <div class="rx-dose-info">
                    <span class="rx-dose-text" data-action="edit-rx-dose" data-index="${idx}"
                          style="cursor:pointer; text-decoration:underline dotted; text-decoration-color:#aaa;"
                          title="انقر لتعديل الجرعة">
                        ${escapeHtml(item.dose)}
                    </span>
                    <div class="rx-actions">
                        <button class="icon-btn-sm edit" data-action="edit" data-index="${idx}" title="تعديل">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="icon-btn-sm" data-action="remove" data-index="${idx}" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>`).join('');

    UI.rxItemsContainer.querySelectorAll('[data-action="remove"]').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPrescription.splice(parseInt(btn.dataset.index), 1);
            renderPrescriptionItems();
            saveCurrentSessionToIndexedDB();
        });
    });

    UI.rxItemsContainer.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx  = parseInt(btn.dataset.index);
            const item = currentPrescription[idx];
            if (!item) return;
            doseState.drug    = item.drug;
            doseState.form    = item.form;
            UI.drugSearchInput.value    = item.drug;
            UI.drugFormSelect.value     = item.form;
            prepareDosePanel();
            currentPrescription.splice(idx, 1);
            renderPrescriptionItems();
            saveCurrentSessionToIndexedDB();
        });
    });

    // تعديل اسم الدواء في الوصفة مباشرة
    UI.rxItemsContainer.querySelectorAll('[data-action="edit-rx-name"]').forEach(span => {
        span.addEventListener('click', async () => {
            const idx  = parseInt(span.dataset.index);
            const item = currentPrescription[idx];
            if (!item) return;
            const newName = await promptDialog('تعديل اسم الدواء:', item.drug);
            if (!newName) return;
            item.drug = newName;
            renderPrescriptionItems();
            saveCurrentSessionToIndexedDB();
            showToast('✅ تم تعديل اسم الدواء');
        });
    });

    // تعديل الجرعة مباشرة
    UI.rxItemsContainer.querySelectorAll('[data-action="edit-rx-dose"]').forEach(span => {
        span.addEventListener('click', async () => {
            const idx  = parseInt(span.dataset.index);
            const item = currentPrescription[idx];
            if (!item) return;
            const newDose = await promptDialog('تعديل الجرعة:', item.dose);
            if (!newDose) return;
            item.dose = newDose;
            // حفظ التفضيل الجديد
            saveDosePreference(item.drug, item.form, newDose);
            renderPrescriptionItems();
            saveCurrentSessionToIndexedDB();
            showToast('✅ تم تعديل الجرعة');
        });
    });
}

// ============================================================
// وحدات الأشكال الصيدلانية
// ============================================================
const FORM_UNITS = {
    tablet: 'قرص', syrup: 'مل', injection: 'سم',
    suppository: 'لبوس', drops: 'نقطة', fizzy: 'فوار',
    spray: 'بخة', cream: 'جم'
};

function updateUnitLabel() {
    UI.unitLabel.textContent = FORM_UNITS[UI.drugFormSelect.value] || '';
}

function addNewFormOptions() {
    const select = UI.drugFormSelect;
    if (!select) return;
    [{ value: 'fizzy', text: '🧊 فوار' }, { value: 'spray', text: '💨 بخاخ' }, { value: 'cream', text: '🧴 كريم' }]
        .forEach(opt => {
            if (!select.querySelector(`option[value="${opt.value}"]`)) {
                const o = document.createElement('option');
                o.value = opt.value; o.textContent = opt.text;
                select.appendChild(o);
            }
        });
}

UI.drugFormSelect.addEventListener('change', () => {
    updateUnitLabel();
    if (UI.drugSearchInput.value.trim()) displayDrugSuggestions(UI.drugSearchInput.value.trim());
});

let searchTimeout;
UI.drugSearchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const term = UI.drugSearchInput.value.trim();
    if (term.length < 1) { UI.drugSuggestions.style.display = 'none'; return; }
    searchTimeout = setTimeout(() => displayDrugSuggestions(term), 100);
});

UI.startAddDrugBtn.addEventListener('click', () => {
    const custom = UI.drugSearchInput.value.trim();
    if (custom) { doseState.drug = custom; doseState.drug_id = null; prepareDosePanel(); }
    else showToast('الرجاء إدخال اسم الدواء', true);
});

// ============================================================
// لوحة الجرعة
// ============================================================
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
    UI.doseNumberInput.value   = '';
    UI.doseNumberInput.focus();
    updateUnitLabel();
    generateDoseSuggestions();
}

function getDosePreferencesKey(drug, form) {
    return `dosePref_${currentUser.uid}_${drug}_${form}`;
}

function loadDosePreferences(drug, form) {
    const stored = localStorage.getItem(getDosePreferencesKey(drug, form));
    return stored ? JSON.parse(stored) : [];
}

function saveDosePreference(drug, form, doseString) {
    const key  = getDosePreferencesKey(drug, form);
    let prefs  = loadDosePreferences(drug, form).filter(p => p !== doseString);
    prefs.unshift(doseString);
    if (prefs.length > 5) prefs.pop();
    localStorage.setItem(key, JSON.stringify(prefs));
}

function deleteDosePreference(drug, form, doseString) {
    const key  = getDosePreferencesKey(drug, form);
    const prefs = loadDosePreferences(drug, form).filter(p => p !== doseString);
    localStorage.setItem(key, JSON.stringify(prefs));
}

// ============================================================
// اقتراحات الجرعة مع تعديل / حذف
// ============================================================
function generateDoseSuggestions() {
    const drug   = doseState.drug;
    const form   = UI.drugFormSelect.value;
    const typed  = UI.doseNumberInput.value.trim();
    const saved  = loadDosePreferences(drug, form);
    const filtered = typed.length > 0
        ? saved.filter(p => p.toLowerCase().includes(typed.toLowerCase()))
        : saved;

    UI.doseSuggestionsContainer.innerHTML = '';

    if (filtered.length) {
        filtered.slice(0, 8).forEach(pref => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:4px;';

            const chip = document.createElement('button');
            chip.className     = 'dose-chip-btn';
            chip.dataset.doseText = pref;
            chip.innerHTML     = `${escapeHtml(pref)} <i class="fas fa-history" style="opacity:0.6;margin-right:4px;"></i>`;
            chip.style.flex    = '1';
            chip.addEventListener('click', () => applyDoseFromSuggestion(pref));

            // زر تعديل الجرعة المحفوظة
            const editBtn = document.createElement('button');
            editBtn.className = 'icon-btn-sm edit';
            editBtn.title     = 'تعديل الجرعة';
            editBtn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
            editBtn.style.cssText = 'padding:3px 7px; font-size:0.78rem; flex-shrink:0;';
            editBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const newDose = await promptDialog('تعديل الجرعة المحفوظة:', pref);
                if (!newDose || newDose === pref) return;
                deleteDosePreference(drug, form, pref);
                saveDosePreference(drug, form, newDose);
                generateDoseSuggestions();
            });

            // زر حذف الجرعة المحفوظة
            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn-sm';
            delBtn.title     = 'حذف الجرعة';
            delBtn.innerHTML = '<i class="fas fa-times"></i>';
            delBtn.style.cssText = 'padding:3px 7px; font-size:0.78rem; color:#B23B3B; flex-shrink:0;';
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                deleteDosePreference(drug, form, pref);
                generateDoseSuggestions();
            });

            row.appendChild(chip);
            row.appendChild(editBtn);
            row.appendChild(delBtn);
            UI.doseSuggestionsContainer.appendChild(row);
        });
    } else if (typed.length) {
        const msg = document.createElement('div');
        msg.style.cssText = 'font-size:0.85rem; color:var(--text-light); margin:8px 0;';
        msg.textContent   = 'لا توجد جرعات محفوظة مطابقة';
        UI.doseSuggestionsContainer.appendChild(msg);
    }

    // زر الجرعة المخصصة
    const customBtn = document.createElement('button');
    customBtn.className = 'dose-chip-btn';
    customBtn.style.background = 'var(--primary-light)';
    customBtn.textContent = '✏️ جرعة مخصصة';
    customBtn.addEventListener('click', showCustomDoseInput);
    UI.doseSuggestionsContainer.appendChild(customBtn);
}

async function applyDoseFromSuggestion(doseText) {
    if (!doseState.drug || !doseText) return;
    const formValue = UI.drugFormSelect.value;
    const formText  = UI.drugFormSelect.options[UI.drugFormSelect.selectedIndex].text;
    if (!doseState.drug_id) {
        const newDrug = await addNewDrugToBoth(doseState.drug, formValue);
        doseState.drug_id = newDrug.id;
    }
    currentPrescription.push({ drug_id: doseState.drug_id, drug: doseState.drug, form: formText, dose: doseText });
    await incrementDrugUsage(doseState.drug, formValue);
    saveDosePreference(doseState.drug, formValue, doseText);
    renderPrescriptionItems();
    saveCurrentSessionToIndexedDB();
    resetDosePanel();
}

async function showCustomDoseInput() {
    const customDose = await promptDialog('أدخل الجرعة كاملة (مثال: 2 قرص بعد الأكل):');
    if (customDose) applyDoseFromSuggestion(customDose);
}

UI.doseNumberInput.addEventListener('input', generateDoseSuggestions);
UI.drugFormSelect.addEventListener('change', generateDoseSuggestions);

UI.applyDoseBtn.addEventListener('click', async () => {
    const quantity = UI.doseNumberInput.value.trim();
    if (!doseState.drug || !quantity) { showToast('الرجاء إدخال الدواء والكمية', true); return; }
    const formValue  = UI.drugFormSelect.value;
    const formText   = UI.drugFormSelect.options[UI.drugFormSelect.selectedIndex].text;
    const doseString = `${quantity} ${UI.unitLabel.textContent}`;
    if (!doseState.drug_id) {
        const newDrug = await addNewDrugToBoth(doseState.drug, formValue);
        doseState.drug_id = newDrug.id;
    }
    currentPrescription.push({ drug_id: doseState.drug_id, drug: doseState.drug, form: formText, dose: doseString });
    await incrementDrugUsage(doseState.drug, formValue);
    saveDosePreference(doseState.drug, formValue, doseString);
    renderPrescriptionItems();
    saveCurrentSessionToIndexedDB();
    resetDosePanel();
});

function resetDosePanel() {
    UI.dosePanel.style.display = 'none';
    doseState = { drug: null, drug_id: null, form: 'tablet', quantity: '', timing: 'any' };
    UI.drugSearchInput.value = '';
    UI.drugSuggestions.style.display = 'none';
}

UI.cancelDoseBtn.addEventListener('click', resetDosePanel);

UI.clearPrescriptionBtn.addEventListener('click', async () => {
    if (!currentPrescription.length) return;
    const ok = await confirmDialog('هل أنت متأكد من مسح جميع الأدوية من الوصفة؟');
    if (!ok) return;
    currentPrescription = [];
    loadedTemplateId    = null;
    renderPrescriptionItems();
    saveCurrentSessionToIndexedDB();
    showToast('تم مسح الوصفة');
});

UI.diagnosisTextarea.addEventListener('input', () => saveCurrentSessionToIndexedDB());

// ============================================================
// إنهاء الكشف
// ============================================================
UI.finishBtn.addEventListener('click', async () => {
    if (!currentAppointment) { showToast('لا يوجد مريض حالي', true); return; }
    const diagnosis = UI.diagnosisTextarea.value.trim();
    if (!currentPrescription.length && !diagnosis) {
        showToast('الرجاء إضافة أدوية أو تشخيص قبل إنهاء الكشف', true);
        return;
    }
    try {
        const now           = new Date().toISOString();
        const prescriptionId = currentAppointment.id;
        let patientName     = getPatientName(currentAppointment);
        if (patientName === 'غير معروف' && currentAppointment.patient_id) {
            const pSnap = await get(ref(db, `patients/${currentAppointment.patient_id}`));
            if (pSnap.exists()) patientName = pSnap.val().name || patientName;
        }

        const updates = {};
        const prescriptionData = {
            patient_id:     currentAppointment.patient_id || currentAppointment.patientId || '',
            patient_name:   patientName,
            doctor_id:      currentUser.uid,
            diagnosis,
            created_at:     now,
            status:         'لم تصرف بعد',
            pharmacist_id:  '',
            pharmacist_name:'',
            dispensed_at:   '',
            item_count:     currentPrescription.length
        };
        if (loadedTemplateId) {
            prescriptionData.template_id = loadedTemplateId;
        } else {
            currentPrescription.forEach((item, i) => {
                updates[`prescription_items/${prescriptionId}/item_${i}`] = {
                    drug_id: item.drug_id, dose: item.dose, form: item.form
                };
            });
        }
        updates[`prescriptions/${prescriptionId}`] = prescriptionData;
        updates[`appointments/${currentAppointment.id}/status`] = 'منتهي';
        await update(ref(db), updates);

        showToast('✅ تم إنهاء الكشف وحفظ الروشتة بنجاح');
        await removeCurrentSessionFromDB();
        currentAppointment = null;
        currentPrescription = [];
        loadedTemplateId   = null;
        UI.currentPatientCard.style.display    = 'none';
        UI.emptyPrescriptionMsg.style.display  = 'block';
        UI.prescriptionContent.style.display   = 'none';
        UI.diagnosisTextarea.value = '';
    } catch (err) {
        console.error('فشل الحفظ:', err);
        showToast('حدث خطأ أثناء حفظ البيانات', true);
    }
});

// ============================================================
// القوالب — عرض + تعديل + حذف
// ============================================================
UI.templatesBtn.addEventListener('click', async () => {
    try {
        const snap = await get(ref(db, `prescription_templates/${currentUser.uid}`));
        UI.templatesList.innerHTML = '';

        if (!snap.exists()) {
            UI.templatesList.innerHTML = '<div class="empty-state">لا توجد قوالب محفوظة</div>';
        } else {
            const templates  = snap.val();
            const drugsCache = await localDrugDB.getAllDrugs();
            const drugMap    = Object.fromEntries(drugsCache.map(d => [d.id, d]));

            for (const [id, t] of Object.entries(templates)) {
                const div = document.createElement('div');
                div.style.cssText = `
                    padding:12px; border-bottom:1px solid #eee;
                    display:flex; justify-content:space-between; align-items:center; gap:8px;
                `;

                const info = document.createElement('div');
                info.style.flex = '1';
                info.innerHTML  = `<b>${escapeHtml(t.name)}</b><br><small>${t.itemCount || 0} أصناف</small>`;

                const actionsDiv = document.createElement('div');
                actionsDiv.style.cssText = 'display:flex; gap:6px; align-items:center; flex-shrink:0;';

                // زر تحميل القالب
                const loadBtn = document.createElement('button');
                loadBtn.textContent = 'تحميل';
                loadBtn.className   = 'btn btn-outline';
                loadBtn.style.padding = '4px 12px';
                loadBtn.addEventListener('click', async () => {
                    const itemsSnap = await get(ref(db, `template_items/${id}`));
                    currentPrescription = [];
                    if (itemsSnap.exists()) {
                        currentPrescription = Object.values(itemsSnap.val()).map(it => {
                            const drugInfo = drugMap[it.drug_id] || {};
                            return { drug_id: it.drug_id, drug: drugInfo.name || it.drug_id, form: it.form, dose: it.dose };
                        });
                    }
                    if (t.diagnosis) UI.diagnosisTextarea.value = t.diagnosis;
                    loadedTemplateId = id;
                    renderPrescriptionItems();
                    saveCurrentSessionToIndexedDB();
                    UI.templatesModal.style.display = 'none';
                    showToast(`تم تحميل القالب: ${t.name}`);
                });

                // زر تعديل اسم القالب
                const renameBtn = document.createElement('button');
                renameBtn.className = 'icon-btn-sm edit';
                renameBtn.title     = 'تعديل اسم القالب';
                renameBtn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
                renameBtn.addEventListener('click', async () => {
                    const newName = await promptDialog('تعديل اسم القالب:', t.name);
                    if (!newName || newName === t.name) return;
                    await update(ref(db, `prescription_templates/${currentUser.uid}/${id}`), { name: newName });
                    t.name = newName;
                    info.innerHTML = `<b>${escapeHtml(newName)}</b><br><small>${t.itemCount || 0} أصناف</small>`;
                    showToast('✅ تم تعديل اسم القالب');
                });

                // زر تعديل أدوية القالب
                const editItemsBtn = document.createElement('button');
                editItemsBtn.className   = 'icon-btn-sm edit';
                editItemsBtn.title       = 'تعديل أدوية القالب';
                editItemsBtn.innerHTML   = '<i class="fas fa-pills"></i>';
                editItemsBtn.style.color = 'var(--primary, #c8784a)';
                editItemsBtn.addEventListener('click', async () => {
                    // تحميل القالب في الوصفة الحالية للتعديل
                    const itemsSnap = await get(ref(db, `template_items/${id}`));
                    currentPrescription = [];
                    if (itemsSnap.exists()) {
                        currentPrescription = Object.values(itemsSnap.val()).map(it => {
                            const drugInfo = drugMap[it.drug_id] || {};
                            return { drug_id: it.drug_id, drug: drugInfo.name || it.drug_id, form: it.form, dose: it.dose };
                        });
                    }
                    if (t.diagnosis) UI.diagnosisTextarea.value = t.diagnosis;
                    loadedTemplateId = id;
                    renderPrescriptionItems();
                    saveCurrentSessionToIndexedDB();
                    UI.templatesModal.style.display = 'none';
                    showToast(`📝 عدّل الأدوية ثم احفظ القالب من جديد`, false);
                });

            
                // زر حذف القالب
                const deleteBtn = document.createElement('button');
                deleteBtn.className  = 'icon-btn-sm';
                deleteBtn.title      = 'حذف القالب';
                deleteBtn.innerHTML  = '<i class="fas fa-trash"></i>';
                deleteBtn.style.color = '#B23B3B';
                deleteBtn.addEventListener('click', async () => {
                    const ok = await confirmDialog(`هل تريد حذف قالب "<b>${escapeHtml(t.name)}</b>" نهائياً؟`);
                    if (!ok) return;
                    await remove(ref(db, `prescription_templates/${currentUser.uid}/${id}`));
                    await remove(ref(db, `template_items/${id}`));
                    div.remove();
                    if (!UI.templatesList.children.length) {
                        UI.templatesList.innerHTML = '<div class="empty-state">لا توجد قوالب محفوظة</div>';
                    }
                    showToast(`🗑️ تم حذف القالب "${t.name}"`);
                });

                actionsDiv.appendChild(loadBtn);
                actionsDiv.appendChild(editItemsBtn);
                actionsDiv.appendChild(renameBtn);
                actionsDiv.appendChild(deleteBtn);
                div.appendChild(info);
                div.appendChild(actionsDiv);
                UI.templatesList.appendChild(div);
            }
        }
        UI.templatesModal.style.display = 'flex';
    } catch (err) {
        showToast('تعذر تحميل القوالب', true);
    }
});

UI.saveTemplateBtn.addEventListener('click', () => {
    if (!currentPrescription.length && !UI.diagnosisTextarea.value.trim()) {
        showToast('لا يوجد محتوى لحفظه كقالب', true);
        return;
    }
    UI.templateNameInput.value = '';
    UI.saveTemplateModal.style.display = 'flex';
    UI.templateNameInput.focus();
});

async function saveAsNewTemplate(name) {
    const templateId   = push(ref(db, `prescription_templates/${currentUser.uid}`)).key;
    const templateData = {
        name,
        diagnosis:  UI.diagnosisTextarea.value.trim(),
        doctor_id:  currentUser.uid,
        created_at: new Date().toISOString(),
        itemCount:  currentPrescription.length
    };
    const updates = {};
    updates[`prescription_templates/${currentUser.uid}/${templateId}`] = templateData;
    currentPrescription.forEach((item, idx) => {
        updates[`template_items/${templateId}/item_${idx}`] = {
            drug_id: item.drug_id, dose: item.dose, form: item.form
        };
    });
    try {
        await update(ref(db), updates);
        showToast('✅ تم حفظ القالب بنجاح');
    } catch (err) {
        showToast('فشل حفظ القالب', true);
    }
}

// حفظ القالب مع الكتابة فوق الموجود إن كان loadedTemplateId محدداً
async function saveOverwriteTemplate(name) {
    if (!loadedTemplateId) { await saveAsNewTemplate(name); return; }
    const updates = {};
    updates[`prescription_templates/${currentUser.uid}/${loadedTemplateId}/name`]      = name;
    updates[`prescription_templates/${currentUser.uid}/${loadedTemplateId}/itemCount`]  = currentPrescription.length;
    updates[`prescription_templates/${currentUser.uid}/${loadedTemplateId}/diagnosis`]  = UI.diagnosisTextarea.value.trim();
    // حذف العناصر القديمة وإعادة الكتابة
    updates[`template_items/${loadedTemplateId}`] = null;
    currentPrescription.forEach((item, idx) => {
        updates[`template_items/${loadedTemplateId}/item_${idx}`] = {
            drug_id: item.drug_id, dose: item.dose, form: item.form
        };
    });
    try {
        await update(ref(db), updates);
        showToast('✅ تم تحديث القالب بنجاح');
    } catch (err) {
        showToast('فشل تحديث القالب', true);
    }
}

UI.saveAsNewTemplateBtn.addEventListener('click', async () => {
    const name = UI.templateNameInput.value.trim();
    if (!name) { showToast('الرجاء إدخال اسم للقالب', true); return; }
    await saveAsNewTemplate(name);
    UI.saveTemplateModal.style.display = 'none';
});

if (UI.overwriteTemplateBtn) {
    UI.overwriteTemplateBtn.addEventListener('click', async () => {
        const name = UI.templateNameInput.value.trim();
        if (!name) { showToast('الرجاء إدخال اسم للقالب', true); return; }
        await saveOverwriteTemplate(name);
        UI.saveTemplateModal.style.display = 'none';
    });
}

// ============================================================
// إدارة المودالات
// ============================================================
UI.queueModalBtn.addEventListener('click', () => { UI.queueModal.style.display = 'flex'; renderQueueModalList(); });
UI.closeQueueModalBtn.addEventListener('click',        () => UI.queueModal.style.display       = 'none');
UI.closeTemplatesModalBtn.addEventListener('click',    () => UI.templatesModal.style.display   = 'none');
UI.closeSaveTemplateModalBtn.addEventListener('click', () => UI.saveTemplateModal.style.display= 'none');

UI.savedSessionsBtn.addEventListener('click', () => { UI.savedSessionsModal.style.display = 'flex'; renderSavedSessionsModal(); });
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
    if (e.target === UI.queueModal)        UI.queueModal.style.display       = 'none';
    if (e.target === UI.templatesModal)    UI.templatesModal.style.display   = 'none';
    if (e.target === UI.saveTemplateModal) UI.saveTemplateModal.style.display= 'none';
    if (e.target === UI.savedSessionsModal)UI.savedSessionsModal.style.display='none';
    if (!UI.drugSearchInput.contains(e.target) && !UI.drugSuggestions.contains(e.target)) {
        UI.drugSuggestions.style.display = 'none';
    }
});

UI.logoutBtn.addEventListener('click', async () => {
    try { await signOut(auth); } catch (_) {}
    sessionStorage.clear();
    window.location.href = 'index.html';
});

// ============================================================
// بدء التشغيل
// ============================================================
(async function init() {
    await sessionManager.open();
    await localDrugDB.open();
    UI.welcomeMessage.textContent = `د. ${currentUser.name}`;
    await loadDoctorData(currentUser.uid);
    addNewFormOptions();
    updateUnitLabel();

    const restored = await loadSavedSessionFromIndexedDB();
    if (!restored) {
        UI.currentPatientCard.style.display  = 'none';
        UI.prescriptionContent.style.display = 'none';
    }

    loadAppointments();
})();
