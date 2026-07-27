// js/nav.js
import { auth, db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { protegerPagina, cerrarSesion } from "./auth.js";
import { nombrePorId } from "./tiendas.js";
import { mostrarLoader, ocultarLoader } from "./loader.js";

mostrarLoader("Verificando sesión...");

// Estado global simple de la app (accesible desde otros módulos vía window.KACOSA)
window.KACOSA = {
  usuario: null,
  tiendas: [],       // array de IDs de tienda que puede ver el usuario, o ["TODAS"]
  tiendaActiva: null  // tienda actualmente seleccionada en el dashboard
};

protegerPagina();

// Espera a que se confirme la sesión para cargar los datos del usuario (tiendas permitidas)
onAuthStateChanged(auth, async (user) => {
  if (!user) return; // protegerPagina() ya se encarga de redirigir al login

  const ref = doc(db, "usuarios_autorizados", user.email.toLowerCase());
  const snap = await getDoc(ref);
  const datos = snap.exists() ? snap.data() : {};
  const tiendas = datos.tiendas || [];
  const nombre = datos.nombre || user.displayName || user.email || "";

  window.KACOSA.usuario = {
    email: user.email,
    nombre: nombre,
    displayName: nombre,
    ...user
  };
  
  window.KACOSA.tiendas = tiendas;
  window.KACOSA.tiendaActiva = tiendas.includes("TODAS") ? null : tiendas[0] || null;

  // Actualizar información del usuario en el sidebar
  actualizarUsuarioSidebar();

  // "Alertas Kacosa" es solo para perfiles con acceso a TODAS las tiendas
  const btnAlertas = document.querySelector('[data-vista="vista-alertas-kacosa"]');
  if (btnAlertas && !tiendas.includes("TODAS")) {
    btnAlertas.style.display = "none";
  }

  // Actualizar modal de usuario
  const nombreEl = document.getElementById("user-modal-nombre");
  const correoEl = document.getElementById("user-modal-correo");
  if (nombreEl) nombreEl.textContent = nombre;
  if (correoEl) correoEl.textContent = user.email;

  document.dispatchEvent(new CustomEvent("kacosa:usuario-listo"));
  ocultarLoader();
});

function actualizarUsuarioSidebar() {
  const u = window.KACOSA?.usuario;
  const nombreEl = document.getElementById("sidebar-user-nombre");
  const emailEl = document.getElementById("sidebar-user-email");
  
  if (nombreEl) nombreEl.textContent = u?.nombre || u?.displayName || u?.email || "Usuario";
  if (emailEl) emailEl.textContent = u?.email || "";
}

// --- Menú hamburguesa: abre y cierra con el mismo botón, o tocando fuera ---
const btnHamburguesa = document.getElementById("btn-hamburguesa");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay-sidebar");

function abrirMenu() {
  sidebar.classList.add("abierto");
  overlay.classList.add("visible");
  if (btnHamburguesa) btnHamburguesa.classList.add("activo");
}
function cerrarMenu() {
  sidebar.classList.remove("abierto");
  overlay.classList.remove("visible");
  if (btnHamburguesa) btnHamburguesa.classList.remove("activo");
}
function alternarMenu() {
  if (sidebar.classList.contains("abierto")) cerrarMenu(); else abrirMenu();
}

if (btnHamburguesa) btnHamburguesa.addEventListener("click", alternarMenu);
if (overlay) overlay.addEventListener("click", cerrarMenu);

// --- Modal de cuenta de usuario (avatar en el header) ---
const btnUserAvatar = document.getElementById("btn-user-avatar");
const overlayUserModal = document.getElementById("overlay-user-modal");
const btnUserCancelar = document.getElementById("btn-user-cancelar");
const btnUserCerrarSesion = document.getElementById("btn-user-cerrar-sesion");

function abrirModalUsuario() {
  const u = window.KACOSA?.usuario;
  const nombreEl = document.getElementById("user-modal-nombre");
  const correoEl = document.getElementById("user-modal-correo");
  if (nombreEl) nombreEl.textContent = (u?.nombre || u?.displayName || u?.email || "Usuario");
  if (correoEl) correoEl.textContent = u?.email || "";
  if (overlayUserModal) overlayUserModal.classList.add("visible");
}
function cerrarModalUsuario() {
  if (overlayUserModal) overlayUserModal.classList.remove("visible");
}

if (btnUserAvatar) btnUserAvatar.addEventListener("click", abrirModalUsuario);
if (btnUserCancelar) btnUserCancelar.addEventListener("click", cerrarModalUsuario);
if (overlayUserModal) {
  overlayUserModal.addEventListener("click", (e) => {
    if (e.target === overlayUserModal) cerrarModalUsuario();
  });
}

// --- Cerrar sesión desde el sidebar y desde el modal ---
document.getElementById("btn-sidebar-cerrar-sesion")?.addEventListener("click", cerrarSesion);
if (btnUserCerrarSesion) btnUserCerrarSesion.addEventListener("click", cerrarSesion);

// --- Cambio de vista ---
const botonesNav = document.querySelectorAll("[data-vista]");
const vistas = document.querySelectorAll(".vista");

function mostrarVista(idVista) {
  vistas.forEach(v => v.classList.toggle("activa", v.id === idVista));
  botonesNav.forEach(b => b.classList.toggle("activo", b.dataset.vista === idVista));
  cerrarMenu();
  document.dispatchEvent(new CustomEvent("kacosa:vista-cambiada", { detail: { vista: idVista } }));
}

botonesNav.forEach(btn => {
  btn.addEventListener("click", () => mostrarVista(btn.dataset.vista));
});

// Vista inicial
mostrarVista("vista-dashboard");
