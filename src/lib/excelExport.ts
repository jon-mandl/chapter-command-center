// Shared Excel (.xlsx) DATA export builder — the counterpart to the import
// templates in lib/xlsx.ts. Pages describe their sheets (columns + rows) and
// this turns them into a downloadable workbook. ExcelJS is loaded on demand
// (dynamic import) so it stays out of the main bundle — never import it
// statically.
//
// Cell values are written as plain data (strings/numbers), never as formulas.

export interface ExportColumn {
  header: string
  width: number
  // Excel number format for the column's data cells, e.g. '#,##0.00' for
  // hours or '"$"#,##0.00' for currency. Omit for plain text.
  numFmt?: string
}

export type ExportCell = string | number | null

export interface ExportSheet {
  name: string
  columns: ExportColumn[]
  rows: ExportCell[][]
  // Optional bold totals row appended after the data.
  totalsRow?: ExportCell[]
}

export const EXCEL_NUM_FMT = '#,##0.00'
export const EXCEL_CURRENCY_FMT = '"$"#,##0.00'

export async function buildExportBlob(sheets: ExportSheet[]): Promise<Blob> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()

  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name)
    sheet.columns = spec.columns.map((c) => ({ header: c.header, width: c.width }))
    sheet.getRow(1).font = { bold: true }

    for (const row of spec.rows) {
      sheet.addRow(row.map((cell) => cell ?? ''))
    }
    if (spec.totalsRow) {
      const totals = sheet.addRow(spec.totalsRow.map((cell) => cell ?? ''))
      totals.font = { bold: true }
    }

    spec.columns.forEach((col, colIndex) => {
      if (!col.numFmt) return
      // Apply the format to data cells only (row 1 is the header).
      const lastRow = sheet.rowCount
      for (let rowNumber = 2; rowNumber <= lastRow; rowNumber++) {
        sheet.getCell(rowNumber, colIndex + 1).numFmt = col.numFmt
      }
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}
