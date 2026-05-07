import { Router, type IRouter } from "express";
import healthRouter from "./health";
import campaignsRouter from "./campaigns";
import spotsRouter from "./spots";
import checkoutRouter from "./checkout";
import adminRouter from "./admin";
import adminCampaignsRouter from "./adminCampaigns";
import adminOutreachRouter from "./adminOutreach";
import adAssistantRouter from "./adAssistant";
import dealersRouter from "./dealers";

const router: IRouter = Router();

router.use(healthRouter);
router.use(campaignsRouter);
router.use(spotsRouter);
router.use(checkoutRouter);
router.use(adminRouter);
router.use(adminCampaignsRouter);
router.use(adminOutreachRouter);
router.use(adAssistantRouter);
router.use(dealersRouter);

export default router;
