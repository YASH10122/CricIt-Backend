import Match, { MatchStatus } from "../model/match.model";
import Inning from "../model/inning.model";
import Ball from "../model/ball.model";
import { Request, Response } from "express";
import PlayerHistory from "../model/playerHistory.model";
import Player from "../model/players.model";
import { ExtraType, WicketType, generateAiCommentaryText } from "./ai.controller";

import { io } from "../server";


export const addBall = async (req: Request, res: Response) => {
  try {
    const { matchId, inningId } = req.params;

    const {
      runsScored = 0,
      extraType = null,
      extraRuns = 0,
      isWicket = false,
      wicketType,
      outPlayer,
      newBatsman,
      bowler,
    } = req.body;

    // 🔹 Fetch match & inning in parallel
    const [match, inning] = await Promise.all([
      Match.findById(matchId),
      Inning.findById(inningId),
    ]);

    if (!match) return res.status(404).json({ message: "Match not found" });
    if (!inning) return res.status(404).json({ message: "Inning not found" });

    if (match.status !== MatchStatus.LIVE) {
      return res.status(400).json({ message: "Match not live" });
    }

    if (inning.status === "completed") {
      return res.status(400).json({ message: "Inning already completed" });
    }

    // 🔹 Check legal delivery
    const isLegalDelivery =
      !extraType || (extraType !== "wide" && extraType !== "no-ball");

    // 🔹 Create Ball
    const ball = await Ball.create({
      matchId,
      inningsId: inningId,
      overNumber: inning.oversCompleted,
      ballNumber: inning.ballsInCurrentOver,
      batsman: inning.striker,
      bowler: bowler || inning.currentBowler,
      runsScored,
      extraType,
      extraRuns,
      isLegalDelivery,
      isWicket,
      wicketType,
      outPlayer,
    });

    const currentBowler = bowler || inning.currentBowler;

    // 🔥 Parallel PlayerHistory updates
    const updates = [
      // 🟢 Batsman
      PlayerHistory.findOneAndUpdate(
        { playerId: inning.striker, matchId },
        {
          $inc: {
            battingRuns: runsScored,
            battingBalls: isLegalDelivery ? 1 : 0,
            fours: runsScored === 4 ? 1 : 0,
            sixes: runsScored === 6 ? 1 : 0,
          },
        },
        { upsert: true }
      ),

      // 🔵 Bowler
      PlayerHistory.findOneAndUpdate(
        { playerId: currentBowler, matchId },
        {
          $inc: {
            runsConceded: runsScored + extraRuns,
            bowlingBalls: isLegalDelivery ? 1 : 0,
            wickets: isWicket ? 1 : 0,
          },
        },
        { upsert: true }
      ),
    ];

    // 🔴 Wicket update
    if (isWicket && outPlayer) {
      updates.push(
        PlayerHistory.findOneAndUpdate(
          { playerId: outPlayer, matchId },
          {
            isOut: true,
            outType: wicketType,
          }
        )
      );
    }

    // 🟡 Over complete update
    if (isLegalDelivery && inning.ballsInCurrentOver === 5) {
      updates.push(
        PlayerHistory.findOneAndUpdate(
          { playerId: currentBowler, matchId },
          { $inc: { bowlingOvers: 1 } }
        )
      );
    }

    await Promise.all(updates);

    // 🔹 Update inning stats
    inning.totalRuns += runsScored + extraRuns;

    if (isWicket) {
      inning.totalWickets++;

      if (newBatsman) {
        if (outPlayer.toString() === inning.striker.toString()) {
          inning.striker = newBatsman;
        } else {
          inning.nonStriker = newBatsman;
        }
      }
    }

    // 🔹 Ball count
    if (isLegalDelivery) {
      inning.ballsInCurrentOver++;

      if (inning.ballsInCurrentOver === 6) {
        inning.oversCompleted++;
        inning.ballsInCurrentOver = 0;

        // strike change
        [inning.striker, inning.nonStriker] = [
          inning.nonStriker,
          inning.striker,
        ];
      }
    }

    // 🔹 Strike rotate
    if (runsScored % 2 === 1) {
      [inning.striker, inning.nonStriker] = [
        inning.nonStriker,
        inning.striker,
      ];
    }

    // 🔹 All-out logic
    const battingTeamSize = inning.battingTeam.equals(match.teamA)
      ? match.playingTeamA.length
      : match.playingTeamB.length;

    if (inning.totalWickets >= battingTeamSize - 1) {
      inning.status = "completed";
      inning.resultType = "all-out";
    }

    // 🔹 Over finish
    if (inning.oversCompleted === match.totalOverInMatch) {
      inning.status = "completed";
      inning.resultType = "overs-completed";
    }

    // 🔹 Chase logic
    if (inning.inningNumber === 2) {
      if (inning.totalRuns >= (inning.target || 0)) {
        inning.status = "completed";

        await Promise.all([
          inning.save(),
          Match.findByIdAndUpdate(inning.matchId, {
            status: "completed",
          }),
        ]);
      }
    }

    // 🔹 Save inning + match parallel
    await Promise.all([inning.save(), match.save()]);

    // 🔥 Emit score instantly (FAST RESPONSE)
    io.emit("scoreUpdate", {
      inningId: inning._id,
      score: {
        runs: inning.totalRuns,
        wickets: inning.totalWickets,
        overs: `${inning.oversCompleted}.${inning.ballsInCurrentOver}`,
      },
      commentary: null,
    });

    // 🚀 Send response immediately
    res.status(201).json({
      message: "Ball added",
      inning,
      commentary: null,
    });

    // ===============================
    // 🔥 BACKGROUND AI COMMENTARY
    // ===============================
    setImmediate(async () => {
      try {
        const aiText = await generateAiCommentaryText({
          batsman: "Batsman",
          bowler: "Bowler",
          runsScored,
          extraType,
          isWicket,
          wicketType,
          overNumber: ball.overNumber,
          ballNumber: ball.ballNumber + 1,
        });

        await Ball.findByIdAndUpdate(ball._id, {
          commentaryText: aiText,
        });

        io.emit("commentaryUpdate", {
          inningId: inning._id,
          commentary: aiText,
        });
      } catch (err) {
        console.error("AI commentary error:", err);
      }
    });

  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

export const undoLastBall = async (req: Request, res: Response) => {
  try {
    const { inningId } = req.params;

    const lastBall = await Ball.findOne({ inningsId: inningId }).sort({
      createdAt: -1,
    });

    if (!lastBall) return res.status(404).json({ message: "No ball to undo" });

    const inning = await Inning.findById(inningId);
    if (!inning) return res.status(404).json({ message: "Inning not found" });

    inning.totalRuns -= lastBall.runsScored + (lastBall.extraRuns || 0);

    if (lastBall.isWicket) inning.totalWickets--;

    if (lastBall.isLegalDelivery) {
      if (inning.ballsInCurrentOver === 0) {
        inning.oversCompleted--;
        inning.ballsInCurrentOver = 5;
      } else {
        inning.ballsInCurrentOver--;
      }
    }

    await inning.save();
    await Ball.findByIdAndDelete(lastBall._id);

    res.json({ message: "Last ball undone", inning });
  } catch (error) {
    res.status(500).json({ message: "Error", error });
  }
};

export const getCurrentScore = async (req: Request, res: Response) => {
  const inning = await Inning.findById(req.params.inningId);

  res.json({
    runs: inning?.totalRuns,
    wickets: inning?.totalWickets,
    overs: `${inning?.oversCompleted}.${inning?.ballsInCurrentOver}`,
  });
};

export const getBallsByOver = async (req: Request, res: Response) => {
  const balls = await Ball.find({ inningsId: req.params.inningId }).sort({
    overNumber: 1,
    ballNumber: 1,
  });

  res.json(balls);
};

export const getCommentary = async (req: Request, res: Response) => {
  const balls = await Ball.find({ inningsId: req.params.inningId })
    .sort({ createdAt: -1 })
    .populate("batsman bowler");

  const commentary = balls.map((b) => {
    if (b.commentaryText) return b.commentaryText;

    let result = "";

    if (b.isWicket) result = "WICKET";
    else if (b.runsScored === 4) result = "FOUR";
    else if (b.runsScored === 6) result = "SIX";
    else if (b.extraType) result = b.extraType;
    else result = `${b.runsScored} run`;

    return `Over ${b.overNumber}.${b.ballNumber + 1} - ${result}`;
  });

  res.json(commentary);
};

export const changeBowler = async (req: Request, res: Response) => {
  try {
    const { inningId } = req.params;
    const { bowlerId } = req.body;

    const inning = await Inning.findById(inningId);
    if (!inning) return res.status(404).json({ message: "Inning not found" });

    inning.previousBowler = inning.currentBowler;
    inning.currentBowler = bowlerId;

    await inning.save();

    res.json({ message: "Bowler Changed", inning });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

