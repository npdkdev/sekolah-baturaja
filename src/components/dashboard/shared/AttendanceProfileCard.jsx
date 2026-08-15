import React from 'react';
import { motion } from 'framer-motion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  CheckCircle,
  Clock,
  BookOpen,
  GraduationCap,
  Users,
  Star,
  Crown,
  Globe2,
  Book,
  Briefcase,
  Fingerprint,
  Calendar,
  Award,
  Sparkles,
} from 'lucide-react';
import { getSessionName } from '@/utils/sessionMapping';
import { labelStafRole } from '@/lib/staf';

/**
 * AttendanceProfileCard — Shared premium profile card for attendance results.
 * Center-aligned, portrait-optimized layout.
 */
const AttendanceProfileCard = ({
  variant = 'student',
  name,
  photo,
  status,
  time,
  jilid,
  points,
  kelas,
  sesi,
  rfid,
  levelInfo,
  monthlyStats,
  hafalanCount,
  characterStrength,
  strongestHafalanCategory,
  jabatan,
  guruStats,
  quote,
  message,
  showSuccessBadge = false,
  isPentashih = false,
}) => {
  const isTeacher = variant === 'teacher';
  const displayJabatan = labelStafRole(jabatan);
  // The role badge already carries this label; repeating it as the subtitle
  // duplicates the same words on the card. A more specific jabatan
  // ("Wakil Kepala Sekolah Bidang Kurikulum") still earns its own line.
  const roleBadgeLabel = isPentashih ? 'Wakil Kepala Sekolah' : 'Guru';
  const showJabatan = Boolean(displayJabatan) && displayJabatan !== roleBadgeLabel;

  const {
    color: levelColor,
    cardBorderThickness,
    avatarBorderThickness,
  } = levelInfo || {};

  const configuredAccent = !isTeacher && levelColor ? getConfiguredAccent(levelColor) : null;
  const pointAccent = !isTeacher ? (configuredAccent || getPointAccent(points)) : null;
  const pointLevel = !isTeacher ? (levelInfo?.label || getPointLevel(points)) : null;
  const cardDepth = clampDepth(cardBorderThickness, 8);
  const avatarDepth = clampDepth(avatarBorderThickness, 4);
  const statusConfig = getStatusConfig(status);
  const displayMessage = formatAttendanceMessage(message, sesi);
  const nameGradient = pointAccent
    ? `linear-gradient(135deg, ${pointAccent.gradientStart}, ${pointAccent.gradientEnd})`
    : isTeacher
      ? 'linear-gradient(135deg, #047857, #22c55e)'
      : levelColor
        ? `linear-gradient(135deg, ${levelColor}, color-mix(in srgb, ${levelColor} 58%, white))`
        : 'linear-gradient(135deg, #047857, #34d399)';
  const visualAccent = pointAccent || {
    color: '#169b62',
    gradientStart: '#087443',
    gradientEnd: '#4ade80',
    soft: 'rgba(22, 155, 98, 0.12)',
    glow: 'rgba(22, 155, 98, 0.26)',
  };
  const cardStyle = {
    '--attendance-profile-accent': visualAccent.color,
    '--attendance-profile-gradient-start': visualAccent.gradientStart,
    '--attendance-profile-gradient-end': visualAccent.gradientEnd,
    '--attendance-profile-accent-soft': visualAccent.soft,
    '--attendance-profile-accent-glow': visualAccent.glow,
    '--attendance-card-shadow-y': `${Math.max(10, cardDepth * 2)}px`,
    '--attendance-card-shadow-blur': `${Math.max(26, cardDepth * 5)}px`,
    '--attendance-avatar-shadow-y': `${Math.max(7, avatarDepth * 2)}px`,
    '--attendance-avatar-shadow-blur': `${Math.max(18, avatarDepth * 5)}px`,
  };
  const statusStyle = pointAccent
    ? {
        backgroundColor: 'rgba(255, 255, 255, 0.92)',
        borderColor: pointAccent.color,
        color: pointAccent.color,
      }
    : {
        backgroundColor: `${statusConfig.color}14`,
        borderColor: `${statusConfig.color}30`,
        color: statusConfig.color,
      };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={`attendance-profile-card attendance-profile-card--white-glass ${isTeacher ? 'attendance-profile-card--teacher' : 'attendance-profile-card--student'} ${pointAccent ? 'attendance-profile-card--point-glow' : ''}`}
      style={cardStyle}
      role="region"
      aria-label={`Profil ${isTeacher ? 'Guru' : 'Murid'}: ${name}`}
    >
      {/* Avatar — large, centered, top anchor */}
      <div className="attendance-profile-card__avatar-wrap">
          <Avatar
            className="attendance-profile-card__avatar"
            style={{
              width: '100%',
              height: '100%',
            }}
          >
          <AvatarImage src={photo} alt={name} loading="eager" fetchPriority="high" decoding="async" className="object-cover" />
          <AvatarFallback className="attendance-profile-card__avatar-fallback">
            {name?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>

        {showSuccessBadge && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 260, damping: 20 }}
            className="attendance-profile-card__success-badge"
          >
            <CheckCircle className="w-5 h-5" />
          </motion.div>
        )}

        {/* Role badge for teachers */}
        {isTeacher && (
          <div className="attendance-profile-card__role-badge">
            <GraduationCap className="w-3.5 h-3.5" />
            <span>{roleBadgeLabel}</span>
          </div>
        )}
      </div>

      {/* Name — primary hierarchy, centered */}
      <h2
        className="attendance-profile-card__name attendance-profile-card__name--gradient"
        style={{ '--attendance-name-gradient': nameGradient }}
      >
        {name}
      </h2>

      {!isTeacher && sesi && (
        <p className="attendance-profile-card__session-label">
          Sesi {getSessionName(sesi)}
        </p>
      )}

      {/* Subtitle */}
      {isTeacher && showJabatan && (
        <p className="attendance-profile-card__subtitle">{displayJabatan}</p>
      )}

      {/* Status & Time */}
      {status && (
        <div className="attendance-profile-card__status-row">
          <div
            className={`attendance-profile-card__status-chip ${getStatusToneClass(status)}`}
            style={statusStyle}
          >
            {statusConfig.icon}
            <span className="font-semibold">{statusConfig.label}</span>
          </div>
          {time && (
            <div className="attendance-profile-card__time-chip">
              <Clock className="w-4 h-4" />
              <span className="font-mono font-bold">{time}</span>
            </div>
          )}
        </div>
      )}

      {/* Details Grid */}
      <div className="attendance-profile-card__details">
        {isTeacher ? (
          <>
            {guruStats && (
              <>
                <DetailItem icon={<Briefcase className="w-4 h-4" />} label="Sesi" value={guruStats.session} accent />
                <DetailItem icon={<Clock className="w-4 h-4" />} label="Jam Total" value={guruStats.hours} />
                <DetailItem icon={<Star className="w-4 h-4" />} label="Streak" value={guruStats.streak} amber />
              </>
            )}
            {sesi && !guruStats && (
              <DetailItem icon={<Calendar className="w-4 h-4" />} label="Sesi" value={sesi} accent />
            )}
            {rfid && (
              <DetailItem icon={<Fingerprint className="w-4 h-4" />} label="RFID" value={rfid} mono />
            )}
          </>
        ) : (
          <>
            {jilid && (
              <DetailItem icon={<BookOpen className="w-4 h-4" />} label="Jilid" value={jilid} pointAccent={pointAccent} accent />
            )}
            {points !== undefined && points !== null && (
              <DetailItem icon={<Star className="w-4 h-4" />} label="Poin" value={points} pointAccent={pointAccent} amber />
            )}
            {pointLevel && (
              <DetailItem icon={<Crown className="w-4 h-4" />} label="Level" value={pointLevel} pointAccent={pointAccent} />
            )}
            {hafalanCount !== undefined && hafalanCount !== null && (
              <DetailItem icon={<Book className="w-4 h-4" />} label="Hafalan" value={hafalanCount} pointAccent={pointAccent} />
            )}
            {characterStrength && (
              <DetailItem icon={<Sparkles className="w-4 h-4" />} label="Karakter Unggulan" value={characterStrength} pointAccent={pointAccent} />
            )}
            {strongestHafalanCategory && (
              <DetailItem icon={<Award className="w-4 h-4" />} label="Kategori Terkuat" value={strongestHafalanCategory} pointAccent={pointAccent} />
            )}
            {monthlyStats && (
              <AttendanceSummary monthlyStats={monthlyStats} />
            )}
            {kelas && (
              <DetailItem icon={<Users className="w-4 h-4" />} label="Kelas" value={kelas} />
            )}
            {rfid && (
              <DetailItem icon={<Fingerprint className="w-4 h-4" />} label="RFID" value={rfid} mono />
            )}
          </>
        )}
      </div>

      {/* Message */}
      {displayMessage && (
        <div className="attendance-profile-card__message">
          <span className="attendance-profile-card__message-icon" aria-hidden="true">
            <CheckCircle className="w-4 h-4" />
          </span>
          <p>{displayMessage}</p>
        </div>
      )}

      {/* Quote */}
      {quote && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="attendance-profile-card__quote"
        >
          <p>&ldquo;{quote}&rdquo;</p>
        </motion.div>
      )}
    </motion.div>
  );
};

/* --- Detail Item --- */
const DetailItem = ({ icon, label, value, accent, amber, mono, pointAccent }) => (
  <div
    className="attendance-profile-card__detail-item"
    style={
      pointAccent
        ? {
            borderColor: pointAccent.color,
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
          }
        : amber
        ? { borderColor: 'var(--att-amber-border)', backgroundColor: 'var(--att-amber-bg)' }
        : accent
          ? { borderColor: 'var(--att-accent-border)', backgroundColor: 'var(--att-accent-bg)' }
          : undefined
    }
  >
    <div
      className="attendance-profile-card__detail-icon"
      style={
        pointAccent
          ? { color: pointAccent.color }
          : amber
          ? { color: 'var(--att-amber)' }
          : accent
            ? { color: 'var(--att-accent)' }
            : undefined
      }
    >
      {icon}
    </div>
    <div className="attendance-profile-card__detail-text">
      <span className="attendance-profile-card__detail-label">{label}</span>
      <span
        className={`attendance-profile-card__detail-value ${mono ? 'font-mono' : ''}`}
        style={pointAccent ? { color: pointAccent.color } : amber ? { color: 'var(--att-amber)' } : undefined}
        title={String(value)}
      >
        {value}
      </span>
    </div>
  </div>
);

const AttendanceSummary = ({ monthlyStats }) => (
  <div className="attendance-profile-card__detail-item attendance-profile-card__attendance-summary">
    <div className="attendance-profile-card__attendance-summary-header">
      <Calendar className="w-4 h-4" />
      <span>Bulan Ini</span>
    </div>
    <div className="attendance-profile-card__attendance-values">
      <div className="attendance-profile-card__attendance-value attendance-profile-card__attendance-value--present">
        <strong>{monthlyStats.present ?? 0}</strong>
        <span>Hadir</span>
      </div>
      <div className="attendance-profile-card__attendance-value attendance-profile-card__attendance-value--late">
        <strong>{monthlyStats.late ?? 0}</strong>
        <span>Terlambat</span>
      </div>
      <div className="attendance-profile-card__attendance-value attendance-profile-card__attendance-value--absent">
        <strong>{monthlyStats.absent ?? 0}</strong>
        <span>Tidak Hadir</span>
      </div>
    </div>
  </div>
);

function clampDepth(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(16, Math.max(0, parsed));
}

function getConfiguredAccent(color) {
  return {
    color,
    gradientStart: `color-mix(in srgb, ${color} 72%, #111827)`,
    gradientEnd: `color-mix(in srgb, ${color} 62%, white)`,
    soft: `color-mix(in srgb, ${color} 14%, transparent)`,
    glow: `color-mix(in srgb, ${color} 32%, transparent)`,
  };
}

function getPointAccent(points = 0) {
  const safePoints = Number(points) || 0;
  if (safePoints <= 20) {
    return {
      color: '#22c55e',
      gradientStart: '#15803d',
      gradientEnd: '#4ade80',
      soft: 'rgba(34, 197, 94, 0.14)',
      glow: 'rgba(34, 197, 94, 0.5)',
    };
  }
  if (safePoints <= 50) {
    return {
      color: '#2563eb',
      gradientStart: '#1d4ed8',
      gradientEnd: '#60a5fa',
      soft: 'rgba(37, 99, 235, 0.14)',
      glow: 'rgba(37, 99, 235, 0.5)',
    };
  }
  if (safePoints <= 80) {
    return {
      color: '#f97316',
      gradientStart: '#c2410c',
      gradientEnd: '#fb923c',
      soft: 'rgba(249, 115, 22, 0.16)',
      glow: 'rgba(249, 115, 22, 0.55)',
    };
  }
  return {
    color: '#ef4444',
    gradientStart: '#b91c1c',
    gradientEnd: '#fb7185',
    soft: 'rgba(239, 68, 68, 0.16)',
    glow: 'rgba(239, 68, 68, 0.55)',
  };
}

function getPointLevel(points = 0) {
  const safePoints = Number(points) || 0;
  if (safePoints <= 20) return 'Murid Biasa';
  if (safePoints <= 50) return 'Murid Rajin';
  if (safePoints <= 80) return 'Murid Super';
  return 'Murid Legend';
}

/* --- Status Config --- */
function getStatusConfig(status) {
  switch (status) {
    case 'Hadir':
    case 'Tepat Waktu':
      return { label: 'Tepat Waktu', color: 'var(--att-success)', icon: <CheckCircle className="w-4 h-4" /> };
    case 'Terlambat':
      return { label: 'Terlambat', color: 'var(--att-amber)', icon: <Clock className="w-4 h-4" /> };
    case 'Tidak Hadir':
    case 'Alpha':
      return { label: 'Tidak Hadir', color: 'var(--att-danger)', icon: <span className="w-4 h-4 flex items-center justify-center">&#x2716;</span> };
    case 'Izin':
      return { label: 'Izin', color: 'var(--att-secondary)', icon: <span className="w-4 h-4 flex items-center justify-center">&#9998;</span> };
    case 'Sakit':
      return { label: 'Sakit', color: 'var(--att-violet)', icon: <span className="w-4 h-4 flex items-center justify-center">&#9829;</span> };
    default:
      return { label: status || 'Unknown', color: 'var(--att-text-muted)', icon: <Clock className="w-4 h-4" /> };
  }
}

function formatAttendanceMessage(message, sesi) {
  if (!message) return message;

  const normalizedMessage = String(message);
  const sessionLabel = getSessionName(sesi);
  if (sessionLabel && /berhasil\s+melakukan\s+absensi/i.test(normalizedMessage)) {
    return `Absensi Sesi ${sessionLabel} berhasil.`;
  }

  return normalizedMessage.replace(
    /\b(pada\s+)?sesi\s*([0-4])\b/gi,
    (_match, prefix, sessionValue) => `${prefix ? 'pada ' : ''}Sesi ${getSessionName(sessionValue)}`,
  );
}

function getStatusToneClass(status) {
  if (status === 'Terlambat') return 'attendance-profile-card__status-chip--late';
  if (['Tidak Hadir', 'Alpha'].includes(status)) return 'attendance-profile-card__status-chip--absent';
  if (['Hadir', 'Tepat Waktu'].includes(status)) return 'attendance-profile-card__status-chip--present';
  return '';
}

export default AttendanceProfileCard;
