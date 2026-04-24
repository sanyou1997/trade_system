'use client';

import { FormEvent, useState, useMemo } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { StatCard } from '@/components/ui/Card';
import Select from '@/components/ui/Select';
import Table, { Column } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { useInventory, useUpdateStock } from '@/hooks/useInventory';
import { usePhoneInventory, useUpdatePhoneStock } from '@/hooks/usePhoneInventory';
import { useOtherInventory, useUpdateOtherStock } from '@/hooks/useOtherInventory';
import { useAuth } from '@/hooks/useAuth';
import { useProductType } from '@/lib/product-context';
import { cn, formatMWK, roundTo1000 } from '@/lib/utils';
import { useSettings } from '@/hooks/useSettings';
import { api } from '@/lib/api';
import { InventoryItem, PhoneInventoryItem, OtherInventoryItem, TyreCategory } from '@/lib/types';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import ImportStockModal from '@/components/ui/ImportStockModal';
import ImportHistoryPanel from '@/components/ui/ImportHistoryPanel';
import AddProductModal from '@/components/ui/AddProductModal';
import PriceEditModal from '@/components/ui/PriceEditModal';
import { useBulkPriceAdjust } from '@/hooks/usePriceUpdate';
import { Package, ArrowDownToLine, ArrowUpFromLine, ShoppingCart, Boxes, Search, X, AlertTriangle, Upload, Plus, Percent } from 'lucide-react';

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
  const { isTyre, isPhone, isOther } = useProductType();
  const { data: settingsData } = useSettings();
  const cashRate = settingsData?.cash_rate ? Number(settingsData.cash_rate) : 0;
  const mukuruRate = settingsData?.mukuru_rate ? Number(settingsData.mukuru_rate) : 0;
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
  const [bulkPriceModalOpen, setBulkPriceModalOpen] = useState(false);
  const [bulkPercentage, setBulkPercentage] = useState('');
  const [bulkPassword, setBulkPassword] = useState('');
  const [addProductModalOpen, setAddProductModalOpen] = useState(false);
  const [priceEditModal, setPriceEditModal] = useState<{
    productId: number;
    productType: 'tyre' | 'phone' | 'other';
    productLabel: string;
    currentPrices: Record<string, number>;
  } | null>(null);

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

  // Other hooks
  const { data: otherInventory, isLoading: otherLoading } = useOtherInventory(
    Number(year),
    Number(month),
  );
  const updateOtherStock = useUpdateOtherStock();
  const bulkPriceAdjust = useBulkPriceAdjust();

  const isLoading = isTyre ? tyreLoading : isPhone ? phoneLoading : otherLoading;

  // Brand options (tyres/phones have brand; others have category)
  const brandOptions = useMemo(() => {
    if (isTyre) {
      if (!tyreInventory) return [];
      const brands = new Set<string>();
      for (const item of tyreInventory) if (item.brand) brands.add(item.brand);
      return Array.from(brands).sort();
    }
    if (isPhone) {
      if (!phoneInventory) return [];
      const brands = new Set<string>();
      for (const item of phoneInventory) if (item.brand) brands.add(item.brand);
      return Array.from(brands).sort();
    }
    if (!otherInventory) return [];
    const categories = new Set<string>();
    for (const item of otherInventory) if (item.category) categories.add(item.category);
    return Array.from(categories).sort();
  }, [isTyre, isPhone, tyreInventory, phoneInventory, otherInventory]);

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

  // Other display data
  const otherDisplayData = useMemo(() => {
    let items = otherInventory ?? [];
    if (brandFilter !== 'all') items = items.filter((i) => i.category === brandFilter);
    if (inStockOnly) items = items.filter((i) => i.remaining_stock > 0);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter((i) => {
        const searchable = `${i.name} ${i.category || ''} ${i.note || ''}`.toLowerCase();
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
  }, [otherInventory, brandFilter, inStockOnly, searchQuery, sortKey, sortDir]);

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
    if (isPhone) {
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
    }
    const items = otherDisplayData;
    return {
      totalSKUs: items.length,
      totalInitial: items.reduce((sum, i) => sum + i.initial_stock, 0),
      totalAdded: items.reduce((sum, i) => sum + i.added_stock, 0),
      totalSold: items.reduce((sum, i) => sum + i.total_sold, 0),
      totalLoss: items.reduce((sum, i) => sum + i.total_loss, 0),
      totalRemaining: items.reduce((sum, i) => sum + i.remaining_stock, 0),
      totalValue: items.reduce((sum, i) => sum + i.remaining_stock * i.suggested_price, 0),
    };
  }, [isTyre, isPhone, tyreDisplayData, phoneDisplayData, otherDisplayData]);

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
      } else if (isPhone) {
        await updatePhoneStock.mutateAsync({
          phone_id: editCell.productId,
          year: Number(year),
          month: Number(month),
          [editCell.field]: numValue,
        });
      } else {
        await updateOtherStock.mutateAsync({
          other_product_id: editCell.productId,
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

  async function handleExportStock() {
    const productType = isTyre ? 'tyre' : isPhone ? 'phone' : 'other';
    const params = new URLSearchParams({
      product_type: productType,
      year,
      month,
    });

    try {
      const blob = await api.download(`/stock-import/export?${params}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${productType}_stock_${year}_${month.padStart(2, '0')}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast('success', 'Stock export downloaded.');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Export failed.');
    }
  }

  async function handleBulkPriceAdjust(e: FormEvent) {
    e.preventDefault();

    const percentage = Number(bulkPercentage);
    if (isNaN(percentage) || percentage <= -100) {
      toast('error', 'Please enter a percentage greater than -100.');
      return;
    }
    if (!bulkPassword) {
      toast('error', 'Please enter the password.');
      return;
    }

    const productType = isTyre ? 'tyre' : isPhone ? 'phone' : 'other';
    try {
      const result = await bulkPriceAdjust.mutateAsync({
        product_type: productType,
        password: bulkPassword,
        percentage,
      }) as { updated_count?: number };
      toast('success', `Updated ${result.updated_count ?? 0} prices.`);
      setBulkPriceModalOpen(false);
      setBulkPercentage('');
      setBulkPassword('');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Bulk price update failed.');
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

  function calculateMukuruPrice(suggestedPrice: number): number {
    if (cashRate <= 0 || mukuruRate <= 0) return 0;
    return roundTo1000(suggestedPrice * mukuruRate / cashRate);
  }

  const tyreColumns: Column<InventoryItem>[] = [
    { key: 'size', label: 'Size', sortable: true },
    { key: 'type', label: 'Type' },
    { key: 'brand', label: 'Brand', sortable: true },
    { key: 'pattern', label: 'Pattern' },
    { key: 'suggested_price', label: 'Cash Price', sortable: true, render: (item) => (
      <button
        className="hover:bg-blue-50 px-1 py-0.5 rounded cursor-pointer text-left"
        onClick={() => setPriceEditModal({
          productId: item.tyre_id,
          productType: 'tyre',
          productLabel: `${item.size} ${item.brand || ''}`.trim(),
          currentPrices: {
            suggested_price: item.suggested_price,
            mukuru_price: calculateMukuruPrice(item.suggested_price),
            cash_rate: cashRate,
            mukuru_rate: mukuruRate,
          },
        })}
        title="Click to edit price"
      >
        {formatMWK(item.suggested_price)}
      </button>
    ) },
    { key: 'mukuru_price' as keyof InventoryItem, label: 'Mukuru Price', render: (item) => {
      const mp = calculateMukuruPrice(item.suggested_price);
      return mp > 0
        ? (
          <button
            className="hover:bg-blue-50 px-1 py-0.5 rounded cursor-pointer text-left"
            onClick={() => setPriceEditModal({
              productId: item.tyre_id,
              productType: 'tyre',
              productLabel: `${item.size} ${item.brand || ''}`.trim(),
              currentPrices: {
                suggested_price: item.suggested_price,
                mukuru_price: mp,
                cash_rate: cashRate,
                mukuru_rate: mukuruRate,
              },
            })}
            title="Click to edit price"
          >
            {formatMWK(mp)}
          </button>
        )
        : <span className="text-slate-400 text-xs">N/A</span>;
    } },
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
    { key: 'cash_price', label: 'Cash Price', sortable: true, render: (item) => {
      const openModal = () => setPriceEditModal({
        productId: item.phone_id,
        productType: 'phone',
        productLabel: `${item.brand} ${item.model}`.trim(),
        currentPrices: { cash_price: item.cash_price, mukuru_price: item.mukuru_price, online_price: item.online_price },
      });
      return (
        <button className="hover:bg-blue-50 px-1 py-0.5 rounded cursor-pointer text-left" onClick={openModal} title="Click to edit prices">
          {formatMWK(item.cash_price)}
        </button>
      );
    } },
    { key: 'mukuru_price', label: 'Mukuru Price', render: (item) => {
      const openModal = () => setPriceEditModal({
        productId: item.phone_id,
        productType: 'phone',
        productLabel: `${item.brand} ${item.model}`.trim(),
        currentPrices: { cash_price: item.cash_price, mukuru_price: item.mukuru_price, online_price: item.online_price },
      });
      return (
        <button className="hover:bg-blue-50 px-1 py-0.5 rounded cursor-pointer text-left" onClick={openModal} title="Click to edit prices">
          {formatMWK(item.mukuru_price)}
        </button>
      );
    } },
    { key: 'online_price', label: 'Online Price', render: (item) => {
      const openModal = () => setPriceEditModal({
        productId: item.phone_id,
        productType: 'phone',
        productLabel: `${item.brand} ${item.model}`.trim(),
        currentPrices: { cash_price: item.cash_price, mukuru_price: item.mukuru_price, online_price: item.online_price },
      });
      return (
        <button className="hover:bg-blue-50 px-1 py-0.5 rounded cursor-pointer text-left" onClick={openModal} title="Click to edit prices">
          {formatMWK(item.online_price)}
        </button>
      );
    } },
    { key: 'initial_stock', label: 'Initial', sortable: true, className: 'text-center', render: (item) => renderEditableCell(item.phone_id, 'initial_stock', item.initial_stock) },
    { key: 'added_stock', label: 'Added', sortable: true, className: 'text-center', render: (item) => renderEditableCell(item.phone_id, 'added_stock', item.added_stock) },
    { key: 'total_sold', label: 'Sold', sortable: true, className: 'text-center' },
    { key: 'total_loss', label: 'Loss', sortable: true, className: 'text-center', render: (item) => item.total_loss > 0 ? <span className="text-red-600">{item.total_loss}</span> : 0 },
    { key: 'remaining_stock', label: 'Remaining', sortable: true, className: 'text-center font-medium' },
  ];

  const otherColumns: Column<OtherInventoryItem>[] = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'category', label: 'Category', sortable: true },
    { key: 'suggested_price', label: 'Price', sortable: true, render: (item) => (
      <button
        className="hover:bg-blue-50 px-1 py-0.5 rounded cursor-pointer text-left"
        onClick={() => setPriceEditModal({
          productId: item.other_product_id,
          productType: 'other',
          productLabel: item.name,
          currentPrices: { suggested_price: item.suggested_price },
        })}
        title="Click to edit price"
      >
        {formatMWK(item.suggested_price)}
      </button>
    ) },
    { key: 'initial_stock', label: 'Initial', sortable: true, className: 'text-center', render: (item) => renderEditableCell(item.other_product_id, 'initial_stock', item.initial_stock) },
    { key: 'added_stock', label: 'Added', sortable: true, className: 'text-center', render: (item) => renderEditableCell(item.other_product_id, 'added_stock', item.added_stock) },
    { key: 'total_sold', label: 'Sold', sortable: true, className: 'text-center' },
    { key: 'total_loss', label: 'Loss', sortable: true, className: 'text-center', render: (item) => item.total_loss > 0 ? <span className="text-red-600">{item.total_loss}</span> : 0 },
    { key: 'remaining_stock', label: 'Remaining', sortable: true, className: 'text-center font-medium' },
  ];

  const productTypeLabel = isTyre ? 'Tyre' : isPhone ? 'Phone' : 'Product';

  return (
    <MainLayout title="Inventory">
      {/* Controls Row 1: Year/Month + Category (tyre only) */}
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <Select label="Year" options={YEAR_OPTIONS} value={year} onChange={(e) => setYear(e.target.value)} className="w-28" />
        <Select label="Month" options={MONTH_OPTIONS} value={month} onChange={(e) => setMonth(e.target.value)} className="w-36" />

        <div className="flex gap-2 items-end">
          <Button variant="secondary" size="sm" onClick={handleExportStock}>
            <ArrowDownToLine size={14} /> Export Stock
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setImportModalOpen(true)}>
            <Upload size={14} /> Import Stock
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setBulkPriceModalOpen(true)}>
            <Percent size={14} /> Adjust Prices
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAddProductModalOpen(true)}>
            <Plus size={14} /> Add {productTypeLabel}
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
            placeholder={isTyre ? 'Search size, brand...' : isPhone ? 'Search brand, model...' : 'Search name, category...'}
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
            {isOther ? 'All Categories' : 'All Brands'}
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
      ) : isPhone ? (
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
      ) : (
        <Table
          columns={otherColumns}
          data={otherDisplayData}
          keyExtractor={(item) => item.other_product_id}
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

      {/* Import History */}
      <ImportHistoryPanel productType={isTyre ? 'tyre' : isPhone ? 'phone' : 'other'} />

      {/* Modals */}
      <ImportStockModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        year={Number(year)}
        month={Number(month)}
        productType={isTyre ? 'tyre' : isPhone ? 'phone' : 'other'}
      />
      <AddProductModal
        open={addProductModalOpen}
        onClose={() => setAddProductModalOpen(false)}
      />
      <PriceEditModal
        open={priceEditModal !== null}
        onClose={() => setPriceEditModal(null)}
        productType={priceEditModal?.productType ?? 'tyre'}
        productId={priceEditModal?.productId ?? 0}
        productLabel={priceEditModal?.productLabel ?? ''}
        currentPrices={priceEditModal?.currentPrices ?? {}}
      />
      <Modal
        open={bulkPriceModalOpen}
        onClose={() => setBulkPriceModalOpen(false)}
        title={`Adjust ${productTypeLabel} Prices`}
      >
        <form onSubmit={handleBulkPriceAdjust} className="space-y-4">
          <p className="text-sm text-slate-600">
            Apply a percentage change to all {productTypeLabel.toLowerCase()} prices.
            Values are rounded to the nearest 1,000 MWK.
          </p>
          <Input
            label="Percentage"
            type="number"
            value={bulkPercentage}
            onChange={(e) => setBulkPercentage(e.target.value)}
            placeholder="Example: 5 or -10"
            step={0.01}
          />
          <Input
            label="Password"
            type="password"
            value={bulkPassword}
            onChange={(e) => setBulkPassword(e.target.value)}
            placeholder="Enter password to confirm"
          />
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setBulkPriceModalOpen(false)}
              className="flex-1 justify-center"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={bulkPriceAdjust.isPending}
              className="flex-1 justify-center"
            >
              Apply
            </Button>
          </div>
        </form>
      </Modal>
    </MainLayout>
  );
}
