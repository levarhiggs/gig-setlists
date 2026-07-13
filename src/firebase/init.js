import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "AIzaSyDtSLg4KEfvvMxgQpYN79GPP8pRfqUPU1I",
  authDomain:        "gig-setlists.firebaseapp.com",
  projectId:         "gig-setlists",
  storageBucket:     "gig-setlists.firebasestorage.app",
  messagingSenderId: "866626505344",
  appId:             "1:866626505344:web:a6175d66c4ad0bdd0af465",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
