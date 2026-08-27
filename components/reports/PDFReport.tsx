"use client";

import React from 'react';
import {
    Document,
    Page,
    Text,
    View,
    StyleSheet,
    Image,
    Font,
} from '@react-pdf/renderer';
import { formatDateTime24 } from '@/lib/date-format';

// Usamos fuentes estándar de PDF (Helvetica, Courier, Times-Roman) para evitar problemas de carga externa


const styles = StyleSheet.create({
    page: {
        padding: 40,
        fontSize: 10,
        fontFamily: 'Helvetica',
        color: '#334155',
        backgroundColor: '#ffffff',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        borderBottomWidth: 2,
        borderBottomColor: '#0f172a',
        paddingBottom: 15,
    },
    headerLeft: {
        flexDirection: 'column',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#0f172a',
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 10,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginTop: 4,
    },
    logo: {
        width: 100,
        height: 50,
        objectFit: 'contain',
    },
    clientName: {
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'right',
        color: '#0f172a',
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#0f172a',
        marginTop: 20,
        marginBottom: 10,
        textTransform: 'uppercase',
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
        paddingBottom: 4,
    },
    chartContainer: {
        marginVertical: 10,
        padding: 10,
        backgroundColor: '#f8fafc',
        borderRadius: 4,
    },
    chartRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    chartLabel: {
        width: 120,
        fontSize: 9,
        color: '#475569',
    },
    chartBarBg: {
        width: 200,
        height: 8,
        backgroundColor: '#e2e8f0',
        borderRadius: 2,
        marginHorizontal: 8,
    },
    chartBarFill: {
        height: '100%',
        backgroundColor: '#0f172a',
        borderRadius: 2,
    },
    chartValue: {
        width: 40,
        fontSize: 9,
        fontWeight: 'bold',
        textAlign: 'right',
        fontFamily: 'Courier',
    },
    table: {
        width: 'auto',
        marginTop: 10,
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 6,
        paddingHorizontal: 4,
        alignItems: 'center',
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 0.5,
        borderBottomColor: '#e2e8f0',
        paddingVertical: 4,
        paddingHorizontal: 4,
        alignItems: 'flex-start', // Align distinct texts to top
    },
    // Column widths: se maximiza la Descripción (texto largo) y se comprimen las
    // columnas de contexto, para reducir el alto de fila y la cantidad de páginas.
    colDate: { width: '9%' },
    colProject: { width: '13%', paddingRight: 4 },
    colTask: { width: '14%', paddingRight: 6 },
    colDesc: { width: '57%', paddingLeft: 4, paddingRight: 4 },
    colHours: { width: '7%', textAlign: 'right' },

    headerText: {
        color: '#f8fafc',
        fontSize: 8,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    cellText: {
        fontSize: 8,
        color: '#334155',
        lineHeight: 1.25,
    },
    monoText: {
        fontFamily: 'Courier',
        fontSize: 8,
    },
    // Fecha compacta: entra en una columna angosta (se parte en 2 líneas).
    dateText: {
        fontFamily: 'Courier',
        fontSize: 7,
        lineHeight: 1.2,
    },
    summaryBox: {
        marginTop: 30,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    totalLabel: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#64748b',
        textTransform: 'uppercase',
        marginRight: 10,
    },
    totalValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#0f172a',
        fontFamily: 'Courier',
    },
    footer: {
        position: 'absolute',
        bottom: 30,
        left: 40,
        right: 40,
        textAlign: 'center',
        fontSize: 8,
        color: '#94a3b8',
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
        paddingTop: 10,
    }
});

interface PDFReportProps {
    entries: any[];
    client: { name: string; logo_url?: string | null } | null;
    totalHours: string;
    filters?: {
        start_date?: string;
        end_date?: string;
    };
    analytics?: {
        daily: any[];
        projects: any[];
    };
}

const ProjectChart = ({ data }: { data: any[] }) => {
    if (!data || data.length === 0) return null;

    // Find max value for scaling
    // data structure: { name: string, hours: number }
    const maxHours = Math.max(...data.map(d => Number(d.hours) || 0), 1);

    return (
        <View style={styles.chartContainer}>
            {data.map((item, index) => {
                const widthPercent = `${(Math.min((item.hours || 0) / maxHours, 1) * 100).toFixed(1)}%`;
                return (
                    <View key={index} style={styles.chartRow}><Text style={styles.chartLabel}>{item.name}</Text><View style={styles.chartBarBg}><View style={[styles.chartBarFill, { width: widthPercent }]} /></View><Text style={styles.chartValue}>{Number(item.hours).toFixed(1)}h</Text></View>
                );
            })}
        </View>
    );
};

export const PDFReport = ({ entries, client, totalHours, analytics, filters }: PDFReportProps) => {
    // §bug — el total del "Resumen Ejecutivo" debe reflejar TODOS los proyectos
    // (suma de sus horas), no uno solo. Se deriva de analytics.projects; si no
    // hay analítica, cae al prop totalHours.
    const projectsTotal = (analytics?.projects ?? []).reduce(
        (s, p) => s + (Number(p?.hours) || 0),
        0
    );
    const grandTotal =
        analytics?.projects && analytics.projects.length > 0
            ? projectsTotal.toFixed(2)
            : totalHours;
    return (
    <Document>
        <Page size="A4" style={styles.page}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Text style={styles.title}>Reporte de Actividad</Text>
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Text style={styles.subtitle}>{formatDateTime24(new Date())}</Text>{(filters?.start_date || filters?.end_date) ? (
                        <Text style={[styles.subtitle, { color: '#0f172a', fontWeight: 'bold' }]}>
                            | Filtro: {filters.start_date || '...'} a {filters.end_date || '...'}
                        </Text>
                    ) : null}</View>
                </View>
                {client?.logo_url ? (
                    <Image src={client.logo_url} style={styles.logo} />
                ) : (
                    <Text style={styles.clientName}>{client?.name || 'Sistema MyKimai'}</Text>
                )}
            </View>

            {/* Executive Summary */}
            <View>
                <Text style={styles.sectionTitle}>Resumen Ejecutivo</Text>
                <View style={{ flexDirection: 'row' }}>
                    <View style={{ flex: 1 }}>{analytics?.projects ? <ProjectChart data={analytics.projects} /> : null}</View>
                    <View style={{ width: 150, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={styles.totalLabel}>Horas Totales</Text><Text style={[styles.totalValue, { fontSize: 32 }]}>{grandTotal}</Text><Text style={[styles.subtitle, { fontSize: 8, marginTop: 5 }]}>Tiempo Neto (todos los proyectos)</Text></View>
                </View>
            </View>

            {/* Detailed Table */}
            <View>
                <Text style={styles.sectionTitle}>Detalle de Tareas</Text>
                <View style={styles.table}>
                    <View style={styles.tableHeader}><Text style={[styles.colDate, styles.headerText]}>Fecha</Text><Text style={[styles.colProject, styles.headerText]}>Proyecto</Text><Text style={[styles.colTask, styles.headerText]}>Tarea</Text><Text style={[styles.colDesc, styles.headerText]}>Descripción / Notas</Text><Text style={[styles.colHours, styles.headerText]}>Horas</Text></View>

                    {entries.map((entry, i) => (
                        <View key={i} style={styles.tableRow} wrap={false}>
                            <Text style={[styles.colDate, styles.dateText]}>{formatDateTime24(new Date(entry.start_time))}</Text>
                            <Text style={[styles.colProject, styles.cellText]}>{entry.tasks?.projects?.name}</Text>
                            <View style={styles.colTask}>
                                <Text style={styles.cellText}>{entry.title || entry.tasks?.name || "—"}</Text>
                                {!entry.billable && (
                                    <Text style={{ fontSize: 7, color: '#ea580c', fontWeight: 'bold' }}>(No Facturable)</Text>
                                )}
                            </View>
                            <Text style={[styles.colDesc, styles.cellText]}>{entry.description || '-'}</Text>
                            <Text style={[styles.colHours, styles.monoText]}>{((entry.duration_neto || 0) / 60).toFixed(2)}</Text>
                        </View>
                    ))}
                </View>
            </View>

            <Text style={styles.footer} fixed>
                Generado por MyKimai System - {new Date().getFullYear()} @ By Ing. Lucas Loyola
            </Text>
        </Page>
    </Document>
    );
};
