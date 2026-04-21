// doctor-dashboard.js
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getDatabase, ref, onValue, set, push, update, get, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ---------- الحالة العامة ----------
let currentUser = null;
let doctorInfo = null;
let todayAppointments = [];
let currentAppointment = null;
let currentPrescription = [];
let drugList = [];
let doseState = {
    drug: null,
    form: 'tablet',
    isExchange: false,
    exchangeDrug: null,
    quantity: '',
    timing: 'any'
};

// عناصر DOM
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

const today = new Date().toISOString().split('T')[0];
let currentQueueTab = 'waiting';

// ---------- دوال مساعدة ----------
function showToast(msg, isErr = false) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.background = isErr ? '#B23B3B' : '#4A3B2C';
    t.innerHTML = `<i class="fas ${isErr ? 'fa-exclamation-triangle' : 'fa-check'}"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// ---------- تحميل بيانات الطبيب والأدوية ----------
async function loadDoctorData(user) {
    const snap = await get(ref(db, `users/${user.uid}`));
    if (snap.exists()) {
        doctorInfo = snap.val();
        UI.welcomeMessage.textContent = `د. ${doctorInfo.name || ''}`;
    }
}

async function loadDrugs() {
    const snap = await get(ref(db, 'drugs'));
    if (snap.exists()) drugList = Object.values(snap.val());
}

// ---------- قائمة الانتظار (لحظية) ----------
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

// ---------- عرض الروشتة ----------
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
                        <button class="icon-btn-sm" data-action="edit" data-index="${idx}"><i class="fas fa-edit"></i></button>
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
    // يمكن إضافة وظيفة التعديل لاحقاً
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
    const matches = drugList.filter(d => d.name && d.name.includes(term)).slice(0, 5);
    UI.drugSuggestions.innerHTML = matches.length ? matches.map(d => `<div class="suggestion-item" data-drug="${d.name}">${d.name}</div>`).join('') : '<div class="suggestion-item">اضغط Enter لإضافة جديد</div>';
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
    if (!quantity) { UI.doseSuggestionsContainer.innerHTML = ''; return; }
    const num = parseInt(quantity);
    if (isNaN(num)) return;
    const unit = UI.unitLabel.textContent;
    const suggestions = [
        { text: `${num} ${unit} يومياً` },
        { text: `${num} ${unit} كل 8 ساعات` },
        { text: `${num} ${unit} كل 12 ساعة` }
    ];
    UI.doseSuggestionsContainer.innerHTML = suggestions.map(s => `
        <div class="suggestion-row">
            <span class="suggestion-text">${s.text}</span>
            <div class="timing-buttons">
                <button class="timing-btn-sm" data-timing="before" title="قبل الأكل"><i class="fas fa-utensils"></i></button>
                <button class="timing-btn-sm" data-timing="after" title="بعد الأكل"><i class="fas fa-utensils"></i></button>
                <button class="timing-btn-sm active" data-timing="any" title="لا يهم"><i class="fas fa-minus"></i></button>
            </div>
        </div>
    `).join('');
    // إضافة مستمعي الأحداث لأزرار التوقيت
    document.querySelectorAll('.timing-btn-sm').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const parentRow = btn.closest('.suggestion-row');
            parentRow.querySelectorAll('.timing-btn-sm').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // يمكن تخزين التوقيت المختار مع الاقتراح
        });
    });
}

UI.doseNumberInput.addEventListener('input', generateDoseSuggestions);

UI.applyDoseBtn.addEventListener('click', () => {
    const quantity = UI.doseNumberInput.value.trim();
    if (!doseState.drug || !quantity) return;
    const formText = UI.drugFormSelect.options[UI.drugFormSelect.selectedIndex].text;
    // الحصول على الاقتراح المختار (أول اقتراح مع التوقيت النشط)
    const activeRow = document.querySelector('.suggestion-row');
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
        await set(ref(db, `prescriptions/${currentAppointment.id}`), {
            patientName: currentAppointment.patientName,
            patientId: currentAppointment.patientId,
            doctorId: currentUser.uid,
            doctorName: doctorInfo.name,
            items: currentPrescription,
            createdAt: new Date().toISOString()
        });
        await update(ref(db, `appointments/${currentAppointment.id}`), { status: 'منتهي' });
        showToast('✅ تم إنهاء الكشف');
        currentAppointment = null; currentPrescription = [];
        UI.currentPatientCard.style.display = 'none';
        UI.emptyPrescriptionMsg.style.display = 'block';
        UI.prescriptionContent.style.display = 'none';
    } catch (e) { showToast('فشل الحفظ', true); }
});

// ---------- القوالب ----------
UI.templatesBtn.addEventListener('click', async () => {
    const snap = await get(ref(db, `templates/${currentUser.uid}`));
    UI.templatesList.innerHTML = '';
    if (snap.exists()) {
        Object.entries(snap.val()).forEach(([id, t]) => {
            const div = document.createElement('div'); div.style.padding='12px'; div.style.cursor='pointer';
            div.innerHTML = `<b>${t.name}</b><br><small>${t.items.length} أصناف</small>`;
            div.onclick = () => { currentPrescription = t.items; renderPrescriptionItems(); UI.templatesModal.style.display='none'; };
            UI.templatesList.appendChild(div);
        });
    } else UI.templatesList.innerHTML = '<div class="empty-state">لا توجد قوالب</div>';
    UI.templatesModal.style.display = 'flex';
});

UI.saveTemplateBtn.addEventListener('click', () => {
    if (currentPrescription.length === 0) { showToast('الروشتة فارغة', true); return; }
    UI.saveTemplateModal.style.display = 'flex';
});

window.saveAsTemplate = async function() {
    const name = document.getElementById('templateNameInput').value.trim();
    if (!name) return;
    await push(ref(db, `templates/${currentUser.uid}`), { name, items: currentPrescription, createdAt: new Date().toISOString() });
    showToast('تم حفظ القالب');
    UI.saveTemplateModal.style.display = 'none';
};

// ---------- أحداث النوافذ ----------
UI.queueModalBtn.addEventListener('click', () => UI.queueModal.style.display = 'flex');
UI.closeQueueModalBtn.addEventListener('click', () => UI.queueModal.style.display = 'none');
UI.queueTabs.forEach(tab => tab.addEventListener('click', () => {
    UI.queueTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentQueueTab = tab.dataset.queueTab;
    renderQueueModalList();
}));

UI.logoutBtn.addEventListener('click', async () => { await signOut(auth); window.location.href = 'index.html'; });

// ---------- بدء التطبيق ----------
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    currentUser = user;
    await loadDoctorData(user);
    await loadDrugs();
    loadAppointments();
    updateUnitLabel();
});

// إغلاق النوافذ بالنقر خارجها
window.onclick = (e) => {
    if (e.target === UI.templatesModal) UI.templatesModal.style.display = 'none';
    if (e.target === UI.saveTemplateModal) UI.saveTemplateModal.style.display = 'none';
    if (e.target === UI.queueModal) UI.queueModal.style.display = 'none';
};
