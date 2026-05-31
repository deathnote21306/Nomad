import struct
import threading

import cv2
import pyaudio
import requests

BASE_URL = "http://10.201.48.197:8080"
VIDEO_URL = f"{BASE_URL}/video"
AUDIO_URL = f"{BASE_URL}/audio.wav"
AUDIOIN_URL = f"{BASE_URL}/audioin.wav"


def mjpeg_frames():
    cap = cv2.VideoCapture(VIDEO_URL)
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
        _, buf = cv2.imencode(".jpg", frame)
        yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
    cap.release()


def start_audio_playback() -> threading.Thread:
    """Stream phone mic audio and play it through the laptop speakers."""
    def _loop():
        try:
            with requests.get(AUDIO_URL, stream=True, timeout=10) as r:
                header = r.raw.read(44)
                channels = struct.unpack_from("<H", header, 22)[0]
                sample_rate = struct.unpack_from("<I", header, 24)[0]
                bits = struct.unpack_from("<H", header, 34)[0]
                fmt = pyaudio.paInt16 if bits == 16 else pyaudio.paInt8
                print(f"[Audio] {channels}ch  {sample_rate}Hz  {bits}-bit")
                pa = pyaudio.PyAudio()
                stream = pa.open(format=fmt, channels=channels, rate=sample_rate, output=True)
                try:
                    for chunk in r.iter_content(chunk_size=4096):
                        if chunk:
                            stream.write(chunk)
                finally:
                    stream.stop_stream()
                    stream.close()
                    pa.terminate()
        except Exception as e:
            print(f"[Audio] error: {e}")

    t = threading.Thread(target=_loop, daemon=True)
    t.start()
    return t


def push_audio(wav_bytes: bytes) -> bool:
    """Push WAV audio to the phone to play through its speaker."""
    try:
        r = requests.post(AUDIOIN_URL, data=wav_bytes, headers={"Content-Type": "audio/wav"}, timeout=10)
        return r.ok
    except Exception as e:
        print(f"[AudioIn] error: {e}")
        return False
