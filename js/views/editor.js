import { h, fmt, num, vaciar, aviso, hoja, insignia } from '../ui.js';
import { datos, ctx, guardar } from '../store.js';
import { totalesReceta } from '../calc.js';

/** Editor de receta (nueva si no hay id). */
export function editorReceta(root, { id }) {
  const existente = id ? datos.recetas.get(id) : null;
  if (id && !existente) {
    root.append(h('p', { class: 'vacio' }, 'Receta no encontrada.'));
    return;
  }
  const r = existente
    ? structuredClone(existente)
    : { nombre: '', tipo: 'plato', estado: 'ok', raciones: 2, peso_cocinado_g: null, notas: '', ingredientes: [] };

  const filas = h('div', { class: 'ing-editor' });
  const pie = h('p', { class: 'sub' });

  const nombreDe = (ing) => (ing.ref_tipo === 'receta' ? datos.recetas.get(ing.ref_id)?.nombre : datos.productos.get(ing.ref_id)?.nombre) ?? ing.ref_id;

  const resumen = () => {
    const t = totalesReceta({ ...r, id: r.id || '__nueva' }, ctx);
    pie.textContent = `${fmt(t.total.kcal)} kcal · P ${fmt(t.total.p)} g · C ${fmt(t.total.c)} g · G ${fmt(t.total.g)} g`;
  };

  const pintar = () => {
    vaciar(filas);
    if (!r.ingredientes.length) filas.append(h('p', { class: 'vacio' }, 'Añade ingredientes con el botón de abajo.'));
    r.ingredientes.forEach((ing, i) => {
      const prod = ing.ref_tipo === 'producto' ? datos.productos.get(ing.ref_id) : null;
      const equivUd = prod?.unidad_g ? h('span', { class: 'sub' }, ` ≈ ${fmt(ing.gramos / prod.unidad_g, 1)} ud`) : null;
      filas.append(h('div', { class: 'ing-fila' },
        h('div', { class: 'ing-cab' },
          h('strong', {}, nombreDe(ing)),
          ing.ref_tipo === 'receta' && h('span', { class: 'etiqueta' }, 'receta'),
          h('button', { class: 'btn-icono', type: 'button', 'aria-label': 'Quitar', onclick: () => { r.ingredientes.splice(i, 1); pintar(); } }, '✕')),
        h('div', { class: 'ing-campos' },
          h('label', {}, 'Gramos',
            h('input', {
              class: 'entrada', type: 'text', inputmode: 'decimal', value: ing.gramos || '',
              oninput: (e) => { ing.gramos = num(e.target.value) || 0; resumen(); },
            }), equivUd),
          prod?.rendimiento > 0 && h('label', {}, 'Peso',
            h('select', { class: 'entrada', onchange: (e) => { ing.modo = e.target.value; resumen(); } },
              h('option', { value: 'crudo', selected: (ing.modo || 'crudo') === 'crudo' }, 'en crudo'),
              h('option', { value: 'cocinado', selected: ing.modo === 'cocinado' }, 'ya cocinado'))),
          ing.ref_tipo === 'receta' && h('span', { class: 'sub' }, 'en gramos cocinados'),
          h('label', { class: 'check' },
            h('input', { type: 'checkbox', checked: !!ing.escala_pareja, onchange: (e) => { ing.escala_pareja = e.target.checked; } }),
            ` Rakan toma más`))));
    });
    resumen();
  };

  const añadir = () => hoja('Añadir ingrediente', (cerrar) => {
    const lista = h('div', { class: 'lista compacta' });
    const q = h('input', { class: 'buscar', type: 'search', placeholder: 'Buscar producto o receta…' });
    const pintarLista = () => {
      vaciar(lista);
      const t = q.value.trim().toLowerCase();
      const recs = [...datos.recetas.values()].filter((x) => x.id !== r.id && x.nombre.toLowerCase().includes(t));
      const prods = [...datos.productos.values()].filter((x) => x.nombre.toLowerCase().includes(t));
      const item = (nombre, sub, alElegir, badge) => h('button', { class: 'opcion', type: 'button', onclick: () => { alElegir(); cerrar(); pintar(); } },
        h('span', {}, nombre), h('span', { class: 'sub' }, sub), badge);
      recs.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).forEach((x) => lista.append(item(x.nombre, x.tipo === 'componente' ? 'componente' : 'receta',
        () => r.ingredientes.push({ ref_tipo: 'receta', ref_id: x.id, gramos: 0, escala_pareja: false }))));
      prods.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).slice(0, 80).forEach((x) => lista.append(item(x.nombre, `${fmt(x.kcal)} kcal/100 g`,
        () => r.ingredientes.push({ ref_tipo: 'producto', ref_id: x.id, gramos: 0, modo: 'crudo', escala_pareja: false }), insignia(x.estado))));
      if (!lista.children.length) lista.append(h('p', { class: 'vacio' }, 'Nada encontrado. Añade el producto en la pestaña Productos.'));
    };
    q.addEventListener('input', pintarLista);
    pintarLista();
    setTimeout(() => q.focus(), 50);
    return h('div', {}, q, lista);
  });

  const guardarForm = async () => {
    r.nombre = r.nombre.trim();
    if (!r.nombre) return aviso('Pon un nombre a la receta', 'error');
    if (!r.ingredientes.length) return aviso('Añade al menos un ingrediente', 'error');
    const sin = r.ingredientes.find((i) => !(i.gramos > 0));
    if (sin) return aviso(`Falta la cantidad de "${nombreDe(sin)}"`, 'error');
    if (r.estado === 'borrador' && existente) r.estado = 'ok';
    const g = await guardar('recetas', r);
    aviso('Receta guardada');
    location.hash = `#/receta/${g.id}`;
  };

  root.append(
    h('header', { class: 'cab' },
      h('a', { class: 'atras', href: existente ? `#/receta/${existente.id}` : '#/recetas', 'aria-label': 'Volver' }, '‹'),
      h('h1', {}, existente ? 'Editar receta' : 'Nueva receta')),
    h('section', { class: 'tarjeta' },
      h('label', {}, 'Nombre', h('input', { class: 'entrada', type: 'text', value: r.nombre, oninput: (e) => { r.nombre = e.target.value; } })),
      h('label', {}, 'Tipo',
        h('select', { class: 'entrada', onchange: (e) => { r.tipo = e.target.value; } },
          h('option', { value: 'plato', selected: r.tipo === 'plato' }, 'Plato'),
          h('option', { value: 'componente', selected: r.tipo === 'componente' }, 'Componente de batch (arroz, pollo…)'))),
      h('label', {}, 'Raciones que da (tuppers de Paula)',
        h('input', { class: 'entrada', type: 'text', inputmode: 'decimal', value: r.raciones || '', oninput: (e) => { r.raciones = num(e.target.value) || null; } })),
      h('label', {}, 'Peso total cocinado (g) — opcional ahora',
        h('input', { class: 'entrada', type: 'text', inputmode: 'decimal', value: r.peso_cocinado_g || '', oninput: (e) => { r.peso_cocinado_g = num(e.target.value) || null; } }))),
    h('section', { class: 'tarjeta' }, h('h2', {}, 'Ingredientes'), filas, pie,
      h('button', { class: 'btn secundario', type: 'button', onclick: añadir }, '＋ Añadir ingrediente')),
    h('section', { class: 'tarjeta' },
      h('label', {}, 'Notas', h('textarea', { class: 'entrada', rows: 3, oninput: (e) => { r.notas = e.target.value; } }, r.notas || ''))),
    h('div', { class: 'barra-fija' }, h('button', { class: 'btn', type: 'button', onclick: guardarForm }, 'Guardar receta')));
  pintar();
}
