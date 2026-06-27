"use client";

import { IPreferenceItem, PreferenceType } from "@profile-preferences/types";
import styles from "./PreferenceItem.module.css";

interface PreferenceItemProps {
  item: IPreferenceItem;
  type: PreferenceType;
  index: number;
  onToggle: (index: number) => void;
}

export default function PreferenceItem({
  item,
  type,
  index,
  onToggle,
}: PreferenceItemProps) {
  return (
    <div className={styles.item}>
      <input
        type="checkbox"
        id={`${type}-${index}`}
        checked={item.optedIn}
        onChange={() => onToggle(index)}
        className={styles.checkbox}
      />
      <label htmlFor={`${type}-${index}`} className={styles.label}>
        {item.name}
      </label>
    </div>
  );
}
