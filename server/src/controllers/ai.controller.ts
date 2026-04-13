import { Request, Response } from "express";
import Groq from "groq-sdk";

export type ExtraType = "wide" | "no-ball" | "bye" | "leg-bye" | null;
export type WicketType =
  | "bowled"
  | "caught"
  | "lbw"
  | "run-out"
  | "stumped"
  | "hit-wicket"
  | "retired-out";

export interface CommentaryRequestBody {
  batsman: string;
  bowler: string;
  runsScored: number;
  extraType: ExtraType;
  isWicket: boolean;
  wicketType?: WicketType;
  overNumber: number;
  ballNumber: number;
}

export interface WinPredictionRequestBody {
  runs: number;
  wickets: number;
  overs: number;
  target?: number | null;
  rrr?: number | null;
  crr?: number | null;
  wicketsLeft: number;
}

const ALLOWED_EXTRAS = ["wide", "no-ball", "bye", "leg-bye", null];
const ALLOWED_WICKETS = [
  "bowled",
  "caught",
  "lbw",
  "run-out",
  "stumped",
  "hit-wicket",
  "retired-out",
];

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

let groqClient: Groq | null = null;

const getGroqClient = (): Groq | null => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  if (!groqClient) {
    groqClient = new Groq({ apiKey });
  }

  return groqClient;
};

const getTone = (runsScored: number, isWicket: boolean): string => {
  if (isWicket) return "dramatic";
  if (runsScored === 4 || runsScored === 6) return "exciting";
  if (runsScored === 0) return "calm";
  return "neutral";
};

const normalizeCommentary = (rawCommentary: string): string => {
  const cleanText = rawCommentary.replace(/\s+/g, " ").replace(/["']/g, "").trim();

  const sentenceMatch = cleanText.match(/^[^.!?]*[.!?]?/);
  const singleSentence = (sentenceMatch?.[0] || cleanText).trim();

  const words = singleSentence.split(" ").filter(Boolean).slice(0, 20);
  let finalSentence = words.join(" ").trim();

  if (!finalSentence) {
    return "Good ball, well played by the batter.";
  }

  if (!/[.!?]$/.test(finalSentence)) {
    finalSentence = `${finalSentence}.`;
  }

  return finalSentence;
};

const getFallbackCommentary = (body: CommentaryRequestBody): string => {
  const ballText = `${body.overNumber}.${body.ballNumber}`;

  if (body.isWicket) {
    return normalizeCommentary(
      `Over ${ballText}, ${body.bowler} to ${body.batsman}: OUT! ${body.wicketType || "wicket"} and big moment.`
    );
  }

  if (body.extraType === "wide") {
    return normalizeCommentary(
      `Over ${ballText}, wide from ${body.bowler}; extra run to the batting side.`
    );
  }

  if (body.extraType === "no-ball") {
    return normalizeCommentary(
      `Over ${ballText}, no-ball by ${body.bowler}; free scoring chance for ${body.batsman}.`
    );
  }

  if (body.runsScored === 6) {
    return normalizeCommentary(
      `Over ${ballText}, huge SIX by ${body.batsman} off ${body.bowler}.`
    );
  }

  if (body.runsScored === 4) {
    return normalizeCommentary(
      `Over ${ballText}, crisp FOUR from ${body.batsman} against ${body.bowler}.`
    );
  }

  if (body.runsScored === 0) {
    return normalizeCommentary(
      `Over ${ballText}, dot ball from ${body.bowler}; ${body.batsman} stays watchful.`
    );
  }

  return normalizeCommentary(
    `Over ${ballText}, ${body.bowler} to ${body.batsman}, ${body.runsScored} run${body.runsScored > 1 ? "s" : ""}.`
  );
};

const validateBody = (body: CommentaryRequestBody): string | null => {
  const {
    batsman,
    bowler,
    runsScored,
    extraType,
    isWicket,
    wicketType,
    overNumber,
    ballNumber,
  } = body;

  if (!batsman || !bowler) return "batsman and bowler are required";
  if (typeof runsScored !== "number" || runsScored < 0) return "runsScored must be a valid non-negative number";
  if (!ALLOWED_EXTRAS.includes(extraType)) return "extraType must be wide, no-ball, bye, leg-bye, or null";
  if (typeof isWicket !== "boolean") return "isWicket must be boolean";
  if (typeof overNumber !== "number" || overNumber < 0) return "overNumber must be a valid non-negative number";
  if (typeof ballNumber !== "number" || ballNumber < 0) return "ballNumber must be a valid non-negative number";

  if (isWicket && (!wicketType || !ALLOWED_WICKETS.includes(wicketType))) {
    return "wicketType is required and must be valid when isWicket is true";
  }

  return null;
};

export const generateAiCommentary = async (req: Request, res: Response) => {
  try {
    const body = req.body as CommentaryRequestBody;
    const validationError = validateBody(body);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const tone = getTone(body.runsScored, body.isWicket);

    const prompt = `
You are a professional cricket commentator.
Create exactly one short commentary sentence for the delivery.
Rules:
- Max 20 words
- If runs are 4 or 6, tone must be exciting
- If wicket fell, tone must be dramatic
- If dot ball, tone must be calm
- Return only one sentence, no extra text

Delivery:
- Over: ${body.overNumber}.${body.ballNumber}
- Bowler: ${body.bowler}
- Batsman: ${body.batsman}
- Runs: ${body.runsScored}
- Extra type: ${body.extraType ?? "none"}
- Wicket: ${body.isWicket ? "yes" : "no"}
- Wicket type: ${body.wicketType ?? "none"}
- Required tone: ${tone}
`.trim();

    const commentary = await generateAiCommentaryText(body, prompt);

    return res.status(200).json({ commentary });
  } catch (error) {
    const body = req.body as CommentaryRequestBody;
    if (body?.batsman && body?.bowler) {
      return res.status(200).json({ commentary: getFallbackCommentary(body) });
    }
    return res
      .status(500)
      .json({ message: "Failed to generate commentary", error: error instanceof Error ? error.message : "Unknown error" });
  }
};

const validatePredictionBody = (body: WinPredictionRequestBody): string | null => {
  if (typeof body.runs !== "number" || body.runs < 0) return "runs must be a valid non-negative number";
  if (typeof body.wickets !== "number" || body.wickets < 0) return "wickets must be a valid non-negative number";
  if (typeof body.overs !== "number" || body.overs < 0) return "overs must be a valid non-negative number";
  if (body.target != null && (typeof body.target !== "number" || body.target < 0)) return "target must be a valid non-negative number";
  if (body.rrr != null && typeof body.rrr !== "number") return "rrr must be a valid number";
  if (body.crr != null && typeof body.crr !== "number") return "crr must be a valid number";
  if (typeof body.wicketsLeft !== "number" || body.wicketsLeft < 0) return "wicketsLeft must be a valid non-negative number";
  return null;
};

const fallbackPrediction = (body: WinPredictionRequestBody): string => {
  const hasTarget = typeof body.target === "number" && body.target > 0;
  let chasingChance = 50;

  if (!hasTarget) {
    const crrBoost = body.crr != null ? clamp((body.crr - 7.5) * 3.5, -18, 18) : 0;
    const wicketBoost = clamp((body.wicketsLeft - 5) * 2.2, -12, 12);
    chasingChance = clamp(50 + crrBoost + wicketBoost, 15, 85);
  } else {
    const runRateDiff = body.rrr != null && body.crr != null ? body.crr - body.rrr : 0;
    const rateImpact = clamp(runRateDiff * 8, -35, 35);
    const wicketImpact = clamp((body.wicketsLeft - 5) * 3.2, -22, 22);
    const progressImpact = body.target ? clamp(((body.runs / body.target) - 0.5) * 25, -20, 20) : 0;
    chasingChance = clamp(50 + rateImpact + wicketImpact + progressImpact, 5, 95);
  }

  const teamB = Math.round(chasingChance);
  const teamA = 100 - teamB;
  return `Team A: ${teamA}%\nTeam B: ${teamB}%`;
};

const normalizePredictionOutput = (rawText: string): string | null => {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const teamALine = lines.find((line) => /^Team A:\s*\d{1,3}%$/i.test(line));
  const teamBLine = lines.find((line) => /^Team B:\s*\d{1,3}%$/i.test(line));

  if (!teamALine || !teamBLine) return null;

  const teamA = Number((teamALine.match(/\d{1,3}/) || [])[0]);
  const teamB = Number((teamBLine.match(/\d{1,3}/) || [])[0]);

  if (!Number.isFinite(teamA) || !Number.isFinite(teamB)) return null;
  if (teamA < 0 || teamB < 0 || teamA > 100 || teamB > 100) return null;
  if (teamA + teamB !== 100) return null;

  return `Team A: ${teamA}%\nTeam B: ${teamB}%`;
};

export const generateWinPrediction = async (req: Request, res: Response) => {
  try {
    const body = req.body as WinPredictionRequestBody;
    const validationError = validatePredictionBody(body);
    if (validationError) return res.status(400).json({ message: validationError });

    const prompt = `
You are a cricket prediction expert.

Based on the current match situation, predict the winning chances.

Match Data:
- Current Score: ${body.runs}/${body.wickets}
- Overs Completed: ${body.overs}
- Target: ${body.target ?? 0}
- Required Run Rate: ${body.rrr ?? 0}
- Current Run Rate: ${body.crr ?? 0}
- Wickets Left: ${body.wicketsLeft}

Rules:
- Give winning probability in percentage for both teams
- Be realistic (not random)
- Consider pressure, wickets, and run rate
- Total must be exactly 100%
- Output only in the exact format below

Output format:
Team A: XX%
Team B: XX%
`.trim();

    const client = getGroqClient();
    if (!client) {
      return res.status(200).json({ prediction: fallbackPrediction(body) });
    }

    const completion = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      max_tokens: 60,
      messages: [
        {
          role: "system",
          content:
            "You are a cricket analytics assistant. Return only two lines exactly: Team A: XX% and Team B: XX%.",
        },
        { role: "user", content: prompt },
      ],
    });

    const modelResponse = completion.choices[0]?.message?.content || "";
    const normalized = normalizePredictionOutput(modelResponse);
    return res.status(200).json({ prediction: normalized || fallbackPrediction(body) });
  } catch (error) {
    const body = req.body as WinPredictionRequestBody;
    return res.status(200).json({
      prediction: fallbackPrediction(body),
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

const generateAiCommentaryText = async (
  body: CommentaryRequestBody,
  preparedPrompt?: string,
  groq?: Groq
): Promise<string> => {
  const tone = getTone(body.runsScored, body.isWicket);

  const prompt =
    preparedPrompt ||
    `
You are a professional cricket commentator.
Create exactly one short commentary sentence for the delivery.
Rules:
- Max 20 words
- If runs are 4 or 6, tone must be exciting
- If wicket fell, tone must be dramatic
- If dot ball, tone must be calm
- Return only one sentence, no extra text

Delivery:
- Over: ${body.overNumber}.${body.ballNumber}
- Bowler: ${body.bowler}
- Batsman: ${body.batsman}
- Runs: ${body.runsScored}
- Extra type: ${body.extraType ?? "none"}
- Wicket: ${body.isWicket ? "yes" : "no"}
- Wicket type: ${body.wicketType ?? "none"}
- Required tone: ${tone}
`.trim();

  const client = groq || getGroqClient();
  if (!client) return getFallbackCommentary(body);

  const completion = await client.chat.completions.create({
    model: "llama-3.1-8b-instant",
    temperature: 0.8,
    max_tokens: 60,
    messages: [
      {
        role: "system",
        content: "You generate concise, realistic cricket commentary.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const modelResponse = completion.choices[0]?.message?.content || "";
  return normalizeCommentary(modelResponse || getFallbackCommentary(body));
};

export { generateAiCommentaryText };
