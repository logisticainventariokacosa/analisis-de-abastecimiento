// js/stock-parser.js
import { aNumero } from "./mht-parser.js";

/**
 * Agrupa las filas de un archivo de stock (tienda o Kacosa) por material,
 * sumando todos los almacenes de los centros indicados.
 * Disponible = Libre utilización + Trans./Trasl. + Devoluciones
 * (En control calidad y Bloqueado NO cuentan, según la definición del negocio).
 *
 * @param {Array<Object>} filas - salida de parsearMHT()
 * @param {Array<string>} centrosFiltro - centros SAP a incluir (ej. ["1300"] o ["1000","3000"])
 * @returns {Object} codigo -> { codigo, descripcion, unidadBase, stockDisponible }
 */
export function agruparStock(filas, centrosFiltro) {
  const mapa = {};

  filas.forEach(f => {
    const centro = String(f["Centro"] || "").trim();
    if (!centrosFiltro.includes(centro)) return;

    const codigo = String(f["Material"] || "").trim();
    if (!codigo) return;

    const libreUtilizacion = aNumero(f["Libre utilización"]);
    const transTrasl = aNumero(f["Trans./Trasl."]);
    const devoluciones = aNumero(f["Devoluciones"]);
    const disponible = libreUtilizacion + transTrasl + devoluciones;

    if (!mapa[codigo]) {
      mapa[codigo] = {
        codigo,
        descripcion: f["Texto breve de material"] || "",
        unidadBase: f["Unidad medida base"] || "UN",
        stockDisponible: 0
      };
    }
    mapa[codigo].stockDisponible += disponible;
  });

  return mapa;
}

/**
 * Procesa un archivo de notas pendientes por despacho y devuelve un mapa
 * codigo -> { cantidad, numeroNota, fechaNota } para los materiales
 * cuyo Centro receptor coincida con los centros de la tienda.
 *
 * @param {Array<Object>} filas - salida de parsearMHT()
 * @param {Array<string>} centrosFiltro - centros de la tienda
 * @returns {Object} codigo -> { cantidad, numeroNota, fechaNota }
 */
export function procesarNotasPendientes(filas, centrosFiltro) {
  const mapa = {};

  filas.forEach(f => {
    const centroReceptor = String(f["Centro receptor"] || "").trim();
    if (!centrosFiltro.includes(centroReceptor)) return;

    const codigo = String(f["Material"] || "").trim();
    if (!codigo) return;

    const cantidad = aNumero(f["Cant Ent"] || 0);
    if (cantidad <= 0) return;

    const numeroNota = String(f["Entrega"] || "").trim();
    const fechaNota = String(f["Fecha entrega"] || "").trim();

    if (!mapa[codigo]) {
      mapa[codigo] = { cantidad: 0, numeroNota: numeroNota, fechaNota: fechaNota };
    }

    // Sumar cantidad, acumular notas y fechas (separadas por coma)
    mapa[codigo].cantidad += cantidad;
    if (numeroNota && !mapa[codigo].numeroNota.includes(numeroNota)) {
      mapa[codigo].numeroNota = mapa[codigo].numeroNota 
        ? mapa[codigo].numeroNota + ", " + numeroNota 
        : numeroNota;
    }
    if (fechaNota && !mapa[codigo].fechaNota.includes(fechaNota)) {
      mapa[codigo].fechaNota = mapa[codigo].fechaNota 
        ? mapa[codigo].fechaNota + ", " + fechaNota 
        : fechaNota;
    }
  });

  return mapa;
}
