// js/alertas-kacosa.js
import { parsearMHT, aNumero } from "./mht-parser.js";
import { callBridge } from "./bridge.js";

const CENTROS_KACOSA = ["1000", "3000"];

function render() {
  const cont = document.getElementById("alertas-kacosa-contenido");
  if (!cont) return;

  cont.innerHTML = `
    <div class="card">
      <label for="input-stock-kacosa" style="margin-top:0">Archivo de stock de Kacosa (.MHT)</label>
      <input type="file" id="input-stock-kacosa" accept=".mht,.MHT">
      <button id="btn-analizar-kacosa" class="btn-primario" style="margin-top:16px;max-width:260px">
        Analizar stock
      </button>
      <p id="estado-alertas" class="vista-sub" style="margin-top:12px"></p>
    </div>
    <div id="resultado-alertas"></div>
  `;

  document.getElementById("btn-analizar-kacosa").addEventListener("click", procesarArchivo);
}

async function procesarArchivo() {
  const input = document.getElementById("input-stock-kacosa");
  const estado = document.getElementById("estado-alertas");
  const resultado = document.getElementById("resultado-alertas");
  resultado.innerHTML = "";

  if (!input.files || input.files.length === 0) {
    estado.textContent = "Selecciona el archivo de stock de Kacosa primero.";
    return;
  }

  try {
    estado.textContent = "Leyendo archivo...";
    const texto = await input.files[0].text();
    const filas = parsearMHT(texto);

    if (filas.length === 0) {
      estado.textContent = "El archivo no contiene datos reconocibles.";
      return;
    }

    estado.textContent = "Agrupando stock por material...";
    const stockPorMaterial = agruparStockKacosa(filas);

    estado.textContent = "Cruzando contra Alta Rotación y los últimos análisis de las 12 tiendas...";
    const resp = await callBridge("alertasKacosa", { stockKacosa: stockPorMaterial });

    if (!resp.ok) {
      estado.textContent = "Error: " + resp.error;
      return;
    }

    estado.textContent = `Listo — ${resp.alertas.length} alerta(s) encontrada(s).`;
    mostrarAlertas(resp.alertas);

  } catch (err) {
    estado.textContent = "Error al procesar el archivo: " + err.message;
  }
}

/**
 * Agrupa las filas del stock de Kacosa por código de material,
 * sumando los 2 centros (1000 y 3000, que son la misma casa matriz)
 * y todos sus almacenes. Solo cuenta como disponible:
 * Libre utilización + Trans./Trasl. + Devoluciones
 * (En control calidad y Bloqueado NO se cuentan).
 */
function agruparStockKacosa(filas) {
  const mapa = {};

  filas.forEach(f => {
    const centro = String(f["Centro"] || "").trim();
    if (!CENTROS_KACOSA.includes(centro)) return;

    const codigo = String(f["Material"] || "").trim();
    if (!codigo) return;

    const libreUtilizacion = aNumero(f["Libre utilización"]);
    const transTrasl = aNumero(f["Trans./Trasl."]);
    const devoluciones = aNumero(f["Devoluciones"]);
    const disponible = libreUtilizacion + transTrasl + devoluciones;

    if (!mapa[codigo]) {
      mapa[codigo] = {
        codigo: codigo,
        descripcion: f["Texto breve de material"] || "",
        stockDisponible: 0
      };
    }
    mapa[codigo].stockDisponible += disponible;
  });

  return Object.values(mapa);
}

function mostrarAlertas(alertas) {
  const resultado = document.getElementById("resultado-alertas");

  if (alertas.length === 0) {
    resultado.innerHTML = `<div class="card"><p class="vista-sub">No hay alertas — todo el stock de alta rotación está cubierto. 🎉</p></div>`;
    return;
  }

  const sinStock = alertas.filter(a => a.tipo === "SIN_STOCK");
  const stockBajo = alertas.filter(a => a.tipo === "STOCK_BAJO");

  resultado.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card rojo">
        <div class="label">Sin stock en Kacosa</div>
        <div class="valor">${sinStock.length}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Stock insuficiente</div>
        <div class="valor">${stockBajo.length}</div>
      </div>
    </div>
    <div class="card">
      <table style="width:100%; border-collapse:collapse; font-size:13px">
        <thead>
          <tr style="text-align:left; border-bottom:2px solid var(--borde)">
            <th style="padding:8px 6px">Código</th>
            <th style="padding:8px 6px">Descripción</th>
            <th style="padding:8px 6px">Clase</th>
            <th style="padding:8px 6px">Stock Kacosa</th>
            <th style="padding:8px 6px">A pedir (todas las tiendas)</th>
            <th style="padding:8px 6px">Alerta</th>
          </tr>
        </thead>
        <tbody>
          ${alertas.map(a => `
            <tr style="border-bottom:1px solid var(--borde)">
              <td style="padding:8px 6px">${a.codigo}</td>
              <td style="padding:8px 6px">${a.descripcion}</td>
              <td style="padding:8px 6px">${a.clase}</td>
              <td style="padding:8px 6px">${a.stockKacosa}</td>
              <td style="padding:8px 6px">${a.totalAPedir}</td>
              <td style="padding:8px 6px">
                <span style="color:${a.tipo === 'SIN_STOCK' ? 'var(--rojo-alerta)' : 'var(--ambar-oscuro)'}; font-weight:700">
                  ${a.tipo === 'SIN_STOCK' ? 'Sin stock' : 'Stock bajo'}
                </span>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// Renderiza la primera vez que se entra a esta vista
document.addEventListener("kacosa:vista-cambiada", (e) => {
  if (e.detail.vista === "vista-alertas-kacosa") render();
});
