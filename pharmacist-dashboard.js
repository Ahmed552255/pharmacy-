import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, onValue, get, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// ============ تهيئة Firebase ============
const app = initializeApp(firebaseConfig );
const auth = getAuth(app);
const db = getDatabase(app);

// ============ ثوابت التخزين المحلي ============
const STORAGE_PREFIX = 'shifa_tenant_';

const LOGIN_STORAGE_KEYS = [
    'shifa_session',
    'shifa_remember', 
    'shifa_last_login',
    'shifa_secure_session'
];

let currentTenantId = null;

// ============ دوال التخزين المساعدة ============
function getTenantStorageKey(baseKey) {
    return currentTenantId ? `${STORAGE_PREFIX}${currentTenantId}_${baseKey}` : baseKey;
}

function getPharmacistStorageKey() {
    return getTenantStorageKey('pharmacist_selected_doctor');
}

function clearLoginSessionOnly() {
    try {
        LOGIN_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
        
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('shifa_session') || key.startsWith('shifa_secure'))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        sessionStorage.clear();
        console.log('✅ تم مسح بيانات الجلسة فقط');
    } catch (e) {
        console.warn('تعذر مسح بيانات الجلسة:', e.message);
    }
}

// ============ الحالة العامة ============
const state = {
    currentUser: null,
    pharmacistInfo: null,
    doctorsList: [],
    allPrescriptions: [],
    patientsMap: {},
    itemsCountMap: {},
    selectedDoctorId: null,
    currentTab: 'لم تصرف بعد',
    unsubscribePrescriptions: null,
    unsubscribeDoctors: null,
    unsubscribePatients: null
};

// ============ عناصر DOM ============
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

// ============ دوال مساعدة ============
function getToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const today = getToday();

function showToast(msg, isError = false) {
    const old = document.querySelector('.toast-popup');
    if (old) old.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast-popup';
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${isError ? '#C62828' : '#1A3C4A'};
        color: white;
        padding: 12px 20px;
        border-radius: 50px;
        font-weight: 600;
        font-size: 0.85rem;
        z-index: 3000;
        box-shadow: 0 8px 20px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        gap: 8px;
        animation: slideIn 0.3s ease;
    `;
    toast.innerHTML = `<i class="fas ${isError ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i> ${msg}`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function setSyncStatus(online) {
    if (UI.syncDot) {
        UI.syncDot.className = `sync-dot ${online ? 'on' : 'off'}`;
        UI.syncDot.title = online ? 'متصل بالسحابة' : 'غير متصل';
    }
}

function saveSelectedDoctor() {
    if (state.selectedDoctorId && currentTenantId) {
        localStorage.setItem(getPharmacistStorageKey(), state.selectedDoctorId);
    }
}

function loadSavedDoctor() {
    if (!currentTenantId) return null;
    return localStorage.getItem(getPharmacistStorageKey());
}

// ============ تحميل بيانات الصيدلي (النسخة المصححة والآمنة) ============
async function loadPharmacistData(user) {
    try {
        console.log('🔍 بدء تحميل بيانات الصيدلي...');
        let tenantId = null;

        // 1. محاولة استخراج tenantId من الرابط
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('tenant')) {
            tenantId = urlParams.get('tenant');
        }

        // 2. محاولة استخراج tenantId من الجلسة المشفرة
        if (!tenantId) {
            try {
                const encrypted = localStorage.getItem('shifa_secure_session');
                if (encrypted) {
                    const decoded = atob(encrypted);
                    const match = decoded.match(/"tenantId":"([^"]+)"/);
                    if (match) tenantId = match[1];
                }
            } catch (e) { console.warn('تعذر فك تشفير الجلسة'); }
        }

        // 3. محاولة استخراج tenantId من الجلسة القديمة
        if (!tenantId) {
            try {
                const oldSession = localStorage.getItem('shifa_session');
                if (oldSession) {
                    tenantId = JSON.parse(oldSession).tenantId;
                }
            } catch (e) {}
        }

        let userData = null;

        // 4. البحث في مسار المجمع إذا عرفنا الـ tenantId
        if (tenantId) {
            console.log(`🔍 البحث في المجمع المحدد: ${tenantId}`);
            const tenantUserRef = ref(db, `tenants/${tenantId}/users/${user.uid}`);
            const tenantUserSnap = await get(tenantUserRef);
            if (tenantUserSnap.exists()) {
                userData = tenantUserSnap.val();
                currentTenantId = tenantId;
                console.log('✅ تم العثور على الصيدلي في المجمع المحدد');
            }
        }

        // 5. إذا لم نجد البيانات، نبحث في المسار العام (المؤشر) كخطة بديلة
        if (!userData) {
            console.log('🔍 محاولة المسار العام (المؤشر)...');
            const publicSnap = await get(ref(db, `users/${user.uid}`));
            if (publicSnap.exists()) {
                userData = publicSnap.val();
                currentTenantId = userData.tenantId || user.uid;
                console.log('⚠️ تم العثور على الصيدلي في المسار العام');
            }
        }

        // 6. التحقق النهائي من وجود البيانات وصلاحيتها
        if (!userData) {
            console.error('❌ لم يتم العثور على بيانات الصيدلي');
            showToast('بيانات الصيدلي غير موجودة. يرجى تسجيل الدخول مرة أخرى.', true);
            return false;
        }
        
        if (userData.role !== 'pharmacist') {
            console.error('❌ المستخدم ليس صيدلياً، دوره:', userData.role);
            showToast('هذا الحساب ليس حساب صيدلي.', true);
            return false;
        }
        
        // 7. تخزين البيانات وتحديث الواجهة
        state.pharmacistInfo = userData;
        
        if (UI.welcomeMessage) {
            UI.welcomeMessage.textContent = `أهلاً، ${userData.name || 'صيدلي'}`;
        }
        
        if (UI.tenantName) {
            UI.tenantName.textContent = userData.tenantName || 'المجمع الطبي';
        }
        
        sessionStorage.setItem('shifa_tenant_id', currentTenantId);
        sessionStorage.setItem('userUid', user.uid);
        sessionStorage.setItem('userRole', 'pharmacist');
        
        console.log(`✅ تم تحميل بيانات الصيدلي بنجاح - المجمع: ${currentTenantId}`);
        return true;
        
    } catch (err) {
        console.error('❌ خطأ في تحميل بيانات الصيدلي:', err);
        showToast('فشل تحميل البيانات: تأكد من اتصالك بالإنترنت', true);
        return false;
    }
}

// ============ تحميل الأطباء ============
function loadDoctors() {
    if (!currentTenantId) {
        console.warn('⚠️ لم يتم تحديد المجمع بعد');
        return;
    }
    
    console.log('🔄 تحميل قائمة الأطباء...');
    const usersRef = ref(db, `tenants/${currentTenantId}/users`);
    
    if (state.unsubscribeDoctors) {
        state.unsubscribeDoctors();
    }
    
    state.unsubscribeDoctors = onValue(usersRef, (snap) => {
        const doctors = [];
        snap.forEach(child => {
            const user = child.val();
            if (user.role === 'doctor') {
                doctors.push({ id: child.key, ...user });
            }
        });
        
        console.log(`✅ تم تحميل ${doctors.length} طبيب`);
        state.doctorsList = doctors;
        setSyncStatus(true);
        renderDoctorsList();
        updateSelectedDoctorTitle();
        
    }, (error) => {
        console.error('❌ خطأ في تحميل الأطباء:', error);
        setSyncStatus(false);
        showToast('⚠️ فشل تحميل قائمة الأطباء', true);
    });
}

function renderDoctorsList() {
    if (!UI.doctorListContainer) return;
    
    if (state.doctorsList.length === 0) {
        UI.doctorListContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-md"></i>
                <p>لا يوجد أطباء</p>
            </div>`;
        return;
    }
    
    let html = '';
    state.doctorsList.forEach(doc => {
        const pendingCount = state.allPrescriptions.filter(
            p => p.doctor_id === doc.id && p.status === 'لم تصرف بعد'
        ).length;
        
        const isActive = state.selectedDoctorId === doc.id;
        
        html += `
            <div class="doctor-item ${isActive ? 'active' : ''}" data-doctor-id="${doc.id}">
                <div class="doctor-info">
                    <div class="doctor-avatar">
                        <i class="fas fa-user-md"></i>
                    </div>
                    <span class="doctor-name">د. ${escapeHtml(doc.name || 'بدون اسم')}</span>
                </div>
                ${pendingCount > 0 ? `<span class="badge">${pendingCount}</span>` : ''}
            </div>`;
    });
    
    UI.doctorListContainer.innerHTML = html;
    
    // ربط الأحداث
    document.querySelectorAll('.doctor-item').forEach(item => {
        item.addEventListener('click', () => {
            const docId = item.dataset.doctorId;
            selectDoctor(docId);
        });
    });
}

function selectDoctor(docId) {
    state.selectedDoctorId = docId;
    saveSelectedDoctor();
    renderDoctorsList();
    updateSelectedDoctorTitle();
    renderPrescriptions();
    
    // إخفاء السايدبار في الموبايل
    if (window.innerWidth <= 800) {
        UI.doctorsSidebar?.classList.remove('show');
    }
}

function updateSelectedDoctorTitle() {
    if (!UI.selectedDoctorTitle) return;
    
    const doc = state.doctorsList.find(d => d.id === state.selectedDoctorId);
    if (doc) {
        const pendingCount = state.allPrescriptions.filter(
            p => p.doctor_id === doc.id && p.status === 'لم تصرف بعد'
        ).length;
        
        UI.selectedDoctorTitle.innerHTML = `
            روشتات د. ${escapeHtml(doc.name)}
            ${pendingCount > 0 ? `<span class="badge">${pendingCount} جديدة</span>` : ''}
        `;
    } else {
        UI.selectedDoctorTitle.textContent = 'اختر طبيباً من القائمة';
    }
}

// ============ تحميل الوصفات ============
function loadPrescriptions() {
    if (!currentTenantId) return;
    
    console.log('🔄 تحميل الوصفات...');
    const presRef = ref(db, `tenants/${currentTenantId}/prescriptions`);
    
    if (state.unsubscribePrescriptions) {
        state.unsubscribePrescriptions();
    }
    
    state.unsubscribePrescriptions = onValue(presRef, async (snap) => {
        const prescriptions = [];
        snap.forEach(child => {
            prescriptions.push({ id: child.key, ...child.val() });
        });
        
        console.log(`✅ تم تحميل ${prescriptions.length} وصفة`);
        state.allPrescriptions = prescriptions;
        setSyncStatus(true);
        
        await refreshItemsCount();
        renderDoctorsList();
        updateSelectedDoctorTitle();
        renderPrescriptions();
        
    }, (error) => {
        console.error('❌ خطأ في تحميل الوصفات:', error);
        setSyncStatus(false);
        showToast('⚠️ فشل تحميل الوصفات', true);
    });
}

async function refreshItemsCount() {
    const ids = state.allPrescriptions.map(p => p.id);
    const counts = {};
    
    const promises = ids.map(async (pid) => {
        try {
            const snap = await get(ref(db, `tenants/${currentTenantId}/prescription_items/${pid}`));
            counts[pid] = snap.exists() ? Object.keys(snap.val()).length : 0;
        } catch (error) {
            counts[pid] = 0;
        }
    });
    
    await Promise.all(promises);
    state.itemsCountMap = counts;
}

function renderPrescriptions() {
    if (!UI.prescriptionsListContainer) return;
    
    if (!state.selectedDoctorId) {
        UI.prescriptionsListContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-md"></i>
                <p>اختر طبيباً من القائمة لعرض الروشتات</p>
            </div>`;
        return;
    }
    
    // تصفية الوصفات
    let filtered = state.allPrescriptions.filter(p => 
        p.doctor_id === state.selectedDoctorId && 
        p.status === state.currentTab
    );
    
    // تصفية إضافية للوصفات المصروفة اليوم
    if (state.currentTab === 'تم الصرف') {
        filtered = filtered.filter(p => 
            p.dispensed_at && p.dispensed_at.startsWith(today)
        );
    }
    
    if (filtered.length === 0) {
        const tabText = state.currentTab === 'لم تصرف بعد' ? 'جديدة' : 'مصروفة اليوم';
        UI.prescriptionsListContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-prescription"></i>
                <p>لا توجد روشتات ${tabText}</p>
            </div>`;
        return;
    }
    
    // ترتيب حسب التاريخ
    filtered.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    
    let html = '';
    filtered.forEach(p => {
        const doctor = state.doctorsList.find(d => d.id === p.doctor_id);
        const patientName = state.patientsMap[p.patient_id]?.name || 'مريض';
        const itemCount = state.itemsCountMap[p.id] || 0;
        const createdAt = p.created_at ? new Date(p.created_at).toLocaleDateString('ar-EG') : '';
        
        html += `
            <div class="prescription-card" data-id="${p.id}">
                <div class="card-header">
                    <span class="patient-name">${escapeHtml(patientName)}</span>
                    <span class="date">${createdAt}</span>
                </div>
                <div class="card-body">
                    <div class="doctor-name">د. ${escapeHtml(doctor?.name || '')}</div>
                    <div class="items-count">${itemCount} أصناف دوائية</div>
                    ${p.diagnosis ? `<div class="diagnosis">${escapeHtml(p.diagnosis.substring(0, 80))}</div>` : ''}
                </div>
                ${p.status === 'تم الصرف' ? `
                    <div class="card-footer dispensed">
                        <i class="fas fa-check-circle"></i>
                        تم الصرف: ${new Date(p.dispensed_at).toLocaleString('ar-EG')}
                    </div>
                ` : ''}
            </div>`;
    });
    
    UI.prescriptionsListContainer.innerHTML = html;
    
    // ربط أحداث الضغط
    document.querySelectorAll('.prescription-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            if (id) {
                window.location.href = `prescription-details.html?id=${id}&tenant=${currentTenantId}`;
            }
        });
    });
}

// ============ تحميل المرضى ============
function loadPatients() {
    if (!currentTenantId) return;
    
    const patientsRef = ref(db, `tenants/${currentTenantId}/patients`);
    
    if (state.unsubscribePatients) {
        state.unsubscribePatients();
    }
    
    state.unsubscribePatients = onValue(patientsRef, (snap) => {
        const map = {};
        snap.forEach(child => {
            map[child.key] = child.val();
        });
        state.patientsMap = map;
        console.log(`✅ تم تحميل ${Object.keys(map).length} مريض`);
        
    }, (error) => {
        console.error('❌ خطأ في تحميل المرضى:', error);
    });
}

// ============ البحث عن مريض ============
function openSearchModal() {
    if (UI.searchPatientModal) {
        UI.searchPatientModal.style.display = 'flex';
        if (UI.patientSearchInput) {
            UI.patientSearchInput.value = '';
            UI.patientSearchInput.focus();
        }
        if (UI.searchResultsContainer) {
            UI.searchResultsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>اكتب اسم المريض أو رقم هاتفه</p>
                </div>`;
        }
    }
}

function closeSearchModal() {
    if (UI.searchPatientModal) {
        UI.searchPatientModal.style.display = 'none';
    }
}

function searchPatients() {
    const term = UI.patientSearchInput?.value.trim();
    if (!term) {
        showToast('الرجاء إدخال اسم أو رقم هاتف', true);
        return;
    }
    
    if (!UI.searchResultsContainer) return;
    
    UI.searchResultsContainer.innerHTML = `
        <div class="loading">
            <i class="fas fa-spinner fa-spin"></i>
            جاري البحث...
        </div>`;
    
    const lowerTerm = term.toLowerCase();
    const results = [];
    const seen = new Set();
    
    // البحث في خريطة المرضى
    for (const [id, patient] of Object.entries(state.patientsMap)) {
        if (seen.has(id)) continue;
        
        const nameMatch = patient.name?.toLowerCase().includes(lowerTerm);
        const phoneMatch = patient.phone?.includes(term);
        
        if (nameMatch || phoneMatch) {
            seen.add(id);
            results.push({ id, name: patient.name, phone: patient.phone || '' });
        }
    }
    
    // البحث في الوصفات
    if (results.length === 0) {
        for (const prescription of state.allPrescriptions) {
            if (!prescription.patient_id || seen.has(prescription.patient_id)) continue;
            
            const patientName = state.patientsMap[prescription.patient_id]?.name || prescription.patient_name || '';
            if (patientName.toLowerCase().includes(lowerTerm)) {
                seen.add(prescription.patient_id);
                results.push({ 
                    id: prescription.patient_id, 
                    name: patientName, 
                    phone: '' 
                });
            }
        }
    }
    
    if (results.length === 0) {
        UI.searchResultsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-slash"></i>
                <p>لا توجد نتائج</p>
            </div>`;
        return;
    }
    
    let html = '';
    results.forEach(patient => {
        html += `
            <div class="search-result" data-patient-id="${patient.id}">
                <strong>${escapeHtml(patient.name || 'بدون اسم')}</strong>
                ${patient.phone ? `<span class="phone">${escapeHtml(patient.phone)}</span>` : ''}
            </div>`;
    });
    
    UI.searchResultsContainer.innerHTML = html;
    
    // ربط أحداث النتائج
    document.querySelectorAll('.search-result').forEach(item => {
        item.addEventListener('click', () => {
            const patientId = item.dataset.patientId;
            const patientName = item.querySelector('strong')?.textContent || '';
            window.location.href = `detail.html?patientId=${patientId}&patientName=${encodeURIComponent(patientName)}&tenant=${currentTenantId}`;
        });
    });
}

// ============ ربط الأحداث ============
function bindEvents() {
    // زر فتح/إغلاق السايدبار
    UI.toggleSidebarBtn?.addEventListener('click', () => {
        UI.doctorsSidebar?.classList.toggle('show');
    });
    
    // تحديث الأطباء
    UI.refreshDoctorsBtn?.addEventListener('click', () => {
        loadDoctors();
        showToast('🔄 تم تحديث قائمة الأطباء');
    });
    
    // تبويبات الحالة
    UI.tabBtns?.forEach(btn => {
        btn.addEventListener('click', () => {
            UI.tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentTab = btn.dataset.doctorTab;
            renderPrescriptions();
        });
    });
    
    // البحث عن مريض
    UI.searchPatientBtn?.addEventListener('click', openSearchModal);
    UI.closeSearchModalBtn?.addEventListener('click', closeSearchModal);
    UI.searchPatientModal?.addEventListener('click', (e) => {
        if (e.target === UI.searchPatientModal) closeSearchModal();
    });
    UI.executeSearchBtn?.addEventListener('click', searchPatients);
    UI.patientSearchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchPatients();
    });
    
    // تسجيل الخروج
    UI.logoutBtn?.addEventListener('click', logout);
    
    // Escape لإغلاق المودال
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && UI.searchPatientModal?.style.display === 'flex') {
            closeSearchModal();
        }
    });
}

async function logout() {
    try {
        showToast('👋 جاري تسجيل الخروج...');
        
        // إلغاء المستمعين
        if (state.unsubscribePrescriptions) {
            state.unsubscribePrescriptions();
            state.unsubscribePrescriptions = null;
        }
        if (state.unsubscribeDoctors) {
            state.unsubscribeDoctors();
            state.unsubscribeDoctors = null;
        }
        if (state.unsubscribePatients) {
            state.unsubscribePatients();
            state.unsubscribePatients = null;
        }
        
        // مسح الجلسة
        clearLoginSessionOnly();
        
        // إعادة تعيين الحالة
        Object.assign(state, {
            currentUser: null,
            pharmacistInfo: null,
            doctorsList: [],
            allPrescriptions: [],
            patientsMap: {},
            itemsCountMap: {},
            selectedDoctorId: null
        });
        
        await
