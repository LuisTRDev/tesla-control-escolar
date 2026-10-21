import type { CardKind } from '../catalog'
import type { PanelData } from '../panelData'
import { AttendanceSummaryCard, ClassroomSummaryCard, ExitSummaryCard, MetricsCard, PendingStudentsCard, RecentEntriesCard } from './AttendanceCards'
import { IncidentsByClassroomCard, PresentationComplianceCard, TodayIncidentsCard, TopIncidentsCard, TopStudentsCard } from './IncidentCards'
import { LateByGradeCard, LateByLevelCard, LateStudentsCard } from './LateCards'
import type { SelectStudent } from './shared'

export function renderCard(kind: CardKind, data: PanelData, totalStudents: number, mobile: boolean, onSelect?: SelectStudent) {
  const props = { data, mobile, onSelect }
  switch (kind) {
    case 'metrics': return <MetricsCard {...props} totalStudents={totalStudents} />
    case 'recentEntries': return <RecentEntriesCard {...props} />
    case 'lateStudents': return <LateStudentsCard {...props} />
    case 'lateByGrade': return <LateByGradeCard {...props} />
    case 'lateByPrimaria': return <LateByLevelCard {...props} level="Primaria" />
    case 'lateBySecundaria': return <LateByLevelCard {...props} level="Secundaria" />
    case 'todayIncidents': return <TodayIncidentsCard {...props} />
    case 'topIncidents': return <TopIncidentsCard {...props} />
    case 'topStudents': return <TopStudentsCard {...props} />
    case 'attendanceSummary': return <AttendanceSummaryCard {...props} />
    case 'exitSummary': return <ExitSummaryCard {...props} />
    case 'presentationCompliance': return <PresentationComplianceCard {...props} />
    case 'pendingStudents': return <PendingStudentsCard {...props} />
    case 'classroomSummary': return <ClassroomSummaryCard {...props} />
    case 'incidentsByClassroom': return <IncidentsByClassroomCard {...props} />
  }
}
