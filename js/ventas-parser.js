// js/ventas-parser.js
import { aNumero } from "./mht-parser.js";
import { obtenerFactor } from "./factores-conversion.js";

// Clases de movimiento relevantes según SAP
const CLASES_VENTA = ["909", "601"];        // salidas por venta (negativas)
const CLASES_DEVOLUCION = ["910", "653", "651"]; // entradas por devolución (positivas)
const CLASES_RELEVANTES = [...CLASES_VENTA, ...CLASES_DEVOLUCION];

/**
 * Procesa las filas ya parseadas del archivo de ventas.
 * @param {Array<Object>} filas - salida de parsearMHT()
 * @param {Object} opciones - opciones de procesamiento
 * @param {number} opciones.mesesAnalisis - número de meses a considerar (opcional)
 * @param {number} opciones.semanasAnalisis - número de semanas a considerar (opcional)
 * @returns {{ porMaterial: Object, rangoFechas: {inicio:Date, fin:Date, semanas:number, meses:number} }}
 */
export function procesarVentas(filas, opciones = {}) {
  const porMaterial = {}; // codigo -> { descripcion, unidades: { unidad: sumaSigned }, unidadMasUsada }
  let fechaMin = null;
  let fechaMax = null;

  filas.forEach(f => {
    // Rango de fechas se calcula sobre TODO el archivo, sin importar la clase de movimiento
    const fecha = parsearFechaSAP(f["Fe.contabilización"]);
    if (fecha) {
      if (!fechaMin || fecha < fechaMin) fechaMin = fecha;
      if (!fechaMax || fecha > fechaMax) fechaMax = fecha;
    }

    const clase = String(f["Clase de movimiento"] || "").trim();
    if (!CLASES_RELEVANTES.includes(clase)) return; // ignora otros tipos de movimiento

    const codigo = String(f["Material"] || "").trim();
    if (!codigo) return;

    const cantidad = aNumero(f["Ctd.en UM entrada"]);
    const unidad = String(f["Un.medida de entrada"] || "UN").trim();

    if (!porMaterial[codigo]) {
      porMaterial[codigo] = {
        codigo,
        descripcion: f["Texto breve de material"] || "",
        unidades: {}, // unidad -> suma signed de cantidades
        conteoFilasPorUnidad: {}
      };
    }
    const m = porMaterial[codigo];
    m.unidades[unidad] = (m.unidades[unidad] || 0) + cantidad;
    m.conteoFilasPorUnidad[unidad] = (m.conteoFilasPorUnidad[unidad] || 0) + 1;
  });

  // --- Calcular semanas y meses (priorizar opciones del usuario) ---
  let semanas, meses;
  
  if (opciones.semanasAnalisis !== undefined && opciones.semanasAnalisis !== null) {
    // El usuario especificó semanas exactas
    semanas = Math.max(1, opciones.semanasAnalisis);
    // Calcular meses aproximados (1 mes = 4.345 semanas)
    meses = Math.max(1, Math.round(semanas / 4.345));
  } else if (opciones.mesesAnalisis !== undefined && opciones.mesesAnalisis !== null) {
    // El usuario especificó meses exactos
    meses = Math.max(1, opciones.mesesAnalisis);
    // Calcular semanas aproximadas (1 mes = 4.345 semanas)
    semanas = Math.max(1, Math.round(meses * 4.345));
  } else if (fechaMin && fechaMax) {
    // Si no hay opciones del usuario, calcular del rango de fechas del archivo
    const dias = diasEntre(fechaMin, fechaMax);
    semanas = Math.max(1, Math.round(dias / 7));
    meses = Math.max(1, Math.round(dias / 30.44));
  } else {
    // Fallback: 1 mes por defecto
    semanas = 4;
    meses = 1;
  }

  // --- Calcular resultado por material ---
  const resultado = {};
  Object.values(porMaterial).forEach(m => {
    // Unidad "principal" = la que más filas tuvo (normalmente solo hay una)
    const unidadPrincipal = Object.keys(m.conteoFilasPorUnidad)
      .sort((a, b) => m.conteoFilasPorUnidad[b] - m.conteoFilasPorUnidad[a])[0];

    // Venta neta total en unidad de venta (suma de TODAS las unidades registradas, sin convertir)
    const sumaSignedTotal = Object.values(m.unidades).reduce((acc, v) => acc + v, 0);
    const ventaNetaUnidadVenta = Math.abs(sumaSignedTotal);

    // Venta neta convertida a unidad base: se convierte cada grupo (unidad) por su propio factor
    let ventaNetaUnidadBase = 0;
    Object.entries(m.unidades).forEach(([unidad, sumaSigned]) => {
      const factor = obtenerFactor(m.codigo, unidad);
      ventaNetaUnidadBase += sumaSigned / factor;
    });
    ventaNetaUnidadBase = Math.abs(ventaNetaUnidadBase);

    resultado[m.codigo] = {
      codigo: m.codigo,
      descripcion: m.descripcion,
      unidadVenta: unidadPrincipal || "UN",
      ventaNetaUnidadVenta: redondear(ventaNetaUnidadVenta),
      ventaNetaUnidadBase: redondear(ventaNetaUnidadBase)
    };
  });

  return {
    porMaterial: resultado,
    rangoFechas: { 
      inicio: fechaMin, 
      fin: fechaMax, 
      semanas: Math.round(semanas * 100) / 100, 
      meses: Math.round(meses * 100) / 100 
    }
  };
}

/** SAP suele exportar la fecha como DD.MM.AAAA o similar; intentamos varios formatos comunes. */
function parsearFechaSAP(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();

  // Formato DD.MM.AAAA
  let m = texto.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  // Formato AAAA-MM-DD (x:num a veces trae este formato)
  m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  // Formato DD/MM/AAAA
  m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  const fechaGenerica = new Date(texto);
  return isNaN(fechaGenerica) ? null : fechaGenerica;
}

function diasEntre(a, b) {
  return Math.abs((b - a) / (1000 * 60 * 60 * 24));
}

function redondear(n) {
  return Math.round(n * 100) / 100;
}
