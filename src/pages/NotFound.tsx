import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
const LogoWebp = "/intakeLogo-577w.webp";
const LogoPng = "/intakeLogo-577w.png";

const WebGLBG = lazy(() => import("@/components/BG").then(m => ({ default: m.WebGLBackground })));

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

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
        <picture>
          <source type="image/webp" srcSet={LogoWebp} />
          <img src={LogoPng} alt="EIDW Times" style={{ maxHeight: 140, maxWidth: "80vw", objectFit: "contain" }} />
        </picture>
        <img
          src="https://http.cat/404"
          alt="HTTP 404"
          style={{ maxWidth: "30vw", maxHeight: "30vh", objectFit: "contain" }}
        />
      </div>
    </div>
  );
};

export default NotFound;
