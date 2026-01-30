
import Afip from '@afipsdk/afip.js';

if (typeof window !== 'undefined') {
    throw new Error('El SDK de AFIP no debe cargarse en el cliente.');
}


/**
 * Service to manage AFIP SDK initialization and authentication.
 * Certificates are read from Base64 environment variables to support Serverless environments like Vercel.
 */
export const getAfipClient = () => {
    const cuit = process.env.AFIP_CUIT;
    const keyB64 = process.env.AFIP_KEY_B64;
    const certB64 = process.env.AFIP_CERT_B64;
    const isProduction = process.env.AFIP_PRODUCTION === 'true';

    if (!cuit || !keyB64 || !certB64) {
        throw new Error('Missing AFIP configuration: AFIP_CUIT, AFIP_KEY_B64, or AFIP_CERT_B64');
    }

    // Convert Base64 strings back to their original content
    // Note: Afip.js expecting the content of the files, but the SDK sometimes expects paths.
    // We'll use the constructor that accepts the content if possible, or temporary buffers.

    return new Afip({
        CUIT: parseInt(cuit),
        production: isProduction,
        cert: Buffer.from(certB64, 'base64').toString('utf-8'),
        key: Buffer.from(keyB64, 'base64').toString('utf-8'),
    });
};
