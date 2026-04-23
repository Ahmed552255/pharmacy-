import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getDatabase, ref, onValue, set, push, update, get, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ---------- التحقق من الجلسة أولاً ----------
const sessionUid = sessionStorage.getItem('userUid');
const sessionRole = sessionStorage.getItem('userRole');
const sessionName = sessionStorage.getItem('userName');

// إذا لم توجد جلسة أو الدور ليس ممرضًا، ارجع إلى صفحة الدخول دون تسجيل خروج (فقط توجيه)
if (!sessionUid || sessionRole !== 'nurse') {
    sessionStorage.clear();
    window.location.replace('index.html');
    throw new Error('جلسة غير صالحة. الرجاء تسجيل الدخول.');
}

// ---------- دوال التاريخ ----------
function getLocalDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
const today = getLocalDateString();

let currentUser = { uid: sessionUid };  // نبدأ بالـ UID من الجلسة
let nurseInfo = { name: sessionName || 'ممرض' };
let assignedDoctorsList = [], currentDoctorId = null;
let allBookings = [], unsubscribeBookings = null, selectedPatientId = null, currentTab = 'waiting';

const ui = {
    welcomeMessage: document.getElementById('welcomeMessage'),
    doctorsToolbar: document.getElementById('doctorsToolbar'),
    bookingsBody: document.getElementById('bookingsBody'),
    waitingTabCount: document.getElementById('waitingTabCount'),
    inProgressTabCount: document.getElementById('inProgressTabCount'),
    doneTabCount: document.getElementById('doneTabCount'),
    openModalBtn: document.getElementById('openModalBtn'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    modal: document.getElementById('bookingModal'),
    modalTitle: document.getElementById('modalTitle'),
    bookingDoctorSelect: document.getElementById('bookingDoctorSelect'),
    patientSearch: document.getElementById('patientSearch'),
    searchResults: document.getElementById('searchResults'),
    patientName: document.getElementById('patientName'),
    patientAge: document.getElementById('patientAge'),
    patientPhone: document.getElementById('patientPhone'),
    appointmentDate: document.getElementById('appointmentDate'),
    appointmentTime: document.getElementById('appointmentTime'),
    submitBtn: document.getElementById('submitBtn'),
    formAlert: document.getElementById('formAlert'),
    bookingForm: document.getElementById('bookingForm'),
    editBookingId: document.getElementById('editBookingId'),
    logoutBtn: document.getElementById('logoutBtn'),
    tabBtns: document.querySelectorAll('.tab-btn')
};

ui.appointmentDate.value = today;
ui.welcomeMessage.textContent = `أهلاً، ${nurseInfo.name}`;

function showToast(msg, isErr = false) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.background = isErr ? '#B23B3B' : '#4A3B2C';
    t.innerHTML = `<i class="fas ${isErr ? 'fa-exclamation-triangle' : 'fa-check'}"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// ---------- تحميل بيانات الممرض (بدون تسجيل خروج قاسي) ----------
async function loadNurseData(uid) {
    try {
        const snap = await get(ref(db, `users/${uid}`));
        if (snap.exists()) {
            const data = snap.val();
            // التحقق من الدور لكن لا نسجل خروجًا إذا كان غير متطابق، فقط نعرض تحذيرًا ونستمر بالجلسة الحالية
            if (data.role && data.role !== 'nurse') {
                showToast('تحذير: هذا الحساب ليس ممرضًا في قاعدة البيانات، لكنك ستستمر بصلاحيات محدودة.', true);
            }
            nurseInfo = { ...nurseInfo, ...data };
            ui.welcomeMessage.textContent = `أهلاً، ${nurseInfo.name || sessionName}`;
        } else {
            // قد لا يكون السجل موجودًا بعد، نستخدم بيانات الجلسة فقط
            showToast('لم يتم العثور على سجل مفصل في قاعدة البيانات. بعض الميزات قد لا تعمل.', true);
        }

        // جلب الأطباء المرتبطين من الجدول الوسيط
        const linksSnap = await get(ref(db, `doctor_nurse_links/${uid}`));
        let doctorIds = [];
        if (linksSnap.exists()) {
            doctorIds = Object.keys(linksSnap.val());
        } else {
            // الرجوع إلى assignedDoctors في بيانات الممرض (للتوافق)
            const nurseData = (await get(ref(db, `users/${uid}`))).val() || {};
            const assignedDoctors = nurseData.assignedDoctors || {};
            doctorIds = Object.keys(assignedDoctors);
        }

        assignedDoctorsList = [];
        for (const docId of doctorIds) {
            const docSnap = await get(ref(db, `users/${docId}`));
            if (docSnap.exists()) {
                assignedDoctorsList.push({ id: docId, name: docSnap.val().name || 'دكتور' });
            }
        }

        if (assignedDoctorsList.length === 0) {
            ui.doctorsToolbar.innerHTML = '<div class="empty-state">لا يوجد أطباء مرتبطين بك. تواصل مع المدير.</div>';
            ui.bookingDoctorSelect.innerHTML = '<option value="">لا يوجد أطباء</option>';
            ui.bookingsBody.innerHTML = '<tr><td colspan="8" class="empty-state">لا يمكن عرض الحجوزات</td></tr>';
            return false;
        }

        renderDoctorsToolbar();
        ui.bookingDoctorSelect.innerHTML = assignedDoctorsList.map(d => `<option value="${d.id}">د. ${d.name}</option>`).join('');
        currentDoctorId = assignedDoctorsList[0].id;
        highlightDoctorButton(currentDoctorId);
        loadBookingsForDoctor(currentDoctorId);
        return true;
    } catch (err) {
        showToast('خطأ في تحميل البيانات: ' + err.message, true);
        return false;
    }
}

function renderDoctorsToolbar() {
    ui.doctorsToolbar.innerHTML = assignedDoctorsList.map(doc => `
        <button class="doctor-tab-btn" data-doctor-id="${doc.id}">
            <i class="fas fa-user-md"></i> د. ${doc.name}
        </button>
    `).join('');
    document.querySelectorAll('.doctor-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentDoctorId = btn.dataset.doctorId;
            highlightDoctorButton(currentDoctorId);
            loadBookingsForDoctor(currentDoctorId);
        });
    });
}

function highlightDoctorButton(docId) {
    document.querySelectorAll('.doctor-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.doctorId === docId);
    });
}

function loadBookingsForDoctor(doctorId) {
    if (unsubscribeBookings) unsubscribeBookings();
    if (!doctorId) return;
    const q = query(ref(db, 'appointments'), orderByChild('doctorId'), equalTo(doctorId));
    unsubscribeBookings = onValue(q, (snap) => {
        const bookings = [];
        snap.forEach(child => {
            const apt = child.val();
            if (apt.date === today) bookings.push({ id: child.key, ...apt });
        });
        bookings.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        allBookings = bookings;
        updateTabCounts();
        filterAndRenderByTab();
    }, (error) => {
        showToast("فشل تحميل الحجوزات", true);
    });
}

function updateTabCounts() {
    const waiting = allBookings.filter(b => b.status === 'انتظار').length;
    const inProgress = allBookings.filter(b => b.status === 'قيد الكشف').length;
    const done = allBookings.filter(b => b.status === 'منتهي').length;
    ui.waitingTabCount.textContent = waiting;
    ui.inProgressTabCount.textContent = inProgress;
    ui.doneTabCount.textContent = done;
}

function filterAndRenderByTab() {
    let filtered = [];
    if (currentTab === 'waiting') filtered = allBookings.filter(b => b.status === 'انتظار');
    else if (currentTab === 'inprogress') filtered = allBookings.filter(b => b.status === 'قيد الكشف');
    else if (currentTab === 'done') filtered = allBookings.filter(b => b.status === 'منتهي');
    renderTable(filtered);
}

function renderTable(bookings) {
    if (bookings.length === 0) {
        ui.bookingsBody.innerHTML = `<tr><td colspan="8" class="empty-state">لا توجد حجوزات في هذا القسم</td></tr>`;
        return;
    }
    let html = '';
    bookings.forEach((b, idx) => {
        const statusClass = {
            'انتظار': 'status-waiting', 'قيد الكشف': 'status-inprogress', 'منتهي': 'status-done', 'ملغي': 'status-cancelled'
        }[b.status] || 'status-waiting';
        let actions = currentTab === 'waiting' ? `
            <button class="icon-btn success" data-id="${b.id}" data-action="start"><i class="fas fa-play"></i></button>
            <button class="icon-btn warning" data-id="${b.id}" data-action="edit"><i class="fas fa-edit"></i></button>
            <button class="icon-btn danger" data-id="${b.id}" data-action="cancel"><i class="fas fa-times"></i></button>
        ` : '<span style="opacity:0.5;">—</span>';
        html += `<tr>
            <td>${idx + 1}</td><td><b>${b.patientName || '-'}</b></td><td>${b.age || '-'}</td><td>${b.phone || '-'}</td>
            <td>${b.date || '-'}</td><td>${b.time || '-'}</td>
            <td><span class="status-badge ${statusClass}">${b.status || 'انتظار'}</span></td>
            <td><div class="action-btns">${actions}</div></td>
        </tr>`;
    });
    ui.bookingsBody.innerHTML = html;
}

ui.bookingsBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const booking = allBookings.find(b => b.id === id);
    if (!booking) return;
    if (action === 'start') updateStatus(id, 'قيد الكشف');
    else if (action === 'cancel') updateStatus(id, 'ملغي');
    else if (action === 'edit') openEditModal(booking);
});

async function updateStatus(id, status) {
    try {
        await update(ref(db, `appointments/${id}`), { status });
        showToast(status === 'قيد الكشف' ? '🩺 بدأ الكشف' : '❌ تم الإلغاء');
    } catch (e) { showToast('فشل التحديث', true); }
}

function openAddModal() {
    ui.modalTitle.innerHTML = '<i class="fas fa-calendar-plus"></i> حجز موعد جديد';
    ui.editBookingId.value = '';
    resetForm();
    ui.modal.style.display = 'flex';
}

function openEditModal(booking) {
    ui.modalTitle.innerHTML = '<i class="fas fa-edit"></i> تعديل الحجز';
    ui.editBookingId.value = booking.id;
    ui.bookingDoctorSelect.value = booking.doctorId || currentDoctorId;
    ui.patientName.value = booking.patientName || '';
    ui.patientAge.value = booking.age || '';
    ui.patientPhone.value = booking.phone || '';
    ui.appointmentDate.value = booking.date || today;
    ui.appointmentTime.value = booking.time || '';
    selectedPatientId = booking.patientId || null;
    ui.modal.style.display = 'flex';
}

function resetForm() {
    ui.bookingForm.reset();
    ui.appointmentDate.value = today;
    selectedPatientId = null;
    ui.formAlert.textContent = '';
}

ui.openModalBtn.onclick = () => {
    if (assignedDoctorsList.length === 0) { showToast('لا يوجد أطباء مرتبطين', true); return; }
    openAddModal();
};
ui.closeModalBtn.onclick = () => ui.modal.style.display = 'none';
window.onclick = (e) => { if (e.target === ui.modal) ui.modal.style.display = 'none'; };

// البحث عن مريض
let searchTimeout;
ui.patientSearch.addEventListener('input', (e) => {
    const term = e.target.value.trim();
    if (term.length < 2) { ui.searchResults.style.display = 'none'; return; }
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        const snap = await get(ref(db, 'patients'));
        const results = [];
        snap.forEach(child => {
            const p = child.val();
            if (p.name?.includes(term) || p.phone?.includes(term)) results.push({ id: child.key, ...p });
        });
        ui.searchResults.innerHTML = results.length === 0 ? '<div class="search-item">لا توجد نتائج</div>' : '';
        results.forEach(p => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.innerHTML = `<b>${p.name}</b><br><small>${p.phone || 'بدون رقم'}</small>`;
            div.onclick = () => selectPatient(p);
            ui.searchResults.appendChild(div);
        });
        ui.searchResults.style.display = 'block';
    }, 300);
});

function selectPatient(patient) {
    ui.patientName.value = patient.name || '';
    ui.patientAge.value = patient.age || '';
    ui.patientPhone.value = patient.phone || '';
    selectedPatientId = patient.id;
    ui.patientSearch.value = '';
    ui.searchResults.style.display = 'none';
}

document.addEventListener('click', (e) => {
    if (!ui.patientSearch.contains(e.target) && !ui.searchResults.contains(e.target)) ui.searchResults.style.display = 'none';
});

// حفظ الحجز
ui.bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = ui.editBookingId.value;
    const doctorId = ui.bookingDoctorSelect.value;
    const name = ui.patientName.value.trim();
    const date = ui.appointmentDate.value;
    const time = ui.appointmentTime.value;
    if (!doctorId || !name || !date || !time) { ui.formAlert.textContent = 'جميع الحقول المطلوبة'; return; }
    ui.submitBtn.disabled = true;
    ui.submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    try {
        const phone = ui.patientPhone.value.trim();
        let patientId = selectedPatientId;
        if (!patientId && phone) {
            const newPatientRef = push(ref(db, 'patients'));
            patientId = newPatientRef.key;
            await set(newPatientRef, {
                name, age: ui.patientAge.value || null, phone,
                updatedAt: new Date().toISOString()
            });
        } else if (phone) {
            await set(ref(db, `patients/${phone}`), {
                name, age: ui.patientAge.value || null, phone,
                updatedAt: new Date().toISOString()
            });
        }
        const bookingData = {
            patientName: name,
            patientId: patientId || phone || null,
            age: ui.patientAge.value || null,
            phone: phone || null,
            doctorId: doctorId,
            date: date,
            time: time,
            status: 'انتظار',
            createdAt: editId ? (await get(ref(db, `appointments/${editId}`))).val()?.createdAt : new Date().toISOString()
        };
        if (editId) {
            await update(ref(db, `appointments/${editId}`), bookingData);
            showToast('✅ تم تعديل الحجز');
        } else {
            await push(ref(db, 'appointments'), bookingData);
            showToast('✅ تم حجز الموعد');
        }
        ui.modal.style.display = 'none';
        resetForm();
    } catch (err) {
        ui.formAlert.textContent = 'خطأ: ' + err.message;
    } finally {
        ui.submitBtn.disabled = false;
        ui.submitBtn.innerHTML = 'تأكيد الحجز';
    }
});

ui.tabBtns.forEach(btn => btn.addEventListener('click', () => {
    ui.tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    filterAndRenderByTab();
}));

// ---------- تسجيل الخروج بشكل صحيح ----------
ui.logoutBtn.onclick = async () => {
    if (unsubscribeBookings) unsubscribeBookings();
    try {
        await signOut(auth);
    } catch (e) {}
    sessionStorage.clear();
    window.location.href = 'index.html';
};

// ---------- مراقبة حالة المصادقة (للتأكد من بقاء الجلسة) ----------
onAuthStateChanged(auth, (user) => {
    if (!user) {
        // إذا لم يعد هناك مستخدم مصادق عليه، امسح الجلسة وارجع لصفحة الدخول
        sessionStorage.clear();
        window.location.href = 'index.html';
    } else {
        // تأكد من أن UID متطابق مع الجلسة، إذا اختلف حدث تلاعب
        if (user.uid !== sessionUid) {
            sessionStorage.clear();
            window.location.href = 'index.html';
        }
    }
});

// بدء التطبيق
loadNurseData(sessionUid);
