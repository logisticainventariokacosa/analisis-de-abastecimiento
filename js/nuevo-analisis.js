// js/nuevo-analisis.js
import { parsearMHT } from "./mht-parser.js";
import { procesarVentas } from "./ventas-parser.js";
import { agruparStock } from "./stock-parser.js";
import { cargarPaquetes } from "./paquetes.js";
import { calcularAbastecimiento } from "./calculo-abastecimiento.js";
import { detectarCandidatosLocal, confirmarConGemini, fusionarDuplicados } from "./deteccion-duplicados.js";
import { TIENDAS, nombrePorId } from "./tiendas.js";

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

function finalizarCalculo(gruposConfirmados) {
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

  const resultado = calcularAbastecimiento({
    ventasProcesadas: estado.ventasProcesadas,
    stockTienda: estado.stockTienda,
    stockKacosa: estado.stockKacosa,
    periodo: estado.periodo,
    mesesCantidad: estado.mesesCantidad,
    margenPct: estado.margenPct
  });

  estado.resultadoFinal = resultado;
  estadoTexto.textContent = `Análisis completo — ${resultado.length} material(es) procesados.`;
  mostrarResultados(resultado);

  // Deja el resultado disponible globalmente para los siguientes pasos (Excel, guardar, correo, chat)
  window.KACOSA.ultimoAnalisis = {
    tienda: estado.tiendaSeleccionada,
    fechaAnalisis: estado.fechaAnalisis,
    periodo: estado.periodo,
    margenPct: estado.margenPct,
    materiales: resultado
  };

  document.dispatchEvent(new CustomEvent("kacosa:analisis-listo", { detail: window.KACOSA.ultimoAnalisis }));
}

function mostrarResultados(resultado) {
  const cont = document.getElementById("na-resultados");

  const totalAPedir = resultado.reduce((acc, m) => acc + m.aPedir, 0);
  const quiebres = resultado.filter(m => m.stockKacosa <= 0 && m.aPedir === 0).length;
  const porClase = { A: 0, B: 0, C: 0, D: 0 };
  resultado.forEach(m => porClase[m.clase]++);

  const ordenado = resultado.slice().sort((a, b) => b.aPedir - a.aPedir);

  cont.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0; font-size:15px; color:var(--azul-base)">3. Resultado</h3>
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
      <p class="vista-sub" style="margin-top:14px">
        Próximo paso: descargar el Excel, guardarlo y enviarlo por correo. (Lo agregamos en el siguiente paso)
      </p>
    </div>
  `;
}

document.addEventListener("kacosa:vista-cambiada", (e) => {
  if (e.detail.vista === "vista-nuevo-analisis") render();
});
