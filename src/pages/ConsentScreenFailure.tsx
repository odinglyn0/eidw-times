import { AlertTriangle } from "lucide-react";

const ConsentScreenFailure = () => {
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
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <AlertTriangle
        size={120}
        color="#ef4444"
        strokeWidth={2.5}
      />
      <h1 style={{
        color: "#ef4444",
        fontSize: "2.5rem",
        fontWeight: 700,
        marginTop: "1.5rem",
        marginBottom: "0.75rem",
        textAlign: "center",
      }}>
        Suspicious Device Detected
      </h1>
      <p style={{
        color: "#dc2626",
        fontSize: "1.125rem",
        textAlign: "center",
        maxWidth: "480px",
        lineHeight: 1.6,
      }}>
        We were unable to verify your session. Please try again later.
      </p>
    </div>
  );
};

export default ConsentScreenFailure;
