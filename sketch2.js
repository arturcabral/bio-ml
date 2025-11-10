let torso;
let points = [];
let basePoints = [];
let repelStrength = 50; // intensidade do espalhamento

// ml5 handPose
let handPose;
let video;
let hands = [];

// controle de tempo sem mão
let lastHandTime = 0;
let extraMotion = false;
let extraMotionStart = 0;

// quadrado verde
let showGreenSquare = false;
let greenSquareTimer = 0;
let greenSquareDuration = 1000; // 1 segundo

let myFont;

function preload() {
  torso = loadModel('modelo.obj', true);
  handPose = ml5.handPose();
  myFont = loadFont('roboto.ttf');
}

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  textFont(myFont);
  noCursor();

  // Webcam baixa resolução
  video = createCapture(VIDEO);
  video.size(320, 240);
  video.hide();

  handPose.detectStart(video, gotHands);

  // Sample dos pontos do torso (point cloud)
  let density = 30; 
  for (let f = 0; f < torso.faces.length; f++) {
    const face = torso.faces[f];
    const v1 = torso.vertices[face[0]];
    const v2 = torso.vertices[face[1]];
    const v3 = torso.vertices[face[2]];
    const sampled = sampleTriangle(v1, v2, v3, density);
    points.push(...sampled);
    basePoints.push(...sampled.map(p => p.copy()));
  }
}

let lastFingerX = 0;
let lastFingerY = 0;
let fingerDetectedPrev = false;

function draw() {
  background(0);

  // --- Mapeamento do dedo indicador ---
  let fingerDetected = false;
  let fingerX = 0;
  let fingerY = 0;

  if (hands.length > 0) {
    let finger = hands[0].keypoints[8]; // dedo indicador
    fingerX = map(finger.x, 0, video.width, -width/2, width/2);
    fingerY = map(finger.y, 0, video.height, -height/2, height/2); // vertical invertido
    fingerDetected = true;

    lastFingerX = fingerX;
    lastFingerY = fingerY;
  }

  // --- Atualiza texto de status ---
  let statusDiv = document.getElementById("status");
  if (fingerDetected) {
    statusDiv.innerText = "mão_detectado";
    statusDiv.style.color = "lime";
  } else {
    statusDiv.innerText = "mão_não_conectada";
    statusDiv.style.color = "red";
  }

  // --- Quadrado verde na última posição se a mão sumiu ---
  if (!fingerDetected && fingerDetectedPrev) {
    showGreenSquare = true;
    greenSquareTimer = millis();
  }
  fingerDetectedPrev = fingerDetected;

  // --- Movimentação extra das partículas ---
  if (!fingerDetected) {
    if (!extraMotion && millis() - lastHandTime > 10000) {
      extraMotion = true;
      extraMotionStart = millis();
    }
  } else {
    lastHandTime = millis();
    extraMotion = false;
  }
  if (extraMotion && millis() - extraMotionStart > 500) {
    extraMotion = false;
    lastHandTime = millis();
  }

  // --- Point cloud + esfera do dedo ---
  push();
  rotateX(PI);
  rotateY(frameCount * 0.005);
  scale(4);

  stroke(255);
  strokeWeight(0.1);
  noFill();

  beginShape(POINTS);
  for (let i = 0; i < points.length; i++) {
    let p = points[i];
    let base = basePoints[i];

    if (fingerDetected) {
      let dx = p.x - fingerX;
      let dy = p.y - fingerY;
      let distFinger = sqrt(dx*dx + dy*dy);
      let repelRadius = 50;

      if (distFinger < repelRadius) {
        let angle = random(TWO_PI);
        let radius = map(repelRadius - distFinger, 0, repelRadius, 0, repelStrength);
        p.x = base.x + cos(angle) * radius;
        p.y = base.y + sin(angle) * radius;
        p.z = base.z + random(-radius, radius);
      } else {
        p.x = base.x;
        p.y = base.y;
        p.z = base.z;
      }
    } else if (extraMotion) {
      p.x = base.x + random(-5,5);
      p.y = base.y + random(-5,5);
      p.z = base.z + random(-5,5);
    } else {
      p.x = base.x;
      p.y = base.y;
      p.z = base.z;
    }

    vertex(p.x, p.y, p.z);
  }
  endShape();

  if (fingerDetected) {
    push();
    translate(fingerX, fingerY, 0);
    fill(0, 255, 0);
    noStroke();
    sphere(5);
    pop();
  }
  pop();

  // --- Quadrado verde ---
  if (showGreenSquare && millis() - greenSquareTimer < greenSquareDuration) {
    push();
    translate(-width/2, -height/2, 0);
    rectMode(CENTER);

    let rectSize = random(70,80);
    noFill();
    stroke(0, 255, 0);
    strokeWeight(3);
    rect(lastFingerX + width/2, lastFingerY + height/2, rectSize, rectSize);

    noStroke();
    fill(0, 255, 0);
    textSize(16);
    textAlign(LEFT, TOP);
    text(rectSize, lastFingerX + width/2 + rectSize/2 + 10, lastFingerY + height/2 - rectSize/2);

    pop();
  }
}

function sampleTriangle(v1, v2, v3, density) {
  let pts = [];
  for (let i = 0; i < density; i++) {
    let r1 = random();
    let r2 = random();
    if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
    let x = v1.x + r1*(v2.x - v1.x) + r2*(v3.x - v1.x);
    let y = v1.y + r1*(v2.y - v1.y) + r2*(v3.y - v1.y);
    let z = v1.z + r1*(v2.z - v1.z) + r2*(v3.z - v1.z);
    pts.push(createVector(x, y, z));
  }
  return pts;
}

function gotHands(results) {
  hands = results;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
