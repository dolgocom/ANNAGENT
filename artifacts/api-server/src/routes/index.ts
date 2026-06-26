import { Router, type IRouter } from "express";
import healthRouter from "./health";
import losRouter from "./los";
import telegramRouter from "./telegram";

const router: IRouter = Router();

router.use(healthRouter);
router.use(losRouter);
router.use(telegramRouter);

export default router;
