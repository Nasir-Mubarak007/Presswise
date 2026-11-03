"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { COLOR_LABELS, COLOR_TONES } from "@/lib/storefront/catalog";
import type { Product, ProductDesign, ProductSide } from "@/lib/storefront/types";
import ProductMockup from "./product-mockup";
import styles from "./storefront.module.css";

type Product3DPreviewProps = {
  product: Product;
  frontDesign: ProductDesign;
  backDesign: ProductDesign;
  side: ProductSide;
  onSideChange: (side: ProductSide) => void;
};

type MeshData = {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
};

type MeshBuffer = {
  positions: WebGLBuffer;
  normals: WebGLBuffer;
  uvs: WebGLBuffer;
  indices: WebGLBuffer;
  count: number;
  selection: number;
  mask: number;
  solid?: "dark" | "brim";
};

type FabricProfile = "hoodie" | "shirt" | "tote" | "drawstring";

type ModelConfig = {
  kind: "dome" | "fabric";
  profile?: FabricProfile;
  clip: string;
  scale: number;
  pivot: [number, number, number];
  tilt: number;
  radius?: number;
  handles?: number[][][];
};

type PreviewRuntime = {
  gl: WebGLRenderingContext;
  canvas: HTMLCanvasElement;
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
  meshes: MeshBuffer[];
  textures: [WebGLTexture, WebGLTexture, WebGLTexture];
  config: ModelConfig;
  colors: { dark: number[]; brim: number[] };
  rotX: number;
  rotY: number;
  velocityY: number;
  dragging: { pointerId: number; x: number; y: number; touch: boolean } | null;
  animation: { fromY: number; toY: number; fromX: number; toX: number; started: number } | null;
  textureVersion: number;
  frame: number;
  render: () => void;
};

const CAP_CLIP = "M0.0933,0.5667 C0.0933,0.26 0.2733,0.0733 0.5,0.0733 C0.7267,0.0733 0.9067,0.26 0.9067,0.5667 Z";
const TEE_CLIP = "M0.3667,0.1167 L0.27,0.0667 L0.1167,0.2167 Q0.0933,0.2433 0.1167,0.27 L0.1933,0.3333 Q0.21,0.35 0.23,0.33 L0.2833,0.2833 L0.2833,0.9 Q0.5,0.94 0.7167,0.9 L0.7167,0.2833 L0.77,0.33 Q0.79,0.35 0.8067,0.3333 L0.8833,0.27 Q0.9067,0.2433 0.8833,0.2167 L0.7333,0.0667 L0.6333,0.1167 C0.5933,0.1733 0.4067,0.1733 0.3667,0.1167 Z";
const TOTE_CLIP = "M0.1833,0.2267 L0.8167,0.2267 L0.8167,0.8933 L0.1833,0.8933 Z";
const DRAWSTRING_CLIP = "M0.2167,0.2333 Q0.5,0.1667 0.7833,0.2333 L0.75,0.8667 Q0.5,0.9333 0.25,0.8667 Z";

function productTexturePath(clip: string): Path2D {
  const path = new Path2D();
  path.addPath(new Path2D(clip), new DOMMatrix().scale(300));
  return path;
}

function configFor(product: Product): ModelConfig {
  if (product.mockup === "cap") {
    return { kind: "dome", clip: CAP_CLIP, scale: 0.86, pivot: [0, 0.28, 0.27], tilt: 0.24 };
  }
  if (product.mockup === "tote") {
    return {
      kind: "fabric",
      profile: "tote",
      clip: TOTE_CLIP,
      scale: 1.08,
      pivot: [0, 0.03, 0],
      tilt: 0.05,
      radius: 0.034,
      handles: [[[100, 70], [100, 40], [120, 25], [150, 25]], [[150, 25], [180, 25], [200, 40], [200, 70]]],
    };
  }
  if (product.mockup === "drawstring") {
    return {
      kind: "fabric",
      profile: "drawstring",
      clip: DRAWSTRING_CLIP,
      scale: 1.1,
      pivot: [0, -0.03, 0],
      tilt: 0.05,
      radius: 0.022,
      handles: [[[65, 70], [55, 55], [55, 40], [65, 30]], [[235, 70], [245, 55], [245, 40], [235, 30]]],
    };
  }
  return {
    kind: "fabric",
    profile: product.mockup === "hoodie" ? "hoodie" : "shirt",
    clip: TEE_CLIP,
    scale: product.mockup === "hoodie" ? 1 : 1.12,
    pivot: [0, 0.03, 0],
    tilt: 0.05,
  };
}

function gridMesh(
  pointAt: (u: number, v: number) => [number, number, number],
  columns: number,
  rows: number,
  normalAt?: (point: [number, number, number]) => [number, number, number],
): MeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const epsilon = 0.001;

  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const v = row / rows;
      const point = pointAt(u, v);
      let normal: [number, number, number];
      if (normalAt) {
        normal = normalAt(point);
      } else {
        const right = pointAt(Math.min(u + epsilon, 1), v);
        const left = pointAt(Math.max(u - epsilon, 0), v);
        const down = pointAt(u, Math.min(v + epsilon, 1));
        const up = pointAt(u, Math.max(v - epsilon, 0));
        const ux = right[0] - left[0];
        const uy = right[1] - left[1];
        const uz = right[2] - left[2];
        const vx = down[0] - up[0];
        const vy = down[1] - up[1];
        const vz = down[2] - up[2];
        normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      }
      const length = Math.hypot(...normal) || 1;
      positions.push(...point);
      normals.push(normal[0] / length, normal[1] / length, normal[2] / length);
      uvs.push(0.5 + point[0] / 2, 0.5 - point[1] / 2);
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * (columns + 1) + column;
      indices.push(index, index + 1, index + columns + 1, index + 1, index + columns + 2, index + columns + 1);
    }
  }
  return { positions, normals, uvs, indices };
}

function clothFolds(profile: FabricProfile, x: number, y: number): number {
  const gaussian = (value: number, center: number, width: number) =>
    Math.exp(-(((value - center) / width) ** 2));

  if (profile === "hoodie") {
    const chest = gaussian(y, -0.12, 0.55);
    const hem = gaussian(y, -0.78, 0.16);
    return 0.006 * chest * Math.sin(x * 12 + y * 7)
      + 0.004 * hem * Math.sin(x * 18)
      + 0.005 * gaussian(x + y * 0.55, -0.46, 0.055)
      + 0.005 * gaussian(x - y * 0.55, 0.46, 0.055);
  }

  if (profile === "shirt") {
    const chest = gaussian(y, -0.04, 0.48);
    const hem = gaussian(y, -0.78, 0.13);
    return 0.003 * chest * Math.sin(x * 13 + y * 7)
      + 0.002 * hem * Math.sin(x * 18);
  }

  if (profile === "tote") {
    const panel = gaussian(y, -0.03, 0.78);
    return 0.0026 * panel * Math.sin(x * 11 + y * 4)
      + 0.0035 * gaussian(x, -0.73, 0.045) * gaussian(y, -0.12, 0.55)
      + 0.0035 * gaussian(x, 0.73, 0.045) * gaussian(y, -0.12, 0.55);
  }

  const gather = gaussian(y, 0.77, 0.2);
  return 0.004 * gather * Math.sin(x * 18)
    + 0.0025 * gaussian(y, -0.72, 0.18) * Math.sin(x * 14 + y * 4);
}

function clothMeshes(clip: string, profile: FabricProfile): { front: MeshData; back: MeshData; sides: MeshData } {
  const maskSize = 160;
  const gridSize = 64;
  const verticesPerAxis = gridSize + 1;
  const thickness = profile === "hoodie" ? 0.04 : profile === "tote" ? 0.046 : 0.027;
  const rounding = profile === "tote" ? 0.04 : profile === "hoodie" ? 0.032 : 0.024;
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = maskCanvas.height = maskSize;
  const maskContext = maskCanvas.getContext("2d");
  if (!maskContext) throw new Error("The browser could not create a canvas for the 3D product model.");
  maskContext.fillStyle = "#000";
  maskContext.fillRect(0, 0, maskSize, maskSize);
  maskContext.fillStyle = "#fff";
  maskContext.save();
  maskContext.scale(maskSize, maskSize);
  maskContext.fill(new Path2D(clip));
  maskContext.restore();
  const image = maskContext.getImageData(0, 0, maskSize, maskSize).data;
  const inside = new Uint8Array(maskSize * maskSize);
  for (let index = 0; index < inside.length; index += 1) inside[index] = image[index * 4] > 127 ? 1 : 0;

  function distanceToEdge(value: number) {
    const distances = new Float32Array(inside.length);
    for (let index = 0; index < inside.length; index += 1) distances[index] = inside[index] === value ? 1e6 : 0;
    for (let y = 0; y < maskSize; y += 1) {
      for (let x = 0; x < maskSize; x += 1) {
        const index = y * maskSize + x;
        if (inside[index] !== value) continue;
        let distance = distances[index];
        if (x > 0) distance = Math.min(distance, distances[index - 1] + 1);
        if (y > 0) {
          distance = Math.min(distance, distances[index - maskSize] + 1);
          if (x > 0) distance = Math.min(distance, distances[index - maskSize - 1] + 1.414);
          if (x < maskSize - 1) distance = Math.min(distance, distances[index - maskSize + 1] + 1.414);
        }
        distances[index] = distance;
      }
    }
    for (let y = maskSize - 1; y >= 0; y -= 1) {
      for (let x = maskSize - 1; x >= 0; x -= 1) {
        const index = y * maskSize + x;
        if (inside[index] !== value) continue;
        let distance = distances[index];
        if (x < maskSize - 1) distance = Math.min(distance, distances[index + 1] + 1);
        if (y < maskSize - 1) {
          distance = Math.min(distance, distances[index + maskSize] + 1);
          if (x < maskSize - 1) distance = Math.min(distance, distances[index + maskSize + 1] + 1.414);
          if (x > 0) distance = Math.min(distance, distances[index + maskSize - 1] + 1.414);
        }
        distances[index] = distance;
      }
    }
    return distances;
  }

  const insideDistance = distanceToEdge(1);
  const outsideDistance = distanceToEdge(0);
  let height = new Float32Array(verticesPerAxis * verticesPerAxis);
  const insideVertex = new Uint8Array(height.length);
  for (let y = 0; y <= gridSize; y += 1) {
    for (let x = 0; x <= gridSize; x += 1) {
      const maskX = Math.min(maskSize - 1, Math.round((x / gridSize) * (maskSize - 1)));
      const maskY = Math.min(maskSize - 1, Math.round((y / gridSize) * (maskSize - 1)));
      const maskIndex = maskY * maskSize + maskX;
      const isInside = inside[maskIndex] === 1;
      const signedDistance = isInside
        ? (insideDistance[maskIndex] - 0.5) / maskSize
        : -(outsideDistance[maskIndex] - 0.5) / maskSize;
      const t = Math.min(Math.max(signedDistance / rounding, 0), 1);
      const index = y * verticesPerAxis + x;
      const px = (x / gridSize - 0.5) * 2;
      const py = (0.5 - y / gridSize) * 2;
      const edgeShape = 0.22 + 0.78 * t * t * (3 - 2 * t);
      const torsoForm = 0.62 + 0.38 * Math.exp(-((px / 0.72) ** 2 + (py / 0.9) ** 2));
      const sleeveForm = profile === "hoodie" || profile === "shirt"
        ? 0.15 * Math.exp(-(((Math.abs(px) - 0.72) / 0.2) ** 2 + ((py - 0.34) / 0.42) ** 2))
        : 0;
      const shoulderForm = profile === "hoodie"
        ? 0.08 * Math.exp(-(((Math.abs(px) - 0.42) / 0.24) ** 2 + ((py - 0.48) / 0.16) ** 2))
        : 0;
      const centerForm = profile === "tote"
        ? 0.82 + 0.18 * Math.exp(-((px / 0.9) ** 2 + (py / 1.1) ** 2))
        : torsoForm + sleeveForm + shoulderForm;
      const relief = clothFolds(profile, px, py);
      height[index] = signedDistance >= 0
        ? thickness * edgeShape * centerForm + relief
        : ((2 * thickness) / rounding) * Math.max(signedDistance, -rounding * 0.25);
      if (isInside) insideVertex[index] = 1;
    }
  }

  for (let pass = 0; pass < 2; pass += 1) {
    const smoothed = new Float32Array(height);
    for (let y = 1; y < gridSize; y += 1) {
      for (let x = 1; x < gridSize; x += 1) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) sum += height[(y + dy) * verticesPerAxis + x + dx];
        }
        smoothed[y * verticesPerAxis + x] = sum / 9;
      }
    }
    height = smoothed;
  }

  const covered = new Uint8Array(height.length);
  for (let y = 0; y <= gridSize; y += 1) {
    for (let x = 0; x <= gridSize; x += 1) {
      if (!insideVertex[y * verticesPerAxis + x]) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx <= gridSize && yy <= gridSize) covered[yy * verticesPerAxis + xx] = 1;
        }
      }
    }
  }

  const front: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  const back: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  const sides: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  const step = 2 / gridSize;
  for (let y = 0; y <= gridSize; y += 1) {
    for (let x = 0; x <= gridSize; x += 1) {
      const index = y * verticesPerAxis + x;
      const z = height[index];
      const right = x < gridSize ? height[index + 1] : z;
      const left = x > 0 ? height[index - 1] : z;
      const down = y < gridSize ? height[index + verticesPerAxis] : z;
      const up = y > 0 ? height[index - verticesPerAxis] : z;
      const slopeX = (right - left) / (2 * step);
      const slopeY = -((down - up) / (2 * step));
      const normalLength = Math.hypot(slopeX, slopeY, 1);
      const px = (x / gridSize - 0.5) * 2;
      const py = (0.5 - y / gridSize) * 2;
      front.positions.push(px, py, z);
      front.normals.push(-slopeX / normalLength, -slopeY / normalLength, 1 / normalLength);
      front.uvs.push(x / gridSize, y / gridSize);
      back.positions.push(px, py, -z);
      back.normals.push(-slopeX / normalLength, -slopeY / normalLength, -1 / normalLength);
      back.uvs.push(x / gridSize, y / gridSize);
    }
  }

  function addSide(start: { x: number; y: number; z: number }, end: { x: number; y: number; z: number }) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    let nx = dy / length;
    let ny = -dx / length;
    const middleX = (start.x + end.x) / 2;
    const middleY = (start.y + end.y) / 2;
    if (nx * middleX + ny * middleY < 0) {
      nx *= -1;
      ny *= -1;
    }
    const base = sides.positions.length / 3;
    const vertices = [
      [start.x, start.y, start.z],
      [end.x, end.y, end.z],
      [end.x, end.y, -end.z],
      [start.x, start.y, -start.z],
    ];
    for (const [x, y, z] of vertices) {
      sides.positions.push(x, y, z);
      sides.normals.push(nx, ny, 0);
      sides.uvs.push(0.5 + x / 2, 0.5 - y / 2);
    }
    sides.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const corners = [
        { x, y, index: y * verticesPerAxis + x },
        { x: x + 1, y, index: y * verticesPerAxis + x + 1 },
        { x: x + 1, y: y + 1, index: (y + 1) * verticesPerAxis + x + 1 },
        { x, y: y + 1, index: (y + 1) * verticesPerAxis + x },
      ];
      const crossings: Array<{ edge: number; point: { x: number; y: number; z: number } }> = [];
      for (let edge = 0; edge < corners.length; edge += 1) {
        const first = corners[edge];
        const second = corners[(edge + 1) % corners.length];
        if (insideVertex[first.index] === insideVertex[second.index]) continue;
        const insideIndex = insideVertex[first.index] ? first.index : second.index;
        crossings.push({
          edge,
          point: {
            x: ((first.x + second.x) / (2 * gridSize) - 0.5) * 2,
            y: (0.5 - (first.y + second.y) / (2 * gridSize)) * 2,
            z: Math.max(height[insideIndex], thickness * 0.12),
          },
        });
      }
      if (crossings.length === 2) {
        addSide(crossings[0].point, crossings[1].point);
      } else if (crossings.length === 4) {
        addSide(crossings[0].point, crossings[3].point);
        addSide(crossings[1].point, crossings[2].point);
      }
    }
  }

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const index = y * verticesPerAxis + x;
      if (!(covered[index] || covered[index + 1] || covered[index + verticesPerAxis] || covered[index + verticesPerAxis + 1])) continue;
      front.indices.push(index, index + 1, index + verticesPerAxis, index + 1, index + verticesPerAxis + 1, index + verticesPerAxis);
      back.indices.push(index, index + verticesPerAxis, index + 1, index + 1, index + verticesPerAxis + 1, index + verticesPerAxis);
    }
  }
  return { front, back, sides };
}

function domeMeshes() {
  const width = 122 / 150;
  const height = 148 / 150;
  const depth = 0.8;
  const baseY = (150 - 170) / 150;
  const dome = (startAngle: number) => gridMesh(
    (u, v) => {
      const phi = startAngle + u * Math.PI;
      const theta = v * Math.PI / 2;
      return [width * Math.sin(theta) * Math.sin(phi), baseY + height * Math.cos(theta), depth * Math.sin(theta) * Math.cos(phi)];
    },
    48,
    24,
    (point) => [point[0] / (width * width), (point[1] - baseY) / (height * height), point[2] / (depth * depth)],
  );
  const brimPoint = (u: number, v: number, dy: number): [number, number, number] => {
    const phi = (u - 0.5) * Math.PI;
    const rx = width * 0.97 + 0.08 * v * Math.cos(phi);
    const rz = depth * 0.97 + 0.58 * v;
    const centerLift = 1 - Math.abs(u * 2 - 1) ** 4;
    const droop = 0.1 * v * v + 0.07 * v * Math.sin(phi) ** 2;
    return [rx * Math.sin(phi), baseY + 0.012 - droop + dy * centerLift, rz * Math.cos(phi)];
  };
  return [
    { geometry: dome(-Math.PI / 2), selection: 0, mask: 0 },
    { geometry: dome(Math.PI / 2), selection: 1, mask: 0 },
    { geometry: gridMesh((u, v) => brimPoint(u, v, 0.016), 36, 8), selection: -1, mask: 0, solid: "brim" as const },
    { geometry: gridMesh((u, v) => brimPoint(u, v, -0.016), 36, 8), selection: -1, mask: 0, solid: "brim" as const },
    { geometry: gridMesh((u, v) => brimPoint(u, 1, 0.016 - v * 0.032), 36, 1), selection: -1, mask: 0, solid: "brim" as const },
    {
      geometry: gridMesh((u, v) => {
        const phi = u * Math.PI * 2;
        const theta = v * Math.PI;
        const radius = 0.05;
        return [radius * Math.sin(theta) * Math.cos(phi), baseY + height + 0.012 + radius * Math.cos(theta) * 0.8, radius * Math.sin(theta) * Math.sin(phi)];
      }, 16, 10),
      selection: -1,
      mask: 0,
      solid: "dark" as const,
    },
  ];
}

async function createTextureCanvas(
  product: Product,
  design: ProductDesign,
  side: ProductSide,
  size: number,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser could not create a canvas for the 3D product texture.");
  const middle = COLOR_TONES[design.color][1];
  const scale = size / 300;
  const clip = product.mockup === "cap"
    ? CAP_CLIP
    : product.mockup === "tote"
      ? TOTE_CLIP
      : product.mockup === "drawstring"
        ? DRAWSTRING_CLIP
        : TEE_CLIP;

  context.fillStyle = middle;
  context.fillRect(0, 0, size, size);
  context.save();
  context.scale(scale, scale);
  context.strokeStyle = "rgba(0,0,0,0.18)";
  context.lineWidth = 1.4;
  context.lineCap = "round";
  context.lineJoin = "round";
  if (product.mockup === "cap") {
    context.beginPath();
    context.moveTo(150, 22);
    context.bezierCurveTo(112, 36, 92, 88, 92, 166);
    context.moveTo(150, 22);
    context.bezierCurveTo(188, 36, 208, 88, 208, 166);
    context.stroke();
  } else if (product.mockup === "shirt" || product.mockup === "hoodie") {
    context.beginPath();
    if (product.mockup === "hoodie" && side === "front") {
      context.moveTo(120, 152);
      context.quadraticCurveTo(150, 166, 180, 152);
      context.lineTo(180, 190);
      context.quadraticCurveTo(150, 205, 120, 190);
      context.closePath();
      context.moveTo(142, 56);
      context.lineTo(146, 92);
      context.moveTo(158, 56);
      context.lineTo(154, 92);
    } else if (side === "back") {
      context.moveTo(150, 45);
      context.bezierCurveTo(130, 55, 130, 75, 150, 85);
      context.bezierCurveTo(170, 75, 170, 55, 150, 45);
      context.closePath();
      if (product.mockup === "hoodie") {
        context.moveTo(126, 54);
        context.quadraticCurveTo(150, 72, 174, 54);
        context.lineTo(169, 99);
        context.quadraticCurveTo(150, 116, 131, 99);
        context.closePath();
        context.moveTo(150, 73);
        context.lineTo(150, 104);
      }
    } else {
      context.moveTo(110, 36);
      context.bezierCurveTo(122, 54, 178, 54, 190, 36);
    }
    context.moveTo(94, 90);
    context.lineTo(110, 105);
    context.moveTo(206, 90);
    context.lineTo(190, 105);
    context.moveTo(88, 104);
    context.lineTo(79, 119);
    context.moveTo(212, 104);
    context.lineTo(221, 119);
    context.moveTo(86, 250);
    context.quadraticCurveTo(150, 258, 214, 250);
    context.moveTo(86, 255);
    context.quadraticCurveTo(150, 263, 214, 255);
    context.moveTo(55, 88);
    context.lineTo(70, 99);
    context.moveTo(245, 88);
    context.lineTo(230, 99);
    context.moveTo(72, 242);
    context.lineTo(88, 242);
    context.moveTo(228, 242);
    context.lineTo(212, 242);
    if (product.mockup === "hoodie") {
      context.moveTo(121, 190);
      context.quadraticCurveTo(150, 196, 179, 190);
    }
    context.stroke();
    if (product.mockup === "hoodie" && side === "front") {
      context.beginPath();
      context.moveTo(120, 153);
      context.quadraticCurveTo(150, 168, 180, 153);
      context.lineTo(180, 189);
      context.quadraticCurveTo(150, 202, 120, 189);
      context.closePath();
      context.fillStyle = "rgba(255,255,255,0.045)";
      context.fill();
      context.stroke();
    }
    context.setLineDash([2, 3]);
    context.lineWidth = 0.8;
    context.beginPath();
    context.moveTo(86, 252);
    context.quadraticCurveTo(150, 260, 214, 252);
    context.stroke();
    context.setLineDash([]);
  } else {
    context.beginPath();
    context.moveTo(55, 110);
    context.lineTo(245, 110);
    context.moveTo(59, 116);
    context.lineTo(241, 116);
    context.moveTo(65, 118);
    context.lineTo(65, 266);
    context.moveTo(235, 118);
    context.lineTo(235, 266);
    if (product.mockup === "drawstring") {
      context.moveTo(68, 78);
      context.lineTo(232, 78);
      context.moveTo(82, 88);
      context.lineTo(82, 116);
      context.moveTo(218, 88);
      context.lineTo(218, 116);
    }
    context.stroke();
  }
  context.restore();

  context.save();
  context.scale(scale, scale);
  context.clip(productTexturePath(clip));
  const fabric = context.createPattern(createFabricTexture(design.material), "repeat");
  if (fabric) {
    context.globalAlpha = design.material === "Premium" ? 0.045 : 0.11;
    context.fillStyle = fabric;
    context.fillRect(0, 0, 300, 300);
  }
  if (product.mockup === "hoodie") {
    const dark = COLOR_TONES[design.color][2];
    context.globalAlpha = design.material === "Premium" ? 0.16 : 0.23;
    context.fillStyle = dark;
    context.beginPath();
    context.moveTo(86, 246);
    context.quadraticCurveTo(150, 254, 214, 246);
    context.lineTo(214, 258);
    context.quadraticCurveTo(150, 267, 86, 258);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(59, 105);
    context.lineTo(82, 116);
    context.lineTo(78, 126);
    context.lineTo(57, 118);
    context.closePath();
    context.moveTo(241, 105);
    context.lineTo(218, 116);
    context.lineTo(222, 126);
    context.lineTo(243, 118);
    context.closePath();
    context.fill();
    context.globalAlpha = design.material === "Premium" ? 0.12 : 0.2;
    context.strokeStyle = COLOR_TONES[design.color][0];
    context.lineWidth = 0.9;
    context.beginPath();
    for (let x = 89; x < 214; x += 4) {
      const curve = 254 - Math.sin(((x - 86) / 128) * Math.PI) * 6;
      context.moveTo(x, curve - 3);
      context.lineTo(x, curve + 5);
    }
    for (let x = 59; x < 81; x += 4) {
      context.moveTo(x, 108 + (x - 59) * 0.47);
      context.lineTo(x - 1, 115 + (x - 59) * 0.47);
      context.moveTo(300 - x, 108 + (x - 59) * 0.47);
      context.lineTo(301 - x, 115 + (x - 59) * 0.47);
    }
    context.stroke();
  }
  context.restore();

  if (design.photoUrl) {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const loadedImage = new Image();
      loadedImage.onload = () => resolve(loadedImage);
      loadedImage.onerror = () => reject(new Error("The uploaded image could not be loaded into the 3D preview."));
      loadedImage.src = design.photoUrl!;
      if (loadedImage.complete && loadedImage.naturalWidth) resolve(loadedImage);
    });
    context.save();
    context.scale(scale, scale);
    context.clip(productTexturePath(clip));
    if (image.naturalWidth) {
      const width = (design.photoSize / 100) * 300;
      const x = (design.photoPosition.x / 100) * 300;
      const y = (design.photoPosition.y / 100) * 300;
      const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
      const sx = (image.naturalWidth - sourceSize) / 2;
      const sy = (image.naturalHeight - sourceSize) / 2;
      if (design.finish === "Embroidered") {
        context.shadowColor = "rgba(0,0,0,0.42)";
        context.shadowBlur = 2;
        context.shadowOffsetY = 1.5;
      }
      context.drawImage(image, sx, sy, sourceSize, sourceSize, x - width / 2, y - width / 2, width, width);
      if (design.finish === "Embroidered") {
        context.shadowColor = "transparent";
        context.shadowBlur = 0;
        context.shadowOffsetY = 0;
        context.lineWidth = 1.3;
        context.setLineDash([1.5, 2.2]);
        context.strokeStyle = design.color === "white" || design.color === "natural" || design.color === "khaki"
          ? "rgba(20,25,20,0.72)"
          : "rgba(255,255,255,0.82)";
        context.strokeRect(x - width / 2, y - width / 2, width, width);
        context.setLineDash([]);
        context.globalAlpha = 0.28;
        context.strokeStyle = COLOR_TONES[design.color][0];
        context.lineWidth = 0.7;
        for (let stitch = x - width / 2 + 3; stitch < x + width / 2 - 2; stitch += 5) {
          context.beginPath();
          context.moveTo(stitch, y - width / 2 - 2);
          context.lineTo(stitch + 2, y - width / 2 + 1);
          context.moveTo(stitch, y + width / 2 - 1);
          context.lineTo(stitch + 2, y + width / 2 + 2);
          context.stroke();
        }
        context.globalAlpha = 1;
      }
    }
    context.restore();
  }
  if (design.text.trim()) {
    context.save();
    context.scale(scale, scale);
    context.clip(productTexturePath(clip));
    const font = design.textFont === "serif" ? "Georgia" : design.textFont === "mono" ? "monospace" : "system-ui";
    context.font = `${design.textBold ? "700" : "500"} 19px ${font}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = design.textColor || (design.color === "white" || design.color === "natural" || design.color === "khaki" ? "#0b1b14" : "#ffffff");
    context.shadowColor = design.finish === "Embroidered" ? "rgba(0,0,0,0.48)" : "rgba(0,0,0,0.28)";
    context.shadowBlur = design.finish === "Embroidered" ? 1.5 : 3;
    context.shadowOffsetY = design.finish === "Embroidered" ? 1.5 : 0;
    if (design.finish === "Embroidered") {
      context.lineWidth = 1.1;
      context.strokeStyle = "rgba(0,0,0,0.32)";
      context.strokeText(design.text.slice(0, 32), 150, 190, 230);
    }
    context.fillText(design.text.slice(0, 32), 150, 190, 230);
    if (design.finish === "Embroidered") {
      context.shadowColor = "transparent";
      context.shadowBlur = 0;
      context.shadowOffsetY = 0;
      context.globalAlpha = 0.28;
      context.fillStyle = COLOR_TONES[design.color][0];
      context.fillText(design.text.slice(0, 32), 150, 189, 230);
    }
    context.restore();
  }
  return canvas;
}

const fabricTextures: Record<ProductDesign["material"], HTMLCanvasElement | null> = {
  Standard: null,
  Premium: null,
};

function createFabricTexture(material: ProductDesign["material"]): HTMLCanvasElement {
  const cachedTexture = fabricTextures[material];
  if (cachedTexture) return cachedTexture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser could not create the fabric texture.");
  if (material === "Standard") {
    for (let y = 0; y < 64; y += 4) {
      for (let x = 0; x < 64; x += 4) {
        const offset = y % 8 === 0 ? 0 : 2;
        const shade = (x + y) % 8 === 0 ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.1)";
        context.fillStyle = shade;
        context.fillRect(x + offset, y, 2, 3);
        context.fillRect(x + (offset === 0 ? 2 : 0), y + 2, 2, 2);
      }
    }
  } else {
    context.lineWidth = 0.7;
    for (let offset = -64; offset < 128; offset += 4) {
      context.strokeStyle = offset % 8 === 0 ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.075)";
      context.beginPath();
      context.moveTo(offset, 0);
      context.lineTo(offset + 64, 64);
      context.stroke();
    }
    context.strokeStyle = "rgba(255,255,255,0.045)";
    for (let offset = 0; offset < 64; offset += 4) {
      context.beginPath();
      context.moveTo(offset, 0);
      context.lineTo(offset, 64);
      context.stroke();
    }
  }
  fabricTextures[material] = canvas;
  return canvas;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("The browser could not create a shader for the 3D preview.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader compilation error.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createBuffer(gl: WebGLRenderingContext, target: number, data: number[], ArrayType: typeof Float32Array | typeof Uint16Array) {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("The browser could not create geometry for the 3D preview.");
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, new ArrayType(data), gl.STATIC_DRAW);
  return buffer;
}

function createMeshBuffer(
  gl: WebGLRenderingContext,
  geometry: MeshData,
  selection: number,
  mask: number,
  solid?: "dark" | "brim",
): MeshBuffer {
  return {
    positions: createBuffer(gl, gl.ARRAY_BUFFER, geometry.positions, Float32Array),
    normals: createBuffer(gl, gl.ARRAY_BUFFER, geometry.normals, Float32Array),
    uvs: createBuffer(gl, gl.ARRAY_BUFFER, geometry.uvs, Float32Array),
    indices: createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, geometry.indices, Uint16Array),
    count: geometry.indices.length,
    selection,
    mask,
    solid,
  };
}

function textureFromCanvas(gl: WebGLRenderingContext, canvas: HTMLCanvasElement): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("The browser could not create a texture for the 3D preview.");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function matrixMultiply(a: number[], b: number[]): number[] {
  const output = new Array<number>(16);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      let sum = 0;
      for (let index = 0; index < 4; index += 1) sum += a[index * 4 + column] * b[row * 4 + index];
      output[row * 4 + column] = sum;
    }
  }
  return output;
}

function translation(x: number, y: number, z: number): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

function scaling(scale: number): number[] {
  return [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, 1];
}

function rotateX(angle: number): number[] {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [1, 0, 0, 0, 0, cosine, sine, 0, 0, -sine, cosine, 0, 0, 0, 0, 1];
}

function rotateY(angle: number): number[] {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [cosine, 0, -sine, 0, 0, 1, 0, 0, sine, 0, cosine, 0, 0, 0, 0, 1];
}

function perspective(fov: number, aspect: number, near: number, far: number): number[] {
  const scale = 1 / Math.tan(fov / 2);
  const depth = 1 / (near - far);
  return [scale / aspect, 0, 0, 0, 0, scale, 0, 0, 0, 0, (far + near) * depth, -1, 0, 0, 2 * far * near * depth, 0];
}

function hexToRgb(value: string): number[] {
  const color = Number.parseInt(value.slice(1), 16);
  return [(color >> 16 & 255) / 255, (color >> 8 & 255) / 255, (color & 255) / 255];
}

const VERTEX_SHADER = `
attribute vec3 aPos;
attribute vec3 aNrm;
attribute vec2 aUV;
uniform mat4 uProj;
uniform mat4 uMV;
uniform mat3 uNM;
varying vec3 vN;
varying vec3 vP;
varying vec2 vUV;
void main() {
  vec4 p = uMV * vec4(aPos, 1.0);
  vP = p.xyz;
  vN = uNM * aNrm;
  vUV = aUV;
  gl_Position = uProj * p;
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D uTexF;
uniform sampler2D uTexB;
uniform sampler2D uMask;
uniform float uSel;
uniform float uMaskOn;
uniform float uPremium;
uniform float uEmbroidered;
uniform vec3 uColor;
varying vec3 vN;
varying vec3 vP;
varying vec2 vUV;
void main() {
  float alpha = 1.0;
  if (uMaskOn > 0.5) {
    alpha = smoothstep(0.36, 0.64, texture2D(uMask, vUV).r);
    if (alpha < 0.02) discard;
  }
  vec3 base;
  if (uSel < -0.5) base = uColor;
  else if (uSel < 0.5) base = texture2D(uTexF, vUV).rgb;
  else base = texture2D(uTexB, vec2(1.0 - vUV.x, vUV.y)).rgb;
  vec3 normal = normalize(vN);
  vec3 viewDirection = normalize(-vP);
  if (dot(normal, viewDirection) < 0.0) normal = -normal;
  vec3 lightA = normalize(vec3(-0.45, 0.75, 0.85));
  vec3 lightB = normalize(vec3(0.8, -0.15, 0.45));
  float diffuse = max(dot(normal, lightA), 0.0) * 0.62 + max(dot(normal, lightB), 0.0) * 0.2;
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.6) * 0.07;
  float sheenPower = mix(13.0, 25.0, uPremium);
  float sheenStrength = mix(0.026, 0.09, uPremium) + uEmbroidered * 0.045;
  float sheen = pow(max(dot(reflect(-lightA, normal), viewDirection), 0.0), sheenPower) * sheenStrength;
  gl_FragColor = vec4((base * (0.44 + diffuse) + rim + sheen) * alpha, alpha);
}`;

function buildModel(gl: WebGLRenderingContext, config: ModelConfig): MeshBuffer[] {
  const meshes: MeshBuffer[] = [];
  if (config.kind === "dome") {
    for (const mesh of domeMeshes()) {
      meshes.push(createMeshBuffer(gl, mesh.geometry, mesh.selection, mesh.mask, mesh.solid));
    }
    return meshes;
  }
  if (config.kind !== "fabric" || !config.profile) {
    throw new Error("The fabric product model is missing its shape profile.");
  }
  const { front, back, sides } = clothMeshes(config.clip, config.profile);
  meshes.push(
    createMeshBuffer(gl, front, 0, 1),
    createMeshBuffer(gl, back, 1, 1),
    createMeshBuffer(gl, sides, -1, 0, "brim"),
  );
  if (config.profile === "hoodie") {
    const hood = gridMesh(
      (u, v) => {
        const angle = u * Math.PI * 2;
        const radiusX = 0.26 - v * 0.07;
        const radiusY = 0.14 - v * 0.035;
        return [
          Math.cos(angle) * radiusX,
          0.69 + Math.sin(angle) * radiusY,
          0.042 + Math.max(0, Math.sin(angle)) * 0.018 + v * 0.008,
        ];
      },
      48,
      5,
    );
    meshes.push(createMeshBuffer(gl, hood, 0, 0));
  }
  for (const curves of config.handles ?? []) {
    const points = Array.from({ length: 25 }, (_, index) => {
      const t = index / 24;
      const u = 1 - t;
      const x = u ** 3 * curves[0][0] + 3 * u ** 2 * t * curves[1][0] + 3 * u * t ** 2 * curves[2][0] + t ** 3 * curves[3][0];
      const y = u ** 3 * curves[0][1] + 3 * u ** 2 * t * curves[1][1] + 3 * u * t ** 2 * curves[2][1] + t ** 3 * curves[3][1];
      return [(x - 150) / 150, (150 - y) / 150, 0];
    });
    const geometry: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
    const sides = 10;
    points.forEach((point, index) => {
      const previous = points[Math.max(0, index - 1)];
      const next = points[Math.min(points.length - 1, index + 1)];
      const tangentLength = Math.hypot(next[0] - previous[0], next[1] - previous[1]) || 1;
      const tx = (next[0] - previous[0]) / tangentLength;
      const ty = (next[1] - previous[1]) / tangentLength;
      for (let side = 0; side <= sides; side += 1) {
        const angle = side / sides * Math.PI * 2;
        const nx = -ty * Math.cos(angle);
        const ny = tx * Math.cos(angle);
        const nz = Math.sin(angle);
        const radius = config.radius ?? 0.03;
        geometry.positions.push(point[0] + radius * nx, point[1] + radius * ny, point[2] + radius * nz);
        geometry.normals.push(nx, ny, nz);
        geometry.uvs.push(0.5, 0.5);
      }
    });
    for (let index = 0; index < points.length - 1; index += 1) {
      for (let side = 0; side < sides; side += 1) {
        const vertex = index * (sides + 1) + side;
        geometry.indices.push(vertex, vertex + 1, vertex + sides + 1, vertex + 1, vertex + sides + 2, vertex + sides + 1);
      }
    }
    meshes.push(createMeshBuffer(gl, geometry, -1, 0, "dark"));
  }
  return meshes;
}

function facingSide(rotationY: number): ProductSide {
  return Math.cos(rotationY) < 0 ? "back" : "front";
}

function ProductFace({
  product,
  design,
  side,
}: {
  product: Product;
  design: ProductDesign;
  side: ProductSide;
}) {
  const clipClass = {
    cap: styles.clipCap,
    shirt: styles.clipShirt,
    hoodie: styles.clipShirt,
    tote: styles.clipTote,
    drawstring: styles.clipDrawstring,
  }[product.mockup];

  return (
    <div className={styles.preview3dFace}>
      <div className={styles.preview3dArtwork}>
        <ProductMockup product={product} color={design.color} side={side} />
        <div className={`${styles.designClip} ${clipClass}`}>
          {design.photoUrl && (
            <span
              className={styles.designPhoto}
              style={{
                "--photo": `url("${design.photoUrl}")`,
                "--photo-x": `${design.photoPosition.x}%`,
                "--photo-y": `${design.photoPosition.y}%`,
                "--photo-size": `${design.photoSize}%`,
              } as CSSProperties}
            />
          )}
          {design.text.trim() && (
            <span
              className={styles.previewText}
              style={{
                "--text-color": design.textColor || "var(--sf-ink)",
                "--text-font": design.textFont,
                "--text-weight": design.textBold ? 800 : 600,
              } as CSSProperties}
            >
              {design.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewFallback({ product, design, error }: { product: Product; design: ProductDesign; error: string }) {
  return (
    <div className={styles.preview3dFallback}>
      <ProductFace product={product} design={design} side={design.side} />
      <p role="status">The 3D preview is not available in this browser. {error}</p>
    </div>
  );
}

export default function Product3DPreview({
  product,
  frontDesign,
  backDesign,
  side,
  onSideChange,
}: Product3DPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<PreviewRuntime | null>(null);
  const requestRenderRef = useRef<() => void>(() => {});
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const lastReportedSideRef = useRef(side);
  const designKey = JSON.stringify([frontDesign, backDesign]);
  const currentDesign = side === "front" ? frontDesign : backDesign;
  const frontDesignRef = useRef(frontDesign);
  const backDesignRef = useRef(backDesign);

  useEffect(() => {
    frontDesignRef.current = frontDesign;
    backDesignRef.current = backDesign;
  }, [frontDesign, backDesign]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const previewCanvas: HTMLCanvasElement = canvas;
    let active = true;
    let runtime: PreviewRuntime | null = null;
    let glContext: WebGLRenderingContext | null = null;
    let observer: ResizeObserver | null = null;
    let initialFrame = 0;
    async function initialize() {
      if (!active) return;
      try {
        const gl = previewCanvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: true });
        if (!gl) throw new Error("WebGL is disabled or unsupported.");
        glContext = gl;
      const program = gl.createProgram();
      if (!program) throw new Error("The browser could not create the 3D preview program.");
      const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
      const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.bindAttribLocation(program, 0, "aPos");
      gl.bindAttribLocation(program, 1, "aNrm");
      gl.bindAttribLocation(program, 2, "aUV");
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? "The browser could not link the 3D preview program.");
      }
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      const uniformNames = ["uProj", "uMV", "uNM", "uTexF", "uTexB", "uMask", "uSel", "uMaskOn", "uPremium", "uEmbroidered", "uColor"];
      const uniforms = Object.fromEntries(uniformNames.map((name) => [name, gl.getUniformLocation(program, name)]));
      gl.useProgram(program);
      gl.uniform1i(uniforms.uTexF, 0);
      gl.uniform1i(uniforms.uTexB, 1);
      gl.uniform1i(uniforms.uMask, 2);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const config = configFor(product);
      const meshes = buildModel(gl, config);
      const textureSize = 512;
      const [frontTextureCanvas, backTextureCanvas] = await Promise.all([
        createTextureCanvas(product, frontDesignRef.current, "front", textureSize),
        createTextureCanvas(product, backDesignRef.current, "back", textureSize),
      ]);
      if (!active) return;
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = maskCanvas.height = textureSize;
      const maskContext = maskCanvas.getContext("2d");
      if (!maskContext) throw new Error("The browser could not create the 3D product mask.");
      maskContext.fillStyle = config.kind === "dome" ? "#fff" : "#000";
      maskContext.fillRect(0, 0, textureSize, textureSize);
      if (config.kind === "fabric") {
        maskContext.fillStyle = "#fff";
        maskContext.save();
        maskContext.scale(textureSize, textureSize);
        maskContext.fill(new Path2D(config.clip));
        maskContext.restore();
      }
      const textures: [WebGLTexture, WebGLTexture, WebGLTexture] = [
        textureFromCanvas(gl, frontTextureCanvas),
        textureFromCanvas(gl, backTextureCanvas),
        textureFromCanvas(gl, maskCanvas),
      ];
      const frontTones = COLOR_TONES[frontDesignRef.current.color];
      const colors = {
        dark: hexToRgb(frontTones[2]),
        brim: hexToRgb(frontTones[1]).map((value, index) => value * 0.55 + hexToRgb(frontTones[2])[index] * 0.45),
      };

      const nextRuntime: PreviewRuntime = {
        gl,
        canvas: previewCanvas,
        program,
        uniforms,
        meshes,
        textures,
        config,
        colors,
        rotX: config.tilt,
        rotY: lastReportedSideRef.current === "back" ? Math.PI : 0,
        velocityY: 0,
        dragging: null,
        animation: null,
        textureVersion: 0,
        frame: 0,
        render: () => {},
      };
      runtime = nextRuntime;
      runtime.render = () => {
        if (!active) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.round(previewCanvas.clientWidth * dpr);
        const height = Math.round(previewCanvas.clientHeight * dpr);
        if (!width || !height) return;
        if (previewCanvas.width !== width || previewCanvas.height !== height) {
          previewCanvas.width = width;
          previewCanvas.height = height;
        }
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const currentRuntime = runtimeRef.current;
        if (!currentRuntime) return;
        const rotation = matrixMultiply(rotateX(currentRuntime.rotX), rotateY(currentRuntime.rotY));
        const modelView = matrixMultiply(
          translation(0, 0, -4.6),
          matrixMultiply(rotation, matrixMultiply(scaling(config.scale), translation(-config.pivot[0], -config.pivot[1], -config.pivot[2]))),
        );
        gl.useProgram(program);
        gl.uniformMatrix4fv(uniforms.uProj, false, new Float32Array(perspective(26 * Math.PI / 180, width / height, 1, 20)));
        gl.uniformMatrix4fv(uniforms.uMV, false, new Float32Array(modelView));
        gl.uniformMatrix3fv(
          uniforms.uNM,
          false,
          new Float32Array([rotation[0], rotation[1], rotation[2], rotation[4], rotation[5], rotation[6], rotation[8], rotation[9], rotation[10]]),
        );
        textures.forEach((texture, index) => {
          gl.activeTexture(gl.TEXTURE0 + index);
          gl.bindTexture(gl.TEXTURE_2D, texture);
        });
        for (const mesh of meshes) {
          gl.uniform1f(uniforms.uSel, mesh.selection);
          gl.uniform1f(uniforms.uMaskOn, mesh.mask);
          const design = mesh.selection === 1 ? backDesignRef.current : frontDesignRef.current;
          gl.uniform1f(uniforms.uPremium, design.material === "Premium" ? 1 : 0);
          gl.uniform1f(uniforms.uEmbroidered, design.finish === "Embroidered" ? 1 : 0);
          if (mesh.solid) gl.uniform3fv(uniforms.uColor, new Float32Array(colors[mesh.solid]));
          gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positions);
          gl.enableVertexAttribArray(0);
          gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normals);
          gl.enableVertexAttribArray(1);
          gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uvs);
          gl.enableVertexAttribArray(2);
          gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
          gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
        }
      };
      runtimeRef.current = runtime;
      lastReportedSideRef.current = facingSide(runtime.rotY);
      setError("");
      setLoading(false);
      initialFrame = requestAnimationFrame(() => runtime?.render());
      observer = new ResizeObserver(() => runtime?.render());
      observer.observe(previewCanvas);
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "The 3D model could not be created.");
          setLoading(false);
        }
      }
    }
    void Promise.resolve().then(initialize);
    return () => {
        active = false;
        cancelAnimationFrame(initialFrame);
        if (runtime?.frame) cancelAnimationFrame(runtime.frame);
        observer?.disconnect();
        for (const mesh of runtime?.meshes ?? []) {
          glContext?.deleteBuffer(mesh.positions);
          glContext?.deleteBuffer(mesh.normals);
          glContext?.deleteBuffer(mesh.uvs);
          glContext?.deleteBuffer(mesh.indices);
        }
        for (const texture of runtime?.textures ?? []) glContext?.deleteTexture(texture);
        if (runtime) glContext?.deleteProgram(runtime.program);
        runtimeRef.current = null;
      };
  }, [product]);

  useEffect(() => {
    let active = true;
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const activeRuntime: PreviewRuntime = runtime;
    const version = ++activeRuntime.textureVersion;
    const frontSnapshot = frontDesignRef.current;
    const backSnapshot = backDesignRef.current;
    async function updateDesignTextures() {
      try {
        const [frontCanvas, backCanvas] = await Promise.all([
          createTextureCanvas(product, frontSnapshot, "front", 512),
          createTextureCanvas(product, backSnapshot, "back", 512),
        ]);
        if (!active || runtimeRef.current !== activeRuntime || activeRuntime.textureVersion !== version) return;
        const nextTextures: [WebGLTexture, WebGLTexture] = [
          textureFromCanvas(activeRuntime.gl, frontCanvas),
          textureFromCanvas(activeRuntime.gl, backCanvas),
        ];
        activeRuntime.gl.deleteTexture(activeRuntime.textures[0]);
        activeRuntime.gl.deleteTexture(activeRuntime.textures[1]);
        activeRuntime.textures[0] = nextTextures[0];
        activeRuntime.textures[1] = nextTextures[1];
        const tones = COLOR_TONES[frontSnapshot.color];
        const dark = hexToRgb(tones[2]);
        activeRuntime.colors = {
          dark,
          brim: hexToRgb(tones[1]).map((value, index) => value * 0.55 + dark[index] * 0.45),
        };
        activeRuntime.render();
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "The product design could not be added to the 3D preview.");
      }
    }
    void updateDesignTextures();
    return () => {
      active = false;
      if (runtimeRef.current === activeRuntime && activeRuntime.textureVersion === version) {
        activeRuntime.textureVersion += 1;
      }
    };
  }, [designKey, product]);

  useEffect(() => {
    lastReportedSideRef.current = side;
  }, [side]);

  useEffect(() => {
    requestRenderRef.current = () => {
      const currentRuntime = runtimeRef.current;
      if (!currentRuntime || currentRuntime.frame) return;
      currentRuntime.frame = requestAnimationFrame((time) => {
        currentRuntime.frame = 0;
        let moving = false;
        if (currentRuntime.animation) {
          const animation = currentRuntime.animation;
          const progress = Math.min((time - animation.started) / 480, 1);
          const eased = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          currentRuntime.rotY = animation.fromY + (animation.toY - animation.fromY) * eased;
          currentRuntime.rotX = animation.fromX + (animation.toX - animation.fromX) * eased;
          if (progress === 1) currentRuntime.animation = null;
          else moving = true;
        } else if (!currentRuntime.dragging && Math.abs(currentRuntime.velocityY) > 0.0004) {
          currentRuntime.rotY += currentRuntime.velocityY;
          currentRuntime.velocityY *= 0.88;
          moving = true;
        }
        currentRuntime.render();
        if (moving) requestRenderRef.current();
      });
    };
  }, []);

  function setView(nextSide: ProductSide) {
    const runtime = runtimeRef.current;
    const target = nextSide === "back" ? Math.PI : 0;
    lastReportedSideRef.current = nextSide;
    onSideChange(nextSide);
    if (!runtime) return;
    runtime.velocityY = 0;
    const tau = Math.PI * 2;
    const targetY = Math.round((runtime.rotY - target) / tau) * tau + target;
    runtime.animation = {
      fromY: runtime.rotY,
      toY: targetY,
      fromX: runtime.rotX,
      toX: runtime.config.tilt,
      started: performance.now(),
    };
    requestRenderRef.current();
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.dragging = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType === "touch" };
    runtime.animation = null;
    runtime.velocityY = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const runtime = runtimeRef.current;
    const drag = runtime?.dragging;
    if (!runtime || !drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    runtime.dragging = { ...drag, x: event.clientX, y: event.clientY };
    runtime.rotY += deltaX * 0.011;
    runtime.velocityY = deltaX * 0.011;
    if (!drag.touch) runtime.rotX = Math.max(-0.8, Math.min(0.8, runtime.rotX + deltaY * 0.007));
    const nextSide = facingSide(runtime.rotY);
    if (nextSide !== lastReportedSideRef.current) {
      lastReportedSideRef.current = nextSide;
      onSideChange(nextSide);
    }
    requestRenderRef.current();
  }

  function handlePointerUp(event: PointerEvent<HTMLCanvasElement>) {
    const runtime = runtimeRef.current;
    if (runtime?.dragging?.pointerId !== event.pointerId) return;
    runtime.dragging = null;
    setDragging(false);
    requestRenderRef.current();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      runtime.rotY += event.key === "ArrowRight" ? 0.2 : -0.2;
      runtime.velocityY = 0;
      const nextSide = facingSide(runtime.rotY);
      if (nextSide !== lastReportedSideRef.current) {
        lastReportedSideRef.current = nextSide;
        onSideChange(nextSide);
      }
      requestRenderRef.current();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      runtime.rotX = Math.max(-0.8, Math.min(0.8, runtime.rotX + (event.key === "ArrowDown" ? 0.1 : -0.1)));
      requestRenderRef.current();
    } else if (event.key === "Home") {
      event.preventDefault();
      setView("front");
    } else if (event.key === "End") {
      event.preventDefault();
      setView("back");
    }
  }

  return (
    <div className={styles.preview3dWrap}>
      {error ? (
        <PreviewFallback product={product} design={side === "front" ? frontDesign : backDesign} error={error} />
      ) : (
        <div className={`${styles.preview3d} ${dragging ? styles.preview3dDragging : ""}`}>
          <canvas
            ref={canvasRef}
            className={styles.preview3dCanvas}
            role="application"
            aria-label={`Interactive 3D preview of ${COLOR_LABELS[currentDesign.color]} ${product.name}, ${currentDesign.material} material, ${currentDesign.finish} finish, ${side} view. Drag to rotate, or use the arrow keys.`}
            tabIndex={0}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleKeyDown}
          />
          <span className={styles.preview3dHint} aria-hidden="true">⟳ Drag to rotate</span>
          {loading && <span className={styles.preview3dLoading} role="status">Building 3D product preview…</span>}
        </div>
      )}
      <div className={styles.preview3dControls} role="group" aria-label="Rotate product preview">
        <button type="button" aria-pressed={side === "front"} onClick={() => setView("front")}>Front</button>
        <button type="button" aria-pressed={side === "back"} onClick={() => setView("back")}>Back</button>
        <button type="button" onClick={() => setView("front")}>Reset view</button>
      </div>
    </div>
  );
}
