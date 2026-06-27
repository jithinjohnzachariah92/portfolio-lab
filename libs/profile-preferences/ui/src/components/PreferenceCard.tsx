"use client";

import { IPreferenceItem } from "@profile-preferences/types";
import styles from "./PreferenceCard.module.css";

interface PreferenceCardProps {
  title: string;
  items: IPreferenceItem[];
  onClick: () => void;
}

export default function PreferenceCard({
  title,
  items,
  onClick,
}: PreferenceCardProps) {
  // Get selected items
  const selectedItems = items
    .filter((item) => item.optedIn)
    .map((item) => item.name);

  return (
    <div className={styles.card} onClick={onClick}>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>
        {selectedItems.length > 0
          ? selectedItems.join(", ")
          : "No preferences selected"}
      </p>
      <p className={styles.count}>
        {selectedItems.length} selected
      </p>
    </div>
  );
}
