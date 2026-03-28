// ============================================================
//  FIELDOC — sync.js  v2.0
//  Motor de sincronización — simple y fiable
//  Versión·A
//
//  PRINCIPIO: El servidor (Sheets) es la fuente de verdad.
//  IndexedDB es solo un espejo local + cola de pendientes.
//  Al arrancar con conexión, siempre se descarga el estado
//  real del servidor y se reconcilia con el local.
// ============================================================

const SYNC = {

  _sincronizando: false,
  _onStatusChange: null,

  estaOnline() { return navigator.onLine; },

  // ── Init ─────────────────────────────────────────────
  init(onStatusChange) {
    this._onStatusChange = onStatusChange || (() => {});
    window.addEventListener('online',  () => { this._notificar(); this.sincronizar(); });
    window.addEventListener('offline', () => { this._notificar(); });
    if (this.estaOnline()) this.sincronizar();
  },

  async _notificar() {
    const pendientes = await DB.contarPendientes();
    this._onStatusChange({ online: this.estaOnline(), pendientes, sincronizando: this._sincronizando });
  },

  // ════════════════════════════════════════════════════
  //  SINCRONIZACIÓN PRINCIPAL
  //  1. Vaciar cola de pendientes (subir cambios locales)
  //  2. Descargar estado real del servidor
  //  3. Reconciliar: el servidor manda
  // ════════════════════════════════════════════════════
  async sincronizar() {
    if (this._sincronizando || !this.estaOnline()) return;
    this._sincronizando = true;
    await this._notificar();

    try {
      // PASO 1: Vaciar cola de pendientes
      await this._vaciarCola();

      // PASO 2 y 3: Descargar servidor y reconciliar
      await this._reconciliar();

    } catch (ex) {
      console.warn('[SYNC] Error en sincronización:', ex.message);
    }

    this._sincronizando = false;
    await this._notificar();
  },

  // ── Vaciar cola de operaciones pendientes ────────────
  async _vaciarCola() {
    const queue = await DB.getQueue();
    if (queue.length === 0) return;
    console.log(`[SYNC] Vaciando cola: ${queue.length} operaciones`);

    for (const op of queue) {
      if (!this.estaOnline()) break;
      try {
        await this._procesarOperacion(op);
        await DB.eliminarDeQueue(op.id);
        console.log(`[SYNC] ✓ ${op.tipo}`);
      } catch (ex) {
        await DB.incrementarIntentos(op.id);
        console.warn(`[SYNC] ✗ ${op.tipo}: ${ex.message}`);
        // Descartar después de 3 intentos para no bloquear la cola
        if (op.intentos >= 3) {
          console.error(`[SYNC] Descartando operación tras 3 intentos: ${op.id}`);
          await DB.eliminarDeQueue(op.id);
        }
      }
    }
  },

  // ── Reconciliar local con servidor ───────────────────
  // El servidor es la fuente de verdad. Descargamos todo
  // y reemplazamos el estado local con lo que dice Sheets.
  async _reconciliar() {
    try {
      const inspecciones = await API.getInspecciones();

      // IDs que existen en el servidor
      const idsServidor = new Set(inspecciones.map(i => i.id));

      // IDs que existen en local
      const locales     = await DB.getInspecciones();
      const idsLocales  = new Set(locales.map(i => i.id));

      // Eliminar del local los que NO están en el servidor
      // (son registros huérfanos de pruebas o syncs fallidas)
      for (const ins of locales) {
        if (!idsServidor.has(ins.id) && !ins._pendiente) {
          console.log(`[SYNC] Eliminando huérfano local: ${ins.id}`);
          await DB._eliminarInspeccionLocal(ins.id);
        }
      }

      // Guardar o actualizar en local todos los del servidor
      for (const ins of inspecciones) {
        const local = locales.find(l => l.id === ins.id);
        // Solo sobreescribir si no hay cambios locales pendientes
        const tienePendientes = await DB._tienePendientes(ins.id);
        if (!tienePendientes) {
          await DB.guardarInspeccion({ ...ins, _pendiente: false });
        }
      }

      console.log(`[SYNC] Reconciliado: ${inspecciones.length} inspecciones del servidor`);
    } catch (ex) {
      console.warn('[SYNC] Error reconciliando:', ex.message);
    }
  },

  // ── Procesar operación de la cola ────────────────────
  async _procesarOperacion(op) {
    switch (op.tipo) {
      case 'crearInspeccion':
        await API.crearInspeccion(op.payload);
        break;
      case 'actualizarEstado':
        await API.actualizarEstado(op.payload);
        break;
      case 'actualizarCabecera':
        await API.post('actualizarcabecera', op.payload);
        break;
      case 'guardarRespuesta':
        await API.guardarRespuesta(op.payload);
        break;
      case 'subirArchivo': {
        const blob = await DB.getBlob(op.payload.id_archivo_local);
        if (!blob) throw new Error('Blob no encontrado: ' + op.payload.id_archivo_local);
        const base64   = await API.blobToBase64(blob);
        const resultado = await API.subirArchivo({ ...op.payload, base64, mime_type: blob.type });
        // Marcar como subido en metadatos locales
        const archivos = await DB.getArchivosByRespuesta(op.payload.id_respuesta);
        const meta     = archivos.find(a => a.id === op.payload.id_archivo_local);
        if (meta) {
          meta.url    = resultado.url;
          meta.subido = true;
          await DB.guardarArchivoMeta(meta);
        }
        break;
      }
      case 'eliminarArchivo':
        await API.eliminarArchivo(op.payload);
        break;
      default:
        throw new Error('Tipo desconocido: ' + op.tipo);
    }
  },

  // ════════════════════════════════════════════════════
  //  API PÚBLICA — escrituras
  // ════════════════════════════════════════════════════

  async crearInspeccion(data) {
    // Guardar local con flag _pendiente
    await DB.guardarInspeccion({
      id:           data.id,
      id_cliente:   data.id_cliente,
      id_plantilla: data.id_plantilla,
      id_empleado:  data.id_empleado || '',
      fecha:        data.fecha,
      operario:     data.operario,
      estado:       'Borrador',
      _pendiente:   true
    });

    // Guardar respuestas vacías localmente
    if (data.preguntas) {
      for (const p of data.preguntas) {
        await DB.guardarRespuesta({
          id:            'RES_' + data.id + '_' + p.id,
          id_inspeccion: data.id,
          id_pregunta:   p.id,
          orden_global:  p.orden_global,
          respuesta:     '',
          observaciones: '',
          _pendiente:    true
        });
      }
    }

    // Si hay conexión, intentar sync inmediata
    if (this.estaOnline()) {
      try {
        await API.crearInspeccion({
          id:           data.id,
          id_cliente:   data.id_cliente,
          id_plantilla: data.id_plantilla,
          id_empleado:  data.id_empleado || '',
          operario:     data.operario
        });
        // Confirmado en servidor — quitar flag pendiente
        const ins = await DB.getInspeccion(data.id);
        if (ins) { ins._pendiente = false; await DB.guardarInspeccion(ins); }
        console.log('[SYNC] Inspección creada en servidor: ' + data.id);
      } catch (ex) {
        // Falló — encolar para reintento
        console.warn('[SYNC] Sync inmediata falló, encolando:', ex.message);
        await DB.encolar('crearInspeccion', {
          id: data.id, id_cliente: data.id_cliente,
          id_plantilla: data.id_plantilla, id_empleado: data.id_empleado || '',
          operario: data.operario
        });
      }
    } else {
      // Sin conexión — encolar
      await DB.encolar('crearInspeccion', {
        id: data.id, id_cliente: data.id_cliente,
        id_plantilla: data.id_plantilla, id_empleado: data.id_empleado || '',
        operario: data.operario
      });
    }
    await this._notificar();
  },

  async guardarRespuesta(idRespuesta, campo, valor) {
    const resp = await DB.getRespuesta(idRespuesta);
    if (!resp) throw new Error('Respuesta no encontrada: ' + idRespuesta);
    resp[campo] = valor;
    await DB.guardarRespuesta(resp);

    // Intentar sync inmediata, encolar si falla
    if (this.estaOnline()) {
      try {
        await API.guardarRespuesta({ id_respuesta: idRespuesta, respuesta: resp.respuesta, observaciones: resp.observaciones });
      } catch (ex) {
        await DB.encolar('guardarRespuesta', { id_respuesta: idRespuesta, respuesta: resp.respuesta, observaciones: resp.observaciones });
      }
    } else {
      await DB.encolar('guardarRespuesta', { id_respuesta: idRespuesta, respuesta: resp.respuesta, observaciones: resp.observaciones });
    }
    await this._notificar();
  },

  async actualizarEstado(idInspeccion, estado) {
    await DB.actualizarEstadoInspeccion(idInspeccion, estado);
    if (this.estaOnline()) {
      try {
        await API.actualizarEstado({ id: idInspeccion, estado });
        return;
      } catch (ex) { /* encolar abajo */ }
    }
    await DB.encolar('actualizarEstado', { id: idInspeccion, estado });
    await this._notificar();
  },

  async guardarArchivo(meta, blob) {
    await DB.guardarBlob(meta.id, blob);
    await DB.guardarArchivoMeta({ ...meta, subido: false, url: null });

    if (this.estaOnline()) {
      try {
        const base64    = await API.blobToBase64(blob);
        const resultado = await API.subirArchivo({ ...meta, base64, mime_type: blob.type, id_archivo_local: meta.id });
        const guardado  = await DB.getArchivosByRespuesta(meta.id_respuesta);
        const m         = guardado.find(a => a.id === meta.id);
        if (m) { m.url = resultado.url; m.subido = true; await DB.guardarArchivoMeta(m); }
        return;
      } catch (ex) { /* encolar abajo */ }
    }
    await DB.encolar('subirArchivo', { id_archivo_local: meta.id, id_respuesta: meta.id_respuesta, id_inspeccion: meta.id_inspeccion, tipo: meta.tipo });
    await this._notificar();
  },

  async eliminarArchivo(id, idServidor) {
    await DB.eliminarArchivo(id);
    if (idServidor && this.estaOnline()) {
      try { await API.eliminarArchivo({ id_archivo: idServidor }); return; } catch (ex) { /* encolar */ }
      await DB.encolar('eliminarArchivo', { id_archivo: idServidor });
    }
  },

  // ── Catálogo ─────────────────────────────────────────
  async cargarCatalogo() {
    if (!this.estaOnline()) return;
    try {
      const [clientes, plantillas, empleados] = await Promise.all([
        API.getClientes(), API.getPlantillas(), API.getEmpleados()
      ]);
      await DB.guardarCatalogo('clientes',   clientes);
      await DB.guardarCatalogo('plantillas', plantillas);
      await DB.guardarCatalogo('empleados',  empleados);
      console.log('[SYNC] Catálogo actualizado');
    } catch (ex) {
      console.warn('[SYNC] Error catálogo:', ex.message);
    }
  },

  async cargarInspecciones() {
    // Ahora cargarInspecciones llama a reconciliar directamente
    await this._reconciliar();
  }
};
