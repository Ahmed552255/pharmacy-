import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getDatabase, ref, onValue, get } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ---------- الحالة ----------
let currentUser = null;
let pharmacistInfo = null;
let doctorsList = [];
let allPrescriptions = [];
let patientsMap = {};
let itemsCountMap = {};
let selectedDoctorId = null;
let currentDoctorTab = 'لم تصرف بعد';
let unsubscribePrescriptions = null;
let unsubscribeDoctors = null;
let unsubscribePatients = null;

const PHARMACIST_STORAGE_KEY = 'pharmacist_selected_doctor';

// ---------- عناصر DOM ----------
const UI = {
    welcomeMessage: document.getElementById('welcomeMessage'),
    doctorsSidebar: document.getElementById('doctorsSidebar'),
    toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
    doctorListContainer: document.getElementById('doctorListContainer'),
    refreshDoctorsBtn: document.getElementById('refreshDoctorsBtn'),
    selectedDoctorTitle: document.getElementById('selectedDoctorTitle'),
    prescriptionsListContainer: document.getElementById('prescriptionsListContainer'),
    logoutBtn: document.getElementById('logoutBtn'),
    tabBtns: document.querySelectorAll('[data-doctor-tab]'),
    searchPatientBtn: document.getElementById('searchPatientBtn'),
    searchPatientModal: document.getElementById('searchPatientModal'),
    closeSearchModalBtn: document.getElementById('closeSearchModalBtn'),
    patientSearchInput: document.getElementById('patientSearchInput'),
    executeSearchBtn: document.getElementById('executeSearchBtn'),
    searchResultsContainer: document.getElementById('searchResultsContainer')
};

function showToast(msg, isErr = false) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.background = isErr ? '#B23B3B' : '#4A3B2C';
    t.innerHTML = `<i class="fas ${isErr ? 'fa-exclamation-triangle' : 'fa-check'}"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m] || m);
}

function saveSelectedDoctor() {
    if (selectedDoctorId) localStorage.setItem(PHARMACIST_STORAGE_KEY, selectedDoctorId);
}

function loadSavedDoctor() {
    return localStorage.getItem(PHARMACIST_STORAGE_KEY);
}

async function loadPharmacistData(user) {
    try {
        const snap = await get(ref(db, `users/${user.uid}`));
        if (!snap.exists()) {
            showToast('بيانات الصيدلي غير موجودة.', true);
            return false;
        }
        const data = snap.val();
        if (data.role !== 'pharmacist') {
            showToast('هذا الحساب ليس حساب صيدلي.', true);
            return false;
        }
        pharmacistInfo = data;
        UI.welcomeMessage.textContent = `أهلاً، ${pharmacistInfo.name || 'صيدلي'}`;
        return true;
    } catch (err) {
        showToast('فشل تحميل البيانات', true);
        return false;
    }
}

function loadDoctors() {
    const usersRef = ref(db, 'users');
    if (unsubscribeDoctors) unsubscribeDoctors();
    unsubscribeDoctors = onValue(usersRef, (snap) => {
        const docs = [];
        snap.forEach(child => {
            const user = child.val();
            if (user.role === 'doctor') {
                docs.push({ id: child.key, ...user });
            }
        });
        doctorsList = docs;
        renderDoctorsList();
    });
}

function renderDoctorsList() {
    if (doctorsList.length === 0) {
        UI.doctorListContainer.innerHTML = '<div class="empty-state"><i class="fas fa-user-md"></i> لا يوجد أطباء</div>';
        return;
    }
    let html = '';
    doctorsList.forEach(doc => {
        const pendingCount = allPrescriptions.filter(p => p.doctor_id === doc.id && p.status ===
            'لم تصرف بعد').length;
        html += `
            <div class="doctor-item ${selectedDoctorId === doc.id ? 'active' : ''}" data-doctor-id="${doc.id}">
                <div class="doctor-info">
                    <div class="doctor-avatar"><i class="fas fa-user-md"></i></div>
                    <span class="doctor-name">د. ${escapeHtml(doc.name || '---')}</span>
                </div>
                ${pendingCount > 0 ? `<span class="new-badge badge-pulse">${pendingCount}</span>` : ''}
            </div>
        `;
    });
    UI.doctorListContainer.innerHTML = html;
    document.querySelectorAll('.doctor-item').forEach(el => {
        el.addEventListener('click', () => {
            const docId = el.dataset.doctorId;
            selectedDoctorId = docId;
            saveSelectedDoctor();
            renderDoctorsList();
            updateSelectedDoctorTitle();
            renderPrescriptionsForDoctor();
            // في الأجهزة الصغيرة، إخفاء الشريط الجانبي بعد الاختيار
            if (window.innerWidth <= 800) {
                UI.doctorsSidebar.classList.remove('show');
            }
        });
    });
}

function updateSelectedDoctorTitle() {
    const doc = doctorsList.find(d => d.id === selectedDoctorId);
    if (doc) {
        const pendingCount = allPrescriptions.filter(p => p.doctor_id === doc.id && p.status === 'لم تصرف بعد')
            .length;
        UI.selectedDoctorTitle.innerHTML =
            `روشتات د. ${escapeHtml(doc.name)} ${pendingCount > 0 ? `<span class="new-badge badge-pulse" style="margin-right:8px;">${pendingCount} جديدة</span>` : ''}`;
    } else {
        UI.selectedDoctorTitle.textContent = 'اختر طبيباً من القائمة';
    }
}

async function loadItemsCountForPrescriptions(prescriptionIds) {
    const updates = {};
    const promises = prescriptionIds.map(async (pid) => {
        const snap = await get(ref(db, `prescription_items/${pid}`));
        let count = 0;
        if (snap.exists()) {
            count = Object.keys(snap.val()).length;
        }
        updates[pid] = count;
    });
    await Promise.all(promises);
    return updates;
}

async function refreshItemsCount() {
    const ids = allPrescriptions.map(p => p.id);
    const newCounts = await loadItemsCountForPrescriptions(ids);
    itemsCountMap = { ...itemsCountMap, ...newCounts };
}

function loadAllPrescriptions() {
    const presRef = ref(db, 'prescriptions');
    if (unsubscribePrescriptions) unsubscribePrescriptions();
    unsubscribePrescriptions = onValue(presRef, async (snap) => {
        const prescriptions = [];
        snap.forEach(child => {
            prescriptions.push({ id: child.key, ...child.val() });
        });
        allPrescriptions = prescriptions;
        await refreshItemsCount();
        renderDoctorsList();
        if (selectedDoctorId) {
            updateSelectedDoctorTitle();
            renderPrescriptionsForDoctor();
        }
    });
}

function getPatientName(patientId) {
    return patientsMap[patientId]?.name || '';
}

function renderPrescriptionsForDoctor() {
    if (!selectedDoctorId) {
        UI.prescriptionsListContainer.innerHTML =
            '<div class="empty-state"><i class="fas fa-user-md"></i>اختر طبيباً من القائمة لعرض الروشتات</div>';
        return;
    }
    const tabStatus = currentDoctorTab;
    const filtered = allPrescriptions.filter(p => p.doctor_id === selectedDoctorId && p.status === tabStatus);
    if (filtered.length === 0) {
        UI.prescriptionsListContainer.innerHTML =
            `<div class="empty-state"><i class="fas fa-prescription"></i>لا توجد روشتات ${tabStatus === 'لم تصرف بعد' ? 'جديدة' : 'مصروفة'}</div>`;
        return;
    }
    filtered.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    let html = '';
    filtered.forEach(p => {
        const doctor = doctorsList.find(d => d.id === p.doctor_id) || { name: '' };
        const patientName = getPatientName(p.patient_id) || 'مريض';
        const itemCount = itemsCountMap[p.id] || 0;
        html += `
            <div class="rx-item-card" data-prescription-id="${p.id}">
                <div class="rx-item-header">
                    <span class="rx-patient">${escapeHtml(patientName)}</span>
                    <span class="rx-date">${p.created_at ? new Date(p.created_at).toLocaleDateString('ar-EG') : ''}</span>
                </div>
                <div class="rx-doctor">د. ${escapeHtml(doctor.name)}</div>
                <div class="rx-items-preview">${itemCount} أصناف دوائية</div>
                ${p.diagnosis ? `<div style="font-size:0.85rem; color: var(--text-sec); margin-top:4px;"><i class="fas fa-notes-medical"></i> ${escapeHtml(p.diagnosis.substring(0, 60))}${p.diagnosis.length > 60 ? '...' : ''}</div>` : ''}
                ${p.status === 'تم الصرف' ? `<div class="text-success mt-2"><i class="fas fa-check-circle"></i> تم الصرف بواسطة: ${escapeHtml(p.pharmacist_name || '')} - ${p.dispensed_at ? new Date(p.dispensed_at).toLocaleString('ar-EG') : ''}</div>` : ''}
                <button class="open-details-btn" data-prescription-id="${p.id}"><i class="fas fa-external-link-alt"></i> عرض التفاصيل</button>
            </div>
        `;
    });
    UI.prescriptionsListContainer.innerHTML = html;

    // ربط الأحداث
    document.querySelectorAll('.rx-item-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.open-details-btn')) return;
            openPrescriptionDetails(card.dataset.prescriptionId);
        });
    });
    document.querySelectorAll('.open-details-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openPrescriptionDetails(btn.dataset.prescriptionId);
        });
    });
}

/** فتح تفاصيل الروشتة في نفس النافذة */
function openPrescriptionDetails(prescriptionId) {
    if (!prescriptionId) return;
    window.location.href = `prescription-details.html?id=${prescriptionId}`;
}

// ---------- تحميل بيانات المرضى ----------
function loadPatients() {
    const patientsRef = ref(db, 'patients');
    if (unsubscribePatients) unsubscribePatients();
    unsubscribePatients = onValue(patientsRef, (snap) => {
        const map = {};
        snap.forEach(child => {
            map[child.key] = child.val();
        });
        patientsMap = map;
    });
}

// ---------- البحث عن مريض ----------
function openSearchModal() {
    UI.searchPatientModal.style.display = 'flex';
    UI.patientSearchInput.value = '';
    UI.searchResultsContainer.innerHTML =
        '<div class="empty-state"><i class="fas fa-info-circle"></i> ابدأ البحث عن مريض</div>';
    UI.patientSearchInput.focus();
}

function closeSearchModal() {
    UI.searchPatientModal.style.display = 'none';
}

async function searchPatients() {
    const term = UI.patientSearchInput.value.trim();
    if (!term) {
        showToast('الرجاء إدخال اسم أو رقم هاتف', true);
        return;
    }

    UI.searchResultsContainer.innerHTML =
        '<div class="empty-state"><i class="fas fa-spinner fa-pulse"></i> جاري البحث...</div>';
    const lowerTerm = term.toLowerCase();

    let results = [];
    const seen = new Set();

    // البحث في patientsMap
    for (const [id, p] of Object.entries(patientsMap)) {
        if (seen.has(id)) continue;
        const nameMatch = p.name && p.name.toLowerCase().includes(lowerTerm);
        const phoneMatch = p.phone && p.phone.includes(term);
        if (nameMatch || phoneMatch) {
            seen.add(id);
            results.push({ id, name: p.name, phone: p.phone || '' });
        }
    }

    // البحث في prescriptions كخطة احتياطية
    if (results.length === 0) {
        for (const p of allPrescriptions) {
            const patientId = p.patient_id;
            if (!patientId || seen.has(patientId)) continue;
            const patientName = getPatientName(patientId) || '';
            const nameMatch = patientName.toLowerCase().includes(lowerTerm);
            if (nameMatch) {
                seen.add(patientId);
                results.push({ id: patientId, name: patientName, phone: '' });
            }
        }
    }

    if (results.length === 0) {
        UI.searchResultsContainer.innerHTML =
            '<div class="empty-state"><i class="fas fa-search"></i> لا توجد نتائج مطابقة</div>';
        return;
    }

    let html = '';
    results.forEach(patient => {
        html += `
            <div class="search-result-item" data-patient-id="${patient.id}" data-patient-name="${escapeHtml(patient.name || '')}">
                <strong>${escapeHtml(patient.name || 'بدون اسم')}</strong>
                ${patient.phone ? `<span class="text-muted">${escapeHtml(patient.phone)}</span>` : ''}
            </div>
        `;
    });
    UI.searchResultsContainer.innerHTML = html;

    document.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const pid = item.dataset.patientId;
            const pname = item.dataset.patientName;
            window.location.href =
                `detail.html?patientId=${pid}&patientName=${encodeURIComponent(pname)}`;
        });
    });
}

// ---------- ربط الأحداث ----------
UI.searchPatientBtn.addEventListener('click', openSearchModal);
UI.closeSearchModalBtn.addEventListener('click', closeSearchModal);
UI.searchPatientModal.addEventListener('click', (e) => {
    if (e.target === UI.searchPatientModal) closeSearchModal();
});
UI.executeSearchBtn.addEventListener('click', searchPatients);
UI.patientSearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchPatients();
});

UI.toggleSidebarBtn.addEventListener('click', () => {
    UI.doctorsSidebar.classList.toggle('show');
});

UI.refreshDoctorsBtn.addEventListener('click', () => {
    showToast('تم تحديث قائمة الأطباء');
});

UI.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        UI.tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentDoctorTab = btn.dataset.doctorTab;
        renderPrescriptionsForDoctor();
    });
});

UI.logoutBtn.addEventListener('click', async () => {
    if (unsubscribePrescriptions) unsubscribePrescriptions();
    if (unsubscribeDoctors) unsubscribeDoctors();
    if (unsubscribePatients) unsubscribePatients();
    sessionStorage.clear();
    localStorage.removeItem(PHARMACIST_STORAGE_KEY);
    window.location.href = 'index.html';
});

// إغلاق المودال بزر ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && UI.searchPatientModal.style.display === 'flex') {
        closeSearchModal();
    }
});

// ---------- بدء التشغيل ----------
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    currentUser = user;
    const valid = await loadPharmacistData(user);
    if (!valid) {
        UI.welcomeMessage.textContent = 'خطأ في تحميل البيانات';
        return;
    }
    const savedDoctorId = loadSavedDoctor();
    if (savedDoctorId) {
        selectedDoctorId = savedDoctorId;
    }
    loadDoctors();
    loadAllPrescriptions();
    loadPatients();
});

// تحسين: في الأجهزة الصغيرة، افتح الشريط الجانبي تلقائياً إذا لم يتم اختيار طبيب
if (window.innerWidth <= 800 && !selectedDoctorId) {
    UI.doctorsSidebar.classList.add('show');
}
