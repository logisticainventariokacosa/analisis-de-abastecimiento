// js/alertas-kacosa.js
import { parsearMHT, aNumero } from "./mht-parser.js";
import { callBridge } from "./bridge.js";

const CENTROS_KACOSA = ["1000", "3000"];

function render() {
  const cont = document.getElementById("alertas-kacosa-contenido");
  if (!cont) return;

  cont.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0; font-size:15px; color:var(--azul-base); display:flex; align-items:center; gap:10px">
        <span style="display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; background:var(--ambar-claro); border-radius:8px; font-size:14px">⚠️</span>
        Analizar stock de Kacosa
      </h3>

      <div style="margin-top:4px">
        <label class="form-label" for="input-stock-kacosa">Archivo de stock de Kacosa <span class="required">*</span></label>
        <div class="file-input-wrapper" id="file-wrapper-kacosa">
          <span class="file-icon">🏢</span>
          <div class="file-info">
            <div class="file-name" id="file-name-kacosa">Seleccionar archivo</div>
            <div class="file-hint">.MHT de SAP · Stock Kacosa</div>
          </div>
          <span class="file-status empty" id="file-status-kacosa">Pendiente</span>
          <input type="file" id="input-stock-kacosa" accept=".mht,.MHT">
        </div>
      </div>

      <button id="btn-analizar-kacosa" class="btn-primario" style="margin-top:16px; min-width:200px">
        📊 Analizar stock
      </button>
      <p id="estado-alertas" class="estado-texto" style="margin-top:12px"></p>
    </div>
    <div id="resultado-alertas"></div>
  `;

  // Event listener para el archivo
  const input = document.getElementById("input-stock-kacosa");
  const nameEl = document.getElementById("file-name-kacosa");
  const statusEl = document.getElementById("file-status-kacosa");
  const wrapper = document.getElementById("file-wrapper-kacosa");

  if (input) {
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) {
        nameEl.textContent = input.files[0].name;
        statusEl.textContent = '✓ Cargado';
        statusEl.className = 'file-status loaded';
        wrapper.classList.add('loaded');
      } else {
        nameEl.textContent = 'Seleccionar archivo';
        statusEl.textContent = 'Pendiente';
        statusEl.className = 'file-status empty';
        wrapper.classList.remove('loaded');
      }
    });

    // Drag and drop
    if (wrapper) {
      wrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        wrapper.classList.add('dragover');
      });
      wrapper.addEventListener('dragleave', () => {
        wrapper.classList.remove('dragover');
      });
      wrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        wrapper.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
          input.files = e.dataTransfer.files;
          input.dispatchEvent(new Event('change'));
        }
      });
    }
  }

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
    resultado.innerHTML = `<div class="card"><p class="vista-sub" style="margin:0">No hay alertas — todo el stock de alta rotación está cubierto. 🎉</p></div>`;
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
      <h3 style="margin-top:0; font-size:14px; color:var(--azul-base)">Lista de alertas</h3>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Descripción</th>
              <th>Clase</th>
              <th>Stock Kacosa</th>
              <th>A pedir (todas)</th>
              <th>Alerta</th>
            </tr>
          </thead>
          <tbody>
            ${alertas.map(a => `
              <tr>
                <td>${a.codigo}</td>
                <td>${a.descripcion}</td>
                <td><span class="clase-badge clase-${a.clase.toLowerCase()}">${a.clase}</span></td>
                <td>${a.stockKacosa}</td>
                <td>${a.totalAPedir}</td>
                <td>
                  <span style="color:${a.tipo === 'SIN_STOCK' ? 'var(--rojo-alerta)' : 'var(--ambar-oscuro)'}; font-weight:700">
                    ${a.tipo === 'SIN_STOCK' ? '⚠️ Sin stock' : '⚡ Stock bajo'}
                  </span>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

document.addEventListener("kacosa:vista-cambiada", (e) => {
  if (e.detail.vista === "vista-alertas-kacosa") render();
});
