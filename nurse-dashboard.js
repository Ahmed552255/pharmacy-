import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
// ✅ استبدال Realtime Database بـ Firestore
import { 
    getFirestore, 
    collection, doc, setDoc, updateDoc, getDoc, getDocs, deleteDoc,
    onSnapshot, query, where, orderBy, limit,
    enableIndexedDbPersistence,
    writeBatch, serverTimestamp, addDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ============ تهيئة Firebase ============
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // ✅ Firestore

// ✅ تفعيل التخزين المحلي IndexedDB (بيتخزن تلقائياً)
enableIndexedDbPersistence(db)
    .then(() => {
        console.log('✅ تم تفعيل التخزين المحلي IndexedDB');
    })
    .catch((err) => {
        if (err.code === 'failed-precondition') {
            console.warn('⚠️ التخزين المحلي معطل - علامات تبويب متعددة');
        } else if (err.code === 'unimplemented') {
            console.warn('⚠️ المتصفح لا يدعم التخزين المحلي');
        }
    });

// ============ ✅ ثوابت التخزين المحلي ============
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

// ============ حالة التطبيق ============
const state = {
    currentUser: null,
    nurseData: null,
    assignedDoctors: [],
    selectedDoctorId: null,
    allBookings: [],
    currentTab: 'waiting',
    currentDate: '',
    selectedPatientId: null,
    unsubscribeBookings: null,
    unsubscribeNotifications: null,
    idMode: 'phone',
    // ✅ كاش محلي للمرضى (اللي الممرض شافهم فقط)
    localPatientsCache: {},
};

// ============ دوال مساعدة ============
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const getToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const escapeHtml = (str) => {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

const showToast = (msg, isError = false) => {
    const container = $('#toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'err' : ''}`;
    toast.innerHTML = `<i class="fas ${isError ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i> ${msg}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
};

// ============ ✅ تخزين محلي ذكي للمرضى (اللي الممرض شافهم فقط) ============
const getLocalPatientsCacheKey = () => getTenantStorageKey('nurse_patients_cache');

const loadPatientsCacheFromLocal = () => {
    if (!currentTenantId) return;
    try {
        const key = getLocalPatientsCacheKey();
        const cached = localStorage.getItem(key);
        if (cached) {
            state.localPatientsCache = JSON.parse(cached);
            console.log(`📦 تم تحميل ${Object.keys(state.localPatientsCache).length} مريض من الكاش المحلي`);
        }
    } catch (e) {
        console.warn('تعذر تحميل كاش المرضى:', e.message);
        state.localPatientsCache = {};
    }
};

const savePatientToLocalCache = (patientId, patientData) => {
    if (!currentTenantId || !patientId) return;
    try {
        // ✅ نخزن المريض في الكاش المحلي (للممرض ده بس)
        state.localPatientsCache[patientId] = {
            ...patientData,
            _cachedAt: Date.now()
        };
        
        // نحتفظ بآخر 100 مريض فقط لتوفير المساحة
        const entries = Object.entries(state.localPatientsCache);
        if (entries.length > 100) {
            // نحذف الأقدم
            entries.sort((a, b) => (a[1]._cachedAt || 0) - (b[1]._cachedAt || 0));
            const toRemove = entries.slice(0, entries.length - 100);
            toRemove.forEach(([id]) => delete state.localPatientsCache[id]);
        }
        
        const key = getLocalPatientsCacheKey();
        localStorage.setItem(key, JSON.stringify(state.localPatientsCache));
    } catch (e) {
        console.warn('تعذر حفظ المريض في الكاش المحلي:', e.message);
    }
};

const searchInLocalCache = (searchTerm, searchType = 'phone') => {
    if (!currentTenantId || !searchTerm) return [];
    
    const t = searchTerm.trim().toLowerCase();
    const results = [];
    
    Object.entries(state.localPatientsCache).forEach(([id, p]) => {
        if (searchType === 'phone') {
            // بحث برقم الهاتف
            if (p.phone && p.phone.includes(t)) {
                results.push({ id, ...p, _source: 'local' });
            }
        } else {
            // بحث ببيانات القرية
            const matchFather = !t || (p.father_name && p.father_name.toLowerCase().includes(t));
            const matchFamily = !t || (p.family_name && p.family_name.toLowerCase().includes(t));
            const matchVillage = !t || (p.village_name && p.village_name.toLowerCase().includes(t));
            if (matchFather || matchFamily || matchVillage) {
                results.push({ id, ...p, _source: 'local' });
            }
        }
    });
    
    return results;
};

const searchInLocalCacheByVillage = (fatherName, familyName, villageName) => {
    if (!currentTenantId) return [];
    
    const results = [];
    
    Object.entries(state.localPatientsCache).forEach(([id, p]) => {
        const matchFather = !fatherName || (p.father_name && p.father_name.includes(fatherName));
        const matchFamily = !familyName || (p.family_name && p.family_name.includes(familyName));
        const matchVillage = !villageName || (p.village_name && p.village_name.includes(villageName));
        
        if (matchFather && matchFamily && matchVillage && (fatherName || familyName || villageName)) {
            results.push({ id, ...p, _source: 'local' });
        }
    });
    
    return results;
};

// ============ ✅ مسح بيانات الجلسة فقط ============
const clearLoginSessionOnly = () => {
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
        console.log('💾 تم الإبقاء على بيانات المجمع المحلية والكاش');
    } catch (e) {
        console.warn('تعذر مسح بيانات الجلسة:', e.message);
    }
};

// ============ إدارة التخزين المحلي للكشوفات ============
const getLocalBookingsKey = () => getTenantStorageKey('nurse_bookings');
const getLocalDoctorsKey = () => getTenantStorageKey('nurse_doctors');

const saveBookingsToLocal = (bookings) => {
    if (!currentTenantId) return;
    try {
        const key = getLocalBookingsKey();
        const data = {
            bookings: bookings.map(b => ({ ...b })),
            lastUpdated: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.warn('تعذر حفظ الكشوفات محلياً:', e.message);
    }
};

const loadBookingsFromLocal = (doctorId, date) => {
    if (!currentTenantId) return null;
    try {
        const key = getLocalBookingsKey();
        const cached = localStorage.getItem(key);
        if (!cached) return null;
        
        const data = JSON.parse(cached);
        if (!data.bookings) return null;
        
        const filtered = data.bookings.filter(b => {
            return b.doctor_id === doctorId && b.date === date;
        });
        
        return filtered.length > 0 ? filtered : null;
    } catch (e) {
        console.warn('تعذر تحميل الكشوفات المحلية:', e.message);
        return null;
    }
};

const saveDoctorsToLocal = (doctors) => {
    if (!currentTenantId) return;
    try {
        const key = getLocalDoctorsKey();
        const data = { doctors, cachedAt: Date.now() };
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.warn('تعذر حفظ الأطباء محلياً:', e.message);
    }
};

const loadDoctorsFromLocal = () => {
    if (!currentTenantId) return null;
    try {
        const key = getLocalDoctorsKey();
        const data = localStorage.getItem(key);
        if (!data) return null;
        
        const parsed = JSON.parse(data);
        const now = Date.now();
        const expiryMs = 50 * 24 * 60 * 60 * 1000;
        
        if ((now - parsed.cachedAt) < expiryMs) {
            return parsed.doctors;
        }
        return null;
    } catch (e) {
        return null;
    }
};

// ============ تحديث مؤشر المزامنة ============
const setSyncStatus = (online) => {
    const dot = $('#syncDot');
    if (dot) {
        dot.className = `sync-dot ${online ? 'on' : 'off'}`;
        dot.title = online ? 'متصل بالسحابة' : 'غير متصل - استخدام البيانات المحلية';
    }
};

// ============ ✅ تبديل وضع الهوية ============
const toggleIdMode = (mode) => {
    state.idMode = mode;
    const phoneSection = $('#phoneSection');
    const phoneSearchSection = $('#phoneSearchSection');
    const villageSection = $('#villageSection');
    
    if (mode === 'village') {
        phoneSection.style.display = 'none';
        phoneSearchSection.style.display = 'none';
        villageSection.style.display = 'block';
        $('#patientPhone').value = '';
        $('#patientSearch').value = '';
        $('#searchResults').style.display = 'none';
    } else {
        phoneSection.style.display = 'block';
        phoneSearchSection.style.display = 'block';
        villageSection.style.display = 'none';
        $('#fatherName').value = '';
        $('#familyName').value = '';
        $('#villageName').value = '';
        $('#villageSearchResults').style.display = 'none';
        $('#villageSearchResults').innerHTML = '';
    }
};

// ============ ✅ البحث الذكي (محلي أولاً ← سحابي) ============
let villageSearchTimer;
const setupVillageSearch = () => {
    const fatherInput = $('#fatherName');
    const familyInput = $('#familyName');
    const villageInput = $('#villageName');
    
    const performVillageSearch = () => {
        const father = fatherInput.value.trim();
        const family = familyInput.value.trim();
        const village = villageInput.value.trim();
        
        if (!father && !family && !village) {
            $('#villageSearchResults').style.display = 'none';
            return;
        }
        
        clearTimeout(villageSearchTimer);
        villageSearchTimer = setTimeout(async () => {
            let results = [];
            
            // ✅ 1. البحث في الكاش المحلي أولاً
            const localResults = searchInLocalCacheByVillage(father, family, village);
            if (localResults.length > 0) {
                results = localResults;
                console.log(`📦 وجد ${localResults.length} مريض في الكاش المحلي`);
            }
            
            // ✅ 2. البحث في السحابة (المسار العام patients)
            try {
                const patientsRef = collection(db, 'patients');
                let q = patientsRef;
                
                // Firestore لا يدعم البحث الجزئي، نستخدم فلترة بعد الجلب
                const snapshot = await getDocs(q);
                snapshot.forEach(doc => {
                    const p = doc.data();
                    const matchFather = !father || (p.father_name && p.father_name.includes(father));
                    const matchFamily = !family || (p.family_name && p.family_name.includes(family));
                    const matchVillage = !village || (p.village_name && p.village_name.includes(village));
                    
                    if (matchFather && matchFamily && matchVillage && (father || family || village)) {
                        const exists = results.find(r => r.id === doc.id);
                        if (!exists) {
                            const patientData = { id: doc.id, ...p, _source: 'cloud' };
                            results.push(patientData);
                            // ✅ نخزن في الكاش المحلي تلقائياً
                            savePatientToLocalCache(doc.id, p);
                        }
                    }
                });
            } catch (err) {
                console.warn('تعذر البحث في السحابة:', err.message);
            }

            const container = $('#villageSearchResults');
            if (results.length === 0) {
                container.innerHTML = '<div class="search-item" style="color:var(--text-sec);">لا توجد نتائج - يمكنك إضافة مريض جديد</div>';
            } else {
                container.innerHTML = results.map(p => `
                    <div class="search-item" data-id="${p.id}">
                        <b>${escapeHtml(p.name)}</b>
                        <small style="color:var(--text-sec);">
                            ${escapeHtml(p.father_name || '')} - ${escapeHtml(p.family_name || '')} - ${escapeHtml(p.village_name || '')}
                            ${p._source === 'local' ? '📦' : '☁️'}
                        </small>
                    </div>
                `).join('');

                container.querySelectorAll('.search-item[data-id]').forEach(item => {
                    item.addEventListener('click', () => {
                        const patient = results.find(p => p.id === item.dataset.id);
                        if (patient) selectVillagePatient(patient);
                    });
                });
            }
            container.style.display = 'block';
        }, 400);
    };
    
    fatherInput.addEventListener('input', performVillageSearch);
    familyInput.addEventListener('input', performVillageSearch);
    villageInput.addEventListener('input', performVillageSearch);
    
    document.addEventListener('click', (e) => {
        const villageSection = $('#villageSection');
        const searchResults = $('#villageSearchResults');
        if (villageSection && searchResults && !villageSection.contains(e.target)) {
            searchResults.style.display = 'none';
        }
    });
};

const selectVillagePatient = (patient) => {
    $('#patientName').value = patient.name || '';
    $('#patientAge').value = patient.age || '';
    $('#patientPhone').value = patient.phone || '';
    $('#fatherName').value = patient.father_name || '';
    $('#familyName').value = patient.family_name || '';
    $('#villageName').value = patient.village_name || '';
    state.selectedPatientId = patient.id;
    $('#villageSearchResults').style.display = 'none';
};

// ============ ✅ زر الإعدادات ============
$('#settingsBtn').addEventListener('click', () => {
    try {
        const sessionData = {
            uid: state.currentUser?.uid,
            tenantId: currentTenantId,
            nurseName: state.nurseData?.name,
            timestamp: Date.now()
        };
        sessionStorage.setItem('nurse_settings_session', JSON.stringify(sessionData));
    } catch (e) {
        console.warn('تعذر حفظ جلسة الإعدادات:', e.message);
    }
    
    window.location.href = 'nurse-settings.html';
});

// ============ ✅ تحميل الإشعارات (Firestore) ============
const loadNotifications = () => {
    if (!currentTenantId) return;

    const bookingsRef = collection(db, 'tenants', currentTenantId, 'appointments');
    const q = query(bookingsRef);
    
    state.unsubscribeNotifications = onSnapshot(q, (snapshot) => {
        const notifications = [];
        snapshot.forEach(doc => {
            const booking = doc.data();
            if (booking.created_by !== state.currentUser?.uid) {
                notifications.push({
                    id: doc.id,
                    ...booking
                });
            }
        });

        const badge = $('#notificationBadge');
        if (notifications.length > 0) {
            badge.style.display = 'flex';
            badge.textContent = notifications.length;
        } else {
            badge.style.display = 'none';
        }

        state.notifications = notifications;
    });
};

// ============ ✅ فتح مودال الإشعارات ============
const openNotificationsModal = () => {
    const modal = $('#notificationsModal');
    const body = $('#notificationsBody');

    if (!state.notifications || state.notifications.length === 0) {
        body.innerHTML = `
            <div style="text-align:center;padding:40px;color:var(--text-sec);">
                <i class="fas fa-bell-slash" style="font-size:3rem;opacity:0.2;margin-bottom:12px;"></i>
                <h4>لا توجد إشعارات جديدة</h4>
            </div>
        `;
    } else {
        body.innerHTML = state.notifications.map(notif => {
            const doctorName = state.assignedDoctors.find(d => d.id === notif.doctor_id)?.name || 'غير معروف';
            const visitType = notif.visit_type === 'new' ? 'كشف جديد' : 'إعادة (متابعة)';
            
            return `
                <div class="notification-item">
                    <div class="notification-header">
                        <span class="notification-patient">
                            <i class="fas fa-user"></i> ${escapeHtml(notif.patient_name || 'مريض')}
                        </span>
                        <span class="notification-time">
                            ${notif.date || ''}
                        </span>
                    </div>
                    <div class="notification-details">
                        <i class="fas fa-stethoscope"></i> ${visitType} عند د. ${escapeHtml(doctorName)}
                    </div>
                    <div class="notification-actions">
                        <button class="btn-confirm" data-notification-id="${notif.id}">
                            <i class="fas fa-check"></i> تأكيد وإضافة للطبيب
                        </button>
                        <button class="btn-dismiss" data-notification-id="${notif.id}">
                            <i class="fas fa-times"></i> تجاهل
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        body.querySelectorAll('.btn-confirm').forEach(btn => {
            btn.addEventListener('click', () => confirmBooking(btn.dataset.notificationId));
        });

        body.querySelectorAll('.btn-dismiss').forEach(btn => {
            btn.addEventListener('click', () => dismissNotification(btn.dataset.notificationId));
        });
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
};

const closeNotificationsModal = () => {
    $('#notificationsModal').style.display = 'none';
    document.body.style.overflow = '';
};

// ============ ✅ تأكيد الحجز وإضافته للطبيب ============
const confirmBooking = async (bookingId) => {
    try {
        const booking = state.notifications?.find(n => n.id === bookingId);
        if (!booking) {
            showToast('الإشعار غير موجود', true);
            return;
        }

        $('#editId').value = '';
        $('#modalTitle').innerHTML = '<i class="fas fa-calendar-plus"></i> كشف جديد';
        $('#doctorSelect').value = booking.doctor_id || state.selectedDoctorId;
        $('#patientName').value = booking.patient_name || '';
        $('#patientAge').value = booking.age || '';
        $('#patientPhone').value = booking.phone || '';
        $('#visitType').value = booking.visit_type || 'new';
        $('#apptDate').value = booking.date || state.currentDate;
        state.selectedPatientId = booking.patient_id || null;
        
        if (booking.father_name || booking.family_name || booking.village_name) {
            toggleIdMode('village');
            $('#fatherName').value = booking.father_name || '';
            $('#familyName').value = booking.family_name || '';
            $('#villageName').value = booking.village_name || '';
        } else {
            toggleIdMode('phone');
        }

        closeNotificationsModal();
        $('#bookingModal').style.display = 'flex';
        
        // حذف الإشعار
        await deleteDoc(doc(db, 'tenants', currentTenantId, 'appointments', bookingId));
        
        showToast('✅ تم نقل بيانات المريض لنموذج الكشف');
    } catch (err) {
        showToast('خطأ في التأكيد: ' + err.message, true);
    }
};

const dismissNotification = async (bookingId) => {
    try {
        await deleteDoc(doc(db, 'tenants', currentTenantId, 'appointments', bookingId));
        showToast('تم تجاهل الإشعار');
    } catch (err) {
        showToast('خطأ في التجاهل: ' + err.message, true);
    }
};

// ============ ✅ تحميل بيانات الممرض (Firestore) ============
const loadNurseData = async (uid) => {
    try {
        const nurseDoc = await getDoc(doc(db, 'tenants', currentTenantId, 'users', uid));
        
        let nurseData = null;
        if (nurseDoc.exists()) {
            nurseData = { id: uid, ...nurseDoc.data() };
        } else {
            const oldDoc = await getDoc(doc(db, 'users', uid));
            if (oldDoc.exists() && oldDoc.data().role === 'nurse') {
                nurseData = { id: uid, ...oldDoc.data() };
            }
        }
        
        if (!nurseData || nurseData.role !== 'nurse') {
            showToast('هذا الحساب ليس ممرضاً', true);
            return false;
        }

        state.nurseData = nurseData;
        $('#welcomeMsg').textContent = `أهلاً، ${state.nurseData.name || 'ممرض'}`;
        
        const tenantName = nurseData.tenantName || 'المجمع الطبي';
        $('#tenantName').textContent = tenantName;

        // ✅ تحميل الروابط (الأطباء المرتبطين)
        const linksDoc = await getDoc(doc(db, 'tenants', currentTenantId, 'links', uid));
        const doctorIds = linksDoc.exists() ? Object.keys(linksDoc.data()) : [];

        if (doctorIds.length === 0) {
            const localDoctors = loadDoctorsFromLocal();
            if (localDoctors && localDoctors.length > 0) {
                state.assignedDoctors = localDoctors;
                renderDoctorsTabs();
                populateDoctorSelect();
                state.selectedDoctorId = state.assignedDoctors[0].id;
                highlightDoctorTab(state.selectedDoctorId);
                
                const localBookings = loadBookingsFromLocal(state.selectedDoctorId, state.currentDate);
                if (localBookings) {
                    state.allBookings = localBookings;
                    updateCounts();
                    renderTable();
                }
                
                setSyncStatus(false);
                showToast('⚠️ استخدام البيانات المحلية - لا يوجد اتصال', true);
                return true;
            }
            
            $('#doctorsTabs').innerHTML = '<div style="padding:10px;color:var(--text-sec);">لا يوجد أطباء مرتبطين بك</div>';
            return false;
        }

        const doctorPromises = doctorIds.map(async (docId) => {
            const snap = await getDoc(doc(db, 'tenants', currentTenantId, 'users', docId));
            if (snap.exists()) {
                return { id: docId, name: snap.data().name || 'دكتور' };
            }
            const oldSnap = await getDoc(doc(db, 'users', docId));
            return { id: docId, name: oldSnap.exists() ? oldSnap.data().name : 'دكتور' };
        });
        state.assignedDoctors = await Promise.all(doctorPromises);
        
        saveDoctorsToLocal(state.assignedDoctors);

        renderDoctorsTabs();
        populateDoctorSelect();
        state.selectedDoctorId = state.assignedDoctors[0].id;
        highlightDoctorTab(state.selectedDoctorId);
        loadBookings();
        loadNotifications();
        setSyncStatus(true);
        return true;

    } catch (err) {
        const localDoctors = loadDoctorsFromLocal();
        if (localDoctors && localDoctors.length > 0) {
            state.assignedDoctors = localDoctors;
            renderDoctorsTabs();
            populateDoctorSelect();
            state.selectedDoctorId = state.assignedDoctors[0].id;
            highlightDoctorTab(state.selectedDoctorId);
            
            const localBookings = loadBookingsFromLocal(state.selectedDoctorId, state.currentDate);
            if (localBookings) {
                state.allBookings = localBookings;
                updateCounts();
                renderTable();
            }
            
            setSyncStatus(false);
            showToast('⚠️ استخدام البيانات المحلية - لا يوجد اتصال', true);
            return true;
        }
        
        showToast('خطأ في تحميل البيانات: ' + err.message, true);
        return false;
    }
};

const renderDoctorsTabs = () => {
    $('#doctorsTabs').innerHTML = state.assignedDoctors.map(doc => `
        <button class="doctor-tab" data-id="${doc.id}">
            <i class="fas fa-user-md"></i> د. ${escapeHtml(doc.name)}
        </button>
    `).join('');

    $$('.doctor-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            state.selectedDoctorId = btn.dataset.id;
            highlightDoctorTab(state.selectedDoctorId);
            loadBookings();
        });
    });
};

const highlightDoctorTab = (docId) => {
    $$('.doctor-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.id === docId);
    });
};

const populateDoctorSelect = () => {
    $('#doctorSelect').innerHTML = state.assignedDoctors.map(doc =>
        `<option value="${doc.id}">د. ${escapeHtml(doc.name)}</option>`
    ).join('');
};

// ============ ✅ تحميل الكشوفات (Firestore) ============
const loadBookings = () => {
    if (state.unsubscribeBookings) state.unsubscribeBookings();
    if (!state.selectedDoctorId || !currentTenantId) return;

    const bookingsRef = collection(db, 'tenants', currentTenantId, 'appointments');
    const q = query(bookingsRef, 
        where('doctor_id', '==', state.selectedDoctorId),
        where('date', '==', state.currentDate)
    );
    
    state.unsubscribeBookings = onSnapshot(q, (snapshot) => {
        const bookings = [];
        snapshot.forEach(doc => {
            bookings.push({ id: doc.id, ...doc.data() });
        });
        // ترتيب حسب اسم المريض
        bookings.sort((a, b) => (a.patient_name || '').localeCompare(b.patient_name || ''));
        state.allBookings = bookings;
        
        saveBookingsToLocal(bookings);
        setSyncStatus(true);
        
        updateCounts();
        renderTable();
    }, (error) => {
        console.warn('خطأ في تحميل الكشوفات، استخدام المحلي:', error.message);
        const localBookings = loadBookingsFromLocal(state.selectedDoctorId, state.currentDate);
        if (localBookings) {
            state.allBookings = localBookings;
            updateCounts();
            renderTable();
        }
        setSyncStatus(false);
    });
};

const updateCounts = () => {
    const counts = { waiting: 0, inprogress: 0, done: 0 };
    state.allBookings.forEach(b => {
        if (b.status === 'انتظار') counts.waiting++;
        else if (b.status === 'قيد الكشف') counts.inprogress++;
        else if (b.status === 'منتهي') counts.done++;
    });
    $('#countWaiting').textContent = counts.waiting;
    $('#countInProgress').textContent = counts.inprogress;
    $('#countDone').textContent = counts.done;
};

const renderTable = () => {
    let filtered = [];
    if (state.currentTab === 'waiting') filtered = state.allBookings.filter(b => b.status === 'انتظار');
    else if (state.currentTab === 'inprogress') filtered = state.allBookings.filter(b => b.status === 'قيد الكشف');
    else if (state.currentTab === 'done') filtered = state.allBookings.filter(b => b.status === 'منتهي');

    const tbody = $('#bookingsBody');

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="7">لا توجد كشوفات في هذا القسم</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map((b, i) => {
        const statusMap = {
            'انتظار': 's-waiting',
            'قيد الكشف': 's-inprogress',
            'منتهي': 's-done',
            'ملغي': 's-cancelled'
        };
        const statusClass = statusMap[b.status] || 's-waiting';
        const visitTypeClass = b.visit_type === 'new' ? 'vt-new' : 'vt-follow';
        const visitTypeText = b.visit_type === 'new' ? 'جديد' : 'إعادة';

        const doctorName = state.assignedDoctors.find(d => d.id === b.doctor_id)?.name || 'دكتور';

        const actions = state.currentTab === 'waiting' ? `
            <button class="icon-btn" data-action="edit" data-id="${b.id}" title="تعديل">
                <i class="fas fa-edit"></i>
            </button>
            <button class="icon-btn danger" data-action="cancel" data-id="${b.id}" title="إلغاء">
                <i class="fas fa-times"></i>
            </button>
        ` : '<span style="opacity:0.4;">—</span>';

        return `
        <tr>
            <td>${i + 1}</td>
            <td><b>${escapeHtml(b.patient_name || '-')}</b></td>
            <td>د. ${escapeHtml(doctorName)}</td>
            <td>${b.date || '-'}</td>
            <td><span class="visit-type-badge ${visitTypeClass}">${visitTypeText}</span></td>
            <td><span class="status-badge ${statusClass}">${b.status || 'انتظار'}</span></td>
            <td><div class="action-btns">${actions}</div></td>
        </tr>`;
    }).join('');
};

// ============ أحداث الجدول ============
$('#bookingsBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const booking = state.allBookings.find(b => b.id === id);
    if (!booking) return;

    if (btn.dataset.action === 'cancel') cancelBooking(id);
    else if (btn.dataset.action === 'edit') openEditModal(booking);
});

const cancelBooking = async (id) => {
    try {
        await updateDoc(doc(db, 'tenants', currentTenantId, 'appointments', id), { status: 'ملغي' });
        showToast('تم إلغاء الكشف');
    } catch (err) {
        showToast('خطأ في الإلغاء: ' + err.message, true);
    }
};

// ============ المودال ============
const openAddModal = () => {
    if (state.assignedDoctors.length === 0) {
        showToast('لا يوجد أطباء مرتبطين بك', true);
        return;
    }
    $('#editId').value = '';
    $('#modalTitle').innerHTML = '<i class="fas fa-calendar-plus"></i> كشف جديد';
    resetForm();
    toggleIdMode('phone');
    $('#bookingModal').style.display = 'flex';
};

const openEditModal = (booking) => {
    $('#editId').value = booking.id;
    $('#modalTitle').innerHTML = '<i class="fas fa-edit"></i> تعديل الكشف';
    $('#doctorSelect').value = booking.doctor_id || state.selectedDoctorId;
    $('#patientName').value = booking.patient_name || '';
    $('#patientAge').value = booking.age || '';
    $('#patientPhone').value = booking.phone || '';
    $('#visitType').value = booking.visit_type || 'new';
    $('#apptDate').value = booking.date || state.currentDate;
    state.selectedPatientId = booking.patient_id || null;
    
    if (booking.father_name || booking.family_name || booking.village_name) {
        toggleIdMode('village');
        $('#fatherName').value = booking.father_name || '';
        $('#familyName').value = booking.family_name || '';
        $('#villageName').value = booking.village_name || '';
    } else {
        toggleIdMode('phone');
    }
    
    $('#bookingModal').style.display = 'flex';
};

const closeModal = () => {
    $('#bookingModal').style.display = 'none';
    resetForm();
};

const resetForm = () => {
    $('#bookingForm').reset();
    $('#apptDate').value = state.currentDate;
    $('#visitType').value = 'new';
    state.selectedPatientId = null;
    $('#formAlert').textContent = '';
    $('#searchResults').style.display = 'none';
    $('#villageSearchResults').style.display = 'none';
    $('#villageSearchResults').innerHTML = '';
    toggleIdMode('phone');
};

// ============ ✅ البحث الذكي برقم الهاتف (محلي أولاً ← سحابي) ============
let searchTimer;
$('#patientSearch').addEventListener('input', (e) => {
    const phone = e.target.value.trim();
    if (phone.length < 1) {
        $('#searchResults').style.display = 'none';
        return;
    }
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
        let results = [];
        
        // ✅ 1. البحث في الكاش المحلي أولاً
        const localResults = searchInLocalCache(phone, 'phone');
        if (localResults.length > 0) {
            results = localResults;
            console.log(`📦 وجد ${localResults.length} مريض في الكاش المحلي`);
        }
        
        // ✅ 2. البحث في السحابة (المسار العام patients)
        try {
            const patientsRef = collection(db, 'patients');
            const snapshot = await getDocs(patientsRef);
            snapshot.forEach(doc => {
                const p = doc.data();
                if (p.phone && p.phone.includes(phone)) {
                    const exists = results.find(r => r.id === doc.id);
                    if (!exists) {
                        const patientData = { id: doc.id, ...p, _source: 'cloud' };
                        results.push(patientData);
                        // ✅ نخزن في الكاش المحلي تلقائياً
                        savePatientToLocalCache(doc.id, p);
                    }
                }
            });
        } catch (err) {
            console.warn('تعذر البحث في السحابة:', err.message);
        }

        const container = $('#searchResults');
        if (results.length === 0) {
            container.innerHTML = '<div class="search-item" style="color:var(--text-sec);">لا توجد نتائج - يمكنك إضافة مريض جديد</div>';
        } else {
            container.innerHTML = results.map(p => `
                <div class="search-item" data-id="${p.id}">
                    <b>${escapeHtml(p.name)}</b>
                    <small style="color:var(--text-sec);">
                        ${escapeHtml(p.phone || '')}
                        ${p._source === 'local' ? '📦' : '☁️'}
                    </small>
                </div>
            `).join('');

            container.querySelectorAll('.search-item[data-id]').forEach(item => {
                item.addEventListener('click', () => {
                    const patient = results.find(p => p.id === item.dataset.id);
                    if (patient) selectPatient(patient);
                });
            });
        }
        container.style.display = 'block';
    }, 250);
});

const selectPatient = (patient) => {
    $('#patientName').value = patient.name || '';
    $('#patientAge').value = patient.age || '';
    $('#patientPhone').value = patient.phone || '';
    state.selectedPatientId = patient.id;
    $('#patientSearch').value = '';
    $('#searchResults').style.display = 'none';
    
    if (patient.father_name || patient.family_name || patient.village_name) {
        toggleIdMode('village');
        $('#fatherName').value = patient.father_name || '';
        $('#familyName').value = patient.family_name || '';
        $('#villageName').value = patient.village_name || '';
    }
};

document.addEventListener('click', (e) => {
    if (!$('#patientSearch').contains(e.target) && !$('#searchResults').contains(e.target)) {
        $('#searchResults').style.display = 'none';
    }
});

// ============ ✅ التحقق من تكرار رقم الهاتف (محلي + سحابي) ============
const checkPhoneUniqueness = async (phone, excludeId = null) => {
    if (!phone || phone.trim() === '') return null;
    
    // ✅ 1. البحث في الكاش المحلي أولاً
    const localResults = searchInLocalCache(phone, 'phone');
    const localDuplicate = localResults.find(p => p.phone === phone && p.id !== excludeId);
    if (localDuplicate) {
        console.log('📦 وجد تكرار في الكاش المحلي');
        return localDuplicate;
    }

    // ✅ 2. البحث في السحابة
    try {
        const patientsRef = collection(db, 'patients');
        const snapshot = await getDocs(patientsRef);
        let duplicate = null;
        snapshot.forEach(doc => {
            const p = doc.data();
            if (p.phone === phone && doc.id !== excludeId && !duplicate) {
                duplicate = { id: doc.id, ...p };
            }
        });
        return duplicate;
    } catch (err) {
        console.warn('تعذر التحقق من uniqueness الهاتف:', err.message);
        return null;
    }
};

// ============ ✅ حفظ الكشف مع إضافة المريض في المسار العام (Firestore) ============
$('#bookingForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const editId = $('#editId').value;
    const doctorId = $('#doctorSelect').value;
    const name = $('#patientName').value.trim();
    const age = $('#patientAge').value.trim();
    const phone = state.idMode === 'phone' ? $('#patientPhone').value.trim() : '';
    const visitType = $('#visitType').value;
    const date = $('#apptDate').value;

    const fatherName = state.idMode === 'village' ? $('#fatherName').value.trim() : '';
    const familyName = state.idMode === 'village' ? $('#familyName').value.trim() : '';
    const villageName = state.idMode === 'village' ? $('#villageName').value.trim() : '';

    if (!doctorId || !name || !visitType || !date) {
        $('#formAlert').textContent = 'جميع الحقول المطلوبة (*) يجب ملؤها';
        return;
    }

    if (state.idMode === 'phone' && phone) {
        const existingPhone = await checkPhoneUniqueness(phone, state.selectedPatientId);
        if (existingPhone && !state.selectedPatientId) {
            $('#formAlert').textContent = `⚠️ رقم الهاتف "${phone}" مسجل مسبقاً للمريض "${existingPhone.name}". الرجاء البحث عن المريض أولاً أو استخدام رقم هاتف مختلف.`;
            return;
        }
    }

    const submitBtn = $('#submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    $('#formAlert').textContent = '';

    try {
        let patientId = state.selectedPatientId;

        if (!patientId) {
            // ✅ إضافة مريض جديد في المسار العام patients
            const patientData = {
                name,
                age: age || null,
                phone: phone || null,
                father_name: fatherName || null,
                family_name: familyName || null,
                village_name: villageName || null,
                created_at: serverTimestamp() // ✅ استخدام serverTimestamp
            };
            
            const newRef = await addDoc(collection(db, 'patients'), patientData);
            patientId = newRef.id;
            
            // ✅ تخزين في الكاش المحلي
            savePatientToLocalCache(patientId, { ...patientData, created_at: new Date().toISOString() });
        } else {
            // تحديث بيانات المريض
            const updateData = {
                name,
                age: age || null,
                updated_at: serverTimestamp()
            };
            
            if (state.idMode === 'phone') {
                updateData.phone = phone || null;
            } else {
                updateData.father_name = fatherName || null;
                updateData.family_name = familyName || null;
                updateData.village_name = villageName || null;
            }
            
            try {
                await updateDoc(doc(db, 'patients', patientId), updateData);
                // تحديث الكاش المحلي
                savePatientToLocalCache(patientId, { 
                    ...state.localPatientsCache[patientId], 
                    ...updateData,
                    _cachedAt: Date.now()
                });
            } catch (updateErr) {
                console.warn('تعذر تحديث المريض:', updateErr.message);
            }
        }

        const bookingData = {
            patient_name: name,
            patient_id: patientId,
            age: age || null,
            phone: phone || null,
            father_name: fatherName || null,
            family_name: familyName || null,
            village_name: villageName || null,
            doctor_id: doctorId,
            nurse_id: state.currentUser.uid,
            visit_type: visitType,
            date,
            status: 'انتظار',
            tenantId: currentTenantId
        };

        if (editId) {
            await updateDoc(doc(db, 'tenants', currentTenantId, 'appointments', editId), bookingData);
            showToast('تم تعديل الكشف بنجاح');
        } else {
            bookingData.created_at = serverTimestamp();
            bookingData.created_by = state.currentUser.uid;
            await addDoc(collection(db, 'tenants', currentTenantId, 'appointments'), bookingData);
            showToast('تم حجز الكشف بنجاح');
        }

        closeModal();
    } catch (err) {
        $('#formAlert').textContent = 'خطأ: ' + err.message;
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save"></i> تأكيد الكشف';
    }
});

// ============ تبويبات الحالة ============
$$('.status-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('.status-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.currentTab = btn.dataset.tab;
        renderTable();
    });
});

// ============ تغيير التاريخ ============
$('#filterDate').addEventListener('change', () => {
    state.currentDate = $('#filterDate').value;
    if (state.selectedDoctorId) loadBookings();
});

$('#todayBtn').addEventListener('click', () => {
    state.currentDate = getToday();
    $('#filterDate').value = state.currentDate;
    if (state.selectedDoctorId) loadBookings();
});

// ============ ✅ أحداث الإشعارات ============
$('#notificationsBtn').addEventListener('click', openNotificationsModal);
$('#closeNotificationsBtn').addEventListener('click', closeNotificationsModal);
window.addEventListener('click', (e) => {
    if (e.target === $('#notificationsModal')) closeNotificationsModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#notificationsModal').style.display === 'flex') closeNotificationsModal();
});

// ============ ✅ تسجيل الخروج ============
$('#logoutBtn').addEventListener('click', async () => {
    try {
        showToast('👋 جاري تسجيل الخروج...');
        
        if (state.unsubscribeBookings) {
            state.unsubscribeBookings();
            state.unsubscribeBookings = null;
        }
        if (state.unsubscribeNotifications) {
            state.unsubscribeNotifications();
            state.unsubscribeNotifications = null;
        }
        
        clearLoginSessionOnly();
        
        state.currentUser = null;
        state.nurseData = null;
        state.assignedDoctors = [];
        state.allBookings = [];
        
        await signOut(auth);
        
        window.location.href = 'index.html';
        
    } catch (error) {
        console.error('خطأ أثناء تسجيل الخروج:', error);
        clearLoginSessionOnly();
        window.location.href = 'index.html';
    }
});

// ============ أحداث أخرى ============
$('#addBookingBtn').addEventListener('click', openAddModal);
$('#closeModalBtn').addEventListener('click', closeModal);
window.addEventListener('click', (e) => {
    if (e.target === $('#bookingModal')) closeModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#bookingModal').style.display === 'flex') closeModal();
});

// ============ ✅ أحداث تبديل وضع الهوية ============
$('#toggleIdModeBtn').addEventListener('click', () => toggleIdMode('village'));
$('#togglePhoneModeBtn').addEventListener('click', () => toggleIdMode('phone'));

// ============ مستمعي الاتصال بالإنترنت ============
window.addEventListener('online', () => {
    setSyncStatus(true);
    showToast('📡 تم استعادة الاتصال - جاري المزامنة');
    if (state.selectedDoctorId) loadBookings();
});

window.addEventListener('offline', () => {
    setSyncStatus(false);
    showToast('⚠️ انقطع الاتصال - استخدام البيانات المحلية', true);
});

// ============ ✅ بدء التشغيل ============
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        clearLoginSessionOnly();
        window.location.href = 'index.html';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const tenantFromUrl = urlParams.get('tenant');
    
    if (tenantFromUrl) {
        currentTenantId = tenantFromUrl;
        console.log(`✅ تم استلام معرف المجمع من الرابط: ${currentTenantId}`);
    } else {
        try {
            const encrypted = localStorage.getItem('shifa_secure_session');
            if (encrypted) {
                const decoded = atob(encrypted);
                const match = decoded.match(/"tenantId":"([^"]+)"/);
                if (match) {
                    currentTenantId = match[1];
                    console.log(`📦 تم استخراج معرف المجمع من الجلسة: ${currentTenantId}`);
                }
            }
        } catch (e) {
            console.warn('تعذر فك تشفير الجلسة:', e.message);
        }
        
        if (!currentTenantId) {
            const oldSession = localStorage.getItem('shifa_session');
            if (oldSession) {
                try {
                    const parsed = JSON.parse(oldSession);
                    currentTenantId = parsed.tenantId || user.uid;
                } catch (e) {
                    currentTenantId = user.uid;
                }
            } else {
                currentTenantId = user.uid;
            }
            console.log(`📦 تم تحديد المجمع من الجلسة القديمة: ${currentTenantId}`);
        }
    }

    sessionStorage.setItem('userUid', user.uid);
    sessionStorage.setItem('userRole', 'nurse');

    if (!state.currentUser) {
        state.currentUser = { uid: user.uid };
        state.currentDate = getToday();
        $('#filterDate').value = state.currentDate;

        // ✅ تحميل الكاش المحلي للمرضى
        loadPatientsCacheFromLocal();

        // ✅ تهيئة البحث بالقرية
        setupVillageSearch();

        const localBookings = loadBookingsFromLocal(state.selectedDoctorId || '', state.currentDate);
        if (localBookings && localBookings.length > 0) {
            state.allBookings = localBookings;
            updateCounts();
            renderTable();
        }

        $('#authLoader').style.display = 'none';
        $('#mainContainer').style.display = 'block';

        const success = await loadNurseData(user.uid);
        if (!success) {
            showToast('⚠️ تعذر تحميل بعض البيانات', true);
        }
    }
});

console.log('🚀 لوحة الممرض - Firestore + تخزين محلي ذكي');
console.log('🔒 كل ممرض يشوف فقط كشوفات الدكتور المرتبط بيه في مجمعه');
console.log('💾 وضع الحفظ: يمسح جلسة الدخول فقط - يحتفظ ببيانات المجمع والكاش');
console.log('📦 الكاش المحلي: يخزن المرضى اللي الممرض شافهم فقط (حد أقصى 100 مريض)');
console.log('🔍 البحث: محلي أولاً ← سحابي (مع علامة 📦 للمحلي و ☁️ للسحابي)');
console.log('💰 توفير: تقليل استهلاك القراءة من Firestore بنسبة كبيرة');
