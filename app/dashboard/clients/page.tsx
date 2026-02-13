"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Globe, ShieldCheck, Upload, Image as ImageIcon, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getClients,
  createClient,
  updateClient,
  deleteClient,
  toggleClientWebAccess,
} from "@/lib/actions/clients";
import type { clients } from "@prisma/client";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { createClientComponentClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const CURRENCIES = [
  { value: "USD", label: "USD - Dólar Estadounidense" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "GBP", label: "GBP - Libra Esterlina" },
  { value: "MXN", label: "MXN - Peso Mexicano" },
  { value: "ARS", label: "ARS - Peso Argentino" },
  { value: "CLP", label: "CLP - Chileno" },
  { value: "COP", label: "COP - Peso Colombiano" },
];

export default function ClientsPage() {
  const [clients, setClients] = useState<clients[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<clients | null>(null);
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const supabase = createClientComponentClient();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    currency: "USD",
    default_rate: "",
    notes: "",
    logo_url: "",
    is_billable: true,
    web_access_enabled: false,
    portal_password: "",
    // Campos fiscales AFIP
    tax_id: "",
    business_name: "",
    legal_address: "",
    tax_condition: "",
  });

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const data = await getClients();
      setClients(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los clientes.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    startTransition(async () => {
      try {
        const clientData = {
          name: formData.name,
          email: formData.email || null,
          phone: formData.phone || null,
          address: formData.address || null,
          currency: formData.currency,
          default_rate: formData.default_rate
            ? parseFloat(formData.default_rate)
            : null,
          notes: formData.notes || null,
          logo_url: formData.logo_url || null,
          is_billable: formData.is_billable,
          // Campos fiscales AFIP
          tax_id: formData.tax_id || null,
          business_name: formData.business_name || null,
          legal_address: formData.legal_address || null,
          tax_condition: formData.tax_condition || null,
          ...(editingClient && formData.portal_password
            ? { newPassword: formData.portal_password }
            : {}),
        };

        if (editingClient) {
          const result = await updateClient(editingClient.id, clientData);
          if (!result.success) {
            toast({
              title: "Error",
              description: result.error,
              variant: "destructive",
            });
            return;
          }

          // Solo llamar a toggle cuando se activa/desactiva el acceso o se habilita por primera vez (crear usuario en Auth)
          const accessToggled = formData.web_access_enabled !== editingClient.web_access_enabled;
          const firstTimeEnable = formData.web_access_enabled && !editingClient.portal_user_id && formData.portal_password;
          if (accessToggled || firstTimeEnable) {
            const accessResult = await toggleClientWebAccess(
              editingClient.id,
              formData.web_access_enabled,
              formData.portal_password || undefined
            );
            if (!accessResult.success) {
              toast({
                title: "Advertencia",
                description: `El cliente se guardó pero hubo un error con el acceso web: ${accessResult.error}`,
                variant: "destructive",
              });
            }
          }

          toast({
            title: "Cliente actualizado",
            description: "El cliente se actualizó correctamente.",
          });
        } else {
          const result = await createClient(clientData);
          if (!result.success) {
            toast({
              title: "Error",
              description: result.error,
              variant: "destructive",
            });
            return;
          }

          // Si es un cliente nuevo y se habilitó el acceso web
          if (formData.web_access_enabled && formData.portal_password) {
            await toggleClientWebAccess(
              result.data.id,
              true,
              formData.portal_password
            );
          }

          toast({
            title: "Cliente creado",
            description: "El cliente se creó correctamente.",
          });
        }

        setIsDialogOpen(false);
        resetForm();
        loadClients();
      } catch (error) {
        toast({
          title: "Error",
          description: "Ocurrió un error al guardar el cliente.",
          variant: "destructive",
        });
      }
    });
  };

  const handleEdit = (client: clients) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      currency: client.currency,
      default_rate: client.default_rate?.toString() || "",
      notes: client.notes || "",
      logo_url: client.logo_url || "",
      is_billable: (client as any).is_billable ?? true,
      web_access_enabled: client.web_access_enabled,
      portal_password: "",
      // Campos fiscales AFIP
      tax_id: client.tax_id || "",
      business_name: client.business_name || "",
      legal_address: client.legal_address || "",
      tax_condition: client.tax_condition || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este cliente?")) return;

    startTransition(async () => {
      try {
        const result = await deleteClient(id);
        if (!result.success) {
          toast({
            title: "Error",
            description: result.error,
            variant: "destructive",
          });
          return;
        }
        toast({
          title: "Cliente eliminado",
          description: "El cliente se eliminó correctamente.",
        });
        loadClients();
      } catch (error) {
        toast({
          title: "Error",
          description: "Ocurrió un error al eliminar el cliente.",
          variant: "destructive",
        });
      }
    });
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      address: "",
      currency: "USD",
      default_rate: "",
      notes: "",
      logo_url: "",
      is_billable: true,
      web_access_enabled: false,
      portal_password: "",
      // Campos fiscales AFIP
      tax_id: "",
      business_name: "",
      legal_address: "",
      tax_condition: "",
    });
    setEditingClient(null);
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: "Error", description: "El archivo debe ser una imagen.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `client-logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      setFormData({ ...formData, logo_url: publicUrl });
      toast({ title: "Éxito", description: "Logo cargado correctamente." });
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "No se pudo cargar el logo.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="text-muted-foreground">
            Gestiona tus clientes y sus tarifas
          </p>
        </div>
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              resetForm();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingClient ? "Editar Cliente" : "Nuevo Cliente"}
              </DialogTitle>
              <DialogDescription>
                Completa la información del cliente
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-6 py-4">
                <div className="flex flex-col items-center gap-4 py-2 bg-muted/30 rounded-lg border border-dashed border-border/50">
                  <div className="relative w-24 h-24 rounded-lg overflow-hidden border bg-background group">
                    {formData.logo_url ? (
                      <>
                        <img
                          src={formData.logo_url}
                          alt="Logo Preview"
                          className="w-full h-full object-contain p-2"
                        />
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, logo_url: "" })}
                          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity text-white"
                        >
                          <X className="h-6 w-6" />
                        </button>
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                        <ImageIcon className="h-8 w-8 mb-1" />
                        <span className="text-[10px] uppercase font-bold tracking-tighter">Sin Logo</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-1.5 px-6 text-center">
                    <Label
                      htmlFor="logo-upload"
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-md bg-background border shadow-sm cursor-pointer hover:bg-muted transition-colors",
                        uploading && "opacity-50 pointer-events-none"
                      )}
                    >
                      <Upload className="h-4 w-4" />
                      {uploading ? "Cargando..." : "Subir Logo Corporativo"}
                      <input
                        id="logo-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleUploadLogo}
                        disabled={uploading || isPending}
                      />
                    </Label>
                    <p className="text-[10px] text-muted-foreground">PNG, JPG o SVG. Máx 2MB.</p>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="name">Nombre *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                    disabled={isPending}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      disabled={isPending}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      disabled={isPending}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="address">Dirección</Label>
                  <Textarea
                    id="address"
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                    disabled={isPending}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="currency">Moneda</Label>
                    <Select
                      value={formData.currency}
                      onValueChange={(value) =>
                        setFormData({ ...formData, currency: value })
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((currency) => (
                          <SelectItem key={currency.value} value={currency.value}>
                            {currency.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="default_rate">Tarifa por Defecto</Label>
                    <Input
                      id="default_rate"
                      type="number"
                      step="0.01"
                      value={formData.default_rate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          default_rate: e.target.value,
                        })
                      }
                      placeholder="0.00"
                      disabled={isPending}
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2 bg-muted/30 p-4 rounded-lg border">
                  <Checkbox
                    id="is_billable"
                    checked={formData.is_billable}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, is_billable: checked === true })
                    }
                    disabled={isPending}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label
                      htmlFor="is_billable"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Cliente Facturable
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Si se desactiva, todos los proyectos y tareas de este cliente no serán facturables.
                    </p>
                  </div>
                </div>

                <div className="pt-4">
                  <Separator className="mb-4" />
                  <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm font-medium flex items-center gap-2 text-primary">
                        <Globe className="h-4 w-4" />
                        Acceso Web al Sistema
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-0 px-4 pb-4 space-y-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="web_access_enabled"
                          checked={formData.web_access_enabled}
                          onCheckedChange={(checked) =>
                            setFormData({ ...formData, web_access_enabled: checked === true })
                          }
                          disabled={isPending}
                        />
                        <Label
                          htmlFor="web_access_enabled"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Habilitar acceso web al Sistema
                        </Label>
                      </div>

                      {formData.web_access_enabled && (
                        <div className="grid gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                          <Label htmlFor="portal_password">
                            {editingClient?.portal_user_id ? "Nueva Contraseña (dejar vacío para no cambiar)" : "Contraseña Manual *"}
                          </Label>
                          <div className="relative">
                            <ShieldCheck className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="portal_password"
                              type="password"
                              className="pl-9"
                              value={formData.portal_password}
                              onChange={(e) =>
                                setFormData({ ...formData, portal_password: e.target.value })
                              }
                              placeholder="••••••••"
                              required={!editingClient?.portal_user_id}
                              disabled={isPending}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground italic">
                            El cliente usará su email ({formData.email || "no definido"}) y esta contraseña para ingresar.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="pt-4">
                  <Separator className="mb-4" />
                  <Card className="border-blue-500/20 bg-blue-500/5">
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm font-medium flex items-center gap-2 text-blue-600">
                        <ShieldCheck className="h-4 w-4" />
                        Datos Fiscales (AFIP)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-0 px-4 pb-4 space-y-4">
                      <div className="grid gap-2">
                        <Label htmlFor="tax_id">CUIT / CUIL</Label>
                        <Input
                          id="tax_id"
                          value={formData.tax_id}
                          onChange={(e) =>
                            setFormData({ ...formData, tax_id: e.target.value })
                          }
                          placeholder="20-12345678-9"
                          disabled={isPending}
                        />
                        <p className="text-[10px] text-muted-foreground italic">
                          Requerido para emitir facturas electrónicas AFIP
                        </p>
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="business_name">Razón Social</Label>
                        <Input
                          id="business_name"
                          value={formData.business_name}
                          onChange={(e) =>
                            setFormData({ ...formData, business_name: e.target.value })
                          }
                          placeholder="Nombre legal de la empresa"
                          disabled={isPending}
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="legal_address">Dirección Legal</Label>
                        <Textarea
                          id="legal_address"
                          value={formData.legal_address}
                          onChange={(e) =>
                            setFormData({ ...formData, legal_address: e.target.value })
                          }
                          placeholder="Calle, número, ciudad, código postal"
                          disabled={isPending}
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="tax_condition">Condición frente al IVA</Label>
                        <Select
                          value={formData.tax_condition}
                          onValueChange={(value) =>
                            setFormData({ ...formData, tax_condition: value })
                          }
                          disabled={isPending}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar condición" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Responsable Inscripto">Responsable Inscripto</SelectItem>
                            <SelectItem value="Monotributista">Monotributista</SelectItem>
                            <SelectItem value="Exento">Exento</SelectItem>
                            <SelectItem value="Consumidor Final">Consumidor Final</SelectItem>
                            <SelectItem value="No Responsable">No Responsable</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    resetForm();
                  }}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending
                    ? "Guardando..."
                    : editingClient
                      ? "Actualizar"
                      : "Crear"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {clients.map((client) => (
          <Card key={client.id} className="overflow-hidden group hover:border-primary/50 transition-colors">
            <div className="h-24 bg-muted/30 flex items-center justify-center p-4 border-b relative">
              {client.logo_url ? (
                <img
                  src={client.logo_url}
                  alt={client.name}
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <div className="text-muted-foreground/20 italic font-bold text-xl uppercase tracking-widest font-mono">
                  {client.name.substring(0, 3)}
                </div>
              )}
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                {client.name}
                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(client)}
                    disabled={isPending}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(client.id)}
                    disabled={isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {client.email && (
                  <p className="text-muted-foreground">
                    <strong>Email:</strong> {client.email}
                  </p>
                )}
                {client.phone && (
                  <p className="text-muted-foreground">
                    <strong>Teléfono:</strong> {client.phone}
                  </p>
                )}
                <p className="text-muted-foreground">
                  <strong>Moneda:</strong> {client.currency}
                </p>
                {client.default_rate && (
                  <p className="text-muted-foreground">
                    <strong>Tarifa:</strong> {client.default_rate.toString()}{" "}
                    {client.currency}/h
                  </p>
                )}
                <div className="pt-2">
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${client.web_access_enabled
                    ? "bg-green-500/10 text-green-500 border-green-500/20"
                    : "bg-muted text-muted-foreground border-border"
                    }`}>
                    <Globe className="h-3 w-3" />
                    {client.web_access_enabled ? "Portal Activo" : "Sin Acceso Web"}
                  </div>
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${(client as any).is_billable
                    ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                    : "bg-orange-500/10 text-orange-500 border-orange-500/20"
                    }`}>
                    <ShieldCheck className="h-3 w-3" />
                    {(client as any).is_billable ? "Facturable" : "No Facturable"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {clients.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No hay clientes registrados. Crea tu primer cliente.
          </p>
        </div>
      )}
    </div>
  );
}
