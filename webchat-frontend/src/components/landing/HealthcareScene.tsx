import { useEffect, useRef } from "react";
import * as THREE from "three";

const HealthcareScene = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x020617, 7, 22);

    const camera = new THREE.PerspectiveCamera(
      48,
      container.clientWidth / container.clientHeight,
      0.1,
      100,
    );
    camera.position.set(0, 1.2, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x77bfff, 0.7);
    scene.add(ambientLight);

    const keyLight = new THREE.PointLight(0x3b82f6, 3.5, 30);
    keyLight.position.set(6, 5, 6);
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x14b8a6, 2.4, 30);
    fillLight.position.set(-5, -1, 4);
    scene.add(fillLight);

    const crossGroup = new THREE.Group();
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      metalness: 0.35,
      roughness: 0.18,
      emissive: 0x0891b2,
      emissiveIntensity: 0.55,
    });

    const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.95, 3.5, 0.62), coreMaterial);
    const horizontal = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.95, 0.62), coreMaterial);
    crossGroup.add(vertical, horizontal);
    scene.add(crossGroup);

    const ringMaterial = new THREE.MeshStandardMaterial({
      color: 0x93c5fd,
      metalness: 0.6,
      roughness: 0.28,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.4,
    });

    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.085, 20, 140), ringMaterial);
    outerRing.rotation.x = Math.PI / 2;
    scene.add(outerRing);

    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.07, 16, 120), ringMaterial);
    innerRing.rotation.x = Math.PI / 2;
    innerRing.rotation.y = Math.PI / 5;
    scene.add(innerRing);

    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.18,
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(2.45, 32, 32), haloMaterial);
    scene.add(halo);

    const particlesGeometry = new THREE.BufferGeometry();
    const particleCount = 300;
    const positions = new Float32Array(particleCount * 3);

    for (let index = 0; index < particleCount; index += 1) {
      const radius = 3 + Math.random() * 2.5;
      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 4;

      positions[index * 3] = Math.cos(theta) * radius;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = Math.sin(theta) * radius;
    }

    particlesGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particlesMaterial = new THREE.PointsMaterial({
      color: 0x60a5fa,
      size: 0.042,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    const clock = new THREE.Clock();
    let frameId = 0;

    const animate = () => {
      const elapsed = clock.getElapsedTime();

      crossGroup.rotation.y = elapsed * 0.55;
      crossGroup.rotation.x = Math.sin(elapsed * 0.7) * 0.18;

      outerRing.rotation.z = elapsed * 0.32;
      innerRing.rotation.z = -elapsed * 0.42;
      halo.scale.setScalar(1 + Math.sin(elapsed * 1.4) * 0.035);

      particles.rotation.y = elapsed * 0.06;
      particles.rotation.x = Math.sin(elapsed * 0.22) * 0.1;

      camera.position.z = 8 + Math.sin(elapsed * 0.45) * 0.2;
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    animate();

    const onResize = () => {
      if (!containerRef.current) return;

      const { clientWidth, clientHeight } = containerRef.current;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      window.cancelAnimationFrame(frameId);

      particlesGeometry.dispose();
      particlesMaterial.dispose();
      coreMaterial.dispose();
      ringMaterial.dispose();
      haloMaterial.dispose();
      vertical.geometry.dispose();
      horizontal.geometry.dispose();
      outerRing.geometry.dispose();
      innerRing.geometry.dispose();
      halo.geometry.dispose();

      scene.clear();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative h-[360px] w-full overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-slate-950/90 via-slate-900/80 to-slate-950/95 shadow-[0_0_80px_-20px_rgba(59,130,246,0.45)] sm:h-[430px] lg:h-[520px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(14,165,233,0.18),transparent_45%),radial-gradient(circle_at_85%_75%,rgba(16,185,129,0.12),transparent_45%)]" />
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
};

export default HealthcareScene;
