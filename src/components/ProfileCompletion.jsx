import { useState, useEffect } from "react";
import { Trophy, X } from "lucide-react";

const CHECK_LABELS = {
  avatar: "Profile Photo",
  display_name: "Display Name",
  bio: "Bio",
  username: "Username",
  banner: "Banner Image",
  website: "Website",
  location: "Location",
  title: "Profile Title",
};

function getMessage(pct) {
  if (pct >= 100) return "Your profile is complete! 🎉";
  if (pct >= 75) return "Almost there! Just a few more details.";
  if (pct >= 50) return "Good start! Add more to stand out.";
  return "Complete your profile to connect with others.";
}

export default function ProfileCompletion({ completion, onDismiss }) {
  const { percentage = 0, checks = {} } = completion || {};
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <style>{`
        @keyframes pc-fill-grow {
          from { width: 0%; }
        }
      `}</style>

      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: 16,
          padding: 24,
          fontFamily: "inherit",
          position: "relative",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "none",
              border: "none",
              color: "var(--mist)",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--text-primary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--mist)")
            }
          >
            <X size={16} />
          </button>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 20,
          }}
        >
          <Trophy size={18} style={{ color: "var(--emerald)" }} />
          <span
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            Profile Completion
          </span>
        </div>

        <div
          style={{
            background: "var(--input-bg)",
            height: 8,
            borderRadius: 4,
            overflow: "hidden",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 4,
              background: "linear-gradient(90deg, var(--blue), var(--emerald))",
              transition: "width 0.8s cubic-bezier(0.22, 1, 0.36, 1)",
              width: mounted ? `${percentage}%` : "0%",
            }}
          />
        </div>

        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--blue)",
            marginBottom: 20,
          }}
        >
          {percentage}%
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 20,
          }}
        >
          {Object.entries(CHECK_LABELS).map(([key, label]) => {
            const done = !!checks[key];
            return (
              <div
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 14,
                  color: "var(--text-primary)",
                }}
              >
                <span
                  style={{
                    width: 20,
                    textAlign: "center",
                    color: done ? "var(--emerald)" : "var(--mist)",
                    fontSize: 14,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  {done ? "✓" : "○"}
                </span>
                <span style={{ opacity: done ? 0.6 : 1 }}>{label}</span>
              </div>
            );
          })}
        </div>

        <div
          style={{
            fontSize: 13,
            color: "var(--mist)",
            paddingTop: 16,
            borderTop: "1px solid var(--input-bg)",
          }}
        >
          {getMessage(percentage)}
        </div>
      </div>
    </>
  );
}
