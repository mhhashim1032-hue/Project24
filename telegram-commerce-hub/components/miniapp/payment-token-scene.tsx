'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type Props = { mode?: 'coins' | 'wallet'; className?: string };

/** Decorative, local-geometry payment illustration; no external assets or network calls. */
export default function PaymentTokenScene({ mode = 'coins', className = '' }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch { return; }
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, w / h, .1, 50);
    camera.position.set(0, 0, 6);
    scene.add(new THREE.HemisphereLight(0xe8e8e8, 0x1b1722, 2));
    const light = new THREE.DirectionalLight(0xf0f0f0, 3.4); light.position.set(3, 4, 5); scene.add(light);
    const blue = new THREE.MeshStandardMaterial({ color: 0x999da4, metalness: .78, roughness: .24 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xbfc2c7, metalness: .86, roughness: .22 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xd5d7da, metalness: .82, roughness: .2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x45494f, metalness: .68, roughness: .28 });
    const group = new THREE.Group(); scene.add(group);
    if (mode === 'coins') {
      const materials = [gold, blue, silver];
      for (let i = 0; i < 3; i++) {
        const coin = new THREE.Group();
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(.67 - i*.06, .67 - i*.06, .16, 56), materials[i]);
        disc.rotation.x = Math.PI / 2;
        coin.add(disc);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.49 - i*.05, .035, 10, 56), new THREE.MeshStandardMaterial({ color: 0xe6e7e9, metalness: .8, roughness: .2 }));
        ring.position.z = .1; coin.add(ring);
        coin.position.set((i-1)*1.18, i===1?.12:-.12, (2-i)*.18);
        coin.rotation.y = (i-1)*.25;
        group.add(coin);
      }
    } else {
      const body = new THREE.Mesh(new THREE.SphereGeometry(1.12, 40, 32), gold);
      body.scale.set(1.1, .9, .72); body.position.y = -.2; group.add(body);
      const top = new THREE.Mesh(new THREE.TorusGeometry(.76, .17, 16, 64), dark);
      top.scale.set(1.1,.72,1); top.position.y = .62; group.add(top);
      const clasp = new THREE.Mesh(new THREE.BoxGeometry(.42,.3,.16), silver);
      clasp.position.set(0,.55,.82); group.add(clasp);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(.85,.075,12,64,Math.PI), gold);
      strap.rotation.z = Math.PI; strap.position.y = .5; strap.position.z = -.1; group.add(strap);
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(.27,.27,.1,40), blue);
      coin.rotation.x = Math.PI/2; coin.position.set(.9,.8,.25); group.add(coin);
    }
    let frame = 0, raf = 0, inView = false;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const draw = () => renderer.render(scene, camera);
    const animate = () => {
      if (!inView || document.hidden || motionQuery.matches) return;
      raf = requestAnimationFrame(animate); frame += .009;
      group.rotation.y = Math.sin(frame*.65)*.2;
      group.rotation.x = Math.sin(frame*.4)*.06;
      group.position.y = Math.sin(frame)*.07;
      group.children.forEach((child, i) => { if(mode==='coins') child.rotation.y += .003 + i*.001; });
      draw();
    };
    const syncMotion = () => {
      cancelAnimationFrame(raf);
      if (inView) { draw(); if (!document.hidden && !motionQuery.matches) animate(); }
    };
    const visibility = new IntersectionObserver((entries) => { inView = Boolean(entries[0]?.isIntersecting); syncMotion(); }, { threshold: 0.05 });
    visibility.observe(host);
    const onVisibilityChange = () => syncMotion();
    document.addEventListener('visibilitychange', onVisibilityChange);
    motionQuery.addEventListener?.('change', syncMotion);
    draw();
    const observer = new ResizeObserver(() => {
      const width = Math.max(1,host.clientWidth), height = Math.max(1,host.clientHeight);
      camera.aspect = width/height; camera.updateProjectionMatrix(); renderer.setSize(width,height);
    });
    observer.observe(host);
    return () => {
      cancelAnimationFrame(raf); observer.disconnect(); visibility.disconnect(); document.removeEventListener('visibilitychange', onVisibilityChange); motionQuery.removeEventListener?.('change', syncMotion);
      scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose())}});
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [mode]);
  return <div ref={hostRef} className={`gf-payment-scene gf-payment-scene-${mode} ${className}`} aria-hidden="true"><span>{mode==='wallet'?'$':'₿'}</span></div>;
}
