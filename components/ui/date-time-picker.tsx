"use client";

import * as React from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatTime24 } from "@/lib/date-format";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DateTimePickerProps {
  date: Date | null;
  onDateChange: (date: Date | null) => void;
  label?: string;
  required?: boolean;
  className?: string;
}

export function DateTimePicker({
  date,
  onDateChange,
  label,
  required,
  className,
}: DateTimePickerProps) {
  const [timeValue, setTimeValue] = React.useState(
    date ? formatTime24(date) : ""
  );

  React.useEffect(() => {
    if (date) {
      setTimeValue(formatTime24(date));
    } else {
      setTimeValue("");
    }
  }, [date]);

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) {
      onDateChange(null);
      return;
    }

    // Si ya hay una hora seleccionada, mantenerla
    if (timeValue) {
      const [hours, minutes] = timeValue.split(":").map(Number);
      const newDate = new Date(selectedDate);
      newDate.setHours(hours || 0, minutes || 0, 0, 0);
      onDateChange(newDate);
    } else {
      // Si no hay hora, usar la hora actual
      const newDate = new Date(selectedDate);
      const now = new Date();
      newDate.setHours(now.getHours(), now.getMinutes(), 0, 0);
      onDateChange(newDate);
      setTimeValue(formatTime24(newDate));
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = e.target.value;
    setTimeValue(time);

    if (date && time) {
      const [hours, minutes] = time.split(":").map(Number);
      const newDate = new Date(date);
      newDate.setHours(hours || 0, minutes || 0, 0, 0);
      onDateChange(newDate);
    }
  };

  return (
    <div className={cn("grid gap-2", className)}>
      {label && (
        <Label>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      <div className="flex gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "flex-1 justify-start text-left font-normal",
                !date && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date ? (
                format(date, "dd/MM/yyyy", { locale: es })
              ) : (
                <span>Seleccionar fecha</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date || undefined}
              onSelect={handleDateSelect}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <div className="relative flex items-center">
          <Clock className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="time"
            value={timeValue}
            onChange={handleTimeChange}
            className="pl-10 w-32"
            placeholder="HH:mm"
            title="Hora en formato 24h (ej: 14:30)"
            aria-description="Formato 24 horas"
          />
        </div>
      </div>
    </div>
  );
}
