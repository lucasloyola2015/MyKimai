import { describe, it, expect } from "vitest";
import { fillInvoiceTemplate, type InvoiceTemplateData } from "@/lib/invoice-template";

/** Template mínimo con los placeholders que usa el anexo. */
const TPL = `<body>
<div class="page">FACTURA {CompNro}</div>
<!-- COPIES:BEGIN --><div class="page">DUPLICADO</div><div class="page">TRIPLICADO</div><!-- COPIES:END -->
{DETAIL_PAGES}
</body>`;

const baseData = (over: Partial<InvoiceTemplateData> = {}): InvoiceTemplateData =>
  ({
    RazonSocialEmisor: "Lucas Loyola",
    DomicilioEmisor: "—",
    CondicionIVAEmisor: "Responsable Monotributo",
    PtoVta: "00001",
    CompNro: "INT-2026-001",
    FechaEmision: "26/06/2026",
    CuitEmisor: "20-11111111-1",
    IIBB: "Exento",
    InicioActividades: "01/01/2020",
    PeriodoDesde: "01/06/2026",
    PeriodoHasta: "30/06/2026",
    FechaVtoPago: "10/07/2026",
    CuitReceptor: "30-99999999-9",
    RazonSocialReceptor: "Juntas Illinois SA",
    CondicionIVAReceptor: "Responsable Inscripto",
    DomicilioReceptor: "—",
    CondicionVenta: "Contado",
    items: [],
    SubtotalGeneral: "100,00 ARS",
    ImporteOtrosTributos: "0,00 ARS",
    ImporteTotal: "100,00 ARS",
    DataQR: "",
    CAE: "—",
    VtoCAE: "—",
    DocLetra: "X",
    DocCodigo: "REMITO",
    DocTitulo: "REMITO",
    EsInterno: true,
    ...over,
  }) as InvoiceTemplateData;

const entries = [
  {
    start_time: new Date("2026-06-10T14:00:00Z"),
    description: "Puesta en marcha PLC",
    duration_neto: 120, // 2.00 h
    billable: true,
    tasks: { name: "Automatización", projects: { name: "Odoo" } },
  },
  {
    start_time: new Date("2026-06-11T14:00:00Z"),
    description: null,
    duration_neto: 60, // 1.00 h
    billable: true,
    tasks: { name: "Soporte", projects: { name: "Robots" } },
  },
];

describe("anexo de detalle en el PDF de factura", () => {
  it("adjunta el detalle después de la factura con resumen por proyecto y totales", () => {
    const html = fillInvoiceTemplate(TPL, baseData(), entries);

    expect(html).toContain("Detalle de lo facturado");
    // Total de horas: 120 + 60 = 180 min = 3.00 h
    expect(html).toContain("3.00 h");
    // Resumen por proyecto (ambos proyectos presentes)
    expect(html).toContain("Odoo");
    expect(html).toContain("Robots");
    // El anexo va DESPUÉS de la factura
    expect(html.indexOf("FACTURA INT-2026-001")).toBeLessThan(
      html.indexOf("Detalle de lo facturado")
    );
    // Contexto del comprobante en el encabezado del anexo
    expect(html).toContain("INT-2026-001");
    expect(html).toContain("Juntas Illinois SA");
  });

  it("da el máximo ancho a la descripción para reducir páginas", () => {
    const html = fillInvoiceTemplate(TPL, baseData(), entries);
    // La descripción se lleva el ancho; las columnas de contexto se comprimen.
    expect(html).toContain('style="width:60%">Descripción / Notas');
    expect(html).toContain('style="width:8%">Fecha');
    expect(html).toContain("detail-table--entries"); // table-layout: fixed
    // La fecha va en 2 líneas (día + hora) para no ensanchar su columna.
    expect(html).toContain('class="hora"');
  });

  it("no agrega anexo si la factura no tiene entradas asociadas", () => {
    const html = fillInvoiceTemplate(TPL, baseData(), []);
    expect(html).not.toContain("Detalle de lo facturado");
    expect(html).not.toContain("{DETAIL_PAGES}");
  });

  it("escapa el texto libre del usuario (no inyecta HTML ni placeholders)", () => {
    const html = fillInvoiceTemplate(TPL, baseData(), [
      {
        start_time: new Date("2026-06-10T14:00:00Z"),
        description: '<script>alert(1)</script> {CAE}',
        duration_neto: 60,
        billable: true,
        tasks: { name: "T", projects: { name: "P" } },
      },
    ]);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    // El texto {CAE} del usuario NO se reemplaza por el valor del comprobante
    expect(html).toContain("{CAE}");
  });

  it("un recibo interno mantiene 1 sola copia y suma el anexo", () => {
    const html = fillInvoiceTemplate(TPL, baseData({ EsInterno: true }), entries);
    expect(html).not.toContain("DUPLICADO");
    expect(html).not.toContain("TRIPLICADO");
    expect(html).toContain("Detalle de lo facturado");
  });

  it("una factura legal conserva sus 3 copias y suma el anexo al final", () => {
    const html = fillInvoiceTemplate(TPL, baseData({ EsInterno: false }), entries);
    expect(html).toContain("DUPLICADO");
    expect(html).toContain("TRIPLICADO");
    expect(html.indexOf("TRIPLICADO")).toBeLessThan(
      html.indexOf("Detalle de lo facturado")
    );
  });
});
