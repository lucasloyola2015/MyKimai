const Afip = require('@afipsdk/afip.js');
const fs = require('fs');
const path = require('path');

async function run() {
    console.log("=== Diagnóstico de Conexión AFIP ===");

    // 1. Detectar archivos de certificado y clave
    const rootDir = __dirname;
    const projectRoot = path.resolve(rootDir, '../');

    let certFiles = fs.readdirSync(projectRoot).filter(f => f.endsWith('.crt'));
    let keyFiles = fs.readdirSync(projectRoot).filter(f => f.endsWith('.key'));

    if (certFiles.length === 0) {
        const certsDir = path.join(projectRoot, 'certs');
        if (fs.existsSync(certsDir)) {
            const certsInDir = fs.readdirSync(certsDir).filter(f => f.endsWith('.crt'));
            certFiles = certsInDir.map(f => path.join('certs', f));
        }
    }
    if (keyFiles.length === 0) {
        const certsDir = path.join(projectRoot, 'certs');
        if (fs.existsSync(certsDir)) {
            const keysInDir = fs.readdirSync(certsDir).filter(f => f.endsWith('.key'));
            keyFiles = keysInDir.map(f => path.join('certs', f));
        }
    }

    if (certFiles.length === 0 || keyFiles.length === 0) {
        console.error("❌ No se encontraron archivos .crt o .key.");
        return;
    }

    const certPath = path.resolve(projectRoot, certFiles[0]);
    const keyPath = path.resolve(projectRoot, keyFiles[0]);

    console.log(`✅ Certificado: ${path.basename(certPath)}`);
    console.log(`✅ Clave:       ${path.basename(keyPath)}`);

    const CUIT = 23295269979;

    // Función auxiliar para probar un modo
    async function testMode(isProduction) {
        const modeName = isProduction ? "PRODUCCIÓN" : "HOMOLOGACIÓN";
        console.log(`\n============== PROBANDO MODO: ${modeName} ==============`);

        try {
            const afip = new Afip({
                CUIT: CUIT,
                production: isProduction,
                cert: fs.readFileSync(certPath, 'utf8'),
                key: fs.readFileSync(keyPath, 'utf8'),
                res_folder: path.resolve(rootDir, 'afip_temp'), // Use a specific folder for tokens
            });

            console.log(`[${modeName}] Consultando estado del servidor...`);
            const status = await afip.ElectronicBilling.getServerStatus();
            console.log(`✅ [${modeName}] ESTADO:`, status.AppServer, "| DbServer:", status.DbServer);

            console.log(`[${modeName}] Intentando obtener último comprobante (Pto 3, Cbte 11)...`);
            const lastVoucher = await afip.ElectronicBilling.getLastVoucher(3, 11);
            console.log(`✅ [${modeName}] ÚLTIMO COMPROBANTE AUTORIZADO: ${lastVoucher}`);

            return true;

        } catch (error) {
            console.error(`❌ [${modeName}] FALLÓ LA CONEXIÓN.`);
            const errMsg = error.message || "Error desconocido";
            console.error("   -> Error:", errMsg);

            if (errMsg.includes("CMS")) console.error("   -> SUGERENCIA: Certificado invalido o expirado.");
            if (errMsg.includes("WSAA")) console.error("   -> SUGERENCIA: Error de autorizacion/token.");

            if (error.response?.data) {
                try {
                    console.error("   -> Detalle AFIP:", JSON.stringify(error.response.data, null, 2));
                } catch (e) {
                    console.error("   -> Detalle AFIP (raw):", error.response.data);
                }
            }
            return false;
        }
    }

    // Ejecutar pruebas secuenciales
    console.log(`\nIniciando pruebas Cruzadas para CUIT: ${CUIT}`);

    // Primero probar PRODUCCIÓN (mas probable segun usuario)
    const prodSuccess = await testMode(true);

    if (prodSuccess) {
        console.log("\n✅ RESULTADO FINAL: El certificado funciona en PRODUCCIÓN.");
        console.log("👉 IMPORTANTE: Asegúrate de tener AFIP_PRODUCTION=true en tu .env.local");
    } else {
        // Si falla, probar HOMOLOGACIÓN
        const homoSuccess = await testMode(false);
        if (homoSuccess) {
            console.log("\n✅ RESULTADO FINAL: El certificado funciona en HOMOLOGACIÓN (Testing).");
            console.log("👉 IMPORTANTE: Debes cambiar a AFIP_PRODUCTION=false en tu .env.local");
        } else {
            console.log("\n❌ RESULTADO FINAL: El certificado NO funcionó en ningún entorno.");
        }
    }
}

run();
