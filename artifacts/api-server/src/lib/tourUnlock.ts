import { db } from "@workspace/db";
import { toursTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getMemTour,
  unlockTourFullHouse,
} from "./tourMemoryStore";
import { runPanoramaGenerationForLockedRooms } from "./panoramaPipeline";
import { scenesToGroupsFromMem } from "./tourGenerationDriver";
import { logger } from "./logger";

type ReqLog = { info: Function; warn: Function; error: Function };

const defaultLog: ReqLog = {
  info: (...args: unknown[]) => logger.info(args),
  warn: (...args: unknown[]) => logger.warn(args),
  error: (...args: unknown[]) => logger.error(args),
};

/** Persist unlock and continue generating locked rooms. */
export async function unlockTourFullHouseAndResume(
  tourId: string,
  userId: string,
  reqLog: ReqLog = defaultLog,
): Promise<void> {
  unlockTourFullHouse(tourId);

  try {
    await db
      .update(toursTable)
      .set({
        fullHouseUnlocked: true,
        frozen: false,
        expiresAt: null,
        isFullHouse: false,
        generationStatus: "processing",
        status: "processing",
        currentStage: "Unlocking full house — generating remaining rooms…",
      })
      .where(eq(toursTable.id, tourId));
  } catch (err) {
    reqLog.warn({ err, tourId }, "Could not persist full-house unlock");
  }

  const mem = getMemTour(tourId);
  if (!mem || mem.userId !== userId) return;

  mem.fullHouseUnlocked = true;
  mem.generationStatus = "processing";
  mem.currentStage = "Unlocking full house — generating remaining rooms…";

  const groups = scenesToGroupsFromMem(mem);
  await runPanoramaGenerationForLockedRooms(tourId, groups, reqLog);
}
