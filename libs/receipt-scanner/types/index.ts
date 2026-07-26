import { IOrderItem, IOrder } from '@shared/models';

export interface ScanReceiptInput {
  customerId: string;
  image: string;       // base64
  mimeType?: string;
}

export type ScanReceiptResult = IOrder;

export interface ReceiptScanResponse {
  success: boolean;
  order?: IOrder;
  error?: string;
}