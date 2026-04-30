// ---------- نظام التخزين المحلي (IndexedDB) - وحدة مستقلة ----------
export class LocalDrugManager {
    constructor() {
        this.db = null;
        this.DB_NAME = 'SukunDrugsDB';
        this.STORE_NAME = 'drugs';
        this.VERSION = 1;
    }

    /**
     * يفتح قاعدة البيانات وينشئ مخزن الكائنات إذا لزم الأمر.
     * @returns {Promise<void>}
     */
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
                resolve();
            };
            request.onerror = reject;
        });
    }

    /**
     * الحصول على كافة الأدوية من المخزن المحلي.
     * @returns {Promise<Array>} قائمة الأدوية.
     */
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

    /**
     * حفظ مصفوفة كاملة من الأدوية (يُستخدم للمزامنة الأولية).
     * @param {Array} drugsArray
     * @returns {Promise<boolean>}
     */
    async saveDrugs(drugsArray) {
        return new Promise((resolve) => {
            if (!this.db) return resolve(false);
            const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            store.clear();
            for (const drug of drugsArray) {
                store.add(drug);
            }
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    }

    /**
     * إضافة دواء جديد أو تحديث عداد الاستخدام إذا كان موجوداً.
     * @param {Object} drug - كائن الدواء.
     * @returns {Promise<boolean>}
     */
    async addOrUpdateDrug(drug) {
        return new Promise((resolve) => {
            if (!this.db) return resolve(false);
            const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const getRequest = store.get(drug.id);
            getRequest.onsuccess = () => {
                const existing = getRequest.result;
                if (existing) {
                    existing.frequency = (existing.frequency || 0) + 1;
                    store.put(existing);
                } else {
                    drug.frequency = 1;
                    store.add(drug);
                }
                tx.oncomplete = () => resolve(true);
            };
            getRequest.onerror = () => resolve(false);
        });
    }

    /**
     * البحث في الأدوية محلياً حسب الاسم أو الاسم العلمي، مع فلترة اختيارية بالشكل.
     * @param {string} term - مصطلح البحث.
     * @param {string|null} formFilter - فلتر الشكل الدوائي (اختياري).
     * @returns {Promise<Array>} نتائج البحث.
     */
    async searchDrugs(term, formFilter = null) {
        const drugs = await this.getAllDrugs();
        const lowerTerm = term.toLowerCase();
        let results = drugs.filter(d =>
            d.name.toLowerCase().includes(lowerTerm) ||
            (d.genericName && d.genericName.toLowerCase().includes(lowerTerm))
        );
        if (formFilter && formFilter !== 'all') {
            results = results.filter(d => d.form === formFilter);
        }
        results.sort((a, b) => (b.frequency || 0) - (a.frequency || 0) || a.name.localeCompare(b.name));
        return results;
    }
}
