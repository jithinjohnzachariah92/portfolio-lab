# Receipt Scanner Library

This library provides the functionality to scan and extract information from receipt images.

## Structure

- `api/` - API layer with scanning service and handlers
- `ui/` - UI components for the receipt scanner
- `types/` - Shared TypeScript types

## API

The API layer provides:
- `scanReceipt()` - Main function to process receipt images
- `handleScanReceipt()` - Next.js API route handler

## UI Components

The UI layer provides:
- `ReceiptScannerPage` - Main page component for scanning receipts