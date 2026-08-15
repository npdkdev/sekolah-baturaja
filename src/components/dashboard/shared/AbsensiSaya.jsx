import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Clock, Info, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import AttendanceStatusIcon from '@/components/dashboard/shared/AttendanceStatusIcon';
import {
  fetchAttendance,
  fetchCalendarContext,
  getAttendanceErrorMessage,
  getLocalDateString,
} from '@/lib/attendanceAdapters';
import { getActiveCalendarDates, isCalendarDateActive } from '@/lib/calendarUtils';

/**
 * Absensi pribadi dalam mode baca saja.
 *
 * Semua pencatatan tetap lewat satu pintu: halaman Absensi Digital dengan RFID.
 * Panel ini tidak pernah menulis — tidak ada create, update, maupun hapus di
 * sini. Koreksi absensi adalah wewenang admin lewat panel rekap, dan sejak
 * `AttendanceHandler.Update`/`MarkAbsent` dijaga `middleware.CanManage`, guru
 * yang mencoba menulis akan ditolak backend, bukan sekadar disembunyikan
 * tombolnya.
 *
 * Backend juga menyaring `GET /api/attendance` berdasarkan akun pemanggil, jadi
 * guru hanya menerima baris absensi guru miliknya sendiri.
 */

const RIWAYAT_TAMPIL = 7;

const awalBulanIni = () => {
  const now = new Date();
  return getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
};

const akhirBulanIni = () => {
  const now = new Date();
  return getLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));
};

const jamDari = (row) => {
  if (row?.check_in_time) return String(row.check_in_time).slice(0, 5);
  if (row?.check_in_timestamp) {
    return new Date(row.check_in_timestamp).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return null;
};

const tanggalPanjang = (dateStr) => {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  if (!y || !m || !d) return dateStr || '-';
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

const AbsensiSaya = ({ userId, title = 'Absensi Saya' }) => {
  const [rows, setRows] = useState([]);
  const [calendarContext, setCalendarContext] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const muat = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const dateFrom = awalBulanIni();
      const dateTo = akhirBulanIni();
      const [daftar, konteks] = await Promise.all([
        fetchAttendance({ user_id: userId, role: 'guru', date_from: dateFrom, date_to: dateTo, limit: 200 }),
        fetchCalendarContext(dateFrom, dateTo).catch(() => null),
      ]);
      setRows(Array.isArray(daftar) ? daftar : []);
      setCalendarContext(konteks);
    } catch (err) {
      setError(getAttendanceErrorMessage(err));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => { muat(); }, [muat]);

  const todayStr = getLocalDateString();

  const hariIni = useMemo(
    () => rows.find((row) => String(row.attendance_date || '').split('T')[0] === todayStr) || null,
    [rows, todayStr],
  );

  // Hari libur kalender akademik bukan "belum absen" — bedakan keduanya supaya
  // guru tidak mengira ada absensi yang terlewat.
  const hariAktif = useMemo(() => {
    if (!calendarContext) return null;
    return isCalendarDateActive({ dateString: todayStr, ...calendarContext });
  }, [calendarContext, todayStr]);

  const rekap = useMemo(() => {
    const hadir = new Set();
    const terlambat = new Set();
    rows.forEach((row) => {
      const tanggal = String(row.attendance_date || '').split('T')[0];
      if (!tanggal) return;
      if (row.status === 'Terlambat') {
        terlambat.add(tanggal);
        hadir.delete(tanggal);
        return;
      }
      if (!terlambat.has(tanggal) && ['Hadir', 'Tepat Waktu'].includes(row.status)) {
        hadir.add(tanggal);
      }
    });

    // Hari tidak hadir dihitung dari hari aktif kalender sampai hari ini saja,
    // bukan seluruh bulan — sisa bulan belum terjadi.
    let tidakHadir = 0;
    if (calendarContext) {
      const hariAktifSampaiKini = getActiveCalendarDates({
        startDate: awalBulanIni(),
        endDate: akhirBulanIni(),
        throughDate: new Date(),
        ...calendarContext,
      });
      const tercatat = new Set([...hadir, ...terlambat]);
      tidakHadir = Math.max(hariAktifSampaiKini.length - tercatat.size, 0);
    }

    return { hadir: hadir.size, terlambat: terlambat.size, tidakHadir };
  }, [rows, calendarContext]);

  const riwayat = useMemo(() => (
    [...rows]
      .sort((a, b) => String(b.attendance_date || '').localeCompare(String(a.attendance_date || '')))
      .slice(0, RIWAYAT_TAMPIL)
  ), [rows]);

  if (isLoading) {
    return (
      <section className="admin-card space-y-3 p-4" aria-busy="true">
        <Skeleton className="h-6 w-48 admin-skeleton-shimmer" />
        <Skeleton className="h-24 rounded-xl admin-skeleton-shimmer" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-xl admin-skeleton-shimmer" />
        ))}
      </section>
    );
  }

  return (
    <section className="admin-card space-y-4 p-4" aria-labelledby="absensi-saya">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="admin-panel-header-icon"><CalendarCheck /></div>
          <div>
            <h3 id="absensi-saya" className="text-lg font-bold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">
              Tercatat otomatis dari kartu RFID di halaman Absensi Digital
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={muat}>
          <RefreshCw className="mr-2 h-4 w-4" /> Muat ulang
        </Button>
      </div>

      {error && (
        <div className="admin-error-state" role="alert">
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {!error && (
        <>
          {/* Status hari ini */}
          <div className="rounded-xl border bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {tanggalPanjang(todayStr)}
            </p>
            {hariIni ? (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <AttendanceStatusIcon status={hariIni.status} className="h-8 w-8 pointer-events-none" />
                <div>
                  <p className="text-base font-bold text-foreground">
                    {hariIni.status === 'Hadir' ? 'Tepat Waktu' : hariIni.status}
                  </p>
                  {jamDari(hariIni) && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      Check-in {jamDari(hariIni)}
                      {hariIni.sesi ? ` · sesi ${hariIni.sesi}` : ''}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {hariAktif === false
                  ? 'Hari ini bukan hari aktif pada kalender akademik, jadi tidak ada absensi yang dijadwalkan.'
                  : 'Belum ada absensi hari ini. Tap kartu RFID di halaman Absensi Digital untuk mencatatnya.'}
              </p>
            )}
          </div>

          {/* Rekap bulan berjalan */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Hadir', value: rekap.hadir },
              { label: 'Terlambat', value: rekap.terlambat },
              { label: 'Tidak Hadir', value: rekap.tidakHadir },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border bg-muted/40 p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Riwayat terakhir */}
          <div>
            <h4 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Riwayat terakhir
            </h4>
            {riwayat.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Belum ada absensi yang tercatat bulan ini.
              </p>
            ) : (
              <ul className="space-y-2">
                {riwayat.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {tanggalPanjang(String(row.attendance_date || '').split('T')[0])}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {jamDari(row) ? `Check-in ${jamDari(row)}` : 'Tanpa waktu check-in'}
                        {row.sesi ? ` · sesi ${row.sesi}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {row.status === 'Hadir' ? 'Tepat Waktu' : row.status}
                      </span>
                      <AttendanceStatusIcon status={row.status} className="h-6 w-6 pointer-events-none" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Data ini hanya dapat dibaca. Bila ada catatan yang keliru, ajukan koreksi ke admin
            melalui panel Rekap Absensi.
          </p>
        </>
      )}
    </section>
  );
};

export default AbsensiSaya;
