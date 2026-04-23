// upload_drugs.js
// مهمة هذا الملف: قراءة ملف JSON محلي ورفع الأدوية إلى Firebase Realtime Database.
// يستخدم مرة واحدة عند تحميل صفحة الدخول.

import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getDatabase, ref, set, get } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-database.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// مفتاح لتخزين وقت آخر رفع في localStorage
const LAST_UPLOAD_KEY = 'sokoon_last_drugs_upload';
// مدة صلاحية التخزين المؤقت (مثلاً يوم واحد)
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 ساعة

/**
 * دالة رفع الأدوية من ملف JSON إلى مسار 'drugs' في Firebase.
 * @param {boolean} force - إذا كان true يتجاهل التخزين المؤقت ويرفع قسراً.
 */
async function uploadDrugsFromJSON(force = false) {
    console.log('🔄 [رفع الأدوية] بدء عملية رفع الأدوية من ملف JSON إلى Firebase...');
    
    try {
        // 1. التحقق من التخزين المؤقت (إذا لم يكن إجباريًا)
        if (!force) {
            const lastUpload = localStorage.getItem(LAST_UPLOAD_KEY);
            if (lastUpload) {
                const elapsed = Date.now() - parseInt(lastUpload);
                if (elapsed < CACHE_DURATION_MS) {
                    console.log(`⏳ [رفع الأدوية] تم الرفع مؤخراً (منذ ${Math.round(elapsed / 1000 / 60)} دقيقة). لا حاجة لإعادة الرفع.`);
                    return;
                }
            }
        }

        // 2. جلب ملف JSON
        console.log('📂 [رفع الأدوية] جاري تحميل ملف organized_drugs (1).json...');
        const response = await fetch('organized_drugs (1).json');
        if (!response.ok) {
            throw new Error(`فشل تحميل ملف JSON: ${response.status} ${response.statusText}`);
        }
        const drugsArray = await response.json();
        
        if (!Array.isArray(drugsArray) || drugsArray.length === 0) {
            console.warn('⚠️ [رفع الأدوية] ملف JSON فارغ أو لا يحتوي على مصفوفة أدوية.');
            return;
        }
        
        console.log(`📋 [رفع الأدوية] تم قراءة ${drugsArray.length} دواء من الملف.`);

        // 3. تجهيز البيانات للرفع
        const drugsRef = ref(db, 'drugs');
        const updates = {};
        let validCount = 0;
        let skippedCount = 0;

        drugsArray.forEach((drug, index) => {
            if (!drug.name || typeof drug.name !== 'string' || drug.name.trim() === '') {
                console.warn(`⚠️ [رفع الأدوية] تخطي عنصر ${index}: لا يحتوي على اسم صالح.`);
                skippedCount++;
                return;
            }

            // إنشاء مفتاح فريد (نستخدم الاسم مع تطبيع بسيط)
            const drugKey = drug.name.trim()
                .replace(/\s+/g, '_')           // مسافات إلى شرطة سفلية
                .replace(/[.#$\/\[\]]/g, '');    // إزالة رموز تسبب مشاكل في مسار Firebase

            // بيانات الدواء الأساسية
            const drugData = {
                name: drug.name.trim(),
                form: drug.form || null,
                strength: drug.strength || null,
                price: drug.price || null,
                updatedAt: new Date().toISOString()
            };

            // إضافة أي حقول إضافية مفيدة
            if (drug.category) drugData.category = drug.category;
            if (drug.company) drugData.company = drug.company;
            if (drug.active_ingredient) drugData.active_ingredient = drug.active_ingredient;

            updates[drugKey] = drugData;
            validCount++;
        });

        if (validCount === 0) {
            console.warn('⚠️ [رفع الأدوية] لا توجد أدوية صالحة للرفع.');
            return;
        }

        console.log(`📦 [رفع الأدوية] جاري رفع ${validCount} دواء إلى Firebase...`);

        // 4. رفع البيانات دفعة واحدة (استبدال كامل للمسار)
        await set(drugsRef, updates);

        // 5. تحديث وقت آخر رفع في localStorage
        localStorage.setItem(LAST_UPLOAD_KEY, Date.now().toString());

        // 6. التحقق النهائي من العدد
        const snapshot = await get(drugsRef);
        const totalInDb = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        
        console.log(`✅ [رفع الأدوية] تم بنجاح! تم رفع ${validCount} دواء.`);
        console.log(`📊 [رفع الأدوية] إجمالي الأدوية الموجودة حالياً في Firebase: ${totalInDb}`);
        if (skippedCount > 0) console.log(`ℹ️ تم تخطي ${skippedCount} عنصر غير صالح.`);

    } catch (error) {
        console.error('❌ [رفع الأدوية] حدث خطأ أثناء رفع الأدوية:', error);
        // يمكن إظهار Toast إذا أردت إعلام المستخدم
    }
}

// بدء عملية الرفع عند تحميل الملف (مع احترام التخزين المؤقت)
uploadDrugsFromJSON();

// تصدير الدالة لاستخدامها يدوياً من أي مكان آخر (مثلاً زر في لوحة الإدارة)
export { uploadDrugsFromJSON };
