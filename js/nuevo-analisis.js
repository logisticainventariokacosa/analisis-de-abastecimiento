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

/**
 * Valida que cada archivo tenga el/los centro(s) correctos:
 * - Ventas: un único centro, igual al de la tienda seleccionada.
 * - Stock tienda: un único centro, igual al de la tienda seleccionada.
 * - Stock Kacosa: solo centros 1000 y/o 3000, ningún otro.
 * Devuelve un string con el mensaje de error, o null si todo está correcto.
 */
function validarCentros(filasVentas, filasStockTienda, filasStockKacosa, centroTienda) {
  const extraerCentros = (filas) =>
    new Set(filas.map(f => String(f["Centro"] || "").trim()).filter(Boolean));

  const centrosVentas = extraerCentros(filasVentas);
  if (centrosVentas.size === 0) {
    return "El archivo de ventas no tiene datos de Centro reconocibles.";
  }
  if (centrosVentas.size > 1) {
    return `El archivo de ventas contiene más de un centro (${[...centrosVentas].join(", ")}). Debe contener un único centro, el de la tienda seleccionada.`;
  }
  const centroVentasDetectado = [...centrosVentas][0];
  if (centroVentasDetectado !== centroTienda) {
    return `El archivo de ventas corresponde al centro ${centroVentasDetectado}, pero seleccionaste una tienda con centro ${centroTienda}. Verifica que subiste el archivo correcto.`;
  }

  const centrosStockTienda = extraerCentros(filasStockTienda);
  if (centrosStockTienda.size === 0) {
    return "El archivo de stock de la tienda no tiene datos de Centro reconocibles.";
  }
  if (centrosStockTienda.size > 1) {
    return `El archivo de stock de la tienda contiene más de un centro (${[...centrosStockTienda].join(", ")}). Debe contener un único centro.`;
  }
  const centroStockDetectado = [...centrosStockTienda][0];
  if (centroStockDetectado !== centroTienda) {
    return `El archivo de stock de tienda corresponde al centro ${centroStockDetectado}, pero seleccionaste una tienda con centro ${centroTienda}. Verifica que subiste el archivo correcto.`;
  }

  const centrosStockKacosa = extraerCentros(filasStockKacosa);
  if (centrosStockKacosa.size === 0) {
    return "El archivo de stock de Kacosa no tiene datos de Centro reconocibles.";
  }
  const centrosInvalidos = [...centrosStockKacosa].filter(c => !CENTROS_KACOSA.includes(c));
  if (centrosInvalidos.length > 0) {
    return `El archivo de stock de Kacosa contiene centro(s) que no pertenecen a Kacosa (${centrosInvalidos.join(", ")}). Kacosa solo puede ser 1000 y/o 3000.`;
  }

  return null; // todo válido
}

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
        <input type="range" id="na-margen" min="10" max="100" step="5" value="30">
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
  
  // Mostrar información del período en el mensaje
  const mesesUsados = estado.ventasProcesadas.rangoFechas?.meses || '?';
  const semanasUsadas = estado.ventasProcesadas.rangoFechas?.semanas || '?';
  estadoTexto.textContent = `Análisis completo — ${resultado.length} material(es) procesados. Período usado: ${mesesUsados} meses (${semanasUsadas} semanas).`;
  
  mostrarResultados(resultado, sugerencias);

  // Deja el resultado disponible globalmente para el chat y otros módulos
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
    if (stockTiendaDisp > 0) return;

    const empaque = Number(m.empaque) || 1;
    const aPedir = Math.min(empaque, stockKacosaDisp);

    resultado.push({
      codigo,
      descripcion: m.descripcion,
      clase: m.clase || "D",
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
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Descripción</th>
              <th>Clase</th>
              <th>Ventas periodo</th>
              <th>Stock tienda</th>
              <th>Stock Kacosa</th>
              <th>A pedir</th>
            </tr>
          </thead>
          <tbody>
            ${ordenado.map(m => `
              <tr>
                <td>${m.codigo}</td>
                <td>${m.descripcion}</td>
                <td><span class="clase-badge clase-${m.clase.toLowerCase()}">${m.clase}</span></td>
                <td>${m.ventasPeriodo}</td>
                <td>${m.stockTienda}</td>
                <td>${m.stockKacosa}</td>
                <td><strong>${m.aPedir}</strong></td>
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

      <div class="btn-group">
        <button id="btn-descargar-excel" class="btn-primario">📥 Descargar los 5 Excel</button>
        <button id="btn-guardar-analisis" class="btn-secundario">💾 Guardar análisis</button>
        <button id="btn-enviar-correo" class="btn-secundario">📧 Enviar por correo</button>
      </div>
      <p id="na-estado-acciones" class="estado-texto" style="margin-top:10px"></p>
    </div>
  `;

  document.getElementById("btn-descargar-excel").addEventListener("click", descargarExcel);
  document.getElementById("btn-guardar-analisis").addEventListener("click", guardarAnalisisEnSheets);
  document.getElementById("btn-enviar-correo").addEventListener("click", enviarCorreo);
}

/* ============ Excel (SheetJS) — 5 archivos ============ */

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

/* ============ Enviar por correo (5 adjuntos) ============ */

async function enviarCorreo() {
  const estadoAcciones = document.getElementById("na-estado-acciones");
  estadoAcciones.textContent = "Preparando los 5 archivos...";

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
