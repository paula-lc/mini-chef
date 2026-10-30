import { h, num, aviso } from '../ui.js';
import { repo, datos, cargar, restaurarSemilla } from '../store.js';

export function ajustes(root) {
  const a = datos.ajustes;

  const descargar = async () => {
    const copia = await repo.exportar();
    const blob = new Blob([JSON.stringify(copia, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dia = new Date().toISOString().slice(0, 10);
    const enlace = h('a', { href: url, download: `mini-chef-copia-${dia}.json` });
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    aviso('Copia descargada');
  };

  const importar = async (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo) return;
    try {
      const datosArchivo = JSON.parse(await archivo.text());
      if (!confirm('Esto reemplaza TODOS tus productos, recetas, días, plantillas, pesos, entrenos, stock y gastos actuales por los de la copia. ¿Seguir?')) return;
      const n = await repo.importar(datosArchivo);
      await cargar();
      aviso(`Copia restaurada: ${n.productos} productos, ${n.recetas} recetas, ${n.registros} días, ${n.plantillas} plantillas, ${n.pesos} pesos, ${n.entrenos} entrenos, ${n.inventario} del stock, ${n.gastos} gastos`);
    } catch (err) {
      aviso(err.message || 'No se pudo leer el archivo', 'error');
    }
  };

  const numero = (clave, etiqueta, ayuda) => h('label', {}, etiqueta,
    h('input', {
      class: 'entrada', type: 'text', inputmode: 'decimal', value: String(a[clave]).replace('.', ','),
      onchange: async (e) => {
        const v = num(e.target.value);
        if (!(v > 0)) { e.target.value = String(a[clave]).replace('.', ','); return aviso('Valor no válido', 'error'); }
        await repo.guardarAjustes({ [clave]: v });
        datos.ajustes = await repo.ajustes();
        aviso('Guardado');
      },
    }), h('span', { class: 'sub' }, ayuda));

  root.append(
    h('header', { class: 'cab' }, h('h1', {}, 'Ajustes')),
    h('section', { class: 'tarjeta' },
      h('h2', {}, 'Raciones'),
      numero('multiplicador_pareja', 'Rakan: multiplicador de hidratos', 'Se aplica a los ingredientes marcados "Rakan toma más" (arroz, pasta, patata, pan). 1,6 = un 60 % más.'),
      numero('kcal_tupper', 'kcal por tupper por defecto (Paula)', 'Valor inicial de la calculadora de tupper.')),
    h('section', { class: 'tarjeta' },
      h('h2', {}, 'Objetivos diarios'),
      numero('kcal_entreno', 'kcal en día de entreno', ''),
      numero('kcal_descanso', 'kcal en día de descanso', ''),
      numero('kcal_mantenimiento', 'kcal de mantenimiento', 'Se usan cuando duermes menos horas que el límite de abajo.'),
      numero('sueno_min_h', 'Horas de sueño mínimas', 'Por debajo de esto, el objetivo pasa a mantenimiento.'),
      numero('proteina_min', 'Proteína mínima (g)', ''),
      numero('grasa_min', 'Grasa mínima (g)', ''),
      numero('grasa_max', 'Grasa máxima (g)', 'Los hidratos son lo que sobra: kcal − proteína mínima − grasa media.')),
    h('section', { class: 'tarjeta' },
      h('h2', {}, 'Compra'),
      numero('presupuesto_mensual', 'Presupuesto mensual (€, para 2)', ''),
      numero('tupper_aviso_dias', 'Avisar de tuppers guardados desde hace (días)', 'En Stock se marcan en rojo los tuppers más antiguos que esto.')),
    h('section', { class: 'tarjeta' },
      h('h2', {}, 'Copia de seguridad'),
      h('p', { class: 'sub' }, repo.persistente
        ? 'Tus datos viven solo en este navegador. Descarga una copia de vez en cuando.'
        : '⚠ Este navegador no permite guardar datos: lo que cambies se perderá al cerrar.'),
      h('button', { class: 'btn', onclick: descargar }, 'Descargar copia (JSON)'),
      h('label', { class: 'btn secundario subir' }, 'Restaurar desde copia…',
        h('input', { type: 'file', accept: 'application/json,.json', onchange: importar, hidden: true }))),
    h('section', { class: 'tarjeta' },
      h('h2', {}, 'Datos iniciales'),
      h('p', { class: 'sub' }, 'Si borraste un producto o receta de la semilla, puedes recuperarlo. No toca lo que ya hayas editado.'),
      h('button', {
        class: 'btn secundario', onclick: async () => {
          const n = await restaurarSemilla();
          aviso(n ? `Recuperados ${n} elementos` : 'No faltaba nada');
        },
      }, 'Restaurar los que falten')),
    h('p', { class: 'sub centro' }, 'Mini-chef 0.4 · Fases 1–4'));
}
