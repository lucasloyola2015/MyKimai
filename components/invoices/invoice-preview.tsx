"use client";

import { format } from "date-fns";

export interface InvoicePreviewData {
    issuer?: {
        business_name?: string | null;
        tax_id?: string | null;
        legal_address?: string | null;
        tax_condition?: string | null;
        gross_income?: string | null;
        activity_start_date?: Date | null;
        logo_url?: string | null;
        phone?: string | null;
        email?: string | null;
    };
    client: {
        name: string;
        tax_id?: string | null;
        business_name?: string | null;
        legal_address?: string | null;
        tax_condition?: string | null;
        email?: string | null;
        address?: string | null;
    };
    items: Array<{
        description: string;
        quantity: number;
        rate: number;
        amount: number;
        type: "time" | "other";
        /** Cotización ARS usada en esta línea (solo cuando moneda es ARS). Si existe, se muestra en la descripción en lugar del tipo de cambio global. */
        exchangeRateUsed?: number;
        /** Fecha de la cotización para mostrar junto al valor (ej. Cotiz 01/09/2026: 1.465 ARS). */
        exchangeRateDate?: Date;
    }>;
    summary: {
        subtotal: number;
        tax_rate: number;
        tax_amount: number;
        total: number;
        currency: string;
    };
    billingType: "LEGAL" | "INTERNAL";
    cbteTipo?: number;
    issueDate: Date;
    dueDate?: Date;
    exchangeInfo?: {
        rate: number;
        source?: string;
        updatedAt?: Date;
    };
    exchangeStrategy?: "CURRENT" | "HISTORICAL";
}

/** En facturas, Monotributista se muestra como "Responsable Monotributo" (nomenclatura AFIP). */
function formatTaxConditionForInvoice(value: string | null | undefined): string {
    if (!value) return "Responsable Monotributo";
    return value.trim().toLowerCase() === "monotributista" ? "Responsable Monotributo" : value;
}

export function InvoicePreview({ data }: { data: InvoicePreviewData }) {
    const isLegal = data.billingType === "LEGAL";
    const cbteTipoLabel = data.cbteTipo === 11 ? "C" : `Tipo ${data.cbteTipo}`;
    const puntoVenta = "00001";
    const comprobanteNro = "Pendiente";

    return (
        <div className="w-full max-w-4xl mx-auto">
            {/* Hoja de la factura: siempre blanca, sin depender del tema */}
            <div className="bg-white dark:bg-white border-2 border-black text-gray-900 dark:text-gray-900 shadow-lg">
            {/* Etiqueta ORIGINAL */}
            <div className="text-center py-2 bg-black text-white">
                <span className="font-black text-lg tracking-wider">ORIGINAL</span>
            </div>

            {/* Sección Superior: Emisor y Datos de Factura */}
            <div className="border-b-4 border-black">
                <div className="grid grid-cols-[2fr_1fr] border-b-4 border-black">
                    {/* Columna Izquierda: Datos del Emisor */}
                    <div className="p-4 border-r-4 border-black">
                        <div className="space-y-2">
                            <div className="mb-3">
                                <img
                                    src={data.issuer?.logo_url || "/logo-lucas-loyola.svg"}
                                    alt="Logo Lucas Loyola"
                                    className="h-16 object-contain"
                                />
                            </div>
                            <p className="font-black text-lg uppercase">
                                {data.issuer?.business_name || "Lucas Loyola"}
                            </p>
                            <div className="text-sm space-y-1">
                                <p>
                                    <span className="font-bold">Razón Social:</span>{" "}
                                    {data.issuer?.business_name || "Lucas Loyola"}
                                </p>
                                {data.issuer?.legal_address && (
                                    <p>
                                        <span className="font-bold">Domicilio Comercial:</span>{" "}
                                        {data.issuer.legal_address}
                                    </p>
                                )}
                                <p>
                                    <span className="font-bold">Condición frente al IVA:</span>{" "}
                                    {formatTaxConditionForInvoice(data.issuer?.tax_condition || "Monotributista")}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Columna Derecha: Tipo y Datos de Factura */}
                    <div className="grid grid-cols-[1fr_2fr]">
                        {/* Subcolumna: Tipo de Comprobante */}
                        <div className="p-4 border-r-2 border-black flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-100">
                            <div className="text-6xl font-black">{cbteTipoLabel}</div>
                            {isLegal && (
                                <div className="text-xs mt-2 font-bold">COD. 011</div>
                            )}
                        </div>

                        {/* Subcolumna: Datos de Factura */}
                        <div className="p-4 space-y-1 text-sm">
                            <p className="font-black text-lg mb-2">FACTURA</p>
                            <p>
                                <span className="font-bold">Punto de Venta:</span> {puntoVenta}
                            </p>
                            <p>
                                <span className="font-bold">Comp. Nro:</span> {comprobanteNro}
                            </p>
                            <p>
                                <span className="font-bold">Fecha de Emisión:</span>{" "}
                                {format(data.issueDate, "dd/MM/yyyy")}
                            </p>
                            {data.issuer?.tax_id && (
                                <p>
                                    <span className="font-bold">CUIT:</span> {data.issuer.tax_id}
                                </p>
                            )}
                            <p>
                                <span className="font-bold">Ingresos Brutos:</span>{" "}
                                {data.issuer?.gross_income || "Exento"}
                            </p>
                            {data.issuer?.activity_start_date && (
                                <p>
                                    <span className="font-bold">Fecha de Inicio de Actividades:</span>{" "}
                                    {(() => {
                                        // Asegurar que la fecha se lea como fecha local (sin zona horaria)
                                        const date = new Date(data.issuer!.activity_start_date!);
                                        const year = date.getFullYear();
                                        const month = String(date.getMonth() + 1).padStart(2, '0');
                                        const day = String(date.getDate()).padStart(2, '0');
                                        return `${day}/${month}/${year}`;
                                    })()}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sección Media: Período Facturado y Vencimiento */}
                <div className="p-4 border-b-4 border-black bg-gray-50 dark:bg-gray-100">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="font-bold">Período Facturado Desde:</span>{" "}
                            {format(data.issueDate, "dd/MM/yyyy")}{" "}
                            <span className="font-bold">Hasta:</span>{" "}
                            {data.dueDate ? format(data.dueDate, "dd/MM/yyyy") : format(data.issueDate, "dd/MM/yyyy")}
                        </div>
                        {data.dueDate && (
                            <div>
                                <span className="font-bold">Fecha de Vto. para el pago:</span>{" "}
                                {format(data.dueDate, "dd/MM/yyyy")}
                            </div>
                        )}
                    </div>
                </div>

                {/* Sección Inferior: Datos del Cliente */}
                <div className="p-4 border-b-4 border-black">
                    <div className="space-y-1 text-sm">
                        {data.client.tax_id && (
                            <p>
                                <span className="font-bold">CUIT:</span> {data.client.tax_id}
                            </p>
                        )}
                        <p>
                            <span className="font-bold">Apellido y Nombre / Razón Social:</span>{" "}
                            {data.client.business_name || data.client.name}
                        </p>
                        {(data.client.legal_address || data.client.address) && (
                            <p>
                                <span className="font-bold">Domicilio:</span>{" "}
                                {data.client.legal_address || data.client.address}
                            </p>
                        )}
                        {data.client.tax_condition && (
                            <p>
                                <span className="font-bold">Condición frente al IVA:</span>{" "}
                                {formatTaxConditionForInvoice(data.client.tax_condition)}
                            </p>
                        )}
                        <p>
                            <span className="font-bold">Condición de venta:</span> Contado
                        </p>
                    </div>
                </div>
            </div>


            {/* Tabla de items */}
            <div className="border-b-4 border-black">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="border-b-4 border-black">
                            <th className="text-left py-3 px-4 font-bold text-sm uppercase border-r-2 border-black">Descripción</th>
                            <th className="text-right py-3 px-4 font-bold text-sm uppercase border-r-2 border-black">Cantidad</th>
                            <th className="text-right py-3 px-4 font-bold text-sm uppercase border-r-2 border-black">Precio Unit.</th>
                            <th className="text-right py-3 px-4 font-bold text-sm uppercase">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.items.map((item, idx) => (
                            <tr key={idx} className="border-b-2 border-black">
                                <td className="py-3 px-4 border-r-2 border-black">
                                    <p className="font-medium">{item.description}</p>
                                    {data.summary.currency === "ARS" && item.exchangeRateUsed != null && (
                                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                            Cotiz {item.exchangeRateDate ? format(item.exchangeRateDate, "dd/MM/yyyy") : ""}{item.exchangeRateDate ? ": " : ""}{item.exchangeRateUsed.toLocaleString("es-AR", { maximumFractionDigits: 0 })} ARS
                                        </p>
                                    )}
                                </td>
                                <td className="py-3 px-4 text-right font-mono border-r-2 border-black">
                                    {item.quantity.toFixed(2)} {item.type === "time" ? "h" : "un"}
                                </td>
                                <td className="py-3 px-4 text-right font-mono border-r-2 border-black">
                                    {item.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {data.summary.currency}
                                </td>
                                <td className="py-3 px-4 text-right font-mono font-bold">
                                    {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {data.summary.currency}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Totales */}
            <div className="border-b-4 border-black">
                <div className="flex justify-end p-4">
                    <div className="w-full max-w-md space-y-2">
                        <div className="flex justify-between text-sm border-b-2 border-black pb-2">
                            <span className="font-bold">Subtotal:</span>
                            <span className="font-bold font-mono">
                                {data.summary.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {data.summary.currency}
                            </span>
                        </div>
                        {data.summary.tax_rate > 0 && (
                            <div className="flex justify-between text-sm border-b-2 border-black pb-2">
                                <span className="font-bold">
                                    Impuesto ({data.summary.tax_rate}%):
                                </span>
                                <span className="font-bold font-mono">
                                    {data.summary.tax_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {data.summary.currency}
                                </span>
                            </div>
                        )}
                        <div className="flex justify-between items-baseline pt-2">
                            <span className="text-lg font-black uppercase tracking-wider">Importe Total:</span>
                            <span className="text-2xl font-black font-mono">
                                {data.summary.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {data.summary.currency}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Información de cotización (solo cuando es cotización histórica; en cotización del día se muestra por ítem) */}
            {data.summary.currency === "ARS" && data.exchangeInfo && data.exchangeStrategy === "HISTORICAL" && (
                <div className="p-4 border-b-4 border-black bg-gray-50 dark:bg-gray-100 text-sm">
                    <p>
                        <span className="font-bold">Tipo de Cambio:</span>{" "}
                        1 USD = {data.exchangeInfo.rate.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS
                        {data.exchangeInfo.source && ` (${data.exchangeInfo.source})`}
                    </p>
                </div>
            )}

            {/* Footer AFIP (si es legal) */}
            {isLegal && (
                <div className="p-6 border-t bg-gray-100 dark:bg-gray-100 text-center">
                    <p className="text-xs text-gray-600 dark:text-gray-600">
                        Este comprobante será autorizado por AFIP mediante CAE (Código de Autorización Electrónico)
                    </p>
                    <p className="text-[10px] text-gray-600 dark:text-gray-600 mt-2">
                        Comprobante Electrónico - RG AFIP N° 4291/19 y modificatorias
                    </p>
                </div>
            )}
            </div>
        </div>
    );
}
