# Mini-chef

App web personal (en español, pensada para el móvil en la cocina) para planificar recetas de
batch cooking y calcular macros y coste por ración. Funciona sin conexión (PWA) y guarda los datos
en el propio navegador, con copia de seguridad en JSON.

**Estado:** Fases 1 a 4 (recetas; registro diario; peso, ciclo y fuerza; compra, stock y presupuesto).

## Probarla en local

Necesitas Node 18 o superior (no hay dependencias que instalar).

```bash
npm start
```

Abre <http://localhost:8080/>. Para los tests de cálculo:

```bash
npm test
```

## Publicarla en GitHub Pages

1. Crea el repositorio `paula-lc/mini-chef` y sube el contenido de esta carpeta (la raíz del repo es donde está `index.html`).
2. En GitHub: *Settings → Pages → Deploy from a branch → `main` / `/ (root)`*.
3. Abre `https://paula-lc.github.io/mini-chef/` en el móvil y usa *Añadir a pantalla de inicio* para instalarla.

Todas las rutas son relativas, así que funciona bajo la subruta `/mini-chef/`. Cuando cambies archivos
y quieras que el móvil descargue la versión nueva, sube el número de `VERSION` en `sw.js`.

## Cómo se usa

### Cocinar un batch y repartir los tuppers
1. Entra en una receta y, al terminar de cocinar, escribe el **peso total cocinado** (con la olla tarada).
2. Elige el modo:
   - **Por kcal:** dices cuántas kcal quieres en el tupper de Paula y la app te da los gramos.
   - **Por nº de raciones:** reparte la olla en N tuppers iguales.
3. Verás los gramos por tupper, los macros y el coste de cada ración.

### Paula y Rakan
Rakan toma el mismo tupper y, **aparte**, más cantidad de los ingredientes marcados como *"Rakan toma más"*
(arroz, pasta, patata, pan…): `(multiplicador − 1) ×` lo que lleva el tupper de Paula. La proteína no cambia.
El multiplicador (1,6 por defecto) se cambia en *Ajustes*. En el editor de cada receta marcas qué ingredientes escalan.
Para el ingrediente en crudo te dice también el equivalente cocido (si el producto tiene rendimiento de cocción).

### Componentes de batch
Un *componente* (arroz cocido, pollo shawarma, verduras asadas…) es una receta normal. Otra receta lo usa
como ingrediente **en gramos cocinados**, y sus macros salen de los macros por gramo cocinado del componente
(por eso necesita su peso cocinado).

### Ingredientes en crudo o ya cocinados
Si un producto tiene **rendimiento** (arroz 2,7: 100 g crudos → 270 g cocidos) puedes pesarlo *en crudo* o *ya cocinado*
en el editor de la receta; la app lo convierte.

### Registro diario (pantalla *Hoy*)
1. Marca si es día de **entreno** o **descanso** y, si quieres, las **horas dormidas**.
2. El objetivo se calcula solo: entreno 1650 kcal, descanso 1450 kcal, y **1850 kcal (mantenimiento) si dormiste menos de 6 h**.
   Proteína ≥ 125 g, grasa entre 45 y 55 g, y los hidratos son lo que sobra (kcal − proteína mínima − grasa media).
   Todo se cambia en *Ajustes → Objetivos diarios*.
3. En cada comida, **＋ Añadir** una *receta* (gramos cocinados que te sirves; propone el tupper de tus kcal por defecto),
   un *producto* (en crudo o ya cocinado), algo *libre* (nombre + macros) o una *plantilla*.
4. Toca el nombre de un elemento para corregir los gramos; ✕ lo quita. Con ‹ › cambias de día.
5. **Plantillas:** *Guardar plantilla* en una comida (se puede aplicar a cualquier comida) o *Guardar este día* (se aplica entero).
   Al aplicarlas se recalculan con tus datos actuales; si falta un producto o receta te avisa de cuáles omitió.

Los macros de cada elemento se **guardan en el momento de añadirlo**: si luego corriges una receta o un producto,
los días ya registrados no cambian.

### Peso, plan y ciclo (pestaña *Progreso*)
- **Peso:** apunta el peso en ayunas. La app usa la **media de 7 días** (el peso de un día tiene mucho ruido) y la compara con el **plan**:
  recta de 62,55 kg el 30-10-2026 a 59 kg el 29-12-2026 (−0,41 kg/semana). Se ve diferencia, ritmo real y una gráfica.
- **Ajuste de calorías:** si las medias de 7 días de las últimas 3 semanas no bajan más de 0,1 kg de una a otra (2 semanas planas),
  sugiere **−100 kcal/día**. Necesita ≥3 pesos por semana, no sugiere si ya vas por debajo del plan y espera 14 días tras aplicar uno.
  Al aplicarlo se resta de los objetivos de entreno y descanso (no del mantenimiento por poco sueño); se puede quitar.
- **Ciclo:** apunta el primer día de cada regla. Muestra la fase (menstrual, folicular, ovulación, lútea), el día y la próxima regla estimada.
  La duración es la media de tus últimos ciclos (28 días si aún hay pocos datos) y la ovulación es una estimación, no un dato médico.
  En fase lútea o menstrual la app avisa de que la retención de líquidos puede enmascarar la bajada.
- El plan (fechas y pesos) está en `AJUSTES_POR_DEFECTO` de `js/repo.js`; si lo cambias, hazlo ahí.

### Fuerza (Hevy)
*Progreso → Fuerza (Hevy)*: importa el CSV de Hevy (*Perfil → Ajustes → Exportar datos*). Reimportarlo no duplica entrenos.
Por ejercicio ves el 1RM estimado (fórmula de Epley, solo series de ≤12 repeticiones y sin calentamientos), tu mejor marca,
la gráfica de evolución y el volumen por entreno. Si Hevy tiene un entreno un día, la pantalla *Hoy* lo marca como día de entreno.

### Compra, stock y presupuesto (pestaña *Compra*)
- **Lista:** elige las recetas que cocinas (con 0,5 de paso: las cantidades de cada receta son las de la olla entera, así que
  pon 1,5 si cocinas más para Rakan). La app suma los ingredientes **en crudo** (un componente aporta la parte proporcional que usas),
  resta lo que tienes en *Stock*, redondea a **envases enteros** y agrupa por **tienda y sección** en el orden del súper
  (congelados, carnicería, lácteos, fruta y verdura, despensa). Marca lo que vas metiendo en el carro. Los extras (productos o
  cosas libres como detergente) se suman al total.
- **Registrar compra:** guarda el importe real como gasto, y si quieres añade lo comprado al stock. Si no marcaste nada, registra toda la lista.
- **Stock:** congelador, nevera y despensa. Productos (en g, unidades o envases), **tuppers** de una receta (con la fecha en que los
  guardaste: pasados los días de Ajustes se marcan en rojo) y cosas libres. *−1* resta un tupper/envase.
- **Gasto:** presupuesto de **520 €/mes para 2** (cámbialo en Ajustes): cuánto llevas, cuánto queda, euros al día que quedan y si vas
  por delante del ritmo. Compara también el total de la lista con lo que te queda.
- Los precios son los del catálogo (nunca se consulta Mercadona en tiempo real): si cambian, edítalos en *Compra → Productos*.

## Cómo añadir y editar productos a mano

*Productos → ＋ Nuevo producto* (o toca uno existente para editarlo):

1. Copia de la etiqueta los valores **por 100 g**: energía, proteína, hidratos, grasa y fibra (déjala vacía si no sale).
2. Pon el **peso del envase** y el **precio**. Si el envase indica peso escurrido (legumbres, mozzarella, gambas), añádelo:
   el €/kg se calcula sobre el escurrido.
3. Opcional: *peso de 1 unidad* (huevo, pan, limón) y *rendimiento al cocinar* (arroz, pasta, lentejas).
4. Marca el estado:
   - **Verificado:** lo has comprobado en la etiqueta.
   - **Pendiente:** el dato viene de una fuente (Open Food Facts) o es una estimación, sin confirmar.
   - **Revisar:** las kcal no cuadran con los macros. La app lo marca sola si guardas algo que no cuadra.

La app comprueba que `kcal ≈ 4·P + 4·C + 9·G + 2·fibra` (±10 %). Se suma la fibra porque en la etiqueta
europea los hidratos no la incluyen. Si una etiqueta no trae fibra, se tolera la diferencia.

Para corregir muchos de golpe, filtra por **Pendientes** en la lista de productos y ve confirmándolos uno a uno.

## Datos iniciales (semilla)

- `data/products.json`: 84 productos. Cada uno guarda macros por 100 g, envase, escurrido, precio, €/kg,
  `fuente` (`paula`, `etiqueta`, `off`, `estandar`), `estado` y `estimado`.
  La lista legible está en [docs/productos.md](docs/productos.md).
- `data/recipes.json`: 14 recetas + 3 componentes, con **cantidades estimadas** (estado *borrador*).
- Se cargan una sola vez, la primera vez que abres la app. *Ajustes → Restaurar los que falten*
  recupera lo que borraste sin tocar lo que hayas editado.

Procedencia: los nutricionales de Mercadona se leyeron de la foto de la etiqueta o de Open Food Facts
(por EAN). La app **nunca** consulta Mercadona en tiempo real.

## Sincronizar ordenador y móvil

*Ajustes → Sincronizar dispositivos* conecta la app a un proyecto gratuito de Supabase para que lo que apuntes en un dispositivo salga
en el otro. Guía paso a paso en [docs/supabase.md](docs/supabase.md) (el SQL está en [docs/supabase.sql](docs/supabase.sql)).
Sin conexión sigue funcionando; gana el cambio más reciente de cada elemento.

## Copia de seguridad

*Ajustes → Descargar copia (JSON)* guarda productos, recetas, días registrados, plantillas, pesos, entrenos, listas, stock, gastos y ajustes. *Restaurar desde copia* los reemplaza.
Los datos viven solo en el navegador: si borras los datos del sitio, se pierden. Descarga una copia de vez en cuando.

## Estructura

```
index.html, manifest.webmanifest, sw.js   PWA
css/styles.css                            estilos (ventanas retro)
js/calc.js                                cálculos puros (macros, tupper, Rakan, coste) — con tests
js/compra.js                              lista de la compra, stock y presupuesto (puro) — con tests
js/progreso.js                           peso, plan, ciclo e importación de Hevy (puro) — con tests
js/dia.js                                registro diario puro (objetivos, totales, plantillas) — con tests
js/repo.js                                capa de datos: la UI solo usa esta interfaz
js/sync.js                                sincronización con Supabase (REST + Auth, sin librerías) — con tests
js/store.js                               estado en memoria + arranque
js/ui.js, js/app.js, js/views/*           interfaz
data/                                     semilla de productos y recetas
tests/                                    tests (node --test)
tools/                                    servidor local y generador de iconos
```

### Cómo está montada la sincronización
`js/repo.js` sigue siendo la única puerta a los datos (adaptador `leer/escribir`, hoy `localStorage`). `js/sync.js` se engancha con un aviso
por cada guardado o borrado (`alCambiar`), mantiene una cola de cambios pendientes y habla con la tabla `filas` de Supabase por REST.
Los datos de cada dispositivo son la fuente primaria; la nube solo repara las diferencias (gana el `actualizado` más reciente).

## Licencia de datos
Los valores nutricionales son de etiquetas de producto y de Open Food Facts (ODbL). Úsalos para uso personal.
