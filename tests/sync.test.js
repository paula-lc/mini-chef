import test from 'node:test';
import assert from 'node:assert/strict';
import { crearSync } from '../js/sync.js';
import { crearRepo, adaptadorMemoria } from '../js/repo.js';

/** Servidor Supabase de mentira: auth por contraseña con refresh y la tabla `filas` con RLS por usuario. */
function falso() {
  const usuarios = new Map();
  const filas = new Map();
  const tokens = new Map();
  const refrescos = new Map();
  let n = 0;
  const emitir = (uid, email) => {
    n++;
    tokens.set(`acc${n}`, uid);
    refrescos.set(`ref${n}`, { uid, email });
    return { access_token: `acc${n}`, refresh_token: `ref${n}`, expires_in: 3600, user: { id: uid, email } };
  };
  const res = (cuerpo, status = 200) => ({ ok: status < 300, status, json: async () => cuerpo });
  const estado = { caido: false };
  const fetchFn = async (url, { method = 'GET', headers = {}, body } = {}) => {
    if (estado.caido) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    const cuerpo = body ? JSON.parse(body) : null;
    if (u.pathname === '/auth/v1/signup') {
      const uid = `u${usuarios.size + 1}`;
      usuarios.set(cuerpo.email, { uid, password: cuerpo.password });
      return res(emitir(uid, cuerpo.email));
    }
    if (u.pathname === '/auth/v1/token') {
      if (u.searchParams.get('grant_type') === 'refresh_token') {
        const r = refrescos.get(cuerpo.refresh_token);
        return r ? res(emitir(r.uid, r.email)) : res({ error_description: 'Invalid Refresh Token' }, 400);
      }
      const us = usuarios.get(cuerpo.email);
      return us && us.password === cuerpo.password ? res(emitir(us.uid, cuerpo.email)) : res({ error_description: 'Invalid login credentials' }, 400);
    }
    const uid = tokens.get((headers.Authorization || '').replace('Bearer ', ''));
    if (!uid) return res({ message: 'JWT expired' }, 401);
    if (u.pathname !== '/rest/v1/filas') return res({}, 404);
    if (method === 'POST') {
      for (const f of cuerpo) filas.set(`${uid}|${f.coleccion}|${f.id}`, { ...f, user_id: uid });
      return res(null, 201);
    }
    let lista = [...filas.values()].filter((f) => f.user_id === uid).sort((a, b) => Date.parse(a.actualizado) - Date.parse(b.actualizado));
    for (const op of ['gt', 'gte']) {
      const m = /^(gt|gte)\.(.+)$/.exec(u.searchParams.get('actualizado') || '');
      if (m && m[1] === op) lista = lista.filter((f) => (op === 'gt' ? Date.parse(f.actualizado) > Date.parse(m[2]) : Date.parse(f.actualizado) >= Date.parse(m[2])));
    }
    return res(lista.slice(0, Number(u.searchParams.get('limit') || 1000)));
  };
  return { fetchFn, filas, tokens, estado };
}

const CONFIG = { url: 'https://demo.supabase.co', key: 'k'.repeat(40) };

async function dispositivo(servidor, { registrar = false, email = 'paula@ejemplo.com' } = {}) {
  const adaptador = adaptadorMemoria();
  const bajadas = [];
  const sync = crearSync({ adaptador, fetchFn: servidor.fetchFn, programar: () => 0, alBajar: async () => { bajadas.push(1); } });
  const repo = crearRepo(adaptador, { alCambiar: (c, i, f) => sync.alCambiar(c, i, f) });
  await sync.configurar(CONFIG);
  return { adaptador, sync, repo, bajadas, entrar: () => sync.entrar(email, 'secreto', { registrar }) };
}

test('conectar sube lo que ya había y otro dispositivo lo recibe', async () => {
  const srv = falso();
  const a = await dispositivo(srv);
  await a.repo.guardar('recetas', { id: 'r1', nombre: 'Mi receta' }); // antes de entrar: queda en local
  await a.repo.guardarAjustes({ presupuesto_mensual: 600 });
  await a.sync.entrar('paula@ejemplo.com', 'secreto', { registrar: true });
  assert.equal((await a.sync.estado()).pendientes, 0);
  assert.equal(srv.filas.size, 2); // la receta y los ajustes

  const b = await dispositivo(srv);
  const r = await b.entrar();
  assert.equal(r.bajadas, 2);
  assert.equal((await b.repo.obtener('recetas', 'r1')).nombre, 'Mi receta');
  assert.equal((await b.repo.ajustes()).presupuesto_mensual, 600);
  assert.equal(b.bajadas.length, 1); // avisó a la pantalla
});

test('cambios y borrados viajan entre dispositivos', async () => {
  const srv = falso();
  const a = await dispositivo(srv);
  await a.sync.entrar('paula@ejemplo.com', 'secreto', { registrar: true });
  const b = await dispositivo(srv);
  await b.entrar();

  await a.repo.guardar('pesos', { id: '2026-10-30', fecha: '2026-10-30', kg: 62.5 });
  await a.sync.sincronizar();
  await b.sync.sincronizar();
  assert.equal((await b.repo.obtener('pesos', '2026-10-30')).kg, 62.5);

  await a.repo.borrar('pesos', '2026-10-30');
  await a.sync.sincronizar();
  await b.sync.sincronizar();
  assert.equal(await b.repo.obtener('pesos', '2026-10-30'), null); // la lápida borra también allí
});

test('gana el cambio más reciente de cada elemento', async () => {
  const srv = falso();
  const a = await dispositivo(srv);
  await a.sync.entrar('paula@ejemplo.com', 'secreto', { registrar: true });
  const b = await dispositivo(srv);
  await b.entrar();

  const edit = async (d, nombre, ts) => {
    const fila = { id: 'p1', nombre, actualizado: ts };
    await d.adaptador.escribir('productos', [fila]);
    await d.sync.alCambiar('productos', 'p1', fila);
  };
  await edit(a, 'Versión de A', '2026-10-30T10:00:00.000Z');
  await edit(b, 'Versión de B', '2026-10-30T11:00:00.000Z');
  await b.sync.sincronizar();
  await a.sync.sincronizar(); // A tenía lo suyo pendiente, pero B es más nuevo
  await b.sync.sincronizar();
  assert.equal((await a.repo.obtener('productos', 'p1')).nombre, 'Versión de B');
  assert.equal((await b.repo.obtener('productos', 'p1')).nombre, 'Versión de B');
  assert.equal((await a.sync.estado()).pendientes, 0);
});

test('lo editado en este dispositivo y más nuevo no se pisa al bajar', async () => {
  const srv = falso();
  const a = await dispositivo(srv);
  await a.sync.entrar('paula@ejemplo.com', 'secreto', { registrar: true });
  srv.filas.set('u1|productos|p1', { user_id: 'u1', coleccion: 'productos', id: 'p1', borrado: false, actualizado: '2026-10-30T09:00:00.000Z', datos: { id: 'p1', nombre: 'Viejo', actualizado: '2026-10-30T09:00:00.000Z' } });
  const mia = { id: 'p1', nombre: 'Lo mío', actualizado: '2026-10-30T12:00:00.000Z' };
  await a.adaptador.escribir('productos', [mia]);
  await a.sync.alCambiar('productos', 'p1', mia);
  await a.sync.sincronizar();
  assert.equal((await a.repo.obtener('productos', 'p1')).nombre, 'Lo mío');
  assert.equal(srv.filas.get('u1|productos|p1').datos.nombre, 'Lo mío');
});

test('sin conexión los cambios esperan en la cola y se suben después', async () => {
  const srv = falso();
  const a = await dispositivo(srv);
  await a.sync.entrar('paula@ejemplo.com', 'secreto', { registrar: true });
  srv.estado.caido = true;
  await a.repo.guardar('gastos', { id: 'g1', fecha: '2026-10-30', importe: 20 });
  const r = await a.sync.sincronizar();
  assert.match(r.error, /fetch/);
  assert.equal((await a.sync.estado()).pendientes, 1);
  srv.estado.caido = false;
  assert.deepEqual(await a.sync.sincronizar(), { bajadas: 0, subidas: 1 });
  assert.equal((await a.sync.estado()).pendientes, 0);
  assert.ok(srv.filas.has('u1|gastos|g1'));
});

test('renueva la sesión cuando el token ha caducado', async () => {
  const srv = falso();
  const a = await dispositivo(srv);
  await a.sync.entrar('paula@ejemplo.com', 'secreto', { registrar: true });
  srv.tokens.clear(); // el servidor ya no reconoce el token de acceso, pero sí el de renovación
  await a.repo.guardar('gastos', { id: 'g1', importe: 5 });
  assert.deepEqual(await a.sync.sincronizar(), { bajadas: 0, subidas: 1 });
  assert.equal((await a.sync.estado()).conectado, true);
});

test('si la renovación falla pide volver a entrar', async () => {
  const srv = falso();
  const a = await dispositivo(srv);
  await a.sync.entrar('paula@ejemplo.com', 'secreto', { registrar: true });
  srv.tokens.clear();
  await a.sync.salir(); // simula sesión perdida
  await a.adaptador.escribir('_sync', { config: CONFIG, sesion: { access_token: 'x', refresh_token: 'malo', expira: 0, email: 'a@b.c' }, cola: [], cursor: null });
  const b = crearSync({ adaptador: a.adaptador, fetchFn: srv.fetchFn, programar: () => 0 });
  const r = await b.sincronizar();
  assert.match(r.error, /vuelve a entrar/);
  assert.equal((await b.estado()).conectado, false);
});

test('contraseña incorrecta, código de conexión y datos de cada usuario separados', async () => {
  const srv = falso();
  const a = await dispositivo(srv);
  await a.sync.entrar('paula@ejemplo.com', 'secreto', { registrar: true });
  await a.repo.guardar('gastos', { id: 'g1', importe: 5 });
  await a.sync.sincronizar();

  const otro = await dispositivo(srv);
  await assert.rejects(() => otro.sync.entrar('paula@ejemplo.com', 'mala'), /Invalid login/);

  // el código copia la conexión (URL + clave pública) a otro dispositivo
  const codigo = await a.sync.codigo();
  const c = crearSync({ adaptador: adaptadorMemoria(), fetchFn: srv.fetchFn, programar: () => 0 });
  await c.usarCodigo(codigo);
  assert.equal((await c.estado()).configurado, true);
  await assert.rejects(() => c.usarCodigo('basura'), /no es válido/);
  await assert.rejects(() => c.configurar({ url: 'nada', key: 'x' }), /URL/);

  // otro usuario no ve las filas de Paula
  const d = await dispositivo(srv, { registrar: true, email: 'otra@ejemplo.com' });
  const r = await d.entrar();
  assert.equal(r.bajadas, 0);
  assert.equal(await d.repo.obtener('gastos', 'g1'), null);
});

test('una fila de la semilla (sin fecha de edición) cede ante la versión editada en la nube', async () => {
  const srv = falso();
  const a = await dispositivo(srv);
  await a.sync.entrar('paula@ejemplo.com', 'secreto', { registrar: true });
  await a.repo.guardar('productos', { id: 'cacao', nombre: 'Cacao (mi marca)', kcal: 300 });
  await a.sync.sincronizar();

  const b = await dispositivo(srv);
  await b.adaptador.escribir('productos', [{ id: 'cacao', nombre: 'Cacao puro en polvo', kcal: 290 }]); // semilla
  await b.entrar();
  assert.equal((await b.repo.obtener('productos', 'cacao')).nombre, 'Cacao (mi marca)');
});

test('sin sesión no se encola nada', async () => {
  const srv = falso();
  const a = await dispositivo(srv);
  await a.repo.guardar('gastos', { id: 'g1', importe: 5 });
  assert.deepEqual(await a.sync.estado(), { configurado: true, conectado: false, email: null, pendientes: 0, ultima: null, error: null });
  assert.equal(await a.sync.sincronizar(), null);
});
