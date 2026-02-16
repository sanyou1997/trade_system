# Tyre Sales & Inventory Management System

## Project Overview

A web-based system for a tyre business in Malawi (~48 SKUs) that automates daily sales recording, inventory tracking, and reporting. Replaces manual Excel-based workflow while maintaining bidirectional Excel synchronization with the business partner.

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy 2.0 (async) + SQLite (WAL mode)
  - Local dev: Python 3.14 | Docker: Python 3.12-slim
- **Frontend**: Next.js 14 (App Router) + React 18 + Tailwind CSS + Recharts + TanStack Query
- **Excel Engine**: openpyxl (formula-preserving read/write)
- **Auth**: Session-based (in-memory, cookie), bcrypt password hashing
- **Deployment**: Docker Compose (backend + frontend, no nginx — use host nginx)

## Directory Structure

```
E:\Yongxing\tyre-system\
├── backend\
│   ├── app\
│   │   ├── main.py              # FastAPI entry, lifespan, CORS, router registration
│   │   ├── config.py            # Settings with env var overrides
│   │   ├── database.py          # Async SQLAlchemy engine, session factory, init_db
│   │   ├── models\              # 9 SQLAlchemy ORM models
│   │   ├── schemas\             # Pydantic request/response schemas
│   │   ├── routers\             # 9 API route modules
│   │   ├── services\            # Business logic (sale, inventory, dashboard)
│   │   ├── excel\               # Excel sync engine (config, reader, writer, mapper, sync)
│   │   └── utils\               # auth, currency, date_helpers
│   ├── Dockerfile
│   ├── .dockerignore
│   └── requirements.txt
├── frontend\
│   ├── src\
│   │   ├── app\                 # 10 Next.js pages
│   │   ├── components\          # layout/ (4) + ui/ (10)
│   │   ├── lib\                 # api.ts, types.ts, utils.ts
│   │   └── hooks\               # 7 custom hook modules
│   ├── Dockerfile               # Multi-stage (deps → build → runner)
│   ├── .dockerignore
│   ├── next.config.mjs          # output: 'standalone'
│   └── package.json
├── data\
│   └── tyre_system.db           # SQLite database (WAL mode)
├── scripts\
│   ├── start.bat                # Local dev: start backend + frontend
│   ├── backup.bat               # Backup DB + Excel files
│   └── initial_import.py        # Import Excel data into DB
├── docker-compose.yml
└── .gitignore
```

## Database Schema (9 tables)

| Table | Key Fields | Notes |
|-------|-----------|-------|
| **tyres** | id, size, type_, brand, pattern, li_sr, tyre_cost, suggested_price, category, excel_row | SKU master, ~48 records |
| **inventory_periods** | id, tyre_id (FK), year, month, initial_stock, added_stock | Unique: (tyre_id, year, month) |
| **sales** | id, sale_date, tyre_id (FK), quantity, unit_price, discount, total, payment_method, customer_name, synced | discount is percentage (e.g. 5 = 5%) |
| **payments** | id, payment_date, customer, payment_method, amount_mwk | |
| **losses** | id, loss_date, tyre_id (FK), quantity, loss_type, refund_amount, notes | loss_type: broken/exchange/refund |
| **users** | id, username, password_hash, role, is_active | role: admin/operator |
| **exchange_rates** | id, year, month, rate_type, rate | rate_type: mukuru/cash |
| **sync_log** | id, file_path, direction, status, records_processed, error_message, file_hash | Audit trail |
| **settings** | key (PK), value | Key-value store (cash_rate, mukuru_rate, etc.) |

### Tyre Categories
- `branded_new`: TERAFLEX, DOUBLESTAR, ZEXTOUR, SPORTRAK
- `brandless_new`: No brand
- `second_hand`: Used tyres

## API Endpoints (all under `/api/v1`)

### Auth (`routers/auth.py`)
- `POST /auth/login` — Set session cookie
- `POST /auth/logout` — Clear cookie
- `GET /auth/me` — Current user info

### Sales (`routers/sales.py` + `services/sale_service.py`)
- `POST /sales` — Create sale (validates stock, computes total)
- `POST /sales/bulk` — Create multiple sales
- `GET /sales` — List with filters (date range, payment_method, tyre_id, customer, pagination)
- `GET /sales/daily/{date}` — Sales for specific date
- `GET /sales/monthly/{year}/{month}` — Sales for month
- `DELETE /sales/{id}` — Delete sale

### Inventory (`routers/inventory.py` + `services/inventory_service.py`)
- `GET /inventory/{year}/{month}` — All tyres with remaining = initial + added - sold - lost
- `PUT /inventory/stock` — Update initial_stock or added_stock
- `GET /inventory/low-stock` — Items with remaining < threshold (default 5)
- `POST /inventory/rollover` — Roll remaining → next month's initial

### Dashboard (`routers/dashboard.py` + `services/dashboard_service.py`)
- `GET /dashboard/daily-summary/{date}` — Today sold, month sold, remaining, revenue by method
- `GET /dashboard/wechat-message/{date}` — Formatted WeChat summary text
- `GET /dashboard/monthly-stats/{year}/{month}` — Full stats with profit split (40/60)
- `GET /dashboard/sales-trend/{year}/{month}` — Daily quantities for chart

### Tyres (`routers/tyres.py`)
- `GET /tyres` — List all
- `GET /tyres/with-stock` — List with current stock (year, month params)
- `GET /tyres/{id}` | `POST /tyres` | `PUT /tyres/{id}` | `DELETE /tyres/{id}`

### Payments (`routers/payments.py`)
- `GET /payments` — List (year, month filters)
- `GET /payments/receivables/{year}/{month}` — Per-customer receivables (outstanding balance)
- `GET /payments/totals/{year}/{month}` — Totals by payment method
- `POST /payments` | `DELETE /payments/{id}`

### Losses (`routers/losses.py`)
- `GET /losses` — List (year, month filters)
- `POST /losses` | `DELETE /losses/{id}`

### Sync (`routers/sync.py`)
- `POST /sync/import/inventory` — Import from inventory Excel
- `POST /sync/import/invoice` — Import from invoice Excel
- `POST /sync/import/daily-sales` — Import from daily sales Excel (file upload)
- `POST /sync/export/inventory` — Export to inventory Excel
- `POST /sync/export/invoice` — Export to invoice Excel
- `GET /sync/download/inventory` | `GET /sync/download/invoice` — Download Excel files
- `GET /sync/history` — Last 50 sync operations

### Settings (`routers/settings.py`)
- `GET /settings` | `PUT /settings` — Key-value settings
- `GET /settings/exchange-rates` | `PUT /settings/exchange-rates` — Exchange rates
- `PUT /settings/cash-rate` — Update cash rate + auto-recalculate all tyre prices (rounded to nearest 1000 MWK)

## Frontend Pages

| Route | Page | Key Features |
|-------|------|-------------|
| `/login` | Login | Username/password form |
| `/dashboard` | Dashboard | 4 stat cards, WeChat summary (copy button), sales trend bar chart, revenue pie chart, low stock alerts, recent sales |
| `/sales/new` | Record Sale | Searchable tyre selector (by size/brand/type), auto-fill price, discount, payment method, today's sales panel |
| `/sales` | Sales History | Date range/payment/customer filters, paginated table, totals row, admin delete |
| `/inventory` | Inventory | Month selector, category/brand filters, sortable columns, color-coded stock levels, inline editing (admin), loss column |
| `/payments` | Payments | Record form with customer autocomplete from receivables, monthly totals by method, unpaid receivables alert |
| `/losses` | Losses | Record form (broken/exchange/refund), monthly loss table with type badges |
| `/sync` | Excel Sync | Import/export buttons for inventory + invoice + daily sales, file upload, sync history |
| `/settings` | Settings | Mukuru/cash rate config (cash rate triggers price recalculation with confirmation), user management (admin) |

## Excel File Formats

### Inventory: `Tyre_List_Internal_Available.xlsx`

- 12 monthly sheets: `"Tyre List_1月"` through `"Tyre List_12月"`
- **Two layouts** (column positions differ):
  - **NEW layout**: months 1, 2, 3, 4, 5, 6, 7, 11, 12
  - **OLD layout**: months 8, 9, 10 (different column mapping)
- Row ranges:
  - Rows 2–46: Tyre data (~45 branded + brandless SKUs)
  - Row 47: Total row
  - Rows 48–50: Brandless extras
  - Row 51: Grand Total
  - Row 54: Exchange rate (column I)
- **FORMULA COLUMNS (1-indexed): {7, 8, 9, 10, 11} = G, H, I, J, K — NEVER OVERWRITE**
  - G = After Delivery & Duty COST (formula)
  - H = QTY remaining (formula: =M+N-SUM(O:AS))
  - I = Suggested Price (formula)
  - J = formula column
  - K = Total Sold (formula: =SUM(O:AS))
- Safe to write: M (initial stock), N (added stock), O–AS (daily sales days 1–31)

### Invoice: `Invoice_Tyres_YYYY.M.xlsx`

- Sheet "Sales Record": Date, Brand, Type, Size, Qty, Unit Price, Discount, Total, Payment Method, Customer
- Sheet "Statistic": Mukuru Rate (row 2, col I), Cash Rate (row 3, col I), profit split 40%/60%
- Sheet "Payment Record": Date, Customer, Payment Method, MWK
- Sheet "Loss": Damaged/exchanged/refunded items
- Sheet "Broken Stock": Permanently damaged inventory

### Daily Sales: `Tyre Sales DD Mon.xlsx`

- Sheet "Sales Record": row 1 = "Invoice", row 2 = headers, row 3+ = data
- Sheet "Payment Record": Payment records for the day

## Business Logic

### Cash Rate ↔ Price Linkage
- `PUT /settings/cash-rate` with `{ new_rate }` recalculates all tyre `suggested_price` values
- Formula: `new_price = round_to_1000(old_price / old_rate * new_rate)`
- Rounding: standard half-up to nearest 1,000 MWK (hundreds/tens/ones always 0)
- Default cash rate: 590

### Profit Split
- Partner: 40% | Sanyou: 60%
- Based on CNY conversion using monthly exchange rates (separate Mukuru/Cash rates)

### Inventory Rollover
- Previous month's remaining stock → next month's initial stock
- Auto-triggered on startup via `_fix_inventory_rollover()`
- Manual trigger: `POST /inventory/rollover`

### Stock Calculation
- `remaining = initial_stock + added_stock - total_sold - total_loss`

## Deployment

### Docker (Production/Staging)
```yaml
# docker-compose.yml — no nginx (use host nginx)
services:
  backend:  port 8001:8000, image python:3.12-slim
  frontend: port 3001:3000, image node:20-alpine (standalone)
```
- Backend URL: `http://localhost:8001/api/v1`
- Frontend URL: `http://localhost:3001`
- NEXT_PUBLIC_API_URL baked at build time as Docker build ARG
- CORS: configurable via `ALLOWED_ORIGINS` env var

### Local Dev
- `scripts\start.bat` — starts uvicorn (:8000) + next dev (:3000)
- Backend: `http://localhost:8000/api/v1`
- Frontend: `http://localhost:3000`

### Initial Setup
1. `docker compose up --build -d`
2. `docker compose exec backend python scripts/initial_import.py`
3. Login: admin / admin

## CRITICAL RULES

1. **NEVER overwrite Excel formula columns** — FORMULA_COLUMNS = {7, 8, 9, 10, 11} (G, H, I, J, K)
2. Only write to: M (initial), N (added), O–AS (daily sales 1–31)
3. Always backup Excel files before writing
4. All API responses use envelope: `{ success, data, error, meta }`
5. Use immutable patterns — create new objects, never mutate existing
6. Currency: MWK (Malawian Kwacha), CNY conversion for profit sharing
7. Payment methods: Cash, Mukuru, Card
8. Column I = suggested_price (formula), Column L = original_price (static)

## WeChat Daily Summary Format

```
Jan 22th sold 4PCS, (This month sold 20PCS). Total Tyres Remaining 778, Revenue this month cash 3.7M MWK, Mukuru 0M MWK
```
