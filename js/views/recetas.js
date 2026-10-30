import { h, fmt, eur, num, vaciar, aviso, macrosChips, debounce, montar } from '../ui.js';
import { datos, ctx, guardar, borrar } from '../store.js';
import { totalesReceta, porGramoCocinado, calcularRaciones } from '../calc.js';

/* ---------- Lista ---------- */
export function listaRecetas(root) {
  let filtro = 'todas';
  let texto = '';
  const lista = h('div', { class: 'lista' });

  const pintar = () => {
    vaciar(lista);
    const q = texto.trim().toLowerCase();
    const rs = [...datos.recetas.values()]
      .filter((r) => (filtro === 'todas' || r.tipo === filtro) && r.nombre.toLowerCase().includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (!rs.length) lista.append(h('p', { class: 'vacio' }, 'No hay recetas con ese filtro.'));
    for (const r of rs) {
      const t = totalesReceta(r, ctx);
      const n = r.raciones > 0 ? r.raciones : null;
      lista.append(h('a', { class: 'tarjeta enlace', href: `#/receta/${r.id}` },
        h('div', { class: 'fila' },
          h('h3', {}, r.nombre),
          r.tipo === 'componente' && h('span', { class: 'etiqueta' }, 'Componente'),
          r.estado === 'borrador' && h('span', { class: 'etiqueta aviso-et' }, 'Borrador')),
        n
          ? h('p', { class: 'sub' }, `${fmt(t.total.kcal / n)} kcal · ${fmt(t.total.p / n)} g P por ración (${n}) · ${eur(t.total.coste / n)}`)
          : h('p', { class: 'sub' }, `${fmt(t.total.kcal)} kcal en total`),
        !(r.peso_cocinado_g > 0) && h('p', { class: 'sub alerta' }, 'Falta el peso cocinado')));
    }
  };

  const chip = (id, texto2) => h('button', {
    class: 'filtro' + (filtro === id ? ' activo' : ''),
    onclick: (e) => {
      filtro = id;
      e.target.parentElement.querySelectorAll('.filtro').forEach((b) => b.classList.remove('activo'));
      e.target.classList.add('activo');
      pintar();
    },
  }, texto2);

  root.append(
    h('header', { class: 'cab' }, h('h1', {}, 'Recetas')),
    h('input', { class: 'buscar', type: 'search', placeholder: 'Buscar receta…', oninput: (e) => { texto = e.target.value; pintar(); } }),
    h('div', { class: 'filtros' }, chip('todas', 'Todas'), chip('plato', 'Platos'), chip('componente', 'Componentes')),
    lista,
    h('a', { class: 'fab', href: '#/recetas/nueva' }, '＋ Nueva receta'));
  pintar();
}

/* ---------- Detalle con calculadora de tupper ---------- */
export function detalleReceta(root, { id }) {
  const receta = datos.recetas.get(id);
  if (!receta) {
    root.append(h('p', { class: 'vacio' }, 'Receta no encontrada.'), h('a', { class: 'btn', href: '#/recetas' }, 'Volver'));
    return;
  }
  const mult = datos.ajustes.multiplicador_pareja ?? 1.6;
  const tot = totalesReceta(receta, ctx);
  const porG = porGramoCocinado(receta, tot.total);

  // estado de la calculadora (se recuerda por receta)
  const calc = {
    modo: receta.modo_tupper || 'kcal',
    kcal: receta.kcal_objetivo || datos.ajustes.kcal_tupper || 550,
    n: receta.raciones || 2,
  };

  const resultado = h('div', { class: 'resultado' });
  const guardarCalc = debounce(() => guardar('recetas', receta), 400);

  const pintarResultado = () => {
    vaciar(resultado);
    if (!(receta.peso_cocinado_g > 0)) {
      resultado.append(h('p', { class: 'ayuda' }, 'Escribe el peso total cocinado para calcular cuántos gramos poner en cada tupper.'));
      return;
    }
    const r = calcularRaciones(receta, tot, { modo: calc.modo, kcal: calc.kcal, n: calc.n, mult });
    if (!r) {
      resultado.append(h('p', { class: 'ayuda alerta' }, 'No se puede calcular: revisa los valores introducidos.'));
      return;
    }
    resultado.append(
      h('div', { class: 'grande' },
        h('span', { class: 'cifra' }, fmt(r.gramos_tupper)), h('span', { class: 'unidad' }, ' g por tupper')),
      h('p', { class: 'sub centro' }, `≈ ${fmt(r.raciones_equivalentes, 1)} raciones de ese tamaño en toda la olla`),
      h('div', { class: 'dos' },
        h('div', { class: 'persona' },
          h('h4', {}, 'Paula'),
          h('p', { class: 'gramos' }, `${fmt(r.paula.gramos)} g`),
          macrosChips(r.paula),
          h('p', { class: 'sub' }, `Coste ${eur(r.paula.coste)}`)),
        h('div', { class: 'persona rakan' },
          h('h4', {}, `Rakan (×${fmt(mult, 1)} hidrato)`),
          h('p', { class: 'gramos' }, `${fmt(r.rakan.gramos)} g`),
          r.rakan.extras.length > 0 && h('p', { class: 'extra' }, '+ aparte: ',
            r.rakan.extras.map((e, i) => h('span', {}, i ? ' · ' : '', `${fmt(e.gramos)} g ${e.nombre.toLowerCase()}${e.modo === 'crudo' ? ' (crudo)' : ''}${e.cocinado_g ? ` ≈ ${fmt(e.cocinado_g)} g cocido` : ''}`))),
          macrosChips(r.rakan),
          h('p', { class: 'sub' }, `Coste ${eur(r.rakan.coste)}`))));
  };

  const campoPeso = h('input', {
    id: 'peso', class: 'entrada grande-in', type: 'text', inputmode: 'decimal', placeholder: '0',
    value: receta.peso_cocinado_g || '',
    oninput: (e) => {
      const v = num(e.target.value);
      receta.peso_cocinado_g = v > 0 ? v : null;
      guardarCalc();
      pintarResultado();
    },
  });

  const valor = h('input', {
    id: 'valor', class: 'entrada', type: 'text', inputmode: 'decimal',
    value: calc.modo === 'kcal' ? calc.kcal : calc.n,
    oninput: (e) => {
      const v = num(e.target.value);
      if (calc.modo === 'kcal') { calc.kcal = v; receta.kcal_objetivo = v > 0 ? v : null; } else calc.n = v;
      guardarCalc();
      pintarResultado();
    },
  });
  const etiquetaValor = h('label', { for: 'valor' }, calc.modo === 'kcal' ? 'kcal por tupper (Paula)' : 'Nº de tuppers');

  const modoBtn = (m, texto) => h('button', {
    class: 'seg' + (calc.modo === m ? ' activo' : ''), type: 'button',
    onclick: (e) => {
      calc.modo = m;
      receta.modo_tupper = m;
      e.target.parentElement.querySelectorAll('.seg').forEach((b) => b.classList.remove('activo'));
      e.target.classList.add('activo');
      valor.value = m === 'kcal' ? calc.kcal : calc.n;
      etiquetaValor.textContent = m === 'kcal' ? 'kcal por tupper (Paula)' : 'Nº de tuppers';
      guardarCalc();
      pintarResultado();
    },
  }, texto);

  const porRacion = receta.raciones > 0 ? receta.raciones : null;

  montar(root,
    h('header', { class: 'cab' },
      h('a', { class: 'atras', href: '#/recetas', 'aria-label': 'Volver' }, '‹'),
      h('h1', {}, receta.nombre),
      h('a', { class: 'btn-icono', href: `#/receta/${receta.id}/editar`, 'aria-label': 'Editar' }, '✎')),
    receta.estado === 'borrador' && h('p', { class: 'banda' }, 'Borrador con cantidades estimadas. Ajústalo a tu receta real.'),
    tot.avisos.length > 0 && h('div', { class: 'banda alerta' }, tot.avisos.map((a) => h('div', {}, a))),

    h('section', { class: 'tarjeta' },
      h('h2', {}, 'Receta completa'),
      macrosChips(tot.total, { fibra: true }),
      h('p', { class: 'sub' }, `Coste total ${eur(tot.total.coste)}`
        + (porRacion ? ` · ${eur(tot.total.coste / porRacion)} por ración (${porRacion})` : '')),
      porG && h('p', { class: 'sub' }, `Por 100 g cocinado: ${fmt(porG.kcal * 100)} kcal · P ${fmt(porG.p * 100, 1)} · C ${fmt(porG.c * 100, 1)} · G ${fmt(porG.g * 100, 1)}`)),

    h('section', { class: 'tarjeta destacada' },
      h('h2', {}, 'Al terminar: ¿cuánto en cada tupper?'),
      h('label', { for: 'peso' }, 'Peso total cocinado (g)'),
      campoPeso,
      h('div', { class: 'segmentos' }, modoBtn('kcal', 'Por kcal'), modoBtn('raciones', 'Por nº de raciones')),
      etiquetaValor, valor,
      resultado),

    h('section', { class: 'tarjeta' },
      h('h2', {}, 'Ingredientes'),
      h('ul', { class: 'ingredientes' }, tot.lineas.map((l) => h('li', {},
        h('div', { class: 'ing-nombre' }, l.nombre,
          l.ing.escala_pareja && h('span', { class: 'etiqueta' }, `Rakan ×${fmt(mult, 1)}`)),
        h('div', { class: 'ing-dato' },
          `${fmt(l.gramos)} g`,
          l.ing.ref_tipo === 'receta' ? ' cocinado' : (l.ing.modo === 'cocinado' ? ' cocinado' : ''),
          h('span', { class: 'sub' }, ` · ${fmt(l.macros.kcal)} kcal · ${eur(l.macros.coste)}`)))))),

    receta.notas && h('section', { class: 'tarjeta' }, h('h2', {}, 'Notas'), h('p', {}, receta.notas)),

    h('div', { class: 'acciones' },
      h('button', {
        class: 'btn secundario', onclick: async () => {
          const copia = { ...structuredClone(receta), id: undefined, nombre: `${receta.nombre} (copia)`, estado: 'borrador' };
          delete copia.id; delete copia.creado; delete copia.actualizado;
          const nueva = await guardar('recetas', copia);
          location.hash = `#/receta/${nueva.id}`;
        },
      }, 'Duplicar'),
      h('button', {
        class: 'btn peligro', onclick: async () => {
          const usada = [...datos.recetas.values()].filter((r) => r.id !== receta.id && r.ingredientes.some((i) => i.ref_tipo === 'receta' && i.ref_id === receta.id));
          const extra = usada.length ? `\nLa usan: ${usada.map((r) => r.nombre).join(', ')}.` : '';
          if (!confirm(`¿Borrar "${receta.nombre}"?${extra}`)) return;
          await borrar('recetas', receta.id);
          aviso('Receta borrada');
          location.hash = '#/recetas';
        },
      }, 'Borrar')));
  pintarResultado();
}
