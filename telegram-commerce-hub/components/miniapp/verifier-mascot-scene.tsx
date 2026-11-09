'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type Props = { className?: string; compact?: boolean };

/**
 * Lightweight, hardware-conscious 3D verifier mascot.
 * Geometry is generated locally; no external model or texture requests.
 */
export default function VerifierMascotScene({ className = '', compact = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      return;
    }

    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100);
    camera.position.set(0, 0.15, 7.2);

    scene.add(new THREE.HemisphereLight(0xe8e8e8, 0x292a2d, 2.0));
    const key = new THREE.DirectionalLight(0xf0f0f0, 3.2);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new THREE.PointLight(0xc7c9cc, 14, 12);
    rim.position.set(-3, 1, 3);
    scene.add(rim);

    const gold = new THREE.MeshStandardMaterial({ color: 0xbfc2c7, metalness: 0.82, roughness: 0.24 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x25272a, metalness: 0.72, roughness: 0.3 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xd9dce0, metalness: 0.25, roughness: 0.12, transmission: 0.15, transparent: true, opacity: 0.92 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf0f1f2, metalness: 0.45, roughness: 0.22 });
    const mascot = new THREE.Group();
    scene.add(mascot);

    const sphere = (radius: number, material: THREE.Material, position: [number, number, number], scale?: [number, number, number]) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), material);
      mesh.position.set(...position);
      if (scale) mesh.scale.set(...scale);
      mascot.add(mesh);
      return mesh;
    };
    const box = (size: [number, number, number], material: THREE.Material, position: [number, number, number], radius = 0.12) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      mesh.geometry.computeVertexNormals();
      mascot.add(mesh);
      return mesh;
    };

    // Rounded robot head, torso, ear caps and luminous eyes.
    box([1.72, 1.35, 0.92], dark, [0, 0.72, 0], 0.2);
    box([1.45, 1.08, 0.82], gold, [0, 0.75, 0.12]);
    box([1.2, 0.66, 0.18], dark, [0, 0.72, 0.56]);
    sphere(0.105, glass, [-0.29, 0.75, 0.69]);
    sphere(0.105, glass, [0.29, 0.75, 0.69]);
    box([0.18, 0.055, 0.07], white, [0, 0.38, 0.63]);
    sphere(0.25, gold, [-0.95, 0.72, 0], [0.42, 0.7, 0.7]);
    sphere(0.25, gold, [0.95, 0.72, 0], [0.42, 0.7, 0.7]);
    box([0.9, 0.78, 0.66], dark, [0, -0.55, 0]);
    box([0.62, 0.5, 0.12], gold, [0, -0.53, 0.39]);
    sphere(0.13, glass, [0, -0.53, 0.49]);

    // Floating shield on the robot's right.
    const shield = new THREE.Group();
    shield.position.set(1.55, -0.35, 0.5);
    shield.rotation.z = -0.18;
    mascot.add(shield);
    const shieldShape = new THREE.Shape();
    shieldShape.moveTo(0, 0.72);
    shieldShape.quadraticCurveTo(0.55, 0.48, 0.5, 0.08);
    shieldShape.quadraticCurveTo(0.42, -0.48, 0, -0.72);
    shieldShape.quadraticCurveTo(-0.42, -0.48, -0.5, 0.08);
    shieldShape.quadraticCurveTo(-0.55, 0.48, 0, 0.72);
    const shieldMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shieldShape, { depth: 0.12, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.06, bevelThickness: 0.06 }), gold);
    shield.add(shieldMesh);
    const tick = new THREE.Group();
    const tickA = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.08), white);
    tickA.rotation.z = -0.72;
    tickA.position.set(-0.1, -0.02, 0.2);
    const tickB = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.58, 0.08), white);
    tickB.rotation.z = 0.72;
    tickB.position.set(0.12, 0.07, 0.2);
    tick.add(tickA, tickB);
    shield.add(tick);

    const orbit = new THREE.Group();
    scene.add(orbit);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.012, 8, 100), new THREE.MeshBasicMaterial({ color: 0xbfc2c7, transparent: true, opacity: 0.5 }));
    ring.rotation.x = 0.82;
    ring.rotation.y = -0.28;
    orbit.add(ring);
    const token = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 48), gold);
    token.rotation.x = Math.PI / 2;
    token.position.set(-1.72, -0.82, 0.25);
    orbit.add(token);
    const tokenMark = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 8, 32), white);
    tokenMark.position.copy(token.position);
    tokenMark.position.z += 0.06;
    orbit.add(tokenMark);

    const stars = new THREE.Group();
    scene.add(stars);
    for (let i = 0; i < 18; i++) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.018 + (i % 3) * 0.008, 8, 8), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xe0e1e3 : 0xd0d2d5 }));
      const angle = (i / 18) * Math.PI * 2;
      dot.position.set(Math.cos(angle) * (2.35 + (i % 4) * 0.16), Math.sin(angle) * (1.35 + (i % 3) * 0.12), -0.4);
      stars.add(dot);
    }

    let frame = 0;
    let raf = 0;
    let inView = false;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const draw = () => renderer.render(scene, camera);
    const animate = () => {
      if (!inView || document.hidden || motionQuery.matches) return;
      raf = window.requestAnimationFrame(animate);
      frame += 0.008;
      mascot.rotation.y = Math.sin(frame * 0.65) * 0.16;
      mascot.position.y = Math.sin(frame) * 0.08;
      shield.rotation.y = Math.sin(frame * 1.2) * 0.12;
      orbit.rotation.z = frame * 0.12;
      token.rotation.z = frame * 0.8;
      draw();
    };
    const syncMotion = () => {
      window.cancelAnimationFrame(raf);
      if (inView) { draw(); if (!document.hidden && !motionQuery.matches) animate(); }
    };
    const visibility = new IntersectionObserver((entries) => {
      inView = Boolean(entries[0]?.isIntersecting);
      syncMotion();
    }, { threshold: 0.05 });
    visibility.observe(host);
    const onVisibilityChange = () => syncMotion();
    document.addEventListener('visibilitychange', onVisibilityChange);
    motionQuery.addEventListener?.('change', syncMotion);
    draw();

    const resize = () => {
      if (!host) return;
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      visibility.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      motionQuery.removeEventListener?.('change', syncMotion);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div ref={hostRef} className={`gf-verifier-scene ${compact ? 'gf-verifier-scene-compact' : ''} ${className}`} role="img" aria-label="Animated monochrome metallic security robot with a floating shield">
      <span className="gf-verifier-scene-fallback" aria-hidden="true">GF</span>
    </div>
  );
}
