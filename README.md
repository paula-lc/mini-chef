# Mini-chef

App web personal (en español, pensada para el móvil en la cocina) para planificar recetas de
batch cooking y calcular macros y coste por ración. Funciona sin conexión (PWA) y guarda los datos
en el propio navegador, con copia de seguridad en JSON.

**Estado:** Fases 1 y 2 (recetas y raciones; registro diario con objetivos y plantillas). Peso/ciclo y compra llegarán en las fases 3-4.

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

- `data/products.json`: 57 productos. Cada uno guarda macros por 100 g, envase, escurrido, precio, €/kg,
  `fuente` (`paula`, `etiqueta`, `off`, `estandar`), `estado` y `estimado`.
  La lista legible está en [docs/productos.md](docs/productos.md).
- `data/recipes.json`: 12 recetas pedidas + 3 componentes, con **cantidades estimadas** (estado *borrador*).
- Se cargan una sola vez, la primera vez que abres la app. *Ajustes → Restaurar los que falten*
  recupera lo que borraste sin tocar lo que hayas editado.

Procedencia: los nutricionales de Mercadona se leyeron de la foto de la etiqueta o de Open Food Facts
(por EAN). La app **nunca** consulta Mercadona en tiempo real.

## Copia de seguridad

*Ajustes → Descargar copia (JSON)* guarda productos, recetas, días registrados, plantillas y ajustes. *Restaurar desde copia* los reemplaza.
Los datos viven solo en el navegador: si borras los datos del sitio, se pierden. Descarga una copia de vez en cuando.

## Estructura

```
index.html, manifest.webmanifest, sw.js   PWA
css/styles.css                            estilos (ventanas retro)
js/calc.js                                cálculos puros (macros, tupper, Rakan, coste) — con tests
js/dia.js                                registro diario puro (objetivos, totales, plantillas) — con tests
js/repo.js                                capa de datos: la UI solo usa esta interfaz
js/store.js                               estado en memoria + arranque
js/ui.js, js/app.js, js/views/*           interfaz
data/                                     semilla de productos y recetas
tests/                                    tests (node --test)
tools/                                    servidor local y generador de iconos
```

### Migrar a Supabase más adelante
`js/repo.js` define un *adaptador* con `leer(coleccion)` y `escribir(coleccion, filas)`. Hoy hay uno para
`localStorage`. Para Supabase se escribe otro adaptador (tablas `productos`, `recetas`, `registros`, `plantillas`, `ajustes`) con la misma
interfaz y se cambia una línea en `js/store.js`; la interfaz no toca `localStorage` en ningún sitio.
Los datos ya son filas con `id`, `creado` y `actualizado`, y la copia JSON sirve para volcar lo existente.

## Licencia de datos
Los valores nutricionales son de etiquetas de producto y de Open Food Facts (ODbL). Úsalos para uso personal.
