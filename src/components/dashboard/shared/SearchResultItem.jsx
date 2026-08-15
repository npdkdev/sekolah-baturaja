import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Users, BookOpen, DollarSign, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { labelStafRole } from '@/lib/staf';

const getStatusColor = (status, category) => {
  if (!status) return "bg-slate-100 text-slate-700 border-slate-200";

  if (category === 'pembayaran') {
    return "bg-blue-100 text-blue-700 border-blue-200";
  }

  const s = String(status).toLowerCase();
  if (['aktif', 'lunas', 'lancar'].includes(s)) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (['pending', 'proses'].includes(s)) return "bg-amber-100 text-amber-700 border-amber-200";
  if (['overdue', 'belum', 'tidak aktif'].includes(s)) return "bg-rose-100 text-rose-700 border-rose-200";

  return "bg-slate-100 text-slate-700 border-slate-200";
};

const getCategoryIcon = (category) => {
  switch (category) {
    case 'santri': return <Users className="w-4 h-4 text-blue-500" />;
    case 'guru': return <GraduationCap className="w-4 h-4 text-indigo-500" />;
    case 'kelas': return <BookOpen className="w-4 h-4 text-emerald-500" />;
    case 'pembayaran': return <DollarSign className="w-4 h-4 text-amber-500" />;
    default: return null;
  }
};

const SearchResultItem = ({ item, category, onSelect, isSelected }) => {
  const handleClick = (e) => {
    e.preventDefault();
    onSelect(item, category);
  };

  let title = '';
  let subtitle = '';
  let status = '';
  let avatarUrl = '';
  let fallback = '';

  try {
    switch (category) {
      case 'santri':
        title = item.nama_lengkap || 'Data tidak lengkap';
        subtitle = `NIQ: ${item.nomor_induk_qiroati || '-'} | Jilid: ${item.jilid || '-'}`;
        status = item.status;
        avatarUrl = item.foto_url;
        fallback = title.charAt(0);
        break;
      case 'guru':
        title = item.nama || 'Data tidak lengkap';
        subtitle = labelStafRole(item.jabatan || 'Guru');
        status = item.status_guru || 'Aktif';
        avatarUrl = item.foto_url;
        fallback = title.charAt(0);
        break;
      case 'kelas':
        title = item.nama_kelas || 'Data tidak lengkap';
        subtitle = `Sesi: ${item.sesi || '-'} | Guru: ${item.guru?.nama || '-'}`;
        break;
      case 'pembayaran':
        const santriName = item.santri?.nama_lengkap || 'Data tidak lengkap';
        title = `Pembayaran ${santriName}`;

        const amount = item.jumlah !== null && item.jumlah !== undefined ? item.jumlah : 0;

        let period = 'Bulan/Tahun tidak tersedia';

        // Handle null values for bulan and tahun explicitly
        if (item.bulan && item.tahun && item.bulan !== 'null' && item.tahun !== 'null') {
          const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
          let displayBulan = item.bulan;

          // Convert numeric month (1-12) to text if needed
          if (!isNaN(parseInt(item.bulan)) && parseInt(item.bulan) >= 1 && parseInt(item.bulan) <= 12) {
             displayBulan = monthNames[parseInt(item.bulan) - 1];
          }

          period = `${displayBulan} ${item.tahun}`;
        } else if (item.tanggal_pembayaran) {
          // Fallback to payment date if period is not available
          period = new Date(item.tanggal_pembayaran).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        }

        subtitle = `${period} - Rp ${amount.toLocaleString('id-ID')} | ID: ${item.id ? item.id.substring(0,8) : '-'}`;

        if (item.metode_pembayaran) {
          status = `Via ${item.metode_pembayaran}`;
        }
        break;
      default:
        title = 'Unknown';
    }
  } catch (err) {
    console.error("Error formatting search result:", err);
    title = 'Data Error';
    subtitle = 'Informasi tidak dapat ditampilkan';
  }

  return (
    <div
      onMouseDown={handleClick}
      className={cn(
        "flex items-center gap-3 p-3 cursor-pointer rounded-xl transition-all duration-200 group border border-transparent",
        isSelected
          ? "bg-primary/5 dark:bg-primary/10 border-primary/20 scale-[0.99] shadow-inner"
          : "hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:scale-[1.01] hover:shadow-sm hover:border-slate-200 dark:hover:border-slate-700"
      )}
    >
      {['santri', 'guru'].includes(category) ? (
        <Avatar className="w-10 h-10 border-2 border-white dark:border-slate-800 shadow-sm group-hover:border-primary/20 transition-colors">
          <AvatarImage src={avatarUrl} className="object-cover" />
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">{fallback}</AvatarFallback>
        </Avatar>
      ) : (
        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border-2 border-white dark:border-slate-800 shadow-sm group-hover:bg-white dark:group-hover:bg-slate-700 transition-colors">
          {getCategoryIcon(category)}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate group-hover:text-primary transition-colors">
            {title}
          </p>
          {status && (
            <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 font-medium whitespace-nowrap border", getStatusColor(status, category))}>
              {status}
            </Badge>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
          {subtitle}
        </p>
      </div>
    </div>
  );
};

export default SearchResultItem;
