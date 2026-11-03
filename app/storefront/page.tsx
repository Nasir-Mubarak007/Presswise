import type { Metadata } from "next";
import StorefrontExperience from "./storefront-experience";

export const metadata: Metadata = {
  title: "Mike's Print Shop demo",
  description: "Preview the Presswise customer storefront and order journey.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function StorefrontPage() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap"
        rel="stylesheet"
      />
      <StorefrontExperience />
    </>
  );
}
