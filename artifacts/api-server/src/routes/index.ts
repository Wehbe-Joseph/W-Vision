import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import userRouter from "./user";
import toursRouter from "./tours";
import generateTourRouter from "./generate-tour";
import leadsRouter from "./leads";
import analyticsRouter from "./analytics";
import flagsRouter from "./flags";
import imagesRouter from "./images";
import emailRouter from "./email";
import scrapeListingRouter from "./scrape-listing";
import classifyListingRouter from "./classify-listing";
import testPanoramaRouter from "./test-panorama";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(userRouter);
router.use(toursRouter);
router.use(generateTourRouter);
router.use(leadsRouter);
router.use(analyticsRouter);
router.use(flagsRouter);
router.use(imagesRouter);
router.use(emailRouter);
router.use(scrapeListingRouter);
router.use(classifyListingRouter);
router.use(testPanoramaRouter);

export default router;
