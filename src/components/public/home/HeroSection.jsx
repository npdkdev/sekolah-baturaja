import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import CardSwap, { Card } from '@/components/reactbits/CardSwap/CardSwap';
import CountUp from '@/components/reactbits/CountUp/CountUp';
import GradientText from '@/components/reactbits/GradientText/GradientText';
import SplitText from '@/components/reactbits/SplitText/SplitText';
import StarBorder from '@/components/reactbits/StarBorder/StarBorder';
import SectionKicker from './SectionKicker';
import { imageOf, LOCAL_LOGO, safeArray } from './homeUtils';

// Menunda pemasangan sampai browser selesai dengan pekerjaan render awal.
//
// React.lazy mulai mengunduh chunk-nya begitu komponen dirender, jadi tanpa
// penundaan ini three.js (720 KB) dan model .glb (1,4 MB) berebut bandwidth
// dengan teks hero — elemen LCP halaman. Menundanya sampai idle membuat
// konten utama tampil dulu, baru dekorasi 3D menyusul.
const useDeferredMount = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    // Hormati preferensi hemat data dan koneksi lambat: di sana model 3D
    // dekoratif seharga 2 MB bukan pertukaran yang pantas.
    const conn = navigator.connection;
    if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType || '')) return undefined;

    const schedule = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 1200));
    const cancel = window.cancelIdleCallback || window.clearTimeout;
    const id = schedule(() => setReady(true), { timeout: 3000 });
    return () => cancel(id);
  }, []);

  return ready;
};

const LightPillar = React.lazy(() => import('@/components/reactbits/LightPillar/LightPillar'));
const ModelViewer = React.lazy(() => import('@/components/reactbits/ModelViewer/ModelViewer'));

const getQuality = () => {
  if (typeof window === 'undefined') return 'medium';
  if (window.matchMedia('(max-width: 640px)').matches) return 'low';
  if (window.matchMedia('(max-width: 1024px)').matches) return 'medium';
  return 'high';
};

const HeroSection = ({ content, currentSlide, setCurrentSlide, stats }) => {
  const show3D = useDeferredMount();
  const model3dSettings = content?.model3dSettings || {};
  const autoRotate = model3dSettings.autoRotate === true;
  const autoRotateSpeed = autoRotate ? (model3dSettings.autoRotateSpeed || 0.34) : 0;
  const modelRotation = [
    model3dSettings.rotationX || 0,
    model3dSettings.rotationY || 0,
    model3dSettings.rotationZ || 0,
  ];
  const slides = safeArray(content.heroSlides);
  const activeSlide = slides[currentSlide] || slides[0] || {};
  const heroText = activeSlide.text || 'Masuki ruang belajar Al-Qur’an yang hangat, tertata, dan dekat dengan keluarga.';
  const heroSubtext = activeSlide.author || 'Metode Qiroati, pembinaan adab, dan informasi lembaga yang mudah diikuti wali santri.';
  const logoUrl = content.logoUrl || LOCAL_LOGO;
  const quality = useMemo(getQuality, []);
  const sessionCount = Math.max(safeArray(content.schedules).length, 0);
  const heroCards = useMemo(() => {
    const heroItems = slides.map((slide, index) => ({
      id: slide.id || `hero-${index}`,
      source: 'Cerita utama',
      title: slide.text || 'Kegiatan belajar LPQ',
      description: slide.author || 'Dokumentasi yang dikelola dari konten website.',
      image: imageOf(slide),
      slideIndex: index,
    }));
    const supportingItems = [
      ...safeArray(content.galleryPhotos),
      ...safeArray(content.facilities),
    ].map((item, index) => ({
      id: item.id || `support-${index}`,
      source: 'Kegiatan LPQ',
      title: item.title || item.name || 'Suasana belajar',
      description: item.description || 'Foto kegiatan yang dikelola dari konten website.',
      image: imageOf(item),
      slideIndex: null,
    }));
    const usedImages = new Set();
    const cards = [...heroItems, ...supportingItems]
      .filter((item) => item.image)
      .filter((item) => {
        if (usedImages.has(item.image)) return false;
        usedImages.add(item.image);
        return true;
      })
      .slice(0, 4);

    if (cards.length) return cards;

    return [{
      id: 'hero-fallback',
      source: 'LPQ Al-Fath Maulana',
      title: 'Ruang belajar Al-Qur’an',
      description: 'Masuki ruang belajar Al-Qur’an yang hangat dan terarah.',
      image: '/institution/hero-learning.webp',
      slideIndex: null,
      isLogo: false,
    }];
  }, [content.facilities, content.galleryPhotos, slides]);

  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <div className="home-hero__backdrop" />
      <Suspense fallback={<div className="home-hero__pillar-fallback" aria-hidden="true" />}>
        <LightPillar
          topColor="#9dc1c7"
          bottomColor="#00eb9d"
          intensity={1}
          rotationSpeed={0.4}
          glowAmount={0.005}
          pillarWidth={3}
          pillarHeight={0.3}
          noiseIntensity={0.3}
          pillarRotation={53}
          interactive={quality === 'high'}
          mixBlendMode="color-dodge"
          quality={quality}
        />
      </Suspense>
      <div className="home-hero__grain" aria-hidden="true" />
      <div className="home-hero__quran-model" aria-hidden="true">
        <Suspense fallback={null}>
          {show3D && <ModelViewer
            url="/models/quran_3d_free.glb"
            width="100%"
            height="100%"
            environmentPreset="studio"
            defaultZoom={3.05}
            modelScale={1.36}
            modelPosition={[0, -0.01, 0]}
            modelRotation={modelRotation}
            autoRotateSpeed={autoRotateSpeed}
          />}
        </Suspense>
      </div>
      <div className="home-hero__inner">
        <motion.div
          className="home-hero__copy"
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.78, ease: [0.22, 1, 0.36, 1] }}
        >
          <SectionKicker dark>A Living Journey of Learning</SectionKicker>
          <h1 id="home-hero-title" className="home-hero__title">
            <SplitText
              text="Belajar Al-Qur’an"
              tag="span"
              className="home-hero__split-line"
              delay={70}
              duration={0.9}
              ease="power3.out"
              splitType="words"
              from={{ opacity: 0, y: 46, filter: 'blur(10px)' }}
              to={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              textAlign="left"
            />
            <GradientText
              colors={['#8af5cb', '#66d9ff', '#c6b8ff', '#f5c76a']}
              animationSpeed={6.5}
              direction="horizontal"
              className="home-hero__gradient-line"
            >
              <SplitText
                text="terasa lebih hidup."
                tag="span"
                className="home-hero__split-line"
                delay={58}
                duration={0.92}
                ease="power3.out"
                splitType="words"
                from={{ opacity: 0, y: 42, filter: 'blur(10px)' }}
                to={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                textAlign="left"
              />
            </GradientText>
          </h1>
          <p className="home-hero__lead">{heroText}</p>
          <p className="home-hero__support">{heroSubtext}</p>
          <div className="home-hero__actions">
            <StarBorder as="span">
              <Button asChild size="lg" className="home-primary-cta">
                <Link to="/pendaftaran/informasi">Informasi Pendaftaran <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
            </StarBorder>
            <Button asChild size="lg" variant="outline" className="home-secondary-cta">
              <Link to="/profil">Kenali LPQ</Link>
            </Button>
          </div>
          <div className="home-hero__stats" aria-label="Ringkasan lembaga">
            <span className="home-hero-stat">
              <strong><CountUp from={0} to={Number(stats.santri || 0)} separator="." duration={2.6} /></strong>
              santri aktif
            </span>
            <span className="home-hero-stat">
              <strong><CountUp from={0} to={Number(stats.guru || 0)} separator="." duration={2.4} delay={0.1} /></strong>
              guru aktif
            </span>
            <span className="home-hero-stat">
              <strong><CountUp from={0} to={sessionCount || 0} separator="." duration={2.2} delay={0.2} /></strong>
              sesi belajar
            </span>
          </div>
        </motion.div>
        <motion.div
          className="home-hero__visual"
          initial={{ opacity: 0, x: 38, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.85, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="home-hero__swap-stage" aria-label="Dokumentasi kegiatan LPQ">
            <CardSwap
              width="min(82vw, 38rem)"
              height="min(74vw, 31rem)"
              cardDistance={56}
              verticalDistance={60}
              delay={content.slideshowTimer || 7000}
              skewAmount={3.5}
              easing="elastic"
              onCardClick={(index) => {
                const slideIndex = heroCards[index]?.slideIndex;
                if (typeof slideIndex === 'number') setCurrentSlide(slideIndex);
              }}
            >
              {heroCards.map((card, index) => (
                <Card key={card.id} className={`home-hero-swap-card ${card.isLogo ? 'home-hero-swap-card--logo' : ''}`}>
                  <div className="home-hero-swap-card__titlebar">
                    <span className="home-hero-swap-card__traffic" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="home-hero-swap-card__window-title">{card.source}</span>
                  </div>
                  <img
                    src={card.image}
                    alt={card.isLogo ? 'Logo LPQ Al-Fath Maulana' : `Dokumentasi ${card.title}`}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    onError={(event) => {
                      if (event.currentTarget.src.endsWith(logoUrl)) {
                        event.currentTarget.style.display = 'none';
                        return;
                      }
                      event.currentTarget.src = logoUrl;
                    }}
                  />
                  <div className="home-hero-swap-card__veil" />
                  <div className="home-hero-swap-card__content">
                    <span>{index === 0 ? 'Sorotan utama' : card.source}</span>
                    <h3>{card.title}</h3>
                    <p>{card.description}</p>
                  </div>
                </Card>
              ))}
            </CardSwap>
          </div>
        </motion.div>
      </div>
      {slides.length > 1 && (
        <div className="home-hero__dots" aria-label="Pilih slide utama">
          {slides.map((slide, index) => (
            <button
              key={slide.id || index}
              type="button"
              aria-label={`Tampilkan cerita ${index + 1}`}
              aria-current={currentSlide === index}
              onClick={() => setCurrentSlide(index)}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default HeroSection;
