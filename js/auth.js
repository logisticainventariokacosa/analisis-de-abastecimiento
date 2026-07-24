import { auth, db, googleProvider } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { mostrarLoader, ocultarLoader } from "./loader.js";

// Revisa si el correo está en la colección de autorizados
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
    await signOut(auth);
    ocultarLoader();
    mostrarError("Este correo no está autorizado para acceder al sistema.");
    return;
  }
  mostrarLoader("Entrando...");
  window.location.href = "app.html";
}

// --- Login con correo/contraseña ---
const formLogin = document.getElementById("form-login");
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

// --- Registro ---
const formRegistro = document.getElementById("form-registro");
if (formRegistro) {
  formRegistro.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("reg-email").value.trim();
    const pass = document.getElementById("reg-password").value;
    const pass2 = document.getElementById("reg-password2").value;

    if (pass !== pass2) {
      mostrarError("Las contraseñas no coinciden.");
      return;
    }

    mostrarLoader("Verificando correo autorizado...");
    const autorizado = await correoAutorizado(email);
    if (!autorizado) {
      ocultarLoader();
      mostrarError("Este correo no está autorizado para registrarse.");
      return;
    }

    try {
      mostrarLoader("Creando cuenta...");
      await createUserWithEmailAndPassword(auth, email, pass);
      mostrarLoader("Entrando...");
      window.location.href = "app.html";
    } catch (err) {
      ocultarLoader();
      mostrarError(err.code === "auth/email-already-in-use"
        ? "Ese correo ya tiene una cuenta. Inicia sesión."
        : "No se pudo crear la cuenta. Verifica los datos.");
    }
  });
}

// --- Login con Google (POPUP - más confiable que redirect) ---
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
        await signOut(auth);
        irAlLogin();
      } else {
        const nombreEl = document.getElementById("usuario-actual");
        if (nombreEl) nombreEl.textContent = user.email;
      }
      return;
    }

    // Si no hay usuario y estamos en app.html, redirigir al login
    if (window.location.pathname.includes("app.html")) {
      setTimeout(() => {
        if (!auth.currentUser) irAlLogin();
      }, 500);
    }
  });
}

export function cerrarSesion() {
  signOut(auth).then(() => window.location.href = "index.html");
}
