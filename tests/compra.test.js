import test from 'node:test';
import assert from 'node:assert/strict';
import {
  necesidadesReceta, necesidadesPlan, stockProductos, lineaCompra, listaCompra, resumenPresupuesto, edadDias,
} from '../js/compra.js';

const productos = new Map([
  ['arroz', { id: 'arroz', nombre: 'Arroz', tienda: 'Mercadona', seccion: 'despensa', kcal: 350, envase_g: 1000, precio: 1.5, rendimiento: 2.5, unidad_g: null }],
  ['pollo', { id: 'pollo', nombre: 'Pollo', tienda: 'Mercadona', seccion: 'carniceria', kcal: 120, envase_g: 600, precio: 4, eur_kg: null }],
  ['huevo', { id: 'huevo', nombre: 'Huevos', tienda: 'Mercadona', seccion: 'lacteos', kcal: 140, envase_g: 720, precio: 2.4, unidad_g: 60 }],
  ['espinaca', { id: 'espinaca', nombre: 'Espinacas', tienda: 'Lidl', seccion: 'congelados', kcal: 20, envase_g: 450, precio: 1.2 }],
  ['sal', { id: 'sal', nombre: 'Sal', tienda: 'Mercadona', seccion: 'despensa', kcal: 0 }], // sin precio
]);
const recetas = new Map([
  ['arrozcocido', { id: 'arrozcocido', nombre: 'Arroz cocido', peso_cocinado_g: 1000, ingredientes: [{ ref_tipo: 'producto', ref_id: 'arroz', gramos: 400, modo: 'crudo' }] }],
  ['bowl', {
    id: 'bowl', nombre: 'Bowl',
    ingredientes: [
      { ref_tipo: 'receta', ref_id: 'arrozcocido', gramos: 500 }, // la mitad de la olla de arroz
      { ref_tipo: 'producto', ref_id: 'pollo', gramos: 700, modo: 'crudo' },
    ],
  }],
  ['sinpeso', { id: 'sinpeso', nombre: 'Sin peso', ingredientes: [] }],
  ['usasinpeso', { id: 'usasinpeso', nombre: 'Usa sin peso', ingredientes: [{ ref_tipo: 'receta', ref_id: 'sinpeso', gramos: 100 }] }],
]);
const ctx = { producto: (id) => productos.get(id), receta: (id) => recetas.get(id) };

test('necesidades: componentes proporcionales y veces', () => {
  const { acc } = necesidadesReceta(recetas.get('bowl'), ctx);
  assert.equal(acc.get('arroz'), 200); // 500/1000 de 400 g
  assert.equal(acc.get('pollo'), 700);
  assert.equal(necesidadesReceta(recetas.get('bowl'), ctx, 2).acc.get('pollo'), 1400);
});

test('necesidades: ingredientes cocinados se convierten a crudo', () => {
  const r = { id: 'r', nombre: 'R', ingredientes: [{ ref_tipo: 'producto', ref_id: 'arroz', gramos: 250, modo: 'cocinado' }] };
  assert.equal(necesidadesReceta(r, ctx).acc.get('arroz'), 100); // rendimiento 2,5
});

test('necesidades: avisa de lo que falta', () => {
  const { avisos } = necesidadesReceta(recetas.get('usasinpeso'), ctx);
  assert.match(avisos[0], /no tiene peso cocinado/);
  const p = necesidadesPlan([{ ref_id: 'borrada', veces: 1 }], ctx);
  assert.match(p.avisos[0], /ya no existe/);
});

test('plan con varias recetas suma el mismo producto', () => {
  const { acc } = necesidadesPlan([{ ref_id: 'bowl', veces: 1 }, { ref_id: 'arrozcocido', veces: 1 }], ctx);
  assert.equal(acc.get('arroz'), 600);
});

test('línea de compra: envases enteros, coste y sobrante', () => {
  const l = lineaCompra(productos.get('pollo'), 700);
  assert.equal(l.packs, 2);
  assert.equal(l.coste, 8);
  assert.equal(l.sobra_g, 500);
  assert.equal(lineaCompra(productos.get('arroz'), 1020).packs, 1); // dentro de la tolerancia
  assert.equal(lineaCompra(productos.get('arroz'), 1100).packs, 2);
});

test('el stock se resta y puede cubrirlo todo', () => {
  const l = lineaCompra(productos.get('pollo'), 700, 300);
  assert.equal(l.comprar_g, 400);
  assert.equal(l.packs, 1);
  const todo = lineaCompra(productos.get('pollo'), 700, 900);
  assert.deepEqual([todo.comprar_g, todo.packs, todo.coste, todo.stock_g], [0, null, 0, 700]);
});

test('stock en gramos, unidades y envases; los tuppers no cuentan', () => {
  const inv = [
    { tipo: 'producto', ref_id: 'huevo', cantidad: 6, unidad: 'ud' },
    { tipo: 'producto', ref_id: 'arroz', cantidad: 1, unidad: 'envases' },
    { tipo: 'producto', ref_id: 'arroz', cantidad: 250, unidad: 'g' },
    { tipo: 'tupper', ref_id: 'bowl', cantidad: 4, unidad: 'tuppers' },
  ];
  const s = stockProductos(inv, ctx);
  assert.equal(s.get('huevo'), 360);
  assert.equal(s.get('arroz'), 1250);
  assert.equal(s.size, 2);
});

test('lista agrupada por tienda y sección con total', () => {
  const lista = { recetas: [{ ref_id: 'bowl', veces: 1 }], extras: [
    { id: 'x1', tipo: 'producto', ref_id: 'espinaca', packs: 2 },
    { id: 'x2', tipo: 'libre', nombre: 'Detergente', importe: 5.5, tienda: 'Mercadona', seccion: 'despensa' },
  ] };
  const l = listaCompra(lista, ctx, []);
  assert.deepEqual(l.porTienda.map((t) => t.tienda), ['Lidl', 'Mercadona']);
  const merc = l.porTienda[1];
  assert.deepEqual(merc.secciones.map((s) => s.seccion), ['carniceria', 'despensa']); // orden del súper
  assert.equal(l.porTienda[0].total, 2.4); // 2 bolsas de espinacas
  // pollo 2 × 4 + arroz 1 × 1,5 + detergente 5,5
  assert.equal(merc.total, 15);
  assert.equal(l.total, 17.4);
});

test('lo que ya tienes no aparece, y se avisa si falta precio', () => {
  const inv = [{ tipo: 'producto', ref_id: 'pollo', cantidad: 2, unidad: 'envases' }, { tipo: 'producto', ref_id: 'arroz', cantidad: 500, unidad: 'g' }];
  const l = listaCompra({ recetas: [{ ref_id: 'bowl', veces: 1 }], extras: [] }, ctx, inv);
  const nombres = l.porTienda.flatMap((t) => t.secciones.flatMap((s) => s.lineas.map((x) => x.nombre)));
  assert.deepEqual(nombres, []); // 700 g de pollo cubiertos por 2 envases; 200 g de arroz cubiertos
  const sinPrecio = listaCompra({ recetas: [], extras: [{ id: 'x', tipo: 'producto', ref_id: 'sal', packs: 1 }] }, ctx, []);
  assert.ok(sinPrecio.avisos.some((a) => /sin precio|no tiene precio/.test(a)));
});

test('presupuesto mensual: 520 € para 2', () => {
  const gastos = [
    { fecha: '2026-10-03', importe: 120 }, { fecha: '2026-10-17', importe: 100.5 }, { fecha: '2026-09-28', importe: 999 },
  ];
  const r = resumenPresupuesto(gastos, {}, '2026-10-20');
  assert.equal(r.gastado, 220.5);
  assert.equal(r.restante, 299.5);
  assert.equal(r.diasRestantes, 12); // del 20 al 31, contando hoy
  assert.equal(r.por_dia, 24.96);
  assert.equal(r.gastos.length, 2);
  assert.equal(r.estado, 'bien'); // esperado a día 20: 335,48
  assert.equal(resumenPresupuesto([{ fecha: '2026-10-02', importe: 400 }], {}, '2026-10-10').estado, 'adelantado');
  assert.equal(resumenPresupuesto([{ fecha: '2026-10-02', importe: 530 }], {}, '2026-10-10').estado, 'pasado');
  assert.equal(resumenPresupuesto([], { presupuesto_mensual: 600 }, '2026-10-10').presupuesto, 600);
});

test('edad en días', () => {
  assert.equal(edadDias('2026-10-01', '2026-10-31'), 30);
  assert.equal(edadDias(null, '2026-10-31'), null);
});
