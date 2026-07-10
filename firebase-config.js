// ملف تكوين Firebase المنفصل
// firebase-config.js

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDosyySkPDI-uCQzHOk7jTDUFp2U2jQAzo",
    authDomain: "i-excelled.firebaseapp.com",
    databaseURL: "https://i-excelled-default-rtdb.firebaseio.com",
    projectId: "i-excelled",
    storageBucket: "i-excelled.firebasestorage.app",
    messagingSenderId: "872523261091",
    appId: "1:872523261091:web:0d8bb389f377752cb84b16",
    measurementId: "G-DLN1FG2Y4D"
};

// تعريض التكوين للمتغير العام
window.FIREBASE_CONFIG = FIREBASE_CONFIG;

// يمكنك أيضاً تصديره إذا كنت تستخدم ES modules
export default FIREBASE_CONFIG;
