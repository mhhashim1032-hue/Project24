'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function AdsShowcaseScene() {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host=hostRef.current; if(!host)return;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{return;}
    const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.3));renderer.setSize(w,h);renderer.setClearColor(0,0);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,w/h,.1,30);camera.position.set(0,0,6);
    scene.add(new THREE.HemisphereLight(0xfff1d1,0x28354b,2.1));
    const key=new THREE.DirectionalLight(0xffe4a7,3.3);key.position.set(3,4,5);scene.add(key);
    const group=new THREE.Group();scene.add(group);
    const yellow=new THREE.MeshStandardMaterial({color:0xf4c94f,roughness:.35,metalness:.08});
    const orange=new THREE.MeshStandardMaterial({color:0xe98b37,roughness:.35});
    const white=new THREE.MeshStandardMaterial({color:0xf7f7f2,roughness:.35});
    const black=new THREE.MeshStandardMaterial({color:0x1a2433,roughness:.25});
    const body=new THREE.Mesh(new THREE.SphereGeometry(.88,40,32),yellow);body.scale.set(1,.92,.82);group.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.58,36,28),yellow);head.position.set(.02,.78,.08);group.add(head);
    const eye1=new THREE.Mesh(new THREE.SphereGeometry(.055,16,12),black);eye1.position.set(-.2,.84,.58);group.add(eye1);
    const eye2=eye1.clone();eye2.position.x=.22;group.add(eye2);
    const beak=new THREE.Mesh(new THREE.ConeGeometry(.23,.48,4),orange);beak.rotation.z=-Math.PI/2;beak.position.set(.55,.67,.25);group.add(beak);
    const wing=new THREE.Mesh(new THREE.SphereGeometry(.48,24,16),orange);wing.scale.set(.35,.75,.18);wing.position.set(-.68,-.05,.42);wing.rotation.z=-.25;group.add(wing);
    const megaphone=new THREE.Group();megaphone.position.set(1.05,.08,.3);megaphone.rotation.z=-.18;group.add(megaphone);
    const horn=new THREE.Mesh(new THREE.CylinderGeometry(.58,.18,.9,40,1,true),white);horn.rotation.z=-Math.PI/2;megaphone.add(horn);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.57,.055,12,40),orange);rim.rotation.y=Math.PI/2;rim.position.x=-.45;megaphone.add(rim);
    const handle=new THREE.Mesh(new THREE.BoxGeometry(.17,.48,.18),black);handle.position.set(.05,-.52,0);megaphone.add(handle);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.85,.012,8,80),new THREE.MeshBasicMaterial({color:0x6ca7ee,transparent:true,opacity:.45}));ring.rotation.x=.9;scene.add(ring);
    let frame=0,raf=0;
    const animate=()=>{raf=requestAnimationFrame(animate);frame+=.009;group.rotation.y=Math.sin(frame*.7)*.16;group.position.y=Math.sin(frame)*.08;megaphone.rotation.y=Math.sin(frame*1.2)*.12;ring.rotation.z=frame*.12;renderer.render(scene,camera)};animate();
    const obs=new ResizeObserver(()=>{const width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height)});obs.observe(host);
    return()=>{cancelAnimationFrame(raf);obs.disconnect();scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose())}});renderer.dispose();renderer.domElement.remove()};
  },[]);
  return <div ref={hostRef} className="gf-ads-scene" role="img" aria-label="Animated 3D yellow duck holding a megaphone"/>
}
