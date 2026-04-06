// ============================================================
//  FIELDOC — app.js  v1.1
//  Versión·A
// ============================================================

// Filtro activo en la lista
let _filtroActivo = 'todos';

const APP = {
  inspeccionActual: null,
  respuestas:       [],
  preguntas:        [],
  secciones:        [],
  seccionActual:    0,
  grabando:         null,
  streamActivo:     null,
  grabInterval:     null,
  grabIdPregunta:   null,
  grabIdRespuesta:  null,
};

function uid(p) {
  return p + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2,4).toUpperCase();
}

function fechaHoy() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

// Normaliza cualquier formato de fecha a dd/mm/aaaa hh:mm
function formatearFecha(fecha) {
  if (!fecha) return '—';
  // Si ya está en formato dd/mm/aaaa (lo que genera fechaHoy), dejarlo
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(fecha)) return fecha;
  // Si viene del servidor como string largo, parsearlo
  try {
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return fecha;
    const dd   = String(d.getDate()).padStart(2,'0');
    const mm   = String(d.getMonth()+1).padStart(2,'0');
    const aaaa = d.getFullYear();
    const hh   = String(d.getHours()).padStart(2,'0');
    const min  = String(d.getMinutes()).padStart(2,'0');
    return `${dd}/${mm}/${aaaa} ${hh}:${min}`;
  } catch (e) { return fecha; }
}

// ════════════════════════════════════════════════════════
//  NAVEGACIÓN
// ════════════════════════════════════════════════════════
function irA(id) {
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
  document.getElementById(id).classList.add('activa');
  window.scrollTo(0, 0);
}

// ════════════════════════════════════════════════════════
//  SYNC BADGE
// ════════════════════════════════════════════════════════
function actualizarIndicadorSync({ online, pendientes, sincronizando }) {
  ['sync-status','sync-status-form'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!online) {
      el.className = 'sync-badge offline';
      el.textContent = pendientes > 0 ? `Sin conexión · ${pendientes} pendientes` : 'Sin conexión';
    } else if (sincronizando) {
      el.className = 'sync-badge syncing';
      el.textContent = 'Sincronizando...';
    } else if (pendientes > 0) {
      el.className = 'sync-badge pending';
      el.textContent = `${pendientes} pendientes`;
    } else {
      el.className = 'sync-badge online';
      el.textContent = 'Sincronizado';
    }
  });
}

// ════════════════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════════════════
function toast(msg, tipo = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast visible ' + tipo;
  setTimeout(() => { t.className = 'toast'; }, 3200);
}

// ════════════════════════════════════════════════════════
//  PANTALLA 1 — Lista
// ════════════════════════════════════════════════════════
async function cargarLista() {
  const cont = document.getElementById('lista-contenido');
  cont.innerHTML = '<div class="loader"><div class="spinner"></div> Cargando...</div>';
  try {
    let inspecciones = await DB.getInspecciones();
    const clientes   = await DB.getCatalogo('clientes') || [];
    if (inspecciones.length === 0 && SYNC.estaOnline()) {
      await SYNC.cargarInspecciones();
      inspecciones = await DB.getInspecciones();
    }
    actualizarStats(inspecciones);
    renderLista(inspecciones, clientes);
    if (SYNC.estaOnline()) {
      SYNC.cargarInspecciones().then(() =>
        DB.getInspecciones().then(ins => renderLista(ins, clientes))
      );
    }
  } catch (ex) {
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Error al cargar</div><div class="empty-text">${ex.message}</div></div>`;
  }
}

function actualizarStats(inspecciones) {
  document.getElementById('stat-total').textContent      = inspecciones.length;
  document.getElementById('stat-borrador').textContent   = inspecciones.filter(i => i.estado === 'Borrador').length;
  document.getElementById('stat-completado').textContent = inspecciones.filter(i => i.estado === 'Completado' || i.estado === 'Enviado').length;
  const filtradas = _filtroActivo === 'todos' ? inspecciones : inspecciones.filter(i => {
    if (_filtroActivo === 'Completado') return i.estado === 'Completado' || i.estado === 'Enviado';
    return i.estado === _filtroActivo;
  });
  document.getElementById('insp-count').textContent = filtradas.length + ' registros';
}

function aplicarFiltro(filtro) {
  _filtroActivo = filtro;
  // Actualizar estilos de los filtros
  document.querySelectorAll('.stat-filtro').forEach(el => el.classList.remove('activo-filtro'));
  const idActivo = filtro === 'todos' ? 'filtro-todos' : filtro === 'Borrador' ? 'filtro-borrador' : 'filtro-completado';
  document.getElementById(idActivo)?.classList.add('activo-filtro');
  // Re-renderizar con el filtro aplicado
  const clientes = window._appClientes || [];
  renderLista(window._inspeccionesCache || [], clientes);
}

function renderLista(inspecciones, clientes) {
  // Guardar caché para re-renderizar al cambiar filtro
  window._inspeccionesCache = inspecciones;
  window._appClientes       = clientes;

  const cont = document.getElementById('lista-contenido');

  // Aplicar filtro activo
  const filtradas = _filtroActivo === 'todos' ? inspecciones : inspecciones.filter(i => {
    if (_filtroActivo === 'Completado') return i.estado === 'Completado' || i.estado === 'Enviado';
    return i.estado === _filtroActivo;
  });

  if (filtradas.length === 0) {
    const msg = _filtroActivo === 'todos' ? 'Pulsa el botón + para crear la primera inspección.' : 'No hay inspecciones con este estado.';
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Sin inspecciones</div><div class="empty-text">${msg}</div></div>`;
    document.getElementById('insp-count').textContent = '0 registros';
    return;
  }

  document.getElementById('insp-count').textContent = filtradas.length + ' registros';
  const sorted = [...filtradas].sort((a, b) => (b.fecha||'').localeCompare(a.fecha||''));
  cont.innerHTML = sorted.map((ins, idx) => {
    const cliente   = clientes.find(c => c.id === ins.id_cliente);
    const nombreCli = cliente ? (cliente.nombre_comercial && cliente.nombre_comercial.trim() ? cliente.nombre_comercial : (cliente.nombre || ins.id_cliente)) : ins.id_cliente;
    const badgeClass = {
      'Borrador':           'badge-borrador',
      'Completado':         'badge-completado',
      'Enviado':            'badge-enviado',
      'Generando informe':  'badge-generando',
      'Informe disponible': 'badge-informe',
      'Error en informe':   'badge-error-inf'
    }[ins.estado] || 'badge-borrador';
    const icono = ins.estado === 'Enviado'            ? '✅' :
                  ins.estado === 'Completado'         ? '🔵' :
                  ins.estado === 'Generando informe'  ? '⏳' :
                  ins.estado === 'Informe disponible' ? '📄' :
                  ins.estado === 'Error en informe'   ? '⚠️' : '🟡';
    return `<div class="inspeccion-card" style="animation-delay:${idx*0.05}s">
      <div class="card-icono" style="background:var(--gris-2);cursor:pointer;" onclick="abrirInspeccion('${ins.id}')">${icono}</div>
      <div class="card-info" style="cursor:pointer;" onclick="abrirInspeccion('${ins.id}')">
        <div class="card-cliente">${nombreCli}</div>
        <div class="card-meta"><span>${formatearFecha(ins.fecha)}</span><span>${ins.operario||'—'}</span><span class="badge ${badgeClass}">${ins.estado}</span></div>
      </div>
      <button class="btn-borrar-insp" onclick="confirmarBorrarInspeccion('${ins.id}','${nombreCli}')" title="Eliminar">🗑</button>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════
//  BORRAR INSPECCIÓN
// ════════════════════════════════════════════════════════
function confirmarBorrarInspeccion(id, nombreCliente) {
  // Crear modal de confirmación con checkbox
  let modal = document.getElementById('modal-borrar');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'modal-borrar';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:500;padding:20px;';

  modal.innerHTML = `
    <div style="background:var(--gris-1);border:1px solid var(--peligro);border-radius:20px;padding:28px 24px;width:100%;max-width:400px;">
      <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:18px;color:var(--peligro);margin-bottom:12px;">⚠ Eliminar inspección</div>
      <div style="font-size:14px;color:var(--gris-6);margin-bottom:8px;">Vas a eliminar la inspección de:</div>
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:16px;color:var(--blanco);margin-bottom:16px;">${nombreCliente}</div>
      <div style="font-size:13px;color:var(--gris-5);margin-bottom:20px;line-height:1.5;">Se eliminarán permanentemente todos los datos, audios y fotos asociados. Esta acción no se puede deshacer.</div>
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:24px;padding:12px;background:var(--gris-2);border-radius:10px;">
        <input type="checkbox" id="chk-confirmar-borrar" style="width:18px;height:18px;cursor:pointer;accent-color:var(--peligro);">
        <span style="font-size:13px;color:var(--blanco);">Entiendo que esta acción es irreversible</span>
      </label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <button onclick="document.getElementById('modal-borrar').remove()"
          style="padding:12px;background:transparent;border:1px solid var(--gris-3);border-radius:10px;color:var(--gris-6);font-family:'Syne',sans-serif;font-weight:700;font-size:14px;cursor:pointer;">
          Cancelar
        </button>
        <button id="btn-confirmar-borrar" onclick="ejecutarBorrarInspeccion('${id}')"
          style="padding:12px;background:var(--gris-3);border:none;border-radius:10px;color:var(--gris-5);font-family:'Syne',sans-serif;font-weight:700;font-size:14px;cursor:not-allowed;transition:all 0.2s;"
          disabled>
          Eliminar
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  // Activar botón solo cuando el checkbox esté marcado
  document.getElementById('chk-confirmar-borrar').onchange = function() {
    const btn = document.getElementById('btn-confirmar-borrar');
    if (this.checked) {
      btn.style.background = 'var(--peligro)';
      btn.style.color = 'white';
      btn.style.cursor = 'pointer';
      btn.disabled = false;
    } else {
      btn.style.background = 'var(--gris-3)';
      btn.style.color = 'var(--gris-5)';
      btn.style.cursor = 'not-allowed';
      btn.disabled = true;
    }
  };
}

async function ejecutarBorrarInspeccion(id) {
  document.getElementById('modal-borrar')?.remove();
  toast('Eliminando inspección...', '');
  try {
    // Eliminar localmente
    await DB._eliminarInspeccionLocal(id);
    // Eliminar en servidor si hay conexión
    if (SYNC.estaOnline()) {
      await API.eliminarInspeccion({ id });
    } else {
      await DB.encolar('eliminarInspeccion', { id });
    }
    toast('Inspección eliminada', 'ok');
    cargarLista();
  } catch (ex) {
    toast('Error eliminando: ' + ex.message, 'error');
  }
}

// ════════════════════════════════════════════════════════
//  PANTALLA 2 — Nueva inspección
// ════════════════════════════════════════════════════════
async function iniciarNueva() {
  document.getElementById('input-cliente').value   = '';
  document.getElementById('id-cliente-sel').value  = '';
  document.getElementById('input-operario').value  = '';
  document.getElementById('id-empleado-sel').value = '';
  document.getElementById('sel-plantilla').value   = '';
  document.getElementById('plantilla-info').classList.remove('visible');
  try {
    let clientes   = await DB.getCatalogo('clientes')   || [];
    let plantillas = await DB.getCatalogo('plantillas') || [];
    let empleados  = await DB.getCatalogo('empleados')  || [];
    if (clientes.length === 0 || plantillas.length === 0) {
      await SYNC.cargarCatalogo();
      clientes   = await DB.getCatalogo('clientes')   || [];
      plantillas = await DB.getCatalogo('plantillas') || [];
      empleados  = await DB.getCatalogo('empleados')  || [];
    }
    const sel = document.getElementById('sel-plantilla');
    sel.innerHTML = '<option value="">Seleccionar tipo de inspección...</option>';
    plantillas.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.nombre; opt.dataset.desc = p.descripcion || '';
      sel.appendChild(opt);
    });
    window._appClientes  = clientes;
    window._appEmpleados = empleados;
  } catch (ex) {
    toast('Error cargando datos: ' + ex.message, 'error');
  }
}

function filtrarClientes(query) {
  const dropdown = document.getElementById('cliente-dropdown');
  const clientes = window._appClientes || [];
  const q = query.toLowerCase().trim();
  const filtrados = q === '' ? clientes : clientes.filter(c =>
    (c.nombre_comercial||'').toLowerCase().includes(q) ||
    (c.nombre||'').toLowerCase().includes(q) ||
    (c.municipio||'').toLowerCase().includes(q)
  );
  dropdown.innerHTML = filtrados.length === 0
    ? `<div class="cliente-opcion"><div class="cliente-opcion-nombre" style="color:var(--gris-5)">Sin resultados</div></div>`
    : filtrados.slice(0,8).map(c => `
        <div class="cliente-opcion" onclick="seleccionarCliente('${c.id}')">
          <div class="cliente-opcion-nombre">${c.nombre_comercial || c.nombre || c.id}</div>
          <div class="cliente-opcion-detalle">${c.municipio||''} ${c.cp||''}</div>
        </div>`).join('');
  dropdown.classList.add('visible');
}

function seleccionarCliente(id) {
  const c = (window._appClientes||[]).find(c => c.id === id);
  if (!c) return;
  document.getElementById('input-cliente').value  = c.nombre_comercial || c.nombre || id;
  document.getElementById('id-cliente-sel').value = id;
  document.getElementById('cliente-dropdown').classList.remove('visible');
}

function filtrarEmpleados(query) {
  const dropdown = document.getElementById('empleado-dropdown');
  const empleados = window._appEmpleados || [];
  const q = query.toLowerCase().trim();
  const filtrados = q === '' ? empleados : empleados.filter(e =>
    (e.nombre||'').toLowerCase().includes(q) || (e.categoria||'').toLowerCase().includes(q)
  );
  dropdown.innerHTML = filtrados.length === 0
    ? `<div class="cliente-opcion"><div class="cliente-opcion-nombre" style="color:var(--gris-5)">Sin resultados</div></div>`
    : filtrados.map(e => `
        <div class="cliente-opcion" onclick="seleccionarEmpleado('${e.id}')">
          <div class="cliente-opcion-nombre">${e.nombre}</div>
          <div class="cliente-opcion-detalle">${e.categoria||''}</div>
        </div>`).join('');
  dropdown.classList.add('visible');
}

function seleccionarEmpleado(id) {
  const e = (window._appEmpleados||[]).find(e => e.id === id);
  if (!e) return;
  document.getElementById('input-operario').value  = e.nombre;
  document.getElementById('id-empleado-sel').value = e.id;
  document.getElementById('empleado-dropdown').classList.remove('visible');
}

function onPlantillaChange() {
  const sel  = document.getElementById('sel-plantilla');
  const opt  = sel.options[sel.selectedIndex];
  const info = document.getElementById('plantilla-info');
  if (sel.value) {
    document.getElementById('plantilla-nombre').textContent = opt.textContent;
    document.getElementById('plantilla-desc').textContent   = opt.dataset.desc || '';
    info.classList.add('visible');
  } else {
    info.classList.remove('visible');
  }
}

async function crearInspeccion() {
  const idCliente   = document.getElementById('id-cliente-sel').value.trim();
  const idPlantilla = document.getElementById('sel-plantilla').value;
  const operario    = document.getElementById('input-operario').value.trim();
  const idEmpleado  = document.getElementById('id-empleado-sel').value.trim();

  if (!idCliente)               { toast('Selecciona un cliente', 'error'); return; }
  if (!idPlantilla)             { toast('Selecciona un tipo de inspección', 'error'); return; }
  if (!operario || !idEmpleado) { toast('Selecciona un operario de la lista', 'error'); return; }

  const btn = document.getElementById('btn-crear');
  btn.textContent = 'Creando...';
  btn.disabled = true;
  try {
    let preguntas = await DB.getCatalogo('preguntas_' + idPlantilla);
    if (!preguntas && SYNC.estaOnline()) {
      preguntas = await API.getPreguntas(idPlantilla);
      await DB.guardarCatalogo('preguntas_' + idPlantilla, preguntas);
    }
    if (!preguntas || preguntas.length === 0) throw new Error('No se pudieron cargar las preguntas. Comprueba la conexión.');
    const idInspeccion = uid('INS');
    await SYNC.crearInspeccion({ id: idInspeccion, id_cliente: idCliente, id_plantilla: idPlantilla, id_empleado: idEmpleado, operario, fecha: fechaHoy(), preguntas });
    toast('Inspección creada', 'ok');
    setTimeout(() => { irA('p-lista'); cargarLista(); }, 600);
  } catch (ex) {
    toast('Error: ' + ex.message, 'error');
  } finally {
    btn.textContent = 'Crear inspección';
    btn.disabled = false;
  }
}

// ════════════════════════════════════════════════════════
//  PANTALLA 3 — Formulario
// ════════════════════════════════════════════════════════
async function abrirInspeccion(id) {
  irA('p-formulario');
  try {
    const ins = await DB.getInspeccion(id);
    if (!ins) throw new Error('Inspección no encontrada');
    APP.inspeccionActual = ins;

    // ── FIX: mostrar nombre del cliente, no el ID ──
    const clientes  = await DB.getCatalogo('clientes') || [];
    const cliente   = clientes.find(c => c.id === ins.id_cliente);
    const nombreCli = cliente ? (cliente.nombre_comercial && cliente.nombre_comercial.trim() ? cliente.nombre_comercial : (cliente.nombre || ins.id_cliente)) : ins.id_cliente;

    document.getElementById('form-cliente').textContent  = nombreCli;
    document.getElementById('form-cliente').dataset.idCliente = ins.id_cliente;
    document.getElementById('form-fecha').textContent    = formatearFecha(ins.fecha);
    document.getElementById('form-operario').textContent = ins.operario || '—';
    document.getElementById('form-operario').dataset.idEmpleado = ins.id_empleado || '';

    // Cargar respuestas locales
    APP.respuestas = await DB.getRespuestasByInspeccion(id);

    // Si no hay respuestas locales y hay conexión, descargar del servidor
    if (APP.respuestas.length === 0 && SYNC.estaOnline()) {
      try {
        console.log('[APP] Descargando respuestas del servidor para:', id);
        const respServidor = await API.getRespuestas(id);
        if (respServidor && respServidor.length > 0) {
          for (const r of respServidor) {
            await DB.guardarRespuesta({ ...r, _pendiente: false });
          }
          APP.respuestas = await DB.getRespuestasByInspeccion(id);
          console.log('[APP] Respuestas descargadas:', APP.respuestas.length);
        }
      } catch (ex) {
        console.warn('[APP] Error descargando respuestas:', ex.message);
      }
    } else if (APP.respuestas.length > 0 && SYNC.estaOnline()) {
      // Hay respuestas locales — verificar si el servidor tiene datos más recientes
      try {
        const respServidor = await API.getRespuestas(id);
        if (respServidor && respServidor.length > 0) {
          // Actualizar localmente solo las que tienen respuesta en servidor y no tienen pendientes locales
          for (const rs of respServidor) {
            const local = APP.respuestas.find(r => r.id === rs.id);
            const tienePendiente = await DB._tienePendientes(id);
            if (local && !tienePendiente && rs.respuesta && !local.respuesta) {
              local.respuesta     = rs.respuesta;
              local.observaciones = rs.observaciones;
              await DB.guardarRespuesta({ ...local });
            }
          }
          APP.respuestas = await DB.getRespuestasByInspeccion(id);
        }
      } catch (ex) {
        console.warn('[APP] Error sincronizando respuestas:', ex.message);
      }
    }
    APP.preguntas  = await DB.getCatalogo('preguntas_' + ins.id_plantilla) || [];
    if (APP.preguntas.length === 0 && SYNC.estaOnline()) {
      APP.preguntas = await API.getPreguntas(ins.id_plantilla);
      await DB.guardarCatalogo('preguntas_' + ins.id_plantilla, APP.preguntas);
    }

    // Sincronizar archivos del servidor si hay conexión
    if (SYNC.estaOnline()) {
      try {
        const archivosServidor = await API.getArchivos(id);
        if (archivosServidor && archivosServidor.length > 0) {
          const archivosLocales = await DB.getArchivosByInspeccion(id);
          const idsLocales      = new Set(archivosLocales.map(a => a.id));
          for (const a of archivosServidor) {
            if (!idsLocales.has(a.id)) {
              // Guardar metadatos en local — el blob no se descarga (solo la URL)
              await DB.guardarArchivoMeta({ ...a, subido: true });
            }
          }
          console.log('[APP] Archivos sincronizados:', archivosServidor.length);
        }
      } catch (ex) {
        console.warn('[APP] Error sincronizando archivos:', ex.message);
      }
    }
    APP.secciones     = agruparPorSeccion(APP.preguntas);
    APP.seccionActual = 0;
    await renderSeccion();
    actualizarBotonesResumen();
  } catch (ex) {
    toast('Error: ' + ex.message, 'error');
    irA('p-lista');
  }
}

function agruparPorSeccion(preguntas) {
  const mapa = new Map();
  preguntas.forEach(p => {
    if (!mapa.has(p.seccion_num)) mapa.set(p.seccion_num, { num: p.seccion_num, nombre: p.seccion_nombre, preguntas: [] });
    mapa.get(p.seccion_num).preguntas.push(p);
  });
  return Array.from(mapa.values()).sort((a, b) => a.num - b.num);
}

async function renderSeccion() {
  const seccion = APP.secciones[APP.seccionActual];
  if (!seccion) return;
  const total  = APP.secciones.length;
  const actual = APP.seccionActual + 1;

  // Progreso
  document.getElementById('prog-texto').textContent  = `Sección ${actual} de ${total}`;
  document.getElementById('prog-nombre').textContent = seccion.nombre;
  document.getElementById('prog-barra').style.width  = Math.round((actual/total)*100) + '%';

  // Botones de navegación — cabecera y pie
  const esPrimera = APP.seccionActual === 0;
  const esUltima  = APP.seccionActual === total - 1;
  ['btn-first','btn-first-pie'].forEach(id => { const el = document.getElementById(id); if(el) el.disabled = esPrimera; });
  ['btn-prev', 'btn-prev-pie' ].forEach(id => { const el = document.getElementById(id); if(el) el.disabled = esPrimera; });
  ['btn-next', 'btn-next-pie' ].forEach(id => { const el = document.getElementById(id); if(el) el.disabled = esUltima;  });
  ['btn-last', 'btn-last-pie' ].forEach(id => { const el = document.getElementById(id); if(el) el.disabled = esUltima;  });
  // Ver resumen solo en barra superior
  const btnRes = document.getElementById('btn-resumen'); if(btnRes) btnRes.disabled = false;

  // Actualizar explorador lateral
  await actualizarExplorador();

  // Renderizar preguntas
  const cont = document.getElementById('preguntas-cont');
  cont.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
  const htmlPreguntas = [];
  for (const p of seccion.preguntas) {
    const resp     = APP.respuestas.find(r => r.id_pregunta === p.id);
    const archivos = resp ? await DB.getArchivosByRespuesta(resp.id) : [];
    htmlPreguntas.push(renderPregunta(p, resp, archivos));
  }
  cont.innerHTML = htmlPreguntas.join('');
  window.scrollTo(0, 0);
}

async function actualizarExplorador() {
  const cont = document.getElementById('explorador-secciones');
  if (!cont) return;

  const idInsp   = APP.inspeccionActual?.id;
  const archivos = idInsp ? await DB.getArchivosByInspeccion(idInsp) : [];

  cont.innerHTML = APP.secciones.map((sec, idx) => {
    const pregsSec  = sec.preguntas;
    const totalSec  = pregsSec.length;
    let respondidas = 0;

    for (const p of pregsSec) {
      const resp = APP.respuestas.find(r => r.id_pregunta === p.id);
      if (resp && resp.respuesta) respondidas++;
    }

    const color  = respondidas === 0        ? 'rojo'
                 : respondidas === totalSec  ? 'verde'
                 : 'naranja';
    const activo = idx === APP.seccionActual ? 'activo' : '';

    return `<div class="exp-item ${color} ${activo}" onclick="irASeccion(${idx})">
      <span class="exp-num">${sec.num}</span>
      <span class="exp-nombre">${sec.nombre}</span>
    </div>`;
  }).join('');
}

function renderPregunta(pregunta, resp, archivos) {
  const respVal = resp?.respuesta || '';
  const obsVal  = resp?.observaciones || '';
  const respId  = resp?.id || '';
  const audios  = archivos.filter(a => a.tipo === 'Audio');
  const fotos   = archivos.filter(a => a.tipo === 'Foto');

  return `
  <div class="pregunta-card" id="preg-${pregunta.id}">
    <div class="pregunta-header">
      <span class="pregunta-num">P${String(pregunta.orden_global).padStart(2,'0')}</span>
      <span class="pregunta-texto">${pregunta.texto}</span>
    </div>
    <div class="respuesta-btns">
      <button class="btn-resp ${respVal === 'Sí' ? 'activo-si' : ''}"
              onclick="guardarRespuesta('${respId}','${pregunta.id}','Sí')">Sí</button>
      <button class="btn-resp ${respVal === 'No' ? 'activo-no' : ''}"
              onclick="guardarRespuesta('${respId}','${pregunta.id}','No')">No</button>
    </div>
    <textarea class="obs-input" placeholder="Observaciones (opcional)..."
      onblur="guardarObservacion('${respId}','${pregunta.id}',this.value)">${obsVal}</textarea>
    <div class="archivos-cont" id="archivos-${pregunta.id}">
      ${renderArchivos(audios, fotos, pregunta.id, respId)}
    </div>
    <div class="archivo-btns">
      ${audios.length < 3
        ? `<button class="btn-archivo" onclick="iniciarGrabacion('${pregunta.id}','${respId}')">🎤 Grabar audio${audios.length > 0 ? ' ('+audios.length+'/3)' : ''}</button>`
        : `<button class="btn-archivo" disabled style="opacity:0.4">🎤 Máx. 3 audios</button>`}
      <button class="btn-archivo" onclick="abrirCamara('${pregunta.id}','${respId}')">📷 Foto${fotos.length > 0 ? ' ('+fotos.length+')' : ''}</button>
    </div>
  </div>`;
}

function renderArchivos(audios, fotos, idPregunta, idRespuesta) {
  if (audios.length === 0 && fotos.length === 0) return '';

  // ── FIX: botón de reproducción para audios y fotos ──
  const htmlAudios = audios.map(a => `
    <div class="archivo-item" id="arc-${a.id}">
      <span class="archivo-icono">🎤</span>
      <span class="archivo-nombre">Audio ${a.num_orden}</span>
      <button class="archivo-play" onclick="reproducirAudio('${a.id}')" title="Reproducir">▶</button>
      <span class="archivo-sync ${a.subido ? 'subido' : 'pendiente'}">${a.subido ? '✓' : '⏳'}</span>
      <button class="archivo-del" onclick="eliminarArchivo('${a.id}','${idPregunta}','${idRespuesta}')">✕</button>
    </div>`).join('');

  const htmlFotos = fotos.map(f => `
    <div class="archivo-item" id="arc-${f.id}">
      <span class="archivo-icono">📷</span>
      <span class="archivo-nombre">Foto ${f.num_orden}</span>
      <button class="archivo-play" onclick="verFoto('${f.id}')" title="Ver foto">👁</button>
      <span class="archivo-sync ${f.subido ? 'subido' : 'pendiente'}">${f.subido ? '✓' : '⏳'}</span>
      <button class="archivo-del" onclick="eliminarArchivo('${f.id}','${idPregunta}','${idRespuesta}')">✕</button>
    </div>`).join('');

  return htmlAudios + htmlFotos;
}

// ── Reproducir audio — local primero, Drive como fallback ──
async function reproducirAudio(id) {
  try {
    const blob = await DB.getBlob(id);
    if (blob) {
      const url   = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play();
      toast('Reproduciendo audio...', '');
    } else {
      // Sin blob local — usar URL de Drive
      const archivos = await DB.getArchivosByInspeccion(APP.inspeccionActual?.id || '');
      const meta     = archivos.find(a => a.id === id);
      if (meta?.url) {
        window.open(meta.url, '_blank');
        toast('Abriendo audio en Drive...', '');
      } else {
        toast('Audio no disponible', 'error');
      }
    }
  } catch (ex) {
    toast('Error reproduciendo: ' + ex.message, 'error');
  }
}

// ── Ver foto — local primero, Drive como fallback ────────
async function verFoto(id) {
  try {
    const blob = await DB.getBlob(id);
    if (blob) {
      const url = URL.createObjectURL(blob);
      let lb = document.getElementById('lightbox');
      if (lb) lb.remove();
      lb = document.createElement('div');
      lb.id = 'lightbox';
      lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;z-index:600;cursor:pointer;';
      lb.onclick = () => { URL.revokeObjectURL(url); lb.remove(); };
      lb.innerHTML = `<img src="${url}" style="max-width:95vw;max-height:90vh;border-radius:12px;object-fit:contain;">`;
      document.body.appendChild(lb);
    } else {
      // Sin blob local — usar URL de Drive
      const archivos = await DB.getArchivosByInspeccion(APP.inspeccionActual?.id || '');
      const meta     = archivos.find(a => a.id === id);
      if (meta?.url) {
        window.open(meta.url, '_blank');
        toast('Abriendo foto en Drive...', '');
      } else {
        toast('Foto no disponible', 'error');
      }
    }
  } catch (ex) {
    toast('Error mostrando foto: ' + ex.message, 'error');
  }
}

// ── Navegación secciones ─────────────────────────────────
function irASeccion(idx) {
  if (idx >= 0 && idx < APP.secciones.length) {
    APP.seccionActual = idx;
    renderSeccion();
  }
}
function irPrimeraSeccion() { irASeccion(0); }
function irUltimaSeccion()  { irASeccion(APP.secciones.length - 1); }
function seccionAnterior()  { if (APP.seccionActual > 0) { APP.seccionActual--; renderSeccion(); } }
async function seccionSiguiente() {
  if (APP.seccionActual < APP.secciones.length - 1) {
    APP.seccionActual++;
    renderSeccion();
  }
}
async function finalizarInspeccion() {
  await abrirResumen(APP.inspeccionActual.id);
}

// ── Guardar respuesta ────────────────────────────────────
async function guardarRespuesta(idRespuesta, idPregunta, valor) {
  if (!idRespuesta) return;

  // ── FIX: actualizar UI inmediatamente con clase correcta ──
  const card = document.getElementById('preg-' + idPregunta);
  if (card) {
    const btns = card.querySelectorAll('.btn-resp');
    btns[0].classList.toggle('activo-si', valor === 'Sí');
    btns[0].classList.toggle('activo-no', false);
    btns[1].classList.toggle('activo-no', valor === 'No');
    btns[1].classList.toggle('activo-si', false);
  }

  const resp = APP.respuestas.find(r => r.id === idRespuesta);
  if (resp) resp.respuesta = valor;
  try {
    await SYNC.guardarRespuesta(idRespuesta, 'respuesta', valor);
    // Actualizar explorador para reflejar nuevo estado de la sección
    await actualizarExplorador();
  } catch (ex) { toast('Error guardando: ' + ex.message, 'error'); }
}

async function guardarObservacion(idRespuesta, idPregunta, valor) {
  if (!idRespuesta) return;
  const resp = APP.respuestas.find(r => r.id === idRespuesta);
  if (resp) resp.observaciones = valor;
  try {
    await SYNC.guardarRespuesta(idRespuesta, 'observaciones', valor);
  } catch (ex) { toast('Error guardando observación: ' + ex.message, 'error'); }
}

// ── Editar cliente u operario de la inspección ───────────
async function editarCabecera(campo) {
  const ins = APP.inspeccionActual;
  if (!ins) return;

  if (campo === 'cliente') {
    window._appClientes = await DB.getCatalogo('clientes') || [];
    mostrarModalEdicion('cliente', 'Cambiar cliente', async (id) => {
      const c = (window._appClientes||[]).find(c => c.id === id);
      if (!c) return;
      ins.id_cliente = id;
      await DB.guardarInspeccion(ins);
      // Encolar sync al servidor
      await DB.encolar('actualizarCabecera', { id: ins.id, id_cliente: id });
      if (SYNC.estaOnline()) SYNC.sincronizar();
      document.getElementById('form-cliente').textContent = c.nombre_comercial || c.nombre || id;
      toast('Cliente actualizado', 'ok');
    });
  } else {
    window._appEmpleados = await DB.getCatalogo('empleados') || [];
    mostrarModalEdicion('operario', 'Cambiar operario', async (id) => {
      const e = (window._appEmpleados||[]).find(e => e.id === id);
      if (!e) return;
      ins.id_empleado = id;
      ins.operario    = e.nombre;
      await DB.guardarInspeccion(ins);
      // Encolar sync al servidor
      await DB.encolar('actualizarCabecera', { id: ins.id, operario: e.nombre, id_empleado: id });
      if (SYNC.estaOnline()) SYNC.sincronizar();
      document.getElementById('form-operario').textContent = e.nombre;
      toast('Operario actualizado', 'ok');
    });
  }
}

// Callback guardado para el modal de edición
window._modalEditCallback = null;

function mostrarModalEdicion(tipo, titulo, onSelect) {
  let modal = document.getElementById('modal-edicion');
  if (modal) modal.remove();

  // Guardar callback en variable global para evitar serialización con toString()
  window._modalEditCallback = onSelect;

  const items = tipo === 'cliente'
    ? (window._appClientes||[]).map(c => ({ id: c.id, nombre: c.nombre_comercial || c.nombre || c.id, sub: (c.municipio||'') + (c.cp ? ' '+c.cp : '') }))
    : (window._appEmpleados||[]).map(e => ({ id: e.id, nombre: e.nombre, sub: e.categoria || '' }));

  modal = document.createElement('div');
  modal.id = 'modal-edicion';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:flex-end;justify-content:center;z-index:500;';

  modal.innerHTML = `
    <div style="background:var(--gris-1);border-radius:20px 20px 0 0;width:100%;max-width:680px;max-height:70vh;overflow:hidden;display:flex;flex-direction:column;">
      <div style="padding:16px 20px;border-bottom:1px solid var(--gris-3);display:flex;justify-content:space-between;align-items:center;">
        <span style="font-family:'Syne',sans-serif;font-weight:700;font-size:16px;">${titulo}</span>
        <button onclick="document.getElementById('modal-edicion').remove()" style="background:none;border:none;color:var(--gris-5);font-size:20px;cursor:pointer;">✕</button>
      </div>
      <div style="overflow-y:auto;flex:1;">
        ${items.map(item => `
          <div onclick="seleccionarDesdeModal('${item.id}')"
               style="padding:14px 20px;border-bottom:1px solid var(--gris-3);cursor:pointer;transition:background 0.15s;"
               onmouseover="this.style.background='var(--gris-2)'" onmouseout="this.style.background=''">
            <div style="font-weight:500;font-size:14px;color:var(--blanco);margin-bottom:2px;">${item.nombre}</div>
            <div style="font-family:'DM Mono',monospace;font-size:11px;color:var(--gris-5);">${item.sub}</div>
          </div>`).join('')}
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function seleccionarDesdeModal(id) {
  document.getElementById('modal-edicion')?.remove();
  if (window._modalEditCallback) {
    window._modalEditCallback(id);
    window._modalEditCallback = null;
  }
}

// ── Grabación de audio ───────────────────────────────────
async function iniciarGrabacion(idPregunta, idRespuesta) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    APP.streamActivo   = stream;
    APP.grabIdPregunta  = idPregunta;
    APP.grabIdRespuesta = idRespuesta;

    const chunks = [];
    const rec    = new MediaRecorder(stream);
    APP.grabando = rec;
    rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      clearInterval(APP.grabInterval);
      APP.streamActivo = null;
      APP.grabando     = null;
      APP.grabInterval = null;
      document.getElementById('modal-grabacion').style.display = 'none';

      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      const id   = uid('AUD');
      const archivos = await DB.getArchivosByRespuesta(idRespuesta);
      const audios   = archivos.filter(a => a.tipo === 'Audio');
      const meta = { id, id_respuesta: idRespuesta, id_inspeccion: APP.inspeccionActual.id, tipo: 'Audio', num_orden: audios.length + 1, subido: false, url: null, timestamp: new Date().toISOString() };
      await SYNC.guardarArchivo(meta, blob);
      toast('Audio guardado', 'ok');
      await refrescarArchivos(idPregunta, idRespuesta);
    };

    let seg = 0;
    document.getElementById('grab-timer').textContent = '00:00';
    document.getElementById('modal-grabacion').style.display = 'flex';
    document.getElementById('btn-stop-grab').onclick = () => {
      if (APP.grabando && APP.grabando.state === 'recording') APP.grabando.stop();
    };

    APP.grabInterval = setInterval(() => {
      seg++;
      const m = String(Math.floor(seg/60)).padStart(2,'0');
      const s = String(seg%60).padStart(2,'0');
      document.getElementById('grab-timer').textContent = `${m}:${s}`;
      if (seg >= 180) { if (APP.grabando && APP.grabando.state === 'recording') APP.grabando.stop(); }
    }, 1000);

    rec.start();
  } catch (ex) {
    toast('No se puede acceder al micrófono: ' + ex.message, 'error');
  }
}

// ── Cámara / fotos ───────────────────────────────────────
function abrirCamara(idPregunta, idRespuesta) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const id = uid('FOT');
    const archivos = await DB.getArchivosByRespuesta(idRespuesta);
    const fotos    = archivos.filter(a => a.tipo === 'Foto');
    const meta = { id, id_respuesta: idRespuesta, id_inspeccion: APP.inspeccionActual.id, tipo: 'Foto', num_orden: fotos.length + 1, subido: false, url: null, timestamp: new Date().toISOString() };
    await SYNC.guardarArchivo(meta, file);
    toast('Foto guardada', 'ok');
    await refrescarArchivos(idPregunta, idRespuesta);
  };
  input.click();
}

// ── Refrescar lista de archivos en UI ────────────────────
async function refrescarArchivos(idPregunta, idRespuesta) {
  const cont = document.getElementById('archivos-' + idPregunta);
  if (!cont) return;
  const archivos = await DB.getArchivosByRespuesta(idRespuesta);
  const audios   = archivos.filter(a => a.tipo === 'Audio');
  const fotos    = archivos.filter(a => a.tipo === 'Foto');
  cont.innerHTML = renderArchivos(audios, fotos, idPregunta, idRespuesta);

  // Actualizar botón grabar
  const card = document.getElementById('preg-' + idPregunta);
  if (card) {
    const btnGrabar = card.querySelector('.archivo-btns button:first-child');
    if (btnGrabar) {
      if (audios.length >= 3) {
        btnGrabar.textContent = '🎤 Máx. 3 audios';
        btnGrabar.disabled = true;
        btnGrabar.style.opacity = '0.4';
      } else {
        btnGrabar.textContent = `🎤 Grabar audio${audios.length > 0 ? ' ('+audios.length+'/3)' : ''}`;
        btnGrabar.disabled = false;
        btnGrabar.style.opacity = '1';
      }
    }
  }
}

// ── Eliminar archivo ─────────────────────────────────────
async function eliminarArchivo(id, idPregunta, idRespuesta) {
  try {
    await SYNC.eliminarArchivo(id, null);
    await refrescarArchivos(idPregunta, idRespuesta);
    toast('Archivo eliminado', '');
  } catch (ex) { toast('Error: ' + ex.message, 'error'); }
}

// ════════════════════════════════════════════════════════
//  PANTALLA 4 — Resumen e informe
// ════════════════════════════════════════════════════════
async function abrirResumen(idInspeccion) {
  irA('p-resumen');

  try {
    const ins = await DB.getInspeccion(idInspeccion);
    if (!ins) throw new Error('Inspección no encontrada');
    APP.inspeccionActual = ins;

    // Cabecera
    const clientes  = await DB.getCatalogo('clientes') || [];
    const cliente   = clientes.find(c => c.id === ins.id_cliente);
    const nombreCli = cliente ? (cliente.nombre_comercial || cliente.nombre) : ins.id_cliente;
    document.getElementById('res-cliente').textContent  = nombreCli;
    document.getElementById('res-fecha').textContent    = formatearFecha(ins.fecha);
    document.getElementById('res-operario').textContent = ins.operario || '—';

    // Cargar datos
    const respuestas = await DB.getRespuestasByInspeccion(idInspeccion);
    const preguntas  = await DB.getCatalogo('preguntas_' + ins.id_plantilla) || [];
    const secciones  = agruparPorSeccion(preguntas);

    // Stats globales
    const total       = preguntas.length;
    let respondidas   = 0;
    let conAudio      = 0;
    let sinRespuesta  = 0;

    // Calcular stats con archivos
    const archivosInsp = await DB.getArchivosByInspeccion(idInspeccion);

    for (const p of preguntas) {
      const resp = respuestas.find(r => r.id_pregunta === p.id);
      if (resp && resp.respuesta) {
        respondidas++;
        const audios = archivosInsp.filter(a => a.id_respuesta === resp.id && a.tipo === 'Audio');
        if (audios.length > 0) conAudio++;
      } else {
        sinRespuesta++;
      }
    }

    document.getElementById('rg-total').textContent       = total;
    document.getElementById('rg-respondidas').textContent = respondidas;
    document.getElementById('rg-audios').textContent      = conAudio;
    document.getElementById('rg-pendientes').textContent  = sinRespuesta;

    // Renderizar secciones
    const cont = document.getElementById('resumen-secciones');
    cont.innerHTML = secciones.map((sec, secIdx) => {
      const pregsSec = sec.preguntas;
      let siCount = 0, noCount = 0, audioCount = 0, fotoCount = 0, ndCount = 0;

      const htmlPregs = pregsSec.map(p => {
        const resp    = respuestas.find(r => r.id_pregunta === p.id);
        const audios  = archivosInsp.filter(a => a.id_respuesta === (resp?.id||'') && a.tipo === 'Audio');
        const fotos   = archivosInsp.filter(a => a.id_respuesta === (resp?.id||'') && a.tipo === 'Foto');
        const respVal = resp?.respuesta || '';

        if (respVal === 'Sí') siCount++;
        else if (respVal === 'No') noCount++;
        else ndCount++;
        if (audios.length > 0) audioCount++;
        if (fotos.length > 0) fotoCount++;

        const claseResp = respVal === 'Sí' ? 'rp-si' : respVal === 'No' ? 'rp-no' : 'rp-nd';
        const textoResp = respVal || 'Sin respuesta';

        return `<div class="resumen-pregunta" onclick="irAPregunta('${p.seccion_num}','${p.id}')">
          <span class="rp-num">P${String(p.orden_global).padStart(2,'0')}</span>
          <span class="rp-texto">${p.texto}</span>
          <div class="rp-icons">
            ${audios.length > 0 ? `<span title="${audios.length} audio(s)">🎤</span>` : ''}
            ${fotos.length > 0  ? `<span title="${fotos.length} foto(s)">📷</span>` : ''}
          </div>
          <span class="rp-resp ${claseResp}">${textoResp}</span>
        </div>`;
      }).join('');

      const pills = [
        siCount  > 0 ? `<span class="pill pill-ok">✓ ${siCount} Sí</span>`       : '',
        noCount  > 0 ? `<span class="pill pill-no">✗ ${noCount} No</span>`        : '',
        audioCount>0 ? `<span class="pill pill-audio">🎤 ${audioCount}</span>`    : '',
        fotoCount > 0? `<span class="pill pill-foto">📷 ${fotoCount}</span>`      : '',
        ndCount  > 0 ? `<span class="pill pill-vacio">? ${ndCount} sin resp.</span>`: '',
      ].filter(Boolean).join('');

      return `<div class="resumen-seccion">
        <div class="resumen-sec-header" onclick="toggleSeccionResumen(${secIdx})">
          <span class="resumen-sec-nombre">${sec.num}. ${sec.nombre}</span>
          <div class="resumen-sec-pills">${pills}</div>
          <span style="color:var(--gris-5);font-size:14px" id="chevron-${secIdx}">›</span>
        </div>
        <div class="resumen-detalle" id="detalle-${secIdx}">
          ${htmlPregs}
        </div>
      </div>`;
    }).join('');

    actualizarBotonesResumen();

  } catch (ex) {
    toast('Error cargando resumen: ' + ex.message, 'error');
    irA('p-lista');
  }
}

function toggleSeccionResumen(idx) {
  const det = document.getElementById('detalle-' + idx);
  const chv = document.getElementById('chevron-' + idx);
  if (!det) return;
  const abierto = det.classList.toggle('abierto');
  if (chv) chv.textContent = abierto ? '⌄' : '›';
}

function irAPregunta(seccionNum, idPregunta) {
  // Volver al formulario en la sección correcta
  const secIdx = APP.secciones.findIndex(s => String(s.num) === String(seccionNum));
  if (secIdx !== -1) APP.seccionActual = secIdx;
  irA('p-formulario');
  renderSeccion().then(() => {
    // Scroll a la pregunta
    setTimeout(() => {
      const el = document.getElementById('preg-' + idPregunta);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  });
}

// ════════════════════════════════════════════════════════
//  INFORME IA — Solicitar generación
// ════════════════════════════════════════════════════════
async function generarInforme() {
  const ins = APP.inspeccionActual;
  if (!ins) return;

  // Guardia: no solicitar si ya está en proceso o disponible
  if (ins.estado === 'Generando informe') {
    toast('El informe ya está en proceso. Espera a que finalice.', '');
    return;
  }
  if (ins.estado === 'Informe disponible') {
    verInforme();
    return;
  }
  if (!SYNC.estaOnline()) {
    toast('Necesitas conexión para generar el informe.', 'error');
    return;
  }

  // Confirmar con el usuario
  const confirmado = confirm(
    '¿Generar el Informe Técnico de Inspección con IA?\n\n' +
    'El proceso puede tardar varios minutos. Puedes cerrar la app — ' +
    'recibirás aviso cuando el informe esté disponible.'
  );
  if (!confirmado) return;

  const btn = document.getElementById('btn-generar-informe');
  if (btn) { btn.disabled = true; btn.textContent = 'Solicitando...'; }

  try {
    await API.solicitarInforme(ins.id);

    // Actualizar estado local inmediatamente
    ins.estado = 'Generando informe';
    await DB.actualizarEstadoLocal(ins.id, 'Generando informe');

    actualizarBotonesResumen();
    toast('Informe en proceso. Te avisaremos cuando esté listo.', 'ok');

    // Iniciar polling para detectar cuando termina
    _iniciarPollingInforme(ins.id);

  } catch (ex) {
    toast('Error al solicitar informe: ' + ex.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; }
    actualizarBotonesResumen();
  }
}

// ── Abrir el informe generado en nueva pestaña ────────────
async function verInforme() {
  const ins = APP.inspeccionActual;
  if (!ins) return;

  try {
    const resultado = await API.getEstadoInforme(ins.id);
    if (resultado.estado === 'generado' && resultado.url) {
      // Servir el HTML directamente desde Apps Script — se renderiza en el navegador
      const urlInforme = API_URL + '?action=getinforme&id_inspeccion=' + ins.id;
      window.open(urlInforme, '_blank');
    } else if (resultado.estado === 'error') {
      toast('Error en el informe: ' + (resultado.error || 'desconocido'), 'error');
    } else {
      toast('El informe aún no está disponible.', '');
    }
  } catch (ex) {
    toast('Error al obtener el informe: ' + ex.message, 'error');
  }
}

// ── Polling — comprueba el estado del informe cada 30s ────
var _pollingInformeTimer = null;

function _iniciarPollingInforme(idInspeccion) {
  _detenerPollingInforme(); // limpiar si había uno previo

  _pollingInformeTimer = setInterval(async () => {
    if (!SYNC.estaOnline()) return;
    try {
      const resultado = await API.getEstadoInforme(idInspeccion);

      if (resultado.estado === 'generado') {
        _detenerPollingInforme();

        // Actualizar estado local
        if (APP.inspeccionActual?.id === idInspeccion) {
          APP.inspeccionActual.estado = 'Informe disponible';
          await DB.actualizarEstadoLocal(idInspeccion, 'Informe disponible');
          actualizarBotonesResumen();
        }

        // Actualizar la lista en segundo plano
        cargarLista();
        toast('✅ Informe disponible. Pulsa "Ver informe" para abrirlo.', 'ok');

      } else if (resultado.estado === 'error') {
        _detenerPollingInforme();
        if (APP.inspeccionActual?.id === idInspeccion) {
          APP.inspeccionActual.estado = 'Completado';
          await DB.actualizarEstadoLocal(idInspeccion, 'Completado');
          actualizarBotonesResumen();
        }
        toast('Error generando informe: ' + (resultado.error || 'desconocido'), 'error');
      }
      // Si está 'pendiente' seguimos esperando
    } catch (e) {
      // Fallo de red puntual — seguimos intentando
      console.warn('[POLLING] Error consultando estado informe:', e.message);
    }
  }, 30000); // cada 30 segundos
}

function _detenerPollingInforme() {
  if (_pollingInformeTimer) {
    clearInterval(_pollingInformeTimer);
    _pollingInformeTimer = null;
  }
}

// ── Botón de estado único — alterna entre Completado y Borrador ──
function actualizarBotonesResumen() {
  const estado = APP.inspeccionActual?.estado || 'Borrador';
  const btn    = document.getElementById('btn-estado-insp');
  const btnInf = document.getElementById('btn-generar-informe');

  // ── Botón de estado ──────────────────────────────────
  if (btn) {
    if (estado === 'Completado' || estado === 'Enviado') {
      btn.textContent      = '↩ Volver a borrador';
      btn.style.background = 'var(--warn)';
      btn.style.color      = 'var(--negro)';
      btn.disabled         = false;
    } else if (estado === 'Generando informe' || estado === 'Informe disponible') {
      btn.textContent      = '↩ Volver a borrador';
      btn.style.background = 'var(--warn)';
      btn.style.color      = 'var(--negro)';
      btn.disabled         = false;
    } else {
      btn.textContent      = '✓ Marcar como completada';
      btn.style.background = 'var(--acento-2)';
      btn.style.color      = 'var(--blanco)';
      btn.disabled         = false;
    }
  }

  // ── Botón de informe IA ──────────────────────────────
  if (btnInf) {
    if (estado === 'Generando informe') {
      btnInf.textContent      = '⏳ Generando informe...';
      btnInf.style.background = '#9B59B6';
      btnInf.style.color      = 'var(--blanco)';
      btnInf.style.opacity    = '0.7';
      btnInf.style.cursor     = 'not-allowed';
      btnInf.disabled         = true;
      // Reanudar polling si volvemos a esta pantalla
      if (!_pollingInformeTimer && APP.inspeccionActual) {
        _iniciarPollingInforme(APP.inspeccionActual.id);
      }
    } else if (estado === 'Informe disponible') {
      btnInf.textContent      = '📄 Ver informe';
      btnInf.style.background = '#9B59B6';
      btnInf.style.color      = 'var(--blanco)';
      btnInf.style.opacity    = '1';
      btnInf.style.cursor     = 'pointer';
      btnInf.disabled         = false;
      btnInf.onclick          = verInforme;
    } else if (estado === 'Completado' || estado === 'Enviado') {
      btnInf.textContent      = '🤖 Generar informe IA';
      btnInf.style.background = '#9B59B6';
      btnInf.style.color      = 'var(--blanco)';
      btnInf.style.opacity    = '1';
      btnInf.style.cursor     = 'pointer';
      btnInf.disabled         = false;
      btnInf.onclick          = generarInforme;
    } else {
      // Borrador — no se puede generar informe todavía
      btnInf.textContent      = '🤖 Generar informe IA';
      btnInf.style.background = 'var(--gris-3)';
      btnInf.style.color      = 'var(--gris-5)';
      btnInf.style.opacity    = '0.5';
      btnInf.style.cursor     = 'not-allowed';
      btnInf.disabled         = true;
      btnInf.onclick          = null;
    }
  }
}

async function toggleEstadoInspeccion() {
  const estado    = APP.inspeccionActual?.estado || 'Borrador';
  const nuevoEstado = (estado === 'Completado' || estado === 'Enviado') ? 'Borrador' : 'Completado';
  const btn = document.getElementById('btn-estado-insp');
  btn.disabled    = true;
  btn.textContent = 'Guardando...';
  try {
    await SYNC.actualizarEstado(APP.inspeccionActual.id, nuevoEstado);
    APP.inspeccionActual.estado = nuevoEstado;
    actualizarBotonesResumen();
    toast(nuevoEstado === 'Completado' ? 'Inspección completada' : 'Devuelta a borrador', 'ok');
    if (nuevoEstado === 'Completado') {
      setTimeout(() => { irA('p-lista'); cargarLista(); }, 800);
    }
  } catch (ex) {
    toast('Error: ' + ex.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function completarInspeccion() { await toggleEstadoInspeccion(); }
async function volverABorrador()      { await toggleEstadoInspeccion(); }

// ════════════════════════════════════════════════════════
//  ARRANQUE
// ════════════════════════════════════════════════════════
async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('[SW] Registrado'))
      .catch(e => console.warn('[SW] Error:', e));
  }
  await DB.init();
  SYNC.init(actualizarIndicadorSync);
  document.addEventListener('click', e => {
    if (!e.target.closest('.cliente-search-wrap')) {
      document.getElementById('cliente-dropdown')?.classList.remove('visible');
      document.getElementById('empleado-dropdown')?.classList.remove('visible');
    }
  });
  SYNC.cargarCatalogo();
  cargarLista();
}

document.addEventListener('DOMContentLoaded', init);
