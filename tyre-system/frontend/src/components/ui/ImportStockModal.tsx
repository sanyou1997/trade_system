'use client';

import { useState, useRef } from 'react';
import Modal from './Modal';
import Button from './Button';
import Badge from './Badge';
import { useStockImportPreview, useStockImportConfirm } from '@/hooks/useStockImport';
import { ImportPreviewResult, ImportConfirmItem } from '@/lib/types';
import { useToast } from './Toast';
import { Upload, CheckCircle2, XCircle, FileSpreadsheet, X } from 'lucide-react';

interface ImportStockModalProps {
  open: boolean;
  onClose: () => void;
  year: number;
  month: number;
}

export default function ImportStockModal({ open, onClose, year, month }: ImportStockModalProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const previewMutation = useStockImportPreview();
  const confirmMutation = useStockImportConfirm();

  function handleReset() {
    setFile(null);
    setPreview(null);
    setDone(false);
    previewMutation.reset();
    confirmMutation.reset();
  }

  function handleClose() {
    handleReset();
    onClose();
  }

  async function handlePreview() {
    if (!file) return;
    try {
      const result = await previewMutation.mutateAsync({ file, year, month });
      setPreview(result);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Preview failed.');
    }
  }

  async function handleConfirm() {
    if (!preview || !preview.all_matched) return;

    const items: ImportConfirmItem[] = preview.items
      .filter((item) => item.matched && item.phone_id !== null)
      .map((item) => ({
        phone_id: item.phone_id!,
        quantity: item.quantity,
        brand: item.brand,
        model: item.model,
        config: item.config,
      }));

    try {
      await confirmMutation.mutateAsync({
        year,
        month,
        file_name: preview.file_name,
        items,
      });
      toast('success', `Successfully imported ${preview.total_quantity} units across ${preview.matched_rows} products.`);
      setDone(true);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Import failed.');
    }
  }

  const monthName = new Date(2000, month - 1).toLocaleString('en', { month: 'long' });

  return (
    <Modal open={open} onClose={handleClose} title="Import Phone Stock" size="xl">
      {/* Step 1: File Selection */}
      {!preview && !done && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Upload a phone shipment Excel file to add stock for <strong>{monthName} {year}</strong>.
            The file should have columns: Brand, Model, Config, Quantity.
          </p>

          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              id="stock-import-file"
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
            <label
              htmlFor="stock-import-file"
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300"
            >
              <FileSpreadsheet size={14} /> Choose File
            </label>
            {file ? (
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-sm text-slate-700 truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-slate-400 hover:text-slate-600 shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <span className="text-sm text-slate-400">No file selected</span>
            )}
          </div>

          <Button
            onClick={handlePreview}
            loading={previewMutation.isPending}
            disabled={!file}
            className="w-full justify-center"
          >
            <Upload size={16} /> Preview Import
          </Button>
        </div>
      )}

      {/* Step 2: Preview Results */}
      {preview && !done && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700">
              {preview.file_name}
            </span>
            {preview.all_matched ? (
              <Badge variant="success">All Matched</Badge>
            ) : (
              <Badge variant="danger">{preview.unmatched_rows} Unmatched</Badge>
            )}
          </div>

          <div className="flex gap-4 text-sm text-slate-600">
            <span>Products: <strong>{preview.total_rows}</strong></span>
            <span>Total Qty: <strong>{preview.total_quantity}</strong></span>
          </div>

          {!preview.all_matched && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-700">
                Some products could not be matched. Please add unmatched products first or fix the Excel file.
              </p>
            </div>
          )}

          {/* Preview Table */}
          <div className="max-h-64 overflow-y-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Brand</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Model</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Config</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Qty</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Current Added</th>
                </tr>
              </thead>
              <tbody>
                {preview.items.map((item, idx) => (
                  <tr
                    key={idx}
                    className={item.matched ? '' : 'bg-red-50'}
                  >
                    <td className="px-3 py-1.5">
                      {item.matched ? (
                        <CheckCircle2 size={16} className="text-green-500" />
                      ) : (
                        <XCircle size={16} className="text-red-500" />
                      )}
                    </td>
                    <td className="px-3 py-1.5">{item.brand}</td>
                    <td className="px-3 py-1.5">{item.model}</td>
                    <td className="px-3 py-1.5">{item.config}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{item.quantity}</td>
                    <td className="px-3 py-1.5 text-right text-slate-500">
                      {item.current_added_stock ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={handleReset}
              className="flex-1 justify-center"
            >
              Back
            </Button>
            <Button
              onClick={handleConfirm}
              loading={confirmMutation.isPending}
              disabled={!preview.all_matched}
              className="flex-1 justify-center"
            >
              Confirm Import
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Done */}
      {done && (
        <div className="space-y-4 text-center">
          <CheckCircle2 size={48} className="text-green-500 mx-auto" />
          <p className="text-sm text-slate-700">
            Successfully imported <strong>{preview?.total_quantity}</strong> units
            across <strong>{preview?.matched_rows}</strong> products
            for {monthName} {year}.
          </p>
          <Button onClick={handleClose} className="w-full justify-center">
            Close
          </Button>
        </div>
      )}
    </Modal>
  );
}
