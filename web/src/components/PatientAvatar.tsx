import { useEffect, useState } from "react";
import { api } from "../api/client";
import { avatarColor, initials } from "../lib/ui";

type Size = "xs" | "sm" | "md" | "lg";

const sizeClass: Record<Size, string> = {
  xs: "xs",
  sm: "sm",
  md: "",
  lg: "lg",
};

export function PatientAvatar({
  patientId,
  name,
  phone,
  hasPhoto,
  size = "sm",
  className = "",
}: {
  patientId?: string | null;
  name?: string | null;
  phone?: string | null;
  hasPhoto?: boolean;
  size?: Size;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const label = name ?? phone ?? "?";

  useEffect(() => {
    if (!hasPhoto || !patientId) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    void api.patientPhotoUrl(patientId).then((u) => {
      if (cancelled) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      objectUrl = u;
      setUrl(u);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [patientId, hasPhoto]);

  const cls = ["avatar", sizeClass[size], className].filter(Boolean).join(" ");

  return (
    <div
      className={cls}
      style={{
        background: url ? "transparent" : avatarColor(label),
        overflow: "hidden",
      }}
    >
      {url ? (
        <img
          src={url}
          alt={label}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initials(name, phone)
      )}
    </div>
  );
}
