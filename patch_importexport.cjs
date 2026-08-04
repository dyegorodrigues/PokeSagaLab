const fs = require('fs');
let code = fs.readFileSync('src/components/ImportExportModal.tsx', 'utf8');

const importAdd = `import { exportCreatureToZip, downloadBlob, exportFirmwareOverworld } from "../utils/exporter";`;
code = code.replace(`import { exportCreatureToZip, downloadBlob } from "../utils/exporter";`, importAdd);

const stateAdd = `
  const [isExportingFw, setIsExportingFw] = useState(false);

  const handleExportFirmware = async () => {
    setIsExportingFw(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const blob = await exportFirmwareOverworld(activeCreature);
      if (!blob) throw new Error("Erro ao gerar o canvas.");
      const filename = \`\${activeCreature.numericId || "sprite"}_overworld_fw.png\`;
      downloadBlob(blob, filename);
      setStatusMessage(\`Firmware (Hibitomo) exportado com sucesso: '\${filename}'\`);
    } catch (err: any) {
      setErrorMessage("Falha ao exportar Firmware: " + err.message);
    } finally {
      setIsExportingFw(false);
    }
  };
`;

code = code.replace(`const handleExport = async () => {`, stateAdd + `\n  const handleExport = async () => {`);

const uiAdd = `
        {/* Export Firmware Card */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4 shadow-lg flex flex-col justify-between col-span-1 md:col-span-2">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Download className="w-4 h-4 text-emerald-400" />
              3. Exportar para Firmware (Hibitomo/Overworld)
            </h3>
            <p className="text-xs text-slate-400">
              Gera um único arquivo PNG combinando animações Walk, Idle e Sleep (se existirem), no formato de grid específico exigido pelo firmware de desenvolvimento. Ideal para uso no \`lv_port_pc_vscode\`. (Baseado na arquitetura do PMDSpriteManager)
            </p>
          </div>
          <button
            onClick={handleExportFirmware}
            disabled={isExportingFw}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
          >
            {isExportingFw ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{isExportingFw ? "Gerando Overworld PNG..." : "Exportar Firmware PNG"}</span>
          </button>
        </div>
      </div>
`;

code = code.replace(`      </div>\n    </div>\n  );\n};`, uiAdd + `\n    </div>\n  );\n};`);
fs.writeFileSync('src/components/ImportExportModal.tsx', code);
