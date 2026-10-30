// Capa de datos aislada. La UI solo habla con este módulo (API asíncrona),
// así que cambiar localStorage por Supabase = escribir otro "adaptador" con
// la misma interfaz: { leer(col) , escribir(col, filas) }.

export const COLECCIONES = ['productos', 'recetas']; // las que trae la semilla
export const COLECCIONES_USUARIO = ['registros', 'plantillas', 'pesos', 'entrenos', 'listas', 'inventario', 'gastos']; // solo las crea la usuaria
export const AJUSTES_POR_DEFECTO = {
  multiplicador_pareja: 1.6, kcal_tupper: 550, personas: ['Paula', 'Rakan'],
  // objetivos diarios (Fase 2)
  kcal_entreno: 1650, kcal_descanso: 1450, kcal_mantenimiento: 1850, sueno_min_h: 6,
  proteina_min: 125, grasa_min: 45, grasa_max: 55,
  // plan de peso y ciclo (Fase 3)
  plan_fecha_inicio: '2026-10-30', plan_peso_inicio: 62.55, plan_fecha_fin: '2026-12-29', plan_peso_fin: 59,
  ajuste_kcal: 0, ajuste_fecha: null, // ajuste acumulado a entreno/descanso (p. ej. −100) y cuándo se aplicó el último
  ciclo_inicios: [], ciclo_duracion: 28,
  // compra (Fase 4)
  presupuesto_mensual: 520, tupper_aviso_dias: 60,
};

/** Adaptador localStorage (con respaldo en memoria si no está disponible). */
export function adaptadorLocal(prefijo = 'minichef:v1:') {
  const mem = new Map();
  const ls = (() => {
    try {
      const t = '__t';
      globalThis.localStorage.setItem(t, '1');
      globalThis.localStorage.removeItem(t);
      return globalThis.localStorage;
    } catch {
      return null;
    }
  })();
  return {
    persistente: !!ls,
    async leer(col) {
      const raw = ls ? ls.getItem(prefijo + col) : mem.get(col);
      return raw ? JSON.parse(raw) : null;
    },
    async escribir(col, valor) {
      const raw = JSON.stringify(valor);
      if (ls) ls.setItem(prefijo + col, raw);
      else mem.set(col, raw);
    },
  };
}

/** Adaptador en memoria (tests). */
export function adaptadorMemoria() {
  const m = new Map();
  return {
    persistente: false,
    async leer(col) { return m.has(col) ? structuredClone(m.get(col)) : null; },
    async escribir(col, v) { m.set(col, structuredClone(v)); },
  };
}

export const nuevoId = (prefijo = '') =>
  prefijo + (globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10));

export const slug = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function crearRepo(adaptador) {
  const ahora = () => new Date().toISOString();

  const filas = async (col) => (await adaptador.leer(col)) ?? [];

  return {
    persistente: adaptador.persistente,

    async listar(col) {
      return filas(col);
    },
    async obtener(col, id) {
      return (await filas(col)).find((f) => f.id === id) ?? null;
    },
    async guardar(col, obj) {
      const todas = await filas(col);
      const i = todas.findIndex((f) => f.id === obj.id);
      const fila = { ...obj, actualizado: ahora() };
      if (!fila.id) fila.id = nuevoId();
      if (i >= 0) todas[i] = fila;
      else todas.push({ creado: fila.actualizado, ...fila });
      await adaptador.escribir(col, todas);
      return fila;
    },
    async borrar(col, id) {
      await adaptador.escribir(col, (await filas(col)).filter((f) => f.id !== id));
    },

    async ajustes() {
      return { ...AJUSTES_POR_DEFECTO, ...((await adaptador.leer('ajustes')) ?? {}) };
    },
    async guardarAjustes(a) {
      await adaptador.escribir('ajustes', { ...(await this.ajustes()), ...a });
    },

    /**
     * Carga la semilla. Sin `soloFaltantes` solo actúa si la colección está vacía/no existe;
     * con `soloFaltantes` añade los ids que falten sin tocar lo que ya editaste.
     * Devuelve cuántos elementos añadió.
     */
    async sembrar(semilla, { soloFaltantes = false } = {}) {
      let añadidos = 0;
      for (const col of COLECCIONES) {
        const nuevos = semilla[col] ?? [];
        const actuales = await adaptador.leer(col);
        if (actuales === null) {
          await adaptador.escribir(col, nuevos);
          añadidos += nuevos.length;
        } else if (soloFaltantes) {
          const ids = new Set(actuales.map((f) => f.id));
          const faltan = nuevos.filter((f) => !ids.has(f.id));
          if (faltan.length) await adaptador.escribir(col, [...actuales, ...faltan]);
          añadidos += faltan.length;
        }
      }
      return añadidos;
    },

    /** Copia de seguridad completa en JSON. */
    async exportar() {
      return {
        app: 'mini-chef',
        version: 1,
        exportado: ahora(),
        ajustes: await this.ajustes(),
        productos: await filas('productos'),
        recetas: await filas('recetas'),
        registros: await filas('registros'),
        plantillas: await filas('plantillas'),
        pesos: await filas('pesos'),
        entrenos: await filas('entrenos'),
        listas: await filas('listas'),
        inventario: await filas('inventario'),
        gastos: await filas('gastos'),
      };
    },
    /** Restaura una copia (reemplaza todo). Lanza Error si el archivo no es válido. */
    async importar(datos) {
      if (!datos || datos.app !== 'mini-chef' || !Array.isArray(datos.productos) || !Array.isArray(datos.recetas)) {
        throw new Error('El archivo no es una copia de Mini-chef');
      }
      await adaptador.escribir('productos', datos.productos);
      await adaptador.escribir('recetas', datos.recetas);
      // Las copias de la Fase 1 no traen registros/plantillas: en ese caso se conservan los actuales.
      for (const col of COLECCIONES_USUARIO) if (Array.isArray(datos[col])) await adaptador.escribir(col, datos[col]);
      if (datos.ajustes) await adaptador.escribir('ajustes', datos.ajustes);
      return {
        productos: datos.productos.length, recetas: datos.recetas.length,
        registros: datos.registros?.length ?? 0, plantillas: datos.plantillas?.length ?? 0,
        pesos: datos.pesos?.length ?? 0, entrenos: datos.entrenos?.length ?? 0,
        inventario: datos.inventario?.length ?? 0, gastos: datos.gastos?.length ?? 0,
      };
    },
  };
}
