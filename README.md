# Sistema de Gestión de Tiempos Simplificado

Sistema de gestión de tiempos y facturación similar a Kimai, desarrollado con Next.js 14, TypeScript, Tailwind CSS y Supabase.

## Características

- ✅ **CRUD Completo**: Clientes, Proyectos, Tareas
- ✅ **Sistema de Tarifas en Cascada**: Tarea > Proyecto > Cliente > General
- ✅ **Time Tracker**: Botones inicio/pausa/fin con tracking en tiempo real
- ✅ **Paquetes de Horas**: Gestión de horas precompradas con seguimiento de consumo
- ✅ **Facturación Avanzada**: Generación de facturas desde períodos de trabajo, PDFs, estados
- ✅ **Portal de Clientes**: Acceso para clientes para ver proyectos y facturas
- ✅ **Dashboard**: Métricas y estadísticas
- ✅ **Reportes**: Exportación a CSV con filtros avanzados

## Stack Tecnológico

- **Frontend/Backend**: Next.js 14+ (App Router) con TypeScript
- **Base de Datos**: Supabase (PostgreSQL)
- **Autenticación**: Supabase Auth
- **UI**: Tailwind CSS + shadcn/ui
- **Facturación PDF**: @react-pdf/renderer
- **Deployment**: Vercel

## Configuración

### 1. Variables de Entorno

**⚠️ IMPORTANTE: NUNCA subas archivos `.env.local` o tokens al repositorio.**

Crea un archivo `.env.local` copiando `.env.example` y completa con tus valores reales:

```bash
cp .env.example .env.local
```

Luego edita `.env.local` con tus credenciales:

```env
NEXT_PUBLIC_SUPABASE_URL=tu_url_de_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_clave_anonima_de_supabase
```

### 2. Base de Datos

Ejecuta el script SQL en Supabase:

1. Ve a tu proyecto en Supabase
2. Abre el SQL Editor
3. Copia y ejecuta el contenido de `supabase/migrations/001_initial_schema.sql`

Ver instrucciones detalladas en `supabase/INSTRUCCIONES_BD.md`

### 3. Instalación de Dependencias

```bash
npm install
```

### 4. Ejecutar en Desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Estructura del Proyecto

```
/
├── app/
│   ├── (auth)/          # Páginas de autenticación
│   ├── (dashboard)/     # Dashboard principal
│   ├── (client-portal)/ # Portal para clientes
│   └── api/             # API routes
├── components/
│   ├── ui/              # Componentes shadcn/ui
│   ├── dashboard/       # Componentes del dashboard
│   ├── client-portal/   # Componentes del portal
│   └── invoices/       # Componentes de facturación
├── lib/
│   ├── supabase/        # Clientes de Supabase
│   ├── utils/           # Utilidades (tarifas, cálculos)
│   └── types/           # Tipos TypeScript
├── hooks/               # React hooks personalizados
└── supabase/
    └── migrations/      # Migraciones SQL
```

## Funcionalidades Principales

### Sistema de Tarifas en Cascada

El sistema resuelve las tarifas en este orden:
1. Tarifa de la tarea
2. Tarifa del proyecto
3. Tarifa por defecto del cliente
4. Tarifa general (configurable)

### Time Tracker

- Botones: Inicio → Pausa → Reanudar → Finalizar
- Solo una sesión activa a la vez
- Cálculo automático de duración y monto
- Vista de períodos recientes

### Facturación

- Crear facturas desde períodos de trabajo sin facturar
- Generación de PDFs profesionales
- Estados: Borrador, Enviada, Pagada, Vencida
- Soporte multi-moneda
- Cálculo automático de impuestos

### Portal de Clientes

- Autenticación separada para clientes
- Vista de proyectos asignados
- Estado de horas trabajadas
- Descarga de facturas

## Deployment en Vercel

1. Conecta tu repositorio a Vercel
2. Configura las variables de entorno en Vercel
3. Deploy automático en cada push

## Notas

- Asegúrate de configurar las políticas RLS en Supabase correctamente
- El sistema está diseñado para un solo usuario por cuenta
- Los clientes invitados tienen acceso de solo lectura

## Próximas Mejoras

- [ ] Envío de facturas por email
- [ ] Notificaciones de paquetes de horas
- [ ] Gráficos y visualizaciones avanzadas
- [ ] Exportación de reportes en múltiples formatos
- [ ] Integración con herramientas externas

## Licencia

MIT
