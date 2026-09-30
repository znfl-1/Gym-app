import "./globals.css";
import PwaRegister from "./pwa-register";

export const metadata = {
  title: "Gym App",
  description: "Personal workout tracking and progress app",
  themeColor: "#090909",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<PwaRegister /></body>
    </html>
  );
}
