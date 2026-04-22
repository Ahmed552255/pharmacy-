import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getDatabase, ref, onValue, set, push, update, get, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
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
// استخدام معرف طبيب ثابت (يمكن تعديله ليطابق معرف الطبيب في قاعدة البيانات)
const DOCTOR_UID = 'doctor1';  // <-- غيّره إلى المعرف الحقيقي للطبيب

let currentUser = { uid: DOCTOR_UID };  // كائن بسيط يحتوي على uid فقط
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

// ---------- تحميل بيانات الطبيب ----------
async function loadDoctorData(uid) {
    try {
        const snap = await get(ref(db, `users/${uid}`));
        if (!snap.exists()) {
            showToast('بيانات الطبيب غير موجودة. تأكد من المعرف.', true);
            // لا نوجه إلى index، بل نستمر مع إمكانية تحميل الأدوية فقط
            doctorInfo = { name: 'طبيب' };  // قيمة افتراضية
            UI.welcomeMessage.textContent = `د. ${doctorInfo.name}`;
            return true;
        }
        const data = snap.val();
        // لا نتحقق من الدور، نفترض أنه طبيب
        doctorInfo = data;
        UI.welcomeMessage.textContent = `د. ${doctorInfo.name || ''}`;
        
        // تحميل الأدوية المفضلة
        const favSnap = await get(ref(db, `favorites/${uid}`));
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

function updateQueueBadgeAndModal() {
    const waiting = todayAppointments.filter(a => a.status === 'انتظار').length;
    UI.queueBadgeCount.textContent = waiting;
    UI.waitingTabCount.textContent = waiting;
    UI.doneTabCount.textContent = todayAppointments.filter(a => a.status === 'منتهي').length;
    renderQueueModalList();
}

function renderQueueModalList() {
    const filtered = todayAppointments.filter(a => 
        currentQueueTab === 'waiting' ? a.status === 'انتظار' : a.status === 'منتهي'
    );
    if (filtered.length === 0) {
        UI.queueModalList.innerHTML = '<div class="empty-state">لا يوجد مرضى</div>';
        return;
    }
    UI.queueModalList.innerHTML = filtered.map(apt => `
        <div class="queue-item-modal" data-id="${apt.id}">
            <b>${apt.patientName}</b> - ${apt.time} - ${apt.age} سنة
            ${apt.status === 'منتهي' ? '<span style="color:green;">✓ تم</span>' : ''}
        </div>
    `).join('');
    document.querySelectorAll('.queue-item-modal').forEach(el => {
        el.addEventListener('click', () => selectPatientFromQueue(el.dataset.id));
    });
}

async function selectPatientFromQueue(appointmentId) {
    const apt = todayAppointments.find(a => a.id === appointmentId);
    if (!apt || apt.status === 'منتهي') { showToast('لا يمكن اختيار مريض منتهي', true); return; }
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
    if (!currentAppointment) return;
    UI.currentPatientCard.style.display = 'flex';
    UI.currentPatientNameDisplay.textContent = currentAppointment.patientName;
    UI.currentPatientAgeDisplay.textContent = `${currentAppointment.age || '--'} سنة`;
}

UI.patientNameClickable.addEventListener('click', async () => {
    if (!currentAppointment?.patientId) { showToast('لا يوجد سجل', true); return; }
    const snap = await get(query(ref(db, 'prescriptions'), orderByChild('patientId'), equalTo(currentAppointment.patientId)));
    let history = '';
    if (snap.exists()) snap.forEach(c => { const p = c.val(); history += `${p.createdAt?.split('T')[0]} : ${p.items?.length} أدوية\n`; });
    alert(`سجل المريض:\n${history || 'لا توجد روشتات سابقة'}`);
});

// ---------- الروشتة ----------
function renderPrescriptionItems() {
    if (currentPrescription.length === 0) {
        UI.rxItemsContainer.innerHTML = '<div class="empty-state">لم تضف أدوية بعد</div>';
        return;
    }
    UI.rxItemsContainer.innerHTML = currentPrescription.map((item, idx) => `
        <div class="rx-item">
            <div class="rx-main-row">
                <div class="rx-drug-info">
                    <span class="rx-drug-name">${item.drug}</span>
                    <span class="rx-form-badge">${item.form}</span>
                </div>
                <div class="rx-dose-info">
                    <span class="rx-dose-text">${item.dose}</span>
                    <div class="rx-actions">
                        <button class="icon-btn-sm" data-action="remove" data-index="${idx}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    document.querySelectorAll('[data-action="remove"]').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPrescription.splice(btn.dataset.index, 1);
            renderPrescriptionItems();
        });
    });
}

// ---------- إضافة دواء ذكي ----------
function updateUnitLabel() {
    const forms = { tablet: 'قرص', syrup: 'مل', injection: 'سم', suppository: 'لبوس', drops: 'نقطة' };
    UI.unitLabel.textContent = forms[UI.drugFormSelect.value] || '';
}
UI.drugFormSelect.addEventListener('change', updateUnitLabel);

UI.drugSearchInput.addEventListener('input', () => {
    const term = UI.drugSearchInput.value.trim();
    if (term.length < 1) { UI.drugSuggestions.style.display = 'none'; return; }
    let matches = drugList.filter(d => d.name && d.name.includes(term));
    
    matches.sort((a,b) => {
        const aFav = favoriteDrugs.has(a.name) ? 1 : 0;
        const bFav = favoriteDrugs.has(b.name) ? 1 : 0;
        return bFav - aFav;
    });
    matches = matches.slice(0, 7);
    
    UI.drugSuggestions.innerHTML = matches.length ? matches.map(d => {
        const isFav = favoriteDrugs.has(d.name);
        return `<div class="suggestion-item" data-drug="${d.name}">
            ${isFav ? '<span class="favorites-tag"><i class="fas fa-star"></i> مفضل</span>' : ''}
            ${d.name}
        </div>`;
    }).join('') : '<div class="suggestion-item">اضغط Enter لإضافة جديد</div>';
    UI.drugSuggestions.style.display = 'block';
});

UI.drugSuggestions.addEventListener('click', (e) => {
    const item = e.target.closest('[data-drug]');
    if (item) {
        doseState.drug = item.dataset.drug;
        prepareDosePanel();
    }
});

UI.startAddDrugBtn.addEventListener('click', () => {
    const custom = UI.drugSearchInput.value.trim();
    if (custom) { doseState.drug = custom; prepareDosePanel(); }
});

UI.exchangeModeBtn.addEventListener('click', () => {
    if (!doseState.drug) { showToast('اختر الدواء الأساسي أولاً', true); return; }
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
            `${base} يومياً`,
            `${base} كل 8 ساعات`,
            `${base} كل 12 ساعة`,
            `${base} مرة واحدة يومياً`,
            `${base} عند اللزوم`
        ];
        built.forEach(b => {
            if (!suggestions.some(s => s.text === b)) {
                suggestions.push({ text: b, isPref: false });
            }
        });
    }
    
    if (suggestions.length === 0) {
        const base = `1 ${unit}`;
        suggestions = [
            { text: `${base} يومياً`, isPref: false },
            { text: `${base} كل 8 ساعات`, isPref: false },
            { text: `${base} كل 12 ساعة`, isPref: false }
        ];
    }
    
    UI.doseSuggestionsContainer.innerHTML = suggestions.map((s, idx) => `
        <div class="dose-suggestion-row">
            <span>${s.text} ${s.isPref ? '<i class="fas fa-history" style="opacity:0.6; margin-right:6px;"></i>' : ''}</span>
            <div>
                <button class="timing-btn-sm" data-timing="before" title="قبل الأكل"><i class="fas fa-utensils"></i></button>
                <button class="timing-btn-sm" data-timing="after" title="بعد الأكل"><i class="fas fa-utensils"></i></button>
                <button class="timing-btn-sm ${idx === 0 ? 'active' : ''}" data-timing="any" title="لا يهم"><i class="fas fa-minus"></i></button>
            </div>
        </div>
    `).join('');
    
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

UI.applyDoseBtn.addEventListener('click', () => {
    const quantity = UI.doseNumberInput.value.trim();
    if (!doseState.drug || !quantity) return;
    const formText = UI.drugFormSelect.options[UI.drugFormSelect.selectedIndex].text;
    const activeRow = document.querySelector('.dose-suggestion-row');
    let doseString = `${quantity} ${UI.unitLabel.textContent}`;
    if (activeRow) {
        const timingBtn = activeRow.querySelector('.timing-btn-sm.active');
        const timing = timingBtn ? timingBtn.dataset.timing : 'any';
        const timingText = { before: 'قبل الأكل', after: 'بعد الأكل', any: '' }[timing];
        doseString = `${quantity} ${UI.unitLabel.textContent} ${timingText}`.trim();
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
    
    saveDosePreference(doseState.drug, UI.drugFormSelect.value, doseString);
    
    renderPrescriptionItems();
    resetDosePanel();
});

function resetDosePanel() {
    UI.dosePanel.style.display = 'none';
    doseState = { drug: null, form: 'tablet', isExchange: false, exchangeDrug: null, quantity: '', timing: 'any' };
    UI.drugSearchInput.value = '';
    UI.exchangeModeBtn.style.background = '';
    UI.exchangeInfo.style.display = 'none';
}

UI.cancelDoseBtn.addEventListener('click', resetDosePanel);

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

// ---------- زر الخروج: إعادة توجيه فقط بدون تسجيل خروج من Firebase ----------
UI.logoutBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
});

// ---------- بدء التشغيل بدون التحقق من تسجيل الدخول ----------
(async function init() {
    // تحميل بيانات الطبيب باستخدام المعرف الثابت
    const valid = await loadDoctorData(currentUser.uid);
    if (!valid) {
        // حتى لو فشل، نستمر بواجهة فارغة أو بإعدادات افتراضية
        console.warn('تعذر تحميل بيانات الطبيب، استمرار بوظائف محدودة.');
    }
    await loadDrugs();
    loadAppointments();
    updateUnitLabel();
})();

window.onclick = (e) => {
    if (e.target === UI.templatesModal) UI.templatesModal.style.display = 'none';
    if (e.target === UI.saveTemplateModal) UI.saveTemplateModal.style.display = 'none';
    if (e.target === UI.queueModal) UI.queueModal.style.display = 'none';
};
