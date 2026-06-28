import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// ✅ تم التغيير من Realtime Database إلى Firestore
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    getDoc, 
    getDocs, 
    onSnapshot,
    query,
    where,
    orderBy,
    addDoc
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
                        this.log(`المجمع ${tenantId}: الصيدلي غير موجود`, 'warning');
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

// ✅ البحث عن مريض برقم الهاتف (Firestore)
async function searchPatientByPhone(phoneNumber) {
    if (!phoneNumber || phoneNumber.trim().length < 3) {
        showToast('أدخل 3 أرقام على الأقل للبحث', true);
        return [];
    }
    
    DIAGNOSTICS.log(`🔍 البحث عن مريض برقم: ${phoneNumber}`, 'info');
    
    try {
        const patientsRef = collection(db, 'patients');
        const querySnapshot = await getDocs(patientsRef);
        
        const results = [];
        querySnapshot.forEach(docSnap => {
            const patient = docSnap.data();
            if (patient.phone && patient.phone.includes(phoneNumber.trim())) {
                results.push({ id: docSnap.id, ...patient });
            }
        });
        
        DIAGNOSTICS.log(`تم العثور على ${results.length} مريض`, results.length > 0 ? 'success' : 'warning');
        
        return results;
    } catch (err) {
        DIAGNOSTICS.log(`خطأ في البحث: ${err.message}`, 'error');
        showToast('خطأ في البحث عن المريض', true);
        return [];
    }
}

// ✅ جلب وصفات مريض محدد (Firestore)
async function getPatientPrescriptions(patientId) {
    if (!patientId || !currentTenantId) return [];
    
    try {
        const prescriptionsRef = collection(db, 'tenants', currentTenantId, 'prescriptions');
        const q = query(prescriptionsRef, where('patient_id', '==', String(patientId)));
        const querySnapshot = await getDocs(q);
        
        const prescriptions = [];
        
        for (const docSnap of querySnapshot.docs) {
            const rx = docSnap.data();
            
            // جلب عناصر الوصفة
            const itemsDocRef = doc(db, 'tenants', currentTenantId, 'prescription_items', docSnap.id);
            const itemsSnap = await getDoc(itemsDocRef);
            
            let items = [];
            if (itemsSnap.exists()) {
                const itemsData = itemsSnap.data();
                items = Object.values(itemsData);
            }
            
            prescriptions.push({
                id: docSnap.id,
                ...rx,
                items
            });
        }
        
        return prescriptions;
    } catch (err) {
        DIAGNOSTICS.log(`خطأ في جلب الوصفات: ${err.message}`, 'error');
        return [];
    }
}

// ✅ عرض نتائج البحث عن مريض
function displayPatientSearchResults(patients) {
    if (!UI.searchResultsContainer) return;
    
    if (patients.length === 0) {
        UI.searchResultsContainer.innerHTML = `
            <div style="text-align:center;padding:30px;color:var(--text-sec);">
                <i class="fas fa-search" style="font-size:2rem;opacity:0.3;margin-bottom:12px;"></i>
                <p>لا يوجد مرضى بهذا الرقم</p>
            </div>
        `;
        return;
    }
    
    UI.searchResultsContainer.innerHTML = patients.map(patient => `
        <div class="patient-search-result" data-patient-id="${patient.id}" style="
            padding:12px;border-bottom:1px solid var(--border);
            cursor:pointer;transition:background 0.2s;
            display:flex;justify-content:space-between;align-items:center;
        ">
            <div>
                <b>${escapeHtml(patient.name || 'بدون اسم')}</b>
                <div style="font-size:0.8rem;color:var(--text-sec);">
                    📱 ${escapeHtml(patient.phone || '—')} · 🎂 ${escapeHtml(patient.age || '—')} سنة
                </div>
                ${patient.village_name ? `<div style="font-size:0.75rem;color:var(--text-sec);">🏘️ ${escapeHtml(patient.village_name)}</div>` : ''}
            </div>
            <button class="btn btn-primary btn-sm view-patient-btn" data-patient-id="${patient.id}">
                <i class="fas fa-eye"></i> عرض
            </button>
        </div>
    `).join('');
    
    // إضافة أحداث النقر
    UI.searchResultsContainer.querySelectorAll('.view-patient-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const patientId = btn.dataset.patientId;
            const patient = patients.find(p => p.id === patientId);
            if (patient) {
                await viewPatientPrescriptions(patient);
            }
        });
    });
    
    UI.searchResultsContainer.querySelectorAll('.patient-search-result').forEach(item => {
        item.addEventListener('click', async () => {
            const patientId = item.dataset.patientId;
            const patient = patients.find(p => p.id === patientId);
            if (patient) {
                await viewPatientPrescriptions(patient);
            }
        });
    });
}

// ✅ عرض وصفات المريض
async function viewPatientPrescriptions(patient) {
    DIAGNOSTICS.log(`📋 جاري تحميل وصفات المريض: ${patient.name}`, 'info');
    
    const prescriptions = await getPatientPrescriptions(patient.id);
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;
        z-index:2000;padding:16px;
    `;
    
    const doctorNames = {};
    doctorsList.forEach(d => { doctorNames[d.id] = d.name || 'طبيب'; });
    
    let prescriptionsHtml = '';
    if (prescriptions.length === 0) {
        prescriptionsHtml = '<div style="text-align:center;padding:20px;color:var(--text-sec);">لا توجد وصفات لهذا المريض</div>';
    } else {
        prescriptionsHtml = prescriptions.map(rx => {
            const doctorName = doctorNames[rx.doctor_id] || rx.doctor_name || 'طبيب';
            const statusBadge = rx.status === 'تم الصرف' 
                ? '<span style="background:#E8F5E9;color:#1B5E20;padding:2px 8px;border-radius:10px;font-size:0.7rem;">✅ تم الصرف</span>'
                : rx.status === 'صرفت جزئياً'
                    ? '<span style="background:#FFF8E1;color:#F57F17;padding:2px 8px;border-radius:10px;font-size:0.7rem;">📦 جزئي</span>'
                    : '<span style="background:#FFEBEE;color:#B71C1C;padding:2px 8px;border-radius:10px;font-size:0.7rem;">⏳ لم تصرف</span>';
            
            let itemsHtml = '';
            if (rx.items && rx.items.length > 0) {
                itemsHtml = rx.items.map(item => {
                    const formEmoji = item.form === 'tablet' ? '💊' : item.form === 'syrup' ? '🥄' : item.form === 'injection' ? '💉' : '💧';
                    return `<span style="background:#F5FAFC;padding:4px 8px;border-radius:8px;margin:2px;display:inline-block;font-size:0.75rem;">${formEmoji} ${escapeHtml(item.drug_name || '')} - ${escapeHtml(item.dose || '')}</span>`;
                }).join('');
            }
            
            const dateStr = rx.created_at 
                ? new Date(rx.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
                : '—';
            
            return `
                <div style="background:white;border-radius:12px;padding:14px;margin:8px 0;border:1px solid var(--border);">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <div>
                            <b>👨‍⚕️ د. ${escapeHtml(doctorName)}</b>
                            <span style="font-size:0.75rem;color:var(--text-sec);margin-right:8px;">📅 ${dateStr}</span>
                        </div>
                        ${statusBadge}
                    </div>
                    ${rx.diagnosis ? `<div style="font-size:0.8rem;color:var(--text-sec);margin:6px 0;">📝 ${escapeHtml(rx.diagnosis)}</div>` : ''}
                    <div style="margin-top:8px;">${itemsHtml}</div>
                </div>
            `;
        }).join('');
    }
    
    modalContent.innerHTML = `
        <div style="background:white;border-radius:16px;width:100%;max-width:600px;max-height:80vh;overflow-y:auto;padding:20px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3>📁 ${escapeHtml(patient.name || 'مريض')}</h3>
                <button class="close-patient-modal-btn" style="background:none;border:none;font-size:1.5rem;cursor:pointer;">&times;</button>
            </div>
            <div style="font-size:0.85rem;color:var(--text-sec);margin-bottom:12px;">
                📱 ${escapeHtml(patient.phone || '—')} · 🎂 ${escapeHtml(patient.age || '—')} سنة
                ${patient.village_name ? ` · 🏘️ ${escapeHtml(patient.village_name)}` : ''}
            </div>
            <h4 style="margin:12px 0;">📋 الوصفات (${prescriptions.length})</h4>
            ${prescriptionsHtml}
        </div>
    `;
    
    document.body.appendChild(modalContent);
    
    modalContent.querySelector('.close-patient-modal-btn').addEventListener('click', () => {
        modalContent.remove();
    });
    
    modalContent.addEventListener('click', (e) => {
        if (e.target === modalContent) modalContent.remove();
    });
    
    // إغلاق مودال البحث
    if (UI.searchPatientModal) {
        UI.searchPatientModal.style.display = 'none';
    }
}

// ============ دوال الواجهة ============

function renderDoctorsList() {
    if (!UI.doctorListContainer) return;
    
    if (doctorsList.length === 0) {
        UI.doctorListContainer.innerHTML = `
            <div style="text-align:center;padding:20px;color:var(--text-sec);">
                <i class="fas fa-user-md" style="font-size:2rem;opacity:0.3;margin-bottom:8px;"></i>
                <p>لا يوجد أطباء</p>
            </div>
        `;
        return;
    }
    
    UI.doctorListContainer.innerHTML = doctorsList.map(doc => `
        <div class="doctor-item ${selectedDoctorId === doc.id ? 'active' : ''}" 
             data-doctor-id="${doc.id}"
             style="padding:10px 12px;cursor:pointer;border-radius:8px;margin:4px 0;
                    ${selectedDoctorId === doc.id ? 'background:var(--primary-light);border-right:3px solid var(--primary);' : ''}">
            <i class="fas fa-user-md" style="color:var(--primary);"></i>
            <span>د. ${escapeHtml(doc.name || 'طبيب')}</span>
        </div>
    `).join('');
    
    // أحداث النقر على الطبيب
    UI.doctorListContainer.querySelectorAll('.doctor-item').forEach(item => {
        item.addEventListener('click', () => {
            const doctorId = item.dataset.doctorId;
            selectDoctor(doctorId);
        });
    });
}

function selectDoctor(doctorId) {
    selectedDoctorId = doctorId;
    saveSelectedDoctor();
    updateSelectedDoctorTitle();
    renderDoctorsList();
    filterAndRenderPrescriptions();
}

function updateSelectedDoctorTitle() {
    if (!UI.selectedDoctorTitle) return;
    
    if (selectedDoctorId) {
        const doctor = doctorsList.find(d => d.id === selectedDoctorId);
        UI.selectedDoctorTitle.textContent = doctor ? `د. ${doctor.name}` : 'اختر طبيب';
    } else {
        UI.selectedDoctorTitle.textContent = 'اختر طبيباً';
    }
}

function loadAllPrescriptions() {
    if (!currentTenantId) return;
    
    const prescriptionsRef = collection(db, 'tenants', currentTenantId, 'prescriptions');
    if (unsubscribePrescriptions) unsubscribePrescriptions();
    
    unsubscribePrescriptions = onSnapshot(prescriptionsRef, (snapshot) => {
        allPrescriptions = [];
        snapshot.forEach(docSnap => {
            allPrescriptions.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        filterAndRenderPrescriptions();
        setSyncStatus(true);
    }, (error) => {
        DIAGNOSTICS.log(`خطأ في تحميل الوصفات: ${error.message}`, 'error');
        setSyncStatus(false);
    });
}

function loadPatients() {
    const patientsRef = collection(db, 'patients');
    if (unsubscribePatients) unsubscribePatients();
    
    unsubscribePatients = onSnapshot(patientsRef, (snapshot) => {
        patientsMap = {};
        snapshot.forEach(docSnap => {
            patientsMap[docSnap.id] = docSnap.data();
        });
    });
}

function filterAndRenderPrescriptions() {
    if (!UI.prescriptionsListContainer) return;
    
    let filtered = [...allPrescriptions];
    
    if (selectedDoctorId) {
        filtered = filtered.filter(rx => rx.doctor_id === selectedDoctorId);
    }
    
    if (currentDoctorTab && currentDoctorTab !== 'الكل') {
        filtered = filtered.filter(rx => rx.status === currentDoctorTab);
    }
    
    renderPrescriptionsList(filtered);
}

function renderPrescriptionsList(prescriptions) {
    if (!UI.prescriptionsListContainer) return;
    
    if (prescriptions.length === 0) {
        UI.prescriptionsListContainer.innerHTML = `
            <div style="text-align:center;padding:40px;color:var(--text-sec);">
                <i class="fas fa-prescription" style="font-size:3rem;opacity:0.2;margin-bottom:12px;"></i>
                <h4>لا توجد وصفات</h4>
            </div>
        `;
        return;
    }
    
    const doctorNames = {};
    doctorsList.forEach(d => { doctorNames[d.id] = d.name || 'طبيب'; });
    
    UI.prescriptionsListContainer.innerHTML = prescriptions.map(rx => {
        const doctorName = doctorNames[rx.doctor_id] || rx.doctor_name || 'طبيب';
        const patientName = rx.patient_name || patientsMap[rx.patient_id]?.name || 'مريض';
        const dateStr = rx.created_at 
            ? new Date(rx.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })
            : '—';
        
        const statusColors = {
            'لم تصرف بعد': { bg: '#FFEBEE', color: '#B71C1C', icon: '⏳' },
            'صرفت جزئياً': { bg: '#FFF8E1', color: '#F57F17', icon: '📦' },
            'تم الصرف': { bg: '#E8F5E9', color: '#1B5E20', icon: '✅' }
        };
        const status = statusColors[rx.status] || statusColors['لم تصرف بعد'];
        
        return `
            <div class="prescription-card" style="background:white;border-radius:12px;padding:14px;margin:8px 0;
                        border:1px solid var(--border);cursor:pointer;">
                <div style="display:flex;justify-content:space-between;align-items:start;">
                    <div style="flex:1;">
                        <b>👤 ${escapeHtml(patientName)}</b>
                        <span style="font-size:0.75rem;color:var(--text-sec);margin-right:8px;">
                            👨‍⚕️ د. ${escapeHtml(doctorName)}
                        </span>
                    </div>
                    <span style="background:${status.bg};color:${status.color};padding:3px 10px;
                                border-radius:12px;font-size:0.7rem;font-weight:600;">
                        ${status.icon} ${rx.status}
                    </span>
                </div>
                <div style="font-size:0.75rem;color:var(--text-sec);margin-top:6px;">
                    📅 ${dateStr} · 💊 ${rx.item_count || 0} أدوية
                </div>
                ${rx.diagnosis ? `<div style="font-size:0.78rem;color:var(--ink);margin-top:6px;">📝 ${escapeHtml(rx.diagnosis).substring(0, 60)}${rx.diagnosis.length > 60 ? '...' : ''}</div>` : ''}
            </div>
        `;
    }).join('');
}

// ============ إعداد الأحداث ============

function setupEventListeners() {
    // تبويبات الدكتور
    if (UI.tabBtns) {
        UI.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                UI.tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentDoctorTab = btn.dataset.doctorTab;
                filterAndRenderPrescriptions();
            });
        });
    }
    
    // زر البحث عن مريض
    if (UI.searchPatientBtn) {
        UI.searchPatientBtn.addEventListener('click', () => {
            if (UI.searchPatientModal) {
                UI.searchPatientModal.style.display = 'flex';
                setTimeout(() => {
                    if (UI.patientSearchInput) UI.patientSearchInput.focus();
                }, 100);
            }
        });
    }
    
    // إغلاق مودال البحث
    if (UI.closeSearchModalBtn) {
        UI.closeSearchModalBtn.addEventListener('click', () => {
            if (UI.searchPatientModal) UI.searchPatientModal.style.display = 'none';
        });
    }
    
    // تنفيذ البحث
    if (UI.executeSearchBtn) {
        UI.executeSearchBtn.addEventListener('click', async () => {
            const phone = UI.patientSearchInput?.value.trim();
            if (!phone) {
                showToast('أدخل رقم الهاتف للبحث', true);
                return;
            }
            const results = await searchPatientByPhone(phone);
            displayPatientSearchResults(results);
        });
    }
    
    // بحث بالضغط على Enter
    if (UI.patientSearchInput) {
        UI.patientSearchInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                const phone = UI.patientSearchInput.value.trim();
                if (!phone) {
                    showToast('أدخل رقم الهاتف للبحث', true);
                    return;
                }
                const results = await searchPatientByPhone(phone);
                displayPatientSearchResults(results);
            }
        });
    }
    
    // إغلاق المودالات بالنقر خارجها
    window.addEventListener('click', (e) => {
        if (e.target === UI.searchPatientModal) {
            UI.searchPatientModal.style.display = 'none';
        }
    });
    
    // زر تحديث الأطباء
    if (UI.refreshDoctorsBtn) {
        UI.refreshDoctorsBtn.addEventListener('click', () => {
            loadDoctors();
            showToast('🔄 تم تحديث قائمة الأطباء');
        });
    }
    
    // تسجيل الخروج
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
                
                currentUser = null;
                pharmacistInfo = null;
                doctorsList = [];
                allPrescriptions = [];
                patientsMap = {};
                selectedDoctorId = null;
                currentTenantId = null;
                
                await signOut(auth);
                window.location.href = 'index.html';
            } catch (e) {
                console.error('خطأ أثناء تسجيل الخروج:', e);
                clearLoginSessionOnly();
                window.location.href = 'index.html';
            }
        });
    }
    
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
    
    const savedDoctorId = loadSavedDoctor();
    if (savedDoctorId) {
        selectedDoctorId = savedDoctorId;
        DIAGNOSTICS.log(`طبيب مختار سابقاً: ${savedDoctorId}`, 'info');
    }
    
    setupEventListeners();
    loadDoctors();
    loadAllPrescriptions();
    loadPatients();
});

console.log('🚀 لوحة الصيدلي - Firestore مع نظام التشخيص العبقري 🧠');
console.log('🔍 البحث عن المريض: برقم الهاتف من مجموعة patients');
console.log('💡 للتحكم في التشخيص: DIAGNOSTICS.level = "off" أو "quick" أو "medium" أو "deep"');
console.log('📊 التشخيص الحالي:', DIAGNOSTICS.level);
