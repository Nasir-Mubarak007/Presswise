import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPrinterExperienceEnabled, gatePrinterExperience } from "@/lib/printer-gate";

describe("printer experience gate", () => {
  const originalEnv = process.env.PRINTER_EXPERIENCE_ENABLED;

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    process.env.PRINTER_EXPERIENCE_ENABLED = originalEnv;
    vi.unstubAllEnvs();
  });

  describe("isPrinterExperienceEnabled", () => {
    it("returns true when PRINTER_EXPERIENCE_ENABLED is '1'", () => {
      process.env.PRINTER_EXPERIENCE_ENABLED = "1";
      expect(isPrinterExperienceEnabled()).toBe(true);
    });

    it("returns false when PRINTER_EXPERIENCE_ENABLED is not set", () => {
      delete process.env.PRINTER_EXPERIENCE_ENABLED;
      expect(isPrinterExperienceEnabled()).toBe(false);
    });

    it("returns false when PRINTER_EXPERIENCE_ENABLED is '0'", () => {
      process.env.PRINTER_EXPERIENCE_ENABLED = "0";
      expect(isPrinterExperienceEnabled()).toBe(false);
    });
  });

  describe("gatePrinterExperience", () => {
    it("returns ok when the feature is enabled", () => {
      process.env.PRINTER_EXPERIENCE_ENABLED = "1";
      const result = gatePrinterExperience();
      expect(result).toEqual({ ok: true });
    });

    it("returns a disabled error when the feature is off", () => {
      delete process.env.PRINTER_EXPERIENCE_ENABLED;
      const result = gatePrinterExperience();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("printer.disabled");
        expect(result.message).toContain("not available yet");
      }
    });
  });
});
