'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AuditAccount,
  AuditAccountCreate,
  AuditAccountUpdate,
  AuditTransaction,
  ExpenseCreate,
  TransferCreate,
  ExchangeCreate,
  IncomeCreate,
  TransactionType,
  AuditImportResult,
  AccountBalance,
  RevenueBreakdown,
} from '@/lib/types';

// --- Account Hooks ---

export function useAuditAccounts() {
  return useQuery({
    queryKey: ['audit', 'accounts'],
    queryFn: () => api.get<AuditAccount[]>('/audit/accounts'),
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AuditAccountCreate) =>
      api.post<AuditAccount>('/audit/accounts', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: AuditAccountUpdate }) =>
      api.put<AuditAccount>(`/audit/accounts/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/audit/accounts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

// --- Balance & Revenue ---

export function useAccountBalances(year: number, month: number) {
  return useQuery({
    queryKey: ['audit', 'balances', year, month],
    queryFn: () =>
      api.get<AccountBalance[]>(`/audit/balances/${year}/${month}`),
  });
}

export function useRevenueBreakdown(year: number, month: number) {
  return useQuery({
    queryKey: ['audit', 'revenue', year, month],
    queryFn: () =>
      api.get<RevenueBreakdown>(`/audit/revenue/${year}/${month}`),
  });
}

export function useSetBalanceOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      year,
      month,
      value,
    }: {
      accountId: number;
      year: number;
      month: number;
      value: number;
    }) =>
      api.put<null>(
        `/audit/balances/${accountId}/${year}/${month}/override`,
        { override_balance: value },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useClearBalanceOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      year,
      month,
    }: {
      accountId: number;
      year: number;
      month: number;
    }) => api.delete(`/audit/balances/${accountId}/${year}/${month}/override`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

// --- Transaction Hooks ---

export function useAuditTransactions(
  year?: number,
  month?: number,
  txnType?: TransactionType,
  accountId?: number,
  page = 1,
  limit = 50,
) {
  const params = new URLSearchParams();
  if (year) params.set('year', String(year));
  if (month) params.set('month', String(month));
  if (txnType) params.set('transaction_type', txnType);
  if (accountId) params.set('account_id', String(accountId));
  params.set('page', String(page));
  params.set('limit', String(limit));
  const qs = params.toString();

  return useQuery({
    queryKey: ['audit', 'transactions', year, month, txnType, accountId, page],
    queryFn: () =>
      api.getRaw<AuditTransaction[]>(`/audit/transactions?${qs}`),
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ExpenseCreate) =>
      api.post<AuditTransaction>('/audit/transactions/expense', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TransferCreate) =>
      api.post<AuditTransaction>('/audit/transactions/transfer', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useCreateExchange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ExchangeCreate) =>
      api.post<AuditTransaction>('/audit/transactions/exchange', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useCreateIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: IncomeCreate) =>
      api.post<AuditTransaction>('/audit/transactions/income', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/audit/transactions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useUploadReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ txnId, file }: { txnId: number; file: File }) =>
      api.upload<AuditTransaction>(`/audit/transactions/${txnId}/receipt`, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useImportAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      api.upload<AuditImportResult>('/audit/import', file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}
