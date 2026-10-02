"use client";

import { useState } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { updateTimeEntryDescription } from "@/lib/actions/time-entries";

interface Props {
    entryId: string;
    description: string | null;
    onSaved: (description: string | null) => void;
}

/** Descripción de una hora con edición en el lugar (Mis Horas). */
export function EntryDescription({ entryId, description, onSaved }: Props) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(description ?? "");
    const [saving, setSaving] = useState(false);

    const start = () => {
        setValue(description ?? "");
        setEditing(true);
    };

    const save = async () => {
        const next = value.trim() || null;
        if (next === (description ?? null)) {
            setEditing(false);
            return;
        }
        setSaving(true);
        const res = await updateTimeEntryDescription(entryId, next);
        setSaving(false);
        if (!res.success) {
            toast({ title: "No se pudo guardar la descripción", description: res.error, variant: "destructive" });
            return;
        }
        onSaved(next);
        setEditing(false);
    };

    if (editing) {
        return (
            <div className="mt-2 space-y-1.5">
                <Textarea
                    value={value}
                    autoFocus
                    maxLength={2000}
                    rows={3}
                    className="text-xs"
                    placeholder="Qué se hizo en esta sesión"
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
                        if (e.key === "Escape") setEditing(false);
                    }}
                />
                <div className="flex items-center gap-1.5">
                    <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>
                        {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                        Guardar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)} disabled={saving}>
                        <X className="mr-1 h-3 w-3" />
                        Cancelar
                    </Button>
                    <span className="text-[10px] text-muted-foreground">Ctrl+Enter guarda · Esc cancela</span>
                </div>
            </div>
        );
    }

    return (
        <div className="group/desc mt-2 flex items-start gap-1.5">
            <p className={description ? "flex-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300" : "flex-1 text-xs italic text-muted-foreground"}>
                {description || "Sin descripción"}
            </p>
            <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-slate-400 hover:text-primary"
                onClick={start}
                aria-label="Editar descripción"
                title="Editar descripción"
            >
                <Pencil className="h-3 w-3" />
            </Button>
        </div>
    );
}
