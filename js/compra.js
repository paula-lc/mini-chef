// Lógica pura de la Fase 4: lista de la compra, inventario y presupuesto.
import { macrosProducto, eurKg, redondear } from './calc.js';
import { AJUSTES_POR_DEFECTO } from './repo.js';
import { diasEntre } from './progreso.js';

export const ORDEN_SECCIONES = ['congelados', 'carniceria', 'lacteos', 'fruta_verdura', 'despensa'];
const TOLERANCIA_ENVASE = 0.03; // 503 g con envases de 500 g no obliga a comprar otro

/* ---------- Necesidades de las recetas ---------- */
/**
 * Gramos CRUDOS de cada producto que hacen falta para cocinar `veces` veces una receta
 * (las cantidades de la receta son las de la olla entera). Un componente usado como
 * ingrediente aporta la parte proporcional: gramos usados / peso cocinado del componente.
 * Suma en `acc` (Map productoId → g) y devuelve { acc, avisos }.
 */
export function necesidadesReceta(receta, ctx, veces = 1, acc = new Map(), pila = []) {
  const avisos = [];
  if (pila.includes(receta.id)) return { acc, avisos: [`Ciclo en "${receta.nombre}"`] };
  for (const ing of receta.ingredientes || []) {
    const gramos = (Number(ing.gramos) || 0) * veces;
    if (!(gramos > 0)) continue;
    if (ing.ref_tipo === 'receta') {
      const sub = ctx.receta(ing.ref_id);
      if (!sub) { avisos.push(`Falta la receta "${ing.ref_id}" en "${receta.nombre}"`); continue; }
      if (!(sub.peso_cocinado_g > 0)) {
        avisos.push(`"${sub.nombre}" no tiene peso cocinado: no se puede saber cuánto llevas de sus ingredientes`);
        continue;
      }
      avisos.push(...necesidadesReceta(sub, ctx, gramos / sub.peso_cocinado_g, acc, [...pila, receta.id]).avisos);
    } else {
      const prod = ctx.producto(ing.ref_id);
      if (!prod) { avisos.push(`Falta el producto "${ing.ref_id}" en "${receta.nombre}"`); continue; }
      const crudo = macrosProducto(prod, gramos, ing.modo || 'crudo').crudo_g;
      acc.set(prod.id, (acc.get(prod.id) || 0) + crudo);
    }
  }
  return { acc, avisos };
}

/** Necesidades de varias recetas: plan = [{ ref_id, veces }]. */
export function necesidadesPlan(plan, ctx) {
  const acc = new Map();
  const avisos = [];
  for (const { ref_id, veces } of plan) {
    const r = ctx.receta(ref_id);
    if (!r) { avisos.push(`La receta "${ref_id}" ya no existe`); continue; }
    avisos.push(...necesidadesReceta(r, ctx, veces > 0 ? veces : 1, acc).avisos);
  }
  return { acc, avisos };
}

/* ---------- Inventario ---------- */
/** Gramos de cada producto en el inventario (sirven g, unidades y envases; los tuppers no cuentan). */
export function stockProductos(inventario, ctx) {
  const m = new Map();
  for (const it of inventario) {
    if (it.tipo !== 'producto') continue;
    const p = ctx.producto(it.ref_id);
    if (!p) continue;
    const util = p.escurrido_g || p.envase_g;
    const g = it.unidad === 'ud' ? it.cantidad * (p.unidad_g || 0) : it.unidad === 'envases' ? it.cantidad * (util || 0) : it.cantidad;
    m.set(p.id, (m.get(p.id) || 0) + (g || 0));
  }
  return m;
}

export const edadDias = (desde, hoy) => (desde ? diasEntre(desde, hoy) : null);

/* ---------- Líneas de compra ---------- */
/** Qué comprar de un producto: gramos que faltan, envases enteros, coste y sobrante. */
export function lineaCompra(prod, necesario_g, stock_g = 0) {
  const comprar_g = Math.max(0, necesario_g - stock_g);
  const util = prod.escurrido_g || prod.envase_g || null;
  const kg = eurKg(prod);
  let packs = null;
  let coste;
  let sobra_g = 0;
  if (comprar_g <= 0) coste = 0;
  else if (util && prod.precio != null) {
    packs = Math.max(1, Math.ceil(comprar_g / util - TOLERANCIA_ENVASE));
    coste = packs * prod.precio;
    sobra_g = Math.max(0, packs * util - comprar_g);
  } else coste = kg ? (comprar_g / 1000) * kg : 0;
  return {
    producto: prod, necesario_g: redondear(necesario_g, 0), stock_g: redondear(Math.min(stock_g, necesario_g), 0),
    comprar_g: redondear(comprar_g, 0), packs, coste: redondear(coste, 2), sobra_g: redondear(sobra_g, 0),
    sinPrecio: comprar_g > 0 && !(coste > 0),
  };
}

/**
 * Lista completa. lista = { recetas: [{ref_id, veces}], extras: [...] }.
 * extras: { id, tipo:'producto', ref_id, packs } o { id, tipo:'libre', nombre, importe, tienda, seccion }.
 * Devuelve { lineas, avisos, total, porTienda: [{ tienda, total, secciones: [{ seccion, lineas }] }] }.
 * Cada línea trae `clave` (para marcarla como comprada) y `nombre`.
 */
export function listaCompra(lista, ctx, inventario = []) {
  const { acc, avisos } = necesidadesPlan(lista.recetas || [], ctx);
  const stock = stockProductos(inventario, ctx);
  const lineas = [];
  for (const [id, g] of acc) {
    const prod = ctx.producto(id);
    const l = lineaCompra(prod, g, stock.get(id) || 0);
    lineas.push({ ...l, clave: `p:${id}`, nombre: prod.nombre, tienda: prod.tienda || 'Otra', seccion: prod.seccion || 'despensa', origen: 'receta' });
  }
  for (const x of lista.extras || []) {
    if (x.tipo === 'producto') {
      const prod = ctx.producto(x.ref_id);
      if (!prod) { avisos.push(`El producto extra "${x.nombre || x.ref_id}" ya no existe`); continue; }
      const packs = x.packs > 0 ? x.packs : 1;
      const util = prod.escurrido_g || prod.envase_g;
      const l = util && prod.precio != null
        ? { ...lineaCompra(prod, packs * util, 0), packs }
        : lineaCompra(prod, 1000 * packs, 0);
      lineas.push({ ...l, clave: `x:${x.id}`, nombre: prod.nombre, tienda: prod.tienda || 'Otra', seccion: prod.seccion || 'despensa', origen: 'extra', extraId: x.id });
    } else {
      lineas.push({
        clave: `x:${x.id}`, nombre: x.nombre, tienda: x.tienda || 'Otra', seccion: x.seccion || 'despensa',
        coste: redondear(Number(x.importe) || 0, 2), packs: null, comprar_g: 0, origen: 'extra', extraId: x.id, libre: true,
      });
    }
  }
  for (const l of lineas.filter((x) => x.sinPrecio)) avisos.push(`"${l.nombre}" no tiene precio: no cuenta en el total`);

  const tiendas = new Map();
  for (const l of lineas) {
    if (l.origen === 'receta' && l.comprar_g <= 0) continue; // ya lo tienes
    if (!tiendas.has(l.tienda)) tiendas.set(l.tienda, new Map());
    const sec = tiendas.get(l.tienda);
    if (!sec.has(l.seccion)) sec.set(l.seccion, []);
    sec.get(l.seccion).push(l);
  }
  const rank = (s) => (ORDEN_SECCIONES.includes(s) ? ORDEN_SECCIONES.indexOf(s) : 99);
  const porTienda = [...tiendas.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'es'))
    .map(([tienda, secs]) => {
      const secciones = [...secs.entries()]
        .sort((a, b) => rank(a[0]) - rank(b[0]))
        .map(([seccion, ls]) => ({ seccion, lineas: ls.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) }));
      return { tienda, total: redondear(secciones.flatMap((s) => s.lineas).reduce((t, l) => t + l.coste, 0), 2), secciones };
    });
  return { lineas, avisos, porTienda, total: redondear(porTienda.reduce((t, x) => t + x.total, 0), 2) };
}

/* ---------- Presupuesto ---------- */
/** Gasto del mes de `fecha` frente al presupuesto mensual. */
export function resumenPresupuesto(gastos, aj, fecha) {
  const a = { ...AJUSTES_POR_DEFECTO, ...aj };
  const mes = fecha.slice(0, 7);
  const [y, m, d] = fecha.split('-').map(Number);
  const diasMes = new Date(y, m, 0).getDate();
  const delMes = gastos.filter((g) => g.fecha.startsWith(mes));
  const gastado = redondear(delMes.reduce((t, g) => t + g.importe, 0), 2);
  const restante = redondear(a.presupuesto_mensual - gastado, 2);
  const diasRestantes = diasMes - d + 1; // contando hoy
  const esperado = redondear((a.presupuesto_mensual * d) / diasMes, 2);
  return {
    mes, presupuesto: a.presupuesto_mensual, gastado, restante, esperado,
    pct: Math.min(100, Math.round((gastado / a.presupuesto_mensual) * 100)),
    por_dia: diasRestantes > 0 ? redondear(Math.max(0, restante) / diasRestantes, 2) : 0,
    diasRestantes,
    estado: gastado > a.presupuesto_mensual ? 'pasado' : gastado > esperado * 1.1 ? 'adelantado' : 'bien',
    gastos: delMes.sort((x, y2) => y2.fecha.localeCompare(x.fecha)),
  };
}
