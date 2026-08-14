import React, { useEffect, useState } from 'react';
import { Loader2, Phone, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import {
  DEFAULT_CONTACT_CONTENT,
  fetchContactContent,
  saveContactContent,
} from '@/lib/contactContent';
import { getPublicContentErrorMessage } from '@/lib/publicContentAdapters';

const scalarFields = [
  { key: 'heroEyebrow', label: 'Label kecil hero' },
  { key: 'heroTitle', label: 'Judul utama' },
  { key: 'heroAccent', label: 'Aksen judul' },
  { key: 'formEyebrow', label: 'Label formulir' },
  { key: 'formTitle', label: 'Judul formulir' },
  { key: 'formRoleLabel', label: 'Label pilihan peran' },
  { key: 'nameLabel', label: 'Label nama' },
  { key: 'namePlaceholder', label: 'Placeholder nama' },
  { key: 'contactLabel', label: 'Label kontak' },
  { key: 'contactPlaceholder', label: 'Placeholder kontak' },
  { key: 'topicLabel', label: 'Label topik' },
  { key: 'messageLabel', label: 'Label pesan' },
  { key: 'submitLabel', label: 'Teks tombol kirim' },
  { key: 'successTitle', label: 'Judul pesan berhasil' },
  { key: 'newMessageLabel', label: 'Teks tombol pesan baru' },
  { key: 'enrollmentButtonLabel', label: 'Teks tombol SPMB' },
  { key: 'mapButtonLabel', label: 'Teks tombol peta' },
  { key: 'copyAddressLabel', label: 'Teks tombol salin alamat' },
  { key: 'serviceHoursTitle', label: 'Judul jam layanan' },
  { key: 'serviceHoursSubtitle', label: 'Subjudul jam layanan' },
  { key: 'directoryEyebrow', label: 'Label narahubung' },
  { key: 'directoryTitle', label: 'Judul narahubung' },
  { key: 'directoryAccent', label: 'Aksen judul narahubung' },
  { key: 'visitEyebrow', label: 'Label kunjungan' },
  { key: 'visitTitle', label: 'Judul ajakan kunjungan' },
  { key: 'visitButtonLabel', label: 'Teks tombol kunjungan' },
  { key: 'galleryButtonLabel', label: 'Teks tombol galeri' },
];

const areaFields = [
  { key: 'heroDescription', label: 'Deskripsi pembuka', rows: 4 },
  { key: 'formDescription', label: 'Deskripsi formulir', rows: 3 },
  { key: 'messagePlaceholder', label: 'Placeholder pesan', rows: 2 },
  { key: 'formReadyHint', label: 'Bantuan saat formulir lengkap', rows: 2 },
  { key: 'formValidationHint', label: 'Bantuan saat formulir belum lengkap', rows: 2 },
  { key: 'successDescription', label: 'Pesan berhasil terkirim', rows: 3, hint: 'Gunakan {name}, {contact}, dan {ticket} untuk nilai dinamis.' },
  { key: 'directoryDescription', label: 'Deskripsi narahubung', rows: 3 },
  { key: 'visitDescription', label: 'Deskripsi ajakan kunjungan', rows: 3 },
];

const cloneDefaults = () => JSON.parse(JSON.stringify(DEFAULT_CONTACT_CONTENT));

const ContactTextField = ({ field, value, onChange }) => (
  <div className="admin-edit-field">
    <label htmlFor={`contact-${field.key}`}>{field.label}</label>
    <Input id={`contact-${field.key}`} value={value ?? ''} onChange={(event) => onChange(field.key, event.target.value)} />
    {field.hint && <p className="mt-1 text-xs text-muted-foreground">{field.hint}</p>}
  </div>
);

const ContactAreaField = ({ field, value, onChange }) => (
  <div className="admin-edit-field">
    <label htmlFor={`contact-${field.key}`}>{field.label}</label>
    <Textarea id={`contact-${field.key}`} rows={field.rows} value={value ?? ''} onChange={(event) => onChange(field.key, event.target.value)} />
    {field.hint && <p className="mt-1 text-xs text-muted-foreground">{field.hint}</p>}
  </div>
);

const ContactContentSettings = () => {
  const [form, setForm] = useState(cloneDefaults);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await fetchContactContent();
        if (active) setForm(stored);
      } catch (error) {
        if (active) setLoadError(getPublicContentErrorMessage(error));
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const setField = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));

  const updateList = (key, index, value) => setForm((previous) => ({
    ...previous,
    [key]: previous[key].map((item, itemIndex) => (itemIndex === index ? value : item)),
  }));

  const addListItem = (key) => setForm((previous) => ({ ...previous, [key]: [...previous[key], ''] }));

  const removeListItem = (key, index) => setForm((previous) => ({
    ...previous,
    [key]: previous[key].filter((_, itemIndex) => itemIndex !== index),
  }));

  const updateHour = (index, field, value) => setForm((previous) => ({
    ...previous,
    hours: previous.hours.map((hour, hourIndex) => (hourIndex === index ? { ...hour, [field]: value } : hour)),
  }));

  const addHour = () => setForm((previous) => ({
    ...previous,
    hours: [...previous.hours, { day: '', time: 'Tutup', dayIndex: [] }],
  }));

  const removeHour = (index) => setForm((previous) => ({
    ...previous,
    hours: previous.hours.filter((_, hourIndex) => hourIndex !== index),
  }));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saved = await saveContactContent(form);
      setForm(saved);
      setLoadError(null);
      toast({ title: 'Konten Kontak tersimpan', description: 'Perubahan akan dipakai halaman publik setelah disimpan.' });
    } catch (error) {
      toast({ title: 'Gagal menyimpan Konten Kontak', description: getPublicContentErrorMessage(error), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setForm(cloneDefaults());
    toast({ title: 'Kembali ke bawaan', description: 'Belum tersimpan — tekan Simpan Konten Kontak bila diperlukan.' });
  };

  if (isLoading) {
    return (
      <section className="space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-72 admin-skeleton-shimmer" />
        {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-xl admin-skeleton-shimmer" />)}
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-lg border bg-muted/20 p-4 sm:p-6" aria-labelledby="konten-halaman-kontak">
      <div className="flex flex-col gap-4 border-b pb-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="admin-panel-header-icon"><Phone aria-hidden="true" /></div>
          <div>
            <h4 id="konten-halaman-kontak" className="text-xl font-black text-foreground sm:text-2xl">Konten Halaman Kontak</h4>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Atur narasi, formulir, jadwal layanan, pilihan topik, dan ajakan kunjungan. Nomor telepon,
              alamat, email, peta, dan staf tetap mengambil data dari sumber masing-masing.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="mr-2 h-4 w-4" /> Kembalikan bawaan
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {isSaving ? 'Menyimpan…' : 'Simpan Konten Kontak'}
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="admin-error-state" role="alert">
          <p className="text-sm font-medium">Gagal memuat konten tersimpan: {loadError}</p>
          <p className="text-xs">Nilai bawaan tetap ditampilkan. Simpan setelah memastikan isinya benar.</p>
        </div>
      )}

      <div className="space-y-4">
        <h5 className="font-bold text-foreground">Hero dan formulir</h5>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {scalarFields.slice(0, 14).map((field) => <ContactTextField key={field.key} field={field} value={form[field.key]} onChange={setField} />)}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {areaFields.slice(0, 6).map((field) => <ContactAreaField key={field.key} field={field} value={form[field.key]} onChange={setField} />)}
        </div>
      </div>

      <div className="space-y-4 border-t pt-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h5 className="font-bold text-foreground">Pilihan formulir</h5>
            <p className="text-xs text-muted-foreground">Satu pilihan per baris. Pilihan ini ikut tersimpan di setiap pesan masuk.</p>
          </div>
        </div>
        {['roles', 'topics'].map((key) => (
          <div key={key} className="space-y-2">
            <div className="flex items-center justify-between">
              <h6 className="text-sm font-bold">{key === 'roles' ? 'Peran pengunjung' : 'Topik pesan'}</h6>
              <Button type="button" size="sm" variant="outline" onClick={() => addListItem(key)}><Plus className="mr-1 h-4 w-4" /> Tambah</Button>
            </div>
            {(form[key] || []).map((item, index) => (
              <div key={`${key}-${index}`} className="flex items-center gap-2">
                <Input value={item} aria-label={`${key === 'roles' ? 'Peran' : 'Topik'} ${index + 1}`} onChange={(event) => updateList(key, index, event.target.value)} />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeListItem(key, index)} aria-label={`Hapus pilihan ${index + 1}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="space-y-4 border-t pt-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h5 className="font-bold text-foreground">Jam layanan</h5>
            <p className="text-xs text-muted-foreground">Waktu dipakai untuk tabel publik. Hari mengikuti indeks bawaan agar status buka/tutup tetap akurat.</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addHour}><Plus className="mr-1 h-4 w-4" /> Tambah</Button>
        </div>
        <div className="space-y-3">
          {(form.hours || []).map((hour, index) => (
            <div key={`hour-${index}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 rounded-lg border bg-background p-3">
              <div className="admin-edit-field"><label htmlFor={`contact-hour-day-${index}`}>Hari / keterangan</label><Input id={`contact-hour-day-${index}`} value={hour.day} onChange={(event) => updateHour(index, 'day', event.target.value)} /></div>
              <div className="admin-edit-field"><label htmlFor={`contact-hour-time-${index}`}>Waktu</label><Input id={`contact-hour-time-${index}`} value={hour.time} placeholder="07.30–15.00" onChange={(event) => updateHour(index, 'time', event.target.value)} /></div>
              <Button type="button" variant="ghost" size="icon" onClick={() => removeHour(index)} aria-label={`Hapus jadwal ${index + 1}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 border-t pt-6">
        <h5 className="font-bold text-foreground">Narahubung dan kunjungan</h5>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {scalarFields.slice(14).map((field) => <ContactTextField key={field.key} field={field} value={form[field.key]} onChange={setField} />)}
          {areaFields.slice(6).map((field) => <ContactAreaField key={field.key} field={field} value={form[field.key]} onChange={setField} />)}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {['openStatusText', 'closedStatusText', 'phoneChipLabel', 'emailChipLabel', 'whatsappChipLabel', 'hoursChipLabel', 'chipActionLabel'].map((key) => (
            <ContactTextField key={key} field={{ key, label: key.replace(/([A-Z])/g, ' $1') }} value={form[key]} onChange={setField} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default ContactContentSettings;
