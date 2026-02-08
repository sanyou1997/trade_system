'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ProductType = 'tyre' | 'phone';

interface ProductTypeContextValue {
  productType: ProductType;
  setProductType: (type: ProductType) => void;
  isTyre: boolean;
  isPhone: boolean;
}

const ProductTypeContext = createContext<ProductTypeContextValue | null>(null);

const STORAGE_KEY = 'product_type';

export function ProductTypeProvider({ children }: { children: ReactNode }) {
  const [productType, setProductTypeState] = useState<ProductType>('tyre');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'phone' || saved === 'tyre') {
      setProductTypeState(saved);
    }
  }, []);

  const setProductType = (type: ProductType) => {
    setProductTypeState(type);
    localStorage.setItem(STORAGE_KEY, type);
  };

  return (
    <ProductTypeContext.Provider
      value={{
        productType,
        setProductType,
        isTyre: productType === 'tyre',
        isPhone: productType === 'phone',
      }}
    >
      {children}
    </ProductTypeContext.Provider>
  );
}

export function useProductType() {
  const ctx = useContext(ProductTypeContext);
  if (!ctx) {
    throw new Error('useProductType must be used within ProductTypeProvider');
  }
  return ctx;
}
