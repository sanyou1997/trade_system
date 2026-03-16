import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface PriceUpdateData {
  product_type: 'tyre' | 'phone' | 'other';
  product_id: number;
  password: string;
  suggested_price?: number;
  cash_price?: number;
  mukuru_price?: number;
  online_price?: number;
}

export function useUpdatePrice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PriceUpdateData) => api.put('/prices/update', data),
    onSuccess: (_data, variables) => {
      if (variables.product_type === 'tyre') {
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
        queryClient.invalidateQueries({ queryKey: ['tyres'] });
      } else if (variables.product_type === 'phone') {
        queryClient.invalidateQueries({ queryKey: ['phone-inventory'] });
        queryClient.invalidateQueries({ queryKey: ['phones'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['other-inventory'] });
        queryClient.invalidateQueries({ queryKey: ['others'] });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
