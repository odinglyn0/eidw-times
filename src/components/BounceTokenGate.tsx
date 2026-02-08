import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { apiClient } from "@/integrations/api/client";
import { Shield, Loader2 } from "lucide-react";

const COOKIE_NAME = "elasticBounceTokenScreen";
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "";

declare global {
  interface Window {
    grecaptcha: {
      enterprise: {
        ready: (cb: () => void) => void;
        execute: (siteKey: string, options: { action: string }) => Promise<string>;
      };
    };
  }
}

interface BounceTokenGateProps {
  children: React.ReactNode;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

function hideRecaptchaBadge() {
  const badge = document.querySelector('.grecaptcha-badge') as HTMLElement | null;
  if (badge) {
    badge.style.visibility = 'hidden';
    return;
  }
  const observer = new MutationObserver((_mutations, obs) => {
    const el = document.querySelector('.grecaptcha-badge') as HTMLElement | null;
    if (el) {
      el.style.visibility = 'hidden';
      obs.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 10000);
}

function waitForRecaptcha(timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (window.grecaptcha?.enterprise?.ready) {
        window.grecaptcha.enterprise.ready(resolve);
      } else if (Date.now() - start > timeoutMs) {
        reject(new Error("reCAPTCHA script load timeout"));
      } else {
        setTimeout(check, 150);
      }
    };
    check();
  });
}

const BounceTokenGate = ({ children }: BounceTokenGateProps) => {
  const [state, setState] = useState<"loading" | "granted" | "failed">("loading");
  const navigate = useNavigate();
  const attemptedRef = useRef(false);

  const hasValidToken = useCallback(() => {
    const token = getCookie(COOKIE_NAME);
    if (!token) return false;
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return false;
      const payload = JSON.parse(atob(parts[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (hasValidToken()) {
      hideRecaptchaBadge();
      setState("granted");
      return;
    }

    if (attemptedRef.current) return;
    attemptedRef.current = true;

    const run = async () => {
      let visitorId = "";

      try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        visitorId = result.visitorId;
      } catch {
        visitorId = "fp_unavailable_" + Date.now();
      }

      try {
        await waitForRecaptcha();

        const recaptchaToken = await window.grecaptcha.enterprise.execute(
          RECAPTCHA_SITE_KEY,
          { action: "bouncetoken_screen" }
        );

        const response = await apiClient.verifyBounceToken(recaptchaToken, visitorId);

        if (response.status === "granted" && response.elasticBounceTokenScreen) {
          setCookie(COOKIE_NAME, response.elasticBounceTokenScreen, 1);
          hideRecaptchaBadge();
          setState("granted");
          return;
        }

        setState("failed");
      } catch (err) {
        console.warn("[BounceGate] Verification failed:", err);
        setState("failed");
      }
    };

    run();
  }, [hasValidToken, navigate]);

  useEffect(() => {
    if (state === "failed") {
      navigate("/consentscreen/failure", { replace: true });
    }
  }, [state, navigate]);

  if (state === "granted") return <>{children}</>;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      backgroundColor: "#0a0a0a",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 99999,
      fontFamily: "system-ui, -apple-system, sans-serif",
      gap: "1.25rem",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
      }}>
        <Shield size={28} color="#4ade80" />
        <span style={{ color: "#e2e8f0", fontSize: "1.125rem", fontWeight: 600 }}>
          EIDW Times
        </span>
      </div>
      <Loader2
        size={32}
        color="#4ade80"
        style={{ animation: "spin 1s linear infinite" }}
      />
      <p style={{ color: "#64748b", fontSize: "0.8125rem" }}>
        Running integrity checks...
      </p>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default BounceTokenGate;