// firebase-config.js
// إعدادات Firebase لمشروع "شفاء"

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-analytics.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";

// إعدادات Firebase
export const firebaseConfig = {
    apiKey: "AIzaSyAfYqB_0OcQcnYvxP6C0J4cuViY6EmLE8U",
    authDomain: "fast-sokon.firebaseapp.com",
    databaseURL: "https://fast-sokon-default-rtdb.firebaseio.com",
    projectId: "fast-sokon",
    storageBucket: "fast-sokon.firebasestorage.app",
    messagingSenderId: "45959507911",
    appId: "1:45959507911:web:e78de78f4a928062dff3e2",
    measurementId: "G-2R52W7Q4CE"
};

