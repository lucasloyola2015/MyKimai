"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  clientSelectionLabel,
  toggleSelectedId,
  type SelectableClient,
} from "@/lib/utils/client-selection";

/**
 * Desplegable de clientes con casillas: todos (lista vacía), uno o varios.
 * El botón se ve como un `SelectTrigger` para que combine con los otros filtros.
 */
export function ClientMultiSelect({
  id,
  clients,
  value,
  onChange,
}: {
  id?: string;
  clients: SelectableClient[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const allSelected = value.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          className="flex min-h-[44px] h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 touch-manipulation"
        >
          <span className="line-clamp-1 text-left">{clientSelectionLabel(value, clients)}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[14rem] p-1"
      >
        <div className="max-h-72 overflow-y-auto">
          <label
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
              allSelected && "font-medium"
            )}
          >
            <Checkbox checked={allSelected} onCheckedChange={() => onChange([])} />
            Todos los clientes
          </label>
          <div className="my-1 h-px bg-border" />
          {clients.map((client) => (
            <label
              key={client.id}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <Checkbox
                checked={value.includes(client.id)}
                onCheckedChange={() => onChange(toggleSelectedId(value, client.id))}
              />
              <span className="line-clamp-1">{client.name}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
