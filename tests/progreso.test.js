import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mediaMovil, pesoPlan, ritmoPlan, estadoPlan, sugerenciaAjuste, faseCiclo, parseCSV, fechaHevy,
  importarHevy, e1rm, progresoFuerza, diasEntre, sumarDias,
} from '../js/progreso.js';
import { objetivosDia } from '../js/dia.js';

// pesos diarios desde `ini` con función kg(i)
const serie = (ini, n, kg) => Array.from({ length: n }, (_, i) => ({ fecha: sumarDias(ini, i), kg: kg(i) }));

test('media móvil de 7 días y huecos', () => {
  const p = serie('2026-11-01', 7, (i) => 60 + i); // 60..66
  assert.deepEqual(mediaMovil(p, '2026-11-07'), { media: 63, n: 7 });
  assert.equal(mediaMovil(p, '2026-11-09').n, 5); // ventana 3..9 nov → días 3..7
  assert.deepEqual(mediaMovil([], '2026-11-07'), { media: null, n: 0 });
});

test('plan lineal 62,55 → 59 entre 30-oct y 29-dic', () => {
  assert.equal(diasEntre('2026-10-30', '2026-12-29'), 60);
  assert.equal(pesoPlan({}, '2026-10-30'), 62.55);
  assert.equal(pesoPlan({}, '2026-12-29'), 59);
  assert.equal(pesoPlan({}, '2026-11-29'), 60.78); // mitad
  assert.equal(pesoPlan({}, '2026-10-01'), 62.55); // antes del inicio
  assert.equal(pesoPlan({}, '2027-02-01'), 59); // después del fin
  assert.equal(ritmoPlan({}), -0.41);
});

test('estado del plan', () => {
  const p = serie('2026-10-30', 14, () => 62.5);
  const e = estadoPlan(p, {}, '2026-11-12');
  assert.equal(e.media, 62.5);
  assert.equal(e.ritmo_real, 0);
  assert.ok(e.diferencia > 0); // por encima del plan
});

test('sugerencia −100 kcal tras 2 semanas planas', () => {
  const plano = serie('2026-10-30', 21, (i) => 62.5 + (i % 2 ? 0.1 : -0.1));
  const s = sugerenciaAjuste(plano, {}, '2026-11-19');
  assert.equal(s.estado, 'plana');
  assert.equal(s.aplica, true);
  assert.equal(s.kcal, -100);
});

test('no sugiere si bajas, si faltan datos, si vas por debajo del plan o si ajustaste hace poco', () => {
  const baja = serie('2026-10-30', 21, (i) => 62.5 - i * 0.06);
  assert.equal(sugerenciaAjuste(baja, {}, '2026-11-19').estado, 'bien');
  assert.equal(sugerenciaAjuste(serie('2026-11-10', 4, () => 62), {}, '2026-11-19').estado, 'faltan_datos');
  const plano = serie('2026-10-30', 21, () => 62.5);
  assert.equal(sugerenciaAjuste(plano, { ajuste_fecha: '2026-11-10' }, '2026-11-19').estado, 'esperando');
  const bajo = serie('2026-10-30', 21, () => 58); // ya por debajo del plan
  assert.equal(sugerenciaAjuste(bajo, {}, '2026-11-19').estado, 'adelantada');
});

test('el ajuste aplicado baja entreno y descanso, no el mantenimiento', () => {
  const aj = { ajuste_kcal: -100 };
  assert.equal(objetivosDia({ entrena: true }, aj).kcal, 1550);
  assert.equal(objetivosDia({ entrena: false }, aj).kcal, 1350);
  assert.equal(objetivosDia({ sueno_h: 5 }, aj).kcal, 1850);
});

test('fases del ciclo (28 días)', () => {
  const ini = ['2026-10-01'];
  const f = (d) => faseCiclo(ini, d);
  assert.equal(f('2026-09-30'), null);
  assert.deepEqual([f('2026-10-01').fase, f('2026-10-01').dia], ['menstrual', 1]);
  assert.equal(f('2026-10-05').fase, 'menstrual');
  assert.equal(f('2026-10-06').fase, 'folicular');
  assert.equal(f('2026-10-14').fase, 'ovulacion'); // día 14 (ov = 14)
  assert.equal(f('2026-10-17').fase, 'lutea');
  assert.equal(f('2026-10-28').fase, 'lutea');
  assert.equal(f('2026-10-28').proxima, '2026-10-29');
  const proy = f('2026-11-02'); // día 33 → ciclo proyectado, día 5
  assert.deepEqual([proy.proyectado, proy.dia, proy.fase], [true, 5, 'menstrual']);
});

test('duración del ciclo = media de los últimos ciclos', () => {
  const r = faseCiclo(['2026-08-01', '2026-08-31', '2026-09-30'], '2026-10-02'); // ciclos de 30 días
  assert.equal(r.duracion, 30);
  assert.equal(r.proxima, '2026-10-30');
});

test('CSV con comillas, comas y saltos de línea', () => {
  const r = parseCSV('a,b,c\n1,"x, y",3\r\n"l1\nl2","he said ""hi""",\n');
  assert.deepEqual(r[0], { a: '1', b: 'x, y', c: '3' });
  assert.deepEqual(r[1], { a: 'l1\nl2', b: 'he said "hi"', c: '' });
});

test('fechas de Hevy', () => {
  const d = fechaHevy('30 Oct 2026, 18:30');
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [2026, 9, 30, 18, 30]);
  assert.equal(fechaHevy('2026-10-30T18:30:00').getDate(), 30);
  assert.equal(fechaHevy('basura'), null);
});

const CSV = `"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"
"Pierna","30 Oct 2026, 18:00","30 Oct 2026, 19:05","","Sentadilla (Barra)","","",0,"warmup",20,10,"","",""
"Pierna","30 Oct 2026, 18:00","30 Oct 2026, 19:05","","Sentadilla (Barra)","","",1,"normal",50,8,"","",8
"Pierna","30 Oct 2026, 18:00","30 Oct 2026, 19:05","","Sentadilla (Barra)","","",2,"normal",55,6,"","",9
"Pierna","30 Oct 2026, 18:00","30 Oct 2026, 19:05","","Hip Thrust","","",0,"normal",60,10,"","",""
"Empuje","01 Nov 2026, 10:00","01 Nov 2026, 10:40","","Press banca","","",0,"normal",30,10,"","",""
`;

test('importa un CSV de Hevy agrupando por entreno y ejercicio', () => {
  const w = importarHevy(CSV);
  assert.equal(w.length, 2);
  assert.deepEqual([w[0].fecha, w[0].titulo, w[0].duracion_min], ['2026-10-30', 'Pierna', 65]);
  assert.deepEqual(w[0].ejercicios.map((e) => e.nombre), ['Sentadilla (Barra)', 'Hip Thrust']);
  assert.equal(w[0].ejercicios[0].series.length, 3);
  assert.equal(importarHevy(CSV)[0].id, w[0].id); // id estable → reimportar no duplica
  assert.throws(() => importarHevy('a,b\n1,2'), /Hevy/);
});

test('1RM estimado y progreso de fuerza sin calentamientos', () => {
  assert.equal(e1rm(100, 1), 100);
  assert.equal(e1rm(60, 10), 80);
  assert.equal(e1rm(60, 20), null);
  assert.equal(e1rm(0, 10), null);
  const p = progresoFuerza(importarHevy(CSV));
  const sq = p.get('Sentadilla (Barra)');
  assert.equal(sq.length, 1);
  assert.equal(sq[0].mejor.e1rm, 66); // 55 × (1 + 6/30)
  assert.equal(sq[0].series, 2); // el calentamiento no cuenta
  assert.equal(sq[0].volumen, 50 * 8 + 55 * 6);
});
