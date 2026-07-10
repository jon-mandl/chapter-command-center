// Shared Excel (.xlsx) helpers for the admin import features: building
// downloadable templates and reading uploaded workbooks. ExcelJS is loaded
// on demand (dynamic import) so it stays out of the main bundle — never
// import it statically.

import { cellToString } from './hoursImport'

// ─── Template building ────────────────────────────────────────────────────────

export interface SheetColumn {
  header: string
  width: number
  // Optional in-cell dropdown (Excel data validation) applied to this column
  // for rows 2..VALIDATION_ROWS.
  listOptions?: string[]
}

export interface SheetSpec {
  name: string
  columns: SheetColumn[]
  // Example rows shown under the header so users see the expected format.
  exampleRows: string[][]
}

// How far down each column's dropdown validation reaches in the template.
const VALIDATION_ROWS = 500

export async function buildXlsxBlob(sheets: SheetSpec[]): Promise<Blob> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()

  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name)
    sheet.columns = spec.columns.map((c) => ({ header: c.header, width: c.width }))
    sheet.getRow(1).font = { bold: true }
    for (const row of spec.exampleRows) sheet.addRow(row)

    spec.columns.forEach((col, colIndex) => {
      if (!col.listOptions || col.listOptions.length === 0) return
      // Excel list validation takes a quoted, comma-separated literal.
      const formula = '"' + col.listOptions.join(',') + '"'
      for (let rowNumber = 2; rowNumber <= VALIDATION_ROWS; rowNumber++) {
        sheet.getCell(rowNumber, colIndex + 1).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [formula]
        }
      }
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

// Save a generated file from the browser (same idiom as the report
// document downloads in ExportReportModal).
export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

// ─── Workbook reading ─────────────────────────────────────────────────────────

// Reads every worksheet into a grid of display strings, keyed by the sheet's
// name. Cell values are normalized via cellToString (dates → YYYY-MM-DD).
export async function readWorkbookGrids(buffer: ArrayBuffer): Promise<Map<string, string[][]>> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const grids = new Map<string, string[][]>()
  for (const sheet of workbook.worksheets) {
    const grid: string[][] = []
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = []
      // ExcelJS cell indexes are 1-based
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells[colNumber - 1] = cellToString(cell.value)
      })
      grid.push(Array.from(cells, (c) => c ?? ''))
    })
    grids.set(sheet.name, grid)
  }
  return grids
}
