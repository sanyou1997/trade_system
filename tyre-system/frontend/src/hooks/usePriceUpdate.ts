import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface PriceUpdateData {
  product_type: 'tyre' | 'phone';
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
      } else {
        queryClient.invalidateQueries({ queryKey: ['phone-inventory'] });
        queryClient.invalidateQueries({ queryKey: ['phones'] });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
