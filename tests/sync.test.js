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
  const estado = { caido: false, refrescos: 0 };
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
        estado.refrescos++;
        refrescos.delete(cuerpo.refresh_token); // rotación: un refresh_token solo sirve una vez
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

test('la URL se limpia: acepta /rest/v1/ y barras finales', async () => {
  const c = crearSync({ adaptador: adaptadorMemoria(), fetchFn: async () => ({}), programar: () => 0 });
  await c.configurar({ url: ' https://demo.supabase.co/rest/v1/ ', key: 'k'.repeat(40) });
  const { url } = JSON.parse(atob(await c.codigo()));
  assert.equal(url, 'https://demo.supabase.co');
});

/* ---------- varias pestañas con el mismo almacenamiento ---------- */

/** Dos "pestañas": instancias distintas (cada una con su estado en memoria) sobre el mismo adaptador, como localStorage. */
function pestanas(servidor, adaptador, n = 2) {
  let cola = Promise.resolve();
  const bloqueo = (fn) => { const r = cola.then(fn); cola = r.catch(() => {}); return r; }; // Web Locks de mentira
  const oyentes = [];
  return Array.from({ length: n }, () => {
    const sync = crearSync({
      adaptador, fetchFn: servidor.fetchFn, programar: () => 0, bloqueo,
      escuchar: (fn) => oyentes.push(fn),
    });
    return sync;
  }).map((sync) => ({ sync, oyentes }));
}

const caducar = async (adaptador) => {
  const e = await adaptador.leer('_sync');
  e.sesion.expira = 0;
  await adaptador.escribir('_sync', e);
};

test('dos pestañas con la sesión caducada renuevan una sola vez', async () => {
  const srv = falso();
  const adaptador = adaptadorMemoria();
  const inicial = crearSync({ adaptador, fetchFn: srv.fetchFn, programar: () => 0 });
  await inicial.configurar(CONFIG);
  await inicial.entrar('paula@ejemplo.com', 'secreto', { registrar: true });
  await caducar(adaptador);

  const [a, b] = pestanas(srv, adaptador);
  const [ra, rb] = await Promise.all([a.sync.sincronizar(), b.sync.sincronizar()]);
  assert.equal(srv.estado.refrescos, 1);
  assert.equal(ra.error, undefined);
  assert.equal(rb.error, undefined);
  assert.equal((await a.sync.estado()).conectado, true);
  assert.equal((await b.sync.estado()).conectado, true);
});

test('una pestaña con copia vieja no pisa la sesión renovada por otra', async () => {
  const srv = falso();
  const adaptador = adaptadorMemoria();
  const inicial = crearSync({ adaptador, fetchFn: srv.fetchFn, programar: () => 0 });
  await inicial.configurar(CONFIG);
  await inicial.entrar('paula@ejemplo.com', 'secreto', { registrar: true });

  await caducar(adaptador);
  const [a, b] = pestanas(srv, adaptador);
  await a.sync.estado();
  await b.sync.estado(); // las dos cargan la sesión caducada
  await a.sync.sincronizar(); // A la renueva
  const renovada = (await adaptador.leer('_sync')).sesion;

  await b.sync.alCambiar('pesos', 'x', { id: 'x', actualizado: '2026-10-30T10:00:00.000Z' }); // B escribe con su copia vieja
  const tras = (await adaptador.leer('_sync')).sesion;
  assert.equal(tras.refresh_token, renovada.refresh_token);
  assert.equal(srv.estado.refrescos, 1);
});

test('la cola se une entre pestañas y lo ya subido no reaparece', async () => {
  const srv = falso();
  const adaptador = adaptadorMemoria();
  const inicial = crearSync({ adaptador, fetchFn: srv.fetchFn, programar: () => 0 });
  await inicial.configurar(CONFIG);
  await inicial.entrar('paula@ejemplo.com', 'secreto', { registrar: true });

  const [a, b] = pestanas(srv, adaptador);
  await a.sync.estado();
  await b.sync.estado();
  await a.sync.alCambiar('pesos', 'a', { id: 'a', actualizado: '2026-10-30T10:00:00.000Z' });
  await b.sync.alCambiar('pesos', 'b', { id: 'b', actualizado: '2026-10-30T10:00:01.000Z' });
  assert.equal((await adaptador.leer('_sync')).cola.length, 2); // ninguna pisó a la otra

  await a.sync.sincronizar(); // sube las dos
  assert.equal((await adaptador.leer('_sync')).cola.length, 0);
  await b.sync.alCambiar('pesos', 'c', { id: 'c', actualizado: '2026-10-30T10:00:02.000Z' });
  const cola = (await adaptador.leer('_sync')).cola;
  assert.deepEqual(cola.map((c) => c.id), ['c']); // B, con su copia vieja, no resucita a ni b
});

test('el evento storage actualiza la sesión en memoria', async () => {
  const srv = falso();
  const adaptador = adaptadorMemoria();
  const inicial = crearSync({ adaptador, fetchFn: srv.fetchFn, programar: () => 0 });
  await inicial.configurar(CONFIG);
  await inicial.entrar('paula@ejemplo.com', 'secreto', { registrar: true });

  const [a, b] = pestanas(srv, adaptador);
  await b.sync.estado();
  await a.sync.salir(); // A cierra sesión
  assert.equal((await b.sync.estado()).conectado, true); // B aún no se ha enterado
  for (const fn of b.oyentes) await fn(); // llega el evento storage
  assert.equal((await b.sync.estado()).conectado, false);
});

test('si el refresco falla pero otra pestaña ya renovó, no se da por caducada', async () => {
  const srv = falso();
  const adaptador = adaptadorMemoria();
  const inicial = crearSync({ adaptador, fetchFn: srv.fetchFn, programar: () => 0 });
  await inicial.configurar(CONFIG);
  await inicial.entrar('paula@ejemplo.com', 'secreto', { registrar: true });
  await caducar(adaptador);

  // en el momento del refresco, "otra pestaña" guarda una sesión nueva y a esta le contesta que el token ya no vale
  const nueva = { access_token: 'otra', refresh_token: 'otra-ref', expira: Date.now() / 1000 + 3600, email: 'paula@ejemplo.com', user_id: 'u1' };
  const fetchFn = async (url, op) => {
    if (String(url).includes('grant_type=refresh_token')) {
      const e = await adaptador.leer('_sync');
      e.sesion = nueva;
      await adaptador.escribir('_sync', e);
      return { ok: false, status: 400, json: async () => ({ error_description: 'Invalid Refresh Token' }) };
    }
    return { ok: true, status: 200, json: async () => [] };
  };
  const t = crearSync({ adaptador, fetchFn, programar: () => 0 });
  const r = await t.sincronizar();
  assert.equal(r.error, undefined);
  assert.equal((await t.estado()).conectado, true);
});

test('si de verdad ha caducado, se pide entrar de nuevo', async () => {
  const srv = falso();
  const adaptador = adaptadorMemoria();
  const inicial = crearSync({ adaptador, fetchFn: srv.fetchFn, programar: () => 0 });
  await inicial.configurar(CONFIG);
  await inicial.entrar('paula@ejemplo.com', 'secreto', { registrar: true });
  await caducar(adaptador);
  const e = await adaptador.leer('_sync');
  e.sesion.refresh_token = 'inventado';
  await adaptador.escribir('_sync', e);
  const r = await crearSync({ adaptador, fetchFn: srv.fetchFn, programar: () => 0 }).sincronizar();
  assert.match(r.error, /caducado/);
});
