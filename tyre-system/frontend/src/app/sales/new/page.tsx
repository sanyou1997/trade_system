'use client';

import { useState, FormEvent, useMemo, useRef, useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import Table, { Column } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { useCreateSale, useDailySales } from '@/hooks/useSales';
import { useTyresWithStock } from '@/hooks/useTyres';
import { formatDateISO, formatMWK, formatNumber, formatTyreLabel, cn } from '@/lib/utils';
import { Sale, PaymentMethod, TyreWithStock, TyreCategory } from '@/lib/types';
import { Search, X, ChevronDown } from 'lucide-react';

const PAYMENT_OPTIONS = [
  { value: 'Cash', label: 'Cash' },
  { value: 'Mukuru', label: 'Mukuru' },
  { value: 'Card', label: 'Card' },
];

const CATEGORY_FILTERS: { value: TyreCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'branded_new', label: 'Branded' },
  { value: 'brandless_new', label: 'Brandless' },
  { value: 'second_hand', label: 'Second Hand' },
];

function parseSizeFilter(query: string): { width?: string; aspect?: string; rim?: string; raw: string } {
  const q = query.trim().toUpperCase();
  if (!q) return { raw: '' };

  // Extract digits only
  const digits = q.replace(/[^0-9]/g, '');

  // Try to parse structured: e.g. "175/70/R13", "17570R13", "175 70 13"
  if (digits.length >= 5) {
    const width = digits.slice(0, 3);
    if (digits.length >= 7) {
      return { width, aspect: digits.slice(3, 5), rim: digits.slice(5, 7), raw: q };
    }
    if (digits.length >= 5) {
      // Could be width+rim (155/12) or width+aspect (175/70)
      const rest = digits.slice(3);
      if (rest.length === 2) {
        const num = parseInt(rest, 10);
        // If < 20, likely rim diameter; if >= 50, likely aspect ratio
        if (num < 20) {
          return { width, rim: rest, raw: q };
        }
        return { width, aspect: rest, raw: q };
      }
    }
  }

  // Just return raw for substring matching
  return { raw: q };
}

function tyreMatchesFilter(tyre: TyreWithStock, filter: ReturnType<typeof parseSizeFilter>): boolean {
  if (!filter.raw) return true;

  // Parse the tyre's own size for structured matching
  const sizeDigits = tyre.size.replace(/[^0-9]/g, '');
  let tyreWidth = '', tyreAspect = '', tyreRim = '';
  if (sizeDigits.length >= 7) {
    tyreWidth = sizeDigits.slice(0, 3);
    tyreAspect = sizeDigits.slice(3, 5);
    tyreRim = sizeDigits.slice(5, 7);
  } else if (sizeDigits.length >= 5) {
    tyreWidth = sizeDigits.slice(0, 3);
    tyreRim = sizeDigits.slice(3, 5);
  }

  // Structured matching if filter has parsed components
  if (filter.width) {
    if (tyreWidth !== filter.width) return false;
    if (filter.aspect && tyreAspect && tyreAspect !== filter.aspect) return false;
    if (filter.rim && tyreRim && tyreRim !== filter.rim) return false;
    return true;
  }

  // Fallback: substring match on size, brand, type, or pattern
  const q = filter.raw.toLowerCase();
  const searchable = `${tyre.size} ${tyre.brand || ''} ${tyre.type || ''} ${tyre.pattern || ''}`.toLowerCase();
  return searchable.includes(q);
}

export default function RecordSalePage() {
  const { toast } = useToast();
  const today = formatDateISO(new Date());

  const [saleDate, setSaleDate] = useState(today);
  const [tyreId, setTyreId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [discount, setDiscount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
  const [customerName, setCustomerName] = useState('');

  // Searchable tyre selector state
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<TyreCategory | 'all'>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: tyres } = useTyresWithStock();
  const { data: todaySales } = useDailySales(saleDate);
  const createSale = useCreateSale();

  // Extract unique brands from tyres for filter buttons
  const brandOptions = useMemo(() => {
    if (!tyres) return [];
    const brands = new Set<string>();
    for (const t of tyres) {
      if (t.brand) brands.add(t.brand);
    }
    return Array.from(brands).sort();
  }, [tyres]);

  // Filter tyres: only in-stock, matching search query + category + brand
  const filteredTyres = useMemo(() => {
    if (!tyres) return [];
    const filter = parseSizeFilter(searchQuery);
    return tyres
      .filter((t) => t.remaining_stock > 0)
      .filter((t) => categoryFilter === 'all' || t.category === categoryFilter)
      .filter((t) => brandFilter === 'all' || t.brand === brandFilter)
      .filter((t) => tyreMatchesFilter(t, filter));
  }, [tyres, searchQuery, categoryFilter, brandFilter]);

  const selectedTyre = useMemo(() => {
    if (!tyreId || !tyres) return null;
    return tyres.find((t) => t.id === Number(tyreId)) ?? null;
  }, [tyreId, tyres]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTyreSelect = (tyre: TyreWithStock) => {
    setTyreId(String(tyre.id));
    setSearchQuery(`${tyre.size} - ${tyre.brand || 'No Brand'}`);
    setUnitPrice(String(tyre.suggested_price));
    setDropdownOpen(false);
  };

  const clearTyreSelection = () => {
    setTyreId('');
    setSearchQuery('');
    setUnitPrice('');
    setDropdownOpen(false);
  };

  const computedTotal = useMemo(() => {
    const qty = Number(quantity) || 0;
    const price = Number(unitPrice) || 0;
    const disc = Number(discount) || 0;
    return qty * price * (1 - disc / 100);
  }, [quantity, unitPrice, discount]);

  const todayTotalQty = useMemo(() => {
    if (!todaySales) return 0;
    return todaySales.reduce((sum, s) => sum + s.quantity, 0);
  }, [todaySales]);

  const todayTotalRevenue = useMemo(() => {
    if (!todaySales) return 0;
    return todaySales.reduce((sum, s) => sum + s.total, 0);
  }, [todaySales]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!tyreId) {
      toast('error', 'Please select a tyre.');
      return;
    }

    const qty = Number(quantity);
    const price = Number(unitPrice);

    if (qty <= 0) {
      toast('error', 'Quantity must be greater than 0.');
      return;
    }

    if (price <= 0) {
      toast('error', 'Unit price must be greater than 0.');
      return;
    }

    if (selectedTyre && qty > selectedTyre.remaining_stock) {
      toast('error', `Only ${selectedTyre.remaining_stock} in stock.`);
      return;
    }

    try {
      await createSale.mutateAsync({
        sale_date: saleDate,
        tyre_id: Number(tyreId),
        quantity: qty,
        unit_price: price,
        discount: Number(discount) || 0,
        payment_method: paymentMethod as PaymentMethod,
        customer_name: customerName.trim(),
      });
      toast('success', 'Sale recorded successfully!');

      // Reset form but keep date and payment method
      clearTyreSelection();
      setQuantity('1');
      setDiscount('0');
      setCustomerName('');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to record sale.');
    }
  }

  const todaySalesColumns: Column<Sale>[] = [
    {
      key: 'tyre',
      label: 'Tyre',
      render: (s) =>
        formatTyreLabel(s.tyre_size, s.tyre_type, s.tyre_brand, s.tyre_id),
    },
    { key: 'quantity', label: 'Qty', className: 'text-center' },
    {
      key: 'total',
      label: 'Total',
      render: (s) => formatMWK(s.total),
    },
    {
      key: 'payment_method',
      label: 'Payment',
      render: (s) => (
        <Badge
          variant={
            s.payment_method === 'Cash'
              ? 'info'
              : s.payment_method === 'Mukuru'
                ? 'success'
                : 'warning'
          }
        >
          {s.payment_method}
        </Badge>
      ),
    },
  ];

  return (
    <MainLayout title="Record Sale">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Sale Entry Form */}
        <div className="lg:col-span-3">
          <Card title="New Sale">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Date"
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                />

                {/* Searchable Tyre Selector */}
                <div ref={dropdownRef} className="relative sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Tyre
                  </label>

                  {/* Category & Brand Filters */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {CATEGORY_FILTERS.map((cat) => (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => setCategoryFilter(cat.value)}
                        className={cn(
                          'px-2 py-0.5 text-xs rounded-full transition-colors',
                          categoryFilter === cat.value
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                        )}
                      >
                        {cat.label}
                      </button>
                    ))}
                    <span className="text-slate-300 mx-0.5">|</span>
                    <button
                      type="button"
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
                        type="button"
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
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search size={16} className="text-slate-400" />
                    </div>
                    <input
                      ref={inputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setTyreId('');
                        setDropdownOpen(true);
                      }}
                      onFocus={() => setDropdownOpen(true)}
                      placeholder="Search by size (e.g. 175/70/R13)..."
                      className="w-full pl-9 pr-16 py-2 border border-slate-300 rounded-md text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center">
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={clearTyreSelection}
                          className="p-1 text-slate-400 hover:text-slate-600"
                        >
                          <X size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        className="p-1 pr-2 text-slate-400 hover:text-slate-600"
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Selected tyre info badge */}
                  {selectedTyre && (
                    <div className="mt-1 text-xs text-slate-500">
                      Stock: <span className={selectedTyre.remaining_stock < 5 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                        {selectedTyre.remaining_stock}
                      </span>
                      {' | '}Price: {formatMWK(selectedTyre.suggested_price)}
                      {' | '}{selectedTyre.type}
                      {selectedTyre.brand && ` ${selectedTyre.brand}`}
                      {selectedTyre.pattern && ` ${selectedTyre.pattern}`}
                    </div>
                  )}

                  {/* Dropdown list */}
                  {dropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredTyres.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-slate-500">
                          {searchQuery ? 'No matching tyres with stock' : 'No tyres in stock'}
                        </div>
                      ) : (
                        filteredTyres.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => handleTyreSelect(t)}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-50 last:border-0
                              ${String(t.id) === tyreId ? 'bg-blue-50 text-blue-700' : 'text-slate-700'}`}
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="font-medium">{t.size}</span>
                                <span className="text-slate-400 ml-2">
                                  {t.type}
                                  {t.brand ? ` ${t.brand}` : ''}
                                  {t.pattern ? ` ${t.pattern}` : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  t.remaining_stock < 5
                                    ? 'bg-red-100 text-red-700'
                                    : t.remaining_stock < 10
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-green-100 text-green-700'
                                }`}>
                                  {t.remaining_stock} left
                                </span>
                                <span className="text-xs text-slate-400">
                                  {formatMWK(t.suggested_price)}
                                </span>
                              </div>
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {t.type}{t.li_sr ? ` | ${t.li_sr}` : ''}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="Quantity"
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                <Input
                  label="Unit Price (MWK)"
                  type="number"
                  min="0"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder={
                    selectedTyre
                      ? `Suggested: ${selectedTyre.suggested_price}`
                      : ''
                  }
                />
                <Input
                  label="Discount (%)"
                  type="number"
                  min="0"
                  max="100"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Payment Method"
                  options={PAYMENT_OPTIONS}
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <Input
                  label="Customer Name"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Optional"
                />
              </div>

              {/* Computed Total */}
              <div className="flex items-center justify-between bg-slate-50 px-4 py-3 rounded-md">
                <span className="text-sm font-medium text-slate-600">
                  Computed Total:
                </span>
                <span className="text-lg font-bold text-slate-900">
                  {formatNumber(computedTotal)} MWK
                </span>
              </div>

              <Button
                type="submit"
                loading={createSale.isPending}
                className="w-full"
              >
                Record Sale
              </Button>
            </form>
          </Card>
        </div>

        {/* Today's Sales Panel */}
        <div className="lg:col-span-2">
          <Card
            title={`Today's Sales`}
            headerRight={
              <span className="text-sm text-slate-500">
                {todayTotalQty} PCS | {formatMWK(todayTotalRevenue)}
              </span>
            }
          >
            <Table
              columns={todaySalesColumns}
              data={todaySales ?? []}
              keyExtractor={(s) => s.id}
              emptyMessage="No sales recorded today."
            />
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
