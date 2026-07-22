// js/mht-parser.js
// SAP GUI exporta los archivos como MHTML (multipart/related) con una única
// tabla HTML adentro. Cada celda trae, además del texto visible, un atributo
// x:num (si es numérico) o x:str (si es texto) con el valor "limpio" sin
// separadores de miles ni formato — los usamos quando estén disponibles.

/**
 * Parsea un archivo .MHT de SAP y devuelve un array de objetos,
 * uno por fila de datos, usando la primera fila de la tabla como encabezados.
 * @param {string} textoArchivo - contenido completo del archivo .MHT (texto plano)
 * @returns {Array<Object>}
 */
export function parsearMHT(textoArchivo) {
  // El archivo MHT es multipart MIME; la parte que nos interesa es el HTML.
  // Buscamos desde la primera etiqueta <html hasta el final del contenido HTML,
  // ignorando los encabezados MIME y el boundary final.
  const inicioHtml = textoArchivo.indexOf("<html");
  if (inicioHtml === -1) {
    throw new Error("El archivo no contiene una tabla HTML reconocible (¿es un .MHT válido de SAP?)");
  }
  // El cierre </html> marca el final del contenido real
  const finHtml = textoArchivo.indexOf("</html>", inicioHtml);
  const html = finHtml !== -1
    ? textoArchivo.slice(inicioHtml, finHtml + 7)
    : textoArchivo.slice(inicioHtml);

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const tabla = doc.querySelector("table");
  if (!tabla) {
    throw new Error("No se encontró ninguna tabla dentro del archivo.");
  }

  const filasHtml = Array.from(tabla.querySelectorAll("tr"));
  if (filasHtml.length < 2) return [];

  const valorCelda = (td) => {
    // Preferimos el valor "crudo" que SAP guarda en x:num (sin formato),
    // luego x:str, y si no existe ninguno, el texto visible de la celda.
    if (td.hasAttribute("x:num")) return td.getAttribute("x:num");
    if (td.hasAttribute("x:str")) return td.getAttribute("x:str");
    return td.textContent.trim();
  };

  const encabezados = Array.from(filasHtml[0].querySelectorAll("td, th"))
    .map(td => td.textContent.trim());

  const filas = [];
  for (let i = 1; i < filasHtml.length; i++) {
    const celdas = Array.from(filasHtml[i].querySelectorAll("td, th"));
    if (celdas.length === 0) continue;

    const fila = {};
    encabezados.forEach((nombreCol, idx) => {
      fila[nombreCol] = celdas[idx] ? valorCelda(celdas[idx]) : "";
    });
    filas.push(fila);
  }

  return filas;
}

/** Convierte un valor de celda a número, tolerando vacíos o texto no numérico (devuelve 0). */
export function aNumero(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;
  const n = parseFloat(String(valor).replace(/\./g, "").replace(",", "."));
  // Nota: si x:num ya viene limpio (formato americano con punto decimal),
  // este reemplazo de miles podría no aplicar — se ajusta abajo con un chequeo simple.
  const nDirecto = parseFloat(valor);
  return isNaN(nDirecto) ? (isNaN(n) ? 0 : n) : nDirecto;
}
