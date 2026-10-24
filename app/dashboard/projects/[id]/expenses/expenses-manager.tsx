"use client";

import { useRef, useState, useTransition } from "react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    createExpense,
    updateExpense,
    deleteExpense,
    createExpenseAttachmentUpload,
    confirmExpenseAttachment,
    deleteExpenseAttachment,
    type ExpenseView,
} from "@/lib/actions/expenses";
import {
    EXPENSE_ATTACHMENT_MIME_TYPES,
    EXPENSE_ATTACHMENT_MAX_BYTES,
} from "@/lib/validations/expenses";
import { formatExpenseDate } from "@/lib/utils/expenses";
import { arDayKey } from "@/lib/timezone";
import { createClientComponentClient } from "@/lib/supabase/client";
import { Plus, Pencil, Trash2, Loader2, Paperclip, FileText, X } from "lucide-react";

const ACCEPT = "image/*,application/pdf";

interface Props {
    projectId: string;
    initialExpenses: ExpenseView[];
}

interface FormState {
    description: string;
    supplier: string;
    expense_date: string;
    amount: string;
    currency: "ARS" | "USD";
    billable: boolean;
    notes: string;
}

function emptyForm(): FormState {
    return {
        description: "",
        supplier: "",
        expense_date: arDayKey(new Date()),
        amount: "",
        currency: "ARS",
        billable: true,
        notes: "",
    };
}

const fmtMoney = (amount: number, currency: string) =>
    `${amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

/** Algunos navegadores no informan el tipo de un HEIC: se deduce por extensión. */
function mimeOf(file: File): string {
    if (file.type) return file.type;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "heic" || ext === "heif") return `image/${ext}`;
    if (ext === "pdf") return "application/pdf";
    return "";
}

/** Sube un comprobante: URL firmada del servidor → Storage directo → registro. */
async function uploadAttachment(expenseId: string, file: File): Promise<void> {
    const mime = mimeOf(file);
    if (!(EXPENSE_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mime)) {
        throw new Error(`${file.name}: solo imágenes o PDF.`);
    }
    if (file.size > EXPENSE_ATTACHMENT_MAX_BYTES) {
        throw new Error(`${file.name}: supera los 20 MB.`);
    }
    const meta = {
        expense_id: expenseId,
        file_name: file.name,
        mime_type: mime as (typeof EXPENSE_ATTACHMENT_MIME_TYPES)[number],
        size_bytes: file.size,
    };
    const prep = await createExpenseAttachmentUpload(meta);
    if (!prep.success) throw new Error(`${file.name}: ${prep.error}`);

    const { error } = await createClientComponentClient()
        .storage.from("expense-attachments")
        .uploadToSignedUrl(prep.data.storage_path, prep.data.token, file, { contentType: mime });
    if (error) throw new Error(`${file.name}: ${error.message}`);

    const done = await confirmExpenseAttachment({ ...meta, storage_path: prep.data.storage_path });
    if (!done.success) throw new Error(`${file.name}: ${done.error}`);
}

export function ExpensesManager({ projectId, initialExpenses }: Props) {
    const router = useRouter();
    const { toast } = useToast();
    const expenses = initialExpenses;
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm());
    const [files, setFiles] = useState<File[]>([]);
    const [pending, startPending] = useTransition();
    const [uploadingFor, setUploadingFor] = useState<string | null>(null);
    const attachInputRef = useRef<HTMLInputElement>(null);
    const attachTargetRef = useRef<string | null>(null);

    const pendingTotals = expenses
        .filter((e) => e.billable && !e.invoice_id)
        .reduce<Record<string, number>>((acc, e) => {
            acc[e.currency] = (acc[e.currency] ?? 0) + e.amount;
            return acc;
        }, {});

    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm());
        setFiles([]);
        setDialogOpen(true);
    };

    const openEdit = (e: ExpenseView) => {
        setEditingId(e.id);
        setForm({
            description: e.description,
            supplier: e.supplier ?? "",
            expense_date: e.expense_date,
            amount: String(e.amount),
            currency: e.currency === "USD" ? "USD" : "ARS",
            billable: e.billable,
            notes: e.notes ?? "",
        });
        setFiles([]);
        setDialogOpen(true);
    };

    const uploadAll = async (expenseId: string, list: File[]): Promise<string[]> => {
        const failures: string[] = [];
        for (const file of list) {
            try {
                await uploadAttachment(expenseId, file);
            } catch (err: any) {
                failures.push(err?.message ?? file.name);
            }
        }
        return failures;
    };

    const handleSubmit = () => {
        startPending(async () => {
            const payload = {
                description: form.description.trim(),
                supplier: form.supplier.trim() || null,
                expense_date: new Date(`${form.expense_date}T00:00:00.000Z`),
                amount: Number(form.amount),
                currency: form.currency,
                billable: form.billable,
                notes: form.notes.trim() || null,
            };

            let expenseId = editingId;
            if (editingId) {
                const res = await updateExpense({ id: editingId, ...payload });
                if (!res.success) {
                    toast({ title: "Error", description: res.error, variant: "destructive" });
                    return;
                }
            } else {
                const res = await createExpense({ project_id: projectId, ...payload });
                if (!res.success) {
                    toast({ title: "Error", description: res.error, variant: "destructive" });
                    return;
                }
                expenseId = res.data.id;
            }

            const failures = expenseId && files.length > 0 ? await uploadAll(expenseId, files) : [];
            if (failures.length > 0) {
                toast({
                    title: "Gasto guardado, pero faltan comprobantes",
                    description: failures.join(" · "),
                    variant: "destructive",
                });
            } else {
                toast({ title: editingId ? "Gasto actualizado" : "Gasto cargado" });
            }
            setDialogOpen(false);
            router.refresh();
        });
    };

    const handleDelete = async (e: ExpenseView) => {
        if (!confirm(`¿Eliminar el gasto "${e.description}" y sus comprobantes?`)) return;
        const res = await deleteExpense(e.id);
        if (!res.success) {
            toast({ title: "Error", description: res.error, variant: "destructive" });
            return;
        }
        toast({ title: "Gasto eliminado" });
        router.refresh();
    };

    const pickAttachments = (expenseId: string) => {
        attachTargetRef.current = expenseId;
        attachInputRef.current?.click();
    };

    const handleAttachPicked = async (list: FileList | null) => {
        const expenseId = attachTargetRef.current;
        if (!expenseId || !list || list.length === 0) return;
        setUploadingFor(expenseId);
        const failures = await uploadAll(expenseId, Array.from(list));
        setUploadingFor(null);
        if (attachInputRef.current) attachInputRef.current.value = "";
        if (failures.length > 0) {
            toast({ title: "No se pudo subir", description: failures.join(" · "), variant: "destructive" });
        } else {
            toast({ title: list.length > 1 ? "Comprobantes adjuntados" : "Comprobante adjuntado" });
        }
        router.refresh();
    };

    const handleDeleteAttachment = async (id: string, name: string) => {
        if (!confirm(`¿Quitar el comprobante "${name}"?`)) return;
        const res = await deleteExpenseAttachment(id);
        if (!res.success) {
            toast({ title: "Error", description: res.error, variant: "destructive" });
            return;
        }
        router.refresh();
    };

    return (
        <Card>
            <input
                ref={attachInputRef}
                type="file"
                accept={ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => handleAttachPicked(e.target.files)}
            />
            <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                    <CardTitle>Gastos del proyecto</CardTitle>
                    <CardDescription>
                        {Object.keys(pendingTotals).length > 0
                            ? `Pendiente de facturar: ${Object.entries(pendingTotals)
                                  .map(([cur, total]) => fmtMoney(total, cur))
                                  .join(" + ")}`
                            : "No hay gastos pendientes de facturar."}
                    </CardDescription>
                </div>
                <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nuevo gasto
                </Button>
            </CardHeader>
            <CardContent>
                {expenses.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        Todavía no cargaste gastos para este proyecto.
                    </p>
                ) : (
                    <ul className="divide-y">
                        {expenses.map((e) => (
                            <li key={e.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium">{e.description}</span>
                                        {e.invoice_id ? (
                                            <Link href={`/dashboard/invoices/${e.invoice_id}`}>
                                                <Badge variant="secondary">Facturado · {e.invoice_number}</Badge>
                                            </Link>
                                        ) : e.billable ? (
                                            <Badge variant="outline">Pendiente de facturar</Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-muted-foreground">No facturable</Badge>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {formatExpenseDate(e.expense_date)}
                                        {e.supplier && ` · ${e.supplier}`}
                                    </p>
                                    {e.notes && <p className="text-sm text-muted-foreground whitespace-pre-line">{e.notes}</p>}
                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                        {e.attachments.map((a) => (
                                            <span key={a.id} className="group inline-flex items-center gap-1 rounded-md border bg-muted/40 py-1 pl-1 pr-2 text-xs">
                                                <a
                                                    href={a.url ?? undefined}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 hover:underline"
                                                >
                                                    {a.mime_type?.startsWith("image/") && a.url ? (
                                                        <img src={a.url} alt="" className="h-8 w-8 rounded object-cover" />
                                                    ) : (
                                                        <FileText className="h-4 w-4" />
                                                    )}
                                                    <span className="max-w-[160px] truncate">{a.file_name}</span>
                                                </a>
                                                <button
                                                    type="button"
                                                    title="Quitar comprobante"
                                                    className="ml-1 text-muted-foreground hover:text-destructive"
                                                    onClick={() => handleDeleteAttachment(a.id, a.file_name)}
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        ))}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 text-xs"
                                            disabled={uploadingFor === e.id}
                                            onClick={() => pickAttachments(e.id)}
                                        >
                                            {uploadingFor === e.id ? (
                                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                            ) : (
                                                <Paperclip className="mr-1 h-3 w-3" />
                                            )}
                                            Adjuntar
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 sm:pl-4">
                                    <span className="mr-2 font-mono font-semibold whitespace-nowrap">
                                        {fmtMoney(e.amount, e.currency)}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        title={e.invoice_id ? "Facturado: no se puede editar" : "Editar"}
                                        disabled={!!e.invoice_id}
                                        onClick={() => openEdit(e)}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        title={e.invoice_id ? "Facturado: no se puede borrar" : "Eliminar"}
                                        disabled={!!e.invoice_id}
                                        onClick={() => handleDelete(e)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editingId ? "Editar gasto" : "Nuevo gasto"}</DialogTitle>
                        <DialogDescription>
                            La descripción y el monto salen como una línea en la próxima
                            factura del cliente. Proveedor, notas y comprobantes quedan solo
                            en el sistema.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label htmlFor="expense-description">Descripción (sale en la factura)</Label>
                            <Input
                                id="expense-description"
                                value={form.description}
                                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                placeholder="Conversor serial RS232/RS485 a WiFi/LAN (HF2211A)"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label htmlFor="expense-date">Fecha</Label>
                                <Input
                                    id="expense-date"
                                    type="date"
                                    value={form.expense_date}
                                    onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="expense-supplier">Proveedor</Label>
                                <Input
                                    id="expense-supplier"
                                    value={form.supplier}
                                    onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
                                    placeholder="Mercado Libre — riotecno"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2 space-y-1">
                                <Label htmlFor="expense-amount">Monto</Label>
                                <Input
                                    id="expense-amount"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={form.amount}
                                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label>Moneda</Label>
                                <Select
                                    value={form.currency}
                                    onValueChange={(v) => setForm((f) => ({ ...f, currency: v as "ARS" | "USD" }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ARS">ARS</SelectItem>
                                        <SelectItem value="USD">USD</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="expense-notes">Notas internas</Label>
                            <Textarea
                                id="expense-notes"
                                rows={2}
                                value={form.notes}
                                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="expense-files">Comprobantes (fotos, factura del proveedor)</Label>
                            <Input
                                id="expense-files"
                                type="file"
                                accept={ACCEPT}
                                multiple
                                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                            />
                            {files.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    {files.length} archivo{files.length > 1 ? "s" : ""} para adjuntar
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="expense-billable"
                                checked={form.billable}
                                onCheckedChange={(v) => setForm((f) => ({ ...f, billable: v === true }))}
                            />
                            <Label htmlFor="expense-billable" className="cursor-pointer">
                                Refacturar al cliente
                            </Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={pending}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={pending || !form.description.trim() || !(Number(form.amount) > 0) || !form.expense_date}
                        >
                            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingId ? "Guardar" : "Cargar gasto"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
