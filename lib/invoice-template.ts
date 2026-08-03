import { format } from "date-fns";
import { getAfipQrUrlFromInvoice } from "@/lib/afip-qr";
import { PUNTO_VENTA_DEFAULT } from "@/lib/fiscal-config";
import { arFormat } from "@/lib/timezone";

/**
 * Rellena la plantilla HTML de factura con los datos proporcionados.
 * La plantilla está en public/templates/invoice.html y usa placeholders {X} y {{ITEMS_ROWS}}.
 */

export interface InvoiceTemplateItem {
  descripcion: string;
  cantidad: number;
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
  DocLetra: string;
  DocCodigo: string;
  DocTitulo: string;
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
        <td class="t-left">${escapeHtml(item.descripcion)}</td>
        <td class="t-center">${Number(item.cantidad).toFixed(2)}</td>
        <td class="t-right">${escapeHtml(item.precioUnitario)}</td>
        <td class="t-right text-bold">${escapeHtml(item.subtotal)}</td>
      </tr>`
  );
  const emptyRows = Math.max(0, 3 - items.length);
  for (let i = 0; i < emptyRows; i++) {
    rows.push(
      '<tr><td class="t-left">&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>'
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

/** Entrada de tiempo para el anexo de detalle de la factura. */
export interface InvoiceDetailEntry {
  start_time: Date | string;
  description?: string | null;
  duration_neto?: number | null;
  billable?: boolean;
  tasks?: {
    name?: string | null;
    projects?: { name?: string | null } | null;
  } | null;
}

const fmtHours = (minutes: number) => (minutes / 60).toFixed(2);

/**
 * §anexo — Construye las páginas de DETALLE que se adjuntan después de la
 * factura: resumen por proyecto + detalle de tareas. Fluye en tantas hojas como
 * haga falta (el CSS repite el encabezado de tabla y evita cortar filas).
 */
function buildDetailPages(
  entries: InvoiceDetailEntry[],
  data: InvoiceTemplateData
): string {
  if (!entries || entries.length === 0) return "";

  // Agrupar por proyecto
  const byProject = new Map<string, number>();
  let totalMinutes = 0;
  for (const e of entries) {
    const min = e.duration_neto || 0;
    totalMinutes += min;
    const name = e.tasks?.projects?.name || "—";
    byProject.set(name, (byProject.get(name) || 0) + min);
  }

  const projectRows = Array.from(byProject.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, min]) => {
      const pct = totalMinutes > 0 ? (min / totalMinutes) * 100 : 0;
      return `<tr>
          <td>${escapeHtml(name)}</td>
          <td class="t-right mono">${fmtHours(min)} h</td>
          <td class="t-right mono">${pct.toFixed(1)}%</td>
        </tr>`;
    })
    .join("\n");

  const detailRows = entries
    .map((e) => {
      // Fecha en dos líneas (dd/MM/yy + hh:mm) para que la columna sea angosta y
      // la descripción se lleve el ancho.
      const dia = arFormat(new Date(e.start_time), "dd/MM/yy");
      const hora = arFormat(new Date(e.start_time), "HH:mm");
      const proyecto = e.tasks?.projects?.name || "—";
      const tarea = e.tasks?.name || "—";
      const noBillable =
        e.billable === false ? ` <span class="nb-tag">(No fact.)</span>` : "";
      return `<tr>
          <td class="col-fecha mono">${escapeHtml(dia)}<span class="hora">${escapeHtml(hora)}</span></td>
          <td class="col-meta">${escapeHtml(proyecto)}</td>
          <td class="col-meta">${escapeHtml(tarea)}${noBillable}</td>
          <td class="col-desc">${escapeHtml(e.description || "—")}</td>
          <td class="t-right mono" style="white-space:nowrap">${fmtHours(e.duration_neto || 0)}</td>
        </tr>`;
    })
    .join("\n");

  const docLabel = data.EsInterno ? "Recibo" : "Factura";

  return `
<div class="detail-page">
    <div class="detail-head">
        <div>
            <h2 class="detail-title">Detalle de lo facturado</h2>
            <div class="detail-subtitle">
                ${escapeHtml(docLabel)} N° ${escapeHtml(data.CompNro)} &nbsp;·&nbsp;
                ${escapeHtml(data.RazonSocialReceptor)} &nbsp;·&nbsp;
                Período: ${escapeHtml(data.PeriodoDesde)} al ${escapeHtml(data.PeriodoHasta)}
            </div>
        </div>
        <div style="text-align:right">
            <div style="font-size:9px;color:var(--acero);text-transform:uppercase;letter-spacing:1px;font-weight:700">Horas totales</div>
            <div class="mono" style="font-size:22px;font-weight:700">${fmtHours(totalMinutes)} h</div>
        </div>
    </div>

    <div class="detail-section-title">Resumen por proyecto</div>
    <table class="detail-table">
        <thead>
            <tr>
                <th style="width:60%">Proyecto</th>
                <th style="width:20%" class="t-right">Horas</th>
                <th style="width:20%" class="t-right">Participación</th>
            </tr>
        </thead>
        <tbody>
            ${projectRows}
            <tr class="detail-total-row">
                <td>Total</td>
                <td class="t-right mono">${fmtHours(totalMinutes)} h</td>
                <td class="t-right mono">100%</td>
            </tr>
        </tbody>
    </table>

    <div class="detail-section-title">Detalle de tareas (${entries.length} registros)</div>
    <table class="detail-table detail-table--entries">
        <thead>
            <tr>
                <th style="width:8%">Fecha</th>
                <th style="width:12%">Proyecto</th>
                <th style="width:13%">Tarea</th>
                <th style="width:60%">Descripción / Notas</th>
                <th style="width:7%" class="t-right">Hs</th>
            </tr>
        </thead>
        <tbody>
            ${detailRows}
            <tr class="detail-total-row">
                <td colspan="4">Total de horas netas</td>
                <td class="t-right mono">${fmtHours(totalMinutes)}</td>
            </tr>
        </tbody>
    </table>
</div>`;
}

export function fillInvoiceTemplate(
  templateHtml: string,
  data: InvoiceTemplateData,
  detailEntries?: InvoiceDetailEntry[]
): string {
  const esInterno = Boolean(data.EsInterno);
  const itemsRows = buildItemsRows(data.items);
  let html = templateHtml.replace(/\{\{ITEMS_ROWS\}\}/g, itemsRows);

  // §bug — un recibo interno (X) es UN solo ejemplar: se eliminan las copias
  // DUPLICADO y TRIPLICADO. Para LEGAL se conservan (solo se quitan los marcadores).
  if (esInterno) {
    html = html.replace(/<!-- COPIES:BEGIN -->[\s\S]*?<!-- COPIES:END -->/g, "");
  } else {
    html = html.replace(/<!-- COPIES:(?:BEGIN|END) -->/g, "");
  }
  html = html.replace(/\{PAGE1_COPY_LABEL\}/g, esInterno ? "" : "ORIGINAL");
  html = html.replace(/\{QR_BLOCK\}/g, buildQrBlock(data.DataQR ?? "", esInterno));
  html = html.replace(/\{ARCA_DISCLAIMER_BLOCK\}/g, esInterno ? "" : ARCA_DISCLAIMER_HTML);
  html = html.replace(/\{CAE_BLOCK\}/g, buildCaeBlock(data.CAE ?? "—", data.VtoCAE ?? "—", esInterno));
  const invoiceNumbersBlock = esInterno
    ? `<div class="invoice-numbers-row"><div><span class="text-bold">Nro:</span> ${escapeHtml(data.CompNro)}</div></div>`
    : `<div class="invoice-numbers-row"><div><span class="text-bold">Punto de Venta:</span> ${escapeHtml(data.PtoVta)}</div><div><span class="text-bold">Comp. Nro:</span> ${escapeHtml(data.CompNro)}</div></div>`;
  html = html.replace(/\{INVOICE_NUMBERS_BLOCK\}/g, invoiceNumbersBlock);
  const emisorDetailsBlock = esInterno
    ? `<strong>Razón Social:</strong> ${escapeHtml(data.RazonSocialEmisor)}<br><strong>Condición frente al IVA:</strong> ${escapeHtml(data.CondicionIVAEmisor)}`
    : `<strong>Razón Social:</strong> ${escapeHtml(data.RazonSocialEmisor)}<br><strong>Domicilio Comercial:</strong> ${escapeHtml(data.DomicilioEmisor)}<br><strong>Condición frente al IVA:</strong> ${escapeHtml(data.CondicionIVAEmisor)}`;
  html = html.replace(/\{EMISOR_DETAILS_BLOCK\}/g, emisorDetailsBlock);
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
    "DocLetra",
    "DocCodigo",
    "DocTitulo",
  ];
  for (const key of placeholders) {
    if (key === "items") continue;
    const value = String((data as any)[key] ?? "");
    html = html.split(`{${key}}`).join(value);
  }
  // §anexo — se inserta DESPUÉS del loop de placeholders para que el texto libre
  // del detalle (descripciones del usuario) no se interprete como placeholder.
  html = html.replace(/\{DETAIL_PAGES\}/g, buildDetailPages(detailEntries ?? [], data));
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
  invoice_number?: string | null;
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
  const esInterno = (invoice as { billing_type?: string }).billing_type === "INTERNAL";
  const ptoVta = esInterno
    ? "—"
    : String(invoice.punto_venta ?? PUNTO_VENTA_DEFAULT).padStart(5, "0");
  const compNro = esInterno && invoice.invoice_number
    ? invoice.invoice_number
    : String(invoice.cbte_nro ?? 0).padStart(8, "0");
  const fechaEmision = format(new Date(invoice.issue_date), "dd/MM/yyyy");
  const invAny = invoice as any;
  const periodoDesde = invAny._periodStart
    ? format(new Date(invAny._periodStart), "dd/MM/yyyy")
    : format(new Date(invoice.issue_date), "dd/MM/yyyy");
  const periodoHasta = invAny._periodEnd
    ? format(new Date(invAny._periodEnd), "dd/MM/yyyy")
    : invoice.due_date
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
    descripcion: item.description ?? "—",
    cantidad: Number(item.quantity),
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
    DocLetra: esInterno ? "X" : "C",
    DocCodigo: esInterno ? "REMITO" : "COD. 011",
    DocTitulo: esInterno ? "REMITO" : "FACTURA",
    EsInterno: esInterno,
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
    descripcion: item.description || "—",
    cantidad: item.quantity,
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
    DocLetra: preview.billingType === "INTERNAL" ? "X" : "C",
    DocCodigo: preview.billingType === "INTERNAL" ? "REMITO" : "COD. 011",
    DocTitulo: preview.billingType === "INTERNAL" ? "REMITO" : "FACTURA",
    EsInterno: preview.billingType === "INTERNAL",
  };
}
