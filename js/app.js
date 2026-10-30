import { h, vaciar } from './ui.js';
import { iniciar, sync, adaptador } from './store.js';
import { listaRecetas, detalleReceta } from './views/recetas.js';
import { editorReceta } from './views/editor.js';
import { listaProductos, formProducto } from './views/productos.js';
import { ajustes } from './views/ajustes.js';
import { hoy } from './views/hoy.js';
import { progreso } from './views/progreso.js';
import { fuerza } from './views/fuerza.js';
import { compra } from './views/compra.js';
import { stock, gasto } from './views/stock.js';

// Rutas por hash (funcionan en GitHub Pages sin configuración de servidor).
const rutas = [
  [/^#\/hoy$/, (r) => hoy(r, {}), 'hoy'],
  [/^#\/hoy\/(\d{4}-\d{2}-\d{2})$/, (r, m) => hoy(r, { fecha: m[1] }), 'hoy'],
  [/^#\/progreso$/, progreso, 'progreso'],
  [/^#\/fuerza$/, fuerza, 'progreso'],
  [/^#\/recetas$/, listaRecetas, 'recetas'],
  [/^#\/recetas\/nueva$/, (r) => editorReceta(r, {}), 'recetas'],
  [/^#\/receta\/([^/]+)\/editar$/, (r, m) => editorReceta(r, { id: m[1] }), 'recetas'],
  [/^#\/receta\/([^/]+)$/, (r, m) => detalleReceta(r, { id: m[1] }), 'recetas'],
  [/^#\/compra$/, compra, 'compra'],
  [/^#\/compra\/stock$/, stock, 'compra'],
  [/^#\/compra\/gasto$/, gasto, 'compra'],
  [/^#\/productos$/, listaProductos, 'compra'],
  [/^#\/productos\/nuevo$/, (r) => formProducto(r, {}), 'compra'],
  [/^#\/producto\/([^/]+)$/, (r, m) => formProducto(r, { id: m[1] }), 'compra'],
  [/^#\/ajustes$/, ajustes, 'ajustes'],
];

const raiz = document.getElementById('app');
const nav = document.getElementById('nav');

function pintar() {
  const hash = decodeURIComponent(location.hash || '#/hoy');
  vaciar(raiz);
  for (const [re, vista, seccion] of rutas) {
    const m = hash.match(re);
    if (!m) continue;
    nav.querySelectorAll('a').forEach((a) => a.classList.toggle('activo', a.dataset.seccion === seccion));
    try {
      vista(raiz, m);
    } catch (e) {
      console.error(e);
      raiz.append(h('p', { class: 'banda alerta' }, `Algo ha fallado: ${e.message}`));
    }
    window.scrollTo(0, 0);
    return;
  }
  location.hash = '#/hoy';
}

// Sincronización: al abrir, al volver a la app y al recuperar la conexión. Si bajan cambios se repinta
// la pantalla, salvo que estés escribiendo (hoja abierta o campo con el foco) para no perder lo tecleado.
function arrancarSync() {
  const ahora = () => sync.sincronizar();
  window.addEventListener('minichef:datos', () => {
    if (!document.querySelector('.fondo') && !document.activeElement?.matches?.('input, select, textarea')) pintar();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ahora(); });
  window.addEventListener('online', ahora);
  ahora();
}

async function arrancar() {
  try {
    await iniciar();
  } catch (e) {
    console.error(e);
    raiz.append(h('p', { class: 'banda alerta' }, 'No se pudieron cargar los datos iniciales. Comprueba la conexión y recarga.'));
    return;
  }
  if (adaptador.persistente === false) {
    raiz.before(h('p', { class: 'banda alerta aviso-fijo', role: 'alert' }, 'Este navegador no guarda datos: se perderán al recargar'));
  }
  window.addEventListener('hashchange', pintar);
  pintar();
  arrancarSync();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Sin modo offline:', e));
  }
}

arrancar();
