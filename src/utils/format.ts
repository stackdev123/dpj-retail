/**
 * Helper to format numbers into Indonesian Rupiah (Rp. X.XXX.XXX)
 */
export function formatRupiah(value: number): string {
  const absoluteValue = Math.abs(value);
  const formatted = new Intl.NumberFormat('id-ID', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(absoluteValue);
  
  const sign = value < 0 ? '-' : '';
  return `${sign}Rp. ${formatted}`;
}

/**
 * Helper to format date strings into readable Indonesian dates
 */
export function formatDate(dateString: string, includeTime = true): string {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    let result = `${day} ${month} ${year}`;
    
    if (includeTime) {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      result += ` ${hours}:${minutes}`;
    }
    
    return result;
  } catch (e) {
    return dateString;
  }
}

/**
 * Helper to generate Invoice Number (e.g. DPU-260626-0001)
 */
export function generateInvoiceNumber(existingCount: number = 0): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  
  const datePart = `${yy}${mm}${dd}`;
  const seqPart = String(existingCount + 1).padStart(4, '0');
  
  return `INV-${datePart}-${seqPart}`;
}

/**
 * Triggers a file download in the browser
 */
export function downloadFile(content: string, fileName: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Convert data to CSV string and download
 */
export function downloadCSV(headers: string[], rows: string[][], fileName: string) {
  const csvContent = "\ufeff" + [
    headers.join(','),
    ...rows.map(row => 
      row.map(cell => {
        // Escape quotes and wrap in quotes if contains commas or quotes
        const cleanCell = (cell ?? '').replace(/"/g, '""');
        return cleanCell.includes(',') || cleanCell.includes('"') || cleanCell.includes('\n') 
          ? `"${cleanCell}"` 
          : cleanCell;
      }).join(',')
    )
  ].join('\n');
  
  downloadFile(csvContent, fileName, 'text/csv;charset=utf-8;');
}
