import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { apiClient } from "@/integrations/api/client";

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
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      setFingerprint(result.visitorId);

      window.grecaptcha.enterprise.ready(async () => {
        try {
          const recaptchaToken = await window.grecaptcha.enterprise.execute(
            RECAPTCHA_SITE_KEY,
            { action: "bouncetoken_screen" }
          );

          const response = await apiClient.verifyBounceToken(recaptchaToken, result.visitorId);

          if (response.status === "granted" && response.elasticBounceTokenScreen) {
            sessionStorage.setItem(STORAGE_KEY, response.elasticBounceTokenScreen);
            setState("granted");
          } else if (response.status === "checkbox_required") {
            setState("checkbox");
          } else {
            navigate("/consentscreen/failure", { replace: true });
          }
        } catch {
          navigate("/consentscreen/failure", { replace: true });
        }
      });
    };

    run();
  }, [hasValidToken, navigate]);

  useEffect(() => {
    if (state !== "checkbox" || !checkboxRef.current || widgetIdRef.current !== null) return;

    window.grecaptcha.enterprise.ready(() => {
      widgetIdRef.current = window.grecaptcha.enterprise.render(checkboxRef.current!, {
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
    });
  }, [state, fingerprint, navigate]);

  if (state === "granted") return <>{children}</>;

  if (state === "checkbox" || state === "verifying") {
    return (
      <div style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.85)",
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
          padding: "2rem",
          textAlign: "center",
          maxWidth: "400px",
        }}>
          <h2 style={{ color: "#fff", fontSize: "1.25rem", marginBottom: "0.5rem" }}>
            Verification Required
          </h2>
          <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            Please complete the challenge below to continue.
          </p>
          {state === "verifying" ? (
            <p style={{ color: "#4ade80" }}>Verifying...</p>
          ) : (
            <div ref={checkboxRef} style={{ display: "inline-block" }} />
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default BounceTokenGate;
