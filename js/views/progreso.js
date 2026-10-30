import { h, fmt, num, vaciar, aviso, montar } from '../ui.js';
import { repo, datos, guardar, borrar } from '../store.js';
import { fechaISO, fechaLarga } from '../dia.js';
import {
  mediaMovil, pesoPlan, ritmoPlan, estadoPlan, sugerenciaAjuste, faseCiclo, FASES, diasEntre, sumarDias,
} from '../progreso.js';
import { grafico } from './grafico.js';

const kg = (n) => (n == null ? '–' : `${fmt(n, 2)} kg`);
const signo = (n, d = 2) => (n == null ? '–' : `${n > 0 ? '+' : ''}${fmt(n, d)}`);

export function progreso(root) {
  const hoyISO = fechaISO();
  const cont = h('div');
  const pesos = () => [...datos.pesos.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const guardarAjustes = async (a) => { await repo.guardarAjustes(a); datos.ajustes = await repo.ajustes(); pintar(); };

  function tarjetaPeso() {
    const fecha = h('input', { class: 'entrada', type: 'date', value: hoyISO, max: hoyISO });
    const valor = h('input', { class: 'entrada grande-in', type: 'text', inputmode: 'decimal', placeholder: '0,0' });
    const existente = () => datos.pesos.get(fecha.value);
    const rellenar = () => { valor.value = existente() ? String(existente().kg).replace('.', ',') : ''; };
    fecha.addEventListener('change', rellenar);
    rellenar();
    const e = estadoPlan(pesos(), datos.ajustes, hoyISO);
    return h('section', { class: 'tarjeta' },
      h('h2', {}, 'Peso'),
      h('label', {}, 'Fecha', fecha),
      h('label', {}, 'Peso en ayunas (kg)'), valor,
      h('button', {
        class: 'btn', type: 'button', onclick: async () => {
          const v = num(valor.value);
          if (!(v >= 25 && v <= 250) || !fecha.value) return aviso('Escribe un peso válido', 'error');
          await guardar('pesos', { id: fecha.value, fecha: fecha.value, kg: v });
          aviso('Peso guardado');
          pintar();
        },
      }, 'Guardar peso'),
      h('div', { class: 'datos-peso' },
        h('div', {}, h('span', { class: 'sub' }, 'Media 7 días'), h('b', {}, kg(e.media))),
        h('div', {}, h('span', { class: 'sub' }, 'Plan de hoy'), h('b', {}, kg(e.esperado))),
        h('div', {}, h('span', { class: 'sub' }, 'Diferencia'), h('b', { class: e.diferencia > 0.3 ? 'alerta' : '' }, e.diferencia == null ? '–' : `${signo(e.diferencia)} kg`)),
        h('div', {}, h('span', { class: 'sub' }, 'Ritmo real'), h('b', {}, e.ritmo_real == null ? '–' : `${signo(e.ritmo_real)} kg/sem`))),
      h('p', { class: 'sub' }, `Plan: ${kg(datos.ajustes.plan_peso_inicio)} el ${datos.ajustes.plan_fecha_inicio} → ${kg(datos.ajustes.plan_peso_fin)} el ${datos.ajustes.plan_fecha_fin} (${signo(ritmoPlan(datos.ajustes))} kg/semana). La media de 7 días es la que cuenta: el peso de un día suelta mucho ruido.`));
  }

  function tarjetaGrafico() {
    const a = datos.ajustes;
    const ps = pesos();
    const x = (f) => diasEntre(a.plan_fecha_inicio, f);
    const totalDias = x(a.plan_fecha_fin);
    const ultimo = ps.length ? Math.max(x(ps[ps.length - 1].fecha), 0) : 0;
    const desde = ps.length ? Math.min(0, x(ps[0].fecha)) : 0;
    const etiqueta = (d) => sumarDias(a.plan_fecha_inicio, Math.round(d)).slice(5).split('-').reverse().join('/');
    return h('section', { class: 'tarjeta' },
      h('h2', {}, 'Evolución'),
      grafico({
        etiquetaX: etiqueta, decimales: 1,
        series: [
          { pts: [[desde, pesoPlan(a, sumarDias(a.plan_fecha_inicio, desde))], [Math.max(totalDias, ultimo), a.plan_peso_fin]], color: 'var(--purple)', discontinua: true },
          { pts: ps.map((p) => [x(p.fecha), p.kg]), color: 'var(--peach)', puntos: true, linea: false, radio: 3 },
          { pts: ps.map((p) => [x(p.fecha), mediaMovil(ps, p.fecha).media]), color: 'var(--pink)', grosor: 4 },
        ],
      }),
      h('p', { class: 'leyenda' },
        h('span', { class: 'ley plan' }, 'Plan'), h('span', { class: 'ley dia' }, 'Peso diario'), h('span', { class: 'ley media' }, 'Media 7 d')),
      ps.length === 0 && h('p', { class: 'ayuda' }, 'Guarda tu primer peso para ver la gráfica.'));
  }

  function tarjetaAjuste() {
    const a = datos.ajustes;
    const s = sugerenciaAjuste(pesos(), a, hoyISO);
    const ciclo = faseCiclo(a.ciclo_inicios, hoyISO, a.ciclo_duracion);
    const textos = {
      faltan_datos: 'Para evaluar el plan necesito al menos 3 pesos en cada una de las últimas 3 semanas.',
      esperando: 'Aplicaste un ajuste hace menos de 2 semanas: espera para ver su efecto.',
      adelantada: 'Vas por debajo del plan: no hace falta recortar nada.',
      bien: 'Estás bajando a buen ritmo: no toques nada.',
      plana: `Dos semanas sin bajar (medias ${s.medias?.map((m) => fmt(m, 2)).join(' → ')} kg).`,
    };
    return h('section', { class: `tarjeta${s.aplica ? ' destacada' : ''}` },
      h('h2', {}, 'Ajuste de calorías'),
      h('p', {}, textos[s.estado]),
      s.aplica && h('p', { class: 'sub' }, 'Sugerencia: −100 kcal al día en entreno y descanso.'),
      s.aplica && ciclo && ['lutea', 'menstrual'].includes(ciclo.fase) && h('p', { class: 'sub' }, `Ahora estás en fase ${FASES[ciclo.fase].nombre.toLowerCase()}: la retención de líquidos puede estar tapando la bajada. Valora esperar unos días.`),
      s.aplica && h('button', { class: 'btn', type: 'button', onclick: () => guardarAjustes({ ajuste_kcal: (a.ajuste_kcal || 0) + s.kcal, ajuste_fecha: hoyISO }) }, 'Aplicar −100 kcal'),
      a.ajuste_kcal !== 0 && h('p', { class: 'sub' }, `Ajuste activo: ${a.ajuste_kcal} kcal sobre los objetivos de entreno y descanso${a.ajuste_fecha ? ` (desde ${a.ajuste_fecha})` : ''}.`),
      a.ajuste_kcal !== 0 && h('button', { class: 'btn secundario', type: 'button', onclick: () => guardarAjustes({ ajuste_kcal: 0, ajuste_fecha: null }) }, 'Quitar ajuste'));
  }

  function tarjetaRecientes() {
    const ultimos = pesos().slice(-10).reverse();
    if (!ultimos.length) return null;
    return h('section', { class: 'tarjeta' },
      h('h2', {}, 'Últimos pesos'),
      h('ul', { class: 'ingredientes' }, ultimos.map((p) => h('li', {},
        h('div', { class: 'ing-nombre' }, fechaLarga(p.fecha)),
        h('div', { class: 'ing-dato' }, kg(p.kg)),
        h('button', {
          class: 'btn-icono', type: 'button', 'aria-label': `Borrar peso del ${p.fecha}`,
          onclick: async () => { await borrar('pesos', p.id); pintar(); },
        }, '✕')))));
  }

  function tarjetaCiclo() {
    const a = datos.ajustes;
    const info = faseCiclo(a.ciclo_inicios, hoyISO, a.ciclo_duracion);
    const fecha = h('input', { class: 'entrada', type: 'date', value: hoyISO, max: hoyISO });
    const añadir = (f) => guardarAjustes({ ciclo_inicios: [...new Set([...a.ciclo_inicios, f])].sort() });
    return h('section', { class: 'tarjeta' },
      h('h2', {}, 'Ciclo'),
      info
        ? h('div', {},
          h('p', { class: 'fase-ciclo' }, `${FASES[info.fase].nombre} · día ${info.dia} de ${info.duracion}`),
          h('p', { class: 'sub' }, FASES[info.fase].nota),
          h('p', { class: 'sub' }, `Próxima regla estimada: ${fechaLarga(info.proxima)}${info.proyectado ? ' (calculada: apunta la última cuando llegue)' : ''}.`))
        : h('p', { class: 'ayuda' }, 'Apunta el primer día de tu última regla para ver la fase en la que estás.'),
      h('button', { class: 'btn', type: 'button', onclick: () => añadir(hoyISO) }, 'Hoy empezó la regla'),
      h('label', {}, 'Otro día de inicio', fecha),
      h('button', { class: 'btn secundario', type: 'button', onclick: () => fecha.value && añadir(fecha.value) }, 'Añadir esa fecha'),
      a.ciclo_inicios.length > 0 && h('ul', { class: 'ingredientes' },
        [...a.ciclo_inicios].reverse().slice(0, 6).map((f) => h('li', {},
          h('div', { class: 'ing-nombre' }, fechaLarga(f)),
          h('button', {
            class: 'btn-icono', type: 'button', 'aria-label': `Quitar ${f}`,
            onclick: () => guardarAjustes({ ciclo_inicios: a.ciclo_inicios.filter((x) => x !== f) }),
          }, '✕')))),
      h('p', { class: 'sub' }, `Sin registros suficientes se asume un ciclo de ${a.ciclo_duracion} días; con 2 o más inicios usa la media de tus últimos ciclos. La ovulación es una estimación (14 días antes de la siguiente regla), no un dato médico.`));
  }

  function pintar() {
    vaciar(cont);
    montar(cont, tarjetaPeso(), tarjetaGrafico(), tarjetaAjuste(), tarjetaRecientes(), tarjetaCiclo(),
      h('a', { class: 'btn secundario', href: '#/fuerza' }, '🏋 Fuerza (Hevy)'));
  }

  montar(root, h('header', { class: 'cab' }, h('h1', {}, 'Progreso')), cont);
  pintar();
}
