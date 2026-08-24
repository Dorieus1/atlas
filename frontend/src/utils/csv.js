const escapeCsvValue = (value) => {

  const str = value === null || value === undefined ? "" : String(value);

  if (/[",\n]/.test(str)) {

    return `"${str.replace(/"/g, '""')}"`;

  }

  return str;

};


export const downloadCSV = (filename, columns, rows) => {

  const header = columns.map((col) => escapeCsvValue(col.label)).join(",");

  const lines = rows.map((row) =>
    columns.map((col) => escapeCsvValue(row[col.key])).join(",")
  );

  const csv = [header, ...lines].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);

};
