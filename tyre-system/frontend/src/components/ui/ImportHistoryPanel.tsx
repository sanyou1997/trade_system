'use client';

import { useState } from 'react';
import Card from './Card';
import Button from './Button';
import Badge from './Badge';
import { useStockImportHistory, useStockImportRevert } from '@/hooks/useStockImport';
import { StockImportLogEntry } from '@/lib/types';
import { useToast } from './Toast';
import { ChevronDown, ChevronUp, Undo2, History } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface ImportHistoryPanelProps {
  productType?: string;
}

export default function ImportHistoryPanel({ productType = 'phone' }: ImportHistoryPanelProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const { data: history, isLoading } = useStockImportHistory(productType);
  const revertMutation = useStockImportRevert();

  async function handleRevert(log: StockImportLogEntry) {
    const confirmed = window.confirm(
      `Undo import "${log.file_name}"?\nThis will subtract ${log.total_quantity} units from added stock for ${log.year}/${log.month}.`
    );
    if (!confirmed) return;

    try {
      await revertMutation.mutateAsync(log.id);
      toast('success', `Import "${log.file_name}" reverted successfully.`);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Revert failed.');
    }
  }

  const hasHistory = history && history.length > 0;

  return (
    <div className="mt-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors mb-2"
      >
        <History size={16} />
        Import History
        {hasHistory && (
          <Badge variant="default">{history.length}</Badge>
        )}
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <Card>
          {isLoading ? (
            <p className="text-sm text-slate-500 text-center py-4">Loading...</p>
          ) : !hasHistory ? (
            <p className="text-sm text-slate-500 text-center py-4">No import history yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Date</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">File</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Period</th>
                    <th className="text-center px-3 py-2 font-medium text-slate-600">Products</th>
                    <th className="text-center px-3 py-2 font-medium text-slate-600">Quantity</th>
                    <th className="text-center px-3 py-2 font-medium text-slate-600">Status</th>
                    <th className="text-center px-3 py-2 font-medium text-slate-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((log) => (
                    <tr key={log.id} className={log.status === 'reverted' ? 'bg-slate-50 opacity-60' : ''}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDate(log.created_at)}
                      </td>
                      <td className="px-3 py-2 max-w-[200px] truncate" title={log.file_name}>
                        {log.file_name}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {log.year}/{log.month}
                      </td>
                      <td className="px-3 py-2 text-center">{log.total_products}</td>
                      <td className="px-3 py-2 text-center font-medium">{log.total_quantity}</td>
                      <td className="px-3 py-2 text-center">
                        {log.status === 'active' ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="warning">Reverted</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {log.status === 'active' ? (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleRevert(log)}
                            loading={revertMutation.isPending}
                          >
                            <Undo2 size={12} /> Undo
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {log.reverted_at ? formatDate(log.reverted_at) : '-'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
