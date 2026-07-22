// js/nav.js
import { auth, db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { protegerPagina, cerrarSesion } from "./auth.js";
import { nombrePorId } from "./tiendas.js";

// Estado global simple de la app (accesible desde otros módulos vía window.KACOSA)
window.KACOSA = {
  usuario: null,
  tiendas: [],       // array de IDs de tienda que puede ver el usuario, o ["TODAS"]
  tiendaActiva: null  // tienda actualmente seleccionada en el dashboard
};

protegerPagina();

// Espera a que se confirme la sesión para cargar los datos del usuario (tiendas permitidas)
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  window.KACOSA.usuario = user;

  const ref = doc(db, "usuarios_autorizados", user.email.toLowerCase());
  const snap = await getDoc(ref);
  const datos = snap.exists() ? snap.data() : {};
  const tiendas = datos.tiendas || [];
  window.KACOSA.tiendas = tiendas;
  window.KACOSA.tiendaActiva = tiendas.includes("TODAS") ? null : tiendas[0] || null;

  // "Alertas Kacosa" es solo para perfiles con acceso a TODAS las tiendas
  const btnAlertas = document.querySelector('[data-vista="vista-alertas-kacosa"]');
  if (btnAlertas && !tiendas.includes("TODAS")) {
    btnAlertas.style.display = "none";
  }

  document.dispatchEvent(new CustomEvent("kacosa:usuario-listo"));
});

// --- Menú hamburguesa (móvil) ---
const btnHamburguesa = document.getElementById("btn-hamburguesa");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay-sidebar");

function abrirMenu() {
  sidebar.classList.add("abierto");
  overlay.classList.add("visible");
}
function cerrarMenu() {
  sidebar.classList.remove("abierto");
  overlay.classList.remove("visible");
}

if (btnHamburguesa) btnHamburguesa.addEventListener("click", abrirMenu);
if (overlay) overlay.addEventListener("click", cerrarMenu);

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

// --- Cerrar sesión ---
const btnSalir = document.getElementById("btn-cerrar-sesion");
if (btnSalir) btnSalir.addEventListener("click", cerrarSesion);
