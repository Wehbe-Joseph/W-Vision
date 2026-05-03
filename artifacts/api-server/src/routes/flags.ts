import { Router } from "express";
import { db } from "@workspace/db";
import { angleFlagsTable } from "@workspace/db";
import { FlagAngleBody } from "@workspace/api-zod";

const router = Router();

router.post("/angles/flag", async (req, res) => {
  try {
    const parsed = FlagAngleBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    await db.insert(angleFlagsTable).values({
      tourId: parsed.data.tourId,
      angleId: parsed.data.angleId,
      viewerIp: req.ip || "unknown",
      reason: parsed.data.reason ?? undefined,
    });

    return res.json({ success: true, message: "Flag submitted" });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
