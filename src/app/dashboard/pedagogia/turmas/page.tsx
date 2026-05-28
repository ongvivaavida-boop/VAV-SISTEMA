'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getMyClasses } from '@/actions/pedagogia';
import { createClient } from '@/lib/supabase';
import type { Class } from '@/types/pedagogia';

interface Student {
    id: string;
    full_name: string;
    birth_date: string | null;
    guardian_name: string | null;
    guardian_phone: string | null;
    photo_url: string | null;
    notes: string | null;
    active: boolean;
}

interface Membership {
    id: string;
    student_id: string;
    status: string;
    student: Student;
}

export default function TurmasPage() {
    const [classes, setClasses] = useState<Class[]>([]);
    const [selectedClass, setSelectedClass] = useState<Class | null>(null);
    const [members, setMembers] = useState<Membership[]>([]);
    const [loading, setLoading] = useState(true);
    const [membersLoading, setMembersLoading] = useState(false);

    // Modal nova turma
    const [showClassModal, setShowClassModal] = useState(false);
    const [className, setClassName] = useState('');
    const [classYear, setClassYear] = useState('1º Ano');
    const [classShift, setClassShift] = useState('Manhã');
    const [creatingClass, setCreatingClass] = useState(false);

    // Modal novo aluno
    const [showStudentModal, setShowStudentModal] = useState(false);
    const [studentName, setStudentName] = useState('');
    const [studentBirth, setStudentBirth] = useState('');
    const [studentGuardian, setStudentGuardian] = useState('');
    const [studentPhone, setStudentPhone] = useState('');
    const [creatingStudent, setCreatingStudent] = useState(false);

    const supabase = createClient();

    useEffect(() => {
        loadClasses();
    }, []);

    const loadClasses = async () => {
        setLoading(true);
        const res = await getMyClasses();
        if (res.success && res.data) setClasses(res.data);
        setLoading(false);
    };

    const selectClass = async (cls: Class) => {
        setSelectedClass(cls);
        setMembersLoading(true);
        const { data, error } = await supabase
            .from('class_memberships')
            .select('id, student_id, status, student:student_id(id, full_name, birth_date, guardian_name, guardian_phone, photo_url, notes, active)')
            .eq('class_id', cls.id)
            .eq('status', 'active');

        if (!error && data) {
            setMembers(data.map((m: any) => ({ ...m, student: m.student })) as Membership[]);
        }
        setMembersLoading(false);
    };

    const handleCreateClass = async () => {
        if (!className.trim()) return;
        setCreatingClass(true);
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('classes')
            .insert({ name: className, year_group: classYear, school_year: new Date().getFullYear(), shift: classShift, teacher_id: user?.id || null })
            .select()
            .single();

        if (!error && data) setClasses(prev => [...prev, data as Class]);
        setClassName(''); setClassYear('1º Ano'); setClassShift('Manhã');
        setCreatingClass(false);
        setShowClassModal(false);
    };

    const handleAddStudent = async () => {
        if (!studentName.trim() || !selectedClass) return;
        setCreatingStudent(true);

        // Criar aluno
        const { data: student, error: sErr } = await supabase
            .from('students')
            .insert({
                full_name: studentName,
                birth_date: studentBirth || null,
                guardian_name: studentGuardian || null,
                guardian_phone: studentPhone || null,
            })
            .select()
            .single();

        if (sErr || !student) { setCreatingStudent(false); return; }

        // Vincular Ã  turma
        const { data: membership, error: mErr } = await supabase
            .from('class_memberships')
            .insert({ class_id: selectedClass.id, student_id: student.id, status: 'active' })
            .select('id, student_id, status')
            .single();

        if (!mErr && membership) {
            setMembers(prev => [...prev, { ...membership, student: student as Student } as Membership]);
        }

        setStudentName(''); setStudentBirth(''); setStudentGuardian(''); setStudentPhone('');
        setCreatingStudent(false);
        setShowStudentModal(false);
    };

    const handleRemoveStudent = async (membershipId: string) => {
        await supabase.from('class_memberships').update({ status: 'inactive' }).eq('id', membershipId);
        setMembers(prev => prev.filter(m => m.id !== membershipId));
    };

    return (
        <div className="h-full flex min-h-0">
            {/* Sidebar: Lista de Turmas */}
            <div className="w-72 shrink-0 border-r border-white/20 dark:border-white/10 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md flex flex-col min-h-0">
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-white">Turmas</h3>
                    <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                        onClick={() => setShowClassModal(true)}
                        className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/25">
                        <span className="material-symbols-outlined text-lg">add</span>
                    </motion.button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : classes.length === 0 ? (
                        <p className="text-xs text-zinc-400 text-center py-8">Nenhuma turma cadastrada</p>
                    ) : (
                        classes.map(cls => (
                            <button key={cls.id} onClick={() => selectClass(cls)}
                                className={`w-full text-left p-3 rounded-xl text-sm transition-all ${selectedClass?.id === cls.id
                                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400'
                                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-transparent'
                                    }`}>
                                <p className="font-bold">{cls.name}</p>
                                <p className="text-[10px] text-zinc-400 mt-0.5">{cls.year_group} · {cls.shift}</p>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Main: Alunos da turma */}
            <div className="flex-1 flex flex-col min-h-0 p-6">
                {!selectedClass ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <span className="material-symbols-outlined text-5xl text-zinc-200 dark:text-zinc-700 mb-3">groups</span>
                        <h3 className="text-lg font-bold text-zinc-400">Selecione uma turma</h3>
                        <p className="text-xs text-zinc-400 mt-1">Escolha uma turma na lista Ã  esquerda para ver os alunos.</p>
                    </div>
                ) : (
                    <>
                        <div className="shrink-0 flex items-center justify-between mb-5">
                            <div>
                                <h2 className="text-2xl font-extrabold text-zinc-900 dark:text-white">{selectedClass.name}</h2>
                                <p className="text-xs text-zinc-500">{selectedClass.year_group} · {selectedClass.shift} · {members.length} aluno(s)</p>
                            </div>
                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                onClick={() => setShowStudentModal(true)}
                                className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/25 flex items-center gap-2">
                                <span className="material-symbols-outlined text-lg">person_add</span>
                                Adicionar Aluno
                            </motion.button>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                            {membersLoading ? (
                                <div className="flex justify-center py-16">
                                    <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : members.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20">
                                    <span className="material-symbols-outlined text-5xl text-zinc-200 dark:text-zinc-700 mb-3">person_off</span>
                                    <h3 className="text-lg font-bold text-zinc-400">Nenhum aluno nesta turma</h3>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {members.map(m => (
                                        <motion.div key={m.id}
                                            initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                                            className="bg-white/70 dark:bg-zinc-900/60 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-lg shadow-black/5 rounded-3xl p-4 flex items-center gap-4 group">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                                                {m.student.full_name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-bold text-sm text-zinc-900 dark:text-white truncate">{m.student.full_name}</p>
                                                {m.student.guardian_name && <p className="text-[10px] text-zinc-400 truncate">Resp: {m.student.guardian_name}</p>}
                                                {m.student.guardian_phone && <p className="text-[10px] text-zinc-400">{m.student.guardian_phone}</p>}
                                            </div>
                                            <button onClick={() => handleRemoveStudent(m.id)}
                                                className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500 transition-all shrink-0">
                                                <span className="material-symbols-outlined text-lg">person_remove</span>
                                            </button>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Modal Nova Turma */}
            <AnimatePresence>
                {showClassModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                        onClick={() => setShowClassModal(false)}>
                        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-md">
                            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
                                <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white">Nova Turma</h3>
                            </div>
                            <div className="p-6 flex flex-col gap-4">
                                <div>
                                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 block">Nome *</label>
                                    <input value={className} onChange={e => setClassName(e.target.value)} placeholder="Ex: 1º Ano A"
                                        className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-emerald-500 text-sm" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 block">Ano</label>
                                        <select value={classYear} onChange={e => setClassYear(e.target.value)}
                                            className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none text-sm">
                                            {['1º Ano', '2º Ano', '3º Ano', '4º Ano', '5º Ano'].map(y => <option key={y}>{y}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 block">Turno</label>
                                        <select value={classShift} onChange={e => setClassShift(e.target.value)}
                                            className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none text-sm">
                                            {['Manhã', 'Tarde', 'Integral'].map(s => <option key={s}>{s}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
                                <button onClick={() => setShowClassModal(false)} className="px-4 py-2 text-sm font-bold text-zinc-500">Cancelar</button>
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleCreateClass} disabled={creatingClass || !className.trim()}
                                    className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/25 disabled:opacity-50">
                                    {creatingClass ? 'Criando...' : 'Criar Turma'}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modal Novo Aluno */}
            <AnimatePresence>
                {showStudentModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                        onClick={() => setShowStudentModal(false)}>
                        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-md">
                            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
                                <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white">Adicionar Aluno</h3>
                                <p className="text-xs text-zinc-500 mt-1">Turma: {selectedClass?.name}</p>
                            </div>
                            <div className="p-6 flex flex-col gap-4">
                                <div>
                                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 block">Nome completo *</label>
                                    <input value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="Nome do aluno"
                                        className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-emerald-500 text-sm" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 block">Data de nascimento</label>
                                    <input type="date" value={studentBirth} onChange={e => setStudentBirth(e.target.value)}
                                        className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none text-sm" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 block">Nome do responsável</label>
                                    <input value={studentGuardian} onChange={e => setStudentGuardian(e.target.value)} placeholder="Nome"
                                        className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none text-sm" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 block">Telefone do responsável</label>
                                    <input value={studentPhone} onChange={e => setStudentPhone(e.target.value)} placeholder="(xx) xxxxx-xxxx"
                                        className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none text-sm" />
                                </div>
                            </div>
                            <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
                                <button onClick={() => setShowStudentModal(false)} className="px-4 py-2 text-sm font-bold text-zinc-500">Cancelar</button>
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleAddStudent} disabled={creatingStudent || !studentName.trim()}
                                    className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/25 disabled:opacity-50">
                                    {creatingStudent ? 'Adicionando...' : 'Adicionar'}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

