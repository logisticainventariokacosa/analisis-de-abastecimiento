// js/innovacion.js
import { callBridge, archivoABase64 } from "./bridge.js";
import { TIENDAS, nombrePorId } from "./tiendas.js";

let inicializado = false;

function tiendasDelUsuario() {
  return window.KACOSA?.tiendas || [];
}

function render() {
  const cont = document.getElementById("innovacion-contenido");
  if (!cont) return;

  const misTiendas = tiendasDelUsuario();
  const tieneVariasTiendas = misTiendas.includes("TODAS") || misTiendas.length > 1;

  const opcionesSelect = misTiendas.includes("TODAS")
    ? TIENDAS.map(t => `<option value="${t.id}">${t.nombre}</option>`).join("")
    : misTiendas.map(id => `<option value="${id}">${nombrePorId(id)}</option>`).join("");

  cont.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0; font-size:15px; color: var(--azul-base)">Registrar nuevo material</h3>
      <form id="form-innovacion">
        ${tieneVariasTiendas ? `
          <label for="inn-tienda">Tienda</label>
          <select id="inn-tienda" required style="width:100%; padding:11px 12px; border:1px solid var(--borde); border-radius:8px; font-size:14px; font-family:'Inter',sans-serif">
            ${opcionesSelect}
          </select>
        ` : `<input type="hidden" id="inn-tienda" value="${misTiendas[0] || ''}">`}

        <label for="inn-descripcion">Descripción del material solicitado</label>
        <textarea id="inn-descripcion" required rows="3"
          style="width:100%; padding:11px 12px; border:1px solid var(--borde); border-radius:8px; font-size:14px; font-family:'Inter',sans-serif; resize:vertical"
          placeholder="Ej: Tomacorriente doble USB-C color blanco, marca Bticino"></textarea>

        <label for="inn-fecha">Fecha de solicitud</label>
        <input type="date" id="inn-fecha" required>

        <label for="inn-imagen">Foto del material (opcional)</label>
        <input type="file" id="inn-imagen" accept="image/*" capture="environment">

        <button type="submit" class="btn-primario" style="margin-top:18px; max-width:260px">
          Registrar material
        </button>
      </form>
      <p id="estado-innovacion" class="vista-sub" style="margin-top:12px"></p>
    </div>

    <div class="card">
      <h3 style="margin-top:0; font-size:15px; color: var(--azul-base)">Materiales registrados</h3>
      <div id="lista-innovacion"><p class="vista-sub">Cargando...</p></div>
    </div>
  `;

  document.getElementById("inn-fecha").valueAsDate = new Date();
  document.getElementById("form-innovacion").addEventListener("submit", registrarMaterial);

  cargarLista();
}

async function registrarMaterial(e) {
  e.preventDefault();
  const estado = document.getElementById("estado-innovacion");
  const btnSubmit = e.target.querySelector("button[type=submit]");

  const tienda = document.getElementById("inn-tienda").value;
  const descripcion = document.getElementById("inn-descripcion").value.trim();
  const fechaSolicitud = document.getElementById("inn-fecha").value;
  const inputImagen = document.getElementById("inn-imagen");

  if (!tienda || !descripcion) {
    estado.textContent = "Completa la tienda y la descripción.";
    return;
  }

  btnSubmit.disabled = true;
  estado.textContent = "Guardando...";

  try {
    let imagenBase64 = null;
    let imagenNombre = null;

    if (inputImagen.files && inputImagen.files[0]) {
      estado.textContent = "Comprimiendo imagen...";
      const archivoComprimido = await comprimirImagen(inputImagen.files[0], 1024, 0.75);
      imagenBase64 = await archivoABase64(archivoComprimido);
      imagenNombre = "innovacion_" + Date.now() + ".jpg";
    }

    estado.textContent = "Enviando...";
    const usuario = window.KACOSA?.usuario?.email || "";

    const resp = await callBridge("agregarMaterialInnovacion", {
      tienda, descripcion, fechaSolicitud, usuario,
      imagenBase64, imagenNombre
    });

    if (!resp.ok) {
      estado.textContent = "Error: " + resp.error;
    } else {
      estado.textContent = "Material registrado correctamente.";
      e.target.reset();
      document.getElementById("inn-fecha").valueAsDate = new Date();
      cargarLista();
    }
  } catch (err) {
    estado.textContent = "Error: " + err.message;
  } finally {
    btnSubmit.disabled = false;
  }
}

/** Redimensiona y comprime una imagen en el navegador antes de convertirla a base64,
 *  para no enviar fotos de varios MB directo desde la cámara del celular. */
function comprimirImagen(archivo, anchoMax, calidad) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, anchoMax / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * escala;
      canvas.height = img.height * escala;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error("No se pudo comprimir la imagen"));
        resolve(new File([blob], archivo.name, { type: "image/jpeg" }));
      }, "image/jpeg", calidad);
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function cargarLista() {
  const lista = document.getElementById("lista-innovacion");
  const misTiendas = tiendasDelUsuario();
  const filtroTienda = misTiendas.includes("TODAS") ? "TODAS" : (misTiendas[0] || "");

  const resp = await callBridge("leerMaterialesInnovacion", { tienda: filtroTienda });

  if (!resp.ok) {
    lista.innerHTML = `<p class="vista-sub">Error al cargar: ${resp.error}</p>`;
    return;
  }

  if (resp.materiales.length === 0) {
    lista.innerHTML = `<p class="vista-sub">Aún no hay materiales registrados.</p>`;
    return;
  }

  const ordenados = resp.materiales.slice().reverse(); // más recientes primero

  lista.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px,1fr)); gap:14px">
      ${ordenados.map(m => `
        <div style="border:1px solid var(--borde); border-radius:8px; overflow:hidden">
          ${m.imagenUrl ? `<a href="${m.imagenUrl}" target="_blank"><img src="${m.imagenUrl.replace('/view?usp=drivesdk','/preview')}" style="width:100%; height:140px; object-fit:cover; display:block" onerror="this.style.display='none'"></a>` : `<div style="height:70px; background:var(--fondo); display:flex; align-items:center; justify-content:center; color:var(--texto-secundario); font-size:12px">Sin imagen</div>`}
          <div style="padding:10px 12px">
            <div style="font-size:11px; color:var(--texto-secundario); font-weight:600; text-transform:uppercase">${nombrePorId(m.tienda)}</div>
            <div style="font-size:13px; margin:4px 0 8px">${m.descripcion}</div>
            <div style="display:flex; justify-content:space-between; align-items:center">
              <span style="font-size:11px; color:var(--texto-secundario)">${formatearFecha(m.fechaSolicitud)}</span>
              <span style="font-size:11px; font-weight:700; color:${m.estado === 'Pendiente' ? 'var(--ambar-oscuro)' : 'var(--verde-kpi)'}">${m.estado}</span>
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function formatearFecha(valor) {
  if (!valor) return "";
  const d = new Date(valor);
  if (isNaN(d)) return String(valor);
  return d.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

document.addEventListener("kacosa:vista-cambiada", (e) => {
  if (e.detail.vista === "vista-innovacion") render();
});
