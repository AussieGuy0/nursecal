import { diagnosticReport, recordDiagnostic } from '../utils/diagnostics';

export function DiagnosticsButton() {
  const download = () => {
    recordDiagnostic('diagnostics.export');
    const url = URL.createObjectURL(new Blob([diagnosticReport()], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `nursecal-diagnostics-${Date.now()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  return (
    <button type="button" onClick={download} className="text-sm text-gray-500 underline">
      Download diagnostics
    </button>
  );
}
