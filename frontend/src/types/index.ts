export interface UserSession {
  ok: boolean;
  username: string;
  role: 'admin' | 'design';
  csrf: string;
}

export interface Attachment {
  id: number;
  filename: string;
  kind: 'reference' | 'preview' | 'cdr';
  size: number;
  uploaded_at?: string;
}

export interface ProductionProgress {
  stage: string;
  progress: number;
  note?: string;
  updated_at?: string;
}

export interface Job {
  id: number;
  spk: string;
  customer: string;
  customer_code?: string; // Hidden from design role
  product: string;
  qty: number;
  hpp_unit?: number; // Hidden from design role
  status: 'MENUNGGU' | 'PROSES' | 'REVISI' | 'SELESAI';
  priority: 'NORMAL' | 'URGENT';
  deadline: string;
  designer: string;
  computer: string;
  note: string;
  production: ProductionProgress;
  attachments: Attachment[];
  created_at: string;
}

export interface JobMessage {
  id: number;
  job_id: number;
  sender: string;
  body: string;
  created_at: string;
}

export interface TrackingStep {
  id: number;
  job_id: number;
  stage: string;
  progress: number;
  note?: string;
  created_at: string;
}

export interface RawMaterial {
  id: number;
  name: string;
  unit: string;
  cost_per_unit: number;
}

export interface OrderTypeMaterial {
  raw_material_id: number;
  raw_material_name?: string;
  qty_required: number;
  cost_per_unit?: number;
  unit?: string;
}

export interface OrderType {
  id: number;
  name: string;
  selling_price: number;
  materials: OrderTypeMaterial[];
  total_hpp?: number;
}

export interface InvoiceItem {
  id?: number;
  name: string;
  qty: number;
  price: number;
  total: number;
}

export interface PaymentRecord {
  id: number;
  invoice_id: number;
  receipt_no: string;
  amount: number;
  payment_date: string;
  method: string;
  note?: string;
}

export interface Invoice {
  id: number;
  invoice_no: string;
  job_id?: number | null;
  customer: string;
  customer_phone?: string;
  customer_address?: string;
  invoice_date: string;
  due_date: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  shipping_cost: number;
  total: number;
  paid: number;
  balance: number;
  payment_status: 'BELUM_BAYAR' | 'DP' | 'LUNAS';
  payments?: PaymentRecord[];
  latest_payment?: {
    date: string;
    method: string;
    amount: number;
  };
}

export interface CashflowExpense {
  id: number;
  description: string;
  category: string;
  amount: number;
  expense_date: string;
  job_id?: number | null;
  created_at?: string;
}

export interface CashflowSummary {
  income: number;
  expenses: number;
  balance: number;
}

export interface CashflowSpk {
  id: number;
  spk: string;
  customer: string;
  product: string;
  qty: number;
  total_income: number;
  total_hpp: number;
  profit: number;
  profit_percentage: number;
}

export interface CashflowTransaction {
  id: string;
  date: string;
  type: 'INCOME' | 'EXPENSE';
  category: string;
  description: string;
  amount: number;
  reference_no?: string;
}

export interface CatalogMediaItem {
  id: number;
  filename: string;
  mime: string;
  media_type: 'image' | 'video';
  size: number;
  url: string;
}

export interface CatalogProductMedia {
  id: number;
  url: string;
  is_primary?: boolean;
}

export interface CatalogProduct {
  id: number;
  name: string;
  slug: string;
  order_type_id?: number | null;
  category: string;
  category_name?: string;
  price: number;
  short_description?: string;
  description?: string;
  status: string;
  badge?: string;
  collection?: string;
  display_order?: number;
  featured?: boolean;
  min_order?: number;
  production_days?: number;
  sizes?: string[];
  materials?: Array<{ id: number; name: string; unit?: string; note?: string }>;
  specifications?: string;
  cover?: CatalogMediaItem | null;
  gallery?: CatalogMediaItem[];
  media?: CatalogProductMedia[];
  is_published?: boolean;
  sort_order?: number;
}

export interface WebsiteSettings {
  brand_name?: string;
  hero_title?: string;
  hero_text?: string;
  catalog_title?: string;
  whatsapp?: string;
  address?: string;
  instagram?: string;
  primary_color?: string;
  background_color?: string;
  show_about?: boolean;
  about_kicker?: string;
  about_title?: string;
  about_text?: string;
  about_background?: CatalogMediaItem | null;
  nav_background?: CatalogMediaItem | null;
  background?: CatalogMediaItem | null;
  logo?: CatalogMediaItem | null;
  hero_media?: CatalogMediaItem[];
  hero_interval_seconds?: number;
  show_order_ticker?: boolean;
  ticker_label?: string;
  show_prices?: boolean;
  header_media?: Array<{ id: number; url: string; kind?: string }>;
  about_photo?: { id?: number; url: string };
}

export interface MarketingSummary {
  posts_count: number;
  ads_budget: number;
  pending_approval: number;
  connected_platforms: number;
}

export interface MarketingPost {
  id: number;
  title: string;
  caption: string;
  platform: string;
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'SCHEDULED' | 'PUBLISHED';
  scheduled_at?: string;
  hashtags?: string;
  media_id?: number;
  media_url?: string;
}

export interface MarketingAd {
  id: number;
  campaign_name: string;
  platform: string;
  budget: number;
  status: 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'COMPLETED';
  start_date: string;
  end_date: string;
}
