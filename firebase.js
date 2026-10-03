import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Replace these values with the Firebase web-app config from your new project.
// This is not a service-account key; never put private keys in browser code.
const firebaseConfig = {
  apiKey: "AIzaSyABKkEv1-AgvIU3334nutn-z_n1-KJjhQk",
  authDomain: "cypher-f8088.firebaseapp.com",
  projectId: "cypher-f8088",
  storageBucket: "cypher-f8088.firebasestorage.app",
  messagingSenderId: "730419127910",
  appId: "1:730419127910:web:e4c4988a34e6060c27afa7",
};
if (Object.values(firebaseConfig).some(value => value.startsWith("PASTE_"))) {
    throw new Error("Firebase config is not set. Replace the placeholders in firebase.js.");
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
