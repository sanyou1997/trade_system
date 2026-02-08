'use client';

import { useState, useMemo } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Table, { Column } from '@/components/ui/Table';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';
import { useSales, useDeleteSale } from '@/hooks/useSales';
import { usePhoneSales, useDeletePhoneSale } from '@/hooks/usePhoneSales';
import { useTyres } from '@/hooks/useTyres';
import { usePhones } from '@/hooks/usePhones';
import { useAuth } from '@/hooks/useAuth';
import { useProductType } from '@/lib/product-context';
import { formatMWK, formatDate, formatTyreLabel, formatPhoneLabel } from '@/lib/utils';
import { Sale, PhoneSale, PaymentMethod } from '@/lib/types';
import { Trash2 } from 'lucide-react';

const PAYMENT_FILTER_OPTIONS = [
  { value: '', label: 'All Methods' },
  { value: 'Cash', label: 'Cash' },
  { value: 'Mukuru', label: 'Mukuru' },
  { value: 'Card', label: 'Card' },
];

const PAGE_SIZE = 20;

export default function SalesHistoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isTyre } = useProductType();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<(Sale | PhoneSale) | null>(null);

  // Tyre hooks
  const { data: tyres } = useTyres();
  const deleteTyreSale = useDeleteSale();

  // Phone hooks
  const { data: phones } = usePhones();
  const deletePhoneSale = useDeletePhoneSale();

  const tyreFilters = useMemo(
    () => ({
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      payment_method: (paymentMethod as PaymentMethod) || undefined,
      tyre_id: isTyre && productFilter ? Number(productFilter) : undefined,
      customer: customerSearch || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    [startDate, endDate, paymentMethod, productFilter, customerSearch, page, isTyre],
  );

  const phoneFilters = useMemo(
    () => ({
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      payment_method: (paymentMethod as PaymentMethod) || undefined,
      phone_id: !isTyre && productFilter ? Number(productFilter) : undefined,
      customer: customerSearch || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    [startDate, endDate, paymentMethod, productFilter, customerSearch, page, isTyre],
  );

  const { data: tyreSalesResponse, isLoading: tyreLoading } = useSales(tyreFilters);
  const { data: phoneSalesResponse, isLoading: phoneLoading } = usePhoneSales(phoneFilters);

  const isLoading = isTyre ? tyreLoading : phoneLoading;
  const tyreSales = tyreSalesResponse?.data ?? [];
  const phoneSales = phoneSalesResponse?.data ?? [];
  const totalPages = isTyre
    ? (tyreSalesResponse?.meta?.total ? Math.ceil(tyreSalesResponse.meta.total / PAGE_SIZE) : 1)
    : (phoneSalesResponse?.meta?.total ? Math.ceil(phoneSalesResponse.meta.total / PAGE_SIZE) : 1);

  const totalQty = isTyre
    ? tyreSales.reduce((sum, s) => sum + s.quantity, 0)
    : phoneSales.reduce((sum, s) => sum + s.quantity, 0);
  const totalRevenue = isTyre
    ? tyreSales.reduce((sum, s) => sum + s.total, 0)
    : phoneSales.reduce((sum, s) => sum + s.total, 0);

  const productOptions = useMemo(() => {
    if (isTyre) {
      const opts = [{ value: '', label: 'All Tyres' }];
      if (tyres) {
        tyres.forEach((t) =>
          opts.push({ value: String(t.id), label: `${t.size} - ${t.brand || 'No Brand'}` }),
        );
      }
      return opts;
    }
    const opts = [{ value: '', label: 'All Phones' }];
    if (phones) {
      phones.forEach((p) =>
        opts.push({ value: String(p.id), label: `${p.brand} ${p.model}` }),
      );
    }
    return opts;
  }, [isTyre, tyres, phones]);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      if (isTyre) {
        await deleteTyreSale.mutateAsync(deleteTarget.id);
      } else {
        await deletePhoneSale.mutateAsync(deleteTarget.id);
      }
      toast('success', 'Sale deleted.');
      setDeleteTarget(null);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Delete failed.');
    }
  }

  const paymentBadge = (method: string) => (
    <Badge
      variant={
        method === 'Cash' ? 'info' : method === 'Mukuru' ? 'success' : 'warning'
      }
    >
      {method}
    </Badge>
  );

  const tyreColumns: Column<Sale>[] = [
    { key: 'sale_date', label: 'Date', sortable: true, render: (s) => formatDate(s.sale_date) },
    {
      key: 'tyre',
      label: 'Tyre',
      render: (s) => formatTyreLabel(s.tyre_size, s.tyre_type, s.tyre_brand, s.tyre_id),
    },
    { key: 'quantity', label: 'Qty', className: 'text-center' },
    { key: 'unit_price', label: 'Unit Price', render: (s) => formatMWK(s.unit_price) },
    { key: 'discount', label: 'Discount', render: (s) => (s.discount > 0 ? `${s.discount}%` : '-') },
    { key: 'total', label: 'Total', render: (s) => formatMWK(s.total) },
    { key: 'payment_method', label: 'Payment', render: (s) => paymentBadge(s.payment_method) },
    { key: 'customer_name', label: 'Customer' },
    ...(user?.role === 'admin'
      ? [{
          key: 'actions' as const,
          label: '',
          className: 'w-10',
          render: (s: Sale) => (
            <button onClick={() => setDeleteTarget(s)} className="p-1 text-slate-400 hover:text-red-600 transition-colors" title="Delete sale">
              <Trash2 size={16} />
            </button>
          ),
        }]
      : []),
  ];

  const phoneColumns: Column<PhoneSale>[] = [
    { key: 'sale_date', label: 'Date', sortable: true, render: (s) => formatDate(s.sale_date) },
    {
      key: 'phone',
      label: 'Phone',
      render: (s) => formatPhoneLabel(s.phone_brand, s.phone_model, s.phone_config, s.phone_id),
    },
    { key: 'quantity', label: 'Qty', className: 'text-center' },
    { key: 'unit_price', label: 'Unit Price', render: (s) => formatMWK(s.unit_price) },
    { key: 'discount', label: 'Discount', render: (s) => (s.discount > 0 ? `${s.discount}%` : '-') },
    { key: 'total', label: 'Total', render: (s) => formatMWK(s.total) },
    { key: 'payment_method', label: 'Payment', render: (s) => paymentBadge(s.payment_method) },
    { key: 'customer_name', label: 'Customer' },
    ...(user?.role === 'admin'
      ? [{
          key: 'actions' as const,
          label: '',
          className: 'w-10',
          render: (s: PhoneSale) => (
            <button onClick={() => setDeleteTarget(s)} className="p-1 text-slate-400 hover:text-red-600 transition-colors" title="Delete sale">
              <Trash2 size={16} />
            </button>
          ),
        }]
      : []),
  ];

  const deleteLabel = deleteTarget
    ? isTyre
      ? formatTyreLabel(
          (deleteTarget as Sale).tyre_size,
          (deleteTarget as Sale).tyre_type,
          (deleteTarget as Sale).tyre_brand,
          (deleteTarget as Sale).tyre_id,
        )
      : formatPhoneLabel(
          (deleteTarget as PhoneSale).phone_brand,
          (deleteTarget as PhoneSale).phone_model,
          (deleteTarget as PhoneSale).phone_config,
          (deleteTarget as PhoneSale).phone_id,
        )
    : '';

  return (
    <MainLayout title="Sales History">
      {/* Filters */}
      <Card className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Input label="Start Date" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} />
          <Input label="End Date" type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} />
          <Select label="Payment Method" options={PAYMENT_FILTER_OPTIONS} value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setPage(1); }} />
          <Select
            label={isTyre ? 'Tyre' : 'Phone'}
            options={productOptions}
            value={productFilter}
            onChange={(e) => { setProductFilter(e.target.value); setPage(1); }}
          />
          <Input label="Customer" type="text" placeholder="Search..." value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); setPage(1); }} />
        </div>
      </Card>

      {/* Summary Row */}
      <div className="flex items-center gap-6 mb-4 text-sm text-slate-600">
        <span>Total Quantity: <strong>{totalQty}</strong></span>
        <span>Total Revenue: <strong>{formatMWK(totalRevenue)}</strong></span>
      </div>

      {/* Sales Table */}
      {isTyre ? (
        <Table
          columns={tyreColumns}
          data={tyreSales}
          keyExtractor={(s) => s.id}
          loading={isLoading}
          emptyMessage="No sales found matching your filters."
        />
      ) : (
        <Table
          columns={phoneColumns}
          data={phoneSales}
          keyExtractor={(s) => s.id}
          loading={isLoading}
          emptyMessage="No sales found matching your filters."
        />
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Delete">
        <p className="text-sm text-slate-600 mb-4">
          Are you sure you want to delete this sale? This action cannot be undone.
        </p>
        {deleteTarget && (
          <div className="text-sm bg-slate-50 p-3 rounded mb-4">
            <p><strong>{isTyre ? 'Tyre' : 'Phone'}:</strong> {deleteLabel}</p>
            <p><strong>Qty:</strong> {deleteTarget.quantity} | <strong>Total:</strong> {formatMWK(deleteTarget.total)}</p>
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            loading={isTyre ? deleteTyreSale.isPending : deletePhoneSale.isPending}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </MainLayout>
  );
}
