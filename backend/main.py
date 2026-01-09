from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import pickle
import numpy as np
import logging
import sys

app = FastAPI()

# Enable CORS so frontend JS can call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



logger = logging.getLogger("uvicorn")  
logger.setLevel(logging.INFO)

# Angle-based model for 50 yoga poses
with open("abc.pkl", "rb") as f:
    angle_model = pickle.load(f)

# Surya Namaskara model - angle based
with open("surya_namaskar.pkl", "rb") as f:
    surya_model = pickle.load(f)

# Surya pose labels
surya_labels = {
    0: "Adho Mukha Svanasana",
    1: "Ashtanga Namaskar",
    2: "Ashwa Sanchalanasana",
    3: "Ashwa Sanchalanasana",
    4: "Bhujangasana",
    5: "Chaturanga Dandasana",
    6: "Hasta Uttanasana",
    7: "Padahastasana",
    8: "Pranamasana"
}


CONFIDENCE_THRESHOLD = 0.80  # start permissive; raise later if needed
VARIANCE_THRESHOLD = 5.0     # small variance -> likely neutral/standing
MIN_ANGLE_COUNT = 8          # expect 8 angle features


pose_labels =  {
    0: 'Adho Mukha Svanasana',
    1: 'Ananda balasana',
    2: 'Anantasana',
    3: 'Anjaneyasana',
    4: 'Ardha Chakrasana',
    5: 'Ardha Chandrasana',
    6: 'Ardha Matsyendrasana',
    7: 'Ardha Uttasana',
    8: 'Baddha Konasana',
    9: 'Balasana',
    10: 'Bitilasana',
    11: 'Dandasana',
    12: 'Dhanurasana',
    13: 'Gomukhasana',
    14: 'Halasana',
    15: 'Kapotasana',
    16: 'Malasana',
    17: 'Marjariasana',
    18: 'Natarajasana',
    19: 'Padmasana',
    20: 'Parighasana',
    21: 'Paripurna Navasana',
    22: 'Parivritta Trikonasana',
    23: 'Setu Bandha Sarvangasana',
    24: 'Svarga dvidasana',
    25: 'Tadasana Samasthiti',
    26: 'Tadasana Urdhva Baddha Hastasana',
    27: 'Tadasana Urdhva Hastasana',
    28: 'Tittibhasana',
    29: 'Urdhva Dandasana',
    30: 'Urdhva Dhanurasana',
    31: 'Utkata Konasana',
    32: 'Utkatasana',
    33: 'Uttana shishosana',
    34: 'Uttanasana',
    35: 'Utthita Hasta Padangusthasana',
    36: 'Utthita Hasta Padasana',
    37: 'Utthita Parsvakonasana',
    38: 'Utthita Trikonasana',
    39: 'Vajrasana',
    40: 'Vasisthasana',
    41: 'Virabhadrasana I',
    42: 'Virabhadrasana II',
    43: 'Virabhadrasana III',
    44: 'Visvamitrasana',
    45: 'Vrichikasana',
    46: 'Vrkshasana'
}

from correction import check_pose
    
joint_names = [
            "left_elbow", "right_elbow",
            "left_shoulder", "right_shoulder",
            "left_knee", "right_knee",
            "left_hip", "right_hip"
        ]
@app.post("/predict_pose")
async def predict_pose(request: Request):
    data = await request.json()
    angles = data.get("angles", [])

    if not angles or len(angles) < MIN_ANGLE_COUNT:
        return JSONResponse({"pose": "No Pose Detected", "confidence": 0.0})

    
    try:
        arr = np.array(angles, dtype=float).reshape(1, -1)
        raw = arr.flatten()
    except Exception:
        return JSONResponse({"pose": "No Pose Detected", "confidence": 0.0})

    
    if np.isnan(raw).any() or np.all(raw == 0):
        return JSONResponse({"pose": "No Pose Detected", "confidence": 0.0})


    if np.var(raw) < VARIANCE_THRESHOLD:
        return JSONResponse({"pose": "No Pose Detected", "confidence": 0.0})

    try:
        if hasattr(angle_model, "predict_proba"):
            proba = angle_model.predict_proba(arr)[0]
            prediction = int(np.argmax(proba))
            confidence = float(np.max(proba))
        else:
            prediction = int(angle_model.predict(arr)[0])
            confidence = None
        
        pose_name = pose_labels.get(prediction, "Unknown Pose")

    


        if confidence is not None and confidence < CONFIDENCE_THRESHOLD:
            print(f"Low confidence ({confidence:.2f}), returning No Pose")
            return JSONResponse({"pose": "No Pose Detected", "confidence": confidence})

        
        corrections, feedback = check_pose(pose_name, raw.tolist(), joint_names)
        wrong_joints = sum(1 for c in corrections.values() if c != "green")

        logger.info("\n===== Pose Prediction =====")
        logger.info(f"Predicted Pose : {pose_name}")
        logger.info(f"Angles         : {[round(a,2) for a in raw.tolist()]}")
        logger.info(f"Joint Status   : {corrections}")
        logger.info(f"Confidence     : {confidence:.2f}" if confidence else "Confidence: None")
        logger.info(f"Wrong Joints   : {wrong_joints}")
        logger.info(f"Feedback       : {feedback}")
        logger.info("============================\n")

        if wrong_joints >= 5:  
            return JSONResponse({
        "pose": "No Pose Detected",
        "confidence": confidence,
        "corrections": corrections,
        "feedback": feedback
    })


        return JSONResponse({
        "pose": pose_name,
        "confidence": confidence,
        "angles": angles,
        "corrections": corrections,
        "feedback": feedback
    })
       
    except Exception as e:
        print(f"Error during prediction: {str(e)}")
        return JSONResponse({"pose": f"Error: {str(e)}", "confidence": 0.0})

@app.post("/predict_surya")
async def predict_surya(request: Request):
    data = await request.json()
    angles = data.get("angles", [])

    if not angles or len(angles) < MIN_ANGLE_COUNT:
        return JSONResponse({"pose": "No Pose Detected", "confidence": 0.0})

    try:
        arr = np.array(angles, dtype=float).reshape(1, -1)
        raw = arr.flatten()
    except Exception:
        return JSONResponse({"pose": "No Pose Detected", "confidence": 0.0})

    if np.isnan(raw).any() or np.all(raw == 0):
        return JSONResponse({"pose": "No Pose Detected", "confidence": 0.0})

    if np.var(raw) < VARIANCE_THRESHOLD:
        return JSONResponse({"pose": "No Pose Detected", "confidence": 0.0})

    try:
        if hasattr(surya_model, "predict_proba"):
            proba = surya_model.predict_proba(arr)[0]
            prediction = int(np.argmax(proba))
            confidence = float(np.max(proba))
        else:
            prediction = int(surya_model.predict(arr)[0])
            confidence = None

        pose_name = surya_labels.get(prediction, "Unknown Pose")

        if confidence is not None and confidence < CONFIDENCE_THRESHOLD:
            return JSONResponse({"pose": "No Pose Detected", "confidence": confidence})

        corrections, feedback = check_pose(pose_name, raw.tolist(), joint_names)
        wrong_joints = sum(1 for c in corrections.values() if c != "green")

        if wrong_joints >= 5:
            return JSONResponse({
                "pose": "No Pose Detected",
                "confidence": confidence,
                "corrections": corrections,
                "feedback": feedback
            })

        return JSONResponse({
            "pose": pose_name,
            "confidence": confidence,
            "angles": angles,
            "corrections": corrections,
            "feedback": feedback
        })

    except Exception as e:
        return JSONResponse({"pose": f"Error: {str(e)}", "confidence": 0.0})

