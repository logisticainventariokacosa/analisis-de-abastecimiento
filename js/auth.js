import { auth, db, googleProvider } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

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
  const autorizado = await correoAutorizado(user.email);
  if (!autorizado) {
    await signOut(auth);
    mostrarError("Este correo no está autorizado para acceder al sistema.");
    return;
  }
  window.location.href = "app.html";
}

// --- Login con correo/contraseña ---
const formLogin = document.getElementById("form-login");
if (formLogin) {
  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const pass = document.getElementById("login-password").value;
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      await validarYRedirigir(cred.user);
    } catch (err) {
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

    // Primero verificamos si el correo está autorizado ANTES de crear la cuenta
    const autorizado = await correoAutorizado(email);
    if (!autorizado) {
      mostrarError("Este correo no está autorizado para registrarse.");
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      window.location.href = "app.html";
    } catch (err) {
      mostrarError(err.code === "auth/email-already-in-use"
        ? "Ese correo ya tiene una cuenta. Inicia sesión."
        : "No se pudo crear la cuenta. Verifica los datos.");
    }
  });
}

// --- Login con Google (redirección, evita el problema de COOP con popups) ---
const btnGoogle = document.getElementById("btn-google");
if (btnGoogle) {
  btnGoogle.addEventListener("click", async () => {
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      mostrarError("No se pudo iniciar sesión con Google.");
    }
  });
}

// Al volver de la redirección de Google, procesa el resultado
getRedirectResult(auth).then(async (cred) => {
  if (cred && cred.user) {
    await validarYRedirigir(cred.user);
  }
}).catch(() => {
  mostrarError("No se pudo completar el inicio de sesión con Google.");
});

// --- Protección de app.html: si no hay sesión válida, regresa al login ---
export function protegerPagina() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    const autorizado = await correoAutorizado(user.email);
    if (!autorizado) {
      await signOut(auth);
      window.location.href = "index.html";
    } else {
      const nombreEl = document.getElementById("usuario-actual");
      if (nombreEl) nombreEl.textContent = user.email;
    }
  });
}

export function cerrarSesion() {
  signOut(auth).then(() => window.location.href = "index.html");
}
