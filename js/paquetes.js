// js/paquetes.js
// Carga la lista de paquetes/empaques una sola vez y la deja en caché en memoria.

let cachePaquetes = null;

export async function cargarPaquetes() {
  if (cachePaquetes) return cachePaquetes;
  const resp = await fetch("data/paquetes.json");
  if (!resp.ok) throw new Error("No se pudo cargar data/paquetes.json");
  cachePaquetes = await resp.json();
  return cachePaquetes;
}

/** Devuelve la cantidad de unidades por paquete/caja para un material. 1 si no está en la lista. */
export function obtenerEmpaque(codigo) {
  if (!cachePaquetes) return 1;
  const info = cachePaquetes[String(codigo)];
  return info ? Number(info.empaque) || 1 : 1;
}

/** Devuelve { umb, empaque, descripcion } o null si el material no está en la lista. */
export function obtenerInfoPaquete(codigo) {
  if (!cachePaquetes) return null;
  return cachePaquetes[String(codigo)] || null;
}
