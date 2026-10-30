# Sincronizar el ordenador y el móvil (Supabase)

Mini-chef guarda los datos en cada dispositivo. Con Supabase (gratis) lo que apuntes en uno aparece en el otro.
Sigue funcionando sin internet: los cambios se suben cuando vuelve la conexión.

## 1. Crear el proyecto (una sola vez, ~5 min)

1. Entra en <https://supabase.com>, crea una cuenta y pulsa **New project** (plan *Free*). Ponle un nombre (p. ej. `mini-chef`), una contraseña de base de datos (guárdala) y la región más cercana (*West EU*).
2. Cuando esté listo, abre **SQL Editor → New query**, pega el contenido de [`supabase.sql`](supabase.sql) y pulsa **Run**. Debe decir *Success*.
3. **Authentication → Providers → Email**: comprueba que el proveedor **Email** esté **activado (Enable)** y desactiva **Confirm email** (así puedes entrar al momento). Guarda.
4. **Project Settings → API**: copia la **Project URL** (solo `https://….supabase.co`, sin nada detrás) y la clave **anon public**. (La clave anon es pública por diseño: lo que protege tus datos es tu contraseña y las reglas de la tabla, que solo dejan ver las filas de cada usuaria.)

## 2. Conectar el primer dispositivo

1. En Mini-chef: **Ajustes → Sincronizar dispositivos**. Pega la URL y la clave anon → **Guardar conexión**.
2. Escribe tu email y una contraseña (mínimo 6 caracteres) → **Crear cuenta (la primera vez)**.
3. Se suben todos los datos que ya tenías. Verás *Conectado como …*.
4. Recomendado: en Supabase, **Authentication → Sign In / Providers → desactiva "Allow new users to sign up"** para que nadie más pueda crear cuentas en tu proyecto.

## 3. Conectar el segundo dispositivo

1. En el primero: **Copiar código de conexión** (contiene la URL y la clave pública, sin contraseñas). Mándatelo por mensaje.
2. En el segundo: **Ajustes → Sincronizar dispositivos → pega el código → Usar código**.
3. Entra con el mismo email y contraseña (**Entrar**, no *Crear cuenta*). Se bajan todos tus datos.

## Cómo funciona

- Cada cambio se guarda en el dispositivo y se sube en segundo plano. Al abrir la app, al volver a ella y al recuperar la conexión se bajan los cambios del otro dispositivo.
- Si el mismo elemento se cambia en los dos, **gana el cambio más reciente** (de ese elemento, no de todo).
- Los borrados también se sincronizan.
- Si restauras una copia JSON, pasa a ser la versión más reciente y se sube.
- **Sesión caducada:** la app te lo dirá en Ajustes; vuelve a pulsar *Entrar*.
- La copia de seguridad JSON sigue ahí (*Ajustes → Descargar copia*): úsala también de vez en cuando.
