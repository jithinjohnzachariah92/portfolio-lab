"use client";

import { useState, useEffect } from "react";
import {
  PreferenceCard,
  PreferenceModal,
  SkeletonCard,
  usePreferencesManager,
  useParsedPreferences,
} from "..";
import {
  IPreferenceItem,
  PreferenceType,
  PREFERENCE_TYPES,
} from "@profile-preferences/types";
import styles from "./PreferencesPage.module.css";

export default function PreferencesPage() {
  const {
    preferences,
    setPreferences,
    inferredPreferences,
    customerId,
    loading,
  } = usePreferencesManager();
  const { parsing, parseMessage, setParseMessage, parse } =
    useParsedPreferences();

  const [naturalInput, setNaturalInput] = useState("");
  const [openModal, setOpenModal] = useState<PreferenceType | null>(null);
  const [affectedCategories, setAffectedCategories] = useState<
    PreferenceType[]
  >([]);
  const [showInferredModal, setShowInferredModal] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (!loading && inferredPreferences) {
      setShowInferredModal(true);
    }
  }, [loading, inferredPreferences]);

  const inferredPanels = inferredPreferences
    ? PREFERENCE_TYPES.filter(
        (pref) => inferredPreferences[pref.type].length > 0,
      ).map((pref) => ({
        type: pref.type,
        title: pref.title,
        items: inferredPreferences[pref.type],
      }))
    : [];

  const handleParse = async () => {
    const result = await parse(naturalInput, preferences);
    if (!result) return;

    const { preferences: mergedPrefs, affected } = result;
    setPreferences(mergedPrefs);
    setAffectedCategories(affected);
    setNaturalInput("");

    if (affected.length > 0) {
      setOpenModal(affected[0]);
    } else {
      setParseMessage({
        type: "success",
        text: "No changes detected in your preferences.",
      });
    }
  };

  const handleSaveSuccess = (
    type: PreferenceType,
    items: IPreferenceItem[],
  ) => {
    const updated = { ...preferences };
    updated[type] = items.map((item) => ({ ...item }));
    setPreferences(updated);
  };

  return (
    <div className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>Preferences</h1>
        <p className={styles.subtitle}>Manage your shopping preferences</p>
      </div>

      {loading && (
        <div className={styles.container}>
          <div className={styles.inputSection}>
            <h2>Quick Input</h2>
            <p style={{ color: "#666", marginBottom: "1rem" }}>
              Loading preferences...
            </p>
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className={styles.cardsGrid}>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      )}
      {!loading && (
        <div className={styles.container}>
          <div className={styles.inputSection}>
            <div className={styles.aiCard}>
              <textarea
                value={naturalInput}
                onChange={(e) => setNaturalInput(e.target.value)}
                placeholder="Type in your preferences, we will parse it as per our preferences categories"
                className={styles.textarea}
              />
              <button
                className={styles.parseButton}
                onClick={handleParse}
                disabled={parsing || !naturalInput.trim()}
              >
                <span>✨</span>
                {parsing ? "Parsing..." : "Type your Preferences"}
              </button>
            </div>

            <div className={styles.examplesSection}>
              <p className={styles.examplesTitle}>Quick Examples</p>
              <div className={styles.examples}>
                <div
                  className={styles.example}
                  onClick={() =>
                    setNaturalInput(
                      "I'm vegetarian and love minimalist fashion",
                    )
                  }
                >
                  "I'm vegetarian and love minimalist fashion"
                </div>
                <div
                  className={styles.example}
                  onClick={() =>
                    setNaturalInput(
                      "Prefer Nike and Adidas, sporty style, avoid dairy",
                    )
                  }
                >
                  "Prefer Nike and Adidas, sporty style, avoid dairy"
                </div>
                <div
                  className={styles.example}
                  onClick={() =>
                    setNaturalInput(
                      "Love formal wear, Christmas shopping, Gucci brands",
                    )
                  }
                >
                  "Love formal wear, Christmas shopping, Gucci brands"
                </div>
              </div>
            </div>

            {parseMessage && (
              <p className={`${styles.message} ${styles[parseMessage.type]}`}>
                {parseMessage.text}
              </p>
            )}
          </div>

          <div className={styles.cardsGrid}>
            {PREFERENCE_TYPES.map((pref) => (
              <PreferenceCard
                key={pref.type}
                title={pref.title}
                items={preferences[pref.type]}
                onClick={() => {
                  setOpenModal(pref.type);
                  setAffectedCategories([pref.type]);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {openModal && (
        <PreferenceModal
          isOpen={!!openModal}
          panels={affectedCategories.map((type) => ({
            type,
            title: PREFERENCE_TYPES.find((p) => p.type === type)?.title || type,
            items: preferences[type],
          }))}
          onClose={() => setOpenModal(null)}
          onSaveSuccess={handleSaveSuccess}
          customerId={customerId}
          isMultiStep={affectedCategories.length > 1}
          onAllConfirmed={() => {
            setOpenModal(null);
            setAffectedCategories([]);
            if (affectedCategories.length > 1) {
              setToast({
                type: "success",
                text: "All preferences confirmed and saved!",
              });
            }
          }}
        />
      )}

      {/* ── New: inferred preferences from recent purchases ──────────────── */}
      {showInferredModal && inferredPanels.length > 0 && (
        <PreferenceModal
          isOpen={showInferredModal}
          panels={inferredPanels}
          onClose={() => setShowInferredModal(false)}
          onSaveSuccess={handleSaveSuccess}
          customerId={customerId}
          isMultiStep={inferredPanels.length > 1}
          onAllConfirmed={() => {
            setShowInferredModal(false);
            setToast({
              type: "success",
              text: "Inferred preferences saved from your recent purchases!",
            });
          }}
        />
      )}

      {toast && (
        <div className={`${styles.toast} ${styles[toast.type]}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
