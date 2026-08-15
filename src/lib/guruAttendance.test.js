import { describe, expect, it } from 'vitest';
import {
  buildGuruLessonAttendancePayload,
  getTeacherLessonSchedulesForDate,
  getTeacherLessonWindow,
  isValidSchoolScheduleId,
} from '@/lib/guruAttendance';

const TEACHER_ID = 'a1fa7a10-0000-0000-0000-000000000012';
const SCHOOL_SCHEDULE_ID = '4fa25d3c-bad3-49d6-a274-b347d380579e';
const CLASS_ID = 'b2fa7a20-0000-0000-0000-000000000001';
const SUBJECT_ID = '9af0d035-0b40-4d78-84e4-524dc78c6fea';

describe('absensi guru berbasis jadwal pelajaran sekolah', () => {
  it('menerima UUID PostgreSQL jadwal sekolah tanpa aturan versi UUID MMQ', () => {
    expect(isValidSchoolScheduleId(SCHOOL_SCHEDULE_ID)).toBe(true);
    expect(isValidSchoolScheduleId('bukan-id-jadwal')).toBe(false);
  });

  it('memilih jadwal guru pada tanggal dan hari pelajaran yang benar', () => {
    const schedules = [
      {
        id: SCHOOL_SCHEDULE_ID,
        guru_id: TEACHER_ID,
        class_id: CLASS_ID,
        mata_pelajaran_id: SUBJECT_ID,
        hari: 1,
        jam_mulai: '07:30',
        jam_selesai: '08:40',
        nama_kelas: 'Kelas 1A',
        mata_pelajaran_nama: 'Matematika',
        guru_nama: 'Siti Aminah',
      },
    ];

    expect(getTeacherLessonSchedulesForDate(schedules, {
      guruId: TEACHER_ID,
      date: new Date('2026-08-17T07:45:00+07:00'),
    })).toHaveLength(1);
    expect(getTeacherLessonSchedulesForDate(schedules, {
      guruId: TEACHER_ID,
      date: new Date('2026-08-18T07:45:00+07:00'),
    })).toHaveLength(0);
  });

  it('membuka window absensi sesuai jam jadwal sekolah', () => {
    const window = getTeacherLessonWindow({
      id: SCHOOL_SCHEDULE_ID,
      hari: 1,
      jam_mulai: '07:30',
      jam_selesai: '08:40',
    }, new Date('2026-08-17T07:45:00+07:00'));

    expect(window.canRecord).toBe(true);
    expect(window.phase).toBe('on_time');
  });
  it('membentuk payload attendance sekolah dengan guru, kelas, mapel, jadwal, tanggal, dan waktu', () => {
    const schedule = {
      id: SCHOOL_SCHEDULE_ID,
      guru_id: TEACHER_ID,
      class_id: CLASS_ID,
      mata_pelajaran_id: SUBJECT_ID,
      hari: 1,
      jam_mulai: '07:30',
      jam_selesai: '08:40',
      nama_kelas: 'Kelas 1A',
      mata_pelajaran_nama: 'Matematika',
      guru_nama: 'Siti Aminah',
    };

    expect(buildGuruLessonAttendancePayload({
      guruId: TEACHER_ID,
      schedule,
      timestamp: new Date('2026-08-17T07:45:00+07:00'),
      status: 'Hadir',
    })).toMatchObject({
      user_id: TEACHER_ID,
      role: 'guru',
      class_id: CLASS_ID,
      jadwal_pelajaran_id: SCHOOL_SCHEDULE_ID,
      mata_pelajaran_id: SUBJECT_ID,
      attendance_date: '2026-08-17',
      check_in_timestamp: '2026-08-17T00:45:00.000Z',
      status: 'Hadir',
      source: 'rfid',
    });
  });
});
