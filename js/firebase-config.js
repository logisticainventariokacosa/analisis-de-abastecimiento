/ Configuración pública del cliente de Firebase (no es sensible, es del lado cliente)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAaqehmbIh3uf6uNH2rDBD_58t5WW4sOyc",
  authDomain: "kacosa-abastecimiento.firebaseapp.com",
  projectId: "kacosa-abastecimiento",
  storageBucket: "kacosa-abastecimiento.firebasestorage.app",
  messagingSenderId: "1016290618839",
  appId: "1:1016290618839:web:1b0d8839a57560309f6f92"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
