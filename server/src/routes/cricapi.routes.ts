import { Router } from "express";
import { getCricMatches, getCricMatchInfo } from "../controllers/cricapi.controller";

const router = Router();

router.get("/matches", getCricMatches);
router.get("/match_info", getCricMatchInfo);

export default router;
