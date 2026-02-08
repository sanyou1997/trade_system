'use client';

import { useRef, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import Table, { Column } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { SyncLogEntry } from '@/lib/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Upload, FileSpreadsheet, X, FileDown } from 'lucide-react';
import { formatDate } from '@/lib/utils';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: new Date(2024, i).toLocaleString('en', { month: 'long' }),
}));

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 3 }, (_, i) => ({
  value: String(currentYear - 1 + i),
  label: String(currentYear - 1 + i),
}));

/** A file picker row: [Choose File] filename.xlsx [x] */
function FilePicker({
  file,
  onChange,
  accept = '.xlsx,.xls',
  placeholder = 'No file selected',
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  accept?: string;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0] ?? null;
          onChange(selected);
          // Reset so the same file can be re-selected
          e.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => inputRef.current?.click()}
      >
        Choose File
      </Button>
      {file ? (
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-sm text-slate-700 truncate">{file.name}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-slate-400 hover:text-slate-600 shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <span className="text-sm text-slate-400">{placeholder}</span>
      )}
    </div>
  );
}

export default function SyncPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Period state (shared)
  const [year, setYear] = useState(String(currentYear));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));

  // File selections
  const [inventoryFile, setInventoryFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [dailyFile, setDailyFile] = useState<File | null>(null);

  // Loading states
  const [importingInventory, setImportingInventory] = useState(false);
  const [importingInvoice, setImportingInvoice] = useState(false);
  const [importingDaily, setImportingDaily] = useState(false);
  const [exportingInventory, setExportingInventory] = useState(false);
  const [exportingInvoice, setExportingInvoice] = useState(false);

  // Sync history
  const { data: syncHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['sync', 'history'],
    queryFn: () => api.get<SyncLogEntry[]>('/sync/history'),
  });

  const invalidateAll = () => {
    queryClient.removeQueries({ queryKey: ['dashboard'] });
    queryClient.removeQueries({ queryKey: ['inventory'] });
    queryClient.removeQueries({ queryKey: ['tyres'] });
    queryClient.removeQueries({ queryKey: ['sales'] });
    queryClient.removeQueries({ queryKey: ['payments'] });
    queryClient.invalidateQueries({ queryKey: ['sync'] });
  };

  // --- Import handlers ---

  async function handleImportInventory() {
    if (!inventoryFile) {
      toast('error', 'Please select an inventory file first.');
      return;
    }
    setImportingInventory(true);
    try {
      const params = new URLSearchParams({ year, month });
      const result = await api.upload<{ tyres_imported: number; exchange_rate: number }>(
        `/sync/import/inventory?${params}`,
        inventoryFile,
      );
      toast(
        'success',
        `Inventory imported: ${result.tyres_imported} tyres, exchange rate: ${result.exchange_rate}.`,
      );
      setInventoryFile(null);
      invalidateAll();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImportingInventory(false);
    }
  }

  async function handleImportInvoice() {
    if (!invoiceFile) {
      toast('error', 'Please select an invoice file first.');
      return;
    }
    setImportingInvoice(true);
    try {
      const params = new URLSearchParams({ year, month });
      const result = await api.upload<{
        sales_imported: number;
        payments_imported: number;
        losses_imported: number;
        sales_duplicates_skipped?: number;
        payments_duplicates_skipped?: number;
        skipped_sizes?: string[];
      }>(`/sync/import/invoice?${params}`, invoiceFile);

      const parts: string[] = [];
      parts.push(`成功导入 ${result.sales_imported} 条销售`);
      parts.push(`${result.payments_imported} 条收款`);
      parts.push(`${result.losses_imported} 条损失`);
      if (result.sales_duplicates_skipped || result.payments_duplicates_skipped) {
        parts.push(`跳过重复: ${result.sales_duplicates_skipped || 0} 销售, ${result.payments_duplicates_skipped || 0} 收款`);
      }
      if (result.skipped_sizes?.length) {
        parts.push(`未匹配规格: ${result.skipped_sizes.join(', ')}`);
      }
      toast('success', parts.join(', '));
      setInvoiceFile(null);
      invalidateAll();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImportingInvoice(false);
    }
  }

  async function handleImportDailySales() {
    if (!dailyFile) {
      toast('error', 'Please select a daily sales file first.');
      return;
    }
    setImportingDaily(true);
    try {
      const result = await api.upload<{
        sales_imported: number;
        payments_imported: number;
        sales_duplicates_skipped?: number;
        payments_duplicates_skipped?: number;
        skipped_sizes?: string[];
      }>(
        '/sync/import/daily-sales',
        dailyFile,
      );

      const parts: string[] = [];
      parts.push(`成功导入 ${result.sales_imported} 条销售`);
      parts.push(`${result.payments_imported} 条收款`);
      if (result.sales_duplicates_skipped || result.payments_duplicates_skipped) {
        parts.push(`跳过重复: ${result.sales_duplicates_skipped || 0} 销售, ${result.payments_duplicates_skipped || 0} 收款`);
      }
      if (result.skipped_sizes?.length) {
        parts.push(`未匹配规格: ${result.skipped_sizes.join(', ')}`);
      }
      toast('success', parts.join(', '));
      setDailyFile(null);
      invalidateAll();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImportingDaily(false);
    }
  }

  // --- Export handlers ---

  function triggerDownload(url: string, filename: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleExportInventory() {
    setExportingInventory(true);
    try {
      const params = new URLSearchParams({ year, month });
      const result = await api.post<{
        records_written: number;
        days_processed: number;
        sheet_created?: boolean;
        file_name?: string;
      }>(`/sync/export/inventory?${params}`);

      const msgs: string[] = [];
      if (result.sheet_created) {
        msgs.push(`New sheet created for month ${month}`);
      }
      msgs.push(
        `${result.records_written} records across ${result.days_processed} days`,
      );
      toast('success', `Inventory exported: ${msgs.join('. ')}.`);
      invalidateAll();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExportingInventory(false);
    }
  }

  function handleDownloadInventory() {
    triggerDownload(
      `${API_BASE_URL}/sync/download/inventory`,
      'Tyre_List_Internal_Available.xlsx',
    );
  }

  async function handleExportInvoice() {
    setExportingInvoice(true);
    try {
      const params = new URLSearchParams({ year, month });
      const result = await api.post<{
        sales_exported: number;
        payments_exported: number;
        file_created?: boolean;
        file_name?: string;
      }>(`/sync/export/invoice?${params}`);

      const msgs: string[] = [];
      if (result.file_created) {
        msgs.push('New invoice file created');
      }
      msgs.push(
        `${result.sales_exported} sales, ${result.payments_exported} payments`,
      );
      toast('success', `Invoice exported: ${msgs.join('. ')}.`);
      invalidateAll();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExportingInvoice(false);
    }
  }

  function handleDownloadInvoice() {
    const params = new URLSearchParams({ year, month });
    triggerDownload(
      `${API_BASE_URL}/sync/download/invoice?${params}`,
      `Invoice_Tyres_${year}.${month}.xlsx`,
    );
  }

  // --- Table columns ---

  const columns: Column<SyncLogEntry>[] = [
    {
      key: 'created_at',
      label: 'Timestamp',
      render: (entry) => formatDate(entry.created_at),
    },
    {
      key: 'direction',
      label: 'Direction',
      render: (entry) => (
        <Badge variant={entry.direction === 'export' ? 'info' : 'success'}>
          {entry.direction === 'export' ? 'Export' : 'Import'}
        </Badge>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (entry) => (
        <Badge
          variant={
            entry.status === 'success'
              ? 'success'
              : entry.status === 'failed'
                ? 'danger'
                : 'warning'
          }
        >
          {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
        </Badge>
      ),
    },
    {
      key: 'records_processed',
      label: 'Records',
      className: 'text-center',
    },
    { key: 'file_path', label: 'File' },
  ];

  return (
    <MainLayout title="Excel Sync">
      {/* Period Selector */}
      <Card title="Period Selection">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-32">
            <Select
              label="Year"
              options={YEAR_OPTIONS}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Select
              label="Month"
              options={MONTH_OPTIONS}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <p className="text-sm text-slate-500 pb-2">
            Used for inventory and invoice import operations.
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Import Section */}
        <Card title="Import from Excel">
          <div className="space-y-6">
            <p className="text-sm text-slate-500">
              Select a local Excel file to upload and import into the database.
            </p>

            {/* Import Inventory */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-green-600" />
                <h3 className="font-medium text-slate-700">Inventory File</h3>
              </div>
              <p className="text-xs text-slate-500">
                Imports tyre master data, stock levels (initial + added), and exchange rate.
              </p>
              <FilePicker
                file={inventoryFile}
                onChange={setInventoryFile}
                placeholder="Select inventory .xlsx file"
              />
              <Button
                onClick={handleImportInventory}
                loading={importingInventory}
                variant="secondary"
                className="justify-start w-full"
                disabled={!inventoryFile}
              >
                <Upload size={16} />
                Import Inventory
              </Button>
            </div>

            {/* Import Invoice */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-blue-600" />
                <h3 className="font-medium text-slate-700">Monthly Invoice</h3>
              </div>
              <p className="text-xs text-slate-500">
                Imports sales records, payments, losses, and exchange rates.
              </p>
              <FilePicker
                file={invoiceFile}
                onChange={setInvoiceFile}
                placeholder="Select invoice .xlsx file"
              />
              <Button
                onClick={handleImportInvoice}
                loading={importingInvoice}
                variant="secondary"
                className="justify-start w-full"
                disabled={!invoiceFile}
              >
                <Upload size={16} />
                Import Invoice
              </Button>
            </div>

            {/* Import Daily Sales */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-orange-600" />
                <h3 className="font-medium text-slate-700">Daily Sales File</h3>
              </div>
              <p className="text-xs text-slate-500">
                Imports sales and payments from a single daily sales file.
              </p>
              <FilePicker
                file={dailyFile}
                onChange={setDailyFile}
                placeholder="Select daily sales .xlsx file"
              />
              <Button
                onClick={handleImportDailySales}
                loading={importingDaily}
                variant="secondary"
                className="justify-start w-full"
                disabled={!dailyFile}
              >
                <Upload size={16} />
                Import Daily Sales
              </Button>
            </div>
          </div>
        </Card>

        {/* Export Section */}
        <Card title="Export to Excel">
          <div className="space-y-6">
            <p className="text-sm text-slate-500">
              Export data to Excel files and download them. Auto-creates
              sheets/files if they don&apos;t exist yet.
            </p>

            {/* Export Inventory */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-green-600" />
                <h3 className="font-medium text-slate-700">Inventory File</h3>
              </div>
              <p className="text-xs text-slate-500">
                Writes daily sales quantities and stock levels to the inventory
                Excel file. Creates the month sheet if it doesn&apos;t exist.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handleExportInventory}
                  loading={exportingInventory}
                  className="flex-1 justify-center"
                >
                  <Download size={16} />
                  Export
                </Button>
                <Button
                  onClick={handleDownloadInventory}
                  variant="secondary"
                  className="justify-center"
                >
                  <FileDown size={16} />
                  Download
                </Button>
              </div>
            </div>

            {/* Export Invoice */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-blue-600" />
                <h3 className="font-medium text-slate-700">Monthly Invoice</h3>
              </div>
              <p className="text-xs text-slate-500">
                Exports sales, payments, and losses to the invoice Excel file.
                Creates a new file if it doesn&apos;t exist. Marks exported
                sales as synced.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handleExportInvoice}
                  loading={exportingInvoice}
                  className="flex-1 justify-center"
                >
                  <Download size={16} />
                  Export
                </Button>
                <Button
                  onClick={handleDownloadInvoice}
                  variant="secondary"
                  className="justify-center"
                >
                  <FileDown size={16} />
                  Download
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Sync History */}
      <div className="mt-6">
        <Card title="Sync History">
          <Table
            columns={columns}
            data={syncHistory ?? []}
            keyExtractor={(entry) => entry.id}
            loading={historyLoading}
            emptyMessage="No sync operations recorded yet."
          />
        </Card>
      </div>
    </MainLayout>
  );
}
