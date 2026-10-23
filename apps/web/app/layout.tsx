import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "StemCycle Pickup", template: "%s · StemCycle Pickup" },
  description:
    "Schedule a free doorstep pickup for used textbooks. StemCycle donates them to rural communities.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#101814" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2"
        >
          Skip to content
        </a>
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
            <span aria-hidden="true" className="text-xl">
              📚
            </span>
            <span className="font-semibold tracking-tight">StemCycle Pickup</span>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
          {children}
        </main>
        <footer className="border-t border-border px-4 py-6 text-center text-sm text-muted">
          We use your details only to schedule your pickup and never share them.
        </footer>
      </body>
    </html>
  );
}
