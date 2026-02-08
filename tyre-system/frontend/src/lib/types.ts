// ============================================================
// Domain Types for Tyre Sales & Inventory Management System
// ============================================================

export type PaymentMethod = 'Cash' | 'Mukuru' | 'Card';
export type TyreCategory = 'branded_new' | 'brandless_new' | 'second_hand';
export type LossType = 'broken' | 'exchange' | 'refund';
export type UserRole = 'admin' | 'operator';
export type SyncDirection = 'import' | 'export';
export type SyncStatus = 'success' | 'failed' | 'partial';

// --- Core Entities ---

export interface Tyre {
  id: number;
  size: string;
  type: string;
  brand: string;
  pattern: string;
  li_sr: string;
  tyre_cost: number;
  suggested_price: number;
  category: TyreCategory;
  excel_row: number | null;
}

export interface TyreWithStock extends Tyre {
  remaining_stock: number;
  initial_stock: number;
  added_stock: number;
  total_sold: number;
}

export interface Sale {
  id: number;
  sale_date: string;
  tyre_id: number;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
  payment_method: PaymentMethod;
  customer_name: string;
  synced: boolean;
  created_at: string;
  tyre_size?: string;
  tyre_brand?: string;
  tyre_type?: string;
}

export interface SaleCreate {
  sale_date: string;
  tyre_id: number;
  quantity: number;
  unit_price: number;
  discount: number;
  payment_method: PaymentMethod;
  customer_name: string;
}

export interface Payment {
  id: number;
  payment_date: string;
  customer: string;
  payment_method: PaymentMethod;
  amount_mwk: number;
}

export interface PaymentCreate {
  payment_date: string;
  customer: string;
  payment_method: PaymentMethod;
  amount_mwk: number;
}

export interface Loss {
  id: number;
  loss_date: string;
  tyre_id: number;
  quantity: number;
  loss_type: LossType;
  refund_amount: number;
  notes: string | null;
  tyre_size?: string;
  tyre_brand?: string;
}

export interface LossCreate {
  loss_date: string;
  tyre_id: number;
  quantity: number;
  loss_type: LossType;
  refund_amount: number;
  notes: string;
}

export interface InventoryItem {
  tyre_id: number;
  size: string;
  type: string;
  brand: string;
  pattern: string;
  category: TyreCategory;
  tyre_cost: number;
  suggested_price: number;
  year: number;
  month: number;
  initial_stock: number;
  added_stock: number;
  total_sold: number;
  total_loss: number;
  remaining_stock: number;
}

export interface User {
  id: number;
  username: string;
  role: UserRole;
}

export interface ExchangeRate {
  id: number;
  year: number;
  month: number;
  rate_type: string;
  rate: number;
}

export interface SyncLogEntry {
  id: number;
  file_path: string;
  direction: SyncDirection;
  status: SyncStatus;
  records_processed: number;
  file_hash: string;
  created_at: string;
}

export interface Setting {
  key: string;
  value: string;
}

// --- Dashboard / Summaries ---

export interface DailySummary {
  date: string;
  total_sold_today: number;
  total_sold_month: number;
  total_remaining: number;
  revenue_cash_mwk: number;
  revenue_mukuru_mwk: number;
  revenue_card_mwk: number;
  total_revenue_mwk: number;
}

export interface MonthlyStats {
  total_sold: number;
  total_revenue: number;
  profit_mwk: number;
  profit_cny: number;
  partner_share: number;
  sanyou_share: number;
}

export interface SalesTrendPoint {
  day: number;
  date: string;
  quantity: number;
  revenue: number;
}

export interface LowStockItem {
  tyre_id: number;
  size: string;
  brand: string;
  remaining_stock: number;
}

// --- API Envelope ---

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface Receivable {
  customer: string;
  total_sales: number;
  sale_count: number;
  total_paid: number;
  outstanding: number;
}

export interface ReceivablesData {
  year: number;
  month: number;
  receivables: Receivable[];
  total_outstanding: number;
}

// --- Filter / Query Params ---

export interface SalesFilter {
  start_date?: string;
  end_date?: string;
  payment_method?: PaymentMethod;
  tyre_id?: number;
  customer?: string;
  page?: number;
  limit?: number;
}

export interface InventoryFilter {
  year: number;
  month: number;
  category?: TyreCategory;
}
