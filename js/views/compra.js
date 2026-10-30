import { h, fmt, eur, num, vaciar, aviso, hoja, montar, SECCIONES } from '../ui.js';
import { datos, ctx, guardar } from '../store.js';
import { nuevoId } from '../repo.js';
import { fechaISO } from '../dia.js';
import { listaCompra, resumenPresupuesto } from '../compra.js';

const LISTA_ID = 'actual';

/** Pestañas de la sección Compra. */
export function pestanasCompra(activa) {
  return h('div', { class: 'segmentos pestanas-compra' },
    ...[['lista', 'Lista', '#/compra'], ['stock', 'Stock', '#/compra/stock'], ['gasto', 'Gasto', '#/compra/gasto'], ['productos', 'Productos', '#/productos']]
      .map(([id, texto, href]) => h('a', { class: 'seg' + (id === activa ? ' activo' : ''), href }, texto)));
}

/** Suma `cantidad` envases de un producto al inventario (junta con lo que ya hubiera). */
export async function añadirAlStock(prodId, cantidad, ubicacion, unidad = 'envases') {
  const previo = [...datos.inventario.values()].find((i) => i.tipo === 'producto' && i.ref_id === prodId && i.unidad === unidad && i.ubicacion === ubicacion);
  if (previo) return guardar('inventario', { ...previo, cantidad: previo.cantidad + cantidad });
  return guardar('inventario', {
    id: nuevoId('i'), tipo: 'producto', ref_id: prodId, nombre: ctx.producto(prodId)?.nombre ?? prodId,
    cantidad, unidad, ubicacion, fecha: fechaISO(),
  });
}

export const ubicacionPorDefecto = (seccion) => (seccion === 'congelados' ? 'congelador' : seccion === 'lacteos' || seccion === 'carniceria' ? 'nevera' : 'despensa');

export function compra(root) {
  const hoyISO = fechaISO();
  const cont = h('div');
  const lista = () => datos.listas.get(LISTA_ID) ?? { id: LISTA_ID, recetas: [], extras: [], marcados: [] };
  const cambiar = async (fn) => { const l = structuredClone(lista()); fn(l); await guardar('listas', l); pintar(); };

  /* ---------- Hojas para añadir ---------- */
  const elegirReceta = () => hoja('Cocinar esta semana', (cerrar) => {
    const lst = h('div', { class: 'lista compacta' });
    const q = h('input', { class: 'buscar', type: 'search', placeholder: 'Buscar receta…' });
    const pintarLista = () => {
      vaciar(lst);
      const t = q.value.trim().toLowerCase();
      const ya = new Set(lista().recetas.map((r) => r.ref_id));
      for (const r of [...datos.recetas.values()].filter((x) => x.nombre.toLowerCase().includes(t) && !ya.has(x.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))) {
        lst.append(h('button', {
          class: 'opcion', type: 'button',
          onclick: () => { cerrar(); cambiar((l) => l.recetas.push({ ref_id: r.id, veces: 1 })); },
        }, h('span', {}, r.nombre), h('span', { class: 'sub' }, r.tipo === 'componente' ? 'componente' : 'receta')));
      }
      if (!lst.firstChild) lst.append(h('p', { class: 'vacio' }, 'No hay más recetas.'));
    };
    q.addEventListener('input', pintarLista);
    pintarLista();
    return h('div', {}, q, lst);
  });

  const extraProducto = () => hoja('Añadir producto', (cerrar) => {
    const lst = h('div', { class: 'lista compacta' });
    const q = h('input', { class: 'buscar', type: 'search', placeholder: 'Buscar producto…' });
    const pintarLista = () => {
      vaciar(lst);
      const t = q.value.trim().toLowerCase();
      for (const p of [...datos.productos.values()].filter((x) => x.nombre.toLowerCase().includes(t)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).slice(0, 40)) {
        lst.append(h('button', {
          class: 'opcion', type: 'button',
          onclick: () => { cerrar(); cambiar((l) => l.extras.push({ id: nuevoId('x'), tipo: 'producto', ref_id: p.id, nombre: p.nombre, packs: 1 })); },
        }, h('span', {}, p.nombre), h('span', { class: 'sub' }, `${p.tienda || ''} · ${p.precio != null ? eur(p.precio) : 'sin precio'}`)));
      }
    };
    q.addEventListener('input', pintarLista);
    pintarLista();
    return h('div', {}, q, lst);
  });

  const extraLibre = () => hoja('Otra cosa', (cerrar) => {
    const tiendas = [...new Set([...datos.productos.values()].map((p) => p.tienda).filter(Boolean)), 'Otra'];
    const nombre = h('input', { class: 'entrada', type: 'text', placeholder: 'Ej. detergente' });
    const importe = h('input', { class: 'entrada', type: 'text', inputmode: 'decimal', placeholder: '0,00' });
    const tienda = h('select', { class: 'entrada' }, tiendas.map((t) => h('option', { value: t }, t)));
    const seccion = h('select', { class: 'entrada' }, Object.entries(SECCIONES).map(([k, v]) => h('option', { value: k, selected: k === 'despensa' }, v)));
    return h('div', {},
      h('label', {}, 'Nombre', nombre), h('label', {}, 'Precio estimado (€)', importe),
      h('label', {}, 'Tienda', tienda), h('label', {}, 'Sección', seccion),
      h('button', {
        class: 'btn', type: 'button', onclick: () => {
          if (!nombre.value.trim()) return aviso('Escribe un nombre', 'error');
          cerrar();
          cambiar((l) => l.extras.push({ id: nuevoId('x'), tipo: 'libre', nombre: nombre.value.trim(), importe: num(importe.value) || 0, tienda: tienda.value, seccion: seccion.value }));
        },
      }, 'Añadir'));
  });

  /* ---------- Registrar la compra ---------- */
  const registrar = (res) => hoja('Registrar compra', (cerrar) => {
    const l = lista();
    const todas = res.porTienda.flatMap((t) => t.secciones.flatMap((s) => s.lineas));
    const marcadas = todas.filter((x) => l.marcados.includes(x.clave));
    const lineas = marcadas.length ? marcadas : todas;
    const importe = h('input', { class: 'entrada grande-in', type: 'text', inputmode: 'decimal', value: String(Math.round(lineas.reduce((t, x) => t + x.coste, 0) * 100) / 100).replace('.', ',') });
    const concepto = h('input', { class: 'entrada', type: 'text', value: [...new Set(lineas.map((x) => x.tienda))].join(' + ') || 'Compra' });
    const alStock = h('input', { type: 'checkbox', checked: true });
    return h('div', {},
      h('p', { class: 'sub' }, marcadas.length ? `Se registran las ${marcadas.length} líneas marcadas.` : 'No hay nada marcado: se registra toda la lista.'),
      h('label', {}, 'Importe real (€)'), importe,
      h('label', {}, 'Concepto', concepto),
      h('label', { class: 'check' }, alStock, 'Añadir lo comprado al stock'),
      h('button', {
        class: 'btn', type: 'button', onclick: async () => {
          const v = num(importe.value);
          if (!(v >= 0)) return aviso('Importe no válido', 'error');
          await guardar('gastos', { id: nuevoId('g'), fecha: hoyISO, importe: v, concepto: concepto.value.trim() || 'Compra' });
          if (alStock.checked) {
            for (const x of lineas) if (x.producto && x.packs) await añadirAlStock(x.producto.id, x.packs, ubicacionPorDefecto(x.seccion));
          }
          cerrar();
          await cambiar((ll) => { ll.marcados = []; ll.extras = ll.extras.filter((e) => !lineas.some((x) => x.extraId === e.id)); });
          aviso('Compra registrada');
        },
      }, 'Guardar'));
  });

  /* ---------- Pantalla ---------- */
  function pintar() {
    vaciar(cont);
    const l = lista();
    const res = listaCompra(l, ctx, [...datos.inventario.values()]);
    const pres = resumenPresupuesto([...datos.gastos.values()], datos.ajustes, hoyISO);

    const recetas = h('section', { class: 'tarjeta' },
      h('h2', {}, 'Qué cocinas'),
      l.recetas.length === 0 && h('p', { class: 'ayuda' }, 'Añade las recetas de esta semana. Las cantidades de cada receta son las de la olla entera: pon 1,5 veces si cocinas más.'),
      l.recetas.length > 0 && h('ul', { class: 'ingredientes' }, l.recetas.map((it, i) => h('li', {},
        h('div', { class: 'ing-nombre' }, datos.recetas.get(it.ref_id)?.nombre ?? it.ref_id),
        h('div', { class: 'pasos' },
          h('button', { class: 'btn-icono', type: 'button', 'aria-label': 'Menos', onclick: () => cambiar((x) => { x.recetas[i].veces = Math.max(0.5, x.recetas[i].veces - 0.5); }) }, '−'),
          h('b', {}, `×${fmt(it.veces, 1)}`),
          h('button', { class: 'btn-icono', type: 'button', 'aria-label': 'Más', onclick: () => cambiar((x) => { x.recetas[i].veces += 0.5; }) }, '＋')),
        h('button', { class: 'btn-icono', type: 'button', 'aria-label': 'Quitar', onclick: () => cambiar((x) => x.recetas.splice(i, 1)) }, '✕')))),
      h('button', { class: 'btn secundario', type: 'button', onclick: elegirReceta }, '＋ Receta'));

    const extras = h('section', { class: 'tarjeta' },
      h('h2', {}, 'Extras'),
      l.extras.length > 0 && h('ul', { class: 'ingredientes' }, l.extras.map((x, i) => h('li', {},
        h('div', { class: 'ing-nombre' }, x.nombre),
        x.tipo === 'producto' && h('div', { class: 'pasos' },
          h('button', { class: 'btn-icono', type: 'button', 'aria-label': 'Menos', onclick: () => cambiar((ll) => { ll.extras[i].packs = Math.max(1, ll.extras[i].packs - 1); }) }, '−'),
          h('b', {}, `×${x.packs}`),
          h('button', { class: 'btn-icono', type: 'button', 'aria-label': 'Más', onclick: () => cambiar((ll) => { ll.extras[i].packs += 1; }) }, '＋')),
        h('button', { class: 'btn-icono', type: 'button', 'aria-label': 'Quitar', onclick: () => cambiar((ll) => ll.extras.splice(i, 1)) }, '✕')))),
      h('div', { class: 'acciones' },
        h('button', { class: 'btn secundario', type: 'button', onclick: extraProducto }, '＋ Producto'),
        h('button', { class: 'btn secundario', type: 'button', onclick: extraLibre }, '＋ Otra cosa')));

    const tiendas = res.porTienda.map((t) => h('section', { class: 'tarjeta' },
      h('h2', {}, `${t.tienda} · ${eur(t.total)}`),
      t.secciones.map((s) => h('div', {},
        h('h3', { class: 'subseccion' }, SECCIONES[s.seccion] ?? s.seccion),
        h('ul', { class: 'lista-compra' }, s.lineas.map((x) => {
          const hecho = l.marcados.includes(x.clave);
          const util = x.producto && (x.producto.escurrido_g || x.producto.envase_g);
          const detalle = x.libre ? '' : [
            x.origen === 'receta' ? `necesitas ${fmt(x.necesario_g)} g` : '',
            x.stock_g > 0 ? `tienes ${fmt(x.stock_g)} g` : '',
            x.sobra_g > 0 ? `sobran ${fmt(x.sobra_g)} g` : '',
          ].filter(Boolean).join(' · ');
          return h('li', { class: 'linea-compra' + (hecho ? ' hecho' : '') },
            h('label', { class: 'check' },
              h('input', { type: 'checkbox', checked: hecho, onchange: (e) => cambiar((ll) => { ll.marcados = e.target.checked ? [...ll.marcados, x.clave] : ll.marcados.filter((k) => k !== x.clave); }) }),
              h('span', { class: 'lc-texto' }, h('span', { class: 'lc-nombre' }, x.nombre), detalle && h('span', { class: 'sub bloque' }, detalle))),
            h('div', { class: 'ing-dato' },
              x.packs ? `${x.packs} × ${fmt(util)} g` : x.libre ? '' : `${fmt(x.comprar_g)} g`,
              h('span', { class: 'sub' }, x.coste ? eur(x.coste) : 'sin precio')));
        }))))));

    const resumen = h('section', { class: 'tarjeta destacada' },
      h('h2', {}, 'Total estimado'),
      h('div', { class: 'grande' }, h('span', { class: 'cifra' }, eur(res.total).replace(/\s?€/, '')), h('span', { class: 'unidad' }, ' €')),
      h('p', { class: `sub centro ${res.total > pres.restante ? 'alerta' : ''}` },
        `Presupuesto de ${pres.mes}: te quedan ${eur(pres.restante)} de ${eur(pres.presupuesto)}${res.total > pres.restante ? ' — esta lista se pasa' : ''}.`),
      res.porTienda.length > 0 && h('button', { class: 'btn', type: 'button', onclick: () => registrar(res) }, 'Registrar compra'),
      (l.recetas.length || l.extras.length) ? h('button', {
        class: 'btn peligro', type: 'button',
        onclick: () => confirm('¿Vaciar toda la lista?') && cambiar((ll) => { ll.recetas = []; ll.extras = []; ll.marcados = []; }),
      }, 'Vaciar lista') : null);

    montar(cont,
      recetas, extras,
      res.avisos.length > 0 && h('p', { class: 'banda alerta' }, res.avisos.join(' · ')),
      tiendas,
      res.porTienda.length === 0 && l.recetas.length + l.extras.length > 0 && h('p', { class: 'vacio' }, 'Con lo que tienes en stock no hace falta comprar nada.'),
      resumen);
  }

  montar(root, h('header', { class: 'cab' }, h('h1', {}, 'Compra')), pestanasCompra('lista'), cont);
  pintar();
}
