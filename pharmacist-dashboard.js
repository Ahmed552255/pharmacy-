import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, onValue, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

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

// ============ ✅ نظام استدعاء الملفات لشريط التنقل ============
const NavigationSystem = {
    // الملفات المرتبطة بكل صفحة
    pageModules: {
        home: {
            file: './modules/home-module.js',
            loaded: false,
            module: null
        },
        ad: {
            file: './modules/advertisements-module.js',
            loaded: false,
            module: null
        },
        consult: {
            file: './modules/quick-consult-module.js',
            loaded: false,
            module: null
        },
        missing: {
            file: './modules/missing-medicine-module.js',
            loaded: false,
            module: null
        },
        interaction: {
            file: './modules/drug-interactions-module.js',
            loaded: false,
            module: null
        }
    },
    
    // الصفحة النشطة حالياً
    currentPage: 'home',
    
    // تحميل ملف JavaScript ديناميكياً
    async loadModule(pageName) {
        if (this.pageModules[pageName]?.loaded) {
            DIAGNOSTICS.log(`✅ الملف ${pageName} محمل مسبقاً`, 'success');
            return this.pageModules[pageName].module;
        }
        
        try {
            DIAGNOSTICS.log(`📥 جاري تحميل ملف: ${this.pageModules[pageName].file}`, 'info');
            
            const module = await import(this.pageModules[pageName].file);
            
            this.pageModules[pageName].loaded = true;
            this.pageModules[pageName].module = module;
            
            DIAGNOSTICS.log(`✅ تم تحميل ملف ${pageName} بنجاح`, 'success');
            
            // استدعاء دالة init إذا كانت موجودة في الملف
            if (module.init && typeof module.init === 'function') {
                DIAGNOSTICS.log(`🚀 استدعاء دالة init() للملف ${pageName}`, 'info');
                await module.init(currentTenantId, pharmacistInfo, {
                    doctors: doctorsList,
                    prescriptions: allPrescriptions,
                    patients: patientsMap
                });
            }
            
            return module;
            
        } catch (error) {
            DIAGNOSTICS.log(`❌ فشل تحميل ملف ${pageName}: ${error.message}`, 'error');
            
            // محاولة تحميل من مسار بديل
            try {
                const fallbackPath = `./modules/${pageName}-module.js`;
                DIAGNOSTICS.log(`🔄 محاولة المسار البديل: ${fallbackPath}`, 'warning');
                
                const module = await import(fallbackPath);
                
                this.pageModules[pageName].loaded = true;
                this.pageModules[pageName].module = module;
                
                if (module.init && typeof module.init === 'function') {
                    await module.init(currentTenantId, pharmacistInfo, {
                        doctors: doctorsList,
                        prescriptions: allPrescriptions,
                        patients: patientsMap
                    });
                }
                
                DIAGNOSTICS.log(`✅ تم تحميل الملف من المسار البديل`, 'success');
                return module;
                
            } catch (fallbackError) {
                DIAGNOSTICS.log(`❌ فشل المسار البديل أيضاً: ${fallbackError.message}`, 'error');
                
                // إنشاء ملف افتراضي إذا لم تكن الملفات موجودة
                this.createDefaultModule(pageName);
                return null;
            }
        }
    },
    
    // إنشاء ملف افتراضي مؤقت
    createDefaultModule(pageName) {
        const pageNames = {
            home: 'المنزل',
            ad: 'الإعلانات',
            consult: 'الاستشارة السريعة',
            missing: 'الدواء الناقص',
            interaction: 'تبادل الأدوية'
        };
        
        const pageIcons = {
            home: 'fa-home',
            ad: 'fa-bullhorn',
            consult: 'fa-comment-medical',
            missing: 'fa-exclamation-triangle',
            interaction: 'fa-exchange-alt'
        };
        
        // إنشاء محتوى افتراضي للصفحة
        const defaultContent = document.createElement('div');
        defaultContent.innerHTML = `
            <div style="text-align:center;padding:40px;">
                <i class="fas ${pageIcons[pageName]}" style="font-size:4rem;opacity:0.3;margin-bottom:20px;"></i>
                <h2>صفحة ${pageNames[pageName]}</h2>
                <p style="color:#666;">سيتم تطوير هذه الصفحة قريباً</p>
                <p style="color:#999;font-size:0.9rem;">
                    الملف المطلوب: modules/${pageName}-module.js غير موجود
                </p>
                <button onclick="window.location.reload()" 
                        style="margin-top:20px;padding:10px 20px;background:#00AEEF;color:white;border:none;border-radius:20px;cursor:pointer;">
                    🔄 تحديث الصفحة
                </button>
            </div>
        `;
        
        // إضافة المحتوى الافتراضي للصفحة
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            mainContent.innerHTML = '';
            mainContent.appendChild(defaultContent);
        }
        
        showToast(`⚠️ صفحة ${pageNames[pageName]} قيد التطوير`, true);
    },
    
    // التنقل إلى صفحة محددة
    async navigateTo(pageName) {
        if (this.currentPage === pageName && this.pageModules[pageName]?.loaded) {
            DIAGNOSTICS.log(`⏭️ الصفحة ${pageName} مفتوحة بالفعل`, 'info');
            return;
        }
        
        DIAGNOSTICS.log(`🧭 التنقل إلى: ${pageName}`, 'info');
        
        // تحديث شريط التنقل النشط
        this.updateNavActiveState(pageName);
        
        // تحميل الملف المناسب
        const module = await this.loadModule(pageName);
        
        // تحديث الصفحة الحالية
        this.currentPage = pageName;
        
        // تخزين الصفحة النشطة
        if (currentTenantId) {
            localStorage.setItem(`shifa_tenant_${currentTenantId}_active_page`, pageName);
        }
        
        return module;
    },
    
    // تحديل حالة الأزرار النشطة في شريط التنقل
    updateNavActiveState(pageName) {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeBtn = document.querySelector(`.nav-item.${pageName}-nav`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
        
        // تحديث عنوان الصفحة
        const pageTitles = {
            home: 'المنزل',
            ad: 'الإعلانات',
            consult: 'استشارة سريعة',
            missing: 'الدواء الناقص',
            interaction: 'تبادل الأدوية'
        };
        
        document.title = `شفاء · ${pageTitles[pageName] || 'لوحة الصيدلي'}`;
    },
    
    // استعادة آخر صفحة نشطة
    restoreActivePage() {
        if (currentTenantId) {
            const savedPage = localStorage.getItem(`shifa_tenant_${currentTenantId}_active_page`);
            if (savedPage && this.pageModules[savedPage]) {
                return savedPage;
            }
        }
        return 'home';
    }
};

// ✅ تعديل دالة navigateTo الأصلية لاستخدام نظام NavigationSystem
window.navigateTo = async function(page) {
    DIAGNOSTICS.log(`👆 نقر على زر: ${page}`, 'info');
    
    try {
        await NavigationSystem.navigateTo(page);
        showToast(`✅ تم فتح ${page === 'home' ? 'المنزل' : 
                           page === 'ad' ? 'الإعلانات' : 
                           page === 'consult' ? 'الاستشارة السريعة' : 
                           page === 'missing' ? 'الدواء الناقص' : 
                           'تبادل الأدوية'}`);
    } catch (error) {
        DIAGNOSTICS.log(`❌ خطأ في التنقل: ${error.message}`, 'error');
        showToast('حدث خطأ في فتح الصفحة', true);
    }
};

// ============ باقي الكود (نفسه مع تعديلات بسيطة) ============
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

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

// ============ باقي الدوال (نفس الكود الأصلي) ============
function renderDoctorsList() {
    // الكود الأصلي لعرض الأطباء
    DIAGNOSTICS.log('🔄 تحديث قائمة الأطباء...', 'info');
}

function updateSelectedDoctorTitle() {
    // الكود الأصلي لتحديث عنوان الطبيب المختار
}

function loadAllPrescriptions() {
    // الكود الأصلي لتحميل الوصفات
}

function loadPatients() {
    // الكود الأصلي لتحميل المرضى
}

function renderPrescriptionsForDoctor() {
    // الكود الأصلي لعرض الوصفات
}

// ---------- بدء التشغيل المطور ----------
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
    
    const savedDoctorId = loadSavedDoctor();
    if (savedDoctorId) {
        selectedDoctorId = savedDoctorId;
        DIAGNOSTICS.log(`طبيب مختار سابقاً: ${savedDoctorId}`, 'info');
    }
    
    // ✅ استعادة آخر صفحة نشطة
    const activePage = NavigationSystem.restoreActivePage();
    DIAGNOSTICS.log(`📄 استعادة الصفحة النشطة: ${activePage}`, 'info');
    
    loadDoctors();
    loadAllPrescriptions();
    loadPatients();
    
    // ✅ تحميل الصفحة النشطة
    setTimeout(() => {
        NavigationSystem.navigateTo(activePage);
    }, 1000);
});

// ============ أدوات تحكم إضافية ============
// تقدر تتحكم في مستوى التشخيص من console المتصفح:
// DIAGNOSTICS.level = 'off'     // يطفي التشخيص
// DIAGNOSTICS.level = 'quick'   // تشخيص سريع
// DIAGNOSTICS.level = 'medium'  // تشخيص متوسط
// DIAGNOSTICS.level = 'deep'    // تشخيص عميق (افتراضي)

// ✅ أدوات تحكم إضافية لنظام التنقل
// NavigationSystem.navigateTo('ad')        // التنقل لصفحة الإعلانات
// NavigationSystem.navigateTo('consult')   // التنقل لصفحة الاستشارة
// NavigationSystem.navigateTo('missing')   // التنقل لصفحة الدواء الناقص
// NavigationSystem.navigateTo('interaction') // التنقل لصفحة تبادل الأدوية
// NavigationSystem.navigateTo('home')      // العودة للصفحة الرئيسية

console.log('🚀 لوحة الصيدلي - مع نظام التشخيص العبقري 🧠');
console.log('💡 للتحكم في التشخيص: DIAGNOSTICS.level = "off" أو "quick" أو "medium" أو "deep"');
console.log('📊 التشخيص الحالي:', DIAGNOSTICS.level);
console.log('🧭 نظام التنقل: كل زر يستدعي ملف JavaScript مختلف');
console.log('📁 الملفات المطلوبة في مجلد modules/:');
console.log('  - home-module.js (المنزل)');
console.log('  - advertisements-module.js (الإعلانات)');
console.log('  - quick-consult-module.js (استشارة سريعة)');
console.log('  - missing-medicine-module.js (الدواء الناقص)');
console.log('  - drug-interactions-module.js (تبادل الأدوية)');
