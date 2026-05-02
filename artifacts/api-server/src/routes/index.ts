import { Router, type IRouter } from "express";
import healthRouter from "./health";
import campaignsRouter from "./campaigns";
import spotsRouter from "./spots";
import checkoutRouter from "./checkout";
import adminRouter from "./admin";
import adminCampaignsRouter from "./adminCampaigns";
import adAssistantRouter from "./adAssistant";

const router: IRouter = Router();

router.use(healthRouter);
router.use(campaignsRouter);
router.use(spotsRouter);
router.use(checkoutRouter);
router.use(adminRouter);
router.use(adminCampaignsRouter);
router.use(adAssistantRouter);

export default router;
