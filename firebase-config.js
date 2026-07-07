<script type="module">
  // استيراد الدوال المطلوبة من مكتبات Firebase
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-analytics.js";
  import { getDatabase } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";
  import { getAuth } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
  import { getStorage } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";

  // إعدادات Firebase الخاصة بمشروع "pharmacy"
  const firebaseConfig = {
    apiKey: "AIzaSyDpauwBjKHzaRC0Rw87W_-tZaEnGhONzOc",
    authDomain: "pharmacy-8bc6b.firebaseapp.com",
    databaseURL: "https://pharmacy-8bc6b-default-rtdb.firebaseio.com",
    projectId: "pharmacy-8bc6b",
    storageBucket: "pharmacy-8bc6b.firebasestorage.app",
    messagingSenderId: "718471229146",
    appId: "1:718471229146:web:2a524ae736817b66ccbfe3",
    measurementId: "G-S4ZMPLD557"
  };

  // تهيئة Firebase
  const app = initializeApp(firebaseConfig);
  
  // تهيئة الخدمات
  const analytics = getAnalytics(app);
  const database = getDatabase(app);
  const auth = getAuth(app);
  const storage = getStorage(app);

  // يمكنك تصدير هذه الثوابت لاستخدامها في ملفات أخرى إذا لزم الأمر
  export { app, analytics, database, auth, storage };
</script>
