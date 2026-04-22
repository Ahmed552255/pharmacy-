import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
// تم إزالة استيراد getAuth, onAuthStateChanged, signOut لأننا لن نستخدمهم
import { getDatabase, ref, onValue, set, push, update, get, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-database.js";

const app = initializeApp(firebaseConfig);
// const auth = getAuth(app);  // غير مستخدم الآن
const db = getDatabase(app);

// ---------- دوال التاريخ ----------
function getLocalDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
const today = getLocalDateString();

// ---------- الحالة ----------
// بدلاً من null، نستخدم كائن وهمي ثابت للطبيب
let currentUser = { uid: "demoDoctor" };  // معرف ثابت لاستخدامه في جميع العمليات
let doctorInfo = null;
let todayAppointments = [];
let currentAppointment = null;
let currentPrescription = [];
let drugList = [];
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

function showToast(msg, isErr = false) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.background = isErr ? '#B23B3B' : '#4A3B2C';
    t.innerHTML = `<i class="fas ${isErr ? 'fa-exclamation-triangle' : 'fa-check'}"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// ---------- تفضيلات الجرعات (LocalStorage) ----------
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

// ---------- تحميل بيانات الطبيب (باستخدام uid الثابت) ----------
async function loadDoctorData() {
    try {
        const snap = await get(ref(db, `users/${currentUser.uid}`));
        if (!snap.exists()) {
            // إذا لم توجد بيانات، ننشئ بيانات افتراضية للعرض
            doctorInfo = { name: "طبيب تجريبي" };
            UI.welcomeMessage.textContent = `د. ${doctorInfo.name}`;
        } else {
            doctorInfo = snap.val();
            UI.welcomeMessage.textContent = `د. ${doctorInfo.name || ''}`;
        }
        
        // تحميل الأدوية المفضلة
        const favSnap = await get(ref(db, `favorites/${currentUser.uid}`));
        if (favSnap.exists()) {
            favoriteDrugs = new Set(Object.values(favSnap.val()));
        }
        return true;
    } catch (err) {
        showToast('فشل تحميل بيانات الطبيب', true);
        return false;
    }
}

async function loadDrugs() {
    try {
        const snap = await get(ref(db, 'drugs'));
        if (snap.exists()) drugList = Object.values(snap.val());
    } catch (err) {
        console.warn('فشل تحميل الأدوية');
    }
}

// ---------- قائمة الانتظار (من جدول appointments) ----------
function loadAppointments() {
    const q = query(ref(db, 'appointments'), orderByChild('doctorId'), equalTo(currentUser.uid));
    onValue(q, (snap) => {
        const all = [];
        snap.forEach(child => {
            const apt = { id: child.key, ...child.val() };
            if (apt.date === today && apt.status !== 'ملغي') all.push(apt);
        });
        all.sort((a,b) => (a.time||'').localeCompare(b.time||''));
        todayAppointments = all;
        updateQueueBadgeAndModal();
    }, (error) => {
        showToast('خطأ في تحميل الحجوزات', true);
    });
}

// باقي الدوال بدون تغيير (updateQueueBadgeAndModal, renderQueueModalList, selectPatientFromQueue, updateCurrentPatientUI, renderPrescriptionItems, ...)

// ---------- إنهاء الكشف ----------
UI.finishBtn.addEventListener('click', async () => {
    if (!currentAppointment) return;
    try {
        const diagnosis = UI.diagnosisTextarea.value.trim();
        await set(ref(db, `prescriptions/${currentAppointment.id}`), {
            patientName: currentAppointment.patientName,
            patientId: currentAppointment.patientId,
            doctorId: currentUser.uid,
            doctorName: doctorInfo.name,
            diagnosis: diagnosis,
            items: currentPrescription,
            createdAt: new Date().toISOString()
        });
        await update(ref(db, `appointments/${currentAppointment.id}`), { status: 'منتهي' });
        showToast('✅ تم إنهاء الكشف');
        currentAppointment = null; currentPrescription = [];
        UI.currentPatientCard.style.display = 'none';
        UI.emptyPrescriptionMsg.style.display = 'block';
        UI.prescriptionContent.style.display = 'none';
        UI.diagnosisTextarea.value = '';
    } catch (e) { showToast('فشل الحفظ', true); }
});

// ---------- القوالب ----------
UI.templatesBtn.addEventListener('click', async () => {
    const snap = await get(ref(db, `templates/${currentUser.uid}`));
    UI.templatesList.innerHTML = '';
    if (snap.exists()) {
        Object.entries(snap.val()).forEach(([id, t]) => {
            const div = document.createElement('div'); div.style.padding='12px'; div.style.cursor='pointer';
            div.innerHTML = `<b>${t.name}</b><br><small>${t.items?.length || 0} أصناف</small>`;
            div.onclick = () => { 
                currentPrescription = t.items || [];
                if (t.diagnosis) UI.diagnosisTextarea.value = t.diagnosis;
                renderPrescriptionItems(); 
                UI.templatesModal.style.display='none'; 
            };
            UI.templatesList.appendChild(div);
        });
    } else UI.templatesList.innerHTML = '<div class="empty-state">لا توجد قوالب</div>';
    UI.templatesModal.style.display = 'flex';
});

UI.saveTemplateBtn.addEventListener('click', () => {
    if (currentPrescription.length === 0 && !UI.diagnosisTextarea.value.trim()) { 
        showToast('لا يوجد محتوى لحفظه', true); 
        return; 
    }
    UI.saveTemplateModal.style.display = 'flex';
});

window.saveAsTemplate = async function() {
    const name = document.getElementById('templateNameInput').value.trim();
    if (!name) return;
    const templateData = {
        name,
        items: currentPrescription,
        diagnosis: UI.diagnosisTextarea.value.trim(),
        createdAt: new Date().toISOString()
    };
    await push(ref(db, `templates/${currentUser.uid}`), templateData);
    showToast('تم حفظ القالب');
    UI.saveTemplateModal.style.display = 'none';
};

// ---------- أحداث المودالات ----------
UI.queueModalBtn.addEventListener('click', () => UI.queueModal.style.display = 'flex');
UI.closeQueueModalBtn.addEventListener('click', () => UI.queueModal.style.display = 'none');
UI.queueTabs.forEach(tab => tab.addEventListener('click', () => {
    UI.queueTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentQueueTab = tab.dataset.queueTab;
    renderQueueModalList();
}));

// ---------- تسجيل الخروج (توجيه فقط بدون signOut) ----------
UI.logoutBtn.addEventListener('click', () => {
    // مجرد توجيه إلى صفحة index.html دون أي عملية تسجيل خروج من Firebase
    window.location.href = 'index.html';
});

// ---------- بدء التشغيل (بدون onAuthStateChanged) ----------
(async function init() {
    // تحميل بيانات الطبيب باستخدام المعرف الثابت
    const valid = await loadDoctorData();
    if (!valid) return;
    await loadDrugs();
    loadAppointments();
    updateUnitLabel();
})();

// باقي الدوال المساعدة (updateUnitLabel, drugSearch, prepareDosePanel, ...) تبقى كما هي دون تغيير
// ... (يجب تضمين باقي الدوال من الكود الأصلي كما هي)

window.onclick = (e) => {
    if (e.target === UI.templatesModal) UI.templatesModal.style.display = 'none';
    if (e.target === UI.saveTemplateModal) UI.saveTemplateModal.style.display = 'none';
    if (e.target === UI.queueModal) UI.queueModal.style.display = 'none';
};
