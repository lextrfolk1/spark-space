export const exportToCSV = (rows: Array<Record<string, unknown>>, title: string): void => {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const val = row[header] !== null && row[header] !== undefined ? String(row[header]) : "";
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${title.toLowerCase().replace(/\s+/g, "_")}_results.csv`);
  link.click();
  URL.revokeObjectURL(url);
};

export const exportToExcel = (rows: Array<Record<string, unknown>>, title: string): void => {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const excelContent = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Sheet1</x:Name>
              <x:WorksheetOptions>
                <x:DisplayGridlines/>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <meta charset="utf-8">
    </head>
    <body>
      <table border="1">
        <thead>
          <tr style="background-color: #f3f4f6; font-weight: bold;">
            ${headers.map((h) => `<th>${h}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
            <tr>
              ${headers
                .map((h) => `<td>${row[h] !== null && row[h] !== undefined ? String(row[h]) : ""}</td>`)
                .join("")}
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob([excelContent], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${title.toLowerCase().replace(/\s+/g, "_")}_results.xls`);
  link.click();
  URL.revokeObjectURL(url);
};

export const exportToPDF = (rows: Array<Record<string, unknown>>, title: string): void => {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) return;

  doc.write(`
    <html>
      <head>
        <title>${title} - Query Results</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 20px;
            color: #1a1a1a;
          }
          h1 {
            font-size: 16px;
            margin-bottom: 4px;
          }
          p {
            font-size: 10px;
            color: #666;
            margin-bottom: 15px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9px;
          }
          th {
            background-color: #f3f4f6;
            text-align: left;
            padding: 5px 6px;
            border: 1px solid #e5e7eb;
            font-weight: bold;
          }
          td {
            padding: 5px 6px;
            border: 1px solid #e5e7eb;
            word-break: break-all;
          }
          tr:nth-child(even) {
            background-color: #f9fafb;
          }
        </style>
      </head>
      <body>
        <h1>${title} - Query Results</h1>
        <p>Exported on ${new Date().toLocaleString()}</p>
        <table>
          <thead>
            <tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
              <tr>
                ${headers
                  .map((h) => `<td>${row[h] !== null && row[h] !== undefined ? String(row[h]) : ""}</td>`)
                  .join("")}
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    document.body.removeChild(iframe);
  }, 500);
};
