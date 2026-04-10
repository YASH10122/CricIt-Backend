import { Request, Response } from "express";
import Team from "../model/team.model";
import { AuthRequest } from "../middleware/auth.middleware";
import User from "../model/users.model";
import Match from "../model/match.model";

export const deleteTeam = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const role = req.user?.role;

    const team = await Team.findById(id);

    if (!team) return res.status(404).json({ message: "Team not found" });

   
    if (role !== "admin" && team.createdBy.toString() !== userId) {
      return res.status(403).json({ message: "Not allowed" });
    }

    await Team.findByIdAndDelete(id);
    res.status(200).json({ message: "team deleted" });

  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};


export const getAllTeamsAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const teams = await Team.find().populate("createdBy", "username email");
    res.status(200).json(teams);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};


export const getAllUsers = async (req: AuthRequest, res: Response) => {
  try {
    const users = await User.find().select("-password"); // hide password
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};




export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    await User.findByIdAndDelete(id);

    res.status(200).json({ message: "User deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};



export const deleteMatch = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const match = await Match.findById(id);
    if (!match) return res.status(404).json({ message: "Match not found" });

    await Match.findByIdAndDelete(id);

    res.status(200).json({ message: "Match deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const getAllMatchesAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const matches = await Match.find()
      .populate("teamA", "teamname")
      .populate("teamB", "teamname");

    res.status(200).json(matches);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};