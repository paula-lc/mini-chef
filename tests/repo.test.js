import test from 'node:test';
import assert from 'node:assert/strict';
import { crearRepo, adaptadorMemoria } from '../js/repo.js';

const semilla = { productos: [{ id: 'a', nombre: 'A' }], recetas: [{ id: 'r', nombre: 'R', ingredientes: [] }] };

test('siembra solo cuando no hay datos', async () => {
  const repo = crearRepo(adaptadorMemoria());
  assert.equal(await repo.sembrar(semilla), 2);
  await repo.guardar('productos', { id: 'a', nombre: 'A editado' });
  assert.equal(await repo.sembrar(semilla), 0);
  assert.equal((await repo.obtener('productos', 'a')).nombre, 'A editado');
});

test('restaurar semilla añade faltantes sin pisar ediciones', async () => {
  const repo = crearRepo(adaptadorMemoria());
  await repo.sembrar(semilla);
  await repo.borrar('productos', 'a');
  await repo.guardar('recetas', { id: 'r', nombre: 'Mi R' });
  assert.equal(await repo.sembrar(semilla, { soloFaltantes: true }), 1);
  assert.equal((await repo.obtener('recetas', 'r')).nombre, 'Mi R');
  assert.ok(await repo.obtener('productos', 'a'));
});

test('guardar crea id y actualiza', async () => {
  const repo = crearRepo(adaptadorMemoria());
  const f = await repo.guardar('productos', { nombre: 'Nuevo' });
  assert.ok(f.id);
  await repo.guardar('productos', { ...f, nombre: 'Cambiado' });
  assert.equal((await repo.listar('productos')).length, 1);
  assert.equal((await repo.obtener('productos', f.id)).nombre, 'Cambiado');
});

test('exportar e importar son inversos', async () => {
  const a = crearRepo(adaptadorMemoria());
  await a.sembrar(semilla);
  await a.guardarAjustes({ multiplicador_pareja: 1.8 });
  const copia = JSON.parse(JSON.stringify(await a.exportar()));
  const b = crearRepo(adaptadorMemoria());
  await b.importar(copia);
  assert.deepEqual((await b.listar('productos')).map((p) => p.id), ['a']);
  assert.equal((await b.ajustes()).multiplicador_pareja, 1.8);
});

test('importar rechaza archivos ajenos', async () => {
  const repo = crearRepo(adaptadorMemoria());
  await assert.rejects(() => repo.importar({ foo: 1 }), /no es una copia/);
});
