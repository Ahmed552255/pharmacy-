import { ref, set, update, get, remove, onValue, push, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-database.js";

export class LocalDrugManager {
    /**
     * @param {Object} firebaseDb - مثيل قاعدة بيانات Firebase Realtime (من getDatabase(app))
     * @param {string} cloudPath   - مسار عقدة الأدوية في Firebase (افتراضيًا 'drugs')
     */
    constructor(firebaseDb, cloudPath = 'drugs') {
        this.db = null;                // مرجع IndexedDB
        this.DB_NAME = 'SukunDrugsDB';
        this.STORE_NAME = 'drugs';
        this.VERSION = 2;             // زدنا الإصدار لإضافة فهارس إضافية إن لزم

        this.firebaseDb = firebaseDb;
        this.cloudPath = cloudPath;

        // قائمة انتظار للمزامنة عند فشل الاتصال
        this.pendingCloudUpdates = [];
        this.syncInProgress = false;
    }

    /** فتح قاعدة البيانات المحلية وإنشاء المخازن المطلوبة */
    async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                    store.createIndex('by_name', 'name', { unique: false });
                    store.createIndex('by_form', 'form', { unique: false });
                    store.createIndex('by_frequency', 'frequency', { unique: false });
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                // بعد الفتح نبدأ أول مزامنة من السحابة (في الخلفية)
                this._syncFromCloudSilently();
                resolve();
            };
            request.onerror = reject;
        });
    }

    /** ---------- عمليات القراءة المحلية ---------- */
    async getAllDrugs() {
        return new Promise((resolve) => {
            if (!this.db) return resolve([]);
            const tx = this.db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => resolve([]);
        });
    }

    async getDrugById(id) {
        return new Promise((resolve) => {
            if (!this.db) return resolve(null);
            const tx = this.db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => resolve(null);
        });
    }

    /** ---------- الحفظ المحلي مع المزامنة للسحابة ---------- */
    async saveDrug(drug) {
        if (!this.db) return false;
        return new Promise((resolve) => {
            const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            store.put(drug);
            tx.oncomplete = () => {
                this._tryCloudSave(drug);   // محاولة رفع فورية للسحابة
                resolve(true);
            };
            tx.onerror = () => resolve(false);
        });
    }

    /**
     * إضافة دواء جديد بالكامل (يُستخدم عادةً عند إنشاء دواء جديد)
     */
    async addNewDrug(drugData) {
        const drug = {
            ...drugData,
            frequency: drugData.frequency || 1,
            createdAt: drugData.createdAt || new Date().toISOString()
        };
        return this.saveDrug(drug);
    }

    /**
     * تحديث عداد الاستخدام (يزيد frequency بمقدار 1) ويعكس التغيير على السحابة
     */
    async incrementDrugUsage(drugId) {
        const drug = await this.getDrugById(drugId);
        if (!drug) return false;
        drug.frequency = (drug.frequency || 0) + 1;
        return this.saveDrug(drug);
    }

    /**
     * حذف دواء من المحلي والسحابة
     */
    async deleteDrug(drugId) {
        if (!this.db) return false;
        // حذف محلي
        await new Promise((resolve) => {
            const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            store.delete(drugId);
            tx.oncomplete = resolve;
            tx.onerror = resolve;
        });
        // حذف من السحابة
        try {
            await remove(ref(this.firebaseDb, `${this.cloudPath}/${drugId}`));
        } catch (e) {
            // إذا فشل نضعه في قائمة الانتظار
            this.pendingCloudUpdates.push({ type: 'delete', id: drugId });
        }
        return true;
    }

    /** ---------- عمليات البحث الذكية ---------- */
    async searchDrugs(term, formFilter = null) {
        const all = await this.getAllDrugs();
        const lowerTerm = term.toLowerCase();
        let results = all.filter(d =>
            d.name.toLowerCase().includes(lowerTerm) ||
            (d.genericName && d.genericName.toLowerCase().includes(lowerTerm))
        );
        if (formFilter && formFilter !== 'all') {
            results = results.filter(d => d.form === formFilter);
        }
        // ترتيب: الأكثر استخدامًا أولاً، ثم أبجديًا
        results.sort((a, b) => (b.frequency || 0) - (a.frequency || 0) || a.name.localeCompare(b.name));
        return results;
    }

    /**
     * اقتراحات ذكية جاهزة للعرض (مع أيقونات ومعلومات إضافية)
     * @returns {Array} مصفوفة كائنات موسّقة
     */
    async getSuggestions(term, formFilter = null) {
        const drugs = await this.searchDrugs(term, formFilter);
        return drugs.slice(0, 15).map(d => ({
            ...d,
            displayName: d.name,
            formIcon: this._getFormIcon(d.form),
            isFavorite: d.frequency > 3,
            strengthBadge: d.strength || '',
            usageInfo: `استخدم ${d.frequency || 0} مرة`
        }));
    }

    /**
     * أكثر الأدوية استخدامًا (للقوائم السريعة)
     */
    async getPopularDrugs(limit = 10) {
        const all = await this.getAllDrugs();
        return all.sort((a, b) => (b.frequency || 0) - (a.frequency || 0)).slice(0, limit);
    }

    /** ---------- مساعدة للسحابة ---------- */
    _getCloudRef(drugId) {
        return ref(this.firebaseDb, `${this.cloudPath}/${drugId}`);
    }

    async _tryCloudSave(drug) {
        try {
            await set(this._getCloudRef(drug.id), drug);
        } catch (e) {
            // نضيفها لقائمة المزامنة اللاحقة
            this.pendingCloudUpdates.push({ type: 'set', drug });
        }
    }

    async _syncFromCloudSilently() {
        if (this.syncInProgress) return;
        this.syncInProgress = true;
        try {
            const snap = await get(ref(this.firebaseDb, this.cloudPath));
            if (snap.exists()) {
                const cloudDrugs = Object.values(snap.val());
                // دمج مع المحلي (السحابة لها الأولوية في التحديث)
                for (const cloudDrug of cloudDrugs) {
                    const local = await this.getDrugById(cloudDrug.id);
                    if (!local || new Date(cloudDrug.updatedAt || 0) > new Date(local.updatedAt || 0)) {
                        await this.saveDrug({ ...cloudDrug, _fromCloud: true });
                    }
                }
            }
            // معالجة العمليات المعلقة
            await this._processPendingUpdates();
        } catch (e) {
            console.warn('تعذر الاتصال بـ Firebase أثناء المزامنة.');
        } finally {
            this.syncInProgress = false;
        }
    }

    async _processPendingUpdates() {
        const batch = [...this.pendingCloudUpdates];
        this.pendingCloudUpdates = [];
        for (const item of batch) {
            try {
                if (item.type === 'set') {
                    await set(this._getCloudRef(item.drug.id), item.drug);
                } else if (item.type === 'delete') {
                    await remove(ref(this.firebaseDb, `${this.cloudPath}/${item.id}`));
                }
            } catch (e) {
                // يعاد جدولتها لاحقًا
                this.pendingCloudUpdates.push(item);
            }
        }
    }

    // -------- أدوات شكلية ----------
    _getFormIcon(form) {
        const icons = {
            tablet: '💊', syrup: '🥄', injection: '💉', suppository: '🧴',
            drops: '💧', fizzy: '🫧', spray: '💨', cream: '🧴'
        };
        return icons[form] || '💊';
    }
}
