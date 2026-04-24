'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  ImportPreviewResult,
  ImportConfirmItem,
  OtherImportConfirmItem,
  OtherImportPreviewResult,
  TyreImportPreviewResult,
  TyreImportConfirmItem,
  StockImportLogEntry,
} from '@/lib/types';

export function useStockImportPreview() {
  return useMutation({
    mutationFn: ({
      file,
      year,
      month,
      productType = 'phone',
    }: {
      file: File;
      year: number;
      month: number;
      productType?: string;
    }) =>
      api.uploadWithParams<ImportPreviewResult | TyreImportPreviewResult | OtherImportPreviewResult>(
        '/stock-import/preview',
        file,
        { year: String(year), month: String(month), product_type: productType },
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
      productType = 'phone',
    }: {
      year: number;
      month: number;
      file_name: string;
      items: ImportConfirmItem[] | TyreImportConfirmItem[] | OtherImportConfirmItem[];
      productType?: string;
    }) => {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
        file_name,
        product_type: productType,
      });
      return api.post<StockImportLogEntry>(
        `/stock-import/confirm?${params}`,
        items,
      );
    },
    onSuccess: (_data, variables) => {
      if (variables.productType === 'tyre') {
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
        queryClient.invalidateQueries({ queryKey: ['tyres'] });
      } else if (variables.productType === 'other') {
        queryClient.invalidateQueries({ queryKey: ['other-inventory'] });
        queryClient.invalidateQueries({ queryKey: ['other-dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['others'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['phone-inventory'] });
        queryClient.invalidateQueries({ queryKey: ['phone-dashboard'] });
      }
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
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['tyres'] });
      queryClient.invalidateQueries({ queryKey: ['phone-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['phone-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['other-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['other-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['others'] });
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
