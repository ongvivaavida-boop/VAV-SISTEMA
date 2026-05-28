import { Suspense } from 'react';
import { syncGoogleDriveStructure } from '@/modules/comunicacao/actions';
import DriveExplorer from '@/modules/comunicacao/components/DriveExplorer';
import { Loader2 } from 'lucide-react';
import DriveResyncWrapper from './DriveResyncWrapper';

export default async function DrivePage() {
    const initialSync = await syncGoogleDriveStructure();

    // If sync failed, render the resync wrapper with retry button
    if (!initialSync?.success || !initialSync.data) {
        return (
            <DriveResyncWrapper errorMessage={initialSync?.error || 'Token expirado ou conexão perdida.'} />
        );
    }

    // Começa na raiz do Drive ("Meu Drive") para exibir todas as pastas.
    // O sync acima garante que a estrutura VAV SISTEMA > COMUNICAÇÃO já existe.
    return (
        <div className="w-full h-full min-h-[600px] flex flex-col bg-white dark:bg-black rounded-xl shadow-sm border border-slate-200 dark:border-white/10 overflow-hidden">
            <Suspense fallback={
                <div className="w-full h-full min-h-[400px] flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            }>
                <DriveExplorer initialFolderId="root" initialFolderName="Meu Drive" />
            </Suspense>
        </div>
    );
}
