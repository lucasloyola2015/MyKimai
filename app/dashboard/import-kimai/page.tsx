"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importKimaiEntries, type KimaiRow } from "@/lib/actions/import-kimai";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, Loader2, FileText } from "lucide-react";

interface CSVRow {
  Date: string;
  From: string;
  To: string;
  Duration: string;
  Currency: string;
  "Hourly price": string;
  Customer: string;
  Project: string;
  Activity: string;
  Description: string;
  Billable: string;
}

export default function ImportKimaiPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    details?: {
      clientCreated: boolean;
      projectCreated: boolean;
      taskCreated: boolean;
      timeEntriesImported: number;
    };
  } | null>(null);
  const router = useRouter();

  // Función para parsear CSV manualmente
  const parseCSV = (text: string): CSVRow[] => {
    const lines = text.split("\n").filter((line) => line.trim());
    if (lines.length < 2) return [];

    // Parsear header
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));

    // Parsear filas
    const rows: CSVRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const values: string[] = [];
      let current = "";
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          values.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current.trim()); // Último valor

      if (values.length >= headers.length) {
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index]?.replace(/^"|"$/g, "") || "";
        });
        rows.push(row as CSVRow);
      }
    }

    return rows;
  };

  const handleImport = async () => {
    if (!file) return;

    setLoading(true);
    setResult(null);

    try {
      // El CSV se parsea en el cliente; el find-or-create + insert lo hace el
      // Server Action (Prisma + ownerId), no supabase-js anon.
      const text = await file.text();
      const rows = parseCSV(text);
      const res = await importKimaiEntries(rows as KimaiRow[]);
      setResult(res);
    } catch (error: any) {
      console.error("Error en importación:", error);
      setResult({
        success: false,
        message: error.message || "Error desconocido durante la importación",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Importar datos de Kimai
          </CardTitle>
          <CardDescription>
            Importa clientes, proyectos, tareas y entradas de tiempo desde un archivo CSV exportado de Kimai.
            <br />
            <strong className="text-destructive">Esta operación es de un solo uso.</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="csv-file" className="text-sm font-medium">
              Archivo CSV
            </label>
            <input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
              disabled={loading}
            />
            {file && (
              <p className="text-sm text-muted-foreground">
                Archivo seleccionado: {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>

          {result && (
            <Alert variant={result.success ? "default" : "destructive"}>
              <div className="flex items-start gap-2">
                {result.success ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 mt-0.5" />
                )}
                <div className="flex-1">
                  <AlertDescription>{result.message}</AlertDescription>
                  {result.success && result.details && (
                    <div className="mt-2 text-sm space-y-1">
                      <p>• Cliente: {result.details.clientCreated ? "Creado" : "Ya existía"}</p>
                      <p>• Proyecto: {result.details.projectCreated ? "Creado" : "Ya existía"}</p>
                      <p>• Tarea: {result.details.taskCreated ? "Creada" : "Ya existía"}</p>
                      <p>• Entradas de tiempo: {result.details.timeEntriesImported} importadas</p>
                    </div>
                  )}
                </div>
              </div>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleImport}
              disabled={!file || loading}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                "Importar datos"
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard")}
              disabled={loading}
            >
              Volver al Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
