'use client';

import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import { useProductType } from '@/lib/product-context';
import { api } from '@/lib/api';
import { useToast } from './Toast';
import { useQueryClient } from '@tanstack/react-query';
import { TyreCategory } from '@/lib/types';

interface AddProductModalProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_OPTIONS = [
  { value: 'branded_new', label: 'Branded New' },
  { value: 'brandless_new', label: 'Brandless New' },
  { value: 'second_hand', label: 'Second Hand' },
];

const initialPhoneForm = {
  brand: '',
  model: '',
  config: '',
  note: '',
  cost: '',
  cash_price: '',
  mukuru_price: '',
  online_price: '',
};

const initialTyreForm = {
  size: '',
  type: '',
  brand: '',
  pattern: '',
  li_sr: '',
  tyre_cost: '',
  suggested_price: '',
  category: 'branded_new' as TyreCategory,
};

export default function AddProductModal({ open, onClose }: AddProductModalProps) {
  const { isTyre } = useProductType();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [phoneForm, setPhoneForm] = useState(initialPhoneForm);
  const [tyreForm, setTyreForm] = useState(initialTyreForm);
  const [submitting, setSubmitting] = useState(false);

  function handleReset() {
    setPhoneForm(initialPhoneForm);
    setTyreForm(initialTyreForm);
  }

  function handleClose() {
    handleReset();
    onClose();
  }

  function updatePhone(field: keyof typeof initialPhoneForm, value: string) {
    setPhoneForm({ ...phoneForm, [field]: value });
  }

  function updateTyre(field: keyof typeof initialTyreForm, value: string) {
    setTyreForm({ ...tyreForm, [field]: value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (isTyre) {
        if (!tyreForm.size.trim()) {
          toast('error', 'Size is required.');
          return;
        }
        await api.post('/tyres', {
          size: tyreForm.size.trim(),
          type_: tyreForm.type.trim(),
          brand: tyreForm.brand.trim(),
          pattern: tyreForm.pattern.trim(),
          li_sr: tyreForm.li_sr.trim(),
          tyre_cost: Number(tyreForm.tyre_cost) || 0,
          suggested_price: Number(tyreForm.suggested_price) || 0,
          category: tyreForm.category,
        });
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
        queryClient.invalidateQueries({ queryKey: ['tyres'] });
        toast('success', 'Tyre created successfully.');
      } else {
        if (!phoneForm.brand.trim() || !phoneForm.model.trim()) {
          toast('error', 'Brand and Model are required.');
          return;
        }
        await api.post('/phones', {
          brand: phoneForm.brand.trim(),
          model: phoneForm.model.trim(),
          config: phoneForm.config.trim(),
          note: phoneForm.note.trim() || null,
          cost: Number(phoneForm.cost) || 0,
          cash_price: Number(phoneForm.cash_price) || 0,
          mukuru_price: Number(phoneForm.mukuru_price) || 0,
          online_price: Number(phoneForm.online_price) || 0,
        });
        queryClient.invalidateQueries({ queryKey: ['phone-inventory'] });
        queryClient.invalidateQueries({ queryKey: ['phones'] });
        toast('success', 'Phone created successfully.');
      }
      handleClose();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Creation failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Add New ${isTyre ? 'Tyre' : 'Phone'}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {isTyre ? (
          <>
            <Input
              label="Size *"
              value={tyreForm.size}
              onChange={(e) => updateTyre('size', e.target.value)}
              placeholder="e.g. 175/70R13"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Type"
                value={tyreForm.type}
                onChange={(e) => updateTyre('type', e.target.value)}
                placeholder="e.g. PCR"
              />
              <Input
                label="Brand"
                value={tyreForm.brand}
                onChange={(e) => updateTyre('brand', e.target.value)}
                placeholder="e.g. TERAFLEX"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Pattern"
                value={tyreForm.pattern}
                onChange={(e) => updateTyre('pattern', e.target.value)}
              />
              <Input
                label="LI/SR"
                value={tyreForm.li_sr}
                onChange={(e) => updateTyre('li_sr', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Cost"
                type="number"
                value={tyreForm.tyre_cost}
                onChange={(e) => updateTyre('tyre_cost', e.target.value)}
              />
              <Input
                label="Suggested Price"
                type="number"
                value={tyreForm.suggested_price}
                onChange={(e) => updateTyre('suggested_price', e.target.value)}
              />
            </div>
            <Select
              label="Category"
              options={CATEGORY_OPTIONS}
              value={tyreForm.category}
              onChange={(e) => updateTyre('category', e.target.value)}
            />
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Brand *"
                value={phoneForm.brand}
                onChange={(e) => updatePhone('brand', e.target.value)}
                placeholder="e.g. Huawei"
              />
              <Input
                label="Model *"
                value={phoneForm.model}
                onChange={(e) => updatePhone('model', e.target.value)}
                placeholder="e.g. Y9s"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Config"
                value={phoneForm.config}
                onChange={(e) => updatePhone('config', e.target.value)}
                placeholder="e.g. 128G"
              />
              <Input
                label="Note"
                value={phoneForm.note}
                onChange={(e) => updatePhone('note', e.target.value)}
              />
            </div>
            <Input
              label="Cost"
              type="number"
              value={phoneForm.cost}
              onChange={(e) => updatePhone('cost', e.target.value)}
            />
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Cash Price"
                type="number"
                value={phoneForm.cash_price}
                onChange={(e) => updatePhone('cash_price', e.target.value)}
              />
              <Input
                label="Mukuru Price"
                type="number"
                value={phoneForm.mukuru_price}
                onChange={(e) => updatePhone('mukuru_price', e.target.value)}
              />
              <Input
                label="Online Price"
                type="number"
                value={phoneForm.online_price}
                onChange={(e) => updatePhone('online_price', e.target.value)}
              />
            </div>
          </>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            className="flex-1 justify-center"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            loading={submitting}
            className="flex-1 justify-center"
          >
            Create {isTyre ? 'Tyre' : 'Phone'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
