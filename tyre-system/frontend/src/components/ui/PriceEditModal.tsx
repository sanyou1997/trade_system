'use client';

import { useState, useEffect } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { useToast } from './Toast';
import { useUpdatePrice } from '@/hooks/usePriceUpdate';
import { formatMWK } from '@/lib/utils';

interface PriceEditModalProps {
  open: boolean;
  onClose: () => void;
  productType: 'tyre' | 'phone';
  productId: number;
  productLabel: string;
  currentPrices: {
    suggested_price?: number;
    cash_price?: number;
    mukuru_price?: number;
    online_price?: number;
  };
}

export default function PriceEditModal({
  open,
  onClose,
  productType,
  productId,
  productLabel,
  currentPrices,
}: PriceEditModalProps) {
  const { toast } = useToast();
  const updatePrice = useUpdatePrice();

  const [password, setPassword] = useState('');
  const [suggestedPrice, setSuggestedPrice] = useState('');
  const [cashPrice, setCashPrice] = useState('');
  const [mukuruPrice, setMukuruPrice] = useState('');
  const [onlinePrice, setOnlinePrice] = useState('');

  // Reset form when modal opens with new data
  useEffect(() => {
    if (open) {
      setPassword('');
      setSuggestedPrice(String(currentPrices.suggested_price ?? ''));
      setCashPrice(String(currentPrices.cash_price ?? ''));
      setMukuruPrice(String(currentPrices.mukuru_price ?? ''));
      setOnlinePrice(String(currentPrices.online_price ?? ''));
    }
  }, [open, currentPrices]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!password) {
      toast('error', 'Please enter the password.');
      return;
    }

    if (productType === 'tyre') {
      const price = Number(suggestedPrice);
      if (isNaN(price) || price < 0) {
        toast('error', 'Please enter a valid price.');
        return;
      }
      try {
        await updatePrice.mutateAsync({
          product_type: 'tyre',
          product_id: productId,
          password,
          suggested_price: price,
        });
        toast('success', 'Price updated successfully.');
        onClose();
      } catch (err) {
        toast('error', err instanceof Error ? err.message : 'Update failed.');
      }
    } else {
      const cash = Number(cashPrice);
      const mukuru = Number(mukuruPrice);
      const online = Number(onlinePrice);
      if (isNaN(cash) || cash < 0 || isNaN(mukuru) || mukuru < 0 || isNaN(online) || online < 0) {
        toast('error', 'Please enter valid prices.');
        return;
      }
      try {
        await updatePrice.mutateAsync({
          product_type: 'phone',
          product_id: productId,
          password,
          cash_price: cash,
          mukuru_price: mukuru,
          online_price: online,
        });
        toast('success', 'Price updated successfully.');
        onClose();
      } catch (err) {
        toast('error', err instanceof Error ? err.message : 'Update failed.');
      }
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Edit Price - ${productLabel}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {productType === 'tyre' ? (
          <div>
            <div className="text-xs text-slate-500 mb-1">
              Current: {formatMWK(currentPrices.suggested_price ?? 0)}
            </div>
            <Input
              label="Suggested Price (MWK)"
              type="number"
              value={suggestedPrice}
              onChange={(e) => setSuggestedPrice(e.target.value)}
              min={0}
              step={1000}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-slate-500 mb-1">
                Current: {formatMWK(currentPrices.cash_price ?? 0)}
              </div>
              <Input
                label="Cash Price (MWK)"
                type="number"
                value={cashPrice}
                onChange={(e) => setCashPrice(e.target.value)}
                min={0}
                step={1000}
              />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">
                Current: {formatMWK(currentPrices.mukuru_price ?? 0)}
              </div>
              <Input
                label="Mukuru Price (MWK)"
                type="number"
                value={mukuruPrice}
                onChange={(e) => setMukuruPrice(e.target.value)}
                min={0}
                step={1000}
              />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">
                Current: {formatMWK(currentPrices.online_price ?? 0)}
              </div>
              <Input
                label="Online Price (MWK)"
                type="number"
                value={onlinePrice}
                onChange={(e) => setOnlinePrice(e.target.value)}
                min={0}
                step={1000}
              />
            </div>
          </div>
        )}

        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password to confirm"
        />

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="flex-1 justify-center"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            loading={updatePrice.isPending}
            className="flex-1 justify-center"
          >
            Save Price
          </Button>
        </div>
      </form>
    </Modal>
  );
}
