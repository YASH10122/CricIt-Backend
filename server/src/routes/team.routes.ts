import { createTeam, deleteTeam, getAllTeam,  } from "../controllers/team.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import express from 'express';

const router = express.Router();

router.post('/create', authMiddleware, createTeam);
router.get('/all',authMiddleware, getAllTeam);
// router.get('/all/:id', getAllTeamsbyId);
router.delete('/delete/:id', authMiddleware, deleteTeam);

export default router;