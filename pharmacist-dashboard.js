import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, onValue, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// ============ 🧠 نظام التشخيص العبقري ============
const DIAGNOSTICS = {
    enabled: true, // تقدر تطفيه بعد ما تحل المشكلة
    level: 'deep', // 'quick' | 'medium' | 'deep' | 'off'
    
    // أنماط الألوان للتشخيص
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
    
    // عرض واجهة التشخيص
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
        
        // كمان نطبعه في consoleBrowser العادي
        const consoleStyles = {
            success: 'color: green; font-weight: bold;',
            error: 'color: red; font-weight: bold;',
            warning: 'color: orange; font-weight: bold;',
            info: 'color: blue;'
        };
        console.log(`%c🧠 ${msg}`, consoleStyles[type] || '');
    },
    
    // تشخيص سريع
    async quickDiagnose(user) {
        this.log('🚀 بدء التشخيص السريع...', 'info');
        this.log(`المستخدم: ${user.email}`, 'info');
        this.log(`UID: ${user.uid}`, 'uid');
        
        // فحص الرابط
        const urlParams = new URLSearchParams(window.location.search);
        const tenantFromUrl = urlParams.get('tenant');
        this.log(`الرابط: ${tenantFromUrl ? 'يحتوي على tenant ✅' : 'لا يحتوي على tenant ❌'}`, 
                tenantFromUrl ? 'success' : 'warning');
        
        // فحص localStorage
        const hasSecureSession = localStorage.getItem('shifa_secure_session');
        const hasOldSession = localStorage.getItem('shifa_session');
        this.log(`الجلسة المشفرة: ${hasSecureSession ? 'موجودة ✅' : 'غير موجودة'}`, 
                hasSecureSession ? 'success' : 'warning');
        this.log(`الجلسة القديمة: ${hasOldSession ? 'موجودة ✅' : 'غير موجودة'}`, 
                hasOldSession ? 'success' : 'warning');
        
        return { tenantFromUrl, hasSecureSession, hasOldSession };
    },
    
    // تشخيص متوسط
    async mediumDiagnose(user, quickResults) {
        this.log('🔍 بدء التشخيص المتوسط...', 'info');
        
        // فحص المسار العام
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
    
    // تشخيص عميق
    async deepDiagnose(user, mediumResults) {
        this.log('🔬 بدء التشخيص العميق...', 'info');
        
        const results = {
            locations: [],
            tenantInfo: null,
            databaseStructure: null
        };
        
        // 1. فحص كل المجمعات
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
                        // فحص عدد المستخدمين في المجمع
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
        
        // 2. تحليل بنية البيانات
        this.analyzeDatabaseStructure(user, results);
        
        return results;
    },
    
    // تحليل بنية قاعدة البيانات
    analyzeDatabaseStructure(user, results) {
        this.log('📊 تحليل بنية قاعدة البيانات...', 'info');
        
        // نصايح مبنية على النتايح
        if (results.locations.length === 0) {
            this.log('💡 نصيحة: الصيدلي مش موجود في أي مجمع', 'warning');
            this.log('   الحل: استخدم لوحة الإدارة لإضافة الصيدلي', 'info');
            this.log('   أو استخدم كود الإضافة اليدوي', 'info');
        } else if (results.locations.length > 1) {
            this.log('⚠️ الصيدلي موجود في أكثر من مجمع!', 'warning');
            this.log('   سيتم استخدام أول موقع تم العثور عليه', 'info');
        }
        
        // فحص roles
        const allRoles = results.locations.map(l => l.data.role);
        if (allRoles.some(r => r !== 'pharmacist')) {
            this.log('❌ تحذير: الصيدلي موجود ولكن الدور غير صحيح!', 'error');
            this.log(`   الأدوار الموجودة: ${allRoles.join(', ')}`, 'error');
            this.log('   الحل: تغيير الدور إلى "pharmacist" من Firebase Console', 'info');
        }
    }
};

// ============ ✅ نظام إدارة الصفحات والملفات ============
const PAGE_ROUTER = {
    // تعريف الملفات المرتبطة بكل صفحة
    pages: {
        home: {
            title: 'المنزل',
            icon: 'fa-home',
            file: 'pharmacist-dashboard.js',  // ✅ ملف المنزل
            css: 'pharmacist-dashboard.css'
        },
        ad: {
            title: 'الإعلان',
            icon: 'fa-bullhorn',
            file: 'advertisements.js',
            css: 'advertisements.css'
        },
        consult: {
            title: 'استشارة سريعة',
            icon: 'fa-comment-medical',
            file: 'quick-consult.js',
            css: 'quick-consult.css'
        },
        missing: {
            title: 'الدواء الناقص',
            icon: 'fa-exclamation-triangle',
            file: 'missing-medicine.js',
            css: 'missing-medicine.css'
        },
        interaction: {
            title: 'تبادل الأدوية',
            icon: 'fa-exchange-alt',
            file: 'drug-interactions.js',
            css: 'drug-interactions.css'
        }
    },
    
    currentPage: 'home',
    loadedScripts: new Set(),
    loadedStyles: new Set(),
    
    // تحميل ملف JavaScript
    loadScript(src) {
        return new Promise((resolve, reject) => {
            // منع التحميل المكرر
            if (this.loadedScripts.has(src)) {
                DIAGNOSTICS.log(`الملف ${src} محمل مسبقاً ⏭️`, 'info');
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.type = 'module';
            script.src = src;
            script.onload = () => {
                this.loadedScripts.add(src);
                DIAGNOSTICS.log(`✅ تم تحميل: ${src}`, 'success');
                resolve();
            };
            script.onerror = (err) => {
                DIAGNOSTICS.log(`❌ فشل تحميل: ${src}`, 'error');
                reject(new Error(`Failed to load script: ${src}`));
            };
            document.head.appendChild(script);
        });
    },
    
    // تحميل ملف CSS
    loadStyle(href) {
        return new Promise((resolve) => {
            // منع التحميل المكرر
            if (this.loadedStyles.has(href)) {
                DIAGNOSTICS.log(`ملف CSS ${href} محمل مسبقاً ⏭️`, 'info');
                resolve();
                return;
            }
            
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = () => {
                this.loadedStyles.add(href);
                DIAGNOSTICS.log(`✅ تم تحميل CSS: ${href}`, 'success');
                resolve();
            };
            link.onerror = () => {
                DIAGNOSTICS.log(`⚠️ فشل تحميل CSS: ${href}`, 'warning');
                resolve(); // نستمر حتى لو فشل الـ CSS
            };
            document.head.appendChild(link);
        });
    },
    
    // التنقل لصفحة جديدة
    async navigateTo(pageName) {
        if (!this.pages[pageName]) {
            DIAGNOSTICS.log(`❌ صفحة غير معروفة: ${pageName}`, 'error');
            showToast('الصفحة غير موجودة', true);
            return;
        }
        
        if (pageName === this.currentPage) {
            DIAGNOSTICS.log(`⏭️ أنت بالفعل في صفحة: ${pageName}`, 'info');
            return;
        }
        
        const page = this.pages[pageName];
        DIAGNOSTICS.log(`🔄 التنقل إلى: ${page.title}`, 'info');
        
        try {
            // إظهار مؤشر التحميل
            showToast(`⏳ جاري تحميل ${page.title}...`);
            
            // تحميل CSS إذا وجد
            if (page.css) {
                await this.loadStyle(page.css);
            }
            
            // تحميل JavaScript إذا وجد (لغير المنزل)
            if (page.file && pageName !== 'home') {
                await this.loadScript(page.file);
            }
            
            // تحديث الصفحة الحالية
            this.currentPage = pageName;
            
            // تحديث شريط التنقل
            this.updateNavActive(pageName);
            
            DIAGNOSTICS.log(`✅ تم الانتقال إلى: ${page.title}`, 'success');
            showToast(`✅ ${page.title}`);
            
            // إعادة توجيه إذا كانت صفحة مختلفة
            if (pageName !== 'home') {
                const pageUrls = {
                    'ad': 'advertisements.html',
                    'consult': 'quick-consult.html',
                    'missing': 'missing-medicine.html',
                    'interaction': 'drug-interactions.html'
                };
                if (pageUrls[pageName]) {
                    window.location.href = pageUrls[pageName];
                }
            }
            
        } catch (error) {
            DIAGNOSTICS.log(`❌ خطأ في التنقل: ${error.message}`, 'error');
            showToast('فشل تحميل الصفحة', true);
        }
    },
    
    // تحديث الزر النشط في شريط التنقل
    updateNavActive(pageName) {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeBtn = document.querySelector(`.nav-item.${pageName}-nav`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    },
    
    // تهيئة أحداث النقر على شريط التنقل
    initNavEvents() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                
                // استخراج اسم الصفحة من الكلاسات
                let pageName = 'home';
                for (const name of Object.keys(this.pages)) {
                    if (item.classList.contains(`${name}-nav`)) {
                        pageName = name;
                        break;
                    }
                }
                
                this.navigateTo(pageName);
            });
        });
        
        DIAGNOSTICS.log('✅ تم تهيئة أحداث شريط التنقل', 'success');
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
        // تشغيل التشخيص حسب المستوى المطلوب
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
            
            // لو التشخيص العميق لقى الصيدلي في مكان تاني
            if (diagnosisResults.deep?.locations?.length > 0) {
                const location = diagnosisResults.deep.locations[0];
                DIAGNOSTICS.log(`💡 لكنه موجود في: ${location.path}`, 'warning');
                DIAGNOSTICS.log('   جاري استخدام هذا الموقع...', 'info');
                
                currentTenantId = location.tenantId;
                pharmacistInfo = location.data;
            } else {
                showToast('❌ بيانات الصيدلي غير موجودة. تأكد من إضافته من لوحة الإدارة.', true);
                
                // عرض رسالة مفصلة للمستخدم
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

// ============ دوال وهمية للوظائف المتبقية (حتى يكتمل الكود) ============
function renderDoctorsList() {
    DIAGNOSTICS.log('🔄 تحديث قائمة الأطباء...', 'info');
    // الكود الأصلي للعرض
    if (UI.doctorListContainer) {
        if (doctorsList.length === 0) {
            UI.doctorListContainer.innerHTML = '<div style="padding:15px;text-align:center;color:#999;">لا يوجد أطباء</div>';
        } else {
            UI.doctorListContainer.innerHTML = doctorsList.map(doc => 
                `<div class="doctor-item" data-id="${doc.id}">د. ${escapeHtml(doc.name || '---')}</div>`
            ).join('');
        }
    }
}

function loadAllPrescriptions() {
    DIAGNOSTICS.log('🔄 تحميل الوصفات...', 'info');
}

function loadPatients() {
    DIAGNOSTICS.log('🔄 تحميل المرضى...', 'info');
}

// ============ ✅ دالة navigateTo المحدثة للـ HTML ============
// هذه الدالة يتم استدعاؤها من أزرار HTML
window.navigateTo = function(pageName) {
    PAGE_ROUTER.navigateTo(pageName);
};

// ---------- بدء التشغيل المطور ----------
onAuthStateChanged(auth, async (user) => {
    // ✅ عرض لوحة التشخيص
    DIAGNOSTICS.showPanel();
    
    // ✅ تهيئة أحداث شريط التنقل
    PAGE_ROUTER.initNavEvents();
    
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
        
        // إظهار زر للعودة
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
    
    loadDoctors();
    loadAllPrescriptions();
    loadPatients();
});

// ============ أدوات تحكم إضافية ============
console.log('🚀 لوحة الصيدلي - مع نظام التشخيص العبقري 🧠');
console.log('💡 للتحكم في التشخيص: DIAGNOSTICS.level = "off" أو "quick" أو "medium" أو "deep"');
console.log('📊 التشخيص الحالي:', DIAGNOSTICS.level);
console.log('📱 شريط التنقل: المنزل | الإعلان | استشارة | ناقص | تبادل');
console.log('📂 ملف المنزل: pharmacist-dashboard.js');
console.log('🔗 كل زر يستدعي ملفه المناسب');
