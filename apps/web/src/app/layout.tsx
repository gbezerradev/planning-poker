import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "../index.css";
import "../features.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"),
  title: "Ponto — Planning poker para times que decidem juntos",
  description: "Planning poker colaborativo, simples e bonito para estimar histórias com seu time.",
  openGraph: {
    title: "PONTO — Planning poker",
    description: "Planning poker para times que decidem juntos.",
    images: [{ url: "/og.png", width: 1733, height: 908 }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
        <Toaster
          position="top-center"
          closeButton
          expand
          gap={10}
          visibleToasts={4}
          offset={{ top: 18 }}
          mobileOffset={{ top: 12, left: 12, right: 12 }}
          toastOptions={{
            duration: 4000,
            classNames: {
              toast: "ponto-toast",
              title: "ponto-toast-title",
              description: "ponto-toast-description",
              icon: "ponto-toast-icon",
              closeButton: "ponto-toast-close",
              success: "ponto-toast-success",
              error: "ponto-toast-error",
              info: "ponto-toast-info",
              warning: "ponto-toast-warning",
            },
          }}
        />
      </body>
    </html>
  );
}
