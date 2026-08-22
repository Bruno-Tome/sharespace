import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = { title: "ShareSpace — rooms for real-time connection", description: "A calm place to share a space with your people." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body className="noise">{children}<Analytics /></body></html>; }
