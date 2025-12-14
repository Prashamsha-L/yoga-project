# AI Powered Yoga Posture Detection and Correction with Personalized Wellness Insights

YogiAlign is an AI-powered yoga posture detection and correction system designed to help users practice yoga with correct alignment and form. The system uses Mediapipe library for the keypoint extraction and XGBoost algorithm for predicting the postures.

## Features
- Real-time yoga pose detection using webcam
- Accurate pose classification using machine learning
- Posture correction and feedback
- User-friendly web interface
- Supports multiple yoga postures

## Technologies Used
- **MediaPipe** – Real-time human pose estimation
- **XGBoost** – Yoga posture classification
- **Python** – Backend and machine learning
- **HTML, CSS, JavaScript** – Frontend
- **MongoDB** - Database
- **fastAPI** – Web framework

## System Workflow
1. Live video is captured through a webcam.  
2. Body landmarks are extracted using MediaPipe pose estimation.  
3. Joint angles are computed using the tangent function.  
4. Eight angle-based features are input to a pre-trained XGBoost classifier.  
5. The system predicts the corresponding yoga posture.  
6. The predicted posture is evaluated using posture correction logic.  
7. Visual and audio feedback are generated in real time.




