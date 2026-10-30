import { h, vaciar, aviso, montar } from '../ui.js';
import { sync, cargar } from '../store.js';

const cuando = (iso) => (iso ? new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'todavía no');

/** Tarjeta de Ajustes para sincronizar los datos entre el ordenador y el móvil (Supabase). */
export function tarjetaSincro() {
  const cuerpo = h('div');
  const tarjeta = h('section', { class: 'tarjeta' }, h('h2', {}, 'Sincronizar dispositivos'), cuerpo);

  const accion = (fn, ok) => async () => {
    try {
      const r = await fn();
      if (r?.error) throw new Error(r.error);
      if (ok) aviso(typeof ok === 'function' ? ok(r) : ok);
      await cargar();
    } catch (e) {
      aviso(e.message || 'No se pudo', 'error');
    }
    await pintar();
  };

  const copiarCodigo = async () => {
    const c = await sync.codigo();
    try {
      await navigator.clipboard.writeText(c);
      aviso('Código copiado: pégalo en el otro dispositivo');
    } catch {
      prompt('Copia este código y pégalo en el otro dispositivo', c);
    }
  };

  async function pintar() {
    const e = await sync.estado();
    vaciar(cuerpo);

    if (!e.configurado) {
      const url = h('input', { class: 'entrada', type: 'url', placeholder: 'https://xxxx.supabase.co', autocomplete: 'off' });
      const key = h('input', { class: 'entrada', type: 'text', placeholder: 'Clave anon (empieza por eyJ…)', autocomplete: 'off' });
      const codigo = h('input', { class: 'entrada', type: 'text', placeholder: 'Código de conexión', autocomplete: 'off' });
      montar(cuerpo,
        h('p', { class: 'sub' }, 'Así lo que apuntes en el móvil sale en el ordenador y al revés. Necesitas un proyecto gratuito de Supabase: la guía paso a paso está en docs/supabase.md del repositorio.'),
        h('h3', { class: 'titulo-paso' }, 'Primer dispositivo'),
        h('label', {}, 'URL del proyecto', url),
        h('label', {}, 'Clave pública (anon)', key),
        h('button', { class: 'btn', type: 'button', onclick: accion(() => sync.configurar({ url: url.value, key: key.value }), 'Conexión guardada') }, 'Guardar conexión'),
        h('h3', { class: 'titulo-paso' }, '¿Ya lo configuraste en otro dispositivo?'),
        h('label', {}, 'Pega aquí el código de conexión', codigo),
        h('button', { class: 'btn secundario', type: 'button', onclick: accion(() => sync.usarCodigo(codigo.value), 'Conexión guardada') }, 'Usar código'));
      return;
    }

    if (!e.conectado) {
      const email = h('input', { class: 'entrada', type: 'email', autocomplete: 'username', placeholder: 'tu@email.com' });
      const pass = h('input', { class: 'entrada', type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña (mín. 6 caracteres)' });
      montar(cuerpo,
        e.error && h('p', { class: 'sub alerta' }, e.error),
        h('p', { class: 'sub' }, 'Entra con la misma cuenta en todos tus dispositivos.'),
        h('label', {}, 'Email', email),
        h('label', {}, 'Contraseña', pass),
        h('button', { class: 'btn', type: 'button', onclick: accion(() => sync.entrar(email.value.trim(), pass.value), (r) => `Conectado${r?.bajadas ? `: ${r.bajadas} cambios recibidos` : ''}`) }, 'Entrar'),
        h('button', { class: 'btn secundario', type: 'button', onclick: accion(() => sync.entrar(email.value.trim(), pass.value, { registrar: true }), 'Cuenta creada y conectada') }, 'Crear cuenta (la primera vez)'),
        h('button', { class: 'btn secundario', type: 'button', onclick: copiarCodigo }, 'Copiar código de conexión'),
        h('button', { class: 'btn peligro', type: 'button', onclick: accion(() => sync.olvidarProyecto()) }, 'Cambiar de proyecto'));
      return;
    }

    montar(cuerpo,
      h('p', {}, `Conectado como ${e.email}`),
      h('p', { class: 'sub' }, `Última sincronización: ${cuando(e.ultima)}${e.pendientes ? ` · ${e.pendientes} cambios por subir` : ''}`),
      e.error && h('p', { class: 'sub alerta' }, `Último error: ${e.error}`),
      h('p', { class: 'sub' }, 'Se sincroniza sola al abrir la app, al volver a ella y al recuperar la conexión. Sin internet todo sigue funcionando y se sube después.'),
      h('button', { class: 'btn', type: 'button', onclick: accion(() => sync.sincronizar(), (r) => (r ? `Listo: ${r.bajadas} recibidos, ${r.subidas} enviados` : 'Sin conexión')) }, 'Sincronizar ahora'),
      h('button', { class: 'btn secundario', type: 'button', onclick: copiarCodigo }, 'Copiar código para otro dispositivo'),
      h('button', { class: 'btn peligro', type: 'button', onclick: accion(() => sync.salir(), 'Sesión cerrada en este dispositivo') }, 'Cerrar sesión'));
  }

  pintar();
  return tarjeta;
}
