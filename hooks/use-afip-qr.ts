"use client";

import { useState, useEffect } from "react";
import QRCode from "qrcode";
import { getAfipQrUrlFromInvoice } from "@/lib/afip-qr";

/**
 * Genera la imagen (data URL) del código QR AFIP para una factura con CAE.
 * Según https://www.afip.gob.ar/fe/qr/documentos/QRespecificaciones.pdf
 */
export function useAfipQrDataUrl(invoice: {
  cae: string | null;
  issuer_tax_id?: string | null;
  issue_date?: Date | string;
  punto_venta?: number | null;
  cbte_tipo?: number | null;
  cbte_nro?: number | null;
  total_amount?: number | string;
  currency?: string;
  client_tax_id?: string | null;
} | null) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!invoice?.cae || !invoice?.issuer_tax_id || !invoice?.issue_date) {
      setQrDataUrl(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const url = getAfipQrUrlFromInvoice({
      issue_date: invoice.issue_date,
      punto_venta: invoice.punto_venta ?? null,
      cbte_tipo: invoice.cbte_tipo ?? null,
      cbte_nro: invoice.cbte_nro ?? null,
      total_amount: invoice.total_amount ?? 0,
      currency: invoice.currency ?? "ARS",
      cae: invoice.cae,
      issuer_tax_id: invoice.issuer_tax_id,
      client_tax_id: invoice.client_tax_id ?? undefined,
    });
    if (!url) {
      setQrDataUrl(null);
      setLoading(false);
      return;
    }
    QRCode.toDataURL(url, { width: 160, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null))
      .finally(() => setLoading(false));
  }, [invoice?.cae, invoice?.issuer_tax_id, invoice?.cbte_nro]);

  return { qrDataUrl, loading };
}
