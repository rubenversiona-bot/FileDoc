// ============================================================
//  FIELDOC — api.js
//  Capa de comunicación con Google Apps Script
//  Versión·A · v1.1 — añadidos métodos de informe IA
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbx7KY_f6UVyvaDuWho8rXiiuJZLmPbw2b24rOAHYo74JDLGpn8DmJkb4F3et1WCX5hjHQ/exec';

const API = {

  async get(action, params = {}) {
    const qs   = new URLSearchParams({ action, ...params }).toString();
    const res  = await fetch(`${API_URL}?${qs}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    return json.data;
  },

  async post(action, data = {}) {
    const res  = await fetch(API_URL, {
      method: 'POST',
      body:   JSON.stringify({ action, ...data })
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    return json.data;
  },

  // ── Lectura ──────────────────────────────────────────
  getClientes()              { return this.get('getclientes'); },
  getPlantillas()            { return this.get('getplantillas'); },
  getEmpleados()             { return this.get('getempleados'); },
  getPreguntas(id_plantilla) { return this.get('getpreguntas', { id_plantilla }); },
  getInspecciones()          { return this.get('getinspecciones'); },
  getRespuestas(id)          { return this.get('getrespuestas',   { id_inspeccion: id }); },
  getArchivos(id)            { return this.get('getarchivos',     { id_inspeccion: id }); },

  // ── Escritura ────────────────────────────────────────
  crearInspeccion(data)      { return this.post('crearinspeccion',   data); },
  actualizarEstado(data)     { return this.post('actualizarestado',  data); },
  guardarRespuesta(data)     { return this.post('guardarrespuesta',  data); },
  subirArchivo(data)         { return this.post('subirarchivo',      data); },
  eliminarArchivo(data)      { return this.post('eliminararchivo',   data); },
  eliminarInspeccion(data)   { return this.post('eliminarinspeccion',data); },

  // ── Informe IA ───────────────────────────────────────

  // Solicita la generación del informe de forma diferida.
  // El backend cambia el estado a "Generando informe" y lanza el trigger.
  // Devuelve: { idInforme, idInspeccion, estado, mensaje }
  solicitarInforme(id_inspeccion) {
    return this.post('solicitarinforme', { id_inspeccion });
  },

  // Consulta el estado actual del informe para una inspección.
  // Devuelve: { estado, url, error, timestamp }
  // estado puede ser: 'sin_informe' | 'pendiente' | 'generado' | 'error'
  getEstadoInforme(id_inspeccion) {
    return this.get('getestadoinforme', { id_inspeccion });
  },

  // ── Utilidades ───────────────────────────────────────

  // Convierte un blob local a base64 para subirlo al servidor
  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
};
