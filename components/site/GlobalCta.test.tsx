// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CTA_LINE, GlobalCta, HeaderCta, ctaWhatsappUrl } from "@/components/site/GlobalCta";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("globaler Aufruf", () => {
  it("heisst «Wir machen Marketing für dich.»", () => {
    expect(CTA_LINE).toBe("Wir machen Marketing für dich.");
  });

  it("baut den WhatsApp-Link nur mit Nummer und kodiert den Text", () => {
    expect(ctaWhatsappUrl(undefined)).toBeNull();
    expect(ctaWhatsappUrl("abc")).toBeNull();
    const url = ctaWhatsappUrl("+41 79 000 00 00")!;
    expect(url.startsWith("https://wa.me/41790000000?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toContain("tools.alperna.ch");
  });

  it("zeigt Band und Knöpfe, sobald ein Kontaktweg gesetzt ist", () => {
    vi.stubEnv("NEXT_PUBLIC_ERSTGESPRAECH_URL", "https://alperna.ch/erstgespraech");
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", "41790000000");
    render(<GlobalCta />);
    expect(screen.getByRole("heading", { name: CTA_LINE })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kostenloses Erstgespräch/ })).toHaveAttribute("href", "https://alperna.ch/erstgespraech");
    expect(screen.getByRole("link", { name: "Kurz schreiben" })).toHaveAttribute("href", expect.stringContaining("wa.me/41790000000"));
  });

  it("lässt das Band weg, wenn weder Erstgespräch noch WhatsApp gesetzt sind (kein Aufruf ohne Weg)", () => {
    vi.stubEnv("NEXT_PUBLIC_ERSTGESPRAECH_URL", "");
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", "");
    const { container } = render(
      <>
        <GlobalCta />
        <HeaderCta />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt den Knopf im Kopf nur mit Erstgespräch-Link", () => {
    vi.stubEnv("NEXT_PUBLIC_ERSTGESPRAECH_URL", "https://alperna.ch/erstgespraech");
    render(<HeaderCta />);
    expect(screen.getByRole("link", { name: CTA_LINE })).toHaveAttribute("href", "https://alperna.ch/erstgespraech");
  });
});
