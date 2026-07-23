// js/nuevo-analisis.js
import { parsearMHT } from "./mht-parser.js";
import { procesarVentas } from "./ventas-parser.js";
import { agruparStock } from "./stock-parser.js";
import { cargarPaquetes } from "./paquetes.js";
import { calcularAbastecimiento } from "./calculo-abastecimiento.js";
import { detectarCandidatosLocal, confirmarConGemini, fusionarDuplicados } from "./deteccion-duplicados.js";
import { TIENDAS, nombrePorId } from "./tiendas.js";
import { callBridge } from "./bridge.js";

const CENTROS_KACOSA = ["1000", "3000"];

// Estado interno de la vista (se reinicia cada vez que se entra a analizar)
let estado = {
  ventasProcesadas: null,
  stockTienda: null,
  stockKacosa: null,
  clustersCandidatos: [],
  gruposGemini: [],
  tiendaSeleccionada: null,
  resultadoFinal: null,
  fechaAnalisis: null
};

function tiendasDelUsuario() {
  return window.KACOSA?.tiendas || [];
}

function render() {
  const cont = document.getElementById("nuevo-analisis-contenido");
  if (!cont) return;

  const misTiendas = tiendasDelUsuario();
  const tieneVariasTiendas = misTiendas.includes("TODAS") || misTiendas.length > 1;
  const opcionesTienda = misTiendas.includes("TODAS")
    ? TIENDAS.map(t => `<option value="${t.id}">${t.nombre}</option>`).join("")
    : misTiendas.map(id => `<option value="${id}">${nombrePorId(id)}</option>`).join("");

  cont.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0; font-size:15px; color:var(--azul-base)">1. Archivos y parámetros</h3>

      ${tieneVariasTiendas ? `
        <label for="na-tienda">Tienda a analizar</label>
        <select id="na-tienda" style="width:100%; padding:11px 12px; border:1px solid var(--borde); border-radius:8px; font-size:14px; font-family:'Inter',sans-serif">
          ${opcionesTienda}
        </select>
      ` : `<input type="hidden" id="na-tienda" value="${misTiendas[0] || ''}">`}

      <label for="na-ventas">Archivo de ventas (.MHT)</label>
      <input type="file" id="na-ventas" accept=".mht,.MHT">

      <label for="na-stock-tienda">Stock de la tienda (.MHT)</label>
      <input type="file" id="na-stock-tienda" accept=".mht,.MHT">

      <label for="na-stock-kacosa">Stock de Kacosa (.MHT)</label>
      <input type="file" id="na-stock-kacosa" accept=".mht,.MHT">

      <label for="na-periodo">¿Para cuánto tiempo necesitas abastecerte?</label>
      <select id="na-periodo" style="width:100%; padding:11px 12px; border:1px solid var(--borde); border-radius:8px; font-size:14px; font-family:'Inter',sans-serif">
        <option value="semana">Una semana</option>
        <option value="mes">Un mes</option>
        <option value="meses">Varios meses</option>
      </select>

      <div id="na-meses-wrap" style="display:none">
        <label for="na-meses-cantidad">¿Cuántos meses?</label>
        <input type="number" id="na-meses-cantidad" min="1" max="24" value="2">
      </div>

      <label for="na-margen">Margen de seguridad: <span id="na-margen-valor">30%</span></label>
      <input type="range" id="na-margen" min="10" max="100" step="5" value="30" style="width:100%">

      <button id="btn-analizar" class="btn-primario" style="margin-top:20px; max-width:260px">
        Analizar
      </button>
      <p id="na-estado" class="vista-sub" style="margin-top:12px"></p>
    </div>

    <div id="na-duplicados"></div>
    <div id="na-resultados"></div>
  `;

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
    const ventasProcesadas = procesarVentas(filasVentas);

    estadoTexto.textContent = "Leyendo stock de la tienda...";
    const filasStockTienda = parsearMHT(await archivoStockTienda.text());
    const stockTienda = agruparStock(filasStockTienda, [centroTienda]);

    estadoTexto.textContent = "Leyendo stock de Kacosa...";
    const filasStockKacosa = parsearMHT(await archivoStockKacosa.text());
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
      fechaAnalisis: new Date().toLocaleDateString("es-VE")
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
  estadoTexto.textContent = `Análisis completo — ${resultado.length} material(es) procesados.`;
  mostrarResultados(resultado, sugerencias);

  // Deja el resultado disponible globalmente para el chat y otros módulos
  window.KACOSA.ultimoAnalisis = {
    tienda: estado.tiendaSeleccionada,
    fechaAnalisis: estado.fechaAnalisis,
    periodo: estado.periodo,
    margenPct: estado.margenPct,
    materiales: resultado,
    sugerencias
  };

  document.dispatchEvent(new CustomEvent("kacosa:analisis-listo", { detail: window.KACOSA.ultimoAnalisis }));
}

/**
 * Anexa al resultado los materiales de la base de Alta Rotación que:
 * - NO quedaron en el resultado del cálculo normal
 * - SÍ tienen stock disponible en Kacosa
 * - NO tienen stock en la tienda
 * Se agregan por la cantidad mínima de empaque.
 */
function anexarAltaRotacionFaltante(resultado, stockTienda, stockKacosa, altaRotacion, periodoAnalizado) {
  const codigosEnResultado = new Set(resultado.map(m => m.codigo));
  const anexados = [];

  altaRotacion.forEach(m => {
    const codigo = String(m.codigo);
    if (codigosEnResultado.has(codigo)) return;

    const infoKacosa = stockKacosa[codigo];
    const stockKacosaDisp = infoKacosa ? infoKacosa.stockDisponible : 0;
    if (stockKacosaDisp <= 0) return;

    const infoTienda = stockTienda[codigo];
    const stockTiendaDisp = infoTienda ? infoTienda.stockDisponible : 0;
    if (stockTiendaDisp > 0) return; // sí hay en tienda, no hace falta anexarlo forzado

    const empaque = Number(m.empaque) || 1;
    const aPedir = Math.min(empaque, stockKacosaDisp);

    resultado.push({
      codigo,
      descripcion: m.descripcion,
      clase: m.clase,
      ventasPeriodo: 0,
      stockTienda: stockTiendaDisp,
      stockKacosa: stockKacosaDisp,
      aPedir,
      aPedirIdeal: aPedir,
      pendiente: 0,
      empaque,
      periodoAnalizado
    });
    anexados.push(codigo);
  });

  return { resultadoConAnexos: resultado, anexados };
}

/**
 * Genera el reporte de sugerencias: materiales con stock disponible en Kacosa
 * que NO están en el resultado del a pedir, NO están en Alta Rotación, y
 * NO tienen stock en la tienda.
 */
function generarSugerencias(resultado, stockTienda, stockKacosa, altaRotacion) {
  const codigosEnResultado = new Set(resultado.map(m => m.codigo));
  const codigosAltaRotacion = new Set(altaRotacion.map(m => String(m.codigo)));

  return Object.values(stockKacosa).filter(m => {
    if (m.stockDisponible <= 0) return false;
    if (codigosEnResultado.has(m.codigo)) return false;
    if (codigosAltaRotacion.has(m.codigo)) return false;
    const infoTienda = stockTienda[m.codigo];
    const stockTiendaDisp = infoTienda ? infoTienda.stockDisponible : 0;
    if (stockTiendaDisp > 0) return false;
    return true;
  }).map(m => ({
    codigo: m.codigo,
    descripcion: m.descripcion,
    unidadBase: m.unidadBase,
    stockKacosa: m.stockDisponible
  }));
}

/**
 * Materiales con stock disponible en la TIENDA que NO tuvieron NINGÚN
 * movimiento de venta/devolución en todo el periodo analizado — para
 * control de mercancía sin rotación (dinero parado en el estante).
 */
function generarSinRotacion(stockKacosa, stockTienda, ventasProcesadas) {
  const codigosConMovimiento = new Set(Object.keys(ventasProcesadas.porMaterial));

  return Object.values(stockTienda).filter(m => {
    if (m.stockDisponible <= 0) return false;
    if (codigosConMovimiento.has(m.codigo)) return false;
    return true;
  }).map(m => {
    const infoKacosa = stockKacosa[m.codigo];
    return {
      codigo: m.codigo,
      descripcion: m.descripcion,
      unidadBase: m.unidadBase,
      stockTienda: m.stockDisponible,
      stockKacosa: infoKacosa ? infoKacosa.stockDisponible : 0
    };
  });
}

function clasificarEnCuatroGrupos(resultado, sugerencias) {
  const pedido = resultado.filter(m => m.aPedir > 0);
  const noPedido = resultado.filter(m => m.aPedirIdeal === 0);
  const pendienteStock = resultado.filter(m => m.pendiente > 0);
  return { pedido, noPedido, pendienteStock, sugerencias };
}

function mostrarResultados(resultado, sugerencias) {
  const cont = document.getElementById("na-resultados");
  const grupos = clasificarEnCuatroGrupos(resultado, sugerencias);
  estado.grupos = grupos;

  const totalAPedir = grupos.pedido.reduce((acc, m) => acc + m.aPedir, 0);
  const porClase = { A: 0, B: 0, C: 0, D: 0 };
  resultado.forEach(m => porClase[m.clase]++);

  const ordenado = grupos.pedido.slice().sort((a, b) => b.aPedir - a.aPedir);

  cont.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0; font-size:15px; color:var(--azul-base)">3. Resultado</h3>
      <p class="vista-sub" style="margin-top:0">Periodo de movimientos analizado: <strong>${resultado[0]?.periodoAnalizado || "—"}</strong></p>
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
      <div style="overflow-x:auto">
        <table style="width:100%; border-collapse:collapse; font-size:13px">
          <thead>
            <tr style="text-align:left; border-bottom:2px solid var(--borde)">
              <th style="padding:8px 6px">Código</th>
              <th style="padding:8px 6px">Descripción</th>
              <th style="padding:8px 6px">Clase</th>
              <th style="padding:8px 6px">Ventas periodo</th>
              <th style="padding:8px 6px">Stock tienda</th>
              <th style="padding:8px 6px">Stock Kacosa</th>
              <th style="padding:8px 6px">A pedir</th>
            </tr>
          </thead>
          <tbody>
            ${ordenado.map(m => `
              <tr style="border-bottom:1px solid var(--borde)">
                <td style="padding:8px 6px">${m.codigo}</td>
                <td style="padding:8px 6px">${m.descripcion}</td>
                <td style="padding:8px 6px; font-weight:700">${m.clase}</td>
                <td style="padding:8px 6px">${m.ventasPeriodo}</td>
                <td style="padding:8px 6px">${m.stockTienda}</td>
                <td style="padding:8px 6px">${m.stockKacosa}</td>
                <td style="padding:8px 6px; font-weight:700; color:var(--azul-base)">${m.aPedir}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <p class="vista-sub" style="margin-top:16px">
        Los 5 archivos descargables incluyen: (1) ${grupos.pedido.length} material(es) a pedir,
        (2) ${grupos.noPedido.length} que no ameritaron pedido,
        (3) ${grupos.pendienteStock.length} con pedido pendiente por falta de stock en Kacosa,
        (4) ${grupos.sugerencias.length} sugerencia(s),
        (5) ${(estado.sinRotacion || []).length} sin rotación en tienda.
      </p>

      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:20px">
        <button id="btn-descargar-excel" class="btn-primario" style="max-width:220px">Descargar los 5 Excel</button>
        <button id="btn-guardar-analisis" class="btn-google" style="max-width:220px; margin-top:0">Guardar análisis</button>
        <button id="btn-enviar-correo" class="btn-google" style="max-width:220px; margin-top:0">Enviar por correo</button>
      </div>
      <p id="na-estado-acciones" class="vista-sub" style="margin-top:10px"></p>
    </div>
  `;

  document.getElementById("btn-descargar-excel").addEventListener("click", descargarExcel);
  document.getElementById("btn-guardar-analisis").addEventListener("click", guardarAnalisisEnSheets);
  document.getElementById("btn-enviar-correo").addEventListener("click", enviarCorreo);
}

/* ============ Excel (SheetJS) — 4 archivos ============ */

function filasBase(materiales) {
  return materiales.map(m => ({
    Codigo: m.codigo,
    Descripcion: m.descripcion,
    Clase: m.clase,
    Ventas_Periodo: m.ventasPeriodo,
    Stock_Tienda: m.stockTienda,
    Stock_Kacosa: m.stockKacosa,
    A_Pedir: m.aPedir,
    Periodo_Analizado: m.periodoAnalizado,
    Periodo_de_abastecimiento: m.periodoAbastecimiento
  }));
}

function crearWorkbook(filas, nombreHoja) {
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
  return wb;
}

function construirArchivos() {
  const { pedido, noPedido, pendienteStock, sugerencias } = estado.grupos;
  const base = `${estado.tiendaSeleccionada}_${estado.fechaAnalisis.replace(/\//g, "-")}`;

  const archivos = [
    { nombre: `1_A_Pedir_${base}.xlsx`, wb: crearWorkbook(filasBase(pedido), "A_Pedir") },
    { nombre: `2_No_Amerito_Pedido_${base}.xlsx`, wb: crearWorkbook(filasBase(noPedido), "No_Amerito_Pedido") },
    {
      nombre: `3_Pendiente_Por_Stock_Kacosa_${base}.xlsx`,
      wb: crearWorkbook(pendienteStock.map(m => ({
        Codigo: m.codigo,
        Descripcion: m.descripcion,
        Clase: m.clase,
        A_Pedir_Ideal: m.aPedirIdeal,
        A_Pedir_Real: m.aPedir,
        Pendiente: m.pendiente,
        Stock_Kacosa: m.stockKacosa,
        Periodo_Analizado: m.periodoAnalizado,
        Periodo_de_abastecimiento: m.periodoAbastecimiento
      })), "Pendiente_Stock_Kacosa")
    },
    {
      nombre: `4_Sugerencias_${base}.xlsx`,
      wb: crearWorkbook(sugerencias.map(s => ({
        Material: s.codigo,
        Texto_Breve: s.descripcion,
        Unidad_Medida_Base: s.unidadBase,
        Stock_Kacosa: s.stockKacosa
      })), "Sugerencias")
    },
    {
      nombre: `5_Sin_Rotacion_En_Tienda_${base}.xlsx`,
      wb: crearWorkbook((estado.sinRotacion || []).map(s => ({
        Material: s.codigo,
        Texto_Breve: s.descripcion,
        Unidad_Medida_Base: s.unidadBase,
        Stock_Tienda: s.stockTienda,
        Stock_Kacosa: s.stockKacosa
      })), "Sin_Rotacion")
    }
  ];

  return archivos;
}

function descargarExcel() {
  construirArchivos().forEach(a => XLSX.writeFile(a.wb, a.nombre));
}

/* ============ Guardar en Google Sheets ============ */

async function guardarAnalisisEnSheets() {
  const estadoAcciones = document.getElementById("na-estado-acciones");
  estadoAcciones.textContent = "Guardando en Google Sheets...";

  const resp = await callBridge("guardarAnalisis", {
    tienda: estado.tiendaSeleccionada,
    fechaAnalisis: estado.fechaAnalisis,
    materiales: estado.resultadoFinal
  });

  estadoAcciones.textContent = resp.ok
    ? `Guardado correctamente. ${resp.altaRotacionAgregados > 0 ? `(${resp.altaRotacionAgregados} nuevo(s) en Alta Rotación)` : ""}`
    : "Error al guardar: " + resp.error;
}

/* ============ Enviar por correo (4 adjuntos) ============ */

async function enviarCorreo() {
  const estadoAcciones = document.getElementById("na-estado-acciones");
  estadoAcciones.textContent = "Preparando los 4 archivos...";

  const archivos = construirArchivos().map(a => ({
    nombre: a.nombre,
    base64: XLSX.write(a.wb, { type: "base64", bookType: "xlsx" })
  }));

  const totalAPedir = estado.grupos.pedido.reduce((acc, m) => acc + m.aPedir, 0);

  estadoAcciones.textContent = "Enviando correo...";
  const resp = await callBridge("sendReport", {
    tienda: estado.tiendaSeleccionada,
    fechaAnalisis: estado.fechaAnalisis,
    resumen: {
      totalAPedir,
      valorEstimado: totalAPedir,
      quiebresKacosa: estado.grupos.pendienteStock.length
    },
    archivos
  });

  estadoAcciones.textContent = resp.ok ? resp.mensaje : "Error al enviar: " + resp.error;
}

document.addEventListener("kacosa:vista-cambiada", (e) => {
  if (e.detail.vista === "vista-nuevo-analisis") render();
});
