---
name: presswise-printer-design-system
source: derived
character: "A modern print studio with a warm, calm canvas, clear forest green actions, and precise product details."
tokens: "Read token values in app/printer/printer-theme.module.css. Do not copy values here."
contrast: "Light mode body 9.13:1, ink 12.67:1, muted 5.57:1, text on accent 6.50:1, control border 3.63:1. Dark mode body 13.14:1, ink 16.17:1, muted 8.50:1, text on accent 9.26:1, control border 3.88:1."
---

## Build mandate

Printer pages should feel like a capable, welcoming print studio. Use clear hierarchy, honest product details, and calm space around operational tasks. This direction applies to printer pages and public printer shops. Keep the in memory `/storefront` demo independent.

## Character and direction

The interface pairs warm paper tones with deep green text and a single emerald action color. It feels practical and considered, with product photography and real shop details carrying the visual interest.

## Composition patterns

Private printer pages use the existing dashboard shell, with a clear page title, useful context, and one main work area. Catalog pages give search and status controls a clear place above the product collection. Public printer pages lead with the shop identity, then show its published products and useful product details.

## Component and usage rules

Use the accent for primary actions and important selected states, not as decoration. Use raised white panels in light mode and deep green gray panels in dark mode. Keep borders visible where they define controls. Use the same small radius for inputs and buttons, the medium radius for panels, and full radius only for pills and avatars. Prefer a restrained shadow over heavy elevation.

## Responsive and accessibility direction

Keep the dashboard navigation responsive and preserve its specified mobile layout. Product images need useful alternative text. Use semantic headings, visible focus, clear form labels, and status text that does not rely on color alone. Support the system color preference and an explicit light or dark theme choice.
