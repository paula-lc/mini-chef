// Cálculos puros (sin DOM ni almacenamiento): macros, tupper, raciones, coste.
// Unidades: gramos y por 100 g, salvo que se diga lo contrario.

export const CAMPOS = ['kcal', 'p', 'c', 'g', 'fibra'];

const cero = () => ({ kcal: 0, p: 0, c: 0, g: 0, fibra: 0, coste: 0, crudo_g: 0 });
const sumar = (a, b, k = 1) => {
  for (const f of [...CAMPOS, 'coste', 'crudo_g']) a[f] += (b[f] || 0) * k;
  return a;
};
const escalar = (a, k) => sumar(cero(), a, k);

export const redondear = (n, d = 1) => {
  const m = 10 ** d;
  return Math.round(n * m) / m;
};

/** kcal estimadas con la convención de etiquetado UE: 4P + 4C + 9G + 2·fibra. */
export function kcalCalculadas(p) {
  return 4 * (p.p || 0) + 4 * (p.c || 0) + 9 * (p.g || 0) + 2 * (p.fibra || 0);
}

/** ¿Cuadran las kcal declaradas con los macros (±10 %, mínimo 3 kcal)? */
export function validarKcal(p) {
  const base = kcalCalculadas(p);
  const tol = Math.max(0.1 * base, 3);
  let ok = Math.abs(p.kcal - base) <= tol;
  // Si la etiqueta no declara fibra, la diferencia puede venir de ella.
  if (!ok && (p.fibra === null || p.fibra === undefined)) {
    ok = p.kcal >= base - tol && p.kcal <= base + tol + 2 * (p.c || 0);
  }
  return { ok, calculadas: Math.round(base) };
}

/** €/kg de un producto: precio sobre el peso útil (escurrido si existe, si no el envase). */
export function eurKg(prod) {
  if (prod.eur_kg != null) return prod.eur_kg;
  const util = prod.escurrido_g || prod.envase_g;
  return util ? prod.precio / (util / 1000) : null;
}

/** Macros y coste de `gramos` de un producto (crudo, o cocinado si hay rendimiento). */
export function macrosProducto(prod, gramos, modo = 'crudo') {
  let crudo = gramos;
  const avisos = [];
  if (modo === 'cocinado') {
    if (prod.rendimiento > 0) crudo = gramos / prod.rendimiento;
    else avisos.push(`"${prod.nombre}" no tiene rendimiento de cocción: se usa el peso tal cual`);
  }
  const f = crudo / 100;
  const kg = eurKg(prod);
  if (kg == null) avisos.push(`"${prod.nombre}" no tiene precio`);
  return {
    kcal: (prod.kcal || 0) * f,
    p: (prod.p || 0) * f,
    c: (prod.c || 0) * f,
    g: (prod.g || 0) * f,
    fibra: (prod.fibra || 0) * f,
    coste: kg ? (crudo / 1000) * kg : 0,
    crudo_g: crudo,
    avisos,
  };
}

/**
 * Totales de una receta. `ctx` = { producto(id), receta(id) } (devuelven objeto o undefined).
 * Un ingrediente que es otra receta se pesa en gramos COCINADOS de esa receta.
 * Devuelve { total, escala, lineas, avisos } donde `escala` suma solo los ingredientes
 * marcados escala_pareja (los que Rakan toma en mayor cantidad).
 */
export function totalesReceta(receta, ctx, pila = []) {
  const total = cero();
  const escala = cero();
  const lineas = [];
  const avisos = [];
  if (pila.includes(receta.id)) {
    return { total, escala, lineas, avisos: [`Ciclo: "${receta.nombre}" se contiene a sí misma`] };
  }
  for (const ing of receta.ingredientes || []) {
    const gramos = Number(ing.gramos) || 0;
    let m;
    let nombre;
    let rendimiento = null;
    if (ing.ref_tipo === 'receta') {
      const sub = ctx.receta(ing.ref_id);
      if (!sub) {
        avisos.push(`Falta la receta "${ing.ref_id}"`);
        continue;
      }
      nombre = sub.nombre;
      const t = totalesReceta(sub, ctx, [...pila, receta.id]);
      avisos.push(...t.avisos);
      if (!(sub.peso_cocinado_g > 0)) {
        avisos.push(`"${sub.nombre}" no tiene peso cocinado: no se pueden calcular sus macros por gramo`);
        m = cero();
        m.crudo_g = gramos;
      } else {
        m = escalar(t.total, gramos / sub.peso_cocinado_g);
        m.crudo_g = gramos;
      }
    } else {
      const prod = ctx.producto(ing.ref_id);
      if (!prod) {
        avisos.push(`Falta el producto "${ing.ref_id}"`);
        continue;
      }
      nombre = prod.nombre;
      rendimiento = prod.rendimiento || null;
      const r = macrosProducto(prod, gramos, ing.modo || 'crudo');
      avisos.push(...r.avisos);
      m = r;
    }
    sumar(total, m);
    if (ing.escala_pareja) sumar(escala, m);
    lineas.push({ ing, nombre, gramos, macros: m, rendimiento });
  }
  return { total, escala, lineas, avisos };
}

/** Macros/coste por gramo de cocinado, o null si no hay peso cocinado. */
export function porGramoCocinado(receta, total) {
  const T = receta.peso_cocinado_g;
  if (!(T > 0)) return null;
  return escalar(total, 1 / T);
}

/**
 * Raciones para Paula y Rakan a partir del peso cocinado.
 *  - modo 'kcal': el tupper de Paula debe aportar `kcal`.
 *  - modo 'raciones': la olla se reparte en `n` tuppers iguales.
 * Rakan toma el mismo tupper y, aparte, (mult-1)× la cantidad de cada ingrediente
 * marcado escala_pareja que lleva ese tupper (misma proteína, más hidrato).
 */
export function calcularRaciones(receta, tot, { modo, kcal, n, mult = 1.6 }) {
  const T = receta.peso_cocinado_g;
  if (!(T > 0)) return null;
  const pg = porGramoCocinado(receta, tot.total);
  let G;
  if (modo === 'kcal') {
    if (!(pg.kcal > 0) || !(kcal > 0)) return null;
    G = kcal / pg.kcal;
  } else {
    if (!(n > 0)) return null;
    G = T / n;
  }
  const phi = G / T;
  const paula = escalar(tot.total, phi);
  const extraMacros = escalar(tot.escala, phi * (mult - 1));
  const rakan = sumar(escalar(paula, 1), extraMacros);
  const extras = tot.lineas
    .filter((l) => l.ing.escala_pareja)
    .map((l) => ({
      nombre: l.nombre,
      modo: l.ing.ref_tipo === 'receta' ? 'cocinado' : l.ing.modo || 'crudo',
      gramos: l.gramos * phi * (mult - 1),
      cocinado_g: l.rendimiento && !(l.ing.modo === 'cocinado') && l.ing.ref_tipo !== 'receta' ? l.gramos * phi * (mult - 1) * l.rendimiento : null,
    }));
  return {
    gramos_tupper: G,
    raciones_equivalentes: T / G,
    paula: { ...paula, gramos: G },
    rakan: { ...rakan, gramos: G, extra: extraMacros, extras },
  };
}

/** Atajo: totales + por gramo + raciones. */
export function resumenReceta(receta, ctx, opciones) {
  const tot = totalesReceta(receta, ctx);
  return {
    ...tot,
    porGramo: porGramoCocinado(receta, tot.total),
    raciones: opciones ? calcularRaciones(receta, tot, opciones) : null,
  };
}
