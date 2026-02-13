"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import type { InvoicePreviewData } from "./invoice-preview";

// Plantilla fiel al comprobante original AFIP: bordes y barra en negro.
// Acentos de marca solo en el bloque del tipo "C" (azul).
const BORDER = "#000000";
const ACCENT_BG = "#2563EB"; // Azul Activo para el recuadro C

function formatTaxCondition(value: string | null | undefined): string {
  if (!value) return "Responsable Monotributo";
  return value.trim().toLowerCase() === "monotributista" ? "Responsable Monotributo" : value;
}

function formatActivityStartDate(date: Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const styles = StyleSheet.create({
  page: {
    padding: 0,
    fontSize: 9,
    fontFamily: "Helvetica",
    backgroundColor: "#FFFFFF",
  },
  // Barra ORIGINAL — negro, texto blanco, sin espaciado entre letras
  originalBar: {
    backgroundColor: BORDER,
    paddingVertical: 8,
    alignItems: "center",
  },
  originalText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 0,
  },
  // Bloque principal: 2 columnas como AFIP — Emisor (izq) | Tipo C + Datos (der)
  mainRow: {
    flexDirection: "row",
    borderBottomWidth: 2,
    borderColor: BORDER,
  },
  colEmitter: {
    width: "55%",
    padding: 12,
    borderRightWidth: 2,
    borderColor: BORDER,
  },
  emitterName: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 4,
  },
  emitterAddress: { fontSize: 9, marginBottom: 8 },
  emitterLine: { flexDirection: "row", marginBottom: 2 },
  emitterLabel: { fontSize: 8, width: 140 },
  emitterValue: { fontSize: 9, flex: 1 },
  colRight: {
    width: "45%",
    flexDirection: "row",
  },
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
  colDataBlock: {
    flex: 1,
    padding: 12,
  },
  dataLine: { flexDirection: "row", marginBottom: 2 },
  dataLabel: { fontSize: 8, width: 110 },
  dataValue: { fontSize: 9, flex: 1 },
  // Período — una fila, dos celdas como AFIP
  sectionPeriod: {
    flexDirection: "row",
    padding: 10,
    borderBottomWidth: 2,
    borderColor: BORDER,
  },
  periodLeft: { width: "55%", paddingRight: 12 },
  periodRight: { width: "45%" },
  periodLabel: { fontSize: 8, marginBottom: 2 },
  periodValue: { fontSize: 9 },
  // Cliente — filas label / valor
  sectionClient: {
    padding: 12,
    borderBottomWidth: 2,
    borderColor: BORDER,
  },
  clientLine: { flexDirection: "row", marginBottom: 3 },
  clientLabel: { fontSize: 8, width: 240 },
  clientValue: { fontSize: 9, flex: 1 },
  // Tabla — bordes en todas las celdas como AFIP (Código Producto / Servicio | Cantidad | U. Medida | Precio Unit. | % Bonif | Imp. Bonif. | Subtotal)
  tableWrap: {
    borderBottomWidth: 2,
    borderColor: BORDER,
  },
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
  tdDescCotiz: { fontSize: 7, marginTop: 2, color: "#555" },
  // Totales — una línea por fila, formato: "Subtotal: $ X,XX"
  totalSection: {
    padding: 12,
    borderBottomWidth: 2,
    borderColor: BORDER,
  },
  totalLine: { flexDirection: "row", marginBottom: 4 },
  totalLabel: { fontSize: 10, fontWeight: "bold", width: 200 },
  totalValue: { fontSize: 10, fontWeight: "bold", flex: 1, textAlign: "right" },
  exchangeSection: {
    padding: 10,
    borderBottomWidth: 2,
    borderColor: BORDER,
    fontSize: 8,
  },
  footerAfip: {
    padding: 12,
    borderTopWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
  },
  footerText: { fontSize: 8 },
  pageNum: { position: "absolute", bottom: 14, right: 24, fontSize: 8 },
});

export function InvoicePreviewPDF({ data }: { data: InvoicePreviewData }) {
  const isLegal = data.billingType === "LEGAL";
  const cbteTipoLabel = data.cbteTipo === 11 ? "C" : `Tipo ${data.cbteTipo}`;
  const puntoVenta = "00001";
  const comprobanteNro = "Pendiente";
  const dueDateStr = data.dueDate ? format(data.dueDate, "dd/MM/yyyy") : format(data.issueDate, "dd/MM/yyyy");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Barra ORIGINAL — negro, sin espacio entre letras */}
        <View style={styles.originalBar}>
          <Text style={styles.originalText}>ORIGINAL</Text>
        </View>

        {/* Bloque principal: Emisor (izq) | [C + COD.011] (centro) | Datos comprobante (der) */}
        <View style={styles.mainRow}>
          <View style={styles.colEmitter}>
            <Text style={styles.emitterName}>{data.issuer?.business_name || "Lucas Loyola"}</Text>
            <Text style={styles.emitterAddress}>{data.issuer?.legal_address || "—"}</Text>
            <View style={styles.emitterLine}>
              <Text style={styles.emitterLabel}>Domicilio Comercial:</Text>
              <Text style={styles.emitterValue}>{data.issuer?.legal_address || "—"}</Text>
            </View>
            <View style={styles.emitterLine}>
              <Text style={styles.emitterLabel}>Razón Social:</Text>
              <Text style={styles.emitterValue}>{data.issuer?.business_name || "Lucas Loyola"}</Text>
            </View>
            <View style={styles.emitterLine}>
              <Text style={styles.emitterLabel}>Condición frente al IVA:</Text>
              <Text style={styles.emitterValue}>{formatTaxCondition(data.issuer?.tax_condition || "Monotributista")}</Text>
            </View>
            <View style={styles.emitterLine}>
              <Text style={styles.emitterLabel}>Ingresos Brutos:</Text>
              <Text style={styles.emitterValue}>{data.issuer?.gross_income || "Exento"}</Text>
            </View>
            <View style={styles.emitterLine}>
              <Text style={styles.emitterLabel}>Fecha de Inicio de Actividades:</Text>
              <Text style={styles.emitterValue}>{data.issuer?.activity_start_date ? formatActivityStartDate(data.issuer.activity_start_date) : "—"}</Text>
            </View>
            {data.issuer?.tax_id && (
              <View style={styles.emitterLine}>
                <Text style={styles.emitterLabel}>CUIT:</Text>
                <Text style={styles.emitterValue}>{data.issuer.tax_id}</Text>
              </View>
            )}
          </View>
          <View style={styles.colRight}>
            <View style={styles.colTypeBlock}>
              <Text style={styles.facturaLabel}>FACTURA</Text>
              <Text style={styles.typeBig}>{cbteTipoLabel}</Text>
              {isLegal && <Text style={styles.codText}>COD. 011</Text>}
            </View>
            <View style={styles.colDataBlock}>
              <View style={styles.dataLine}>
                <Text style={styles.dataLabel}>Punto de Venta: Comp. Nro:</Text>
                <Text style={styles.dataValue}>{String(puntoVenta).padStart(5, "0")}  {comprobanteNro}</Text>
              </View>
              <View style={styles.dataLine}>
                <Text style={styles.dataLabel}>Fecha de Emisión:</Text>
                <Text style={styles.dataValue}>{format(data.issueDate, "dd/MM/yyyy")}</Text>
              </View>
              {data.issuer?.tax_id && (
                <View style={styles.dataLine}>
                  <Text style={styles.dataLabel}>CUIT:</Text>
                  <Text style={styles.dataValue}>{data.issuer.tax_id}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Período — misma estructura que AFIP */}
        <View style={styles.sectionPeriod}>
          <View style={styles.periodLeft}>
            <Text style={styles.periodLabel}>Período Facturado Desde:  Hasta:</Text>
            <Text style={styles.periodValue}>{format(data.issueDate, "dd/MM/yyyy")}  {dueDateStr}</Text>
          </View>
          <View style={styles.periodRight}>
            <Text style={styles.periodLabel}>Fecha de Vto. para el pago:</Text>
            <Text style={styles.periodValue}>{data.dueDate ? format(data.dueDate, "dd/MM/yyyy") : "—"}</Text>
          </View>
        </View>

        {/* Cliente — orden AFIP */}
        <View style={styles.sectionClient}>
          {data.client.tax_id && (
            <View style={styles.clientLine}>
              <Text style={styles.clientLabel}>CUIT:</Text>
              <Text style={styles.clientValue}>{data.client.tax_id}</Text>
            </View>
          )}
          <View style={styles.clientLine}>
            <Text style={styles.clientLabel}>Apellido y Nombre / Razón Social:</Text>
            <Text style={styles.clientValue}>{data.client.business_name || data.client.name}</Text>
          </View>
          {(data.client.legal_address || data.client.address) && (
            <View style={styles.clientLine}>
              <Text style={styles.clientLabel}>Domicilio:</Text>
              <Text style={styles.clientValue}>{data.client.legal_address || data.client.address}</Text>
            </View>
          )}
          {data.client.tax_condition != null && data.client.tax_condition !== "" && (
            <View style={styles.clientLine}>
              <Text style={styles.clientLabel}>Condición frente al IVA:</Text>
              <Text style={styles.clientValue}>{formatTaxCondition(data.client.tax_condition)}</Text>
            </View>
          )}
          <View style={styles.clientLine}>
            <Text style={styles.clientLabel}>Condición de venta:</Text>
            <Text style={styles.clientValue}>Contado</Text>
          </View>
        </View>

        {/* Tabla — columnas con bordes como AFIP: Código Producto/Servicio | Cantidad | U. Medida | Precio Unit. | % Bonif | Imp. Bonif. | Subtotal */}
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
          {data.items.map((item, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={styles.td1}>
                <Text>{item.description}</Text>
                {data.summary.currency === "ARS" && item.exchangeRateUsed != null && (
                  <Text style={styles.tdDescCotiz}>
                    Cotiz {item.exchangeRateDate ? format(item.exchangeRateDate, "dd/MM/yyyy") : ""}{item.exchangeRateDate ? ": " : ""}
                    {item.exchangeRateUsed.toLocaleString("es-AR", { maximumFractionDigits: 0 })} ARS
                  </Text>
                )}
              </View>
              <Text style={styles.td2}>{item.quantity.toFixed(2)}</Text>
              <Text style={styles.td3}>{item.type === "time" ? "h" : "unidades"}</Text>
              <Text style={styles.td4}>{item.rate.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {data.summary.currency}</Text>
              <Text style={styles.td5}>0,00</Text>
              <Text style={styles.td6}>0,00</Text>
              <Text style={styles.td7}>{item.amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {data.summary.currency}</Text>
            </View>
          ))}
        </View>

        {/* Totales — una línea por concepto, valor a la derecha */}
        <View style={styles.totalSection}>
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>Subtotal: $</Text>
            <Text style={styles.totalValue}>{data.summary.subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {data.summary.currency}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>Importe Otros Tributos: $</Text>
            <Text style={styles.totalValue}>{data.summary.tax_amount > 0 ? data.summary.tax_amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0,00"} {data.summary.currency}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>Importe Total: $</Text>
            <Text style={styles.totalValue}>{data.summary.total.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {data.summary.currency}</Text>
          </View>
        </View>

        {data.summary.currency === "ARS" && data.exchangeInfo && data.exchangeStrategy === "HISTORICAL" && (
          <View style={styles.exchangeSection}>
            <Text>
              Tipo de Cambio: 1 USD = {data.exchangeInfo.rate.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS
              {data.exchangeInfo.source ? ` (${data.exchangeInfo.source})` : ""}
            </Text>
          </View>
        )}

        {isLegal && (
          <View style={styles.footerAfip}>
            <Text style={styles.footerText}>Comprobante Autorizado</Text>
            <Text style={[styles.footerText, { marginTop: 4 }]}>Esta Administración Federal no se responsabiliza por los datos ingresados en el detalle de la operación</Text>
            <Text style={[styles.footerText, { marginTop: 6 }]}>Comprobante Electrónico - RG AFIP N° 4291/19 y modificatorias</Text>
          </View>
        )}

        <Text style={styles.pageNum} fixed>Pág. 1/1</Text>
      </Page>
    </Document>
  );
}
