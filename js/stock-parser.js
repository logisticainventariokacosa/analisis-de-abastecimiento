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
