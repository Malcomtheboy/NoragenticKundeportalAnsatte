import { database } from "./firebase-config.js";
import { ref, push, onValue } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

const chatBox = document.getElementById("chatMessages");
const form = document.getElementById("chatForm");
const input = document.getElementById("chatInput");
const testBtn = document.getElementById("testBtn");

// 🔑 chat path
const chatRef = ref(database, "chats/prosjekt1");

// 🔥 SEND MELDING
form.addEventListener("submit", (e) => {
    e.preventDefault();

    const text = input.value.trim();
    if (!text) return;

    push(chatRef, {
        text: text,
        sender: "ansatt",
        time: Date.now()
    });

    input.value = "";
});

// ⚡ LIVE CHAT (oppdaterer automatisk)
onValue(chatRef, (snapshot) => {
    chatBox.innerHTML = "";

    snapshot.forEach(child => {
        const msg = child.val();

        const div = document.createElement("div");
        div.classList.add("msg");

        if (msg.sender === "ansatt") {
            div.classList.add("me");
        } else {
            div.classList.add("other");
        }

        div.innerText = msg.text;
        chatBox.appendChild(div);
    });

    chatBox.scrollTop = chatBox.scrollHeight;
});

// 🧪 TEST KNAPP (sjekker database)
testBtn.addEventListener("click", () => {
    push(chatRef, {
        text: "🔥 TEST FUNKER",
        sender: "system",
        time: Date.now()
    });

    alert("Test melding sendt til database!");
});