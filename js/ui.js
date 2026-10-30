// Utilidades de interfaz: construcción de DOM, formato en español, avisos y hojas inferiores.

export function h(tag, attrs = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  const añadir = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(añadir);
    else el.append(c.nodeType ? c : document.createTextNode(String(c)));
  };
  hijos.forEach(añadir);
  return el;
}

/** Como root.append(), pero ignora false/null (para condicionales). */
export function montar(el, ...hijos) {
  el.append(...h('div', {}, ...hijos).childNodes);
}

export const fmt = (n, d = 0) =>
  n == null || Number.isNaN(n) ? '–' : n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
export const eur = (n) => (n == null ? '–' : n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }));
/** Lee un número escrito con coma o punto. Devuelve NaN si está vacío. */
export const num = (v) => parseFloat(String(v ?? '').replace(',', '.'));

export function vaciar(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function aviso(texto, tipo = '') {
  let caja = document.getElementById('avisos');
  if (!caja) {
    caja = h('div', { id: 'avisos', 'aria-live': 'polite' });
    document.body.append(caja);
  }
  const t = h('div', { class: `aviso ${tipo}` }, texto);
  caja.append(t);
  setTimeout(() => t.remove(), 3200);
}

/** Hoja inferior modal. `contenido(cerrar)` devuelve el nodo a mostrar. */
export function hoja(titulo, contenido) {
  const cerrar = () => fondo.remove();
  const fondo = h('div', { class: 'fondo', onclick: (e) => e.target === fondo && cerrar() },
    h('div', { class: 'hoja', role: 'dialog', 'aria-label': titulo },
      h('div', { class: 'hoja-cab' }, h('h2', {}, titulo), h('button', { class: 'btn-icono', 'aria-label': 'Cerrar', onclick: cerrar }, '✕')),
      contenido(cerrar)));
  document.body.append(fondo);
  return cerrar;
}

/** Chips de macros: kcal · P · C · G con las unidades. */
export function macrosChips(m, { fibra = false } = {}) {
  return h('div', { class: 'macros' },
    h('span', { class: 'chip kcal' }, h('b', {}, fmt(m.kcal)), ' kcal'),
    h('span', { class: 'chip p' }, 'P ', h('b', {}, fmt(m.p, 0)), ' g'),
    h('span', { class: 'chip c' }, 'C ', h('b', {}, fmt(m.c, 0)), ' g'),
    h('span', { class: 'chip g' }, 'G ', h('b', {}, fmt(m.g, 0)), ' g'),
    fibra && h('span', { class: 'chip f' }, 'Fibra ', h('b', {}, fmt(m.fibra, 0)), ' g'));
}

export const ETIQUETA_ESTADO = { verificado: 'Verificado', pendiente: 'Pendiente', revisar: 'Revisar' };
export const insignia = (estado) => h('span', { class: `insignia ${estado}` }, ETIQUETA_ESTADO[estado] ?? estado);

export const SECCIONES = {
  congelados: 'Congelados', carniceria: 'Carnicería', lacteos: 'Lácteos',
  fruta_verdura: 'Fruta y verdura', despensa: 'Despensa',
};

export function debounce(fn, ms = 350) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
