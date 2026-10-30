import test from 'node:test';
import assert from 'node:assert/strict';
import {
  objetivosDia, macrosEntrada, crearEntrada, totalesDia, estadoDia,
  crearPlantilla, aplicarPlantilla, fechaISO, sumarDias,
} from '../js/dia.js';
import { crearRepo, adaptadorMemoria } from '../js/repo.js';

const productos = new Map([
  ['arroz', { id: 'arroz', nombre: 'Arroz', kcal: 350, p: 7, c: 78, g: 1, fibra: 1, rendimiento: 2.5, eur_kg: 2 }],
  ['huevo', { id: 'huevo', nombre: 'Huevo', kcal: 140, p: 12, c: 1, g: 10, fibra: 0, eur_kg: 4, unidad_g: 60 }],
]);
const recetas = new Map([
  ['guiso', { id: 'guiso', nombre: 'Guiso', peso_cocinado_g: 1000, ingredientes: [{ ref_tipo: 'producto', ref_id: 'arroz', gramos: 400, modo: 'crudo' }] }],
  ['sinpeso', { id: 'sinpeso', nombre: 'Sin peso', ingredientes: [{ ref_tipo: 'producto', ref_id: 'arroz', gramos: 100, modo: 'crudo' }] }],
]);
const ctx = { producto: (id) => productos.get(id), receta: (id) => recetas.get(id) };

test('objetivos: entreno, descanso y poco sueño', () => {
  assert.equal(objetivosDia({ entrena: true }).kcal, 1650);
  assert.equal(objetivosDia({ entrena: false }).kcal, 1450);
  const poco = objetivosDia({ entrena: true, sueno_h: 5.5 });
  assert.equal(poco.kcal, 1850);
  assert.equal(poco.motivo, 'sueno');
  assert.equal(objetivosDia({ entrena: false, sueno_h: 6 }).kcal, 1450); // 6 h justas no cuenta como poco
});

test('objetivos: hidratos = lo que sobra tras proteína mínima y grasa media', () => {
  const o = objetivosDia({ entrena: true });
  assert.equal(o.p_min, 125);
  assert.deepEqual([o.g_min, o.g_max], [45, 55]);
  assert.equal(o.c, (1650 - 4 * 125 - 9 * 50) / 4); // 175
  assert.equal(objetivosDia({}, { kcal_descanso: 1500 }).kcal, 1500); // respeta ajustes
});

test('macros de producto en crudo y cocinado', () => {
  const crudo = macrosEntrada({ tipo: 'producto', ref_id: 'arroz', gramos: 100 }, ctx);
  assert.equal(crudo.kcal, 350);
  const cocido = macrosEntrada({ tipo: 'producto', ref_id: 'arroz', gramos: 250, modo: 'cocinado' }, ctx);
  assert.equal(cocido.kcal, 350); // 250 g cocidos = 100 g crudos
});

test('macros de receta por gramo cocinado', () => {
  // 400 g de arroz crudo en 1000 g cocinados → 1400 kcal / 1000 g
  const m = macrosEntrada({ tipo: 'receta', ref_id: 'guiso', gramos: 300 }, ctx);
  assert.equal(m.kcal, 420);
  assert.equal(m.p, 8.4);
});

test('entradas imposibles devuelven null o lanzan error', () => {
  assert.equal(macrosEntrada({ tipo: 'receta', ref_id: 'sinpeso', gramos: 100 }, ctx), null);
  assert.equal(macrosEntrada({ tipo: 'receta', ref_id: 'borrada', gramos: 100 }, ctx), null);
  assert.equal(macrosEntrada({ tipo: 'producto', ref_id: 'arroz', gramos: 0 }, ctx), null);
  assert.throws(() => crearEntrada({ tipo: 'receta', ref_id: 'sinpeso', gramos: 100 }, ctx), /No se pueden calcular/);
});

test('entrada libre y congelado de macros', () => {
  const e = crearEntrada({ tipo: 'libre', nombre: 'Cerveza', libre: { kcal: 150, p: 1, c: 12, g: 0 } }, ctx);
  assert.equal(e.macros.kcal, 150);
  const r = crearEntrada({ tipo: 'receta', ref_id: 'guiso', gramos: 300 }, ctx);
  recetas.get('guiso').ingredientes[0].gramos = 800; // editar la receta después…
  assert.equal(r.macros.kcal, 420); // …no cambia lo ya registrado
  recetas.get('guiso').ingredientes[0].gramos = 400;
});

test('totales y estado del día', () => {
  const entradas = [
    crearEntrada({ tipo: 'libre', nombre: 'A', libre: { kcal: 600, p: 50, c: 60, g: 15 } }, ctx),
    crearEntrada({ tipo: 'libre', nombre: 'B', libre: { kcal: 500, p: 40, c: 40, g: 30 } }, ctx),
  ];
  const t = totalesDia(entradas);
  assert.deepEqual([t.kcal, t.p, t.c, t.g], [1100, 90, 100, 45]);
  const s = estadoDia(t, objetivosDia({ entrena: true }));
  assert.equal(s.kcal_restantes, 550);
  assert.equal(s.p_falta, 35);
  assert.equal(s.p_ok, false);
  assert.equal(s.g_estado, 'ok');
  assert.equal(estadoDia({ ...t, g: 60 }, objetivosDia({})).g_estado, 'alto');
  assert.equal(estadoDia({ ...t, g: 30 }, objetivosDia({})).g_estado, 'bajo');
  assert.equal(totalesDia([]).kcal, 0);
});

test('plantillas: se recalculan y omiten lo borrado', () => {
  const entradas = [
    crearEntrada({ comida: 'comida', tipo: 'receta', ref_id: 'guiso', gramos: 300 }, ctx),
    crearEntrada({ comida: 'cena', tipo: 'producto', ref_id: 'arroz', gramos: 100 }, ctx),
  ];
  const plantilla = crearPlantilla('Día tipo', entradas);
  assert.equal(plantilla.ambito, 'dia');
  assert.equal(plantilla.entradas[0].macros, undefined); // no guarda macros congelados

  const { entradas: nuevas, omitidas } = aplicarPlantilla(plantilla, ctx);
  assert.deepEqual(nuevas.map((e) => e.comida), ['comida', 'cena']);
  assert.notEqual(nuevas[0].id, entradas[0].id);

  const forzada = aplicarPlantilla(plantilla, ctx, { comida: 'desayuno' });
  assert.ok(forzada.entradas.every((e) => e.comida === 'desayuno'));

  const sinArroz = { producto: () => undefined, receta: ctx.receta };
  const r = aplicarPlantilla(plantilla, sinArroz);
  assert.equal(r.entradas.length, 0); // el arroz ya no existe: ni el producto ni la receta que lo usa
  assert.deepEqual(r.omitidas, ['Guiso', 'Arroz']);
});

test('fechas locales', () => {
  assert.equal(sumarDias('2026-10-30', 1), '2026-10-31');
  assert.equal(sumarDias('2026-10-31', 1), '2026-11-01');
  assert.equal(sumarDias('2026-01-01', -1), '2025-12-31');
  assert.match(fechaISO(), /^\d{4}-\d{2}-\d{2}$/);
});

test('registros y plantillas viajan en la copia de seguridad', async () => {
  const a = crearRepo(adaptadorMemoria());
  await a.sembrar({ productos: [], recetas: [] });
  await a.guardar('registros', { id: '2026-10-30', entrena: true, entradas: [] });
  await a.guardar('plantillas', { id: 't1', nombre: 'X', ambito: 'dia', entradas: [] });
  const copia = JSON.parse(JSON.stringify(await a.exportar()));
  const b = crearRepo(adaptadorMemoria());
  await b.importar(copia);
  assert.equal((await b.obtener('registros', '2026-10-30')).entrena, true);
  assert.equal((await b.listar('plantillas')).length, 1);
  // una copia antigua (Fase 1) no borra los registros existentes
  await b.importar({ app: 'mini-chef', productos: [], recetas: [] });
  assert.equal((await b.listar('registros')).length, 1);
});

test('recetas de una sola ración se registran por raciones, sin pesar', () => {
  recetas.set('cafe', { id: 'cafe', nombre: 'Café', raciones: 1, ingredientes: [{ ref_tipo: 'producto', ref_id: 'arroz', gramos: 10, modo: 'crudo' }] });
  const e = crearEntrada({ tipo: 'receta', ref_id: 'cafe', raciones: 2 }, ctx);
  assert.equal(e.macros.kcal, 70); // 10 g × 350 kcal/100 g × 2 raciones
  assert.equal(macrosEntrada({ tipo: 'receta', ref_id: 'cafe', gramos: 100 }, ctx), null); // sin raciones ni peso cocinado no se puede
  assert.equal(macrosEntrada({ tipo: 'receta', ref_id: 'guiso', raciones: 1 }, ctx), null); // un guiso de olla sí necesita gramos
});

test('ingredientes propios y extras en una ración', () => {
  recetas.set('tostada', { id: 'tostada', nombre: 'Tostada', raciones: 1, ingredientes: [{ ref_tipo: 'producto', ref_id: 'arroz', gramos: 100, modo: 'crudo' }] });
  // ingredientes cambiados ese día: 150 g en vez de 100 g
  const e = crearEntrada({ tipo: 'receta', ref_id: 'tostada', raciones: 1, ingredientes: [{ ref_tipo: 'producto', ref_id: 'arroz', gramos: 150, modo: 'crudo' }] }, ctx);
  assert.equal(e.macros.kcal, 525);
  // extras sobre una receta de olla: 300 g del guiso (420 kcal) + 60 g de huevo (84 kcal)
  const g = crearEntrada({ tipo: 'receta', ref_id: 'guiso', gramos: 300, extras: [{ ref_tipo: 'producto', ref_id: 'huevo', gramos: 60, modo: 'crudo' }] }, ctx);
  assert.equal(g.macros.kcal, 504);
  // extras con producto borrado → no se puede calcular
  assert.equal(macrosEntrada({ tipo: 'receta', ref_id: 'guiso', gramos: 300, extras: [{ ref_tipo: 'producto', ref_id: 'nada', gramos: 5 }] }, ctx), null);
  // las plantillas conservan ingredientes y extras
  const t = crearPlantilla('T', [g]);
  assert.equal(t.entradas[0].extras.length, 1);
});

test('recomendar según las kcal que quedan', async () => {
  const { recomendar, racionSugerida } = await import('../js/dia.js');
  recetas.set('ligero', { id: 'ligero', nombre: 'Ligero', raciones: 1, ingredientes: [{ ref_tipo: 'producto', ref_id: 'huevo', gramos: 100, modo: 'crudo' }] }); // 140 kcal, 12 g P
  recetas.set('tostada', { id: 'tostada', nombre: 'Tostada', raciones: 1, ingredientes: [{ ref_tipo: 'producto', ref_id: 'arroz', gramos: 100, modo: 'crudo' }] }); // 350 kcal, 7 g P
  const lista = [...recetas.values()];
  // el guiso es de olla: un tupper de 550 kcal
  assert.equal(racionSugerida(recetas.get('guiso'), ctx, 550).kcal, 550);
  const r = recomendar(lista, ctx, { kcalRestantes: 400, pFalta: 30, kcalTupper: 550 });
  const ids = r.map((x) => x.receta.id);
  assert.ok(ids.indexOf('ligero') < ids.indexOf('tostada')); // con proteína por cubrir, gana la de más proteína por kcal
  assert.equal(r.find((x) => x.receta.id === 'guiso').encaja, false);
  assert.equal(r.find((x) => x.receta.id === 'guiso').exceso, 150);
  assert.ok(!ids.includes('arrozcocido')); // los componentes no se recomiendan
  // sin falta de proteína: la que más se acerca a lo que queda
  const s = recomendar(lista, ctx, { kcalRestantes: 400, pFalta: 0, kcalTupper: 550 });
  assert.equal(s[0].receta.id, 'tostada');
  // con pocas kcal no cabe nada pesado
  assert.ok(recomendar(lista, ctx, { kcalRestantes: 100, kcalTupper: 550 }).filter((x) => x.encaja).every((x) => x.kcal <= 100));
});
