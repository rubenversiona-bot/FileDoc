// ============================================================
//  FIELDOC — app.js
//  Lógica principal de la aplicación
//  Versión·A · v1.0
// ============================================================

// ── Estado global de la app ──────────────────────────────
const APP = {
  inspeccionActual: null,
  respuestas:       [],
  preguntas:        [],
  secciones:        [],
  seccionActual:    0,
  grabando:         null,    // MediaRecorder activo
  streamActivo:     null,    // MediaStream activo
};

// ── Generador de IDs locales ─────────────────────────────
function uid(prefijo) {
  return prefijo + Date.now().toString(36).toUpperCase() +
         Math.random().toString(36).substr(2, 4).toUpperCase();
}

// ── Fecha formateada ─────────────────────────────────────
function fechaHoy() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
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
//  INDICADOR DE SYNC
// ════════════════════════════════════════════════════════
function actualizarIndicadorSync({ online, pendientes, sincronizando }) {
  const el = document.getElementById('sync-status');
  if (!el) return;

  if (!online) {
    el.className = 'sync-badge offline';
    el.textContent = pendientes > 0
      ? `Sin conexión · ${pendientes} pendientes`
      : 'Sin conexión';
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
}

// ════════════════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════════════════
function toast(msg, tipo = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast visible ' + tipo;
  setTimeout(() => { t.className = 'toast'; }, 3200);
}

// ════════════════════════════════════════════════════════
//  PANTALLA 1 — Lista de inspecciones
// ════════════════════════════════════════════════════════
async function cargarLista() {
  const cont = document.getElementById('lista-contenido');
  cont.innerHTML = '<div class="loader"><div class="spinner"></div> Cargando...</div>';

  try {
    // Cargar desde local primero, luego sync en background
    let inspecciones = await DB.getInspecciones();
    const clientes   = await DB.getCatalogo('clientes') || [];

    // Si no hay nada local y hay conexión, cargar del servidor
    if (inspecciones.length === 0 && SYNC.estaOnline()) {
      await SYNC.cargarInspecciones();
      inspecciones = await DB.getInspecciones();
    }

    actualizarStats(inspecciones);
    renderLista(inspecciones, clientes);

    // Sync en background si hay conexión
    if (SYNC.estaOnline()) {
      SYNC.cargarInspecciones().then(() =>
        DB.getInspecciones().then(ins => renderLista(ins, clientes))
      );
    }
  } catch (ex) {
    cont.innerHTML = `<div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <div class="empty-title">Error al cargar</div>
      <div class="empty-text">${ex.message}</div>
    </div>`;
  }
}

function actualizarStats(inspecciones) {
  document.getElementById('stat-total').textContent    = inspecciones.length;
  document.getElementById('stat-borrador').textContent = inspecciones.filter(i => i.estado === 'Borrador').length;
  document.getElementById('stat-enviado').textContent  = inspecciones.filter(i => i.estado === 'Enviado').length;
  document.getElementById('insp-count').textContent    = inspecciones.length + ' registros';
}

function renderLista(inspecciones, clientes) {
  const cont = document.getElementById('lista-contenido');

  if (inspecciones.length === 0) {
    cont.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <div class="empty-title">Sin inspecciones</div>
      <div class="empty-text">Pulsa el botón + para crear la primera inspección.</div>
    </div>`;
    return;
  }

  const sorted = [...inspecciones].sort((a, b) => b.fecha?.localeCompare(a.fecha || '') || 0);

  cont.innerHTML = sorted.map((ins, idx) => {
    const cliente    = clientes.find(c => c.id === ins.id_cliente);
    const nombreCli  = cliente
      ? (cliente.nombre_comercial || cliente.nombre || ins.id_cliente)
      : ins.id_cliente;
    const badgeClass = { 'Borrador':'badge-borrador', 'Completado':'badge-completado', 'Enviado':'badge-enviado' }[ins.estado] || 'badge-borrador';
    const icono      = ins.estado === 'Enviado' ? '✅' : ins.estado === 'Completado' ? '🔵' : '🟡';

    return `<div class="inspeccion-card" style="animation-delay:${idx*0.05}s" onclick="abrirInspeccion('${ins.id}')">
      <div class="card-icono" style="background:var(--gris-2)">${icono}</div>
      <div class="card-info">
        <div class="card-cliente">${nombreCli}</div>
        <div class="card-meta">
          <span>${ins.fecha || '—'}</span>
          <span>${ins.operario || '—'}</span>
          <span class="badge ${badgeClass}">${ins.estado}</span>
        </div>
      </div>
      <div class="card-arrow">›</div>
    </div>`;
  }).join('');
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

    // Si el catálogo está vacío cargar del servidor
    if (clientes.length === 0 || plantillas.length === 0) {
      await SYNC.cargarCatalogo();
      clientes   = await DB.getCatalogo('clientes')   || [];
      plantillas = await DB.getCatalogo('plantillas') || [];
      empleados  = await DB.getCatalogo('empleados')  || [];
    }

    // Poblar selector de plantillas
    const sel = document.getElementById('sel-plantilla');
    sel.innerHTML = '<option value="">Seleccionar tipo de inspección...</option>';
    plantillas.forEach(p => {
      const opt       = document.createElement('option');
      opt.value       = p.id;
      opt.textContent = p.nombre;
      opt.dataset.desc = p.descripcion || '';
      sel.appendChild(opt);
    });

    // Guardar en estado para los buscadores
    window._appClientes  = clientes;
    window._appEmpleados = empleados;

  } catch (ex) {
    toast('Error cargando datos: ' + ex.message, 'error');
  }
}

function filtrarClientes(query) {
  const dropdown = document.getElementById('cliente-dropdown');
  const clientes = window._appClientes || [];
  const q        = query.toLowerCase().trim();
  const filtrados = q === ''
    ? clientes
    : clientes.filter(c =>
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
  const q         = query.toLowerCase().trim();
  const filtrados  = q === ''
    ? empleados
    : empleados.filter(e =>
        (e.nombre||'').toLowerCase().includes(q) ||
        (e.categoria||'').toLowerCase().includes(q)
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
  document.getElementById('input-operario').value   = e.nombre;
  document.getElementById('id-empleado-sel').value  = e.id;
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

  if (!idCliente)            { toast('Selecciona un cliente', 'error'); return; }
  if (!idPlantilla)          { toast('Selecciona un tipo de inspección', 'error'); return; }
  if (!operario || !idEmpleado) { toast('Selecciona un operario de la lista', 'error'); return; }

  const btn = document.getElementById('btn-crear');
  btn.textContent = 'Creando...';
  btn.disabled    = true;

  try {
    // Cargar preguntas de la plantilla
    let preguntas = await DB.getCatalogo('preguntas_' + idPlantilla);
    if (!preguntas && SYNC.estaOnline()) {
      preguntas = await API.getPreguntas(idPlantilla);
      await DB.guardarCatalogo('preguntas_' + idPlantilla, preguntas);
    }
    if (!preguntas || preguntas.length === 0) {
      throw new Error('No se pudieron cargar las preguntas. Comprueba la conexión.');
    }

    const idInspeccion = uid('INS');
    await SYNC.crearInspeccion({
      id:           idInspeccion,
      id_cliente:   idCliente,
      id_plantilla: idPlantilla,
      id_empleado:  idEmpleado,
      operario,
      fecha:        fechaHoy(),
      preguntas
    });

    toast('Inspección creada', 'ok');
    setTimeout(() => {
      irA('p-lista');
      cargarLista();
    }, 600);

  } catch (ex) {
    toast('Error: ' + ex.message, 'error');
  } finally {
    btn.textContent = 'Crear inspección';
    btn.disabled    = false;
  }
}

// ════════════════════════════════════════════════════════
//  PANTALLA 3 — Formulario de inspección
// ════════════════════════════════════════════════════════
async function abrirInspeccion(id) {
  irA('p-formulario');

  try {
    const ins = await DB.getInspeccion(id);
    if (!ins) throw new Error('Inspección no encontrada');

    APP.inspeccionActual = ins;

    // Cargar datos de cliente
    const clientes  = await DB.getCatalogo('clientes') || [];
    const cliente   = clientes.find(c => c.id === ins.id_cliente);
    const nombreCli = cliente
      ? (cliente.nombre_comercial || cliente.nombre)
      : ins.id_cliente;

    // Header del formulario
    document.getElementById('form-cliente').textContent  = nombreCli;
    document.getElementById('form-fecha').textContent    = ins.fecha || '—';
    document.getElementById('form-operario').textContent = ins.operario || '—';

    // Cargar respuestas
    APP.respuestas = await DB.getRespuestasByInspeccion(id);

    // Cargar preguntas del catálogo local
    APP.preguntas = await DB.getCatalogo('preguntas_' + ins.id_plantilla) || [];

    if (APP.preguntas.length === 0 && SYNC.estaOnline()) {
      APP.preguntas = await API.getPreguntas(ins.id_plantilla);
      await DB.guardarCatalogo('preguntas_' + ins.id_plantilla, APP.preguntas);
    }

    // Agrupar por sección
    APP.secciones = agruparPorSeccion(APP.preguntas);
    APP.seccionActual = 0;

    renderSeccion();

  } catch (ex) {
    toast('Error: ' + ex.message, 'error');
    irA('p-lista');
  }
}

function agruparPorSeccion(preguntas) {
  const mapa = new Map();
  preguntas.forEach(p => {
    const key = p.seccion_num;
    if (!mapa.has(key)) {
      mapa.set(key, {
        num:    p.seccion_num,
        nombre: p.seccion_nombre,
        preguntas: []
      });
    }
    mapa.get(key).preguntas.push(p);
  });
  return Array.from(mapa.values()).sort((a, b) => a.num - b.num);
}

// ── Renderizar sección actual ────────────────────────────
async function renderSeccion() {
  const seccion = APP.secciones[APP.seccionActual];
  if (!seccion) return;

  const total  = APP.secciones.length;
  const actual = APP.seccionActual + 1;
  const pct    = Math.round((actual / total) * 100);

  // Progreso
  document.getElementById('prog-texto').textContent  = `Sección ${actual} de ${total}`;
  document.getElementById('prog-nombre').textContent = seccion.nombre;
  document.getElementById('prog-barra').style.width  = pct + '%';

  // Navegación
  const btnPrev = document.getElementById('btn-prev-sec');
  const btnNext = document.getElementById('btn-next-sec');
  btnPrev.style.visibility = APP.seccionActual === 0 ? 'hidden' : 'visible';
  btnNext.textContent = APP.seccionActual === total - 1 ? 'Finalizar ✓' : 'Siguiente →';
  btnNext.className   = APP.seccionActual === total - 1 ? 'btn-primario btn-finalizar' : 'btn-primario';

  // Renderizar preguntas
  const cont = document.getElementById('preguntas-cont');
  cont.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const htmlPreguntas = [];
  for (const p of seccion.preguntas) {
    const resp    = APP.respuestas.find(r => r.id_pregunta === p.id);
    const archivos = resp ? await DB.getArchivosByRespuesta(resp.id) : [];
    htmlPreguntas.push(renderPregunta(p, resp, archivos));
  }

  cont.innerHTML = htmlPreguntas.join('');
}

function renderPregunta(pregunta, resp, archivos) {
  const respVal = resp?.respuesta || '';
  const obsVal  = resp?.observaciones || '';
  const respId  = resp?.id || '';

  const audios = archivos.filter(a => a.tipo === 'Audio');
  const fotos  = archivos.filter(a => a.tipo === 'Foto');
  const puedeGrabar = audios.length < 3;

  return `
  <div class="pregunta-card" id="preg-${pregunta.id}">

    <div class="pregunta-header">
      <span class="pregunta-num">P${String(pregunta.orden_global).padStart(2,'0')}</span>
      <span class="pregunta-texto">${pregunta.texto}</span>
    </div>

    <div class="respuesta-btns">
      <button class="btn-resp ${respVal === 'Sí' ? 'activo-si' : ''}"
              onclick="guardarRespuesta('${respId}','${pregunta.id}','Sí')">
        Sí
      </button>
      <button class="btn-resp ${respVal === 'No' ? 'activo-no' : ''}"
              onclick="guardarRespuesta('${respId}','${pregunta.id}','No')">
        No
      </button>
    </div>

    <textarea
      class="obs-input"
      placeholder="Observaciones (opcional)..."
      onblur="guardarObservacion('${respId}','${pregunta.id}',this.value)"
    >${obsVal}</textarea>

    <div class="archivos-cont" id="archivos-${pregunta.id}">
      ${renderArchivos(audios, fotos, pregunta.id, respId)}
    </div>

    <div class="archivo-btns">
      ${puedeGrabar ? `
        <button class="btn-archivo" onclick="iniciarGrabacion('${pregunta.id}','${respId}')">
          🎤 Grabar audio ${audios.length > 0 ? '('+ audios.length +'/3)' : ''}
        </button>` : `
        <button class="btn-archivo" disabled style="opacity:0.4">
          🎤 Máx. 3 audios
        </button>`}
      <button class="btn-archivo" onclick="abrirCamara('${pregunta.id}','${respId}')">
        📷 Foto ${fotos.length > 0 ? '('+ fotos.length +')' : ''}
      </button>
    </div>

  </div>`;
}

function renderArchivos(audios, fotos, idPregunta, idRespuesta) {
  if (audios.length === 0 && fotos.length === 0) return '';

  const htmlAudios = audios.map(a => `
    <div class="archivo-item" id="arc-${a.id}">
      <span class="archivo-icono">🎤</span>
      <span class="archivo-nombre">Audio ${a.num_orden}</span>
      <span class="archivo-sync ${a.subido ? 'subido' : 'pendiente'}">
        ${a.subido ? '✓' : '⏳'}
      </span>
      <button class="archivo-del" onclick="eliminarArchivo('${a.id}','${idPregunta}','${idRespuesta}')">✕</button>
    </div>`).join('');

  const htmlFotos = fotos.map(f => `
    <div class="archivo-item" id="arc-${f.id}">
      <span class="archivo-icono">📷</span>
      <span class="archivo-nombre">Foto ${f.num_orden}</span>
      <span class="archivo-sync ${f.subido ? 'subido' : 'pendiente'}">
        ${f.subido ? '✓' : '⏳'}
      </span>
      <button class="archivo-del" onclick="eliminarArchivo('${f.id}','${idPregunta}','${idRespuesta}')">✕</button>
    </div>`).join('');

  return htmlAudios + htmlFotos;
}

// ── Navegación entre secciones ───────────────────────────
function seccionAnterior() {
  if (APP.seccionActual > 0) {
    APP.seccionActual--;
    renderSeccion();
    window.scrollTo(0, 0);
  }
}

async function seccionSiguiente() {
  const total = APP.secciones.length;
  if (APP.seccionActual < total - 1) {
    APP.seccionActual++;
    renderSeccion();
    window.scrollTo(0, 0);
  } else {
    // Finalizar inspección
    await finalizarInspeccion();
  }
}

async function finalizarInspeccion() {
  const id = APP.inspeccionActual.id;
  try {
    await SYNC.actualizarEstado(id, 'Completado');
    toast('Inspección completada', 'ok');
    setTimeout(() => {
      irA('p-lista');
      cargarLista();
    }, 800);
  } catch (ex) {
    toast('Error: ' + ex.message, 'error');
  }
}

// ── Guardar respuesta ────────────────────────────────────
async function guardarRespuesta(idRespuesta, idPregunta, valor) {
  if (!idRespuesta) return;

  // Actualizar UI inmediatamente
  const card = document.getElementById('preg-' + idPregunta);
  if (card) {
    card.querySelectorAll('.btn-resp').forEach(b => b.classList.remove('activo-si','activo-no'));
    const btn = valor === 'Sí'
      ? card.querySelectorAll('.btn-resp')[0]
      : card.querySelectorAll('.btn-resp')[1];
    if (btn) btn.classList.add(valor === 'Sí' ? 'activo-si' : 'activo-no');
  }

  // Actualizar estado local
  const resp = APP.respuestas.find(r => r.id === idRespuesta);
  if (resp) resp.respuesta = valor;

  // Guardar
  try {
    await SYNC.guardarRespuesta(idRespuesta, 'respuesta', valor);
  } catch (ex) {
    toast('Error guardando: ' + ex.message, 'error');
  }
}

async function guardarObservacion(idRespuesta, idPregunta, valor) {
  if (!idRespuesta) return;
  const resp = APP.respuestas.find(r => r.id === idRespuesta);
  if (resp) resp.observaciones = valor;
  try {
    await SYNC.guardarRespuesta(idRespuesta, 'observaciones', valor);
  } catch (ex) {
    toast('Error guardando observación: ' + ex.message, 'error');
  }
}

// ── Grabación de audio ───────────────────────────────────
async function iniciarGrabacion(idPregunta, idRespuesta) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    APP.streamActivo = stream;

    const chunks = [];
    const rec    = new MediaRecorder(stream);
    APP.grabando  = rec;

    rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      APP.streamActivo = null;
      APP.grabando     = null;

      const blob     = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      const id       = uid('AUD');
      const archivos = await DB.getArchivosByRespuesta(idRespuesta);
      const audios   = archivos.filter(a => a.tipo === 'Audio');
      const meta     = {
        id,
        id_respuesta:  idRespuesta,
        id_inspeccion: APP.inspeccionActual.id,
        tipo:          'Audio',
        num_orden:     audios.length + 1,
        subido:        false,
        url:           null,
        timestamp:     new Date().toISOString()
      };

      await SYNC.guardarArchivo(meta, blob);
      toast('Audio guardado', 'ok');

      // Refrescar lista de archivos en UI
      const nuevosArchivos = await DB.getArchivosByRespuesta(idRespuesta);
      const cont = document.getElementById('archivos-' + idPregunta);
      if (cont) {
        const audiosNew = nuevosArchivos.filter(a => a.tipo === 'Audio');
        const fotosNew  = nuevosArchivos.filter(a => a.tipo === 'Foto');
        cont.innerHTML  = renderArchivos(audiosNew, fotosNew, idPregunta, idRespuesta);
      }

      // Actualizar botón de grabar
      const btnGrabar = document.querySelector(`#preg-${idPregunta} .btn-archivo`);
      if (btnGrabar) {
        const totalAudios = nuevosArchivos.filter(a => a.tipo === 'Audio').length;
        if (totalAudios >= 3) {
          btnGrabar.textContent = '🎤 Máx. 3 audios';
          btnGrabar.disabled = true;
          btnGrabar.style.opacity = '0.4';
        } else {
          btnGrabar.textContent = `🎤 Grabar audio (${totalAudios}/3)`;
        }
      }
    };

    // Mostrar modal de grabación
    mostrarModalGrabacion(rec, idPregunta);
    rec.start();

  } catch (ex) {
    toast('No se puede acceder al micrófono: ' + ex.message, 'error');
  }
}

function mostrarModalGrabacion(rec, idPregunta) {
  let modal = document.getElementById('modal-grabacion');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-grabacion';
    modal.className = 'modal-grabacion';
    document.body.appendChild(modal);
  }

  let seg = 0;
  const interval = setInterval(() => {
    seg++;
    const min = String(Math.floor(seg/60)).padStart(2,'0');
    const s   = String(seg % 60).padStart(2,'0');
    const timer = modal.querySelector('.grab-timer');
    if (timer) timer.textContent = `${min}:${s}`;
    // Límite de 3 minutos
    if (seg >= 180) detenerGrabacion(interval, modal);
  }, 1000);

  modal.innerHTML = `
    <div class="modal-inner">
      <div class="grab-pulso"></div>
      <div class="grab-timer">00:00</div>
      <div class="grab-label">Grabando...</div>
      <button class="btn-stop-grab" onclick="detenerGrabacion(${interval}, document.getElementById('modal-grabacion'))">
        ⏹ Detener y guardar
      </button>
    </div>`;
  modal.style.display = 'flex';
}

function detenerGrabacion(interval, modal) {
  clearInterval(interval);
  if (APP.grabando && APP.grabando.state === 'recording') {
    APP.grabando.stop();
  }
  if (modal) modal.style.display = 'none';
}

// ── Cámara / fotos ───────────────────────────────────────
function abrirCamara(idPregunta, idRespuesta) {
  const input = document.createElement('input');
  input.type    = 'file';
  input.accept  = 'image/*';
  input.capture = 'environment';  // cámara trasera

  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;

    const id       = uid('FOT');
    const archivos = await DB.getArchivosByRespuesta(idRespuesta);
    const fotos    = archivos.filter(a => a.tipo === 'Foto');
    const meta     = {
      id,
      id_respuesta:  idRespuesta,
      id_inspeccion: APP.inspeccionActual.id,
      tipo:          'Foto',
      num_orden:     fotos.length + 1,
      subido:        false,
      url:           null,
      timestamp:     new Date().toISOString()
    };

    await SYNC.guardarArchivo(meta, file);
    toast('Foto guardada', 'ok');

    // Refrescar UI
    const nuevosArchivos = await DB.getArchivosByRespuesta(idRespuesta);
    const cont = document.getElementById('archivos-' + idPregunta);
    if (cont) {
      const audiosNew = nuevosArchivos.filter(a => a.tipo === 'Audio');
      const fotosNew  = nuevosArchivos.filter(a => a.tipo === 'Foto');
      cont.innerHTML  = renderArchivos(audiosNew, fotosNew, idPregunta, idRespuesta);
    }
  };

  input.click();
}

// ── Eliminar archivo ─────────────────────────────────────
async function eliminarArchivo(id, idPregunta, idRespuesta) {
  try {
    await SYNC.eliminarArchivo(id, null);
    document.getElementById('arc-' + id)?.remove();
    toast('Archivo eliminado', '');

    // Refrescar contadores
    const archivos = await DB.getArchivosByRespuesta(idRespuesta);
    const audios   = archivos.filter(a => a.tipo === 'Audio');
    const btnGrabar = document.querySelector(`#preg-${idPregunta} .btn-archivo`);
    if (btnGrabar && audios.length < 3) {
      btnGrabar.textContent = `🎤 Grabar audio ${audios.length > 0 ? '('+audios.length+'/3)' : ''}`;
      btnGrabar.disabled = false;
      btnGrabar.style.opacity = '1';
    }
  } catch (ex) {
    toast('Error eliminando: ' + ex.message, 'error');
  }
}

// ════════════════════════════════════════════════════════
//  ARRANQUE
// ════════════════════════════════════════════════════════
async function init() {
  // Registrar Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('[SW] Registrado'))
      .catch(e => console.warn('[SW] Error:', e));
  }

  // Inicializar DB
  await DB.init();

  // Inicializar motor de sync con callback para el indicador
  SYNC.init(actualizarIndicadorSync);

  // Cerrar dropdowns al tocar fuera
  document.addEventListener('click', e => {
    if (!e.target.closest('.cliente-search-wrap')) {
      document.getElementById('cliente-dropdown')?.classList.remove('visible');
      document.getElementById('empleado-dropdown')?.classList.remove('visible');
    }
  });

  // Cargar catálogo inicial en background
  SYNC.cargarCatalogo();

  // Mostrar pantalla 1
  cargarLista();
}

// Arrancar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', init);
