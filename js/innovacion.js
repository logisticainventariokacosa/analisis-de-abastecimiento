// js/innovacion.js
import { callBridge, archivoABase64 } from "./bridge.js";
import { TIENDAS, nombrePorId } from "./tiendas.js";

let inicializado = false;
let materialesCache = [];

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
      <h3 style="margin-top:0; font-size:15px; color:var(--azul-base); display:flex; align-items:center; gap:10px">
        <span style="display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; background:var(--ambar-claro); border-radius:8px; font-size:14px">💡</span>
        Registrar nuevo material
      </h3>

      <form id="form-innovacion">
        ${tieneVariasTiendas ? `
          <div style="margin-top:4px">
            <label class="form-label" for="inn-tienda">Tienda <span class="required">*</span></label>
            <select id="inn-tienda" class="input-modern select-modern" required>
              ${opcionesSelect}
            </select>
          </div>
        ` : `<input type="hidden" id="inn-tienda" value="${misTiendas[0] || ''}">`}

        <div style="margin-top:16px">
          <label class="form-label" for="inn-descripcion">Descripción del material solicitado <span class="required">*</span></label>
          <textarea id="inn-descripcion" required rows="3"
            class="input-modern"
            style="resize:vertical; min-height:80px; font-family:'Inter',sans-serif"
            placeholder="Ej: Tomacorriente doble USB-C color blanco, marca Bticino"></textarea>
        </div>

        <div style="margin-top:16px">
          <label class="form-label" for="inn-fecha">Fecha de solicitud <span class="required">*</span></label>
          <input type="date" id="inn-fecha" class="input-modern" required>
        </div>

        <div style="margin-top:16px">
          <label class="form-label" for="inn-imagen">Foto del material (opcional)</label>
          <div class="file-input-wrapper" id="file-wrapper-innovacion">
            <span class="file-icon">📷</span>
            <div class="file-info">
              <div class="file-name" id="file-name-innovacion">Seleccionar archivo</div>
              <div class="file-hint">JPG, PNG · Foto del material</div>
            </div>
            <span class="file-status empty" id="file-status-innovacion">Pendiente</span>
            <input type="file" id="inn-imagen" accept="image/*" capture="environment">
          </div>
        </div>

        <button type="submit" class="btn-primario" style="margin-top:18px; min-width:200px">
          📝 Registrar material
        </button>
      </form>
      <p id="estado-innovacion" class="estado-texto"></p>
    </div>

    <div class="card">
      <h3 style="margin-top:0; font-size:15px; color:var(--azul-base)">Materiales registrados</h3>
      <div id="lista-innovacion"><p class="vista-sub">Cargando...</p></div>
    </div>
  `;

  // Event listener para la imagen
  const inputImg = document.getElementById("inn-imagen");
  const nameEl = document.getElementById("file-name-innovacion");
  const statusEl = document.getElementById("file-status-innovacion");
  const wrapper = document.getElementById("file-wrapper-innovacion");

  if (inputImg) {
    inputImg.addEventListener('change', () => {
      if (inputImg.files && inputImg.files[0]) {
        nameEl.textContent = inputImg.files[0].name;
        statusEl.textContent = '✓ Cargado';
        statusEl.className = 'file-status loaded';
        wrapper.classList.add('loaded');
      } else {
        nameEl.textContent = 'Seleccionar archivo';
        statusEl.textContent = 'Pendiente';
        statusEl.className = 'file-status empty';
        wrapper.classList.remove('loaded');
      }
    });

    // Drag and drop
    if (wrapper) {
      wrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        wrapper.classList.add('dragover');
      });
      wrapper.addEventListener('dragleave', () => {
        wrapper.classList.remove('dragover');
      });
      wrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        wrapper.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
          inputImg.files = e.dataTransfer.files;
          inputImg.dispatchEvent(new Event('change'));
        }
      });
    }
  }

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
      // Resetear el input de archivo
      const inputImg = document.getElementById("inn-imagen");
      if (inputImg) {
        inputImg.value = "";
        document.getElementById("file-name-innovacion").textContent = "Seleccionar archivo";
        document.getElementById("file-status-innovacion").textContent = "Pendiente";
        document.getElementById("file-status-innovacion").className = "file-status empty";
        document.getElementById("file-wrapper-innovacion").classList.remove("loaded");
      }
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

  materialesCache = resp.materiales.slice().reverse(); // más recientes primero

  lista.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px,1fr)); gap:14px">
      ${materialesCache.map((m, idx) => `
        <div class="tarjeta-innovacion" data-idx="${idx}" style="border:1px solid var(--borde); border-radius:8px; overflow:hidden; background:var(--blanco); cursor:pointer; transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)'" onmouseout="this.style.boxShadow='none'">
          ${m.imagenUrl ? `<img src="${convertirUrlPreview(m.imagenUrl)}" style="width:100%; height:140px; object-fit:cover; display:block" onerror="this.style.display='none'">` : `<div style="height:70px; background:var(--fondo); display:flex; align-items:center; justify-content:center; color:var(--texto-claro); font-size:12px">📷 Sin imagen</div>`}
          <div style="padding:10px 12px">
            <div style="font-size:11px; color:var(--texto-secundario); font-weight:600; text-transform:uppercase">${nombrePorId(m.tienda)}</div>
            <div style="font-size:13px; margin:4px 0 8px">${m.descripcion}</div>
            <div style="display:flex; justify-content:space-between; align-items:center">
              <span style="font-size:11px; color:var(--texto-claro)">${formatearFecha(m.fechaSolicitud)}</span>
              <span style="font-size:11px; font-weight:700; color:${m.estado === 'Pendiente' ? 'var(--ambar-oscuro)' : 'var(--verde-kpi)'}">${m.estado}</span>
            </div>
          </div>
        </div>
      `).join("")}
    </div>
    <div id="modal-innovacion"></div>
  `;

  document.querySelectorAll(".tarjeta-innovacion").forEach(tarjeta => {
    tarjeta.addEventListener("click", () => abrirModal(Number(tarjeta.dataset.idx)));
  });
}

function convertirUrlPreview(url) {
  return url.replace("/view?usp=drivesdk", "/preview");
}

function abrirModal(idx) {
  const m = materialesCache[idx];
  const modal = document.getElementById("modal-innovacion");

  const esPendiente = m.estado === "Pendiente";
  const nuevoEstado = esPendiente ? "Procesado" : "Pendiente";

  modal.innerHTML = `
    <div id="overlay-modal-innovacion" style="position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:60; display:flex; align-items:center; justify-content:center; padding:20px">
      <div style="background:#fff; border-radius:12px; max-width:420px; width:100%; max-height:90vh; overflow-y:auto; box-shadow:0 12px 32px rgba(0,0,0,0.25)">
        ${m.imagenUrl ? `
          <img src="${convertirUrlPreview(m.imagenUrl)}" style="width:100%; max-height:320px; object-fit:contain; background:#000; display:block">
        ` : `
          <div style="height:120px; background:var(--fondo); display:flex; align-items:center; justify-content:center; color:var(--texto-secundario)">📷 Sin imagen</div>
        `}
        <div style="padding:20px">
          <div style="font-size:11px; color:var(--texto-secundario); font-weight:700; text-transform:uppercase">${nombrePorId(m.tienda)}</div>
          <h3 style="font-size:16px; color:var(--azul-base); margin:6px 0 10px">${m.descripcion}</h3>
          <p style="font-size:12px; color:var(--texto-secundario); margin:0 0 4px">Solicitado: ${formatearFecha(m.fechaSolicitud)}</p>
          <p style="font-size:12px; color:var(--texto-secundario); margin:0 0 4px">Registrado por: ${m.usuario || "—"}</p>
          <p style="font-size:13px; margin:10px 0; font-weight:700; color:${esPendiente ? 'var(--ambar-oscuro)' : 'var(--verde-kpi)'}">Estado actual: ${m.estado}</p>

          <div style="display:flex; gap:10px; margin-top:16px">
            <button id="btn-cambiar-estado" class="btn-primario" style="max-width:none; flex:1">
              Marcar como ${nuevoEstado}
            </button>
            <button id="btn-cerrar-modal" class="btn-google" style="max-width:none; margin-top:0; flex:0 0 auto; padding-left:18px; padding-right:18px">
              Cerrar
            </button>
          </div>
          <p id="estado-modal-innovacion" class="vista-sub" style="margin-top:10px"></p>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btn-cerrar-modal").addEventListener("click", cerrarModal);
  document.getElementById("overlay-modal-innovacion").addEventListener("click", (e) => {
    if (e.target.id === "overlay-modal-innovacion") cerrarModal();
  });
  document.getElementById("btn-cambiar-estado").addEventListener("click", () => cambiarEstado(m.id, nuevoEstado));
}

function cerrarModal() {
  const modal = document.getElementById("modal-innovacion");
  if (modal) modal.innerHTML = "";
}

async function cambiarEstado(id, nuevoEstado) {
  const estadoModal = document.getElementById("estado-modal-innovacion");
  estadoModal.textContent = "Actualizando...";

  const resp = await callBridge("actualizarEstadoInnovacion", { id, estado: nuevoEstado });

  if (!resp.ok) {
    estadoModal.textContent = "Error: " + resp.error;
    return;
  }

  cerrarModal();
  cargarLista();
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
