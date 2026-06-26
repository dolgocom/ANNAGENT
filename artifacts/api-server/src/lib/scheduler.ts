import cron from "node-cron";
import { logger } from "./logger";
import { runMorningSequence, runEveningSequence } from "../agents/orchestrator";
import { sendMorningChecklist } from "./telegram";

export function startScheduler(): void {
  // 07:00 MSK = 04:00 UTC — send morning checklist first
  cron.schedule("0 4 * * *", async () => {
    logger.info("Cron: sending morning checklist");
    try {
      await sendMorningChecklist();
    } catch (err) {
      logger.error({ err }, "Cron: morning checklist failed");
    }
  }, { timezone: "UTC" });

  // 07:30 MSK = 04:30 UTC — run morning sequence (Аня had time to fill checklist)
  // Actually we run on-demand after CoS input, but also auto-run with Oura-only data
  cron.schedule("30 4 * * *", async () => {
    logger.info("Cron: auto morning sequence (Oura only)");
    try {
      await runMorningSequence();
    } catch (err) {
      logger.error({ err }, "Cron: morning sequence failed");
    }
  }, { timezone: "UTC" });

  // 22:00 MSK = 19:00 UTC — evening digest
  cron.schedule("0 19 * * *", async () => {
    logger.info("Cron: evening digest");
    try {
      await runEveningSequence();
    } catch (err) {
      logger.error({ err }, "Cron: evening sequence failed");
    }
  }, { timezone: "UTC" });

  logger.info("Scheduler started: morning 07:00 MSK, evening 22:00 MSK");
}
