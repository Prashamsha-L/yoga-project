(() => {
  const ID = {
    LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
    LEFT_WRIST: 15, RIGHT_WRIST: 16,
    LEFT_HIP: 23, RIGHT_HIP: 24,
    LEFT_KNEE: 25, RIGHT_KNEE: 26,
    LEFT_ANKLE: 27, RIGHT_ANKLE: 28
  };

  const MODEL_ENDPOINT = "http://127.0.0.1:8002/predict_surya";
  const SMOOTH_FRAMES = 2;
  const STAGNANT_THRESHOLD = 8;
  const TOLERANCE = 8;
  const POSE_HOLD_THRESHOLD = 2;
  const MIN_ACCURACY = 50; 

  window.suryaPoses = [
    "Pranamasana", "Hasta Uttanasana", "Padahastasana",
    "Ashwa Sanchalanasana", "Chaturanga Dandasana", "Ashtanga Namaskar",
    "Bhujangasana", "Adho Mukha Svanasana", "Ashwa Sanchalanasana",
    "Padahastasana", "Hasta Uttanasana", "Pranamasana"
  ];

  const MIN_POSE_COUNT = window.suryaPoses.length;

  let camera, pose;
  let isRunning = false;
  let angleHistory = [];
  let prevAngles = null;
  let stagnantCount = 0;
  let holdMatchCount = 0;
  let lastSuggestionTime = 0;

  window.showSkeleton = true;
  window.latestCorrections = {};
  window.currentPoseIndex = 0;
  window.currentRound = 1;
  window.currentDetectedPose = "Waiting...";
  window.currentPoseAccuracy = 0;

  let sessionResults;

  function speak(text, isSuggestion = false) {
    if (!window.speechSynthesis) return;
    const now = Date.now();
    if (isSuggestion && now - lastSuggestionTime < 5000) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-IN";
    u.rate = 0.85;
    u.pitch = 1.0;
    u.volume = 0.9;
    window.speechSynthesis.speak(u);
    if (isSuggestion) lastSuggestionTime = now;
  }

  function calculateAccuracyFromCorrections(corrections) {
    if (!corrections || Object.keys(corrections).length === 0) return 0;
    let total = 0;
    let green = 0;
    Object.values(corrections).forEach(status => {
      if (status === 'green' || status === 'red') {
        total++;
        if (status === 'green') green++;
      }
    });
    if (total === 0) return 0;
    return Math.round((green / total) * 100);
  }

  function initEmptySession() {
    const rounds = parseInt(localStorage.getItem("suryaRounds") || "1", 10);
    const steps = [];
    for (let round = 1; round <= rounds; round++) {
      for (let i = 0; i < window.suryaPoses.length; i++) {
        steps.push({
          round: round,
          index: i + 1,
          expected: window.suryaPoses[i],
          detected: "Not performed",
          accuracy: 0,
          corrections: {},
          feedback: "",
          timestamp: null,
          roundSamples: []
        });
      }
    }
    return {
      steps: steps,
      sessionDate: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      overallAccuracy: 0,
      rounds: rounds
    };
  }

  function saveSession() {
    localStorage.setItem("suryaSessionFull", JSON.stringify(sessionResults));
  }

  window.resetSuryaSession = function() {
    sessionResults = initEmptySession();
    saveSession();
    window.currentPoseIndex = 0;
    window.currentRound = 1;
    window.currentDetectedPose = "Waiting...";
    window.currentPoseAccuracy = 0;
  };

  function loadSession() {
    const raw = localStorage.getItem("suryaSessionFull");
    if (!raw) {
      sessionResults = initEmptySession();
      saveSession();
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.steps || parsed.steps.length === 0) {
        sessionResults = initEmptySession();
      } else {
        sessionResults = parsed;
      }
    } catch {
      sessionResults = initEmptySession();
    }
    saveSession();
  }

  loadSession();

  function updatePoseAverage(round, poseIndex) {
    const idx = (round - 1) * MIN_POSE_COUNT + (poseIndex - 1);
    const samples = sessionResults.steps[idx].roundSamples;
    if (samples.length > 0) {
      sessionResults.steps[idx].accuracy = Math.round(
        samples.reduce((sum, sample) => sum + sample.accuracy, 0) / samples.length
      );
    }
  }

  function recordPoseAttempt(accuracy, corrections, detected = "Attempted", feedback = "") {
    const round = window.currentRound;
    const poseIndex = window.currentPoseIndex + 1;
    const idx = (round - 1) * MIN_POSE_COUNT + (poseIndex - 1);

    if (idx >= sessionResults.steps.length) return false;

    
    if (accuracy >= 30) {
      sessionResults.steps[idx].roundSamples.push({
        accuracy: accuracy,
        corrections: corrections,
        detected: detected,
        feedback: feedback,
        timestamp: Date.now()
      });

      updatePoseAverage(round, poseIndex);
      sessionResults.steps[idx].detected = detected;
      sessionResults.steps[idx].corrections = corrections;
      sessionResults.steps[idx].feedback = feedback;
      sessionResults.steps[idx].timestamp = Date.now();
      saveSession();
    }

    return true;
  }

  async function sendSuryaAngles(angles) {
    try {
      const res = await fetch(MODEL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ angles })
      });
      if (!res.ok) throw new Error('Model HTTP ' + res.status);

      const data = await res.json();
      const detectedPose = (data.pose || 'No Pose').trim();
      window.currentDetectedPose = detectedPose;
      window.latestCorrections = data.corrections || {};

      const accuracy = calculateAccuracyFromCorrections(data.corrections);
      window.currentPoseAccuracy = accuracy;

      // Only record if accuracy is decent (≥30%)
      if (accuracy >= 30) {
        recordPoseAttempt(accuracy, data.corrections, detectedPose, data.feedback || "");
      }

      const expectedPose = window.suryaPoses[window.currentPoseIndex];
      if (
        detectedPose.toLowerCase() === expectedPose.toLowerCase() &&
        accuracy >= MIN_ACCURACY
      ) {
        holdMatchCount++;
        if (holdMatchCount >= POSE_HOLD_THRESHOLD) {
          holdMatchCount = 0;
          if (window.currentPoseIndex < window.suryaPoses.length - 1) {
            speak(`Good! Now do ${window.suryaPoses[window.currentPoseIndex + 1]}`);
          } else {
            speak("Good! Round complete!");
          }
          advancePose();
          return;
        }
      } else {
        holdMatchCount = 0;
      }

      // Update UI only if accuracy is meaningful
      if (window.onSuryaDetected && accuracy >= 30) {
        window.onSuryaDetected(detectedPose, { accuracy: window.currentPoseAccuracy });
      } else if (window.onSuryaDetected) {
        window.onSuryaDetected('No Pose', { accuracy: 0 });
      }

    } catch (e) {
      console.error("Pose detection error:", e);
      window.currentDetectedPose = "Error";
      window.currentPoseAccuracy = 0;
      if (window.onSuryaDetected) {
        window.onSuryaDetected('No Pose', { accuracy: 0 });
      }
    }
  }

  function advancePose() {
    const posesPerRound = window.suryaPoses.length;
    const totalRounds = sessionResults.rounds;

    window.currentPoseIndex++;

    if (window.currentPoseIndex >= posesPerRound) {
      if (window.currentRound < totalRounds) {
        window.currentRound++;
        window.currentPoseIndex = 0;
        speak(`Round ${window.currentRound} starting. Do Pranamasana`);
      } else {
        if (window.onSuryaDetected) {
          window.onSuryaDetected('All rounds completed', { accuracy: 100 });
        }
        speak("Excellent! All rounds completed!");
        stopDetection(true);
        return;
      }
    }

    // Reset counters and state for next pose
    holdMatchCount = 0;
    window.currentDetectedPose = "Waiting...";
    window.currentPoseAccuracy = 0;
    window.latestCorrections = {};

    saveSession();

    if (window.updatePoseDisplay) window.updatePoseDisplay();
  }

  function stopDetection(redirect = true) {
    isRunning = false;

    const validSteps = sessionResults.steps.filter(s => s.roundSamples.length > 0);
    const overall = validSteps.length
      ? Math.round(validSteps.reduce((sum, step) => sum + step.accuracy, 0) / validSteps.length)
      : 0;

    sessionResults.overallAccuracy = overall;
    saveSession();

    if (redirect) {
      setTimeout(() => window.location.href = 'surya_result.html', 1500);
    }
  }

  window.stopDetection = stopDetection;

  function angleABC(A, B, C) {
    if (!A || !B || !C) return 0;
    const BAx = A.x - B.x, BAy = A.y - B.y;
    const BCx = C.x - B.x, BCy = C.y - B.y;
    const dot = BAx * BCx + BAy * BCy;
    const magBA = Math.hypot(BAx, BAy);
    const magBC = Math.hypot(BCx, BCy);
    if (magBA === 0 || magBC === 0) return 0;
    const cos = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
    return Math.acos(cos) * (180 / Math.PI);
  }

  function buildAngleVector(lm) {
    return [
      angleABC(lm[ID.LEFT_SHOULDER], lm[ID.LEFT_ELBOW], lm[ID.LEFT_WRIST]),
      angleABC(lm[ID.RIGHT_SHOULDER], lm[ID.RIGHT_ELBOW], lm[ID.RIGHT_WRIST]),
      angleABC(lm[ID.LEFT_ELBOW], lm[ID.LEFT_SHOULDER], lm[ID.LEFT_HIP]),
      angleABC(lm[ID.RIGHT_ELBOW], lm[ID.RIGHT_SHOULDER], lm[ID.RIGHT_HIP]),
      angleABC(lm[ID.LEFT_HIP], lm[ID.LEFT_KNEE], lm[ID.LEFT_ANKLE]),
      angleABC(lm[ID.RIGHT_HIP], lm[ID.RIGHT_KNEE], lm[ID.RIGHT_ANKLE]),
      angleABC(lm[ID.LEFT_SHOULDER], lm[ID.LEFT_HIP], lm[ID.LEFT_KNEE]),
      angleABC(lm[ID.RIGHT_SHOULDER], lm[ID.RIGHT_HIP], lm[ID.RIGHT_KNEE])
    ];
  }

  function smoothAngles(angles) {
    angleHistory.push(angles);
    if (angleHistory.length > SMOOTH_FRAMES) angleHistory.shift();
    const len = angleHistory.length;
    const n = angleHistory[0].length;
    const out = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < len; j++) out[i] += angleHistory[j][i];
      out[i] = out[i] / len;
    }
    return out;
  }

  function initMediaPipe() {
    const video = document.getElementById('webcam');
    const canvas = document.getElementById('output_canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1280;
    canvas.height = 720;

    pose = new window.Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    pose.onResults((results) => {
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      if (!results.poseLandmarks) {
        ctx.restore();
        return;
      }

      if (window.showSkeleton) {
        window.drawConnectors(ctx, results.poseLandmarks, window.POSE_CONNECTIONS, { color: '#ffffff', lineWidth: 3 });
      }

      const angles = smoothAngles(buildAngleVector(results.poseLandmarks));

      if (prevAngles) {
        const stable = angles.every((a, i) => Math.abs(a - prevAngles[i]) <= TOLERANCE);
        stagnantCount = stable ? stagnantCount + 1 : 0;
      }
      prevAngles = [...angles];

      if (stagnantCount >= STAGNANT_THRESHOLD && isRunning) {
        sendSuryaAngles(angles);
        stagnantCount = 0;
      }

      const corrections = window.latestCorrections || {};
      const joints = {
        left_elbow: 13, right_elbow: 14,
        left_shoulder: 11, right_shoulder: 12,
        left_knee: 25, right_knee: 26,
        left_hip: 23, right_hip: 24
      };
      Object.entries(joints).forEach(([name, id]) => {
        const lm = results.poseLandmarks[id];
        if (!lm) return;
        ctx.beginPath();
        ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 6, 0, Math.PI * 2);
        const color = corrections[name] === 'green' ? '#00ff00' : (corrections[name] === 'red' ? '#ff0000' : '#ffcc00');
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      ctx.restore();
    });

    camera = new window.Camera(video, {
      onFrame: async () => { if (isRunning) await pose.send({ image: video }); },
      width: 640,
      height: 480
    });
  }

  window.startDetection = () => {
    if (!isRunning) {
      isRunning = true;
      angleHistory = [];
      prevAngles = null;
      stagnantCount = 0;
      holdMatchCount = 0;
      lastSuggestionTime = 0;
      window.currentDetectedPose = "Waiting...";
      window.currentPoseAccuracy = 0;
      window.latestCorrections = {};

      camera.start();
      speak(`Start Surya Namaskar session. Round ${window.currentRound}. Do ${window.suryaPoses[window.currentPoseIndex]}`);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMediaPipe);
  } else {
    initMediaPipe();
  }
})();