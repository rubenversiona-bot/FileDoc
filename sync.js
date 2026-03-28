// ============================================================
//  FIELDOC — sync.js
//  Motor de sincronización offline → Google Sheets
//  Versión·A · v1.0
// ============================================================

const SYNC = {

  _sincronizando: false,
  _onStatusChange: null,   // callback para actualizar UI

  // ── Estado de conectividad ───────────────────────────
  estaOnline() {
    return navigator.onLine;
  },

  // ── Inicializar listeners de red ─────────────────────
  init(onStatusChange) {
    this._onStatusChange = onStatusChange || (() => {});

    window.addEventListener('online',  () => {
      console.log('[SYNC] Conexión recuperada — iniciando sync');
      this._notificar();
      this.sincronizar();
    });

    window.addEventListener('offline', () => {
      console.log('[SYNC] Sin conexión');
      this._notificar();
    });

    // Sync inicial si hay conexión
    if (this.estaOnline()) this.sincronizar();
  },

  async _notificar() {
    const pendientes = await DB.contarPendientes();
    this._onStatusChange({
      online:     this.estaOnline(),
      pendientes,
      sincronizando: this._sincronizando
    });
  },

  // ── Sincronización principal ─────────────────────────
  async sincronizar() {
    if (this._sincronizando || !this.estaOnline()) return;

    const queue = await DB.getQueue();
    if (queue.length === 0) {
      await this._notificar();
      return;
    }

    this._sincronizando = true;
    await this._notificar();
    console.log(`[SYNC] Procesando ${queue.length} operaciones pendientes`);

    for (const op of queue) {
      try {
        await this._procesarOperacion(op);
        await DB.eliminarDeQueue(op.id);
        console.log(`[SYNC] OK → ${op.tipo} (${op.id})`);
      } catch (ex) {
        await DB.incrementarIntentos(op.id);
        console.warn(`[SYNC] Error en ${op.tipo}: ${ex.message} (intento ${op.intentos + 1})`);
        // Si falla más de 5 veces, lo dejamos para más tarde
        if (op.intentos >= 5) {
          console.error(`[SYNC] Operación ${op.id} descartada tras 5 intentos`);
          await DB.eliminarDeQueue(op.id);
        }
        // Parar si perdemos conexión a mitad
        if (!this.estaOnline()) break;
      }
    }

    this._sincronizando = false;
    await this._notificar();
  },

  // ── Procesar cada tipo de operación ─────────────────
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
        // Recuperar el blob de IndexedDB y convertir a base64
        const blob = await DB.getBlob(op.payload.id_archivo_local);
        if (!blob) throw new Error('Blob no encontrado: ' + op.payload.id_archivo_local);
        const base64 = await API.blobToBase64(blob);
        const resultado = await API.subirArchivo({
          ...op.payload,
          base64,
          mime_type: blob.type
        });
        // Actualizar URL en metadatos locales con la URL real de Drive
        const meta = await DB.getCatalogo('archivo_' + op.payload.id_archivo_local);
        if (meta) {
          meta.url       = resultado.url;
          meta.num_orden = resultado.num_orden;
          meta.subido    = true;
          await DB.guardarArchivoMeta(meta);
        }
        break;
      }

      case 'eliminarArchivo':
        await API.eliminarArchivo(op.payload);
        break;

      default:
        throw new Error('Tipo de operación desconocido: ' + op.tipo);
    }
  },

  // ════════════════════════════════════════════════════
  //  API pública — escrituras que van a la cola
  // ════════════════════════════════════════════════════

  // Crear inspección: guarda local + encola
  async crearInspeccion(data) {
    // Guardar en local
    await DB.guardarInspeccion({
      id:           data.id,
      id_cliente:   data.id_cliente,
      id_plantilla: data.id_plantilla,
      id_empleado:  data.id_empleado || '',
      fecha:        data.fecha,
      operario:     data.operario,
      estado:       'Borrador',
      _local:       true   // flag: creado localmente, pendiente de sync
    });

    // Guardar filas de respuesta vacías en local
    if (data.preguntas) {
      for (const p of data.preguntas) {
        await DB.guardarRespuesta({
          id:            'RES_' + data.id + '_' + p.id,
          id_inspeccion: data.id,
          id_pregunta:   p.id,
          orden_global:  p.orden_global,
          respuesta:     '',
          observaciones: '',
          _local:        true
        });
      }
    }

    // Encolar para sync con servidor — incluir el id local para coherencia
    await DB.encolar('crearInspeccion', {
      id:           data.id,
      id_cliente:   data.id_cliente,
      id_plantilla: data.id_plantilla,
      id_empleado:  data.id_empleado || '',
      operario:     data.operario
    });

    if (this.estaOnline()) this.sincronizar();
  },

  // Guardar respuesta: actualiza local + encola
  async guardarRespuesta(idRespuesta, campo, valor) {
    const resp = await DB.getRespuesta(idRespuesta);
    if (!resp) throw new Error('Respuesta no encontrada: ' + idRespuesta);

    resp[campo] = valor;
    await DB.guardarRespuesta(resp);

    // Encolar solo campos de Sheets (no metadatos locales)
    await DB.encolar('guardarRespuesta', {
      id_respuesta:  idRespuesta,
      respuesta:     resp.respuesta,
      observaciones: resp.observaciones
    });

    if (this.estaOnline()) this.sincronizar();
  },

  // Actualizar estado de inspección
  async actualizarEstado(idInspeccion, estado) {
    await DB.actualizarEstadoInspeccion(idInspeccion, estado);
    await DB.encolar('actualizarEstado', { id: idInspeccion, estado });
    if (this.estaOnline()) this.sincronizar();
  },

  // Guardar archivo (audio o foto)
  async guardarArchivo(meta, blob) {
    // Guardar blob en local
    await DB.guardarBlob(meta.id, blob);

    // Guardar metadatos
    await DB.guardarArchivoMeta({
      ...meta,
      subido: false,
      url:    null  // se actualizará cuando se sincronice
    });

    // Encolar subida
    await DB.encolar('subirArchivo', {
      id_archivo_local: meta.id,
      id_respuesta:     meta.id_respuesta,
      id_inspeccion:    meta.id_inspeccion,
      tipo:             meta.tipo
    });

    if (this.estaOnline()) this.sincronizar();
  },

  // Eliminar archivo
  async eliminarArchivo(id, idServidor) {
    await DB.eliminarArchivo(id);
    if (idServidor) {
      await DB.encolar('eliminarArchivo', { id_archivo: idServidor });
      if (this.estaOnline()) this.sincronizar();
    }
  },

  // ── Carga inicial de catálogo desde servidor ─────────
  async cargarCatalogo() {
    if (!this.estaOnline()) {
      console.log('[SYNC] Sin conexión — usando catálogo local');
      return;
    }
    try {
      const [clientes, plantillas, empleados] = await Promise.all([
        API.getClientes(),
        API.getPlantillas(),
        API.getEmpleados()
      ]);
      await DB.guardarCatalogo('clientes',   clientes);
      await DB.guardarCatalogo('plantillas', plantillas);
      await DB.guardarCatalogo('empleados',  empleados);
      console.log('[SYNC] Catálogo actualizado desde servidor');
    } catch (ex) {
      console.warn('[SYNC] Error actualizando catálogo:', ex.message);
    }
  },

  // ── Cargar inspecciones desde servidor ───────────────
  async cargarInspecciones() {
    if (!this.estaOnline()) return;
    try {
      const inspecciones = await API.getInspecciones();
      for (const ins of inspecciones) {
        await DB.guardarInspeccion({ ...ins, _local: false });
      }
      console.log(`[SYNC] ${inspecciones.length} inspecciones sincronizadas`);
    } catch (ex) {
      console.warn('[SYNC] Error cargando inspecciones:', ex.message);
    }
  }
};
