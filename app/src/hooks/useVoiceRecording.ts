import { Audio } from "expo-av";
// This SDK's expo-file-system moved readAsStringAsync under "/legacy" -- the
// new default export uses File/Directory classes, and importing directly hits a
// deprecation path that is not implemented on web, breaking transcription there.
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { api } from "../api/client";

export type RecordingState = "idle" | "recording" | "transcribing";

// readAsStringAsync is built around native filesystem paths and does not
// support the blob: URLs a browser's MediaRecorder produces, so web reads the
// blob itself.
async function readUriAsBase64(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return dataUrl.split(",")[1] ?? "";
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

// iOS keeps the audio session in record mode until told otherwise, and while it
// is, playback is attenuated and can route to the earpiece.
async function releaseRecordingMode() {
  try {
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
  } catch {
    // Best-effort. Failing to restore playback mode is not worth surfacing.
  }
}

/**
 * Record, transcribe, and hand back the text without sending it.
 *
 * Returning the transcript rather than submitting it is deliberate. Whisper
 * mishears technical vocabulary, this is a noisy conference hall, and a
 * question is the whole input to the product -- so the attendee gets to read
 * and fix it before it becomes a search.
 */
export function useVoiceRecording() {
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  // Navigating away mid-recording would otherwise leave the microphone open.
  useEffect(() => {
    return () => {
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      recordingRef.current = null;
      void releaseRecordingMode();
    };
  }, []);

  async function startRecording() {
    setError(null);
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setError("Orbit needs microphone access to hear you.");
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setState("recording");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start recording. Check microphone access.");
      setState("idle");
    }
  }

  async function stopRecordingAndTranscribe(): Promise<string | null> {
    const recording = recordingRef.current;
    if (!recording) return null;

    setState("transcribing");
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;
      if (!uri) throw new Error("No recording captured");

      const audioBase64 = await readUriAsBase64(uri);
      const mimeType = Platform.OS === "web" ? "audio/webm" : "audio/m4a";

      const result = await api.transcribe(audioBase64, mimeType);
      return result.text;
    } catch (e) {
      setError(e instanceof Error ? e.message : "I couldn't hear that. Try again.");
      return null;
    } finally {
      await releaseRecordingMode();
      setState("idle");
    }
  }

  function cancelRecording() {
    recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    recordingRef.current = null;
    void releaseRecordingMode();
    setState("idle");
  }

  return { state, error, startRecording, stopRecordingAndTranscribe, cancelRecording };
}
