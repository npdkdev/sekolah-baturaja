import {
  announceWebsiteContentUpdate,
  fetchWebsiteContentMap,
  saveWebsiteContentItem,
} from '@/lib/publicContentAdapters';

export const CONTACT_PAGE_KEY = 'contact_page';

export const DEFAULT_CONTACT_CONTENT = Object.freeze({
  heroEyebrow: 'Hubungi sekolah',
  heroTitle: 'Pintu kantor',
  heroAccent: 'selalu terbuka.',
  heroDescription: 'Tata usaha menjawab telepon dan surel pada hari kerja. Untuk urusan yang perlu bertemu langsung, kunjungan orang tua dibuka setiap Rabu pukul 09.00.',
  formEyebrow: 'Formulir pesan',
  formTitle: 'Tulis pesan untuk sekolah',
  formDescription: 'Pesan masuk ke surel tata usaha dan dibalas paling lambat dua hari kerja.',
  formRoleLabel: 'Saya menghubungi sebagai',
  nameLabel: 'Nama lengkap',
  namePlaceholder: 'Nama Anda',
  contactLabel: 'Nomor telepon atau surel',
  contactPlaceholder: '08xx atau nama@surel.id',
  topicLabel: 'Topik',
  messageLabel: 'Pesan',
  messagePlaceholder: 'Tuliskan pertanyaan atau keperluan Anda',
  submitLabel: 'Kirim pesan',
  formReadyHint: 'Semua kolom sudah terisi.',
  formValidationHint: 'Isi nama, kontak, dan pesan minimal sepuluh karakter.',
  successTitle: 'Pesan Anda tercatat',
  successDescription: 'Terima kasih, {name}. Tata usaha akan membalas ke {contact} paling lambat dua hari kerja. Nomor catatan pesan Anda {ticket}.',
  newMessageLabel: 'Tulis pesan lain',
  enrollmentButtonLabel: 'Buka formulir SPMB',
  mapButtonLabel: 'Buka peta',
  copyAddressLabel: 'Salin alamat',
  serviceHoursTitle: 'Jam layanan',
  serviceHoursSubtitle: 'Waktu setempat',
  directoryEyebrow: 'Narahubung',
  directoryTitle: 'Hubungi',
  directoryAccent: 'orang yang tepat',
  directoryDescription: 'Setiap urusan punya penanggung jawab. Menghubungi langsung akan lebih cepat daripada lewat nomor umum.',
  visitEyebrow: 'Kunjungan sekolah',
  visitTitle: 'Datang saja hari Rabu pukul sembilan.',
  visitDescription: 'Kabari tata usaha sehari sebelumnya, dan seorang guru akan menemani Anda berkeliling kelas, perpustakaan, serta kebun sekolah.',
  visitButtonLabel: 'Jadwalkan kunjungan',
  galleryButtonLabel: 'Lihat galeri dulu',
  openStatusText: 'Kantor sedang buka sekarang',
  closedStatusText: 'Kantor sedang tutup, pesan tetap masuk',
  phoneChipLabel: 'Telepon kantor',
  emailChipLabel: 'Surel resmi',
  whatsappChipLabel: 'WhatsApp tata usaha',
  hoursChipLabel: 'Jam layanan',
  chipActionLabel: 'Ketuk untuk menyalin',
  hours: [
    { day: 'Senin', time: '07.30–15.00', dayIndex: [1] },
    { day: 'Selasa', time: '07.30–15.00', dayIndex: [2] },
    { day: 'Rabu', time: '07.30–15.00', dayIndex: [3] },
    { day: 'Kamis', time: '07.30–15.00', dayIndex: [4] },
    { day: 'Jumat', time: '07.30–11.30', dayIndex: [5] },
    { day: 'Sabtu & Minggu', time: 'Tutup', dayIndex: [0, 6] },
  ],
  roles: ['Orang tua murid', 'Calon orang tua', 'Alumni', 'Instansi lain'],
  topics: ['Pendaftaran murid baru', 'Administrasi dan surat', 'Kegiatan dan ekstrakurikuler', 'Kunjungan sekolah', 'Saran atau keluhan', 'Lainnya'],
});

const scalarKeys = Object.keys(DEFAULT_CONTACT_CONTENT).filter((key) => !['hours', 'roles', 'topics'].includes(key));

const normalizeString = (value, fallback) => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

const normalizeOptions = (value, fallback) => {
  const values = Array.isArray(value) ? value : fallback;
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
};

const normalizeDayIndexes = (value, fallback) => {
  const values = Array.isArray(value) ? value : fallback;
  return [...new Set(values.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6))];
};

const normalizeHours = (value) => {
  const source = Array.isArray(value) && value.length > 0 ? value : DEFAULT_CONTACT_CONTENT.hours;
  return source.map((item, index) => {
    const fallback = DEFAULT_CONTACT_CONTENT.hours[index] || { day: `Hari ${index + 1}`, time: 'Tutup', dayIndex: [] };
    return {
      day: normalizeString(item?.day, fallback.day),
      time: normalizeString(item?.time, fallback.time),
      dayIndex: normalizeDayIndexes(item?.dayIndex, fallback.dayIndex),
    };
  }).filter((item) => item.day);
};

export const normalizeContactContent = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = {};
  scalarKeys.forEach((key) => {
    normalized[key] = normalizeString(source[key], DEFAULT_CONTACT_CONTENT[key]);
  });
  normalized.hours = normalizeHours(source.hours);
  normalized.roles = normalizeOptions(source.roles, DEFAULT_CONTACT_CONTENT.roles);
  normalized.topics = normalizeOptions(source.topics, DEFAULT_CONTACT_CONTENT.topics);
  return normalized;
};

export const validateContactContent = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = normalizeContactContent(value);
  const required = [
    ['heroTitle', 'Judul utama Kontak'],
    ['heroAccent', 'Aksen judul Kontak'],
    ['heroDescription', 'Deskripsi pembuka Kontak'],
    ['formTitle', 'Judul formulir Kontak'],
    ['formDescription', 'Deskripsi formulir Kontak'],
    ['visitTitle', 'Judul ajakan kunjungan'],
  ];
  const missing = required.find(([key]) => Object.prototype.hasOwnProperty.call(source, key) && !String(source[key] ?? '').trim());
  if (missing) throw new Error(`${missing[1]} wajib diisi.`);
  if (normalized.roles.length === 0) throw new Error('Minimal satu pilihan peran harus tersedia.');
  if (normalized.topics.length === 0) throw new Error('Minimal satu topik harus tersedia.');
  if (normalized.hours.length === 0) throw new Error('Minimal satu jadwal layanan harus tersedia.');
  return normalized;
};

export const fetchContactContent = async () => {
  const map = await fetchWebsiteContentMap({ keys: [CONTACT_PAGE_KEY] });
  return normalizeContactContent(map?.[CONTACT_PAGE_KEY]);
};

export const saveContactContent = async (value) => {
  const normalized = validateContactContent(value);
  await saveWebsiteContentItem({ key: CONTACT_PAGE_KEY, content: normalized, isPublic: true });
  announceWebsiteContentUpdate([CONTACT_PAGE_KEY]);
  return normalized;
};

const parseClock = (value) => {
  const match = String(value || '').match(/(\d{1,2})[.:](\d{2})\s*[–—-]\s*(\d{1,2})[.:](\d{2})/);
  if (!match) return null;
  return { start: Number(match[1]) * 60 + Number(match[2]), end: Number(match[3]) * 60 + Number(match[4]) };
};

export const isContactOfficeOpen = (hours, now = new Date()) => {
  const today = Number(now.getDay());
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const row = (hours || []).find((item) => Array.isArray(item.dayIndex) && item.dayIndex.includes(today));
  const clock = parseClock(row?.time);
  return Boolean(clock && currentMinutes >= clock.start && currentMinutes < clock.end);
};
