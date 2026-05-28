'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface SearchResult {
    id: string;
    title: string;
    subtitle?: string;
    type: 'demand' | 'meeting' | 'event' | 'student' | 'mural';
    href: string;
    icon: string;
    color: string;
}

const TYPE_CONFIG = {
    demand:  { label: 'Demanda',    icon: 'task_alt',    color: 'text-pink-400' },
    meeting: { label: 'Reunião',    icon: 'videocam',    color: 'text-teal-400' },
    event:   { label: 'Calendário', icon: 'event_note',  color: 'text-indigo-400' },
    student: { label: 'Aluno',      icon: 'person',      color: 'text-cyan-400' },
    mural:   { label: 'Mural',      icon: 'campaign',    color: 'text-yellow-400' },
};

export default function GlobalSearch() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIdx, setSelectedIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const supabase = createClient();
    const router = useRouter();

    // Ctrl+K / Cmd+K to open
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setOpen((v: boolean) => !v);
            }
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 50);
            setQuery('');
            setResults([]);
            setSelectedIdx(0);
        }
    }, [open]);

    const search = useCallback(async (q: string) => {
        if (q.trim().length < 2) { setResults([]); return; }
        setLoading(true);
        const term = `%${q.trim()}%`;
        const collected: SearchResult[] = [];

        const [
            { data: demands },
            { data: meetings },
            { data: events },
            { data: students },
            { data: mural },
        ] = await Promise.all([
            supabase.from('demands').select('id, title, status').ilike('title', term).limit(5),
            supabase.from('meetings').select('id, title, scheduled_at').ilike('title', term).limit(4),
            supabase.from('global_calendar_events').select('id, title, start_time').ilike('title', term).limit(4),
            supabase.from('students').select('id, full_name').ilike('full_name', term).limit(4),
            supabase.from('mural_posts').select('id, title, category').ilike('title', term).limit(4),
        ]);

        (demands ?? []).forEach((d: any) => collected.push({
            id: d.id, title: d.title,
            subtitle: `Status: ${d.status?.replace('_', ' ')}`,
            type: 'demand', href: '/comunicacao/kanban',
            icon: TYPE_CONFIG.demand.icon, color: TYPE_CONFIG.demand.color,
        }));
        (meetings ?? []).forEach((m: any) => collected.push({
            id: m.id, title: m.title,
            subtitle: m.scheduled_at ? new Date(m.scheduled_at).toLocaleDateString('pt-BR') : undefined,
            type: 'meeting', href: '/dashboard/reunioes',
            icon: TYPE_CONFIG.meeting.icon, color: TYPE_CONFIG.meeting.color,
        }));
        (events ?? []).forEach((e: any) => collected.push({
            id: e.id, title: e.title,
            subtitle: e.start_time ? new Date(e.start_time).toLocaleDateString('pt-BR') : undefined,
            type: 'event', href: '/dashboard/calendario',
            icon: TYPE_CONFIG.event.icon, color: TYPE_CONFIG.event.color,
        }));
        (students ?? []).forEach((s: any) => collected.push({
            id: s.id, title: s.full_name,
            subtitle: 'Aluno',
            type: 'student', href: '/dashboard/pedagogia',
            icon: TYPE_CONFIG.student.icon, color: TYPE_CONFIG.student.color,
        }));
        (mural ?? []).forEach((p: any) => collected.push({
            id: p.id, title: p.title,
            subtitle: p.category,
            type: 'mural', href: '/dashboard/mural',
            icon: TYPE_CONFIG.mural.icon, color: TYPE_CONFIG.mural.color,
        }));

        setResults(collected);
        setSelectedIdx(0);
        setLoading(false);
    }, [supabase]);

    useEffect(() => {
        const t = setTimeout(() => search(query), 250);
        return () => clearTimeout(t);
    }, [query, search]);

    const navigate = (href: string) => {
        router.push(href);
        setOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i: number) => Math.min(i + 1, results.length - 1)); }
        if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIdx((i: number) => Math.max(i - 1, 0)); }
        if (e.key === 'Enter' && results[selectedIdx]) navigate(results[selectedIdx].href);
    };

    const modal = (
        <AnimatePresence>
            {open && (
                <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] px-4 bg-black/50 backdrop-blur-sm"
                        onClick={() => setOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: -10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: -10 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            className="w-full max-w-xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-white/10 overflow-hidden"
                        >
                            {/* Search input */}
                            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-100 dark:border-white/8">
                                <span className="material-symbols-outlined text-zinc-400 text-xl shrink-0">search</span>
                                <input
                                    ref={inputRef}
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Buscar demandas, reuniões, eventos, alunos..."
                                    className="flex-1 bg-transparent outline-none text-zinc-900 dark:text-white placeholder:text-zinc-400 text-sm"
                                />
                                {loading && (
                                    <div className="w-4 h-4 border-2 border-zinc-300 border-t-primary rounded-full animate-spin shrink-0" />
                                )}
                                <kbd className="hidden sm:block text-[10px] font-bold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 px-1.5 py-0.5 rounded-md shrink-0">ESC</kbd>
                            </div>

                            {/* Results */}
                            {results.length > 0 ? (
                                <div className="py-1.5 max-h-[360px] overflow-y-auto">
                                    {results.map((r, i) => {
                                        const cfg = TYPE_CONFIG[r.type];
                                        return (
                                            <button
                                                key={r.id}
                                                onClick={() => navigate(r.href)}
                                                onMouseEnter={() => setSelectedIdx(i)}
                                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === selectedIdx ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                                            >
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-zinc-100 dark:bg-zinc-800`}>
                                                    <span className={`material-symbols-outlined text-base ${cfg.color}`}>{r.icon}</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{r.title}</p>
                                                    {r.subtitle && (
                                                        <p className="text-xs text-zinc-400 truncate">{r.subtitle}</p>
                                                    )}
                                                </div>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 shrink-0`}>
                                                    {cfg.label}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : query.length >= 2 && !loading ? (
                                <div className="py-10 text-center">
                                    <span className="material-symbols-outlined text-3xl text-zinc-300 dark:text-zinc-600 mb-2">search_off</span>
                                    <p className="text-sm text-zinc-400">Nenhum resultado para "{query}"</p>
                                </div>
                            ) : query.length === 0 ? (
                                <div className="px-4 py-4">
                                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Busca rápida</p>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                                            <span key={key} className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-white/8">
                                                <span className={`material-symbols-outlined text-sm ${cfg.color}`}>{cfg.icon}</span>
                                                {cfg.label}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="text-xs text-zinc-400 mt-3">Use ↑↓ para navegar, Enter para abrir</p>
                                </div>
                            ) : null}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
    );

    return (
        <>
            {/* Trigger button */}
            <button
                onClick={() => setOpen(true)}
                title="Busca global (Ctrl+K)"
                className="flex items-center gap-3 rounded-xl transition-all duration-200 w-full justify-center py-2.5 text-zinc-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-primary hover:bg-zinc-100 dark:hover:bg-white/5"
            >
                <span className="material-symbols-outlined text-xl">search</span>
            </button>

            {/* Modal via portal — escapa do stacking context do sidebar */}
            {typeof document !== 'undefined' && createPortal(modal, document.body)}
        </>
    );
}
