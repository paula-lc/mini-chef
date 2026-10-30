import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { totalesReceta, validarKcal, porGramoCocinado } from '../js/calc.js';

const leer = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const productos = leer('products.json').productos;
const recetas = leer('recipes.json').recetas;
const P = new Map(productos.map((p) => [p.id, p]));
const R = new Map(recetas.map((r) => [r.id, r]));
const ctx = { producto: (id) => P.get(id), receta: (id) => R.get(id) };

test('ids de productos únicos y campos obligatorios', () => {
  assert.equal(P.size, productos.length);
  for (const p of productos) {
    for (const k of ['nombre', 'tienda', 'kcal', 'p', 'c', 'g', 'precio', 'fuente', 'estado']) {
      assert.ok(p[k] !== undefined && p[k] !== null, `${p.id} sin ${k}`);
    }
    assert.ok(['verificado', 'pendiente', 'revisar'].includes(p.estado), `${p.id}: estado ${p.estado}`);
  }
});

test('el estado "revisar" coincide con la validación de kcal', () => {
  for (const p of productos) {
    if (p.estado === 'revisar') assert.equal(validarKcal(p).ok, false, p.id);
    else assert.equal(validarKcal(p).ok, true, `${p.id} no cuadra y no está en revisar`);
  }
});

test('las 12 recetas pedidas existen y los ingredientes resuelven', () => {
  const pedidas = ['bagel-proteico', 'bowl-pollo-shawarma', 'pasta-bolonesa', 'hamburguesa-casera',
    'salmon-salteado-rustico', 'curry-pollo-garbanzos', 'pollo-teriyaki', 'tortilla-patata-proteica',
    'pizza-bagel', 'crepes-proteicos', 'pancakes-platano', 'yogurcito'];
  for (const id of pedidas) assert.ok(R.has(id), `falta ${id}`);
  for (const r of recetas) {
    const t = totalesReceta(r, ctx);
    assert.deepEqual(t.avisos, [], `${r.id}: ${t.avisos}`);
    assert.ok(t.total.kcal > 0, `${r.id} sin kcal`);
    assert.ok(porGramoCocinado(r, t.total), `${r.id} sin peso cocinado`);
  }
});

test('densidad calórica de las recetas es razonable (0,1-8 kcal por g cocinado)', () => {
  for (const r of recetas) {
    const kcalG = totalesReceta(r, ctx).total.kcal / r.peso_cocinado_g;
    assert.ok(kcalG > 0.1 && kcalG < 8, `${r.id}: ${kcalG.toFixed(2)} kcal/g`);
  }
});
