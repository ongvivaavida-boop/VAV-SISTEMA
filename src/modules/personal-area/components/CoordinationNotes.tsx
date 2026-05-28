'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CoordinationNote } from '../types/v2';
import { getUserNotes } from '../actions/notes';
import { BorealSkeleton } from '@/components/ui/BorealSkeleton';
import { createClient } from '@/lib/supabase';

export function CoordinationNotes() {
    const [notes, setNotes] = useState<CoordinationNote[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const supabase = createClient();

        const fetchNotes = async () => {
            const res = await getUserNotes();
            if (res.success && res.data) {
                setNotes(res.data);
            }
            setIsLoading(false);
        };
        fetchNotes();

        // Atualização em tempo real: recarrega ao detectar mudança nas notas
        const channel = supabase
            .channel('coordination-notes-realtime')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'coordination_notes',
            }, () => {
                fetchNotes();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    return (
        <div className="flex-1 min-h-0 h-full w-full flex flex-col overflow-hidden gap-6 bg-white/70 dark:bg-zinc-900/60 backdrop-blur-xl rounded-3xl border border-white/20 dark:border-white/10 shadow-lg shadow-black/5 p-6 md:p-8">
            <div className="shrink-0 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-secondary/10 dark:bg-primary/10 flex items-center justify-center text-secondary dark:text-primary shrink-0">
                    <span className="material-symbols-outlined text-2xl">campaign</span>
                </div>
                <div>
                    <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">Mural da Coordenação</h3>
                    <p className="text-sm font-medium text-zinc-500 line-clamp-1">
                        Avisos, diretrizes e observações deixadas por seus líderes.
                    </p>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar w-full pr-2 space-y-4 custom-scrollbar">
                {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <BorealSkeleton key={i} className="w-full h-32 rounded-2xl" />
                    ))
                ) : notes.length === 0 ? (
                    <div className="w-full py-16 flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 dark:border-white/5 rounded-2xl bg-zinc-50/50 dark:bg-black/10">
                        <span className="material-symbols-outlined text-5xl text-zinc-300 dark:text-zinc-700 mb-3">inbox</span>
                        <p className="text-zinc-500 font-medium">Você não tem observações ativas.</p>
                        <p className="text-xs text-zinc-400 mt-1">Seu mural está limpo.</p>
                    </div>
                ) : (
                    notes.map((note, index) => (
                        <motion.div
                            key={note.id}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1, type: 'spring', damping: 25 }}
                            className="w-full bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/10 p-5 rounded-2xl flex flex-col gap-3 group hover:border-zinc-300 dark:hover:border-white/20 transition-all"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 shrink-0">
                                        {note.author?.avatar_url ? (
                                            <img src={note.author.avatar_url} alt="Autor" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-zinc-500">
                                                <span className="material-symbols-outlined text-sm">person</span>
                                            </div>
                                        )}
                                    </div>
                                    <span className="font-bold text-sm text-zinc-800 dark:text-zinc-200">
                                        {note.author?.full_name || 'Coordenador Sem Nome'}
                                    </span>
                                </div>

                                <span className="text-xs font-semibold text-zinc-500 bg-black/5 dark:bg-white/5 px-2 py-1 rounded-md">
                                    {new Date(note.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                </span>
                            </div>

                            <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed pl-11">
                                {note.content}
                            </p>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    );
}

