const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const PALETA = ["#d9f0ea", "#e5eaf8", "#f8ecd9", "#f6e1e7", "#e5f0d8", "#ece7f8", "#dceef6"];

const state = {
  semanas: [],
  personal: [],
  estados: [],
  huecos: [],
  hoy: null,
  meta: {},
  semana: null,
  focos: [],
  tareas: [],
  filtroEstado: "todas",
  filtroPersona: "todas",
  searchTimer: null,
};

let animarEntrada = false;
let drawerTimer = null;

const $ = (sel) => document.querySelector(sel);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function toast(message, isError) {
  const el = $("#toast");
  el.hidden = false;
  el.textContent = message;
  el.className = isError ? "toast error" : "toast";
  requestAnimationFrame(() => el.classList.add("is-on"));
  clearTimeout(toast._t);
  clearTimeout(toast._hide);
  toast._t = setTimeout(() => {
    el.classList.remove("is-on");
    toast._hide = setTimeout(() => {
      if (!el.classList.contains("is-on")) el.hidden = true;
    }, 260);
  }, 3400);
}

async function api(url, options) {
  const res = await fetch(url, options);
  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error(data.error || "No se pudo completar la acción");
  return data;
}

function fmtFecha(iso, conAnio) {
  if (!iso) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const base = `${d} ${MESES[m - 1]}`;
  return conAnio ? `${base} ${y}` : base;
}

function fmtRango(a, b, conAnio = true) {
  if (!a || !b) return "";
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  if (ya !== yb) return `${da} ${MESES[ma - 1]} ${ya} – ${db} ${MESES[mb - 1]} ${yb}`;
  if (ma === mb) {
    const base = `${da}–${db} ${MESES[ma - 1]}`;
    return conAnio ? `${base} ${ya}` : base;
  }
  const base = `${da} ${MESES[ma - 1]} – ${db} ${MESES[mb - 1]}`;
  return conAnio ? `${base} ${ya}` : base;
}

function fmtMin(minutos) {
  if (!minutos) return "0 h";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} h`;
  return `${h} h ${m} min`;
}

function hoursValue(minutos) {
  if (minutos == null || minutos === "") return "";
  const horas = minutos / 60;
  return Number.isInteger(horas) ? String(horas) : String(Math.round(horas * 100) / 100);
}

function initials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function color(name) {
  let n = 0;
  for (const ch of name) n = (n + ch.charCodeAt(0)) % PALETA.length;
  return PALETA[n];
}

function claseEstado(estado) {
  return "status status-" + estado.toLowerCase().replace(/\s+/g, "");
}

function esHoy(semana) {
  return state.hoy && semana.anio === state.hoy.anio && semana.numero === state.hoy.semana;
}

function esUltima(semana) {
  if (!state.semanas.length) return false;
  const top = state.semanas[0];
  return semana.anio === top.anio && semana.numero === top.numero;
}

function rangos(nums) {
  if (!nums.length) return "";
  const parts = [];
  let start = nums[0];
  let prev = nums[0];
  for (const n of nums.slice(1)) {
    if (n === prev + 1) { prev = n; continue; }
    parts.push(start === prev ? String(start) : `${start}–${prev}`);
    start = prev = n;
  }
  parts.push(start === prev ? String(start) : `${start}–${prev}`);
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`;
}

function opcionesEstado(actual) {
  return state.estados.map((estado) => (
    `<option value="${esc(estado)}"${estado === actual ? " selected" : ""}>${esc(estado)}</option>`
  )).join("");
}

function chips(lista) {
  if (!lista.length) return '<span class="muted">Sin asignar</span>';
  return `<span class="chips">${lista.map((p) => (
    `<span class="chip" style="--c:${color(p.nombre)}"><span class="av">${esc(initials(p.nombre))}</span>${esc(p.nombre)}</span>`
  )).join("")}</span>`;
}

function visible(tarea) {
  if (state.filtroEstado === "abiertas" && tarea.estado === "Realizado") return false;
  if (state.filtroEstado !== "todas" && state.filtroEstado !== "abiertas" && tarea.estado !== state.filtroEstado) return false;
  if (state.filtroPersona === "sin") return tarea.responsables.length === 0;
  if (state.filtroPersona !== "todas") {
    return tarea.responsables.some((p) => String(p.id) === String(state.filtroPersona));
  }
  return true;
}

function renderWeeks() {
  const nav = $("#weeks");
  const y = nav.scrollTop;
  const items = state.semanas.map((s) => {
    const pct = s.total ? Math.round((s.realizadas / s.total) * 100) : 0;
    const bits = [
      esHoy(s) ? "en curso" : "",
      s.es_copia ? "copia" : "",
      `${s.realizadas}/${s.total}`,
    ].filter(Boolean).join(" · ");
    const current = state.semana && state.semana.id === s.id;
    return `<button class="week" type="button" data-week="${s.id}" ${current ? 'aria-current="true"' : ""}>
      <span class="num">${s.numero}</span>
      <span>
        <strong>${esc(fmtRango(s.fecha_inicio, s.fecha_fin, false))}</strong>
        <small>${esc(bits)}</small>
        <span class="mini"><span style="width:${pct}%"></span></span>
      </span>
    </button>`;
  }).join("");
  const huecos = state.huecos.length
    ? `<p class="huecos">En el Excel no vienen las semanas ${esc(rangos(state.huecos))}.</p>`
    : "";
  nav.innerHTML = items + huecos;
  nav.scrollTop = y;
}

function filaTarea(tarea) {
  const nota = tarea.gestion
    ? `<div class="nota" title="${esc(tarea.gestion)}">${esc(tarea.gestion.replace(/\s+/g, " "))}</div>`
    : "";
  const fecha = tarea.fecha_entrega
    ? `<span title="${esc(tarea.fecha_entrega)}">${esc(fmtFecha(tarea.fecha_entrega, false))}</span>`
    : '<span class="muted">—</span>';
  return `<tr data-task="${tarea.id}">
    <td><div class="tarea-titulo">${esc(tarea.descripcion)}</div>${nota}</td>
    <td class="c-resp">${chips(tarea.responsables)}</td>
    <td class="c-origen">${tarea.semana_prioridad ?? '<span class="muted">—</span>'}</td>
    <td class="c-fecha">${fecha}</td>
    <td class="c-tiempo"><label class="time"><input data-field="tiempo" type="number" min="0" step="0.25" value="${esc(hoursValue(tarea.tiempo_minutos))}" aria-label="Tiempo en horas"><span>h</span></label></td>
    <td class="c-estado"><select data-field="estado" class="${claseEstado(tarea.estado)}" aria-label="Estado">${opcionesEstado(tarea.estado)}</select></td>
  </tr>`;
}

function tabla(seccion, titulo) {
  const todas = state.tareas.filter((t) => t.seccion === seccion);
  const filas = todas.filter(visible);
  const filtrando = state.filtroEstado !== "todas" || state.filtroPersona !== "todas";
  if (!filas.length && filtrando) return "";
  const cabeza = `<div class="sec-head">
    <h3>${titulo} <span>${filas.length}</span></h3>
    <button class="btn" type="button" data-action="new-task" data-seccion="${seccion}">Nueva tarea</button>
  </div>`;
  if (!filas.length) {
    return `${cabeza}<div class="empty">Todavía no hay tareas en esta sección.</div>`;
  }
  return `${cabeza}<div class="table-wrap"><table class="plan">
    <thead><tr>
      <th>Tarea</th><th>Responsables</th><th class="c-origen">Origen</th>
      <th class="c-fecha">Entrega</th><th class="c-tiempo">Tiempo</th><th class="c-estado">Estado</th>
    </tr></thead>
    <tbody>${filas.map(filaTarea).join("")}</tbody>
  </table></div>`;
}

function htmlCarga() {
  const map = new Map();
  for (const tarea of state.tareas) {
    const nombres = tarea.responsables.length ? tarea.responsables : [{ id: 0, nombre: "Sin asignar" }];
    for (const persona of nombres) {
      const item = map.get(persona.nombre) || { nombre: persona.nombre, abiertas: 0, minutos: 0 };
      if (tarea.estado !== "Realizado") item.abiertas += 1;
      item.minutos += tarea.tiempo_minutos || 0;
      map.set(persona.nombre, item);
    }
  }
  const lista = [...map.values()].filter((item) => item.abiertas || item.minutos);
  if (!lista.length) return "";
  lista.sort((a, b) => b.abiertas - a.abiertas || a.nombre.localeCompare(b.nombre, "es"));
  const compartidas = state.tareas.some((t) => t.responsables.length > 1);
  const pills = lista.map((item) => {
    const tiempo = item.minutos ? ` · ${fmtMin(item.minutos)}` : "";
    const chip = item.nombre === "Sin asignar"
      ? `<span class="muted">Sin asignar</span>`
      : `<span class="chip" style="--c:${color(item.nombre)}"><span class="av">${esc(initials(item.nombre))}</span>${esc(item.nombre)}</span>`;
    const etiqueta = item.abiertas === 1 ? "abierta" : "abiertas";
    return `<li>${chip}<span>${item.abiertas} ${etiqueta}${tiempo}</span></li>`;
  }).join("");
  const nota = compartidas
    ? `<p class="note">Si una tarea tiene varios responsables, cuenta completa para cada uno.</p>`
    : "";
  return `<section class="block"><h2>Carga abierta</h2><ul class="carga">${pills}</ul>${nota}</section>`;
}

function renderMain() {
  const main = $("#main");
  const y = animarEntrada ? 0 : main.scrollTop;
  if (!state.semana) {
    $("#content").innerHTML = `<div class="empty">No hay semanas cargadas. Coloca el Excel junto al programa y vuelve a abrirlo.</div>`;
    return;
  }
  const s = state.semana;
  const total = state.tareas.length;
  const realizadas = state.tareas.filter((t) => t.estado === "Realizado").length;
  const pct = total ? Math.round((realizadas / total) * 100) : 0;
  const minutos = state.tareas.reduce((sum, t) => sum + (t.tiempo_minutos || 0), 0);
  const pendientes = state.tareas.filter((t) => t.estado === "Pendiente").length;
  const enCurso = state.tareas.filter((t) => t.estado === "En curso").length;
  const sinEstado = state.tareas.filter((t) => t.estado === "Sin estado").length;
  const semanaHoy = state.semanas.find(esHoy);
  const avisoHoy = esHoy(s)
    ? `<p class="hoy">Semana en curso.</p>`
    : (semanaHoy
      ? `<p class="hoy">Hoy, ${esc(fmtFecha(state.hoy.fecha, false))}, es la semana ${state.hoy.semana}. <button class="link" type="button" data-week="${semanaHoy.id}">Ir a esa semana</button></p>`
      : "");
  const siguiente = esUltima(s)
    ? `<button class="btn primary" type="button" data-action="next-week">Preparar semana ${s.numero + 1}</button>`
    : "";
  const focos = state.focos.map((foco) => `<article class="foco" data-foco="${foco.id}">
      <header>
        <span>${esc(foco.titulo)}</span>
        <select data-field="foco-estado" data-id="${foco.id}" class="${claseEstado(foco.estado)}" aria-label="Estado de ${esc(foco.titulo)}">${opcionesEstado(foco.estado)}</select>
      </header>
      <p>${esc(foco.descripcion || "Sin descripción")}</p>
    </article>`).join("");
  const stats = [
    `<span class="stat"><b>${total}</b> <span>tareas</span></span>`,
    `<span class="stat"><b>${realizadas}</b> <span>realizadas</span></span>`,
    pendientes ? `<span class="stat"><b>${pendientes}</b> <span>pendientes</span></span>` : "",
    enCurso ? `<span class="stat"><b>${enCurso}</b> <span>en curso</span></span>` : "",
    sinEstado ? `<span class="stat"><b>${sinEstado}</b> <span>sin estado</span></span>` : "",
    `<span class="stat"><b>${esc(fmtMin(minutos))}</b> <span>estimadas</span></span>`,
  ].filter(Boolean).join("");
  const personas = ['<option value="todas">Todo el personal</option>', '<option value="sin">Sin asignar</option>']
    .concat(state.personal.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`))
    .join("");
  const filtros = `
    <div class="toolbar">
      <select id="filtro-estado" aria-label="Filtrar por estado">
        <option value="todas"${state.filtroEstado === "todas" ? " selected" : ""}>Todos los estados</option>
        <option value="abiertas"${state.filtroEstado === "abiertas" ? " selected" : ""}>Abiertas</option>
        ${opcionesEstado(state.filtroEstado)}
      </select>
      <select id="filtro-persona" aria-label="Filtrar por persona">${personas}</select>
    </div>`;
  const vacio = state.tareas.length && !state.tareas.some(visible)
    ? `<div class="empty" style="margin-top:16px">Ninguna tarea coincide con el filtro.</div>`
    : "";
  const copia = s.es_copia ? `<p class="note">Esta semana llegó como copia en el Excel.</p>` : "";
  $("#content").innerHTML = `
    <header class="top">
      <div>
        <div class="kicker">Plan ${s.anio}</div>
        <h1>Semana ${s.numero}</h1>
        <p class="rango">${esc(fmtRango(s.fecha_inicio, s.fecha_fin))}</p>
        ${avisoHoy}
        ${copia}
      </div>
      ${siguiente}
    </header>
    <div class="progress" title="${realizadas} de ${total}"><span style="width:${pct}%"></span></div>
    <p class="progress-label">${realizadas} de ${total} realizadas</p>
    <section class="block">
      <h2>Foco de la semana</h2>
      <div class="focos">${focos || '<div class="empty">Sin actividades de cabecera.</div>'}</div>
    </section>
    <section class="block"><div class="stats">${stats}</div>${minutos ? "" : '<p class="note">El tiempo de ejecución se carga en cada tarea. El Excel no lo traía.</p>'}</section>
    ${htmlCarga()}
    ${filtros}
    ${tabla("prioritaria", "Actividades prioritarias")}
    ${tabla("extra", "Actividades extras")}
    ${vacio}
  `;
  const content = $("#content");
  if (animarEntrada) {
    content.classList.remove("enter");
    void content.offsetWidth;
    content.classList.add("enter");
  }
  const persona = $("#filtro-persona");
  if (persona) persona.value = String(state.filtroPersona);
  document.title = `Semana ${s.numero} · Plan semanal`;
  main.scrollTop = y;
}

function syncResumen() {
  const item = state.semanas.find((s) => s.id === state.semana.id);
  if (!item) return;
  item.total = state.tareas.length;
  item.realizadas = state.tareas.filter((t) => t.estado === "Realizado").length;
  item.minutos = state.tareas.reduce((sum, t) => sum + (t.tiempo_minutos || 0), 0);
}

async function loadWeek(id) {
  const data = await api(`/api/semanas/${id}`);
  state.semana = data.semana;
  state.focos = data.focos;
  state.tareas = data.tareas;
  syncResumen();
  renderWeeks();
  animarEntrada = true;
  renderMain();
  animarEntrada = false;
}

function cerrarDrawer() {
  const drawer = $("#drawer");
  const backdrop = $("#backdrop");
  if (drawer.hidden) return;
  drawer.classList.remove("is-on");
  backdrop.classList.remove("is-on");
  drawer.setAttribute("aria-hidden", "true");
  clearTimeout(drawerTimer);
  drawerTimer = setTimeout(() => {
    if (!drawer.classList.contains("is-on")) {
      drawer.hidden = true;
      backdrop.hidden = true;
    }
  }, 300);
}

function abrirDrawer(titulo, html, mode, id) {
  const drawer = $("#drawer");
  const backdrop = $("#backdrop");
  clearTimeout(drawerTimer);
  $("#drawer-title").textContent = titulo;
  $("#drawer-body").innerHTML = html;
  drawer.dataset.mode = mode;
  drawer.dataset.id = id || "";
  drawer.hidden = false;
  backdrop.hidden = false;
  drawer.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    drawer.classList.add("is-on");
    backdrop.classList.add("is-on");
  });
  drawer.querySelector("input, textarea, select")?.focus();
}

function checksResponsables(seleccion) {
  const ids = new Set(seleccion.map(Number));
  const personas = state.personal.filter((p) => p.activo || ids.has(p.id));
  return `<div class="field" data-field="responsables"><span>Responsables</span><div class="checks">${personas.map((p) => (
    `<label><input type="checkbox" name="resp" value="${p.id}"${ids.has(p.id) ? " checked" : ""}> ${esc(p.nombre)}</label>`
  )).join("")}</div>
  <div class="add-row" style="margin-top:8px">
    <input name="nueva-persona" placeholder="Agregar persona" maxlength="80">
    <button class="btn" type="button" data-action="add-person-task">Agregar</button>
  </div></div>`;
}

function abrirTarea(tarea, seccion) {
  const actual = tarea || {
    descripcion: "",
    seccion: seccion || "prioritaria",
    semana_prioridad: state.semana.numero,
    fecha_entrega: "",
    tiempo_minutos: null,
    estado: "Pendiente",
    gestion: "",
    responsables: [],
  };
  const fechaTipo = !actual.fecha_entrega || /^\d{4}-\d{2}-\d{2}$/.test(actual.fecha_entrega) ? "date" : "text";
  abrirDrawer(tarea ? "Editar tarea" : "Nueva tarea", `
    <form novalidate>
      <label class="field"><span>Descripción</span><textarea name="descripcion" rows="3" required minlength="3" maxlength="2000">${esc(actual.descripcion)}</textarea></label>
      <label class="field"><span>Sección</span>
        <select name="seccion">
          <option value="prioritaria"${actual.seccion === "prioritaria" ? " selected" : ""}>Actividades prioritarias</option>
          <option value="extra"${actual.seccion === "extra" ? " selected" : ""}>Actividades extras</option>
        </select>
      </label>
      ${checksResponsables(actual.responsables.map((p) => p.id))}
      <div class="grid-2">
        <label class="field"><span>Semana de origen</span><input name="origen" type="number" min="1" max="53" value="${actual.semana_prioridad ?? ""}"></label>
        <label class="field"><span>Fecha de entrega</span><input name="fecha" type="${fechaTipo}" maxlength="80" value="${esc(actual.fecha_entrega || "")}"></label>
        <label class="field"><span>Tiempo de ejecución (horas)</span><input name="tiempo" type="number" min="0" max="200" step="0.25" value="${esc(hoursValue(actual.tiempo_minutos))}"></label>
        <label class="field"><span>Estado</span><select name="estado">${opcionesEstado(actual.estado)}</select></label>
      </div>
      <label class="field"><span>Gestión</span><textarea name="gestion" rows="4" maxlength="4000">${esc(actual.gestion || "")}</textarea></label>
      <div class="drawer-actions">
        <button class="btn primary" type="submit">Guardar</button>
        ${tarea ? '<button class="btn danger" type="button" data-action="delete-task">Eliminar</button>' : ""}
      </div>
    </form>
  `, "task", tarea ? tarea.id : "");
}

function abrirFoco(foco) {
  abrirDrawer(foco.titulo, `
    <form novalidate>
      <label class="field"><span>Título</span><input name="titulo" required minlength="2" maxlength="80" value="${esc(foco.titulo)}"></label>
      <label class="field"><span>Descripción</span><textarea name="descripcion" rows="3" required minlength="3" maxlength="500">${esc(foco.descripcion || "")}</textarea></label>
      <label class="field"><span>Estado</span><select name="estado">${opcionesEstado(foco.estado)}</select></label>
      <label class="field"><span>Detalle</span><textarea name="detalle" rows="3" maxlength="1000">${esc(foco.detalle || "")}</textarea></label>
      <div class="drawer-actions">
        <button class="btn primary" type="submit">Guardar</button>
        <button class="btn danger" type="button" data-action="delete-foco">Eliminar</button>
      </div>
    </form>
  `, "foco", foco.id);
}

function abrirPersonal() {
  const filas = state.personal.map((p) => `
    <div class="person-row">
      <span class="chip" style="--c:${color(p.nombre)}"><span class="av">${esc(initials(p.nombre))}</span>${esc(p.nombre)}</span>
      <button class="btn" type="button" data-action="toggle-person" data-id="${p.id}" data-activo="${p.activo ? "0" : "1"}">${p.activo ? "Activo" : "Inactivo"}</button>
    </div>
  `).join("");
  abrirDrawer("Personal", `
    <div class="people">${filas}</div>
    <form novalidate>
      <label class="field"><span>Nueva persona</span>
        <div class="add-row"><input name="nombre" maxlength="80" required placeholder="Nombre y apellido"><button class="btn primary" type="submit">Agregar</button></div>
      </label>
    </form>
  `, "people", "");
}

function limpiarCampo(field) {
  field.classList.remove("invalid");
  field.querySelector(":scope > .error")?.remove();
}

function marcarError(field, mensaje) {
  if (!field) return;
  field.classList.add("invalid");
  let msg = field.querySelector(":scope > .error");
  if (!msg) {
    msg = document.createElement("small");
    msg.className = "error";
    field.appendChild(msg);
  }
  msg.textContent = mensaje;
}

function enfocar(el) {
  const destino = el.matches?.("input, textarea, select")
    ? el
    : el.querySelector?.("input, textarea, select");
  destino?.focus();
}

function nombreValido(value) {
  const nombre = String(value || "").trim().replace(/\s+/g, " ");
  if (nombre.length < 2) return "Escribe el nombre de la persona.";
  if (nombre.length > 80) return "El nombre es demasiado largo.";
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ .'-]{1,79}$/.test(nombre)) {
    return "El nombre solo puede tener letras, espacios y guiones.";
  }
  return "";
}

function validarTarea(form) {
  form.querySelectorAll(".field.invalid").forEach(limpiarCampo);
  const errores = [];
  const pedir = (el, mensaje) => {
    const field = el.closest?.(".field") || el;
    marcarError(field, mensaje);
    errores.push(field);
  };
  const descripcion = form.descripcion.value.trim();
  if (descripcion.length < 3) pedir(form.descripcion, "Escribe al menos 3 caracteres.");
  else if (descripcion.length > 2000) pedir(form.descripcion, "La descripción supera el límite permitido.");
  if (form.origen.value !== "") {
    const origen = Number(form.origen.value);
    if (!Number.isInteger(origen) || origen < 1 || origen > 53) {
      pedir(form.origen, "Usa un número entero del 1 al 53.");
    }
  }
  const fecha = form.fecha.value.trim();
  if (fecha.length > 80) pedir(form.fecha, "La fecha supera el límite permitido.");
  else if (form.fecha.type === "date" && fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    pedir(form.fecha, "La fecha de entrega no es válida.");
  }
  if (form.tiempo.value !== "") {
    const horas = Number(form.tiempo.value);
    if (!Number.isFinite(horas) || horas < 0 || horas > 200) {
      pedir(form.tiempo, "El tiempo debe estar entre 0 y 200 horas.");
    }
  }
  if (form.gestion.value.length > 4000) pedir(form.gestion, "La gestión supera el límite permitido.");
  const id = $("#drawer").dataset.id;
  const previa = id ? state.tareas.find((t) => t.id === Number(id)) : null;
  const marcados = form.querySelectorAll("input[name=resp]:checked").length;
  const exigeResponsable = !id || (previa && previa.responsables.length > 0);
  if (exigeResponsable && !marcados) {
    pedir(form.querySelector("[data-field=responsables]"), "Asigna al menos una persona.");
  }
  if (!errores.length) return true;
  enfocar(errores[0]);
  return false;
}

function validarFoco(form) {
  form.querySelectorAll(".field.invalid").forEach(limpiarCampo);
  const errores = [];
  const pedir = (el, mensaje) => {
    const field = el.closest(".field");
    marcarError(field, mensaje);
    errores.push(field);
  };
  const titulo = form.titulo.value.trim();
  if (titulo.length < 2) pedir(form.titulo, "El título debe tener al menos 2 caracteres.");
  const descripcion = form.descripcion.value.trim();
  if (descripcion.length < 3) pedir(form.descripcion, "Escribe al menos 3 caracteres.");
  if (form.detalle.value.length > 1000) pedir(form.detalle, "El detalle supera el límite permitido.");
  if (!errores.length) return true;
  enfocar(errores[0]);
  return false;
}

function leerTiempo(input) {
  input.classList.remove("invalid");
  if (input.value === "") return null;
  const horas = Number(input.value);
  if (!Number.isFinite(horas) || horas < 0 || horas > 200) {
    input.classList.add("invalid");
    throw new Error("El tiempo debe estar entre 0 y 200 horas.");
  }
  return Math.round(horas * 60);
}

async function guardarTarea(event) {
  const form = event.target;
  if (!validarTarea(form)) return;
  const id = $("#drawer").dataset.id;
  const body = {
    descripcion: form.descripcion.value,
    seccion: form.seccion.value,
    semana_prioridad: form.origen.value === "" ? null : Number(form.origen.value),
    fecha_entrega: form.fecha.value.trim(),
    tiempo_minutos: leerTiempo(form.tiempo),
    estado: form.estado.value,
    gestion: form.gestion.value,
    responsables: [...form.querySelectorAll("input[name=resp]:checked")].map((el) => Number(el.value)),
  };
  if (id) {
    await api(`/api/tareas/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } else {
    await api(`/api/semanas/${state.semana.id}/tareas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  cerrarDrawer();
  await loadWeek(state.semana.id);
  toast("Tarea guardada");
}

async function guardarFoco(event) {
  const form = event.target;
  if (!validarFoco(form)) return;
  const id = $("#drawer").dataset.id;
  await api(`/api/focos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      titulo: form.titulo.value,
      descripcion: form.descripcion.value,
      estado: form.estado.value,
      detalle: form.detalle.value,
    }),
  });
  cerrarDrawer();
  await loadWeek(state.semana.id);
  toast("Actividad actualizada");
}

async function agregarPersona(nombre) {
  const data = await api("/api/personal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre }),
  });
  if (!state.personal.some((p) => p.id === data.persona.id)) {
    state.personal.push(data.persona);
    state.personal.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }
  return data.persona;
}

function hideSearch() {
  $("#search-results").hidden = true;
  $("#search-results").innerHTML = "";
}

async function buscar(q) {
  const data = await api(`/api/buscar?q=${encodeURIComponent(q)}`);
  const box = $("#search-results");
  if (!data.resultados.length) {
    box.hidden = false;
    box.innerHTML = `<button type="button" disabled>Sin resultados</button>`;
    return;
  }
  box.hidden = false;
  box.innerHTML = data.resultados.map((item) => `
    <button type="button" data-goto="${item.id}" data-semana="${item.semana_id}">
      ${esc(item.descripcion)}
      <small>Semana ${item.numero} · ${esc(item.estado)}</small>
    </button>
  `).join("");
}

async function boot(preferida) {
  const data = await api("/api/inicio");
  state.semanas = data.semanas;
  state.personal = data.personal;
  state.estados = data.estados;
  state.huecos = data.huecos;
  state.hoy = data.hoy;
  state.meta = data.meta || {};
  const meta = $("#meta");
  meta.textContent = state.meta.origen ? `Cargado desde el Excel de 2026.` : "";
  if (!state.semanas.length) {
    renderWeeks();
    renderMain();
    return;
  }
  const id = preferida || state.semanas[0].id;
  await loadWeek(id);
}

function bind() {
  $("#weeks").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-week]");
    if (!button) return;
    try { await loadWeek(Number(button.dataset.week)); }
    catch (error) { toast(error.message, true); }
  });

  $("#content").addEventListener("click", async (event) => {
    const week = event.target.closest("[data-week]");
    if (week) {
      try { await loadWeek(Number(week.dataset.week)); }
      catch (error) { toast(error.message, true); }
      return;
    }
    const action = event.target.closest("[data-action]");
    if (action) {
      if (action.dataset.action === "new-task") abrirTarea(null, action.dataset.seccion);
      if (action.dataset.action === "next-week") {
        const destino = state.semana.numero + 1;
        if (!confirm(`Se creará la semana ${destino} con las tareas que todavía no están realizadas.`)) return;
        action.disabled = true;
        try {
          const data = await api("/api/semanas", { method: "POST" });
          toast(data.mensaje);
          await boot(data.semana.id);
        } catch (error) {
          toast(error.message, true);
          action.disabled = false;
        }
      }
      return;
    }
    if (event.target.closest("input, select, button, a, textarea, label")) return;
    const foco = event.target.closest("[data-foco]");
    if (foco) {
      const item = state.focos.find((f) => f.id === Number(foco.dataset.foco));
      if (item) abrirFoco(item);
      return;
    }
    const row = event.target.closest("[data-task]");
    if (row) {
      const tarea = state.tareas.find((t) => t.id === Number(row.dataset.task));
      if (tarea) abrirTarea(tarea);
    }
  });

  $("#content").addEventListener("change", async (event) => {
    const target = event.target;
    if (target.id === "filtro-estado") {
      state.filtroEstado = target.value;
      renderMain();
      return;
    }
    if (target.id === "filtro-persona") {
      state.filtroPersona = target.value;
      renderMain();
      return;
    }
    if (target.dataset.field === "estado" || target.dataset.field === "tiempo") {
      const row = target.closest("[data-task]");
      const body = {};
      try {
        if (target.dataset.field === "estado") body.estado = target.value;
        if (target.dataset.field === "tiempo") body.tiempo_minutos = leerTiempo(target);
        const data = await api(`/api/tareas/${row.dataset.task}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const index = state.tareas.findIndex((t) => t.id === data.tarea.id);
        if (index >= 0) state.tareas[index] = data.tarea;
        syncResumen();
        renderWeeks();
        renderMain();
      } catch (error) {
        toast(error.message, true);
        renderMain();
      }
      return;
    }
    if (target.dataset.field === "foco-estado") {
      try {
        await api(`/api/focos/${target.dataset.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado: target.value }),
        });
        const foco = state.focos.find((f) => f.id === Number(target.dataset.id));
        if (foco) foco.estado = target.value;
        target.className = claseEstado(target.value);
      } catch (error) {
        toast(error.message, true);
        renderMain();
      }
    }
  });

  $("#drawer").addEventListener("input", (event) => {
    const field = event.target.closest(".field");
    if (field?.classList.contains("invalid")) limpiarCampo(field);
    if (event.target.classList?.contains("invalid")) event.target.classList.remove("invalid");
  });

  $("#drawer").addEventListener("submit", async (event) => {
    event.preventDefault();
    const mode = $("#drawer").dataset.mode;
    try {
      if (mode === "task") await guardarTarea(event);
      if (mode === "foco") await guardarFoco(event);
      if (mode === "people") {
        const errorNombre = nombreValido(event.target.nombre.value);
        if (errorNombre) {
          marcarError(event.target.nombre.closest(".field"), errorNombre);
          event.target.nombre.focus();
          return;
        }
        await agregarPersona(event.target.nombre.value);
        abrirPersonal();
        renderMain();
        toast("Persona agregada");
      }
    } catch (error) {
      toast(error.message, true);
    }
  });

  $("#drawer").addEventListener("click", async (event) => {
    const action = event.target.closest("[data-action]");
    if (!action) return;
    try {
      if (action.dataset.action === "delete-task") {
        if (!confirm("¿Eliminar esta tarea?")) return;
        await api(`/api/tareas/${$("#drawer").dataset.id}`, { method: "DELETE" });
        cerrarDrawer();
        await loadWeek(state.semana.id);
        toast("Tarea eliminada");
      }
      if (action.dataset.action === "delete-foco") {
        if (!confirm("¿Eliminar esta actividad de cabecera?")) return;
        await api(`/api/focos/${$("#drawer").dataset.id}`, { method: "DELETE" });
        cerrarDrawer();
        await loadWeek(state.semana.id);
      }
      if (action.dataset.action === "add-person-task") {
        const input = $("#drawer").querySelector("[name=nueva-persona]");
        const errorNombre = nombreValido(input.value);
        if (errorNombre) {
          marcarError(input.closest(".field"), errorNombre);
          input.focus();
          return;
        }
        const persona = await agregarPersona(input.value);
        const box = $("#drawer").querySelector(".checks");
        if (!box.querySelector(`input[value="${persona.id}"]`)) {
          box.insertAdjacentHTML("beforeend", `<label><input type="checkbox" name="resp" value="${persona.id}" checked> ${esc(persona.nombre)}</label>`);
        } else {
          box.querySelector(`input[value="${persona.id}"]`).checked = true;
        }
        input.value = "";
      }
      if (action.dataset.action === "toggle-person") {
        const data = await api(`/api/personal/${action.dataset.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activo: Number(action.dataset.activo) }),
        });
        const persona = state.personal.find((p) => p.id === data.persona.id);
        if (persona) persona.activo = data.persona.activo;
        abrirPersonal();
      }
    } catch (error) {
      toast(error.message, true);
    }
  });

  $("#drawer-close").addEventListener("click", cerrarDrawer);
  $("#backdrop").addEventListener("click", cerrarDrawer);
  $("#btn-people").addEventListener("click", abrirPersonal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      cerrarDrawer();
      hideSearch();
    }
  });

  const q = $("#q");
  q.addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    const value = q.value.trim();
    if (value.length < 2) { hideSearch(); return; }
    state.searchTimer = setTimeout(() => {
      buscar(value).catch((error) => toast(error.message, true));
    }, 220);
  });
  $("#search-results").addEventListener("mousedown", async (event) => {
    const button = event.target.closest("[data-goto]");
    if (!button) return;
    event.preventDefault();
    try {
      state.filtroEstado = "todas";
      state.filtroPersona = "todas";
      await loadWeek(Number(button.dataset.semana));
      const row = document.querySelector(`[data-task="${button.dataset.goto}"]`);
      if (row) {
        row.scrollIntoView({ block: "center" });
        row.classList.add("flash");
      }
      hideSearch();
    } catch (error) {
      toast(error.message, true);
    }
  });
}

bind();
boot().catch((error) => {
  $("#content").innerHTML = `<div class="empty">${esc(error.message)}</div>`;
});
