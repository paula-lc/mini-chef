-- Mini-chef · tabla de sincronización. Pégalo en Supabase → SQL Editor → Run.
-- Una fila por elemento (receta, día, peso…). Cada usuaria solo ve y escribe lo suyo (RLS).

create table if not exists public.filas (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  coleccion   text        not null,
  id          text        not null,
  datos       jsonb,
  borrado     boolean     not null default false,
  actualizado timestamptz not null default now(),
  primary key (user_id, coleccion, id)
);

create index if not exists filas_user_actualizado on public.filas (user_id, actualizado);

alter table public.filas enable row level security;

drop policy if exists "solo mis filas" on public.filas;
create policy "solo mis filas" on public.filas
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
