import React, { useMemo, useState } from 'react';
import { Search, Users, HeartPulse, UserMinus, AlertTriangle } from 'lucide-react';
import { AgentKPI } from '../../lib/dataProcessor';
import { KPI_TARGETS, formatNum } from '../../lib/utils';
import { SegmentedControl } from '../ui/SegmentedControl';
import { ScheduleBoard } from './ScheduleBoard';
import { AttendanceMonitor, hasAttendanceData, summarizeAttendance } from './AttendanceMonitor';

type ViewMode = 'schedule' | 'attendance';
const VIEW_STORAGE_KEY = 'kpi-schedule-attendance-view';

function readStoredView(initial: ViewMode): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === 'schedule' || stored === 'attendance' ? stored : initial;
  } catch {
    return initial;
  }
}

const StatCard: React.FC<{
  label: string;
  value: string;
  note?: string;
  icon: React.ReactNode;
  iconBg: string;
  valueClass?: string;
}> = ({ label, value, note, icon, iconBg, valueClass = 'text-text-primary' }) => (
  <div className="bg-card rounded-lg border border-border p-4 flex flex-col">
    <div className="flex justify-between items-start mb-2">
      <div className="text-[11px] font-medium text-text-secondary tracking-wide">{label}</div>
      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${iconBg}`}>{icon}</div>
    </div>
    <div className={`text-2xl font-semibold tracking-tight ${valueClass}`}>{value}</div>
    {note ? <p className="mt-1 text-[10px] text-text-muted">{note}</p> : null}
  </div>
);

/** One menu for the daily roster and the attendance recap — same agents, same search. */
export const ScheduleAttendance: React.FC<{ data: AgentKPI[]; initialView?: ViewMode }> = ({
  data,
  initialView = 'schedule' as ViewMode,
}) => {
  const [view, setViewState] = useState<ViewMode>(() => readStoredView(initialView));
  const [search, setSearch] = useState('');

  const setView = (next: ViewMode) => {
    setViewState(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* per-viewer convenience only */
    }
  };

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((a) => a.csId.toLowerCase().includes(q) || (a.name || '').toLowerCase().includes(q));
  }, [data, search]);

  const summary = useMemo(() => summarizeAttendance(data.filter(hasAttendanceData)), [data]);
  const attendanceCount = useMemo(() => searched.filter(hasAttendanceData).length, [searched]);
  const agentCount = view === 'schedule' ? searched.length : attendanceCount;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-text-primary">Jadwal &amp; Kehadiran</h1>
          <p className="text-xs text-text-muted mt-1">
            Satu sumber: data Schedule. {formatNum(agentCount, 0)} agen ditampilkan.
          </p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Cari CS ID atau nama..."
            aria-label="Cari CS ID atau nama..."
            className="pl-8 pr-3 py-1.5 border border-border rounded-lg text-xs focus:border-primary focus:outline-none w-full md:w-64 bg-card text-text-primary"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard
          label="Avg Team Attendance"
          value={`${formatNum(summary.avgTeamAttendance, 1)}%`}
          icon={<Users className="w-3.5 h-3.5 text-primary" />}
          iconBg="bg-primary-soft"
          valueClass="text-primary"
        />
        <StatCard
          label="Di Bawah Target"
          value={formatNum(summary.belowTarget, 0)}
          note={`Target attendance ${KPI_TARGETS.attendance}%`}
          icon={<AlertTriangle className="w-3.5 h-3.5 text-danger" />}
          iconBg="bg-danger-soft"
          valueClass="text-danger"
        />
        <StatCard
          label="Total Cuti (C)"
          value={formatNum(summary.totalC, 0)}
          icon={<HeartPulse className="w-3.5 h-3.5 text-warning" />}
          iconBg="bg-warning-soft"
        />
        <StatCard
          label="Total Sick (S)"
          value={formatNum(summary.totalSick, 0)}
          icon={<HeartPulse className="w-3.5 h-3.5 text-danger" />}
          iconBg="bg-danger-soft"
        />
        <StatCard
          label="Total PULLOUT"
          value={formatNum(summary.totalPullout, 0)}
          icon={<UserMinus className="w-3.5 h-3.5 text-success" />}
          iconBg="bg-success-soft"
        />
      </div>

      <SegmentedControl<ViewMode>
        aria-label="Tampilan Jadwal & Kehadiran"
        value={view}
        onChange={setView}
        options={[
          { value: 'schedule', label: 'Jadwal harian' },
          { value: 'attendance', label: 'Rekap kehadiran' },
        ]}
      />

      {view === 'schedule' ? <ScheduleBoard data={searched} /> : <AttendanceMonitor data={searched} />}
    </div>
  );
};
