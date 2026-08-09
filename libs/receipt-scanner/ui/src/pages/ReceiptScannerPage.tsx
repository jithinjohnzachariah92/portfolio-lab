"use client";

import { useState, useRef, useEffect } from "react";
import styles from "./ReceiptScannerPage.module.css";
import type { IOrderItem, IOrder } from "@shared/models";
import type { ExtractedOrder } from "@receipt-scanner/api";
import { getClientId } from "@profile-preferences/utils";

// ── Receipt Scanner Page Component ────────────────────────────────────────
//
// Main page for scanning receipts. Allows users to:
//   - Upload receipt images
//   - Preview the image
//   - Scan using AI vision
//   - Review and confirm extracted data
//   - View their order history
//
// See Principle 4: Design for the consumer, not yourself —
// This page provides a complete, self-contained receipt scanning experience.
export default function ReceiptScannerPage() {
  const [orders, setOrders] = useState<IOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  const [image, setImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [proposedOrder, setProposedOrder] = useState<ExtractedOrder | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const customerId = getClientId();

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const res = await fetch(
        `/api/orders?customerId=${encodeURIComponent(customerId)}`,
      );
      const data = await res.json();
      if (data.success) setOrders(data.orders);
    } catch (err) {
      console.error("Failed to load orders:", err);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Handle image file selection.
   * Validates the file is an image, then reads it as base64.
   */
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file");
      return;
    }

    // Read file as data URL (base64)
    const reader = new FileReader();
    reader.onload = (event) => {
      setImage(event.target?.result as string);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  /**
   * Trigger vision-based receipt extraction.
   * Sends the image to the API and displays the results in a modal.
   */
  const handleScan = async () => {
    if (!image) {
      setError("Please upload an image first");
      return;
    }

    setIsScanning(true);
    setError(null);

    try {
      const base64Data = image.split(",")[1];
      const mimeType = image.match(/data:(.*?);base64/)?.[1] ?? "image/jpeg";

      const response = await fetch("/api/extractReceipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Data, mimeType }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error ?? "Failed to scan receipt");
        return;
      }

      setProposedOrder(data.order); // opens the modal
    } catch (err) {
      setError("Failed to scan receipt. Please try again.");
      console.error(err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleConfirmSave = async () => {
    if (!proposedOrder) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/saveOrder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, order: proposedOrder }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error ?? "Failed to save order");
        return;
      }

      handleReset();
      await loadOrders();
    } catch (err) {
      setError("Failed to save order. Please try again.");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setImage(null);
    setProposedOrder(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <h1>Receipts</h1>
        <p className={styles.subtitle}>
          Scan a receipt to add it to your order history
        </p>

        <div className={styles.uploadSection}>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            ref={fileInputRef}
            className={styles.fileInput}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className={styles.uploadButton}
          >
            Select Receipt Image
          </button>

          {image && (
            <div className={styles.imagePreview}>
              <img
                src={image}
                alt="Receipt preview"
                className={styles.previewImage}
              />
            </div>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.buttonSection}>
          <button
            onClick={handleScan}
            disabled={!image || isScanning}
            className={`${styles.scanButton} ${isScanning ? styles.scanning : ""}`}
          >
            {isScanning ? "Scanning..." : "Scan Receipt"}
          </button>
        </div>

        {/* ── Confirmation modal — nothing is saved until the user confirms ──── */}
        {proposedOrder && (
          <div className={styles.modalOverlay} onClick={handleReset}>
            <div
              className={styles.modalCard}
              onClick={(e) => e.stopPropagation()}
            >
              <h2>Does this look right?</h2>
              <div className={styles.resultCard}>
                <h3>{proposedOrder.retailer}</h3>
                <p>
                  <strong>Date:</strong>{" "}
                  {proposedOrder.purchaseDate
                    ? new Date(proposedOrder.purchaseDate).toLocaleDateString()
                    : "Not detected"}
                </p>
                <p>
                  <strong>Total:</strong>{" "}
                  {proposedOrder.total !== undefined
                    ? `£${proposedOrder.total.toFixed(2)}`
                    : "Not detected"}
                </p>

                <ul className={styles.itemsList}>
                  {proposedOrder.items.map((item, index) => (
                    <li key={index} className={styles.item}>
                      <span>{item.name}</span>
                      <span>
                        {item.price !== undefined
                          ? `£${item.price.toFixed(2)}`
                          : "—"}{" "}
                        × {item.quantity}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={styles.modalButtonSection}>
                <button
                  onClick={handleConfirmSave}
                  disabled={isSaving}
                  className={styles.scanButton}
                >
                  {isSaving ? "Saving..." : "Confirm & Save"}
                </button>
                <button onClick={handleReset} className={styles.resetButton}>
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={styles.resultSection}>
          <h2>Your Receipts</h2>
          {loadingOrders && <p>Loading orders...</p>}
          {!loadingOrders && orders.length === 0 && (
            <p>No receipts scanned yet.</p>
          )}
          {!loadingOrders &&
            orders.map((order) => (
              <div key={order._id} className={styles.resultCard}>
                <h3>{order.retailer}</h3>
                <p>
                  <strong>Date:</strong>{" "}
                  {order.purchaseDate
                    ? new Date(order.purchaseDate).toLocaleDateString()
                    : "Unknown"}
                </p>
                <p>
                  <strong>Total:</strong>{" "}
                  {order.total !== undefined
                    ? `£${order.total.toFixed(2)}`
                    : "Unknown"}
                </p>
                <ul className={styles.itemsList}>
                  {order.items.map((item: IOrderItem, i: number) => (
                    <li key={i} className={styles.item}>
                      <span>{item.name}</span>
                      <span>
                        {item.price !== undefined
                          ? `£${item.price.toFixed(2)}`
                          : "—"}{" "}
                        × {item.quantity}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
