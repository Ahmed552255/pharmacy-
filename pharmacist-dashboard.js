import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, onValue, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ---------- ✅ ثوابت التخزين المحلي ----------
const STORAGE_PREFIX = 'shifa_tenant_';

const LOGIN_STORAGE_KEYS = [
    'shifa_session',
    'shifa_remember',
    'shifa_last_login',
    'shifa_secure_session'
];

let currentTenantId = null;

const getTenantStorageKey = (baseKey) => {
    return currentTenantId ? `${STORAGE_PREFIX}${currentTenantId}_${baseKey}` : baseKey;
};

const getPharmacistStorageKey = () => getTenantStorageKey('pharmacist_selected_doctor');

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

// ---------- عناصر DOM ----------
const UI = {
    welcomeMessage: document.getElementById('welcomeMessage'),
    tenantBadge: document.getElementById('tenantBadge'),
    tenantName: document.getElementById('tenantName'),
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
    searchResultsContainer: document.getElementById('searchResultsContainer'),
    syncDot: document.getElementById('syncDot')
};

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

function setSyncStatus(online) {
    if (UI.syncDot) {
        UI.syncDot.className = `sync-dot ${online ? 'on' : 'off'}`;
        UI.syncDot.title = online ? 'متصل بالسحابة' : 'غير متصل - استخدام البيانات المحلية';
    }
}

function saveSelectedDoctor() {
    if (selectedDoctorId && currentTenantId) {
        localStorage.setItem(getPharmacistStorageKey(), selectedDoctorId);
    }
}

function loadSavedDoctor() {
    if (!currentTenantId) return null;
    return localStorage.getItem(getPharmacistStorageKey());
}

function clearLoginSessionOnly() {
    try {
        LOGIN_STORAGE_KEYS.forEach(key => {
            localStorage.removeItem(key);
        });
        
        const sessionKeysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('shifa_session') || key.startsWith('shifa_secure'))) {
                sessionKeysToRemove.push(key);
            }
        }
        sessionKeysToRemove.forEach(key => localStorage.removeItem(key));
        
        sessionStorage.clear();
        
        console.log(`✅ تم مسح ${LOGIN_STORAGE_KEYS.length + sessionKeysToRemove.length} مفتاح جلسة`);
        console.log('💾 تم الإبقاء على بيانات المجمع المحلية');
    } catch (e) {
        console.warn('تعذر مسح بيانات الجلسة:', e.message);
    }
}

// ---------- ✅ تحميل بيانات الصيدلي (تم تصحيحها) ----------
async function loadPharmacistData(user) {
    try {
        // 1️⃣ استخراج tenantId من الرابط
        const urlParams = new URLSearchParams(window.location.search);
        const tenantFromUrl = urlParams.get('tenant');
        
        // 2️⃣ استخراج tenantId من الجلسة المشفرة
        let tenantFromSession = null;
        try {
            const encrypted = localStorage.getItem('shifa_secure_session');
            if (encrypted) {
                const decoded = atob(encrypted);
                const match = decoded.match(/"tenantId":"([^"]+)"/);
                if (match) tenantFromSession = match[1];
            }
        } catch (e) {
            console.warn('تعذر فك تشفير الجلسة:', e.message);
        }
        
        // 3️⃣ تحديد tenantId الأولي
        const possibleTenantId = tenantFromUrl || tenantFromSession || user.uid;
        
        // 4️⃣ ✅ البحث أولاً في مسار المجمع (مثل الأدمن والطبيب والممرض)
        const tenantUserRef = ref(db, `tenants/${possibleTenantId}/users/${user.uid}`);
        const tenantUserSnap = await get(tenantUserRef);
        
        let userData = null;
        
        if (tenantUserSnap.exists()) {
            userData = tenantUserSnap.val();
            currentTenantId = possibleTenantId;
            console.log(`✅ تم العثور على الصيدلي في مسار المجمع: ${currentTenantId}`);
        } else {
            // 5️⃣ البحث في كل المجمعات
            const tenantsSnap = await get(ref(db, 'tenants'));
            if (tenantsSnap.exists()) {
                const tenants = tenantsSnap.val();
                for (const tenantId of Object.keys(tenants)) {
                    const userRef = ref(db, `tenants/${tenantId}/users/${user.uid}`);
                    const userSnap = await get(userRef);
                    if (userSnap.exists()) {
                        userData = userSnap.val();
                        currentTenantId = tenantId;
                        console.log(`✅ تم العثور على الصيدلي في مجمع: ${tenantId}`);
                        break;
                    }
                }
            }
            
            // 6️⃣ البحث في المسار العام كخطة أخيرة
            if (!userData) {
                const publicSnap = await get(ref(db, `users/${user.uid}`));
                if (publicSnap.exists()) {
                    userData = publicSnap.val();
                    currentTenantId = userData.tenantId || user.uid;
                    console.log(`⚠️ تم العثور على الصيدلي في المسار العام: ${currentTenantId}`);
                }
            }
        }
        
        // 7️⃣ التحقق من وجود البيانات وصلاحيتها
        if (!userData) {
            console.error('❌ الصيدلي غير موجود في أي مسار');
            showToast('بيانات الصيدلي غير موجودة.', true);
            return false;
        }
        
        if (userData.role !== 'pharmacist') {
            console.error('❌ المستخدم ليس صيدلياً');
            showToast('هذا الحساب ليس حساب صيدلي.', true);
            return false;
        }
        
        // 8️⃣ تخزين البيانات
        pharmacistInfo = userData;
        
        if (UI.welcomeMessage) {
            UI.welcomeMessage.textContent = `أهلاً، ${pharmacistInfo.name || 'صيدلي'}`;
        }
        
        const tenantName = userData.tenantName || 'المجمع الطبي';
        if (UI.tenantName) UI.tenantName.textContent = tenantName;
        
        // 9️⃣ تخزين في sessionStorage
        sessionStorage.setItem('shifa_tenant_id', currentTenantId);
        sessionStorage.setItem('userUid', user.uid);
        sessionStorage.setItem('userRole', 'pharmacist');
        
        console.log(`✅ تم تحميل بيانات الصيدلي بنجاح - المجمع: ${currentTenantId}`);
        return true;
        
    } catch (err) {
        console.error('❌ خطأ في تحميل بيانات الصيدلي:', err);
        showToast('فشل تحميل البيانات: ' + err.message, true);
        return false;
    }
}

// ✅ تحميل الأطباء من مسار المجمع
function loadDoctors() {
    if (!currentTenantId) return;
    
    const usersRef = ref(db, `tenants/${currentTenantId}/users`);
    if (unsubscribeDoctors) unsubscribeDoctors();
    
    unsubscribeDoctors = onValue(usersRef, (snap) => {
        const docs = [];
        snap.forEach(child => {
            const user = child.val();
            if (user.role === 'doctor') {
                docs.push({ id: child.key, ...user });
            }
        });
        
        if (docs.length === 0) {
            console.log('⚠️ لا يوجد أطباء في مسار المجمع، محاولة المسار العام...');
            loadDoctorsFromPublic();
            return;
        }
        
        doctorsList = docs;
        setSyncStatus(true);
        renderDoctorsList();
    }, (error) => {
        console.warn('خطأ في تحميل الأطباء من المجمع:', error.message);
        setSyncStatus(false);
        loadDoctorsFromPublic();
    });
}

function loadDoctorsFromPublic() {
    const usersRef = ref(db, 'users');
    if (unsubscribeDoctors) unsubscribeDoctors();
    
    unsubscribeDoctors = onValue(usersRef, (snap) => {
        const docs = [];
        snap.forEach(child => {
            const user = child.val();
            if (user.role === 'doctor' && (user.tenantId === currentTenantId || user.tenantId === undefined)) {
                docs.push({ id: child.key, ...user });
            }
        });
        doctorsList = docs;
        setSyncStatus(docs.length > 0);
        renderDoctorsList();
    }, (error) => {
        console.warn('خطأ في تحميل الأطباء من المسار العام:', error.message);
        setSyncStatus(false);
    });
}

function renderDoctorsList() {
    if (doctorsList.length === 0) {
        UI.doctorListContainer.innerHTML = '<div class="empty-state"><i class="fas fa-user-md"></i> لا يوجد أطباء</div>';
        return;
    }
    let html = '';
    doctorsList.forEach(doc => {
        const pendingCount = allPrescriptions.filter(p => p.doctor_id === doc.id && p.status === 'لم تصرف بعد').length;
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
            if (window.innerWidth <= 800) {
                UI.doctorsSidebar.classList.remove('show');
            }
        });
    });
}

function updateSelectedDoctorTitle() {
    const doc = doctorsList.find(d => d.id === selectedDoctorId);
    if (doc) {
        const pendingCount = allPrescriptions.filter(p => p.doctor_id === doc.id && p.status === 'لم تصرف بعد').length;
        UI.selectedDoctorTitle.innerHTML =
            `روشتات د. ${escapeHtml(doc.name)} ${pendingCount > 0 ? `<span class="new-badge badge-pulse" style="margin-right:8px;">${pendingCount} جديدة</span>` : ''}`;
    } else {
        UI.selectedDoctorTitle.textContent = 'اختر طبيباً من القائمة';
    }
}

async function loadItemsCountForPrescriptions(prescriptionIds) {
    const updates = {};
    const promises = prescriptionIds.map(async (pid) => {
        const snap = await get(ref(db, `tenants/${currentTenantId}/prescription_items/${pid}`));
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
    if (!currentTenantId) return;
    
    const presRef = ref(db, `tenants/${currentTenantId}/prescriptions`);
    if (unsubscribePrescriptions) unsubscribePrescriptions();
    
    unsubscribePrescriptions = onValue(presRef, async (snap) => {
        const prescriptions = [];
        snap.forEach(child => {
            prescriptions.push({ id: child.key, ...child.val() });
        });
        allPrescriptions = prescriptions;
        setSyncStatus(true);
        await refreshItemsCount();
        renderDoctorsList();
        if (selectedDoctorId) {
            updateSelectedDoctorTitle();
            renderPrescriptionsForDoctor();
        }
    }, async (error) => {
        console.warn('خطأ في تحميل الوصفات من المجمع:', error.message);
        setSyncStatus(false);
        loadPrescriptionsFromPublic();
    });
}

function loadPrescriptionsFromPublic() {
    const presRef = ref(db, 'prescriptions');
    if (unsubscribePrescriptions) unsubscribePrescriptions();
    
    unsubscribePrescriptions = onValue(presRef, async (snap) => {
        const prescriptions = [];
        snap.forEach(child => {
            const rx = child.val();
            if (rx.tenantId === currentTenantId || rx.tenantId === undefined) {
                prescriptions.push({ id: child.key, ...rx });
            }
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
    let filtered = allPrescriptions.filter(p => p.doctor_id === selectedDoctorId && p.status === tabStatus);

    if (tabStatus === 'تم الصرف') {
        filtered = filtered.filter(p => {
            if (!p.dispensed_at) return false;
            return p.dispensed_at.startsWith(today);
        });
    }

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

function openPrescriptionDetails(prescriptionId) {
    if (!prescriptionId) return;
    window.location.href = `prescription-details.html?id=${prescriptionId}&tenant=${currentTenantId}`;
}

function loadPatients() {
    if (!currentTenantId) return;
    
    const patientsRef = ref(db, `tenants/${currentTenantId}/patients`);
    if (unsubscribePatients) unsubscribePatients();
    
    unsubscribePatients = onValue(patientsRef, (snap) => {
        const map = {};
        snap.forEach(child => {
            map[child.key] = child.val();
        });
        patientsMap = map;
    }, (error) => {
        console.warn('خطأ في تحميل المرضى من المجمع:', error.message);
        loadPatientsFromPublic();
    });
}

function loadPatientsFromPublic() {
    const patientsRef = ref(db, 'patients');
    if (unsubscribePatients) unsubscribePatients();
    
    unsubscribePatients = onValue(patientsRef, (snap) => {
        const map = {};
        snap.forEach(child => {
            const p = child.val();
            if (p.tenantId === currentTenantId || p.tenantId === undefined) {
                map[child.key] = p;
            }
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

    for (const [id, p] of Object.entries(patientsMap)) {
        if (seen.has(id)) continue;
        const nameMatch = p.name && p.name.toLowerCase().includes(lowerTerm);
        const phoneMatch = p.phone && p.phone.includes(term);
        if (nameMatch || phoneMatch) {
            seen.add(id);
            results.push({ id, name: p.name, phone: p.phone || '' });
        }
    }

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
                `detail.html?patientId=${pid}&patientName=${encodeURIComponent(pname)}&tenant=${currentTenantId}`;
        });
    });
}

// ---------- ربط الأحداث ----------
UI.searchPatientBtn?.addEventListener('click', openSearchModal);
UI.closeSearchModalBtn?.addEventListener('click', closeSearchModal);
UI.searchPatientModal?.addEventListener('click', (e) => {
    if (e.target === UI.searchPatientModal) closeSearchModal();
});
UI.executeSearchBtn?.addEventListener('click', searchPatients);
UI.patientSearchInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchPatients();
});

UI.toggleSidebarBtn?.addEventListener('click', () => {
    UI.doctorsSidebar.classList.toggle('show');
});

UI.refreshDoctorsBtn?.addEventListener('click', () => {
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

UI.logoutBtn?.addEventListener('click', async () => {
    try {
        showToast('👋 جاري تسجيل الخروج...');
        
        if (unsubscribePrescriptions) {
            unsubscribePrescriptions();
            unsubscribePrescriptions = null;
        }
        if (unsubscribeDoctors) {
            unsubscribeDoctors();
            unsubscribeDoctors = null;
        }
        if (unsubscribePatients) {
            unsubscribePatients();
            unsubscribePatients = null;
        }
        
        clearLoginSessionOnly();
        
        currentUser = null;
        pharmacistInfo = null;
        doctorsList = [];
        allPrescriptions = [];
        
        await signOut(auth);
        
        window.location.href = 'index.html';
        
    } catch (error) {
        console.error('خطأ أثناء تسجيل الخروج:', error);
        clearLoginSessionOnly();
        window.location.href = 'index.html';
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && UI.searchPatientModal?.style.display === 'flex') {
        closeSearchModal();
    }
});

// ---------- مستمعي الاتصال بالإنترنت ----------
window.addEventListener('online', () => {
    setSyncStatus(true);
    showToast('📡 تم استعادة الاتصال - جاري المزامنة');
});

window.addEventListener('offline', () => {
    setSyncStatus(false);
    showToast('⚠️ انقطع الاتصال - استخدام البيانات المحلية', true);
});

// ---------- ✅ بدء التشغيل (تم تصحيحه) ----------
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        clearLoginSessionOnly();
        window.location.href = 'index.html';
        return;
    }
    
    currentUser = user;
    
    // ✅ تحميل بيانات الصيدلي بالطريقة الصحيحة
    const valid = await loadPharmacistData(user);
    
    if (!valid) {
        UI.welcomeMessage.textContent = 'خطأ في تحميل البيانات';
        clearLoginSessionOnly();
        await signOut(auth);
        setTimeout(() => { window.location.href = 'index.html'; }, 2000);
        return;
    }
    
    // ✅ الآن currentTenantId صحيح، نكمل التحميل
    const savedDoctorId = loadSavedDoctor();
    if (savedDoctorId) {
        selectedDoctorId = savedDoctorId;
    }
    
    loadDoctors();
    loadAllPrescriptions();
    loadPatients();
});

if (window.innerWidth <= 800 && !selectedDoctorId) {
    UI.doctorsSidebar?.classList.add('show');
}

console.log('🚀 لوحة الصيدلي - نظام المجمعات الطبية المتعددة');
console.log('🔒 كل الصيادلة في نفس المجمع يشوفوا نفس الروشتات');
console.log('💾 وضع الحفظ: يمسح جلسة الدخول فقط - يحتفظ ببيانات المجمع');
