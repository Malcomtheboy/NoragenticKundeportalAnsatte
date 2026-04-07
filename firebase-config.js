import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyB-0bWNNs2LgzAm48-Kymlzu1aEzWQXiNw",
    authDomain: "noragenticportal.firebaseapp.com",
    databaseURL: "https://noragenticportal-default-rtdb.europe-west1.firebasedatabase.app/",
    projectId: "noragenticportal",
    storageBucket: "noragenticportal.firebasestorage.app",
    messagingSenderId: "662374310916",
    appId: "1:662374310916:web:a3a5d708bdd380a7210151",
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database };