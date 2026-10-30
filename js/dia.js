// Lógica pura del registro diario (sin DOM ni almacenamiento): objetivos, totales, plantillas.
import { macrosProducto, totalesReceta, porGramoCocinado, redondear, esIndividual } from './calc.js';
import { AJUSTES_POR_DEFECTO, nuevoId } from './repo.js';

export const COMIDAS = [
  ['desayuno', 'Desayuno'], ['comida', 'Comida'], ['merienda', 'Merienda'], ['cena', 'Cena'], ['otro', 'Otros'],
];
export const NOMBRE_COMIDA = Object.fromEntries(COMIDAS);

const MACROS = ['kcal', 'p', 'c', 'g', 'fibra', 'coste'];
const r1 = (n) => redondear(n || 0, 1);

/* ---------- Fechas (siempre en hora local, formato AAAA-MM-DD) ---------- */
export function fechaISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function sumarDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return fechaISO(new Date(y, m - 1, d + n));
}
export function fechaLarga(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

/* ---------- Objetivos ---------- */
/**
 * Objetivo del día. Si durmió menos de `sueno_min_h` horas, manda el mantenimiento;
 * si no, entreno o descanso. Proteína: mínimo. Grasa: rango. Hidratos: lo que sobre
 * tomando la mitad del rango de grasa.
 */
export function objetivosDia({ entrena = false, sueno_h = null } = {}, ajustes = {}) {
  const a = { ...AJUSTES_POR_DEFECTO, ...ajustes };
  const pocoSueno = sueno_h != null && sueno_h < a.sueno_min_h;
  const motivo = pocoSueno ? 'sueno' : entrena ? 'entreno' : 'descanso';
  // El ajuste del plan (p. ej. −100) se aplica a entreno y descanso, no al mantenimiento por poco sueño.
  const kcal = {
    sueno: a.kcal_mantenimiento, entreno: a.kcal_entreno + a.ajuste_kcal, descanso: a.kcal_descanso + a.ajuste_kcal,
  }[motivo];
  const gMedia = (a.grasa_min + a.grasa_max) / 2;
  return {
    motivo, kcal,
    p_min: a.proteina_min,
    g_min: a.grasa_min, g_max: a.grasa_max,
    c: Math.max(0, Math.round((kcal - 4 * a.proteina_min - 9 * gMedia) / 4)),
  };
}

/* ---------- Entradas ---------- */
/**
 * Macros de una entrada ya definida. Tipos:
 *  - receta: `gramos` cocinados de esa receta (necesita peso_cocinado_g).
 *  - producto: `gramos` en crudo o cocinado (`modo`).
 *  - libre: macros escritos a mano en `libre`.
 * Devuelve null si no se puede calcular (receta/producto borrado o sin peso cocinado).
 */
export function macrosEntrada(e, ctx) {
  let m;
  if (e.tipo === 'libre') {
    m = { ...e.libre };
  } else if (e.tipo === 'producto') {
    const p = ctx.producto(e.ref_id);
    if (!p || !(e.gramos > 0)) return null;
    m = macrosProducto(p, e.gramos, e.modo || 'crudo');
  } else if (e.tipo === 'receta') {
    const r = ctx.receta(e.ref_id);
    if (!r) return null;
    // Una receta cuyos ingredientes ya no existen daría 0 kcal en silencio: mejor rechazarla.
    const malos = (t) => t.avisos.length && !(t.total.kcal > 0);
    // Con `ingredientes` propios (receta de una ración editada ese día) se usan en lugar de los de la receta.
    const tot = totalesReceta(e.ingredientes ? { id: r.id, nombre: r.nombre, ingredientes: e.ingredientes } : r, ctx);
    if (malos(tot)) return null;
    if (e.ingredientes) {
      m = Object.fromEntries(MACROS.map((k) => [k, (tot.total[k] || 0) * (e.raciones > 0 ? e.raciones : 1)]));
    } else if (esIndividual(r) && e.raciones > 0) {
      // receta de una sola ración: se cuenta en raciones, no en gramos
      m = Object.fromEntries(MACROS.map((k) => [k, (tot.total[k] || 0) * e.raciones]));
    } else {
      if (!(e.gramos > 0)) return null;
      const pg = porGramoCocinado(r, tot.total);
      if (!pg) return null;
      m = Object.fromEntries(MACROS.map((k) => [k, (pg[k] || 0) * e.gramos]));
    }
    // Extras añadidos a la ración (un huevo, más queso…): se suman a lo anterior.
    if (e.extras?.length) {
      const x = totalesReceta({ id: `${r.id}+extras`, nombre: 'extras', ingredientes: e.extras }, ctx);
      if (malos(x)) return null;
      for (const k of MACROS) m[k] = (m[k] || 0) + (x.total[k] || 0);
    }
  } else {
    return null;
  }
  return Object.fromEntries(MACROS.map((k) => [k, r1(m[k])]));
}

/** Entrada lista para guardar: calcula y congela los macros del momento (el historial no cambia si luego editas la receta). */
export function crearEntrada({ comida = 'comida', tipo, ref_id, gramos, raciones, modo, nombre, libre, ingredientes, extras }, ctx) {
  const base = { comida, tipo, ref_id: ref_id ?? null, gramos: gramos ?? null, raciones: raciones ?? null, modo: modo ?? null, libre: libre ?? null, ingredientes: ingredientes ?? null, extras: extras ?? null };
  base.nombre = nombre || (tipo === 'receta' ? ctx.receta(ref_id)?.nombre : ctx.producto(ref_id)?.nombre) || 'Sin nombre';
  const macros = macrosEntrada(base, ctx);
  if (!macros) throw new Error(`No se pueden calcular los macros de "${base.nombre}"`);
  return { id: nuevoId('e'), ...base, macros };
}

/* ---------- Totales y estado ---------- */
export function totalesDia(entradas = []) {
  const t = Object.fromEntries(MACROS.map((k) => [k, 0]));
  for (const e of entradas) for (const k of MACROS) t[k] += e.macros?.[k] || 0;
  return Object.fromEntries(MACROS.map((k) => [k, r1(t[k])]));
}

/** Compara lo comido con el objetivo. */
export function estadoDia(totales, obj) {
  return {
    kcal_restantes: Math.round(obj.kcal - totales.kcal),
    p_falta: Math.max(0, r1(obj.p_min - totales.p)),
    p_ok: totales.p >= obj.p_min,
    g_estado: totales.g < obj.g_min ? 'bajo' : totales.g > obj.g_max ? 'alto' : 'ok',
    c_restantes: Math.round(obj.c - totales.c),
  };
}

/* ---------- Plantillas ---------- */
/** ámbito 'dia' (varias comidas) o 'comida' (una sola; se puede aplicar a cualquier comida). */
export function crearPlantilla(nombre, entradas, ambito = 'dia') {
  return {
    id: nuevoId('t'), nombre, ambito,
    entradas: entradas.map(({ comida, tipo, ref_id, gramos, raciones, modo, nombre: n, libre, ingredientes, extras }) => ({ comida, tipo, ref_id, gramos, raciones, modo, nombre: n, libre, ingredientes, extras })),
  };
}

/**
 * Entradas nuevas a partir de una plantilla, recalculadas con los datos actuales.
 * `comida` fuerza la comida de destino (para plantillas de ámbito 'comida').
 * Devuelve { entradas, omitidas } (omitidas = nombres cuyo producto/receta ya no existe).
 */
export function aplicarPlantilla(plantilla, ctx, { comida } = {}) {
  const entradas = [];
  const omitidas = [];
  for (const e of plantilla.entradas) {
    try {
      entradas.push(crearEntrada({ ...e, comida: comida || e.comida }, ctx));
    } catch {
      omitidas.push(e.nombre);
    }
  }
  return { entradas, omitidas };
}
