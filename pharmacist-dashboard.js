import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// ✅ تم التغيير من Realtime Database إلى Firestore
import { 
    getFirestore, 
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    onSnapshot,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ============ 🧠 نظام التشخيص العبقري ============
const DIAGNOSTICS = {
    enabled: true,
    level: 'deep',
    
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
            const publicDocRef = doc(db, 'users', user.uid);
            const publicSnap = await getDoc(publicDocRef);
            
            if (publicSnap.exists()) {
                const data = publicSnap.data();
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
            const tenantsSnap = await getDocs(collection(db, 'tenants'));
            
            if (!tenantsSnap.empty) {
                const tenantIds = [];
                tenantsSnap.forEach(docSnap => tenantIds.push(docSnap.id));
                
                this.log(`عدد المجمعات: ${tenantIds.length}`, 'info');
                this.log(`قائمة المجمعات: ${tenantIds.join(', ')}`, 'path');
                
                for (const tenantId of tenantIds) {
                    const userDocRef = doc(db, 'tenants', tenantId, 'users', user.uid);
                    const userSnap = await getDoc(userDocRef);
                    
                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        this.log(`✅ وجد في المجمع: ${tenantId}`, 'success');
                        this.log(`   الدور: ${data.role} - الاسم: ${data.name}`, 'info');
                        results.locations.push({ tenantId, data, path: `tenants/${tenantId}/users/${user.uid}` });
                    } else {
                        const usersRef = collection(db, 'tenants', tenantId, 'users');
                        const usersSnap = await getDocs(usersRef);
                        this.log(`المجمع ${tenantId}: ${usersSnap.size} مستخدم - الصيدلي غير موجود`, 'warning');
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

// ============ باقي الكود ============
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // ✅ استخدام Firestore

// ---------- ثوابت التخزين المحلي ----------
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

// ✅ تحميل بيانات الصيدلي - نسخة مطورة مع التشخيص (معدلة لـ Firestore)
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
        const publicDocRef = doc(db, 'users', user.uid);
        const publicSnap = await getDoc(publicDocRef);
        
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
            const userData = publicSnap.data();
            
            if (userData.role !== 'pharmacist') {
                DIAGNOSTICS.log(`❌ الدور غير صحيح: ${userData.role} (المطلوب: pharmacist)`, 'error');
                showToast('هذا الحساب ليس حساب صيدلي. الدور الحالي: ' + userData.role, true);
                return false;
            }
            
            DIAGNOSTICS.log('✅ تم العثور على الصيدلي في المسار العام', 'success');
            
            currentTenantId = userData.tenantId || user.uid;
            pharmacistInfo = userData;
        }
        
        // ✅ تحديث واجهة المستخدم
        DIAGNOSTICS.log(`المجمع الطبي: ${currentTenantId}`, 'path');
        DIAGNOSTICS.log(`اسم الصيدلي: ${pharmacistInfo.name}`, 'info');
        
        UI.welcomeMessage.textContent = `أهلاً، ${pharmacistInfo.name || 'صيدلي'}`;
        
        const tenantName = pharmacistInfo.tenantName || 'المجمع الطبي';
        if (UI.tenantName) UI.tenantName.textContent = tenantName;
        
        // تخزين في sessionStorage
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

// ✅ تحميل الأطباء من مسار المجمع (معدلة لـ Firestore)
function loadDoctors() {
    if (!currentTenantId) {
        DIAGNOSTICS.log('⚠️ لا يمكن تحميل الأطباء: المجمع غير محدد', 'warning');
        return;
    }
    
    DIAGNOSTICS.log('🔄 تحميل الأطباء...', 'info');
    
    const usersRef = collection(db, 'tenants', currentTenantId, 'users');
    if (unsubscribeDoctors) unsubscribeDoctors();
    
    unsubscribeDoctors = onSnapshot(usersRef, (snapshot) => {
        const docs = [];
        snapshot.forEach(docSnap => {
            const user = docSnap.data();
            if (user.role === 'doctor') {
                docs.push({ id: docSnap.id, ...user });
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

// ✅ تحميل الأطباء من المسار العام (معدلة لـ Firestore)
function loadDoctorsFromPublic() {
    DIAGNOSTICS.log('🔄 تحميل الأطباء من المسار العام...', 'info');
    
    const usersRef = collection(db, 'users');
    if (unsubscribeDoctors) unsubscribeDoctors();
    
    unsubscribeDoctors = onSnapshot(usersRef, (snapshot) => {
        const docs = [];
        snapshot.forEach(docSnap => {
            const user = docSnap.data();
            if (user.role === 'doctor' && (user.tenantId === currentTenantId || user.tenantId === undefined)) {
                docs.push({ id: docSnap.id, ...user });
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

// ✅ دالة عرض قائمة الأطباء
function renderDoctorsList() {
    if (!UI.doctorListContainer) return;
    
    if (doctorsList.length === 0) {
        UI.doctorListContainer.innerHTML = '<div style="padding:10px;color:var(--text-sec);">لا يوجد أطباء</div>';
        return;
    }
    
    UI.doctorListContainer.innerHTML = doctorsList.map(doc => `
        <div class="doctor-item ${selectedDoctorId === doc.id ? 'active' : ''}" data-doctor-id="${doc.id}">
            <i class="fas fa-user-md"></i>
            <span>د. ${escapeHtml(doc.name || 'طبيب')}</span>
        </div>
    `).join('');
    
    // إضافة أحداث النقر
    UI.doctorListContainer.querySelectorAll('.doctor-item').forEach(item => {
        item.addEventListener('click', () => {
            const doctorId = item.dataset.doctorId;
            selectedDoctorId = doctorId;
            saveSelectedDoctor();
            updateSelectedDoctorTitle();
            renderPrescriptionsForDoctor();
            
            // تحديث الـ active class
            UI.doctorListContainer.querySelectorAll('.doctor-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

// ✅ تحديث عنوان الطبيب المختار
function updateSelectedDoctorTitle() {
    if (!UI.selectedDoctorTitle) return;
    const doctor = doctorsList.find(d => d.id === selectedDoctorId);
    UI.selectedDoctorTitle.textContent = doctor ? `د. ${doctor.name || 'طبيب'}` : 'اختر طبيباً';
}

// ✅ تحميل كل الوصفات (معدلة لـ Firestore)
function loadAllPrescriptions() {
    if (!currentTenantId) return;
    
    const prescriptionsRef = collection(db, 'tenants', currentTenantId, 'prescriptions');
    if (unsubscribePrescriptions) unsubscribePrescriptions();
    
    unsubscribePrescriptions = onSnapshot(prescriptionsRef, (snapshot) => {
        allPrescriptions = [];
        snapshot.forEach(docSnap => {
            allPrescriptions.push({ id: docSnap.id, ...docSnap.data() });
        });
        setSyncStatus(true);
        renderPrescriptionsForDoctor();
    }, (error) => {
        DIAGNOSTICS.log(`خطأ في تحميل الوصفات: ${error.message}`, 'error');
        setSyncStatus(false);
    });
}

// ✅ تحميل المرضى (معدلة لـ Firestore)
function loadPatients() {
    if (!currentTenantId) return;
    
    const patientsRef = collection(db, 'tenants', currentTenantId, 'patients');
    if (unsubscribePatients) unsubscribePatients();
    
    unsubscribePatients = onSnapshot(patientsRef, (snapshot) => {
        patientsMap = {};
        snapshot.forEach(docSnap => {
            patientsMap[docSnap.id] = docSnap.data();
        });
    }, (error) => {
        DIAGNOSTICS.log(`خطأ في تحميل المرضى: ${error.message}`, 'warning');
    });
}

// ✅ عرض الوصفات للطبيب المختار
function renderPrescriptionsForDoctor() {
    if (!UI.prescriptionsListContainer) return;
    
    if (!selectedDoctorId) {
        UI.prescriptionsListContainer.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-sec);">اختر طبيباً من القائمة</div>';
        return;
    }
    
    let filtered = allPrescriptions.filter(rx => rx.doctor_id === selectedDoctorId);
    
    // فلترة حسب التبويب
    if (currentDoctorTab === 'لم تصرف بعد') {
        filtered = filtered.filter(rx => rx.status === 'لم تصرف بعد');
    } else if (currentDoctorTab === 'صرفت جزئياً') {
        filtered = filtered.filter(rx => rx.status === 'صرفت جزئياً');
    } else if (currentDoctorTab === 'تم الصرف') {
        filtered = filtered.filter(rx => rx.status === 'تم الصرف');
    }
    
    filtered.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    
    if (filtered.length === 0) {
        UI.prescriptionsListContainer.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-sec);">لا توجد وصفات</div>';
        return;
    }
    
    UI.prescriptionsListContainer.innerHTML = filtered.map(rx => {
        const patientName = rx.patient_name || 'مريض';
        const dateStr = rx.created_at ? new Date(rx.created_at).toLocaleDateString('ar-EG') : '-';
        const statusColor = rx.status === 'تم الصرف' ? 'green' : rx.status === 'صرفت جزئياً' ? 'orange' : 'red';
        
        return `
            <div class="prescription-card" data-rx-id="${rx.id}">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <b>${escapeHtml(patientName)}</b>
                    <span style="color:${statusColor};font-size:0.8rem;">${rx.status || 'لم تصرف بعد'}</span>
                </div>
                <div style="font-size:0.75rem;color:var(--text-sec);margin:5px 0;">
                    📅 ${dateStr} | 💊 ${rx.item_count || 0} أدوية
                </div>
                <div style="font-size:0.75rem;color:var(--text-sec);">
                    🩺 التشخيص: ${escapeHtml((rx.diagnosis || 'بدون تشخيص').substring(0, 60))}
                </div>
            </div>
        `;
    }).join('');
    
    // ✅ إضافة حدث النقر على الوصفة لفتح صفحة التفاصيل
    UI.prescriptionsListContainer.querySelectorAll('.prescription-card').forEach(card => {
        card.addEventListener('click', () => {
            const rxId = card.dataset.rxId;
            window.location.href = `detail.html?rx=${rxId}&tenant=${currentTenantId}`;
        });
    });
}

// ✅ البحث عن المرضى برقم الهاتف (معدلة لـ Firestore)
async function searchPatientsByPhone(phone) {
    if (!phone || phone.trim().length < 1) return [];
    
    const results = [];
    const phoneTrimmed = phone.trim();
    
    try {
        const patientsRef = collection(db, 'patients');
        const querySnapshot = await getDocs(patientsRef);
        
        querySnapshot.forEach(docSnap => {
            const patient = docSnap.data();
            if (patient.phone && patient.phone.includes(phoneTrimmed)) {
                results.push({ id: docSnap.id, ...patient });
            }
        });
        
        // كمان نبحث في مسار المجمع
        if (currentTenantId) {
            const tenantPatientsRef = collection(db, 'tenants', currentTenantId, 'patients');
            const tenantSnap = await getDocs(tenantPatientsRef);
            
            tenantSnap.forEach(docSnap => {
                const patient = docSnap.data();
                if (patient.phone && patient.phone.includes(phoneTrimmed)) {
                    if (!results.find(r => r.id === docSnap.id)) {
                        results.push({ id: docSnap.id, ...patient });
                    }
                }
            });
        }
        
    } catch (err) {
        DIAGNOSTICS.log(`خطأ في البحث عن المرضى: ${err.message}`, 'error');
    }
    
    return results;
}

// ✅ عرض نتائج البحث
function displaySearchResults(results) {
    if (!UI.searchResultsContainer) return;
    
    if (results.length === 0) {
        UI.searchResultsContainer.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-sec);">لا توجد نتائج</div>';
        return;
    }
    
    UI.searchResultsContainer.innerHTML = results.map(patient => `
        <div class="search-result-item" data-patient-id="${patient.id}">
            <div>
                <b>${escapeHtml(patient.name || 'بدون اسم')}</b>
                <div style="font-size:0.75rem;color:var(--text-sec);">
                    📞 ${escapeHtml(patient.phone || '—')} | 🎂 ${patient.age || '—'} سنة
                </div>
            </div>
            <i class="fas fa-chevron-left"></i>
        </div>
    `).join('');
    
    // ✅ إضافة حدث النقر على المريض لفتح صفحة التفاصيل
    UI.searchResultsContainer.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const patientId = item.dataset.patientId;
            window.location.href = `detail.html?patient=${patientId}&tenant=${currentTenantId}`;
        });
    });
}

// ---------- تهيئة الأحداث ----------
function setupEventListeners() {
    // زر البحث عن مريض
    if (UI.searchPatientBtn) {
        UI.searchPatientBtn.addEventListener('click', () => {
            if (UI.searchPatientModal) UI.searchPatientModal.style.display = 'flex';
        });
    }
    
    // إغلاق مودال البحث
    if (UI.closeSearchModalBtn) {
        UI.closeSearchModalBtn.addEventListener('click', () => {
            if (UI.searchPatientModal) UI.searchPatientModal.style.display = 'none';
        });
    }
    
    // تنفيذ البحث
    if (UI.executeSearchBtn && UI.patientSearchInput) {
        UI.executeSearchBtn.addEventListener('click', async () => {
            const phone = UI.patientSearchInput.value.trim();
            if (!phone) {
                showToast('أدخل رقم الهاتف للبحث', true);
                return;
            }
            
            UI.searchResultsContainer.innerHTML = '<div style="text-align:center;padding:20px;">🔍 جاري البحث...</div>';
            const results = await searchPatientsByPhone(phone);
            displaySearchResults(results);
        });
        
        // بحث مع كل ضغطة زر
        UI.patientSearchInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const phone = UI.patientSearchInput.value.trim();
                if (!phone) return;
                
                UI.searchResultsContainer.innerHTML = '<div style="text-align:center;padding:20px;">🔍 جاري البحث...</div>';
                const results = await searchPatientsByPhone(phone);
                displaySearchResults(results);
            }
        });
    }
    
    // تبويبات الوصفات
    if (UI.tabBtns) {
        UI.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                UI.tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentDoctorTab = btn.dataset.doctorTab;
                renderPrescriptionsForDoctor();
            });
        });
    }
    
    // زر تحديث الأطباء
    if (UI.refreshDoctorsBtn) {
        UI.refreshDoctorsBtn.addEventListener('click', () => {
            if (unsubscribeDoctors) {
                unsubscribeDoctors();
                unsubscribeDoctors = null;
            }
            loadDoctors();
            showToast('🔄 تم تحديث قائمة الأطباء');
        });
    }
    
    // زر تبديل القائمة الجانبية
    if (UI.toggleSidebarBtn && UI.doctorsSidebar) {
        UI.toggleSidebarBtn.addEventListener('click', () => {
            UI.doctorsSidebar.classList.toggle('collapsed');
        });
    }
    
    // زر تسجيل الخروج
    if (UI.logoutBtn) {
        UI.logoutBtn.addEventListener('click', async () => {
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
                await signOut(auth);
                window.location.href = 'index.html';
            } catch (e) {
                console.error('خطأ في تسجيل الخروج:', e);
                clearLoginSessionOnly();
                window.location.href = 'index.html';
            }
        });
    }
    
    // إغلاق المودالات بالنقر خارجها
    window.addEventListener('click', (e) => {
        if (e.target === UI.searchPatientModal) {
            UI.searchPatientModal.style.display = 'none';
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && UI.searchPatientModal && UI.searchPatientModal.style.display === 'flex') {
            UI.searchPatientModal.style.display = 'none';
        }
    });
    
    // مستمعي الاتصال بالإنترنت
    window.addEventListener('online', () => {
        setSyncStatus(true);
        showToast('📡 تم استعادة الاتصال');
        if (currentTenantId) {
            loadDoctors();
            loadAllPrescriptions();
        }
    });
    
    window.addEventListener('offline', () => {
        setSyncStatus(false);
        showToast('⚠️ انقطع الاتصال', true);
    });
}

// ---------- بدء التشغيل المطور ----------
onAuthStateChanged(auth, async (user) => {
    DIAGNOSTICS.showPanel();
    
    if (!user) {
        DIAGNOSTICS.log('لا يوجد مستخدم مسجل الدخول', 'warning');
        clearLoginSessionOnly();
        window.location.href = 'index.html';
        return;
    }
    
    DIAGNOSTICS.log(`👤 مستخدم مسجل: ${user.email}`, 'success');
    currentUser = user;
    
    // تهيئة الأحداث
    setupEventListeners();
    
    const valid = await loadPharmacistData(user);
    if (!valid) {
        DIAGNOSTICS.log('❌ فشل تحميل البيانات - راجع التشخيص أعلاه', 'error');
        UI.welcomeMessage.textContent = 'خطأ في تحميل البيانات - راجع التشخيص';
        
        const retryBtn = document.createElement('button');
        retryBtn.textContent = '🔄 إعادة المحاولة';
        retryBtn.style.cssText = 'margin:10px;padding:10px;background:#00AEEF;color:white;border:none;border-radius:20px;cursor:pointer;';
        retryBtn.onclick = () => window.location.reload();
        if (UI.welcomeMessage.parentElement) {
            UI.welcomeMessage.parentElement.appendChild(retryBtn);
        }
        
        return;
    }
    
    DIAGNOSTICS.log('✅ تم تحميل البيانات بنجاح - جاري تحميل اللوحة...', 'success');
    
    const savedDoctorId = loadSavedDoctor();
    if (savedDoctorId) {
        selectedDoctorId = savedDoctorId;
        DIAGNOSTICS.log(`طبيب مختار سابقاً: ${savedDoctorId}`, 'info');
    }
    
    loadDoctors();
    loadAllPrescriptions();
    loadPatients();
});

// ============ أدوات تحكم إضافية ============
console.log('🚀 لوحة الصيدلي - Firestore + نظام التشخيص العبقري 🧠');
console.log('💡 للتحكم في التشخيص: DIAGNOSTICS.level = "off" أو "quick" أو "medium" أو "deep"');
console.log('📊 التشخيص الحالي:', DIAGNOSTICS.level);
