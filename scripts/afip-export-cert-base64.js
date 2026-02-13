/**
 * Genera las variables AFIP_KEY_B64 y AFIP_CERT_B64 para .env.local
 * a partir de los archivos en la carpeta certs/.
 *
 * Necesitás:
 *   - certs/private.key   (clave privada que usaste para generar el CSR)
 *   - certs/certificate.crt  (certificado firmado por AFIP, descargado de AFIP > WSAA)
 *
 * Uso: node scripts/afip-export-cert-base64.js
 * Copiá las líneas que imprime y pegálas en .env.local
 */

const fs = require("fs");
const path = require("path");

const certsDir = path.join(process.cwd(), "certs");

function findFile(ext) {
  try {
    const names = fs.readdirSync(certsDir);
    const found = names.find((n) => n.toLowerCase().endsWith(ext));
    return found ? path.join(certsDir, found) : null;
  } catch {
    return null;
  }
}

const keyPath = path.join(certsDir, "private.key");
const keyFile = fs.existsSync(keyPath) ? keyPath : findFile(".key");

const certPath = path.join(certsDir, "certificate.crt");
const certPathCer = path.join(certsDir, "certificate.cer");
const certFile =
  (fs.existsSync(certPath) && certPath) ||
  (fs.existsSync(certPathCer) && certPathCer) ||
  findFile(".crt") ||
  findFile(".cer");

if (!keyFile) {
  console.error("No se encontró archivo de clave privada (.key) en certs/");
  console.error("Colocá tu archivo private.key en la carpeta certs/");
  process.exit(1);
}
if (!certFile) {
  console.error("No se encontró certificado (.crt o .cer) en certs/");
  console.error("Descargá el certificado desde AFIP (WSAA) y guardalo como certificate.crt en certs/");
  process.exit(1);
}

const keyContent = fs.readFileSync(keyFile, "utf8");
const certContent = fs.readFileSync(certFile, "utf8");

const keyB64 = Buffer.from(keyContent, "utf8").toString("base64");
const certB64 = Buffer.from(certContent, "utf8").toString("base64");

console.log("\n# Pegá estas líneas en .env.local (AFIP):\n");
console.log("AFIP_KEY_B64=" + keyB64);
console.log("AFIP_CERT_B64=" + certB64);
console.log("");
