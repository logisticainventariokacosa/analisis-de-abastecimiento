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
      <div class="tienda-selector">
        <span class="label">🏷️ Tienda</span>
        <select id="dash-tienda">
          ${opcionesTienda}
        </select>
        <span style="font-size:12px; color:var(--texto-claro); margin-left:auto;">
          Último análisis
        </span>
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
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Descripción</th>
              <th>Clase</th>
              <th>A pedir</th>
            </tr>
          </thead>
          <tbody>
            ${ordenado.map(m => `
              <tr>
                <td>${m.codigo}</td>
                <td>${m.descripcion}</td>
                <td><span class="clase-badge clase-${m.clase.toLowerCase()}">${m.clase}</span></td>
                <td><strong>${m.aPedir}</strong></td>
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
