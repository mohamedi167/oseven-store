import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronLeft, ChevronRight, Layers, Sparkles } from 'lucide-react';
import type { Category, Language, OfferTimer, Product } from '../types';
import { getCutoutDataUrl } from '../utils/cutout';
import { CutoutImage } from './CutoutImage';
import { useT } from '../utils/i18n';
import { formatEGP, getEffectivePrice } from '../utils/pricing';

interface Props {
  products: Product[];
  categories: Category[];
  activeOffers: OfferTimer[];
  lang: Language;
  onSelectProduct: (product: Product) => void;
  onAddToOutfit: (product: Product) => void;
  onOpenOutfitBuilder: () => void;
}

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Alpha-weighted 9-tap Gaussian blur + focus vignette shader (eliminates white halo bleeding)
const FRAGMENT_SHADER = `
  uniform sampler2D uMap;
  uniform float uBlur;
  uniform float uDim;
  uniform vec2 uTexelSize;
  varying vec2 vUv;

  void main() {
    float radius = uBlur * 11.0;
    vec2 stepUv = uTexelSize * radius;

    vec4 s0 = texture2D(uMap, vUv);
    vec4 s1 = texture2D(uMap, vUv + vec2(stepUv.x, 0.0));
    vec4 s2 = texture2D(uMap, vUv - vec2(stepUv.x, 0.0));
    vec4 s3 = texture2D(uMap, vUv + vec2(0.0, stepUv.y));
    vec4 s4 = texture2D(uMap, vUv - vec2(0.0, stepUv.y));
    vec4 s5 = texture2D(uMap, vUv + vec2(stepUv.x, stepUv.y));
    vec4 s6 = texture2D(uMap, vUv + vec2(-stepUv.x, stepUv.y));
    vec4 s7 = texture2D(uMap, vUv + vec2(stepUv.x, -stepUv.y));
    vec4 s8 = texture2D(uMap, vUv + vec2(-stepUv.x, -stepUv.y));

    float alphaSum =
      s0.a * 0.20 +
      (s1.a + s2.a + s3.a + s4.a) * 0.12 +
      (s5.a + s6.a + s7.a + s8.a) * 0.08;

    if (alphaSum < 0.06) discard;

    vec3 rgbSum =
      s0.rgb * (s0.a * 0.20) +
      (s1.rgb * s1.a + s2.rgb * s2.a + s3.rgb * s3.a + s4.rgb * s4.a) * 0.12 +
      (s5.rgb * s5.a + s6.rgb * s6.a + s7.rgb * s7.a + s8.rgb * s8.a) * 0.08;

    vec3 cleanRgb = rgbSum / max(alphaSum, 0.001);

    // Slight atmospheric brown-tinted depth fade for rear items
    vec3 shadowTint = vec3(0.11, 0.06, 0.04);
    vec3 finalRgb = mix(cleanRgb, shadowTint, uDim * 0.42);
    float finalAlpha = clamp(alphaSum * (1.0 - uDim * 0.22), 0.0, 1.0);

    gl_FragColor = vec4(finalRgb, finalAlpha);
  }
`;

interface RingItemMeta {
  product: Product;
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  phase: number;
  baseIdx: number;
}

const isSoftwareGl = (() => {
  if (typeof document === 'undefined') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
})();

export const HeroRing3D: React.FC<Props> = ({
  products,
  categories,
  activeOffers,
  lang,
  onSelectProduct,
  onAddToOutfit,
  onOpenOutfitBuilder,
}) => {
  const t = useT(lang);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [liteMode, setLiteMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  });
  const [webglFailed, setWebglFailed] = useState(false);

  const heroProducts = useMemo(() => {
    const flagged = products.filter((p) => p.showInHero && p.showInStore);
    return flagged.length > 0 ? flagged : products.slice(0, 7);
  }, [products]);

  const focusedProduct = heroProducts[focusedIndex % Math.max(1, heroProducts.length)] || null;
  const focusedCategory = useMemo(
    () => categories.find((c) => c.id === focusedProduct?.categoryId),
    [categories, focusedProduct]
  );

  // Mutable refs for smooth animation without recreating WebGL scene
  const targetAngleRef = useRef(0);
  const currentAngleRef = useRef(0);
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartAngleRef = useRef(0);
  const dragDistanceRef = useRef(0);
  const onSelectRef = useRef(onSelectProduct);
  onSelectRef.current = onSelectProduct;

  const rotateBySteps = (deltaSteps: number) => {
    const count = Math.max(1, heroProducts.length);
    const stepAngle = (Math.PI * 2) / count;
    targetAngleRef.current += deltaSteps * stepAngle;
    if (liteMode || webglFailed) {
      setFocusedIndex((prev) => (prev - deltaSteps + count * 10) % count);
    }
  };

  const jumpToIndex = (index: number) => {
    const count = Math.max(1, heroProducts.length);
    const stepAngle = (Math.PI * 2) / count;
    const desiredMod = -index * stepAngle;
    const current = targetAngleRef.current;
    const twoPi = Math.PI * 2;
    let diff = ((desiredMod - current) % twoPi + twoPi) % twoPi;
    if (diff > Math.PI) diff -= twoPi;
    targetAngleRef.current = current + diff;
    setFocusedIndex(index);
  };

  // Gentle scroll-linked rotation while moving near the top of the page
  useEffect(() => {
    const handleScroll = () => {
      if (draggingRef.current) return;
      const y = window.scrollY;
      if (y > 10 && y < 520 && heroProducts.length > 1) {
        const stepAngle = (Math.PI * 2) / heroProducts.length;
        const scrollIdx = Math.round((y / 520) * 2);
        if (scrollIdx > 0) {
          targetAngleRef.current = -scrollIdx * stepAngle;
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [heroProducts.length]);

  useEffect(() => {
    if (liteMode || webglFailed || heroProducts.length === 0) return;
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || 640;

    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x120a07, 0.032);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0.35, 9.4);
    camera.lookAt(0, -0.1, 0);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xffe9dc, 0x26130b, 0.9);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1e6, 1.4);
    keyLight.position.set(4, 6, 6);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7a0c1e, 1.8);
    rimLight.position.set(-5, 2, -6);
    scene.add(rimLight);

    // Architectural brushed bronze orbital ring guide at base
    const orbitGeo = new THREE.TorusGeometry(3.85, 0.016, 12, 120);
    const orbitMat = new THREE.MeshStandardMaterial({
      color: 0x6b4226,
      metalness: 0.85,
      roughness: 0.25,
      transparent: true,
      opacity: 0.55,
    });
    const orbitMesh = new THREE.Mesh(orbitGeo, orbitMat);
    orbitMesh.rotation.x = Math.PI / 2;
    orbitMesh.position.y = -1.55;
    scene.add(orbitMesh);

    const innerOrbitGeo = new THREE.TorusGeometry(2.65, 0.01, 10, 96);
    const innerOrbitMat = new THREE.MeshStandardMaterial({
      color: 0x7a0c1e,
      metalness: 0.7,
      roughness: 0.35,
      transparent: true,
      opacity: 0.4,
    });
    const innerOrbitMesh = new THREE.Mesh(innerOrbitGeo, innerOrbitMat);
    innerOrbitMesh.rotation.x = Math.PI / 2;
    innerOrbitMesh.position.y = -1.62;
    scene.add(innerOrbitMesh);

    const ringGroup = new THREE.Group();
    scene.add(ringGroup);

    const count = heroProducts.length;
    const radius = count <= 4 ? 3.1 : 3.85;
    const itemMetas: RingItemMeta[] = [];
    const clickableMeshes: THREE.Mesh[] = [];
    const disposables: { dispose: () => void }[] = [orbitGeo, orbitMat, innerOrbitGeo, innerOrbitMat];

    const planeGeo = new THREE.PlaneGeometry(2.35, 2.75);
    disposables.push(planeGeo);

    // Transparent placeholder while cutout initializes (no rectangular flash)
    const fallbackData = new Uint8Array([0, 0, 0, 0]);
    const fallbackTex = new THREE.DataTexture(fallbackData, 1, 1);
    fallbackTex.needsUpdate = true;
    disposables.push(fallbackTex);

    let disposed = false;
    const textureLoader = new THREE.TextureLoader();

    const applyTextureToMesh = (
      tex: THREE.Texture,
      mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>,
      mat: THREE.ShaderMaterial,
      imgWidth?: number,
      imgHeight?: number
    ) => {
      if (disposed) {
        tex.dispose();
        return;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      if (imgWidth && imgHeight) {
        mat.uniforms.uTexelSize.value.set(1 / imgWidth, 1 / imgHeight);
        const aspect = imgWidth / imgHeight;
        const targetH = 2.75;
        mesh.scale.set(Math.min(1.25, Math.max(0.65, aspect / (2.35 / targetH))), 1, 1);
      }
      mat.uniforms.uMap.value = tex;
      disposables.push(tex);
    };

    heroProducts.forEach((product, idx) => {
      const itemGroup = new THREE.Group();
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uMap: { value: fallbackTex },
          uBlur: { value: idx === 0 ? 0 : 0.75 },
          uDim: { value: idx === 0 ? 0 : 0.45 },
          uTexelSize: { value: new THREE.Vector2(1 / 512, 1 / 512) },
        },
      });
      disposables.push(mat);

      const mesh = new THREE.Mesh(planeGeo, mat);
      // Keep on default layer 0 so camera renders all product meshes!
      mesh.userData.product = product;
      mesh.userData.index = idx;
      itemGroup.add(mesh);
      ringGroup.add(itemGroup);
      clickableMeshes.push(mesh);

      itemMetas.push({
        product,
        group: itemGroup,
        mesh,
        phase: idx * 1.15,
        baseIdx: idx,
      });

      const primaryImg = product.colors[0]?.images[0] || product.images[0] || '';
      if (primaryImg) {
        getCutoutDataUrl(primaryImg).then((cutoutUrl) => {
          if (disposed) return;
          if (cutoutUrl && cutoutUrl.startsWith('data:')) {
            const cutoutImg = new Image();
            cutoutImg.onload = () => {
              if (disposed) return;
              const cutTex = new THREE.Texture(cutoutImg);
              applyTextureToMesh(cutTex, mesh, mat, cutoutImg.width, cutoutImg.height);
            };
            cutoutImg.onerror = () => {
              textureLoader.load(primaryImg, (rawTex) => {
                const img = rawTex.image as HTMLImageElement | undefined;
                applyTextureToMesh(rawTex, mesh, mat, img?.width, img?.height);
              });
            };
            cutoutImg.src = cutoutUrl;
          } else {
            textureLoader.load(primaryImg, (rawTex) => {
              const img = rawTex.image as HTMLImageElement | undefined;
              applyTextureToMesh(rawTex, mesh, mat, img?.width, img?.height);
            });
          }
        });
      }
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const canvas = renderer.domElement;
    const onPointerDown = (e: PointerEvent) => {
      draggingRef.current = true;
      dragStartXRef.current = e.clientX;
      dragStartAngleRef.current = targetAngleRef.current;
      dragDistanceRef.current = 0;
      canvas.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (draggingRef.current) {
        const dx = e.clientX - dragStartXRef.current;
        dragDistanceRef.current = Math.abs(dx);
        targetAngleRef.current = dragStartAngleRef.current + dx * 0.0065;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      canvas.releasePointerCapture?.(e.pointerId);

      const stepAngle = (Math.PI * 2) / Math.max(1, count);
      if (dragDistanceRef.current >= 6) {
        const snapped = Math.round(targetAngleRef.current / stepAngle) * stepAngle;
        targetAngleRef.current = snapped;
        return;
      }

      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const prod = hits[0].object.userData.product as Product | undefined;
        if (prod) {
          onSelectRef.current(prod);
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 2) {
        e.preventDefault();
        targetAngleRef.current -= e.deltaX * 0.004;
      }
    };

    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      setWebglFailed(true);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('webglcontextlost', onContextLost);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || 640;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    let frameId = 0;
    const clock = new THREE.Clock();
    let lastFocusedIdx = -1;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const delta = Math.min(0.1, clock.getDelta());
      const elapsed = clock.getElapsedTime();

      currentAngleRef.current = THREE.MathUtils.damp(
        currentAngleRef.current,
        targetAngleRef.current,
        5.5,
        delta
      );

      let closestIdx = 0;
      let highestZ = -999;

      for (let i = 0; i < itemMetas.length; i++) {
        const meta = itemMetas[i];
        const angle = (i / count) * Math.PI * 2 + currentAngleRef.current;

        const x = Math.sin(angle) * radius;
        const z = Math.cos(angle) * radius;
        const floatY = Math.sin(elapsed * 0.85 + meta.phase) * 0.14;

        meta.group.position.set(x, floatY + 0.15 + (z < 0 ? 0.25 : 0), z);
        meta.mesh.rotation.y = Math.sin(elapsed * 0.55 + meta.phase) * 0.18;
        meta.mesh.rotation.z = Math.cos(elapsed * 0.4 + meta.phase) * 0.03;

        if (z > highestZ) {
          highestZ = z;
          closestIdx = i;
        }

        const cosFront = Math.cos(angle);
        const distFromFront = THREE.MathUtils.clamp((1 - cosFront) * 0.5, 0, 1);

        const blurAmt = distFromFront < 0.04 ? 0 : THREE.MathUtils.smoothstep(distFromFront, 0.03, 0.55);
        meta.mesh.material.uniforms.uBlur.value = blurAmt;
        meta.mesh.material.uniforms.uDim.value = THREE.MathUtils.smoothstep(distFromFront, 0.08, 0.95);
        meta.mesh.renderOrder = Math.round((z + radius) * 10);

        const s = THREE.MathUtils.lerp(1.18, 0.78, Math.pow(distFromFront, 0.7));
        meta.group.scale.setScalar(s);
      }

      if (closestIdx !== lastFocusedIdx) {
        lastFocusedIdx = closestIdx;
        setFocusedIndex(closestIdx);
      }

      orbitMesh.rotation.z = elapsed * 0.04;
      innerOrbitMesh.rotation.z = -elapsed * 0.06;

      renderer.render(scene, camera);
      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    };
  }, [heroProducts, liteMode, webglFailed]);

  const pricing = focusedProduct ? getEffectivePrice(focusedProduct, activeOffers) : null;

  return (
    <section
      id="drops"
      className="relative w-full min-h-[680px] h-[calc(100vh-4.5rem)] max-h-[860px] overflow-hidden bg-[radial-gradient(ellipse_at_center,_#3A1F14_0%,_#1A0E09_52%,_#0F0705_100%)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,_rgba(122,12,30,0.16),_transparent_58%)]" />

      {!liteMode && !webglFailed ? (
        <div
          ref={mountRef}
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          aria-label="OSEVEN 3D Product Showcase Ring"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-4 pb-28">
          <div className="relative flex items-center justify-center w-full max-w-4xl h-[380px]">
            {heroProducts.map((p, idx) => {
              const count = heroProducts.length;
              const offset = ((idx - focusedIndex + count + Math.floor(count / 2)) % count) - Math.floor(count / 2);
              const isCenter = offset === 0;
              const img = p.colors[0]?.images[0] || p.images[0];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => (isCenter ? onSelectProduct(p) : jumpToIndex(idx))}
                  style={{
                    transform: `translateX(${offset * 180}px) translateY(${isCenter ? 0 : Math.abs(offset) * 14}px) scale(${isCenter ? 1.1 : Math.max(0.65, 1 - Math.abs(offset) * 0.16)})`,
                    zIndex: 20 - Math.abs(offset),
                    filter: isCenter ? 'blur(0px)' : `blur(${Math.min(8, Math.abs(offset) * 3.5)}px)`,
                    opacity: Math.abs(offset) > 2 ? 0 : isCenter ? 1 : 0.6,
                  }}
                  className="absolute transition-all duration-500 ease-out cursor-pointer focus:outline-none"
                >
                  <CutoutImage
                    src={img}
                    alt={p.name}
                    className="w-52 h-64 object-contain drop-shadow-[0_24px_34px_rgba(0,0,0,0.75)]"
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Left Minimal Editorial Kicker & Mode Switch */}
      <div className="pointer-events-none absolute top-5 left-4 right-4 sm:left-8 sm:right-8 z-20 flex items-center justify-between gap-4">
        <div className="pointer-events-auto">
          <p className="text-xs tracking-[0.2em] uppercase text-[#C2B2A8] font-medium">
            {t.heroSubtitle}
          </p>
          <p className="mt-1 text-xs text-white/60 max-w-md hidden sm:block">
            {t.heroInstruction}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setLiteMode((v) => !v)}
          className="pointer-events-auto px-3 py-1.5 text-xs font-medium rounded-lg border border-white/15 bg-black/35 text-white/85 hover:text-white hover:border-white/30 transition-colors whitespace-nowrap shrink-0"
        >
          {liteMode || webglFailed ? t.liteModeOn : t.liteModeOff}
        </button>
      </div>

      {/* Bottom Focal Control Bar */}
      {focusedProduct && pricing && (
        <div className="absolute bottom-5 left-4 right-4 z-20 flex flex-col items-center gap-3 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => rotateBySteps(1)}
              aria-label="Previous piece"
              className="w-9 h-9 rounded-full bg-[#1C100B]/90 border border-white/15 flex items-center justify-center text-white hover:bg-[#7A0C1E] hover:border-[#7A0C1E] transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1C100B]/90 border border-white/10">
              {heroProducts.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  aria-label={`Focus ${p.name}`}
                  onClick={() => jumpToIndex(i)}
                  className={`h-2 rounded-full transition-all cursor-pointer ${
                    i === focusedIndex ? 'w-6 bg-[#7A0C1E]' : 'w-2 bg-white/30 hover:bg-white/60'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => rotateBySteps(-1)}
              aria-label="Next piece"
              className="w-9 h-9 rounded-full bg-[#1C100B]/90 border border-white/15 flex items-center justify-center text-white hover:bg-[#7A0C1E] hover:border-[#7A0C1E] transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="pointer-events-auto w-full max-w-3xl rounded-2xl bg-[#1A0E0A]/95 border border-white/12 px-5 py-4 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-[#C2B2A8]">
                <span>{lang === 'ar' ? focusedCategory?.nameAr : focusedCategory?.name}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {focusedProduct.colors.length}{' '}
                  {lang === 'ar' ? 'ألوان' : focusedProduct.colors.length === 1 ? 'color' : 'colors'}
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-white truncate mt-0.5">
                {lang === 'ar' ? focusedProduct.nameAr : focusedProduct.name}
              </h1>
              <div className="flex items-baseline gap-2.5 mt-1">
                <span className="font-mono-num text-base font-bold text-white">
                  {formatEGP(pricing.finalPrice, lang)}
                </span>
                {pricing.isOnOffer && pricing.originalPrice > pricing.finalPrice && (
                  <span className="font-mono-num text-xs text-[#C2B2A8] line-through">
                    {formatEGP(pricing.originalPrice, lang)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => onSelectProduct(focusedProduct)}
                className="px-4 py-2.5 rounded-lg bg-[#7A0C1E] hover:bg-[#991228] text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                {t.viewPiece}
              </button>
              <button
                type="button"
                onClick={() => onAddToOutfit(focusedProduct)}
                className="px-4 py-2.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                {t.addToOutfit}
              </button>
              <button
                type="button"
                onClick={onOpenOutfitBuilder}
                className="px-3.5 py-2.5 rounded-lg border border-[#6B4226] bg-[#4A2C1D]/50 hover:bg-[#4A2C1D] text-white text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {t.buildYourOutfit}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
