import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, AlignmentType, BorderStyle, PageOrientation } from 'docx'
import { jsPDF } from 'jspdf'
import type { Classroom, PresentationRecord, Student } from '@/types'

const rules = [
  ['hairstyleViolation', 'Peinado no acorde con las disposiciones institucionales.'],
  ['uniformUsageViolation', 'Uso inadecuado o incompleto del uniforme.'],
  ['nonInstitutionalGarment', 'Prenda no correspondiente al uniforme institucional.'],
  ['otherViolation', 'Otro'],
] as const

function filename(student: Student, ext: string) {
  const clean = `${student.firstName}-${student.lastName}`.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ-]/g, '')
  return `Notificacion-Presentacion-${clean}.${ext}`
}

function dateParts(date: string) {
  const [y, m, d] = date.split('-')
  return { y, m, d }
}

function selected(record: PresentationRecord, key: typeof rules[number][0]) {
  return Boolean(record[key])
}

function description(record: PresentationRecord) {
  const list = rules.filter(([key]) => selected(record, key)).map(([, label]) => label.replace(/\.$/, ''))
  if (record.otherViolation && record.otherDescription.trim()) list.push(`Detalle: ${record.otherDescription.trim()}`)
  return list.join('; ') + '.'
}

export function downloadNotificationPdf(student: Student, classroom: Classroom, record: PresentationRecord) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = 297, margin = 8, right = W - margin
  let y = 9
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text('Institución Educativa: IEP “Nikola Tesla”', margin, y)
  doc.text('NOTIFICACIÓN A PADRES DE FAMILIA', W / 2, y, { align: 'center' })
  const dp = dateParts(record.date)
  doc.text(`Fecha: ${dp.d} / ${dp.m} / ${dp.y}`, right, y, { align: 'right' })
  y += 5
  doc.setFontSize(10.5); doc.text('INCUMPLIMIENTO DE LAS NORMAS DE PRESENTACIÓN PERSONAL', margin, y)
  y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
  doc.text(`Estudiante: ${student.firstName} ${student.lastName}`, margin, y)
  doc.text(`Grado y sección: ${classroom.grade} ${classroom.section} - ${classroom.level}`, 185, y)
  y += 5
  doc.text(`Tutor(a): ${classroom.tutorName}`, margin, y)
  doc.text(`Padre/madre/apoderado: ${student.guardianName}   DNI: ${student.guardianDni}`, 150, y)
  y += 6; doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('PRESENTACIÓN PERSONAL', margin, y)
  y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  const intro='Por medio de la presente, se comunica al padre de familia o apoderado que el estudiante ha incurrido en un incumplimiento de las disposiciones institucionales relacionadas con su presentación personal, específicamente:'
  doc.text(doc.splitTextToSize(intro, right-margin), margin, y); y += 9
  const tableX=margin, tableW=208, rowH=7
  rules.forEach(([key,label],i)=>{
    doc.rect(tableX,y,11,rowH); doc.rect(tableX+11,y,tableW-11,rowH)
    doc.setFont('helvetica','bold'); doc.text(selected(record,key) ? 'X' : '', tableX+5.5, y+4.8,{align:'center'})
    doc.text(`${i+1}.`,tableX+20,y+4.8); doc.text(label,tableX+30,y+4.8)
    y+=rowH
  })
  y += 5; doc.setFont('helvetica','bold'); doc.text('Descripción de la observación:', margin, y)
  doc.setFont('helvetica','normal'); const desc=doc.splitTextToSize(description(record), 225); doc.text(desc, 62, y); y += Math.max(8, desc.length*4)
  doc.line(margin,y,right,y); y+=6
  doc.setFontSize(8.7)
  const reminder='Recordamos que la adecuada presentación personal forma parte de las normas institucionales y contribuye al orden, la disciplina y la formación integral de nuestros estudiantes. Por ello, solicitamos a la familia brindar el acompañamiento necesario para garantizar el cumplimiento de estas disposiciones.'
  doc.text(doc.splitTextToSize(reminder,right-margin),margin,y); y+=10
  doc.setFont('helvetica','bold'); doc.setFontSize(10.5); doc.text('COMPROMISO Y SEGUIMIENTO',margin,y); y+=5
  doc.setFont('helvetica','normal'); doc.setFontSize(8.7)
  const commitment='La presente notificación deberá ser firmada por el padre, madre o apoderado y devuelta por el estudiante AL DÍA SIGUIENTE DE SU ENTREGA, como constancia de haber tomado conocimiento de la situación comunicada.'
  doc.text(doc.splitTextToSize(commitment,right-margin),margin,y); y+=8
  doc.setFont('helvetica','bold'); doc.text('Primera notificación:',margin,y); doc.setFont('helvetica','normal'); doc.text(' Se comunica a la familia el incumplimiento observado.',41,y); y+=5
  doc.setFont('helvetica','bold'); doc.text('Segunda notificación:',margin,y); doc.setFont('helvetica','normal'); doc.text(' Se deja constancia de la reiteración y se solicita mayor atención y acompañamiento.',43,y); y+=5
  doc.setFont('helvetica','bold'); doc.text('Tercera notificación:',margin,y); doc.setFont('helvetica','normal'); doc.text(' Ante la reiteración, se realizará un llamado formal al padre, madre o apoderado para reunión en Dirección.',42,y); y+=7
  doc.setFont('helvetica','bold'); doc.setFontSize(10.5); doc.text('CONSTANCIA DE RECEPCIÓN',margin,y); y+=5
  doc.setFont('helvetica','normal'); doc.setFontSize(8.7)
  doc.text(`Yo, ${student.guardianName}, padre, madre o apoderado(a) del estudiante, declaro haber tomado conocimiento de la presente notificación.`,margin,y); y+=6
  doc.text(`Firma del padre/madre/apoderado: ____________________________    DNI: ${student.guardianDni}    Fecha: ____ / ____ / ______`,margin,y); y+=6
  doc.text(`Firma del docente/tutor: ________________________________    Importante: devolver firmada al día siguiente de su entrega.`,margin,y)
  doc.save(filename(student,'pdf'))
}

function cell(text: string, bold=false, width?: number) {
  return new TableCell({ width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined, children:[new Paragraph({children:[new TextRun({text,bold,size:20})]})] })
}

export async function downloadNotificationWord(student: Student, classroom: Classroom, record: PresentationRecord) {
  const dp=dateParts(record.date)
  const rows = rules.map(([key,label],i)=>new TableRow({children:[cell(selected(record,key)?'X':'',true,6),cell(`${i+1}. ${label}`,true,94)]}))
  const doc = new Document({
    sections:[{
      properties:{ page:{ size:{ orientation: PageOrientation.LANDSCAPE }, margin:{top:360,right:360,bottom:360,left:360} } },
      children:[
        new Table({ width:{size:100,type:WidthType.PERCENTAGE}, borders:{top:{style:BorderStyle.NONE,size:0},bottom:{style:BorderStyle.NONE,size:0},left:{style:BorderStyle.NONE,size:0},right:{style:BorderStyle.NONE,size:0},insideHorizontal:{style:BorderStyle.NONE,size:0},insideVertical:{style:BorderStyle.NONE,size:0}}, rows:[new TableRow({children:[cell('Institución Educativa: IEP “Nikola Tesla”',true,35),cell('NOTIFICACIÓN A PADRES DE FAMILIA',true,40),cell(`Fecha: ${dp.d} / ${dp.m} / ${dp.y}`,true,25)]})] }),
        new Paragraph({children:[new TextRun({text:'INCUMPLIMIENTO DE LAS NORMAS DE PRESENTACIÓN PERSONAL',bold:true,size:24})]}),
        new Paragraph({children:[new TextRun({text:`Estudiante: ${student.firstName} ${student.lastName}          `,bold:true}),new TextRun({text:`Grado y sección: ${classroom.grade} ${classroom.section} - ${classroom.level}`,bold:true})]}),
        new Paragraph({children:[new TextRun({text:`Tutor(a): ${classroom.tutorName}          `,bold:true}),new TextRun({text:`Padre/madre/apoderado: ${student.guardianName} - DNI: ${student.guardianDni}`,bold:true})]}),
        new Paragraph({children:[new TextRun({text:'PRESENTACIÓN PERSONAL',bold:true,size:24})]}),
        new Paragraph('Por medio de la presente, se comunica al padre de familia o apoderado que el estudiante ha incurrido en un incumplimiento de las disposiciones institucionales relacionadas con su presentación personal, específicamente:'),
        new Table({width:{size:72,type:WidthType.PERCENTAGE},rows}),
        new Paragraph({children:[new TextRun({text:'Descripción de la observación: ',bold:true}),new TextRun(description(record))]}),
        new Paragraph(''),
        new Paragraph('Recordamos que la adecuada presentación personal forma parte de las normas institucionales y contribuye al orden, la disciplina y la formación integral de nuestros estudiantes. Por ello, solicitamos a la familia brindar el acompañamiento necesario para garantizar el cumplimiento de estas disposiciones.'),
        new Paragraph({children:[new TextRun({text:'COMPROMISO Y SEGUIMIENTO',bold:true,size:24})]}),
        new Paragraph({children:[new TextRun('La presente notificación deberá ser '),new TextRun({text:'firmada por el padre, madre o apoderado y devuelta por el estudiante AL DÍA SIGUIENTE DE SU ENTREGA',bold:true}),new TextRun(', como constancia de haber tomado conocimiento de la situación comunicada.')]}),
        new Paragraph({children:[new TextRun({text:'Primera notificación: ',bold:true}),new TextRun('Se comunica a la familia el incumplimiento observado.')]}),
        new Paragraph({children:[new TextRun({text:'Segunda notificación: ',bold:true}),new TextRun('Se deja constancia de la reiteración del incumplimiento y se solicita mayor atención y acompañamiento por parte de la familia.')]}),
        new Paragraph({children:[new TextRun({text:'Tercera notificación: ',bold:true}),new TextRun('Ante la reiteración de la situación, se realizará un llamado formal al padre, madre o apoderado para una reunión en la Dirección de la institución.')]}),
        new Paragraph({children:[new TextRun({text:'CONSTANCIA DE RECEPCIÓN',bold:true,size:24})]}),
        new Paragraph(`Yo, ${student.guardianName}, padre, madre o apoderado(a) del estudiante, declaro haber tomado conocimiento de la presente notificación y me comprometo a brindar el acompañamiento necesario para el cumplimiento de las disposiciones institucionales.`),
        new Paragraph({children:[new TextRun({text:`Firma del padre/madre/apoderado: ____________________________    DNI: ${student.guardianDni}    Fecha: ____ / ____ / ______`,bold:true})]}),
        new Paragraph({children:[new TextRun({text:'Firma del docente/tutor: ________________________________    Importante: devolver firmada al día siguiente de su entrega.',bold:true})]}),
      ]
    }]
  })
  const blob=await Packer.toBlob(doc)
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename(student,'docx'); a.click(); URL.revokeObjectURL(url)
}
