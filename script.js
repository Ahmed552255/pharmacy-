import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore, doc, getDoc, addDoc, updateDoc, collection, serverTimestamp, getDocs, query, where, setDoc, increment } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyDYgPFDWqtaHm9wzKyRtUqJKS2mQrOiJVk",
    authDomain: "oooooo-ee246.firebaseapp.com",
    projectId: "oooooo-ee246",
    storageBucket: "oooooo-ee246.firebasestorage.app",
    messagingSenderId: "484234388806",
    appId: "1:484234388806:web:bafc624785ef1cad10b147",
    measurementId: "G-V8PMYBC290"
};

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- Authentication & Doctor Info ---
const doctorId = localStorage.getItem('userId');
if (!doctorId) {
    // Redirect to login if doctor is not identified
    window.location.href = 'login.html';
}

// --- UI Element References ---
const UI = {
    prescriptionList: document.getElementById('prescriptionList'),
    welcomeMessage: document.getElementById('welcomeMessage'),
    resultsBox: document.getElementById('resultsBox'),
    doseSuggestionsBar: document.getElementById('doseSuggestionsBar'),
    drugSearch: document.getElementById('drugSearch'),
    typeSelect: document.getElementById('typeSelect'),
    manualDoseInput: document.getElementById('manualDoseInput'),
    doseInputArea: document.getElementById('doseInputArea'),
    drugSearchGroup: document.getElementById('drugSearchGroup'),
    doctorNameHeader: document.getElementById('doctorNameHeader'),
    patientInfoCard: document.getElementById('patientInfoCard'),
    patientNameText: document.getElementById('patientNameText'),
    patientAgeText: document.getElementById('patientAgeText'),
    confirmDoseBtn: document.getElementById('confirmDoseBtn'),
    addExchangeDrugBtn: document.getElementById('addExchangeDrugBtn'),
    templatesModal: document.getElementById('templatesModal'),
    templatesList: document.getElementById('templatesList'),
    saveTemplateModal: document.getElementById('saveTemplateModal'),
    templateNameInput: document.getElementById('templateNameInput'),
    openTemplatesBtn: document.getElementById('openTemplatesBtn'),
};

// --- Application State ---
const state = {
    allDrugs: {},
    favoriteDrugs: [],
    prescribedDrugs: [],
    activeDrugIndex: null,
    mode: 'add_drug', // 'add_drug', 'add_dose', 'exchange_drug'
    currentBooking: null,
    templates: [],
    isAddingExchange: false,
    exchangeDoseText: '',
};

// --- Constants ---
const DRUG_TYPES = {
    tab: "برشام", syrup: "شراب", amp: "حقن", supp: "لبوس",
    drops: "قطرة", spray: "بخاخ", cream: "كريم", oint: "مرهم", powder: "فوار"
};

// --- Initialization ---
async function initialize() {
    console.log("Initializing page...");
    const doctorName = localStorage.getItem('userName');
    UI.doctorNameHeader.textContent = doctorName ? `د. ${doctorName}` : 'مساعد الطبيب';

    // Load drug databases and templates
    await Promise.all([
        loadExternalDrugDB(),
        loadFavoriteDrugs(),
        loadTemplates()
    ]);

    // Populate drug type dropdown
    UI.typeSelect.innerHTML = Object.entries(DRUG_TYPES)
        .map(([key, value]) => `<option value="${key}">${value}</option>`)
        .join('');

    // Load current patient information if available
    const currentBookingId = localStorage.getItem('currentBookingId');
    if (currentBookingId) {
        const bookingDocRef = doc(db, "appointments", currentBookingId);
        const bookingDoc = await getDoc(bookingDocRef);

        if (bookingDoc.exists()) {
            state.currentBooking = { id: bookingDoc.id, ...bookingDoc.data() };
            UI.patientNameText.textContent = state.currentBooking.patientName;
            UI.patientAgeText.textContent = `${state.currentBooking.age || 'غير محدد'} سنة`;
            UI.patientInfoCard.style.display = 'flex';
            UI.welcomeMessage.style.display = 'none';
            document.getElementById('controlsSection').style.display = 'block';
        } else {
            UI.welcomeMessage.textContent = 'المريض المحدد غير موجود. اختر مريضاً آخر من القائمة.';
        }
    }

    renderPrescription();
    addEventListeners();
}

// --- Data Loading Functions ---
async function loadExternalDrugDB() {
    try {
        const response = await fetch('./organized_drugs (1).json');
        if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
        state.allDrugs = await response.json();
        console.log("%cLocal drug database loaded successfully.", "color: green;");
    } catch (error) {
        console.error("%cFailed to load local drug database:", "color: red;", error);
        alert("فشل تحميل قاعدة بيانات الأدوية المحلية.");
    }
}

async function loadFavoriteDrugs() {
    const favQuery = query(collection(db, `doctors/${doctorId}/favoriteDrugs`));
    const snapshot = await getDocs(favQuery);
    state.favoriteDrugs = snapshot.docs.map(d => ({ name: d.id, ...d.data() }));
    state.favoriteDrugs.sort((a, b) => a.name.localeCompare(b.name));
    console.log(`%cLoaded ${state.favoriteDrugs.length} favorite drugs.`, "color: blue;");
}

async function loadTemplates() {
    UI.templatesList.innerHTML = 'جاري التحميل...';
    const q = query(collection(db, "prescriptionTemplates"), where("doctorId", "==", doctorId));
    const querySnapshot = await getDocs(q);
    state.templates = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderTemplates();
}

// --- Event Listeners ---
function addEventListeners() {
    UI.drugSearch.addEventListener('input', handleSearch);
    UI.typeSelect.addEventListener('change', () => UI.drugSearch.focus());
    UI.manualDoseInput.addEventListener('input', () => updateDoseSuggestions(UI.manualDoseInput.value));
    UI.confirmDoseBtn.addEventListener('click', confirmDose);
    UI.addExchangeDrugBtn.addEventListener('click', startExchangeDrug);
    UI.openTemplatesBtn.addEventListener('click', () => UI.templatesModal.style.display = 'flex');
}

// --- Core Logic Functions ---
function handleSearch() {
    const query = UI.drugSearch.value.trim().toLowerCase();
    if (query.length < 1) {
        UI.resultsBox.style.display = 'none';
        return;
    }

    const type = UI.typeSelect.value;
    const firstLetter = query.charAt(0).toUpperCase();
    let results = [];

    // Search favorite drugs
    const favMatches = state.favoriteDrugs
        .filter(d => d.type === type && d.name.toLowerCase().includes(query))
        .map(d => ({ name: d.name, source: 'fav' }));
    results.push(...favMatches);

    // Search general drug database
    if (state.allDrugs[type] && state.allDrugs[type][firstLetter]) {
        const dbMatches = state.allDrugs[type][firstLetter]
            .filter(d => d.t.toLowerCase().includes(query))
            .map(d => ({ name: d.t, source: 'db' }));
        results.push(...dbMatches);
    }

    // Remove duplicates and render
    const uniqueResults = Array.from(new Map(results.map(item => [item.name, item])).values());
    let html = uniqueResults.slice(0, 10).map(d => `
        <div class="result-row" onclick="selectDrug('${d.name.replace(/'/g, "\\'")}', ${d.source === 'db'})">
            <span>${d.name}</span>
            <span class="source-badge ${d.source === 'fav' ? 'source-fav' : 'source-db'}">
                ${d.source === 'fav' ? 'مفضل' : 'قاعدة البيانات'}
            </span>
        </div>
    `).join('');

    html += `<div class="custom-add" onclick="selectDrug('${UI.drugSearch.value.trim().replace(/'/g, "\\'")}', true)">➕ إضافة "${UI.drugSearch.value}" كصنف مخصص</div>`;
    UI.resultsBox.innerHTML = html;
    UI.resultsBox.style.display = 'block';
}

window.selectDrug = (name, isFromDB) => {
    if (isFromDB) {
        trackDrugUsage(name, UI.typeSelect.value);
    }

    if (state.isAddingExchange) {
        const doseText = UI.manualDoseInput.value.trim() || "كل 12 ساعة";
        const fullDose = `${state.exchangeDoseText} بالتبادل مع ${name} ${doseText}`;
        state.prescribedDrugs[state.activeDrugIndex].doses.push(fullDose);
        state.isAddingExchange = false;
        setMode('add_drug');
        renderPrescription();
    } else {
        state.prescribedDrugs.push({ name: name, doses: [] });
        state.activeDrugIndex = state.prescribedDrugs.length - 1;
        setMode('add_dose');
        renderPrescription();
    }
};

async function trackDrugUsage(drugName, drugType) {
    const today = new Date().toISOString().split('T')[0];
    const docRef = doc(db, `doctors/${doctorId}/drugUsage/${today}/drugs/${drugName}`);

    try {
        await setDoc(docRef, { count: increment(1), type: drugType }, { merge: true });
        const drugDoc = await getDoc(docRef);
        // Add to favorites after being used 3 times on the same day
        if (drugDoc.exists() && drugDoc.data().count === 3) {
            const favDocRef = doc(db, `doctors/${doctorId}/favoriteDrugs/${drugName}`);
            await setDoc(favDocRef, { type: drugType });
            console.log(`Drug "${drugName}" added to favorites.`);
            await loadFavoriteDrugs(); // Reload favorites to reflect the change
        }
    } catch (error) {
        console.error("Error tracking drug usage:", error);
    }
}

function setMode(newMode) {
    state.mode = newMode;
    UI.resultsBox.style.display = 'none';
    UI.drugSearch.value = '';

    if (newMode === 'add_drug') {
        UI.doseInputArea.style.display = 'none';
        UI.doseSuggestionsBar.style.display = 'none';
        UI.drugSearchGroup.style.display = 'flex';
        UI.drugSearch.placeholder = 'ابحث عن صنف...';
        UI.drugSearch.focus();
    } else if (newMode === 'add_dose') {
        UI.drugSearchGroup.style.display = 'none';
        UI.doseInputArea.style.display = 'flex';
        UI.manualDoseInput.value = '';
        UI.manualDoseInput.placeholder = 'اكتب الاستخدام (مثال: 1 أو 2...)';
        updateDoseSuggestions();
        UI.manualDoseInput.focus();
    } else if (newMode === 'exchange_drug') {
        UI.doseInputArea.style.display = 'none';
        UI.drugSearchGroup.style.display = 'flex';
        UI.drugSearch.placeholder = `ابحث عن الصنف الثاني للتبادل...`;
        UI.drugSearch.focus();
    }
}

function updateDoseSuggestions(query = '') {
    const type = UI.typeSelect.value;
    let suggestions = [];
    const base = { tab: "قرص", syrup: "مل", amp: "حقنة", supp: "لبوسة", drops: "نقطة", spray: "بخة", cream: "دهان", oint: "دهان", powder: "كيس" }[type] || "مرة";
    const plural = { tab: "أقراص", syrup: "مل", amp: "حقن", supp: "لبوس", drops: "نقط", spray: "بخات", cream: "دهان", oint: "دهان", powder: "أكياس" }[type] || "مرات";

    const times = {
        "1": [`${base} مرة يومياً صباحاً`, `${base} مرة يومياً مساءاً`, `${base} مرة يومياً بعد الغداء`, `${base} مرة يومياً قبل النوم`],
        "2": [`${base} كل 12 ساعة`, `${base} صباحاً ومساءاً`, `${base} بعد الفطار والعشاء`, `${base} قبل الفطار والعشاء`],
        "3": [`${base} كل 8 ساعات`, `${base} 3 مرات يومياً بعد الأكل`, `${base} 3 مرات يومياً قبل الأكل`],
        "4": [`${base} كل 6 ساعات`, `${plural} 4 مرات يومياً`],
    };

    if (times[query]) {
        suggestions.push(...times[query]);
    } else if (!query) { // Default suggestions
        suggestions.push(...(times["2"] || []), ...(times["3"] || []));
    }

    UI.doseSuggestionsBar.innerHTML = suggestions.map(s => `<div class="suggest-chip" onclick="applyDoseSuggestion('${s.replace(/'/g, "\\'")}')">${s}</div>`).join('');
    UI.doseSuggestionsBar.style.display = suggestions.length > 0 ? 'flex' : 'none';
}

window.applyDoseSuggestion = (suggestion) => {
    UI.manualDoseInput.value = suggestion + " ";
    UI.manualDoseInput.focus();
};

function confirmDose() {
    const doseText = UI.manualDoseInput.value.trim();
    if (doseText && state.activeDrugIndex !== null) {
        state.prescribedDrugs[state.activeDrugIndex].doses.push(doseText);
    }
    setMode('add_drug');
    renderPrescription();
}

function startExchangeDrug() {
    const doseText = UI.manualDoseInput.value.trim();
    if (!doseText) {
        alert("الرجاء كتابة استخدام الصنف الأول أولاً (مثال: قرص كل 12 ساعة).");
        return;
    }
    state.isAddingExchange = true;
    state.exchangeDoseText = doseText;
    setMode('exchange_drug');
}

// --- Rendering Functions ---
function renderPrescription() {
    if (!state.currentBooking) return;
    UI.prescriptionList.innerHTML = state.prescribedDrugs.map((drug, index) => `
        <div class="prescribed-card" data-index="${index}">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div class="drug-name">${index + 1}. ${drug.name}</div>
                <button onclick="removeDrug(${index})" class="btn btn-icon" style="color:var(--danger-color); padding:0;">&times;</button>
            </div>
            <div style="margin-top: 8px;">
                ${drug.doses.map((dose, doseIndex) => `
                    <div class="dose-entry">
                        <span>- ${dose}</span>
                        <button onclick="removeDose(${index},${doseIndex})" class="btn btn-icon" style="font-size:12px; color:var(--subtle-text-color); padding:0;">&times;</button>
                    </div>
                `).join('')}
            </div>
            <div style="margin-top:8px; display:flex; gap:10px;">
                <button onclick="addAnotherDose(${index})" class="btn" style="color:var(--accent-color); background:none; font-size:13px; padding: 4px 0;">+ إضافة استخدام</button>
            </div>
        </div>
    `).join('');
}

function renderTemplates() {
    if (state.templates.length === 0) {
        UI.templatesList.innerHTML = '<div style="text-align:center; color: var(--subtle-text-color); padding: 20px 0;">لا توجد روشتات محفوظة.</div>';
        return;
    }
    UI.templatesList.innerHTML = state.templates.map(t => `<div class="template-item" onclick="applyTemplate('${t.id}')">${t.name}</div>`).join('');
}

// --- Window-scoped Functions for HTML onclick ---
window.addAnotherDose = (index) => {
    state.activeDrugIndex = index;
    setMode('add_dose');
};

window.removeDrug = (index) => {
    state.prescribedDrugs.splice(index, 1);
    renderPrescription();
};

window.removeDose = (drugIndex, doseIndex) => {
    state.prescribedDrugs[drugIndex].doses.splice(doseIndex, 1);
    renderPrescription();
};

window.applyTemplate = (templateId) => {
    const template = state.templates.find(t => t.id === templateId);
    if (template && template.medications) {
        // Use structuredClone for a deep copy to avoid reference issues
        state.prescribedDrugs.push(...structuredClone(template.medications));
        renderPrescription();
        UI.templatesModal.style.display = 'none';
    }
};

window.openSaveTemplateModal = () => {
    if (state.prescribedDrugs.length === 0) {
        alert("لا يمكن حفظ روشتة فارغة.");
        return;
    }
    UI.templateNameInput.value = '';
    UI.saveTemplateModal.style.display = 'flex';
    UI.templateNameInput.focus();
};

window.savePrescriptionAsTemplate = async () => {
    const name = UI.templateNameInput.value.trim();
    if (!name) {
        alert("الرجاء إدخال اسم للروشتة.");
        return;
    }
    const templateData = {
        name: name,
        doctorId: doctorId,
        medications: state.prescribedDrugs,
        createdAt: serverTimestamp()
    };
    try {
        await addDoc(collection(db, "prescriptionTemplates"), templateData);
        alert(`تم حفظ الروشتة باسم "${name}" بنجاح.`);
        UI.saveTemplateModal.style.display = 'none';
        loadTemplates(); // Reload templates to show the new one
    } catch (e) {
        console.error("Error saving template:", e);
        alert("حدث خطأ أثناء الحفظ: " + e.message);
    }
};

/**
 * ### الدالة الرئيسية المعدلة ###
 * تحفظ الكشف في مجموعة خاصة بالدكتور وتحدث حالة الحجز.
 */
window.finishAndSavePrescription = async () => {
    if (!state.currentBooking) {
        alert("الرجاء اختيار مريض أولاً.");
        return;
    }
    if (state.prescribedDrugs.length === 0) {
        alert("الروشتة فارغة. لا يمكن حفظ كشف بدون أدوية.");
        return;
    }
    if (!confirm(`هل أنت متأكد من إنهاء وحفظ كشف المريض ${state.currentBooking.patientName}؟`)) {
        return;
    }

    const doctorName = localStorage.getItem('userName') || 'غير محدد';

    // 1. بناء كائن بيانات الكشف بالهيكل الجديد
    const examinationData = {
        doctorInfo: {
            id: doctorId,
            name: doctorName
        },
        patientInfo: {
            id: state.currentBooking.patientId,
            name: state.currentBooking.patientName,
            age: state.currentBooking.age || 'غير محدد'
        },
        medications: state.prescribedDrugs,
        status: "منتهي", // حالة الكشف نفسه
        createdAt: serverTimestamp(),
        bookingId: state.currentBooking.id, // رابط للحجز الأصلي
    };

    try {
        // 2. الحفظ في مجموعة جديدة خاصة بالطبيب: `doctors/{doctorId}/examinations`
        const examinationsCollectionRef = collection(db, `doctors/${doctorId}/examinations`);
        await addDoc(examinationsCollectionRef, examinationData);

        // 3. تحديث حالة الحجز الأصلي في مجموعة `appointments`
        await updateDoc(doc(db, "appointments", state.currentBooking.id), {
            status: "منتهي"
        });

        // 4. تنظيف الحالة المحلية وإعادة التوجيه
        localStorage.removeItem('currentBookingId');
        alert('✓ تم إنهاء الكشف وحفظ البيانات بنجاح.');
        window.location.href = 'doctor_queue.html';

    } catch (e) {
        console.error("Error finishing session:", e);
        alert("حدث خطأ في حفظ الكشف: " + e.message);
    }
};

window.openPatientRecord = () => {
    if (!state.currentBooking || !state.currentBooking.patientId) {
        alert("لا يوجد سجل دائم لهذا المريض لعرضه.");
        return;
    }
    localStorage.setItem('recordsPatientId', state.currentBooking.patientId);
    window.open('patient_records.html', '_blank');
};

// --- Start Application ---
document.addEventListener('DOMContentLoaded', initialize);
