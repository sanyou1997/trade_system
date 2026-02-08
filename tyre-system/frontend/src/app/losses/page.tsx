'use client';

import { useState, FormEvent, useMemo } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import Table, { Column } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { useLosses, useCreateLoss, useDeleteLoss } from '@/hooks/useLosses';
import { usePhoneLosses, useCreatePhoneLoss, useDeletePhoneLoss } from '@/hooks/usePhoneLosses';
import { useTyresWithStock } from '@/hooks/useTyres';
import { usePhonesWithStock } from '@/hooks/usePhones';
import { useProductType } from '@/lib/product-context';
import { formatMWK, formatDate, formatDateISO, formatPhoneLabel } from '@/lib/utils';
import { Loss, PhoneLoss, LossType } from '@/lib/types';
import { Trash2 } from 'lucide-react';

const LOSS_TYPE_OPTIONS = [
  { value: 'broken', label: 'Broken' },
  { value: 'exchange', label: 'Exchange' },
  { value: 'refund', label: 'Refund' },
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

export default function LossesPage() {
  const { toast } = useToast();
  const { isTyre } = useProductType();
  const now = new Date();
  const today = formatDateISO(now);

  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));

  // Form state
  const [lossDate, setLossDate] = useState(today);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [lossType, setLossType] = useState<string>('broken');
  const [refundAmount, setRefundAmount] = useState('0');
  const [notes, setNotes] = useState('');

  // Tyre hooks
  const { data: tyres } = useTyresWithStock();
  const { data: tyreLosses, isLoading: tyreLoading } = useLosses(Number(year), Number(month));
  const createTyreLoss = useCreateLoss();
  const deleteTyreLoss = useDeleteLoss();

  // Phone hooks
  const { data: phones } = usePhonesWithStock();
  const { data: phoneLosses, isLoading: phoneLoading } = usePhoneLosses(Number(year), Number(month));
  const createPhoneLoss = useCreatePhoneLoss();
  const deletePhoneLoss = useDeletePhoneLoss();

  const isLoading = isTyre ? tyreLoading : phoneLoading;

  const productOptions = useMemo(() => {
    if (isTyre) {
      if (!tyres) return [];
      return tyres.map((t) => ({
        value: String(t.id),
        label: `${t.size} - ${t.brand || 'No Brand'} (Stock: ${t.remaining_stock})`,
      }));
    }
    if (!phones) return [];
    return phones.map((p) => ({
      value: String(p.id),
      label: `${p.brand} ${p.model} ${p.config ? `(${p.config})` : ''} (Stock: ${p.remaining_stock})`,
    }));
  }, [isTyre, tyres, phones]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!productId) {
      toast('error', `Please select a ${isTyre ? 'tyre' : 'phone'}.`);
      return;
    }

    const qty = Number(quantity);
    if (qty <= 0) {
      toast('error', 'Quantity must be greater than 0.');
      return;
    }

    try {
      if (isTyre) {
        await createTyreLoss.mutateAsync({
          loss_date: lossDate,
          tyre_id: Number(productId),
          quantity: qty,
          loss_type: lossType as LossType,
          refund_amount: Number(refundAmount) || 0,
          notes: notes.trim(),
        });
      } else {
        await createPhoneLoss.mutateAsync({
          loss_date: lossDate,
          phone_id: Number(productId),
          quantity: qty,
          loss_type: lossType as LossType,
          refund_amount: Number(refundAmount) || 0,
          notes: notes.trim(),
        });
      }
      toast('success', 'Loss recorded.');
      setProductId('');
      setQuantity('1');
      setRefundAmount('0');
      setNotes('');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to record loss.');
    }
  }

  async function handleDeleteTyre(loss: Loss) {
    if (!confirm(`Delete loss record #${loss.id}?`)) return;
    try {
      await deleteTyreLoss.mutateAsync(loss.id);
      toast('success', 'Loss deleted.');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to delete.');
    }
  }

  async function handleDeletePhone(loss: PhoneLoss) {
    if (!confirm(`Delete loss record #${loss.id}?`)) return;
    try {
      await deletePhoneLoss.mutateAsync(loss.id);
      toast('success', 'Loss deleted.');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to delete.');
    }
  }

  const lossTypeVariant = (type: string) => {
    switch (type) {
      case 'broken': return 'danger' as const;
      case 'exchange': return 'warning' as const;
      case 'refund': return 'info' as const;
      default: return 'default' as const;
    }
  };

  const tyreColumns: Column<Loss>[] = [
    {
      key: 'loss_date',
      label: 'Date',
      render: (l) => formatDate(l.loss_date),
    },
    {
      key: 'tyre',
      label: 'Tyre',
      render: (l) =>
        l.tyre_size
          ? `${l.tyre_size} - ${l.tyre_brand || 'No Brand'}`
          : `#${l.tyre_id}`,
    },
    { key: 'quantity', label: 'Qty', className: 'text-center' },
    {
      key: 'loss_type',
      label: 'Type',
      render: (l) => (
        <Badge variant={lossTypeVariant(l.loss_type)}>
          {l.loss_type.charAt(0).toUpperCase() + l.loss_type.slice(1)}
        </Badge>
      ),
    },
    {
      key: 'refund_amount',
      label: 'Refund',
      render: (l) => (l.refund_amount > 0 ? formatMWK(l.refund_amount) : '-'),
    },
    { key: 'notes', label: 'Notes' },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (l) => (
        <button
          onClick={() => handleDeleteTyre(l)}
          className="p-1 text-slate-400 hover:text-red-500 transition-colors"
          title="Delete"
        >
          <Trash2 size={16} />
        </button>
      ),
    },
  ];

  const phoneColumns: Column<PhoneLoss>[] = [
    {
      key: 'loss_date',
      label: 'Date',
      render: (l) => formatDate(l.loss_date),
    },
    {
      key: 'phone',
      label: 'Phone',
      render: (l) => formatPhoneLabel(l.phone_brand, l.phone_model, undefined, l.phone_id),
    },
    { key: 'quantity', label: 'Qty', className: 'text-center' },
    {
      key: 'loss_type',
      label: 'Type',
      render: (l) => (
        <Badge variant={lossTypeVariant(l.loss_type)}>
          {l.loss_type.charAt(0).toUpperCase() + l.loss_type.slice(1)}
        </Badge>
      ),
    },
    {
      key: 'refund_amount',
      label: 'Refund',
      render: (l) => (l.refund_amount > 0 ? formatMWK(l.refund_amount) : '-'),
    },
    { key: 'notes', label: 'Notes' },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (l) => (
        <button
          onClick={() => handleDeletePhone(l)}
          className="p-1 text-slate-400 hover:text-red-500 transition-colors"
          title="Delete"
        >
          <Trash2 size={16} />
        </button>
      ),
    },
  ];

  return (
    <MainLayout title="Losses">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Loss Form */}
        <Card title="Record Loss">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Date"
              type="date"
              value={lossDate}
              onChange={(e) => setLossDate(e.target.value)}
            />
            <Select
              label={isTyre ? 'Tyre' : 'Phone'}
              options={productOptions}
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder={`-- Select ${isTyre ? 'Tyre' : 'Phone'} --`}
            />
            <Input
              label="Quantity"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <Select
              label="Loss Type"
              options={LOSS_TYPE_OPTIONS}
              value={lossType}
              onChange={(e) => setLossType(e.target.value)}
            />
            <Input
              label="Refund Amount (MWK)"
              type="number"
              min="0"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
            />
            <Input
              label="Notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
            <Button
              type="submit"
              loading={isTyre ? createTyreLoss.isPending : createPhoneLoss.isPending}
              className="w-full"
            >
              Record Loss
            </Button>
          </form>
        </Card>

        {/* Losses List */}
        <div className="lg:col-span-2 space-y-4">
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

          {isTyre ? (
            <Table
              columns={tyreColumns}
              data={tyreLosses ?? []}
              keyExtractor={(l) => l.id}
              loading={isLoading}
              emptyMessage="No losses recorded for this period."
            />
          ) : (
            <Table
              columns={phoneColumns}
              data={phoneLosses ?? []}
              keyExtractor={(l) => l.id}
              loading={isLoading}
              emptyMessage="No losses recorded for this period."
            />
          )}
        </div>
      </div>
    </MainLayout>
  );
}
