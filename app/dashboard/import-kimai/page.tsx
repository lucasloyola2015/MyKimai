"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/supabase/client";
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
  const supabase = createClientComponentClient();

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

  // Función para convertir duración "5:08" a minutos
  const durationToMinutes = (duration: string): number => {
    const parts = duration.split(":");
    if (parts.length !== 2) return 0;
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    return hours * 60 + minutes;
  };

  // Función para combinar fecha y hora
  const combineDateTime = (date: string, time: string): string => {
    // date: "2026-01-16", time: "07:07"
    return `${date}T${time}:00`;
  };

  const handleImport = async () => {
    if (!file) return;

    setLoading(true);
    setResult(null);

    try {
      // Obtener usuario autenticado
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("No se pudo obtener el usuario autenticado");
      }

      // Leer archivo CSV
      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length === 0) {
        throw new Error("El archivo CSV está vacío o no tiene el formato correcto");
      }

      // Extraer datos únicos del CSV
      const firstRow = rows[0];
      const clientName = firstRow.Customer;
      const projectName = firstRow.Project;
      const taskName = firstRow.Activity;
      const hourlyRate = parseFloat(firstRow["Hourly price"]) || 25;
      const currency = firstRow.Currency || "USD";

      // 1. Crear o obtener cliente
      let clientId: string;
      const { data: existingClient } = await supabase
        .from("clients")
        .select("id")
        .eq("name", clientName)
        .eq("user_id", user.id)
        .single();

      if (existingClient) {
        clientId = existingClient.id;
        console.log("Cliente existente encontrado:", clientId);
      } else {
        const { data: newClient, error: clientError } = await supabase
          .from("clients")
          .insert({
            user_id: user.id,
            name: clientName,
            currency: currency,
            default_rate: hourlyRate,
          })
          .select("id")
          .single();

        if (clientError || !newClient) {
          throw new Error(`Error al crear cliente: ${clientError?.message}`);
        }
        clientId = newClient.id;
        console.log("Cliente creado:", clientId);
      }

      // 2. Crear o obtener proyecto
      let projectId: string;
      const { data: existingProject } = await supabase
        .from("projects")
        .select("id")
        .eq("name", projectName)
        .eq("client_id", clientId)
        .single();

      if (existingProject) {
        projectId = existingProject.id;
        console.log("Proyecto existente encontrado:", projectId);
      } else {
        // Calcular fechas de inicio y fin desde las entradas
        const dates = rows.map((r) => r.Date).sort();
        const startDate = dates[0];
        const endDate = dates[dates.length - 1];

        const { data: newProject, error: projectError } = await supabase
          .from("projects")
          .insert({
            client_id: clientId,
            name: projectName,
            currency: currency,
            rate: hourlyRate,
            billing_type: "hourly",
            status: "active",
            start_date: startDate,
            end_date: endDate,
          })
          .select("id")
          .single();

        if (projectError || !newProject) {
          throw new Error(`Error al crear proyecto: ${projectError?.message}`);
        }
        projectId = newProject.id;
        console.log("Proyecto creado:", projectId);
      }

      // 3. Crear o obtener tarea
      let taskId: string;
      const { data: existingTask } = await supabase
        .from("tasks")
        .select("id")
        .eq("name", taskName)
        .eq("project_id", projectId)
        .single();

      if (existingTask) {
        taskId = existingTask.id;
        console.log("Tarea existente encontrada:", taskId);
      } else {
        const { data: newTask, error: taskError } = await supabase
          .from("tasks")
          .insert({
            project_id: projectId,
            name: taskName,
            rate: hourlyRate,
          })
          .select("id")
          .single();

        if (taskError || !newTask) {
          throw new Error(`Error al crear tarea: ${taskError?.message}`);
        }
        taskId = newTask.id;
        console.log("Tarea creada:", taskId);
      }

      // 4. Importar entradas de tiempo
      const timeEntries = rows.map((row) => {
        const startTime = combineDateTime(row.Date, row.From);
        const endTime = combineDateTime(row.Date, row.To);
        const durationMinutes = durationToMinutes(row.Duration);
        const billable = row.Billable === "1" || row.Billable === "true";

        return {
          user_id: user.id,
          task_id: taskId,
          description: row.Description || null,
          start_time: startTime,
          end_time: endTime,
          duration_total: durationMinutes,
          duration_neto: durationMinutes,
          billable: billable,
          rate_applied: hourlyRate,
        };
      });

      // Insertar en lotes para evitar problemas de tamaño
      const batchSize = 10;
      let imported = 0;
      let errors = 0;

      for (let i = 0; i < timeEntries.length; i += batchSize) {
        const batch = timeEntries.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from("time_entries")
          .insert(batch);

        if (insertError) {
          console.error(`Error al insertar lote ${i / batchSize + 1}:`, insertError);
          errors += batch.length;
        } else {
          imported += batch.length;
        }
      }

      if (errors > 0 && imported === 0) {
        throw new Error(`Error al importar entradas de tiempo. ${errors} errores.`);
      }

      setResult({
        success: true,
        message: `Importación completada exitosamente. ${imported} entradas importadas.${errors > 0 ? ` ${errors} errores.` : ""}`,
        details: {
          clientCreated: !existingClient,
          projectCreated: !existingProject,
          taskCreated: !existingTask,
          timeEntriesImported: imported,
        },
      });
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
