"use client";
import { useState } from "react";
import Image from "next/image";

export function ProfileAvatar({ name, image, size = 32, decorative = false }: { name: string; image?: string | null; size?: number; decorative?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const safe = image && (/^https:\/\//i.test(image) || /^data:image\/(?:png|jpeg|webp|gif);base64,/.test(image));
  return <span style={{ width: size, height: size, display: "inline-flex", flex: "none", alignItems: "center", justifyContent: "center", borderRadius: "50%", overflow: "hidden", background: "#ece4ff", color: "#6e54a3", fontSize: size / 2.5 }}>
    {safe && image !== failed ? <Image unoptimized src={image} alt={decorative ? "" : `${name || "Your"} profile photo`} width={size} height={size} referrerPolicy="no-referrer"
      style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setFailed(image)} />
      : <span role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : `${name || "Your"} initials`}>{name.trim()[0]?.toUpperCase() || "?"}</span>}
  </span>;
}
