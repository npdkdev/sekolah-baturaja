import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { buildJakartaTimestamp, formatTimestamp, determineAttendanceStatus, calculateTimeDifference } from '@/utils/AttendanceStatusLogic';
import AttendanceStatusIcon from './AttendanceStatusIcon';
import { useAuth } from '@/contexts/AuthContext';
import { canManageRole } from '@/lib/roles';
import { updateAttendance, createAttendance, markAttendanceAbsent } from '@/lib/attendanceAdapters';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Clock, Calendar, CheckCircle, XCircle } from 'lucide-react';

const AttendanceDetailsModal = ({ isOpen, onClose, details, onSuccess }) => {
  const { role } = useAuth();
  const { toast } = useToast();
  const [timeInput, setTimeInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Correcting attendance is a back-office act, mirroring CanManage on the Go
  // side. Guru reads their own record here but records are only ever written by
  // the RFID kiosk or corrected by admin/tata usaha from the recap panel.
  const isAuthorized = canManageRole(role);

  useEffect(() => {
    if (details) {
      if (details.status !== 'Tidak Hadir' && details.checkInTimestamp) {
        const d = new Date(details.checkInTimestamp);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        setTimeInput(`${hh}:${mm}:${ss}`);
      } else if (details.status === 'Tidak Hadir') {
        if (details.sessionStartTime) {
          const d = new Date(details.sessionStartTime);
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          const ss = String(d.getSeconds()).padStart(2, '0');
          setTimeInput(`${hh}:${mm}:${ss}`);
        } else {
          const now = new Date();
          const hh = String(now.getHours()).padStart(2, '0');
          const mm = String(now.getMinutes()).padStart(2, '0');
          const ss = String(now.getSeconds()).padStart(2, '0');
          setTimeInput(`${hh}:${mm}:${ss}`);
        }
      }
    }
  }, [details]);

  const handleConfirmAttendance = async () => {
    if (!isAuthorized) return;
    if (!timeInput) {
      toast({ title: 'Error', description: 'Waktu hadir harus diisi', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const attendanceDate = details.attendance_date || new Date().toLocaleDateString('en-CA');
      const checkInTimestamp = new Date(buildJakartaTimestamp(attendanceDate, timeInput)).toISOString();
      const newStatus = determineAttendanceStatus(checkInTimestamp, details.sessionStartTime);

      if (details.id && details.status !== 'Tidak Hadir') {
        await updateAttendance(details.id, {
          check_in_time: timeInput,
          check_in_timestamp: checkInTimestamp,
          status: newStatus
        });
        toast({ title: "Berhasil", description: "Waktu kehadiran berhasil diperbarui" });
      } else {
        const newAttendance = {
          user_id: details.user_id,
          role: details.user_role || 'santri',
          attendance_date: attendanceDate,
          check_in_time: timeInput,
          check_in_timestamp: checkInTimestamp,
          class_id: details.class_id,
          sesi: details.sesi,
          attended_session: details.attended_session || details.sesi,
          status: newStatus
        };
        await createAttendance(newAttendance);
        toast({ title: "Berhasil", description: "Kehadiran berhasil dikonfirmasi" });
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      toast({ title: "Gagal", description: "Gagal memperbarui waktu kehadiran", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkAbsent = async () => {
    if (!isAuthorized || !details?.id) return;
    setIsSubmitting(true);
    try {
      await markAttendanceAbsent(details.id, 'Ditandai tidak hadir dari rekap absensi.');
      toast({ title: "Berhasil", description: "Status absensi diubah menjadi Tidak Hadir" });
      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      toast({ title: "Gagal", description: error.message || "Gagal mengubah status absensi", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!details) return null;

  const statusLabel = details.status === 'Hadir' ? 'Tepat Waktu' : details.status;

  const computedLateMinutes = details.checkInTimestamp && details.sessionStartTime
    ? calculateTimeDifference(details.checkInTimestamp, details.sessionStartTime)
    : (details.lateMinutes || 0);

  const getStatusStyles = (status) => {
    switch (status) {
      case 'Hadir':
      case 'Tepat Waktu':
        return { bg: 'hsl(var(--att-success) / 0.08)', border: 'hsl(var(--att-success) / 0.2)', text: 'hsl(var(--att-success))' };
      case 'Terlambat':
        return { bg: 'hsl(var(--att-amber) / 0.08)', border: 'hsl(var(--att-amber) / 0.2)', text: 'hsl(var(--att-amber))' };
      case 'Tidak Hadir':
        return { bg: 'hsl(var(--att-danger) / 0.08)', border: 'hsl(var(--att-danger) / 0.2)', text: 'hsl(var(--att-danger))' };
      default:
        return { bg: 'hsl(var(--att-surface-sunken))', border: 'hsl(var(--att-border))', text: 'hsl(var(--att-text-secondary))' };
    }
  };

  const statusStyles = getStatusStyles(details.status);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-transparent border-none shadow-none">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full overflow-hidden"
              style={{
                backgroundColor: 'hsl(var(--att-surface))',
                border: '1px solid hsl(var(--att-border))',
                borderRadius: 'var(--att-radius-lg)',
                boxShadow: '0 8px 32px hsl(var(--att-shadow-color) / 0.15), 0 2px 8px hsl(var(--att-shadow-color) / 0.08)',
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, ${statusStyles.text}, ${statusStyles.text}88)` }} />

              <DialogHeader style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid hsl(var(--att-border-subtle))' }}>
                <DialogTitle style={{ fontSize: '1.125rem', fontWeight: 700, color: 'hsl(var(--att-text-primary))', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <AttendanceStatusIcon status={details.status} className="w-7 h-7 pointer-events-none" />
                  Detail Kehadiran
                </DialogTitle>
              </DialogHeader>

              <div style={{ padding: '1.5rem' }} className="space-y-5">
                {details.status !== 'Tidak Hadir' && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderRadius: 'var(--att-radius)', backgroundColor: statusStyles.bg, border: `1px solid ${statusStyles.border}` }}>
                      <div>
                        <p style={{ fontSize: '0.75rem', color: 'hsl(var(--att-text-muted))', marginBottom: '0.25rem' }}>Status</p>
                        <p style={{ fontWeight: 700, fontSize: '1.125rem', color: statusStyles.text }}>{statusLabel}</p>
                      </div>
                      <AttendanceStatusIcon status={details.status} className="w-11 h-11 pointer-events-none" />
                    </div>

                    <div style={{ display: 'grid', gap: '0.625rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: 'var(--att-radius-sm)', backgroundColor: 'hsl(var(--att-surface-sunken) / 0.4)', border: '1px solid hsl(var(--att-border-subtle))' }}>
                        <CheckCircle style={{ width: '1.125rem', height: '1.125rem', color: 'hsl(var(--att-success))', flexShrink: 0 }} />
                        <div>
                          <p style={{ fontSize: '0.6875rem', color: 'hsl(var(--att-text-muted))', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Waktu Absensi</p>
                          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'hsl(var(--att-text-primary))', fontSize: '0.9375rem' }}>
                            {details.checkInTimestamp ? formatTimestamp(details.checkInTimestamp) : '-'}
                          </p>
                        </div>
                      </div>
                      {details.sessionStartTime && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: 'var(--att-radius-sm)', backgroundColor: 'hsl(var(--att-surface-sunken) / 0.4)', border: '1px solid hsl(var(--att-border-subtle))' }}>
                          <Calendar style={{ width: '1.125rem', height: '1.125rem', color: 'hsl(var(--att-secondary))', flexShrink: 0 }} />
                          <div>
                            <p style={{ fontSize: '0.6875rem', color: 'hsl(var(--att-text-muted))', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Waktu Sesi</p>
                            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'hsl(var(--att-text-primary))', fontSize: '0.9375rem' }}>
                              {formatTimestamp(details.sessionStartTime)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {details.status === 'Terlambat' && computedLateMinutes > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem', borderRadius: 'var(--att-radius)', backgroundColor: 'hsl(var(--att-amber-bg))', border: '1px solid hsl(var(--att-amber-border))' }}>
                        <Clock style={{ width: '1.125rem', height: '1.125rem', color: 'hsl(var(--att-amber))', flexShrink: 0 }} />
                        <p style={{ fontWeight: 600, color: 'hsl(var(--att-amber))', fontSize: '0.875rem' }}>Terlambat: {computedLateMinutes} menit</p>
                      </div>
                    )}

                    {isAuthorized && (
                      <div style={{ borderTop: '1px solid hsl(var(--att-border-subtle))', paddingTop: '1.25rem', marginTop: '0.5rem' }} className="space-y-4">
                        <div className="space-y-2">
                          <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'hsl(var(--att-text-primary))' }}>Edit Waktu Hadir</label>
                          <Input
                            type="time"
                            step="1"
                            value={timeInput}
                            onChange={(e) => setTimeInput(e.target.value)}
                            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.125rem', textAlign: 'center', letterSpacing: '0.05em' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <Button
                            variant="outline"
                            className="w-1/2"
                            onClick={onClose}
                            disabled={isSubmitting}
                            style={{ borderColor: 'hsl(var(--att-border))', color: 'hsl(var(--att-text-secondary))', borderRadius: 'var(--att-radius-sm)' }}
                          >
                            Batal
                          </Button>
                          <Button
                            className="w-1/2"
                            onClick={handleConfirmAttendance}
                            disabled={isSubmitting}
                            style={{ backgroundColor: 'hsl(var(--att-accent))', color: 'white', borderRadius: 'var(--att-radius-sm)', fontWeight: 600 }}
                          >
                            {isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
                          </Button>
                        </div>
                        {details.id && (
                          <Button
                            type="button"
                            variant="destructive"
                            className="w-full"
                            onClick={handleMarkAbsent}
                            disabled={isSubmitting}
                            style={{ borderRadius: 'var(--att-radius-sm)', fontWeight: 600 }}
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Tandai Tidak Hadir
                          </Button>
                        )}
                      </div>
                    )}

                    {!isAuthorized && (
                      <Button variant="outline" className="w-full mt-4" onClick={onClose} style={{ borderColor: 'hsl(var(--att-border))', color: 'hsl(var(--att-text-secondary))', borderRadius: 'var(--att-radius-sm)' }}>
                        Tutup
                      </Button>
                    )}
                  </>
                )}

                {details.status === 'Tidak Hadir' && (
                  <div className="space-y-4">
                    <div style={{ padding: '1rem 1.25rem', borderRadius: 'var(--att-radius)', backgroundColor: 'hsl(var(--att-danger-bg))', border: '1px solid hsl(var(--att-danger-border))', textAlign: 'center' }}>
                      <p style={{ fontWeight: 600, marginBottom: '0.25rem', color: 'hsl(var(--att-danger))' }}>Status: Tidak Hadir</p>
                      <p style={{ fontSize: '0.875rem', color: 'hsl(var(--att-danger))', opacity: 0.8 }}>Murid belum melakukan absensi pada tanggal ini.</p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1rem', borderRadius: 'var(--att-radius)', backgroundColor: 'hsl(var(--att-surface-sunken) / 0.4)', border: '1px solid hsl(var(--att-border-subtle))' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'hsl(var(--att-text-secondary))' }}>
                        <Calendar style={{ width: '1rem', height: '1rem' }} />
                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{details.attendance_date}</span>
                      </div>
                      {details.sessionStartTime && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'hsl(var(--att-text-secondary))' }}>
                          <Clock style={{ width: '1rem', height: '1rem' }} />
                          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                            {new Date(details.sessionStartTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )}
                    </div>

                    {isAuthorized && (
                      <div style={{ borderTop: '1px solid hsl(var(--att-border-subtle))', paddingTop: '1.25rem', marginTop: '0.5rem' }} className="space-y-4">
                        <div className="space-y-2">
                          <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'hsl(var(--att-text-primary))' }}>Waktu Hadir Manual</label>
                          <Input
                            type="time"
                            step="1"
                            value={timeInput}
                            onChange={(e) => setTimeInput(e.target.value)}
                            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.125rem', textAlign: 'center', letterSpacing: '0.05em' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <Button
                            variant="outline"
                            className="w-1/2"
                            onClick={onClose}
                            disabled={isSubmitting}
                            style={{ borderColor: 'hsl(var(--att-border))', color: 'hsl(var(--att-text-secondary))', borderRadius: 'var(--att-radius-sm)' }}
                          >
                            Batal
                          </Button>
                          <Button
                            className="w-1/2"
                            onClick={handleConfirmAttendance}
                            disabled={isSubmitting}
                            style={{ backgroundColor: 'hsl(var(--att-accent))', color: 'white', borderRadius: 'var(--att-radius-sm)', fontWeight: 600 }}
                          >
                            {isSubmitting ? 'Menyimpan...' : 'Konfirmasi Kehadiran'}
                          </Button>
                        </div>
                      </div>
                    )}

                    {!isAuthorized && (
                      <Button variant="outline" className="w-full mt-4" onClick={onClose} style={{ borderColor: 'hsl(var(--att-border))', color: 'hsl(var(--att-text-secondary))', borderRadius: 'var(--att-radius-sm)' }}>
                        Tutup
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default AttendanceDetailsModal;
