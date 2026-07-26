// js/footer-reloj.js
// Actualiza la fecha/hora en vivo del pie de página y el año del copyright.

function actualizarReloj() {
  const ahora = new Date();

  const fechaEl = document.getElementById("footer-fecha");
  const horaEl = document.getElementById("footer-hora");
  const segundosEl = document.getElementById("footer-segundos");
  const anioEl = document.getElementById("footer-anio");

  if (fechaEl) {
    fechaEl.textContent = ahora.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  if (horaEl && segundosEl) {
    const horas = String(ahora.getHours()).padStart(2, "0");
    const minutos = String(ahora.getMinutes()).padStart(2, "0");
    const segundos = String(ahora.getSeconds()).padStart(2, "0");
    horaEl.textContent = `${horas}:${minutos}`;
    segundosEl.textContent = `:${segundos}`;
  }
  if (anioEl) {
    anioEl.textContent = ahora.getFullYear();
  }
}

actualizarReloj();
setInterval(actualizarReloj, 1000);
