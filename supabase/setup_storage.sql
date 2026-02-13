-- Crear el bucket de logos si no existe
insert into storage.buckets (id, name, public)
select 'logos', 'logos', true
where not exists (
    select 1 from storage.buckets where id = 'logos'
);

-- Configurar RLS para el bucket de logos
-- 1. Permitir acceso público a los archivos (lectura)
create policy "Logo Public Read Access"
on storage.objects for select
using ( bucket_id = 'logos' );

-- 2. Permitir a usuarios autenticados subir archivos
create policy "Authenticated Users Upload Logos"
on storage.objects for insert
with check (
    bucket_id = 'logos' 
    AND auth.role() = 'authenticated'
);

-- 3. Permitir a los usuarios el borrado de sus propios logos o logos del bucket
create policy "Authenticated Users Delete Logos"
on storage.objects for delete
using (
    bucket_id = 'logos' 
    AND auth.role() = 'authenticated'
);
