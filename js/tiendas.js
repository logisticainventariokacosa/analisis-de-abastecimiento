// js/tiendas.js
// Catálogo único de tiendas: usado por el dashboard, el selector de tienda,
// y para mapear el "Centro" de los archivos SAP a cada tienda.

export const TIENDAS = [
  { id: "UPI_VALENCIA",        nombre: "Upi Valencia",        centro: "1200" },
  { id: "UPI_CASTILLO",        nombre: "Upi Castillo",        centro: "1500" },
  { id: "UPI_LOS_GUAYOS",      nombre: "Upi Los Guayos",      centro: "1700" },
  { id: "UPI_MARACAY",         nombre: "Upi Maracay",         centro: "1400" },
  { id: "UPI_MERCADERES",      nombre: "Upi Mercaderes",      centro: "1900" },
  { id: "UPI_PUERTO_CABELLO",  nombre: "Upi Puerto Cabello",  centro: "11A0" },
  { id: "UPI_ROSAL",           nombre: "Upi Rosal",           centro: "19A0" },
  { id: "UPI_CORO",            nombre: "Upi Coro",            centro: "12A0" },
  { id: "GIGANTE",             nombre: "Gigante",             centro: "1300" },
  { id: "GIGANTE_2",           nombre: "Gigante 2",           centro: "1600" },
  { id: "COMERCIAL_SALVADOR",  nombre: "Comercial Salvador",  centro: "2010" },
  { id: "PRODUCTOS_KHALED",    nombre: "Productos Khaled",    centro: "2090" }
];

// Centros que pertenecen a Kacosa (casa matriz) — se tratan como una sola unidad
export const CENTROS_KACOSA = ["1000", "3000"];

export function nombrePorId(id) {
  const t = TIENDAS.find(t => t.id === id);
  return t ? t.nombre : id;
}
