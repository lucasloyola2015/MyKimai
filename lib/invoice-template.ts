import { format } from "date-fns";
import { getAfipQrUrlFromInvoice } from "@/lib/afip-qr";
import { PUNTO_VENTA_DEFAULT } from "@/lib/fiscal-config";

/**
 * Rellena la plantilla HTML de factura con los datos proporcionados.
 * La plantilla está en public/templates/invoice.html y usa placeholders {X} y {{ITEMS_ROWS}}.
 */

export interface InvoiceTemplateItem {
  codigo?: string;
  descripcion: string;
  cantidad: number;
  unidadMedida: string;
  precioUnitario: string;
  subtotal: string;
}

export interface InvoiceTemplateData {
  RazonSocialEmisor: string;
  DomicilioEmisor: string;
  CondicionIVAEmisor: string;
  PtoVta: string;
  CompNro: string;
  FechaEmision: string;
  CuitEmisor: string;
  IIBB: string;
  InicioActividades: string;
  PeriodoDesde: string;
  PeriodoHasta: string;
  FechaVtoPago: string;
  CuitReceptor: string;
  RazonSocialReceptor: string;
  CondicionIVAReceptor: string;
  DomicilioReceptor: string;
  CondicionVenta: string;
  items: InvoiceTemplateItem[];
  SubtotalGeneral: string;
  ImporteOtrosTributos: string;
  ImporteTotal: string;
  DataQR: string;
  CAE: string;
  VtoCAE: string;
  /** Si es true, no se muestran QR, logos ARCA ni bloque CAE (comprobante interno). */
  EsInterno?: boolean;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m] ?? m);
}

function buildItemsRows(items: InvoiceTemplateItem[]): string {
  const rows = items.map(
    (item) =>
      `<tr>
        <td class="t-left">${escapeHtml(item.codigo ?? "—")}</td>
        <td class="t-left">${escapeHtml(item.descripcion)}</td>
        <td class="t-center">${Number(item.cantidad).toFixed(2)}</td>
        <td class="t-center">${escapeHtml(item.unidadMedida)}</td>
        <td class="t-right">${escapeHtml(item.precioUnitario)}</td>
        <td class="t-right text-bold">${escapeHtml(item.subtotal)}</td>
      </tr>`
  );
  const emptyRows = Math.max(0, 4 - items.length);
  for (let i = 0; i < emptyRows; i++) {
    rows.push(
      '<tr><td class="t-left">&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>'
    );
  }
  return rows.join("\n");
}

/**
 * Rellena la plantilla HTML con los datos de la factura.
 * Debe recibir el HTML crudo de la plantilla (fetch o readFile).
 */
/** Bloque HTML del QR: imagen con datos AFIP o cuadrado gris si no hay CAE/datos. Para interno no se muestra nada. */
function buildQrBlock(dataQr: string, esInterno?: boolean): string {
  if (esInterno) return "";
  if (dataQr && dataQr.trim() !== "") {
    return `<img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${dataQr}" alt="QR" width="90" height="90">`;
  }
  return `<div style="width:90px;height:90px;background:#9ca3af;flex-shrink:0" title="Sin CAE"></div>`;
}

const ARCA_DISCLAIMER_HTML = `<div style="margin-left: 10px;">
                <div class="arca-logo-container">
                    <span class="arca-main-text">ARCA</span>
                    <span class="arca-sub-text">AGENCIA DE RECAUDACIÓN<br>Y CONTROL ADUANERO</span>
                </div>
                <div style="font-size: 9px; font-style: italic; color: var(--acero); line-height: 1.2;">
                    Comprobante Autorizado<br>Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación.
                </div>
            </div>`;

function buildCaeBlock(cae: string, vtoCae: string, esInterno?: boolean): string {
  if (esInterno) return "";
  return `<div class="cae-block">
                <div>CAE N°: <span style="font-weight: 400;">${escapeHtml(cae)}</span></div>
                <div>Fecha de Vto. de CAE: <span style="font-weight: 400;">${escapeHtml(vtoCae)}</span></div>
            </div>`;
}

export function fillInvoiceTemplate(templateHtml: string, data: InvoiceTemplateData): string {
  const esInterno = Boolean(data.EsInterno);
  const itemsRows = buildItemsRows(data.items);
  let html = templateHtml.replace(/\{\{ITEMS_ROWS\}\}/g, itemsRows);
  html = html.replace(/\{QR_BLOCK\}/g, buildQrBlock(data.DataQR ?? "", esInterno));
  html = html.replace(/\{ARCA_DISCLAIMER_BLOCK\}/g, esInterno ? "" : ARCA_DISCLAIMER_HTML);
  html = html.replace(/\{CAE_BLOCK\}/g, buildCaeBlock(data.CAE ?? "—", data.VtoCAE ?? "—", esInterno));
  const placeholders: (keyof InvoiceTemplateData)[] = [
    "RazonSocialEmisor",
    "DomicilioEmisor",
    "CondicionIVAEmisor",
    "PtoVta",
    "CompNro",
    "FechaEmision",
    "CuitEmisor",
    "IIBB",
    "InicioActividades",
    "PeriodoDesde",
    "PeriodoHasta",
    "FechaVtoPago",
    "CuitReceptor",
    "RazonSocialReceptor",
    "CondicionIVAReceptor",
    "DomicilioReceptor",
    "CondicionVenta",
    "SubtotalGeneral",
    "ImporteOtrosTributos",
    "ImporteTotal",
    "DataQR",
    "CAE",
    "VtoCAE",
  ];
  for (const key of placeholders) {
    if (key === "items") continue;
    const value = String((data as any)[key] ?? "");
    html = html.split(`{${key}}`).join(value);
  }
  return html;
}

function formatTaxCondition(value: string | null | undefined): string {
  if (!value) return "Responsable Monotributo";
  const v = value.trim().toLowerCase();
  if (v === "monotributista") return "Responsable Monotributo";
  return value;
}

function formatActivityStartDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return format(date, "dd/MM/yyyy");
}

/** Factura de BD con client e items (como getInvoiceWithItems) */
export interface InvoiceForTemplate {
  issue_date: Date | string;
  due_date?: Date | string | null;
  currency?: string | null;
  subtotal?: number | string;
  tax_amount?: number | string | null;
  total_amount: number | string;
  cae?: string | null;
  cae_due_date?: Date | string | null;
  punto_venta?: number | null;
  cbte_nro?: number | null;
  issuer_tax_id?: string | null;
  clients: {
    name: string;
    tax_id?: string | null;
    business_name?: string | null;
    legal_address?: string | null;
    address?: string | null;
    tax_condition?: string | null;
  };
  invoice_items: Array<{
    description: string | null;
    quantity: number | string;
    rate: number | string;
    amount: number | string;
    type?: string;
  }>;
  billing_type?: string | null;
}

/** Configuración fiscal del emisor (user_fiscal_settings) */
export interface IssuerSettingsForTemplate {
  business_name?: string | null;
  tax_id?: string | null;
  legal_address?: string | null;
  tax_condition?: string | null;
  gross_income?: string | null;
  activity_start_date?: Date | string | null;
}

/**
 * Convierte factura de BD y datos del emisor en datos para la plantilla.
 */
export function invoiceToTemplateData(
  invoice: InvoiceForTemplate,
  issuer: IssuerSettingsForTemplate | null
): InvoiceTemplateData {
  const razonSocial = issuer?.business_name ?? "Lucas Loyola";
  const domicilioEmisor = issuer?.legal_address ?? "—";
  const condicionIva = formatTaxCondition(issuer?.tax_condition ?? "Monotributista");
  const iibb = issuer?.gross_income ?? "Exento";
  const inicioAct = formatActivityStartDate(issuer?.activity_start_date ?? null);
  const cuitEmisor = invoice.issuer_tax_id ?? issuer?.tax_id ?? "—";
  const ptoVta = String(invoice.punto_venta ?? PUNTO_VENTA_DEFAULT).padStart(5, "0");
  const compNro = String(invoice.cbte_nro ?? 0).padStart(8, "0");
  const fechaEmision = format(new Date(invoice.issue_date), "dd/MM/yyyy");
  const periodoDesde = format(new Date(invoice.issue_date), "dd/MM/yyyy");
  const periodoHasta = invoice.due_date
    ? format(new Date(invoice.due_date), "dd/MM/yyyy")
    : "—";
  const fechaVtoPago = invoice.due_date
    ? format(new Date(invoice.due_date), "dd/MM/yyyy")
    : "—";
  const client = invoice.clients;
  const razonReceptor = (client as { business_name?: string }).business_name ?? client.name;
  const domicilioReceptor =
    (client as { legal_address?: string }).legal_address ?? client.address ?? "—";
  const condicionReceptor = formatTaxCondition(
    (client as { tax_condition?: string }).tax_condition ?? null
  );
  const currency = invoice.currency ?? "ARS";
  const fmt = (n: number | string) =>
    `${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  const items: InvoiceTemplateItem[] = invoice.invoice_items.map((item) => ({
    codigo: undefined,
    descripcion: item.description ?? "—",
    cantidad: Number(item.quantity),
    unidadMedida: item.type === "time" ? "Horas" : "unidades",
    precioUnitario: fmt(Number(item.rate)),
    subtotal: fmt(Number(item.amount)),
  }));
  const subtotalGeneral = fmt(invoice.subtotal ?? 0);
  const importeOtrosTributos = fmt(invoice.tax_amount ?? 0);
  const importeTotal = fmt(invoice.total_amount);
  const dataQr = getAfipQrUrlFromInvoice({
    issue_date: invoice.issue_date,
    punto_venta: invoice.punto_venta ?? null,
    cbte_tipo: 11,
    cbte_nro: invoice.cbte_nro ?? null,
    total_amount: invoice.total_amount,
    currency: currency as string,
    cae: invoice.cae ?? null,
    issuer_tax_id: invoice.issuer_tax_id ?? undefined,
    client_tax_id: client.tax_id ?? undefined,
  }) ?? "";
  const dataQrEncoded = dataQr ? encodeURIComponent(dataQr) : "";
  const cae = invoice.cae ?? "—";
  const vtoCae = invoice.cae_due_date
    ? format(new Date(invoice.cae_due_date), "dd/MM/yyyy")
    : "—";

  return {
    RazonSocialEmisor: razonSocial,
    DomicilioEmisor: domicilioEmisor,
    CondicionIVAEmisor: condicionIva,
    PtoVta: ptoVta,
    CompNro: compNro,
    FechaEmision: fechaEmision,
    CuitEmisor: String(cuitEmisor),
    IIBB: iibb,
    InicioActividades: inicioAct,
    PeriodoDesde: periodoDesde,
    PeriodoHasta: periodoHasta,
    FechaVtoPago: fechaVtoPago,
    CuitReceptor: client.tax_id ?? "—",
    RazonSocialReceptor: razonReceptor,
    CondicionIVAReceptor: condicionReceptor,
    DomicilioReceptor: domicilioReceptor,
    CondicionVenta: "Contado",
    items,
    SubtotalGeneral: subtotalGeneral,
    ImporteOtrosTributos: importeOtrosTributos,
    ImporteTotal: importeTotal,
    DataQR: dataQrEncoded,
    CAE: String(cae),
    VtoCAE: vtoCae,
    EsInterno: (invoice as { billing_type?: string }).billing_type === "INTERNAL",
  };
}

/** Datos del preview de factura (billing select page) */
export interface InvoicePreviewDataForTemplate {
  issuer?: {
    business_name?: string | null;
    tax_id?: string | null;
    legal_address?: string | null;
    tax_condition?: string | null;
    gross_income?: string | null;
    activity_start_date?: Date | string | null;
  } | null;
  client: {
    name: string;
    tax_id?: string | null;
    business_name?: string | null;
    legal_address?: string | null;
    address?: string | null;
    tax_condition?: string | null;
  };
  items: Array<{
    description: string;
    quantity: number;
    rate: number;
    amount: number;
    type?: string;
  }>;
  summary: {
    subtotal: number;
    tax_amount?: number;
    total: number;
    currency: string;
  };
  issueDate: Date;
  dueDate?: Date;
  billingType?: "LEGAL" | "INTERNAL";
}

/**
 * Convierte datos del preview de factura en datos para la plantilla (sin CAE/QR).
 */
export function previewDataToTemplateData(preview: InvoicePreviewDataForTemplate): InvoiceTemplateData {
  const issuer = preview.issuer;
  const razonSocial = issuer?.business_name ?? "Lucas Loyola";
  const domicilioEmisor = issuer?.legal_address ?? "—";
  const condicionIva = formatTaxCondition(issuer?.tax_condition ?? "Monotributista");
  const iibb = issuer?.gross_income ?? "Exento";
  const inicioAct = formatActivityStartDate(issuer?.activity_start_date ?? null);
  const cuitEmisor = issuer?.tax_id ?? "—";
  const ptoVta = String(PUNTO_VENTA_DEFAULT).padStart(5, "0");
  const compNro = "00000000";
  const fechaEmision = format(new Date(preview.issueDate), "dd/MM/yyyy");
  const periodoDesde = format(new Date(preview.issueDate), "dd/MM/yyyy");
  const periodoHasta = preview.dueDate
    ? format(new Date(preview.dueDate), "dd/MM/yyyy")
    : "—";
  const fechaVtoPago = preview.dueDate
    ? format(new Date(preview.dueDate), "dd/MM/yyyy")
    : "—";
  const client = preview.client;
  const razonReceptor = client.business_name ?? client.name;
  const domicilioReceptor = client.legal_address ?? client.address ?? "—";
  const condicionReceptor = formatTaxCondition(client.tax_condition ?? null);
  const currency = preview.summary.currency ?? "ARS";
  const fmt = (n: number) =>
    `${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  const items: InvoiceTemplateItem[] = preview.items.map((item) => ({
    codigo: undefined,
    descripcion: item.description || "—",
    cantidad: item.quantity,
    unidadMedida: item.type === "time" ? "Horas" : "unidades",
    precioUnitario: fmt(item.rate),
    subtotal: fmt(item.amount),
  }));
  return {
    RazonSocialEmisor: razonSocial,
    DomicilioEmisor: domicilioEmisor,
    CondicionIVAEmisor: condicionIva,
    PtoVta: ptoVta,
    CompNro: compNro,
    FechaEmision: fechaEmision,
    CuitEmisor: String(cuitEmisor),
    IIBB: iibb,
    InicioActividades: inicioAct,
    PeriodoDesde: periodoDesde,
    PeriodoHasta: periodoHasta,
    FechaVtoPago: fechaVtoPago,
    CuitReceptor: client.tax_id ?? "—",
    RazonSocialReceptor: razonReceptor,
    CondicionIVAReceptor: condicionReceptor,
    DomicilioReceptor: domicilioReceptor,
    CondicionVenta: "Contado",
    items,
    SubtotalGeneral: fmt(preview.summary.subtotal),
    ImporteOtrosTributos: fmt(preview.summary.tax_amount ?? 0),
    ImporteTotal: fmt(preview.summary.total),
    DataQR: "",
    CAE: "—",
    VtoCAE: "—",
    EsInterno: preview.billingType === "INTERNAL",
  };
}
