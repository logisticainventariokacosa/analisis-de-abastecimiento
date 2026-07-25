// js/alertas-kacosa.js
import { parsearMHT, aNumero } from "./mht-parser.js";
import { callBridge } from "./bridge.js";
import { crearTablaPaginada } from "./tabla-utils.js";
import { nombrePorId, TIENDAS } from "./tiendas.js";
import { obtenerInfoPaquete, cargarPaquetes } from "./paquetes.js";

const CENTROS_KACOSA = ["1000", "3000"];
let ultimasAlertas = [];
let periodoSeleccionado = 1;
let mapaEmpaques = {};
let vistaConstruida = false;

function render() {
  if (vistaConstruida) return; // ya construida: se conserva al cambiar de módulo
  const cont = document.getElementById("alertas-kacosa-contenido");
  if (!cont) return;
  vistaConstruida = true;

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

      <div style="margin-top:16px">
        <label class="form-label">Período de abastecimiento</label>
        <div style="display:flex; gap:10px; flex-wrap:wrap">
          <button class="btn-periodo activo" data-meses="1" style="padding:8px 20px; border:2px solid var(--borde); border-radius:var(--radio-peq); background:var(--azul-base); color:#fff; cursor:pointer; font-weight:600">1 Mes</button>
          <button class="btn-periodo" data-meses="2" style="padding:8px 20px; border:2px solid var(--borde); border-radius:var(--radio-peq); background:var(--blanco); color:var(--texto-principal); cursor:pointer; font-weight:600">2 Meses</button>
          <button class="btn-periodo" data-meses="3" style="padding:8px 20px; border:2px solid var(--borde); border-radius:var(--radio-peq); background:var(--blanco); color:var(--texto-principal); cursor:pointer; font-weight:600">3 Meses</button>
        </div>
      </div>

      <button id="btn-analizar-kacosa" class="btn-primario" style="margin-top:16px; min-width:200px">
        📊 Analizar stock
      </button>
      <p id="estado-alertas" class="estado-texto" style="margin-top:12px"></p>
    </div>
    <div id="resultado-alertas"></div>
  `;

  // Event listeners para botones de período
  document.querySelectorAll('.btn-periodo').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-periodo').forEach(b => {
        b.classList.remove('activo');
        b.style.background = 'var(--blanco)';
        b.style.color = 'var(--texto-principal)';
        b.style.borderColor = 'var(--borde)';
      });
      btn.classList.add('activo');
      btn.style.background = 'var(--azul-base)';
      btn.style.color = '#fff';
      btn.style.borderColor = 'var(--azul-base)';
      periodoSeleccionado = parseInt(btn.dataset.meses);
    });
  });

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

  // Cargar paquetes
  cargarPaquetes().then(pkg => {
    mapaEmpaques = pkg || {};
  });

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
    const resp = await callBridge("alertasKacosa", { 
      stockKacosa: stockPorMaterial,
      periodoMeses: periodoSeleccionado,
      mapaEmpaques: mapaEmpaques
    });

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
  ultimasAlertas = alertas;
  const resultado = document.getElementById("resultado-alertas");

  if (alertas.length === 0) {
    resultado.innerHTML = `<div class="card"><p class="vista-sub" style="margin:0">No hay alertas — todo el stock de alta rotación está cubierto. 🎉</p></div>`;
    return;
  }

  const sinStock = alertas.filter(a => a.tipo === "SIN_STOCK");
  const stockBajo = alertas.filter(a => a.tipo === "STOCK_BAJO");

  // Preparar datos para la tabla
  const datosTabla = alertas.map(a => ({
    codigo: a.codigo,
    descripcion: a.descripcion,
    clase: a.clase,
    stockKacosa: a.stockKacosa,
    totalAPedir: a.totalAPedir,
    proyeccionCompra: a.proyeccionCompra,
    empaque: a.empaque,
    tipo: a.tipo,
    distribucion: a.distribucionPorTienda || {}
  }));

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
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px">
        <h3 style="margin:0; font-size:14px; color:var(--azul-base)">Lista de alertas</h3>
        <div style="display:flex; gap:10px; flex-wrap:wrap">
          <input type="text" id="alertas-buscar" placeholder="🔍 Buscar por código o descripción..." 
                 style="padding:8px 14px; border:1.5px solid var(--borde); border-radius:var(--radio-peq); font-size:13px; min-width:200px">
          <button id="btn-descargar-alertas" class="btn-primario" style="padding:8px 16px; font-size:12px; margin:0">
            📥 Descargar Excel
          </button>
        </div>
      </div>
      <div id="alertas-tabla-container"></div>
    </div>
  `;

  // Renderizar tabla con paginación
  const columnas = [
    { key: 'codigo', label: 'Código' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'clase', label: 'Clase' },
    { key: 'stockKacosa', label: 'Stock Kacosa', numeric: true },
    { key: 'totalAPedir', label: 'A pedir (todas)', numeric: true },
    { key: 'proyeccionCompra', label: 'Proyección compra', numeric: true },
    { key: 'empaque', label: 'Empaque', numeric: true },
    { key: 'tipo', label: 'Alerta' }
  ];

  const container = document.getElementById('alertas-tabla-container');
  const { renderizar } = crearTablaPaginada(container, columnas, 50);
  
  renderizar(datosTabla);

  // Evento de búsqueda
  document.getElementById('alertas-buscar').addEventListener('input', (e) => {
    const termino = e.target.value.toLowerCase().trim();
    if (!termino) {
      renderizar(datosTabla);
      return;
    }
    const filtrados = datosTabla.filter(m => 
      String(m.codigo).toLowerCase().includes(termino) || 
      String(m.descripcion).toLowerCase().includes(termino)
    );
    renderizar(filtrados);
  });

  document.getElementById("btn-descargar-alertas").addEventListener("click", () => descargarAlertasExcel(alertas));

  // Agregar modal para ver distribución
  // Agregar botón de distribución en cada fila después de renderizar
  setTimeout(() => {
    document.querySelectorAll('#alertas-tabla-container tbody tr').forEach((row, index) => {
      const alerta = alertas[index];
      if (alerta && Object.keys(alerta.distribucionPorTienda || {}).length > 0) {
        const td = row.querySelector('td:last-child');
        if (td) {
          const btn = document.createElement('button');
          btn.textContent = '📊 Ver distribución';
          btn.style.cssText = 'padding:4px 12px; border:none; border-radius:4px; background:var(--azul-base); color:#fff; cursor:pointer; font-size:11px';
          btn.addEventListener('click', () => mostrarDistribucion(alerta));
          td.appendChild(btn);
        }
      }
    });
  }, 100);
}

function mostrarDistribucion(alerta) {
  const distribucion = alerta.distribucionPorTienda || {};
  const total = Object.values(distribucion).reduce((a, b) => a + b, 0);
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; inset:0; background:rgba(0,0,0,0.6); z-index:60;
    display:flex; align-items:center; justify-content:center; padding:20px;
    animation: fadeIn 0.2s ease;
  `;
  
  modal.innerHTML = `
    <div style="background:var(--blanco); border-radius:var(--radio); max-width:500px; width:100%; max-height:90vh; overflow-y:auto; padding:24px; box-shadow:0 20px 60px rgba(0,0,0,0.3)">
      <h3 style="margin:0 0 12px; color:var(--azul-base)">Distribución por tienda</h3>
      <p style="font-size:13px; color:var(--texto-secundario); margin-bottom:16px">
        <strong>${alerta.codigo}</strong> - ${alerta.descripcion}<br>
        Total a distribuir: <strong>${alerta.proyeccionCompra}</strong> unidades (${alerta.empaque} por paquete)
      </p>
      <div style="border-top:1px solid var(--borde); padding-top:12px">
        ${Object.entries(distribucion).map(([tienda, cantidad]) => `
          <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--borde)">
            <span>${nombrePorId(tienda)}</span>
            <span style="font-weight:600">${cantidad}</span>
          </div>
        `).join('')}
        <div style="display:flex; justify-content:space-between; padding:8px 0; font-weight:700; border-top:2px solid var(--azul-base)">
          <span>TOTAL</span>
          <span>${total}</span>
        </div>
      </div>
      <button id="cerrar-modal-dist" style="margin-top:16px; padding:10px 24px; background:var(--azul-base); color:#fff; border:none; border-radius:var(--radio-peq); cursor:pointer; width:100%; font-weight:600">Cerrar</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  document.getElementById('cerrar-modal-dist').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function descargarAlertasExcel(alertas) {
  const filas = alertas.map(a => ({
    Codigo: a.codigo,
    Descripcion: a.descripcion,
    Clase: a.clase,
    Stock_Kacosa: a.stockKacosa,
    A_Pedir_Todas_Tiendas: a.totalAPedir,
    Proyeccion_Compra: a.proyeccionCompra,
    Empaque: a.empaque,
    Alerta: a.tipo === "SIN_STOCK" ? "Sin stock" : "Stock bajo",
    Distribucion: Object.entries(a.distribucionPorTienda || {})
      .map(([t, c]) => `${nombrePorId(t)}: ${c}`)
      .join("; ")
  }));
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Alertas_Kacosa");

  const fecha = new Date().toLocaleDateString("es-VE").replace(/\//g, "-");
  XLSX.writeFile(wb, `Alertas_Kacosa_${fecha}.xlsx`);
}

document.addEventListener("kacosa:vista-cambiada", (e) => {
  if (e.detail.vista === "vista-alertas-kacosa") render();
});
