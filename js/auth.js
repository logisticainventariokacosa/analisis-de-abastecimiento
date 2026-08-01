import { auth, db, googleProvider } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { mostrarLoader, ocultarLoader } from "./loader.js";

// Revisa si el correo está en la colección de autorizados (de ESTA app)
async function correoAutorizado(email) {
  const ref = doc(db, "usuarios_autorizados", email.toLowerCase());
  const snap = await getDoc(ref);
  return snap.exists() && snap.data().activo === true;
}

function mostrarError(msg) {
  const el = document.getElementById("mensaje-error");
  if (el) { el.textContent = msg; el.style.display = "block"; }
}

async function validarYRedirigir(user) {
  mostrarLoader("Verificando acceso...");
  const autorizado = await correoAutorizado(user.email);
  if (!autorizado) {
    // No se cierra la sesión: es compartida con el portal y otras apps.
    ocultarLoader();
    mostrarError("Tu cuenta no tiene acceso a este módulo. Contacta al administrador.");
    return;
  }
  mostrarLoader("Entrando...");
  window.location.href = "app.html";
}

const formLogin = document.getElementById("form-login");

// --- Si ya hay sesión activa (ej. viniendo del portal), entra directo sin pedir login ---
if (formLogin) {
  onAuthStateChanged(auth, (user) => {
    if (user) validarYRedirigir(user);
  });
}

// --- Login con correo/contraseña ---
if (formLogin) {
  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const pass = document.getElementById("login-password").value;
    mostrarLoader("Iniciando sesión...");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      await validarYRedirigir(cred.user);
    } catch (err) {
      ocultarLoader();
      mostrarError("Correo o contraseña incorrectos.");
    }
  });
}

// --- Login con Google ---
const btnGoogle = document.getElementById("btn-google");
if (btnGoogle) {
  btnGoogle.addEventListener("click", async () => {
    mostrarLoader("Conectando con Google...");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await validarYRedirigir(result.user);
    } catch (err) {
      ocultarLoader();
      if (err.code === "auth/popup-closed-by-user") {
        mostrarError("Cerraste la ventana de Google. Inténtalo de nuevo.");
      } else {
        mostrarError("Google - " + err.code + ": " + err.message);
      }
    }
  });
}

// --- Protección de app.html ---
export function protegerPagina() {
  let yaRedirigido = false;
  const irAlLogin = () => {
    if (yaRedirigido) return;
    yaRedirigido = true;
    window.location.href = "index.html";
  };

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const autorizado = await correoAutorizado(user.email);
      if (!autorizado) {
        irAlLogin(); // sin signOut: no se destruye la sesión compartida
      } else {
        const nombreEl = document.getElementById("usuario-actual");
        if (nombreEl) nombreEl.textContent = user.email;
      }
      return;
    }
    if (window.location.pathname.includes("app.html")) {
      setTimeout(() => { if (!auth.currentUser) irAlLogin(); }, 500);
    }
  });
}

export function cerrarSesion() {
  signOut(auth).then(() => window.location.href = "index.html");
}
