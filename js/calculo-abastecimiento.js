// js/calculo-abastecimiento.js
import { obtenerEmpaque } from "./paquetes.js";

/**
 * Clasifica un material según su tasa de venta (en unidad de venta, NO base),
 * normalizada a semana o mes.
 * @param {number} tasa - ventaNetaUnidadVenta / semanas  ó  / meses
 * @param {"semanal"|"mensual"} modo
 */
export function clasificar(tasa, modo) {
  if (modo === "semanal") {
    if (tasa >= 7) return "A";
    if (tasa >= 3) return "B";
    if (tasa >= 1) return "C";
    return "D";
  }
  // modo mensual
  if (tasa >= 30) return "A";
  if (tasa >= 15) return "B";
  if (tasa >= 1) return "C";
  return "D";
}

/**
 * Calcula el "a pedir" completo para todos los materiales que tuvieron venta.
 *
 * @param {Object} params
 * @param {Object} params.ventasProcesadas - salida de procesarVentas() (js/ventas-parser.js)
 * @param {Object} params.stockTienda - salida de agruparStock() para la tienda
 * @param {Object} params.stockKacosa - salida de agruparStock() para Kacosa (centros 1000+3000)
 * @param {"semana"|"mes"|"meses"} params.periodo - horizonte de abastecimiento elegido por el usuario
 * @param {number} params.mesesCantidad - solo si periodo === "meses" (ej. 3)
 * @param {number} params.margenPct - 10 a 100
 * @returns {Array<Object>} lista de materiales con su análisis completo
 */
export function calcularAbastecimiento({ ventasProcesadas, stockTienda, stockKacosa, periodo, mesesCantidad, margenPct }) {
  const { porMaterial, rangoFechas } = ventasProcesadas;
  const modoClasificacion = periodo === "semana" ? "semanal" : "mensual";

  const resultado = [];

  Object.values(porMaterial).forEach(v => {
    // --- Clasificación ABCD (con unidad de venta, no la base) ---
    const tasaClasificacion = modoClasificacion === "semanal"
      ? v.ventaNetaUnidadVenta / rangoFechas.semanas
      : v.ventaNetaUnidadVenta / rangoFechas.meses;
    const clase = clasificar(tasaClasificacion, modoClasificacion);

    // --- Demanda promedio por periodo (en unidad BASE) ---
    const tasaBaseSemanal = v.ventaNetaUnidadBase / rangoFechas.semanas;
    const tasaBaseMensual = v.ventaNetaUnidadBase / rangoFechas.meses;

    let demandaPeriodo;
    if (periodo === "semana") demandaPeriodo = tasaBaseSemanal;
    else if (periodo === "mes") demandaPeriodo = tasaBaseMensual;
    else demandaPeriodo = tasaBaseMensual * (mesesCantidad || 1); // "meses" custom

    // --- Margen de seguridad ---
    const demandaConMargen = demandaPeriodo * (1 + (margenPct || 0) / 100);

    // --- Resta el stock disponible en tienda ---
    const infoTienda = stockTienda[v.codigo];
    const stockTiendaDisp = infoTienda ? infoTienda.stockDisponible : 0;
    const aPedirBruto = Math.max(0, demandaConMargen - stockTiendaDisp);

    // --- Tope por stock disponible en Kacosa ---
    const infoKacosa = stockKacosa[v.codigo];
    const stockKacosaDisp = infoKacosa ? infoKacosa.stockDisponible : 0;
    const aPedirTopado = Math.min(aPedirBruto, stockKacosaDisp);

    // --- Redondeo a unidades enteras y luego a múltiplo del paquete ---
    const aPedirEnteros = Math.ceil(aPedirTopado);
    const empaque = obtenerEmpaque(v.codigo);

    let aPedirFinal = aPedirEnteros;
    if (empaque > 1 && aPedirEnteros > 0) {
      const candidatoRedondeado = Math.ceil(aPedirEnteros / empaque) * empaque;
      // Solo redondeamos hacia arriba si Kacosa realmente tiene esa cantidad disponible
      aPedirFinal = candidatoRedondeado <= stockKacosaDisp ? candidatoRedondeado : aPedirEnteros;
    }

    resultado.push({
      codigo: v.codigo,
      descripcion: v.descripcion,
      clase,
      ventasPeriodo: v.ventaNetaUnidadVenta,
      stockTienda: stockTiendaDisp,
      stockKacosa: stockKacosaDisp,
      aPedir: aPedirFinal,
      empaque
    });
  });

  return resultado;
}
