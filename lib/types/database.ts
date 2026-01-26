export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type BillingType = "fixed" | "hourly";
export type ProjectStatus = "active" | "paused" | "completed" | "cancelled";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";
export type InvoiceItemType = "time" | "fixed";
export type AccessLevel = "read" | "read_write";

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          email: string | null;
          phone: string | null;
          address: string | null;
          currency: string;
          default_rate: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          currency?: string;
          default_rate?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          currency?: string;
          default_rate?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      projects: {
        Row: {
          id: string;
          client_id: string;
          name: string;
          description: string | null;
          currency: string;
          rate: number | null;
          billing_type: BillingType;
          status: ProjectStatus;
          start_date: string | null;
          end_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          name: string;
          description?: string | null;
          currency?: string;
          rate?: number | null;
          billing_type?: BillingType;
          status?: ProjectStatus;
          start_date?: string | null;
          end_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          name?: string;
          description?: string | null;
          currency?: string;
          rate?: number | null;
          billing_type?: BillingType;
          status?: ProjectStatus;
          start_date?: string | null;
          end_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      tasks: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          description: string | null;
          rate: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          description?: string | null;
          rate?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          description?: string | null;
          rate?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      time_entries: {
        Row: {
          id: string;
          user_id: string;
          task_id: string;
          description: string | null;
          start_time: string;
          end_time: string | null;
          duration_minutes: number | null;
          billable: boolean;
          rate_applied: number | null;
          amount: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          task_id: string;
          description?: string | null;
          start_time: string;
          end_time?: string | null;
          duration_minutes?: number | null;
          billable?: boolean;
          rate_applied?: number | null;
          amount?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          task_id?: string;
          description?: string | null;
          start_time?: string;
          end_time?: string | null;
          duration_minutes?: number | null;
          billable?: boolean;
          rate_applied?: number | null;
          amount?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      hour_packages: {
        Row: {
          id: string;
          client_id: string;
          project_id: string | null;
          hours: number;
          hours_used: number;
          price: number;
          currency: string;
          purchased_at: string;
          expires_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          project_id?: string | null;
          hours: number;
          hours_used?: number;
          price: number;
          currency?: string;
          purchased_at?: string;
          expires_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          project_id?: string | null;
          hours?: number;
          hours_used?: number;
          price?: number;
          currency?: string;
          purchased_at?: string;
          expires_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      invoices: {
        Row: {
          id: string;
          client_id: string;
          invoice_number: string;
          status: InvoiceStatus;
          subtotal: number;
          tax_rate: number | null;
          tax_amount: number | null;
          total_amount: number;
          currency: string;
          issue_date: string;
          due_date: string | null;
          paid_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          invoice_number?: string;
          status?: InvoiceStatus;
          subtotal?: number;
          tax_rate?: number | null;
          tax_amount?: number | null;
          total_amount?: number;
          currency?: string;
          issue_date?: string;
          due_date?: string | null;
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          invoice_number?: string;
          status?: InvoiceStatus;
          subtotal?: number;
          tax_rate?: number | null;
          tax_amount?: number | null;
          total_amount?: number;
          currency?: string;
          issue_date?: string;
          due_date?: string | null;
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      invoice_items: {
        Row: {
          id: string;
          invoice_id: string;
          time_entry_id: string | null;
          description: string;
          quantity: number;
          rate: number;
          amount: number;
          type: InvoiceItemType;
          created_at: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          time_entry_id?: string | null;
          description: string;
          quantity: number;
          rate: number;
          amount: number;
          type?: InvoiceItemType;
          created_at?: string;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          time_entry_id?: string | null;
          description?: string;
          quantity?: number;
          rate?: number;
          amount?: number;
          type?: InvoiceItemType;
          created_at?: string;
        };
      };
      client_users: {
        Row: {
          id: string;
          client_id: string;
          email: string;
          user_id: string | null;
          access_level: AccessLevel;
          invited_at: string;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          email: string;
          user_id?: string | null;
          access_level?: AccessLevel;
          invited_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          email?: string;
          user_id?: string | null;
          access_level?: AccessLevel;
          invited_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
      };
    };
  };
}
