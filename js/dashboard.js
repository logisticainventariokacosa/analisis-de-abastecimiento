// js/dashboard.js
import { callBridge } from "./bridge.js";
import { TIENDAS, nombrePorId } from "./tiendas.js";

let tiendaSeleccionada = null;

function tiendasDelUsuario() {
  return window.KACOSA?.tiendas || [];
}

async function render() {
  const cont = document.getElementById("dashboard-contenido");
  if (!cont) return;

  const misTiendas = tiendasDelUsuario();
  if (misTiendas.length === 0) {
    cont.innerHTML = `<p class="vista-sub">Cargando información del usuario...</p>`;
    return;
  }

  const tieneVariasTiendas = misTiendas.includes("TODAS") || misTiendas.length > 1;
  if (!tiendaSeleccionada) {
    tiendaSeleccionada = misTiendas.includes("TODAS") ? TIENDAS[0].id : misTiendas[0];
  }

  const opcionesTienda = misTiendas.includes("TODAS")
    ? TIENDAS.map(t => `<option value="${t.id}" ${t.id === tiendaSeleccionada ? "selected" : ""}>${t.nombre}</option>`).join("")
    : misTiendas.map(id => `<option value="${id}" ${id === tiendaSeleccionada ? "selected" : ""}>${nombrePorId(id)}</option>`).join("");

  cont.innerHTML = `
    ${tieneVariasTiendas ? `
      <div class="card" style="margin-bottom:16px">
        <label for="dash-tienda" style="margin-top:0">Tienda</label>
        <select id="dash-tienda" style="width:100%; max-width:320px; padding:11px 12px; border:1px solid var(--borde); border-radius:8px; font-size:14px; font-family:'Inter',sans-serif">
          ${opcionesTienda}
        </select>
      </div>
    ` : ""}
    <div id="dash-resultado"><p class="vista-sub">Cargando último análisis...</p></div>
  `;

  if (tieneVariasTiendas) {
    document.getElementById("dash-tienda").addEventListener("change", (e) => {
      tiendaSeleccionada = e.target.value;
      cargarAnalisis();
    });
  }

  cargarAnalisis();
}

async function cargarAnalisis() {
  const resultadoDiv = document.getElementById("dash-resultado");
  resultadoDiv.innerHTML = `<p class="vista-sub">Cargando último análisis de ${nombrePorId(tiendaSeleccionada)}...</p>`;

  const resp = await callBridge("leerAnalisis", { tienda: tiendaSeleccionada });

  if (!resp.ok) {
    resultadoDiv.innerHTML = `<p class="vista-sub">Error al cargar: ${resp.error}</p>`;
    return;
  }

  if (!resp.materiales || resp.materiales.length === 0) {
    resultadoDiv.innerHTML = `
      <div class="card">
        <p class="vista-sub" style="margin:0">
          Todavía no hay ningún análisis guardado para <strong>${nombrePorId(tiendaSeleccionada)}</strong>.
          Ve a "Nuevo Análisis" para generar el primero.
        </p>
      </div>
    `;
    return;
  }

  const materiales = resp.materiales;
  const totalAPedir = materiales.reduce((acc, m) => acc + Number(m.aPedir || 0), 0);
  const quiebres = materiales.filter(m => Number(m.stockKacosa) <= 0 && Number(m.aPedir) === 0).length;
  const porClase = { A: 0, B: 0, C: 0, D: 0 };
  materiales.forEach(m => { if (porClase[m.clase] !== undefined) porClase[m.clase]++; });

  const ordenado = materiales.slice().sort((a, b) => Number(b.aPedir) - Number(a.aPedir)).slice(0, 50);

  resultadoDiv.innerHTML = `
    <p class="vista-sub" style="margin-top:0">Último análisis: <strong>${resp.fechaAnalisis || "—"}</strong></p>
    <div class="kpi-grid">
      <div class="kpi-card verde">
        <div class="label">Total a pedir</div>
        <div class="valor">${totalAPedir}</div>
      </div>
      <div class="kpi-card rojo">
        <div class="label">Sin stock en Kacosa</div>
        <div class="valor">${quiebres}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Clase A / B / C / D</div>
        <div class="valor" style="font-size:18px">${porClase.A} / ${porClase.B} / ${porClase.C} / ${porClase.D}</div>
      </div>
    </div>
    <div class="card">
      <h3 style="margin-top:0; font-size:14px; color:var(--azul-base)">Top 50 materiales a pedir</h3>
      <div style="overflow-x:auto">
        <table style="width:100%; border-collapse:collapse; font-size:13px">
          <thead>
            <tr style="text-align:left; border-bottom:2px solid var(--borde)">
              <th style="padding:8px 6px">Código</th>
              <th style="padding:8px 6px">Descripción</th>
              <th style="padding:8px 6px">Clase</th>
              <th style="padding:8px 6px">A pedir</th>
            </tr>
          </thead>
          <tbody>
            ${ordenado.map(m => `
              <tr style="border-bottom:1px solid var(--borde)">
                <td style="padding:8px 6px">${m.codigo}</td>
                <td style="padding:8px 6px">${m.descripcion}</td>
                <td style="padding:8px 6px; font-weight:700">${m.clase}</td>
                <td style="padding:8px 6px; font-weight:700; color:var(--azul-base)">${m.aPedir}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

document.addEventListener("kacosa:usuario-listo", render);
document.addEventListener("kacosa:vista-cambiada", (e) => {
  if (e.detail.vista === "vista-dashboard") render();
});
