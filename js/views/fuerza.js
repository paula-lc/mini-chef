import { h, fmt, vaciar, aviso, montar } from '../ui.js';
import { datos, guardar } from '../store.js';
import { fechaLarga } from '../dia.js';
import { importarHevy, progresoFuerza, diasEntre } from '../progreso.js';
import { grafico } from './grafico.js';

export function fuerza(root) {
  const cont = h('div');

  const importar = async (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo) return;
    try {
      const entrenos = importarHevy(await archivo.text());
      const nuevos = entrenos.filter((w) => !datos.entrenos.has(w.id)).length;
      for (const w of entrenos) await guardar('entrenos', w);
      aviso(`${nuevos} entrenos nuevos (${entrenos.length - nuevos} ya estaban)`);
      pintar();
    } catch (err) {
      aviso(err.message || 'No se pudo leer el archivo', 'error');
    }
  };

  function pintar() {
    vaciar(cont);
    const entrenos = [...datos.entrenos.values()];
    const prog = progresoFuerza(entrenos);
    const ejercicios = [...prog.entries()]
      .map(([nombre, hist]) => ({ nombre, hist, ultimo: hist[hist.length - 1] }))
      .sort((a, b) => b.ultimo.fecha.localeCompare(a.ultimo.fecha) || a.nombre.localeCompare(b.nombre, 'es'));

    const fila = (ej) => {
      const conE1 = ej.hist.filter((s) => s.mejor);
      const primero = conE1[0]?.mejor.e1rm;
      const actual = conE1[conE1.length - 1]?.mejor.e1rm;
      const mejorMarca = conE1.length ? Math.max(...conE1.map((s) => s.mejor.e1rm)) : null;
      const detalle = h('div', { class: 'oculto' });
      return h('li', { class: 'fila-fuerza' },
        h('button', {
          class: 'enlace-btn', type: 'button', onclick: () => {
            detalle.classList.toggle('oculto');
            if (!detalle.firstChild) {
              const t0 = ej.hist[0].fecha;
              detalle.append(
                conE1.length > 1
                  ? grafico({ decimales: 0, series: [{ pts: conE1.map((s) => [diasEntre(t0, s.fecha), s.mejor.e1rm]), color: 'var(--green)', puntos: true }], etiquetaX: (d) => String(d) })
                  : h('p', { class: 'ayuda' }, 'Con un solo entreno aún no hay evolución.'),
                h('p', { class: 'sub' }, 'Eje horizontal: días desde el primer entreno. Vertical: 1RM estimado (Epley).'),
                h('ul', { class: 'ingredientes' }, [...ej.hist].reverse().slice(0, 6).map((s) => h('li', {},
                  h('div', { class: 'ing-nombre' }, fechaLarga(s.fecha), h('span', { class: 'sub bloque' }, `${s.series} series · volumen ${fmt(s.volumen)} kg`)),
                  h('div', { class: 'ing-dato' }, s.mejor ? `${fmt(s.mejor.kg, 1)} kg × ${fmt(s.mejor.reps)}` : '–')))));
            }
          },
        }, ej.nombre),
        h('p', { class: 'sub bloque' },
          conE1.length
            ? `1RM est. ${fmt(actual)} kg${primero != null && conE1.length > 1 ? ` (${actual - primero >= 0 ? '+' : ''}${fmt(actual - primero)} desde el inicio)` : ''} · mejor ${fmt(mejorMarca)} kg · último ${ej.ultimo.fecha}`
            : `Sin pesos registrados · último ${ej.ultimo.fecha}`),
        detalle);
    };

    montar(cont,
      h('section', { class: 'tarjeta' },
        h('h2', {}, 'Importar desde Hevy'),
        h('p', { class: 'sub' }, 'En Hevy: Perfil → Ajustes → Exportar datos (CSV). Elige aquí el archivo; puedes reimportarlo sin duplicar entrenos.'),
        h('label', { class: 'btn subir' }, 'Elegir CSV de Hevy…', h('input', { type: 'file', accept: '.csv,text/csv', onchange: importar, hidden: true })),
        h('p', { class: 'sub' }, `${entrenos.length} entrenos guardados.`)),
      ejercicios.length > 0 && h('section', { class: 'tarjeta' },
        h('h2', {}, 'Ejercicios'),
        h('ul', { class: 'lista-fuerza' }, ejercicios.map(fila))),
      ejercicios.length === 0 && h('p', { class: 'vacio' }, 'Importa tu CSV para ver la evolución de tus levantamientos.'));
  }

  montar(root,
    h('header', { class: 'cab' }, h('a', { class: 'atras', href: '#/progreso', 'aria-label': 'Volver' }, '‹'), h('h1', {}, 'Fuerza')),
    cont);
  pintar();
}
