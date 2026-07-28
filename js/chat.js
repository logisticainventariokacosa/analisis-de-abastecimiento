// js/chat.js
import { callBridge } from "./bridge.js";
import { nombrePorId } from "./tiendas.js";

let historial = []; // [{rol: "usuario"|"agente", texto}]
let abierto = false;

function construirUI() {
  const boton = document.createElement("button");
  boton.id = "chat-boton-flotante";
  boton.innerHTML = '<i class="fa-solid fa-comment-dots"></i>';
  boton.title = "Hablar con el agente de abastecimiento";
  document.body.appendChild(boton);

  const panel = document.createElement("div");
  panel.id = "chat-panel";
  panel.className = "oculto";
  panel.innerHTML = `
    <div class="chat-header">
      <div class="chat-header-info">
        <div class="chat-header-icono"><i class="fa-solid fa-robot"></i></div>
        <div>
          <div class="chat-titulo">Agente de Abastecimiento</div>
          <div class="chat-subtitulo" id="chat-contexto-info">Hola</div>
        </div>
      </div>
      <button id="chat-cerrar" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="chat-mensajes" id="chat-mensajes">
      <div class="chat-msg chat-msg-agente">
        Hola, soy tu asistente de análisis de datos y abastecimiento. Genera o carga un análisis y pregúntame lo que necesites saber sobre los resultados.
      </div>
    </div>
    <form id="chat-form" class="chat-form">
      <input type="text" id="chat-input" placeholder="Escribe tu pregunta..." autocomplete="off">
      <button type="submit"><i class="fa-solid fa-paper-plane"></i></button>
    </form>
  `;
  document.body.appendChild(panel);

  boton.addEventListener("click", () => alternarPanel(true));
  document.getElementById("chat-cerrar").addEventListener("click", () => alternarPanel(false));
  document.getElementById("chat-form").addEventListener("submit", enviarPregunta);
}

function alternarPanel(mostrar) {
  abierto = mostrar;
  const panel = document.getElementById("chat-panel");
  panel.classList.toggle("oculto", !mostrar);
  actualizarContextoInfo();
}

function actualizarContextoInfo() {
  const info = document.getElementById("chat-contexto-info");
  const usuario = window.KACOSA?.usuario;
  const nombreCompleto = usuario?.nombre || usuario?.displayName || usuario?.email || "";
  const primerNombre = nombreCompleto ? nombreCompleto.trim().split(" ")[0] : "";

  info.textContent = primerNombre ? `Hola, ${primerNombre}` : "Hola";
}

function agregarMensaje(texto, rol) {
  const cont = document.getElementById("chat-mensajes");
  const div = document.createElement("div");
  div.className = "chat-msg " + (rol === "agente" ? "chat-msg-agente" : "chat-msg-usuario");
  div.textContent = texto;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
}

async function enviarPregunta(e) {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const pregunta = input.value.trim();
  if (!pregunta) return;

  agregarMensaje(pregunta, "usuario");
  historial.push({ rol: "usuario", texto: pregunta });
  input.value = "";

  const cont = document.getElementById("chat-mensajes");
  const cargando = document.createElement("div");
  cargando.className = "chat-msg chat-msg-agente chat-cargando";
  cargando.textContent = "Escribiendo...";
  cont.appendChild(cargando);
  cont.scrollTop = cont.scrollHeight;

  const analisis = window.KACOSA?.ultimoAnalisis;
  const alertasKacosa = window.KACOSA?.ultimasAlertasKacosa || [];
  const dashboardAnalisis = window.KACOSA?.ultimoDashboardAnalisis;
  const misTiendas = window.KACOSA?.tiendas || [];
  const tiendasUsuario = misTiendas.includes("TODAS")
    ? "TODAS (acceso administrativo a las 12 tiendas)"
    : misTiendas.map(id => nombrePorId(id)).join(", ");

  const contexto = { tiendasUsuario };

  // Contexto de "Nuevo Análisis" (si hay uno recién generado en esta sesión)
  if (analisis) {
    contexto.tienda = nombrePorId(analisis.tienda);
    contexto.fechaAnalisis = analisis.fechaAnalisis;
    contexto.periodo = analisis.periodo;
    contexto.margenPct = analisis.margenPct;
    contexto.resumen = {
      totalAPedir: analisis.materiales.reduce((acc, m) => acc + m.aPedir, 0),
      quiebresKacosa: analisis.materiales.filter(m => m.stockKacosa <= 0 && m.aPedir === 0).length
    };
    contexto.materiales = analisis.materiales;
  }

  // Contexto de "Alertas Kacosa" (si se ha corrido un análisis de stock Kacosa)
  if (alertasKacosa.length > 0) {
    contexto.alertasKacosa = alertasKacosa.slice(0, 250).map(a => ({
      codigo: a.codigo,
      descripcion: a.descripcion,
      clase: a.clase,
      stockKacosa: a.stockKacosa,
      totalAPedir: a.totalAPedir,
      proyeccionCompra: a.proyeccionCompra,
      tipo: a.tipo,
      periodoDeAbastecimiento: a.periodoDeAbastecimiento
    }));
    contexto.totalAlertasKacosa = alertasKacosa.length;
  }

  // Contexto del "Dashboard" (último análisis guardado en Sheets para la tienda vista)
  if (dashboardAnalisis) {
    contexto.dashboard = {
      tienda: nombrePorId(dashboardAnalisis.tienda),
      fechaAnalisis: dashboardAnalisis.fechaAnalisis,
      materiales: dashboardAnalisis.materiales
    };
  }

  const resp = await callBridge("chatConsulta", {
    pregunta,
    historial: historial.slice(-10), // últimos turnos para no crecer indefinidamente
    contexto
  });

  cargando.remove();

  const respuesta = resp.ok ? resp.respuesta : "No pude responder: " + resp.error;
  agregarMensaje(respuesta, "agente");
  historial.push({ rol: "agente", texto: respuesta });
}

document.addEventListener("kacosa:analisis-listo", actualizarContextoInfo);
document.addEventListener("kacosa:usuario-listo", actualizarContextoInfo);
document.addEventListener("DOMContentLoaded", construirUI);
// Por si el script carga después de DOMContentLoaded
if (document.readyState !== "loading") construirUI();
