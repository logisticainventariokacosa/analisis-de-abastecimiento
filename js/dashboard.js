// js/dashboard.js
import { callBridge } from "./bridge.js";
import { TIENDAS, nombrePorId } from "./tiendas.js";
import { crearTablaPaginada } from "./tabla-utils.js";

let tiendaSeleccionada = null;
let materialesCache = [];
let analisisCache = null;
let vistaConstruida = false;

function tiendasDelUsuario() {
  return window.KACOSA?.tiendas || [];
}

async function render() {
  if (vistaConstruida) return; // ya construida: se conserva al cambiar de módulo
  const cont = document.getElementById("dashboard-contenido");
  if (!cont) return;

  const misTiendas = tiendasDelUsuario();
  if (misTiendas.length === 0) {
    cont.innerHTML = `<p class="vista-sub">Cargando información del usuario...</p>`;
    return;
  }
  vistaConstruida = true;

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

  // Si ya tenemos el análisis en caché, mostrarlo
  if (analisisCache && analisisCache.tienda === tiendaSeleccionada) {
    mostrarDashboard(analisisCache);
    return;
  }

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

  analisisCache = {
    tienda: tiendaSeleccionada,
    fechaAnalisis: resp.fechaAnalisis,
    materiales: resp.materiales
  };
  
  mostrarDashboard(analisisCache);
}

function mostrarDashboard(analisis) {
  const resultadoDiv = document.getElementById("dash-resultado");
  materialesCache = analisis.materiales;
  
  const totalAPedir = materialesCache.reduce((acc, m) => acc + Number(m.aPedir || 0), 0);
  const quiebres = materialesCache.filter(m => Number(m.stockKacosa) <= 0 && Number(m.aPedir) === 0).length;
  const porClase = { A: 0, B: 0, C: 0, D: 0 };
  materialesCache.forEach(m => { if (porClase[m.clase] !== undefined) porClase[m.clase]++; });

  resultadoDiv.innerHTML = `
    <p class="vista-sub" style="margin-top:0">Último análisis: <strong>${analisis.fechaAnalisis || "—"}</strong></p>
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
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px">
        <h3 style="margin:0; font-size:14px; color:var(--azul-base)">Materiales a pedir</h3>
        <div style="display:flex; gap:10px; flex-wrap:wrap">
          <input type="text" id="dash-buscar" placeholder="🔍 Buscar por código o descripción..." 
                 style="padding:8px 14px; border:1.5px solid var(--borde); border-radius:var(--radio-peq); font-size:13px; min-width:200px">
          <button id="dash-descargar" class="btn-primario" style="padding:8px 16px; font-size:12px; margin:0">
            📥 Descargar Excel
          </button>
        </div>
      </div>
      <div id="dash-tabla-container"></div>
    </div>
  `;

  // Renderizar tabla
  const columnas = [
    { key: 'codigo', label: 'Código' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'clase', label: 'Clase' },
    { key: 'aPedir', label: 'A pedir', numeric: true }
  ];

  const container = document.getElementById('dash-tabla-container');
  const { renderizar } = crearTablaPaginada(container, columnas, 50);
  
  renderizar(materialesCache);

  // Evento de búsqueda
  document.getElementById('dash-buscar').addEventListener('input', (e) => {
    const termino = e.target.value.toLowerCase().trim();
    if (!termino) {
      renderizar(materialesCache);
      return;
    }
    const filtrados = materialesCache.filter(m => 
      String(m.codigo).toLowerCase().includes(termino) || 
      String(m.descripcion).toLowerCase().includes(termino)
    );
    renderizar(filtrados);
  });

  // Evento de descarga
  document.getElementById('dash-descargar').addEventListener('click', () => {
    descargarExcelDashboard(materialesCache, analisis);
  });
}

function descargarExcelDashboard(materiales, analisis) {
  if (!materiales || materiales.length === 0) {
    alert("No hay materiales para descargar.");
    return;
  }

  const base = `${analisis.tienda}_${analisis.fechaAnalisis?.replace(/\//g, "-") || "sin_fecha"}`;
  
  // Separar por categorías
  const pedido = materiales.filter(m => m.aPedir > 0);
  const noPedido = materiales.filter(m => m.aPedir === 0);
  const pendienteStock = materiales.filter(m => m.stockKacosa <= 0 && m.aPedir === 0);
  const sugerencias = materiales.filter(m => m.stockKacosa > 0 && m.aPedir === 0);
  const sinRotacion = materiales.filter(m => m.stockTienda > 0 && m.aPedir === 0);

  // Crear workbook con 5 pestañas
  const wb = XLSX.utils.book_new();

  // Función helper para crear hoja
  const agregarHoja = (datos, nombre, columnas) => {
    if (!datos || datos.length === 0) {
      const ws = XLSX.utils.json_to_sheet([{ Mensaje: "Sin datos" }]);
      XLSX.utils.book_append_sheet(wb, ws, nombre);
      return;
    }
    const ws = XLSX.utils.json_to_sheet(datos.map(d => {
      const obj = {};
      columnas.forEach(col => {
        obj[col.label] = d[col.key] !== undefined ? d[col.key] : '';
      });
      return obj;
    }));
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  };

  const columnasBase = [
    { key: 'codigo', label: 'Código' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'clase', label: 'Clase' },
    { key: 'ventasPeriodo', label: 'Ventas Período' },
    { key: 'stockTienda', label: 'Stock Tienda' },
    { key: 'stockKacosa', label: 'Stock Kacosa' },
    { key: 'aPedir', label: 'A Pedir' }
  ];

  agregarHoja(pedido, 'A_Pedir', columnasBase);
  agregarHoja(noPedido, 'No_Amerito_Pedido', columnasBase);
  
  // Pendiente por stock
  agregarHoja(pendienteStock.map(m => ({
    ...m,
    pendiente: m.aPedir === 0 && m.stockKacosa <= 0 ? 'Sin stock en Kacosa' : 'Pendiente'
  })), 'Pendiente_Stock_Kacosa', [
    { key: 'codigo', label: 'Código' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'clase', label: 'Clase' },
    { key: 'stockKacosa', label: 'Stock Kacosa' },
    { key: 'pendiente', label: 'Estado' }
  ]);

  // Sugerencias
  agregarHoja(sugerencias, 'Sugerencias', [
    { key: 'codigo', label: 'Código' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'clase', label: 'Clase' },
    { key: 'stockKacosa', label: 'Stock Kacosa' }
  ]);

  // Sin rotación
  agregarHoja(sinRotacion, 'Sin_Rotacion', [
    { key: 'codigo', label: 'Código' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'clase', label: 'Clase' },
    { key: 'stockTienda', label: 'Stock Tienda' },
    { key: 'stockKacosa', label: 'Stock Kacosa' }
  ]);

  XLSX.writeFile(wb, `Dashboard_${base}.xlsx`);
}

document.addEventListener("kacosa:usuario-listo", render);
document.addEventListener("kacosa:vista-cambiada", (e) => {
  if (e.detail.vista === "vista-dashboard") {
    // Si hay análisis en caché de otro módulo, mostrarlo
    if (window.KACOSA?.ultimoAnalisis) {
      analisisCache = {
        tienda: window.KACOSA.ultimoAnalisis.tienda,
        fechaAnalisis: window.KACOSA.ultimoAnalisis.fechaAnalisis,
        materiales: window.KACOSA.ultimoAnalisis.materiales
      };
    }
    render();
  }
});
