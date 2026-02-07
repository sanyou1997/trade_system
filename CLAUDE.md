# Tyre Sales & Inventory Management System

## Project Overview

A web-based system for a tyre business in Malawi that automates daily sales recording, inventory tracking, and reporting. Replaces manual Excel-based workflow while maintaining bidirectional Excel synchronization with business partner.

## Tech Stack

- **Backend**: Python 3.14 + FastAPI + SQLAlchemy 2.0 + SQLite (WAL mode)
- **Frontend**: Next.js 14 (App Router) + React + Tailwind CSS + Recharts
- **Excel Engine**: openpyxl (formula-preserving read/write)
- **Auth**: Simple session-based (cookie), bcrypt password hashing

## Directory Structure

```
E:\Yongxing\tyre-system\
├── backend\app\
│   ├── main.py              # FastAPI entry point
│   ├── config.py            # Paths, constants
│   ├── database.py          # SQLAlchemy engine & session
│   ├── models\              # SQLAlchemy ORM models
│   ├── schemas\             # Pydantic request/response schemas
│   ├── routers\             # API route handlers
│   ├── services\            # Business logic layer
│   ├── excel\               # Excel sync engine (reader, writer, mapper, conflict)
│   └── utils\               # Currency conversion, date helpers
├── frontend\src\
│   ├── app\                 # Next.js pages (login, sales, inventory, dashboard, sync)
│   ├── components\          # React components (layout, dashboard, sales, inventory, sync, ui)
│   ├── lib\                 # API client, TypeScript types, utilities
│   └── hooks\               # Custom React hooks
├── data\tyre_system.db      # SQLite database
└── scripts\                 # start.bat, initial_import.py, backup.bat
```

## File Ownership Rules (CRITICAL for Agent Team)

To avoid file conflicts, each teammate owns specific directories:

| Teammate | Owns | Must NOT Edit |
|----------|------|---------------|
| backend-dev | `backend/app/models/`, `routers/`, `services/`, `schemas/`, `utils/`, `main.py`, `config.py`, `database.py` | `frontend/`, `backend/app/excel/` |
| frontend-dev | `frontend/src/` | `backend/` |
| excel-engine | `backend/app/excel/`, `scripts/initial_import.py` | `frontend/`, `backend/app/models/`, `backend/app/routers/` |

Shared files (`requirements.txt`, `package.json`) should be edited by the teammate who needs the dependency, one at a time.

## Database Schema

### Core Tables

- **tyres**: SKU master (size, type, brand, pattern, category, suggested_price, tyre_cost)
- **inventory_periods**: Monthly stock (tyre_id, year, month, initial_stock, added_stock)
- **sales**: Transactions (sale_date, tyre_id, quantity, unit_price, discount, total, payment_method, customer_name)
- **payments**: Payment records (payment_date, customer, method, amount_mwk)
- **losses**: Loss/broken/exchange (loss_date, tyre_id, quantity, loss_type, refund)
- **users**: Auth (username, password_hash, role: admin|operator)
- **exchange_rates**: Monthly rates (year, month, rate_type, rate)
- **sync_log**: Audit trail (file_path, direction, status, file_hash)
- **settings**: Key-value config (partner_split, exchange_rate, paths)

### Tyre Categories
- `branded_new`: TERAFLEX, DOUBLESTAR, ZEXTOUR, SPORTRAK
- `brandless_new`: No brand
- `second_hand`: Used tyres

## Excel File Formats

### Inventory File: `Tyre_List_Internal_Available.xlsx`
- Sheets per month: "Tyre List_1月" through "Tyre List_12月"
- ~50 tyre SKUs, rows 2-53 (row 1 = headers, row 54 = totals)
- Key columns:
  - A=Size, B=Type, C=Brand, D=Pattern, E=LI&SR
  - F=Tyre COST, G=After Delivery&Duty COST (**FORMULA - DO NOT OVERWRITE**)
  - H=QTY (**FORMULA: =M+N-SUM(O:AS) - DO NOT OVERWRITE**)
  - I=Suggested Price (**FORMULA - DO NOT OVERWRITE**)
  - K=Total Sold (**FORMULA: =SUM(O:AS) - DO NOT OVERWRITE**)
  - L=Original Price, M=Initial Stock, N=Added Stock
  - O through AS = Daily sales (day 1-31) ← WRITE HERE
- I54 = Exchange rate (currently 590)

### Monthly Invoice: `Invoice_Tyres_YYYY.M.xlsx`
- Sheet "Sales Record": Date, Brand, Type, Size, Qty, Unit Price, Discount, Total, Payment Method, Customer Name
- Sheet "Statistic": Total, Sold, Broken, Loss, Remain, Revenue (MWK/CNY), Profit split
  - Mukuru Rate (row 2, col I), Cash Rate (row 3, col I)
  - Partner split: 40% / Sanyou: 60%
- Sheet "Payment Record": Date, Customer, Payment Method, MWK
- Sheet "Loss": Damaged/exchanged/refunded items
- Sheet "Broken Stock": Permanently damaged inventory

### Daily Sales File: `Tyre Sales DD Mon.xlsx`
- Sheet "Sales Record": Date, Brand, Type, Size, Qty, Unit Price, Discount, Total, Payment Method, Customer Name
- Sheet "Payment Record": Date, Customer, Payment Method, MWK

## CRITICAL RULES

1. **NEVER overwrite Excel formula cells** (columns G, H, I, K in inventory file)
2. Only write to data cells: M (initial), N (added), O-AS (daily sales 1-31)
3. Use immutable patterns - create new objects, never mutate existing ones
4. Handle errors explicitly at every level
5. Validate all user input before processing
6. Currency is MWK (Malawian Kwacha), with CNY conversion for profit sharing
7. Payment methods: Cash, Mukuru, Card
8. All API responses use envelope format: `{ success, data, error, meta }`

## WeChat Daily Summary Format

```
Jan 22th sold 4PCS, (This month sold 20PCS). Total Tyres Remaining 778, Revenue this month cash 3.7M MWK, Mukuru 0M MWK
```

## API Base URL

Backend: `http://localhost:8000/api/v1`
Frontend: `http://localhost:3000`
