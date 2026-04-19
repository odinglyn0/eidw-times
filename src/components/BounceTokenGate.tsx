import { useEffect, useState, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useVisitorData } from "@fingerprint/react";
import { apiClient } from "@/integrations/api/client";
import { mintDatagram, storeDatagramManifest, getDatagramManifest } from "@/integrations/api/datagram";
import { dataflintSolveWithFingerprint } from "@/integrations/api/dataflint";
import { smackInit, smackDestroy } from "@/integrations/api/smack";
import type { DataflintChallenge } from "@/integrations/api/dataflint";
const LogoAvif1x = "/intakeLogo-577w.avif";
const LogoAvif2x = "/intakeLogo-1154w.avif";
const LogoWebp1x = "/intakeLogo-577w.webp";
const LogoWebp2x = "/intakeLogo-1154w.webp";
const LogoPngFallback = "/intakeLogo-577w.png";

const TileBG = lazy(() => import("@/components/BG").then(m => ({ default: m.WebGLBackground })));

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
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp("(?:^|; )" + escaped + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

(function hideRecaptchaBadge() {
  if (document.getElementById('hide-recaptcha-badge')) return;
  const style = document.createElement('style');
  style.id = 'hide-recaptcha-badge';
  style.textContent = '.grecaptcha-badge { visibility: hidden !important; opacity: 0 !important; }';
  document.head.appendChild(style);
})();

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

function StretchLoader() {
  return (
    <>
      <div className="sk-stretch">
        <div className="sk-r sk-r1" />
        <div className="sk-r sk-r2" />
        <div className="sk-r sk-r3" />
        <div className="sk-r sk-r4" />
        <div className="sk-r sk-r5" />
      </div>
      <style>{`
        .sk-stretch{width:50px;height:40px;text-align:center;font-size:10px}
        .sk-stretch .sk-r{background:#fff;height:100%;width:6px;display:inline-block;animation:sk-sd 1.2s infinite ease-in-out}
        .sk-r2{animation-delay:-1.1s!important}
        .sk-r3{animation-delay:-1.0s!important}
        .sk-r4{animation-delay:-0.9s!important}
        .sk-r5{animation-delay:-0.8s!important}
        @keyframes sk-sd{0%,40%,100%{transform:scaleY(0.4)}20%{transform:scaleY(1.0)}}
      `}</style>
    </>
  );
}

function RotatePlaneLoader() {
  return (
    <>
      <div className="sk-plane" />
      <style>{`
        .sk-plane{width:40px;height:40px;background:#fff;animation:sk-rp 1.2s infinite ease-in-out}
        @keyframes sk-rp{0%{transform:perspective(120px) rotateX(0deg) rotateY(0deg)}50%{transform:perspective(120px) rotateX(-180.1deg) rotateY(0deg)}100%{transform:perspective(120px) rotateX(-180deg) rotateY(-179.9deg)}}
      `}</style>
    </>
  );
}

function CubeGridLoader() {
  return (
    <>
      <div className="sk-cg">
        {[1,2,3,4,5,6,7,8,9].map(n => <div key={n} className={`sk-c sk-c${n}`} />)}
      </div>
      <style>{`
        .sk-cg{width:40px;height:40px}
        .sk-c{width:33%;height:33%;background:#fff;float:left;animation:sk-cgd 1.3s infinite ease-in-out}
        .sk-c1{animation-delay:0.2s}.sk-c2{animation-delay:0.3s}.sk-c3{animation-delay:0.4s}
        .sk-c4{animation-delay:0.1s}.sk-c5{animation-delay:0.2s}.sk-c6{animation-delay:0.3s}
        .sk-c7{animation-delay:0s}.sk-c8{animation-delay:0.1s}.sk-c9{animation-delay:0.2s}
        @keyframes sk-cgd{0%,70%,100%{transform:scale3D(1,1,1)}35%{transform:scale3D(0,0,1)}}
      `}</style>
    </>
  );
}

const LOADERS = [StretchLoader, RotatePlaneLoader, CubeGridLoader];

const BounceTokenGate = ({ children }: BounceTokenGateProps) => {
  const [state, setState] = useState<"loading" | "granted" | "failed">("loading");
  const navigate = useNavigate();
  const attemptedRef = useRef(false);
  const Loader = useMemo(() => LOADERS[Math.floor(Math.random() * LOADERS.length)], []);
  const { getData: getFpData } = useVisitorData({ immediate: false });

  const initSmackAndGrant = useCallback(async () => {
    const bt = getCookie(COOKIE_NAME);
    const fp = sessionStorage.getItem("_ebfp");
    const manifest = getDatagramManifest();
    if (bt && fp && manifest?.smack) {
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${wsProtocol}//${manifest.host}${manifest.smack.wsRoute}`;
      try {
        await smackInit({
          bounceToken: bt,
          fingerprint: fp,
          wsUrl,
          smackSecret: manifest.smack.smackSecret,
        });
      } catch {}
    }
    setState("granted");
  }, []);

  const hasValidToken = useCallback(() => {
    const token = getCookie(COOKIE_NAME);
    if (!token) return false;
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return false;
      const payload = JSON.parse(atob(parts[1]));
      if (payload.exp * 1000 <= Date.now()) return false;
      const storedFp = sessionStorage.getItem("_ebfp");
      if (!storedFp) return false;
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    const isDebug = isLocalhost && params.get("debug") === "true" && params.get("m") === "btg";

    if (isDebug && params.get("reject") === "true") {
      setTimeout(() => setState("failed"), 1000 + Math.random() * 1000);
      return;
    }

    if (isDebug) return;

    if (hasValidToken()) {
      const fp = sessionStorage.getItem("_ebfp");
      if (fp && !getDatagramManifest()) {
        mintDatagram(fp)
          .then(m => storeDatagramManifest(m))
          .catch(() => {})
          .finally(() => initSmackAndGrant());
      } else {
        initSmackAndGrant();
      }
      return;
    }

    if (attemptedRef.current) return;
    attemptedRef.current = true;

    const run = async () => {
      await new Promise(r => setTimeout(r, 50));

      let visitorId = "";

      try {
        const fpResult = await getFpData();
        visitorId = fpResult?.visitor_id || "";
      } catch {
        visitorId = "fp_unavailable_" + Date.now();
      }

      if (!visitorId) {
        visitorId = "fp_unavailable_" + Date.now();
      }

      try {
        const manifest = await mintDatagram(visitorId);
        storeDatagramManifest(manifest);
      } catch (err) {
        console.warn("[BounceGate] Datagram mint failed (non-fatal):", err);
      }

      try {
        await waitForRecaptcha();

        const recaptchaToken = await window.grecaptcha.enterprise.execute(
          RECAPTCHA_SITE_KEY,
          { action: "bouncetoken_screen" }
        );

        const response = await apiClient.verifyBounceToken(recaptchaToken, visitorId);

        if (response.status === "dataflint_challenge" && response.challenge) {
          const challenge: DataflintChallenge = response.challenge;
          const nonce = await dataflintSolveWithFingerprint(challenge, visitorId);

          const recaptchaToken2 = await window.grecaptcha.enterprise.execute(
            RECAPTCHA_SITE_KEY,
            { action: "bouncetoken_screen" }
          );

          const response2 = await apiClient.verifyBounceTokenWithFlint(
            recaptchaToken2,
            visitorId,
            challenge.challengeId,
            nonce
          );

          if (response2.status === "granted" && response2.elasticBounceTokenScreen) {
            setCookie(COOKIE_NAME, response2.elasticBounceTokenScreen, 1);
            try { sessionStorage.setItem("_ebfp", visitorId); } catch {}
            await initSmackAndGrant();
            return;
          }

          setState("failed");
          return;
        }

        if (response.status === "granted" && response.elasticBounceTokenScreen) {
          setCookie(COOKIE_NAME, response.elasticBounceTokenScreen, 1);
          try { sessionStorage.setItem("_ebfp", visitorId); } catch {}
          await initSmackAndGrant();
          return;
        }

        setState("failed");
      } catch (err) {
        console.warn("[BounceGate] Verification failed:", err);
        setState("failed");
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidToken]);

  useEffect(() => {
    if (state === "failed") {
      smackDestroy();
      try {
        localStorage.clear();
        sessionStorage.clear();
        document.cookie.split(";").forEach((c) => {
          const name = c.split("=")[0].trim();
          const paths = ["/"];
          const domains = [
            "",
            window.location.hostname,
            "." + window.location.hostname,
            ".eidwtimes.xyz",
            "eidwtimes.xyz",
          ];
          for (const d of domains) {
            for (const p of paths) {
              const domainPart = d ? `;domain=${d}` : "";
              document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=${p}${domainPart}`;
            }
          }
        });
      } catch {}
      navigate(`/error/403?r=${btoa("We were unable to verify your session. Please try again later.")}`, { replace: true });
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
      <Suspense fallback={null}><TileBG /></Suspense>
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>
        <picture>
          <source type="image/avif" srcSet={`${LogoAvif1x} 577w, ${LogoAvif2x} 1154w`} sizes="(max-width: 577px) 80vw, 577px" />
          <source type="image/webp" srcSet={`${LogoWebp1x} 577w, ${LogoWebp2x} 1154w`} sizes="(max-width: 577px) 80vw, 577px" />
          <img src={LogoPngFallback} alt="EIDW Times" width={577} height={125} {...{ fetchpriority: "high" } as React.HTMLAttributes<HTMLImageElement>} style={{ maxHeight: 140, maxWidth: "80vw", objectFit: "contain", marginBottom: "2rem" }} />
        </picture>
        <Loader />
        <p style={{ color: "#64748b", fontSize: "0.8125rem" }}>
          Verifying you are not an evil hacker
        </p>
        <nav style={{ textAlign: "center", fontSize: "0.75rem", color: "#9ca3af", marginTop: "1rem" }}>
          <a href="https://datagram.eidwtimes.xyz/api/seo-security-data" style={{ color: "#9ca3af", textDecoration: "none" }}>I'm a search engine</a>
          {" · "}
          <a href="/llms.txt" style={{ color: "#9ca3af", textDecoration: "none" }}>I'm an LLM</a>
        </nav>
      </div>
    </div>
  );
};

export default BounceTokenGate;