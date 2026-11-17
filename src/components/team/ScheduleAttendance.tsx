import React, { useMemo, useState } from 'react';
import { AgentKPI } from '../../lib/dataProcessor';
import { KPI_TARGETS, formatNum } from '../../lib/utils';
import { hasAttendanceData, summarizeAttendance } from '../../lib/scheduleStats';
import { SegmentedControl } from '../ui/SegmentedControl';
import { PageHeader } from '../ui/PageHeader';
import { SearchField } from '../ui/SearchField';
import { StatCard } from '../ui/StatCard';
import { ScheduleBoard } from './ScheduleBoard';
import { AttendanceMonitor } from './AttendanceMonitor';

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
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Team"
        title="Jadwal & Kehadiran"
        subtitle={`Satu sumber: data Schedule. ${formatNum(agentCount, 0)} agen ditampilkan.`}
        actions={
          <>
            <SegmentedControl<ViewMode>
              aria-label="Tampilan Jadwal & Kehadiran"
              value={view}
              onChange={setView}
              options={[
                { value: 'schedule', label: 'Jadwal harian' },
                { value: 'attendance', label: 'Rekap kehadiran' },
              ]}
            />
            <SearchField value={search} onChange={setSearch} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(190px,1fr))] sm:gap-5">
        <StatCard
          size="md"
          className="col-span-2 sm:col-span-1"
          label="Avg team attendance"
          value={formatNum(summary.avgTeamAttendance, 1)}
          unit="%"
          tone={summary.avgTeamAttendance < KPI_TARGETS.attendance ? 'bad' : 'ink'}
          sub="Hadir dibanding duty"
        />
        <StatCard
          size="md"
          label="Di bawah target"
          value={formatNum(summary.belowTarget, 0)}
          tone={summary.belowTarget > 0 ? 'bad' : 'ink'}
          sub={`Target attendance ${KPI_TARGETS.attendance}%`}
        />
        <StatCard size="md" label="Total cuti (C)" value={formatNum(summary.totalC, 0)} sub="Hari cuti" />
        <StatCard size="md" label="Total sick (S)" value={formatNum(summary.totalSick, 0)} sub="Hari sakit" />
        <StatCard size="md" label="Total pullout" value={formatNum(summary.totalPullout, 0)} sub="Duty, bukan man-day" />
      </div>

      {view === 'schedule' ? <ScheduleBoard data={searched} /> : <AttendanceMonitor data={searched} />}
    </div>
  );
};
