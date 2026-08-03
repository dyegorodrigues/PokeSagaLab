import React, { useState } from "react";
import { Creature } from "../types";
import { exportCreatureToZip, downloadBlob } from "../utils/exporter";
import { importCreatureFromZip } from "../utils/importer";
import { Download, Upload, CheckCircle2, AlertCircle, FileArchive, RefreshCw } from "lucide-react";

interface ImportExportModalProps {
  activeCreature: Creature;
  onImported: (creature: Creature) => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({ activeCreature, onImported }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const blob = await exportCreatureToZip(activeCreature);
      const filename = `${activeCreature.numericId || "sprite"}_${activeCreature.displayName
        .toLowerCase()
        .replace(/\s+/g, "_")}_pack.zip`;

      downloadBlob(blob, filename);
      setStatusMessage(`Pacote ZIP exportado com sucesso: '${filename}'`);
    } catch (err: any) {
      setErrorMessage("Falha ao exportar pacote ZIP: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const creature = await importCreatureFromZip(file);
      setStatusMessage(`Pacote '${file.name}' importado com sucesso! Salvo no IndexedDB local.`);
      onImported(creature);
    } catch (err: any) {
      setErrorMessage("Falha na importação do arquivo ZIP: " + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2 shadow-xl">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <FileArchive className="w-5 h-5 text-blue-400" />
          Gerenciador de Pacotes ZIP & Round-Trip
        </h2>
        <p className="text-xs text-slate-400">
          Exporte ou reimporte coleções completas compatíveis com o formato SpriteCollab (`AnimData.xml` e PNGs).
        </p>
      </div>

      {statusMessage && (
        <div className="bg-emerald-900/40 border border-emerald-500/50 text-emerald-200 px-4 py-3 rounded-xl text-xs flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-900/40 border border-rose-500/50 text-rose-200 px-4 py-3 rounded-xl text-xs flex items-center gap-2 font-medium">
          <AlertCircle className="w-4 h-4 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export Card */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4 shadow-lg flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Download className="w-4 h-4 text-blue-400" />
              1. Exportar Personagem Ativo
            </h3>
            <p className="text-xs text-slate-400">
              Gera um arquivo ZIP com o `AnimData.xml`, PNGs de cada animação, offsets, sombra e manifesto de atribuição.
            </p>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 text-xs space-y-1">
              <div>Personagem: <strong className="text-slate-200">{activeCreature.displayName}</strong></div>
              <div>ID Numérico: <strong className="text-slate-200">{activeCreature.numericId}</strong></div>
              <div>Animações: <strong className="text-slate-200">{activeCreature.animations.length}</strong></div>
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
          >
            {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{isExporting ? "Gerando ZIP..." : "Exportar Pacote ZIP"}</span>
          </button>
        </div>

        {/* Import Card */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4 shadow-lg flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Upload className="w-4 h-4 text-emerald-400" />
              2. Reimportar Pacote ZIP
            </h3>
            <p className="text-xs text-slate-400">
              Selecione um pacote ZIP exportado anteriormente ou do SpriteCollab para testar a reimportação sem perda de dados.
            </p>

            <label className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 bg-slate-950/60 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition text-center group">
              <Upload className="w-8 h-8 text-slate-500 group-hover:text-indigo-400 transition" />
              <span className="text-xs font-semibold text-slate-300">Clique para selecionar ou arraste o arquivo .zip</span>
              <span className="text-[10px] text-slate-500">Suporta AnimData.xml + PNGs</span>
              <input type="file" accept=".zip" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          {isImporting && (
            <div className="text-xs text-indigo-400 text-center font-mono flex items-center justify-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Descompactando e validando XML...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
