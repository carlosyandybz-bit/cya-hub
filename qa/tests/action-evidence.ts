import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";

function safeSegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "step";
}

export class ActionEvidence {
  private stepNumber = 0;

  constructor(
    private readonly page: Page,
    private readonly testInfo: TestInfo,
    private readonly moduleName: string,
    private readonly screenName: string,
  ) {}

  async capture(action: string, state = "result") {
    this.stepNumber += 1;
    const prefix = String(this.stepNumber).padStart(3, "0");
    const fileName = `${prefix}_${safeSegment(action)}_${safeSegment(state)}.png`;
    const relative = path.join(
      "evidence",
      safeSegment(this.moduleName),
      safeSegment(this.screenName),
      fileName,
    );
    const outputPath = this.testInfo.outputPath(relative);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await this.page.screenshot({ path: outputPath, fullPage: true });
    await this.testInfo.attach(`${this.moduleName}/${this.screenName}/${fileName}`, {
      path: outputPath,
      contentType: "image/png",
    });
  }

  async after(action: string, interaction: () => Promise<unknown>, state = "result") {
    await interaction();
    await this.capture(action, state);
  }
}
