"use client";

import { useState, useEffect } from "react";
import { IPreferenceItem, PreferenceType } from "@profile-preferences/types";
import PreferenceItem from "./PreferenceItem";
import styles from "./PreferenceModal.module.css";

interface Panel {
  type: PreferenceType;
  title: string;
  items: IPreferenceItem[];
}

interface PreferenceModalProps {
  isOpen: boolean;
  panels: Panel[];
  onClose: () => void;
  onSaveSuccess: (type: PreferenceType, items: IPreferenceItem[]) => void;
  customerId: string;
  onAllConfirmed: () => void;
  isMultiStep?: boolean;
}

export default function PreferenceModal({
  isOpen,
  panels,
  onClose,
  onSaveSuccess,
  customerId,
  onAllConfirmed,
  isMultiStep = false,
}: PreferenceModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localItems, setLocalItems] = useState<IPreferenceItem[]>([]);

  // Initialize local items when panel changes
  useEffect(() => {
    if (isOpen && panels.length > 0) {
      setLocalItems(
        panels[currentStep].items.map((item) => ({ ...item }))
      );
    }
  }, [currentStep, isOpen, panels]);

  if (!isOpen || panels.length === 0) return null;

  const currentPanel = panels[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === panels.length - 1;

  const handleToggle = (index: number) => {
    const updated = localItems.map((item, i) =>
      i === index ? { ...item, optedIn: !item.optedIn } : item
    );
    setLocalItems(updated);
  };

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/savePreference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          preferenceType: currentPanel.type,
          items: localItems,
        }),
      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.error || "Failed to save");

      // Sync back to page state after successful save
      onSaveSuccess(currentPanel.type, localItems);

      if (isLastStep) {
        onAllConfirmed();
      } else {
        setCurrentStep(currentStep + 1);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} />

      {/* Modal */}
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>{currentPanel.title}</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        {isMultiStep && (
          <div className={styles.stepIndicator}>
            Step {currentStep + 1} of {panels.length}
          </div>
        )}

        <div className={styles.content}>
          {localItems.map((item, index) => (
            <PreferenceItem
              key={index}
              item={item}
              type={currentPanel.type}
              index={index}
              onToggle={handleToggle}
            />
          ))}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.footer}>
          {isMultiStep && (
            <button
              className={styles.backBtn}
              onClick={handleBack}
              disabled={isFirstStep || saving}
            >
              Back
            </button>
          )}
          <button
            className={styles.confirmBtn}
            onClick={handleConfirm}
            disabled={saving}
            style={!isMultiStep ? { flex: 1 } : undefined}
          >
            {saving ? "Saving..." : isMultiStep && isLastStep ? "Finish" : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}
