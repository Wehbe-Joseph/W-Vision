import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import userRouter from "./user";
import toursRouter from "./tours";
import leadsRouter from "./leads";
import analyticsRouter from "./analytics";
import flagsRouter from "./flags";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(userRouter);
router.use(toursRouter);
router.use(leadsRouter);
router.use(analyticsRouter);
router.use(flagsRouter);

export default router;
