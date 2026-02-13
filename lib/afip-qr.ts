/**
 * Genera la URL del código QR para facturas electrónicas según especificación AFIP/ARCA.
 * @see https://www.afip.gob.ar/fe/qr/documentos/QRespecificaciones.pdf
 *
 * Formato: https://www.afip.gob.ar/fe/qr/?p={DATOS_CMPBASE64}
 * DATOS_CMPBASE64 = JSON del comprobante codificado en Base64.
 */

import { PUNTO_VENTA_DEFAULT } from "@/lib/fiscal-config";

const AFIP_QR_BASE_URL = "https://www.afip.gob.ar/fe/qr/";

export interface AfipQrPayload {
  /** Versión del formato (1) */
  ver: number;
  /** Fecha de emisión full-date RFC3339 (YYYY-MM-DD) */
  fecha: string;
  /** CUIT del emisor (11 dígitos) */
  cuit: number;
  /** Punto de venta (hasta 5 dígitos) */
  ptoVta: number;
  /** Tipo de comprobante (ej. 11 = Factura C) */
  tipoCmp: number;
  /** Número de comprobante (hasta 8 dígitos) */
  nroCmp: number;
  /** Importe total (13 enteros, 2 decimales) */
  importe: number;
  /** Moneda 3 caracteres: "PES" | "DOL" */
  moneda: string;
  /** Cotización en pesos (1 si es pesos) */
  ctz: number;
  /** Tipo documento receptor (ej. 80 = CUIT). Opcional. */
  tipoDocRec?: number;
  /** Número de documento receptor. Opcional. */
  nroDocRec?: number;
  /** "E" = CAE, "A" = CAEA */
  tipoCodAut: "E" | "A";
  /** Código de autorización 14 dígitos */
  codAut: number;
}

/**
 * Construye la URL que debe codificarse en el QR del comprobante.
 * @param payload Datos del comprobante según especificación AFIP
 */
export function getAfipQrUrl(payload: AfipQrPayload): string {
  const json = JSON.stringify(payload);
  let base64: string;
  if (typeof btoa !== "undefined") {
    base64 = btoa(unescape(encodeURIComponent(json)));
  } else {
    base64 = Buffer.from(json, "utf8").toString("base64");
  }
  return `${AFIP_QR_BASE_URL}?p=${base64}`;
}

/**
 * Parámetros para construir el payload desde una factura de la DB.
 */
export interface InvoiceForQr {
  issue_date: Date | string;
  punto_venta: number | null;
  cbte_tipo: number | null;
  cbte_nro: number | null;
  total_amount: number | string;
  currency: string;
  cae: string | null;
  /** CUIT del emisor (requerido para el QR) */
  issuer_tax_id?: string | null;
  /** CUIT del cliente/receptor (opcional) */
  client_tax_id?: string | null;
}

/**
 * Genera la URL del QR para una factura con CAE.
 * Requiere que la factura tenga issuer_tax_id (se guarda al emitir el CAE).
 */
export function getAfipQrUrlFromInvoice(invoice: InvoiceForQr): string | null {
  if (!invoice.cae || !invoice.issuer_tax_id) return null;
  const cuitEmisor = invoice.issuer_tax_id.replace(/\D/g, "");
  if (cuitEmisor.length !== 11) return null;

  const issueDate = typeof invoice.issue_date === "string"
    ? invoice.issue_date
    : new Date(invoice.issue_date).toISOString().split("T")[0];
  const importe = Number(invoice.total_amount);
  const moneda = (invoice.currency || "ARS").toUpperCase() === "ARS" ? "PES" : "DOL";
  const ctz = moneda === "PES" ? 1 : 1; // Si en el futuro guardamos cotización, usarla aquí

  const payload: AfipQrPayload = {
    ver: 1,
    fecha: issueDate,
    cuit: parseInt(cuitEmisor, 10),
    ptoVta: invoice.punto_venta ?? PUNTO_VENTA_DEFAULT,
    tipoCmp: invoice.cbte_tipo ?? 11,
    nroCmp: invoice.cbte_nro ?? 0,
    importe,
    moneda,
    ctz,
    tipoCodAut: "E",
    codAut: parseInt(String(invoice.cae).replace(/\D/g, "").slice(0, 14), 10) || 0,
  };

  if (invoice.client_tax_id) {
    const docRec = invoice.client_tax_id.replace(/\D/g, "");
    if (docRec.length >= 10) {
      payload.tipoDocRec = 80; // CUIT
      payload.nroDocRec = parseInt(docRec.slice(0, 20), 10);
    }
  }

  return getAfipQrUrl(payload);
}
