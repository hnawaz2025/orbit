import { Router } from "express";
import { z } from "zod";
import { transcribe } from "../ai/llm";
import { AppError } from "../errors";
import { asyncHandler } from "../middleware/asyncHandler";

// Audio in, text out. One direction only -- nothing here speaks back.
//
// Audio arrives base64-encoded inside JSON rather than as multipart, which is
// what the 15mb body limit in index.ts is sized for: base64 inflates a payload
// by roughly a third.
export const speechRouter = Router();

const transcribeSchema = z.object({
  audio: z.string().min(1),
  mimeType: z.string().min(1).default("audio/m4a"),
});

speechRouter.post(
  "/transcribe",
  asyncHandler(async (req, res) => {
    const { audio, mimeType } = transcribeSchema.parse(req.body);
    const buffer = Buffer.from(audio, "base64");

    // A recording of near-zero length is a tap that did not become a hold, not
    // a failed transcription. Saying so is more useful than sending silence to
    // Whisper and returning its empty string.
    if (buffer.byteLength < 2048) {
      throw new AppError("That was too short to hear. Hold the button while you talk.", {
        statusCode: 400,
        code: "RECORDING_TOO_SHORT",
      });
    }

    const text = await transcribe({ audio: buffer, mimeType });

    if (text.trim().length === 0) {
      throw new AppError("I couldn't make that out. Try again, or type it instead.", {
        statusCode: 422,
        code: "NO_SPEECH_DETECTED",
      });
    }

    res.json({ text });
  })
);
