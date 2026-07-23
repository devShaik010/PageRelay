import "./globals.css";

export const metadata = {
  title: {
    default: "PageRelay — a live page for shared words",
    template: "%s · PageRelay",
  },
  description:
    "Create a private live notepad, share the link, and write together in real time.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
