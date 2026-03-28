// ============================================================
//  FIELDOC — app.js  v1.1
//  Versión·A
// ============================================================

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
  document.getElementById('stat-total').textContent    = inspecciones.length;
  document.getElementById('stat-borrador').textContent = inspecciones.filter(i => i.estado === 'Borrador').length;
  document.getElementById('stat-enviado').textContent  = inspecciones.filter(i => i.estado === 'Enviado').length;
  document.getElementById('insp-count').textContent    = inspecciones.length + ' registros';
}

function renderLista(inspecciones, clientes) {
  const cont = document.getElementById('lista-contenido');
  if (inspecciones.length === 0) {
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Sin inspecciones</div><div class="empty-text">Pulsa el botón + para crear la primera inspección.</div></div>`;
    return;
  }
  const sorted = [...inspecciones].sort((a, b) => (b.fecha||'').localeCompare(a.fecha||''));
  cont.innerHTML = sorted.map((ins, idx) => {
    const cliente   = clientes.find(c => c.id === ins.id_cliente);
    const nombreCli = cliente ? (cliente.nombre_comercial || cliente.nombre || ins.id_cliente) : ins.id_cliente;
    const badgeClass = { 'Borrador':'badge-borrador','Completado':'badge-completado','Enviado':'badge-enviado' }[ins.estado] || 'badge-borrador';
    const icono = ins.estado === 'Enviado' ? '✅' : ins.estado === 'Completado' ? '🔵' : '🟡';
    return `<div class="inspeccion-card" style="animation-delay:${idx*0.05}s" onclick="abrirInspeccion('${ins.id}')">
      <div class="card-icono" style="background:var(--gris-2)">${icono}</div>
      <div class="card-info">
        <div class="card-cliente">${nombreCli}</div>
        <div class="card-meta"><span>${ins.fecha||'—'}</span><span>${ins.operario||'—'}</span><span class="badge ${badgeClass}">${ins.estado}</span></div>
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
    const nombreCli = cliente ? (cliente.nombre_comercial || cliente.nombre || ins.id_cliente) : ins.id_cliente;

    document.getElementById('form-cliente').textContent  = nombreCli;
    document.getElementById('form-cliente').dataset.idCliente = ins.id_cliente;
    document.getElementById('form-fecha').textContent    = ins.fecha || '—';
    document.getElementById('form-operario').textContent = ins.operario || '—';
    document.getElementById('form-operario').dataset.idEmpleado = ins.id_empleado || '';

    APP.respuestas = await DB.getRespuestasByInspeccion(id);
    APP.preguntas  = await DB.getCatalogo('preguntas_' + ins.id_plantilla) || [];
    if (APP.preguntas.length === 0 && SYNC.estaOnline()) {
      APP.preguntas = await API.getPreguntas(ins.id_plantilla);
      await DB.guardarCatalogo('preguntas_' + ins.id_plantilla, APP.preguntas);
    }
    APP.secciones     = agruparPorSeccion(APP.preguntas);
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
  document.getElementById('prog-texto').textContent  = `Sección ${actual} de ${total}`;
  document.getElementById('prog-nombre').textContent = seccion.nombre;
  document.getElementById('prog-barra').style.width  = Math.round((actual/total)*100) + '%';
  const btnPrev = document.getElementById('btn-prev-sec');
  const btnNext = document.getElementById('btn-next-sec');
  btnPrev.style.visibility = APP.seccionActual === 0 ? 'hidden' : 'visible';
  btnNext.textContent = APP.seccionActual === total - 1 ? 'Finalizar ✓' : 'Siguiente →';
  btnNext.className   = APP.seccionActual === total - 1 ? 'btn-primario btn-finalizar' : 'btn-primario';

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

// ── Reproducir audio desde IndexedDB ────────────────────
async function reproducirAudio(id) {
  try {
    const blob = await DB.getBlob(id);
    if (!blob) { toast('Audio no disponible localmente', 'error'); return; }
    const url    = URL.createObjectURL(blob);
    const audio  = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play();
    toast('Reproduciendo audio...', '');
  } catch (ex) {
    toast('Error reproduciendo: ' + ex.message, 'error');
  }
}

// ── Ver foto desde IndexedDB ─────────────────────────────
async function verFoto(id) {
  try {
    const blob = await DB.getBlob(id);
    if (!blob) { toast('Foto no disponible localmente', 'error'); return; }
    const url = URL.createObjectURL(blob);
    // Abrir en lightbox simple
    let lb = document.getElementById('lightbox');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'lightbox';
      lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;z-index:600;cursor:pointer;';
      lb.onclick = () => { URL.revokeObjectURL(url); lb.remove(); };
      document.body.appendChild(lb);
    }
    lb.innerHTML = `<img src="${url}" style="max-width:95vw;max-height:90vh;border-radius:12px;object-fit:contain;">`;
    lb.style.display = 'flex';
  } catch (ex) {
    toast('Error mostrando foto: ' + ex.message, 'error');
  }
}

// ── Navegación secciones ─────────────────────────────────
function seccionAnterior() {
  if (APP.seccionActual > 0) { APP.seccionActual--; renderSeccion(); window.scrollTo(0,0); }
}
async function seccionSiguiente() {
  if (APP.seccionActual < APP.secciones.length - 1) {
    APP.seccionActual++; renderSeccion(); window.scrollTo(0,0);
  } else {
    await finalizarInspeccion();
  }
}
async function finalizarInspeccion() {
  try {
    await SYNC.actualizarEstado(APP.inspeccionActual.id, 'Completado');
    toast('Inspección completada', 'ok');
    setTimeout(() => { irA('p-lista'); cargarLista(); }, 800);
  } catch (ex) { toast('Error: ' + ex.message, 'error'); }
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
  // campo = 'cliente' | 'operario'
  const ins = APP.inspeccionActual;
  if (!ins) return;

  if (campo === 'cliente') {
    // Reutilizar catálogo
    window._appClientes = await DB.getCatalogo('clientes') || [];
    // Mostrar modal de selección
    mostrarModalEdicion('cliente', 'Cambiar cliente', async (id) => {
      const c = window._appClientes.find(c => c.id === id);
      if (!c) return;
      ins.id_cliente = id;
      await DB.guardarInspeccion(ins);
      await DB.encolar('actualizarCabecera', { id: ins.id, id_cliente: id });
      document.getElementById('form-cliente').textContent = c.nombre_comercial || c.nombre || id;
      document.getElementById('form-cliente').dataset.idCliente = id;
      toast('Cliente actualizado', 'ok');
    });
  } else {
    window._appEmpleados = await DB.getCatalogo('empleados') || [];
    mostrarModalEdicion('operario', 'Cambiar operario', async (id) => {
      const e = window._appEmpleados.find(e => e.id === id);
      if (!e) return;
      ins.id_empleado = id;
      ins.operario    = e.nombre;
      await DB.guardarInspeccion(ins);
      await DB.encolar('actualizarCabecera', { id: ins.id, operario: e.nombre, id_empleado: id });
      document.getElementById('form-operario').textContent = e.nombre;
      document.getElementById('form-operario').dataset.idEmpleado = id;
      toast('Operario actualizado', 'ok');
    });
  }
}

function mostrarModalEdicion(tipo, titulo, onSelect) {
  let modal = document.getElementById('modal-edicion');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'modal-edicion';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:flex-end;justify-content:center;z-index:500;';

  const items = tipo === 'cliente'
    ? (window._appClientes||[]).map(c => ({ id: c.id, nombre: c.nombre_comercial || c.nombre || c.id, sub: `${c.municipio||''} ${c.cp||''}`.trim() }))
    : (window._appEmpleados||[]).map(e => ({ id: e.id, nombre: e.nombre, sub: e.categoria || '' }));

  modal.innerHTML = `
    <div style="background:var(--gris-1);border-radius:20px 20px 0 0;width:100%;max-width:680px;max-height:70vh;overflow:hidden;display:flex;flex-direction:column;">
      <div style="padding:16px 20px;border-bottom:1px solid var(--gris-3);display:flex;justify-content:space-between;align-items:center;">
        <span style="font-family:'Syne',sans-serif;font-weight:700;font-size:16px;">${titulo}</span>
        <button onclick="document.getElementById('modal-edicion').remove()" style="background:none;border:none;color:var(--gris-5);font-size:20px;cursor:pointer;">✕</button>
      </div>
      <div style="overflow-y:auto;flex:1;">
        ${items.map(item => `
          <div onclick="document.getElementById('modal-edicion').remove();(${onSelect.toString()})('${item.id}')"
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
