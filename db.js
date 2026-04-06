// ============================================================
//  FIELDOC — db.js
//  Gestión de IndexedDB — base de datos local offline
//  Versión·A · v1.0
// ============================================================

const DB_NAME    = 'fieldoc';
const DB_VERSION = 1;

// ── Definición de almacenes ──────────────────────────────
const STORES = {
  INSPECCIONES: 'inspecciones',
  RESPUESTAS:   'respuestas',
  ARCHIVOS:     'archivos',
  BLOBS:        'blobs',
  SYNC_QUEUE:   'sync_queue',
  CATALOGO:     'catalogo',   // clientes, plantillas, preguntas
};

// ── Abrir / crear la base de datos ──────────────────────
function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;

      // Inspecciones
      if (!db.objectStoreNames.contains(STORES.INSPECCIONES)) {
        const s = db.createObjectStore(STORES.INSPECCIONES, { keyPath: 'id' });
        s.createIndex('estado',      'estado',      { unique: false });
        s.createIndex('id_cliente',  'id_cliente',  { unique: false });
        s.createIndex('id_plantilla','id_plantilla',{ unique: false });
      }

      // Respuestas
      if (!db.objectStoreNames.contains(STORES.RESPUESTAS)) {
        const s = db.createObjectStore(STORES.RESPUESTAS, { keyPath: 'id' });
        s.createIndex('id_inspeccion', 'id_inspeccion', { unique: false });
        s.createIndex('id_pregunta',   'id_pregunta',   { unique: false });
      }

      // Archivos (metadatos)
      if (!db.objectStoreNames.contains(STORES.ARCHIVOS)) {
        const s = db.createObjectStore(STORES.ARCHIVOS, { keyPath: 'id' });
        s.createIndex('id_respuesta',  'id_respuesta',  { unique: false });
        s.createIndex('id_inspeccion', 'id_inspeccion', { unique: false });
      }

      // Blobs (binario de audio y foto)
      if (!db.objectStoreNames.contains(STORES.BLOBS)) {
        db.createObjectStore(STORES.BLOBS, { keyPath: 'id' });
      }

      // Cola de sincronización
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const s = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
        s.createIndex('tipo',      'tipo',      { unique: false });
        s.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Catálogo (clientes, plantillas, preguntas — datos de referencia)
      if (!db.objectStoreNames.contains(STORES.CATALOGO)) {
        db.createObjectStore(STORES.CATALOGO, { keyPath: 'clave' });
      }
    };

    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Utilidad: transacción genérica ───────────────────────
function tx(db, stores, modo, fn) {
  return new Promise((resolve, reject) => {
    const t   = db.transaction(stores, modo);
    const res = fn(t);
    t.oncomplete = () => resolve(res);
    t.onerror    = e  => reject(e.target.error);
    t.onabort    = e  => reject(e.target.error);
  });
}

// ── Utilidad: get / put / delete / getAll por store ──────
function dbGet(db, store, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly')
                  .objectStore(store).get(key);
    req.onsuccess = e => resolve(e.target.result || null);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbPut(db, store, obj) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite')
                  .objectStore(store).put(obj);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbDelete(db, store, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite')
                  .objectStore(store).delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror   = e  => reject(e.target.error);
  });
}

function dbGetAll(db, store) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly')
                  .objectStore(store).getAll();
    req.onsuccess = e => resolve(e.target.result || []);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbGetByIndex(db, store, index, value) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly')
                  .objectStore(store)
                  .index(index)
                  .getAll(value);
    req.onsuccess = e => resolve(e.target.result || []);
    req.onerror   = e => reject(e.target.error);
  });
}

// ════════════════════════════════════════════════════════
//  API pública del módulo DB
// ════════════════════════════════════════════════════════
const DB = {

  _db: null,

  async init() {
    this._db = await abrirDB();
    console.log('[DB] IndexedDB lista');
  },

  // ── Catálogo (datos de referencia) ──────────────────
  async guardarCatalogo(clave, datos) {
    await dbPut(this._db, STORES.CATALOGO, { clave, datos, ts: Date.now() });
  },

  async getCatalogo(clave) {
    const item = await dbGet(this._db, STORES.CATALOGO, clave);
    return item ? item.datos : null;
  },

  // ── Inspecciones ─────────────────────────────────────
  async guardarInspeccion(ins) {
    await dbPut(this._db, STORES.INSPECCIONES, ins);
  },

  async getInspeccion(id) {
    return await dbGet(this._db, STORES.INSPECCIONES, id);
  },

  async getInspecciones() {
    return await dbGetAll(this._db, STORES.INSPECCIONES);
  },

  async actualizarEstadoInspeccion(id, estado) {
    const ins = await this.getInspeccion(id);
    if (!ins) throw new Error('Inspección no encontrada: ' + id);
    ins.estado = estado;
    await dbPut(this._db, STORES.INSPECCIONES, ins);
  },

  // ── Respuestas ───────────────────────────────────────
  async guardarRespuesta(resp) {
    await dbPut(this._db, STORES.RESPUESTAS, resp);
  },

  async getRespuesta(id) {
    return await dbGet(this._db, STORES.RESPUESTAS, id);
  },

  async getRespuestasByInspeccion(idInspeccion) {
    const todas = await dbGetByIndex(
      this._db, STORES.RESPUESTAS, 'id_inspeccion', idInspeccion
    );
    return todas.sort((a, b) => a.orden_global - b.orden_global);
  },

  async getRespuestaByPregunta(idInspeccion, idPregunta) {
    const todas = await this.getRespuestasByInspeccion(idInspeccion);
    return todas.find(r => r.id_pregunta === idPregunta) || null;
  },

  // ── Archivos (metadatos) ─────────────────────────────
  async guardarArchivoMeta(meta) {
    await dbPut(this._db, STORES.ARCHIVOS, meta);
  },

  async getArchivosByRespuesta(idRespuesta) {
    const todos = await dbGetByIndex(
      this._db, STORES.ARCHIVOS, 'id_respuesta', idRespuesta
    );
    return todos.sort((a, b) => a.num_orden - b.num_orden);
  },

  async getArchivosByInspeccion(idInspeccion) {
    return await dbGetByIndex(
      this._db, STORES.ARCHIVOS, 'id_inspeccion', idInspeccion
    );
  },

  async eliminarArchivo(id) {
    await dbDelete(this._db, STORES.ARCHIVOS, id);
    await dbDelete(this._db, STORES.BLOBS, id);
  },

  // ── Blobs (binario de audio/foto) ────────────────────
  async guardarBlob(id, blob) {
    await dbPut(this._db, STORES.BLOBS, { id, blob });
  },

  async getBlob(id) {
    const item = await dbGet(this._db, STORES.BLOBS, id);
    return item ? item.blob : null;
  },

  // ── Cola de sincronización ───────────────────────────
  async encolar(tipo, payload) {
    const op = {
      id:        'Q_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
      tipo,
      payload,
      intentos:  0,
      timestamp: new Date().toISOString()
    };
    await dbPut(this._db, STORES.SYNC_QUEUE, op);
    return op.id;
  },

  async getQueue() {
    const todas = await dbGetAll(this._db, STORES.SYNC_QUEUE);
    return todas.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  },

  async eliminarDeQueue(id) {
    await dbDelete(this._db, STORES.SYNC_QUEUE, id);
  },

  async incrementarIntentos(id) {
    const op = await dbGet(this._db, STORES.SYNC_QUEUE, id);
    if (op) {
      op.intentos++;
      await dbPut(this._db, STORES.SYNC_QUEUE, op);
    }
  },

  async contarPendientes() {
    const q = await this.getQueue();
    return q.length;
  },

  // ── Auxiliares para reconciliación ───────────────────

  // Eliminar una inspección del local (y sus respuestas y archivos)
  async _eliminarInspeccionLocal(id) {
    try {
      // Eliminar respuestas
      const respuestas = await this.getRespuestasByInspeccion(id);
      for (const r of respuestas) {
        // Eliminar archivos de cada respuesta
        const archivos = await this.getArchivosByRespuesta(r.id);
        for (const a of archivos) {
          await dbDelete(this._db, STORES.ARCHIVOS, a.id);
          await dbDelete(this._db, STORES.BLOBS, a.id);
        }
        await dbDelete(this._db, STORES.RESPUESTAS, r.id);
      }
      // Eliminar la inspección
      await dbDelete(this._db, STORES.INSPECCIONES, id);
      console.log('[DB] Eliminado local:', id);
    } catch (ex) {
      console.warn('[DB] Error eliminando local:', ex.message);
    }
  },

  // Alias para actualización de estado local (usado por polling de informe)
  async actualizarEstadoLocal(id, estado) {
    return this.actualizarEstadoInspeccion(id, estado);
  },

  // Comprobar si hay operaciones pendientes para una inspección
  async _tienePendientes(idInspeccion) {
    const queue = await this.getQueue();
    return queue.some(op =>
      op.payload && (
        op.payload.id === idInspeccion ||
        op.payload.id_inspeccion === idInspeccion
      )
    );
  }
};
