"""Flask backend for the Netra diabetic retinopathy detector (PyTorch ConvNeXt-Base)."""
import json
import threading
import zipfile
import time
from pathlib import Path

import cv2
import numpy as np
import timm
import torch
from flask import Flask, jsonify, render_template, request

from class_info import CLASS_INFO, GENERAL
from doctors import DoctorDirectory

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"
MODEL_PATH = MODEL_DIR / "best_convnext_fold0.pth"   # state_dict saved by torch.save
ALLOWED_EXT = {"png", "jpg", "jpeg", "bmp"}
LOW_CONFIDENCE = 0.55
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

with open(MODEL_DIR / "model_config.json") as f:
    CONFIG = json.load(f)
with open(BASE_DIR / "data" / "metrics.json") as f:
    METRICS = json.load(f)

IMG_SIZE = CONFIG["img_size"]
CLASS_NAMES = CONFIG["class_names"]
MEAN = np.array(CONFIG["mean"], dtype=np.float32)
STD = np.array(CONFIG["std"], dtype=np.float32)
DOCTORS = DoctorDirectory(BASE_DIR / "data" / "ophthalmologists.csv")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB upload limit

_model = None
_lock = threading.Lock()


def resolve_model_file():
    """Return a real checkpoint file. If the .pth was extracted into a folder
    (a common mistake on Windows), pack it back into a proper .pth archive."""
    if MODEL_PATH.is_file():
        return MODEL_PATH
    if MODEL_PATH.is_dir():
        pkl = next(MODEL_PATH.rglob("data.pkl"), None)
        if pkl is not None:
            root = pkl.parent
            rebuilt = MODEL_DIR / "best_convnext_fold0_rebuilt.pth"
            if not rebuilt.exists():
                print("Model folder found instead of a file. Repacking it as a .pth (one time)...")
                tmp = MODEL_DIR / "rebuilding.tmp"
                with zipfile.ZipFile(tmp, "w", zipfile.ZIP_STORED) as z:
                    for f in sorted(root.rglob("*")):
                        if f.is_file():
                            info = zipfile.ZipInfo(f"{root.name}/{f.relative_to(root).as_posix()}",
                                                   date_time=(2020, 1, 1, 0, 0, 0))
                            info.compress_type = zipfile.ZIP_STORED
                            z.writestr(info, f.read_bytes())
                tmp.replace(rebuilt)
            return rebuilt
    raise FileNotFoundError(MODEL_PATH)


def get_model():
    """Build ConvNeXt-Base, load the trained weights once, keep it in memory."""
    global _model
    with _lock:
        if _model is None:
            net = timm.create_model("convnext_base", pretrained=False, num_classes=CONFIG["num_classes"])
            state = torch.load(resolve_model_file(), map_location="cpu", weights_only=True)
            if isinstance(state, dict) and "state_dict" in state:
                state = state["state_dict"]
            state = {k.replace("module.", "", 1): v for k, v in state.items()}
            net.load_state_dict(state)
            _model = net.to(DEVICE).eval()
        return _model


def preprocess(image_bytes):
    """Same steps as validation in the notebook: RGB, bilinear resize to 224x224,
    divide by 255, normalise with ImageNet mean and std, channels first."""
    bgr = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("not an image")
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    rgb = cv2.resize(rgb, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_LINEAR)
    x = (rgb.astype(np.float32) / 255.0 - MEAN) / STD
    return torch.from_numpy(x.transpose(2, 0, 1)[None].copy())


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/health")
def health():
    return jsonify(status="ok", model="convnext_base", loaded=_model is not None, device=str(DEVICE))


@app.route("/api/metrics")
def metrics():
    return jsonify(METRICS)


@app.route("/api/classes")
def classes():
    return jsonify(classes=CLASS_INFO, general=GENERAL)


@app.route("/api/predict", methods=["POST"])
def predict():
    file = request.files.get("image")
    if file is None or file.filename == "":
        return jsonify(error="No image received. Choose a retina photo and try again."), 400

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXT:
        return jsonify(error="Unsupported file type. Upload a PNG, JPG or BMP image."), 400

    try:
        batch = preprocess(file.read())
    except Exception:
        return jsonify(error="The file could not be read as an image. Try another photo."), 400

    try:
        model = get_model()
    except FileNotFoundError:
        return jsonify(error="Model file not found. Put best_convnext_fold0.pth inside the models folder and restart."), 503
    start = time.perf_counter()
    with torch.inference_mode():
        probs = torch.softmax(model(batch.to(DEVICE)), dim=1)[0].cpu().numpy()
    elapsed_ms = round((time.perf_counter() - start) * 1000)

    order = np.argsort(probs)[::-1]
    idx, second = int(order[0]), int(order[1])
    confidence = float(probs[idx])

    return jsonify(
        model="convnext_base",
        index=idx,
        label=CLASS_NAMES[idx],
        confidence=confidence,
        probabilities=[{"label": CLASS_NAMES[i], "value": float(probs[i])} for i in range(len(CLASS_NAMES))],
        runner_up={"label": CLASS_NAMES[second], "value": float(probs[second])},
        low_confidence=confidence < LOW_CONFIDENCE,
        inference_ms=elapsed_ms,
        info=CLASS_INFO[idx],
        disclaimer=GENERAL["disclaimer"],
    )


@app.route("/api/doctors/meta")
def doctors_meta():
    return jsonify(DOCTORS.meta())


@app.route("/api/chat/parse", methods=["POST"])
def chat_parse():
    """Understand a typed or tapped answer for one chatbot step."""
    body = request.get_json(silent=True) or {}
    step, text = body.get("step", ""), str(body.get("text", ""))[:200]
    parsers = {"class": DOCTORS.parse_class, "city": DOCTORS.parse_city,
               "experience": DOCTORS.parse_experience, "fee": DOCTORS.parse_fee}
    if step not in parsers:
        return jsonify(ok=False, message="Unknown step."), 400
    return jsonify(parsers[step](text))


@app.route("/api/doctors", methods=["POST"])
def doctors_search():
    b = request.get_json(silent=True) or {}
    try:
        result = DOCTORS.search(
            city=b.get("city") or None,
            min_experience=int(b.get("min_experience") or 0),
            max_fee=int(b["max_fee"]) if b.get("max_fee") else None,
            class_index=int(b.get("class_index") or 0),
            sort=b.get("sort", "best") if b.get("sort") in ("best", "fee", "experience") else "best",
            offset=max(0, int(b.get("offset") or 0)),
            limit=min(12, max(1, int(b.get("limit") or 6))),
        )
    except (TypeError, ValueError):
        return jsonify(error="Invalid search values."), 400
    return jsonify(result)


@app.errorhandler(413)
def too_large(_):
    return jsonify(error="That image is larger than 10 MB. Use a smaller file."), 413


if __name__ == "__main__":
    try:
        get_model()  # load once at start so the first prediction is fast
    except FileNotFoundError:
        print("WARNING: models/best_convnext_fold0.pth is missing. Copy your trained file there.")
    app.run(host="127.0.0.1", port=5000, debug=False)