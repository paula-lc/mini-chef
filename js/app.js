import { h, vaciar } from './ui.js';
import { iniciar } from './store.js';
import { listaRecetas, detalleReceta } from './views/recetas.js';
import { editorReceta } from './views/editor.js';
import { listaProductos, formProducto } from './views/productos.js';
import { ajustes } from './views/ajustes.js';
import { hoy } from './views/hoy.js';

// Rutas por hash (funcionan en GitHub Pages sin configuración de servidor).
const rutas = [
  [/^#\/hoy$/, (r) => hoy(r, {}), 'hoy'],
  [/^#\/hoy\/(\d{4}-\d{2}-\d{2})$/, (r, m) => hoy(r, { fecha: m[1] }), 'hoy'],
  [/^#\/recetas$/, listaRecetas, 'recetas'],
  [/^#\/recetas\/nueva$/, (r) => editorReceta(r, {}), 'recetas'],
  [/^#\/receta\/([^/]+)\/editar$/, (r, m) => editorReceta(r, { id: m[1] }), 'recetas'],
  [/^#\/receta\/([^/]+)$/, (r, m) => detalleReceta(r, { id: m[1] }), 'recetas'],
  [/^#\/productos$/, listaProductos, 'productos'],
  [/^#\/productos\/nuevo$/, (r) => formProducto(r, {}), 'productos'],
  [/^#\/producto\/([^/]+)$/, (r, m) => formProducto(r, { id: m[1] }), 'productos'],
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

async function arrancar() {
  try {
    await iniciar();
  } catch (e) {
    console.error(e);
    raiz.append(h('p', { class: 'banda alerta' }, 'No se pudieron cargar los datos iniciales. Comprueba la conexión y recarga.'));
    return;
  }
  window.addEventListener('hashchange', pintar);
  pintar();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Sin modo offline:', e));
  }
}

arrancar();
