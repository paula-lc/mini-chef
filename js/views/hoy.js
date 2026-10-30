import { h, fmt, num, vaciar, aviso, hoja, macrosChips, montar } from '../ui.js';
import { datos, ctx, guardar, borrar } from '../store.js';
import { calcularRaciones, totalesReceta } from '../calc.js';
import { faseCiclo, FASES, entrenoEl } from '../progreso.js';
import {
  COMIDAS, NOMBRE_COMIDA, fechaISO, sumarDias, fechaLarga, objetivosDia, totalesDia, estadoDia,
  crearEntrada, macrosEntrada, crearPlantilla, aplicarPlantilla,
} from '../dia.js';

const coma = (n) => (n == null ? '' : String(n).replace('.', ','));

/** Barra de progreso: `escala` = valor que llena la barra; `marca` = posición opcional (mínimo del rango). */
function barra(etiqueta, texto, valor, escala, estado, marca) {
  const pct = escala > 0 ? Math.min(100, (valor / escala) * 100) : 0;
  return h('div', { class: 'barra-m' },
    h('div', { class: 'fila-b' }, h('span', {}, etiqueta), h('span', {}, texto)),
    h('div', { class: 'pista' },
      h('div', { class: `relleno ${estado}`, style: `width:${pct}%` }),
      marca != null && h('div', { class: 'marca', style: `left:${Math.min(100, (marca / escala) * 100)}%` })));
}

export function hoy(root, { fecha } = {}) {
  const hoyISO = fechaISO();
  fecha = /^\d{4}-\d{2}-\d{2}$/.test(fecha || '') ? fecha : hoyISO;
  const entrenoHevy = entrenoEl([...datos.entrenos.values()], fecha);
  // Un día nuevo empieza como "entreno" si Hevy tiene un entreno ese día (luego puedes cambiarlo).
  const dia = structuredClone(datos.registros.get(fecha)) ?? { id: fecha, fecha, entrena: !!entrenoHevy, sueno_h: null, entradas: [] };
  const ciclo = faseCiclo(datos.ajustes.ciclo_inicios, fecha, datos.ajustes.ciclo_duracion);
  const persistir = () => guardar('registros', dia);
  const cont = h('div');

  /* ---------- Añadir ---------- */
  const abrirAñadir = (comida) => hoja(`Añadir a ${NOMBRE_COMIDA[comida].toLowerCase()}`, (cerrar) => {
    const cuerpo = h('div');
    let pestaña = 'receta';

    const meter = (entradas) => {
      dia.entradas.push(...entradas);
      persistir();
      cerrar();
      pintar();
    };

    const elegir = (tipo) => {
      const lista = h('div', { class: 'lista compacta' });
      const q = h('input', { class: 'buscar', type: 'search', placeholder: tipo === 'receta' ? 'Buscar receta…' : 'Buscar producto…' });
      const pintarLista = () => {
        vaciar(lista);
        const t = q.value.trim().toLowerCase();
        const fuente = [...(tipo === 'receta' ? datos.recetas : datos.productos).values()]
          .filter((x) => x.nombre.toLowerCase().includes(t))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        if (!fuente.length) lista.append(h('p', { class: 'vacio' }, 'Nada con ese nombre.'));
        for (const x of fuente) {
          const sub = tipo === 'receta'
            ? (x.peso_cocinado_g > 0 ? `${x.tipo === 'componente' ? 'componente' : 'receta'} · peso cocinado ${fmt(x.peso_cocinado_g)} g` : 'falta el peso cocinado')
            : `${fmt(x.kcal)} kcal/100 g`;
          lista.append(h('button', { class: 'opcion', type: 'button', onclick: () => paso2(tipo, x) }, h('span', {}, x.nombre), h('span', { class: 'sub' }, sub)));
        }
      };
      q.addEventListener('input', pintarLista);
      vaciar(cuerpo);
      cuerpo.append(q, lista);
      pintarLista();
    };

    const paso2 = (tipo, item) => {
      let modo = 'crudo';
      let sugerido = '';
      if (tipo === 'receta' && item.peso_cocinado_g > 0) {
        const r = calcularRaciones(item, totalesReceta(item, ctx), {
          modo: 'kcal', kcal: datos.ajustes.kcal_tupper, mult: datos.ajustes.multiplicador_pareja,
        });
        if (r) sugerido = String(Math.round(r.gramos_tupper));
      }
      const entrada = h('input', { class: 'entrada grande-in', type: 'text', inputmode: 'decimal', placeholder: '0', value: sugerido });
      const prev = h('div', { class: 'resultado' });
      const ok = h('button', { class: 'btn', type: 'button' }, 'Añadir');
      const actualizar = () => {
        const g = num(entrada.value);
        const m = g > 0 ? macrosEntrada({ tipo, ref_id: item.id, gramos: g, modo }, ctx) : null;
        vaciar(prev);
        prev.append(m ? macrosChips(m) : h('p', { class: 'ayuda' }, g > 0 ? 'No se pueden calcular los macros (¿falta el peso cocinado?).' : 'Escribe los gramos.'));
        ok.disabled = !m;
      };
      const seg = (m, texto) => h('button', {
        class: 'seg' + (modo === m ? ' activo' : ''), type: 'button',
        onclick: (e) => {
          modo = m;
          e.target.parentElement.querySelectorAll('.seg').forEach((b) => b.classList.remove('activo'));
          e.target.classList.add('activo');
          actualizar();
        },
      }, texto);
      entrada.addEventListener('input', actualizar);
      ok.addEventListener('click', () => {
        try {
          meter([crearEntrada({ comida, tipo, ref_id: item.id, gramos: num(entrada.value), modo: tipo === 'producto' ? modo : null }, ctx)]);
        } catch (e) { aviso(e.message, 'error'); }
      });
      vaciar(cuerpo);
      montar(cuerpo,
        h('button', { class: 'btn secundario', type: 'button', onclick: () => elegir(tipo) }, '‹ Volver'),
        h('h3', { class: 'titulo-paso' }, item.nombre),
        tipo === 'producto' && item.rendimiento > 0 && h('div', { class: 'segmentos' }, seg('crudo', 'En crudo'), seg('cocinado', 'Ya cocinado')),
        h('label', {}, tipo === 'receta' ? 'Gramos cocinados que te sirves' : 'Gramos'),
        entrada,
        sugerido && h('p', { class: 'sub' }, `Sugerido: tupper de ${fmt(datos.ajustes.kcal_tupper)} kcal.`),
        prev, ok);
      actualizar();
      entrada.focus();
    };

    const libre = () => {
      const campo = (id, etiqueta) => h('label', {}, etiqueta, h('input', { id, class: 'entrada', type: 'text', inputmode: 'decimal', placeholder: '0' }));
      const val = (id) => num(cuerpo.querySelector('#' + id).value) || 0;
      vaciar(cuerpo);
      cuerpo.append(
        h('label', {}, 'Nombre', h('input', { id: 'l-nombre', class: 'entrada', type: 'text', placeholder: 'Ej. caña, pincho…' })),
        h('div', { class: 'rejilla' }, campo('l-kcal', 'kcal'), campo('l-p', 'Proteína (g)'), campo('l-c', 'Hidratos (g)'), campo('l-g', 'Grasa (g)')),
        h('p', { class: 'sub' }, 'Si dejas las kcal vacías se calculan con los macros (4P + 4C + 9G).'),
        h('button', {
          class: 'btn', type: 'button', onclick: () => {
            const p = val('l-p'); const c = val('l-c'); const g = val('l-g');
            const kcal = val('l-kcal') || 4 * p + 4 * c + 9 * g;
            if (!(kcal > 0)) return aviso('Escribe al menos las kcal o algún macro', 'error');
            meter([crearEntrada({ comida, tipo: 'libre', nombre: cuerpo.querySelector('#l-nombre').value.trim() || 'Otro', libre: { kcal, p, c, g } }, ctx)]);
          },
        }, 'Añadir'));
    };

    const plantillas = () => {
      vaciar(cuerpo);
      const ts = [...datos.plantillas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      if (!ts.length) cuerpo.append(h('p', { class: 'vacio' }, 'Aún no tienes plantillas. Guarda una comida o un día desde esta pantalla.'));
      for (const t of ts) cuerpo.append(filaPlantilla(t, { comida, alAplicar: cerrar }));
    };

    const abrir = (p) => {
      pestaña = p;
      pestañas.querySelectorAll('.seg').forEach((b) => b.classList.toggle('activo', b.dataset.p === p));
      ({ receta: () => elegir('receta'), producto: () => elegir('producto'), libre, plantilla: plantillas })[p]();
    };
    const pestañas = h('div', { class: 'segmentos' },
      ...[['receta', 'Receta'], ['producto', 'Producto'], ['libre', 'Libre'], ['plantilla', 'Plantilla']].map(([p, t]) =>
        h('button', { class: 'seg' + (p === pestaña ? ' activo' : ''), type: 'button', dataset: { p }, onclick: () => abrir(p) }, t)));
    const marco = h('div', {}, pestañas, cuerpo);
    elegir('receta');
    return marco;
  });

  /* ---------- Plantillas ---------- */
  function filaPlantilla(t, { comida, alAplicar }) {
    const aplicar = () => {
      const { entradas, omitidas } = aplicarPlantilla(t, ctx, { comida: t.ambito === 'comida' ? comida : undefined });
      dia.entradas.push(...entradas);
      persistir();
      alAplicar();
      pintar();
      aviso(omitidas.length ? `Aplicada sin: ${omitidas.join(', ')}` : 'Plantilla aplicada', omitidas.length ? 'error' : '');
    };
    return h('div', { class: 'fila-plantilla' },
      h('button', { class: 'opcion', type: 'button', onclick: aplicar },
        h('span', {}, t.nombre),
        h('span', { class: 'sub' }, `${t.ambito === 'dia' ? 'día completo' : `una comida (${NOMBRE_COMIDA[t.entradas[0]?.comida] ?? '—'})`} · ${t.entradas.length} elementos`)),
      h('button', {
        class: 'btn-icono', type: 'button', 'aria-label': `Borrar plantilla ${t.nombre}`,
        onclick: async (e) => {
          if (!confirm(`¿Borrar la plantilla "${t.nombre}"?`)) return;
          await borrar('plantillas', t.id);
          e.target.closest('.fila-plantilla').remove();
        },
      }, '🗑'));
  }

  const guardarPlantilla = async (entradas, ambito, sugerencia) => {
    if (!entradas.length) return aviso('No hay nada que guardar', 'error');
    const nombre = (prompt('Nombre de la plantilla', sugerencia) || '').trim();
    if (!nombre) return;
    await guardar('plantillas', crearPlantilla(nombre, entradas, ambito));
    aviso('Plantilla guardada');
  };

  const plantillasDia = () => hoja('Plantillas de día', (cerrar) => {
    const ts = [...datos.plantillas.values()].filter((t) => t.ambito === 'dia');
    return h('div', {}, ts.length ? ts.map((t) => filaPlantilla(t, { alAplicar: cerrar })) : h('p', { class: 'vacio' }, 'No tienes plantillas de día. Guarda este día como plantilla.'));
  });

  /* ---------- Editar gramos ---------- */
  const editar = (e) => hoja(e.nombre, (cerrar) => {
    const entrada = h('input', { class: 'entrada grande-in', type: 'text', inputmode: 'decimal', value: coma(e.gramos) });
    return h('div', {},
      h('label', {}, e.tipo === 'receta' ? 'Gramos cocinados' : `Gramos${e.modo === 'cocinado' ? ' (cocinado)' : ''}`),
      entrada,
      h('button', {
        class: 'btn', type: 'button', onclick: () => {
          const g = num(entrada.value);
          const macros = g > 0 ? macrosEntrada({ ...e, gramos: g }, ctx) : null;
          if (!macros) return aviso('No se pueden calcular los macros con ese valor', 'error');
          e.gramos = g;
          e.macros = macros;
          persistir();
          cerrar();
          pintar();
        },
      }, 'Guardar'));
  });

  /* ---------- Pantalla ---------- */
  function pintar() {
    vaciar(cont);
    const obj = objetivosDia(dia, datos.ajustes);
    const tot = totalesDia(dia.entradas);
    const est = estadoDia(tot, obj);

    const seg = (valor, texto) => h('button', {
      class: 'seg' + (dia.entrena === valor ? ' activo' : ''), type: 'button',
      onclick: () => { dia.entrena = valor; persistir(); pintar(); },
    }, texto);

    const motivo = {
      sueno: `Dormiste menos de ${fmt(datos.ajustes.sueno_min_h)} h: hoy toca mantenimiento.`,
      entreno: 'Día de entreno.',
      descanso: 'Día de descanso.',
    }[obj.motivo];

    const estado = h('section', { class: 'tarjeta' },
      h('h2', {}, 'Estado del día'),
      h('div', { class: 'segmentos' }, seg(true, '🏋 Entreno'), seg(false, '😴 Descanso')),
      h('label', { for: 'sueno' }, 'Horas dormidas (opcional)'),
      h('input', {
        id: 'sueno', class: 'entrada', type: 'text', inputmode: 'decimal', placeholder: 'Ej. 7,5', value: coma(dia.sueno_h),
        onchange: (e) => {
          const v = num(e.target.value);
          dia.sueno_h = v >= 0 && v <= 24 ? v : null;
          persistir();
          pintar();
        },
      }),
      h('p', { class: 'sub' }, motivo),
      entrenoHevy && h('p', { class: 'sub' }, `Hevy: ${entrenoHevy.titulo}${entrenoHevy.duracion_min ? ` (${entrenoHevy.duracion_min} min)` : ''}.`),
      ciclo && h('p', { class: 'sub' }, `Ciclo: fase ${FASES[ciclo.fase].nombre.toLowerCase()}, día ${ciclo.dia}.`));

    const resumen = h('section', { class: 'tarjeta' },
      h('h2', {}, fecha === hoyISO ? 'Llevas hoy' : 'Llevó ese día'),
      h('div', { class: 'grande' },
        h('span', { class: 'cifra' }, fmt(tot.kcal)),
        h('span', { class: 'unidad' }, ` / ${fmt(obj.kcal)} kcal`)),
      h('p', { class: `sub centro ${est.kcal_restantes < 0 ? 'alerta' : ''}` },
        est.kcal_restantes >= 0 ? `Te quedan ${fmt(est.kcal_restantes)} kcal` : `Te pasas ${fmt(-est.kcal_restantes)} kcal`),
      barra('Proteína', `${fmt(tot.p)} / ≥${fmt(obj.p_min)} g`, tot.p, obj.p_min, est.p_ok ? '' : 'bajo'),
      barra('Grasa', `${fmt(tot.g)} g (${obj.g_min}–${obj.g_max})`, tot.g, obj.g_max, est.g_estado === 'ok' ? '' : est.g_estado, obj.g_min),
      barra('Hidratos', `${fmt(tot.c)} / ~${fmt(obj.c)} g`, tot.c, obj.c, est.c_restantes < 0 ? 'alto' : ''),
      !est.p_ok && dia.entradas.length > 0 && h('p', { class: 'sub' }, `Te faltan ${fmt(est.p_falta)} g de proteína.`));

    const comidas = COMIDAS
      .filter(([id]) => id !== 'otro' || dia.entradas.some((e) => e.comida === 'otro'))
      .map(([id, nombre]) => {
        const es = dia.entradas.filter((e) => e.comida === id);
        const t = totalesDia(es);
        return h('section', { class: 'tarjeta' },
          h('h2', {}, es.length ? `${nombre} · ${fmt(t.kcal)} kcal` : nombre),
          es.length > 0 && h('ul', { class: 'ingredientes' }, es.map((e) => h('li', {},
            h('div', { class: 'ing-nombre' },
              e.tipo === 'libre'
                ? h('span', {}, e.nombre)
                : h('button', { class: 'enlace-btn', type: 'button', onclick: () => editar(e) }, e.nombre),
              h('span', { class: 'sub bloque' },
                `${e.gramos ? `${fmt(e.gramos)} g${e.modo === 'cocinado' ? ' cocinado' : ''} · ` : ''}${fmt(e.macros.kcal)} kcal · P ${fmt(e.macros.p)} · C ${fmt(e.macros.c)} · G ${fmt(e.macros.g)}`)),
            h('button', {
              class: 'btn-icono', type: 'button', 'aria-label': `Quitar ${e.nombre}`,
              onclick: () => { dia.entradas = dia.entradas.filter((x) => x.id !== e.id); persistir(); pintar(); },
            }, '✕')))),
          h('div', { class: 'acciones' },
            h('button', { class: 'btn', type: 'button', onclick: () => abrirAñadir(id) }, '＋ Añadir'),
            es.length > 0 && h('button', { class: 'btn secundario', type: 'button', onclick: () => guardarPlantilla(es, 'comida', nombre) }, 'Guardar plantilla')));
      });

    const pie = h('section', { class: 'tarjeta' },
      h('h2', {}, 'Plantillas de día'),
      h('div', { class: 'acciones' },
        h('button', { class: 'btn secundario', type: 'button', onclick: plantillasDia }, 'Aplicar plantilla'),
        h('button', { class: 'btn secundario', type: 'button', onclick: () => guardarPlantilla(dia.entradas, 'dia', 'Mi día') }, 'Guardar este día')));

    montar(cont, estado, resumen, comidas, pie);
  }

  montar(root,
    h('header', { class: 'cab' }, h('h1', {}, fecha === hoyISO ? 'Hoy' : 'Diario')),
    h('div', { class: 'fecha-nav' },
      h('a', { class: 'btn-icono', href: `#/hoy/${sumarDias(fecha, -1)}`, 'aria-label': 'Día anterior' }, '‹'),
      h('strong', {}, fechaLarga(fecha)),
      h('a', { class: 'btn-icono', href: `#/hoy/${sumarDias(fecha, 1)}`, 'aria-label': 'Día siguiente' }, '›')),
    fecha !== hoyISO && h('a', { class: 'btn secundario', href: '#/hoy' }, 'Ir a hoy'),
    cont);
  pintar();
}
