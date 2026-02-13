import Afip from '@afipsdk/afip.js';
import fs from 'fs';
import path from 'path';

if (typeof window !== 'undefined') {
    throw new Error('El SDK de AFIP no debe cargarse en el cliente.');
}


/**
 * Service to manage AFIP SDK initialization and authentication.
 * El SDK @afipsdk/afip.js maneja automáticamente la obtención del Token (WSAA)
 * usando el Certificado y la Clave Privada.
 */
export const getAfipClient = (cuitEmisor?: string | null) => {
    const cuitRaw = (cuitEmisor ?? process.env.AFIP_CUIT)?.replace(/\D/g, "") ?? "";
    const cuit = cuitRaw.length === 11 ? cuitRaw : process.env.AFIP_CUIT?.replace(/\D/g, "") ?? "";
    const isProduction = process.env.AFIP_PRODUCTION === "true";

    if (!cuit || cuit.length !== 11) {
        throw new Error("CUIT del emisor inválido o faltante. Configurá el CUIT en Ajustes > Datos fiscales o en .env como AFIP_CUIT (11 dígitos).");
    }

    // 1. Intentar cargar desde variables de entorno (Base64) - Ideal para Vercel
    let certContent = process.env.AFIP_CERT_B64
        ? Buffer.from(process.env.AFIP_CERT_B64, "base64").toString("utf-8")
        : null;
    let keyContent = process.env.AFIP_KEY_B64
        ? Buffer.from(process.env.AFIP_KEY_B64, "base64").toString("utf-8")
        : null;

    // 2. Si no hay variables de entorno, intentar cargar desde archivos locales
    if (!certContent || !keyContent) {
        try {
            const rootDir = process.cwd();
            // Buscar archivos .crt y .key en la raíz o en ./certs
            // Prioridad: ./certs/ luego ./

            const findFile = (ext: string): string | null => {
                const searchDirs = [path.join(rootDir, 'certs'), rootDir];
                for (const dir of searchDirs) {
                    if (fs.existsSync(dir)) {
                        const files = fs.readdirSync(dir).filter(f => f.endsWith(ext));
                        if (files.length > 0) return path.join(dir, files[0]);
                    }
                }
                return null;
            };

            const certPath = findFile('.crt');
            const keyPath = findFile('.key');

            if (certPath && keyPath) {
                console.log(`[AFIP] Usando certificados locales: ${path.basename(certPath)} | ${path.basename(keyPath)}`);
                certContent = fs.readFileSync(certPath, 'utf8');
                keyContent = fs.readFileSync(keyPath, 'utf8');
            }
        } catch (err) {
            console.error("[AFIP] Error buscando certificados locales:", err);
        }
    }

    if (!certContent || !keyContent) {
        throw new Error("Faltan certificados AFIP. Configurá AFIP_KEY_B64/AFIP_CERT_B64 en .env o colocá los archivos .crt y .key en la carpeta root o /certs.");
    }

    // Opcional: Access Token forzado (solo si se provee explícitamente, pero no es requerido)
    const accessToken = process.env.AFIP_ACCESS_TOKEN?.trim();

    const mode = isProduction ? "PRODUCCIÓN" : "HOMOLOGACIÓN";
    console.log(`[AFIP] Modo: ${mode} | CUIT: ${cuit}`);

    return new Afip({
        CUIT: parseInt(cuit, 10),
        production: isProduction,
        cert: certContent,
        key: keyContent,
        access_token: accessToken || undefined, // Si es undefined, el SDK genera uno nuevo
    });
};
