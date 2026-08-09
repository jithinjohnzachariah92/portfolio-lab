import { IOrderItem, IOrder } from '@shared/models';

// ── Type Definitions ─────────────────────────────────────────────────────

/**
 * Input for scanning a receipt.
 * Used when the client wants to scan AND save in one operation.
 */
export interface ScanReceiptInput {
  customerId: string;    // Who the receipt belongs to
  image: string;        // Base64-encoded image data
  mimeType?: string;    // Image MIME type (optional)
}

// The result of a successful scan is an Order document
export type ScanReceiptResult = IOrder;

/**
 * Response wrapper for scan operations.
 * Used for API responses to the client.
 */
export interface ReceiptScanResponse {
  success: boolean;      // Whether the operation succeeded
  order?: IOrder;        // The order (if successful)
  error?: string;        // Error message (if failed)
}