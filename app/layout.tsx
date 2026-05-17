import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "./sidebar";
import Topbar from "./topbar";

export const metadata: Metadata = {
  title: "FC Analyzer",
  description: "FC Sales consultation analyzer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="app">
          <Sidebar />
          <div className="main main-ambient">
            <Topbar />
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
