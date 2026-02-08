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
import { useTyres } from '@/hooks/useTyres';
import { useAuth } from '@/hooks/useAuth';
import { formatMWK, formatDate, formatTyreLabel } from '@/lib/utils';
import { Sale, PaymentMethod } from '@/lib/types';
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
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [tyreFilter, setTyreFilter] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);

  const { data: tyres } = useTyres();
  const deleteSale = useDeleteSale();

  const filters = useMemo(
    () => ({
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      payment_method: (paymentMethod as PaymentMethod) || undefined,
      tyre_id: tyreFilter ? Number(tyreFilter) : undefined,
      customer: customerSearch || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    [startDate, endDate, paymentMethod, tyreFilter, customerSearch, page],
  );

  const { data: salesResponse, isLoading } = useSales(filters);
  const sales = salesResponse?.data ?? [];
  const totalPages = salesResponse?.meta?.total
    ? Math.ceil(salesResponse.meta.total / PAGE_SIZE)
    : 1;

  const totalQty = sales.reduce((sum, s) => sum + s.quantity, 0);
  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);

  const tyreOptions = useMemo(() => {
    const opts = [{ value: '', label: 'All Tyres' }];
    if (tyres) {
      tyres.forEach((t) =>
        opts.push({ value: String(t.id), label: `${t.size} - ${t.brand || 'No Brand'}` }),
      );
    }
    return opts;
  }, [tyres]);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteSale.mutateAsync(deleteTarget.id);
      toast('success', 'Sale deleted.');
      setDeleteTarget(null);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Delete failed.');
    }
  }

  const columns: Column<Sale>[] = [
    {
      key: 'sale_date',
      label: 'Date',
      sortable: true,
      render: (s) => formatDate(s.sale_date),
    },
    {
      key: 'tyre',
      label: 'Tyre',
      render: (s) =>
        formatTyreLabel(s.tyre_size, s.tyre_type, s.tyre_brand, s.tyre_id),
    },
    { key: 'quantity', label: 'Qty', className: 'text-center' },
    {
      key: 'unit_price',
      label: 'Unit Price',
      render: (s) => formatMWK(s.unit_price),
    },
    {
      key: 'discount',
      label: 'Discount',
      render: (s) => (s.discount > 0 ? `${s.discount}%` : '-'),
    },
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
    { key: 'customer_name', label: 'Customer' },
    ...(user?.role === 'admin'
      ? [
          {
            key: 'actions' as const,
            label: '',
            className: 'w-10',
            render: (s: Sale) => (
              <button
                onClick={() => setDeleteTarget(s)}
                className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                title="Delete sale"
              >
                <Trash2 size={16} />
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <MainLayout title="Sales History">
      {/* Filters */}
      <Card className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Input
            label="Start Date"
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
          />
          <Input
            label="End Date"
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
          />
          <Select
            label="Payment Method"
            options={PAYMENT_FILTER_OPTIONS}
            value={paymentMethod}
            onChange={(e) => {
              setPaymentMethod(e.target.value);
              setPage(1);
            }}
          />
          <Select
            label="Tyre"
            options={tyreOptions}
            value={tyreFilter}
            onChange={(e) => {
              setTyreFilter(e.target.value);
              setPage(1);
            }}
          />
          <Input
            label="Customer"
            type="text"
            placeholder="Search..."
            value={customerSearch}
            onChange={(e) => {
              setCustomerSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </Card>

      {/* Summary Row */}
      <div className="flex items-center gap-6 mb-4 text-sm text-slate-600">
        <span>
          Total Quantity: <strong>{totalQty}</strong>
        </span>
        <span>
          Total Revenue: <strong>{formatMWK(totalRevenue)}</strong>
        </span>
      </div>

      {/* Sales Table */}
      <Table
        columns={columns}
        data={sales}
        keyExtractor={(s) => s.id}
        loading={isLoading}
        emptyMessage="No sales found matching your filters."
      />

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Confirm Delete"
      >
        <p className="text-sm text-slate-600 mb-4">
          Are you sure you want to delete this sale? This action cannot be undone.
        </p>
        {deleteTarget && (
          <div className="text-sm bg-slate-50 p-3 rounded mb-4">
            <p>
              <strong>Tyre:</strong>{' '}
              {formatTyreLabel(deleteTarget.tyre_size, deleteTarget.tyre_type, deleteTarget.tyre_brand, deleteTarget.tyre_id)}
            </p>
            <p>
              <strong>Qty:</strong> {deleteTarget.quantity} |{' '}
              <strong>Total:</strong> {formatMWK(deleteTarget.total)}
            </p>
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={deleteSale.isPending}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </MainLayout>
  );
}
