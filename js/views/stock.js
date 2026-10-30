import { h, fmt, eur, num, vaciar, aviso, hoja, montar } from '../ui.js';
import { datos, guardar, borrar } from '../store.js';
import { nuevoId } from '../repo.js';
import { fechaISO, fechaLarga } from '../dia.js';
import { edadDias, resumenPresupuesto } from '../compra.js';
import { pestanasCompra, añadirAlStock, ubicacionPorDefecto } from './compra.js';

const UBICACIONES = [['congelador', '🧊 Congelador'], ['nevera', 'Nevera'], ['despensa', 'Despensa']];
const coma = (n) => String(n).replace('.', ',');

/* ---------- Inventario ---------- */
export function stock(root) {
  const hoyISO = fechaISO();
  const cont = h('div');
  const cambiar = async (fn) => { await fn(); pintar(); };

  const nuevo = () => hoja('Añadir al stock', (cerrar) => {
    const cuerpo = h('div');
    let pestaña = 'producto';
    const meter = async (fila) => { cerrar(); await cambiar(() => (fila.tipo === 'producto' ? añadirAlStock(fila.ref_id, fila.cantidad, fila.ubicacion, fila.unidad) : guardar('inventario', { id: nuevoId('i'), fecha: hoyISO, ...fila }))); };
    const selUbic = (def) => h('select', { class: 'entrada' }, UBICACIONES.map(([k, t]) => h('option', { value: k, selected: k === def }, t)));

    const elegir = (tipo) => {
      const lst = h('div', { class: 'lista compacta' });
      const q = h('input', { class: 'buscar', type: 'search', placeholder: tipo === 'tupper' ? 'Buscar receta…' : 'Buscar producto…' });
      const pintarLista = () => {
        vaciar(lst);
        const t = q.value.trim().toLowerCase();
        const fuente = [...(tipo === 'tupper' ? datos.recetas : datos.productos).values()].filter((x) => x.nombre.toLowerCase().includes(t)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).slice(0, 40);
        for (const x of fuente) lst.append(h('button', { class: 'opcion', type: 'button', onclick: () => paso2(tipo, x) }, h('span', {}, x.nombre)));
      };
      q.addEventListener('input', pintarLista);
      vaciar(cuerpo); cuerpo.append(q, lst); pintarLista();
    };

    const paso2 = (tipo, item) => {
      const cant = h('input', { class: 'entrada grande-in', type: 'text', inputmode: 'decimal', value: tipo === 'tupper' ? '4' : '' });
      const unidades = tipo === 'producto' ? [['g', 'gramos'], ...(item.unidad_g ? [['ud', 'unidades']] : []), ...(item.envase_g ? [['envases', 'envases']] : [])] : [];
      const uni = tipo === 'producto' ? h('select', { class: 'entrada' }, unidades.map(([k, t]) => h('option', { value: k }, t))) : null;
      const ub = selUbic(tipo === 'tupper' ? 'congelador' : ubicacionPorDefecto(item.seccion));
      vaciar(cuerpo);
      montar(cuerpo,
        h('button', { class: 'btn secundario', type: 'button', onclick: () => elegir(tipo) }, '‹ Volver'),
        h('h3', { class: 'titulo-paso' }, item.nombre),
        h('label', {}, tipo === 'tupper' ? 'Nº de tuppers' : 'Cantidad'), cant,
        uni && h('label', {}, 'Unidad', uni),
        h('label', {}, 'Dónde está', ub),
        h('button', {
          class: 'btn', type: 'button', onclick: () => {
            const c = num(cant.value);
            if (!(c > 0)) return aviso('Escribe una cantidad', 'error');
            meter(tipo === 'tupper'
              ? { tipo: 'tupper', ref_id: item.id, nombre: item.nombre, cantidad: c, unidad: 'tuppers', ubicacion: ub.value }
              : { tipo: 'producto', ref_id: item.id, nombre: item.nombre, cantidad: c, unidad: uni.value, ubicacion: ub.value });
          },
        }, 'Añadir'));
    };

    const otro = () => {
      const nombre = h('input', { class: 'entrada', type: 'text', placeholder: 'Ej. pan rallado' });
      const cant = h('input', { class: 'entrada', type: 'text', inputmode: 'decimal', value: '1' });
      const ub = selUbic('despensa');
      vaciar(cuerpo);
      montar(cuerpo,
        h('label', {}, 'Nombre', nombre), h('label', {}, 'Cantidad', cant), h('label', {}, 'Dónde está', ub),
        h('button', {
          class: 'btn', type: 'button', onclick: () => {
            if (!nombre.value.trim() || !(num(cant.value) > 0)) return aviso('Falta el nombre o la cantidad', 'error');
            meter({ tipo: 'libre', nombre: nombre.value.trim(), cantidad: num(cant.value), unidad: 'ud', ubicacion: ub.value });
          },
        }, 'Añadir'));
    };

    const abrir = (p) => {
      pestaña = p;
      pestañas.querySelectorAll('.seg').forEach((b) => b.classList.toggle('activo', b.dataset.p === p));
      ({ producto: () => elegir('producto'), tupper: () => elegir('tupper'), libre: otro })[p]();
    };
    const pestañas = h('div', { class: 'segmentos' },
      ...[['producto', 'Producto'], ['tupper', 'Tupper'], ['libre', 'Otro']].map(([p, t]) =>
        h('button', { class: 'seg' + (p === pestaña ? ' activo' : ''), type: 'button', dataset: { p }, onclick: () => abrir(p) }, t)));
    elegir('producto');
    return h('div', {}, pestañas, cuerpo);
  });

  const editar = (it) => hoja(it.nombre, (cerrar) => {
    const cant = h('input', { class: 'entrada grande-in', type: 'text', inputmode: 'decimal', value: coma(it.cantidad) });
    return h('div', {},
      h('label', {}, `Cantidad (${it.unidad})`), cant,
      h('button', {
        class: 'btn', type: 'button', onclick: async () => {
          const c = num(cant.value);
          if (!(c >= 0)) return aviso('Cantidad no válida', 'error');
          cerrar();
          await cambiar(() => (c === 0 ? borrar('inventario', it.id) : guardar('inventario', { ...it, cantidad: c })));
        },
      }, 'Guardar'),
      h('p', { class: 'sub' }, 'Con 0 se quita del stock.'));
  });

  function fila(it) {
    const edad = it.tipo === 'tupper' ? edadDias(it.fecha, hoyISO) : null;
    const viejo = edad != null && edad > datos.ajustes.tupper_aviso_dias;
    const uno = ['tuppers', 'ud', 'envases'].includes(it.unidad);
    return h('li', {},
      h('div', { class: 'ing-nombre' },
        h('button', { class: 'enlace-btn', type: 'button', onclick: () => editar(it) }, it.nombre),
        h('span', { class: `sub bloque${viejo ? ' alerta' : ''}` },
          `${fmt(it.cantidad, it.cantidad % 1 ? 1 : 0)} ${it.cantidad === 1 ? { envases: 'envase', tuppers: 'tupper' }[it.unidad] ?? it.unidad : it.unidad}${edad != null ? ` · guardado hace ${edad} d${viejo ? ' — gástalo ya' : ''}` : ''}`)),
      uno && h('button', {
        class: 'btn-icono', type: 'button', 'aria-label': `Quitar una unidad de ${it.nombre}`,
        onclick: () => cambiar(() => (it.cantidad <= 1 ? borrar('inventario', it.id) : guardar('inventario', { ...it, cantidad: it.cantidad - 1 }))),
      }, '−1'),
      h('button', { class: 'btn-icono', type: 'button', 'aria-label': `Borrar ${it.nombre}`, onclick: () => cambiar(() => borrar('inventario', it.id)) }, '✕'));
  }

  function pintar() {
    vaciar(cont);
    const todos = [...datos.inventario.values()];
    const secciones = UBICACIONES.map(([id, titulo]) => {
      const es = todos.filter((i) => i.ubicacion === id).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || a.nombre.localeCompare(b.nombre, 'es'));
      return es.length ? h('section', { class: 'tarjeta' }, h('h2', {}, `${titulo} · ${es.length}`), h('ul', { class: 'ingredientes' }, es.map(fila))) : null;
    });
    montar(cont,
      secciones,
      todos.length === 0 && h('p', { class: 'vacio' }, 'Aún no has apuntado nada. Añade lo que tienes en el congelador y la despensa: la lista de la compra lo descuenta.'),
      h('button', { class: 'btn', type: 'button', onclick: nuevo }, '＋ Añadir al stock'));
  }

  montar(root, h('header', { class: 'cab' }, h('h1', {}, 'Stock')), pestanasCompra('stock'), cont);
  pintar();
}

/* ---------- Gasto ---------- */
export function gasto(root) {
  const hoyISO = fechaISO();
  const cont = h('div');

  const nuevo = () => hoja('Añadir gasto', (cerrar) => {
    const importe = h('input', { class: 'entrada grande-in', type: 'text', inputmode: 'decimal', placeholder: '0,00' });
    const concepto = h('input', { class: 'entrada', type: 'text', placeholder: 'Ej. Mercadona' });
    const fecha = h('input', { class: 'entrada', type: 'date', value: hoyISO, max: hoyISO });
    return h('div', {},
      h('label', {}, 'Importe (€)'), importe, h('label', {}, 'Concepto', concepto), h('label', {}, 'Fecha', fecha),
      h('button', {
        class: 'btn', type: 'button', onclick: async () => {
          const v = num(importe.value);
          if (!(v > 0) || !fecha.value) return aviso('Escribe un importe válido', 'error');
          await guardar('gastos', { id: nuevoId('g'), fecha: fecha.value, importe: v, concepto: concepto.value.trim() || 'Compra' });
          cerrar();
          pintar();
        },
      }, 'Guardar'));
  });

  function pintar() {
    vaciar(cont);
    const r = resumenPresupuesto([...datos.gastos.values()], datos.ajustes, hoyISO);
    const mensaje = {
      bien: `Vas bien: llevas ${eur(r.gastado)} y a estas alturas tocaría ${eur(r.esperado)}.`,
      adelantado: `Vas por delante del ritmo: llevas ${eur(r.gastado)} y tocaría ${eur(r.esperado)}.`,
      pasado: `Te has pasado ${eur(-r.restante)} del presupuesto.`,
    }[r.estado];
    montar(cont,
      h('section', { class: 'tarjeta' },
        h('h2', {}, `Presupuesto · ${r.mes}`),
        h('div', { class: 'grande' }, h('span', { class: 'cifra' }, fmt(r.restante, 0)), h('span', { class: 'unidad' }, ` € de ${fmt(r.presupuesto, 0)}`)),
        h('p', { class: 'sub centro' }, 'te quedan este mes (para 2 personas)'),
        h('div', { class: 'barra-m' }, h('div', { class: 'pista' }, h('div', { class: `relleno ${r.estado === 'bien' ? '' : r.estado === 'pasado' ? 'alto' : 'bajo'}`, style: `width:${r.pct}%` }))),
        h('p', { class: r.estado === 'bien' ? 'sub' : 'sub alerta' }, mensaje),
        r.restante > 0 && h('p', { class: 'sub' }, `Quedan ${r.diasRestantes} días: ${eur(r.por_dia)} al día.`)),
      h('section', { class: 'tarjeta' },
        h('h2', {}, 'Gastos del mes'),
        r.gastos.length
          ? h('ul', { class: 'ingredientes' }, r.gastos.map((g) => h('li', {},
            h('div', { class: 'ing-nombre' }, g.concepto, h('span', { class: 'sub bloque' }, fechaLarga(g.fecha))),
            h('div', { class: 'ing-dato' }, eur(g.importe)),
            h('button', {
              class: 'btn-icono', type: 'button', 'aria-label': `Borrar gasto ${g.concepto}`,
              onclick: async () => { await borrar('gastos', g.id); pintar(); },
            }, '✕'))))
          : h('p', { class: 'ayuda' }, 'Aún no hay gastos este mes. Se añaden solos al registrar una compra desde la lista.'),
        h('button', { class: 'btn secundario', type: 'button', onclick: nuevo }, '＋ Añadir gasto')),
      h('p', { class: 'sub centro' }, 'El presupuesto mensual se cambia en Ajustes.'));
  }

  montar(root, h('header', { class: 'cab' }, h('h1', {}, 'Gasto')), pestanasCompra('gasto'), cont);
  pintar();
}
