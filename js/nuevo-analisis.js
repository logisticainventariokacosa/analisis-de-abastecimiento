// js/nuevo-analisis.js
import { parsearMHT } from "./mht-parser.js";
import { procesarVentas } from "./ventas-parser.js";
import { agruparStock } from "./stock-parser.js";
import { cargarPaquetes } from "./paquetes.js";
import { calcularAbastecimiento } from "./calculo-abastecimiento.js";
import { detectarCandidatosLocal, confirmarConGemini, fusionarDuplicados } from "./deteccion-duplicados.js";
import { TIENDAS, nombrePorId } from "./tiendas.js";
import { callBridge } from "./bridge.js";
import { crearTablaPaginada } from "./tabla-utils.js";

const CENTROS_KACOSA = ["1000", "3000"];

// Estado persistente
let estado = {
  ventasProcesadas: null,
  stockTienda: null,
  stockKacosa: null,
  clustersCandidatos: [],
  gruposGemini: [],
  tiendaSeleccionada: null,
  resultadoFinal: null,
  fechaAnalisis: null,
  grupos: null,
  sinRotacion: null,
  sugerencias: null,
  periodo: null,
  mesesCantidad: null,
  margenPct: null,
  analisisCompleto: null // Para persistencia entre módulos
};

function tiendasDelUsuario() {
  return window.KACOSA?.tiendas || [];
}

function render() {
  const cont = document.getElementById("nuevo-analisis-contenido");
  if (!cont) return;

  // Si ya hay un análisis completo, mostrarlo directamente
  if (estado.analisisCompleto) {
    mostrarResultados(estado.analisisCompleto.resultado, estado.analisisCompleto.sugerencias);
    return;
  }

  const misTiendas = tiendasDelUsuario();
  const tieneVariasTiendas = misTiendas.includes("TODAS") || misTiendas.length > 1;
  const opcionesTienda = misTiendas.includes("TODAS")
    ? TIENDAS.map(t => `<option value="${t.id}">${t.nombre}</option>`).join("")
    : misTiendas.map(id => `<option value="${id}">${nombrePorId(id)}</option>`).join("");

  cont.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0; font-size:16px; color:var(--azul-base); display:flex; align-items:center; gap:10px">
        <span style="display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; background:var(--ambar-claro); border-radius:8px; font-size:14px">📄</span>
        1. Archivos y parámetros
      </h3>

      ${tieneVariasTiendas ? `
        <div class="form-row">
          <div>
            <label class="form-label" for="na-tienda">Tienda a analizar <span class="required">*</span></label>
            <select id="na-tienda" class="input-modern select-modern">
              ${opcionesTienda}
            </select>
          </div>
        </div>
      ` : `<input type="hidden" id="na-tienda" value="${misTiendas[0] || ''}">`}

      <!-- Archivo de ventas -->
      <div style="margin-top:16px">
        <label class="form-label" for="na-ventas">Archivo de ventas <span class="required">*</span></label>
        <div class="file-input-wrapper" id="file-wrapper-ventas">
          <span class="file-icon">📊</span>
          <div class="file-info">
            <div class="file-name" id="file-name-ventas">Seleccionar archivo</div>
            <div class="file-hint">.MHT de SAP · Ventas</div>
          </div>
          <span class="file-status empty" id="file-status-ventas">Pendiente</span>
          <input type="file" id="na-ventas" accept=".mht,.MHT">
        </div>
      </div>

      <!-- Stock de la tienda -->
      <div style="margin-top:16px">
        <label class="form-label" for="na-stock-tienda">Stock de la tienda <span class="required">*</span></label>
        <div class="file-input-wrapper" id="file-wrapper-stock-tienda">
          <span class="file-icon">🏪</span>
          <div class="file-info">
            <div class="file-name" id="file-name-stock-tienda">Seleccionar archivo</div>
            <div class="file-hint">.MHT de SAP · Stock tienda</div>
          </div>
          <span class="file-status empty" id="file-status-stock-tienda">Pendiente</span>
          <input type="file" id="na-stock-tienda" accept=".mht,.MHT">
        </div>
      </div>

      <!-- Stock de Kacosa -->
      <div style="margin-top:16px">
        <label class="form-label" for="na-stock-kacosa">Stock de Kacosa <span class="required">*</span></label>
        <div class="file-input-wrapper" id="file-wrapper-stock-kacosa">
          <span class="file-icon">🏢</span>
          <div class="file-info">
            <div class="file-name" id="file-name-stock-kacosa">Seleccionar archivo</div>
            <div class="file-hint">.MHT de SAP · Stock Kacosa</div>
          </div>
          <span class="file-status empty" id="file-status-stock-kacosa">Pendiente</span>
          <input type="file" id="na-stock-kacosa" accept=".mht,.MHT">
        </div>
      </div>

      <!-- Período -->
      <div class="form-row" style="margin-top:16px">
        <div>
          <label class="form-label" for="na-periodo">Horizonte de abastecimiento</label>
          <select id="na-periodo" class="input-modern select-modern">
            <option value="semana">Una semana</option>
            <option value="mes" selected>Un mes</option>
            <option value="meses">Varios meses</option>
          </select>
        </div>
        <div id="na-meses-wrap" style="display:none">
          <label class="form-label" for="na-meses-cantidad">Cantidad de meses</label>
          <input type="number" id="na-meses-cantidad" class="input-modern" min="1" max="24" value="2">
        </div>
      </div>

      <!-- Margen -->
      <div style="margin-top:16px">
        <label class="form-label">Margen de seguridad: <span id="na-margen-valor" style="color:var(--ambar-oscuro); font-weight:700">30%</span></label>
        <input type="range" id="na-margen" class="input-modern" min="10" max="100" step="5" value="30">
        <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--texto-claro); margin-top:2px">
          <span>10%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      <!-- Botón Analizar -->
      <button id="btn-analizar" class="btn-primario" style="margin-top:20px; min-width:200px">
        🚀 Analizar
      </button>
      <p id="na-estado" class="estado-texto" style="margin-top:12px"></p>
    </div>

    <div id="na-duplicados"></div>
    <div id="na-resultados"></div>
  `;

  // Event listeners para los archivos (drag & drop + cambio de estado)
  const fileInputs = [
    { id: 'na-ventas', nameId: 'file-name-ventas', statusId: 'file-status-ventas', wrapperId: 'file-wrapper-ventas' },
    { id: 'na-stock-tienda', nameId: 'file-name-stock-tienda', statusId: 'file-status-stock-tienda', wrapperId: 'file-wrapper-stock-tienda' },
    { id: 'na-stock-kacosa', nameId: 'file-name-stock-kacosa', statusId: 'file-status-stock-kacosa', wrapperId: 'file-wrapper-stock-kacosa' }
  ];

  fileInputs.forEach(({ id, nameId, statusId, wrapperId }) => {
    const input = document.getElementById(id);
    const nameEl = document.getElementById(nameId);
    const statusEl = document.getElementById(statusId);
    const wrapper = document.getElementById(wrapperId);

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
  });

  document.getElementById("na-periodo").addEventListener("change", (e) => {
    document.getElementById("na-meses-wrap").style.display = e.target.value === "meses" ? "block" : "none";
  });
  document.getElementById("na-margen").addEventListener("input", (e) => {
    document.getElementById("na-margen-valor").textContent = e.target.value + "%";
  });
  document.getElementById("btn-analizar").addEventListener("click", ejecutarAnalisis);
}

async function ejecutarAnalisis() {
  const estadoTexto = document.getElementById("na-estado");
  document.getElementById("na-duplicados").innerHTML = "";
  document.getElementById("na-resultados").innerHTML = "";

  const tienda = document.getElementById("na-tienda").value;
  const archivoVentas = document.getElementById("na-ventas").files[0];
  const archivoStockTienda = document.getElementById("na-stock-tienda").files[0];
  const archivoStockKacosa = document.getElementById("na-stock-kacosa").files[0];
  const periodo = document.getElementById("na-periodo").value;
  const mesesCantidad = Number(document.getElementById("na-meses-cantidad").value) || 1;
  const margenPct = Number(document.getElementById("na-margen").value);

  if (!tienda || !archivoVentas || !archivoStockTienda || !archivoStockKacosa) {
    estadoTexto.textContent = "Selecciona la tienda y sube los 3 archivos.";
    return;
  }

  const centroTienda = TIENDAS.find(t => t.id === tienda)?.centro;
  if (!centroTienda) {
    estadoTexto.textContent = "No se encontró el centro SAP para esa tienda.";
    return;
  }

  try {
    estadoTexto.textContent = "Leyendo archivo de ventas...";
    const filasVentas = parsearMHT(await archivoVentas.text());

    estadoTexto.textContent = "Leyendo stock de la tienda...";
    const filasStockTienda = parsearMHT(await archivoStockTienda.text());

    estadoTexto.textContent = "Leyendo stock de Kacosa...";
    const filasStockKacosa = parsearMHT(await archivoStockKacosa.text());

    estadoTexto.textContent = "Validando centros de los archivos...";
    const errorValidacion = validarCentros(filasVentas, filasStockTienda, filasStockKacosa, centroTienda);
    if (errorValidacion) {
      estadoTexto.textContent = "⚠️ " + errorValidacion;
      return;
    }

    const ventasProcesadas = procesarVentas(filasVentas);
    const stockTienda = agruparStock(filasStockTienda, [centroTienda]);
    const stockKacosa = agruparStock(filasStockKacosa, CENTROS_KACOSA);

    estadoTexto.textContent = "Cargando lista de paquetes...";
    await cargarPaquetes();

    estadoTexto.textContent = "Buscando posibles códigos duplicados...";
    const materialesParaComparar = Object.values(ventasProcesadas.porMaterial)
      .map(m => ({ codigo: m.codigo, descripcion: m.descripcion }));
    const clusters = detectarCandidatosLocal(materialesParaComparar);

    let gruposGemini = [];
    if (clusters.length > 0) {
      estadoTexto.textContent = `Confirmando ${clusters.length} grupo(s) candidato(s) con el agente...`;
      const respGemini = await confirmarConGemini(clusters);
      if (respGemini.ok) gruposGemini = respGemini.grupos;
    }

    // Guarda estado para cuando el usuario confirme/rechace duplicados
    estado = {
      ventasProcesadas, stockTienda, stockKacosa,
      clustersCandidatos: clusters, gruposGemini,
      tiendaSeleccionada: tienda, periodo, mesesCantidad, margenPct,
      fechaAnalisis: new Date().toLocaleDateString("es-VE"),
      analisisCompleto: null
    };

    if (gruposGemini.length > 0) {
      estadoTexto.textContent = `Se detectaron ${gruposGemini.length} posible(s) duplicado(s). Revísalos abajo.`;
      mostrarDuplicados(gruposGemini);
    } else {
      estadoTexto.textContent = "No se detectaron duplicados. Calculando...";
      finalizarCalculo([]);
    }

  } catch (err) {
    estadoTexto.textContent = "Error: " + err.message;
    console.error(err);
  }
}

function mostrarDuplicados(grupos) {
  const cont = document.getElementById("na-duplicados");
  const descripcionPorCodigo = {};
  Object.values(estado.ventasProcesadas.porMaterial).forEach(m => {
    descripcionPorCodigo[m.codigo] = m.descripcion;
  });

  cont.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0; font-size:15px; color:var(--azul-base)">2. Posibles duplicados detectados</h3>
      <p class="vista-sub">Marca los grupos que SÍ son el mismo material (se fusionará su rotación bajo un solo código).</p>
      ${grupos.map((grupo, idx) => `
        <label style="display:flex; align-items:flex-start; gap:10px; padding:10px 0; border-bottom:1px solid var(--borde); cursor:pointer">
          <input type="checkbox" class="chk-grupo-dup" data-idx="${idx}" checked style="margin-top:4px">
          <span style="font-size:13px">
            ${grupo.map(c => `<strong>${c}</strong> - ${descripcionPorCodigo[c] || ""}`).join("<br>")}
          </span>
        </label>
      `).join("")}
      <button id="btn-confirmar-duplicados" class="btn-primario" style="margin-top:16px; max-width:260px">
        Confirmar y calcular
      </button>
    </div>
  `;

  document.getElementById("btn-confirmar-duplicados").addEventListener("click", () => {
    const gruposConfirmados = [];
    document.querySelectorAll(".chk-grupo-dup:checked").forEach(chk => {
      gruposConfirmados.push(grupos[Number(chk.dataset.idx)]);
    });
    finalizarCalculo(gruposConfirmados);
  });
}

async function finalizarCalculo(gruposConfirmados) {
  document.getElementById("na-duplicados").innerHTML = "";
  const estadoTexto = document.getElementById("na-estado");

  if (gruposConfirmados.length > 0) {
    fusionarDuplicados(
      estado.ventasProcesadas.porMaterial,
      estado.stockTienda,
      estado.stockKacosa,
      gruposConfirmados
    );
  }

  let resultado = calcularAbastecimiento({
    ventasProcesadas: estado.ventasProcesadas,
    stockTienda: estado.stockTienda,
    stockKacosa: estado.stockKacosa,
    periodo: estado.periodo,
    mesesCantidad: estado.mesesCantidad,
    margenPct: estado.margenPct
  });

  estadoTexto.textContent = "Revisando base de alta rotación...";
  const respAltaRotacion = await callBridge("leerAltaRotacion", {});
  const altaRotacion = respAltaRotacion.ok ? respAltaRotacion.materiales : [];

  const { resultadoConAnexos } = anexarAltaRotacionFaltante(
    resultado, estado.stockTienda, estado.stockKacosa, altaRotacion,
    resultado[0]?.periodoAnalizado || ""
  );
  resultado = resultadoConAnexos;

  const sugerencias = generarSugerencias(resultado, estado.stockTienda, estado.stockKacosa, altaRotacion);
  const sinRotacion = generarSinRotacion(estado.stockKacosa, estado.stockTienda, estado.ventasProcesadas);

  estado.resultadoFinal = resultado;
  estado.sugerencias = sugerencias;
  estado.sinRotacion = sinRotacion;
  
  // Guardar análisis completo para persistencia
  estado.analisisCompleto = {
    resultado: resultado,
    sugerencias: sugerencias,
    sinRotacion: sinRotacion,
    tienda: estado.tiendaSeleccionada,
    fechaAnalisis: estado.fechaAnalisis,
    periodo: estado.periodo,
    margenPct: estado.margenPct,
    mesesUsados: estado.ventasProcesadas.rangoFechas?.meses,
    semanasUsadas: estado.ventasProcesadas.rangoFechas?.semanas
  };

  // Guardar en window para otros módulos
  window.KACOSA.ultimoAnalisis = {
    tienda: estado.tiendaSeleccionada,
    fechaAnalisis: estado.fechaAnalisis,
    periodo: estado.periodo,
    margenPct: estado.margenPct,
    mesesUsados: estado.ventasProcesadas.rangoFechas?.meses,
    semanasUsadas: estado.ventasProcesadas.rangoFechas?.semanas,
    materiales: resultado,
    sugerencias
  };

  const mesesUsados = estado.ventasProcesadas.rangoFechas?.meses || '?';
  const semanasUsadas = estado.ventasProcesadas.rangoFechas?.semanas || '?';
  estadoTexto.textContent = `Análisis completo — ${resultado.length} material(es) procesados. Período usado: ${mesesUsados} meses (${semanasUsadas} semanas).`;
  
  mostrarResultados(resultado, sugerencias);

  document.dispatchEvent(new CustomEvent("kacosa:analisis-listo", { detail: window.KACOSA.ultimoAnalisis }));
}

function mostrarResultados(resultado, sugerencias) {
  const cont = document.getElementById("na-resultados");
  const grupos = clasificarEnCuatroGrupos(resultado, sugerencias);
  estado.grupos = grupos;

  const totalAPedir = grupos.pedido.reduce((acc, m) => acc + m.aPedir, 0);
  const porClase = { A: 0, B: 0, C: 0, D: 0 };
  resultado.forEach(m => porClase[m.clase]++);

  const infoPeriodo = window.KACOSA.ultimoAnalisis;
  const textoPeriodo = infoPeriodo 
    ? `Período usado: ${infoPeriodo.mesesUsados || '?'} meses (${infoPeriodo.semanasUsadas || '?'} semanas)`
    : '';

  cont.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0; font-size:15px; color:var(--azul-base)">3. Resultado</h3>
      <p class="vista-sub" style="margin-top:-4px">${textoPeriodo}</p>
      <div class="kpi-grid">
        <div class="kpi-card verde">
          <div class="label">Materiales a pedir</div>
          <div class="valor">${grupos.pedido.length}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Total unidades a pedir</div>
          <div class="valor">${totalAPedir}</div>
        </div>
        <div class="kpi-card rojo">
          <div class="label">Pendiente por falta de stock</div>
          <div class="valor">${grupos.pendienteStock.length}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Clase A / B / C / D</div>
          <div class="valor" style="font-size:18px">${porClase.A} / ${porClase.B} / ${porClase.C} / ${porClase.D}</div>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px">
        <h3 style="margin:0; font-size:14px; color:var(--azul-base)">Materiales a pedir</h3>
        <div style="display:flex; gap:10px; flex-wrap:wrap">
          <input type="text" id="na-buscar" placeholder="🔍 Buscar por código o descripción..." 
                 style="padding:8px 14px; border:1.5px solid var(--borde); border-radius:var(--radio-peq); font-size:13px; min-width:200px">
        </div>
      </div>
      <div id="na-tabla-container"></div>

      <p class="vista-sub" style="margin-top:16px">
        Los 5 archivos descargables incluyen: (1) ${grupos.pedido.length} material(es) a pedir,
        (2) ${grupos.noPedido.length} que no ameritaron pedido,
        (3) ${grupos.pendienteStock.length} con pedido pendiente por falta de stock en Kacosa,
        (4) ${grupos.sugerencias.length} sugerencia(s),
        (5) ${(estado.sinRotacion || []).length} sin rotación en tienda.
      </p>

      <div class="btn-group">
        <button id="btn-descargar-excel" class="btn-primario">📥 Descargar Excel (1 archivo, 5 pestañas)</button>
        <button id="btn-guardar-analisis" class="btn-secundario">💾 Guardar análisis</button>
        <button id="btn-enviar-correo" class="btn-secundario">📧 Enviar por correo</button>
      </div>
      <p id="na-estado-acciones" class="estado-texto" style="margin-top:10px"></p>
    </div>
  `;

  // Renderizar tabla con paginación
  const columnas = [
    { key: 'codigo', label: 'Código' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'clase', label: 'Clase' },
    { key: 'ventasPeriodo', label: 'Ventas periodo', numeric: true },
    { key: 'stockTienda', label: 'Stock tienda', numeric: true },
    { key: 'stockKacosa', label: 'Stock Kacosa', numeric: true },
    { key: 'aPedir', label: 'A pedir', numeric: true }
  ];

  const container = document.getElementById('na-tabla-container');
  const { renderizar } = crearTablaPaginada(container, columnas, 50);
  
  // Usar grupos.pedido para la tabla
  renderizar(grupos.pedido);

  // Evento de búsqueda
  document.getElementById('na-buscar').addEventListener('input', (e) => {
    const termino = e.target.value.toLowerCase().trim();
    if (!termino) {
      renderizar(grupos.pedido);
      return;
    }
    const filtrados = grupos.pedido.filter(m => 
      m.codigo.toLowerCase().includes(termino) || 
      m.descripcion.toLowerCase().includes(termino)
    );
    renderizar(filtrados);
  });

  document.getElementById("btn-descargar-excel").addEventListener("click", descargarExcelUnificado);
  document.getElementById("btn-guardar-analisis").addEventListener("click", guardarAnalisisEnSheets);
  document.getElementById("btn-enviar-correo").addEventListener("click", enviarCorreo);
}

function descargarExcelUnificado() {
  const { pedido, noPedido, pendienteStock, sugerencias } = estado.grupos;
  const base = `${estado.tiendaSeleccionada}_${estado.fechaAnalisis.replace(/\//g, "-")}`;

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
  
  agregarHoja(pendienteStock.map(m => ({
    ...m,
    pendiente: m.aPedirIdeal - m.aPedir
  })), 'Pendiente_Stock_Kacosa', [
    { key: 'codigo', label: 'Código' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'clase', label: 'Clase' },
    { key: 'aPedirIdeal', label: 'A Pedir Ideal' },
    { key: 'aPedir', label: 'A Pedir Real' },
    { key: 'pendiente', label: 'Pendiente' },
    { key: 'stockKacosa', label: 'Stock Kacosa' }
  ]);

  agregarHoja(sugerencias, 'Sugerencias', [
    { key: 'codigo', label: 'Código' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'stockKacosa', label: 'Stock Kacosa' }
  ]);

  agregarHoja((estado.sinRotacion || []), 'Sin_Rotacion', [
    { key: 'codigo', label: 'Código' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'stockTienda', label: 'Stock Tienda' },
    { key: 'stockKacosa', label: 'Stock Kacosa' }
  ]);

  XLSX.writeFile(wb, `Analisis_${base}.xlsx`);
}

// Las funciones auxiliares (validarCentros, anexarAltaRotacionFaltante, 
// generarSugerencias, generarSinRotacion, clasificarEnCuatroGrupos, 
// guardarAnalisisEnSheets, enviarCorreo) mantienen su implementación original

// ... (resto de funciones auxiliares sin cambios)

document.addEventListener("kacosa:vista-cambiada", (e) => {
  if (e.detail.vista === "vista-nuevo-analisis") render();
});
