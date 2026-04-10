import express from "express";
import {
  deleteTeam,
  deleteUser,
  deleteMatch,
  getAllUsers,
  getAllMatchesAdmin,
  getAllTeamsAdmin,
} from "../controllers/admin.controller";

import { authMiddleware, adminMiddleware } from "../middleware/auth.middleware";

const router = express.Router();


router.get("/teams", authMiddleware, adminMiddleware, getAllTeamsAdmin);
router.delete("/team/:id", authMiddleware, adminMiddleware, deleteTeam);


router.get("/users", authMiddleware, adminMiddleware, getAllUsers);
router.delete("/user/:id", authMiddleware, adminMiddleware, deleteUser);

router.get("/matches", authMiddleware, adminMiddleware, getAllMatchesAdmin);
router.delete("/match/:id", authMiddleware, adminMiddleware, deleteMatch);

export default router;