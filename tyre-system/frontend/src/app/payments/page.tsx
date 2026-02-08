'use client';

import { useState, FormEvent, useMemo, useRef, useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Table, { Column } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import {
  usePayments,
  useCreatePayment,
  useDeletePayment,
  useReceivables,
} from '@/hooks/usePayments';
import { useProductType } from '@/lib/product-context';
import { formatMWK, formatNumber, formatDate, formatDateISO } from '@/lib/utils';
import { Payment, PaymentMethod, Receivable } from '@/lib/types';
import { Trash2, AlertTriangle } from 'lucide-react';

const PAYMENT_OPTIONS = [
  { value: 'Cash', label: 'Cash' },
  { value: 'Mukuru', label: 'Mukuru' },
  { value: 'Card', label: 'Card' },
];

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: new Date(2000, i).toLocaleString('en', { month: 'long' }),
}));

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => ({
  value: String(currentYear - 2 + i),
  label: String(currentYear - 2 + i),
}));

export default function PaymentsPage() {
  const { toast } = useToast();
  const { productType } = useProductType();
  const now = new Date();
  const today = formatDateISO(now);

  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));

  // Form state
  const [paymentDate, setPaymentDate] = useState(today);
  const [customer, setCustomer] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [amount, setAmount] = useState('');

  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerRef = useRef<HTMLDivElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);

  const { data: payments, isLoading } = usePayments(
    Number(year),
    Number(month),
    productType,
  );
  const { data: receivablesData } = useReceivables(
    Number(year),
    Number(month),
    productType,
  );
  const createPayment = useCreatePayment();
  const deletePayment = useDeletePayment();

  const totalByMethod = useMemo(() => {
    if (!payments) return { Cash: 0, Mukuru: 0, Card: 0 };
    return payments.reduce(
      (acc, p) => {
        acc[p.payment_method] = (acc[p.payment_method] || 0) + p.amount_mwk;
        return acc;
      },
      { Cash: 0, Mukuru: 0, Card: 0 } as Record<string, number>,
    );
  }, [payments]);

  const unpaidCustomers = useMemo(() => {
    if (!receivablesData?.receivables) return [];
    return receivablesData.receivables.filter((r) => r.outstanding > 0);
  }, [receivablesData]);

  const customerSuggestions = useMemo(() => {
    if (!unpaidCustomers.length) return [];
    const q = customer.trim().toLowerCase();
    if (!q) return unpaidCustomers;
    return unpaidCustomers.filter((r) => r.customer.toLowerCase().includes(q));
  }, [unpaidCustomers, customer]);

  const handleSelectCustomer = (r: Receivable) => {
    setCustomer(r.customer);
    setAmount(String(r.outstanding));
    setCustomerDropdownOpen(false);
  };

  // Close customer dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setCustomerDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!customer.trim()) {
      toast('error', 'Please enter a customer name.');
      return;
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      toast('error', 'Please enter a valid amount.');
      return;
    }

    try {
      await createPayment.mutateAsync({
        payment_date: paymentDate,
        customer: customer.trim(),
        payment_method: paymentMethod as PaymentMethod,
        amount_mwk: numAmount,
        product_type: productType,
      });
      toast('success', 'Payment recorded.');
      setCustomer('');
      setAmount('');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to record payment.');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deletePayment.mutateAsync(deleteTarget.id);
      toast('success', 'Payment deleted.');
      setDeleteTarget(null);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to delete payment.');
    }
  }

  const paymentColumns: Column<Payment>[] = [
    {
      key: 'payment_date',
      label: 'Date',
      render: (p) => formatDate(p.payment_date),
    },
    { key: 'customer', label: 'Customer' },
    {
      key: 'payment_method',
      label: 'Method',
      render: (p) => (
        <Badge
          variant={
            p.payment_method === 'Cash'
              ? 'info'
              : p.payment_method === 'Mukuru'
                ? 'success'
                : 'warning'
          }
        >
          {p.payment_method}
        </Badge>
      ),
    },
    {
      key: 'amount_mwk',
      label: 'Amount (MWK)',
      render: (p) => formatMWK(p.amount_mwk),
    },
    {
      key: 'actions' as const,
      label: '',
      className: 'w-10',
      render: (p: Payment) => (
        <button
          onClick={() => setDeleteTarget(p)}
          className="p-1 text-slate-400 hover:text-red-600 transition-colors"
          title="Delete payment"
        >
          <Trash2 size={16} />
        </button>
      ),
    },
  ];

  const receivableColumns: Column<Receivable>[] = [
    { key: 'customer', label: 'Customer' },
    {
      key: 'total_sales',
      label: 'Sales Total',
      render: (r) => formatMWK(r.total_sales),
    },
    {
      key: 'sale_count',
      label: 'Orders',
      className: 'text-center',
    },
    {
      key: 'total_paid',
      label: 'Paid',
      render: (r) => formatMWK(r.total_paid),
    },
    {
      key: 'outstanding',
      label: 'Outstanding',
      render: (r) => (
        <span
          className={
            r.outstanding > 0
              ? 'text-red-600 font-semibold'
              : r.outstanding < 0
                ? 'text-blue-600'
                : 'text-green-600'
          }
        >
          {r.outstanding > 0
            ? formatMWK(r.outstanding)
            : r.outstanding < 0
              ? `Overpaid ${formatMWK(Math.abs(r.outstanding))}`
              : 'Settled'}
        </span>
      ),
    },
  ];

  return (
    <MainLayout title="Payments">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add Payment Form */}
        <Card title="Record Payment">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
            <div ref={customerRef} className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Customer
              </label>
              <input
                type="text"
                value={customer}
                onChange={(e) => {
                  setCustomer(e.target.value);
                  setCustomerDropdownOpen(true);
                }}
                onFocus={() => setCustomerDropdownOpen(true)}
                placeholder="Customer name"
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {customerDropdownOpen && customerSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {customerSuggestions.map((r) => (
                    <button
                      key={r.customer}
                      type="button"
                      onClick={() => handleSelectCustomer(r)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-50 last:border-0"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-slate-700">{r.customer}</span>
                        <span className="text-xs text-red-600 font-medium">
                          {formatNumber(r.outstanding)} MWK unpaid
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {r.sale_count} orders, {formatMWK(r.total_sales)} total sales
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Select
              label="Payment Method"
              options={PAYMENT_OPTIONS}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            />
            <Input
              label="Amount (MWK)"
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
            />
            <Button type="submit" loading={createPayment.isPending} className="w-full">
              Record Payment
            </Button>
          </form>
        </Card>

        {/* Payments List & Summary */}
        <div className="lg:col-span-2 space-y-6">
          {/* Monthly Totals */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <p className="text-xs text-slate-500">Cash Total</p>
              <p className="text-lg font-bold text-slate-900 mt-1">
                {formatMWK(totalByMethod.Cash)}
              </p>
            </Card>
            <Card>
              <p className="text-xs text-slate-500">Mukuru Total</p>
              <p className="text-lg font-bold text-slate-900 mt-1">
                {formatMWK(totalByMethod.Mukuru)}
              </p>
            </Card>
            <Card>
              <p className="text-xs text-slate-500">Card Total</p>
              <p className="text-lg font-bold text-slate-900 mt-1">
                {formatMWK(totalByMethod.Card)}
              </p>
            </Card>
          </div>

          {/* Filter */}
          <div className="flex gap-4">
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
          </div>

          {/* Unpaid Alerts */}
          {unpaidCustomers.length > 0 && (
            <Card
              title="Unpaid Receivables"
              headerRight={
                <Badge variant="danger">
                  {formatMWK(receivablesData?.total_outstanding ?? 0)} outstanding
                </Badge>
              }
            >
              <div className="space-y-2">
                {unpaidCustomers.map((r) => (
                  <div
                    key={r.customer}
                    className="flex items-center justify-between px-3 py-2 bg-red-50 rounded text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} className="text-red-500" />
                      <span className="text-slate-700 font-medium">{r.customer}</span>
                      <span className="text-slate-400">
                        ({r.sale_count} orders, {formatMWK(r.total_sales)} total)
                      </span>
                    </div>
                    <span className="font-semibold text-red-600">
                      {formatMWK(r.outstanding)} unpaid
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Receivables Table */}
          {receivablesData?.receivables && receivablesData.receivables.length > 0 && (
            <Card title="Customer Receivables Summary">
              <Table
                columns={receivableColumns}
                data={receivablesData.receivables}
                keyExtractor={(r) => r.customer}
                emptyMessage="No customer data."
              />
            </Card>
          )}

          {/* Payment Records */}
          <Card title="Payment Records">
            <Table
              columns={paymentColumns}
              data={payments ?? []}
              keyExtractor={(p) => p.id}
              loading={isLoading}
              emptyMessage="No payments recorded for this period."
            />
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Payment"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Are you sure you want to delete this payment?
            </p>
            <div className="text-sm bg-slate-50 p-3 rounded space-y-1">
              <p><strong>Date:</strong> {formatDate(deleteTarget.payment_date)}</p>
              <p><strong>Customer:</strong> {deleteTarget.customer}</p>
              <p><strong>Method:</strong> {deleteTarget.payment_method}</p>
              <p><strong>Amount:</strong> {formatMWK(deleteTarget.amount_mwk)}</p>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={deletePayment.isPending}
                onClick={handleDelete}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </MainLayout>
  );
}
