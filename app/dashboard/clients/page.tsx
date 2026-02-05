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
import { Plus, Pencil, Trash2, Globe, ShieldCheck } from "lucide-react";
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
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    currency: "USD",
    default_rate: "",
    notes: "",
    web_access_enabled: false,
    portal_password: "",
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
      web_access_enabled: client.web_access_enabled,
      portal_password: "",
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
      web_access_enabled: false,
      portal_password: "",
    });
    setEditingClient(null);
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
              <div className="grid gap-4 py-4">
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
                <div className="grid gap-2">
                  <Label htmlFor="notes">Notas</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    disabled={isPending}
                  />
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
          <Card key={client.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
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
