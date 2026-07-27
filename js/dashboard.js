// js/dashboard.js
import { callBridge } from "./bridge.js";
import { TIENDAS, nombrePorId } from "./tiendas.js";
import { crearTablaPaginada } from "./tabla-utils.js";
import { notificarExito } from "./notificaciones.js";
import { construirHojaEstilizada, construirHojaResumen } from "./excel-estilos.js";

let tiendaSeleccionada = null;
let materialesCache = [];
let analisisCache = null;
let vistaConstruida = false;

function tiendasDelUsuario() {
  return window.KACOSA?.tiendas || [];
}

async function render() {
  if (vistaConstruida) return;
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
    fechaAnalisis: resp.fechaAnalisis || "Sin fecha",
    materiales: resp.materiales
  };
  
  mostrarDashboard(analisisCache);
}

function mostrarDashboard(analisis) {
  const resultadoDiv = document.getElementById("dash-resultado");
  
  // Convertir TODOS los valores numéricos correctamente
  materialesCache = analisis.materiales.map(m => {
    const aPedir = typeof m.aPedir === 'number' ? m.aPedir : (Number(m.aPedir) || 0);
    const totalVentas = typeof m.totalVentas === 'number' ? m.totalVentas : (Number(m.totalVentas) || 0);
    const promedio = typeof m.promedioVentasPeriodo === 'number' ? m.promedioVentasPeriodo : (Number(m.promedioVentasPeriodo) || 0);
    const stockTienda = typeof m.stockTienda === 'number' ? m.stockTienda : (Number(m.stockTienda) || 0);
    const stockKacosa = typeof m.stockKacosa === 'number' ? m.stockKacosa : (Number(m.stockKacosa) || 0);
    
    return {
      ...m,
      aPedir: aPedir,
      totalVentas: totalVentas,
      promedioVentasPeriodo: promedio,
      stockTienda: stockTienda,
      stockKacosa: stockKacosa,
      // Asegurar que estos también sean números
      aPedirIdeal: typeof m.aPedirIdeal === 'number' ? m.aPedirIdeal : (Number(m.aPedirIdeal) || 0),
      pendiente: typeof m.pendiente === 'number' ? m.pendiente : (Number(m.pendiente) || 0),
      empaque: typeof m.empaque === 'number' ? m.empaque : (Number(m.empaque) || 1)
    };
  });
  
  // Calcular total a pedir
  const totalAPedir = materialesCache.reduce((acc, m) => acc + (m.aPedir || 0), 0);
  
  // Contar quiebres (stock Kacosa <= 0 y aPedir === 0)
  const quiebres = materialesCache.filter(m => (m.stockKacosa || 0) <= 0 && (m.aPedir || 0) === 0).length;
  
  // Contar por clase
  const porClase = { A: 0, B: 0, C: 0, D: 0 };
  materialesCache.forEach(m => { 
    const clase = (m.clase || '').toUpperCase();
    if (porClase[clase] !== undefined) porClase[clase]++; 
  });

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
    { key: 'totalVentas', label: 'Total ventas', numeric: true },
    { key: 'promedioVentasPeriodo', label: 'Promedio ventas periodo', numeric: true },
    { key: 'stockTienda', label: 'Stock tienda', numeric: true },
    { key: 'stockKacosa', label: 'Stock Kacosa', numeric: true },
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

  const pedido = materiales.filter(m => (m.aPedir || 0) > 0);
  const noPedido = materiales.filter(m => (m.aPedir || 0) === 0);
  const pendienteStock = materiales.filter(m => (m.stockKacosa || 0) <= 0 && (m.aPedir || 0) === 0);
  const sugerencias = materiales.filter(m => (m.stockKacosa || 0) > 0 && (m.aPedir || 0) === 0);
  const sinRotacion = materiales.filter(m => (m.stockTienda || 0) > 0 && (m.aPedir || 0) === 0);

  const totalAPedir = pedido.reduce((acc, m) => acc + (m.aPedir || 0), 0);
  const porClase = { A: 0, B: 0, C: 0, D: 0 };
  materiales.forEach(m => { 
    const clase = (m.clase || '').toUpperCase();
    if (porClase[clase] !== undefined) porClase[clase]++; 
  });

  const wb = XLSX.utils.book_new();

  const wsResumen = construirHojaResumen(
    `Dashboard — ${nombrePorId(analisis.tienda)}`,
    [
      { label: "Fecha de análisis", valor: analisis.fechaAnalisis || "—" },
      { label: "Materiales a pedir", valor: pedido.length, color: "FF2F8F6E" },
      { label: "Total unidades a pedir", valor: totalAPedir, color: "FF1B2A41" },
      { label: "Sin stock en Kacosa", valor: pendienteStock.length, color: "FFC4432B" },
      { label: "Clase A", valor: porClase.A, color: "FF2F8F6E" },
      { label: "Clase B", valor: porClase.B, color: "FF4A6FA5" },
      { label: "Clase C", valor: porClase.C, color: "FFE8A03D" },
      { label: "Clase D", valor: porClase.D, color: "FF6B7280" }
    ],
    ["Generado desde el Dashboard del sistema de Abastecimiento KACOSA."]
  );
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

  const columnasBase = [
    { key: 'codigo', label: 'Codigo', ancho: 14 },
    { key: 'descripcion', label: 'Descripcion', ancho: 38 },
    { key: 'clase', label: 'Clase', ancho: 8 },
    { key: 'totalVentas', label: 'Total_Ventas', ancho: 12 },
    { key: 'promedioVentasPeriodo', label: 'Promedio_Ventas_Periodo', ancho: 16 },
    { key: 'stockTienda', label: 'Stock_Tienda', ancho: 12 },
    { key: 'stockKacosa', label: 'Stock_Kacosa', ancho: 12 },
    { key: 'aPedir', label: 'A_Pedir', ancho: 10 },
    { key: 'periodoVentas', label: 'Periodo_Ventas', ancho: 14 },
    { key: 'periodoAbastecimiento', label: 'Periodo_Abastecimiento', ancho: 16 },
    { key: 'rangoSeguridadUsado', label: 'Rango_Seguridad_Usado', ancho: 14 },
    { key: 'tienda', label: 'Tienda', ancho: 14 }
  ];

  XLSX.utils.book_append_sheet(wb, construirHojaEstilizada(pedido, columnasBase, {
    colorearPorClase: true,
    columnasDestacadas: [{ key: 'aPedir', color: 'FFC4432B' }]
  }), "A_Pedir");
  XLSX.utils.book_append_sheet(wb, construirHojaEstilizada(noPedido, columnasBase, { colorearPorClase: true }), "No_Amerito_Pedido");

  XLSX.utils.book_append_sheet(wb, construirHojaEstilizada(pendienteStock, [
    { key: 'codigo', label: 'Código', ancho: 14 }, { key: 'descripcion', label: 'Descripción', ancho: 38 },
    { key: 'clase', label: 'Clase', ancho: 8 }, { key: 'stockKacosa', label: 'Stock Kacosa', ancho: 12 }
  ], { colorearPorClase: true }), "Pendiente_Stock_Kacosa");

  XLSX.utils.book_append_sheet(wb, construirHojaEstilizada(sugerencias, [
    { key: 'codigo', label: 'Código', ancho: 14 }, { key: 'descripcion', label: 'Descripción', ancho: 38 },
    { key: 'clase', label: 'Clase', ancho: 8 }, { key: 'stockKacosa', label: 'Stock Kacosa', ancho: 12 }
  ]), "Sugerencias");

  XLSX.utils.book_append_sheet(wb, construirHojaEstilizada(sinRotacion, [
    { key: 'codigo', label: 'Código', ancho: 14 }, { key: 'descripcion', label: 'Descripción', ancho: 38 },
    { key: 'clase', label: 'Clase', ancho: 8 }, { key: 'stockTienda', label: 'Stock Tienda', ancho: 12 },
    { key: 'stockKacosa', label: 'Stock Kacosa', ancho: 12 }
  ]), "Sin_Rotacion");

  XLSX.writeFile(wb, `Dashboard_${base}.xlsx`);
  notificarExito("El archivo Excel del Dashboard se descargó correctamente.", { titulo: "Excel descargado" });
}

document.addEventListener("kacosa:usuario-listo", render);
document.addEventListener("kacosa:vista-cambiada", (e) => {
  if (e.detail.vista === "vista-dashboard") {
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
