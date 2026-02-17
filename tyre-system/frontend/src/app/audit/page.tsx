'use client';

import { useState, FormEvent, useMemo, useRef } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Table, { Column } from '@/components/ui/Table';
import Pagination from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';
import {
  useAuditAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  useAccountBalances,
  useRevenueBreakdown,
  useSetBalanceOverride,
  useClearBalanceOverride,
  useAuditTransactions,
  useCreateExpense,
  useCreateTransfer,
  useCreateExchange,
  useCreateIncome,
  useDeleteTransaction,
  useUploadReceipt,
  useImportAudit,
} from '@/hooks/useAudit';
import { formatMWK, formatDate, formatDateISO, cn } from '@/lib/utils';
import type {
  AuditTransaction,
  TransactionType,
  AccountBalance,
  AuditAccount,
} from '@/lib/types';
import {
  Trash2,
  Plus,
  Image as ImageIcon,
  Upload,
  X,
  Edit2,
  Wallet,
  RotateCcw,
  Check,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

/** Format a raw number string with thousand separators. Returns display string. */
function formatWithSeparators(value: string): string {
  const num = value.replace(/[^0-9.]/g, '');
  const parts = num.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

/** Strip separators to get raw number string. */
function stripSeparators(value: string): string {
  return value.replace(/,/g, '');
}

type TabType = 'expense' | 'transfer' | 'exchange' | 'income';

const TAB_OPTIONS: { value: TabType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'exchange', label: 'Exchange' },
  { value: 'income', label: 'Income' },
];

const TYPE_FILTER_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'exchange', label: 'Exchange' },
  { value: 'income', label: 'Income' },
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

function typeBadgeVariant(type: TransactionType): 'danger' | 'info' | 'success' | 'warning' {
  switch (type) {
    case 'expense': return 'danger';
    case 'transfer': return 'info';
    case 'exchange': return 'warning';
    case 'income': return 'success';
  }
}

export default function AuditPage() {
  const { toast } = useToast();
  const now = new Date();
  const today = formatDateISO(now);

  // Filters
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [typeFilter, setTypeFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [page, setPage] = useState(1);

  // Form tab
  const [activeTab, setActiveTab] = useState<TabType>('expense');

  // Expense form
  const [expDate, setExpDate] = useState(today);
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expAccountId, setExpAccountId] = useState('');
  const [expReceipt, setExpReceipt] = useState('');
  const [expNote, setExpNote] = useState('');
  const [expImage, setExpImage] = useState<File | null>(null);

  // Transfer form
  const [xferDate, setXferDate] = useState(today);
  const [xferAmount, setXferAmount] = useState('');
  const [xferFromId, setXferFromId] = useState('');
  const [xferToId, setXferToId] = useState('');
  const [xferDesc, setXferDesc] = useState('');
  const [xferNote, setXferNote] = useState('');
  const [xferImage, setXferImage] = useState<File | null>(null);

  // Exchange form
  const [excDate, setExcDate] = useState(today);
  const [excAmountMwk, setExcAmountMwk] = useState('');
  const [excRate, setExcRate] = useState('');
  const [excAmountCny, setExcAmountCny] = useState('');
  const [excAccountId, setExcAccountId] = useState('');
  const [excDesc, setExcDesc] = useState('');
  const [excNote, setExcNote] = useState('');

  // Income form
  const [incDate, setIncDate] = useState(today);
  const [incDesc, setIncDesc] = useState('');
  const [incAmount, setIncAmount] = useState('');
  const [incAccountId, setIncAccountId] = useState('');
  const [incNote, setIncNote] = useState('');

  // Modals
  const [deleteTarget, setDeleteTarget] = useState<AuditTransaction | null>(null);
  const [receiptModal, setReceiptModal] = useState<string | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editAccount, setEditAccount] = useState<AuditAccount | null>(null);
  const [newAcctName, setNewAcctName] = useState('');
  const [newAcctDesc, setNewAcctDesc] = useState('');
  const [newAcctBalance, setNewAcctBalance] = useState('0');

  // Import
  const [importFile, setImportFile] = useState<File | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: accounts } = useAuditAccounts();
  const { data: balances } = useAccountBalances(
    Number(year),
    Number(month),
  );
  const { data: revenue } = useRevenueBreakdown(Number(year), Number(month));
  const { data: txnResponse, isLoading: txnLoading } = useAuditTransactions(
    Number(year),
    Number(month),
    (typeFilter || undefined) as TransactionType | undefined,
    accountFilter ? Number(accountFilter) : undefined,
    page,
  );

  const transactions = txnResponse?.data ?? [];
  const txnTotal = txnResponse?.meta?.total ?? 0;

  // Mutations
  const createExpense = useCreateExpense();
  const createTransfer = useCreateTransfer();
  const createExchange = useCreateExchange();
  const createIncome = useCreateIncome();
  const deleteTxn = useDeleteTransaction();
  const uploadReceipt = useUploadReceipt();
  const importAudit = useImportAudit();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const setOverride = useSetBalanceOverride();
  const clearOverride = useClearBalanceOverride();

  // Inline initial balance editing
  const [editingInitialId, setEditingInitialId] = useState<number | null>(null);
  const [editingInitialValue, setEditingInitialValue] = useState('');

  // Account options for selects
  const accountOptions = useMemo(() => {
    if (!accounts) return [];
    return accounts.map((a) => ({
      value: String(a.id),
      label: a.is_default ? `${a.name} (default)` : a.name,
    }));
  }, [accounts]);

  const accountFilterOptions = useMemo(
    () => [{ value: '', label: 'All Accounts' }, ...accountOptions],
    [accountOptions],
  );

  // Set default account on first load
  useMemo(() => {
    if (accounts?.length && !expAccountId) {
      const def = accounts.find((a) => a.is_default) ?? accounts[0];
      setExpAccountId(String(def.id));
      setExcAccountId(String(def.id));
      setIncAccountId(String(def.id));
      if (accounts.length >= 2) {
        setXferFromId(String(accounts[0].id));
        setXferToId(String(accounts[1].id));
      }
    }
  }, [accounts]);

  // Auto-calc CNY from MWK and rate
  const handleExcMwkChange = (val: string) => {
    setExcAmountMwk(val);
    const raw = stripSeparators(val);
    if (raw && excRate) setExcAmountCny(formatWithSeparators(String(Math.round(Number(raw) / Number(excRate)))));
  };
  const handleExcRateChange = (val: string) => {
    setExcRate(val);
    const rawMwk = stripSeparators(excAmountMwk);
    if (rawMwk && val) setExcAmountCny(formatWithSeparators(String(Math.round(Number(rawMwk) / Number(val)))));
  };

  // Handlers
  async function handleExpenseSubmit(e: FormEvent) {
    e.preventDefault();
    const rawAmount = stripSeparators(expAmount);
    if (!expDesc.trim() || !rawAmount || !expAccountId) {
      toast('error', 'Please fill in all required fields.');
      return;
    }
    try {
      const txn = await createExpense.mutateAsync({
        transaction_date: expDate,
        description: expDesc.trim(),
        amount_mwk: Number(rawAmount),
        account_id: Number(expAccountId),
        receipt_info: expReceipt.trim() || undefined,
        note: expNote.trim() || undefined,
      });
      if (expImage && txn?.id) {
        await uploadReceipt.mutateAsync({ txnId: txn.id, file: expImage });
      }
      toast('success', 'Expense recorded.');
      setExpDesc('');
      setExpAmount('');
      setExpReceipt('');
      setExpNote('');
      setExpImage(null);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to record expense.');
    }
  }

  async function handleTransferSubmit(e: FormEvent) {
    e.preventDefault();
    const rawAmount = stripSeparators(xferAmount);
    if (!rawAmount || !xferFromId || !xferToId) {
      toast('error', 'Please fill in all required fields.');
      return;
    }
    if (xferFromId === xferToId) {
      toast('error', 'Cannot transfer to the same account.');
      return;
    }
    try {
      const txn = await createTransfer.mutateAsync({
        transaction_date: xferDate,
        amount_mwk: Number(rawAmount),
        from_account_id: Number(xferFromId),
        to_account_id: Number(xferToId),
        description: xferDesc.trim() || undefined,
        note: xferNote.trim() || undefined,
      });
      if (xferImage && txn?.id) {
        await uploadReceipt.mutateAsync({ txnId: txn.id, file: xferImage });
      }
      toast('success', 'Transfer recorded.');
      setXferAmount('');
      setXferDesc('');
      setXferNote('');
      setXferImage(null);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to record transfer.');
    }
  }

  async function handleExchangeSubmit(e: FormEvent) {
    e.preventDefault();
    const rawMwk = stripSeparators(excAmountMwk);
    const rawCny = stripSeparators(excAmountCny);
    if (!rawMwk || !excRate || !rawCny || !excAccountId) {
      toast('error', 'Please fill in all required fields.');
      return;
    }
    try {
      await createExchange.mutateAsync({
        transaction_date: excDate,
        amount_mwk: Number(rawMwk),
        exchange_rate: Number(excRate),
        amount_cny: Number(rawCny),
        account_id: Number(excAccountId),
        description: excDesc.trim() || undefined,
        note: excNote.trim() || undefined,
      });
      toast('success', 'Exchange recorded.');
      setExcAmountMwk('');
      setExcRate('');
      setExcAmountCny('');
      setExcDesc('');
      setExcNote('');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to record exchange.');
    }
  }

  async function handleIncomeSubmit(e: FormEvent) {
    e.preventDefault();
    const rawAmount = stripSeparators(incAmount);
    if (!incDesc.trim() || !rawAmount || !incAccountId) {
      toast('error', 'Please fill in all required fields.');
      return;
    }
    try {
      await createIncome.mutateAsync({
        transaction_date: incDate,
        description: incDesc.trim(),
        amount_mwk: Number(rawAmount),
        account_id: Number(incAccountId),
        note: incNote.trim() || undefined,
      });
      toast('success', 'Income recorded.');
      setIncDesc('');
      setIncAmount('');
      setIncNote('');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to record income.');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteTxn.mutateAsync(deleteTarget.id);
      toast('success', 'Transaction deleted.');
      setDeleteTarget(null);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to delete.');
    }
  }

  async function handleImport() {
    if (!importFile) return;
    try {
      const result = await importAudit.mutateAsync(importFile);
      toast(
        'success',
        `Imported: ${result.expenses_imported} expenses, ${result.exchanges_imported} exchanges. Skipped: ${result.skipped}.`,
      );
      setImportFile(null);
      if (importInputRef.current) importInputRef.current.value = '';
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Import failed.');
    }
  }

  async function handleCreateAccount() {
    if (!newAcctName.trim()) {
      toast('error', 'Please enter an account name.');
      return;
    }
    try {
      await createAccount.mutateAsync({
        name: newAcctName.trim(),
        description: newAcctDesc.trim() || undefined,
        initial_balance: Number(newAcctBalance) || 0,
        is_default: false,
      });
      toast('success', 'Account created.');
      setNewAcctName('');
      setNewAcctDesc('');
      setNewAcctBalance('0');
      setShowAccountModal(false);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to create account.');
    }
  }

  async function handleUpdateAccount() {
    if (!editAccount) return;
    try {
      await updateAccount.mutateAsync({
        id: editAccount.id,
        data: {
          name: editAccount.name,
          description: editAccount.description ?? undefined,
          initial_balance: editAccount.initial_balance,
        },
      });
      toast('success', 'Account updated.');
      setEditAccount(null);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to update account.');
    }
  }

  async function handleDeleteAccount(id: number) {
    try {
      await deleteAccount.mutateAsync(id);
      toast('success', 'Account deleted.');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to delete account.');
    }
  }

  // Table columns
  const txnColumns: Column<AuditTransaction>[] = [
    {
      key: 'transaction_date',
      label: 'Date',
      render: (t) => formatDate(t.transaction_date),
    },
    {
      key: 'transaction_type',
      label: 'Type',
      render: (t) => (
        <Badge variant={typeBadgeVariant(t.transaction_type)}>
          {t.transaction_type}
        </Badge>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      render: (t) => (
        <span className="text-sm truncate max-w-[200px] inline-block" title={t.description ?? ''}>
          {t.description || '-'}
        </span>
      ),
    },
    {
      key: 'amount_mwk',
      label: 'Amount',
      render: (t) => (
        <span className={t.transaction_type === 'income' ? 'text-green-600' : ''}>
          {formatMWK(t.amount_mwk)}
        </span>
      ),
    },
    {
      key: 'account_name',
      label: 'Account',
      render: (t) => {
        if (t.transaction_type === 'transfer') {
          return (
            <span className="text-xs">
              {t.from_account_name} → {t.to_account_name}
            </span>
          );
        }
        return t.account_name || '-';
      },
    },
    {
      key: 'receipt_image',
      label: 'Receipt',
      className: 'w-20',
      render: (t) =>
        t.receipt_image ? (
          <button
            onClick={() => setReceiptModal(t.receipt_image)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
            title="View receipt"
          >
            <ImageIcon size={14} />
            View
          </button>
        ) : (t.transaction_type === 'expense' || t.transaction_type === 'transfer') ? (
          <label
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded cursor-pointer transition-colors"
            title="Upload receipt"
          >
            <Upload size={14} />
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  await uploadReceipt.mutateAsync({ txnId: t.id, file });
                  toast('success', 'Receipt uploaded.');
                } catch (err) {
                  toast('error', err instanceof Error ? err.message : 'Upload failed.');
                }
                e.target.value = '';
              }}
            />
          </label>
        ) : null,
    },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (t) => (
        <button
          onClick={() => setDeleteTarget(t)}
          className="p-1 text-slate-400 hover:text-red-600 transition-colors"
          title="Delete"
        >
          <Trash2 size={16} />
        </button>
      ),
    },
  ];

  const isSubmitting =
    createExpense.isPending ||
    createTransfer.isPending ||
    createExchange.isPending ||
    createIncome.isPending ||
    uploadReceipt.isPending;

  return (
    <MainLayout title="Cost & Audit">
      {/* Year/Month Selector */}
      <div className="flex gap-4 mb-6">
        <Select
          label="Year"
          options={YEAR_OPTIONS}
          value={year}
          onChange={(e) => { setYear(e.target.value); setPage(1); }}
          className="w-28"
        />
        <Select
          label="Month"
          options={MONTH_OPTIONS}
          value={month}
          onChange={(e) => { setMonth(e.target.value); setPage(1); }}
          className="w-36"
        />
      </div>

      {/* Section 1: Account Balance Cards */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-semibold text-slate-800">Account Balances</h2>
          <span className="text-xs text-slate-400">(for selected month)</span>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {balances?.map((b: AccountBalance) => (
            <div
              key={b.id}
              className="min-w-[220px] bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex-shrink-0"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Wallet size={14} className="text-slate-400" />
                  <span className="font-semibold text-slate-800">{b.name}</span>
                  {b.is_default && (
                    <Badge variant="info">default</Badge>
                  )}
                </div>
                <button
                  onClick={() => {
                    const acct = accounts?.find((a) => a.id === b.id);
                    if (acct) setEditAccount({ ...acct });
                  }}
                  className="p-0.5 text-slate-300 hover:text-slate-600"
                  title="Edit account"
                >
                  <Edit2 size={12} />
                </button>
              </div>
              <div className="space-y-0.5 text-xs text-slate-500">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">
                    Initial
                    {b.has_override && (
                      <button
                        onClick={async () => {
                          try {
                            await clearOverride.mutateAsync({ accountId: b.id, year: Number(year), month: Number(month) });
                            toast('success', 'Reverted to auto-calculated initial.');
                          } catch (err) {
                            toast('error', err instanceof Error ? err.message : 'Failed.');
                          }
                        }}
                        className="text-orange-500 hover:text-orange-700"
                        title="Reset to auto-calculated"
                      >
                        <RotateCcw size={10} />
                      </button>
                    )}
                  </span>
                  {editingInitialId === b.id ? (
                    <form
                      className="flex items-center gap-1"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const raw = stripSeparators(editingInitialValue);
                        if (!raw) return;
                        try {
                          await setOverride.mutateAsync({
                            accountId: b.id,
                            year: Number(year),
                            month: Number(month),
                            value: Number(raw),
                          });
                          setEditingInitialId(null);
                        } catch (err) {
                          toast('error', err instanceof Error ? err.message : 'Failed.');
                        }
                      }}
                    >
                      <input
                        autoFocus
                        className="w-24 px-1 py-0 text-xs border border-slate-300 rounded text-right"
                        value={editingInitialValue}
                        onChange={(e) => setEditingInitialValue(formatWithSeparators(e.target.value))}
                        inputMode="numeric"
                      />
                      <button type="submit" className="text-green-600 hover:text-green-800"><Check size={12} /></button>
                      <button type="button" onClick={() => setEditingInitialId(null)} className="text-slate-400 hover:text-slate-600"><X size={12} /></button>
                    </form>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingInitialId(b.id);
                        setEditingInitialValue(formatWithSeparators(String(Math.round(b.prev_balance))));
                      }}
                      className={cn(
                        'hover:underline cursor-pointer',
                        b.has_override ? 'text-orange-600 font-medium' : '',
                      )}
                      title="Click to edit initial balance"
                    >
                      {formatMWK(b.prev_balance)}
                    </button>
                  )}
                </div>
                {b.auto_revenue > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>+ Revenue</span>
                    <span>{formatMWK(b.auto_revenue)}</span>
                  </div>
                )}
                {b.manual_income > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>+ Income</span>
                    <span>{formatMWK(b.manual_income)}</span>
                  </div>
                )}
                {b.total_expenses > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>- Expenses</span>
                    <span>{formatMWK(b.total_expenses)}</span>
                  </div>
                )}
                {b.total_exchanges > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>- Exchange</span>
                    <span>{formatMWK(b.total_exchanges)}</span>
                  </div>
                )}
                {b.transfers_in > 0 && (
                  <div className="flex justify-between text-blue-600">
                    <span>+ Transfers in</span>
                    <span>{formatMWK(b.transfers_in)}</span>
                  </div>
                )}
                {b.transfers_out > 0 && (
                  <div className="flex justify-between text-blue-600">
                    <span>- Transfers out</span>
                    <span>{formatMWK(b.transfers_out)}</span>
                  </div>
                )}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between items-center">
                <span className="text-xs font-medium text-slate-600">Balance</span>
                <span
                  className={cn(
                    'text-sm font-bold',
                    b.calculated_balance >= 0 ? 'text-green-700' : 'text-red-700',
                  )}
                >
                  {formatMWK(b.calculated_balance)}
                </span>
              </div>
            </div>
          ))}

          {/* Add Account Button */}
          <button
            onClick={() => setShowAccountModal(true)}
            className="min-w-[100px] border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors flex-shrink-0"
          >
            <Plus size={20} />
            <span className="text-xs mt-1">Add Account</span>
          </button>
        </div>
      </div>

      {/* Section 2: Revenue Breakdown */}
      {revenue && (
        <Card title="Revenue This Month (Auto-calculated)" className="mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Tyre Sales</p>
              <div className="text-sm space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-slate-600">Cash</span>
                  <span className="font-medium">{formatMWK(revenue.tyre_cash)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Mukuru</span>
                  <span className="font-medium">{formatMWK(revenue.tyre_mukuru)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Card</span>
                  <span className="font-medium">{formatMWK(revenue.tyre_card)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-100 font-semibold">
                  <span>Total</span>
                  <span>{formatMWK(revenue.tyre_total)}</span>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Phone Sales</p>
              <div className="text-sm space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-slate-600">Cash</span>
                  <span className="font-medium">{formatMWK(revenue.phone_cash)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Mukuru</span>
                  <span className="font-medium">{formatMWK(revenue.phone_mukuru)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Card</span>
                  <span className="font-medium">{formatMWK(revenue.phone_card)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-100 font-semibold">
                  <span>Total</span>
                  <span>{formatMWK(revenue.phone_total)}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between text-base font-bold">
            <span>Grand Total</span>
            <span className="text-green-700">{formatMWK(revenue.grand_total)}</span>
          </div>
        </Card>
      )}

      {/* Section 3: Form + Transaction History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transaction Form */}
        <Card>
          {/* Tab Switcher */}
          <div className="flex border-b border-slate-200 mb-4 -mt-2">
            {TAB_OPTIONS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
                  activeTab === tab.value
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Expense Form */}
          {activeTab === 'expense' && (
            <form onSubmit={handleExpenseSubmit} className="space-y-3">
              <Input label="Date" type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} />
              <Input label="Description *" value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="e.g., Office supplies" />
              <Input label="Amount (MWK) *" value={expAmount} onChange={(e) => setExpAmount(formatWithSeparators(e.target.value))} placeholder="e.g., 1,000,000" inputMode="numeric" />
              <Select label="Account *" options={accountOptions} value={expAccountId} onChange={(e) => setExpAccountId(e.target.value)} />
              <Input label="Receipt Note" value={expReceipt} onChange={(e) => setExpReceipt(e.target.value)} placeholder="Receipt reference" />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Receipt Image</label>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-sm text-slate-700 transition-colors">
                    <Upload size={14} />
                    {expImage ? expImage.name : 'Choose file'}
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp"
                      className="hidden"
                      onChange={(e) => setExpImage(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {expImage && (
                    <button type="button" onClick={() => setExpImage(null)} className="text-slate-400 hover:text-red-500">
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
              <Input label="Note" value={expNote} onChange={(e) => setExpNote(e.target.value)} placeholder="Optional note" />
              <Button type="submit" loading={isSubmitting} className="w-full">Record Expense</Button>
            </form>
          )}

          {/* Transfer Form */}
          {activeTab === 'transfer' && (
            <form onSubmit={handleTransferSubmit} className="space-y-3">
              <Input label="Date" type="date" value={xferDate} onChange={(e) => setXferDate(e.target.value)} />
              <Select label="From Account *" options={accountOptions} value={xferFromId} onChange={(e) => setXferFromId(e.target.value)} />
              <Select label="To Account *" options={accountOptions} value={xferToId} onChange={(e) => setXferToId(e.target.value)} />
              <Input label="Amount (MWK) *" value={xferAmount} onChange={(e) => setXferAmount(formatWithSeparators(e.target.value))} placeholder="e.g., 1,000,000" inputMode="numeric" />
              <Input label="Description" value={xferDesc} onChange={(e) => setXferDesc(e.target.value)} placeholder="e.g., Profit share" />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Receipt Image</label>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-sm text-slate-700 transition-colors">
                    <Upload size={14} />
                    {xferImage ? xferImage.name : 'Choose file'}
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp"
                      className="hidden"
                      onChange={(e) => setXferImage(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {xferImage && (
                    <button type="button" onClick={() => setXferImage(null)} className="text-slate-400 hover:text-red-500">
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
              <Input label="Note" value={xferNote} onChange={(e) => setXferNote(e.target.value)} placeholder="Optional note" />
              <Button type="submit" loading={isSubmitting} className="w-full">Record Transfer</Button>
            </form>
          )}

          {/* Exchange Form */}
          {activeTab === 'exchange' && (
            <form onSubmit={handleExchangeSubmit} className="space-y-3">
              <Input label="Date" type="date" value={excDate} onChange={(e) => setExcDate(e.target.value)} />
              <Input label="Amount MWK *" value={excAmountMwk} onChange={(e) => handleExcMwkChange(e.target.value)} placeholder="e.g., 1,000,000" inputMode="numeric" />
              <Input label="Exchange Rate *" type="number" min="0" step="0.01" value={excRate} onChange={(e) => handleExcRateChange(e.target.value)} placeholder="MWK per CNY" />
              <Input label="Amount CNY *" value={excAmountCny} onChange={(e) => setExcAmountCny(formatWithSeparators(e.target.value))} placeholder="CNY amount" inputMode="numeric" />
              <Select label="Account *" options={accountOptions} value={excAccountId} onChange={(e) => setExcAccountId(e.target.value)} />
              <Input label="Description" value={excDesc} onChange={(e) => setExcDesc(e.target.value)} placeholder="e.g., Mukuru exchange" />
              <Input label="Note" value={excNote} onChange={(e) => setExcNote(e.target.value)} placeholder="Optional note" />
              <Button type="submit" loading={isSubmitting} className="w-full">Record Exchange</Button>
            </form>
          )}

          {/* Income Form */}
          {activeTab === 'income' && (
            <form onSubmit={handleIncomeSubmit} className="space-y-3">
              <Input label="Date" type="date" value={incDate} onChange={(e) => setIncDate(e.target.value)} />
              <Input label="Description *" value={incDesc} onChange={(e) => setIncDesc(e.target.value)} placeholder="e.g., Refund received" />
              <Input label="Amount (MWK) *" value={incAmount} onChange={(e) => setIncAmount(formatWithSeparators(e.target.value))} placeholder="e.g., 1,000,000" inputMode="numeric" />
              <Select label="Account *" options={accountOptions} value={incAccountId} onChange={(e) => setIncAccountId(e.target.value)} />
              <Input label="Note" value={incNote} onChange={(e) => setIncNote(e.target.value)} placeholder="Optional note" />
              <Button type="submit" loading={isSubmitting} className="w-full">Record Income</Button>
            </form>
          )}
        </Card>

        {/* Transaction History */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filters */}
          <div className="flex gap-3">
            <Select
              label="Type"
              options={TYPE_FILTER_OPTIONS}
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="w-36"
            />
            <Select
              label="Account"
              options={accountFilterOptions}
              value={accountFilter}
              onChange={(e) => { setAccountFilter(e.target.value); setPage(1); }}
              className="w-40"
            />
          </div>

          <Card title="Transaction History">
            <Table
              columns={txnColumns}
              data={transactions}
              keyExtractor={(t) => t.id}
              loading={txnLoading}
              emptyMessage="No transactions for this period."
            />
            {txnTotal > 50 && (
              <div className="mt-4">
                <Pagination
                  page={page}
                  totalPages={Math.ceil(txnTotal / 50)}
                  onPageChange={setPage}
                />
              </div>
            )}
          </Card>

          {/* Import Section */}
          <Card title="Import from Excel">
            <div className="flex items-center gap-3">
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className="text-sm text-slate-600"
              />
              <Button
                onClick={handleImport}
                loading={importAudit.isPending}
                disabled={!importFile}
                size="sm"
              >
                Import
              </Button>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Upload Audit_2026.xlsx to import expense records (Dec 2025 + Feb 2026).
            </p>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Transaction"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Are you sure you want to delete this transaction?
            </p>
            <div className="text-sm bg-slate-50 p-3 rounded space-y-1">
              <p><strong>Date:</strong> {formatDate(deleteTarget.transaction_date)}</p>
              <p><strong>Type:</strong> {deleteTarget.transaction_type}</p>
              <p><strong>Description:</strong> {deleteTarget.description}</p>
              <p><strong>Amount:</strong> {formatMWK(deleteTarget.amount_mwk)}</p>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="danger" loading={deleteTxn.isPending} onClick={handleDelete}>Delete</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Receipt Image Modal */}
      <Modal
        open={!!receiptModal}
        onClose={() => setReceiptModal(null)}
        title="Receipt Image"
      >
        {receiptModal && (
          <div className="flex justify-center">
            <img
              src={`${API_BASE}/audit/receipts/${receiptModal}`}
              alt="Receipt"
              className="max-w-full max-h-[70vh] rounded"
            />
          </div>
        )}
      </Modal>

      {/* Create Account Modal */}
      <Modal
        open={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        title="Create Account"
      >
        <div className="space-y-3">
          <Input label="Account Name *" value={newAcctName} onChange={(e) => setNewAcctName(e.target.value)} placeholder="e.g., John" />
          <Input label="Description" value={newAcctDesc} onChange={(e) => setNewAcctDesc(e.target.value)} placeholder="Optional description" />
          <Input label="Initial Balance (MWK)" type="number" value={newAcctBalance} onChange={(e) => setNewAcctBalance(e.target.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowAccountModal(false)}>Cancel</Button>
            <Button loading={createAccount.isPending} onClick={handleCreateAccount}>Create</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Account Modal */}
      <Modal
        open={!!editAccount}
        onClose={() => setEditAccount(null)}
        title="Edit Account"
      >
        {editAccount && (
          <div className="space-y-3">
            <Input
              label="Account Name"
              value={editAccount.name}
              onChange={(e) => setEditAccount({ ...editAccount, name: e.target.value })}
            />
            <Input
              label="Description"
              value={editAccount.description ?? ''}
              onChange={(e) => setEditAccount({ ...editAccount, description: e.target.value })}
            />
            <Input
              label="Initial Balance (MWK)"
              type="number"
              value={String(editAccount.initial_balance)}
              onChange={(e) => setEditAccount({ ...editAccount, initial_balance: Number(e.target.value) })}
            />
            <div className="flex justify-between items-center">
              {!editAccount.is_default && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => { handleDeleteAccount(editAccount.id); setEditAccount(null); }}
                >
                  Delete Account
                </Button>
              )}
              <div className="flex gap-3 ml-auto">
                <Button variant="secondary" onClick={() => setEditAccount(null)}>Cancel</Button>
                <Button loading={updateAccount.isPending} onClick={handleUpdateAccount}>Save</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </MainLayout>
  );
}
