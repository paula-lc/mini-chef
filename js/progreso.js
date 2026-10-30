// Lógica pura de la Fase 3: peso, plan, ciclo menstrual y entrenos de Hevy.
import { sumarDias, fechaISO } from './dia.js';
import { AJUSTES_POR_DEFECTO } from './repo.js';

export { sumarDias };

const utc = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const diasEntre = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

/* ---------- Peso ---------- */
/** Media de los pesos de los `dias` días que terminan en `fecha` (inclusive). { media, n } */
export function mediaMovil(pesos, fecha, dias = 7) {
  const desde = sumarDias(fecha, -(dias - 1));
  const xs = pesos.filter((p) => p.fecha >= desde && p.fecha <= fecha).map((p) => p.kg);
  return { media: r2(media(xs)), n: xs.length };
}

/** Peso que toca ese día según el plan lineal (recta entre inicio y fin). */
export function pesoPlan(aj, fecha) {
  const a = { ...AJUSTES_POR_DEFECTO, ...aj };
  const total = diasEntre(a.plan_fecha_inicio, a.plan_fecha_fin);
  const t = Math.min(1, Math.max(0, diasEntre(a.plan_fecha_inicio, fecha) / total));
  return r2(a.plan_peso_inicio + (a.plan_peso_fin - a.plan_peso_inicio) * t);
}

/** Ritmo del plan en kg por semana (negativo = bajar). */
export function ritmoPlan(aj) {
  const a = { ...AJUSTES_POR_DEFECTO, ...aj };
  return r2(((a.plan_peso_fin - a.plan_peso_inicio) / diasEntre(a.plan_fecha_inicio, a.plan_fecha_fin)) * 7);
}

/** Dónde estás respecto al plan: media de 7 días, peso previsto, diferencia y ritmo real. */
export function estadoPlan(pesos, aj, fecha) {
  const m = mediaMovil(pesos, fecha);
  const antes = mediaMovil(pesos, sumarDias(fecha, -7));
  const esperado = pesoPlan(aj, fecha);
  return {
    media: m.media, n: m.n, esperado,
    diferencia: m.media == null ? null : r2(m.media - esperado), // >0 = por encima del plan
    ritmo_real: m.media != null && antes.media != null ? r2(m.media - antes.media) : null,
  };
}

/**
 * Sugiere −100 kcal tras 2 semanas planas: las medias de 7 días de las últimas 3 semanas
 * no bajan más de `umbral` kg de una a otra. Necesita ≥3 pesos en cada semana. No sugiere si ya vas
 * por debajo del plan ni hasta 14 días después de la última vez que aplicaste un ajuste.
 * estado: faltan_datos | esperando | adelantada | bien | plana
 */
export function sugerenciaAjuste(pesos, aj, fecha, umbral = 0.1) {
  const a = { ...AJUSTES_POR_DEFECTO, ...aj };
  const w = [0, 7, 14].map((k) => mediaMovil(pesos, sumarDias(fecha, -k)));
  if (w.some((x) => x.n < 3)) return { estado: 'faltan_datos', aplica: false };
  if (a.ajuste_fecha && diasEntre(a.ajuste_fecha, fecha) < 14) return { estado: 'esperando', aplica: false };
  const c1 = r2(w[0].media - w[1].media);
  const c2 = r2(w[1].media - w[2].media);
  const base = { cambios: [c2, c1], medias: w.map((x) => x.media).reverse() };
  if (w[0].media <= pesoPlan(a, fecha)) return { ...base, estado: 'adelantada', aplica: false };
  const plana = c1 > -umbral && c2 > -umbral;
  return { ...base, estado: plana ? 'plana' : 'bien', aplica: plana, kcal: plana ? -100 : 0 };
}

/* ---------- Ciclo menstrual ---------- */
export const FASES = {
  menstrual: { nombre: 'Menstrual', nota: 'El peso puede subir por retención de líquidos sin que sea grasa.' },
  folicular: { nombre: 'Folicular', nota: 'Suele ser la fase con menos retención de líquidos.' },
  ovulacion: { nombre: 'Ovulación', nota: 'Ventana estimada, solo orientativa.' },
  lutea: { nombre: 'Lútea', nota: 'Es habitual retener líquidos y tener más hambre; no te fíes de un día suelto de peso.' },
};

/**
 * Fase del ciclo en `fecha` a partir de las fechas de inicio de la regla.
 * Duración: media de los últimos ciclos registrados (si hay 2+ inicios), si no `durDefault`.
 * La ovulación se estima 14 días antes del siguiente inicio. Devuelve null si no hay inicios.
 */
export function faseCiclo(inicios, fecha, durDefault = 28, diasRegla = 5) {
  const orden = [...new Set(inicios)].sort();
  const previos = orden.filter((d) => d <= fecha);
  if (!previos.length) return null;
  const ultimo = previos[previos.length - 1];
  const gaps = [];
  for (let i = 1; i < orden.length; i++) {
    const g = diasEntre(orden[i - 1], orden[i]);
    if (g >= 20 && g <= 45) gaps.push(g);
  }
  const L = gaps.length ? Math.round(media(gaps.slice(-3))) : durDefault;
  const bruto = diasEntre(ultimo, fecha) + 1;
  const dia = ((bruto - 1) % L) + 1;
  const ov = L - 14;
  const fase = dia <= diasRegla ? 'menstrual' : Math.abs(dia - ov) <= 1 ? 'ovulacion' : dia < ov ? 'folicular' : 'lutea';
  return {
    fase, dia, duracion: L, proyectado: bruto > L,
    proxima: sumarDias(ultimo, L * (Math.floor((bruto - 1) / L) + 1)),
  };
}

/* ---------- Hevy ---------- */
/** CSV con comillas → filas de objetos (cabecera en la primera línea). */
export function parseCSV(texto) {
  const filas = [];
  let f = []; let c = ''; let q = false;
  const t = texto.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { f.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      f.push(c); c = '';
      if (f.length > 1 || f[0] !== '') filas.push(f);
      f = [];
    } else c += ch;
  }
  if (c !== '' || f.length) { f.push(c); filas.push(f); }
  const [cab, ...resto] = filas;
  return resto.map((r) => Object.fromEntries(cab.map((k, i) => [k.trim(), (r[i] ?? '').trim()])));
}

const MESES = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
/** "30 Oct 2026, 18:30" (Hevy) o ISO → Date local, o null. */
export function fechaHevy(s) {
  const m = /^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})(?:,? (\d{1,2}):(\d{2}))?/.exec(s || '');
  if (m && MESES[m[2].toLowerCase()] != null) return new Date(+m[3], MESES[m[2].toLowerCase()], +m[1], +(m[4] || 0), +(m[5] || 0));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const LB = 0.45359237;
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isNaN(n) ? null : n; };

/** Filas del CSV de Hevy → entrenos { id, fecha, titulo, duracion_min, ejercicios:[{nombre, series:[{tipo,kg,reps,rpe}]}] }. */
export function importarHevy(texto) {
  const filas = parseCSV(texto);
  if (!filas.length || !('exercise_title' in filas[0]) || !('start_time' in filas[0])) {
    throw new Error('No parece un CSV exportado de Hevy (faltan las columnas exercise_title y start_time)');
  }
  const mapa = new Map();
  for (const r of filas) {
    const inicio = fechaHevy(r.start_time);
    if (!inicio) continue;
    const id = `hevy-${r.start_time}-${r.title}`;
    if (!mapa.has(id)) {
      const fin = fechaHevy(r.end_time);
      mapa.set(id, {
        id, fecha: fechaISO(inicio), titulo: r.title || 'Entreno',
        duracion_min: fin && fin > inicio ? Math.round((fin - inicio) / 60000) : null, ejercicios: [],
      });
    }
    const w = mapa.get(id);
    let ej = w.ejercicios.find((e) => e.nombre === r.exercise_title);
    if (!ej) w.ejercicios.push((ej = { nombre: r.exercise_title, series: [] }));
    const kg = num(r.weight_kg) ?? (num(r.weight_lbs) != null ? Math.round(num(r.weight_lbs) * LB * 10) / 10 : null);
    ej.series.push({ tipo: r.set_type || 'normal', kg, reps: num(r.reps), rpe: num(r.rpe) });
  }
  return [...mapa.values()];
}

/** 1RM estimado (Epley). null sin peso o con más de 12 reps (poco fiable). */
export function e1rm(kg, reps) {
  if (!(kg > 0) || !(reps > 0) || reps > 12) return null;
  return Math.round(reps === 1 ? kg : kg * (1 + reps / 30));
}

/** Por ejercicio: historial (una fila por entreno con mejor e1RM, mejor serie y volumen) sin series de calentamiento. */
export function progresoFuerza(entrenos) {
  const por = new Map();
  for (const w of [...entrenos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    for (const ej of w.ejercicios) {
      const utiles = ej.series.filter((s) => s.tipo !== 'warmup');
      if (!utiles.length) continue;
      let mejor = null;
      let volumen = 0;
      for (const s of utiles) {
        volumen += (s.kg || 0) * (s.reps || 0);
        const e = e1rm(s.kg, s.reps);
        if (e != null && (!mejor || e > mejor.e1rm)) mejor = { e1rm: e, kg: s.kg, reps: s.reps };
      }
      if (!por.has(ej.nombre)) por.set(ej.nombre, []);
      por.get(ej.nombre).push({ fecha: w.fecha, mejor, volumen: Math.round(volumen), series: utiles.length });
    }
  }
  return por;
}

/** ¿Hay algún entreno ese día? */
export const entrenoEl = (entrenos, fecha) => entrenos.find((w) => w.fecha === fecha) ?? null;
