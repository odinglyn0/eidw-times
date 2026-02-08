import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { apiClient } from "@/integrations/api/client";
import { Shield, Loader2 } from "lucide-react";

const STORAGE_KEY = "elasticBounceTokenScreen";
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "";

declare global {
  interface Window {
    grecaptcha: {
      enterprise: {
        ready: (cb: () => void) => void;
        execute: (siteKey: string, options: { action: string }) => Promise<string>;
        render: (container: string | HTMLElement, options: Record<string, unknown>) => number;
        getResponse: (widgetId: number) => string;
        reset: (widgetId: number) => void;
      };
    };
  }
}

interface BounceTokenGateProps {
  children: React.ReactNode;
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
  const [state, setState] = useState<"loading" | "granted" | "checkbox" | "verifying">("loading");
  const [fingerprint, setFingerprint] = useState<string>("");
  const navigate = useNavigate();
  const checkboxRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const attemptedRef = useRef(false);

  const hasValidToken = useCallback(() => {
    const token = sessionStorage.getItem(STORAGE_KEY);
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
        setFingerprint(visitorId);
      } catch {
        visitorId = "fp_unavailable_" + Date.now();
        setFingerprint(visitorId);
      }

      try {
        await waitForRecaptcha();

        const recaptchaToken = await window.grecaptcha.enterprise.execute(
          RECAPTCHA_SITE_KEY,
          { action: "bouncetoken_screen" }
        );

        const response = await apiClient.verifyBounceToken(recaptchaToken, visitorId);

        if (response.status === "granted" && response.elasticBounceTokenScreen) {
          sessionStorage.setItem(STORAGE_KEY, response.elasticBounceTokenScreen);
          setState("granted");
          return;
        }
      } catch {}

      setState("checkbox");
    };

    run();
  }, [hasValidToken, navigate]);

  useEffect(() => {
    if (state !== "checkbox" || !checkboxRef.current || widgetIdRef.current !== null) return;

    const mount = async () => {
      try {
        await waitForRecaptcha();
      } catch {
        navigate("/consentscreen/failure", { replace: true });
        return;
      }

      if (!checkboxRef.current || widgetIdRef.current !== null) return;

      widgetIdRef.current = window.grecaptcha.enterprise.render(checkboxRef.current, {
        sitekey: RECAPTCHA_SITE_KEY,
        callback: async (token: string) => {
          setState("verifying");
          try {
            const response = await apiClient.checkboxVerifyBounceToken(token, fingerprint);
            if (response.status === "granted" && response.elasticBounceTokenScreen) {
              sessionStorage.setItem(STORAGE_KEY, response.elasticBounceTokenScreen);
              setState("granted");
            } else {
              navigate("/consentscreen/failure", { replace: true });
            }
          } catch {
            navigate("/consentscreen/failure", { replace: true });
          }
        },
        "error-callback": () => {
          navigate("/consentscreen/failure", { replace: true });
        },
      });
    };

    mount();
  }, [state, fingerprint, navigate]);

  if (state === "granted") return <>{children}</>;

  if (state === "loading") {
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
  }

  if (state === "checkbox" || state === "verifying") {
    return (
      <div style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.9)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}>
        <div style={{
          backgroundColor: "#1e293b",
          borderRadius: "12px",
          padding: "2rem 2.5rem",
          textAlign: "center",
          maxWidth: "420px",
          border: "1px solid #334155",
        }}>
          <Shield size={32} color="#4ade80" style={{ marginBottom: "0.75rem" }} />
          <h2 style={{ color: "#f1f5f9", fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.375rem" }}>
            One more step
          </h2>
          <p style={{ color: "#94a3b8", fontSize: "0.8125rem", marginBottom: "1.25rem", lineHeight: 1.5 }}>
            Please verify you're human to continue.
          </p>
          {state === "verifying" ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
              <Loader2 size={18} color="#4ade80" style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ color: "#4ade80", fontSize: "0.875rem" }}>Verifying...</span>
            </div>
          ) : (
            <div ref={checkboxRef} style={{ display: "inline-block" }} />
          )}
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return null;
};

export default BounceTokenGate;
