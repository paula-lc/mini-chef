// Gráfico de líneas en SVG sin dependencias. series: [{ pts: [[x, y]], color, puntos?, discontinua? }]
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, ...hijos) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...hijos);
  return e;
};

export function grafico({ series, decimales = 1, ancho = 340, alto = 190, etiquetaX = null }) {
  const todos = series.flatMap((s) => s.pts);
  const svg = el('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'grafico', role: 'img' });
  if (!todos.length) return svg;
  const m = { l: 40, r: 10, t: 10, b: 22 };
  let [x0, x1] = [Math.min(...todos.map((p) => p[0])), Math.max(...todos.map((p) => p[0]))];
  let [y0, y1] = [Math.min(...todos.map((p) => p[1])), Math.max(...todos.map((p) => p[1]))];
  if (x1 === x0) x1 = x0 + 1;
  const pad = (y1 - y0) * 0.12 || 0.5;
  y0 -= pad; y1 += pad;
  const X = (x) => m.l + ((x - x0) / (x1 - x0)) * (ancho - m.l - m.r);
  const Y = (y) => m.t + (1 - (y - y0) / (y1 - y0)) * (alto - m.t - m.b);
  for (let i = 0; i < 4; i++) {
    const v = y0 + ((y1 - y0) * i) / 3;
    svg.append(
      el('line', { x1: m.l, x2: ancho - m.r, y1: Y(v), y2: Y(v), class: 'g-rejilla' }),
      el('text', { x: m.l - 5, y: Y(v) + 4, class: 'g-eje', 'text-anchor': 'end' }, v.toFixed(decimales).replace('.', ',')));
  }
  if (etiquetaX) {
    svg.append(
      el('text', { x: X(x0), y: alto - 5, class: 'g-eje' }, etiquetaX(x0)),
      el('text', { x: X(x1), y: alto - 5, class: 'g-eje', 'text-anchor': 'end' }, etiquetaX(x1)));
  }
  for (const s of series) {
    const orden = [...s.pts].sort((a, b) => a[0] - b[0]);
    if (orden.length > 1 && s.linea !== false) {
      svg.append(el('polyline', {
        points: orden.map((p) => `${X(p[0])},${Y(p[1])}`).join(' '), fill: 'none', stroke: s.color,
        'stroke-width': s.grosor || 3, 'stroke-dasharray': s.discontinua ? '6 5' : '', 'stroke-linejoin': 'round',
      }));
    }
    if (s.puntos) for (const p of orden) svg.append(el('circle', { cx: X(p[0]), cy: Y(p[1]), r: s.radio || 3.5, fill: s.color, stroke: 'var(--ink)', 'stroke-width': 1.5 }));
  }
  return svg;
}
