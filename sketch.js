let torso;
let points = [];
let basePoints = [];
let repelStrength = 50; // intensidade do espalhamento

// Variáveis para Optical Flow
let video;
let previousPixels;
let flow;
let step = 8;
let flowActive = false;
let globalFlowX = 0;
let globalFlowY = 0;
let flowThreshold = 2; // Limiar para considerar o movimento "ativo"

// Controle da última posição do fluxo e do quadrado verde (RESTAURADO)
let lastFlowX = 0;
let lastFlowY = 0;
let flowDetectedPrev = false; // Substitui fingerDetectedPrev

// controle de tempo sem mão (agora sem movimento)
let lastHandTime = 0;
let extraMotion = false;
let extraMotionStart = 0;

// quadrado verde
let showGreenSquare = false;
let greenSquareTimer = 0;
let greenSquareDuration = 1000; // 1 segundo

let myFont;

// --- CLASSES PARA OPTICAL FLOW --- (MANTIDAS INTACTAS)
class FlowZone{
  constructor (x, y, u, v) {
    this.x = x;
    this.y = y;
    this.u = u;
    this.v = v;
  }
}

class FlowCalculator {
  constructor(step = 8) {
    this.step = step;
  }

  calculate (oldImage, newImage, width, height) {
    var zones = [];
    var step = this.step;
    var winStep = step * 2 + 1;

    var A2, A1B2, B1, C1, C2;
    var u, v, uu, vv;
    uu = vv = 0;
    var wMax = width - step - 1;
    var hMax = height - step - 1;
    var globalY, globalX, localY, localX;

    for (globalY = step + 1; globalY < hMax; globalY += winStep) {
      for (globalX = step + 1; globalX < wMax; globalX += winStep) {
        A2 = A1B2 = B1 = C1 = C2 = 0;

        for (localY = -step; localY <= step; localY++) {
          for (localX = -step; localX <= step; localX++) {
            var address = (globalY + localY) * width + globalX + localX;

            var gradX = (newImage[(address - 1) * 4]) - (newImage[(address + 1) * 4]);
            var gradY = (newImage[(address - width) * 4]) - (newImage[(address + width) * 4]);
            var gradT = (oldImage[address * 4]) - (newImage[address * 4]);

            A2 += gradX * gradX;
            A1B2 += gradX * gradY;
            B1 += gradY * gradY;
            C2 += gradX * gradT;
            C1 += gradY * gradT;
          }
        }

        var delta = (A1B2 * A1B2 - A2 * B1);

        if (delta !== 0) {
          var Idelta = step / delta;
          var deltaX = -(C1 * A1B2 - C2 * B1);
          var deltaY = -(A1B2 * C2 - A2 * C1);

          u = deltaX * Idelta;
          v = deltaY * Idelta;
        } else {
          var norm = (A1B2 + A2) * (A1B2 + A2) + (B1 + A1B2) * (B1 + A1B2);
          if (norm !== 0) {
            var IGradNorm = step / norm;
            var temp = -(C1 + C2) * IGradNorm;

            u = (A1B2 + A2) * temp;
            v = (B1 + A1B2) * temp;
          } else {
            u = v = 0;
          }
        }

        if (-winStep < u && u < winStep &&
          -winStep < v && v < winStep) {
          uu += u;
          vv += v;
          zones.push(new FlowZone(globalX, globalY, u, v));
        }
      }
    }

    this.flow = {
      zones : zones,
      u : zones.length > 0 ? uu / zones.length : 0,
      v : zones.length > 0 ? vv / zones.length : 0
    };

    return this.flow;
  };
};

// --- FIM CLASSES PARA OPTICAL FLOW ---

function preload() {
  torso = loadModel('modelo.obj', true);
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

  // Inicializa o Optical Flow
  flow = new FlowCalculator(step);

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

function draw() {
  background(0);
  //image(video, 0, 0, video.width, video.height);
  // --- CÁLCULO DO OPTICAL FLOW ---
  video.loadPixels();
  flowActive = false;
  if (video.pixels.length > 0) {
    if (previousPixels) {
      if (!same(previousPixels, video.pixels, 4, video.width)) {
        flow.calculate(previousPixels, video.pixels, video.width, video.height);
      }
    }
    previousPixels = copyImage(video.pixels, previousPixels);
    
    if (flow.flow && (abs(flow.flow.u) > flowThreshold || abs(flow.flow.v) > flowThreshold)) {
      globalFlowX = map(flow.flow.u, -step, step, -width / 2, width / 2);
      globalFlowY = map(flow.flow.v, -step, step, -height / 2, height / 2);
      flowActive = true;
      
      // Armazena a última posição de fluxo ativo
      lastFlowX = globalFlowX;
      lastFlowY = globalFlowY;
    }
  }
  // --- FIM CÁLCULO DO OPTICAL FLOW ---


  // --- Atualiza texto de status ---
  let statusDiv = document.getElementById("status");
  if (flowActive) {
    statusDiv.innerText = "fluxo_detectado";
    statusDiv.style.color = "lime";
  } else {
    statusDiv.innerText = "fluxo_não_detectado";
    statusDiv.style.color = "red";
  }

  // --- Quadrado verde na última posição se o fluxo parou ---
  if (!flowActive && flowDetectedPrev) {
    showGreenSquare = true;
    greenSquareTimer = millis();
  }
  flowDetectedPrev = flowActive; // Atualiza o estado anterior


  // --- Movimentação extra das partículas ---
  if (!flowActive) {
    if (!extraMotion && millis() - lastHandTime > 5000) { 
      extraMotion = true;
      extraMotionStart = millis();
    }
  } else {
    lastHandTime = millis();
    extraMotion = false;
  }
  if (extraMotion && millis() - extraMotionStart > 1000) { 
    extraMotion = false;
    lastHandTime = millis();
  }

  // --- Point cloud + esfera do fluxo ---
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

    if (flowActive) { 
      // Usa a posição do fluxo ativo
      let adjustedFlowX = globalFlowX / 4;
      let adjustedFlowY = globalFlowY / 4;

      let dx = p.x - adjustedFlowX;
      let dy = p.y - adjustedFlowY;
      let distFlow = sqrt(dx*dx + dy*dy);
      let repelRadius = 50; 

      if (distFlow < repelRadius) {
        let angle = random(TWO_PI);
        let radius = map(repelRadius - distFlow, 0, repelRadius, 0, repelStrength);
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

  if (flowActive) {
    // Esfera para visualizar o ponto de repulsão (flow)
    push();
    translate(globalFlowX / 4, globalFlowY / 4, 0); 
    fill(0, 255, 0);
    noStroke();
    sphere(5);
    pop();
  }
  pop();

  // --- Quadrado verde (ADAPTADO) ---
  if (showGreenSquare && millis() - greenSquareTimer < greenSquareDuration) {
    push();
    // Move para o espaço 2D da tela
    translate(-width/2, -height/2, 0); 
    rectMode(CENTER);

    let rectSize = random(70,80);
    noFill();
    stroke(0, 255, 0);
    strokeWeight(3);
    
    // Usa lastFlowX e lastFlowY (que estão mapeados para o centro do canvas 0,0)
    rect(lastFlowX + width/2, lastFlowY + height/2, rectSize, rectSize);

    noStroke();
    fill(0, 255, 0);
    textSize(16);
    textAlign(LEFT, TOP);
    text(rectSize, lastFlowX + width/2 + rectSize/2 + 10, lastFlowY + height/2 - rectSize/2);

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

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// --- FUNÇÕES AUXILIARES PARA OPTICAL FLOW ---

function copyImage(src, dst) {
    var n = src.length;
    if (!dst || dst.length != n) {
        dst = new src.constructor(n);
    }
    while (n--) {
        dst[n] = src[n];
    }
    return dst;
}

function same(a1, a2, stride, n) {
    for (var i = 0; i < n; i += stride) {
        if (a1[i] != a2[i]) {
            return false;
        }
    }
    return true;
}