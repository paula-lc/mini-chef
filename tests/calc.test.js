import test from 'node:test';
import assert from 'node:assert/strict';
import {
  macrosProducto, totalesReceta, porGramoCocinado, calcularRaciones,
  validarKcal, eurKg, redondear,
} from '../js/calc.js';

const cerca = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

const productos = {
  arroz: { id: 'arroz', nombre: 'Arroz', kcal: 360, p: 7, c: 79, g: 0.6, fibra: 1.3, envase_g: 1000, precio: 1.2, rendimiento: 2.5 },
  pollo: { id: 'pollo', nombre: 'Pollo', kcal: 110, p: 23, c: 0, g: 1.5, fibra: 0, envase_g: 1000, precio: 7 },
  garbanzo: { id: 'garbanzo', nombre: 'Garbanzo', kcal: 90, p: 5.5, c: 9.5, g: 2.2, fibra: null, envase_g: 570, escurrido_g: 400, precio: 0.8 },
};
const recetas = {};
const ctx = { producto: (id) => productos[id], receta: (id) => recetas[id] };

test('macros y coste de un producto en crudo', () => {
  const m = macrosProducto(productos.pollo, 500);
  cerca(m.kcal, 550);
  cerca(m.p, 115);
  cerca(m.coste, 3.5);
});

test('€/kg usa el peso escurrido si existe', () => {
  cerca(eurKg(productos.garbanzo), 2.0);
  cerca(eurKg(productos.pollo), 7);
});

test('ingrediente en cocinado se convierte a crudo con el rendimiento', () => {
  const m = macrosProducto(productos.arroz, 250, 'cocinado'); // 100 g crudo
  cerca(m.crudo_g, 100);
  cerca(m.kcal, 360);
  cerca(m.coste, 0.12);
});

test('totales de una receta suman ingredientes', () => {
  recetas.bowl = {
    id: 'bowl', nombre: 'Bowl', peso_cocinado_g: 800,
    ingredientes: [
      { ref_tipo: 'producto', ref_id: 'pollo', gramos: 400 },
      { ref_tipo: 'producto', ref_id: 'arroz', gramos: 200, escala_pareja: true },
    ],
  };
  const t = totalesReceta(recetas.bowl, ctx);
  cerca(t.total.kcal, 440 + 720);
  cerca(t.total.coste, 2.8 + 0.24);
  cerca(t.escala.kcal, 720);
  assert.equal(t.avisos.length, 0);
});

test('macros por gramo cocinado', () => {
  const t = totalesReceta(recetas.bowl, ctx);
  const pg = porGramoCocinado(recetas.bowl, t.total);
  cerca(pg.kcal, 1160 / 800, 1e-6);
  assert.equal(porGramoCocinado({ peso_cocinado_g: 0 }, t.total), null);
});

test('peso cocinado → gramos por tupper según kcal objetivo', () => {
  const t = totalesReceta(recetas.bowl, ctx);
  const r = calcularRaciones(recetas.bowl, t, { modo: 'kcal', kcal: 580, mult: 1.6 });
  cerca(r.gramos_tupper, 400); // 580 / 1,45 kcal/g
  cerca(r.paula.kcal, 580);
  cerca(r.raciones_equivalentes, 2);
});

test('peso cocinado → gramos por tupper según número de raciones', () => {
  const t = totalesReceta(recetas.bowl, ctx);
  const r = calcularRaciones(recetas.bowl, t, { modo: 'raciones', n: 4, mult: 1.6 });
  cerca(r.gramos_tupper, 200);
  cerca(r.paula.p, (400 * 0.23 + 200 * 0.07) / 4);
  cerca(r.paula.coste, (2.8 + 0.24) / 4);
});

test('Rakan: misma proteína y 1,6× del ingrediente escalado', () => {
  const t = totalesReceta(recetas.bowl, ctx);
  const r = calcularRaciones(recetas.bowl, t, { modo: 'raciones', n: 4, mult: 1.6 });
  cerca(r.rakan.p, r.paula.p + 200 / 4 * 0.07 * 0.6);
  // arroz crudo en el tupper de Paula = 50 g → extra 30 g crudo
  cerca(r.rakan.extras[0].gramos, 30);
  cerca(r.rakan.extras[0].cocinado_g, 30 * 2.5); // equivalente cocinado con rendimiento 2,5
  cerca(r.rakan.kcal, r.paula.kcal + 50 * 3.6 * 0.6);
  assert.ok(r.rakan.coste > r.paula.coste);
});

test('componente reutilizable: macros por gramo cocinado', () => {
  recetas.arrozCocido = {
    id: 'arrozCocido', nombre: 'Arroz cocido', peso_cocinado_g: 750,
    ingredientes: [{ ref_tipo: 'producto', ref_id: 'arroz', gramos: 300 }],
  };
  recetas.plato = {
    id: 'plato', nombre: 'Plato', peso_cocinado_g: 400,
    ingredientes: [
      { ref_tipo: 'receta', ref_id: 'arrozCocido', gramos: 150, escala_pareja: true },
      { ref_tipo: 'producto', ref_id: 'pollo', gramos: 100 },
    ],
  };
  const t = totalesReceta(recetas.plato, ctx);
  // 150 g cocinados = 20 % del componente (300 g crudo → 60 g crudo)
  cerca(t.total.kcal, 60 * 3.6 + 110);
  cerca(t.total.coste, 60 / 1000 * 1.2 + 0.7);
});

test('componente sin peso cocinado da aviso y no suma macros', () => {
  recetas.sinPeso = { id: 'sinPeso', nombre: 'Sin peso', ingredientes: [{ ref_tipo: 'producto', ref_id: 'pollo', gramos: 100 }] };
  recetas.usa = { id: 'usa', nombre: 'Usa', ingredientes: [{ ref_tipo: 'receta', ref_id: 'sinPeso', gramos: 100 }] };
  const t = totalesReceta(recetas.usa, ctx);
  assert.equal(t.total.kcal, 0);
  assert.ok(t.avisos.some((a) => a.includes('peso cocinado')));
});

test('ciclos entre recetas no se cuelgan', () => {
  recetas.a = { id: 'a', nombre: 'A', peso_cocinado_g: 100, ingredientes: [{ ref_tipo: 'receta', ref_id: 'b', gramos: 10 }] };
  recetas.b = { id: 'b', nombre: 'B', peso_cocinado_g: 100, ingredientes: [{ ref_tipo: 'receta', ref_id: 'a', gramos: 10 }] };
  const t = totalesReceta(recetas.a, ctx);
  assert.ok(t.avisos.some((a) => a.includes('Ciclo')));
});

test('validación kcal ≈ 4P+4C+9G(+2 fibra)', () => {
  assert.equal(validarKcal({ kcal: 204, p: 17.5, c: 0.5, g: 14, fibra: 0 }).ok, true);
  assert.equal(validarKcal({ kcal: 464, p: 22, c: 2.6, g: 34, fibra: 30 }).ok, true); // chía
  assert.equal(validarKcal({ kcal: 42, p: 11, c: 0.5, g: 0.5, fibra: 0 }).ok, false); // claras
  assert.equal(validarKcal({ kcal: 89, p: 6.3, c: 11.5, g: 0.4, fibra: null }).ok, true); // alubia sin fibra
});

test('redondear', () => {
  assert.equal(redondear(1.2345, 2), 1.23);
});
