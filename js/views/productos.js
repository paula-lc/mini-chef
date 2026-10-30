import { h, fmt, eur, num, vaciar, aviso, insignia, SECCIONES } from '../ui.js';
import { datos, guardar, borrar } from '../store.js';
import { validarKcal, kcalCalculadas, eurKg } from '../calc.js';
import { slug } from '../repo.js';

/* ---------- Lista ---------- */
export function listaProductos(root) {
  let filtro = 'todos';
  let texto = '';
  const lista = h('div', { class: 'lista' });
  const resumen = h('p', { class: 'sub' });

  const pintar = () => {
    vaciar(lista);
    const q = texto.trim().toLowerCase();
    const todos = [...datos.productos.values()];
    const cuenta = (e) => todos.filter((p) => p.estado === e).length;
    resumen.textContent = `${todos.length} productos · ${cuenta('verificado')} verificados · ${cuenta('pendiente')} pendientes · ${cuenta('revisar')} por revisar`;
    const ps = todos
      .filter((p) => (filtro === 'todos' || p.estado === filtro) && p.nombre.toLowerCase().includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (!ps.length) lista.append(h('p', { class: 'vacio' }, 'No hay productos con ese filtro.'));
    for (const p of ps) {
      lista.append(h('a', { class: 'tarjeta enlace', href: `#/producto/${p.id}` },
        h('div', { class: 'fila' }, h('h3', {}, p.nombre), insignia(p.estado)),
        h('p', { class: 'sub' }, `${fmt(p.kcal)} kcal · P ${fmt(p.p, 1)} · C ${fmt(p.c, 1)} · G ${fmt(p.g, 1)} · fibra ${p.fibra == null ? '–' : fmt(p.fibra, 1)} (por 100 g)`),
        h('p', { class: 'sub' }, `${p.tienda} · ${eur(p.precio)}${eurKg(p) != null ? ` · ${eur(eurKg(p))}/kg` : ''}${p.estimado ? ' · valores estimados' : ''}`)));
    }
  };

  const chip = (id, t) => h('button', {
    class: 'filtro' + (filtro === id ? ' activo' : ''),
    onclick: (e) => {
      filtro = id;
      e.target.parentElement.querySelectorAll('.filtro').forEach((b) => b.classList.remove('activo'));
      e.target.classList.add('activo');
      pintar();
    },
  }, t);

  root.append(
    h('header', { class: 'cab' }, h('h1', {}, 'Productos')),
    resumen,
    h('input', { class: 'buscar', type: 'search', placeholder: 'Buscar producto…', oninput: (e) => { texto = e.target.value; pintar(); } }),
    h('div', { class: 'filtros' }, chip('todos', 'Todos'), chip('pendiente', 'Pendientes'), chip('revisar', 'Revisar'), chip('verificado', 'Verificados')),
    lista,
    h('a', { class: 'fab', href: '#/productos/nuevo' }, '＋ Nuevo producto'));
  pintar();
}

/* ---------- Formulario (nuevo o editar) ---------- */
export function formProducto(root, { id }) {
  const existente = id ? datos.productos.get(id) : null;
  if (id && !existente) {
    root.append(h('p', { class: 'vacio' }, 'Producto no encontrado.'));
    return;
  }
  const p = existente
    ? structuredClone(existente)
    : { nombre: '', tienda: 'Mercadona', seccion: 'despensa', kcal: '', p: '', c: '', g: '', fibra: '', envase_g: '', precio: '', estado: 'verificado', fuente: 'manual', estimado: false };

  const check = h('p', { class: 'sub' });
  const eurkg = h('p', { class: 'sub' });
  const leerNum = (v) => { const n = num(v); return Number.isNaN(n) ? null : n; };

  const actual = () => ({
    ...p, kcal: leerNum(p.kcal), p: leerNum(p.p), c: leerNum(p.c), g: leerNum(p.g), fibra: leerNum(p.fibra),
    envase_g: leerNum(p.envase_g), escurrido_g: leerNum(p.escurrido_g), precio: leerNum(p.precio),
  });

  const refrescar = () => {
    const x = actual();
    if ([x.kcal, x.p, x.c, x.g].some((v) => v == null)) { check.textContent = ''; }
    else {
      const v = validarKcal(x);
      check.textContent = v.ok ? `✓ Cuadra: 4P+4C+9G${x.fibra ? '+2·fibra' : ''} = ${v.calculadas} kcal`
        : `⚠ No cuadra: los macros dan ${v.calculadas} kcal y has puesto ${fmt(x.kcal)}. Revisa la etiqueta.`;
      check.className = 'sub ' + (v.ok ? 'ok' : 'alerta');
    }
    const kg = x.precio != null ? eurKg(x) : null;
    eurkg.textContent = kg != null ? `${eur(kg)}/kg${x.escurrido_g ? ' (sobre peso escurrido)' : ''}` : '';
  };

  const campo = (etiqueta, clave, { tipo = 'numero', ayuda } = {}) => h('label', {}, etiqueta,
    h('input', {
      class: 'entrada', type: 'text', inputmode: tipo === 'numero' ? 'decimal' : 'text',
      value: p[clave] ?? '', oninput: (e) => { p[clave] = e.target.value; refrescar(); },
    }), ayuda && h('span', { class: 'sub' }, ayuda));

  const guardarForm = async () => {
    const x = actual();
    if (!String(x.nombre).trim()) return aviso('Pon un nombre', 'error');
    if ([x.kcal, x.p, x.c, x.g].some((v) => v == null)) return aviso('Rellena kcal, proteína, hidratos y grasa (por 100 g)', 'error');
    if (x.precio == null) return aviso('Pon el precio del envase', 'error');
    if (!(x.envase_g > 0) && !(x.escurrido_g > 0)) return aviso('Pon el peso del envase (g)', 'error');
    x.nombre = x.nombre.trim();
    x.unidad_g = leerNum(p.unidad_g);
    x.rendimiento = leerNum(p.rendimiento);
    if (!x.unidad_g) delete x.unidad_g;
    if (!x.rendimiento) delete x.rendimiento;
    x.eur_kg = Math.round(eurKg(x) * 100) / 100;
    x.kcal_calculada = Math.round(kcalCalculadas(x));
    if (x.estado !== 'verificado' && !validarKcal(x).ok) x.estado = 'revisar';
    if (x.estado === 'verificado') { x.estimado = false; delete x.estimado_parcial; if (x.fuente !== 'paula') x.fuente = 'paula'; }
    if (!existente) x.id = slug(x.nombre) || undefined;
    if (!existente && datos.productos.has(x.id)) x.id = `${x.id}-${Math.random().toString(36).slice(2, 5)}`;
    const g = await guardar('productos', x);
    aviso('Producto guardado');
    location.hash = '#/productos';
    return g;
  };

  const usos = existente
    ? [...datos.recetas.values()].filter((r) => r.ingredientes.some((i) => i.ref_tipo === 'producto' && i.ref_id === existente.id))
    : [];

  const form = h('div', {},
    h('section', { class: 'tarjeta' },
      campo('Nombre', 'nombre', { tipo: 'texto' }),
      h('label', {}, 'Tienda', h('input', { class: 'entrada', type: 'text', list: 'tiendas', value: p.tienda, oninput: (e) => { p.tienda = e.target.value; } }),
        h('datalist', { id: 'tiendas' }, ['Mercadona', 'Lidl', 'Frutería', 'Huevos camperos', 'Online'].map((t) => h('option', { value: t })))),
      h('label', {}, 'Sección de la compra',
        h('select', { class: 'entrada', onchange: (e) => { p.seccion = e.target.value; } },
          Object.entries(SECCIONES).map(([k, v]) => h('option', { value: k, selected: p.seccion === k }, v))))),
    h('section', { class: 'tarjeta' },
      h('h2', {}, 'Etiqueta · valores por 100 g'),
      h('div', { class: 'rejilla' },
        campo('Energía (kcal)', 'kcal'), campo('Proteína (g)', 'p'), campo('Hidratos (g)', 'c'),
        campo('Grasa (g)', 'g'), campo('Fibra (g)', 'fibra', { ayuda: 'Vacío si no sale' })),
      check),
    h('section', { class: 'tarjeta' },
      h('h2', {}, 'Envase y precio'),
      h('div', { class: 'rejilla' },
        campo('Peso del envase (g)', 'envase_g'), campo('Peso escurrido (g)', 'escurrido_g', { ayuda: 'Si aplica' }),
        campo('Precio (€)', 'precio'),
        campo('Peso de 1 unidad (g)', 'unidad_g', { ayuda: 'Huevo, pan, limón…' }),
        campo('Rendimiento al cocinar', 'rendimiento', { ayuda: 'Arroz 2,7 = 100 g crudo → 270 g' })),
      eurkg),
    h('section', { class: 'tarjeta' },
      h('label', {}, 'Estado',
        h('select', { class: 'entrada', onchange: (e) => { p.estado = e.target.value; } },
          h('option', { value: 'verificado', selected: p.estado === 'verificado' }, 'Verificado (lo he comprobado en la etiqueta)'),
          h('option', { value: 'pendiente', selected: p.estado === 'pendiente' }, 'Pendiente de confirmar'),
          h('option', { value: 'revisar', selected: p.estado === 'revisar' }, 'Revisar'))),
      existente && h('p', { class: 'sub' }, `Fuente: ${p.fuente}${p.estimado ? ' · valores estimados' : ''}`),
      p.notas && h('p', { class: 'sub' }, p.notas),
      p.url_producto && h('a', { class: 'sub', href: p.url_producto, target: '_blank', rel: 'noopener' }, 'Ver en la tienda ↗')),
    existente && h('div', { class: 'acciones' },
      h('button', {
        class: 'btn peligro', type: 'button', onclick: async () => {
          if (usos.length && !confirm(`Lo usan ${usos.length} receta(s): ${usos.map((r) => r.nombre).join(', ')}.\n¿Borrar igualmente?`)) return;
          if (!usos.length && !confirm(`¿Borrar "${existente.nombre}"?`)) return;
          await borrar('productos', existente.id);
          location.hash = '#/productos';
        },
      }, 'Borrar producto')),
    h('div', { class: 'barra-fija' }, h('button', { class: 'btn', type: 'button', onclick: guardarForm }, 'Guardar')));

  root.append(
    h('header', { class: 'cab' },
      h('a', { class: 'atras', href: '#/productos', 'aria-label': 'Volver' }, '‹'),
      h('h1', {}, existente ? 'Editar producto' : 'Nuevo producto')),
    form);
  refrescar();
}
