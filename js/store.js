// Estado en memoria de la sesión + arranque. Las vistas leen de `datos` y escriben vía `repo`.
import { crearRepo, adaptadorLocal } from './repo.js';

export const repo = crearRepo(adaptadorLocal());
export const datos = { productos: new Map(), recetas: new Map(), registros: new Map(), plantillas: new Map(), pesos: new Map(), entrenos: new Map(),
  listas: new Map(), inventario: new Map(), gastos: new Map(), ajustes: {},
};
export const ctx = {
  producto: (id) => datos.productos.get(id),
  receta: (id) => datos.recetas.get(id),
};

export async function cargar() {
  datos.productos = new Map((await repo.listar('productos')).map((p) => [p.id, p]));
  datos.recetas = new Map((await repo.listar('recetas')).map((r) => [r.id, r]));
  datos.registros = new Map((await repo.listar('registros')).map((r) => [r.id, r]));
  datos.plantillas = new Map((await repo.listar('plantillas')).map((t) => [t.id, t]));
  datos.pesos = new Map((await repo.listar('pesos')).map((p) => [p.id, p]));
  datos.entrenos = new Map((await repo.listar('entrenos')).map((w) => [w.id, w]));
  for (const col of ['listas', 'inventario', 'gastos']) {
    datos[col] = new Map((await repo.listar(col)).map((f) => [f.id, f]));
  }
  datos.ajustes = await repo.ajustes();
}

export async function cargarSemilla() {
  const [p, r] = await Promise.all([
    fetch('data/products.json').then((x) => x.json()),
    fetch('data/recipes.json').then((x) => x.json()),
  ]);
  return { productos: p.productos, recetas: r.recetas };
}

export async function iniciar() {
  await repo.sembrar(await cargarSemilla());
  await cargar();
}

export async function restaurarSemilla() {
  const n = await repo.sembrar(await cargarSemilla(), { soloFaltantes: true });
  await cargar();
  return n;
}

export async function guardar(col, obj) {
  const fila = await repo.guardar(col, obj);
  datos[col].set(fila.id, fila);
  return fila;
}

export async function borrar(col, id) {
  await repo.borrar(col, id);
  datos[col].delete(id);
}
