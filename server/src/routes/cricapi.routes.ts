import { Router } from "express";
import { getCricMatches, getCricMatchInfo, getCricMatchScorecard } from "../controllers/cricapi.controller";

const router = Router();

router.get("/matches", getCricMatches);
router.get("/match_info", getCricMatchInfo);
router.get("/match_scorecard", getCricMatchScorecard);

export default router;
