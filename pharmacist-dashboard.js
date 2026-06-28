import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, onValue, get, set, update, remove, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// ============ 🧠 نظام التشخيص العبقري ============
const DIAGNOSTICS = {
    enabled: true,
    level: 'deep', // 'quick' | 'medium' | 'deep' | 'off'
    
    styles: {
        container: 'background:#1a1a2e;color:#e0e0e0;padding:15px;border-radius:8px;margin:10px 0;font-family:monospace;font-size:13px;',
        success: 'color:#4caf50;',
        error: 'color:#f44336;',
        warning: 'color:#ff9800;',
        info: 'color:#2196f3;',
        path: 'color:#9c27b0;',
        uid: 'color:#00bcd4;',
        highlight: 'background:#333;padding:2px 6px;border-radius:3px;'
    },
    
    showPanel() {
        const existing = document.getElementById('diagnostics-panel');
        if (existing) existing.remove();
        
        const panel = document.createElement('div');
        panel.id = 'diagnostics-panel';
        panel.style.cssText = `
            position:fixed;bottom:10px;right:10px;
            background:rgba(0,0,0,0.95);color:#0f0;
            padding:10px;border-radius:5px;
            max-width:400px;max-height:300px;
            overflow-y:auto;z-index:9999;
            font-size:12px;font-family:monospace;
            display:${DIAGNOSTICS.enabled ? 'block' : 'none'};
        `;
        panel.innerHTML = '<div style="color:#ff0;">🔍 نظام التشخيص نشط...</div>';
        document.body.appendChild(panel);
    },
    
    log(msg, type = 'info') {
        if (!DIAGNOSTICS.enabled) return;
        
        const panel = document.getElementById('diagnostics-panel');
        if (panel) {
            const line = document.createElement('div');
            const timestamp = new Date().toLocaleTimeString();
            const colors = { success: '#4caf50', error: '#f44336', warning: '#ff9800', info: '#0f0' };
            line.style.color = colors[type] || '#0f0';
            line.textContent = `[${timestamp}] ${msg}`;
            panel.appendChild(line);
            panel.scrollTop = panel.scrollHeight;
        }
        
        const consoleStyles = {
            success: 'color: green; font-weight: bold;',
            error: 'color: red; font-weight: bold;',
            warning: 'color: orange; font-weight: bold;',
            info: 'color: blue;'
        };
        console.log(`%c🧠 ${msg}`, consoleStyles[type] || '');
    },
    
    async quickDiagnose(user) {
        this.log('🚀 بدء التشخيص السريع...', 'info');
        this.log(`المستخدم: ${user.email}`, 'info');
        this.log(`UID: ${user.uid}`, 'uid');
        
        const urlParams = new URLSearchParams(window.location.search);
        const tenantFromUrl = urlParams.get('tenant');
        this.log(`الرابط: ${tenantFromUrl ? 'يحتوي على tenant ✅' : 'لا يحتوي على tenant ❌'}`, 
                tenantFromUrl ? 'success' : 'warning');
        
        const hasSecureSession = localStorage.getItem('shifa_secure_session');
        const hasOldSession = localStorage.getItem('shifa_session');
        this.log(`الجلسة المشفرة: ${hasSecureSession ? 'موجودة ✅' : 'غير موجودة'}`, 
                hasSecureSession ? 'success' : 'warning');
        this.log(`الجلسة القديمة: ${hasOldSession ? 'موجودة ✅' : 'غير موجودة'}`, 
                hasOldSession ? 'success' : 'warning');
        
        return { tenantFromUrl, hasSecureSession, hasOldSession };
    },
    
    async mediumDiagnose(user, quickResults) {
        this.log('🔍 بدء التشخيص المتوسط...', 'info');
        
        try {
            const publicSnap = await get(ref(db, `users/${user.uid}`));
            if (publicSnap.exists()) {
                const data = publicSnap.val();
                this.log(`المسار العام: موجود ✅ - الدور: ${data.role}`, 
                        data.role === 'pharmacist' ? 'success' : 'error');
                this.log(`البيانات: ${JSON.stringify(data).substring(0, 100)}...`, 'info');
                return { found: true, path: 'public', data };
            } else {
                this.log('المسار العام: غير موجود ❌', 'error');
                return { found: false };
            }
        } catch (e) {
            this.log(`خطأ في فحص المسار العام: ${e.message}`, 'error');
            return { found: false, error: e };
        }
    },
    
    async deepDiagnose(user, mediumResults) {
        this.log('🔬 بدء التشخيص العميق...', 'info');
        
        const results = {
            locations: [],
            tenantInfo: null,
            databaseStructure: null
        };
        
        try {
            const tenantsSnap = await get(ref(db, 'tenants'));
            if (tenantsSnap.exists()) {
                const tenants = tenantsSnap.val();
                const tenantIds = Object.keys(tenants);
                this.log(`عدد المجمعات: ${tenantIds.length}`, 'info');
                this.log(`قائمة المجمعات: ${tenantIds.join(', ')}`, 'path');
                
                for (const tenantId of tenantIds) {
                    const userRef = ref(db, `tenants/${tenantId}/users/${user.uid}`);
                    const userSnap = await get(userRef);
                    
                    if (userSnap.exists()) {
                        const data = userSnap.val();
                        this.log(`✅ وجد في المجمع: ${tenantId}`, 'success');
                        this.log(`   الدور: ${data.role} - الاسم: ${data.name}`, 'info');
                        results.locations.push({ tenantId, data, path: `tenants/${tenantId}/users/${user.uid}` });
                    } else {
                        const usersCount = tenants[tenantId].users ? Object.keys(tenants[tenantId].users).length : 0;
                        this.log(`المجمع ${tenantId}: ${usersCount} مستخدم - الصيدلي غير موجود`, 'warning');
                    }
                }
            } else {
                this.log('❌ لا توجد مجمعات في قاعدة البيانات!', 'error');
            }
        } catch (e) {
            this.log(`خطأ في فحص المجمعات: ${e.message}`, 'error');
        }
        
        this.analyzeDatabaseStructure(user, results);
        
        return results;
    },
    
    analyzeDatabaseStructure(user, results) {
        this.log('📊 تحليل بنية قاعدة البيانات...', 'info');
        
        if (results.locations.length === 0) {
            this.log('💡 نصيحة: الصيدلي مش موجود في أي مجمع', 'warning');
            this.log('   الحل: استخدم لوحة الإدارة لإضافة الصيدلي', 'info');
            this.log('   أو استخدم كود الإضافة اليدوي', 'info');
        } else if (results.locations.length > 1) {
            this.log('⚠️ الصيدلي موجود في أكثر من مجمع!', 'warning');
            this.log('   سيتم استخدام أول موقع تم العثور عليه', 'info');
        }
        
        const allRoles = results.locations.map(l => l.data.role);
        if (allRoles.some(r => r !== 'pharmacist')) {
            this.log('❌ تحذير: الصيدلي موجود ولكن الدور غير صحيح!', 'error');
            this.log(`   الأدوار الموجودة: ${allRoles.join(', ')}`, 'error');
            this.log('   الحل: تغيير الدور إلى "pharmacist" من Firebase Console', 'info');
        }
    }
};

// ============ تهيئة Firebase ============
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ---------- ثوابت التخزين ----------
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

// ============================================================
// ✅ نظام تفضيلات الصيدلي - تخزين سحابي (الطبيب المختار)
// ============================================================
class PharmacistPreferencesDB {
    constructor() {
        this._basePath = null;
    }
    
    get basePath() {
        if (!this._basePath) {
            this._basePath = currentTenantId 
                ? `tenants/${currentTenantId}/pharmacist_preferences` 
                : 'pharmacist_preferences';
        }
        return this._basePath;
    }
    
    async getSelectedDoctor() {
        if (!currentTenantId) return null;
        try {
            const userId = auth.currentUser?.uid;
            if (!userId) return null;
            
            const prefRef = ref(db, `${this.basePath}/${userId}`);
            const snap = await get(prefRef);
            
            if (snap.exists()) {
                return snap.val().selectedDoctorId || null;
            }
            return null;
        } catch (err) {
            console.warn('تعذر جلب تفضيلات الصيدلي:', err.message);
            return null;
        }
    }
    
    async setSelectedDoctor(doctorId) {
        if (!currentTenantId) return;
        try {
            const userId = auth.currentUser?.uid;
            if (!userId) return;
            
            const prefRef = ref(db, `${this.basePath}/${userId}`);
            await set(prefRef, {
                selectedDoctorId: doctorId,
                updatedAt: new Date().toISOString()
            });
        } catch (err) {
            console.warn('تعذر حفظ تفضيلات الصيدلي:', err.message);
        }
    }
    
    async getPrescriptionFilter() {
        if (!currentTenantId) return 'لم تصرف بعد';
        try {
            const userId = auth.currentUser?.uid;
            if (!userId) return 'لم تصرف بعد';
            
            const prefRef = ref(db, `${this.basePath}/${userId}`);
            const snap = await get(prefRef);
            
            if (snap.exists()) {
                return snap.val().prescriptionFilter || 'لم تصرف بعد';
            }
            return 'لم تصرف بعد';
        } catch (err) {
            return 'لم تصرف بعد';
        }
    }
    
    async setPrescriptionFilter(filter) {
        if (!currentTenantId) return;
        try {
            const userId = auth.currentUser?.uid;
            if (!userId) return;
            
            const prefRef = ref(db, `${this.basePath}/${userId}`);
            const snap = await get(prefRef);
            
            const currentData = snap.exists() ? snap.val() : {};
            await set(prefRef, {
                ...currentData,
                prescriptionFilter: filter,
                updatedAt: new Date().toISOString()
            });
        } catch (err) {
            console.warn('تعذر حفظ فلتر الوصفات:', err.message);
        }
    }
}

const pharmacistPrefs = new PharmacistPreferencesDB();

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
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const today = getLocalDateString();

function showToast(msg, isErr = false) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.cssText = `
        position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
        background:${isErr ? '#B23B3B' : '#4A3B2C'};color:white;
        padding:12px 20px;border-radius:50px;font-weight:600;
        z-index:3000;box-shadow:0 8px 20px rgba(0,0,0,0.2);
        display:flex;align-items:center;gap:8px;
    `;
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
        UI.syncDot.title = online ? 'متصل بالسحابة' : 'غير متصل';
    }
}

function clearLoginSessionOnly() {
    try {
        LOGIN_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
        
        const sessionKeysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('shifa_session') || key.startsWith('shifa_secure'))) {
                sessionKeysToRemove.push(key);
            }
        }
        sessionKeysToRemove.forEach(key => localStorage.removeItem(key));
        
        sessionStorage.clear();
        
        DIAGNOSTICS.log('تم مسح بيانات الجلسة بنجاح', 'success');
    } catch (e) {
        console.warn('تعذر مسح بيانات الجلسة:', e.message);
    }
}

// ✅ تحميل بيانات الصيدلي - نسخة مطورة مع التشخيص
async function loadPharmacistData(user) {
    DIAGNOSTICS.log('🔍 بدء تحميل بيانات الصيدلي...', 'info');
    
    try {
        let diagnosisResults = {};
        
        if (DIAGNOSTICS.level === 'quick' || DIAGNOSTICS.level === 'medium' || DIAGNOSTICS.level === 'deep') {
            diagnosisResults.quick = await DIAGNOSTICS.quickDiagnose(user);
        }
        
        if (DIAGNOSTICS.level === 'medium' || DIAGNOSTICS.level === 'deep') {
            diagnosisResults.medium = await DIAGNOSTICS.mediumDiagnose(user, diagnosisResults.quick);
        }
        
        if (DIAGNOSTICS.level === 'deep') {
            diagnosisResults.deep = await DIAGNOSTICS.deepDiagnose(user, diagnosisResults.medium);
        }
        
        // 🔍 البحث في المسار العام أولاً
        const publicSnap = await get(ref(db, `users/${user.uid}`));
        
        if (!publicSnap.exists()) {
            DIAGNOSTICS.log('❌ الصيدلي غير موجود في المسار العام', 'error');
            
            if (diagnosisResults.deep?.locations?.length > 0) {
                const location = diagnosisResults.deep.locations[0];
                DIAGNOSTICS.log(`💡 لكنه موجود في: ${location.path}`, 'warning');
                DIAGNOSTICS.log('   جاري استخدام هذا الموقع...', 'info');
                
                currentTenantId = location.tenantId;
                pharmacistInfo = location.data;
            } else {
                showToast('❌ بيانات الصيدلي غير موجودة. تأكد من إضافته من لوحة الإدارة.', true);
                
                UI.welcomeMessage.textContent = 'خطأ: الصيدلي غير موجود في قاعدة البيانات';
                if (UI.tenantName) UI.tenantName.textContent = 'يرجى مراجعة الأدمن';
                
                return false;
            }
        } else {
            const userData = publicSnap.val();
            
            if (userData.role !== 'pharmacist') {
                DIAGNOSTICS.log(`❌ الدور غير صحيح: ${userData.role} (المطلوب: pharmacist)`, 'error');
                showToast('هذا الحساب ليس حساب صيدلي. الدور الحالي: ' + userData.role, true);
                return false;
            }
            
            DIAGNOSTICS.log('✅ تم العثور على الصيدلي في المسار العام', 'success');
            
            currentTenantId = userData.tenantId || user.uid;
            pharmacistInfo = userData;
        }
        
        DIAGNOSTICS.log(`المجمع الطبي: ${currentTenantId}`, 'path');
        DIAGNOSTICS.log(`اسم الصيدلي: ${pharmacistInfo.name}`, 'info');
        
        UI.welcomeMessage.textContent = `أهلاً، ${pharmacistInfo.name || 'صيدلي'}`;
        
        const tenantName = pharmacistInfo.tenantName || 'المجمع الطبي';
        if (UI.tenantName) UI.tenantName.textContent = tenantName;
        
        sessionStorage.setItem('shifa_tenant_id', currentTenantId);
        sessionStorage.setItem('userUid', user.uid);
        sessionStorage.setItem('userRole', 'pharmacist');
        
        return true;
        
    } catch (err) {
        DIAGNOSTICS.log(`❌ خطأ: ${err.message}`, 'error');
        showToast('فشل تحميل البيانات: ' + err.message, true);
        return false;
    }
}

// ✅ تحميل الأطباء من مسار المجمع
function loadDoctors() {
    if (!currentTenantId) {
        DIAGNOSTICS.log('⚠️ لا يمكن تحميل الأطباء: المجمع غير محدد', 'warning');
        return;
    }
    
    DIAGNOSTICS.log('🔄 تحميل الأطباء...', 'info');
    
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
        
        DIAGNOSTICS.log(`تم تحميل ${docs.length} طبيب`, 'success');
        
        if (docs.length === 0) {
            DIAGNOSTICS.log('لا يوجد أطباء في المجمع، جاري محاولة المسار العام...', 'warning');
            loadDoctorsFromPublic();
            return;
        }
        
        doctorsList = docs;
        setSyncStatus(true);
        renderDoctorsList();
    }, (error) => {
        DIAGNOSTICS.log(`خطأ في تحميل الأطباء: ${error.message}`, 'error');
        setSyncStatus(false);
        loadDoctorsFromPublic();
    });
}

function loadDoctorsFromPublic() {
    DIAGNOSTICS.log('🔄 تحميل الأطباء من المسار العام...', 'info');
    
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
        DIAGNOSTICS.log(`تم تحميل ${docs.length} طبيب من المسار العام`, 'info');
        setSyncStatus(docs.length > 0);
        renderDoctorsList();
    }, (error) => {
        DIAGNOSTICS.log(`خطأ في المسار العام: ${error.message}`, 'error');
        setSyncStatus(false);
    });
}

// ✅ عرض قائمة الأطباء في الشريط الجانبي
function renderDoctorsList() {
    if (!UI.doctorListContainer) return;
    
    if (doctorsList.length === 0) {
        UI.doctorListContainer.innerHTML = `
            <div style="padding:15px;text-align:center;color:var(--text-sec);">
                <i class="fas fa-user-md-slash" style="font-size:2rem;opacity:0.3;margin-bottom:8px;"></i>
                <div>لا يوجد أطباء</div>
            </div>
        `;
        return;
    }
    
    UI.doctorListContainer.innerHTML = doctorsList.map(doc => `
        <div class="doctor-list-item ${selectedDoctorId === doc.id ? 'active' : ''}" data-doctor-id="${doc.id}">
            <div class="doctor-avatar">${(doc.name || 'طبيب').charAt(0).toUpperCase()}</div>
            <div class="doctor-info">
                <div class="doctor-name">د. ${escapeHtml(doc.name || 'طبيب')}</div>
                <div class="doctor-specialty">${escapeHtml(doc.specialty || 'عام')}</div>
            </div>
            <span class="doctor-prescription-count" id="docCount_${doc.id}">0</span>
        </div>
    `).join('');
    
    // أحداث النقر على الأطباء
    UI.doctorListContainer.querySelectorAll('.doctor-list-item').forEach(item => {
        item.addEventListener('click', () => {
            const doctorId = item.dataset.doctorId;
            selectDoctor(doctorId);
        });
    });
    
    updateDoctorCounts();
}

// ✅ تحديث عدد الوصفات لكل طبيب
function updateDoctorCounts() {
    doctorsList.forEach(doc => {
        const countEl = document.getElementById(`docCount_${doc.id}`);
        if (countEl) {
            const count = allPrescriptions.filter(rx => 
                rx.doctor_id === doc.id && rx.status !== 'تم الصرف'
            ).length;
            countEl.textContent = count;
        }
    });
}

// ✅ اختيار طبيب
async function selectDoctor(doctorId) {
    selectedDoctorId = doctorId;
    
    // حفظ في السحابة بدلاً من localStorage
    await pharmacistPrefs.setSelectedDoctor(doctorId);
    
    // تحديث واجهة المستخدم
    UI.doctorListContainer.querySelectorAll('.doctor-list-item').forEach(item => {
        item.classList.toggle('active', item.dataset.doctorId === doctorId);
    });
    
    updateSelectedDoctorTitle();
    renderPrescriptionsForDoctor();
}

// ✅ تحديث عنوان الطبيب المختار
function updateSelectedDoctorTitle() {
    if (!UI.selectedDoctorTitle) return;
    
    const doctor = doctorsList.find(d => d.id === selectedDoctorId);
    if (doctor) {
        UI.selectedDoctorTitle.innerHTML = `
            <i class="fas fa-user-md"></i> 
            د. ${escapeHtml(doctor.name || 'طبيب')}
            ${doctor.specialty ? `<span style="font-size:0.75rem;opacity:0.7;">(${escapeHtml(doctor.specialty)})</span>` : ''}
        `;
    } else {
        UI.selectedDoctorTitle.innerHTML = '<i class="fas fa-user-md"></i> اختر طبيباً';
    }
}

// ✅ تحميل كل الوصفات
function loadAllPrescriptions() {
    if (!currentTenantId) return;
    
    DIAGNOSTICS.log('🔄 تحميل الوصفات...', 'info');
    
    const prescriptionsRef = ref(db, `tenants/${currentTenantId}/prescriptions`);
    if (unsubscribePrescriptions) unsubscribePrescriptions();
    
    unsubscribePrescriptions = onValue(prescriptionsRef, async (snap) => {
        const rxList = [];
        
        if (snap.exists()) {
            const rxPromises = [];
            
            snap.forEach(child => {
                const rx = child.val();
                rx.id = child.key;
                
                // تحميل عناصر الوصفة
                rxPromises.push((async () => {
                    const itemsSnap = await get(ref(db, `tenants/${currentTenantId}/prescription_items/${child.key}`));
                    rx.items = [];
                    if (itemsSnap.exists()) {
                        rx.items = Object.values(itemsSnap.val());
                    }
                    rxList.push(rx);
                })());
            });
            
            await Promise.all(rxPromises);
        }
        
        allPrescriptions = rxList;
        DIAGNOSTICS.log(`تم تحميل ${rxList.length} وصفة`, 'success');
        
        setSyncStatus(true);
        updateDoctorCounts();
        renderPrescriptionsForDoctor();
        
    }, (error) => {
        DIAGNOSTICS.log(`خطأ في تحميل الوصفات: ${error.message}`, 'error');
        setSyncStatus(false);
    });
}

// ✅ تحميل المرضى
function loadPatients() {
    if (!currentTenantId) return;
    
    const patientsRef = ref(db, `tenants/${currentTenantId}/patients`);
    if (unsubscribePatients) unsubscribePatients();
    
    unsubscribePatients = onValue(patientsRef, (snap) => {
        patientsMap = {};
        if (snap.exists()) {
            snap.forEach(child => {
                patientsMap[child.key] = child.val();
            });
        }
    });
}

// ✅ عرض وصفات الطبيب المختار
function renderPrescriptionsForDoctor() {
    if (!UI.prescriptionsListContainer) return;
    
    if (!selectedDoctorId) {
        UI.prescriptionsListContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-arrow-right" style="font-size:3rem;opacity:0.2;margin-bottom:12px;"></i>
                <h4>اختر طبيباً من القائمة</h4>
                <p>لمشاهدة وصفاته</p>
            </div>
        `;
        return;
    }
    
    // فلترة الوصفات
    let filtered = allPrescriptions.filter(rx => rx.doctor_id === selectedDoctorId);
    
    // فلترة حسب التبويب
    if (currentDoctorTab === 'لم تصرف بعد') {
        filtered = filtered.filter(rx => rx.status === 'لم تصرف بعد' || !rx.status);
    } else if (currentDoctorTab === 'صرفت جزئياً') {
        filtered = filtered.filter(rx => rx.status === 'صرفت جزئياً');
    } else if (currentDoctorTab === 'تم الصرف') {
        filtered = filtered.filter(rx => rx.status === 'تم الصرف');
    }
    
    // ترتيب حسب التاريخ (الأحدث أولاً)
    filtered.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    
    if (filtered.length === 0) {
        UI.prescriptionsListContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-prescription" style="font-size:3rem;opacity:0.2;margin-bottom:12px;"></i>
                <h4>لا توجد وصفات</h4>
                <p>في هذا القسم</p>
            </div>
        `;
        return;
    }
    
    UI.prescriptionsListContainer.innerHTML = filtered.map(rx => {
        const patientName = rx.patient_name || patientsMap[rx.patient_id]?.name || 'غير معروف';
        const dateStr = rx.created_at 
            ? new Date(rx.created_at).toLocaleDateString('ar-EG', { 
                year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
              }) 
            : '—';
        
        const statusColors = {
            'لم تصرف بعد': '#FF9800',
            'صرفت جزئياً': '#2196F3',
            'تم الصرف': '#4CAF50'
        };
        
        const statusColor = statusColors[rx.status] || '#FF9800';
        const statusText = rx.status || 'لم تصرف بعد';
        
        // عرض الأدوية
        const drugsHtml = (rx.items || []).map(item => {
            const formEmoji = item.form === 'tablet' ? '💊' : 
                             item.form === 'syrup' ? '🥄' : 
                             item.form === 'injection' ? '💉' : 
                             item.form === 'suppository' ? '🧴' : '💧';
            return `
                <span class="drug-tag">
                    ${formEmoji} ${escapeHtml(item.drug_name || '')} 
                    <span class="dose-text">${escapeHtml(item.dose || '')}</span>
                </span>
            `;
        }).join('');
        
        return `
            <div class="prescription-card" data-rx-id="${rx.id}">
                <div class="prescription-header">
                    <div class="patient-info">
                        <div class="patient-name">
                            <i class="fas fa-user"></i> ${escapeHtml(patientName)}
                        </div>
                        <div class="prescription-date">📅 ${dateStr}</div>
                    </div>
                    <span class="status-badge" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">
                        ${statusText}
                    </span>
                </div>
                
                ${rx.diagnosis ? `
                <div class="diagnosis-preview">
                    <i class="fas fa-stethoscope"></i> ${escapeHtml(rx.diagnosis).substring(0, 100)}${rx.diagnosis.length > 100 ? '...' : ''}
                </div>
                ` : ''}
                
                <div class="drugs-list">
                    ${drugsHtml || '<span style="opacity:0.5;">لا توجد أدوية</span>'}
                </div>
                
                <div class="prescription-actions">
                    <button class="btn btn-dispense" data-rx-id="${rx.id}">
                        <i class="fas fa-pills"></i> صرف
                    </button>
                    <button class="btn btn-details" data-rx-id="${rx.id}">
                        <i class="fas fa-info-circle"></i> تفاصيل
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ✅ البحث عن مريض
async function searchPatient() {
    const query = UI.patientSearchInput?.value.trim();
    if (!query || query.length < 2) {
        showToast('أدخل اسم المريض أو رقم الهاتف للبحث', true);
        return;
    }
    
    if (!UI.searchResultsContainer) return;
    
    UI.searchResultsContainer.innerHTML = `
        <div style="text-align:center;padding:20px;">
            <i class="fas fa-spinner fa-spin"></i> جاري البحث...
        </div>
    `;
    
    try {
        // البحث في الوصفات
        const results = allPrescriptions.filter(rx => {
            const patientName = (rx.patient_name || '').toLowerCase();
            const patientPhone = (rx.phone || '').toLowerCase();
            const searchTerm = query.toLowerCase();
            
            return patientName.includes(searchTerm) || patientPhone.includes(searchTerm);
        });
        
        if (results.length === 0) {
            UI.searchResultsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search" style="font-size:2rem;opacity:0.2;"></i>
                    <p>لا توجد نتائج</p>
                </div>
            `;
            return;
        }
        
        UI.searchResultsContainer.innerHTML = results.map(rx => {
            const doctor = doctorsList.find(d => d.id === rx.doctor_id);
            const doctorName = doctor?.name || 'طبيب';
            
            return `
                <div class="search-result-item" data-rx-id="${rx.id}">
                    <div>
                        <b>${escapeHtml(rx.patient_name || 'غير معروف')}</b>
                        <div style="font-size:0.75rem;color:var(--text-sec);">
                            د. ${escapeHtml(doctorName)} · ${rx.date || ''}
                        </div>
                    </div>
                    <span class="status-badge" style="font-size:0.7rem;">
                        ${rx.status || 'لم تصرف بعد'}
                    </span>
                </div>
            `;
        }).join('');
        
    } catch (err) {
        UI.searchResultsContainer.innerHTML = `
            <div class="empty-state" style="color:var(--danger);">
                <p>خطأ في البحث</p>
            </div>
        `;
    }
}

// ============ أحداث الواجهة ============
function setupEventListeners() {
    // تبديل الشريط الجانبي
    if (UI.toggleSidebarBtn) {
        UI.toggleSidebarBtn.addEventListener('click', () => {
            if (UI.doctorsSidebar) {
                UI.doctorsSidebar.classList.toggle('collapsed');
            }
        });
    }
    
    // تبويبات تصنيف الوصفات
    if (UI.tabBtns) {
        UI.tabBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                UI.tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentDoctorTab = btn.dataset.doctorTab;
                
                // حفظ الفلتر في السحابة
                await pharmacistPrefs.setPrescriptionFilter(currentDoctorTab);
                
                renderPrescriptionsForDoctor();
            });
        });
    }
    
    // تحديث الأطباء
    if (UI.refreshDoctorsBtn) {
        UI.refreshDoctorsBtn.addEventListener('click', () => {
            loadDoctors();
            loadAllPrescriptions();
            showToast('🔄 تم تحديث البيانات');
        });
    }
    
    // البحث عن مريض
    if (UI.searchPatientBtn) {
        UI.searchPatientBtn.addEventListener('click', () => {
            if (UI.searchPatientModal) {
                UI.searchPatientModal.style.display = 'flex';
            }
        });
    }
    
    if (UI.closeSearchModalBtn) {
        UI.closeSearchModalBtn.addEventListener('click', () => {
            if (UI.searchPatientModal) {
                UI.searchPatientModal.style.display = 'none';
            }
        });
    }
    
    if (UI.executeSearchBtn) {
        UI.executeSearchBtn.addEventListener('click', searchPatient);
    }
    
    if (UI.patientSearchInput) {
        UI.patientSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') searchPatient();
        });
    }
    
    // تسجيل الخروج
    if (UI.logoutBtn) {
        UI.logoutBtn.addEventListener('click', async () => {
            try {
                showToast('👋 جاري تسجيل الخروج...');
                
                if (unsubscribePrescriptions) unsubscribePrescriptions();
                if (unsubscribeDoctors) unsubscribeDoctors();
                if (unsubscribePatients) unsubscribePatients();
                
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
    }
    
    // إغلاق المودالات
    window.addEventListener('click', (e) => {
        if (e.target === UI.searchPatientModal) {
            UI.searchPatientModal.style.display = 'none';
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (UI.searchPatientModal) UI.searchPatientModal.style.display = 'none';
        }
    });
    
    // مستمعي الاتصال
    window.addEventListener('online', () => {
        setSyncStatus(true);
        showToast('📡 تم استعادة الاتصال');
    });
    
    window.addEventListener('offline', () => {
        setSyncStatus(false);
        showToast('⚠️ انقطع الاتصال', true);
    });
}

// ============ بدء التشغيل المطور ============
onAuthStateChanged(auth, async (user) => {
    // ✅ عرض لوحة التشخيص
    DIAGNOSTICS.showPanel();
    
    if (!user) {
        DIAGNOSTICS.log('لا يوجد مستخدم مسجل الدخول', 'warning');
        clearLoginSessionOnly();
        window.location.href = 'index.html';
        return;
    }
    
    DIAGNOSTICS.log(`👤 مستخدم مسجل: ${user.email}`, 'success');
    currentUser = user;
    
    const valid = await loadPharmacistData(user);
    if (!valid) {
        DIAGNOSTICS.log('❌ فشل تحميل البيانات - راجع التشخيص أعلاه', 'error');
        UI.welcomeMessage.textContent = 'خطأ في تحميل البيانات - راجع التشخيص';
        
        const retryBtn = document.createElement('button');
        retryBtn.textContent = '🔄 إعادة المحاولة';
        retryBtn.style.cssText = 'margin:10px;padding:10px;background:#00AEEF;color:white;border:none;border-radius:20px;cursor:pointer;';
        retryBtn.onclick = () => window.location.reload();
        UI.welcomeMessage.parentElement.appendChild(retryBtn);
        
        return;
    }
    
    DIAGNOSTICS.log('✅ تم تحميل البيانات بنجاح - جاري تحميل اللوحة...', 'success');
    
    // استعادة تفضيلات الصيدلي من السحابة
    const savedDoctorId = await pharmacistPrefs.getSelectedDoctor();
    const savedFilter = await pharmacistPrefs.getPrescriptionFilter();
    
    if (savedDoctorId) {
        selectedDoctorId = savedDoctorId;
        DIAGNOSTICS.log(`طبيب مختار سابقاً: ${savedDoctorId}`, 'info');
    }
    
    if (savedFilter) {
        currentDoctorTab = savedFilter;
        DIAGNOSTICS.log(`فلتر محفوظ: ${savedFilter}`, 'info');
        
        // تنشيط التبويب المناسب
        if (UI.tabBtns) {
            UI.tabBtns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.doctorTab === savedFilter);
            });
        }
    }
    
    setupEventListeners();
    loadDoctors();
    loadAllPrescriptions();
    loadPatients();
});

// ============ أدوات تحكم إضافية ============
console.log('🚀 لوحة الصيدلي - مع نظام التشخيص العبقري 🧠');
console.log('☁️ التخزين سحابي بالكامل (Firebase Realtime Database)');
console.log('💾 تفضيلات الصيدلي محفوظة في السحابة بدلاً من localStorage');
console.log('💡 للتحكم في التشخيص: DIAGNOSTICS.level = "off" أو "quick" أو "medium" أو "deep"');
console.log('📊 التشخيص الحالي:', DIAGNOSTICS.level);
