<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>سُكُون · لوحة الممرض</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        /* ----- ألوان برتقالية دافئة (مشمش / كراميل) ----- */
        :root {
            --primary: #F8C471;
            --primary-light: #FDEBD0;
            --primary-dark: #E59866;
            --accent: #E67E22;
            --accent-soft: #FAD7A1;
            --bg: #FFF8F0;
            --white: #FFFFFF;
            --ink: #4A3B2C;
            --text-sec: #8B7A66;
            --danger: #E57373;
            --success: #5FA88D;
            --warning: #F4B886;
            --border-light: #F0E0D0;
            --shadow-sm: 0 6px 12px -4px rgba(230, 126, 34, 0.08);
            --shadow-md: 0 12px 28px -6px rgba(230, 126, 34, 0.12);
            --shadow-lg: 0 20px 40px -10px rgba(230, 126, 34, 0.18);
            --radius-card: 28px;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Cairo', sans-serif;
            background: var(--bg);
            color: var(--ink);
            min-height: 100vh;
            padding: 16px;
            position: relative;
        }
        body::before {
            content: '';
            position: fixed;
            inset: 0;
            background: radial-gradient(circle at 0% 0%, rgba(248, 196, 113, 0.1), transparent 50%),
                        radial-gradient(circle at 100% 100%, rgba(230, 126, 34, 0.08), transparent 50%);
            pointer-events: none;
            z-index: -1;
        }
        .container { max-width: 1400px; margin: 0 auto; }

        /* الهيدر - تطويره ليكون أكثر انسيابية */
        .app-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: rgba(255, 255, 255, 0.6);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border-radius: 80px;
            padding: 10px 20px;
            margin-bottom: 24px;
            border: 1px solid rgba(255,255,255,0.7);
            box-shadow: var(--shadow-lg);
            flex-wrap: wrap;
            gap: 12px;
            position: sticky;
            top: 16px;
            z-index: 50;
        }
        .logo h2 {
            font-size: clamp(1.5rem, 5vw, 2rem);
            font-weight: 800;
            background: linear-gradient(145deg, #D35400, #E67E22);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            white-space: nowrap;
        }
        .header-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .btn {
            padding: 10px 20px;
            border-radius: 60px;
            border: none;
            font-weight: 600;
            font-family: 'Cairo', sans-serif;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 0.9rem;
            transition: all 0.25s cubic-bezier(0.2, 0.8, 0.3, 1);
            background: white;
            color: var(--ink);
            border: 1px solid var(--border-light);
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.02);
        }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(0,0,0,0.06); }
        .btn-primary {
            background: linear-gradient(145deg, var(--primary), var(--accent));
            color: white;
            border: none;
            box-shadow: 0 8px 16px rgba(230, 126, 34, 0.25);
            font-weight: 700;
        }
        .btn-primary:hover { background: linear-gradient(145deg, var(--primary-dark), var(--accent)); }
        .btn-outline:hover { background: var(--primary-light); border-color: var(--primary); }

        /* صف التحكم العلوي (الأطباء + أداة اليوم) */
        .controls-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
            margin-bottom: 20px;
        }
        .doctors-toolbar {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        .doctor-tab-btn {
            background: white;
            border: 1px solid var(--border-light);
            border-radius: 80px;
            padding: 8px 20px;
            font-weight: 600;
            color: var(--ink);
            transition: 0.25s;
            cursor: pointer;
            box-shadow: var(--shadow-sm);
            font-size: 0.9rem;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .doctor-tab-btn i { color: var(--accent); }
        .doctor-tab-btn.active {
            background: var(--primary);
            color: #4A3B2C;
            border-color: var(--primary);
            box-shadow: 0 8px 20px rgba(230, 126, 34, 0.2);
        }

        /* أداة تحديد اليوم */
        .date-picker-wrapper {
            display: flex;
            align-items: center;
            background: white;
            border-radius: 60px;
            padding: 4px;
            border: 1.5px solid var(--border-light);
            box-shadow: var(--shadow-sm);
            transition: 0.2s;
        }
        .date-picker-wrapper:hover { border-color: var(--primary); }
        .today-btn {
            background: transparent;
            border: none;
            padding: 8px 16px;
            border-radius: 50px;
            font-family: 'Cairo', sans-serif;
            font-weight: 600;
            color: var(--accent);
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: 0.2s;
        }
        .today-btn i { font-size: 1rem; }
        .today-btn:hover { background: var(--primary-light); }
        .date-input {
            border: none;
            padding: 8px 12px;
            font-family: 'Cairo', sans-serif;
            font-size: 0.9rem;
            border-right: 1px solid var(--border-light);
            margin-left: 4px;
            background: transparent;
            color: var(--ink);
            outline: none;
        }

        /* تبويبات الحالة مع عداد */
        .tabs-container {
            background: rgba(255,255,255,0.7);
            backdrop-filter: blur(12px);
            border-radius: 80px;
            padding: 6px;
            display: inline-flex;
            margin-bottom: 24px;
            border: 1px solid var(--border-light);
            flex-wrap: wrap;
            justify-content: center;
            box-shadow: var(--shadow-sm);
        }
        .tab-btn {
            background: transparent;
            border: none;
            padding: 10px 22px;
            border-radius: 50px;
            font-weight: 600;
            color: var(--text-sec);
            cursor: pointer;
            transition: 0.25s;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.95rem;
        }
        .tab-btn i { font-size: 0.95rem; }
        .tab-btn .count {
            background: rgba(0,0,0,0.04);
            border-radius: 30px;
            padding: 2px 10px;
            font-size: 0.8rem;
            margin-right: 4px;
        }
        .tab-btn.active {
            background: white;
            color: var(--accent);
            box-shadow: var(--shadow-sm);
        }
        .tab-btn.active .count {
            background: var(--primary-light);
            color: var(--ink);
        }

        /* جدول الحجوزات (مُحسّن) */
        .table-wrapper {
            background: rgba(255, 255, 255, 0.8);
            backdrop-filter: blur(16px);
            border-radius: var(--radius-card);
            padding: 0;
            box-shadow: var(--shadow-lg);
            border: 1px solid rgba(255,255,255,0.7);
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            text-align: center;
            min-width: 800px;
            font-size: 0.95rem;
        }
        th, td { padding: 14px 10px; }
        thead tr {
            background: linear-gradient(to bottom, #FEF5EC, #FCEBD9);
            border-bottom: 2px solid var(--primary);
        }
        th {
            font-weight: 700;
            color: var(--ink);
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            white-space: nowrap;
        }
        tbody tr { border-bottom: 1px solid var(--border-light); transition: all 0.2s; }
        tbody tr:hover {
            background: rgba(248, 196, 113, 0.1);
            transform: scale(1.01);
            box-shadow: 0 4px 12px rgba(0,0,0,0.03);
            position: relative;
            z-index: 1;
        }

        .status-badge {
            padding: 5px 14px;
            border-radius: 50px;
            font-size: 0.75rem;
            font-weight: 700;
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .status-waiting { background: #FEF9E7; color: #9A6E1A; }
        .status-inprogress { background: #D6F0F0; color: #1A5C5C; }
        .status-done { background: #DCF5E8; color: #1E6F4C; }
        .status-cancelled { background: #FDE2E2; color: #B23B3B; }

        .action-btns { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }
        .icon-btn {
            width: 34px; height: 34px; border-radius: 12px; border: none;
            background: white; color: var(--text-sec); cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.15s; border: 1px solid var(--border-light);
            font-size: 0.9rem;
        }
        .icon-btn:hover { background: var(--primary); color: #4A3B2C; border-color: var(--primary); }
        .icon-btn.danger:hover { background: var(--danger); color: white; border-color: var(--danger); }
        .icon-btn.success:hover { background: var(--success); color: white; border-color: var(--success); }
        .icon-btn.warning:hover { background: var(--warning); color: white; border-color: var(--warning); }

        /* مودال */
        .modal {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(60, 40, 20, 0.25);
            backdrop-filter: blur(8px);
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 16px;
        }
        .modal-card {
            background: rgba(255, 255, 255, 0.97);
            backdrop-filter: blur(16px);
            border-radius: 40px;
            width: 100%;
            max-width: 600px;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 30px 50px rgba(160, 100, 40, 0.25);
            border: 1px solid rgba(255,255,255,0.8);
        }
        .modal-header {
            padding: 20px 24px;
            background: #FEF5EC;
            border-bottom: 1px solid var(--border-light);
            border-radius: 40px 40px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .modal-body { padding: 20px 24px; }
        .close-btn { background: none; border: none; font-size: 28px; color: var(--text-sec); cursor: pointer; }
        .form-group { margin-bottom: 18px; }
        .form-group label { display: block; margin-bottom: 6px; font-weight: 600; color: var(--ink); }
        .form-control {
            width: 100%;
            padding: 12px 16px;
            border-radius: 18px;
            border: 1.5px solid var(--border-light);
            background: white;
            font-family: 'Cairo', sans-serif;
            font-size: 0.95rem;
            transition: 0.2s;
        }
        .form-control:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(248, 196, 113, 0.25);
        }
        .search-results {
            background: white;
            border: 1px solid var(--border-light);
            border-radius: 18px;
            margin-top: 8px;
            max-height: 200px;
            overflow-y: auto;
            display: none;
        }
        .search-item { padding: 10px 16px; cursor: pointer; border-bottom: 1px solid var(--border-light); }
        .search-item:hover { background: #FEF5EC; }

        .toast {
            position: fixed;
            bottom: 20px;
            left: 20px;
            right: 20px;
            background: #4A3B2C;
            color: white;
            padding: 12px 24px;
            border-radius: 60px;
            text-align: center;
            z-index: 1300;
            font-weight: 500;
            max-width: 500px;
            margin: 0 auto;
            box-shadow: 0 12px 28px rgba(0,0,0,0.2);
        }
        .empty-state { text-align: center; padding: 40px; color: var(--text-sec); }

        /* Responsive */
        @media (max-width: 640px) {
            body { padding: 10px; }
            .app-header { padding: 8px 16px; }
            .logo h2 { font-size: 1.4rem; }
            .btn { padding: 8px 14px; font-size: 0.8rem; }
            .doctor-tab-btn { padding: 6px 14px; font-size: 0.8rem; }
            .tab-btn { padding: 8px 14px; font-size: 0.8rem; }
            .tab-btn .count { padding: 2px 6px; }
            table { min-width: 700px; font-size: 0.8rem; }
            th, td { padding: 10px 4px; }
            .icon-btn { width: 30px; height: 30px; }
            .controls-row { flex-direction: column; align-items: stretch; }
            .date-picker-wrapper { width: 100%; }
        }
    </style>
</head>
<body>
<div class="container">
    <header class="app-header">
        <div class="logo">
            <h2><i class="fas fa-calendar-check" style="color:var(--primary); margin-left:8px;"></i>سُكُون · الممرض</h2>
        </div>
        <div class="header-actions">
            <span id="welcomeMessage" style="font-weight:600;"></span>
            <button class="btn btn-primary" id="openModalBtn"><i class="fas fa-plus"></i> حجز</button>
            <button class="btn btn-outline" id="logoutBtn"><i class="fas fa-sign-out-alt"></i> خروج</button>
        </div>
    </header>

    <!-- صف الأطباء وأداة اليوم -->
    <div class="controls-row">
        <div id="doctorsToolbar" class="doctors-toolbar"></div>
        <div class="date-picker-wrapper">
            <button class="today-btn" id="todayBtn"><i class="fas fa-calendar-alt"></i> اليوم</button>
            <input type="date" id="filterDateInput" class="date-input">
        </div>
    </div>

    <!-- تبويبات مع عداد -->
    <div class="tabs-container">
        <button class="tab-btn active" data-tab="waiting"><i class="fas fa-hourglass-half"></i> قيد الانتظار <span id="waitingTabCount" class="count">0</span></button>
        <button class="tab-btn" data-tab="inprogress"><i class="fas fa-stethoscope"></i> قيد الكشف <span id="inProgressTabCount" class="count">0</span></button>
        <button class="tab-btn" data-tab="done"><i class="fas fa-check-circle"></i> منتهي <span id="doneTabCount" class="count">0</span></button>
    </div>

    <!-- جدول الحجوزات (بدون العمر والهاتف) -->
    <div class="table-wrapper">
        <table>
            <thead>
                <tr><th>#</th><th>المريض</th><th>التاريخ</th><th>الوقت</th><th>الحالة</th><th>إجراءات</th></tr>
            </thead>
            <tbody id="bookingsBody"><tr><td colspan="6" class="empty-state"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</td></tr>
        </table>
    </div>
</div>

<!-- مودال حجز / تعديل (يبقى العمر والهاتف موجودين) -->
<div id="bookingModal" class="modal">
    <div class="modal-card">
        <div class="modal-header">
            <h3 id="modalTitle"><i class="fas fa-calendar-plus"></i> حجز موعد جديد</h3>
            <button class="close-btn" id="closeModalBtn">&times;</button>
        </div>
        <div class="modal-body">
            <form id="bookingForm">
                <input type="hidden" id="editBookingId">
                <div class="form-group">
                    <label>الطبيب *</label>
                    <select id="bookingDoctorSelect" class="form-control" required></select>
                </div>
                <div class="form-group">
                    <label>البحث عن مريض</label>
                    <input type="text" id="patientSearch" class="form-control" placeholder="اكتب اسم أو رقم الهاتف..." autocomplete="off">
                    <div id="searchResults" class="search-results"></div>
                </div>
                <div class="form-group">
                    <label>اسم المريض *</label>
                    <input type="text" id="patientName" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>العمر</label>
                    <input type="number" id="patientAge" class="form-control" min="0" max="150">
                </div>
                <div class="form-group">
                    <label>رقم الهاتف</label>
                    <input type="tel" id="patientPhone" class="form-control">
                </div>
                <div class="form-group">
                    <label>تاريخ الموعد *</label>
                    <input type="date" id="appointmentDate" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>الوقت *</label>
                    <input type="time" id="appointmentTime" class="form-control" required>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;" id="submitBtn">تأكيد الحجز</button>
                <p id="formAlert" style="color:var(--danger); text-align:center; margin-top:12px;"></p>
            </form>
        </div>
    </div>
</div>

<!-- استدعاء ملف الجافاسكريبت الخارجي -->
<script type="module" src="nurse-dashboard.js"></script>
</body>
</html>
