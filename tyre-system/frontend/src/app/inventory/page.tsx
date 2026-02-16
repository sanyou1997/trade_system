'use client';

import { useState, useMemo } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { StatCard } from '@/components/ui/Card';
import Select from '@/components/ui/Select';
import Table, { Column } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { useInventory, useUpdateStock } from '@/hooks/useInventory';
import { usePhoneInventory, useUpdatePhoneStock } from '@/hooks/usePhoneInventory';
import { useAuth } from '@/hooks/useAuth';
import { useProductType } from '@/lib/product-context';
import { cn, formatMWK } from '@/lib/utils';
import { InventoryItem, PhoneInventoryItem, TyreCategory } from '@/lib/types';
import Button from '@/components/ui/Button';
import ImportStockModal from '@/components/ui/ImportStockModal';
import ImportHistoryPanel from '@/components/ui/ImportHistoryPanel';
import AddProductModal from '@/components/ui/AddProductModal';
import { Package, ArrowDownToLine, ArrowUpFromLine, ShoppingCart, Boxes, Search, X, AlertTriangle, Upload, Plus } from 'lucide-react';

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
  const { isTyre } = useProductType();
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
    productId: number;
    field: 'initial_stock' | 'added_stock';
    value: string;
  } | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [addProductModalOpen, setAddProductModalOpen] = useState(false);

  // Tyre hooks
  const { data: tyreInventory, isLoading: tyreLoading } = useInventory({
    year: Number(year),
    month: Number(month),
  });
  const updateTyreStock = useUpdateStock();

  // Phone hooks
  const { data: phoneInventory, isLoading: phoneLoading } = usePhoneInventory(
    Number(year),
    Number(month),
  );
  const updatePhoneStock = useUpdatePhoneStock();

  const isLoading = isTyre ? tyreLoading : phoneLoading;

  // Brand options
  const brandOptions = useMemo(() => {
    if (isTyre) {
      if (!tyreInventory) return [];
      const brands = new Set<string>();
      for (const item of tyreInventory) if (item.brand) brands.add(item.brand);
      return Array.from(brands).sort();
    }
    if (!phoneInventory) return [];
    const brands = new Set<string>();
    for (const item of phoneInventory) if (item.brand) brands.add(item.brand);
    return Array.from(brands).sort();
  }, [isTyre, tyreInventory, phoneInventory]);

  // Tyre display data
  const tyreDisplayData = useMemo(() => {
    let items = tyreInventory ?? [];
    if (category !== 'all') items = items.filter((i) => i.category === category);
    if (brandFilter !== 'all') items = items.filter((i) => i.brand === brandFilter);
    if (inStockOnly) items = items.filter((i) => i.remaining_stock > 0);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter((i) => {
        const searchable = `${i.size} ${i.brand || ''} ${i.type || ''} ${i.pattern || ''}`.toLowerCase();
        return searchable.includes(q);
      });
    }
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
  }, [tyreInventory, category, brandFilter, inStockOnly, searchQuery, sortKey, sortDir]);

  // Phone display data
  const phoneDisplayData = useMemo(() => {
    let items = phoneInventory ?? [];
    if (brandFilter !== 'all') items = items.filter((i) => i.brand === brandFilter);
    if (inStockOnly) items = items.filter((i) => i.remaining_stock > 0);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter((i) => {
        const searchable = `${i.brand} ${i.model} ${i.config || ''} ${i.note || ''}`.toLowerCase();
        return searchable.includes(q);
      });
    }
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
  }, [phoneInventory, brandFilter, inStockOnly, searchQuery, sortKey, sortDir]);

  const summary = useMemo(() => {
    if (isTyre) {
      const items = tyreDisplayData;
      return {
        totalSKUs: items.length,
        totalInitial: items.reduce((sum, i) => sum + i.initial_stock, 0),
        totalAdded: items.reduce((sum, i) => sum + i.added_stock, 0),
        totalSold: items.reduce((sum, i) => sum + i.total_sold, 0),
        totalLoss: items.reduce((sum, i) => sum + i.total_loss, 0),
        totalRemaining: items.reduce((sum, i) => sum + i.remaining_stock, 0),
        totalValue: items.reduce((sum, i) => sum + i.remaining_stock * i.suggested_price, 0),
      };
    }
    const items = phoneDisplayData;
    return {
      totalSKUs: items.length,
      totalInitial: items.reduce((sum, i) => sum + i.initial_stock, 0),
      totalAdded: items.reduce((sum, i) => sum + i.added_stock, 0),
      totalSold: items.reduce((sum, i) => sum + i.total_sold, 0),
      totalLoss: items.reduce((sum, i) => sum + i.total_loss, 0),
      totalRemaining: items.reduce((sum, i) => sum + i.remaining_stock, 0),
      totalValue: items.reduce((sum, i) => sum + i.remaining_stock * i.cash_price, 0),
    };
  }, [isTyre, tyreDisplayData, phoneDisplayData]);

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
      if (isTyre) {
        await updateTyreStock.mutateAsync({
          tyre_id: editCell.productId,
          year: Number(year),
          month: Number(month),
          [editCell.field]: numValue,
        });
      } else {
        await updatePhoneStock.mutateAsync({
          phone_id: editCell.productId,
          year: Number(year),
          month: Number(month),
          [editCell.field]: numValue,
        });
      }
      toast('success', 'Stock updated.');
      setEditCell(null);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Update failed.');
    }
  }

  function renderEditableCell(
    productId: number,
    field: 'initial_stock' | 'added_stock',
    currentValue: number,
  ) {
    const isEditing = editCell?.productId === productId && editCell?.field === field;

    if (isEditing) {
      return (
        <input
          type="number"
          className="w-16 px-1 py-0.5 text-sm border border-blue-400 rounded focus:outline-none"
          value={editCell.value}
          onChange={(e) => setEditCell({ ...editCell, value: e.target.value })}
          onBlur={handleSaveEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveEdit();
            if (e.key === 'Escape') setEditCell(null);
          }}
          autoFocus
        />
      );
    }

    if (user?.role !== 'admin') return currentValue;

    return (
      <button
        className="hover:bg-blue-50 px-1 py-0.5 rounded cursor-pointer min-w-[2rem] text-left"
        onClick={() => setEditCell({ productId, field, value: String(currentValue) })}
        title="Click to edit"
      >
        {currentValue}
      </button>
    );
  }

  const tyreColumns: Column<InventoryItem>[] = [
    { key: 'size', label: 'Size', sortable: true },
    { key: 'type', label: 'Type' },
    { key: 'brand', label: 'Brand', sortable: true },
    { key: 'pattern', label: 'Pattern' },
    { key: 'suggested_price', label: 'Price', sortable: true, render: (item) => formatMWK(item.suggested_price) },
    { key: 'initial_stock', label: 'Initial', sortable: true, className: 'text-center', render: (item) => renderEditableCell(item.tyre_id, 'initial_stock', item.initial_stock) },
    { key: 'added_stock', label: 'Added', sortable: true, className: 'text-center', render: (item) => renderEditableCell(item.tyre_id, 'added_stock', item.added_stock) },
    { key: 'total_sold', label: 'Sold', sortable: true, className: 'text-center' },
    { key: 'total_loss', label: 'Loss', sortable: true, className: 'text-center', render: (item) => item.total_loss > 0 ? <span className="text-red-600">{item.total_loss}</span> : 0 },
    { key: 'remaining_stock', label: 'Remaining', sortable: true, className: 'text-center font-medium' },
  ];

  const phoneColumns: Column<PhoneInventoryItem>[] = [
    { key: 'brand', label: 'Brand', sortable: true },
    { key: 'model', label: 'Model', sortable: true },
    { key: 'config', label: 'Config' },
    { key: 'cash_price', label: 'Cash Price', sortable: true, render: (item) => formatMWK(item.cash_price) },
    { key: 'mukuru_price', label: 'Mukuru Price', render: (item) => formatMWK(item.mukuru_price) },
    { key: 'online_price', label: 'Online Price', render: (item) => formatMWK(item.online_price) },
    { key: 'initial_stock', label: 'Initial', sortable: true, className: 'text-center', render: (item) => renderEditableCell(item.phone_id, 'initial_stock', item.initial_stock) },
    { key: 'added_stock', label: 'Added', sortable: true, className: 'text-center', render: (item) => renderEditableCell(item.phone_id, 'added_stock', item.added_stock) },
    { key: 'total_sold', label: 'Sold', sortable: true, className: 'text-center' },
    { key: 'total_loss', label: 'Loss', sortable: true, className: 'text-center', render: (item) => item.total_loss > 0 ? <span className="text-red-600">{item.total_loss}</span> : 0 },
    { key: 'remaining_stock', label: 'Remaining', sortable: true, className: 'text-center font-medium' },
  ];

  return (
    <MainLayout title="Inventory">
      {/* Controls Row 1: Year/Month + Category (tyre only) */}
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <Select label="Year" options={YEAR_OPTIONS} value={year} onChange={(e) => setYear(e.target.value)} className="w-28" />
        <Select label="Month" options={MONTH_OPTIONS} value={month} onChange={(e) => setMonth(e.target.value)} className="w-36" />

        <div className="flex gap-2 items-end">
          {!isTyre && (
            <Button variant="secondary" size="sm" onClick={() => setImportModalOpen(true)}>
              <Upload size={14} /> Import Stock
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setAddProductModalOpen(true)}>
            <Plus size={14} /> Add {isTyre ? 'Tyre' : 'Phone'}
          </Button>
        </div>

        {isTyre && (
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
        )}
      </div>

      {/* Controls Row 2: Search + Brand + In-stock toggle */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
            <Search size={14} className="text-slate-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isTyre ? 'Search size, brand...' : 'Search brand, model...'}
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
        <StatCard title="SKUs" value={summary.totalSKUs} icon={Boxes} />
        <StatCard title="Initial Stock" value={summary.totalInitial} icon={Package} />
        <StatCard title="Added" value={summary.totalAdded} icon={ArrowDownToLine} />
        <StatCard title="Sold" value={summary.totalSold} icon={ShoppingCart} />
        <StatCard title="Loss" value={summary.totalLoss} icon={AlertTriangle} />
        <StatCard title="Remaining" value={summary.totalRemaining} icon={ArrowUpFromLine} />
        <StatCard title="Stock Value" value={formatMWK(summary.totalValue)} icon={Package} />
      </div>

      {/* Table */}
      {isTyre ? (
        <Table
          columns={tyreColumns}
          data={tyreDisplayData}
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
      ) : (
        <Table
          columns={phoneColumns}
          data={phoneDisplayData}
          keyExtractor={(item) => item.phone_id}
          loading={isLoading}
          emptyMessage="No inventory data for this period."
          sortKey={sortKey}
          sortDirection={sortDir}
          onSort={handleSort}
          rowClassName={(item) => {
            if (item.remaining_stock < 3) return 'bg-red-50';
            if (item.remaining_stock < 5) return 'bg-yellow-50';
            return '';
          }}
        />
      )}

      {/* Import History (phone only) */}
      {!isTyre && <ImportHistoryPanel />}

      {/* Modals */}
      <ImportStockModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        year={Number(year)}
        month={Number(month)}
      />
      <AddProductModal
        open={addProductModalOpen}
        onClose={() => setAddProductModalOpen(false)}
      />
    </MainLayout>
  );
}
