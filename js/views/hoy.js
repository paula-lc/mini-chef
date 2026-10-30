import { h, fmt, eur, num, vaciar, aviso, hoja, macrosChips, montar } from '../ui.js';
import { datos, ctx, guardar, borrar } from '../store.js';
import { calcularRaciones, totalesReceta, esIndividual } from '../calc.js';
import { faseCiclo, FASES, entrenoEl } from '../progreso.js';
import { kcalRecetaTexto, kcalProductoTexto } from './etiquetas.js';
import {
  COMIDAS, NOMBRE_COMIDA, fechaISO, sumarDias, fechaLarga, objetivosDia, totalesDia, estadoDia,
  crearEntrada, macrosEntrada, crearPlantilla, aplicarPlantilla, recomendar,
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


const nombreIng = (i) => (i.ref_tipo === 'receta' ? datos.recetas.get(i.ref_id) : datos.productos.get(i.ref_id))?.nombre ?? i.ref_id;

/** Hoja para elegir un ingrediente (producto o componente). Llama a `alElegir(ingrediente)` con una cantidad inicial razonable. */
function elegirIngrediente(alElegir) {
  return hoja('Añadir ingrediente', (cerrar) => {
    const lst = h('div', { class: 'lista compacta' });
    const q = h('input', { class: 'buscar', type: 'search', placeholder: 'Buscar producto…' });
    const pintarLista = () => {
      vaciar(lst);
      const t = q.value.trim().toLowerCase();
      const prods = [...datos.productos.values()].filter((x) => x.nombre.toLowerCase().includes(t));
      const comps = [...datos.recetas.values()].filter((x) => x.tipo === 'componente' && x.nombre.toLowerCase().includes(t));
      for (const x of [...comps.map((c) => ({ c })), ...prods.map((p) => ({ p }))].sort((a, b) => (a.c || a.p).nombre.localeCompare((b.c || b.p).nombre, 'es')).slice(0, 40)) {
        const it = x.c || x.p;
        lst.append(h('button', {
          class: 'opcion', type: 'button',
          onclick: () => {
            cerrar();
            alElegir(x.c
              ? { ref_tipo: 'receta', ref_id: it.id, gramos: 100, modo: 'crudo', escala_pareja: false }
              : { ref_tipo: 'producto', ref_id: it.id, gramos: it.unidad_g || 100, modo: 'crudo', escala_pareja: false });
          },
        }, h('span', {}, it.nombre), h('span', { class: 'sub' }, x.c ? `componente · ${kcalRecetaTexto(it)}` : kcalProductoTexto(it))));
      }
    };
    q.addEventListener('input', pintarLista);
    pintarLista();
    return h('div', {}, q, lst);
  });
}

/**
 * Formulario de una receta al registrarla en el día. Recetas de una ración: se ven y se pueden
 * cambiar/quitar/añadir sus ingredientes (gramos exactos). Recetas de olla: gramos de tu ración
 * más extras opcionales (un huevo, más queso…). `previo` = entrada existente al editarla.
 */
function formReceta(item, previo, alGuardar) {
  const indiv = esIndividual(item);
  const clave = indiv ? 'raciones' : 'gramos';
  let ings = indiv ? structuredClone(previo?.ingredientes ?? item.ingredientes ?? []) : null;
  const extras = structuredClone(previo?.extras ?? []);
  let inicial = previo ? previo[clave] : '';
  if (!previo) {
    if (indiv) inicial = 1;
    else if (item.peso_cocinado_g > 0) {
      const r = calcularRaciones(item, totalesReceta(item, ctx), { modo: 'kcal', kcal: datos.ajustes.kcal_tupper, mult: datos.ajustes.multiplicador_pareja });
      if (r) inicial = Math.round(r.gramos_tupper);
    }
  }
  const entrada = h('input', { class: 'entrada grande-in', type: 'text', inputmode: 'decimal', placeholder: '0', value: String(inicial ?? '').replace('.', ',') });
  const prev = h('div', { class: 'resultado' });
  const ok = h('button', { class: 'btn', type: 'button' }, 'Guardar');
  const borrador = () => ({ tipo: 'receta', ref_id: item.id, [clave]: num(entrada.value), ...(indiv ? { ingredientes: ings } : {}), extras });
  const actualizar = () => {
    const m = num(entrada.value) > 0 ? macrosEntrada(borrador(), ctx) : null;
    vaciar(prev);
    prev.append(m ? macrosChips(m) : h('p', { class: 'ayuda' }, 'Escribe una cantidad válida.'), m && h('p', { class: 'sub' }, `Coste ${eur(m.coste)}`));
    ok.disabled = !m;
  };
  const filas = (arr, cont) => {
    vaciar(cont);
    if (!arr.length) cont.append(h('p', { class: 'ayuda' }, 'Nada todavía.'));
    else cont.append(h('ul', { class: 'ingredientes' }, arr.map((i, k) => h('li', {},
      h('div', { class: 'ing-nombre' }, nombreIng(i)),
      h('div', { class: 'ing-edit' },
        h('input', {
          class: 'entrada', type: 'text', inputmode: 'decimal', value: String(i.gramos).replace('.', ','), 'aria-label': `Gramos de ${nombreIng(i)}`,
          oninput: (e) => { i.gramos = num(e.target.value) || 0; actualizar(); },
        }), h('span', {}, 'g')),
      h('button', { class: 'btn-icono', type: 'button', 'aria-label': `Quitar ${nombreIng(i)}`, onclick: () => { arr.splice(k, 1); filas(arr, cont); actualizar(); } }, '✕')))));
    cont.append(h('button', {
      class: 'btn secundario', type: 'button',
      onclick: () => elegirIngrediente((ing) => { arr.push(ing); filas(arr, cont); actualizar(); }),
    }, '＋ Añadir ingrediente'));
  };
  const contIngs = h('div');
  const contExtras = h('div');
  if (indiv) filas(ings, contIngs); else filas(extras, contExtras);
  ok.addEventListener('click', () => alGuardar(borrador()));
  entrada.addEventListener('input', actualizar);
  const r = h('div', {},
    h('label', {}, indiv ? 'Raciones (1 = la ración entera)' : 'Gramos cocinados que te sirves'),
    entrada,
    !indiv && !previo && inicial && h('p', { class: 'sub' }, `Sugerido: tupper de ${fmt(datos.ajustes.kcal_tupper)} kcal.`),
    h('h3', { class: 'titulo-paso' }, indiv ? 'Ingredientes de esta ración' : 'Extras (por ejemplo un huevo)'),
    indiv && h('p', { class: 'sub' }, 'Cambia los gramos, quita o añade lo que hayas puesto hoy. La receta original no cambia.'),
    indiv ? contIngs : contExtras,
    prev, ok);
  actualizar();
  return r;
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
    // Lo que te queda hoy, para escoger mejor y recomendar.
    const est0 = estadoDia(totalesDia(dia.entradas), objetivosDia(dia, datos.ajustes));
    const recs = recomendar([...datos.recetas.values()], ctx, { kcalRestantes: est0.kcal_restantes, pFalta: est0.p_falta, kcalTupper: datos.ajustes.kcal_tupper });
    const infoRec = new Map(recs.map((r) => [r.receta.id, r]));
    const restan = h('p', { class: `resta-kcal${est0.kcal_restantes < 0 ? ' alerta' : ''}` },
      est0.kcal_restantes >= 0 ? `Te quedan ${fmt(est0.kcal_restantes)} kcal` : `Te pasas ${fmt(-est0.kcal_restantes)} kcal`,
      est0.p_falta > 0 && ` · faltan ${fmt(est0.p_falta)} g de proteína`);

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
        if (tipo === 'receta' && !t) {
          const top = recs.filter((r) => r.encaja).slice(0, 4);
          lista.append(h('h3', { class: 'subseccion' }, 'Te recomiendo'));
          if (!top.length) lista.append(h('p', { class: 'ayuda' }, 'Ninguna receta cabe en lo que te queda: mejor algo ligero (café, yogur, fruta) o un producto suelto.'));
          for (const r of top) {
            lista.append(h('button', { class: 'opcion recomendada', type: 'button', onclick: () => paso2('receta', r.receta) },
              h('span', {}, r.receta.nombre),
              h('span', { class: 'sub' }, `${r.tupper ? 'tu tupper ≈ ' : ''}${fmt(r.kcal)} kcal · ${fmt(r.p)} g P · te quedarían ${fmt(-r.exceso)} kcal`)));
          }
          lista.append(h('h3', { class: 'subseccion' }, 'Todas'));
        }
        const fuente = [...(tipo === 'receta' ? datos.recetas : datos.productos).values()]
          .filter((x) => x.nombre.toLowerCase().includes(t))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        if (!fuente.length) lista.append(h('p', { class: 'vacio' }, 'Nada con ese nombre.'));
        for (const x of fuente) {
          const sub = tipo === 'receta'
            ? `${x.tipo === 'componente' ? 'componente · ' : ''}${kcalRecetaTexto(x)}${x.peso_cocinado_g > 0 || esIndividual(x) ? '' : ' · falta el peso cocinado'}${infoRec.has(x.id) ? (infoRec.get(x.id).encaja ? ' · ✓ cabe' : ` · ✗ +${fmt(infoRec.get(x.id).exceso)} kcal`) : ''}`
            : kcalProductoTexto(x);
          lista.append(h('button', { class: 'opcion', type: 'button', onclick: () => paso2(tipo, x) }, h('span', {}, x.nombre), h('span', { class: 'sub' }, sub)));
        }
      };
      q.addEventListener('input', pintarLista);
      vaciar(cuerpo);
      cuerpo.append(q, lista);
      pintarLista();
    };

    const paso2 = (tipo, item) => {
      if (tipo === 'receta') {
        vaciar(cuerpo);
        montar(cuerpo,
          h('button', { class: 'btn secundario', type: 'button', onclick: () => elegir(tipo) }, '‹ Volver'),
          h('h3', { class: 'titulo-paso' }, item.nombre),
          formReceta(item, null, (d) => {
            try { meter([crearEntrada({ comida, ...d }, ctx)]); } catch (e) { aviso(e.message, 'error'); }
          }));
        return;
      }
      let modo = 'crudo';
      let sugerido = '';
      const porRaciones = tipo === 'receta' && esIndividual(item); // café, tostada…: se cuenta en raciones, sin pesar
      if (porRaciones) sugerido = '1';
      else if (tipo === 'receta' && item.peso_cocinado_g > 0) {
        const r = calcularRaciones(item, totalesReceta(item, ctx), {
          modo: 'kcal', kcal: datos.ajustes.kcal_tupper, mult: datos.ajustes.multiplicador_pareja,
        });
        if (r) sugerido = String(Math.round(r.gramos_tupper));
      }
      const entrada = h('input', { class: 'entrada grande-in', type: 'text', inputmode: 'decimal', placeholder: '0', value: sugerido });
      const clave = porRaciones ? 'raciones' : 'gramos';
      const prev = h('div', { class: 'resultado' });
      const ok = h('button', { class: 'btn', type: 'button' }, 'Añadir');
      const actualizar = () => {
        const g = num(entrada.value);
        const m = g > 0 ? macrosEntrada({ tipo, ref_id: item.id, [clave]: g, modo }, ctx) : null;
        vaciar(prev);
        prev.append(m ? macrosChips(m) : h('p', { class: 'ayuda' }, g > 0 ? 'No se pueden calcular los macros (¿falta el peso cocinado?).' : `Escribe ${porRaciones ? 'las raciones' : 'los gramos'}.`));
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
          meter([crearEntrada({ comida, tipo, ref_id: item.id, [clave]: num(entrada.value), modo: tipo === 'producto' ? modo : null }, ctx)]);
        } catch (e) { aviso(e.message, 'error'); }
      });
      vaciar(cuerpo);
      montar(cuerpo,
        h('button', { class: 'btn secundario', type: 'button', onclick: () => elegir(tipo) }, '‹ Volver'),
        h('h3', { class: 'titulo-paso' }, item.nombre),
        tipo === 'producto' && item.rendimiento > 0 && h('div', { class: 'segmentos' }, seg('crudo', 'En crudo'), seg('cocinado', 'Ya cocinado')),
        h('label', {}, porRaciones ? 'Raciones (1 = una taza / una ración entera)' : tipo === 'receta' ? 'Gramos cocinados que te sirves' : 'Gramos'),
        entrada,
        sugerido && !porRaciones && h('p', { class: 'sub' }, `Sugerido: tupper de ${fmt(datos.ajustes.kcal_tupper)} kcal.`),
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
    const marco = h('div', {}, restan, pestañas, cuerpo);
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
    if (e.tipo === 'receta' && ctx.receta(e.ref_id)) {
      return formReceta(ctx.receta(e.ref_id), e, (d) => {
        const macros = macrosEntrada(d, ctx);
        if (!macros) return aviso('No se pueden calcular los macros', 'error');
        Object.assign(e, { raciones: d.raciones ?? null, gramos: d.gramos ?? null, ingredientes: d.ingredientes ?? null, extras: d.extras?.length ? d.extras : null, macros });
        persistir();
        cerrar();
        pintar();
      });
    }
    const entrada = h('input', { class: 'entrada grande-in', type: 'text', inputmode: 'decimal', value: coma(e.raciones ?? e.gramos) });
    const clave = e.raciones != null ? 'raciones' : 'gramos';
    return h('div', {},
      h('label', {}, clave === 'raciones' ? 'Raciones' : e.tipo === 'receta' ? 'Gramos cocinados' : `Gramos${e.modo === 'cocinado' ? ' (cocinado)' : ''}`),
      entrada,
      h('button', {
        class: 'btn', type: 'button', onclick: () => {
          const g = num(entrada.value);
          const macros = g > 0 ? macrosEntrada({ ...e, [clave]: g }, ctx) : null;
          if (!macros) return aviso('No se pueden calcular los macros con ese valor', 'error');
          e[clave] = g;
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
                `${e.raciones && !e.ingredientes ? `${fmt(e.raciones, e.raciones % 1 ? 1 : 0)} ${e.raciones === 1 ? 'ración' : 'raciones'} · ` : ''}${e.gramos ? `${fmt(e.gramos)} g${e.modo === 'cocinado' ? ' cocinado' : ''} · ` : ''}${fmt(e.macros.kcal)} kcal · P ${fmt(e.macros.p)} · C ${fmt(e.macros.c)} · G ${fmt(e.macros.g)}`),
              (e.ingredientes || e.extras?.length) && h('span', { class: 'sub bloque' },
                [e.ingredientes?.map((i) => `${nombreIng(i)} ${fmt(i.gramos, i.gramos % 1 ? 1 : 0)} g`).join(' · '),
                  e.extras?.length && `+ ${e.extras.map((i) => `${nombreIng(i)} ${fmt(i.gramos, i.gramos % 1 ? 1 : 0)} g`).join(' · ')}`].filter(Boolean).join(' '))),
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
