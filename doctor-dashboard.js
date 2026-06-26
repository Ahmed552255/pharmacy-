import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, onValue, set, push, update, get, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

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

class SessionDB {
    constructor() { 
        this._dbName = null;
    }
    get dbName() {
        if (!this._dbName) {
            this._dbName = currentTenantId ? `ShifaDoctorDB_${currentTenantId}` : 'ShifaDoctorDB';
        }
        return this._dbName;
    }
    get storeName() { return 'pendingSessions'; }
    get db() { return this._db; }
    set db(val) { this._db = val; }
    
    async open() { 
        if (this.db) return; 
        return new Promise((resolve, reject) => { 
            const req = indexedDB.open(this.dbName, 1); 
            req.onupgradeneeded = (e) => { 
                const db = e.target.result; 
                if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName, { keyPath: 'id' }); 
            }; 
            req.onsuccess = (e) => { this.db = e.target.result; resolve(); }; 
            req.onerror = (e) => reject(e.target.error); 
        }); 
    }
    async save(session) { if (!this.db) await this.open(); return new Promise((resolve, reject) => { const tx = this.db.transaction(this.storeName, 'readwrite'); tx.objectStore(this.storeName).put(session); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
    async getAll() { if (!this.db) await this.open(); return new Promise((resolve, reject) => { const tx = this.db.transaction(this.storeName, 'readonly'); const req = tx.objectStore(this.storeName).getAll(); req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error); }); }
    async delete(id) { if (!this.db) await this.open(); return new Promise((resolve, reject) => { const tx = this.db.transaction(this.storeName, 'readwrite'); tx.objectStore(this.storeName).delete(id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
}

class FavoriteDrugsDB {
    constructor() { 
        this._dbName = null;
    }
    get dbName() {
        if (!this._dbName) {
            this._dbName = currentTenantId ? `ShifaFavoritesDB_${currentTenantId}` : 'ShifaFavoritesDB';
        }
        return this._dbName;
    }
    get storeName() { return 'favoriteDrugs'; }
    get db() { return this._db; }
    set db(val) { this._db = val; }
    
    async open() { if (this.db) return; return new Promise((resolve, reject) => { const req = indexedDB.open(this.dbName, 1); req.onupgradeneeded = (e) => { const db = e.target.result; if (!db.objectStoreNames.contains(this.storeName)) { const store = db.createObjectStore(this.storeName, { keyPath: 'fullName' }); store.createIndex('usageCount', 'usageCount', { unique: false }); } }; req.onsuccess = (e) => { this.db = e.target.result; resolve(); }; req.onerror = (e) => reject(e.target.error); }); }
    async getAll() { if (!this.db) await this.open(); return new Promise((resolve, reject) => { const tx = this.db.transaction(this.storeName, 'readonly'); const req = tx.objectStore(this.storeName).getAll(); req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error); }); }
    async incrementAndSave(fullName, name, form, strength) { if (!this.db) await this.open(); const tx = this.db.transaction(this.storeName, 'readwrite'); const store = tx.objectStore(this.storeName); const req = store.get(fullName); req.onsuccess = () => { let drug = req.result; if (drug) { drug.usageCount = (drug.usageCount || 0) + 1; drug.lastUsed = new Date().toISOString(); } else { drug = { fullName, name, form, strength, usageCount: 1, hidden: false, firstUsed: new Date().toISOString(), lastUsed: new Date().toISOString() }; } store.put(drug); }; }
    async hideDrug(fullName) { if (!this.db) await this.open(); return new Promise((resolve) => { const tx = this.db.transaction(this.storeName, 'readwrite'); const store = tx.objectStore(this.storeName); const req = store.get(fullName); req.onsuccess = () => { let drug = req.result || { fullName, usageCount: 0 }; drug.hidden = true; store.put(drug); resolve(); }; req.onerror = () => resolve(); }); }
    
    async search(term, formFilter = null, limit = 5) { 
        const all = await this.getAll(); 
        const termLower = term.toLowerCase(); 
        let results = all.filter(d => { 
            if (d.hidden) return false; 
            const nameLower = (d.name || '').toLowerCase();
            const fullNameLower = (d.fullName || '').toLowerCase();
            const strengthLower = (d.strength || '').toLowerCase();
            
            return nameLower.includes(termLower) || 
                   fullNameLower.includes(termLower) || 
                   strengthLower.includes(termLower);
        }); 
        results.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0)); 
        return results.slice(0, limit); 
    }
}

class FavoriteDosesDB {
    constructor() { 
        this._dbName = null;
    }
    get dbName() {
        if (!this._dbName) {
            this._dbName = currentTenantId ? `ShifaDosesDB_${currentTenantId}` : 'ShifaDosesDB';
        }
        return this._dbName;
    }
    get storeName() { return 'favoriteDoses'; }
    get db() { return this._db; }
    set db(val) { this._db = val; }
    
    async open() { if (this.db) return; return new Promise((resolve, reject) => { const req = indexedDB.open(this.dbName, 1); req.onupgradeneeded = (e) => { const db = e.target.result; if (!db.objectStoreNames.contains(this.storeName)) { const store = db.createObjectStore(this.storeName, { keyPath: 'id' }); store.createIndex('usageCount', 'usageCount', { unique: false }); } }; req.onsuccess = (e) => { this.db = e.target.result; resolve(); }; req.onerror = (e) => reject(e.target.error); }); }
    async getAll() { if (!this.db) await this.open(); return new Promise((resolve, reject) => { const tx = this.db.transaction(this.storeName, 'readonly'); const req = tx.objectStore(this.storeName).getAll(); req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error); }); }
    async recordDose(drugName, form, dose, freqLabel) { if (!this.db) await this.open(); const id = `${drugName}_${form}_${dose}`; const tx = this.db.transaction(this.storeName, 'readwrite'); const store = tx.objectStore(this.storeName); const req = store.get(id); req.onsuccess = () => { let entry = req.result; if (entry) { entry.usageCount = (entry.usageCount || 0) + 1; entry.lastUsed = new Date().toISOString(); } else { entry = { id, drugName, form, dose, freqLabel, usageCount: 1, firstUsed: new Date().toISOString(), lastUsed: new Date().toISOString() }; } store.put(entry); }; }
    async search(drugName, form, limit = 3) { const all = await this.getAll(); let results = all.filter(d => d.drugName === drugName && d.form === form); results.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0)); return results.slice(0, limit); }
}

const sessionDB = new SessionDB();
const favoritesDB = new FavoriteDrugsDB();
const favoriteDosesDB = new FavoriteDosesDB();

const state = {
    user: null, doctorData: null, appointments: [], currentAppointment: null,
    prescription: [], diagnosis: '', loadedTemplateId: null, loadedTemplateName: null,
    activeSessionId: null, drugCache: [], globalDrugsCache: [], currentTab: 'current',
    editingPrescription: null, editingRxId: null, editingPatientName: '',
    isEditingCompleted: false, editingCompletedRxId: null,
    previousRecordsCount: 0
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const esc = (s) => { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; };
const toast = (msg, err=false) => { const c = $('#toastContainer'); const t = document.createElement('div'); t.className = `toast ${err?'err':''}`; t.innerHTML = `<i class="fas ${err?'fa-exclamation-circle':'fa-check-circle'}"></i> ${msg}`; c.appendChild(t); setTimeout(() => { if (t.parentNode) t.remove(); }, 2500); };
const getPatientName = (apt) => apt?.patient_name || apt?.patientName || 'غير معروف';
const extractStrength = (text) => { const match = text.match(/(\d+(?:\.\d+)?\s*(?:gm|g|gram|mg|mcg|mcgm|IU|MU|ml|%|mcg\/ml|mg\/ml|mg\/5ml|mcg\/puff)(?:\/\d*\s*(?:ml|gm|g))?)/i); return match ? match[1] : ''; };

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
        console.log('💾 تم الإبقاء على بيانات المجمع المحلية');
    } catch (e) {
        console.warn('تعذر مسح بيانات الجلسة:', e.message);
    }
};

const setSyncStatus = (online) => {
    const dot = $('#syncDot');
    if (dot) {
        dot.className = `sync-dot ${online ? 'on' : 'off'}`;
        dot.title = online ? 'متصل بالسحابة' : 'غير متصل - استخدام البيانات المحلية';
    }
};

async function fetchPreviousRecordsCount(patientId) {
    if (!patientId || !currentTenantId) return 0;
    try {
        const snap = await get(ref(db, `tenants/${currentTenantId}/prescriptions`));
        if (!snap.exists()) return 0;
        let count = 0;
        snap.forEach(child => {
            const rx = child.val();
            if (String(rx.patient_id) === String(patientId)) count++;
        });
        return count;
    } catch (e) {
        return 0;
    }
}

async function restorePrescription(rxId) {
    try {
        const [rxSnap, itemsSnap] = await Promise.all([
            get(ref(db, `tenants/${currentTenantId}/prescriptions/${rxId}`)),
            get(ref(db, `tenants/${currentTenantId}/prescription_items/${rxId}`))
        ]);
        
        if (rxSnap.exists()) {
            const diagnosis = rxSnap.val().diagnosis || '';
            $('#diagnosisInput').value = diagnosis;
        }
        
        state.prescription = [];
        if (itemsSnap.exists()) {
            state.prescription = Object.values(itemsSnap.val()).map(it => ({
                drug: it.drug_name || it.drug_id || '',
                form: it.form || 'tablet',
                dose: it.dose || ''
            }));
        }
        
        state.prescription.forEach(item => {
            const strength = extractStrength(item.drug);
            const pureName = strength ? item.drug.replace(strength, '').trim() : item.drug;
            drugManager.recordUsage(item.drug, pureName, item.form, strength);
        });
        
        renderRxList();
        saveSessionToDB();
        $('#patientFileModal').style.display = 'none';
        toast('✅ تم استرداد الوصفة بنجاح');
    } catch (err) {
        console.error('خطأ في استرداد الوصفة:', err);
        toast('خطأ في استرداد الوصفة', true);
    }
}

const doseManager = {
    generateSuggestions(count, form) {
        const num = parseInt(count);
        if (!num || num < 1) return [];
        const suggestions = [];
        const formLabels = {
            tablet: { unit: 'قرص', emoji: '💊' },
            syrup: { unit: 'مل', emoji: '🥄' },
            injection: { unit: 'سم', emoji: '💉' },
            suppository: { unit: 'لبوس', emoji: '🧴' },
            drops: { unit: 'نقطة', emoji: '💧' }
        };
        const fl = formLabels[form] || { unit: 'جرعة', emoji: '💊' };
        if (num === 1) { suggestions.push({ dose: `1 ${fl.unit}`, freq: 'مرة واحدة', label: `${fl.emoji} ${fl.unit} واحدة` }); }
        else if (num === 2) { suggestions.push({ dose: `1 ${fl.unit}`, freq: 'كل 12 ساعة', label: `${fl.emoji} ${fl.unit} كل 12 ساعة` }); }
        else if (num === 3) { suggestions.push({ dose: `1 ${fl.unit}`, freq: 'كل 8 ساعات', label: `${fl.emoji} ${fl.unit} كل 8 ساعات` }); }
        else if (num === 4) { suggestions.push({ dose: `1 ${fl.unit}`, freq: 'كل 6 ساعات', label: `${fl.emoji} ${fl.unit} كل 6 ساعات` }); suggestions.push({ dose: `2 ${fl.unit}`, freq: 'كل 12 ساعة', label: `${fl.emoji} 2 ${fl.unit} كل 12 ساعة` }); }
        else if (num === 6) { suggestions.push({ dose: `1 ${fl.unit}`, freq: 'كل 4 ساعات', label: `${fl.emoji} ${fl.unit} كل 4 ساعات` }); suggestions.push({ dose: `2 ${fl.unit}`, freq: 'كل 8 ساعات', label: `${fl.emoji} 2 ${fl.unit} كل 8 ساعات` }); }
        else { suggestions.push({ dose: `${num} ${fl.unit}`, freq: 'يومياً', label: `${fl.emoji} ${num} ${fl.unit} يومياً` }); }
        suggestions.push({ dose: `${num} ${fl.unit}`, freq: 'عند اللزوم', label: `${fl.emoji} ${num} ${fl.unit} عند اللزوم` });
        return suggestions;
    },
    async getSuggestions(countText, form, drugName) {
        const suggestions = [];
        const num = parseInt(countText);
        if (num && num >= 1) { const smart = this.generateSuggestions(num, form); smart.forEach(s => suggestions.push({ ...s, source: 'smart' })); }
        if (drugName) { const favDoses = await favoriteDosesDB.search(drugName, form, 3); favDoses.forEach(fd => { const exists = suggestions.find(s => s.dose === fd.dose && s.freq === fd.freqLabel); if (!exists) { suggestions.unshift({ dose: fd.dose, freq: fd.freqLabel, label: `${fd.dose} - ${fd.freqLabel}`, source: 'favorite', usageCount: fd.usageCount }); } else { exists.source = 'favorite'; exists.usageCount = fd.usageCount; } }); }
        return suggestions;
    },
    async recordUsage(drugName, form, dose, freqLabel) { await favoriteDosesDB.recordDose(drugName, form, dose, freqLabel); }
};

// ============================================================
// ✅✅✅ نظام المراقبة الذكي - تتبع وصفات الدكتور ✅✅✅
// ============================================================
const prescriptionTracker = {
    async trackDrugPrescription(drugName, doctorId, doctorName) {
        if (!currentTenantId || !doctorId) return;
        
        try {
            const todayDate = today();
            const drugKey = drugName.replace(/[.#$/[\]]/g, '_');
            
            const drugRef = ref(db, `tenants/${currentTenantId}/doctor_prescriptions/${doctorId}/${drugKey}`);
            const snap = await get(drugRef);
            
            const now = new Date().toISOString();
            
            if (snap.exists()) {
                const data = snap.val();
                let history = data.history || [];
                
                history.push({
                    date: todayDate,
                    timestamp: now,
                    count: 1
                });
                
                const fifteenDaysAgo = new Date();
                fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
                const cutoffDate = `${fifteenDaysAgo.getFullYear()}-${String(fifteenDaysAgo.getMonth()+1).padStart(2,'0')}-${String(fifteenDaysAgo.getDate()).padStart(2,'0')}`;
                
                history = history.filter(h => h.date >= cutoffDate);
                
                const totalCount15Days = history.reduce((sum, h) => sum + (h.count || 1), 0);
                
                const aggregatedHistory = [];
                const dateMap = new Map();
                history.forEach(h => {
                    if (dateMap.has(h.date)) {
                        dateMap.get(h.date).count += (h.count || 1);
                    } else {
                        const entry = { date: h.date, count: (h.count || 1) };
                        dateMap.set(h.date, entry);
                        aggregatedHistory.push(entry);
                    }
                });
                
                await set(drugRef, {
                    drug_name: drugName,
                    doctor_id: doctorId,
                    doctor_name: doctorName || 'طبيب',
                    first_prescribed: data.first_prescribed || todayDate,
                    last_prescribed: todayDate,
                    total_count_15days: totalCount15Days,
                    history: aggregatedHistory,
                    updated_at: now
                });
                
                console.log(`📊 ${drugName}: تم وصفه ${totalCount15Days} مرة في آخر 15 يوم`);
                
            } else {
                await set(drugRef, {
                    drug_name: drugName,
                    doctor_id: doctorId,
                    doctor_name: doctorName || 'طبيب',
                    first_prescribed: todayDate,
                    last_prescribed: todayDate,
                    total_count_15days: 1,
                    history: [{ date: todayDate, count: 1 }],
                    updated_at: now
                });
                
                console.log(`🆕 ${drugName}: أول وصفة للدواء`);
            }
            
        } catch (err) {
            console.warn('⚠️ تعذر تتبع وصفة الدواء:', err.message);
        }
    },
    
    async getDrugStatsForAllDoctors(drugName) {
        if (!currentTenantId) return [];
        
        try {
            const drugKey = drugName.replace(/[.#$/[\]]/g, '_');
            const allDoctorsSnap = await get(ref(db, `tenants/${currentTenantId}/doctor_prescriptions`));
            
            if (!allDoctorsSnap.exists()) return [];
            
            const results = [];
            
            allDoctorsSnap.forEach(doctorSnap => {
                const doctorId = doctorSnap.key;
                const doctorData = doctorSnap.val();
                
                Object.entries(doctorData).forEach(([key, data]) => {
                    if (key === drugKey || (data.drug_name || '').toLowerCase() === drugName.toLowerCase()) {
                        results.push({
                            doctor_id: doctorId,
                            doctor_name: data.doctor_name || 'طبيب',
                            drug_name: data.drug_name || drugName,
                            total_count_15days: data.total_count_15days || 0,
                            last_prescribed: data.last_prescribed || '',
                            history: data.history || []
                        });
                    }
                });
            });
            
            results.sort((a, b) => b.total_count_15days - a.total_count_15days);
            
            return results;
            
        } catch (err) {
            console.warn('⚠️ تعذر جلب إحصائيات الدواء:', err.message);
            return [];
        }
    }
};

// ============================================================
// ✅✅✅ drugManager مع ترتيب ذكي للاقتراحات ✅✅✅
// ============================================================
const drugManager = {
    _cachePromise: null,
    
    async loadCache() {
        if (this._cachePromise) return this._cachePromise;
        
        this._cachePromise = (async () => {
            try { 
                const snap = await get(ref(db, `tenants/${currentTenantId}/drugs`));
                if (snap.exists()) {
                    state.globalDrugsCache = Object.values(snap.val());
                } else {
                    const globalSnap = await get(ref(db, 'drugs'));
                    state.globalDrugsCache = globalSnap.exists() ? Object.values(globalSnap.val()) : [];
                }
            } catch(e) { 
                state.globalDrugsCache = []; 
            }
            
            try {
                let localDrugs = [];
                
                if (window.__drugsDatabase && Array.isArray(window.__drugsDatabase)) {
                    localDrugs = window.__drugsDatabase;
                } else if (window.drugsDatabase && Array.isArray(window.drugsDatabase)) {
                    localDrugs = window.drugsDatabase;
                } else {
                    try {
                        const response = await fetch('./drugs-database.js');
                        if (response.ok) {
                            const text = await response.text();
                            const regex = /"([^"]+)"/g;
                            let match;
                            while ((match = regex.exec(text)) !== null) {
                                const name = match[1].trim();
                                if (name.length >= 3 && 
                                    !name.startsWith('//') && 
                                    !name.startsWith('const') && 
                                    !name.startsWith('export') &&
                                    !name.startsWith('window') &&
                                    !name.startsWith('&') &&
                                    name !== 'drugsDatabase') {
                                    localDrugs.push(name);
                                }
                            }
                        }
                    } catch(fetchErr) {
                        console.warn('⚠️ تعذر تحميل ملف drugs-database.js:', fetchErr.message);
                    }
                }
                
                if (localDrugs.length > 0) {
                    const seen = new Set(state.globalDrugsCache.map(d => (d.name || '').toLowerCase()));
                    
                    localDrugs.forEach(drugName => {
                        if (drugName && !seen.has(drugName.toLowerCase())) {
                            seen.add(drugName.toLowerCase());
                            const strength = extractStrength(drugName);
                            state.globalDrugsCache.push({
                                id: `local_${state.globalDrugsCache.length}`,
                                name: drugName,
                                fullName: drugName,
                                form: 'tablet',
                                strength: strength,
                                freq: 0
                            });
                        }
                    });
                    
                    console.log(`✅ تم تحميل ${localDrugs.length} دواء من الملف المحلي`);
                    console.log(`📦 إجمالي الأدوية في الذاكرة: ${state.globalDrugsCache.length}`);
                }
            } catch(err) {
                console.warn('⚠️ خطأ في تحميل الأدوية المحلية:', err.message);
            }
            
            state.drugCache = [...state.globalDrugsCache];
        })();
        
        return this._cachePromise;
    },
    
    async getSuggestions(term, form = null) {
        const termLower = term.toLowerCase().trim();
        const suggestions = []; 
        const seenNames = new Set();
        
        const localFavs = await favoritesDB.search(termLower, null, 8);
        localFavs.forEach(d => { 
            const key = `${(d.name || '').toLowerCase()}_${(d.form || '').toLowerCase()}_${(d.strength || '').toLowerCase()}`; 
            if (!seenNames.has(key)) { 
                seenNames.add(key); 
                suggestions.push({ 
                    name: d.fullName || `${d.name} ${d.strength || ''}`.trim(), 
                    form: d.form || 'tablet', 
                    strength: d.strength || '', 
                    freq: d.usageCount || 0, 
                    source: 'favorite', 
                    originalName: d.name || '' 
                }); 
            } 
        });
        
        const remainingSlots = 10 - suggestions.length;
        if (remainingSlots > 0) { 
            let globalResults = state.globalDrugsCache.filter(d => { 
                const name = (d.name || '').toLowerCase(); 
                const fullName = (d.fullName || '').toLowerCase();
                const strength = (d.strength || '').toLowerCase();
                return name.includes(termLower) || 
                       fullName.includes(termLower) ||
                       strength.includes(termLower);
            });
            
            globalResults.sort((a, b) => {
                const aName = (a.name || a.fullName || '').toLowerCase();
                const bName = (b.name || b.fullName || '').toLowerCase();
                
                const aStartsExact = aName.startsWith(termLower) ? 0 : 1;
                const bStartsExact = bName.startsWith(termLower) ? 0 : 1;
                
                if (aStartsExact !== bStartsExact) {
                    return aStartsExact - bStartsExact;
                }
                
                if (aName.length !== bName.length) {
                    return aName.length - bName.length;
                }
                
                return aName.localeCompare(bName);
            });
            
            const topResults = globalResults.slice(0, remainingSlots);
            
            for (const d of topResults) { 
                const key = `${(d.name || '').toLowerCase()}_${(d.form || '').toLowerCase()}`; 
                if (!seenNames.has(key)) { 
                    seenNames.add(key); 
                    suggestions.push({ 
                        name: d.fullName || d.name || '', 
                        form: d.form || 'tablet', 
                        strength: d.strength || extractStrength(d.name || ''), 
                        freq: d.freq || 0, 
                        source: 'global', 
                        originalName: d.name || '' 
                    }); 
                } 
            }
        }
        
        suggestions.sort((a, b) => {
            const aName = (a.name || '').toLowerCase();
            const bName = (b.name || '').toLowerCase();
            
            const aStarts = aName.startsWith(termLower) ? 0 : 1;
            const bStarts = bName.startsWith(termLower) ? 0 : 1;
            
            if (aStarts !== bStarts) return aStarts - bStarts;
            
            if (a.source === 'favorite' && b.source !== 'favorite') return -1;
            if (b.source === 'favorite' && a.source !== 'favorite') return 1;
            
            return aName.length - bName.length;
        });
        
        return suggestions;
    },
    
    async recordUsage(fullDrugName, name, form, strength) { 
        await favoritesDB.incrementAndSave(fullDrugName, name, form, strength); 
    },
    
    async hideSuggestion(fullDrugName, name, form) { 
        await favoritesDB.hideDrug(fullDrugName); 
        toast(`تم تقليل ظهور "${fullDrugName}"`); 
    }
};

async function saveSessionToDB() { 
    if (!state.currentAppointment) return; 
    if (state.isEditingCompleted) return;
    const session = { id: state.currentAppointment.id, appointment: state.currentAppointment, prescription: state.prescription.slice(), diagnosis: $('#diagnosisInput')?.value || '', loadedTemplateId: state.loadedTemplateId, loadedTemplateName: state.loadedTemplateName, updatedAt: new Date().toISOString() }; 
    sessionDB.save(session).catch(() => {}); 
    state.activeSessionId = session.id; 
}

async function restoreSession() { 
    const sessions = await sessionDB.getAll(); 
    if (sessions.length === 0) return false; 
    const s = sessions[0]; 
    state.currentAppointment = s.appointment; 
    state.prescription = s.prescription || []; 
    state.loadedTemplateId = s.loadedTemplateId || null; 
    state.loadedTemplateName = s.loadedTemplateName || null; 
    state.activeSessionId = s.id; 
    state.isEditingCompleted = false;
    state.editingCompletedRxId = null;
    const diagInput = $('#diagnosisInput'); 
    if (diagInput) diagInput.value = s.diagnosis || ''; 
    return true; 
}

async function deleteSession(id) { 
    await sessionDB.delete(id); 
    if (state.activeSessionId === id) state.activeSessionId = null; 
}

function renderSidebar() {
    const currentPatients = state.appointments.filter(a => a.status === 'قيد الكشف');
    const waitingPatients = state.appointments.filter(a => a.status === 'انتظار');
    const donePatients = state.appointments.filter(a => a.status === 'منتهي');
    $('#currentCount').textContent = currentPatients.length;
    $('#waitingCount').textContent = waitingPatients.length;
    $('#doneCount').textContent = donePatients.length;
    renderPatientList('currentPatientsList', currentPatients, false);
    renderPatientList('waitingPatientsList', waitingPatients, false);
    renderPatientList('donePatientsList', donePatients, true);
}

function renderPatientList(containerId, patients, isDone) {
    const container = $('#' + containerId);
    if (!container) return;
    if (patients.length === 0) { 
        const label = containerId.includes('current') ? 'جاري كشفهم' : containerId.includes('waiting') ? 'منتظرين' : 'منتهين'; 
        container.innerHTML = `<div class="empty-queue">لا يوجد مرضى ${label}</div>`; 
        return; 
    }
    container.innerHTML = patients.map(apt => { 
        let cls = 'mini-queue-item'; 
        if (isDone) cls += ' done'; 
        if (state.currentAppointment && apt.id === state.currentAppointment.id && !isDone) cls += ' current'; 
        const name = getPatientName(apt); 
        const statusIcon = apt.status === 'منتهي' ? '✅' : apt.status === 'قيد الكشف' ? '🩺' : '⏳';
        return `<div class="${cls}" data-id="${apt.id}"><div style="display:flex;justify-content:space-between;align-items:center;"><div><b>${esc(name)}</b><div style="font-size:0.7rem;color:var(--text-sec);">${apt.time||''} · ${apt.age||'--'} سنة</div></div><span class="patient-status-icon">${statusIcon}</span></div></div>`; 
    }).join('');
}

function updateQueueCount() {
    const waiting = state.appointments.filter(a => a.status === 'انتظار').length;
    const currentCount = state.appointments.filter(a => a.status === 'قيد الكشف').length;
    const doneCount = state.appointments.filter(a => a.status === 'منتهي').length;
    $('#currentCount').textContent = currentCount;
    $('#waitingCount').textContent = waiting;
    $('#doneCount').textContent = doneCount;
}

async function selectPatient(appointmentId) {
    const apt = state.appointments.find(a => a.id === appointmentId);
    if (!apt) return;
    
    if (apt.status === 'منتهي') {
        await openCompletedPrescriptionForEditing(apt);
        return;
    }
    
    if (apt.status === 'انتظار') { 
        await update(ref(db, `tenants/${currentTenantId}/appointments/${appointmentId}`), { status: 'قيد الكشف' }); 
    }
    state.currentAppointment = apt; 
    state.prescription = []; 
    state.diagnosis = ''; 
    state.loadedTemplateId = null; 
    state.loadedTemplateName = null;
    state.isEditingCompleted = false;
    state.editingCompletedRxId = null;
    const diagInput = $('#diagnosisInput'); 
    if (diagInput) diagInput.value = '';
    
    const patientId = apt.patient_id || apt.patientId;
    state.previousRecordsCount = await fetchPreviousRecordsCount(patientId);
    
    updateWorkspace(); 
    await saveSessionToDB();
}

async function openCompletedPrescriptionForEditing(apt) {
    try {
        const prescriptionSnap = await get(ref(db, `tenants/${currentTenantId}/prescriptions/${apt.id}`));
        const itemsSnap = await get(ref(db, `tenants/${currentTenantId}/prescription_items/${apt.id}`));
        
        let diagnosis = '';
        let items = [];
        
        if (prescriptionSnap.exists()) {
            const rx = prescriptionSnap.val();
            diagnosis = rx.diagnosis || '';
        }
        
        if (itemsSnap.exists()) {
            items = Object.values(itemsSnap.val()).map(it => ({
                drug: it.drug_name || it.drug_id || '',
                form: it.form || 'tablet',
                dose: it.dose || ''
            }));
        }
        
        state.isEditingCompleted = true;
        state.editingCompletedRxId = apt.id;
        state.currentAppointment = apt;
        state.prescription = items;
        state.loadedTemplateId = null;
        state.loadedTemplateName = null;
        
        const patientId = apt.patient_id || apt.patientId;
        state.previousRecordsCount = await fetchPreviousRecordsCount(patientId);
        
        const diagInput = $('#diagnosisInput');
        if (diagInput) diagInput.value = diagnosis;
        
        updateWorkspace();
        toast('📝 يمكنك الآن تعديل الوصفة المنتهية');
    } catch (err) {
        console.error('خطأ في فتح الوصفة المنتهية:', err);
        toast('خطأ في تحميل الوصفة', true);
    }
}

async function saveCompletedPrescriptionEdit() {
    if (!state.isEditingCompleted || !state.editingCompletedRxId) return;
    
    const diagnosis = $('#diagnosisInput').value.trim();
    const items = state.prescription.filter(it => it.drug.trim() !== '');
    
    if (items.length === 0 && !diagnosis) {
        toast('لا توجد بيانات لحفظها', true);
        return;
    }
    
    try {
        const now = new Date().toISOString();
        const updates = {};
        
        updates[`tenants/${currentTenantId}/prescriptions/${state.editingCompletedRxId}/diagnosis`] = diagnosis;
        updates[`tenants/${currentTenantId}/prescriptions/${state.editingCompletedRxId}/item_count`] = items.length;
        updates[`tenants/${currentTenantId}/prescriptions/${state.editingCompletedRxId}/updated_at`] = now;
        updates[`tenants/${currentTenantId}/prescriptions/${state.editingCompletedRxId}/last_edited_by`] = state.user.uid;
        updates[`tenants/${currentTenantId}/prescriptions/${state.editingCompletedRxId}/last_edited_at`] = now;
        
        const oldItemsSnap = await get(ref(db, `tenants/${currentTenantId}/prescription_items/${state.editingCompletedRxId}`));
        if (oldItemsSnap.exists()) {
            Object.keys(oldItemsSnap.val()).forEach(key => {
                updates[`tenants/${currentTenantId}/prescription_items/${state.editingCompletedRxId}/${key}`] = null;
            });
        }
        
        items.forEach((item, i) => {
            updates[`tenants/${currentTenantId}/prescription_items/${state.editingCompletedRxId}/item_${i}`] = {
                drug_name: item.drug,
                dose: item.dose,
                form: item.form
            };
        });
        
        await update(ref(db), updates);
        
        items.forEach(item => {
            const strength = extractStrength(item.drug);
            const pureName = strength ? item.drug.replace(strength, '').trim() : item.drug;
            drugManager.recordUsage(item.drug, pureName, item.form, strength);
        });
        
        state.isEditingCompleted = false;
        state.editingCompletedRxId = null;
        state.currentAppointment = null;
        state.prescription = [];
        state.previousRecordsCount = 0;
        
        const diagInput = $('#diagnosisInput');
        if (diagInput) diagInput.value = '';
        
        updateWorkspace();
        toast('✅ تم حفظ تعديلات الوصفة بنجاح');
    } catch (err) {
        console.error('خطأ في حفظ تعديلات الوصفة:', err);
        toast('خطأ في حفظ التعديلات: ' + err.message, true);
    }
}

function cancelCompletedEdit() {
    state.isEditingCompleted = false;
    state.editingCompletedRxId = null;
    state.currentAppointment = null;
    state.prescription = [];
    state.previousRecordsCount = 0;
    
    const diagInput = $('#diagnosisInput');
    if (diagInput) diagInput.value = '';
    
    updateWorkspace();
    toast('تم إلغاء تعديل الوصفة');
}

function updateWorkspace() {
    if (!state.currentAppointment) { 
        $('#noPatientSelected').style.display = 'block'; 
        $('#patientWorkspace').style.display = 'none'; 
        $('#loadedTemplateInfo').style.display = 'none';
        $('#editModeInfo').style.display = 'none';
        $('#workspace').classList.remove('editing-completed');
        $('#recordCountBadge').style.display = 'none';
        return; 
    }
    
    $('#noPatientSelected').style.display = 'none'; 
    $('#patientWorkspace').style.display = 'block';
    
    const apt = state.currentAppointment; 
    const name = getPatientName(apt);
    $('#patientNameDisplay').textContent = name;
    $('#patientMeta').textContent = `${apt.time||''} · ${apt.age||'--'} سنة · ${apt.phone||''}`;
    $('#patientAvatar').textContent = name.charAt(0).toUpperCase();
    
    if (state.previousRecordsCount > 0) {
        $('#recordCountBadge').textContent = state.previousRecordsCount;
        $('#recordCountBadge').style.display = 'inline-flex';
    } else {
        $('#recordCountBadge').style.display = 'none';
    }
    
    if (state.isEditingCompleted) {
        $('#workspace').classList.add('editing-completed');
        $('#finishSessionBtn').style.display = 'none';
        $('#saveCompletedEditBtn').style.display = 'flex';
        $('#cancelEditCompletedBtn').style.display = 'inline-flex';
        $('#saveAsTemplateBtn').style.display = 'inline-flex';
        $('#loadedTemplateInfo').style.display = 'none';
        $('#editModeInfo').textContent = '⚠️ وضع تعديل وصفة منتهية - التغييرات ستحفظ في نفس الوصفة';
        $('#editModeInfo').style.display = 'block';
        $('#patientStatusBadge').innerHTML = '<span class="prescription-status-badge status-pending">📋 وصفة منتهية</span>';
        $('#patientStatusBadge').style.display = 'inline-flex';
    } else {
        $('#workspace').classList.remove('editing-completed');
        $('#finishSessionBtn').style.display = 'flex';
        $('#saveCompletedEditBtn').style.display = 'none';
        $('#cancelEditCompletedBtn').style.display = 'none';
        $('#saveAsTemplateBtn').style.display = 'inline-flex';
        $('#editModeInfo').style.display = 'none';
        $('#patientStatusBadge').style.display = 'none';
        
        if (state.loadedTemplateId && state.loadedTemplateName) {
            $('#loadedTemplateInfo').textContent = `📋 القالب المحمل: ${state.loadedTemplateName}`;
            $('#loadedTemplateInfo').style.display = 'block';
        } else {
            $('#loadedTemplateInfo').style.display = 'none';
        }
    }
    
    renderRxList(); 
    renderSidebar();
}

function renderRxList() {
    const container = $('#rxItemsContainer'); 
    const count = state.prescription.length;
    $('#rxCount').textContent = count > 0 ? `(${count} أدوية)` : '';
    if (count === 0) { 
        container.innerHTML = '<span style="color:var(--text-sec);font-size:0.82rem;">لم تُضف أدوية بعد</span>'; 
        return; 
    }
    container.innerHTML = state.prescription.map((item, i) => `<span class="rx-chip"><span class="drug-name">${esc(item.drug)}</span><span style="font-size:0.7rem;color:var(--text-sec);">${esc(item.form==='tablet'?'أقراص':item.form==='syrup'?'شراب':item.form==='injection'?'حقن':item.form==='suppository'?'لبوس':'نقط')}</span><span class="drug-dose">${esc(item.dose)}</span><button class="remove-chip" data-index="${i}" title="حذف" aria-label="حذف الدواء">&times;</button></span>`).join('');
}

const quickAdd = {
    addDrug() {
        const drugInput = $('#drugSearchInput'); const drugName = drugInput.value.trim();
        const form = $('#drugFormSelect').value; const doseInput = $('#doseInput'); const dose = doseInput.value.trim();
        if (!drugName) { toast('أدخل اسم الدواء', true); drugInput.focus(); return; }
        if (!dose) { toast('أدخل الجرعة', true); doseInput.focus(); return; }
        const strength = extractStrength(drugName); const pureName = strength ? drugName.replace(strength, '').trim() : drugName;
        const freqMatch = dose.match(/كل\s+(\d+)\s*ساعة|مرة\s*واحدة|يومياً|عند\s*اللزوم/); const freqLabel = freqMatch ? freqMatch[0] : '';
        state.prescription.push({ drug: drugName, form: form, dose });
        drugManager.recordUsage(drugName, pureName, form, strength);
        if (freqLabel) doseManager.recordUsage(drugName, form, dose, freqLabel);
        drugInput.value = ''; doseInput.value = ''; drugInput.focus();
        renderRxList(); 
        saveSessionToDB();
    }
};

async function checkTemplateNameExists(name) {
    if (!state.user) return false;
    const snap = await get(ref(db, `tenants/${currentTenantId}/prescription_templates/${state.user.uid}`));
    if (!snap.exists()) return false;
    const templates = snap.val();
    const nameLower = name.trim().toLowerCase();
    return Object.values(templates).some(t => (t.name || '').toLowerCase() === nameLower);
}

async function saveAsNewTemplate() {
    const nameInput = $('#newTemplateNameInput');
    const nameError = $('#templateNameError');
    const templateName = nameInput.value.trim();
    
    if (!templateName) {
        nameError.textContent = 'الرجاء إدخال اسم للقالب';
        nameError.style.display = 'block';
        nameInput.focus();
        return;
    }
    
    const exists = await checkTemplateNameExists(templateName);
    if (exists) {
        nameError.textContent = '⚠️ يوجد قالب بنفس الاسم. الرجاء اختيار اسم آخر.';
        nameError.style.display = 'block';
        nameInput.focus();
        return;
    }
    
    try {
        const diagnosis = $('#diagnosisInput').value.trim();
        const now = new Date().toISOString();
        const templateId = push(ref(db, `tenants/${currentTenantId}/prescription_templates/${state.user.uid}`)).key;
        
        const templateData = {
            name: templateName,
            diagnosis: diagnosis,
            doctor_id: state.user.uid,
            created_at: now,
            itemCount: state.prescription.length,
            tenantId: currentTenantId
        };
        
        const updates = {};
        updates[`tenants/${currentTenantId}/prescription_templates/${state.user.uid}/${templateId}`] = templateData;
        state.prescription.forEach((item, i) => {
            updates[`tenants/${currentTenantId}/template_items/${templateId}/item_${i}`] = {
                drug_name: item.drug,
                form: item.form,
                dose: item.dose
            };
        });
        
        await update(ref(db), updates);
        
        state.loadedTemplateId = templateId;
        state.loadedTemplateName = templateName;
        updateWorkspace();
        
        $('#saveNewTemplateModal').style.display = 'none';
        toast(`✅ تم حفظ القالب "${templateName}" بنجاح`);
    } catch (err) {
        console.error('خطأ في حفظ القالب:', err);
        toast('خطأ في حفظ القالب', true);
    }
}

function openSaveNewTemplateModal() {
    const diagnosis = $('#diagnosisInput').value.trim();
    if (state.prescription.length === 0 && !diagnosis) {
        toast('لا توجد بيانات لحفظها. أضف أدوية أو تشخيص أولاً.', true);
        return;
    }
    
    $('#newTemplateNameInput').value = '';
    $('#templateNameError').style.display = 'none';
    $('#saveNewTemplateModal').style.display = 'flex';
    setTimeout(() => $('#newTemplateNameInput').focus(), 100);
}

// ============================================================
// ✅✅✅ دالة فتح سجل المريض - عام لكل المجمعات ✅✅✅
// ============================================================
async function openPatientFile() {
    const pid = state.currentAppointment?.patient_id || state.currentAppointment?.patientId;
    if (!pid) { toast('لا يوجد ملف للمريض', true); return; }
    
    const modal = $('#patientFileModal'); 
    const content = $('#patientFileContent');
    modal.style.display = 'flex'; 
    content.innerHTML = '<div style="text-align:center;padding:30px;"><div class="loader-circle"></div></div>';
    
    try {
        // ✅ 1. نجيب بيانات المريض من المجمع الحالي
        const patientSnap = await get(ref(db, `tenants/${currentTenantId}/patients/${pid}`));
        const patient = patientSnap.exists() ? patientSnap.val() : {}; 
        const patientName = patient.name || 'غير معروف';
        
        // ✅ 2. نجيب كل المجمعات اللي موجودة في tenants
        const tenantsSnap = await get(ref(db, 'tenants'));
        const tenants = tenantsSnap.exists() ? Object.keys(tenantsSnap.val()) : [];
        
        // ✅ 3. نبحث عن وصفات المريض في كل المجمعات
        const patientRx = [];
        const doctorsCache = {}; // caching doctor names
        
        for (const tenantId of tenants) {
            try {
                const prescriptionsSnap = await get(ref(db, `tenants/${tenantId}/prescriptions`));
                if (!prescriptionsSnap.exists()) continue;
                
                const rxPromises = [];
                
                prescriptionsSnap.forEach(child => {
                    const rx = child.val();
                    if (String(rx.patient_id) === String(pid)) {
                        const isSameTenant = (tenantId === currentTenantId);
                        
                        rxPromises.push((async () => {
                            // نجيب الأدوية
                            const itemsSnap = await get(ref(db, `tenants/${tenantId}/prescription_items/${child.key}`));
                            let items = [];
                            if (itemsSnap.exists()) {
                                items = Object.values(itemsSnap.val()).map(it => ({
                                    drug: it.drug_name || it.drug_id || '',
                                    form: it.form || 'tablet',
                                    dose: it.dose || ''
                                }));
                            }
                            
                            // ✅ تحديد اسم الدكتور حسب المجمع:
                            let doctorDisplayName;
                            if (isSameTenant) {
                                // نفس المجمع: نعرض اسم الدكتور
                                doctorDisplayName = rx.doctor_name || 'طبيب';
                                
                                // لو عايزين نجيب الاسم من users لو مش موجود
                                if (rx.doctor_id && (!rx.doctor_name || rx.doctor_name === 'طبيب')) {
                                    if (!doctorsCache[rx.doctor_id]) {
                                        try {
                                            const docSnap = await get(ref(db, `tenants/${tenantId}/users/${rx.doctor_id}`));
                                            doctorsCache[rx.doctor_id] = docSnap.exists() ? (docSnap.val().name || 'طبيب') : 'طبيب';
                                        } catch(e) { doctorsCache[rx.doctor_id] = 'طبيب'; }
                                    }
                                    doctorDisplayName = doctorsCache[rx.doctor_id];
                                }
                            } else {
                                // مجمع تاني: نخفي اسم الدكتور
                                doctorDisplayName = null; // null معناه إننا هنخفي الاسم
                            }
                            
                            patientRx.push({
                                id: child.key,
                                tenantId: tenantId,
                                data: rx,
                                items,
                                isSameTenant,
                                doctorDisplayName
                            });
                        })());
                    }
                });
                
                await Promise.all(rxPromises);
                
            } catch(e) {
                console.warn(`تعذر قراءة وصفات من المجمع ${tenantId}:`, e.message);
            }
        }
        
        // ✅ 4. ترتيب الوصفات من الأحدث للأقدم
        patientRx.sort((a, b) => (b.data.created_at || '').localeCompare(a.data.created_at || ''));
        const totalRx = patientRx.length;
        
        // ✅ 5. بناء HTML العرض
        let html = `<div style="margin-bottom:20px;">
            <h4>📁 ${esc(patientName)} - ${totalRx} وصفات (كل المجمعات)</h4>
            <div style="font-size:0.75rem;color:var(--text-sec);">
                🏥 السجل موحد من كل الفروع | 👨‍⚕️ اسم الدكتور يظهر فقط من نفس المجمع
            </div>
        </div>`;
        
        if (patientRx.length === 0) { 
            html += '<div style="text-align:center;padding:20px;color:var(--text-sec);">لا توجد وصفات مسجلة لهذا المريض</div>'; 
        } else {
            for (const r of patientRx) {
                const rx = r.data;
                
                // ✅ صياغة التاريخ
                const dateStr = rx.created_at 
                    ? new Date(rx.created_at).toLocaleDateString('ar-EG', { 
                        year: 'numeric', month: 'long', day: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      }) 
                    : '—';
                
                // ✅ حالة الصرف
                const statusBadge = rx.status === 'تم الصرف' 
                    ? '<span class="prescription-status-badge status-dispensed">✅ تم الصرف</span>' 
                    : rx.status === 'صرفت جزئياً' 
                        ? '<span class="prescription-status-badge status-partial">📦 جزئي</span>' 
                        : '<span class="prescription-status-badge status-pending">⏳ لم تصرف</span>';
                
                // ✅ اسم الدكتور: يظهر بس لو من نفس المجمع
                const doctorInfo = r.isSameTenant && r.doctorDisplayName
                    ? `<span style="color:var(--accent);font-weight:600;">👨‍⚕️ د. ${esc(r.doctorDisplayName)}</span>`
                    : `<span style="color:var(--text-sec);font-style:italic;">👨‍⚕️ مجمع آخر</span>`;
                
                // ✅ الأدوية
                let drugsHtml = '';
                if (r.items && r.items.length > 0) {
                    drugsHtml = '<div class="prescription-history-drugs">' + 
                        r.items.map(item => {
                            const formEmoji = item.form === 'tablet' ? '💊' : item.form === 'syrup' ? '🥄' : item.form === 'injection' ? '💉' : item.form === 'suppository' ? '🧴' : '💧';
                            return `<span class="drug-mini-tag">${formEmoji} ${esc(item.drug)} <span class="tag-dose">${esc(item.dose)}</span></span>`;
                        }).join('') + 
                        '</div>';
                }
                
                // ✅ التشخيص (أول 80 حرف)
                const diagnosisPreview = rx.diagnosis 
                    ? esc(rx.diagnosis).substring(0, 80) + (rx.diagnosis.length > 80 ? '...' : '') 
                    : 'بدون تشخيص';
                
                html += `
                    <div class="prescription-history-item" data-rx-id="${r.id}" data-tenant="${r.tenantId}">
                        <div class="prescription-history-header">
                            <div style="flex:1;min-width:200px;">
                                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                    ${statusBadge}
                                    ${doctorInfo}
                                </div>
                                <div style="margin-top:6px;">
                                    <b>📅 ${dateStr}</b>
                                </div>
                                <div style="color:var(--text-sec);font-size:0.8rem;margin-top:4px;">
                                    ${diagnosisPreview}
                                </div>
                            </div>
                            ${r.isSameTenant ? `
                            <button class="btn btn-info btn-sm restore-prescription-btn" data-rx-id="${r.id}" data-tenant="${r.tenantId}" style="white-space:nowrap;">
                                <i class="fas fa-undo"></i> استرداد
                            </button>
                            ` : `
                            <span style="font-size:0.7rem;color:var(--text-sec);">🔒 للعرض فقط</span>
                            `}
                        </div>
                        ${drugsHtml}
                    </div>
                `;
            }
        }
        
        content.innerHTML = html;
        
        // ✅ 6. ربط زرار الاسترداد (للوصفات من نفس المجمع فقط)
        content.querySelectorAll('.restore-prescription-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const rxId = btn.dataset.rxId;
                const rxTenant = btn.dataset.tenant;
                
                // نتأكد إن الوصفة من نفس المجمع
                if (rxTenant !== currentTenantId) {
                    toast('لا يمكن استرداد وصفة من مجمع آخر', true);
                    return;
                }
                
                await restorePrescription(rxId);
            });
        });
        
    } catch (err) { 
        console.error('خطأ في تحميل سجل المريض:', err);
        content.innerHTML = '<div style="color:var(--danger);text-align:center;padding:20px;">❌ خطأ في تحميل الملف الطبي</div>'; 
    }
}

async function handleFinishSession() {
    if (!state.currentAppointment || state.isEditingCompleted) return;
    const diagnosis = $('#diagnosisInput').value.trim();
    if (state.prescription.length === 0 && !diagnosis) { toast('أضف أدوية أو تشخيص', true); return; }
    
    if (state.loadedTemplateId && state.loadedTemplateName) {
        const currentRx = JSON.stringify(state.prescription);
        const templateSnap = await get(ref(db, `tenants/${currentTenantId}/prescription_templates/${state.user.uid}/${state.loadedTemplateId}`));
        if (templateSnap.exists()) {
            const itemsSnap = await get(ref(db, `tenants/${currentTenantId}/template_items/${state.loadedTemplateId}`));
            let origItems = []; 
            if (itemsSnap.exists()) { origItems = Object.values(itemsSnap.val()).map(it => ({ drug: it.drug_name || it.drug_id, form: it.form, dose: it.dose })); }
            const currentDx = $('#diagnosisInput').value.trim();
            if (currentRx !== JSON.stringify(origItems) || currentDx !== (templateSnap.val().diagnosis || '')) { 
                state._pendingFinish = true; 
                $('#saveTemplateMsg').textContent = `القالب "${state.loadedTemplateName}" تم تعديله. هل تريد حفظ التغييرات؟`; 
                $('#saveTemplateTitle').innerHTML = '<i class="fas fa-save"></i> تحديث القالب'; 
                $('#templateNameInput').value = state.loadedTemplateName; 
                $('#saveTemplateModal').style.display = 'flex'; 
                return; 
            }
        }
    }
    await finalizeSession(false, null, null);
}

async function handleSaveAsNew() { 
    const name = $('#templateNameInput').value.trim() || state.loadedTemplateName || 'قالب جديد'; 
    await finalizeSession(true, name, 'new'); 
    $('#saveTemplateModal').style.display = 'none'; 
}

async function handleUpdateExisting() { 
    const name = $('#templateNameInput').value.trim() || state.loadedTemplateName; 
    await finalizeSession(true, name, 'update'); 
    $('#saveTemplateModal').style.display = 'none'; 
}

async function handleSkipSave() { 
    await finalizeSession(false, null, null); 
    $('#saveTemplateModal').style.display = 'none'; 
}

async function handleTemplates() {
    const snap = await get(ref(db, `tenants/${currentTenantId}/prescription_templates/${state.user.uid}`)); 
    const list = $('#templatesList');
    if (!snap.exists()) { list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-sec);">لا توجد قوالب</div>'; }
    else { 
        const templates = snap.val(); 
        list.innerHTML = Object.entries(templates).map(([id, t]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid var(--border);"><div><b>${esc(t.name)}</b><div>${t.itemCount||0} أدوية</div></div><button class="btn btn-primary btn-sm load-template-btn" data-id="${id}" data-name="${esc(t.name)}">تحميل</button></div>`).join(''); 
        list.querySelectorAll('.load-template-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                loadTemplate(btn.dataset.id, btn.dataset.name);
                $('#templatesModal').style.display = 'none';
            });
        });
    }
    $('#templatesModal').style.display = 'flex';
}

async function handleSessions() {
    const sessions = await sessionDB.getAll(); 
    const list = $('#sessionsList');
    if (sessions.length === 0) { list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-sec);">لا توجد جلسات معلقة</div>'; }
    else { 
        list.innerHTML = sessions.map(s => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid var(--border);"><div><b>${esc(getPatientName(s.appointment))}</b><div>${s.prescription.length} أدوية</div></div><div style="display:flex;gap:4px;"><button class="btn btn-primary btn-sm restore-session-btn" data-id="${s.id}">استكمال</button><button class="btn btn-outline btn-sm delete-session-btn" data-id="${s.id}"><i class="fas fa-trash"></i></button></div></div>`).join(''); 
        list.querySelectorAll('.restore-session-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const sessionId = btn.dataset.id;
                const sessions = await sessionDB.getAll();
                const session = sessions.find(s => s.id === sessionId);
                if (session) {
                    state.currentAppointment = session.appointment;
                    state.prescription = session.prescription || [];
                    state.loadedTemplateId = session.loadedTemplateId || null;
                    state.loadedTemplateName = session.loadedTemplateName || null;
                    state.activeSessionId = session.id;
                    state.isEditingCompleted = false;
                    state.editingCompletedRxId = null;
                    const patientId = session.appointment.patient_id || session.appointment.patientId;
                    state.previousRecordsCount = await fetchPreviousRecordsCount(patientId);
                    const diagInput = $('#diagnosisInput');
                    if (diagInput) diagInput.value = session.diagnosis || '';
                    updateWorkspace();
                    $('#sessionsModal').style.display = 'none';
                    toast('🔄 تم استكمال الجلسة');
                }
            });
        });
        list.querySelectorAll('.delete-session-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const sessionId = btn.dataset.id;
                await deleteSession(sessionId);
                toast('🗑️ تم حذف الجلسة المعلقة');
                handleSessions();
            });
        });
    }
    $('#sessionsModal').style.display = 'flex';
}

async function loadTemplate(templateId, templateName) {
    if (state.isEditingCompleted) {
        toast('لا يمكن تحميل قالب أثناء تعديل وصفة منتهية', true);
        return;
    }
    
    const snap = await get(ref(db, `tenants/${currentTenantId}/template_items/${templateId}`)); 
    state.prescription = [];
    if (snap.exists()) { state.prescription = Object.values(snap.val()).map(it => ({ drug: it.drug_name || it.drug_id, form: it.form, dose: it.dose })); }
    const templateSnap = await get(ref(db, `tenants/${currentTenantId}/prescription_templates/${state.user.uid}/${templateId}`));
    if (templateSnap.exists() && templateSnap.val().diagnosis) { 
        const diagInput = $('#diagnosisInput'); 
        if (diagInput) diagInput.value = templateSnap.val().diagnosis; 
    }
    state.loadedTemplateId = templateId; 
    state.loadedTemplateName = templateName;
    state.prescription.forEach(item => { 
        const strength = extractStrength(item.drug); 
        const pureName = strength ? item.drug.replace(strength, '').trim() : item.drug; 
        drugManager.recordUsage(item.drug, pureName, item.form, strength); 
    });
    renderRxList(); 
    updateWorkspace();
    saveSessionToDB(); 
    toast(`📋 تم تحميل القالب: ${templateName}`);
}

async function finalizeSession(saveTemplate, templateName, templateAction) {
    const apt = state.currentAppointment; 
    const diagnosis = $('#diagnosisInput').value.trim(); 
    const prescriptionId = apt.id;
    try {
        const now = new Date().toISOString();
        
        if (saveTemplate && templateName) { 
            let templateId = state.loadedTemplateId; 
            if (templateAction === 'new' || !templateId) templateId = push(ref(db, `tenants/${currentTenantId}/prescription_templates/${state.user.uid}`)).key; 
            const templateData = { name: templateName, diagnosis, doctor_id: state.user.uid, created_at: now, itemCount: state.prescription.length, tenantId: currentTenantId }; 
            const updates = {}; 
            updates[`tenants/${currentTenantId}/prescription_templates/${state.user.uid}/${templateId}`] = templateData; 
            state.prescription.forEach((item, i) => { updates[`tenants/${currentTenantId}/template_items/${templateId}/item_${i}`] = { drug_name: item.drug, form: item.form, dose: item.dose }; }); 
            await update(ref(db), updates); 
        }
        
        const prescriptionData = { 
            patient_id: apt.patient_id || apt.patientId || '', 
            patient_name: getPatientName(apt), 
            doctor_id: state.user.uid,
            doctor_name: state.user.name || 'طبيب',
            diagnosis, 
            created_at: now, 
            status: 'لم تصرف بعد',
            item_count: state.prescription.length,
            tenantId: currentTenantId
        };
        
        const finalUpdates = {}; 
        finalUpdates[`tenants/${currentTenantId}/prescriptions/${prescriptionId}`] = prescriptionData;
        state.prescription.forEach((item, i) => { 
            finalUpdates[`tenants/${currentTenantId}/prescription_items/${prescriptionId}/item_${i}`] = { 
                drug_name: item.drug, 
                dose: item.dose, 
                form: item.form 
            }; 
        });
        finalUpdates[`tenants/${currentTenantId}/appointments/${apt.id}/status`] = 'منتهي';
        
        await update(ref(db), finalUpdates);
        await deleteSession(apt.id);
        
        // ✅ تتبع الأدوية الموصوفة للسحابة
        if (state.user && state.user.uid) {
            const doctorName = state.user.name || 'طبيب';
            const uniqueDrugs = [...new Set(state.prescription.map(p => p.drug))];
            
            for (const drugName of uniqueDrugs) {
                await prescriptionTracker.trackDrugPrescription(
                    drugName,
                    state.user.uid,
                    doctorName
                );
            }
            console.log(`📊 تم تتبع ${uniqueDrugs.length} دواء في نظام المراقبة`);
        }
        
        state.currentAppointment = null; 
        state.prescription = []; 
        state.diagnosis = ''; 
        state.loadedTemplateId = null; 
        state.loadedTemplateName = null;
        state.isEditingCompleted = false;
        state.editingCompletedRxId = null;
        state.previousRecordsCount = 0;
        const diagInput = $('#diagnosisInput'); 
        if (diagInput) diagInput.value = '';
        updateWorkspace(); 
        toast('✅ تم إنهاء الكشف وإرسال الوصفة للصيدلية');
    } catch (err) { 
        console.error(err); 
        toast('خطأ في حفظ الوصفة: '+err.message, true); 
    }
}

const setupEventListeners = () => {
    $('#queueTabs').addEventListener('click', (e) => {
        const tab = e.target.closest('.queue-tab');
        if (!tab) return;
        const tabName = tab.dataset.tab;
        state.currentTab = tabName;
        $$('.queue-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        $$('.tab-content').forEach(c => c.classList.remove('active'));
        const contentMap = { current: 'tabCurrent', waiting: 'tabWaiting', done: 'tabDone' };
        const targetContent = $('#' + contentMap[tabName]);
        if (targetContent) targetContent.classList.add('active');
        updateQueueCount();
    });
    
    ['currentPatientsList', 'waitingPatientsList', 'donePatientsList'].forEach(id => {
        const container = $('#' + id);
        if (container) {
            container.addEventListener('click', (e) => {
                const item = e.target.closest('.mini-queue-item');
                if (item) selectPatient(item.dataset.id);
            });
        }
    });
    
    $('#addDrugBtn').addEventListener('click', () => quickAdd.addDrug());
    $('#doseInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); quickAdd.addDrug(); } });
    
    $('#rxItemsContainer').addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.remove-chip');
        if (!removeBtn) return;
        const index = parseInt(removeBtn.dataset.index);
        state.prescription.splice(index, 1);
        renderRxList();
        saveSessionToDB();
    });
    
    let doseTimer;
    $('#doseInput').addEventListener('input', () => {
        const val = $('#doseInput').value.trim();
        clearTimeout(doseTimer);
        if (val.length < 1) { $('#doseSuggestions').style.display = 'none'; return; }
        doseTimer = setTimeout(async () => {
            const form = $('#drugFormSelect').value;
            const drugName = $('#drugSearchInput').value.trim();
            const suggestions = await doseManager.getSuggestions(val, form, drugName || null);
            const dd = $('#doseSuggestions');
            if (suggestions.length === 0) { dd.style.display = 'none'; return; }
            dd.innerHTML = suggestions.map(s => `<div class="dose-suggestion-item${s.source==='favorite'?' favorite-dose':''}" data-dose="${esc(s.dose)}" data-freq="${esc(s.freq||'')}"><span>${esc(s.label)}</span><span class="freq-badge">${esc(s.freq||'')}</span></div>`).join('');
            dd.style.display = 'block';
            dd.querySelectorAll('.dose-suggestion-item').forEach(item => {
                item.addEventListener('click', () => {
                    const doseEl = $('#doseInput');
                    doseEl.value = `${item.dataset.dose} - ${item.dataset.freq}`;
                    dd.style.display = 'none';
                    doseEl.focus();
                });
            });
        }, 150);
    });

    document.addEventListener('click', (e) => { 
        if (!$('#doseInput').contains(e.target) && !$('#doseSuggestions').contains(e.target)) { 
            $('#doseSuggestions').style.display = 'none'; 
        } 
    });

    let searchTimer;
    $('#drugSearchInput').addEventListener('input', () => {
        const term = $('#drugSearchInput').value.trim();
        clearTimeout(searchTimer);
        if (term.length < 1) { $('#drugSuggestions').style.display = 'none'; return; }
        searchTimer = setTimeout(async () => {
            const results = await drugManager.getSuggestions(term, null);
            const dd = $('#drugSuggestions');
            if (results.length === 0) { 
                dd.innerHTML = `<div class="suggestion-item" id="createNewDrug" style="color:var(--accent);">➕ إضافة "${esc(term)}" كدواء جديد</div>`; 
                dd.style.display = 'block'; 
                const createBtn = $('#createNewDrug');
                if (createBtn) {
                    createBtn.addEventListener('click', () => {
                        $('#drugSearchInput').value = term;
                        $('#drugSuggestions').style.display = 'none';
                        $('#doseInput').focus();
                    });
                }
            } else {
                dd.innerHTML = results.map(d => `<div class="suggestion-item" data-name="${esc(d.name)}" data-form="${d.form || 'tablet'}"><div class="suggestion-content">${esc(d.name)} <span class="usage-count">${d.freq||0}x</span></div><button class="hide-suggestion-btn" data-fullname="${esc(d.name)}" data-name="${esc(d.originalName||d.name)}" data-form="${d.form || 'tablet'}">×</button></div>`).join('');
                dd.style.display = 'block';
                dd.querySelectorAll('.suggestion-item').forEach(item => {
                    item.addEventListener('click', (e) => {
                        if (e.target.closest('.hide-suggestion-btn')) return;
                        $('#drugSearchInput').value = item.dataset.name;
                        if (item.dataset.form && item.dataset.form !== 'tablet') {
                            $('#drugFormSelect').value = item.dataset.form;
                        }
                        $('#drugSuggestions').style.display = 'none';
                        $('#doseInput').focus();
                    });
                });
                dd.querySelectorAll('.hide-suggestion-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        drugManager.hideSuggestion(btn.dataset.fullname, btn.dataset.name, btn.dataset.form);
                        $('#drugSuggestions').style.display = 'none';
                    });
                });
            }
        }, 200);
    });

    $('#saveAsTemplateBtn').addEventListener('click', openSaveNewTemplateModal);
    
    $('#closeSaveNewTemplateBtn').addEventListener('click', () => $('#saveNewTemplateModal').style.display = 'none');
    $('#cancelSaveNewTemplateBtn').addEventListener('click', () => $('#saveNewTemplateModal').style.display = 'none');
    $('#confirmSaveNewTemplateBtn').addEventListener('click', saveAsNewTemplate);
    $('#newTemplateNameInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveAsNewTemplate();
        }
    });
    
    $('#newTemplateNameInput').addEventListener('input', () => {
        $('#templateNameError').style.display = 'none';
    });

    $('#saveCompletedEditBtn').addEventListener('click', saveCompletedPrescriptionEdit);
    $('#cancelEditCompletedBtn').addEventListener('click', cancelCompletedEdit);

    $('#finishSessionBtn').addEventListener('click', handleFinishSession);
    $('#saveAsNewBtn').addEventListener('click', handleSaveAsNew);
    $('#updateExistingBtn').addEventListener('click', handleUpdateExisting);
    $('#skipSaveBtn').addEventListener('click', handleSkipSave);
    $('#templatesBtn').addEventListener('click', handleTemplates);
    $('#sessionsBtn').addEventListener('click', handleSessions);
    $('#viewPatientFileBtn').addEventListener('click', openPatientFile);
    $('#clearRxBtn').addEventListener('click', () => { 
        if (state.prescription.length === 0) return; 
        if (confirm('مسح كل الأدوية؟')) { 
            state.prescription = []; 
            renderRxList(); 
            saveSessionToDB(); 
        } 
    });
    $('#diagnosisInput').addEventListener('input', () => { 
        clearTimeout(state._diagTimer); 
        state._diagTimer = setTimeout(saveSessionToDB, 500); 
    });
    
    $('#logoutBtn').addEventListener('click', async () => { 
        try {
            toast('👋 جاري تسجيل الخروج...');
            clearLoginSessionOnly();
            state.user = null;
            state.doctorData = null;
            state.appointments = [];
            await signOut(auth); 
            window.location.href = 'index.html';
        } catch(e) {
            console.error('خطأ أثناء تسجيل الخروج:', e);
            clearLoginSessionOnly();
            window.location.href = 'index.html';
        }
    });
    
    $$('.close-btn').forEach(b => b.addEventListener('click', () => { b.closest('.modal').style.display = 'none'; }));
    window.addEventListener('click', (e) => { 
        if (e.target.classList.contains('modal')) e.target.style.display = 'none'; 
        if (!$('#drugSearchInput').contains(e.target) && !$('#drugSuggestions').contains(e.target)) $('#drugSuggestions').style.display = 'none'; 
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $$('.modal').forEach(m => m.style.display = 'none'); } });

    $('#closePatientFileBtn').addEventListener('click', () => $('#patientFileModal').style.display = 'none');
    $('#closeSaveTemplateBtn').addEventListener('click', () => $('#saveTemplateModal').style.display = 'none');
    
    window.addEventListener('online', () => {
        setSyncStatus(true);
        toast('📡 تم استعادة الاتصال');
    });
    
    window.addEventListener('offline', () => {
        setSyncStatus(false);
        toast('⚠️ انقطع الاتصال - استخدام البيانات المحلية', true);
    });
};

// ============================================================
// ✅ تصدير الدوال للاستخدام من ملفات تانية (للصيدلي مثلاً)
// ============================================================
window.shifaDoctorTools = {
    getDrugStatsForAllDoctors: prescriptionTracker.getDrugStatsForAllDoctors.bind(prescriptionTracker),
    getCurrentTenantId: () => currentTenantId
};

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

    try {
        const tenantUserSnap = await get(ref(db, `tenants/${currentTenantId}/users/${user.uid}`));
        if (tenantUserSnap.exists()) {
            state.user = { uid: user.uid, ...tenantUserSnap.val() };
        } else {
            state.user = { uid: user.uid, name: 'طبيب' };
        }
        
        $('#welcomeMsg').textContent = `د. ${state.user.name||'طبيب'}`; 
        $('#welcomeMsg').style.display = 'inline';
        
        const tenantName = state.user.tenantName || 'المجمع الطبي';
        $('#tenantName').textContent = tenantName;
        
        sessionStorage.setItem('userUid', user.uid); 
        sessionStorage.setItem('userRole', 'doctor'); 
        sessionStorage.setItem('userName', state.user.name||'');
        
        await Promise.all([sessionDB.open(), favoritesDB.open(), favoriteDosesDB.open(), drugManager.loadCache()]);
        setupEventListeners();
        
        const q = query(ref(db, `tenants/${currentTenantId}/appointments`), orderByChild('doctor_id'), equalTo(user.uid));
        onValue(q, (snap) => {
            const apps = []; 
            snap.forEach(c => { 
                const a = c.val(); 
                if (a.date === today() && a.status !== 'ملغي') {
                    apps.push({ id: c.key, ...a }); 
                }
            });
            apps.sort((a,b) => (a.time||'').localeCompare(b.time||''));
            state.appointments = apps; 
            setSyncStatus(true);
            updateQueueCount(); 
            renderSidebar();
            if (state.currentAppointment) updateWorkspace();
        }, (error) => {
            console.warn('خطأ في تحميل الكشوفات:', error.message);
            setSyncStatus(false);
        });
        
        const restored = await restoreSession();
        if (restored) { 
            const patientId = state.currentAppointment?.patient_id || state.currentAppointment?.patientId;
            if (patientId) state.previousRecordsCount = await fetchPreviousRecordsCount(patientId);
            updateWorkspace(); 
            toast('🔄 تم استعادة آخر جلسة'); 
        }
        
        $('#appLoader').style.display = 'none'; 
        $('#mainContainer').style.display = 'block';
        
    } catch (error) { 
        console.error('خطأ في بدء التشغيل:', error); 
        $('#appLoader').style.display = 'none'; 
        $('#mainContainer').style.display = 'block';
        toast('⚠️ تعذر تحميل بعض البيانات', true); 
    }
});

console.log('🚀 لوحة الطبيب - نظام المجمعات الطبية المتعددة');
console.log('🔍 البحث الذكي: ترتيب حسب بداية النص أولاً');
console.log('💊 الشكل الصيدلي: يُحفظ في الروشتة فقط للصيدلي');
console.log('⭐ المفضلات: تبحث بشكل ذكي مع كل حرف يُكتب');
console.log('🔒 كل طبيب يشوف كشوفاته هو فقط في مجمعه');
console.log('📊 نظام مراقبة: تتبع الأدوية الموصوفة لكل دكتور في آخر 15 يوم');
console.log('🏥 سجل موحد: يظهر وصفات المريض من كل المجمعات مع إخفاء اسم الدكتور من المجمعات الأخرى');
console.log('💾 وضع الحفظ: يمسح جلسة الدخول فقط - يحتفظ ببيانات المجمع');
