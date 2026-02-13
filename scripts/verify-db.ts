import { prisma } from '../lib/prisma/client';

async function verifyDatabase() {
    console.log('🔍 Verificando estructura de la base de datos...\n');

    try {
        // Verificar enum invoice_status
        console.log('1️⃣ Verificando enum invoice_status...');
        const enumQuery = await prisma.$queryRaw<Array<{ invoice_status_values: string }>>`
            SELECT unnest(enum_range(NULL::invoice_status)) AS invoice_status_values;
        `;
        console.log('   Valores encontrados:', enumQuery.map(e => e.invoice_status_values).join(', '));
        
        const hasCancelled = enumQuery.some(e => e.invoice_status_values === 'cancelled');
        console.log(hasCancelled ? '   ✅ Valor "cancelled" encontrado' : '   ❌ Valor "cancelled" NO encontrado');
        console.log('');

        // Verificar tabla user_fiscal_settings
        console.log('2️⃣ Verificando tabla user_fiscal_settings...');
        const columnsQuery = await prisma.$queryRaw<Array<{
            column_name: string;
            data_type: string;
            is_nullable: string;
        }>>`
            SELECT 
                column_name, 
                data_type, 
                is_nullable
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = 'user_fiscal_settings'
            ORDER BY ordinal_position;
        `;

        const expectedColumns = [
            'id', 'user_id', 'business_name', 'tax_id', 'legal_address',
            'tax_condition', 'gross_income', 'activity_start_date',
            'logo_url', 'phone', 'email', 'created_at', 'updated_at'
        ];

        console.log(`   Columnas encontradas: ${columnsQuery.length}`);
        columnsQuery.forEach(col => {
            console.log(`   - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
        });

        const foundColumns = columnsQuery.map(c => c.column_name);
        const missingColumns = expectedColumns.filter(col => !foundColumns.includes(col));
        
        if (missingColumns.length === 0) {
            console.log('   ✅ Todas las columnas esperadas están presentes');
        } else {
            console.log(`   ❌ Faltan columnas: ${missingColumns.join(', ')}`);
        }
        console.log('');

        // Verificar índices
        console.log('3️⃣ Verificando índices de user_fiscal_settings...');
        const indexesQuery = await prisma.$queryRaw<Array<{ indexname: string }>>`
            SELECT indexname
            FROM pg_indexes 
            WHERE schemaname = 'public' 
              AND tablename = 'user_fiscal_settings';
        `;
        console.log(`   Índices encontrados: ${indexesQuery.length}`);
        indexesQuery.forEach(idx => {
            console.log(`   - ${idx.indexname}`);
        });
        console.log('');

        // Verificar que la tabla existe y se puede consultar
        console.log('4️⃣ Verificando acceso a la tabla...');
        const count = await prisma.user_fiscal_settings.count();
        console.log(`   ✅ Tabla accesible. Registros encontrados: ${count}`);
        console.log('');

        console.log('✅ Verificación completada');
    } catch (error: any) {
        console.error('❌ Error durante la verificación:', error.message);
        if (error.message.includes('does not exist')) {
            console.error('   La tabla user_fiscal_settings no existe en la base de datos.');
        }
    } finally {
        await prisma.$disconnect();
    }
}

verifyDatabase();
