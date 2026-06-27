import styles from "./page.module.css";
import { features } from "@shared/registry";

export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>Portfolio Lab</h1>
        <p className={styles.subtitle}>
          A collection of portfolio systems — pick one to try it out.
        </p>
      </div>

      <div className={styles.cardGrid}>
        {features.map((feature) => (
          <a key={feature.slug} href={`/${feature.slug}`} className={styles.card}>
            <div className={styles.cardIcon}>{feature.icon}</div>
            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
          </a>
        ))}
      </div>
    </main>
  );
}
