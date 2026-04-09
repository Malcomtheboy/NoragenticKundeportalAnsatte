import { database } from "./firebase-config.js";
import { ref, push, onValue } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

// 🔑 HENT prosjekt (fra knappene dine)
let currentProject = "prosjekt1";

// 🔑 HENT rolle (ENKEL TEST)
const role = localStorage.getItem("role") || "ansatt"; 
// sett "kunde" i kundeportal

// HTML
const chatBox = document.getElementById("chatMessages");
const form = document.getElementById("chatForm");
const input = document.getElementById("chatInput");
const testBtn = document.getElementById("testBtn");
let unsubscribeChat = null;


// 🔥 FUNKSJON SOM SETTER CHAT
function loadChat(projectId) {

    const chatRef = ref(database, "chats/" + projectId);
    if (unsubscribeChat) {
  unsubscribeChat();
}


    // LIVE LISTENER
    unsubscribeChat = onValue(chatRef, (snapshot) => {
        chatBox.innerHTML = "";

        if (!snapshot.exists()) return;

        snapshot.forEach(child => {
            const msg = child.val();

            const div = document.createElement("div");
            div.classList.add("msg");

            if (msg.sender === role) {
                div.classList.add("me");
            } else {
                div.classList.add("other");
            }

            div.innerText = msg.text;
            chatBox.appendChild(div);
        });

        chatBox.scrollTop = chatBox.scrollHeight;
    });

    // SEND
    form.onsubmit = (e) => {
        e.preventDefault();

        const text = input.value.trim();
        if (!text) return;

        push(chatRef, {
            text: text,
            sender: role,
            time: Date.now()
        });

        input.value = "";
    };

    // TEST
    testBtn.onclick = () => {
        push(chatRef, {
            text: "🔥 TEST " + role,
            sender: "system",
            time: Date.now()
        });
    };
}

// 🚀 LAST INN DEFAULT
loadChat(currentProject);


// 🔥 KOBLE TIL DINE PROSJEKT-KNAPPER
document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {

        const project = btn.dataset.project;

        if (!project) return;

        currentProject = project;

        // reload chat
        loadChat(project);
    });
});