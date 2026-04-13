import express from "express";
import { generateAiCommentary, generateWinPrediction } from "../controllers/ai.controller";

const router = express.Router();

router.post("/commentary", generateAiCommentary);
router.post("/win-prediction", generateWinPrediction);

export default router;
