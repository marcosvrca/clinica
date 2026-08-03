import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

type Props = {
  enabled: boolean;
  locked: boolean;
  onBlob: (file: File) => void;
  onError: (message: string) => void;
};

/** Gravação local com consentimento — material de apoio, não documento final. */
export function SessionAudioRecorder({
  enabled,
  locked,
  onBlob,
  onError,
}: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    if (!enabled || locked) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime.split(";")[0] });
        stream.getTracks().forEach((t) => t.stop());
        const file = new File(
          [blob],
          `sessao-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`,
          { type: blob.type || "audio/webm" },
        );
        onBlob(file);
        setRecording(false);
        setSeconds(0);
        if (timerRef.current) window.clearInterval(timerRef.current);
      };
      mediaRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(
        () => setSeconds((s) => s + 1),
        1000,
      );
    } catch {
      onError("Não foi possível acessar o microfone");
    }
  }

  function stop() {
    mediaRef.current?.stop();
  }

  const label = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;

  return (
    <div className="row-actions" style={{ marginTop: 8, gap: 8 }}>
      {!recording ? (
        <button
          type="button"
          className="btn ghost sm"
          disabled={!enabled || locked}
          title={
            enabled
              ? "Gravar áudio de apoio (com consentimento)"
              : "Marque o consentimento para gravar"
          }
          onClick={() => void start()}
        >
          <Mic size={14} /> Gravar áudio
        </button>
      ) : (
        <button type="button" className="btn teal sm" onClick={stop}>
          <Square size={14} /> Parar ({label})
        </button>
      )}
    </div>
  );
}
