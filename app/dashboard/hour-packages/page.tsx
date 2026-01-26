"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase/client";
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
import { Plus, Pencil, Trash2, AlertCircle } from "lucide-react";
import type { Database } from "@/lib/types/database";
import { format } from "date-fns";

type HourPackage = Database["public"]["Tables"]["hour_packages"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Project = Database["public"]["Tables"]["projects"]["Row"];

interface PackageWithRelations extends HourPackage {
  clients: Client;
  projects: Project | null;
}

const CURRENCIES = [
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
  { value: "MXN", label: "MXN" },
  { value: "ARS", label: "ARS" },
  { value: "CLP", label: "CLP" },
  { value: "COP", label: "COP" },
];

export default function HourPackagesPage() {
  const [packages, setPackages] = useState<PackageWithRelations[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<HourPackage | null>(
    null
  );
  const supabase = createClientComponentClient();

  const [formData, setFormData] = useState({
    client_id: "",
    project_id: "",
    hours: "",
    price: "",
    currency: "USD",
    expires_at: "",
    notes: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Load clients
      const { data: clientsData, error: clientsError } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .order("name");

      if (clientsError) throw clientsError;
      setClients(clientsData || []);

      // Load projects
      const { data: projectsData, error: projectsError } = await supabase
        .from("projects")
        .select("*, clients(*)")
        .eq("clients.user_id", user.id)
        .order("name");

      if (projectsError) throw projectsError;
      setProjects((projectsData as any) || []);

      // Load packages
      const { data: packagesData, error: packagesError } = await supabase
        .from("hour_packages")
        .select("*, clients(*), projects(*)")
        .eq("clients.user_id", user.id)
        .order("purchased_at", { ascending: false });

      if (packagesError) throw packagesError;
      setPackages((packagesData as any) || []);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const packageData = {
        client_id: formData.client_id,
        project_id: formData.project_id || null,
        hours: parseFloat(formData.hours),
        hours_used: 0,
        price: parseFloat(formData.price),
        currency: formData.currency,
        expires_at: formData.expires_at || null,
        notes: formData.notes || null,
      };

      if (editingPackage) {
        const { error } = await supabase
          .from("hour_packages")
          .update(packageData)
          .eq("id", editingPackage.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("hour_packages")
          .insert(packageData);
        if (error) throw error;
      }

      setIsDialogOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error("Error saving package:", error);
      alert("Error al guardar el paquete");
    }
  };

  const handleEdit = (pkg: HourPackage) => {
    setEditingPackage(pkg);
    setFormData({
      client_id: pkg.client_id,
      project_id: pkg.project_id || "",
      hours: pkg.hours.toString(),
      price: pkg.price.toString(),
      currency: pkg.currency,
      expires_at: pkg.expires_at
        ? format(new Date(pkg.expires_at), "yyyy-MM-dd")
        : "",
      notes: pkg.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este paquete?")) return;

    try {
      const { error } = await supabase
        .from("hour_packages")
        .delete()
        .eq("id", id);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error("Error deleting package:", error);
      alert("Error al eliminar el paquete");
    }
  };

  const resetForm = () => {
    setFormData({
      client_id: "",
      project_id: "",
      hours: "",
      price: "",
      currency: "USD",
      expires_at: "",
      notes: "",
    });
    setEditingPackage(null);
  };

  const getRemainingHours = (pkg: HourPackage): number => {
    return pkg.hours - pkg.hours_used;
  };

  const getUsagePercentage = (pkg: HourPackage): number => {
    return (pkg.hours_used / pkg.hours) * 100;
  };

  if (loading) {
    return <div>Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Paquetes de Horas</h1>
          <p className="text-muted-foreground">
            Gestiona los paquetes de horas precompradas
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} disabled={clients.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Paquete
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingPackage ? "Editar Paquete" : "Nuevo Paquete"}
              </DialogTitle>
              <DialogDescription>
                Registra un paquete de horas precompradas
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="client_id">Cliente *</Label>
                  <Select
                    value={formData.client_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, client_id: value })
                    }
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="project_id">Proyecto (Opcional)</Label>
                  <Select
                    value={formData.project_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, project_id: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un proyecto (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Ninguno (para el cliente)</SelectItem>
                      {projects
                        .filter((p: any) => p.client_id === formData.client_id)
                        .map((project: any) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="hours">Horas *</Label>
                    <Input
                      id="hours"
                      type="number"
                      step="0.01"
                      value={formData.hours}
                      onChange={(e) =>
                        setFormData({ ...formData, hours: e.target.value })
                      }
                      required
                      min="0.01"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="price">Precio *</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) =>
                        setFormData({ ...formData, price: e.target.value })
                      }
                      required
                      min="0"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="currency">Moneda</Label>
                    <Select
                      value={formData.currency}
                      onValueChange={(value) =>
                        setFormData({ ...formData, currency: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((currency) => (
                          <SelectItem
                            key={currency.value}
                            value={currency.value}
                          >
                            {currency.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="expires_at">Fecha de Vencimiento</Label>
                  <Input
                    id="expires_at"
                    type="date"
                    value={formData.expires_at}
                    onChange={(e) =>
                      setFormData({ ...formData, expires_at: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="notes">Notas</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                  />
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
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingPackage ? "Actualizar" : "Crear"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg) => {
          const remaining = getRemainingHours(pkg);
          const usagePercent = getUsagePercentage(pkg);
          const isLow = remaining < pkg.hours * 0.2;
          const isExpired =
            pkg.expires_at && new Date(pkg.expires_at) < new Date();

          return (
            <Card key={pkg.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{pkg.clients.name}</span>
                  <div className="flex space-x-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(pkg)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(pkg.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pkg.projects && (
                    <p className="text-sm text-muted-foreground">
                      <strong>Proyecto:</strong> {pkg.projects.name}
                    </p>
                  )}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Horas:</span>
                      <span className="font-medium">
                        {remaining.toFixed(2)} / {pkg.hours.toFixed(2)}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Precio:</span>
                      <span className="font-medium">
                        {pkg.price.toFixed(2)} {pkg.currency}
                      </span>
                    </div>
                  </div>
                  {pkg.expires_at && (
                    <p
                      className={`text-sm ${
                        isExpired ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      <strong>Vence:</strong>{" "}
                      {format(new Date(pkg.expires_at), "dd/MM/yyyy")}
                    </p>
                  )}
                  {isLow && (
                    <div className="flex items-center space-x-2 rounded-md bg-yellow-50 p-2 text-sm text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                      <AlertCircle className="h-4 w-4" />
                      <span>Quedan pocas horas</span>
                    </div>
                  )}
                  {isExpired && (
                    <div className="flex items-center space-x-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <span>Paquete vencido</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {packages.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No hay paquetes de horas registrados. Crea tu primer paquete.
          </p>
        </div>
      )}
    </div>
  );
}
