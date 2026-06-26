import { Router, type IRouter } from "express";
import healthRouter from "./health";
import losRouter from "./los";

const router: IRouter = Router();

router.use(healthRouter);
router.use(losRouter);

export default router;
