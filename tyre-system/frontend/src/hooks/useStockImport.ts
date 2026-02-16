'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  ImportPreviewResult,
  ImportConfirmItem,
  StockImportLogEntry,
} from '@/lib/types';

export function useStockImportPreview() {
  return useMutation({
    mutationFn: ({
      file,
      year,
      month,
    }: {
      file: File;
      year: number;
      month: number;
    }) =>
      api.uploadWithParams<ImportPreviewResult>(
        '/stock-import/preview',
        file,
        { year: String(year), month: String(month) },
      ),
  });
}

export function useStockImportConfirm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      year,
      month,
      file_name,
      items,
    }: {
      year: number;
      month: number;
      file_name: string;
      items: ImportConfirmItem[];
    }) => {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
        file_name,
      });
      return api.post<StockImportLogEntry>(
        `/stock-import/confirm?${params}`,
        items,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['phone-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['stock-import-history'] });
    },
  });
}

export function useStockImportRevert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (logId: number) =>
      api.post<StockImportLogEntry>(`/stock-import/${logId}/revert`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['phone-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['stock-import-history'] });
    },
  });
}

export function useStockImportHistory(productType: string = 'phone') {
  return useQuery({
    queryKey: ['stock-import-history', productType],
    queryFn: () =>
      api.get<StockImportLogEntry[]>(
        `/stock-import/history?product_type=${productType}`,
      ),
  });
}
