// ============================================================
//  FIELDOC — api.js
//  Capa de comunicación con Google Apps Script
//  Versión·A · v1.0
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbx7KY_f6UVyvaDuWho8rXiiuJZLmPbw2b24rOAHYo74JDLGpn8DmJkb4F3et1WCX5hjHQ/exec';

const API = {

  async get(action, params = {}) {
    const qs  = new URLSearchParams({ action, ...params }).toString();
    const res = await fetch(`${API_URL}?${qs}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    return json.data;
  },

  async post(action, data = {}) {
    const res = await fetch(API_URL, {
      method: 'POST',
      body:   JSON.stringify({ action, ...data })
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    return json.data;
  },

  // ── Métodos específicos ──────────────────────────────

  getClientes()              { return this.get('getclientes'); },
  getPlantillas()            { return this.get('getplantillas'); },
  getEmpleados()             { return this.get('getempleados'); },
  getPreguntas(id_plantilla) { return this.get('getpreguntas', { id_plantilla }); },
  getInspecciones()          { return this.get('getinspecciones'); },
  getRespuestas(id)          { return this.get('getrespuestas', { id_inspeccion: id }); },
  getArchivos(id)            { return this.get('getarchivos',   { id_inspeccion: id }); },

  crearInspeccion(data)          { return this.post('crearinspeccion',  data); },
  actualizarEstado(data)         { return this.post('actualizarestado', data); },
  actualizarCabecera(data)       { return this.post('actualizarcabecera', data); },
  guardarRespuesta(data)         { return this.post('guardarrespuesta', data); },
  subirArchivo(data)             { return this.post('subirarchivo',     data); },
  eliminarArchivo(data)          { return this.post('eliminararchivo',  data); },
  eliminarInspeccion(data)       { return this.post('eliminarinspeccion', data); },
  getRespuestasByInspeccion(id)  { return this.get('getrespuestasbyinspeccion', { id_inspeccion: id }); },

  // ── Conversión blob a base64 para subida ─────────────
  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
};
