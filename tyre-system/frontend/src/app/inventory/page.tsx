'use client';

import { useState, useMemo } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { StatCard } from '@/components/ui/Card';
import Select from '@/components/ui/Select';
import Table, { Column } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { useInventory, useUpdateStock } from '@/hooks/useInventory';
import { useAuth } from '@/hooks/useAuth';
import { cn, formatMWK } from '@/lib/utils';
import { InventoryItem, TyreCategory } from '@/lib/types';
import { Package, ArrowDownToLine, ArrowUpFromLine, ShoppingCart, Boxes, Search, X, AlertTriangle } from 'lucide-react';

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: new Date(2000, i).toLocaleString('en', { month: 'long' }),
}));

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => ({
  value: String(currentYear - 2 + i),
  label: String(currentYear - 2 + i),
}));

const CATEGORY_TABS: { value: TyreCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'branded_new', label: 'Branded New' },
  { value: 'brandless_new', label: 'Brandless New' },
  { value: 'second_hand', label: 'Second Hand' },
];

export default function InventoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const now = new Date();

  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [category, setCategory] = useState<TyreCategory | 'all'>('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortKey, setSortKey] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [editCell, setEditCell] = useState<{
    tyreId: number;
    field: 'initial_stock' | 'added_stock';
    value: string;
  } | null>(null);

  const filters = useMemo(
    () => ({ year: Number(year), month: Number(month) }),
    [year, month],
  );

  const { data: inventory, isLoading } = useInventory(filters);
  const updateStock = useUpdateStock();

  // Extract unique brands for filter pills
  const brandOptions = useMemo(() => {
    if (!inventory) return [];
    const brands = new Set<string>();
    for (const item of inventory) {
      if (item.brand) brands.add(item.brand);
    }
    return Array.from(brands).sort();
  }, [inventory]);

  // Client-side filter + sort
  const displayData = useMemo(() => {
    let items = inventory ?? [];

    // Category filter
    if (category !== 'all') {
      items = items.filter((i) => i.category === category);
    }
    // Brand filter
    if (brandFilter !== 'all') {
      items = items.filter((i) => i.brand === brandFilter);
    }
    // In-stock-only filter
    if (inStockOnly) {
      items = items.filter((i) => i.remaining_stock > 0);
    }
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter((i) => {
        const searchable = `${i.size} ${i.brand || ''} ${i.type || ''} ${i.pattern || ''}`.toLowerCase();
        return searchable.includes(q);
      });
    }
    // Sort
    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1;
      items = [...items].sort((a, b) => {
        const av = (a as unknown as Record<string, unknown>)[sortKey];
        const bv = (b as unknown as Record<string, unknown>)[sortKey];
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
      });
    }

    return items;
  }, [inventory, category, brandFilter, inStockOnly, searchQuery, sortKey, sortDir]);

  const summary = useMemo(() => {
    const items = displayData;
    return {
      totalSKUs: items.length,
      totalInitial: items.reduce((sum, i) => sum + i.initial_stock, 0),
      totalAdded: items.reduce((sum, i) => sum + i.added_stock, 0),
      totalSold: items.reduce((sum, i) => sum + i.total_sold, 0),
      totalLoss: items.reduce((sum, i) => sum + i.total_loss, 0),
      totalRemaining: items.reduce((sum, i) => sum + i.remaining_stock, 0),
      totalValue: items.reduce((sum, i) => sum + i.remaining_stock * i.suggested_price, 0),
    };
  }, [displayData]);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  async function handleSaveEdit() {
    if (!editCell) return;
    const numValue = Number(editCell.value);
    if (isNaN(numValue) || numValue < 0) {
      toast('error', 'Please enter a valid non-negative number.');
      return;
    }

    try {
      await updateStock.mutateAsync({
        tyre_id: editCell.tyreId,
        year: Number(year),
        month: Number(month),
        [editCell.field]: numValue,
      });
      toast('success', 'Stock updated.');
      setEditCell(null);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Update failed.');
    }
  }

  function renderEditableCell(
    item: InventoryItem,
    field: 'initial_stock' | 'added_stock',
  ) {
    const isEditing =
      editCell?.tyreId === item.tyre_id && editCell?.field === field;

    if (isEditing) {
      return (
        <input
          type="number"
          className="w-16 px-1 py-0.5 text-sm border border-blue-400 rounded focus:outline-none"
          value={editCell.value}
          onChange={(e) =>
            setEditCell({ ...editCell, value: e.target.value })
          }
          onBlur={handleSaveEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveEdit();
            if (e.key === 'Escape') setEditCell(null);
          }}
          autoFocus
        />
      );
    }

    if (user?.role !== 'admin') {
      return item[field];
    }

    return (
      <button
        className="hover:bg-blue-50 px-1 py-0.5 rounded cursor-pointer min-w-[2rem] text-left"
        onClick={() =>
          setEditCell({
            tyreId: item.tyre_id,
            field,
            value: String(item[field]),
          })
        }
        title="Click to edit"
      >
        {item[field]}
      </button>
    );
  }

  const columns: Column<InventoryItem>[] = [
    { key: 'size', label: 'Size', sortable: true },
    { key: 'type', label: 'Type' },
    { key: 'brand', label: 'Brand', sortable: true },
    { key: 'pattern', label: 'Pattern' },
    {
      key: 'suggested_price',
      label: 'Price',
      sortable: true,
      render: (item) => formatMWK(item.suggested_price),
    },
    {
      key: 'initial_stock',
      label: 'Initial',
      sortable: true,
      className: 'text-center',
      render: (item) => renderEditableCell(item, 'initial_stock'),
    },
    {
      key: 'added_stock',
      label: 'Added',
      sortable: true,
      className: 'text-center',
      render: (item) => renderEditableCell(item, 'added_stock'),
    },
    {
      key: 'total_sold',
      label: 'Sold',
      sortable: true,
      className: 'text-center',
    },
    {
      key: 'total_loss',
      label: 'Loss',
      sortable: true,
      className: 'text-center',
      render: (item) =>
        item.total_loss > 0 ? (
          <span className="text-red-600">{item.total_loss}</span>
        ) : (
          0
        ),
    },
    {
      key: 'remaining_stock',
      label: 'Remaining',
      sortable: true,
      className: 'text-center font-medium',
    },
  ];

  return (
    <MainLayout title="Inventory">
      {/* Controls Row 1: Year/Month + Category */}
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <Select
          label="Year"
          options={YEAR_OPTIONS}
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="w-28"
        />
        <Select
          label="Month"
          options={MONTH_OPTIONS}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-36"
        />

        <div className="flex gap-1 ml-auto">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setCategory(tab.value)}
              className={cn(
                'px-3 py-2 text-sm rounded-md transition-colors',
                category === tab.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Controls Row 2: Search + Brand + In-stock toggle */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Search */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
            <Search size={14} className="text-slate-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search size, brand..."
            className="pl-8 pr-7 py-1.5 w-52 text-sm border border-slate-300 rounded-md
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Brand pills */}
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setBrandFilter('all')}
            className={cn(
              'px-2 py-0.5 text-xs rounded-full transition-colors',
              brandFilter === 'all'
                ? 'bg-green-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            All Brands
          </button>
          {brandOptions.map((brand) => (
            <button
              key={brand}
              onClick={() => setBrandFilter(brand)}
              className={cn(
                'px-2 py-0.5 text-xs rounded-full transition-colors',
                brandFilter === brand
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {brand}
            </button>
          ))}
        </div>

        {/* In-stock only toggle */}
        <button
          onClick={() => setInStockOnly(!inStockOnly)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ml-auto',
            inStockOnly
              ? 'bg-amber-50 border-amber-300 text-amber-700'
              : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50',
          )}
        >
          <Package size={14} />
          In Stock Only
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
        <StatCard
          title="SKUs"
          value={summary.totalSKUs}
          icon={Boxes}
        />
        <StatCard
          title="Initial Stock"
          value={summary.totalInitial}
          icon={Package}
        />
        <StatCard
          title="Added"
          value={summary.totalAdded}
          icon={ArrowDownToLine}
        />
        <StatCard
          title="Sold"
          value={summary.totalSold}
          icon={ShoppingCart}
        />
        <StatCard
          title="Loss"
          value={summary.totalLoss}
          icon={AlertTriangle}
        />
        <StatCard
          title="Remaining"
          value={summary.totalRemaining}
          icon={ArrowUpFromLine}
        />
        <StatCard
          title="Stock Value"
          value={formatMWK(summary.totalValue)}
          icon={Package}
        />
      </div>

      {/* Table */}
      <Table
        columns={columns}
        data={displayData}
        keyExtractor={(item) => item.tyre_id}
        loading={isLoading}
        emptyMessage="No inventory data for this period."
        sortKey={sortKey}
        sortDirection={sortDir}
        onSort={handleSort}
        rowClassName={(item) => {
          if (item.remaining_stock < 5) return 'bg-red-50';
          if (item.remaining_stock < 10) return 'bg-yellow-50';
          return '';
        }}
      />
    </MainLayout>
  );
}
