import { lazy, Suspense } from "react";
import { useParams, useSearchParams } from "react-router-dom";
const Logo = "/intakeLogo.png";

const WebGLBG = lazy(() => import("@/components/BG").then(m => ({ default: m.WebGLBackground })));

const ErrorPage = () => {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const statusCode = code && /^\d{3}$/.test(code) ? code : "404";

  let reason = "";
  try {
    const encoded = searchParams.get("r");
    if (encoded) reason = atob(encoded);
  } catch {}

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      backgroundColor: "#000",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 99999,
      padding: "2rem",
    }}>
      <Suspense fallback={null}><WebGLBG /></Suspense>
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>
        <img src={Logo} alt="EIDW Times" style={{ maxHeight: 140, maxWidth: "80vw", objectFit: "contain" }} />
        <img
          src={`https://http.cat/${statusCode}`}
          alt={`HTTP ${statusCode}`}
          style={{ maxWidth: "30vw", maxHeight: "30vh", objectFit: "contain" }}
        />
        {reason && (
          <div style={{
            padding: "0.75rem 1.25rem",
            backgroundColor: "rgba(0,0,0,0.7)",
            border: "1px solid #333",
            borderRadius: "8px",
            maxWidth: "90vw",
            textAlign: "center",
          }}>
            <p style={{
              color: "#aaa",
              fontSize: "0.95rem",
              margin: 0,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}>{reason}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ErrorPage;
