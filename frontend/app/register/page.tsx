import { AuthForm } from "@/components/auth-form";
import Image from "next/image";
import styles from "@/app/login/login.module.css";

export default function RegisterPage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <section className={styles.formPanel} aria-label="Create your account">
          <div className={styles.brand}>
            <svg
              className={styles.logo}
              viewBox="0 0 100 100"
              role="img"
              aria-label="Astra logo"
            >
              <path
                fill="currentColor"
                d="M50 0C47 22 42 42 0 50C42 58 47 78 50 100C53 78 58 58 100 50C58 42 53 22 50 0Z"
              />
              <circle cx="50" cy="50" r="15" fill="#FFFFFF" />
            </svg>
            <span>Astra</span>
          </div>
          <AuthForm register />
        </section>
        <div className={styles.imagePanel}>
          <Image
            src="/template-assets/astra-team-image.png"
            alt="Team collaborating on an operational workspace"
            fill
            sizes="(max-width: 639px) calc(100vw - 64px), (max-width: 1048px) calc((100vw - 144px) / 2), 452px"
            loading="eager"
            className={styles.coverImage}
          />
        </div>
      </div>
      <p className={styles.legal}>
        By creating an account, you agree to our <a href="#">Terms of Service</a> and{" "}
        <a href="#">Privacy Policy</a>.
      </p>
    </div>
  );
}
