import { notFound } from "next/navigation";
import { logger } from "@/lib/log/logger";

export function isPrinterExperienceEnabled(): boolean {
  return process.env.PRINTER_EXPERIENCE_ENABLED === "1";
}

export type GateResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export function gatePrinterExperience(): GateResult {
  if (!isPrinterExperienceEnabled()) {
    logger.warn("printer.feature_gate_off", { event: "printer.feature_gate_off" });
    return { ok: false, code: "printer.disabled", message: "The printer experience is not available yet." };
  }
  return { ok: true };
}

export function requirePrinterExperience(): never {
  logger.warn("printer.feature_gate_off", { event: "printer.feature_gate_off" });
  notFound();
}
