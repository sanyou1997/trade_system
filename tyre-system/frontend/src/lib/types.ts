// ============================================================
// Domain Types for Tyre Sales & Inventory Management System
// ============================================================

export type PaymentMethod = 'Cash' | 'Mukuru' | 'Card';
export type TyreCategory = 'branded_new' | 'brandless_new' | 'second_hand';
export type LossType = 'broken' | 'exchange' | 'refund';
export type UserRole = 'admin' | 'operator';
export type SyncDirection = 'import' | 'export';
export type SyncStatus = 'success' | 'failed' | 'partial';
export type ProductType = 'tyre' | 'phone';

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
  product_type: ProductType;
}

export interface PaymentCreate {
  payment_date: string;
  customer: string;
  payment_method: PaymentMethod;
  amount_mwk: number;
  product_type: ProductType;
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

// --- Phone Entities ---

export interface Phone {
  id: number;
  brand: string;
  model: string;
  config: string;
  note: string | null;
  cost: number;
  cash_price: number;
  mukuru_price: number;
  online_price: number;
  status: string | null;
  excel_row: number | null;
}

export interface PhoneWithStock extends Phone {
  remaining_stock: number;
  initial_stock: number;
  added_stock: number;
  total_sold: number;
}

export interface PhoneSale {
  id: number;
  sale_date: string;
  phone_id: number;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
  payment_method: PaymentMethod;
  customer_name: string;
  synced: boolean;
  created_at: string;
  phone_brand?: string;
  phone_model?: string;
  phone_config?: string;
}

export interface PhoneSaleCreate {
  sale_date: string;
  phone_id: number;
  quantity: number;
  unit_price: number;
  discount: number;
  payment_method: PaymentMethod;
  customer_name: string;
}

export interface PhoneSalesFilter {
  start_date?: string;
  end_date?: string;
  payment_method?: PaymentMethod;
  phone_id?: number;
  customer?: string;
  page?: number;
  limit?: number;
}

export interface PhoneInventoryItem {
  phone_id: number;
  brand: string;
  model: string;
  config: string;
  note: string | null;
  cost: number;
  cash_price: number;
  mukuru_price: number;
  online_price: number;
  status: string | null;
  year: number;
  month: number;
  initial_stock: number;
  added_stock: number;
  total_sold: number;
  total_loss: number;
  remaining_stock: number;
}

export interface PhoneLoss {
  id: number;
  loss_date: string;
  phone_id: number;
  quantity: number;
  loss_type: LossType;
  refund_amount: number;
  notes: string | null;
  phone_brand?: string;
  phone_model?: string;
}

export interface PhoneLossCreate {
  loss_date: string;
  phone_id: number;
  quantity: number;
  loss_type: LossType;
  refund_amount: number;
  notes: string;
}

// --- Stock Import Types ---

export interface ImportPreviewItem {
  row_number: number;
  brand: string;
  model: string;
  config: string;
  quantity: number;
  matched: boolean;
  phone_id: number | null;
  current_added_stock: number | null;
}

export interface ImportPreviewResult {
  file_name: string;
  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  total_quantity: number;
  items: ImportPreviewItem[];
  all_matched: boolean;
}

export interface ImportConfirmItem {
  phone_id: number;
  quantity: number;
  brand: string;
  model: string;
  config: string;
}

export interface StockImportLogEntry {
  id: number;
  product_type: string;
  year: number;
  month: number;
  file_name: string;
  total_quantity: number;
  total_products: number;
  status: 'active' | 'reverted';
  reverted_at: string | null;
  created_at: string;
}

// --- Tyre Stock Import Types ---

export interface TyreImportPreviewItem {
  row_number: number;
  size: string;
  type_: string;
  brand: string;
  pattern: string;
  li_sr: string;
  tyre_cost: number;
  suggested_price: number;
  quantity: number;
  matched: boolean;
  tyre_id: number | null;
  current_added_stock: number | null;
}

export interface TyreImportPreviewResult {
  file_name: string;
  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  total_quantity: number;
  items: TyreImportPreviewItem[];
  all_matched: boolean;
}

export interface TyreImportConfirmItem {
  tyre_id: number | null;
  quantity: number;
  create_new: boolean;
  size: string;
  type_: string;
  brand: string;
  pattern: string;
  li_sr: string;
  tyre_cost: number;
  suggested_price: number;
  category: string;
}

// --- Audit / Cost Types ---

export type TransactionType = 'expense' | 'transfer' | 'exchange' | 'income';

export interface AuditAccount {
  id: number;
  name: string;
  description: string | null;
  initial_balance: number;
  is_default: boolean;
  created_at: string;
}

export interface AuditAccountCreate {
  name: string;
  description?: string;
  initial_balance: number;
  is_default: boolean;
}

export interface AuditAccountUpdate {
  name?: string;
  description?: string;
  initial_balance?: number;
  is_default?: boolean;
}

export interface AccountBalance {
  id: number;
  name: string;
  description: string | null;
  initial_balance: number;
  is_default: boolean;
  prev_balance: number;
  has_override: boolean;
  auto_revenue: number;
  manual_income: number;
  total_expenses: number;
  total_exchanges: number;
  transfers_in: number;
  transfers_out: number;
  calculated_balance: number;
}

export interface RevenueBreakdown {
  tyre_cash: number;
  tyre_mukuru: number;
  tyre_card: number;
  tyre_total: number;
  phone_cash: number;
  phone_mukuru: number;
  phone_card: number;
  phone_total: number;
  grand_total: number;
}

export interface AuditTransaction {
  id: number;
  transaction_type: TransactionType;
  transaction_date: string;
  description: string | null;
  amount_mwk: number;
  note: string | null;
  account_id: number | null;
  receipt_info: string | null;
  receipt_image: string | null;
  from_account_id: number | null;
  to_account_id: number | null;
  exchange_rate: number | null;
  amount_cny: number | null;
  created_at: string;
  account_name: string | null;
  from_account_name: string | null;
  to_account_name: string | null;
}

export interface ExpenseCreate {
  transaction_date: string;
  description: string;
  amount_mwk: number;
  account_id: number;
  receipt_info?: string;
  note?: string;
}

export interface TransferCreate {
  transaction_date: string;
  amount_mwk: number;
  from_account_id: number;
  to_account_id: number;
  description?: string;
  note?: string;
}

export interface ExchangeCreate {
  transaction_date: string;
  amount_mwk: number;
  exchange_rate: number;
  amount_cny: number;
  account_id: number;
  description?: string;
  note?: string;
}

export interface IncomeCreate {
  transaction_date: string;
  description: string;
  amount_mwk: number;
  account_id: number;
  note?: string;
}

export interface AuditImportResult {
  expenses_imported: number;
  exchanges_imported: number;
  skipped: number;
  errors: string[];
}
