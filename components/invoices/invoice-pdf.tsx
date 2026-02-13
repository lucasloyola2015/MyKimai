import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  PDFViewer,
} from "@react-pdf/renderer";
import { format } from "date-fns";

import type { invoices, clients, invoice_items } from "@prisma/client";

interface InvoiceWithDetails extends invoices {
  clients: clients;
  invoice_items: invoice_items[];
}

export interface InvoicePDFProps {
  invoice: InvoiceWithDetails;
  qrDataUrl?: string | null;
}

const BORDER = "#000000";
const ACCENT_BG = "#2563EB";

function formatTaxCondition(value: string | null | undefined): string {
  if (!value) return "Responsable Monotributo";
  return value.trim().toLowerCase() === "monotributista" ? "Responsable Monotributo" : value;
}

const styles = StyleSheet.create({
  page: { padding: 0, fontSize: 9, fontFamily: "Helvetica", backgroundColor: "#FFFFFF" },
  originalBar: { backgroundColor: BORDER, paddingVertical: 8, alignItems: "center" },
  originalText: { color: "#FFFFFF", fontSize: 16, fontWeight: "bold", letterSpacing: 0 },
  mainRow: { flexDirection: "row", borderBottomWidth: 2, borderColor: BORDER },
  colEmitter: { width: "55%", padding: 12, borderRightWidth: 2, borderColor: BORDER },
  emitterName: { fontSize: 11, fontWeight: "bold", marginBottom: 4 },
  emitterAddress: { fontSize: 9, marginBottom: 8 },
  emitterLine: { flexDirection: "row", marginBottom: 2 },
  emitterLabel: { fontSize: 8, width: 140 },
  emitterValue: { fontSize: 9, flex: 1 },
  colRight: { width: "45%", flexDirection: "row" },
  colTypeBlock: {
    width: 70,
    padding: 8,
    borderRightWidth: 2,
    borderColor: BORDER,
    backgroundColor: ACCENT_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  typeBig: { fontSize: 36, fontWeight: "bold", color: "#FFFFFF" },
  codText: { fontSize: 8, marginTop: 4, fontWeight: "bold", color: "#FFFFFF" },
  facturaLabel: { fontSize: 12, fontWeight: "bold", marginBottom: 6 },
  colDataBlock: { flex: 1, padding: 12 },
  dataLine: { flexDirection: "row", marginBottom: 2 },
  dataLabel: { fontSize: 8, width: 110 },
  dataValue: { fontSize: 9, flex: 1 },
  sectionPeriod: { flexDirection: "row", padding: 10, borderBottomWidth: 2, borderColor: BORDER },
  periodLeft: { width: "55%", paddingRight: 12 },
  periodRight: { width: "45%" },
  periodLabel: { fontSize: 8, marginBottom: 2 },
  periodValue: { fontSize: 9 },
  sectionClient: { padding: 12, borderBottomWidth: 2, borderColor: BORDER },
  clientLine: { flexDirection: "row", marginBottom: 3 },
  clientLabel: { fontSize: 8, width: 240 },
  clientValue: { fontSize: 9, flex: 1 },
  tableWrap: { borderBottomWidth: 2, borderColor: BORDER },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#f5f5f5",
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  th1: { width: "32%", fontSize: 7, fontWeight: "bold", paddingRight: 4, borderRightWidth: 1, borderColor: BORDER },
  th2: { width: "10%", fontSize: 7, fontWeight: "bold", textAlign: "right", paddingRight: 4, borderRightWidth: 1, borderColor: BORDER },
  th3: { width: "10%", fontSize: 7, fontWeight: "bold", textAlign: "center", paddingRight: 4, borderRightWidth: 1, borderColor: BORDER },
  th4: { width: "12%", fontSize: 7, fontWeight: "bold", textAlign: "right", paddingRight: 4, borderRightWidth: 1, borderColor: BORDER },
  th5: { width: "8%", fontSize: 7, fontWeight: "bold", textAlign: "right", paddingRight: 4, borderRightWidth: 1, borderColor: BORDER },
  th6: { width: "10%", fontSize: 7, fontWeight: "bold", textAlign: "right", paddingRight: 4, borderRightWidth: 1, borderColor: BORDER },
  th7: { width: "18%", fontSize: 7, fontWeight: "bold", textAlign: "right", paddingHorizontal: 4 },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#ccc",
    paddingVertical: 5,
    paddingHorizontal: 6,
    alignItems: "flex-start",
  },
  td1: { width: "32%", fontSize: 8, paddingRight: 4, borderRightWidth: 1, borderColor: "#ddd" },
  td2: { width: "10%", fontSize: 8, textAlign: "right", paddingRight: 4, borderRightWidth: 1, borderColor: "#ddd" },
  td3: { width: "10%", fontSize: 8, textAlign: "center", paddingRight: 4, borderRightWidth: 1, borderColor: "#ddd" },
  td4: { width: "12%", fontSize: 8, textAlign: "right", paddingRight: 4, borderRightWidth: 1, borderColor: "#ddd" },
  td5: { width: "8%", fontSize: 8, textAlign: "right", paddingRight: 4, borderRightWidth: 1, borderColor: "#ddd" },
  td6: { width: "10%", fontSize: 8, textAlign: "right", paddingRight: 4, borderRightWidth: 1, borderColor: "#ddd" },
  td7: { width: "18%", fontSize: 8, textAlign: "right", fontWeight: "bold", paddingHorizontal: 4 },
  totalSection: { padding: 12, borderBottomWidth: 2, borderColor: BORDER },
  totalLine: { flexDirection: "row", marginBottom: 4 },
  totalLabel: { fontSize: 10, fontWeight: "bold", width: 200 },
  totalValue: { fontSize: 10, fontWeight: "bold", flex: 1, textAlign: "right" },
  footerCae: { padding: 12, borderTopWidth: 1, borderColor: BORDER, alignItems: "center" },
  footerCaeText: { fontSize: 8 },
  footerCaeBold: { fontSize: 9, fontWeight: "bold", marginTop: 4 },
  qrImage: { width: 72, height: 72, marginVertical: 8 },
  pageNum: { position: "absolute", bottom: 14, right: 24, fontSize: 8 },
});

export function InvoicePDF({ invoice, qrDataUrl }: InvoicePDFProps) {
  const hasCae = Boolean(invoice.cae);
  const cbteTipo = invoice.cbte_tipo ?? 11;
  const cbteTipoLabel = cbteTipo === 11 ? "C" : `Tipo ${cbteTipo}`;
  const puntoVenta = String(invoice.punto_venta ?? 1).padStart(5, "0");
  const compNro = String(invoice.cbte_nro ?? 0).padStart(8, "0");
  const issuerName = "Lucas Loyola";
  const issuerAddress = "—";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.originalBar}>
          <Text style={styles.originalText}>ORIGINAL</Text>
        </View>

        <View style={styles.mainRow}>
          <View style={styles.colEmitter}>
            <Text style={styles.emitterName}>{issuerName}</Text>
            <Text style={styles.emitterAddress}>{issuerAddress}</Text>
            <View style={styles.emitterLine}>
              <Text style={styles.emitterLabel}>Domicilio Comercial:</Text>
              <Text style={styles.emitterValue}>{issuerAddress}</Text>
            </View>
            <View style={styles.emitterLine}>
              <Text style={styles.emitterLabel}>Razón Social:</Text>
              <Text style={styles.emitterValue}>{issuerName}</Text>
            </View>
            <View style={styles.emitterLine}>
              <Text style={styles.emitterLabel}>Condición frente al IVA:</Text>
              <Text style={styles.emitterValue}>Responsable Monotributo</Text>
            </View>
            <View style={styles.emitterLine}>
              <Text style={styles.emitterLabel}>Ingresos Brutos:</Text>
              <Text style={styles.emitterValue}>Exento</Text>
            </View>
            <View style={styles.emitterLine}>
              <Text style={styles.emitterLabel}>Fecha de Inicio de Actividades:</Text>
              <Text style={styles.emitterValue}>—</Text>
            </View>
            {invoice.issuer_tax_id && (
              <View style={styles.emitterLine}>
                <Text style={styles.emitterLabel}>CUIT:</Text>
                <Text style={styles.emitterValue}>{invoice.issuer_tax_id}</Text>
              </View>
            )}
          </View>
          <View style={styles.colRight}>
            <View style={styles.colTypeBlock}>
              <Text style={styles.facturaLabel}>FACTURA</Text>
              <Text style={styles.typeBig}>{cbteTipoLabel}</Text>
              <Text style={styles.codText}>COD. 011</Text>
            </View>
            <View style={styles.colDataBlock}>
              <View style={styles.dataLine}>
                <Text style={styles.dataLabel}>Punto de Venta: Comp. Nro:</Text>
                <Text style={styles.dataValue}>{puntoVenta}  {compNro}</Text>
              </View>
              <View style={styles.dataLine}>
                <Text style={styles.dataLabel}>Fecha de Emisión:</Text>
                <Text style={styles.dataValue}>{format(new Date(invoice.issue_date), "dd/MM/yyyy")}</Text>
              </View>
              {invoice.issuer_tax_id && (
                <View style={styles.dataLine}>
                  <Text style={styles.dataLabel}>CUIT:</Text>
                  <Text style={styles.dataValue}>{invoice.issuer_tax_id}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.sectionPeriod}>
          <View style={styles.periodLeft}>
            <Text style={styles.periodLabel}>Período Facturado Desde:  Hasta:</Text>
            <Text style={styles.periodValue}>
              {format(new Date(invoice.issue_date), "dd/MM/yyyy")}  {invoice.due_date ? format(new Date(invoice.due_date), "dd/MM/yyyy") : "—"}
            </Text>
          </View>
          <View style={styles.periodRight}>
            <Text style={styles.periodLabel}>Fecha de Vto. para el pago:</Text>
            <Text style={styles.periodValue}>{invoice.due_date ? format(new Date(invoice.due_date), "dd/MM/yyyy") : "—"}</Text>
          </View>
        </View>

        <View style={styles.sectionClient}>
          {invoice.clients.tax_id && (
            <View style={styles.clientLine}>
              <Text style={styles.clientLabel}>CUIT:</Text>
              <Text style={styles.clientValue}>{invoice.clients.tax_id}</Text>
            </View>
          )}
          <View style={styles.clientLine}>
            <Text style={styles.clientLabel}>Apellido y Nombre / Razón Social:</Text>
            <Text style={styles.clientValue}>{(invoice.clients as any).business_name || invoice.clients.name}</Text>
          </View>
          {(invoice.clients.address || (invoice.clients as any).legal_address) && (
            <View style={styles.clientLine}>
              <Text style={styles.clientLabel}>Domicilio:</Text>
              <Text style={styles.clientValue}>{(invoice.clients as any).legal_address || invoice.clients.address}</Text>
            </View>
          )}
          {(invoice.clients as any).tax_condition && (
            <View style={styles.clientLine}>
              <Text style={styles.clientLabel}>Condición frente al IVA:</Text>
              <Text style={styles.clientValue}>{formatTaxCondition((invoice.clients as any).tax_condition)}</Text>
            </View>
          )}
          <View style={styles.clientLine}>
            <Text style={styles.clientLabel}>Condición de venta:</Text>
            <Text style={styles.clientValue}>Contado</Text>
          </View>
        </View>

        <View style={styles.tableWrap}>
          <View style={styles.tableHeader}>
            <Text style={styles.th1}>Código Producto / Servicio</Text>
            <Text style={styles.th2}>Cantidad</Text>
            <Text style={styles.th3}>U. Medida</Text>
            <Text style={styles.th4}>Precio Unit.</Text>
            <Text style={styles.th5}>% Bonif</Text>
            <Text style={styles.th6}>Imp. Bonif.</Text>
            <Text style={styles.th7}>Subtotal</Text>
          </View>
          {invoice.invoice_items.map((item) => (
            <View key={item.id} style={styles.tableRow}>
              <Text style={styles.td1}>{item.description || "—"}</Text>
              <Text style={styles.td2}>{Number(item.quantity).toFixed(2)}</Text>
              <Text style={styles.td3}>{item.type === "time" ? "h" : "unidades"}</Text>
              <Text style={styles.td4}>{Number(item.rate).toFixed(2)} {invoice.currency}</Text>
              <Text style={styles.td5}>0,00</Text>
              <Text style={styles.td6}>0,00</Text>
              <Text style={styles.td7}>{Number(item.amount).toFixed(2)} {invoice.currency}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalSection}>
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>Subtotal: $</Text>
            <Text style={styles.totalValue}>{Number(invoice.subtotal).toFixed(2)} {invoice.currency}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>Importe Otros Tributos: $</Text>
            <Text style={styles.totalValue}>{Number(invoice.tax_amount || 0).toFixed(2)} {invoice.currency}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>Importe Total: $</Text>
            <Text style={styles.totalValue}>{Number(invoice.total_amount).toFixed(2)} {invoice.currency}</Text>
          </View>
        </View>

        {hasCae && (
          <View style={styles.footerCae}>
            <Text style={styles.footerCaeText}>Comprobante Autorizado</Text>
            <Text style={[styles.footerCaeText, { marginTop: 4 }]}>Esta Administración Federal no se responsabiliza por los datos ingresados en el detalle de la operación</Text>
            {qrDataUrl && <Image src={qrDataUrl} style={styles.qrImage} />}
            <Text style={styles.footerCaeBold}>CAE N°: {invoice.cae}</Text>
            {invoice.cae_due_date && (
              <Text style={styles.footerCaeText}>Fecha de Vto. de CAE: {format(new Date(invoice.cae_due_date), "dd/MM/yyyy")}</Text>
            )}
          </View>
        )}

        <Text style={styles.pageNum} fixed>Pág. 1/1</Text>
      </Page>
    </Document>
  );
}
