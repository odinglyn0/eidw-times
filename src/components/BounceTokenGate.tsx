import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { apiClient } from "@/integrations/api/client";
import Logo from "@/assets/intakeLogo.png";

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
      gap: "1.5rem",
    }}>
      <img src={Logo} alt="EIDW Times" style={{ height: 140, marginBottom: "2rem" }} />
      <div className="sk-spinner">
        <div className="sk-rect1" />
        <div className="sk-rect2" />
        <div className="sk-rect3" />
        <div className="sk-rect4" />
        <div className="sk-rect5" />
      </div>
      <p style={{ color: "#64748b", fontSize: "0.8125rem" }}>
        Verifying you are not an evil hacker
      </p>
      <style>{`
        .sk-spinner{margin:0 auto;width:50px;height:40px;text-align:center;font-size:10px}
        .sk-spinner>div{background-color:#fff;height:100%;width:6px;display:inline-block;animation:sk-stretchdelay 1.2s infinite ease-in-out}
        .sk-rect2{animation-delay:-1.1s!important}
        .sk-rect3{animation-delay:-1.0s!important}
        .sk-rect4{animation-delay:-0.9s!important}
        .sk-rect5{animation-delay:-0.8s!important}
        @keyframes sk-stretchdelay{0%,40%,100%{transform:scaleY(0.4)}20%{transform:scaleY(1.0)}}
      `}</style>
    </div>
  );
};

export default BounceTokenGate;