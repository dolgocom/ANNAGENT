import { Router, type IRouter } from "express";
import { runMorningSequence, runEveningSequence } from "../agents/orchestrator";
import { runDecisionSupportAgent } from "../agents/decision-support";
import { db } from "@workspace/db";
import { digestsTable, biometricsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Trigger morning sequence manually
router.post("/los/morning", async (req, res) => {
  try {
    const digest = await runMorningSequence(req.body);
    res.json({ success: true, digest });
  } catch (err) {
    req.log.error({ err }, "Morning sequence failed");
    res.status(500).json({ success: false, error: "Morning sequence failed" });
  }
});

// Trigger evening sequence manually
router.post("/los/evening", async (req, res) => {
  try {
    await runEveningSequence();
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Evening sequence failed");
    res.status(500).json({ success: false, error: "Evening sequence failed" });
  }
});

// Decision analysis
router.post("/los/decide", async (req, res) => {
  const { description, financialContext, peopleContext } = req.body as {
    description?: string;
    financialContext?: string;
    peopleContext?: string;
  };

  if (!description) {
    res.status(400).json({ error: "description is required" });
    return;
  }

  try {
    const result = await runDecisionSupportAgent({
      mode: "decision_analysis",
      decisionDescription: description,
      financialContext,
      peopleContext,
    });
    res.json({ success: true, result });
  } catch (err) {
    req.log.error({ err }, "Decision analysis failed");
    res.status(500).json({ success: false, error: "Decision analysis failed" });
  }
});

// Get recent digests
router.get("/los/digests", async (req, res) => {
  try {
    const digests = await db
      .select()
      .from(digestsTable)
      .orderBy(desc(digestsTable.createdAt))
      .limit(20);
    res.json({ digests });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch digests");
    res.status(500).json({ error: "Failed to fetch digests" });
  }
});

// Get recent biometrics
router.get("/los/biometrics", async (req, res) => {
  try {
    const records = await db
      .select()
      .from(biometricsTable)
      .orderBy(desc(biometricsTable.createdAt))
      .limit(30);
    res.json({ records });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch biometrics");
    res.status(500).json({ error: "Failed to fetch biometrics" });
  }
});

export default router;
