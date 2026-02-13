"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Save, Building2, ShieldCheck, Upload, Image as ImageIcon, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getUserFiscalSettings, updateUserFiscalSettings } from "@/lib/actions/user-settings";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { createClientComponentClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [uploading, setUploading] = useState(false);
    const { toast } = useToast();
    const supabase = createClientComponentClient();

    const [formData, setFormData] = useState({
        business_name: "Lucas Loyola",
        tax_id: "",
        legal_address: "",
        tax_condition: "",
        gross_income: "",
        activity_start_date: "",
        logo_url: "/logo-lucas-loyola.svg",
        phone: "",
        email: "",
    });

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const settings = await getUserFiscalSettings();
            if (settings) {
                const logoUrl = settings.logo_url && settings.logo_url.trim() !== "" 
                    ? settings.logo_url 
                    : "/logo-lucas-loyola.svg";
                console.log("Loading settings, logo_url:", logoUrl);
                setFormData({
                    business_name: settings.business_name || "Lucas Loyola",
                    tax_id: settings.tax_id || "",
                    legal_address: settings.legal_address || "",
                    tax_condition: settings.tax_condition || "",
                    gross_income: settings.gross_income || "",
                    activity_start_date: settings.activity_start_date 
                        ? (() => {
                            // Asegurar que la fecha se lea como fecha local (sin zona horaria)
                            const date = new Date(settings.activity_start_date);
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            return `${year}-${month}-${day}`;
                        })()
                        : "",
                    logo_url: logoUrl,
                    phone: settings.phone || "",
                    email: settings.email || "",
                });
            } else {
                // Si no hay configuración, usar valores por defecto del branding
                console.log("No settings found, using defaults");
                setFormData({
                    business_name: "Lucas Loyola",
                    tax_id: "",
                    legal_address: "",
                    tax_condition: "",
                    gross_income: "",
                    activity_start_date: "",
                    logo_url: "/logo-lucas-loyola.svg",
                    phone: "",
                    email: "",
                });
            }
        } catch (error) {
            console.error("Error loading settings:", error);
            // En caso de error, asegurar que el logo por defecto esté presente
            setFormData(prev => ({
                ...prev,
                logo_url: "/logo-lucas-loyola.svg"
            }));
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        startTransition(async () => {
            try {
                const result = await updateUserFiscalSettings(formData);
                if (!result.success) {
                    toast({
                        title: "Error",
                        description: result.error,
                        variant: "destructive",
                    });
                    return;
                }

                toast({
                    title: "Configuración guardada",
                    description: "Tus datos fiscales se actualizaron correctamente.",
                });
            } catch (error: any) {
                toast({
                    title: "Error",
                    description: "Ocurrió un error al guardar la configuración.",
                    variant: "destructive",
                });
            }
        });
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
            const filePath = `user-logos/${fileName}`;

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
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold">Configuración de Cuenta</h1>
                <p className="text-muted-foreground">
                    Configura tus datos fiscales como emisor de facturas
                </p>
            </div>

            <form onSubmit={handleSubmit}>
                <Card className="border-primary/20">
                    <CardHeader className="bg-primary/5">
                        <CardTitle className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-primary" />
                            Datos Fiscales del Emisor
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                        {/* Logo */}
                        <div className="flex flex-col items-center gap-4 py-4 bg-muted/30 rounded-lg border border-dashed border-border/50">
                            <div className="relative w-32 h-32 rounded-lg overflow-hidden border bg-background group">
                                {(() => {
                                    const logoUrl = formData.logo_url || "/logo-lucas-loyola.svg";
                                    console.log("Rendering logo with URL:", logoUrl);
                                    return (
                                        <>
                                            {logoUrl.endsWith('.svg') ? (
                                                <img
                                                    src={logoUrl}
                                                    alt="Logo Preview"
                                                    className="w-full h-full object-contain p-4"
                                                    onLoad={() => console.log("Logo loaded successfully:", logoUrl)}
                                                    onError={(e) => {
                                                        console.error("Error loading logo:", logoUrl);
                                                        e.currentTarget.src = "/logo-lucas-loyola.svg";
                                                    }}
                                                />
                                            ) : (
                                                <img
                                                    src={logoUrl}
                                                    alt="Logo Preview"
                                                    className="w-full h-full object-contain p-2"
                                                    onLoad={() => console.log("Logo loaded successfully:", logoUrl)}
                                                    onError={(e) => {
                                                        console.error("Error loading logo:", logoUrl);
                                                        e.currentTarget.src = "/logo-lucas-loyola.svg";
                                                    }}
                                                />
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, logo_url: "/logo-lucas-loyola.svg" })}
                                                className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity text-white"
                                                disabled={isPending || uploading}
                                                title="Restaurar logo por defecto"
                                            >
                                                <X className="h-6 w-6" />
                                            </button>
                                        </>
                                    );
                                })()}
                            </div>
                            <div className="flex flex-col items-center gap-2 px-6 text-center">
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setFormData({ ...formData, logo_url: "/logo-lucas-loyola.svg" })}
                                        disabled={isPending || uploading || formData.logo_url === "/logo-lucas-loyola.svg"}
                                    >
                                        Usar Logo por Defecto
                                    </Button>
                                    <Label
                                        htmlFor="logo-upload"
                                        className={cn(
                                            "flex items-center gap-2 px-4 py-2 rounded-md bg-background border shadow-sm cursor-pointer hover:bg-muted transition-colors text-sm",
                                            uploading && "opacity-50 pointer-events-none"
                                        )}
                                    >
                                        <Upload className="h-4 w-4" />
                                        {uploading ? "Cargando..." : "Subir Logo"}
                                        <input
                                            id="logo-upload"
                                            type="file"
                                            accept="image/*,.svg"
                                            className="hidden"
                                            onChange={handleUploadLogo}
                                            disabled={uploading || isPending}
                                        />
                                    </Label>
                                </div>
                                <p className="text-[10px] text-muted-foreground">PNG, JPG o SVG. Máx 2MB. O usa el logo por defecto.</p>
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="business_name">Razón Social / Nombre Comercial *</Label>
                            <Input
                                id="business_name"
                                value={formData.business_name}
                                onChange={(e) =>
                                    setFormData({ ...formData, business_name: e.target.value })
                                }
                                placeholder="Mi Empresa SRL"
                                required
                                disabled={isPending}
                            />
                            <p className="text-xs text-muted-foreground">
                                Nombre legal que aparecerá en las facturas como emisor
                            </p>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="tax_id">CUIT / CUIL *</Label>
                            <Input
                                id="tax_id"
                                value={formData.tax_id}
                                onChange={(e) =>
                                    setFormData({ ...formData, tax_id: e.target.value })
                                }
                                placeholder="20-12345678-9"
                                required
                                disabled={isPending}
                            />
                            <p className="text-xs text-muted-foreground">
                                CUIT o CUIL del emisor (requerido para facturas electrónicas AFIP)
                            </p>
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
                            <p className="text-xs text-muted-foreground">
                                Dirección fiscal que aparecerá en las facturas
                            </p>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="tax_condition">Condición frente al IVA *</Label>
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
                            <p className="text-xs text-muted-foreground">
                                Condición fiscal del emisor
                            </p>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="gross_income">Ingresos Brutos</Label>
                            <Select
                                value={formData.gross_income}
                                onValueChange={(value) =>
                                    setFormData({ ...formData, gross_income: value })
                                }
                                disabled={isPending}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar condición" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Exento">Exento</SelectItem>
                                    <SelectItem value="Local">Local</SelectItem>
                                    <SelectItem value="Convenio Multilateral">Convenio Multilateral</SelectItem>
                                    <SelectItem value="No Inscripto">No Inscripto</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Condición de Ingresos Brutos según AFIP
                            </p>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="activity_start_date">Fecha de Inicio de Actividades</Label>
                            <Input
                                id="activity_start_date"
                                type="date"
                                value={formData.activity_start_date}
                                onChange={(e) =>
                                    setFormData({ ...formData, activity_start_date: e.target.value })
                                }
                                disabled={isPending}
                            />
                            <p className="text-xs text-muted-foreground">
                                Fecha en que comenzaste tus actividades comerciales
                            </p>
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
                                    placeholder="contacto@miempresa.com"
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
                                    placeholder="+54 11 1234-5678"
                                    disabled={isPending}
                                />
                            </div>
                        </div>

                        <div className="pt-4 border-t">
                            <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
                                {isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Save className="mr-2 h-4 w-4" />
                                        Guardar Configuración
                                    </>
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </form>
        </div>
    );
}
