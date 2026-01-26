import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  PDFViewer,
} from "@react-pdf/renderer";
import type { Database } from "@/lib/types/database";
import { format } from "date-fns";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type InvoiceItem = Database["public"]["Tables"]["invoice_items"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];

interface InvoiceWithDetails extends Invoice {
  clients: Client;
  invoice_items: InvoiceItem[];
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 12,
    fontFamily: "Helvetica",
  },
  header: {
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
  },
  section: {
    marginBottom: 20,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  label: {
    fontWeight: "bold",
    width: 100,
  },
  table: {
    marginTop: 20,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    padding: 8,
    fontWeight: "bold",
  },
  tableRow: {
    flexDirection: "row",
    padding: 8,
    borderBottom: "1pt solid #e0e0e0",
  },
  colDescription: {
    width: "40%",
  },
  colQuantity: {
    width: "15%",
    textAlign: "right",
  },
  colRate: {
    width: "20%",
    textAlign: "right",
  },
  colAmount: {
    width: "25%",
    textAlign: "right",
  },
  total: {
    marginTop: 20,
    paddingTop: 10,
    borderTop: "2pt solid #000",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: "bold",
  },
});

export function InvoicePDF({ invoice }: { invoice: InvoiceWithDetails }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>FACTURA</Text>
          <Text>{invoice.invoice_number}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>Fecha:</Text>
            <Text>{format(new Date(invoice.issue_date), "dd/MM/yyyy")}</Text>
          </View>
          {invoice.due_date && (
            <View style={styles.row}>
              <Text style={styles.label}>Vence:</Text>
              <Text>{format(new Date(invoice.due_date), "dd/MM/yyyy")}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Cliente:</Text>
          <Text>{invoice.clients.name}</Text>
          {invoice.clients.email && <Text>{invoice.clients.email}</Text>}
          {invoice.clients.address && <Text>{invoice.clients.address}</Text>}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDescription}>Descripción</Text>
            <Text style={styles.colQuantity}>Cantidad</Text>
            <Text style={styles.colRate}>Tarifa</Text>
            <Text style={styles.colAmount}>Total</Text>
          </View>
          {invoice.invoice_items.map((item) => (
            <View key={item.id} style={styles.tableRow}>
              <Text style={styles.colDescription}>{item.description}</Text>
              <Text style={styles.colQuantity}>
                {item.quantity.toFixed(2)}{" "}
                {item.type === "time" ? "h" : "un"}
              </Text>
              <Text style={styles.colRate}>
                {item.rate.toFixed(2)} {invoice.currency}
              </Text>
              <Text style={styles.colAmount}>
                {item.amount.toFixed(2)} {invoice.currency}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.total}>
          <View style={styles.totalRow}>
            <Text>Subtotal:</Text>
            <Text>
              {invoice.subtotal.toFixed(2)} {invoice.currency}
            </Text>
          </View>
          {invoice.tax_rate && invoice.tax_rate > 0 && (
            <View style={styles.totalRow}>
              <Text>Impuesto ({invoice.tax_rate}%):</Text>
              <Text>
                {invoice.tax_amount?.toFixed(2)} {invoice.currency}
              </Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalAmount}>Total:</Text>
            <Text style={styles.totalAmount}>
              {invoice.total_amount.toFixed(2)} {invoice.currency}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
