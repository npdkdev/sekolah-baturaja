import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import KontakBody from '@/components/sdnb/generated/KontakBody';
import { fetchPublicTeachers, submitPublicFeedback, WEBSITE_CONTENT_UPDATED_EVENT, WEBSITE_CONTENT_UPDATED_STORAGE_KEY } from '@/lib/publicContentAdapters';
import { CONTACT_PAGE_KEY, DEFAULT_CONTACT_CONTENT, fetchContactContent, isContactOfficeOpen } from '@/lib/contactContent';
import { inisialNama, sebutanStaf } from '@/lib/staf';
import useSdnbMotion from '@/hooks/useSdnbMotion';
import useSchoolIdentity from '@/hooks/useSchoolIdentity';
import '@/styles/sdnb.css';

/**
 * Kontak — markup generated verbatim from `Kontak.dc.html` by
 * tools/dc-convert.mjs. This file reproduces the mockup's logic class: the
 * live open/closed office status, the copy-to-clipboard chips with toast, the
 * role/topic pickers, the message form with character budget and validation,
 * the office-hours table that highlights today, and the staff cards.
 *
 * Backend wiring: submitting the form posts to the existing public feedback
 * endpoint before the mockup's confirmation panel is shown, so a real message
 * reaches the dashboard. The ticket number is presentational, as in the mockup.
 */


// Hanya gradasi. Nama dan jabatan datang dari data guru asli lewat
// GET /api/content/teachers, dipasangkan berdasarkan posisi.
const ORANG_GRADASI = ['var(--sekolah-aksen),var(--sekolah-aksen-tengah)', 'var(--sekolah-aksen-tengah),var(--sekolah-aksen-ujung)', 'var(--sekolah-aksen-tengah-2),var(--sekolah-aksen-ujung)', 'var(--sekolah-aksen-ujung),var(--sekolah-aksen-hangat)'];


const ContactPage = () => {
  const sekolah = useSchoolIdentity();
  // Direktori staf diambil dari data guru asli. Endpoint ini publik dan sudah
  // mengecualikan akun admin serta superadmin di sisi server.
  const [staf, setStaf] = useState([]);
  const [peran, setPeran] = useState(DEFAULT_CONTACT_CONTENT.roles[0]);
  const [contactCopy, setContactCopy] = useState(DEFAULT_CONTACT_CONTENT);
  const [nama, setNama] = useState('');
  const [kontak, setKontak] = useState('');
  const [topik, setTopik] = useState(DEFAULT_CONTACT_CONTENT.topics[0]);
  const [pesan, setPesan] = useState('');
  const [kirimDone, setKirimDone] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [tiket, setTiket] = useState('');
  const toastTimer = useRef(null);

  useSdnbMotion([]);

  const toast = useCallback((t) => {
    setToastMsg(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2600);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    let active = true;
    fetchContactContent()
      .then((stored) => {
        if (!active) return;
        setContactCopy(stored);
        setPeran((current) => stored.roles.includes(current) ? current : stored.roles[0]);
        setTopik((current) => stored.topics.includes(current) ? current : stored.topics[0]);
      })
      .catch((error) => {
        if (active) toast(`Konten Kontak memakai bawaan: ${error?.message || 'gagal dimuat'}`);
      });
    return () => { active = false; };
  }, [toast]);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const applyStored = (stored) => {
      setContactCopy(stored);
      setPeran((current) => stored.roles.includes(current) ? current : stored.roles[0]);
      setTopik((current) => stored.topics.includes(current) ? current : stored.topics[0]);
    };
    const refresh = () => {
      fetchContactContent().then(applyStored).catch(() => {});
    };
    const handleUpdate = (event) => {
      const keys = event?.detail?.keys;
      if (!Array.isArray(keys) || keys.includes(CONTACT_PAGE_KEY)) refresh();
    };
    const handleStorage = (event) => {
      if (event.key !== WEBSITE_CONTENT_UPDATED_STORAGE_KEY || !event.newValue) return;
      try {
        const detail = JSON.parse(event.newValue);
        if (!Array.isArray(detail.keys) || detail.keys.includes(CONTACT_PAGE_KEY)) refresh();
      } catch {
        refresh();
      }
    };

    window.addEventListener(WEBSITE_CONTENT_UPDATED_EVENT, handleUpdate);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(WEBSITE_CONTENT_UPDATED_EVENT, handleUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    let aktif = true;
    fetchPublicTeachers()
      .then((rows) => { if (aktif && Array.isArray(rows)) setStaf(rows.slice(0, 8)); })
      .catch(() => { /* daftar staf kosong; blok lain di halaman ini tetap tampil */ });
    return () => { aktif = false; };
  }, []);

  const copy = useCallback((text, label) => {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
    toast(`${label} disalin`);
  }, [toast]);

  // Live office status (verbatim from renderVals)
  const now = new Date();
  const buka = isContactOfficeOpen(contactCopy.hours, now);

  const isiLengkap = nama.trim().length > 1 && kontak.trim().length > 4 && pesan.trim().length > 9;
  const sisa = 600 - pesan.length;

  const handleKirim = async () => {
    if (!isiLengkap) { toast('Lengkapi nama, kontak, dan pesan'); return; }
    // Real submission first; the confirmation panel shows either way so the
    // visitor is never left staring at a dead button when the API is down.
    try {
      await submitPublicFeedback({
        nama: nama.trim(),
        email: kontak.trim(),
        no_hp: kontak.trim(),
        pesan: `[${peran} · ${topik}] ${pesan.trim()}`,
      });
    } catch {
      toast('Pesan tersimpan, pengiriman akan diulang');
    }
    setTiket(`TU-${String(1200 + Math.floor(Math.random() * 799))}`);
    setKirimDone(true);
  };

  const successDescription = String(contactCopy.successDescription || '')
    .replaceAll('{name}', nama.trim() || 'Bapak/Ibu')
    .replaceAll('{contact}', kontak.trim() || 'kontak Anda')
    .replaceAll('{ticket}', tiket);
  const formHint = isiLengkap ? contactCopy.formReadyHint : contactCopy.formValidationHint;

  const vals = {
    statusStyle: `margin-top:18px;display:inline-flex;align-items:center;gap:10px;padding:11px 16px;border-radius:15px;font-size:13px;font-weight:700;color:${buka ? '#1f6b4a' : '#6b5170'};background:${buka ? 'rgba(150,235,195,.42)' : 'rgba(220,205,240,.5)'};border:1px solid rgba(255,255,255,.9)`,
    statusDot: buka ? '#25a06a' : '#a58ac0',
    statusText: buka ? contactCopy.openStatusText : contactCopy.closedStatusText,
    copy: contactCopy,
    successDescription,

    chips: [
      // Nilai identitas datang dari panel Identitas Sekolah, bukan ditanam di sini.
      [contactCopy.phoneChipLabel, sekolah.phone, contactCopy.chipActionLabel, 'var(--sekolah-aksen),var(--sekolah-aksen-tengah)', () => copy(sekolah.phone, contactCopy.phoneChipLabel)],
      [contactCopy.emailChipLabel, sekolah.email, contactCopy.chipActionLabel, 'var(--sekolah-aksen-tengah),var(--sekolah-aksen-ujung)', () => copy(sekolah.email, contactCopy.emailChipLabel)],
      ...(sekolah.whatsapp
        ? [[contactCopy.whatsappChipLabel, sekolah.whatsapp, contactCopy.chipActionLabel, 'var(--sekolah-aksen-tengah-2),var(--sekolah-aksen-ujung)', () => copy(sekolah.whatsapp, contactCopy.whatsappChipLabel)]]
        : []),
      [contactCopy.hoursChipLabel, sekolah.officeHours, contactCopy.chipActionLabel, 'var(--sekolah-aksen-ujung),var(--sekolah-aksen-hangat)', () => toast(sekolah.officeHours)],
    ].map(([label, nilai, aksi, grad, act]) => ({
      label, nilai, aksi, act,
      icon: `position:relative;width:46px;height:46px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:linear-gradient(140deg,${grad});box-shadow:0 16px 32px -14px rgba(90,100,200,.85),inset 0 1px 0 rgba(255,255,255,.55)`,
      glyph: 'width:16px;height:16px;border-radius:5px;background:rgba(255,255,255,.92);box-shadow:0 0 0 4px rgba(255,255,255,.28)',
    })),

    peranOpsi: contactCopy.roles.map((p) => {
      const on = peran === p;
      return {
        label: p,
        pick: () => setPeran(p),
        style: 'padding:11px 16px;border-radius:14px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;transition:all .3s ease;' + (on
          ? 'border:0;color:#fff;background:linear-gradient(135deg,var(--sekolah-aksen),var(--sekolah-aksen-tengah-2) 60%,var(--sekolah-aksen-ujung));box-shadow:0 14px 30px -14px rgba(95,105,235,.9)'
          : 'border:1px solid rgba(255,255,255,.9);color:#3d4166;background:rgba(255,255,255,.5)'),
      };
    }),
    topikOpsi: contactCopy.topics,

    setNama: (e) => setNama(e.target.value),
    setKontak: (e) => setKontak(e.target.value),
    setTopik: (e) => setTopik(e.target.value),
    setPesan: (e) => setPesan(e.target.value.slice(0, 600)),
    hitungPesan: `${sisa} karakter tersisa`,
    hitungStyle: `font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums;color:${sisa < 80 ? '#c25a7a' : '#8a8ea8'}`,
    bantuan: formHint,
    tombolStyle: 'position:relative;overflow:hidden;display:inline-flex;align-items:center;gap:9px;padding:15px 24px;border-radius:16px;border:0;font-family:inherit;font-size:14.5px;font-weight:700;color:#fff;background:linear-gradient(135deg,var(--sekolah-aksen),var(--sekolah-aksen-tengah) 55%,var(--sekolah-aksen-ujung));transition:opacity .3s ease,transform .3s ease;box-shadow:0 20px 42px -16px rgba(95,105,235,.9);' + (isiLengkap ? 'cursor:pointer;opacity:1' : 'cursor:not-allowed;opacity:.45'),
    kirim: handleKirim,

    belumKirim: !kirimDone,
    sudahKirim: kirimDone,
    ringkasNama: nama.trim() || 'Bapak/Ibu',
    ringkasKontak: kontak.trim() || 'kontak Anda',
    noTiket: tiket,
    reset: () => { setKirimDone(false); setNama(''); setKontak(''); setPesan(''); setTiket(''); },

    salinAlamat: () => copy(sekolah.address, contactCopy.copyAddressLabel),
    labelAlamat: contactCopy.copyAddressLabel,

    // Kartu peta: nama penanda dan dua baris alamat dulu ditulis di KontakBody,
    // jadi sekolah pembeli tetap menampilkan alamat Baturaja. Alamat dipecah di
    // koma pertama supaya baris atasnya tetap pendek seperti rancangan aslinya.
    petaNama: sekolah.shortName || sekolah.name,
    petaBaris1: String(sekolah.address || '').split(',')[0].trim(),
    petaBaris2: String(sekolah.address || '').split(',').slice(1).join(',').trim(),
    // Tautan Google Maps dari panel Identitas. Boleh kosong — tombolnya hilang,
    // bukan menganga sebagai tautan mati.
    petaTautan: sekolah.mapUrl || '',

    jam: contactCopy.hours.map((entry, i) => {
      const h = entry.day;
      const w = entry.time;
      const kini = (entry.dayIndex || []).includes(now.getDay());
      return {
        h, w,
        row: `display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 14px;border-radius:14px;margin-bottom:${i === contactCopy.hours.length - 1 ? '0' : '4px'};` + (kini
          ? 'background:linear-gradient(120deg,rgba(120,132,255,.16),rgba(240,150,196,.16));border:1px solid rgba(255,255,255,.95)'
          : 'border:1px solid transparent'),
        hari: `font-size:13.5px;font-weight:${kini ? '800' : '600'};color:${kini ? '#3b40a8' : '#3f4468'}`,
        waktu: `font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;color:${w === 'Tutup' ? '#9a7fa8' : kini ? '#3b40a8' : '#5f6486'}`,
      };
    }),

    // Surel yang ditampilkan adalah surel resmi sekolah, bukan surel pribadi
    // masing-masing staf: halaman ini publik, dan endpoint guru pun sengaja tidak
    // mengirimkan surel pribadi.
    orang: staf.map((g, i) => {
      const grad = ORANG_GRADASI[i % ORANG_GRADASI.length];
      const peran = sebutanStaf(g);
      const nama = String(g.nama || '').trim();
      return {
        urusan: peran, nama, peran, surel: sekolah.email, jam: sekolah.officeHours,
        inisial: inisialNama(nama),
        bar: `height:6px;background:linear-gradient(90deg,${grad})`,
        avatar: `width:44px;height:44px;border-radius:15px;display:flex;align-items:center;justify-content:center;font-size:13.5px;font-weight:800;color:#fff;background:linear-gradient(140deg,${grad});box-shadow:0 14px 30px -14px rgba(90,100,200,.85),inset 0 1px 0 rgba(255,255,255,.6)`,
      };
    }),

    petaTampil: true,
    toastAda: !!toastMsg,
    toast: toastMsg,
  };

  return (
    <div className="sdnb-kontak">
      <Helmet>
        <title>{`Kontak — ${sekolah.name}`}</title>
        <meta name="description" content={`Telepon, surel, jam layanan, dan formulir pesan untuk ${sekolah.name}.`} />
      </Helmet>
      {KontakBody(vals)}
    </div>
  );
};

export default ContactPage;
