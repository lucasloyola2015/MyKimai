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
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Database } from "@/lib/types/database";

type Client = Database["public"]["Tables"]["clients"]["Row"];

const CURRENCIES = [
  { value: "USD", label: "USD - Dólar Estadounidense" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "GBP", label: "GBP - Libra Esterlina" },
  { value: "MXN", label: "MXN - Peso Mexicano" },
  { value: "ARS", label: "ARS - Peso Argentino" },
  { value: "CLP", label: "CLP - Peso Chileno" },
  { value: "COP", label: "COP - Peso Colombiano" },
];

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const supabase = createClientComponentClient();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    currency: "USD",
    default_rate: "",
    notes: "",
  });

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0fda1414-4390-4855-9462-9c9a0cf71bf7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'clients/page.tsx:62',message:'loadClients called',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0fda1414-4390-4855-9462-9c9a0cf71bf7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'clients/page.tsx:69',message:'Auth check result',data:{hasUser:!!user,hasAuthError:!!authError,authErrorCode:authError?.code},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      if (authError) {
        console.error("Auth error:", authError);
        return;
      }

      if (!user) {
        console.error("No user found");
        return;
      }

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0fda1414-4390-4855-9462-9c9a0cf71bf7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'clients/page.tsx:79',message:'Before Supabase query',data:{userId:user.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion

      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0fda1414-4390-4855-9462-9c9a0cf71bf7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'clients/page.tsx:84',message:'Supabase query result',data:{hasError:!!error,errorCode:error?.code,errorMessage:error?.message,dataLength:data?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion

      if (error) {
        console.error("Supabase error:", error);
        console.error("Error details:", JSON.stringify(error, null, 2));
        throw error;
      }
      
      console.log("Clients loaded:", data?.length || 0);
      setClients(data || []);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0fda1414-4390-4855-9462-9c9a0cf71bf7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'clients/page.tsx:91',message:'Clients set in state',data:{clientsCount:data?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0fda1414-4390-4855-9462-9c9a0cf71bf7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'clients/page.tsx:93',message:'Error caught',data:{errorMessage:error instanceof Error?error.message:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      console.error("Error loading clients:", error);
      alert("Error al cargar clientes. Verifica la consola para más detalles.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const clientData = {
        user_id: user.id,
        name: formData.name,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        currency: formData.currency,
        default_rate: formData.default_rate
          ? parseFloat(formData.default_rate)
          : null,
        notes: formData.notes || null,
      };

      if (editingClient) {
        const { error } = await supabase
          .from("clients")
          .update(clientData)
          .eq("id", editingClient.id);

        if (error) throw error;
      } else {
        const { data: insertedData, error } = await supabase
          .from("clients")
          .insert(clientData)
          .select();
        
        if (error) {
          console.error("Error inserting client:", error);
          console.error("Error details:", JSON.stringify(error, null, 2));
          throw error;
        }
        
        console.log("Client inserted:", insertedData);
      }

      // Cerrar diálogo y resetear formulario primero
      setIsDialogOpen(false);
      resetForm();
      
      // Recargar clientes después de un pequeño delay para asegurar que el diálogo se cierre
      setTimeout(() => {
        loadClients();
      }, 100);
    } catch (error) {
      console.error("Error saving client:", error);
      alert("Error al guardar el cliente");
    }
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      currency: client.currency,
      default_rate: client.default_rate?.toString() || "",
      notes: client.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este cliente?")) return;

    try {
      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", id);

      if (error) throw error;
      loadClients();
    } catch (error) {
      console.error("Error deleting client:", error);
      alert("Error al eliminar el cliente");
    }
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
    });
    setEditingClient(null);
  };

  if (loading) {
    return <div>Cargando...</div>;
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
              // Si se cierra el diálogo, resetear el formulario
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
          <DialogContent className="max-w-2xl">
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
                  {editingClient ? "Actualizar" : "Crear"}
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
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(client.id)}
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
                    <strong>Tarifa:</strong> {client.default_rate}{" "}
                    {client.currency}/h
                  </p>
                )}
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
