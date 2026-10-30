// Textos con calorías para las listas donde eliges recetas o productos.
import { fmt } from '../ui.js';
import { ctx } from '../store.js';
import { kcalReceta } from '../dia.js';

/** "677 kcal por ración (4) · 2.708 en total", o "33 kcal" si es de una sola ración. */
export function kcalRecetaTexto(r) {
  const k = kcalReceta(r, ctx);
  if (k.individual) return `${fmt(k.total)} kcal`;
  return k.porRacion
    ? `${fmt(k.porRacion)} kcal por ración (${r.raciones}) · ${fmt(k.total)} en total`
    : `${fmt(k.total)} kcal en total`;
}

/** "89 kcal/100 g · 1 ud (95 g) = 247 kcal" */
export function kcalProductoTexto(p) {
  return `${fmt(p.kcal)} kcal/100 g${p.unidad_g ? ` · 1 ud (${fmt(p.unidad_g)} g) = ${fmt((p.kcal * p.unidad_g) / 100)} kcal` : ''}`;
}
