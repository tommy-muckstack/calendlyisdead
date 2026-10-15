import localFont from "next/font/local";
// OFL lookalikes for Calendly's proprietary "Calendly Sans" (headings) and "Wulkan Text" (serif feature headings).
export const cmSans = localFont({ src: "./InstrumentSans-Variable.woff2", variable: "--cm-sans", weight: "400 700", display: "swap" });
export const cmSerif = localFont({ src: "./Newsreader-Variable.woff2", variable: "--cm-serif", weight: "400 700", display: "swap" });
