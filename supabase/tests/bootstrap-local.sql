-- Exclusivamente para una base de pruebas VACÍA. No ejecutar en Supabase remoto.
create role anon;
create role authenticated;
create role service_role;
create role supabase_auth_admin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
