// Sincronización entre dispositivos con Supabase (API REST + Auth, sin librerías).
//
// Los datos siguen viviendo primero en el dispositivo (así la app funciona sin conexión).
// Cada cambio se apunta en una cola y se sube en cuanto hay conexión; al abrir la app y al
// volver a ella se bajan los cambios de los demás dispositivos. Gana el cambio más reciente
// de cada elemento (por su campo `actualizado`); los borrados viajan como "lápidas".
//
// Tabla remota `filas` (ver docs/supabase.sql): una fila por elemento, protegida por RLS.

export const COLECCIONES_SYNC = ['productos', 'recetas', 'registros', 'plantillas', 'pesos', 'entrenos', 'listas', 'inventario', 'gastos'];
const CLAVE_ESTADO = '_sync';
const LOTE = 200;
const t = (s) => Date.parse(s) || 0;

export function crearSync({
  adaptador,
  fetchFn = (...a) => globalThis.fetch(...a),
  ahora = () => new Date().toISOString(),
  alBajar = async () => {},
  programar = (fn, ms) => setTimeout(fn, ms),
  enLinea = () => globalThis.navigator?.onLine !== false,
} = {}) {
  let est = null; // estado persistente: config, sesion, cola, cursor, ultima, error
  let enCurso = null;
  let pendienteTimer = null;

  const cargarEst = async () => {
    if (!est) est = { config: null, sesion: null, cola: [], cursor: null, ultima: null, error: null, ...((await adaptador.leer(CLAVE_ESTADO)) ?? {}) };
    return est;
  };
  const guardarEst = () => adaptador.escribir(CLAVE_ESTADO, est);

  /* ---------- HTTP con renovación de sesión ---------- */
  async function http(ruta, { method = 'GET', cuerpo, cabeceras = {}, auth = true } = {}) {
    await cargarEst();
    if (!est.config) throw new Error('Falta la conexión con Supabase');
    const { url, key } = est.config;
    const hacer = () => fetchFn(url.replace(/\/$/, '') + ruta, {
      method,
      headers: { apikey: key, Authorization: `Bearer ${auth && est.sesion ? est.sesion.access_token : key}`, 'Content-Type': 'application/json', ...cabeceras },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    if (auth && est.sesion && est.sesion.expira < Date.now() / 1000 + 60) await refrescar();
    let r = await hacer();
    if (r.status === 401 && auth && est.sesion) {
      await refrescar();
      r = await hacer();
    }
    return r;
  }

  const guardarSesion = (j) => {
    est.sesion = {
      access_token: j.access_token, refresh_token: j.refresh_token,
      expira: Date.now() / 1000 + (j.expires_in || 3600),
      email: j.user?.email ?? est.sesion?.email, user_id: j.user?.id ?? est.sesion?.user_id,
    };
  };

  async function refrescar() {
    const r = await http('/auth/v1/token?grant_type=refresh_token', { method: 'POST', cuerpo: { refresh_token: est.sesion.refresh_token }, auth: false });
    if (!r.ok) {
      est.sesion = null;
      est.error = 'La sesión ha caducado: vuelve a entrar';
      await guardarEst();
      throw new Error(est.error);
    }
    guardarSesion(await r.json());
    await guardarEst();
  }

  /* ---------- Configuración y sesión ---------- */
  async function configurar({ url, key }) {
    await cargarEst();
    url = String(url || '').trim();
    try { url = new URL(url).origin; } catch { /* se valida justo debajo */ } // acepta también la URL con /rest/v1/ al final
    key = String(key || '').trim();
    if (!/^https?:\/\/.+/.test(url) || key.length < 20) throw new Error('Pon la URL del proyecto (https://…supabase.co) y la clave anon');
    if (est.config?.url !== url) { est.sesion = null; est.cursor = null; est.cola = []; }
    est.config = { url, key };
    await guardarEst();
  }

  /** Código para copiar la conexión a otro dispositivo (URL + clave pública anon; sin contraseñas). */
  async function codigo() {
    await cargarEst();
    return est.config ? btoa(JSON.stringify(est.config)) : null;
  }
  async function usarCodigo(texto) {
    let c;
    try { c = JSON.parse(atob(String(texto).trim())); } catch { throw new Error('Ese código no es válido'); }
    await configurar(c);
  }

  async function entrar(email, password, { registrar = false } = {}) {
    await cargarEst();
    const r = await http(registrar ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', { method: 'POST', cuerpo: { email, password }, auth: false });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.msg || j.error_description || j.message || 'No se pudo entrar');
    if (!j.access_token) throw new Error('Cuenta creada: confirma el email que te han enviado y luego pulsa Entrar');
    guardarSesion(j);
    est.error = null;
    est.cursor = null;
    await guardarEst();
    await subirTodo();
    return sincronizar();
  }

  async function salir() {
    await cargarEst();
    est.sesion = null;
    est.cola = [];
    est.cursor = null;
    await guardarEst();
  }

  async function olvidarProyecto() {
    est = { config: null, sesion: null, cola: [], cursor: null, ultima: null, error: null };
    await guardarEst();
  }

  /* ---------- Cola de cambios locales ---------- */
  async function encolar(col, id, fila, ts = null) {
    est.cola = est.cola.filter((c) => !(c.col === col && c.id === id));
    est.cola.push({ col, id, borrado: fila === null, fila, ts: ts ?? fila?.actualizado ?? ahora() });
    await guardarEst();
  }

  /** La llamará el repositorio tras cada guardado (fila) o borrado (null). */
  async function alCambiar(col, id, fila) {
    await cargarEst();
    if (!est.sesion) return;
    await encolar(col, id, fila);
    clearTimeout(pendienteTimer);
    pendienteTimer = programar(() => sincronizar(), 1500);
  }

  /** Apunta para subir todo lo que ya existe en este dispositivo (primer enlace, o tras restaurar una copia). */
  async function subirTodo() {
    await cargarEst();
    if (!est.sesion) return 0;
    let n = 0;
    for (const col of COLECCIONES_SYNC) {
      for (const f of (await adaptador.leer(col)) ?? []) {
        if (f.actualizado) { await encolar(col, f.id, f); n++; }
      }
    }
    const aj = await adaptador.leer('ajustes');
    if (aj) { await encolar('ajustes', 'ajustes', { ...aj, actualizado: aj.actualizado ?? ahora() }); n++; }
    return n;
  }

  /* ---------- Bajar ---------- */
  async function aplicarRemota(f) {
    const pend = est.cola.find((c) => c.col === f.coleccion && c.id === f.id);
    const tr = t(f.actualizado);
    if (pend && t(pend.ts) >= tr) return false; // lo mío es más nuevo: se subirá
    if (pend) est.cola = est.cola.filter((c) => c !== pend);

    if (f.coleccion === 'ajustes') {
      const loc = await adaptador.leer('ajustes');
      if (loc && t(loc.actualizado) >= tr) return false;
      await adaptador.escribir('ajustes', f.datos);
      return true;
    }
    const filas = (await adaptador.leer(f.coleccion)) ?? [];
    const i = filas.findIndex((x) => x.id === f.id);
    const loc = i >= 0 ? filas[i] : null;
    if (f.borrado) {
      if (!loc || t(loc.actualizado) > tr) return false;
      filas.splice(i, 1);
    } else {
      if (loc && t(loc.actualizado) >= tr) return false;
      if (i >= 0) filas[i] = f.datos; else filas.push(f.datos);
    }
    await adaptador.escribir(f.coleccion, filas);
    return true;
  }

  async function bajar() {
    let n = 0;
    let cursor = est.cursor ? new Date(t(est.cursor) - 2000).toISOString() : null; // 2 s de solape por si acaso
    let op = 'gte';
    for (;;) {
      const filtro = cursor ? `&actualizado=${op}.${encodeURIComponent(cursor)}` : '';
      const r = await http(`/rest/v1/filas?select=coleccion,id,datos,borrado,actualizado&order=actualizado.asc&limit=1000${filtro}`);
      if (!r.ok) throw new Error(`No se pudo bajar (${r.status})`);
      const filas = await r.json();
      for (const f of filas) {
        if (await aplicarRemota(f)) n++;
        cursor = f.actualizado;
        if (!est.cursor || t(f.actualizado) > t(est.cursor)) est.cursor = f.actualizado;
      }
      op = 'gt';
      if (filas.length < 1000) break;
    }
    return n;
  }

  /* ---------- Subir ---------- */
  async function subir() {
    let n = 0;
    while (est.cola.length) {
      const lote = est.cola.slice(0, LOTE);
      const r = await http('/rest/v1/filas?on_conflict=user_id,coleccion,id', {
        method: 'POST',
        cabeceras: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        cuerpo: lote.map((c) => ({ coleccion: c.col, id: c.id, datos: c.borrado ? null : c.fila, borrado: c.borrado, actualizado: c.ts })),
      });
      if (!r.ok) throw new Error(`No se pudo subir (${r.status})`);
      est.cola = est.cola.filter((c) => !lote.includes(c));
      n += lote.length;
    }
    return n;
  }

  /** Baja lo nuevo y sube lo pendiente. Devuelve { bajadas, subidas }, { error } o null si no procede. */
  function sincronizar() {
    if (enCurso) return enCurso;
    enCurso = (async () => {
      try {
        await cargarEst();
        if (!est.sesion || !enLinea()) return null;
        const bajadas = await bajar();
        const subidas = await subir();
        est.ultima = ahora();
        est.error = null;
        await guardarEst();
        if (bajadas) await alBajar();
        return { bajadas, subidas };
      } catch (e) {
        est.error = e.message || String(e);
        await guardarEst();
        return { error: est.error };
      } finally {
        enCurso = null;
      }
    })();
    return enCurso;
  }

  async function estado() {
    await cargarEst();
    return {
      configurado: !!est.config, conectado: !!est.sesion, email: est.sesion?.email ?? null,
      pendientes: est.cola.length, ultima: est.ultima, error: est.error,
    };
  }

  return { configurar, codigo, usarCodigo, entrar, salir, olvidarProyecto, alCambiar, subirTodo, sincronizar, estado };
}
