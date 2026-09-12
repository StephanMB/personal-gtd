import { useRef, useState } from 'preact/hooks';
import { exportData, importFile } from '../commands.ts';
import { copy } from '../copy.ts';
import { readLastExport } from '../last-export.ts';

export function BackupPanel() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [lastExport, setLastExport] = useState(readLastExport);
  const days = lastExport === null ? null : Math.floor((Date.now() - lastExport) / 86_400_000);

  return (
    <div class="backup">
      <nldd-button-group size="sm">
        <nldd-button
          size="sm"
          start-icon="export"
          text={copy.backup.export}
          onClick={() => {
            exportData();
            setLastExport(Date.now());
          }}
        />
        <nldd-button size="sm" start-icon="import" text={copy.backup.import} onClick={() => fileInput.current?.click()} />
      </nldd-button-group>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        data-testid="import-file"
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          input.value = ''; // allow importing the same file again
          if (file) void importFile(file);
        }}
      />
      <p class="backup-info">{days === null ? copy.backup.never : copy.backup.last(days)}</p>
    </div>
  );
}
