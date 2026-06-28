import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, onValue, get, set, remove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// ============ 🧠 نظام التشخيص العبقري ============
const DIAGNOSTICS = {
    enabled: true,
    level: 'deep',
    
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
        
        const results = { locations: [] };
        
        try {
            const tenantsSnap = await get(ref(db, 'tenants'));
            if (tenantsSnap.exists()) {
                const tenants = tenantsSnap.val();
                const tenantIds = Object.keys(tenants);
                this.log(`عدد المجمعات: ${tenantIds.length}`, 'info');
                
                for (const tenantId of tenantIds) {
                    const userSnap = await get(ref(db, `tenants/${tenantId}/users/${user.uid}`));
                    if (userSnap.exists()) {
                        const data = userSnap.val();
                        this.log(`✅ وجد في المجمع: ${tenantId}`, 'success');
                        results.locations.push({ tenantId, data, path: `tenants/${tenantId}/users/${user.uid}` });
                    }
                }
            } else {
                this.log('❌ لا توجد مجمعات في قاعدة البيانات!', 'error');
            }
        } catch (e) {
            this.log(`خطأ في فحص المجمعات: ${e.message}`, 'error');
        }
        
        if (results.locations.length === 0) {
            this.log('💡 نصيحة: الصيدلي مش موجود في أي مجمع', 'warning');
        }
        
        return results;
    }
};

// ============ تهيئة Firebase ============
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ============ ثوابت التخزين ============
const STORAGE_PREFIX = 'shifa_tenant_';
const LOGIN_STORAGE_KEYS = ['shifa_session', 'shifa_remember', 'shifa_last_login', 'shifa_secure_session'];

let currentTenantId = null;

const getTenantStorageKey = (baseKey) => currentTenantId ? `${STORAGE_PREFIX}${currentTenantId}_${baseKey}` : baseKey;

// ============ الحالة ============
let currentUser = null;
let pharmacistInfo = null;
let doctorsList = [];
let allPrescriptions = [];
let patientsMap = {};
let selectedDoctorId = null;
let currentDoctorTab = 'لم تصرف بعد';
let unsubscribePrescriptions = null;
let unsubscribeDoctors = null;
let unsubscribePatients = null;

// ============ عناصر DOM ============
const UI = {
    welcomeMessage: document.getElementById('welcomeMessage'),
    tenantName: document.getElementById('tenantName'),
    doctorsSidebar: document.getElementById('doctorsSidebar'),
    doctorListContainer: document.getElementById('doctorListContainer'),
    selectedDoctorTitle: document.getElementById('selectedDoctorTitle'),
    prescriptionsListContainer: document.getElementById('prescriptionsListContainer'),
    logoutBtn: document.getElementById('logoutBtn'),
    searchPatientBtn: document.getElementById('searchPatientBtn'),
    searchPatientModal: document.getElementById('searchPatientModal'),
    patientSearchInput: document.getElementById('patientSearchInput'),
    searchResultsContainer: document.getElementById('searchResultsContainer'),
    syncDot: document.getElementById('syncDot')
};

// ============ دوال مساعدة ============
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

function showToast(msg, isErr = false) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:${isErr?'#B23B3B':'#4A3B2C'};color:white;padding:12px 20px;border-radius:50px;font-weight:600;z-index:3000;`;
    t.innerHTML = `<i class="fas ${isErr?'fa-exclamation-triangle':'fa-check'}"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m]||m);
}

function setSyncStatus(online) {
    if (UI.syncDot) {
        UI.syncDot.className = `sync-dot ${online?'on':'off'}`;
        UI.syncDot.title = online ? 'متصل بالسحابة' : 'غير متصل';
    }
}

function clearLoginSessionOnly() {
    try {
        LOGIN_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
        const sessionKeysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('shifa_session') || key.startsWith('shifa_secure'))) sessionKeysToRemove.push(key);
        }
        sessionKeysToRemove.forEach(key => localStorage.removeItem(key));
        sessionStorage.clear();
        DIAGNOSTICS.log('تم مسح بيانات الجلسة بنجاح', 'success');
    } catch (e) { console.warn('تعذر مسح بيانات الجلسة:', e.message); }
}

// ============ ✅ حفظ الطبيب المختار في السحابة ============
async function saveSelectedDoctor() {
    if (!selectedDoctorId || !currentTenantId || !currentUser) return;
    try {
        const settingRef = ref(db, `tenants/${currentTenantId}/pharmacist_settings/${currentUser.uid}/selectedDoctorId`);
        await set(settingRef, { value: selectedDoctorId, updatedAt: new Date().toISOString() });
        localStorage.setItem(getTenantStorageKey('pharmacist_selected_doctor'), selectedDoctorId);
    } catch (err) { console.warn('تعذر حفظ الطبيب المختار:', err.message); }
}

async function loadSavedDoctor() {
    if (!currentTenantId || !currentUser) return null;
    try {
        const snap = await get(ref(db, `tenants/${currentTenantId}/pharmacist_settings/${currentUser.uid}/selectedDoctorId`));
        if (snap.exists()) {
            const docId = snap.val().value;
            localStorage.setItem(getTenantStorageKey('pharmacist_selected_doctor'), docId);
            return docId;
        }
    } catch (err) { console.warn('تعذر تحميل الطبيب المختار:', err.message); }
    return localStorage.getItem(getTenantStorageKey('pharmacist_selected_doctor'));
}

// ============ ✅ تحميل بيانات الصيدلي ============
async function loadPharmacistData(user) {
    DIAGNOSTICS.log('🔍 بدء تحميل بيانات الصيدلي...', 'info');
    
    try {
        let diagnosisResults = {};
        if (DIAGNOSTICS.level !== 'off') {
            diagnosisResults.quick = await DIAGNOSTICS.quickDiagnose(user);
            if (DIAGNOSTICS.level === 'medium' || DIAGNOSTICS.level === 'deep') {
                diagnosisResults.medium = await DIAGNOSTICS.mediumDiagnose(user, diagnosisResults.quick);
            }
            if (DIAGNOSTICS.level === 'deep') {
                diagnosisResults.deep = await DIAGNOSTICS.deepDiagnose(user, diagnosisResults.medium);
            }
        }
        
        const publicSnap = await get(ref(db, `users/${user.uid}`));
        
        if (!publicSnap.exists()) {
            DIAGNOSTICS.log('❌ الصيدلي غير موجود في المسار العام', 'error');
            if (diagnosisResults.deep?.locations?.length > 0) {
                const location = diagnosisResults.deep.locations[0];
                currentTenantId = location.tenantId;
                pharmacistInfo = location.data;
            } else {
                showToast('❌ بيانات الصيدلي غير موجودة', true);
                return false;
            }
        } else {
            const userData = publicSnap.val();
            if (userData.role !== 'pharmacist') {
                DIAGNOSTICS.log(`❌ الدور غير صحيح: ${userData.role}`, 'error');
                return false;
            }
            currentTenantId = userData.tenantId || user.uid;
            pharmacistInfo = userData;
        }
        
        UI.welcomeMessage.textContent = `أهلاً، ${pharmacistInfo.name || 'صيدلي'}`;
        if (UI.tenantName) UI.tenantName.textContent = pharmacistInfo.tenantName || 'المجمع الطبي';
        
        sessionStorage.setItem('shifa_tenant_id', currentTenantId);
        sessionStorage.setItem('userUid', user.uid);
        sessionStorage.setItem('userRole', 'pharmacist');
        
        return true;
    } catch (err) {
        DIAGNOSTICS.log(`❌ خطأ: ${err.message}`, 'error');
        return false;
    }
}

// ============ تحميل الأطباء ============
function loadDoctors() {
    if (!currentTenantId) return;
    DIAGNOSTICS.log('🔄 تحميل الأطباء...', 'info');
    
    const usersRef = ref(db, `tenants/${currentTenantId}/users`);
    if (unsubscribeDoctors) unsubscribeDoctors();
    
    unsubscribeDoctors = onValue(usersRef, (snap) => {
        const docs = [];
        snap.forEach(child => {
            const user = child.val();
            if (user.role === 'doctor') docs.push({ id: child.key, ...user });
        });
        DIAGNOSTICS.log(`تم تحميل ${docs.length} طبيب`, 'success');
        doctorsList = docs.length > 0 ? docs : [];
        setSyncStatus(true);
        renderDoctorsList();
    }, (error) => {
        DIAGNOSTICS.log(`خطأ: ${error.message}`, 'error');
        setSyncStatus(false);
    });
}

function renderDoctorsList() {
    if (!UI.doctorListContainer) return;
    if (doctorsList.length === 0) {
        UI.doctorListContainer.innerHTML = '<div style="padding:10px;color:var(--text-sec);text-align:center;">لا يوجد أطباء</div>';
        return;
    }
    UI.doctorListContainer.innerHTML = doctorsList.map(doc => `
        <div class="doctor-item ${selectedDoctorId===doc.id?'active':''}" data-doctor-id="${doc.id}">
            <i class="fas fa-user-md"></i> د. ${escapeHtml(doc.name||'طبيب')}
        </div>
    `).join('');
    
    UI.doctorListContainer.querySelectorAll('.doctor-item').forEach(item => {
        item.addEventListener('click', () => selectDoctor(item.dataset.doctorId));
    });
    updateSelectedDoctorTitle();
}

function updateSelectedDoctorTitle() {
    if (!UI.selectedDoctorTitle) return;
    const doc = doctorsList.find(d => d.id === selectedDoctorId);
    UI.selectedDoctorTitle.textContent = doc ? `وصفات د. ${escapeHtml(doc.name)}` : 'اختر طبيباً';
}

async function selectDoctor(docId) {
    selectedDoctorId = docId;
    await saveSelectedDoctor();
    updateSelectedDoctorTitle();
    renderDoctorsList();
    loadAllPrescriptions();
}

// ============ تحميل الوصفات ============
function loadAllPrescriptions() {
    if (!currentTenantId || !selectedDoctorId) return;
    if (unsubscribePrescriptions) unsubscribePrescriptions();
    
    const prescriptionsRef = ref(db, `tenants/${currentTenantId}/prescriptions`);
    unsubscribePrescriptions = onValue(prescriptionsRef, (snap) => {
        const rxList = [];
        snap.forEach(child => {
            const rx = child.val();
            if (rx.doctor_id === selectedDoctorId) rxList.push({ id: child.key, ...rx });
        });
        rxList.sort((a, b) => (b.created_at||'').localeCompare(a.created_at||''));
        allPrescriptions = rxList;
        setSyncStatus(true);
        renderPrescriptionsForDoctor();
    }, (error) => {
        DIAGNOSTICS.log(`خطأ: ${error.message}`, 'error');
        setSyncStatus(false);
    });
}

function loadPatients() {
    if (!currentTenantId) return;
    if (unsubscribePatients) unsubscribePatients();
    
    const patientsRef = ref(db, `tenants/${currentTenantId}/patients`);
    unsubscribePatients = onValue(patientsRef, (snap) => {
        patientsMap = {};
        snap.forEach(child => { patientsMap[child.key] = child.val(); });
        renderPrescriptionsForDoctor();
    });
}

function renderPrescriptionsForDoctor() {
    if (!UI.prescriptionsListContainer) return;
    
    let filteredRx = allPrescriptions;
    if (currentDoctorTab !== 'الكل') filteredRx = allPrescriptions.filter(rx => rx.status === currentDoctorTab);
    
    if (filteredRx.length === 0) {
        UI.prescriptionsListContainer.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-sec);">لا توجد وصفات</div>`;
        return;
    }
    
    UI.prescriptionsListContainer.innerHTML = filteredRx.map(rx => {
        const patientName = rx.patient_name || patientsMap[rx.patient_id]?.name || 'غير معروف';
        const dateStr = rx.created_at ? new Date(rx.created_at).toLocaleDateString('ar-EG', {year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
        const statusColors = {'لم تصرف بعد':'#FF9800','تم الصرف':'#4CAF50','صرفت جزئياً':'#2196F3'};
        const statusColor = statusColors[rx.status] || '#757575';
        
        return `
            <div class="prescription-card">
                <div class="prescription-header">
                    <div class="patient-info"><i class="fas fa-user-circle"></i> ${escapeHtml(patientName)}</div>
                    <div class="prescription-status" style="background:${statusColor}20;color:${statusColor};">${rx.status||'—'}</div>
                </div>
                <div class="prescription-meta">
                    <span><i class="fas fa-calendar"></i> ${dateStr}</span>
                    <span><i class="fas fa-pills"></i> ${rx.item_count||0} أدوية</span>
                </div>
                <div class="prescription-actions">
                    <button class="btn btn-sm btn-outline view-rx-btn" data-rx-id="${rx.id}"><i class="fas fa-eye"></i> عرض</button>
                    ${rx.status!=='تم الصرف'?`<button class="btn btn-sm btn-primary dispense-rx-btn" data-rx-id="${rx.id}"><i class="fas fa-check-circle"></i> صرف</button>`:''}
                </div>
            </div>`;
    }).join('');
    
    UI.prescriptionsListContainer.querySelectorAll('.view-rx-btn').forEach(btn => {
        btn.addEventListener('click', () => viewPrescriptionDetails(btn.dataset.rxId));
    });
    UI.prescriptionsListContainer.querySelectorAll('.dispense-rx-btn').forEach(btn => {
        btn.addEventListener('click', () => dispensePrescription(btn.dataset.rxId));
    });
}

async function viewPrescriptionDetails(rxId) {
    const rx = allPrescriptions.find(r => r.id === rxId);
    if (!rx) return;
    
    try {
        const itemsSnap = await get(ref(db, `tenants/${currentTenantId}/prescription_items/${rxId}`));
        let items = [];
        if (itemsSnap.exists()) items = Object.values(itemsSnap.val());
        
        const patientName = rx.patient_name || patientsMap[rx.patient_id]?.name || 'غير معروف';
        
        // ✅ تحميل ملاحظة الصيدلي من السحابة
        let existingNote = '';
        try {
            const noteSnap = await get(ref(db, `tenants/${currentTenantId}/pharmacist_notes/${currentUser.uid}/${rxId}`));
            if (noteSnap.exists()) existingNote = noteSnap.val().note || '';
        } catch(e) {}
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-card" style="max-width:600px;">
                <div class="modal-header"><h3>تفاصيل الوصفة</h3><button class="close-btn">&times;</button></div>
                <div class="modal-body">
                    <div><b>المريض:</b> ${escapeHtml(patientName)}${rx.age?` · ${rx.age} سنة`:''}</div>
                    ${rx.diagnosis?`<div><b>التشخيص:</b> ${escapeHtml(rx.diagnosis)}</div>`:''}
                    <div style="margin-top:10px;"><b>الأدوية (${items.length}):</b>
                        ${items.map((item,i) => `<div style="padding:8px;margin:3px 0;background:#f5f5f5;border-radius:5px;">${i+1}. ${escapeHtml(item.drug_name||'—')} - ${escapeHtml(item.dose||'—')}</div>`).join('')}
                    </div>
                    <div style="margin-top:15px;">
                        <label><b>ملاحظة الصيدلي:</b></label>
                        <textarea id="pharmacistNote" style="width:100%;min-height:60px;margin-top:5px;">${escapeHtml(existingNote)}</textarea>
                    </div>
                    <button class="btn btn-primary" id="saveNoteBtn" style="margin-top:10px;"><i class="fas fa-save"></i> حفظ الملاحظة</button>
                </div>
            </div>`;
        
        document.body.appendChild(modal);
        modal.querySelector('.close-btn').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if(e.target===modal) modal.remove(); });
        
        modal.querySelector('#saveNoteBtn').addEventListener('click', async () => {
            const note = modal.querySelector('#pharmacistNote').value.trim();
            try {
                if (note) {
                    await set(ref(db, `tenants/${currentTenantId}/pharmacist_notes/${currentUser.uid}/${rxId}`), {
                        note, updatedAt: new Date().toISOString()
                    });
                } else {
                    await remove(ref(db, `tenants/${currentTenantId}/pharmacist_notes/${currentUser.uid}/${rxId}`));
                }
                showToast('✅ تم حفظ الملاحظة');
            } catch(err) { showToast('خطأ في الحفظ', true); }
        });
    } catch(err) {
        showToast('خطأ في تحميل التفاصيل', true);
    }
}

async function dispensePrescription(rxId) {
    try {
        await set(ref(db, `tenants/${currentTenantId}/prescriptions/${rxId}/status`), 'تم الصرف');
        showToast('✅ تم الصرف بنجاح');
        loadAllPrescriptions();
    } catch(err) { showToast('خطأ في الصرف', true); }
}

// ============ البحث عن مريض ============
async function searchPatients(query) {
    if (!query?.trim() || !UI.searchResultsContainer) return;
    UI.searchResultsContainer.innerHTML = '<div style="text-align:center;padding:20px;">جاري البحث...</div>';
    
    try {
        const snap = await get(ref(db, `tenants/${currentTenantId}/patients`));
        const results = [];
        const q = query.trim().toLowerCase();
        
        if (snap.exists()) {
            snap.forEach(child => {
                const p = child.val();
                if ((p.name||'').toLowerCase().includes(q) || (p.phone||'').toLowerCase().includes(q)) {
                    results.push({ id: child.key, ...p });
                }
            });
        }
        
        UI.searchResultsContainer.innerHTML = results.length === 0 
            ? '<div style="text-align:center;padding:20px;">لا توجد نتائج</div>'
            : results.map(p => `<div style="padding:10px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;"><div><b>${escapeHtml(p.name)}</b><div>${escapeHtml(p.phone||'')} · ${p.age||'—'} سنة</div></div></div>`).join('');
    } catch(err) {
        UI.searchResultsContainer.innerHTML = '<div style="color:red;">خطأ في البحث</div>';
    }
}

// ============ أحداث ============
function setupEventListeners() {
    document.querySelectorAll('[data-doctor-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('[data-doctor-tab]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentDoctorTab = tab.dataset.doctorTab;
            renderPrescriptionsForDoctor();
        });
    });
    
    if (UI.searchPatientBtn && UI.searchPatientModal) {
        UI.searchPatientBtn.addEventListener('click', () => UI.searchPatientModal.style.display = 'flex');
        document.getElementById('closeSearchModalBtn')?.addEventListener('click', () => UI.searchPatientModal.style.display = 'none');
    }
    
    if (UI.patientSearchInput) {
        document.getElementById('executeSearchBtn')?.addEventListener('click', () => searchPatients(UI.patientSearchInput.value));
        UI.patientSearchInput.addEventListener('keydown', (e) => { if(e.key==='Enter') searchPatients(UI.patientSearchInput.value); });
    }
    
    if (UI.logoutBtn) {
        UI.logoutBtn.addEventListener('click', async () => {
            if (unsubscribePrescriptions) unsubscribePrescriptions();
            if (unsubscribeDoctors) unsubscribeDoctors();
            if (unsubscribePatients) unsubscribePatients();
            clearLoginSessionOnly();
            await signOut(auth);
            window.location.href = 'index.html';
        });
    }
    
    window.addEventListener('click', (e) => { if(e.target.classList.contains('modal')) e.target.style.display = 'none'; });
    document.addEventListener('keydown', (e) => { if(e.key==='Escape') document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); });
    
    window.addEventListener('online', () => { setSyncStatus(true); showToast('📡 تم استعادة الاتصال'); });
    window.addEventListener('offline', () => { setSyncStatus(false); showToast('⚠️ انقطع الاتصال', true); });
}

// ============ بدء التشغيل ============
onAuthStateChanged(auth, async (user) => {
    DIAGNOSTICS.showPanel();
    
    if (!user) { clearLoginSessionOnly(); window.location.href = 'index.html'; return; }
    
    DIAGNOSTICS.log(`👤 مستخدم: ${user.email}`, 'success');
    currentUser = user;
    setupEventListeners();
    
    const valid = await loadPharmacistData(user);
    if (!valid) return;
    
    DIAGNOSTICS.log('✅ تم تحميل البيانات بنجاح', 'success');
    
    selectedDoctorId = await loadSavedDoctor();
    if (selectedDoctorId) DIAGNOSTICS.log(`طبيب مختار: ${selectedDoctorId}`, 'info');
    
    loadDoctors();
    loadAllPrescriptions();
    loadPatients();
});

console.log('🚀 لوحة الصيدلي - تخزين سحابي بالكامل');
console.log('💡 للتحكم في التشخيص: DIAGNOSTICS.level = "off"');
