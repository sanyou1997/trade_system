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
import { useTyresWithStock } from '@/hooks/useTyres';
import { formatMWK, formatDate, formatDateISO } from '@/lib/utils';
import { Loss, LossType } from '@/lib/types';
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
  const now = new Date();
  const today = formatDateISO(now);

  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));

  // Form state
  const [lossDate, setLossDate] = useState(today);
  const [tyreId, setTyreId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [lossType, setLossType] = useState<string>('broken');
  const [refundAmount, setRefundAmount] = useState('0');
  const [notes, setNotes] = useState('');

  const { data: tyres } = useTyresWithStock();
  const { data: losses, isLoading } = useLosses(Number(year), Number(month));
  const createLoss = useCreateLoss();
  const deleteLoss = useDeleteLoss();

  const tyreOptions = useMemo(() => {
    if (!tyres) return [];
    return tyres.map((t) => ({
      value: String(t.id),
      label: `${t.size} - ${t.brand || 'No Brand'} (Stock: ${t.remaining_stock})`,
    }));
  }, [tyres]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!tyreId) {
      toast('error', 'Please select a tyre.');
      return;
    }

    const qty = Number(quantity);
    if (qty <= 0) {
      toast('error', 'Quantity must be greater than 0.');
      return;
    }

    try {
      await createLoss.mutateAsync({
        loss_date: lossDate,
        tyre_id: Number(tyreId),
        quantity: qty,
        loss_type: lossType as LossType,
        refund_amount: Number(refundAmount) || 0,
        notes: notes.trim(),
      });
      toast('success', 'Loss recorded.');
      setTyreId('');
      setQuantity('1');
      setRefundAmount('0');
      setNotes('');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to record loss.');
    }
  }

  async function handleDelete(loss: Loss) {
    if (!confirm(`Delete loss record #${loss.id}?`)) return;
    try {
      await deleteLoss.mutateAsync(loss.id);
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

  const columns: Column<Loss>[] = [
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
          onClick={() => handleDelete(l)}
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
              label="Tyre"
              options={tyreOptions}
              value={tyreId}
              onChange={(e) => setTyreId(e.target.value)}
              placeholder="-- Select Tyre --"
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
            <Button type="submit" loading={createLoss.isPending} className="w-full">
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

          <Table
            columns={columns}
            data={losses ?? []}
            keyExtractor={(l) => l.id}
            loading={isLoading}
            emptyMessage="No losses recorded for this period."
          />
        </div>
      </div>
    </MainLayout>
  );
}
